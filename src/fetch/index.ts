import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fetchWithCache, fetchBinary, urlToId } from '../http.js'
import { paths } from '../paths.js'
import { ManifestRow, ResourceType } from '../db.js'
import { fetchWWDCBatch, closeBrowser } from './playwright.js'

// Base URL for sample code downloads
const SAMPLE_DOWNLOAD_BASE = 'https://docs-assets.developer.apple.com/published/'

interface GlobalOptions {
  human?: boolean
}

// JSON endpoint patterns for docs
const DOC_JSON_URL = (path: string) =>
  `https://developer.apple.com/tutorials/data/documentation/${path}.json`
const DOC_JSON_FALLBACK = (path: string) =>
  `https://developer.apple.com/documentation/${path}/data.json`
const FETCH_PROGRESS_ITEM_INTERVAL = 100
const FETCH_PROGRESS_TIME_INTERVAL_MS = 10_000

export function shouldLogFetchProgress(
  processed: number,
  total: number,
  now: number,
  lastLoggedAt: number
): boolean {
  if (total === 0) return false
  if (processed === 1 || processed === total) return true
  if (processed % FETCH_PROGRESS_ITEM_INTERVAL === 0) return true
  return now - lastLoggedAt >= FETCH_PROGRESS_TIME_INTERVAL_MS
}

export async function fetchResources(db: Database.Database, global: GlobalOptions): Promise<void> {
  const log = (msg: string) => {
    if (global.human) console.log(`  ${msg}`)
  }

  // Get all discovered resources that need fetching
  const toFetch = db
    .prepare(`
      SELECT * FROM manifest
      WHERE status = 'discovered'
      ORDER BY
        CASE source
          WHEN 'wwdc' THEN 1
          WHEN 'whats-new' THEN 2
          WHEN 'doc-graph' THEN 3
          WHEN 'sample-library' THEN 4
          ELSE 5
        END
    `)
    .all() as ManifestRow[]

  const total = toFetch.length
  log(`Fetching ${total} resources...`)

  const updateManifest = db.prepare(`
    UPDATE manifest
    SET status = ?, etag = ?, last_modified = ?, fetched_at = ?, content_hash = ?, title = ?
    WHERE id = ?
  `)

  let fetched = 0
  let failed = 0
  let skipped = 0

  // Separate talks from other resources for batch processing
  const talks = toFetch.filter(r => r.type === 'talk')
  const others = toFetch.filter(r => r.type !== 'talk')

  // Batch fetch talks with Playwright (concurrent)
  if (talks.length > 0) {
    log(`  Fetching ${talks.length} WWDC sessions with Playwright (5 concurrent)...`)

    const urlToResource = new Map(talks.map(r => [r.url, r]))
    const urls = talks.map(r => r.url)

    const results = await fetchWWDCBatch(urls, (completed, batchTotal) => {
      if (completed % 25 === 0 || completed === batchTotal) {
        log(`    Playwright progress: ${completed}/${batchTotal}`)
      }
    })

    for (const [url, content] of results) {
      const resource = urlToResource.get(url)!

      if (content) {
        const data = JSON.stringify(content, null, 2)
        const contentHash = createHash('sha256').update(data).digest('hex')
        const rawPath = getRawPath(resource.type, resource.id)
        mkdirSync(dirname(rawPath), { recursive: true })
        writeFileSync(rawPath, data)

        updateManifest.run(
          'fetched',
          null,
          null,
          Date.now(),
          contentHash,
          content.title || resource.title,
          resource.id
        )
        fetched++
      } else {
        updateManifest.run(
          'failed',
          null,
          null,
          Date.now(),
          null,
          resource.title,
          resource.id
        )
        failed++
      }
    }
  }

  // Fetch other resources one by one
  if (others.length > 0) {
    log(`  Fetching ${others.length} non-WWDC resources...`)
  }

  let otherProcessed = 0
  let otherFetched = 0
  let otherFailed = 0
  let otherSkipped = 0
  let lastOtherProgressAt = Date.now()

  for (const resource of others) {
    try {
      const result = await fetchResource(resource, db)

      if (result === null) {
        skipped++
        otherSkipped++
      } else if (result.ok) {
        const rawPath = getRawPath(resource.type, resource.id)
        mkdirSync(dirname(rawPath), { recursive: true })
        writeFileSync(rawPath, result.data)

        updateManifest.run(
          'fetched',
          result.etag || null,
          result.lastModified || null,
          Date.now(),
          result.contentHash,
          result.title || resource.title,
          resource.id
        )
        fetched++
        otherFetched++
      } else {
        updateManifest.run(
          'failed',
          null,
          null,
          Date.now(),
          null,
          resource.title,
          resource.id
        )
        failed++
        otherFailed++
      }
    } catch {
      updateManifest.run(
        'failed',
        null,
        null,
        Date.now(),
        null,
        resource.title,
        resource.id
      )
      failed++
      otherFailed++
    }

    otherProcessed++
    const now = Date.now()
    if (shouldLogFetchProgress(otherProcessed, others.length, now, lastOtherProgressAt)) {
      log(
        `    Fetch progress: ${otherProcessed}/${others.length} ` +
          `(${otherFetched} fetched, ${otherFailed} failed, ${otherSkipped} skipped)`
      )
      lastOtherProgressAt = now
    }

    await sleep(100)
  }

  // Close browser if it was used
  await closeBrowser()

  log(`Fetch complete: ${fetched} fetched, ${failed} failed, ${skipped} skipped`)
}

interface FetchResourceResult {
  ok: boolean
  data: string
  etag?: string
  lastModified?: string
  contentHash: string
  title?: string
}

