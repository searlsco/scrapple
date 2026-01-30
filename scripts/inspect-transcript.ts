import { chromium } from 'playwright'

async function inspect() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto('https://developer.apple.com/videos/play/wwdc2024/10136/', { waitUntil: 'networkidle' })

  // Look for transcript tab/button
  console.log('Looking for transcript tab...')

  const tabSelectors = [
    '[data-supplement-id="transcript"]',
    'a[href*="transcript"]',
    'button:has-text("Transcript")',
    '[class*="transcript"]',
    'li:has-text("Transcript")',
  ]

  for (const sel of tabSelectors) {
    const el = await page.$(sel)
    if (el) {
      const text = await el.textContent()
      const visible = await el.isVisible()
      console.log(`Found ${sel}: "${text?.slice(0, 50)}", visible: ${visible}`)
    }
  }

  // Try clicking the transcript tab
  const transcriptTab = await page.$('a:has-text("Transcript"), [data-supplement-id="transcript"] a, nav a:has-text("Transcript")')
  if (transcriptTab) {
    console.log('\nClicking transcript tab...')
    await transcriptTab.click()
    await page.waitForTimeout(1000)
  }

  // Now look for transcript content
  console.log('\nLooking for transcript content...')
  const contentSelectors = [
    '.transcript',
    '[class*="transcript"]',
    '.supplement-content',
    '[class*="supplement"]',
  ]

  for (const sel of contentSelectors) {
    const els = await page.$$(sel)
    for (const el of els) {
      const visible = await el.isVisible()
      if (visible) {
        const text = await el.textContent()
        console.log(`\nVisible ${sel}:`)
        console.log(text?.slice(0, 500))
      }
    }
  }

  await browser.close()
}

inspect().catch(console.error)
