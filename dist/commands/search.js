import { getDb } from '../db.js';
import { embed } from '../embeddings.js';
/**
 * Build an FTS5 query that's more forgiving:
 * - Splits query into words
 * - Adds prefix matching (word*) for partial matches
 * - Uses OR between terms so any match works
 * - Preserves quoted phrases
 */
function buildFtsQuery(query) {
    // Handle quoted phrases - keep them intact
    const phrases = [];
    const withoutPhrases = query.replace(/"([^"]+)"/g, (_, phrase) => {
        phrases.push(`"${phrase}"`);
        return '';
    });
    // Split remaining into words and add prefix matching
    const words = withoutPhrases
        .split(/\s+/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0)
        .map(w => {
        // Don't add * to words that already have operators
        if (w.includes('*') || w.includes('"') || w.startsWith('-')) {
            return w;
        }
        // Add prefix matching for words 3+ chars
        return w.length >= 3 ? `${w}*` : w;
    });
    // Combine phrases and words with OR
    const allTerms = [...phrases, ...words];
    if (allTerms.length === 0) {
        return query; // Fallback to original
    }
    if (allTerms.length === 1) {
        return allTerms[0];
    }
    // Use OR between all terms for broader matching
    return allTerms.join(' OR ');
}
// RRF constant (standard value from IR literature)
const RRF_K = 60;
function computeRRF(ftsRank, vecRank) {
    let score = 0;
    if (ftsRank !== null) {
        score += 1 / (RRF_K + ftsRank);
    }
    if (vecRank !== null) {
        score += 1 / (RRF_K + vecRank);
    }
    return score;
}
function ftsSearch(db, query, limit, typeFilter) {
    const ftsQuery = buildFtsQuery(query);
    let sql = `
    SELECT
      c.rowid,
      c.id,
      c.title,
      c.type,
      c.url,
      snippet(content_fts, 1, '', '', '...', 32) as snippet,
      rank
    FROM content_fts
    JOIN content c ON content_fts.rowid = c.rowid
    WHERE content_fts MATCH ?
  `;
    const params = [ftsQuery];
    if (typeFilter) {
        sql += ` AND c.type = ?`;
        params.push(typeFilter);
    }
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit * 2); // Get more results for merging
    const results = db.prepare(sql).all(...params);
    const map = new Map();
    results.forEach((r, idx) => {
        map.set(r.rowid, { ...r, ftsRank: idx + 1 });
    });
    return map;
}
async function vectorSearch(db, query, limit, typeFilter) {
    const embedding = await embed(query);
    // Embeddings disabled or failed
    if (!embedding) {
        return new Map();
    }
    // Check if we have any embeddings
    const countResult = db.prepare('SELECT COUNT(*) as count FROM content_vec').get();
    if (countResult.count === 0) {
        return new Map();
    }
    // First get vector matches
    const vecSql = `
    SELECT
      rowid as vec_rowid,
      distance
    FROM content_vec
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `;
    const vecResults = db.prepare(vecSql).all(Buffer.from(embedding.buffer), limit * 4 // Get more to filter by type later
    );
    if (vecResults.length === 0) {
        return new Map();
    }
    // Map vec_rowid back to content_rowid and filter by type if needed
    const map = new Map();
    let rank = 0;
    for (const vr of vecResults) {
        // Look up the content_rowid from the mapping
        const mapping = db.prepare(`
      SELECT m.content_rowid
      FROM content_vec_map m
      JOIN content c ON m.content_rowid = c.rowid
      WHERE m.vec_rowid = ?
      ${typeFilter ? 'AND c.type = ?' : ''}
    `).get(...(typeFilter ? [vr.vec_rowid, typeFilter] : [vr.vec_rowid]));
        if (mapping) {
            rank++;
            map.set(mapping.content_rowid, { vecRank: rank, distance: vr.distance });
            if (map.size >= limit * 2)
                break;
        }
    }
    return map;
}
export async function search(query, options, global) {
    const db = getDb();
    const limit = parseInt(options.limit, 10) || 20;
    const useKeyword = !options.semanticOnly;
    const useVector = !options.keywordOnly;
    let ftsResults = new Map();
    let vecResults = new Map();
    // Run searches
    if (useKeyword) {
        ftsResults = ftsSearch(db, query, limit, options.type);
    }
    if (useVector) {
        vecResults = await vectorSearch(db, query, limit, options.type);
    }
    // Merge results using RRF
    const allRowids = new Set([...ftsResults.keys(), ...vecResults.keys()]);
    const merged = [];
    for (const rowid of allRowids) {
        const fts = ftsResults.get(rowid);
        const vec = vecResults.get(rowid);
        const score = computeRRF(fts?.ftsRank ?? null, vec?.vecRank ?? null);
        // Get content details
        let content;
        let snippet;
        if (fts) {
            content = {
                id: fts.id,
                title: fts.title,
                type: fts.type,
                url: fts.url,
                body: ''
            };
            snippet = fts.snippet;
        }
        else {
            const row = db.prepare(`
        SELECT id, title, type, url, body
        FROM content WHERE rowid = ?
      `).get(rowid);
            if (!row)
                continue;
            content = row;
            snippet = row.body.slice(0, 200) + '...';
        }
        merged.push({
            id: content.id,
            title: content.title,
            type: content.type,
            url: content.url,
            snippet,
            score,
            ftsRank: fts?.ftsRank,
            vecRank: vec?.vecRank
        });
    }
    // Sort by RRF score descending
    merged.sort((a, b) => b.score - a.score);
    // Take top results
    const results = merged.slice(0, limit);
    // Output
    if (global.human) {
        if (results.length === 0) {
            console.log('No results found.');
            return;
        }
        for (const result of results) {
            const modes = [];
            if (result.ftsRank)
                modes.push(`kw#${result.ftsRank}`);
            if (result.vecRank)
                modes.push(`vec#${result.vecRank}`);
            const modeStr = modes.length > 0 ? ` (${modes.join(', ')})` : '';
            console.log(`\n[${result.type}] ${result.title}${modeStr}`);
            console.log(`  ${result.url}`);
            console.log(`  ${result.snippet}`);
        }
        console.log(`\n${results.length} result(s)`);
    }
    else {
        console.log(JSON.stringify(results));
    }
}
//# sourceMappingURL=search.js.map