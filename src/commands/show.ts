import { readFileSync } from 'node:fs'
import { getDb, ManifestRow, ContentRow } from '../db.js'

interface GlobalOptions {
  human?: boolean
}

export interface Breadcrumb {
  name: string
  path: string
}

/**
 * Build breadcrumbs from a documentation URL.
 * e.g., /documentation/swiftui/environmentvalues/symbolrenderingmode
 * → [{ name: 'swiftui', path: '/documentation/swiftui' },
 *    { name: 'environmentvalues', path: '/documentation/swiftui/environmentvalues' }]
 */
export function buildBreadcrumbs(url: string): Breadcrumb[] {
  const match = url.match(/\/documentation\/(.+)$/)
  if (!match) return []

  const segments = match[1].split('/')
  // Don't include the last segment (that's the current page)
  if (segments.length <= 1) return []

  const breadcrumbs: Breadcrumb[] = []
  for (let i = 0; i < segments.length - 1; i++) {
    const path = '/documentation/' + segments.slice(0, i + 1).join('/')
    breadcrumbs.push({
      name: segments[i],
      path
    })
  }

  return breadcrumbs
}

/**
 * Resolve a reference to a manifest row.
 * Accepts:
 *   - ID: "18a1df7aeac96f2c"
 *   - doc:// URI: "doc://com.apple.SwiftUI/documentation/SwiftUI/View/padding"
 *   - Path: "/documentation/SwiftUI/View/padding"
 *   - Full URL: "https://developer.apple.com/documentation/SwiftUI/View/padding"
 */
export function resolveReference(ref: string, db: ReturnType<typeof getDb>): ManifestRow | undefined {
  // Try as ID first (16 hex chars)
  if (/^[a-f0-9]{16}$/.test(ref)) {
    return db.prepare('SELECT * FROM manifest WHERE id = ?').get(ref) as ManifestRow | undefined
  }

  // Convert to canonical URL
  let url: string

  if (ref.startsWith('doc://')) {
    // doc://com.apple.SwiftUI/documentation/SwiftUI/View/padding
    // → https://developer.apple.com/documentation/SwiftUI/View/padding
    const match = ref.match(/doc:\/\/[^/]+(.*)/)
    if (!match) return undefined
    url = `https://developer.apple.com${match[1]}`
  } else if (ref.startsWith('/documentation/')) {
    url = `https://developer.apple.com${ref}`
  } else if (ref.startsWith('https://developer.apple.com/')) {
    url = ref
  } else {
    // Unknown format, try as ID anyway
    return db.prepare('SELECT * FROM manifest WHERE id = ?').get(ref) as ManifestRow | undefined
  }

  // Try exact match first
  let manifest = db.prepare('SELECT * FROM manifest WHERE url = ?').get(url) as ManifestRow | undefined
  if (manifest) return manifest

  // Try case-insensitive match (Apple URLs have inconsistent casing)
  manifest = db.prepare('SELECT * FROM manifest WHERE LOWER(url) = LOWER(?)').get(url) as ManifestRow | undefined
  return manifest
}

export async function show(
  ref: string,
  _options: unknown,
  global: GlobalOptions
): Promise<void> {
  const db = getDb()

  const manifest = resolveReference(ref, db)

  if (!manifest) {
    console.error(`Resource not found: ${ref}`)
    process.exit(1)
  }

  const content = db
    .prepare('SELECT * FROM content WHERE id = ? ORDER BY chunk_index')
    .all(manifest.id) as ContentRow[]

  const breadcrumbs = buildBreadcrumbs(manifest.url)

  if (global.human) {
    // Breadcrumbs at top
    if (breadcrumbs.length > 0) {
      const crumbStr = breadcrumbs.map(b => b.name).join(' > ')
      console.log(`Breadcrumbs: ${crumbStr}`)
    }

    console.log(`# ${manifest.title || manifest.url}`)
    console.log(`Type: ${manifest.type}`)
    console.log(`URL: ${manifest.url}`)
    if (manifest.platforms) {
      console.log(`Platforms: ${JSON.parse(manifest.platforms).join(', ')}`)
    }
    console.log()

    if (content.length > 0 && content[0].local_path) {
      try {
        const fileContent = readFileSync(content[0].local_path, 'utf-8')
        console.log(fileContent)
      } catch {
        console.log('[Content file not found]')
      }
    } else {
      for (const chunk of content) {
        console.log(chunk.body)
      }
    }

    // Navigation at bottom
    if (breadcrumbs.length > 0) {
      console.log('\n---')
      console.log('Navigate:')
      for (const crumb of breadcrumbs) {
        console.log(`  ${crumb.name}: scrapple show ${crumb.path}`)
      }
    }
  } else {
    console.log(JSON.stringify({
      manifest,
      breadcrumbs,
      content: content.map(c => ({ title: c.title, body: c.body })),
    }))
  }
}
