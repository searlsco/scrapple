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

### `prune`

Delete raw sample archives while keeping normalized content and the search index:

```sh
scrapple prune -h
scrapple prune --dry-run -h
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

Here's the Claude skill I use, which incorporates web search, scrapple, and Xcode MCP

Create `.claude/skills/apple-docs/SKILL.md`:

~~~md
---
name: apple-docs
description: >
  Search Apple developer documentation, WWDC transcripts, and sample code.
  Combines three sources: Scrapple (130K+ offline resources), Xcode MCP
  DocumentationSearch (rich semantic snippets), and web search (recent content,
  forums, release notes). Use when you need to look up an API, understand
  framework behavior, find WWDC session context, or see Apple's sample code.
argument-hint: "<query> [--type doc|talk|sample|code_file] [--frameworks F1,F2]"
allowed-tools:
  - Bash
  - mcp__xcode__DocumentationSearch
  - WebSearch
  - WebFetch
---

# apple-docs

You are a research assistant with access to Apple's developer documentation
through three complementary sources:

1. **Scrapple** (local CLI) — 114K+ doc pages, 1,058 WWDC transcripts, 601
   sample code projects, 14.5K code files. Full-text + semantic search. Can
   retrieve complete doc pages. Best for WWDC talks, sample code, and deep
   reading.

2. **Xcode MCP DocumentationSearch** — Apple's own semantic search with rich
   snippets including declarations, parameters, and discussion sections. Fast,
   no shell needed. Best for quick API lookups and when you need declaration
   details.

3. **Web search** — For content not in the local index: recent release notes,
   Apple Developer Forums threads, Swift Evolution proposals, blog posts, and
   anything newer than the last Scrapple sync.

Your job is to find the answer and present it clearly. You are not here to
summarize search results — you are here to **read the actual documentation**
and give an accurate, citation-backed answer.

## What to research

Research `$ARGUMENTS`.

If `$ARGUMENTS` is empty, ask the user what they want to look up.

If `$ARGUMENTS` includes `--type`, pass that flag through to scrapple.
If `$ARGUMENTS` includes `--frameworks`, pass those to DocumentationSearch.
Otherwise, choose the best source(s) yourself based on the query.

---

## Which tool to use when

Pick the right tool for the job. Often you'll use 2-3 in combination.

| Query type | Primary tool | Why |
|---|---|---|
| API declaration / parameters | **Xcode MCP** | Rich snippets with full declarations |
| API behavior / discussion | **Scrapple** `show` | Full page content, not just snippets |
| WWDC session / best practices | **Scrapple** `--type talk` | Only source with transcripts |
| Sample code / patterns | **Scrapple** `--type sample` or `code_file` | Only source with Apple samples |
| Recent / bleeding-edge APIs | **Web search** | Scrapple index may lag new releases |
| Forums / common pitfalls | **Web search** | Community knowledge, workarounds |
| Broad conceptual question | **All three** | Triangulate for best answer |

**Run searches in parallel when possible.** Scrapple and DocumentationSearch
are independent — fire both at once for API questions.

---

## Two phases: dig, then present

### Phase 1: Dig (tool calls only)

Search, read, follow links, and build understanding. No prose between tool
calls — just run commands and searches.

#### Scrapple (Bash)

```bash
# Keyword + semantic search (default, best for most queries)
scrapple search "your query" --type doc --limit 10

# Keyword-only (good for exact symbol names)
scrapple search "AVURLAssetHTTPHeaderFieldsKey" --keyword-only --limit 5

# Semantic-only (good for conceptual questions)
scrapple search "how to handle background refresh" --semantic-only --limit 10

# Read full content by ID, path, or URL
scrapple show 4ddf4b3be02cbb74
scrapple show /documentation/swiftui/navigationsplitview
```

`scrapple show` output includes breadcrumbs and `doc://` links to related
pages. Follow them to build complete understanding.

#### Xcode MCP DocumentationSearch

```
query: "NavigationSplitView sidebar visibility"
frameworks: ["SwiftUI"]  # optional — omit to search all
```

Returns rich results with declarations, parameter docs, and discussion
sections. Mine the snippets fully — they often contain code examples.

Construct Apple Developer URLs from the `uri` field: prefix with
`https://developer.apple.com`.

#### Web search

```
query: "site:developer.apple.com SwiftUI NavigationSplitView iOS 26"
query: "site:forums.developer.apple.com NavigationSplitView sidebar bug"
query: "Swift Evolution proposal async sequences"
```

Use for:
- Recent release notes and what's-new pages
- Developer Forums threads with workarounds
- Swift Evolution proposals
- Blog posts with practical experience

Use `WebFetch` to read specific pages found via web search.

#### Strategy

- **Start with the most likely source** for the query type (see table above)
- **Run parallel searches** across sources when the query could benefit
- **Follow the trail** — Scrapple's `doc://` links and "See Also" sections
  point to related pages. DocumentationSearch results mention related types.
  Follow both
- **Cross-reference** — if Scrapple and DocumentationSearch give different
  details, read the full page to resolve. The more authoritative source wins
- **Escalate to web** when local sources come up empty or you suspect the API
  is very new

### Phase 2: Present findings (one text response)

After all research is done, write a single cohesive response.

---

## Output format

### Answer

A direct, clear answer to the question. Lead with the answer, not the journey.

If it's an API lookup, include:
- Declaration (code block)
- Key behavioral details from the Discussion section
- Platform availability if relevant
- Important caveats or gotchas

If it's a conceptual question, synthesize what you learned into a coherent
explanation. Don't just list search results.

### Sources

Every claim must be backed by a source. List what you read:

```
Sources:
- [NavigationSplitViewVisibility](https://developer.apple.com/documentation/swiftui/navigationsplitviewvisibility) — struct docs (Scrapple)
- [NavigationSplitView: Control column visibility](https://developer.apple.com/documentation/SwiftUI/NavigationSplitView#Control-column-visibility) — Xcode MCP
- [WWDC22: The SwiftUI cookbook for navigation](https://developer.apple.com/videos/play/wwdc2022/10054/) — column config discussion (Scrapple)
- [Developer Forums: sidebar toggle issue](https://forums.developer.apple.com/...) — workaround (Web)
```

Tag each source with where it came from so the user knows which tools
contributed.

### Related

If you encountered related APIs, patterns, or resources that the user might
want to explore next, list 2-4 of them with one-line descriptions:

```
Related:
- `NavigationSplitViewStyle` — controls whether sidebar displaces or overlays content
- WWDC22 "The SwiftUI cookbook for navigation" — deep dive on navigation patterns
```

---

## Rules

1. **Read before you cite.** Don't reference a doc page you haven't read with
   `scrapple show` or seen in DocumentationSearch results. Search result
   snippets can be misleading.
2. **Accuracy over speed.** If you're not sure, dig deeper. A wrong answer
   from documentation is worse than a slow correct one.
3. **Quote the docs, not yourself.** When behavioral details matter, quote
   the relevant passage. Don't paraphrase in ways that could introduce error.
4. **Don't hallucinate APIs.** If none of the three sources return it, say so.
   Don't fill gaps with guesses. The whole point of this tool is to stop
   hallucinating Apple APIs.
5. **Distinguish versions.** If docs mention iOS version requirements or
   deprecations, surface those. The user may be targeting a specific version.
6. **Prefer official over community.** Apple's docs and WWDC talks are
   authoritative. Forums and blogs are useful for workarounds and practical
   experience but can be wrong or outdated. When they conflict, trust Apple's
   docs and flag the discrepancy.
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
