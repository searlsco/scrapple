import Database from 'better-sqlite3'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { paths } from '../paths.js'
import { ManifestRow, ResourceType } from '../db.js'

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
      LIMIT 100
    `)
    .all() as ManifestRow[]

  log(`Normalizing ${toNormalize.length} resources...`)

  const updateManifest = db.prepare(`
    UPDATE manifest SET status = ? WHERE id = ?
  `)

  let normalized = 0
  let failed = 0

  for (const resource of toNormalize) {
    try {
      const rawPath = getRawPath(resource.type, resource.id)

      if (!existsSync(rawPath)) {
        updateManifest.run('failed', resource.id)
        failed++
        continue
      }

      const rawContent = readFileSync(rawPath, 'utf-8')
      const normalizedContent = normalizeContent(resource, rawContent)

      if (normalizedContent) {
        const normalizedPath = getNormalizedPath(resource.type, resource.id)
        mkdirSync(dirname(normalizedPath), { recursive: true })
        writeFileSync(normalizedPath, normalizedContent)
        updateManifest.run('normalized', resource.id)
        normalized++
      } else {
        updateManifest.run('failed', resource.id)
        failed++
      }
    } catch (error) {
      updateManifest.run('failed', resource.id)
      failed++
    }
  }

  log(`Normalized: ${normalized}, Failed: ${failed}`)
}

function normalizeContent(resource: ManifestRow, rawContent: string): string | null {
  switch (resource.type) {
    case 'doc':
      return normalizeDoc(resource, rawContent)
    case 'talk':
      return normalizeTalk(resource, rawContent)
    case 'sample':
      return normalizeSample(resource, rawContent)
    default:
      return rawContent
  }
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
  // Extract transcript from WWDC video page
  const transcript = extractTranscript(rawContent)
  const title = resource.title || 'Untitled Session'

  let md = `# ${title}\n\n`
  md += `URL: ${resource.url}\n\n`

  if (transcript) {
    md += `## Transcript\n\n${transcript}\n`
  } else {
    // Fallback: extract any readable content
    const text = extractTextFromHtml(rawContent)
    if (text) {
      md += `## Content\n\n${text}\n`
    }
  }

  return md
}

function normalizeSample(resource: ManifestRow, rawContent: string): string | null {
  // For now, just extract text from the sample page
  // TODO: handle ZIP files properly
  if (resource.url.endsWith('.zip')) {
    // ZIP handling would require additional library
    return null
  }

  const text = extractTextFromHtml(rawContent)
  const title = resource.title || 'Sample Code'

  let md = `# ${title}\n\n`
  md += `URL: ${resource.url}\n\n`
  if (text) {
    md += text
  }

  return md
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
      return join(paths.data.raw.videos, `${id}.html`)
    case 'sample':
      return join(paths.data.raw.samples, `${id}.zip`)
    case 'code_file':
      return join(paths.data.raw.samples, id)
    default:
      return join(paths.data.raw.dir, id)
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
