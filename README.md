# Folio

A collaborative document workspace for writing, sharing and revisiting ideas. Built with vanilla JavaScript, a Cloudflare Worker API and SQLite-compatible persistence, with no runtime npm dependencies.

## Features

- Rich-text documents: headings, lists, bold, italic, underline, strikethrough, highlighting, code blocks, callout boxes, dividers and symbols.
- Debounced autosave, persistent documents, reopening and version-conflict detection.
- UTF-8 `.txt` import up to **100 KB**, creating a new editable document.
- Owned/shared document lists and owner-controlled editor/viewer sharing with revocation.
- Document comments, saved-version previews and restore-as-new-version.
- Viewing/editing presence indicators, refreshed every 10 seconds.
- HTML and Markdown downloads; PDF through browser Print → Save as PDF.
- Owner-only Trash and Restore, preserving content, history, comments and sharing.
- Light/Dark appearance, keyboard controls, focus mode and responsive navigation.

## Run locally

Requires **Node.js 22.13 or newer**. No package installation is needed.

```sh
git clone https://github.com/ankitpanda226/folio.git
cd folio
npm run dev
```

Open **http://127.0.0.1:4173**. Local SQLite data is stored in `.local/folio.sqlite`; migrations run automatically. Data survives reloads and server restarts. To use a different port or database, set `PORT` or `FOLIO_DB`. Stop the server before resetting a disposable local database.

## Try the collaboration workflow

1. Create and name a document as Alice Chen. Type and wait for **All changes saved**.
2. Import `sample-import.txt`, or use the toolbar to format the document.
3. Share it with Ben Carter as an editor or viewer, then switch demo accounts to inspect that role.
4. Add a comment as an editor; open History to inspect previous saves.
5. As the owner, revoke access or move the document to Trash. Restore it from Trash in the documents menu. Restoring also restores existing sharing access.

The seeded accounts are **Alice Chen**, **Ben Carter** and **Casey Morgan**. They use fake `@folio.demo` email labels. Account selection is deliberately simulated: callers can choose a seeded identity through `x-demo-user`. Server-side document permissions are enforced within that demo model. Replace it with authenticated sessions before using real private documents.

## Verification

```sh
npm test
npm run build
npm run validate
```

The automated suite has **21 tests**, covering access control, conflicts, import validation, safe content handling, persistent reopening, comments, presence expiry, version snapshots and rollback, Markdown conversion, and Trash/Restore. Build emits `dist/server/index.js`; validation imports the generated Worker and checks its handler.

`tests/browser-check.mjs` is an optional Playwright smoke script. It requires a separately installed Playwright environment and the local server. It is not part of `npm test`. The current automated suite is not a full mobile, IME or cross-browser certification.

## Architecture

```text
Browser editor → same-origin Worker API → Cloudflare D1
Local development → the same API → Node SQLite adapter
```

The server stores an allowlisted JSON document tree rather than arbitrary HTML. Attributes are stripped and text is rendered through DOM nodes. Saves use optimistic version checks; document updates and snapshots share a transaction. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment

The build produces a standalone Cloudflare Worker ES module. Configure your own Worker with a D1 binding named **DB**, apply all three SQL files in `drizzle/meta/_journal.json` order, and deploy `dist/server/index.js`. No deployment account, credentials, database contents or hosting project identifiers are included in this repository.

## Current boundaries

- Presence indicates activity; document text is not synchronized live between tabs. Conflicts require manual recovery.
- The dependency-free editor uses `contenteditable` and browser formatting APIs. Structural insert/highlight undo coverage is limited.
- Comments are document-level. History lists the latest 100 snapshots; comments show the latest 200 entries.
- PDF uses native browser printing. Native PDF output and a complete phone/browser matrix still need broader testing.
- Trash is recoverable; there is no permanent-delete operation. Previously loaded or downloaded copies cannot be recalled through revocation.

## Development

Developed with AI assistance: Codex supported implementation and testing; Lovable contributed the visual design, integrated with the existing document API. The next priorities are production authentication, a maintained editor engine, durable local draft recovery and broader browser coverage.
