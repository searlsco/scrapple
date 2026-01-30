import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fetchWithCache, urlToId } from '../http.js'
import { paths } from '../paths.js'
import { ManifestRow, ResourceType } from '../db.js'

interface GlobalOptions {
  human?: boolean
}

// JSON endpoint patterns for docs
const DOC_JSON_URL = (path: string) =>
  `https://developer.apple.com/tutorials/data/documentation/${path}.json`
const DOC_JSON_FALLBACK = (path: string) =>
  `https://developer.apple.com/documentation/${path}/data.json`

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
      LIMIT 100
    `)
    .all() as ManifestRow[]

  log(`Fetching ${toFetch.length} resources...`)

  const updateManifest = db.prepare(`
    UPDATE manifest
    SET status = ?, etag = ?, last_modified = ?, fetched_at = ?, content_hash = ?, title = ?
    WHERE id = ?
  `)

  let fetched = 0
  let failed = 0
  let skipped = 0

  for (const resource of toFetch) {
    try {
      const result = await fetchResource(resource)

      if (result === null) {
        // Not modified
        skipped++
        continue
      }

      if (result.ok) {
        // Save raw content
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
    } catch (error) {
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

    // Rate limiting
    await sleep(100)
  }

  log(`Fetched: ${fetched}, Failed: ${failed}, Skipped: ${skipped}`)
}

interface FetchResourceResult {
  ok: boolean
  data: string
  etag?: string
  lastModified?: string
  contentHash: string
  title?: string
}

async function fetchResource(resource: ManifestRow): Promise<FetchResourceResult | null> {
  if (resource.type === 'doc') {
    return fetchDoc(resource)
  } else if (resource.type === 'talk') {
    return fetchTalk(resource)
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

async function fetchDoc(resource: ManifestRow): Promise<FetchResourceResult | null> {
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
  if (result.ok) {
    try {
      const data = JSON.parse(result.data)
      title = extractDocTitle(data)
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

async function fetchTalk(resource: ManifestRow): Promise<FetchResourceResult | null> {
  // WWDC videos have a specific URL pattern
  const result = await fetchWithCache(resource.url, resource.etag, resource.last_modified)
  if (!result) return null

  let title: string | undefined
  if (result.ok) {
    // Extract title from HTML
    const titleMatch = result.data.match(/<title>([^<]+)<\/title>/i)
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/ - WWDC\d+ - Videos - Apple Developer$/, '')
        .replace(/ - Apple Developer$/, '')
        .trim()
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
      return join(paths.data.raw.videos, `${id}.html`)
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
