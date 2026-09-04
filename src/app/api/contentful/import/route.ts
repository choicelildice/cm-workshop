import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fromCmaField } from '@/lib/contentful-map'

const CMA = 'https://api.contentful.com'

interface CmaFieldRaw {
  id: string
  name: string
  type: string
  required?: boolean
  omitted?: boolean
  linkType?: string
  items?: { type?: string; linkType?: string; validations?: unknown[] }
  validations?: unknown[]
}

interface CmaContentType {
  sys: { id: string }
  name: string
  description?: string
  displayField?: string
  fields: CmaFieldRaw[]
}

async function cma(token: string, path: string) {
  const res = await fetch(`${CMA}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
    },
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      detail = JSON.parse(text).message ?? detail
    } catch {
      // keep raw
    }
    throw new Error(`Contentful GET ${path} → ${res.status}: ${detail}`)
  }
  return JSON.parse(text)
}

/** Fetches every content type, following pagination. */
async function fetchAllTypes(token: string, base: string): Promise<CmaContentType[]> {
  const all: CmaContentType[] = []
  let skip = 0
  for (;;) {
    const page = await cma(token, `${base}/content_types?limit=100&skip=${skip}`)
    all.push(...(page.items ?? []))
    if (!page.items?.length || all.length >= (page.total ?? 0)) break
    skip += page.items.length
  }
  return all
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth()
  if (denied) return denied

  try {
    const {
      spaceId,
      environmentId = 'master',
      token,
      // Omit to just list what's available; pass ids to import those types.
      contentTypeIds,
    } = (await req.json()) as {
      spaceId: string
      environmentId?: string
      token: string
      contentTypeIds?: string[]
    }

    if (!token || !spaceId) {
      return NextResponse.json({ error: 'token and spaceId are required' }, { status: 400 })
    }

    const base = `/spaces/${spaceId}/environments/${environmentId}`
    const all = await fetchAllTypes(token, base)

    // ── List mode: name every type so the user can choose ───────────────
    if (!contentTypeIds) {
      return NextResponse.json({
        environmentId,
        available: all
          .map((ct) => ({
            id: ct.sys.id,
            name: ct.name,
            fieldCount: ct.fields.filter((f) => !f.omitted).length,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })
    }

    // ── Import mode: convert the selected types ─────────────────────────
    const wanted = new Set(contentTypeIds)
    const selected = all.filter((ct) => wanted.has(ct.sys.id))
    if (selected.length === 0) {
      return NextResponse.json({ error: 'None of those content types were found' }, { status: 404 })
    }

    // Only draw arrows to types that are actually being imported, so the board
    // has no edges pointing at cards that aren't there.
    const importedIds = new Set(selected.map((ct) => ct.sys.id))

    const types = selected.map((ct) => ({
      cmaId: ct.sys.id,
      name: ct.name,
      fields: ct.fields
        // Omitted fields are hidden from the API and would confuse the model
        .filter((f) => !f.omitted)
        .map((f) => {
          const { fieldType, isArray, linkTargets } = fromCmaField(f)
          return {
            cmaId: f.id,
            name: f.name,
            type: fieldType,
            required: !!f.required,
            isArray,
            // Kept so the caller can build edges between imported cards
            linkTargets: linkTargets.filter((id) => importedIds.has(id)),
            // Reported so the UI can note references that point outside the
            // selection rather than silently dropping the relationship.
            droppedTargets: linkTargets.filter((id) => !importedIds.has(id)),
          }
        }),
    }))

    return NextResponse.json({ environmentId, types })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
