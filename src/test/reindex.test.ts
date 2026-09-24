import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

// paths.ts reads the home directory at import time, so point HOME at a scratch
// directory before loading any modules that touch the real index.
const home = mkdtempSync(join(tmpdir(), 'scrapple-reindex-test-'))
process.env.HOME = home

const { getDb, closeDb } = await import('../db.js')
const { indexResources } = await import('../index/index.js')
const { paths } = await import('../paths.js')

describe('re-indexing a resource', () => {
  before(() => {
    mkdirSync(paths.data.index.dir, { recursive: true })
    mkdirSync(paths.data.normalized.docs, { recursive: true })
  })

  after(() => {
    closeDb()
    rmSync(home, { recursive: true, force: true })
  })

  it('removes the embeddings of the chunks it replaces', async () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO manifest (id, type, url, source, status, title)
      VALUES ('doc1', 'doc', 'https://example.com/doc1', 'test', 'normalized', 'Doc 1')
    `).run()
    writeFileSync(join(paths.data.normalized.docs, 'doc1.md'), '# Doc 1\n\nFirst version')
    await indexResources(db, {})

    const firstRowid = (db.prepare("SELECT rowid FROM content WHERE id = 'doc1'").get() as { rowid: number }).rowid
    const vec = db.prepare('INSERT INTO content_vec (embedding) VALUES (?)').run(
      Buffer.from(new Float32Array(384).buffer)
    )
    db.prepare('INSERT INTO content_vec_map (content_rowid, vec_rowid) VALUES (?, ?)').run(
      firstRowid,
      vec.lastInsertRowid
    )

    db.prepare("UPDATE manifest SET status = 'normalized' WHERE id = 'doc1'").run()
    writeFileSync(join(paths.data.normalized.docs, 'doc1.md'), '# Doc 1\n\nSecond version')
    await indexResources(db, {})

    const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count
    assert.strictEqual(count('SELECT COUNT(*) as count FROM content_vec'), 0)
    assert.strictEqual(count('SELECT COUNT(*) as count FROM content_vec_map'), 0)
    assert.strictEqual(count("SELECT COUNT(*) as count FROM content WHERE id = 'doc1'"), 1)
    assert.strictEqual(
      (db.prepare("SELECT status FROM manifest WHERE id = 'doc1'").get() as { status: string }).status,
      'indexed'
    )
  })
})
