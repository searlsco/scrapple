#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ensureDirectories } from './paths.js'
import { closeDb } from './db.js'
import { sync } from './commands/sync.js'
import { search } from './commands/search.js'
import { show } from './commands/show.js'
import { open } from './commands/open.js'
import { status } from './commands/status.js'
import { reset } from './commands/reset.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program
  .name('scrapple')
  .description('Local Apple Developer Documentation scraper and search tool')
  .version(pkg.version)
  .option('--human', 'Human-readable output with formatting')

program
  .command('sync')
  .description('Discover, fetch, normalize, and index Apple documentation')
  .option('--discover-only', 'Only run discovery phase')
  .option('--fetch-only', 'Only fetch discovered resources')
  .option('--normalize-only', 'Only normalize fetched resources')
  .option('--index-only', 'Only index normalized content')
  .option('--refresh-all', 'Re-fetch and re-process all resources')
  .action(async (options) => {
    ensureDirectories()
    await sync(options, program.opts())
    closeDb()
  })

program
  .command('search <query>')
  .description('Search the documentation index')
  .option('-t, --type <type>', 'Filter by type (doc, talk, sample, code_file)')
  .option('-l, --limit <n>', 'Maximum results', '20')
  .option('--human', 'Human-readable output with formatting')
  .option('--keyword-only', 'Use only FTS5 keyword search')
  .option('--semantic-only', 'Use only vector semantic search')
  .action(async (query, options) => {
    ensureDirectories()
    const globalOpts = program.opts()
    await search(query, options, { human: options.human || globalOpts.human })
    closeDb()
  })

program
  .command('show <id>')
  .description('Display normalized content for a resource')
  .action(async (id, options) => {
    ensureDirectories()
    await show(id, options, program.opts())
    closeDb()
  })

program
  .command('open <id>')
  .description('Open the canonical URL in a browser')
  .action(async (id) => {
    ensureDirectories()
    await open(id)
    closeDb()
  })

program
  .command('status')
  .description('Show scraper status, coverage stats, and failures')
  .action(async () => {
    ensureDirectories()
    await status(program.opts())
    closeDb()
  })

program
  .command('reset')
  .description('Delete all scraped data and start fresh')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async (options) => {
    await reset(options, program.opts())
  })

program.parse()
