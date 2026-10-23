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

- Sticky and Upload Image in the field library are now a stack of notes and
  a photo frame that you pull from, Miro-style: press, drag, and the top
  note lifts off the stack and follows the cursor at board scale (it
  shrinks and grows with zoom, which the old fixed-size ghost never did),
  landing where you release. Releasing back over the panel puts it back.
  Implemented as the existing placement mode completing on release instead
  of on click, rather than HTML5 drag-and-drop, so Esc and the hint label
  work mid-pull and the note you see is the note you get. Click-to-place
  still works for both (Oct 2026)
- Field library panel now also holds Sticky and Upload Image (moved out of
  the toolbar) — drag either onto the board and it lands exactly where
  dropped, same gesture as dragging a field onto a card. Clicking still
  works too. Arrange and Kinds stayed in the toolbar: neither is a
  placeable object, so there's no drag-out version of either (Oct 2026)
- Field library floats over the canvas's top-left corner instead of
  sitting in its own column, and stops at its own height instead of
  trailing an invisible dead zone down the screen; dropped its search box
  (nine always-visible items, nothing to filter) (Oct 2026)
- Save named Contentful space connections (label + space id + environment
  + token), picked from a dropdown in Import/Export instead of re-typing
  every time. Each project remembers which connection it last used.
  Entirely additive on top of the old single-credential keys, which still
  work unchanged for anyone who never opens the new picker (Oct 2026)

- Trace incoming references: a plain click on a card's header shows
  everything that points AT it (Cmd/Ctrl-click still compares, double-click
  still renames). The opposite question from the existing field trace,
  which only ever shows what one field points TO. Mutually exclusive with
  outgoing trace and compare, same rule already used between those two
  (Oct 2026)
- Fixed: sticky note text now shrinks almost all the way down to the
  note's minimum size, instead of getting stuck well before it (the
  font-size floor was reached before the note's own size floor); fixed:
  reordering a reference field now moves its connecting line with it
  (React Flow was never told to re-measure the handle's new position)
  (Oct 2026)
- Duplicate a content type from its header, next to rename/kind/delete —
  clean copy, no connections carried over (Oct 2026)
- Arrange is now a dropdown: "By reference" (the original left-to-right
  layout) or "By kind" (clusters cards by Topic / Assembly / Config, or
  whatever a board's kinds are renamed to) (Oct 2026)
- Content type cards shrink back down when a title is shortened, not just
  grow (Oct 2026)
- Toolbar collapses into a hamburger menu below ~1760px, instead of
  wrapping (and pushing into the canvas) or overflowing past the right
  edge. First shipped at Tailwind's xl (1280px) as a placeholder, then
  corrected to the real measured threshold — overflow was observed
  starting at 1753px live (Oct 2026)
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

- **Multi-select drag.** Drag a selection box over several cards (and/or
  stickies/images) and move them together, rather than one at a time.
  React Flow supports multi-selection natively; likely mostly a matter of
  enabling it and checking it doesn't fight the existing placement/panning
  mouse handling.
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
