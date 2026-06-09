import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { discoverDocGraph } from '../discover/doc-graph.js';
import { urlToId } from '../http.js';
const SCHEMA = `
CREATE TABLE IF NOT EXISTS manifest (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('doc', 'talk', 'sample', 'code_file')),
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'fetched', 'normalized', 'indexed', 'failed')),
  etag TEXT,
  last_modified TEXT,
  fetched_at INTEGER,
  content_hash TEXT,
  title TEXT,
  platforms TEXT
);
`;
function withDb(test) {
    return async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'scrapple-doc-graph-test-'));
        const db = new Database(join(tmpDir, 'test.sqlite'));
        db.exec(SCHEMA);
        try {
            await test(db);
        }
        finally {
            db.close();
            rmSync(tmpDir, { recursive: true });
        }
    };
}
function insertDoc(db, url, title = 'Doc') {
    db.prepare(`
    INSERT INTO manifest (id, type, url, source, status, title)
    VALUES (?, 'doc', ?, 'test', 'discovered', ?)
  `).run(urlToId(url), url, title);
}
describe('discoverDocGraph', () => {
    it('persists processed docs and skips them on later runs', withDb(async (db) => {
        const originalFetch = globalThis.fetch;
        const sourceUrl = 'https://developer.apple.com/documentation/swiftui/view';
        insertDoc(db, sourceUrl, 'View');
        let fetches = 0;
        globalThis.fetch = mock.fn(() => {
            fetches++;
            return Promise.resolve(new Response(JSON.stringify({ references: {} }), { status: 200 }));
        });
        try {
            const firstCount = await discoverDocGraph(db, { now: () => 123 });
            const secondCount = await discoverDocGraph(db, { now: () => 456 });
            assert.strictEqual(firstCount, 0);
            assert.strictEqual(secondCount, 0);
            assert.strictEqual(fetches, 1);
            const progress = db.prepare('SELECT status, refs_found, processed_at FROM doc_graph_progress WHERE url = ?').get(sourceUrl);
            assert.deepStrictEqual(progress, {
                status: 'processed',
                refs_found: 0,
                processed_at: 123,
            });
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    }));
    it('inserts linked documentation discovered from references', withDb(async (db) => {
        const originalFetch = globalThis.fetch;
        const sourceUrl = 'https://developer.apple.com/documentation/swiftui/view';
        const linkedUrl = 'https://developer.apple.com/documentation/swiftui/text';
        insertDoc(db, sourceUrl, 'View');
        globalThis.fetch = mock.fn(() => {
            return Promise.resolve(new Response(JSON.stringify({
                references: {
                    text: {
                        url: '/documentation/swiftui/text',
                        title: 'Text',
                    },
                },
            }), { status: 200 }));
        });
        try {
            const count = await discoverDocGraph(db, { now: () => 123 });
            assert.strictEqual(count, 1);
            const linked = db.prepare('SELECT title, source FROM manifest WHERE url = ?').get(linkedUrl);
            assert.deepStrictEqual(linked, { title: 'Text', source: 'doc-graph' });
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    }));
    it('logs progress while processing docs', withDb(async (db) => {
        const originalFetch = globalThis.fetch;
        const logs = [];
        insertDoc(db, 'https://developer.apple.com/documentation/swiftui/view', 'View');
        insertDoc(db, 'https://developer.apple.com/documentation/uikit/uiview', 'UIView');
        globalThis.fetch = mock.fn(() => {
            return Promise.resolve(new Response(JSON.stringify({ references: {} }), { status: 200 }));
        });
        try {
            const count = await discoverDocGraph(db, {
                human: true,
                log: (message) => logs.push(message),
                progressEvery: 1,
                now: () => 123,
            });
            assert.strictEqual(count, 0);
            assert.ok(logs.some(message => message.includes('Doc graph progress: 1/2')));
            assert.ok(logs.some(message => message.includes('Doc graph progress: 2/2')));
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    }));
});
//# sourceMappingURL=discover-doc-graph.test.js.map