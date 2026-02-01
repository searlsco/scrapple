import { getDb } from '../db.js';
import { discover } from '../discover/index.js';
import { fetchResources } from '../fetch/index.js';
import { normalizeResources } from '../normalize/index.js';
import { indexResources, embedContent } from '../index/index.js';
// 12 months in milliseconds
const REFRESH_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export async function sync(options, global) {
    const db = getDb();
    // Handle refresh: reset stale or all items back to 'discovered'
    if (options.refreshAll) {
        const result = db.prepare(`
      UPDATE manifest
      SET status = 'discovered'
      WHERE status != 'discovered'
    `).run();
        if (global.human)
            console.log(`Refreshing all: reset ${result.changes} resources to discovered`);
    }
    else {
        // Auto-refresh items older than 12 months
        const cutoff = Date.now() - REFRESH_AGE_MS;
        const result = db.prepare(`
      UPDATE manifest
      SET status = 'discovered'
      WHERE status != 'discovered'
        AND fetched_at IS NOT NULL
        AND fetched_at < ?
    `).run(cutoff);
        if (result.changes > 0 && global.human) {
            console.log(`Auto-refreshing: reset ${result.changes} resources older than 12 months`);
        }
    }
    if (!options.fetchOnly && !options.normalizeOnly && !options.indexOnly) {
        if (global.human)
            console.log('Discovering resources...');
        await discover(db, global);
    }
    if (!options.discoverOnly && !options.normalizeOnly && !options.indexOnly) {
        if (global.human)
            console.log('Fetching resources...');
        await fetchResources(db, global);
    }
    if (!options.discoverOnly && !options.fetchOnly && !options.indexOnly) {
        if (global.human)
            console.log('Normalizing resources...');
        await normalizeResources(db, global);
    }
    if (!options.discoverOnly && !options.fetchOnly && !options.normalizeOnly) {
        if (global.human)
            console.log('Indexing content...');
        await indexResources(db, global);
        if (global.human)
            console.log('Generating embeddings...');
        await embedContent(db, global);
    }
    if (global.human)
        console.log('Sync complete.');
}
//# sourceMappingURL=sync.js.map