import Database from 'better-sqlite3'
import { fetchWithCache, urlToId } from '../http.js'

// Sample code library listing page
const SAMPLES_URL = 'https://developer.apple.com/sample-code/'

export async function discoverSamples(db: Database.Database): Promise<number> {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'sample', ?, 'sample-library', 'discovered', ?)
  `)

  let count = 0

  const result = await fetchWithCache(SAMPLES_URL)
  if (!result?.ok) {
    return 0
  }

  // Extract sample code links
  const samples = extractSampleLinks(result.data)

  for (const sample of samples) {
    insert.run(urlToId(sample.url), sample.url, sample.title)
    count++
  }

  // Also look for samples linked from discovered docs
  const docSamples = db
    .prepare(`
      SELECT DISTINCT url FROM manifest
      WHERE source IN ('wwdc', 'whats-new', 'doc-graph')
        AND url LIKE '%sample%'
    `)
    .all() as { url: string }[]

  for (const { url } of docSamples) {
    // Try to find download link for each sample
    const sampleLinks = await extractSampleDownloads(url)
    for (const link of sampleLinks) {
      insert.run(urlToId(link.url), link.url, link.title)
      count++
    }
  }

  return count
}

interface SampleLink {
  url: string
  title: string
}

function extractSampleLinks(html: string): SampleLink[] {
  const samples: SampleLink[] = []
  const seen = new Set<string>()

  // Match sample code documentation links
  const sampleRegex = /href="(\/documentation\/[^"]+)"[^>]*>([^<]*)</g
  let match
  while ((match = sampleRegex.exec(html)) !== null) {
    const path = match[1]
    const url = `https://developer.apple.com${path}`

    if (!seen.has(url) && isSampleUrl(path)) {
      seen.add(url)
      const title = match[2].trim() || extractTitleFromPath(path)
      samples.push({ url, title })
    }
  }

  return samples
}

function isSampleUrl(path: string): boolean {
  // Sample URLs often contain these patterns
  const sampleIndicators = [
    '/samplecode/',
    'sample',
    'building',
    'creating',
    'implementing',
    'using',
  ]

  const lowerPath = path.toLowerCase()
  return sampleIndicators.some(indicator => lowerPath.includes(indicator))
}

async function extractSampleDownloads(pageUrl: string): Promise<SampleLink[]> {
  const samples: SampleLink[] = []

  const result = await fetchWithCache(pageUrl)
  if (!result?.ok) return samples

  // Look for download ZIP links
  const downloadRegex = /href="([^"]+\.zip)"/g
  let match
  while ((match = downloadRegex.exec(result.data)) !== null) {
    let url = match[1]
    if (!url.startsWith('http')) {
      url = new URL(url, pageUrl).href
    }
    samples.push({
      url,
      title: url.split('/').pop()?.replace('.zip', '') || 'Sample',
    })
  }

  return samples
}

function extractTitleFromPath(path: string): string {
  const parts = path.split('/')
  const last = parts[parts.length - 1] || parts[parts.length - 2]
  return last
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
