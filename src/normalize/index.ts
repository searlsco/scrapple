import Database from 'better-sqlite3'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { paths } from '../paths.js'
import { ManifestRow, ResourceType } from '../db.js'

// Source file extensions to extract from samples
const SOURCE_EXTENSIONS = new Set([
  '.swift',
  '.m',
  '.mm',
  '.h',
  '.c',
  '.cpp',
  '.metal',
  '.strings',
  '.plist',
  '.json',
  '.xml',
  '.storyboard',
  '.xib',
])

interface GlobalOptions {
  human?: boolean
}

export async function normalizeResources(db: Database.Database, global: GlobalOptions): Promise<void> {
  const log = (msg: string) => {
    if (global.human) console.log(`  ${msg}`)
  }

  // Get all fetched resources that need normalization
  const toNormalize = db
    .prepare(`
      SELECT * FROM manifest
      WHERE status = 'fetched'
    `)
    .all() as ManifestRow[]

  const total = toNormalize.length
  log(`Normalizing ${total} resources...`)

  const updateManifest = db.prepare(`
    UPDATE manifest SET status = ? WHERE id = ?
  `)

  let normalized = 0
  let failed = 0

  for (const resource of toNormalize) {
    try {
      const rawPath = getExistingRawPath(resource.type, resource.id)

      if (!existsSync(rawPath)) {
        updateManifest.run('failed', resource.id)
        failed++
        continue
      }

      if (resource.type === 'sample') {
        const normalizedSample = normalizeSampleArchive(resource, readFileSync(rawPath), db)
        if (normalizedSample) {
          deleteRawSampleArchive(rawPath)
          updateManifest.run('normalized', resource.id)
          normalized++
        } else {
          updateManifest.run('failed', resource.id)
          failed++
        }
      } else {
        const rawContent = readFileSync(rawPath, 'utf-8')
        const normalizedContent = normalizeContent(resource, rawContent, db)

        if (!normalizedContent) {
          updateManifest.run('failed', resource.id)
          failed++
          continue
        }

        const normalizedPath = getNormalizedPath(resource.type, resource.id)
        mkdirSync(dirname(normalizedPath), { recursive: true })
        writeFileSync(normalizedPath, normalizedContent)
        updateManifest.run('normalized', resource.id)
        normalized++
      }
    } catch {
      updateManifest.run('failed', resource.id)
      failed++
    }

    // Progress logging
    const processed = normalized + failed
    if (processed % 50 === 0 || processed === total) {
      log(`  Progress: ${processed}/${total} (${normalized} normalized, ${failed} failed)`)
    }
  }

  log(`Normalize complete: ${normalized} normalized, ${failed} failed`)
}

function normalizeContent(resource: ManifestRow, rawContent: string | Buffer, db: Database.Database): string | null {
  switch (resource.type) {
    case 'doc':
      return normalizeDoc(resource, rawContent as string)
    case 'talk':
      return normalizeTalk(resource, rawContent as string)
    case 'sample':
      return normalizeSample(resource, rawContent as Buffer, db)
    default:
      return typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8')
  }
}

export function normalizeSampleArchive(
  resource: ManifestRow,
  rawContent: Buffer,
  db: Database.Database
): boolean {
  const normalizedContent = normalizeSample(resource, rawContent, db)
  if (!normalizedContent) return false

  const normalizedPath = getNormalizedPath(resource.type, resource.id)
  mkdirSync(dirname(normalizedPath), { recursive: true })
  writeFileSync(normalizedPath, normalizedContent)
  return true
}

function normalizeDoc(resource: ManifestRow, rawContent: string): string | null {
  try {
    const data = JSON.parse(rawContent)
    return jsonDocToMarkdown(data, resource)
  } catch {
    // Not JSON, return as-is or extract text from HTML
    return extractTextFromHtml(rawContent)
  }
}

