#!/usr/bin/env node
import { Command } from 'commander'
import { ensureDirectories } from './paths.js'
import { closeDb } from './db.js'
import { sync } from './commands/sync.js'
import { search } from './commands/search.js'
import { show } from './commands/show.js'
import { open } from './commands/open.js'
import { status } from './commands/status.js'

const program = new Command()

program
  .name('scrapple')
  .description('Local Apple Developer Documentation scraper and search tool')
  .version('0.1.0')
  .option('--human', 'Human-readable output with formatting')

program
  .command('sync')
  .description('Discover, fetch, normalize, and index Apple documentation')
  .option('--discover-only', 'Only run discovery phase')
  .option('--fetch-only', 'Only fetch discovered resources')
  .option('--normalize-only', 'Only normalize fetched resources')
  .option('--index-only', 'Only index normalized content')
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

program.parse()
