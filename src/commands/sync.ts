import { getDb } from '../db.js'
import { discover } from '../discover/index.js'
import { fetchResources } from '../fetch/index.js'
import { normalizeResources } from '../normalize/index.js'
import { indexResources, embedContent } from '../index/index.js'

interface SyncOptions {
  discoverOnly?: boolean
  fetchOnly?: boolean
  normalizeOnly?: boolean
  indexOnly?: boolean
}

interface GlobalOptions {
  human?: boolean
}

export async function sync(options: SyncOptions, global: GlobalOptions): Promise<void> {
  const db = getDb()

  if (!options.fetchOnly && !options.normalizeOnly && !options.indexOnly) {
    if (global.human) console.log('Discovering resources...')
    await discover(db, global)
  }

  if (!options.discoverOnly && !options.normalizeOnly && !options.indexOnly) {
    if (global.human) console.log('Fetching resources...')
    await fetchResources(db, global)
  }

  if (!options.discoverOnly && !options.fetchOnly && !options.indexOnly) {
    if (global.human) console.log('Normalizing resources...')
    await normalizeResources(db, global)
  }

  if (!options.discoverOnly && !options.fetchOnly && !options.normalizeOnly) {
    if (global.human) console.log('Indexing content...')
    await indexResources(db, global)
    if (global.human) console.log('Generating embeddings...')
    await embedContent(db, global)
  }

  if (global.human) console.log('Sync complete.')
}
