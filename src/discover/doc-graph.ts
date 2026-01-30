import Database from 'better-sqlite3'
import { fetchWithCache, urlToId } from '../http.js'

// Primary JSON endpoint pattern
const DOC_JSON_URL = (path: string) =>
  `https://developer.apple.com/tutorials/data/documentation/${path}.json`

// Fallback pattern
const DOC_JSON_FALLBACK = (path: string) =>
  `https://developer.apple.com/documentation/${path}/data.json`

export async function discoverDocGraph(db: Database.Database): Promise<number> {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'doc', ?, 'doc-graph', 'discovered', ?)
  `)

  // Get all discovered docs that haven't been processed for refs yet
  const discovered = db
    .prepare(`
      SELECT url FROM manifest
      WHERE type = 'doc' AND status IN ('discovered', 'fetched', 'normalized', 'indexed')
    `)
    .all() as { url: string }[]

  let count = 0
  const processed = new Set<string>()

  for (const { url } of discovered) {
    if (processed.has(url)) continue
    processed.add(url)

    const refs = await extractReferences(url)

    for (const ref of refs) {
      if (!processed.has(ref.url)) {
        insert.run(urlToId(ref.url), ref.url, ref.title)
        count++
      }
    }
  }

  return count
}

interface DocRef {
  url: string
  title: string
}

async function extractReferences(docUrl: string): Promise<DocRef[]> {
  const refs: DocRef[] = []

  // Extract path from URL
  const match = docUrl.match(/\/documentation\/(.+?)(?:\/)?$/)
  if (!match) return refs

  const path = match[1]

  // Try primary endpoint first
  let result = await fetchWithCache(DOC_JSON_URL(path))

  // Fallback to alternative endpoint
  if (!result?.ok) {
    result = await fetchWithCache(DOC_JSON_FALLBACK(path))
  }

  if (!result?.ok) return refs

  try {
    const data = JSON.parse(result.data)
    extractRefsFromJson(data, refs)
  } catch {
    // JSON parse failed, skip
  }

  return refs
}

function extractRefsFromJson(data: unknown, refs: DocRef[]): void {
  if (!data || typeof data !== 'object') return

  const obj = data as Record<string, unknown>

  // Look for references array
  if (Array.isArray(obj.references)) {
    for (const ref of obj.references) {
      if (
        ref &&
        typeof ref === 'object' &&
        'url' in ref &&
        typeof ref.url === 'string' &&
        ref.url.startsWith('/documentation/')
      ) {
        const url = `https://developer.apple.com${ref.url}`
        const title = (ref as { title?: string }).title || extractTitleFromPath(ref.url)
        refs.push({ url, title })
      }
    }
  }

  // Look for seeAlsoSections
  if (Array.isArray(obj.seeAlsoSections)) {
    for (const section of obj.seeAlsoSections) {
      if (section && typeof section === 'object' && Array.isArray(section.identifiers)) {
        // These are identifiers that reference other docs
        // They'll be resolved in a separate pass
      }
    }
  }

  // Recursively check nested objects
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        extractRefsFromJson(item, refs)
      }
    } else if (typeof value === 'object') {
      extractRefsFromJson(value, refs)
    }
  }
}

function extractTitleFromPath(path: string): string {
  const parts = path.split('/')
  const last = parts[parts.length - 1] || parts[parts.length - 2]
  return last
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
