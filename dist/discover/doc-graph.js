import { fetchWithCache, urlToId } from '../http.js';
// Primary JSON endpoint pattern
const DOC_JSON_URL = (path) => `https://developer.apple.com/tutorials/data/documentation/${path}.json`;
// Fallback pattern
const DOC_JSON_FALLBACK = (path) => `https://developer.apple.com/documentation/${path}/data.json`;
const DEFAULT_PROGRESS_EVERY = 100;
export async function discoverDocGraph(db, options = {}) {
    ensureProgressTable(db);
    const log = (message) => {
        if (!options.human)
            return;
        if (options.log) {
            options.log(message);
        }
        else {
            console.log(`    ${message}`);
        }
    };
    const progressEvery = options.progressEvery ?? DEFAULT_PROGRESS_EVERY;
    const now = options.now ?? Date.now;
    const insert = db.prepare(`
    INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'doc', ?, 'doc-graph', 'discovered', ?)
  `);
    const markProgress = db.prepare(`
    INSERT INTO doc_graph_progress (url, status, processed_at, refs_found, error)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      status = excluded.status,
      processed_at = excluded.processed_at,
      refs_found = excluded.refs_found,
      error = excluded.error
  `);
    const skipped = db
        .prepare(`
      SELECT COUNT(*) as count
      FROM manifest m
      JOIN doc_graph_progress p ON p.url = m.url
      WHERE m.type = 'doc'
        AND m.status IN ('discovered', 'fetched', 'normalized', 'indexed')
        AND p.status = 'processed'
    `)
        .get();
    // Get docs that haven't had their references successfully processed yet.
    const pending = db
        .prepare(`
      SELECT m.url FROM manifest m
      LEFT JOIN doc_graph_progress p
        ON p.url = m.url AND p.status = 'processed'
      WHERE m.type = 'doc'
        AND m.status IN ('discovered', 'fetched', 'normalized', 'indexed')
        AND p.url IS NULL
      ORDER BY m.url
    `)
        .all();
    let count = 0;
    let processed = 0;
    let failed = 0;
    const seenThisRun = new Set();
    log(`Doc graph: ${skipped.count} already processed, ${pending.length} pending`);
    for (const { url } of pending) {
        if (seenThisRun.has(url))
            continue;
        seenThisRun.add(url);
        const result = await extractReferences(url);
        processed++;
        if (result.ok) {
            let inserted = 0;
            for (const ref of result.refs) {
                if (!seenThisRun.has(ref.url)) {
                    const insertResult = insert.run(urlToId(ref.url), ref.url, ref.title);
                    inserted += insertResult.changes;
                }
            }
            count += inserted;
            markProgress.run(url, 'processed', now(), result.refs.length, null);
        }
        else {
            failed++;
            markProgress.run(url, 'failed', now(), 0, result.error ?? 'Unknown error');
        }
        if (progressEvery > 0 && (processed % progressEvery === 0 || processed === pending.length)) {
            log(`Doc graph progress: ${processed}/${pending.length} processed, ${count} linked, ${failed} failed`);
        }
    }
    return count;
}
function ensureProgressTable(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS doc_graph_progress (
      url TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('processed', 'failed')),
      processed_at INTEGER NOT NULL,
      refs_found INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_doc_graph_progress_status ON doc_graph_progress(status);
  `);
}
async function extractReferences(docUrl) {
    const refs = [];
    // Extract path from URL
    const match = docUrl.match(/\/documentation\/(.+?)(?:\/)?$/);
    if (!match)
        return { ok: true, refs };
    const path = match[1];
    // Try primary endpoint first
    let result = await fetchWithCache(DOC_JSON_URL(path));
    // Fallback to alternative endpoint
    if (!result?.ok) {
        result = await fetchWithCache(DOC_JSON_FALLBACK(path));
    }
    if (!result?.ok) {
        return {
            ok: false,
            refs,
            error: result ? `HTTP ${result.status}` : 'Not modified',
        };
    }
    try {
        const data = JSON.parse(result.data);
        extractRefsFromJson(data, refs);
    }
    catch (error) {
        return {
            ok: false,
            refs,
            error: error instanceof Error ? error.message : 'JSON parse failed',
        };
    }
    return { ok: true, refs };
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