import { chromium, Browser } from 'playwright'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

let browser: Browser | null = null
const CONCURRENCY = 5 // Number of parallel page fetches
export const WWDC_NAVIGATION_WAIT_UNTIL = 'load'

// Playwright pins an exact browser revision, so upgrading it leaves the cached
// browser stale. Its installer is a fast no-op when the revision is present, so
// run it before a sync spends time discovering and fetching everything else.
// Installer output goes to stderr to keep JSON mode's stdout clean.
export function ensureBrowserInstalled(): void {
  const cli = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js')
  const result = spawnSync(process.execPath, [cli, 'install', '--only-shell', 'chromium'], {
    stdio: ['ignore', 2, 2],
  })
  if (result.status !== 0) {
    throw new Error(`Failed to install Playwright Chromium (exit ${result.status ?? result.signal})`)
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close()
    browser = null
  }
}

// Batch fetch multiple URLs in parallel
export async function fetchWWDCBatch(
  urls: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, WWDCContent | null>> {
  const results = new Map<string, WWDCContent | null>()
  let completed = 0

  // Process in batches of CONCURRENCY
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const result = await fetchWWDCWithPlaywright(url)
        completed++
        onProgress?.(completed, urls.length)
        return { url, result }
      })
    )

    for (const { url, result } of batchResults) {
      results.set(url, result)
    }
  }

  return results
}

export interface WWDCContent {
  title: string
  transcript: string
  description: string
  resources: string[]
}

export async function fetchWWDCWithPlaywright(url: string): Promise<WWDCContent | null> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    // Apple video pages keep background requests active after usable content loads.
    await page.goto(url, { waitUntil: WWDC_NAVIGATION_WAIT_UNTIL, timeout: 30000 })

    // Extract title first
    const title = await page.$eval(
      'h1, .video-title, title',
      (el) => el.textContent?.trim() || ''
    ).catch(() => '')

    // Extract description from the supplement section
    const description = await page.$eval(
      '[class*="supplement"] p, .video-description, .abstract',
      (el) => el.textContent?.trim() || ''
    ).catch(() => '')

    // Click the transcript tab to reveal transcript content (if it exists and is visible)
    const transcriptTab = await page.$('[data-supplement-id="transcript"]')
    if (transcriptTab) {
      const isVisible = await transcriptTab.isVisible()
      if (isVisible) {
        await transcriptTab.click().catch(() => {})
        await page.waitForTimeout(500) // Wait for content to load
      }
    }

    // Extract transcript - the function runs in browser context
    const transcript = await page.$eval('.transcript', (el) => {
      const text = el.textContent || ''

      // Find where the actual transcript starts (first timestamp)
      const firstTimestamp = text.match(/\d+:\d+/)
      if (firstTimestamp) {
        const startIndex = text.indexOf(firstTimestamp[0])
        let transcriptText = text.slice(startIndex)

        // Format: timestamps are like "0:06" directly followed by text
        // Convert to "0:06 Text..." format with paragraph breaks
        transcriptText = transcriptText
          .replace(/(\d+:\d+)([A-Z])/g, '\n\n$1 $2') // Add space after timestamp
          .replace(/(\d+:\d+)([a-z])/g, '\n\n$1 $2') // Handle lowercase too
          .replace(/^\n+/, '') // Remove leading newlines
          .trim()

        return transcriptText
      }

      return text.trim()
    }).catch(() => '')

    // Extract resources/related links
    const resources = await page.$$eval(
      '.resources a, .related-content a, [class*="resource"] a',
      (links) => links.map((a) => a.textContent?.trim() || '').filter(Boolean)
    ).catch(() => [] as string[])

    return {
      title: title.replace(/ - WWDC\d+ - Videos - Apple Developer$/, '').trim(),
      transcript,
      description,
      resources,
    }
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error)
    return null
  } finally {
    await page.close()
  }
}
