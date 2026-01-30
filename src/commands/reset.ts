import { getDb, closeDb } from '../db.js'
import { paths } from '../paths.js'
import { unlinkSync, existsSync } from 'node:fs'
import * as readline from 'node:readline'

interface ResetOptions {
  confirm?: boolean
}

interface GlobalOptions {
  human?: boolean
}

export async function reset(options: ResetOptions, global: GlobalOptions): Promise<void> {
  if (!options.confirm) {
    const confirmed = await promptConfirmation()
    if (!confirmed) {
      console.log('Reset cancelled.')
      return
    }
  }

  // Close existing connection
  closeDb()

  // Delete the database file
  const dbPath = paths.data.index.db
  if (existsSync(dbPath)) {
    unlinkSync(dbPath)
    if (global.human) console.log(`Deleted database: ${dbPath}`)
  }

  // Also delete WAL and SHM files if they exist
  const walPath = dbPath + '-wal'
  const shmPath = dbPath + '-shm'
  if (existsSync(walPath)) unlinkSync(walPath)
  if (existsSync(shmPath)) unlinkSync(shmPath)

  if (global.human) {
    console.log('Reset complete. Run `scrapple sync` to rebuild from scratch.')
  } else {
    console.log(JSON.stringify({ reset: true }))
  }
}

async function promptConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question('This will delete all scraped data. Type "confirm" to proceed: ', (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'confirm')
    })
  })
}
