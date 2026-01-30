import { readFileSync } from 'node:fs'
import { getDb, ManifestRow, ContentRow } from '../db.js'

interface GlobalOptions {
  human?: boolean
}

export async function show(
  id: string,
  _options: unknown,
  global: GlobalOptions
): Promise<void> {
  const db = getDb()

  const manifest = db
    .prepare('SELECT * FROM manifest WHERE id = ?')
    .get(id) as ManifestRow | undefined

  if (!manifest) {
    console.error(`Resource not found: ${id}`)
    process.exit(1)
  }

  const content = db
    .prepare('SELECT * FROM content WHERE id = ? ORDER BY chunk_index')
    .all(id) as ContentRow[]

  if (global.human) {
    console.log(`# ${manifest.title || manifest.url}`)
    console.log(`Type: ${manifest.type}`)
    console.log(`URL: ${manifest.url}`)
    console.log(`Status: ${manifest.status}`)
    if (manifest.platforms) {
      console.log(`Platforms: ${JSON.parse(manifest.platforms).join(', ')}`)
    }
    console.log()

    if (content.length > 0 && content[0].local_path) {
      try {
        const fileContent = readFileSync(content[0].local_path, 'utf-8')
        console.log(fileContent)
      } catch {
        console.log('[Content file not found]')
      }
    } else {
      for (const chunk of content) {
        console.log(chunk.body)
      }
    }
  } else {
    console.log(JSON.stringify({
      manifest,
      content: content.map(c => ({ title: c.title, body: c.body })),
    }))
  }
}
