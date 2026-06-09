import Database from 'better-sqlite3'
import { discoverWWDC } from './wwdc.js'
import { discoverWhatsNew } from './whats-new.js'
import { discoverTechnologies } from './technologies.js'
import { discoverDocGraph } from './doc-graph.js'
import { discoverSamples } from './samples.js'

interface GlobalOptions {
  human?: boolean
}

export async function discover(db: Database.Database, global: GlobalOptions): Promise<void> {
  const log = (msg: string) => {
    if (global.human) console.log(`  ${msg}`)
  }

  // 1. WWDC sessions (highest value, recent content)
  log('Discovering WWDC sessions...')
  const wwdcCount = await discoverWWDC(db)
  log(`  Found ${wwdcCount} WWDC resources`)

  // 2. What's New hub (platform-specific updates)
  log('Discovering What\'s New content...')
  const whatsNewCount = await discoverWhatsNew(db)
  log(`  Found ${whatsNewCount} What's New resources`)

  // 3. Technologies index (seeds for doc graph)
  log('Discovering technologies...')
  const techCount = await discoverTechnologies(db)
  log(`  Found ${techCount} technology docs`)

  // 4. Documentation graph (follow refs from discovered docs)
  log('Discovering documentation graph...')
  const docGraphCount = await discoverDocGraph(db, global)
  log(`  Found ${docGraphCount} linked documents`)

  // 5. Sample Code Library (broad coverage)
  log('Discovering sample code...')
  const samplesCount = await discoverSamples(db)
  log(`  Found ${samplesCount} samples`)

  const total = wwdcCount + whatsNewCount + techCount + docGraphCount + samplesCount
  log(`Discovery complete: ${total} total resources`)
}
