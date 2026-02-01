import { exec } from 'node:child_process'
import { getDb } from '../db.js'
import { resolveReference } from './show.js'

export async function open(ref: string): Promise<void> {
  const db = getDb()

  const manifest = resolveReference(ref, db)

  if (!manifest) {
    console.error(`Resource not found: ${ref}`)
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
