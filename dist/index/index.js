import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { paths } from '../paths.js';
import { embedBatch, EMBEDDINGS_AVAILABLE } from '../embeddings.js';
// Maximum chunk size for FTS indexing (in characters)
const MAX_CHUNK_SIZE = 10000;
export async function indexResources(db, global) {
    const log = (msg) => {
        if (global.human)
            console.log(`  ${msg}`);
    };
    // Get all normalized resources that need indexing
    const toIndex = db
        .prepare(`
      SELECT * FROM manifest
      WHERE status = 'normalized'
    `)
        .all();
    const total = toIndex.length;
    log(`Indexing ${total} resources...`);
    const updateManifest = db.prepare(`
    UPDATE manifest SET status = ? WHERE id = ?
  `);
    const insertContent = db.prepare(`
    INSERT OR REPLACE INTO content (id, chunk_index, title, body, type, platforms, url, local_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const deleteContent = db.prepare(`
    DELETE FROM content WHERE id = ?
  `);
    let indexed = 0;
    let failed = 0;
    for (const resource of toIndex) {
        try {
            const normalizedPath = getNormalizedPath(resource.type, resource.id, resource.url);
            if (!existsSync(normalizedPath)) {
                updateManifest.run('failed', resource.id);
                failed++;
                continue;
            }
            const content = readFileSync(normalizedPath, 'utf-8');
            // Clear existing content for this resource
            deleteContent.run(resource.id);
            // Chunk and index
            const chunks = chunkContent(content);
            const title = resource.title || extractFirstLine(content) || 'Untitled';
            for (let i = 0; i < chunks.length; i++) {
                insertContent.run(resource.id, i, title, chunks[i], resource.type, resource.platforms, resource.url, normalizedPath);
            }
            updateManifest.run('indexed', resource.id);
            indexed++;
        }
        catch {
            updateManifest.run('failed', resource.id);
            failed++;
        }
        // Progress logging
        const processed = indexed + failed;
        if (processed % 50 === 0 || processed === total) {
            log(`  Progress: ${processed}/${total} (${indexed} indexed, ${failed} failed)`);
        }
    }
    log(`Index complete: ${indexed} indexed, ${failed} failed`);
}
function chunkContent(content) {
    if (content.length <= MAX_CHUNK_SIZE) {
        return [content];
    }
    const chunks = [];
    let remaining = content;
    while (remaining.length > 0) {
        if (remaining.length <= MAX_CHUNK_SIZE) {
            chunks.push(remaining);
            break;
        }
        // Find a good break point (paragraph, sentence, or word)
        const breakPoint = findBreakPoint(remaining, MAX_CHUNK_SIZE);
        chunks.push(remaining.slice(0, breakPoint).trim());
        remaining = remaining.slice(breakPoint).trim();
    }
    return chunks;
}
function findBreakPoint(text, maxLength) {
    // Try to break at a paragraph
    const paragraphBreak = text.lastIndexOf('\n\n', maxLength);
    if (paragraphBreak > maxLength * 0.5) {
        return paragraphBreak + 2;
    }
    // Try to break at a line
    const lineBreak = text.lastIndexOf('\n', maxLength);
    if (lineBreak > maxLength * 0.5) {
        return lineBreak + 1;
    }
    // Try to break at a sentence
    const sentenceBreak = Math.max(text.lastIndexOf('. ', maxLength), text.lastIndexOf('! ', maxLength), text.lastIndexOf('? ', maxLength));
    if (sentenceBreak > maxLength * 0.5) {
        return sentenceBreak + 2;
    }
    // Try to break at a word
    const wordBreak = text.lastIndexOf(' ', maxLength);
    if (wordBreak > maxLength * 0.5) {
        return wordBreak + 1;
    }
    // Hard break at maxLength
    return maxLength;
}
function extractFirstLine(content) {
    const firstLine = content.split('\n')[0];
    if (!firstLine)
        return null;
    // Remove markdown heading markers
    return firstLine.replace(/^#+\s*/, '').trim() || null;
}
/**
 * Parses a code_file URL (e.g., "https://...zip#path/to/file.swift")
 * and returns the normalized path where the file was extracted.
 */
export function getCodeFileNormalizedPath(url) {
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1)
        return '';
    const sampleUrl = url.slice(0, hashIndex);
    const filePath = url.slice(hashIndex + 1);
    // Hash the sample URL to get the sample_id (same logic as urlToId in http.ts)
    const sampleId = createHash('sha256').update(sampleUrl).digest('hex').slice(0, 16);
    return join(paths.data.normalized.samples, sampleId, filePath);
}
function getNormalizedPath(type, id, url) {
    switch (type) {
        case 'doc':
            return join(paths.data.normalized.docs, `${id}.md`);
        case 'talk':
            return join(paths.data.normalized.transcripts, `${id}.txt`);
        case 'sample':
            return join(paths.data.normalized.samples, `${id}.md`);
        case 'code_file':
            return url ? getCodeFileNormalizedPath(url) : join(paths.data.normalized.samples, id);
        default:
            return join(paths.data.normalized.dir, id);
    }
}
export async function embedContent(db, global) {
    const log = (msg) => {
        if (global.human)
            console.log(`  ${msg}`);
    };
    if (!EMBEDDINGS_AVAILABLE) {
        log('Embeddings disabled (dependency issues)');
        return;
    }
    // Get content chunks that don't have embeddings yet
    const toEmbed = db
        .prepare(`
      SELECT c.rowid, c.title, c.body
      FROM content c
      LEFT JOIN content_vec_map m ON c.rowid = m.content_rowid
      WHERE m.content_rowid IS NULL
    `)
        .all();
    const total = toEmbed.length;
    if (total === 0) {
        log('All content already has embeddings');
        return;
    }
    log(`Generating embeddings for ${total} chunks...`);
    const insertVector = db.prepare(`
    INSERT INTO content_vec (embedding)
    VALUES (?)
  `);
    const insertMapping = db.prepare(`
    INSERT INTO content_vec_map (content_rowid, vec_rowid)
    VALUES (?, ?)
  `);
    // Process in batches
    const BATCH_SIZE = 32;
    let processed = 0;
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
        const batch = toEmbed.slice(i, i + BATCH_SIZE);
        const texts = batch.map(row => `${row.title}\n\n${row.body}`);
        const embeddings = await embedBatch(texts);
        for (let j = 0; j < batch.length; j++) {
            const emb = embeddings[j];
            if (!emb)
                continue; // Skip if embedding failed
            const result = insertVector.run(Buffer.from(emb.buffer));
            const vecRowid = result.lastInsertRowid;
            insertMapping.run(batch[j].rowid, vecRowid);
        }
        processed += batch.length;
        if (processed % 100 === 0 || processed === total) {
            log(`  Progress: ${processed}/${total}`);
        }
    }
    log(`Embedding complete: ${processed} chunks embedded`);
}
//# sourceMappingURL=index.js.map