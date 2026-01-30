import { getDb } from '../db.js'

interface SearchOptions {
  type?: string
  limit: string
}

interface GlobalOptions {
  human?: boolean
}

interface SearchResult {
  id: string
  title: string
  type: string
  url: string
  snippet: string
  rank: number
}

export async function search(
  query: string,
  options: SearchOptions,
  global: GlobalOptions
): Promise<void> {
  const db = getDb()
  const limit = parseInt(options.limit, 10) || 20

  let sql = `
    SELECT
      c.id,
      c.title,
      c.type,
      c.url,
      snippet(content_fts, 1, '>>>', '<<<', '...', 32) as snippet,
      rank
    FROM content_fts
    JOIN content c ON content_fts.rowid = c.rowid
    WHERE content_fts MATCH ?
  `

  const params: (string | number)[] = [query]

  if (options.type) {
    sql += ` AND c.type = ?`
    params.push(options.type)
  }

  sql += ` ORDER BY rank LIMIT ?`
  params.push(limit)

  const results = db.prepare(sql).all(...params) as SearchResult[]

  if (global.human) {
    if (results.length === 0) {
      console.log('No results found.')
      return
    }

    for (const result of results) {
      console.log(`\n[${result.type}] ${result.title}`)
      console.log(`  ${result.url}`)
      console.log(`  ${result.snippet}`)
    }
    console.log(`\n${results.length} result(s)`)
  } else {
    console.log(JSON.stringify(results))
  }
}