function normalizeTalk(resource: ManifestRow, rawContent: string): string | null {
  // Try to parse as JSON (new Playwright format)
  try {
    const data = JSON.parse(rawContent) as {
      title?: string
      transcript?: string
      description?: string
      resources?: string[]
    }

    const title = data.title || resource.title || 'Untitled Session'
    const parts: string[] = []

    parts.push(`# ${title}`)
    parts.push(`\nURL: ${resource.url}\n`)

    if (data.description) {
      parts.push(`## Description\n\n${data.description}\n`)
    }

    if (data.transcript) {
      parts.push(`## Transcript\n\n${data.transcript}\n`)
    }

    if (data.resources && data.resources.length > 0) {
      parts.push(`## Resources\n`)
      for (const r of data.resources) {
        parts.push(`- ${r}`)
      }
    }

    return parts.join('\n')
  } catch {
    // Fallback for old HTML format
    const transcript = extractTranscript(rawContent)
    const title = resource.title || 'Untitled Session'

    let md = `# ${title}\n\n`
    md += `URL: ${resource.url}\n\n`

    if (transcript) {
      md += `## Transcript\n\n${transcript}\n`
    } else {
      const text = extractTextFromHtml(rawContent)
      if (text) {
        md += `## Content\n\n${text}\n`
      }
    }

    return md
  }
}

function normalizeSample(resource: ManifestRow, rawContent: Buffer, db: Database.Database): string | null {
  // Handle ZIP files
  if (resource.url.endsWith('.zip')) {
    return extractAndIndexZip(resource, rawContent, db)
  }

  // Non-ZIP sample pages (shouldn't happen with new flow)
  const text = extractTextFromHtml(rawContent.toString('utf-8'))
  const title = resource.title || 'Sample Code'

  let md = `# ${title}\n\n`
  md += `URL: ${resource.url}\n\n`
  if (text) {
    md += text
  }

  return md
}

function extractAndIndexZip(resource: ManifestRow, zipBuffer: Buffer, db: Database.Database): string | null {
  try {
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries()
    const title = resource.title || 'Sample Code'

    const insertCodeFile = db.prepare(`
      INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
      VALUES (?, 'code_file', ?, 'sample-extract', 'normalized', ?)
    `)

    const sourceFiles: { path: string; content: string }[] = []

    for (const entry of entries) {
      if (entry.isDirectory) continue

      const ext = extname(entry.entryName).toLowerCase()
      if (!SOURCE_EXTENSIONS.has(ext)) continue

      // Skip hidden files and build artifacts
      const name = basename(entry.entryName)
      if (name.startsWith('.')) continue
      if (entry.entryName.includes('/.build/')) continue
      if (entry.entryName.includes('/DerivedData/')) continue
      if (entry.entryName.includes('/Pods/')) continue

      try {
        const content = entry.getData().toString('utf-8')

        // Create a unique ID for this code file
        const fileUrl = `${resource.url}#${entry.entryName}`
        const fileId = createHash('sha256').update(fileUrl).digest('hex').slice(0, 16)

        // Save the source file
        const normalizedPath = join(paths.data.normalized.samples, resource.id, entry.entryName)
        mkdirSync(dirname(normalizedPath), { recursive: true })
        writeFileSync(normalizedPath, content)

        // Add to manifest
        insertCodeFile.run(fileId, fileUrl, `${title} - ${name}`)

        sourceFiles.push({ path: entry.entryName, content })
      } catch {
        // Skip files that can't be read as UTF-8
      }
    }

    // Create a summary markdown for the sample
    let md = `# ${title}\n\n`
    md += `URL: ${resource.url}\n\n`
    md += `## Source Files (${sourceFiles.length})\n\n`

    for (const file of sourceFiles) {
      md += `### ${file.path}\n\n`
      md += `\`\`\`${getLanguageFromExt(extname(file.path))}\n`
      // Truncate very long files
      const truncated = file.content.length > 5000
        ? file.content.slice(0, 5000) + '\n// ... (truncated)'
        : file.content
      md += truncated
      md += '\n```\n\n'
    }

    return md
  } catch {
    // ZIP extraction failed
    return null
  }
}

function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.swift': 'swift',
    '.m': 'objc',
    '.mm': 'objc',
    '.h': 'objc',
    '.c': 'c',
    '.cpp': 'cpp',
    '.metal': 'metal',
    '.json': 'json',
    '.xml': 'xml',
    '.plist': 'xml',
  }
  return map[ext.toLowerCase()] || ''
}

