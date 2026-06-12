import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../paths.js'

interface GlobalOptions {
  human?: boolean
}

interface PruneOptions {
  dryRun?: boolean
  rawSamplesDir?: string
}

export interface PruneResult {
  filesDeleted: number
  bytesDeleted: number
  dryRun: boolean
}

export async function prune(options: PruneOptions, global: GlobalOptions): Promise<void> {
  const result = pruneRawSamples(options)

  if (global.human) {
    const action = result.dryRun ? 'Would delete' : 'Deleted'
    console.log(
      `${action} ${result.filesDeleted.toLocaleString()} raw sample archives ` +
        `(${formatBytes(result.bytesDeleted)})`
    )
  } else {
    console.log(JSON.stringify(result))
  }
}

export function pruneRawSamples(options: PruneOptions = {}): PruneResult {
  const rawSamplesDir = options.rawSamplesDir || paths.data.raw.samples
  const dryRun = options.dryRun === true
  const result: PruneResult = {
    filesDeleted: 0,
    bytesDeleted: 0,
    dryRun,
  }

  if (!existsSync(rawSamplesDir)) return result

  for (const entry of readdirSync(rawSamplesDir)) {
    const entryPath = join(rawSamplesDir, entry)
    const stats = statSync(entryPath)

    if (!stats.isFile()) continue

    result.filesDeleted++
    result.bytesDeleted += stats.size

    if (!dryRun) {
      unlinkSync(entryPath)
    }
  }

  return result
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
