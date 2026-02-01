import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildBreadcrumbs } from '../commands/show.js';
// We need to test resolveReference with a real database
// Create a minimal in-memory test
describe('resolveReference', () => {
    let db;
    let testDir;
    beforeEach(() => {
        testDir = join(tmpdir(), `scrapple-test-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        db = new Database(':memory:');
        db.exec(`
      CREATE TABLE manifest (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'discovered',
        etag TEXT,
        last_modified TEXT,
        fetched_at INTEGER,
        content_hash TEXT,
        title TEXT,
        platforms TEXT
      )
    `);
        // Insert test data
        db.prepare(`
      INSERT INTO manifest (id, type, url, source, status, title)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('18a1df7aeac96f2c', 'doc', 'https://developer.apple.com/documentation/swiftui/environmentvalues', 'doc-graph', 'indexed', 'EnvironmentValues');
        db.prepare(`
      INSERT INTO manifest (id, type, url, source, status, title)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('041d85c4df24ee54', 'doc', 'https://developer.apple.com/documentation/swiftui/environmentvalues/symbolrenderingmode', 'doc-graph', 'indexed', 'symbolRenderingMode');
    });
    afterEach(() => {
        db.close();
        rmSync(testDir, { recursive: true, force: true });
    });
    // Helper that mimics resolveReference logic
    function resolveReference(ref) {
        // Try as ID first (16 hex chars)
        if (/^[a-f0-9]{16}$/.test(ref)) {
            return db.prepare('SELECT id, url FROM manifest WHERE id = ?').get(ref);
        }
        // Convert to canonical URL
        let url;
        if (ref.startsWith('doc://')) {
            const match = ref.match(/doc:\/\/[^/]+(.*)/);
            if (!match)
                return undefined;
            url = `https://developer.apple.com${match[1]}`;
        }
        else if (ref.startsWith('/documentation/')) {
            url = `https://developer.apple.com${ref}`;
        }
        else if (ref.startsWith('https://developer.apple.com/')) {
            url = ref;
        }
        else {
            return db.prepare('SELECT id, url FROM manifest WHERE id = ?').get(ref);
        }
        // Try exact match first
        let manifest = db.prepare('SELECT id, url FROM manifest WHERE url = ?').get(url);
        if (manifest)
            return manifest;
        // Try case-insensitive match
        manifest = db.prepare('SELECT id, url FROM manifest WHERE LOWER(url) = LOWER(?)').get(url);
        return manifest;
    }
    it('resolves by ID', () => {
        const result = resolveReference('18a1df7aeac96f2c');
        assert.ok(result);
        assert.strictEqual(result.id, '18a1df7aeac96f2c');
    });
    it('resolves doc:// URI', () => {
        const result = resolveReference('doc://com.apple.SwiftUI/documentation/swiftui/environmentvalues');
        assert.ok(result);
        assert.strictEqual(result.id, '18a1df7aeac96f2c');
    });
    it('resolves doc:// URI with mixed case', () => {
        const result = resolveReference('doc://com.apple.SwiftUI/documentation/SwiftUI/EnvironmentValues');
        assert.ok(result);
        assert.strictEqual(result.id, '18a1df7aeac96f2c');
    });
    it('resolves path', () => {
        const result = resolveReference('/documentation/swiftui/environmentvalues');
        assert.ok(result);
        assert.strictEqual(result.id, '18a1df7aeac96f2c');
    });
    it('resolves full URL', () => {
        const result = resolveReference('https://developer.apple.com/documentation/swiftui/environmentvalues');
        assert.ok(result);
        assert.strictEqual(result.id, '18a1df7aeac96f2c');
    });
    it('resolves nested doc path', () => {
        const result = resolveReference('doc://com.apple.SwiftUI/documentation/swiftui/environmentvalues/symbolrenderingmode');
        assert.ok(result);
        assert.strictEqual(result.id, '041d85c4df24ee54');
    });
    it('returns undefined for non-existent reference', () => {
        const result = resolveReference('doc://com.apple.SwiftUI/documentation/nonexistent');
        assert.strictEqual(result, undefined);
    });
    it('returns undefined for non-existent ID', () => {
        const result = resolveReference('0000000000000000');
        assert.strictEqual(result, undefined);
    });
});
describe('buildBreadcrumbs', () => {
    it('builds breadcrumbs preserving original casing', () => {
        const url = 'https://developer.apple.com/documentation/SwiftUI/EnvironmentValues/symbolRenderingMode';
        const breadcrumbs = buildBreadcrumbs(url);
        assert.strictEqual(breadcrumbs.length, 2);
        assert.deepStrictEqual(breadcrumbs[0], {
            name: 'SwiftUI',
            path: '/documentation/SwiftUI'
        });
        assert.deepStrictEqual(breadcrumbs[1], {
            name: 'EnvironmentValues',
            path: '/documentation/SwiftUI/EnvironmentValues'
        });
    });
    it('builds breadcrumbs for top-level framework', () => {
        const url = 'https://developer.apple.com/documentation/SwiftUI';
        const breadcrumbs = buildBreadcrumbs(url);
        assert.strictEqual(breadcrumbs.length, 0);
    });
    it('builds breadcrumbs for nested type', () => {
        const url = 'https://developer.apple.com/documentation/SwiftUI/View/padding';
        const breadcrumbs = buildBreadcrumbs(url);
        assert.strictEqual(breadcrumbs.length, 2);
        assert.strictEqual(breadcrumbs[0].name, 'SwiftUI');
        assert.strictEqual(breadcrumbs[1].name, 'View');
    });
    it('handles non-documentation URLs', () => {
        const url = 'https://developer.apple.com/videos/play/wwdc2024/10150/';
        const breadcrumbs = buildBreadcrumbs(url);
        assert.strictEqual(breadcrumbs.length, 0);
    });
    it('preserves casing in paths', () => {
        const url = 'https://developer.apple.com/documentation/SwiftUI/View/font(_:)';
        const breadcrumbs = buildBreadcrumbs(url);
        assert.strictEqual(breadcrumbs.length, 2);
        assert.strictEqual(breadcrumbs[0].path, '/documentation/SwiftUI');
        assert.strictEqual(breadcrumbs[1].path, '/documentation/SwiftUI/View');
    });
});
//# sourceMappingURL=show.test.js.map