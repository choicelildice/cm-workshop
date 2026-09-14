# CM Workshop

A canvas for running content modelling workshops. Sketch content types and their
fields, draw the references between them, then push the result straight into
Contentful — or into Miro when the output needs to live on a whiteboard.

Built to replace the usual Miro-and-sticky-notes workflow, where the model has to
be re-typed by hand afterwards.

> Contentful provides this sample code solely to demonstrate a technical scenario. Any and all sample code provided by Contentful is not intended for production use. Contentful is not responsible for maintaining or supporting this sample code after it has been provided to you.

## What it does

**Model on a canvas.** Add content types, drag field types onto them from the
library, name each field inline and mark it required or localized. Reorder fields
by dragging. Drag from a reference field to another type to draw the
relationship.

**Sticky notes.** Drop notes on the board for open questions and decisions, in
eight colours. They travel to Miro as real sticky notes and are ignored by the
Contentful export.

**Field types mirror Contentful.** The library holds exactly the nine types
Contentful's "Add new field" dialog offers, using the same Phosphor icons the web
app uses (Contentful's design system, Forma 36, wraps `@phosphor-icons/react`).

**Kinds.** Tag each content type as Topic, Assembly, or Config to colour-code the
board. Labels and colours are configurable, so you can rename Topic to Content or
recolour the set to match your team's vocabulary; kind ids stay stable, so
renaming never breaks existing boards.

**Import from Contentful.** Pull an existing model onto the canvas — all of it
or just the types you pick. Fields, required flags, list flags, and the
references between imported types are all reconstructed. Read-only, and laid out
clear of whatever is already on the board.

**Export to Contentful.** Generates content types over the Content Management
API. Reference arrows become real `linkContentType` validations. You review a
full plan — ids, field types, link targets, warnings — before anything is
written.

**Export to Miro.** Renders the model onto a board, one shape per content type
inside a frame, sized to match content already there.

**Share a link.** The Share button packs the whole model into the URL fragment,
so anyone with the link can open a copy without an account or a backend. A
realistic twelve-type board comes out around 1.5KB of URL. Because it lives in
the fragment, board data is never sent to the server. Links are snapshots rather
than live boards, and images are left out (too large for a URL).

**Projects.** Multiple named boards, autosaved locally. Images are stored in
IndexedDB, everything else in `localStorage`.

**Canvas niceties.** Miro-style alignment guides, pinch and keyboard zoom,
placement previews that follow the cursor, image paste and upload, and undo/redo
with Cmd+Z.

**Intro tour.** A guided walkthrough runs on first visit and covers the
interactions you can't see just by looking: click-to-place, drag-to-reorder,
double-click-to-edit. Reopen it any time from the Help button.

## Running it

```bash
npm install
npm run dev
```

Then open the dev server URL it prints.

## Access codes

Set `APP_PASSWORD` and the app sits behind a code. Leave it unset locally and the
app is open, which is the right default for development.

A single shared code:

```bash
# .env.local (gitignored)
APP_PASSWORD=x7Kp2mQ9vLd4Rt8w
```

Or one code per audience, so each customer or team can be revoked
independently:

```bash
APP_PASSWORD=acme:x7Kp2m…,globex:9Fq4tR…,internal:aB8sN…
```

The label before the colon is not secret. It identifies who a code was issued
to: deleting one entry and redeploying invalidates that audience's sessions and
leaves everyone else signed in. One deployment can therefore serve several
customers without them sharing a code.

Generate codes with something like `openssl rand -base64 18`, and store them
somewhere you can read them back — hosting providers hide environment variable
values once saved.

Optionally set `SESSION_SECRET` as well. Session cookies are signed with it
instead of with the access codes, which means a captured cookie cannot be
attacked offline to recover a code, and rotating a code does not invalidate
unrelated sessions. Without it the codes are used for signing, which still
works.

On Vercel, add these under Project → Settings → Environment Variables and
redeploy. Vercel's own Password Protection is a Pro feature; this works on the
free Hobby plan.

**In production the app refuses to start without `APP_PASSWORD`**, so a missing
or misspelled variable cannot silently expose it. Set `ALLOW_NO_PASSWORD=1` to
run publicly without a gate on purpose.

The gate is enforced on the server: the page is never sent to the browser
without a valid session cookie, and the API routes reject unauthenticated calls
independently, so it cannot be bypassed by calling them directly. Cookies carry
a server-enforced expiry, and repeated failed logins from one address are
throttled.

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

Fields marked localized carry the CMA's `localized` flag, so each locale holds
its own value.

A field marked as a list becomes `Array` with the matching `items` descriptor.
Rich text, Location, and JSON have no list form in Contentful and stay scalar
(the plan warns when this applies).

Importing collapses the wider CMA set back down: `Symbol` and `Text` both arrive
as Text, `Integer` and `Number` both as Number, and an `Array` is unwrapped to
its item type with the list flag set. Omitted fields are skipped.

## Stack

Next.js (App Router), TypeScript, Tailwind, [React Flow](https://reactflow.dev)
for the canvas, Phosphor Icons, IndexedDB for image storage.
