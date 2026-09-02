import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import {
  FIELD_TYPE_META,
  DEFAULT_KINDS,
  resolveTypeColors,
  resolveKindLabel,
  type ContentTypeKind,
  type KindDef,
} from '@/lib/field-type-meta'
import type { FieldType } from '@/lib/types'

// Reuse the canvas's own type colors so Miro matches the app. Imports the
// React-free meta module: pulling in field-types would drag @phosphor-icons
// (and createContext) into this server route.
const typeMeta = (t: string): { label: string; color: string } =>
  FIELD_TYPE_META[t as FieldType] ?? { label: t, color: '#94a3b8' }

const DEFAULT_CARD_W = 240
const DEFAULT_SCALE = 2.5
const GAP = 350

interface ExportField { id: string; name: string; type: string; required: boolean; isArray: boolean }
interface ExportNode { id: string; position: { x: number; y: number }; data: { label: string; fields: ExportField[]; kind?: ContentTypeKind; emoji?: string } }
interface ExportEdge { id: string; source: string; target: string }
interface MiroItem { position?: { x: number; y: number }; geometry?: { width: number; height: number }; type?: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function extractBoardId(input: string): string {
  const match = input.match(/\/board\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : input.trim()
}

async function miroReq(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.miro.com/v2${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Miro API ${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function fetchAllItems(token: string, boardId: string): Promise<MiroItem[]> {
  const items: MiroItem[] = []
  let cursor: string | undefined
  do {
    const qs = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50'
    const res = await miroReq(token, 'GET', `/boards/${boardId}/items${qs}`)
    items.push(...(res.data ?? []))
    cursor = res.cursor ?? undefined
  } while (cursor)
  return items
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth()
  if (denied) return denied

  try {
    const { nodes, edges, boardId: rawBoardId, token, kinds: rawKinds } = (await req.json()) as {
      nodes: ExportNode[]; edges: ExportEdge[]; boardId: string; token: string; kinds?: KindDef[]
    }

    // Kind labels/colours are user-configurable; fall back to the defaults
    const kinds: KindDef[] = rawKinds?.length ? rawKinds : DEFAULT_KINDS
    const kindLabelOf = (k?: ContentTypeKind) => resolveKindLabel(k, kinds)

    if (!token || !rawBoardId) return NextResponse.json({ error: 'token and boardId are required' }, { status: 400 })

    const boardId = extractBoardId(rawBoardId)

    // ── 1. Read existing board content ──────────────────────────────────
    const existingItems = await fetchAllItems(token, boardId)

    // Bounding box of existing items
    let exMinX = Infinity, exMaxX = -Infinity, exMinY = Infinity, exMaxY = -Infinity
    for (const item of existingItems) {
      if (!item.position) continue
      const hw = (item.geometry?.width ?? 0) / 2
      const hh = (item.geometry?.height ?? 0) / 2
      exMinX = Math.min(exMinX, item.position.x - hw)
      exMaxX = Math.max(exMaxX, item.position.x + hw)
      exMinY = Math.min(exMinY, item.position.y - hh)
      exMaxY = Math.max(exMaxY, item.position.y + hh)
    }
    const hasExisting = existingItems.length > 0

    // ── 2. Infer card size from existing shapes ──────────────────────────
    const shapeWidths = existingItems
      .filter((i) => i.type === 'shape' && i.geometry?.width)
      .map((i) => i.geometry!.width)
      .filter((w) => w >= 100 && w <= 600)
      .sort((a, b) => a - b)

    const refCardW = shapeWidths.length
      ? shapeWidths[Math.floor(shapeWidths.length / 2)]  // median
      : DEFAULT_CARD_W

    const sizeRatio = refCardW / DEFAULT_CARD_W
    const TITLE_H  = Math.round(40 * sizeRatio)
    const FIELD_H  = Math.round(20 * sizeRatio)
    const BODY_PAD = Math.round(16 * sizeRatio)
    const SCALE    = DEFAULT_SCALE * sizeRatio

    // Miro enforces fontSize >= 10
    const clampPx  = (n: number) => Math.max(10, Math.round(n))
    const titlePx  = clampPx(15 * sizeRatio)
    const fieldPx  = clampPx(12 * sizeRatio)
    const typePx   = clampPx(11 * sizeRatio)

    // Miro's min fontSize is 10. Spacer sits under the title band; a divider
    // rule sits between field rows. Line height is ~1.4x the font size.
    const spacerPx = clampPx(8 * sizeRatio)
    const RULE_H   = Math.round(fieldPx * 1.4)
    const ROW_H    = FIELD_H + RULE_H

    // ── 2b. Measure content for monospace column alignment ───────────────
    // A mono font lets field types line up in a real column. Padding is done
    // with &nbsp; because HTML collapses runs of normal spaces.
    const typeLabel = (f: ExportField) => `${typeMeta(f.type).label}${f.isArray ? '[]' : ''}`
    const allFields = nodes.flatMap((n) => n.data.fields)
    const maxNameLen = Math.max(0, ...allFields.map((f) => f.name.length))
    const maxTypeLen = Math.max(0, ...allFields.map((f) => typeLabel(f).length))
    // Includes the appended kind tag ("  ASSEMBLY"), so the title never wraps
    const maxLabelLen = Math.max(
      0,
      ...nodes.map(
        (n) =>
          n.data.label.length +
          (n.data.emoji ? 3 : 0) +
          (kindLabelOf(n.data.kind)?.length ?? -2) + 2
      )
    )

    // Mono advance width is ~0.6em; widen the card so no line wraps.
    const NAME_GAP = 2
    const TYPE_GAP = 2
    const bodyChars = maxNameLen + NAME_GAP + maxTypeLen + TYPE_GAP + 1
    const bodyPx    = bodyChars * fieldPx * 0.6
    const titleWPx  = maxLabelLen * titlePx * 0.62
    const CARD_W    = Math.round(
      Math.min(
        Math.max(refCardW, Math.max(bodyPx, titleWPx) + BODY_PAD * 2 + 12),
        refCardW * 1.9
      )
    )

    // ── 3. Compute placement origin ──────────────────────────────────────
    // Center of new content block in React Flow space
    const rfXs = nodes.map((n) => n.position.x)
    const rfYs = nodes.map((n) => n.position.y)
    const rfCx = rfXs.length ? (Math.min(...rfXs) + Math.max(...rfXs)) / 2 : 0
    const rfCy = rfYs.length ? (Math.min(...rfYs) + Math.max(...rfYs)) / 2 : 0

    // New block width in Miro coords (approx)
    const newBlockW = (Math.max(...rfXs) - Math.min(...rfXs)) * SCALE + CARD_W

    // Place to the right of existing content, vertically centered with it
    const originX = hasExisting ? exMaxX + GAP + newBlockW / 2 : 0
    const originY = hasExisting ? (exMinY + exMaxY) / 2 : 0

    // ── 4. Pre-compute Miro positions for all nodes ──────────────────────
    // One shape per content type, so height covers title + every field.
    const FRAME_PAD = 60
    interface NodeLayout { node: ExportNode; bx: number; by: number; cardH: number }
    const layouts: NodeLayout[] = nodes.map((node) => ({
      node,
      bx: originX + (node.position.x - rfCx) * SCALE,
      by: originY + (node.position.y - rfCy) * SCALE,
      cardH: Math.max(
        TITLE_H + Math.max(node.data.fields.length, 1) * ROW_H + BODY_PAD * 2,
        Math.round(80 * sizeRatio)
      ),
    }))

    // ── 5. Create one frame behind all cards ─────────────────────────────
    let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity
    for (const { bx, by, cardH } of layouts) {
      fMinX = Math.min(fMinX, bx)
      fMaxX = Math.max(fMaxX, bx + CARD_W)
      fMinY = Math.min(fMinY, by)
      fMaxY = Math.max(fMaxY, by + cardH)
    }

    const frameW = fMaxX - fMinX + FRAME_PAD * 2
    const frameH = fMaxY - fMinY + FRAME_PAD * 2
    const frameCx = (fMinX + fMaxX) / 2
    const frameCy = (fMinY + fMaxY) / 2

    const frame = await miroReq(token, 'POST', `/boards/${boardId}/frames`, {
      data: { title: 'Content Model', format: 'custom', showContent: true },
      style: { fillColor: '#f8fafc' },
      position: { x: frameCx, y: frameCy },
      geometry: { width: frameW, height: frameH },
    })
    const frameId = frame.id

    // ── 6. Create one shape per content type ─────────────────────────────
    // A single shape cannot be pulled apart, which is why the title and the
    // field list share one item's HTML content rather than being stacked
    // shapes. Positions inside a frame are TL-relative (top-left = 0,0).
    const frameLeft = frameCx - frameW / 2
    const frameTop  = frameCy - frameH / 2
    const nodeToMiroId: Record<string, string> = {}
    // Pad from the RAW length, then escape: escaping changes string length
    // (e.g. "Date & Time" -> "Date &amp; Time") and would break alignment.
    const pad = (raw: string, len: number) =>
      escapeHtml(raw) + '&nbsp;'.repeat(Math.max(1, len - raw.length))

    // How many mono characters span the card, for the full-width title band
    const bandChars = Math.max(1, Math.floor((CARD_W - 10) / (titlePx * 0.6)))

    // Divider rule between field rows. U+2500 draws a continuous line in a
    // mono font; char count is derived from the card width so it never wraps.
    const ruleChars = Math.max(4, Math.floor((CARD_W - 14) / (fieldPx * 0.6)))
    const ruleLine  = `<p><span style="color:#e2e8f0; font-size:${fieldPx}px">${'─'.repeat(ruleChars)}</span></p>`

    for (const { node, bx, by, cardH } of layouts) {
      const relX = (bx + CARD_W / 2) - frameLeft
      const relY = (by + cardH / 2) - frameTop

      // Title band. background-color on a span is Miro's text highlight, which
      // is how a single shape can still show a header bar. Kind drives the
      // colour, matching the canvas (real Contentful tokens).
      const { color: bandColor, text: bandTextColor } = resolveTypeColors(node.data.kind, kinds)

      // Kind is appended before padding, so the highlight still spans the card
      const nodeKindLabel = kindLabelOf(node.data.kind)
      const kindTag = nodeKindLabel ? `  ${nodeKindLabel.toUpperCase()}` : ''
      // An emoji occupies roughly two mono cells, so count it as 2 for padding
      const emojiPrefix = node.data.emoji ? `${node.data.emoji} ` : ''
      const emojiCells = node.data.emoji ? 3 : 0
      const bandPlain = ' '.repeat(emojiCells) + node.data.label + kindTag
      const bandInner =
        escapeHtml(emojiPrefix) +
        escapeHtml(node.data.label) +
        (nodeKindLabel ? `&nbsp;&nbsp;<span style="font-size:${typePx}px">${escapeHtml(nodeKindLabel.toUpperCase())}</span>` : '')
      const bandText =
        '&nbsp;' + bandInner + '&nbsp;'.repeat(Math.max(1, bandChars - bandPlain.length - 1))

      const titleLine =
        `<p><span style="background-color:${bandColor}; color:${bandTextColor}; font-size:${titlePx}px"><strong>${bandText}</strong></span></p>` +
        `<p><span style="font-size:${Math.max(10, Math.round(fieldPx * 0.6))}px">&nbsp;</span></p>`

      // name column | type column (colored per type) | required marker
      const fieldLines = node.data.fields.length
        ? node.data.fields.map((f) => {
            const name = pad(f.name, maxNameLen + NAME_GAP)
            const type = pad(typeLabel(f), maxTypeLen + TYPE_GAP)
            return (
              `<p>` +
              `<span style="color:#1f2937; font-size:${fieldPx}px">&nbsp;${name}</span>` +
              `<span style="color:${typeMeta(f.type).color}; font-size:${typePx}px">${type}</span>` +
              (f.required ? `<span style="color:#dc2626; font-size:${fieldPx}px"><strong>*</strong></span>` : '') +
              `</p>`
            )
          }).join(ruleLine)
        : `<p><span style="color:#94a3b8; font-size:${fieldPx}px">&nbsp;<em>No fields</em></span></p>`

      const shape = await miroReq(token, 'POST', `/boards/${boardId}/shapes`, {
        data: { shape: 'rectangle', content: titleLine + fieldLines },
        style: {
          fillColor: '#ffffff',
          borderColor: '#cbd5e1',
          borderWidth: '1',
          color: '#1f2937',
          fontSize: String(fieldPx),
          textAlign: 'left',
          textAlignVertical: 'top',
          fontFamily: 'plex_mono',
        },
        position: { x: relX, y: relY },
        geometry: { width: CARD_W, height: cardH },
        parent: { id: frameId },
      })
      nodeToMiroId[node.id] = shape.id
    }

    // ── 7. Connectors ────────────────────────────────────────────────────
    for (const edge of edges) {
      const startId = nodeToMiroId[edge.source]
      const endId = nodeToMiroId[edge.target]
      if (!startId || !endId) continue
      await miroReq(token, 'POST', `/boards/${boardId}/connectors`, {
        startItem: { id: startId },
        endItem: { id: endId },
        style: { strokeColor: '#0891B2', strokeWidth: '2', endStrokeCap: 'stealth' },
      })
    }

    return NextResponse.json({
      success: true,
      boardUrl: `https://miro.com/app/board/${boardId}/`,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
