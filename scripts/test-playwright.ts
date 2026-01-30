import { fetchWWDCWithPlaywright, closeBrowser } from '../src/fetch/playwright.js'

async function test() {
  const urls = [
    'https://developer.apple.com/videos/play/wwdc2024/10136/', // What's new in Swift 2024
    'https://developer.apple.com/videos/play/wwdc2021/10132/', // Meet async/await in Swift
    'https://developer.apple.com/videos/play/wwdc2019/402/',   // What's New in Swift (2019)
  ]

  for (const url of urls) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Testing: ${url}`)

    const result = await fetchWWDCWithPlaywright(url)

    if (result) {
      console.log('Title:', result.title)
      console.log('Description:', result.description?.slice(0, 100) || '(none)')
      console.log('Transcript length:', result.transcript?.length || 0)
      console.log('Transcript preview:', result.transcript?.slice(0, 200) || '(none)')
    } else {
      console.log('Failed to fetch')
    }
  }

  await closeBrowser()
}

test().catch(console.error)
