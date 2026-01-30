import Database from 'better-sqlite3'
import { fetchWithCache, urlToId } from '../http.js'

const WHATS_NEW_URL = 'https://developer.apple.com/whats-new/'

export async function discoverWhatsNew(db: Database.Database): Promise<number> {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'doc', ?, 'whats-new', 'discovered', ?)
  `)

  let count = 0

  const result = await fetchWithCache(WHATS_NEW_URL)
  if (!result?.ok) {
    return 0
  }

  // Extract documentation links from What's New page
  const docLinks = extractDocLinks(result.data)

  for (const link of docLinks) {
    insert.run(urlToId(link.url), link.url, link.title)
    count++
  }

  return count
}

interface DocLink {
  url: string
  title: string
}

function extractDocLinks(html: string): DocLink[] {
  const links: DocLink[] = []
  const seen = new Set<string>()

  // Match documentation links
  const docRegex = /href="(\/documentation\/[^"]+)"/g
  let match
  while ((match = docRegex.exec(html)) !== null) {
    const path = match[1].replace(/\/$/, '') // normalize trailing slash
    const url = `https://developer.apple.com${path}`

    if (!seen.has(url)) {
      seen.add(url)
      // Extract title from path for now
      const parts = path.split('/')
      const title = parts[parts.length - 1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
      links.push({ url, title })
    }
  }

  // Also look for sample code links
  const sampleRegex = /href="(\/documentation\/[^"]*#[^"]+)"/g
  while ((match = sampleRegex.exec(html)) !== null) {
    const url = `https://developer.apple.com${match[1]}`
    if (!seen.has(url)) {
      seen.add(url)
      links.push({ url, title: 'Sample Code' })
    }
  }

  return links
}
