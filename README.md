# scrapple - Local Apple Developer Documentation for AI Agents

[![Certified Shovelware](https://justin.searls.co/img/shovelware.svg)](https://justin.searls.co/shovelware/)

If you've ever asked an AI coding assistant about SwiftUI or UIKit, you've probably noticed it hallucinates APIs that don't exist, misremembers method signatures, and confidently cites documentation it's never seen. That's because Apple's developer documentation is locked behind JavaScript-rendered pages that don't play nice with web search or LLM training data.

Scrapple fixes this by scraping Apple's entire developer documentation—WWDC session transcripts, API references, sample code, and all—into a local SQLite database with full-text and semantic search. Your AI agent can query it instantly, offline, without burning tokens on web searches that return nothing useful.

## Install

```
brew install searlsco/tap/scrapple
```

## Quick Start

First, sync the documentation. This will take a while on the first run (we're talking "start it before bed" territory), but subsequent syncs are fast because everything is cached for up to a year:

```sh
scrapple sync -h
```

Once synced, search away:

```sh
scrapple search "SwiftUI navigation"
```

## Design Priorities

**Agent-first** — Default output is JSON for easy parsing. Add `-h` to any command for readable output.

**Offline-first** — Once synced, everything works locally. No network latency, no rate limits, no "I couldn't access that page" excuses.

**CLI-first** — Unix conventions are faster, more reliable, and more token-economical than MCP servers. Pipe it, script it, parse it.

## Commands

### `sync`

Discovers, fetches, normalizes, and indexes Apple's documentation. Idempotent—run it as often as you like. Content is cached for 12 months since Apple typically updates docs annually around WWDC.

```sh
scrapple sync -h
```

| Option | Description |
|--------|-------------|
| `--discover-only` | Only discover new resources |
| `--fetch-only` | Only fetch discovered resources |
| `--normalize-only` | Only normalize fetched content |
| `--index-only` | Only index normalized content |
| `--refresh-all` | Force re-fetch everything, ignoring cache |

### `search`

Query the documentation index. Returns JSON array of results.

```sh
scrapple search "EnvironmentValues" --type doc --limit 3
scrapple search "SwiftUI" --type talk --limit 5
scrapple search "async await" --type sample
scrapple search "ContentView" --type code_file --limit 3
```

| Option | Description |
|--------|-------------|
| `-t, --type <type>` | Filter: `doc`, `talk`, `sample`, `code_file` |
| `-l, --limit <n>` | Maximum results (default: 20) |
| `--keyword-only` | Use only FTS5 keyword search |
| `--semantic-only` | Use only vector semantic search |
| `-h, --human` | Human-readable output |

### `show`

Display full normalized content for a resource. Accepts ID, doc:// URI, path, or full URL.

```sh
# By ID
scrapple show 18a1df7aeac96f2c

# By doc:// URI (found in documentation cross-references)
scrapple show "doc://com.apple.SwiftUI/documentation/SwiftUI/EnvironmentValues/symbolRenderingMode"

# By path
scrapple show /documentation/swiftui/environmentvalues

# By full URL
scrapple show "https://developer.apple.com/documentation/swiftui/view"
```

This makes navigation hypercard-style: see a `doc://` reference in the output, pass it directly to `show`.

### `open`

Open the canonical Apple URL in your browser. Same reference formats as `show`:

```sh
scrapple open 18a1df7aeac96f2c
scrapple open /documentation/swiftui/environmentvalues
```

### `status`

Show sync progress and statistics:

```sh
scrapple status -h
```

### `reset`

Delete all scraped data and start fresh:

```sh
scrapple reset --confirm
```

## Content Types

| Type | Description |
|------|-------------|
| `doc` | API reference documentation |
| `talk` | WWDC session transcripts |
| `sample` | Sample code projects (all source files combined) |
| `code_file` | Individual source files from samples |

## For Agent Authors

Search returns JSON:

```json
[
  {
    "id": "18a1df7aeac96f2c",
    "title": "EnvironmentValues",
    "type": "doc",
    "url": "https://developer.apple.com/documentation/swiftui/environmentvalues",
    "score": 0.016,
    "snippet": "A collection of environment values propagated through a view hierarchy..."
  }
]
```

Typical workflow:
1. `scrapple search "<query>"` → find relevant docs
2. `scrapple show <id>` → retrieve full content
3. Use content to answer accurately

### CLAUDE.md / AGENTS.md

Paste into your project's `CLAUDE.md` or `.claude/AGENTS.md`:

~~~markdown
## Apple Documentation

This project uses `scrapple` for Apple developer documentation lookup.

When working with Apple frameworks (SwiftUI, UIKit, AppKit, Core Data, SwiftData, etc.):

1. **Search first**: Before answering questions about Apple APIs, search the local docs:
   ```sh
   scrapple search "your query here"
   ```

2. **Read the source**: Use `scrapple show <id>` to get full documentation content.

3. **Filter by type** when appropriate:
   ```sh
   scrapple search "navigation" --type doc
   scrapple search "SwiftUI" --type talk
   ```

Do NOT guess at Apple API signatures or behaviors. Always verify against scrapple.
~~~

### Claude Code Skill

Create `.claude/skills/apple-docs.md`:

~~~markdown
---
name: apple
description: Search Apple developer documentation
user-invocable: true
arguments:
  - name: query
    description: Search query for Apple docs
    required: true
---

<apple-docs>

Search Apple developer documentation using scrapple.

## Instructions

1. Run `scrapple search "{{query}}"` to find relevant documentation
2. Review results and select the most relevant matches
3. Use `scrapple show <id>` to retrieve full content for promising results
4. Summarize findings, citing specific APIs and documentation

</apple-docs>
~~~

## Storage

Data is stored in `~/.local/share/scrapple/`:
- `index/scrapple.sqlite` - SQLite database with manifest, content, and embeddings
- `raw/` - Original fetched content
- `normalized/` - Processed markdown/text files

## Requirements

- Node.js 20+
- Playwright (installed automatically for WWDC transcript extraction)

## License

MIT
