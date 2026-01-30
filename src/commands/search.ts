import { getDb } from '../db.js'

/**
 * Build an FTS5 query that's more forgiving:
 * - Splits query into words
 * - Adds prefix matching (word*) for partial matches
 * - Uses OR between terms so any match works
 * - Preserves quoted phrases
 */
function buildFtsQuery(query: string): string {
  // Handle quoted phrases - keep them intact
  const phrases: string[] = []
  const withoutPhrases = query.replace(/"([^"]+)"/g, (_, phrase) => {
    phrases.push(`"${phrase}"`)
    return ''
  })

  // Split remaining into words and add prefix matching
  const words = withoutPhrases
    .split(/\s+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0)
    .map(w => {
      // Don't add * to words that already have operators
      if (w.includes('*') || w.includes('"') || w.startsWith('-')) {
        return w
      }
      // Add prefix matching for words 3+ chars
      return w.length >= 3 ? `${w}*` : w
    })

  // Combine phrases and words with OR
  const allTerms = [...phrases, ...words]

  if (allTerms.length === 0) {
    return query // Fallback to original
  }

  if (allTerms.length === 1) {
    return allTerms[0]
  }

  // Use OR between all terms for broader matching
  return allTerms.join(' OR ')
}

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

  // Transform query to be more forgiving:
  // - Add prefix matching (word*) for partial matches
  // - Use OR between terms so any term matches
  const ftsQuery = buildFtsQuery(query)

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

  const params: (string | number)[] = [ftsQuery]

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
