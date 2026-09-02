# CM Workshop

A canvas for running content modelling workshops. Sketch content types and their
fields, draw the references between them, then push the result straight into
Contentful — or into Miro when the output needs to live on a whiteboard.

Built to replace the usual Miro-and-sticky-notes workflow, where the model has to
be re-typed by hand afterwards.

> Contentful provides this sample code solely to demonstrate a technical scenario. Any and all sample code provided by Contentful is not intended for production use. Contentful is not responsible for maintaining or supporting this sample code after it has been provided to you.

## What it does

**Model on a canvas.** Add content types, drag field types onto them from the
library, name each field inline and mark it required. Reorder fields by dragging.
Drag from a reference field to another type to draw the relationship.

**Field types mirror Contentful.** The library holds exactly the nine types
Contentful's "Add new field" dialog offers, using the same Phosphor icons the web
app uses (Contentful's design system, Forma 36, wraps `@phosphor-icons/react`).

**Kinds.** Tag each content type as Topic, Assembly, or Config to colour-code the
board. Labels and colours are configurable, so you can rename Topic to Content or
recolour the set to match your team's vocabulary; kind ids stay stable, so
renaming never breaks existing boards.

**Export to Contentful.** Generates content types over the Content Management
API. Reference arrows become real `linkContentType` validations. You review a
full plan — ids, field types, link targets, warnings — before anything is
written.

**Export to Miro.** Renders the model onto a board, one shape per content type
inside a frame, sized to match content already there.

**Projects.** Multiple named boards, autosaved locally. Images are stored in
IndexedDB, everything else in `localStorage`.

**Canvas niceties.** Miro-style alignment guides, pinch and keyboard zoom,
placement previews that follow the cursor, image paste and upload.

## Running it

```bash
npm install
npm run dev
```

Then open the dev server URL it prints.

## Credentials

**No keys are stored in this repository.** Both integrations ask for credentials
at runtime and keep them in your browser's `localStorage` only:

- **Contentful** — a Content Management API token (Settings → API keys → Content
  management tokens), plus your space id and environment.
- **Miro** — either an OAuth client id and secret (a short-lived cookie holds
  them during the OAuth round-trip), or a pasted access token.

Nothing is sent anywhere except to Contentful's and Miro's own APIs.

## Notes on the Contentful export

- **Preview is read-only.** "Preview plan" only reads your space; the write is a
  separate, explicit second step.
- **Point it at a sandbox environment first.** A content type id that already
  exists is treated as an update, and updating types in place can affect existing
  entries.
- **`displayField`** must be a `Symbol` field. One named title/name/heading/label
  is preferred, otherwise the first text field; if a type has no text field at
  all, a `Title` field is added and flagged in the plan.
- **Two-pass write.** Types are created with their scalar fields, then references
  are wired, because a link validation naming a type that doesn't exist yet is
  rejected.

## Field type mapping

| Canvas | Contentful CMA |
| --- | --- |
| Text | `Symbol` |
| Rich text | `RichText` |
| Number | `Integer` |
| Date and time | `Date` |
| Location | `Location` |
| Media | `Link<Asset>` |
| Boolean | `Boolean` |
| JSON object | `Object` |
| Reference | `Link<Entry>` |

A field marked as a list becomes `Array` with the matching `items` descriptor.
Rich text, Location, and JSON have no list form in Contentful and stay scalar
(the plan warns when this applies).

## Stack

Next.js (App Router), TypeScript, Tailwind, [React Flow](https://reactflow.dev)
for the canvas, Phosphor Icons, IndexedDB for image storage.
