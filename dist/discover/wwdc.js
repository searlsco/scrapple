import { fetchWithCache, urlToId } from '../http.js';
const WWDC_YEARS = [2024, 2023, 2022, 2021, 2020, 2019];
const WWDC_INDEX_URL = (year) => `https://developer.apple.com/videos/wwdc${year}/`;
export async function discoverWWDC(db) {
    const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'talk', ?, 'wwdc', 'discovered', ?)
  `);
    let count = 0;
    for (const year of WWDC_YEARS) {
        const indexUrl = WWDC_INDEX_URL(year);
        const result = await fetchWithCache(indexUrl);
        if (!result?.ok) {
            continue;
        }
        const videos = extractVideoLinks(result.data, year);
        for (const video of videos) {
            insert.run(urlToId(video.url), video.url, video.title);
            count++;
        }
    }
    return count;
}
function extractVideoLinks(html, year) {
    const videos = [];
    // Match video links in the format /videos/play/wwdc{year}/{id}/
    const linkRegex = /href="(\/videos\/play\/wwdc\d+\/\d+\/)"/g;
    // Extract all video URLs
    const urls = new Set();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        urls.add(`https://developer.apple.com${match[1]}`);
    }
    // For now, use URL as title placeholder - will extract real title during fetch
    for (const url of urls) {
        const sessionId = url.match(/\/(\d+)\/?$/)?.[1] || 'unknown';
        videos.push({
            url,
            title: `WWDC${year} Session ${sessionId}`,
        });
    }
    return videos;
}
//# sourceMappingURL=wwdc.js.map