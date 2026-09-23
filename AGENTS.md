<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Boards are the only copy of the user's work

Boards live solely in the user's browser: `localStorage` for structure,
IndexedDB for images. There is no server copy and no backup, and this app is in
use with a customer. Erasing a board is unrecoverable.

`npm run check:data-safety` runs before every build and enforces:

- Nothing wipes storage wholesale (`localStorage.clear`, `deleteDatabase`).
- Only `deleteProject` may remove a board; nothing may remove the project index.
  Removing credentials, tokens or the kinds config is fine.
- `saveProjectData` refuses to replace a board that has content with an empty
  one. Deliberate emptying passes `allowEmpty`.
- Image blob cleanup unions image ids across *every* project, never just the
  open board.
- Fields added to `ContentField` after launch are optional, so boards saved
  earlier still load.

When adding anything that touches persistence: keep new fields optional, and
prove old saved data still loads by running the old and new shapes through the
load path rather than reasoning about it.
