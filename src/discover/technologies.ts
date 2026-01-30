import Database from 'better-sqlite3'
import { fetchWithCache, urlToId } from '../http.js'

const TECHNOLOGIES_JSON_URL = 'https://developer.apple.com/tutorials/data/documentation/technologies.json'

interface TechReference {
  title?: string
  url?: string
  kind?: string
}

interface TechnologiesResponse {
  references?: Record<string, TechReference>
}

export async function discoverTechnologies(db: Database.Database): Promise<number> {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'doc', ?, 'technologies', 'discovered', ?)
  `)

  const result = await fetchWithCache(TECHNOLOGIES_JSON_URL)
  if (!result?.ok) {
    return 0
  }

  let count = 0

  try {
    const data = JSON.parse(result.data) as TechnologiesResponse
    const refs = data.references || {}

    for (const ref of Object.values(refs)) {
      if (ref.url && ref.url.startsWith('/documentation/')) {
        const url = `https://developer.apple.com${ref.url}`
        const title = ref.title || extractTitleFromPath(ref.url)
        insert.run(urlToId(url), url, title)
        count++
      }
    }
  } catch {
    // JSON parse failed
  }

  return count
}

function extractTitleFromPath(path: string): string {
  const parts = path.split('/')
  const last = parts[parts.length - 1] || parts[parts.length - 2]
  return last
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
