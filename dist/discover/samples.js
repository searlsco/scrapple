import { fetchWithCache, urlToId } from '../http.js';
const SAMPLECODE_JSON_URL = 'https://developer.apple.com/tutorials/data/documentation/samplecode.json';
export async function discoverSamples(db) {
    const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'sample', ?, 'sample-library', 'discovered', ?)
  `);
    const result = await fetchWithCache(SAMPLECODE_JSON_URL);
    if (!result?.ok) {
        return 0;
    }
    let count = 0;
    try {
        const data = JSON.parse(result.data);
        const refs = data.references || {};
        for (const ref of Object.values(refs)) {
            if (ref.url && ref.url.startsWith('/documentation/')) {
                const url = `https://developer.apple.com${ref.url}`;
                const title = ref.title || extractTitleFromPath(ref.url);
                insert.run(urlToId(url), url, title);
                count++;
            }
        }
    }
    catch {
        // JSON parse failed
    }
    return count;
}
function extractTitleFromPath(path) {
    const parts = path.split('/');
    const last = parts[parts.length - 1] || parts[parts.length - 2];
    return last
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
//# sourceMappingURL=samples.js.map