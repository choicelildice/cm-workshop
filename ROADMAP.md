# Roadmap

Working notes on where CM Workshop is headed. Not a commitment or a
schedule — a shared place to point at instead of re-deriving "what's next"
from scratch each time. Update it as priorities shift; delete a line
outright rather than letting it go stale.

## Now

- **Field validation beyond the three checkboxes.** Today a field only
  carries required / array / localized. Contentful's CMA supports far more
  (regex pattern, size/range limits, enum lists, unique, asset constraints,
  rich-text mark restrictions) and none of it is exposed. Scoping down to
  regex + min/max range first — the two most likely to get used while
  sketching structure rather than administering a live space. Reference-type
  restriction already exists, just implicitly (derived from which cards an
  arrow points at); worth clarifying with Aubrie whether that already covers
  "how many references can it have" or whether she means a hard count limit
  on an array of references.
- **Filter/focus mode.** A way to pick a working subset of content types and
  fade everything else, for boards too large to read as a whole. Contentful's
  own visualizer does something similar but doesn't let you choose the set
  by hand. Reuses the existing dimming mechanism built for reference tracing
  (fade to 30% opacity, fade unrelated edges) driven by a checklist
  multi-select instead of a field click. Open question: should a focus set be
  saveable/named so you can flip between a couple of views on a big board, or
  is per-session (clears on reload, like tracing today) enough for now?

## Recently shipped

- Search a content type by name from the toolbar, jump to it on the canvas
  with a brief highlight (Sept 2026)
- Export the board to a PNG image, moved under a Share dropdown alongside
  "Generate share link"; Miro export retired from the toolbar (Sept 2026)
- Share links for boards too large for a URL fragment fall back to private
  blob storage, fetched through a login-gated API route (Sept 2026)
- Reopening a share link offers to update the existing project instead of
  always creating a new one (Sept 2026)
- Confirm before deleting a content type that has fields or connections
  (Sept 2026)
- Structural comparison between two content types — shared vs. differing
  fields (Sept 2026)
- Per-audience access codes, session expiry, login throttling (Sept 2026)
- Sample project + guided intro tour, created on first run (Sept 2026)
- Undo/redo, sticky notes, drag-and-drop field editing, Contentful import/
  export, Miro export (earlier 2026)

## Later / under consideration

- **Server-side board storage.** Raised while discussing per-audience access
  codes: multiple people editing the same board at once would need a real
  backend (auth, conflict resolution, migrating existing local boards) —
  a bigger, separate decision from anything above. Not started; no design
  yet.
- **Contentful Marketplace app.** Researched once, not pursued. Revisit if
  distribution beyond direct links becomes a priority.
- Outside-click handling on the remaining card-level popovers (field-type
  picker, color picker, emoji picker inside a content type card) — these
  don't yet close on an outside click at all, unlike the toolbar dropdowns.

## Explicitly not doing (for now)

- Real-time multiplayer editing — see server-side storage, above; a
  prerequisite, not a feature on its own.
- Full CMA validation parity (enum lists, asset file size/dimensions,
  rich-text allowed marks/node types) — deeper space-administration territory
  than a modeling-workshop tool needs today.
