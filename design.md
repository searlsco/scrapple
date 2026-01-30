# Scrapple Design Document

A local Apple Developer Documentation scraper and search tool for accessibility.

## Decisions

### Naming & Identity

- **CLI name**: `scrapple`
- **Future distribution**: Homebrew formula via `searlsco/tap`

### Language & Stack

- **Language**: TypeScript (Node.js)
- **Browser automation**: Playwright (anticipated for many pages)
- **Database**: SQLite (manifest + FTS5 index)
- **CLI framework**: TBD (likely Commander or oclif)

### Directory Structure

```
~/.config/scrapple/          # Configuration
  config.yaml

~/.local/share/scrapple/     # Data (not checked into git)
  raw/
    docs_json/               # {doc_id}.json
    videos_html/             # {session_id}.html
    sample_zips/             # {sample_id}.zip
  normalized/
    docs_md/                 # {doc_id}.md
    transcripts_txt/         # {session_id}.txt
    samples/                 # {sample_id}/...
  index/
    scrapple.sqlite          # manifest + FTS
  logs/
```

### Git Boundary

**Checked into git:**
- Source code
- Configuration schema
- README, design docs

**Gitignored:**
- `~/.local/share/scrapple/` (all scraped data)
- User config

### Scraping Philosophy

- **Always exhaustive**: No "curated" vs "exhaustive" modes - just scrape everything
- **Incremental**: Prioritize high-likelihood sources first, skip if already populated/up-to-date
- **Resumable**: Can be interrupted and resumed; picks up where it left off
- **Idempotent**: Running multiple times produces the same result without redundant work

### Caching Strategy

- Use HTTP caching headers (ETag, Last-Modified) as primary signal
- Content hashing only where HTTP caching is insufficient
- Don't re-download the universe to check if you need to download the universe

### Sample Code

- **Must-have** for v1
- Download zips, unpack, index file contents
- Critical because Apple's docs often miss details that exist in working sample code

### CLI Output

- **Default**: Agent-friendly (structured, pipeable)
- **`--human` / `-h`**: Human-readable with formatting, colors, snippets

### Version Handling

- **Always latest**: Track the latest version of each resource
- **Per-resource versioning**: If AlarmKit hasn't been updated since iOS 16, keep it. If it's updated for iOS 27, replace with the new version.
- **No global version filter**: Don't filter by "current year's releases" - just maintain the freshest version of every topic/article/resource

### CLI Commands

```
scrapple sync          # discover + fetch + normalize + index (main command)
scrapple search <q>    # query the index
scrapple show <id>     # print normalized content
scrapple open <id>     # open canonical URL in browser
scrapple status        # show coverage stats, failures, staleness
```

## Data Model

### Manifest Table

| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | SHA-256 of canonical URL |
| type | TEXT | doc, talk, sample, code_file |
| url | TEXT | Canonical URL |
| source | TEXT | Origin (whats-new, wwdc, doc-graph, sample-library) |
| status | TEXT | discovered, fetched, normalized, indexed, failed |
| etag | TEXT | HTTP ETag for caching |
| last_modified | TEXT | HTTP Last-Modified |
| fetched_at | INTEGER | Unix timestamp |
| content_hash | TEXT | SHA-256 of content (for change detection) |
| title | TEXT | Best-effort title |
| platforms | TEXT | JSON array of platforms (e.g., ["iOS 26", "macOS 26"]) |

### Content Table (for FTS)

| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | Foreign key to manifest |
| chunk_index | INTEGER | Chunk number within document |
| title | TEXT | Document/section title |
| body | TEXT | Text content |
| type | TEXT | doc, talk, code |
| platforms | TEXT | Platforms for filtering |
| url | TEXT | Canonical URL |
| local_path | TEXT | Path to normalized file |

### FTS5 Virtual Table

```sql
CREATE VIRTUAL TABLE content_fts USING fts5(
  title,
  body,
  type,
  platforms,
  content='content',
  content_rowid='rowid'
);
```

## Data Sources

### Seeds (Priority Order)

1. **WWDC sessions**: `https://developer.apple.com/videos/wwdc2025/`
   - Transcripts, resources, linked docs/samples

2. **What's New hub**: `https://developer.apple.com/whats-new/`
   - Platform pages, documentation links, sample code, release notes

3. **Documentation graph**: Follow references from fetched docs
   - Use JSON endpoints: `/tutorials/data/documentation/{path}.json`
   - Fallback: `/documentation/{path}/data.json`

4. **Sample Code Library**: Broad enumeration for completeness

### JSON Endpoints

Primary pattern for docs:
```
https://developer.apple.com/tutorials/data/documentation/{path}.json
```

Fallback:
```
https://developer.apple.com/documentation/{path}/data.json
```

Requires browser-like User-Agent to avoid 403s.

## Fallback Strategy

1. **Endpoint fallback**: Try both JSON URL patterns
2. **Playwright fallback**: For pages that don't have JSON endpoints
3. **Schema tolerance**: Recursive text extraction if expected fields missing
4. **Discovery fallback**: If technologies.json unavailable, rely on What's New + WWDC seeds
