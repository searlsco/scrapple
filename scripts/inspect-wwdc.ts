import { chromium } from 'playwright'

async function inspectWWDCPage() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const url = 'https://developer.apple.com/videos/play/wwdc2024/10136/'
  console.log(`Fetching: ${url}`)

  await page.goto(url, { waitUntil: 'networkidle' })

  // Wait for transcript to potentially load
  await page.waitForTimeout(2000)

  // Check for transcript elements
  const transcriptSelectors = [
    '.transcript',
    '[class*="transcript"]',
    '[data-transcript]',
    '.video-transcript',
    '#transcript',
  ]

  for (const selector of transcriptSelectors) {
    const el = await page.$(selector)
    if (el) {
      const text = await el.textContent()
      console.log(`\nFound ${selector}:`)
      console.log(text?.slice(0, 500))
    }
  }

  // Look for any element containing "transcript" in class
  const allElements = await page.$$('[class*="transcript"], [class*="Transcript"]')
  console.log(`\nFound ${allElements.length} elements with "transcript" in class`)

  // Check the page structure
  const mainContent = await page.$('main, .main-content, article, .video-content')
  if (mainContent) {
    const html = await mainContent.innerHTML()
    console.log('\nMain content structure (first 1000 chars):')
    console.log(html.slice(0, 1000))
  }

  // Look for any script tags that might contain transcript data
  const scripts = await page.$$eval('script', (scripts) =>
    scripts
      .map(s => s.textContent || '')
      .filter(t => t.includes('transcript') || t.includes('Transcript'))
      .map(t => t.slice(0, 500))
  )

  if (scripts.length > 0) {
    console.log('\nFound scripts mentioning transcript:')
    scripts.forEach((s, i) => console.log(`Script ${i}: ${s}`))
  }

  await browser.close()
}

inspectWWDCPage().catch(console.error)
