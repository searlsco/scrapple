import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths.js'
import { ManifestRow, ResourceType } from '../db.js'

interface GlobalOptions {
  human?: boolean
}

// Maximum chunk size for FTS indexing (in characters)
const MAX_CHUNK_SIZE = 10000

export async function indexResources(db: Database.Database, global: GlobalOptions): Promise<void> {
  const log = (msg: string) => {
    if (global.human) console.log(`  ${msg}`)
  }

  // Get all normalized resources that need indexing
  const toIndex = db
    .prepare(`
      SELECT * FROM manifest
      WHERE status = 'normalized'
      LIMIT 100
    `)
    .all() as ManifestRow[]

  log(`Indexing ${toIndex.length} resources...`)

  const updateManifest = db.prepare(`
    UPDATE manifest SET status = ? WHERE id = ?
  `)

  const insertContent = db.prepare(`
    INSERT OR REPLACE INTO content (id, chunk_index, title, body, type, platforms, url, local_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const deleteContent = db.prepare(`
    DELETE FROM content WHERE id = ?
  `)

  let indexed = 0
  let failed = 0

  for (const resource of toIndex) {
    try {
      const normalizedPath = getNormalizedPath(resource.type, resource.id)

      if (!existsSync(normalizedPath)) {
        updateManifest.run('failed', resource.id)
        failed++
        continue
      }

      const content = readFileSync(normalizedPath, 'utf-8')

      // Clear existing content for this resource
      deleteContent.run(resource.id)

      // Chunk and index
      const chunks = chunkContent(content)
      const title = resource.title || extractFirstLine(content) || 'Untitled'

      for (let i = 0; i < chunks.length; i++) {
        insertContent.run(
          resource.id,
          i,
          title,
          chunks[i],
          resource.type,
          resource.platforms,
          resource.url,
          normalizedPath
        )
      }

      updateManifest.run('indexed', resource.id)
      indexed++
    } catch (error) {
      updateManifest.run('failed', resource.id)
      failed++
    }
  }

  log(`Indexed: ${indexed}, Failed: ${failed}`)
}

function chunkContent(content: string): string[] {
  if (content.length <= MAX_CHUNK_SIZE) {
    return [content]
  }

  const chunks: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining)
      break
    }

    // Find a good break point (paragraph, sentence, or word)
    let breakPoint = findBreakPoint(remaining, MAX_CHUNK_SIZE)
    chunks.push(remaining.slice(0, breakPoint).trim())
    remaining = remaining.slice(breakPoint).trim()
  }

  return chunks
}

function findBreakPoint(text: string, maxLength: number): number {
  // Try to break at a paragraph
  const paragraphBreak = text.lastIndexOf('\n\n', maxLength)
  if (paragraphBreak > maxLength * 0.5) {
    return paragraphBreak + 2
  }

  // Try to break at a line
  const lineBreak = text.lastIndexOf('\n', maxLength)
  if (lineBreak > maxLength * 0.5) {
    return lineBreak + 1
  }

  // Try to break at a sentence
  const sentenceBreak = Math.max(
    text.lastIndexOf('. ', maxLength),
    text.lastIndexOf('! ', maxLength),
    text.lastIndexOf('? ', maxLength)
  )
  if (sentenceBreak > maxLength * 0.5) {
    return sentenceBreak + 2
  }

  // Try to break at a word
  const wordBreak = text.lastIndexOf(' ', maxLength)
  if (wordBreak > maxLength * 0.5) {
    return wordBreak + 1
  }

  // Hard break at maxLength
  return maxLength
}

function extractFirstLine(content: string): string | null {
  const firstLine = content.split('\n')[0]
  if (!firstLine) return null

  // Remove markdown heading markers
  return firstLine.replace(/^#+\s*/, '').trim() || null
}

function getNormalizedPath(type: ResourceType, id: string): string {
  switch (type) {
    case 'doc':
      return join(paths.data.normalized.docs, `${id}.md`)
    case 'talk':
      return join(paths.data.normalized.transcripts, `${id}.txt`)
    case 'sample':
      return join(paths.data.normalized.samples, `${id}.md`)
    case 'code_file':
      return join(paths.data.normalized.samples, id)
    default:
      return join(paths.data.normalized.dir, id)
  }
}
