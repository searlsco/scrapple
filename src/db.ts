import Database from 'better-sqlite3'
import { paths } from './paths.js'

export type ResourceType = 'doc' | 'talk' | 'sample' | 'code_file'
export type ResourceStatus = 'discovered' | 'fetched' | 'normalized' | 'indexed' | 'failed'

export interface ManifestRow {
  id: string
  type: ResourceType
  url: string
  source: string
  status: ResourceStatus
  etag: string | null
  last_modified: string | null
  fetched_at: number | null
  content_hash: string | null
  title: string | null
  platforms: string | null // JSON array
}

export interface ContentRow {
  id: string
  chunk_index: number
  title: string
  body: string
  type: ResourceType
  platforms: string | null
  url: string
  local_path: string
}

const SCHEMA = `
-- Manifest table: tracks all discovered resources
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

CREATE INDEX IF NOT EXISTS idx_manifest_status ON manifest(status);
CREATE INDEX IF NOT EXISTS idx_manifest_type ON manifest(type);
CREATE INDEX IF NOT EXISTS idx_manifest_source ON manifest(source);

-- Content table: stores normalized text for FTS
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

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
  title,
  body,
  type,
  platforms,
  content='content',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS content_ai AFTER INSERT ON content BEGIN
  INSERT INTO content_fts(rowid, title, body, type, platforms)
  VALUES (NEW.rowid, NEW.title, NEW.body, NEW.type, NEW.platforms);
END;

CREATE TRIGGER IF NOT EXISTS content_ad AFTER DELETE ON content BEGIN
  INSERT INTO content_fts(content_fts, rowid, title, body, type, platforms)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.type, OLD.platforms);
END;

CREATE TRIGGER IF NOT EXISTS content_au AFTER UPDATE ON content BEGIN
  INSERT INTO content_fts(content_fts, rowid, title, body, type, platforms)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.type, OLD.platforms);
  INSERT INTO content_fts(rowid, title, body, type, platforms)
  VALUES (NEW.rowid, NEW.title, NEW.body, NEW.type, NEW.platforms);
END;
`

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(paths.data.index.db)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