async function fetchResource(resource: ManifestRow, db: Database.Database): Promise<FetchResourceResult | null> {
  if (resource.type === 'doc') {
    return fetchDoc(resource, db)
  } else if (resource.type === 'sample') {
    return fetchSample(resource)
  }

  // Fallback: direct fetch
  const result = await fetchWithCache(resource.url, resource.etag, resource.last_modified)
  if (!result) return null

  return {
    ok: result.ok,
    data: result.data,
    etag: result.etag,
    lastModified: result.lastModified,
    contentHash: result.contentHash,
  }
}

interface SampleDownloadInfo {
  identifier: string
  url: string
}

async function fetchDoc(resource: ManifestRow, db?: Database.Database): Promise<FetchResourceResult | null> {
  // Extract path from documentation URL
  const match = resource.url.match(/\/documentation\/(.+?)(?:\/)?$/)
  if (!match) {
    // Direct fetch as fallback
    const result = await fetchWithCache(resource.url, resource.etag, resource.last_modified)
    if (!result) return null
    return {
      ok: result.ok,
      data: result.data,
      etag: result.etag,
      lastModified: result.lastModified,
      contentHash: result.contentHash,
    }
  }

  const path = match[1]

  // Try primary JSON endpoint
  let result = await fetchWithCache(DOC_JSON_URL(path), resource.etag, resource.last_modified)

  // Fallback to alternative endpoint
  if (!result?.ok) {
    result = await fetchWithCache(DOC_JSON_FALLBACK(path), resource.etag, resource.last_modified)
  }

  if (!result) return null

  let title: string | undefined
  let sampleDownload: SampleDownloadInfo | undefined

  if (result.ok) {
    try {
      const data = JSON.parse(result.data)
      title = extractDocTitle(data)
      sampleDownload = extractSampleDownload(data)

      // If there's sample code, download the ZIP
      if (sampleDownload && db) {
        await downloadSampleZip(sampleDownload, resource, db)
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  return {
    ok: result.ok,
    data: result.data,
    etag: result.etag,
    lastModified: result.lastModified,
    contentHash: result.contentHash,
    title,
  }
}

function extractSampleDownload(data: unknown): SampleDownloadInfo | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>

  if (obj.sampleCodeDownload && typeof obj.sampleCodeDownload === 'object') {
    const download = obj.sampleCodeDownload as Record<string, unknown>
    if (download.action && typeof download.action === 'object') {
      const action = download.action as Record<string, unknown>
      if (typeof action.identifier === 'string' && action.isActive) {
        const identifier = action.identifier
        return {
          identifier,
          url: `${SAMPLE_DOWNLOAD_BASE}${identifier}`,
        }
      }
    }
  }

  return undefined
}

async function downloadSampleZip(
  download: SampleDownloadInfo,
  parentDoc: ManifestRow,
  db: Database.Database
): Promise<void> {
  // Create a manifest entry for the sample ZIP
  const sampleId = urlToId(download.url)

  const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'sample', ?, 'sample-download', 'discovered', ?)
  `)

  const zipName = download.identifier.split('/').pop() || 'sample.zip'
  const title = zipName.replace('.zip', '').replace(/([A-Z])/g, ' $1').trim()

  insert.run(sampleId, download.url, title)

  // Fetch the ZIP using binary fetch
  const result = await fetchBinary(download.url)
  if (result?.ok) {
    const rawPath = join(paths.data.raw.samples, `${sampleId}.zip`)
    mkdirSync(dirname(rawPath), { recursive: true })
    writeFileSync(rawPath, result.data)

    const updateManifest = db.prepare(`
      UPDATE manifest
      SET status = 'fetched', fetched_at = ?, content_hash = ?
      WHERE id = ?
    `)
    updateManifest.run(Date.now(), result.contentHash, sampleId)
  }
}

async function fetchSample(resource: ManifestRow): Promise<FetchResourceResult | null> {
  // For sample code, we might need to fetch a ZIP file
  if (resource.url.endsWith('.zip')) {
    const result = await fetchWithCache(resource.url, resource.etag, resource.last_modified)
    if (!result) return null
    return {
      ok: result.ok,
      data: result.data,
      etag: result.etag,
      lastModified: result.lastModified,
      contentHash: result.contentHash,
    }
  }

  // Otherwise fetch the sample page
  const result = await fetchWithCache(resource.url, resource.etag, resource.last_modified)
  if (!result) return null

  let title: string | undefined
  if (result.ok) {
    const titleMatch = result.data.match(/<title>([^<]+)<\/title>/i)
    if (titleMatch) {
      title = titleMatch[1].replace(/ - Apple Developer$/, '').trim()
    }
  }

  return {
    ok: result.ok,
    data: result.data,
    etag: result.etag,
    lastModified: result.lastModified,
    contentHash: result.contentHash,
    title,
  }
}

function extractDocTitle(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>

  // Try common title fields
  if (typeof obj.title === 'string') return obj.title

  if (obj.metadata && typeof obj.metadata === 'object') {
    const meta = obj.metadata as Record<string, unknown>
    if (typeof meta.title === 'string') return meta.title
  }

  if (obj.identifier && typeof obj.identifier === 'object') {
    const id = obj.identifier as Record<string, unknown>
    if (typeof id.interfaceLanguage === 'string') {
      // Extract from URL-like identifier
    }
  }

  return undefined
}

function getRawPath(type: ResourceType, id: string): string {
  switch (type) {
    case 'doc':
      return join(paths.data.raw.docs, `${id}.json`)
    case 'talk':
      return join(paths.data.raw.videos, `${id}.json`)
    case 'sample':
      return join(paths.data.raw.samples, `${id}.zip`)
    case 'code_file':
      return join(paths.data.raw.samples, id)
    default:
      return join(paths.data.raw.dir, id)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