function jsonDocToMarkdown(data: unknown, resource: ManifestRow): string {
  if (!data || typeof data !== 'object') {
    return `# ${resource.title || 'Document'}\n\nNo content available.`
  }

  const obj = data as Record<string, unknown>
  const parts: string[] = []

  // Extract title
  const title = extractTitle(obj) || resource.title || 'Document'
  parts.push(`# ${title}\n`)

  // Extract abstract/summary
  const abstract = extractAbstract(obj)
  if (abstract) {
    parts.push(`${abstract}\n`)
  }

  // Extract main content
  const content = extractContent(obj)
  if (content) {
    parts.push(content)
  }

  // Add URL reference
  parts.push(`\n---\nSource: ${resource.url}`)

  return parts.join('\n')
}

function extractTitle(data: Record<string, unknown>): string | null {
  if (typeof data.title === 'string') return data.title

  if (data.metadata && typeof data.metadata === 'object') {
    const meta = data.metadata as Record<string, unknown>
    if (typeof meta.title === 'string') return meta.title
  }

  return null
}

function extractAbstract(data: Record<string, unknown>): string | null {
  if (data.abstract && Array.isArray(data.abstract)) {
    return extractTextFromInlineContent(data.abstract)
  }

  if (data.metadata && typeof data.metadata === 'object') {
    const meta = data.metadata as Record<string, unknown>
    if (meta.abstract && Array.isArray(meta.abstract)) {
      return extractTextFromInlineContent(meta.abstract)
    }
  }

  return null
}

