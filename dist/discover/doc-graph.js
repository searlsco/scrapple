import { fetchWithCache, urlToId } from '../http.js';
// Primary JSON endpoint pattern
const DOC_JSON_URL = (path) => `https://developer.apple.com/tutorials/data/documentation/${path}.json`;
// Fallback pattern
const DOC_JSON_FALLBACK = (path) => `https://developer.apple.com/documentation/${path}/data.json`;
export async function discoverDocGraph(db) {
    const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'doc', ?, 'doc-graph', 'discovered', ?)
  `);
    // Get all discovered docs that haven't been processed for refs yet
    const discovered = db
        .prepare(`
      SELECT url FROM manifest
      WHERE type = 'doc' AND status IN ('discovered', 'fetched', 'normalized', 'indexed')
    `)
        .all();
    let count = 0;
    const processed = new Set();
    for (const { url } of discovered) {
        if (processed.has(url))
            continue;
        processed.add(url);
        const refs = await extractReferences(url);
        for (const ref of refs) {
            if (!processed.has(ref.url)) {
                insert.run(urlToId(ref.url), ref.url, ref.title);
                count++;
            }
        }
    }
    return count;
}
async function extractReferences(docUrl) {
    const refs = [];
    // Extract path from URL
    const match = docUrl.match(/\/documentation\/(.+?)(?:\/)?$/);
    if (!match)
        return refs;
    const path = match[1];
    // Try primary endpoint first
    let result = await fetchWithCache(DOC_JSON_URL(path));
    // Fallback to alternative endpoint
    if (!result?.ok) {
        result = await fetchWithCache(DOC_JSON_FALLBACK(path));
    }
    if (!result?.ok)
        return refs;
    try {
        const data = JSON.parse(result.data);
        extractRefsFromJson(data, refs);
    }
    catch {
        // JSON parse failed, skip
    }
    return refs;
}
function extractRefsFromJson(data, refs) {
    if (!data || typeof data !== 'object')
        return;
    const obj = data;
    // Look for references (can be array or object)
    if (obj.references && typeof obj.references === 'object') {
        const refValues = Array.isArray(obj.references)
            ? obj.references
            : Object.values(obj.references);
        for (const ref of refValues) {
            if (ref &&
                typeof ref === 'object' &&
                'url' in ref &&
                typeof ref.url === 'string' &&
                ref.url.startsWith('/documentation/')) {
                const url = `https://developer.apple.com${ref.url}`;
                const title = ref.title || extractTitleFromPath(ref.url);
                refs.push({ url, title });
            }
        }
    }
    // Look for seeAlsoSections
    if (Array.isArray(obj.seeAlsoSections)) {
        for (const section of obj.seeAlsoSections) {
            if (section && typeof section === 'object' && Array.isArray(section.identifiers)) {
                // These are identifiers that reference other docs
                // They'll be resolved in a separate pass
            }
        }
    }
    // Recursively check nested objects
    for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                extractRefsFromJson(item, refs);
            }
        }
        else if (typeof value === 'object') {
            extractRefsFromJson(value, refs);
        }
    }
}
function extractTitleFromPath(path) {
    const parts = path.split('/');
    const last = parts[parts.length - 1] || parts[parts.length - 2];
    return last
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
//# sourceMappingURL=doc-graph.js.map