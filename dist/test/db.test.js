import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
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

CREATE TABLE IF NOT EXISTS content (
  id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  platforms TEXT,
  url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  PRIMARY KEY (id, chunk_index),
  FOREIGN KEY (id) REFERENCES manifest(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
  title,
  body,
  type,
  platforms,
  content='content',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS content_ai AFTER INSERT ON content BEGIN
  INSERT INTO content_fts(rowid, title, body, type, platforms)
  VALUES (NEW.rowid, NEW.title, NEW.body, NEW.type, NEW.platforms);
END;
`;
describe('Database schema', () => {
    let db;
    let tmpDir;
    before(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'scrapple-test-'));
        db = new Database(join(tmpDir, 'test.sqlite'));
        db.pragma('foreign_keys = ON');
        db.exec(SCHEMA);
    });
    after(() => {
        db.close();
        rmSync(tmpDir, { recursive: true });
    });
    it('creates manifest table with correct constraints', () => {
        const insert = db.prepare(`
      INSERT INTO manifest (id, type, url, source, title)
      VALUES (?, ?, ?, ?, ?)
    `);
        insert.run('test-id-1', 'doc', 'https://example.com/doc1', 'test', 'Test Doc');
        const row = db.prepare('SELECT * FROM manifest WHERE id = ?').get('test-id-1');
        assert.strictEqual(row.type, 'doc');
        assert.strictEqual(row.status, 'discovered');
    });
    it('enforces unique URL constraint', () => {
        const insert = db.prepare(`
      INSERT INTO manifest (id, type, url, source, title)
      VALUES (?, ?, ?, ?, ?)
    `);
        insert.run('test-id-2', 'doc', 'https://example.com/unique', 'test', 'Test');
        assert.throws(() => {
            insert.run('test-id-3', 'doc', 'https://example.com/unique', 'test', 'Test');
        }, /UNIQUE constraint failed/);
    });
    it('enforces type check constraint', () => {
        const insert = db.prepare(`
      INSERT INTO manifest (id, type, url, source, title)
      VALUES (?, ?, ?, ?, ?)
    `);
        assert.throws(() => {
            insert.run('test-id-4', 'invalid-type', 'https://example.com/invalid', 'test', 'Test');
        }, /CHECK constraint failed/);
    });
    it('indexes content into FTS', () => {
        // Insert manifest entry first
        db.prepare(`
      INSERT INTO manifest (id, type, url, source, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('fts-test', 'doc', 'https://example.com/fts', 'test', 'FTS Test');
        // Insert content
        db.prepare(`
      INSERT INTO content (id, chunk_index, title, body, type, platforms, url, local_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('fts-test', 0, 'SwiftUI Guide', 'Learn how to build user interfaces with SwiftUI framework', 'doc', null, 'https://example.com/fts', '/path/to/file');
        // Search using FTS
        const results = db.prepare(`
      SELECT c.* FROM content_fts
      JOIN content c ON content_fts.rowid = c.rowid
      WHERE content_fts MATCH 'SwiftUI'
    `).all();
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].title, 'SwiftUI Guide');
    });
    it('FTS search returns ranked results', () => {
        // Insert more content
        db.prepare(`
      INSERT INTO manifest (id, type, url, source, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('fts-test-2', 'doc', 'https://example.com/fts2', 'test', 'FTS Test 2');
        db.prepare(`
      INSERT INTO content (id, chunk_index, title, body, type, platforms, url, local_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('fts-test-2', 0, 'UIKit Guide', 'UIKit is Apple older UI framework', 'doc', null, 'https://example.com/fts2', '/path');
        // Search for both
        const results = db.prepare(`
      SELECT c.title, rank FROM content_fts
      JOIN content c ON content_fts.rowid = c.rowid
      WHERE content_fts MATCH 'framework'
      ORDER BY rank
    `).all();
        assert.strictEqual(results.length, 2);
        // Both should match 'framework'
        assert.ok(results.some(r => r.title === 'SwiftUI Guide'));
        assert.ok(results.some(r => r.title === 'UIKit Guide'));
    });
});
//# sourceMappingURL=db.test.js.map