function extractContent(data: Record<string, unknown>): string | null {
  const parts: string[] = []

  // Primary content sections
  if (data.primaryContentSections && Array.isArray(data.primaryContentSections)) {
    for (const section of data.primaryContentSections) {
      const sectionText = extractSectionContent(section)
      if (sectionText) parts.push(sectionText)
    }
  }

  // Topics
  if (data.topicSections && Array.isArray(data.topicSections)) {
    for (const topic of data.topicSections) {
      if (topic && typeof topic === 'object') {
        const t = topic as Record<string, unknown>
        if (typeof t.title === 'string') {
          parts.push(`\n## ${t.title}\n`)
        }
        if (Array.isArray(t.identifiers)) {
          for (const id of t.identifiers) {
            if (typeof id === 'string') {
              parts.push(`- ${id}`)
            }
          }
        }
      }
    }
  }

  // See also
  if (data.seeAlsoSections && Array.isArray(data.seeAlsoSections)) {
    parts.push('\n## See Also\n')
    for (const section of data.seeAlsoSections) {
      if (section && typeof section === 'object') {
        const s = section as Record<string, unknown>
        if (Array.isArray(s.identifiers)) {
          for (const id of s.identifiers) {
            if (typeof id === 'string') {
              parts.push(`- ${id}`)
            }
          }
        }
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null
}

function extractSectionContent(section: unknown): string | null {
  if (!section || typeof section !== 'object') return null

  const s = section as Record<string, unknown>
  const parts: string[] = []

  if (typeof s.kind === 'string') {
    // Different section types
    if (s.kind === 'content' && Array.isArray(s.content)) {
      for (const item of s.content) {
        const text = extractContentItem(item)
        if (text) parts.push(text)
      }
    } else if (s.kind === 'declarations' && Array.isArray(s.declarations)) {
      parts.push('\n### Declaration\n')
      for (const decl of s.declarations) {
        if (decl && typeof decl === 'object') {
          const d = decl as Record<string, unknown>
          if (Array.isArray(d.tokens)) {
            const code = d.tokens
              .map((t: unknown) => (t && typeof t === 'object' && 'text' in t ? (t as { text: string }).text : ''))
              .join('')
            parts.push(`\`\`\`\n${code}\n\`\`\``)
          }
        }
      }
    } else if (s.kind === 'parameters' && Array.isArray(s.parameters)) {
      parts.push('\n### Parameters\n')
      for (const param of s.parameters) {
        if (param && typeof param === 'object') {
          const p = param as Record<string, unknown>
          const name = typeof p.name === 'string' ? p.name : 'unknown'
          const content = Array.isArray(p.content) ? extractTextFromInlineContent(p.content) : ''
          parts.push(`- **${name}**: ${content}`)
        }
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null
}

function extractContentItem(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null

  const i = item as Record<string, unknown>

  if (i.type === 'paragraph' && Array.isArray(i.inlineContent)) {
    return extractTextFromInlineContent(i.inlineContent)
  }

  if (i.type === 'heading' && Array.isArray(i.inlineContent)) {
    const level = typeof i.level === 'number' ? i.level : 2
    const text = extractTextFromInlineContent(i.inlineContent)
    return `${'#'.repeat(level)} ${text}`
  }

  if (i.type === 'codeListing') {
    const code = Array.isArray(i.code) ? i.code.join('\n') : ''
    const lang = typeof i.syntax === 'string' ? i.syntax : ''
    return `\`\`\`${lang}\n${code}\n\`\`\``
  }

  if (i.type === 'unorderedList' && Array.isArray(i.items)) {
    return i.items
      .map((li: unknown) => {
        if (li && typeof li === 'object' && 'content' in li && Array.isArray((li as Record<string, unknown>).content)) {
          const content = (li as Record<string, unknown>).content as unknown[]
          return `- ${content.map(c => extractContentItem(c)).filter(Boolean).join(' ')}`
        }
        return null
      })
      .filter(Boolean)
      .join('\n')
  }

  return null
}

function extractTextFromInlineContent(content: unknown[]): string {
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const i = item as Record<string, unknown>

      if (i.type === 'text' && typeof i.text === 'string') {
        return i.text
      }
      if (i.type === 'codeVoice' && typeof i.code === 'string') {
        return `\`${i.code}\``
      }
      if (i.type === 'reference' && typeof i.identifier === 'string') {
        return i.identifier.split('/').pop() || ''
      }
      if (i.type === 'emphasis' && Array.isArray(i.inlineContent)) {
        return `*${extractTextFromInlineContent(i.inlineContent)}*`
      }
      if (i.type === 'strong' && Array.isArray(i.inlineContent)) {
        return `**${extractTextFromInlineContent(i.inlineContent)}**`
      }

      return ''
    })
    .join('')
}

function extractTranscript(html: string): string | null {
  // Look for transcript data in WWDC pages
  // Transcripts are often in a data attribute or script tag

  // Try to find transcript in JSON data
  const jsonMatch = html.match(/transcript['"]\s*:\s*(\[[^\]]+\])/i)
  if (jsonMatch) {
    try {
      const segments = JSON.parse(jsonMatch[1])
      if (Array.isArray(segments)) {
        return segments
          .map((s: unknown) => {
            if (s && typeof s === 'object' && 'text' in s) {
              return (s as { text: string }).text
            }
            return ''
          })
          .filter(Boolean)
          .join(' ')
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Look for transcript section in HTML
  const transcriptMatch = html.match(/<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (transcriptMatch) {
    return extractTextFromHtml(transcriptMatch[1])
  }

  return null
}

function extractTextFromHtml(html: string): string | null {
  if (!html) return null

  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // Convert some tags to markdown
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n')
  text = text.trim()

  return text || null
}

function getRawPath(type: ResourceType, id: string): string {
  switch (type) {
    case 'doc':
      return join(paths.data.raw.docs, `${id}.json`)
    case 'talk':
      return join(paths.data.raw.videos, `${id}.json`)
    case 'sample':
      return join(paths.data.raw.samples, `${id}.zip`)
    case 'code_file':
      return join(paths.data.raw.samples, id)
    default:
      return join(paths.data.raw.dir, id)
  }
}

function getExistingRawPath(type: ResourceType, id: string): string {
  const rawPath = getRawPath(type, id)
  if (existsSync(rawPath)) return rawPath

  if (type === 'sample') {
    const legacyRawPath = join(paths.data.raw.samples, id)
    if (existsSync(legacyRawPath)) return legacyRawPath
  }

  return rawPath
}

function deleteRawSampleArchive(rawPath: string): void {
  try {
    unlinkSync(rawPath)
  } catch {
    // A missing temp archive should not fail a completed normalization.
  }
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
