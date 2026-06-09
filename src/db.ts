import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
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

-- Doc graph progress: tracks docs whose references have already been crawled
CREATE TABLE IF NOT EXISTS doc_graph_progress (
  url TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('processed', 'failed')),
  processed_at INTEGER NOT NULL,
  refs_found INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_graph_progress_status ON doc_graph_progress(status);

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

// Vector table schema (created after sqlite-vec extension is loaded)
const VECTOR_SCHEMA = `
-- Vector embeddings table for semantic search
CREATE VIRTUAL TABLE IF NOT EXISTS content_vec USING vec0(
  embedding float[384]
);

-- Mapping table to link content.rowid to content_vec.rowid
-- Note: Can't use foreign key on rowid directly, so we manage consistency manually
CREATE TABLE IF NOT EXISTS content_vec_map (
  content_rowid INTEGER PRIMARY KEY,
  vec_rowid INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vec_map_vec_rowid ON content_vec_map(vec_rowid);
`

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(paths.data.index.db)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA)
    // Load sqlite-vec extension and create vector table
    sqliteVec.load(db)
    db.exec(VECTOR_SCHEMA)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
