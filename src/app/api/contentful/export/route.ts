import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { migrateFieldType } from '@/lib/field-type-meta'
import { DISPLAY_FIELD_TYPES, toCmaField, toId, uniqueId, type CmaField } from '@/lib/contentful-map'
import type { FieldType } from '@/lib/types'

const CMA = 'https://api.contentful.com'

interface ExportField { id: string; name: string; type: string; required: boolean; isArray: boolean }
interface ExportNode { id: string; data: { label: string; fields: ExportField[] } }
interface ExportEdge { source: string; target: string; sourceHandle?: string | null }

interface PlannedType {
  id: string
  name: string
  displayField: string
  fields: CmaField[]
  /** Set when the space already has a content type with this id. */
  exists: boolean
  warnings: string[]
}

async function cma(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
) {
  const res = await fetch(`${CMA}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    // Contentful returns structured errors; surface the useful part
    let detail = text.slice(0, 400)
    try {
      const parsed = JSON.parse(text)
      detail = parsed.message ?? detail
      if (parsed.details?.errors?.length) {
        detail += ` — ${parsed.details.errors.map((e: { details?: string; name?: string }) => e.details ?? e.name).join('; ')}`
      }
    } catch {
      // keep raw text
    }
    throw new Error(`Contentful ${method} ${path} → ${res.status}: ${detail}`)
  }
  return text ? JSON.parse(text) : null
}

/** Builds the full plan without writing anything. */
function buildPlan(
  nodes: ExportNode[],
  edges: ExportEdge[],
  existingIds: Set<string>
): PlannedType[] {
  // Stable node -> content type id map, needed before fields so reference
  // validations can name their targets.
  const takenTypeIds = new Set<string>()
  const nodeToTypeId = new Map<string, string>()
  for (const n of nodes) {
    nodeToTypeId.set(n.id, uniqueId(toId(n.data.label, 'contentType'), takenTypeIds))
  }

  return nodes.map((node) => {
    const warnings: string[] = []
    const typeId = nodeToTypeId.get(node.id)!
    const takenFieldIds = new Set<string>()
    const fields: CmaField[] = []

    for (const f of node.data.fields) {
      const fieldType = migrateFieldType(f.type) as FieldType
      const fieldId = uniqueId(toId(f.name, 'field'), takenFieldIds)

      // Reference targets come from arrows drawn off this specific field.
      // The handle id is `field-<fieldId>` (see ContentTypeNode).
      const linkTargets =
        fieldType === 'reference'
          ? edges
              .filter((e) => e.source === node.id && e.sourceHandle === `field-${f.id}`)
              .map((e) => nodeToTypeId.get(e.target))
              .filter((v): v is string => !!v)
          : []

      if (fieldType === 'reference' && linkTargets.length === 0) {
        warnings.push(`"${f.name}" has no connection drawn, so it accepts any entry type`)
      }
      if (f.isArray && (fieldType === 'richText' || fieldType === 'location' || fieldType === 'json')) {
        warnings.push(`"${f.name}" cannot be a list in Contentful; created as a single value`)
      }

      fields.push(
        toCmaField({
          id: fieldId,
          name: f.name,
          fieldType,
          required: f.required,
          isArray: f.isArray,
          linkTargets,
        })
      )
    }

    // displayField must be an existing Symbol field. Prefer one named "title".
    const candidates = fields.filter((f) => DISPLAY_FIELD_TYPES.has(f.type))
    const preferred =
      candidates.find((f) => /^(title|name|heading|label)$/i.test(f.id)) ?? candidates[0]

    let displayField = preferred?.id ?? ''
    if (!displayField) {
      // Contentful requires one, so add a title field rather than failing
      const titleId = uniqueId('title', takenFieldIds)
      fields.unshift({
        id: titleId,
        name: 'Title',
        type: 'Symbol',
        required: true,
        localized: false,
      })
      displayField = titleId
      warnings.push('No text field to use as the entry title, so a "Title" field was added')
    }

    if (fields.length === 0) {
      warnings.push('No fields defined')
    }

    return {
      id: typeId,
      name: node.data.label,
      displayField,
      fields,
      exists: existingIds.has(typeId),
      warnings,
    }
  })
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth()
  if (denied) return denied

  try {
    const {
      nodes,
      edges,
      spaceId,
      environmentId = 'master',
      token,
      dryRun = true,
      publish = true,
    } = (await req.json()) as {
      nodes: ExportNode[]
      edges: ExportEdge[]
      spaceId: string
      environmentId?: string
      token: string
      dryRun?: boolean
      publish?: boolean
    }

    if (!token || !spaceId) {
      return NextResponse.json({ error: 'token and spaceId are required' }, { status: 400 })
    }
    if (!nodes?.length) {
      return NextResponse.json({ error: 'No content types on the board to export' }, { status: 400 })
    }

    const base = `/spaces/${spaceId}/environments/${environmentId}`

    // ── Read existing content types (paginated) ─────────────────────────
    const existingIds = new Set<string>()
    let skip = 0
    for (;;) {
      const page = await cma(token, 'GET', `${base}/content_types?limit=100&skip=${skip}`)
      for (const ct of page.items ?? []) existingIds.add(ct.sys.id)
      if (!page.items?.length || skip + page.items.length >= (page.total ?? 0)) break
      skip += page.items.length
    }

    const plan = buildPlan(nodes, edges, existingIds)

    // ── Dry run: return the plan, write nothing ─────────────────────────
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        environmentId,
        plan: plan.map((p) => ({
          id: p.id,
          name: p.name,
          action: p.exists ? 'update' : 'create',
          displayField: p.displayField,
          fieldCount: p.fields.length,
          fields: p.fields.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type === 'Array' ? `Array<${f.items?.linkType ?? f.items?.type}>` : f.type,
            required: f.required,
            linkedTo:
              (f.validations?.[0] as { linkContentType?: string[] } | undefined)?.linkContentType ??
              (f.items?.validations?.[0] as { linkContentType?: string[] } | undefined)?.linkContentType,
          })),
          warnings: p.warnings,
        })),
      })
    }

    // ── Apply ───────────────────────────────────────────────────────────
    // Two passes: create every type with its non-reference fields first, then
    // add references. A link validation naming a type that doesn't exist yet
    // is rejected, so the types have to exist before the links are wired.
    const results: { id: string; name: string; status: string; error?: string }[] = []
    const versions = new Map<string, number>()

    for (const p of plan) {
      try {
        const scalarFields = p.fields.filter(
          (f) => !(f.type === 'Link' || (f.type === 'Array' && f.items?.type === 'Link'))
        )
        const body = {
          name: p.name,
          displayField: p.displayField,
          fields: scalarFields.length ? scalarFields : p.fields,
        }
        const created = await cma(token, 'PUT', `${base}/content_types/${p.id}`, body, {
          ...(p.exists ? {} : { 'X-Contentful-Version': '0' }),
        })
        versions.set(p.id, created.sys.version)
        results.push({ id: p.id, name: p.name, status: p.exists ? 'updated' : 'created' })
      } catch (err) {
        results.push({
          id: p.id,
          name: p.name,
          status: 'failed',
          error: err instanceof Error ? err.message : 'unknown',
        })
      }
    }

    // Second pass: full field list, now that every target type exists
    for (const p of plan) {
      const version = versions.get(p.id)
      if (version === undefined) continue
      const hasLinks = p.fields.some(
        (f) => f.type === 'Link' || (f.type === 'Array' && f.items?.type === 'Link')
      )
      if (!hasLinks) continue
      try {
        const updated = await cma(
          token,
          'PUT',
          `${base}/content_types/${p.id}`,
          { name: p.name, displayField: p.displayField, fields: p.fields },
          { 'X-Contentful-Version': String(version) }
        )
        versions.set(p.id, updated.sys.version)
      } catch (err) {
        const row = results.find((r) => r.id === p.id)
        if (row) {
          row.status = 'partial'
          row.error = `references not linked: ${err instanceof Error ? err.message : 'unknown'}`
        }
      }
    }

    // ── Publish ─────────────────────────────────────────────────────────
    if (publish) {
      for (const p of plan) {
        const version = versions.get(p.id)
        if (version === undefined) continue
        try {
          await cma(token, 'PUT', `${base}/content_types/${p.id}/published`, undefined, {
            'X-Contentful-Version': String(version),
          })
        } catch (err) {
          const row = results.find((r) => r.id === p.id)
          if (row && row.status !== 'failed') {
            row.status = 'created, not published'
            row.error = err instanceof Error ? err.message : 'publish failed'
          }
        }
      }
    }

    return NextResponse.json({
      dryRun: false,
      environmentId,
      published: publish,
      results,
      spaceUrl: `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/content_types`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
