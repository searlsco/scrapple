import { chromium } from 'playwright';
let browser = null;
const CONCURRENCY = 5; // Number of parallel page fetches
export const WWDC_NAVIGATION_WAIT_UNTIL = 'load';
export async function getBrowser() {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}
export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}
// Batch fetch multiple URLs in parallel
export async function fetchWWDCBatch(urls, onProgress) {
    const results = new Map();
    let completed = 0;
    // Process in batches of CONCURRENCY
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batch = urls.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (url) => {
            const result = await fetchWWDCWithPlaywright(url);
            completed++;
            onProgress?.(completed, urls.length);
            return { url, result };
        }));
        for (const { url, result } of batchResults) {
            results.set(url, result);
        }
    }
    return results;
}
export async function fetchWWDCWithPlaywright(url) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        // Apple video pages keep background requests active after usable content loads.
        await page.goto(url, { waitUntil: WWDC_NAVIGATION_WAIT_UNTIL, timeout: 30000 });
        // Extract title first
        const title = await page.$eval('h1, .video-title, title', (el) => el.textContent?.trim() || '').catch(() => '');
        // Extract description from the supplement section
        const description = await page.$eval('[class*="supplement"] p, .video-description, .abstract', (el) => el.textContent?.trim() || '').catch(() => '');
        // Click the transcript tab to reveal transcript content (if it exists and is visible)
        const transcriptTab = await page.$('[data-supplement-id="transcript"]');
        if (transcriptTab) {
            const isVisible = await transcriptTab.isVisible();
            if (isVisible) {
                await transcriptTab.click().catch(() => { });
                await page.waitForTimeout(500); // Wait for content to load
            }
        }
        // Extract transcript - the function runs in browser context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transcript = await page.$eval('.transcript', (el) => {
            const text = el.textContent || '';
            // Find where the actual transcript starts (first timestamp)
            const firstTimestamp = text.match(/\d+:\d+/);
            if (firstTimestamp) {
                const startIndex = text.indexOf(firstTimestamp[0]);
                let transcriptText = text.slice(startIndex);
                // Format: timestamps are like "0:06" directly followed by text
                // Convert to "0:06 Text..." format with paragraph breaks
                transcriptText = transcriptText
                    .replace(/(\d+:\d+)([A-Z])/g, '\n\n$1 $2') // Add space after timestamp
                    .replace(/(\d+:\d+)([a-z])/g, '\n\n$1 $2') // Handle lowercase too
                    .replace(/^\n+/, '') // Remove leading newlines
                    .trim();
                return transcriptText;
            }
            return text.trim();
        }).catch(() => '');
        // Extract resources/related links
        const resources = await page.$$eval('.resources a, .related-content a, [class*="resource"] a', (links) => links.map((a) => a.textContent?.trim() || '').filter(Boolean)).catch(() => []);
        return {
            title: title.replace(/ - WWDC\d+ - Videos - Apple Developer$/, '').trim(),
            transcript,
            description,
            resources,
        };
    }
    catch (error) {
        console.error(`Failed to fetch ${url}:`, error);
        return null;
    }
    finally {
        await page.close();
    }
}
//# sourceMappingURL=playwright.js.map