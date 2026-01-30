import { exec } from 'node:child_process'
import { getDb, ManifestRow } from '../db.js'

export async function open(id: string): Promise<void> {
  const db = getDb()

  const manifest = db
    .prepare('SELECT * FROM manifest WHERE id = ?')
    .get(id) as ManifestRow | undefined

  if (!manifest) {
    console.error(`Resource not found: ${id}`)
    process.exit(1)
  }

  // macOS: use 'open' command
  exec(`open "${manifest.url}"`, (error) => {
    if (error) {
      console.error(`Failed to open URL: ${error.message}`)
      process.exit(1)
    }
  })
}
