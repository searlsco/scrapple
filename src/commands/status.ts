import { getDb } from '../db.js'

interface GlobalOptions {
  human?: boolean
}

interface StatusCount {
  status: string
  count: number
}

interface TypeCount {
  type: string
  count: number
}

export async function status(global: GlobalOptions): Promise<void> {
  const db = getDb()

  const byStatus = db
    .prepare('SELECT status, COUNT(*) as count FROM manifest GROUP BY status')
    .all() as StatusCount[]

  const byType = db
    .prepare('SELECT type, COUNT(*) as count FROM manifest GROUP BY type')
    .all() as TypeCount[]

  const total = db
    .prepare('SELECT COUNT(*) as count FROM manifest')
    .get() as { count: number }

  const indexed = db
    .prepare('SELECT COUNT(DISTINCT id) as count FROM content')
    .get() as { count: number }

  const failed = db
    .prepare("SELECT url, title FROM manifest WHERE status = 'failed' LIMIT 10")
    .all() as { url: string; title: string | null }[]

  if (global.human) {
    console.log('=== Scrapple Status ===\n')

    console.log('By Status:')
    for (const row of byStatus) {
      console.log(`  ${row.status}: ${row.count}`)
    }

    console.log('\nBy Type:')
    for (const row of byType) {
      console.log(`  ${row.type}: ${row.count}`)
    }

    console.log(`\nTotal resources: ${total.count}`)
    console.log(`Indexed documents: ${indexed.count}`)

    if (failed.length > 0) {
      console.log('\nRecent failures:')
      for (const f of failed) {
        console.log(`  - ${f.title || f.url}`)
      }
    }
  } else {
    console.log(JSON.stringify({
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
      total: total.count,
      indexed: indexed.count,
      recentFailures: failed,
    }))
  }
}
