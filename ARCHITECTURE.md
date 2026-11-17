# Architecture

## System

Folio uses one Worker to serve the editor and permission-checked JSON API. The browser is vanilla JavaScript with a canonical restricted document tree. Production persistence uses Cloudflare D1; local development and tests run the same API through a small Node SQLite adapter. No npm runtime packages are required.

## Data model

| Entity | Purpose |
| --- | --- |
| users | Three seeded demo identities |
| documents | Owner, title, canonical JSON content, version, timestamps and optional deleted_at |
| shares | One editor/viewer role per document and teammate |
| comments | Plain-text document discussions |
| document_versions | Immutable snapshots keyed by document and version |
| presence | Expiring per-tab sessions grouped by user |

Three numbered migrations own the schema. Runtime seeding is idempotent and does not recreate revoked shares or restore trashed documents.

## Authorization

The owner manages sharing and Trash/Restore. Editors write, comment and restore document versions; viewers read/export/history only. All document endpoints check current access. Trashed rows are excluded from active reads and write predicates. The simulated account header is a demo boundary, not production authentication.

## Persistence and recovery

Changes autosave after 700 ms. Saves run sequentially and carry the last known version. SQL checks both current editing permission and version. A stale write returns 409 and keeps the visible draft. Navigation waits for pending saves. Updates and version snapshots use one transaction; a failed snapshot rolls back the content write. Restoring a version creates a new version.

Trash sets deleted_at and clears presence while retaining content, shares, comments and history. Owner-only restore clears deleted_at and restores existing sharing access. There is no hard-delete endpoint.

## Content boundary

The server canonicalizes an allowlist of headings, paragraphs, inline formatting, lists, quotes, callouts, dividers and code elements. Attributes are stripped; arbitrary HTML is not persisted. Rendering uses DOM elements and text nodes. Imports accept UTF-8 .txt up to 100 KB. Paste is plain text. Markdown export escapes literal syntax; HTML export renders the same restricted tree.

## Collaboration

Presence heartbeats every 10 seconds and expires after 45 seconds. Comments refresh while their dialog is open. Presence does not stream document edits or resolve concurrent changes. CRDT synchronization would need a separate editing/synchronization layer.

## Verification and tradeoffs

21 automated tests exercise the API with real SQLite and the pure Markdown converter. They cover permission transitions, rejected stale writes, input safety, durable reopen, comments, snapshots/rollback, presence and recoverable deletion. Build validation imports the actual generated Worker.

The editor uses contenteditable and browser formatting commands to keep setup small. Production use would benefit from a maintained editor engine, authenticated sessions, rate limits, pagination/retention, local draft recovery and a wider browser/IME suite.
