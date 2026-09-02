'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react'

interface ExportPayload {
  nodes: unknown[]
  edges: unknown[]
}

interface Props {
  getExportData: () => ExportPayload
  onClose: () => void
}

interface PlanField {
  id: string
  name: string
  type: string
  required: boolean
  linkedTo?: string[]
}

interface PlanType {
  id: string
  name: string
  action: 'create' | 'update'
  displayField: string
  fieldCount: number
  fields: PlanField[]
  warnings: string[]
}

interface ResultRow {
  id: string
  name: string
  status: string
  error?: string
}

export default function ContentfulExportModal({ getExportData, onClose }: Props) {
  const [spaceId, setSpaceId] = useState('')
  const [environmentId, setEnvironmentId] = useState('master')
  const [token, setToken] = useState('')
  const [publish, setPublish] = useState(true)

  const [plan, setPlan] = useState<PlanType[] | null>(null)
  const [results, setResults] = useState<ResultRow[] | null>(null)
  const [spaceUrl, setSpaceUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setSpaceId(localStorage.getItem('cf-space-id') ?? '')
      setEnvironmentId(localStorage.getItem('cf-environment-id') ?? 'master')
      setToken(localStorage.getItem('cf-cma-token') ?? '')
    } catch {}
  }, [])

  const call = useCallback(
    async (dryRun: boolean) => {
      setError(null)
      setLoading(true)
      try {
        localStorage.setItem('cf-space-id', spaceId)
        localStorage.setItem('cf-environment-id', environmentId)
        localStorage.setItem('cf-cma-token', token)

        const payload = getExportData()
        const res = await fetch('/api/contentful/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, spaceId, environmentId, token, dryRun, publish }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Request failed')

        if (dryRun) setPlan(data.plan)
        else {
          setResults(data.results)
          setSpaceUrl(data.spaceUrl)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed')
      } finally {
        setLoading(false)
      }
    },
    [spaceId, environmentId, token, publish, getExportData]
  )

  const ready = spaceId.trim() && token.trim()
  const totalWarnings = plan?.reduce((n, p) => n + p.warnings.length, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Export to Contentful</h2>
        <p className="text-sm text-gray-500 mb-5">
          Creates content types from this board. You&rsquo;ll review the plan before anything is
          written.
        </p>

        {/* ── Done ── */}
        {results ? (
          <div>
            <div className="space-y-1.5 mb-5">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2"
                >
                  {r.status === 'failed' ? (
                    <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-900">{r.name}</span>
                    <span className="text-gray-400 text-xs ml-2 font-mono">{r.id}</span>
                    <span className="text-gray-500 text-xs ml-2">{r.status}</span>
                    {r.error && <p className="text-[11px] text-red-600 mt-0.5 break-words">{r.error}</p>}
                  </div>
                </div>
              ))}
            </div>
            {spaceUrl && (
              <a
                href={spaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: '#1773eb' }}
              >
                <ExternalLink size={14} /> Open in Contentful
              </a>
            )}
          </div>
        ) : plan ? (
          /* ── Plan review ── */
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">
                <strong>{plan.length}</strong> content type{plan.length === 1 ? '' : 's'} into{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">{environmentId}</code>
              </p>
              {totalWarnings > 0 && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  {totalWarnings} note{totalWarnings === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="space-y-2 mb-4">
              {plan.map((p) => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: p.action === 'create' ? '#e8f5ff' : '#fff6cc',
                        color: p.action === 'create' ? '#0059C8' : '#7F5200',
                      }}
                    >
                      {p.action}
                    </span>
                    <span className="font-semibold text-sm text-gray-900">{p.name}</span>
                    <code className="text-[11px] text-gray-400">{p.id}</code>
                  </div>

                  <div className="space-y-0.5">
                    {p.fields.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <code className="text-gray-700 w-32 truncate">{f.id}</code>
                        <span className="text-gray-400 font-mono text-[11px]">{f.type}</span>
                        {f.required && <span className="text-red-500">*</span>}
                        {f.id === p.displayField && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded">title</span>
                        )}
                        {f.linkedTo?.length ? (
                          <span className="text-[10px] text-teal-700 flex items-center gap-0.5">
                            <ArrowRight size={9} /> {f.linkedTo.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {p.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                      <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3 break-words">
                {error}
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-gray-600 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="accent-blue-600"
              />
              Publish content types after creating them
            </label>

            <div className="flex justify-between items-center">
              <button
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                onClick={() => setPlan(null)}
              >
                ← Back
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#1773eb' }}
                onClick={() => call(false)}
                disabled={loading}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Writing…' : `Create ${plan.length} content type${plan.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        ) : (
          /* ── Credentials ── */
          <div className="space-y-3">
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
              Needs a <strong>Content Management API</strong> token — Contentful → Settings → API
              keys → Content management tokens. Stored in this browser only.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Space ID</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-900"
                placeholder="e.g. abc123xyz"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-900"
                placeholder="master"
                value={environmentId}
                onChange={(e) => setEnvironmentId(e.target.value)}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Use a sandbox environment rather than master while trying this out.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CMA token</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-900"
                placeholder="CFPAT-…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#1773eb' }}
                onClick={() => call(true)}
                disabled={!ready || loading}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Reading space…' : 'Preview plan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
