'use client'

import { useCallback, useEffect, useState } from 'react'
import { DownloadCloud, Loader2, Search, X } from 'lucide-react'

interface AvailableType {
  id: string
  name: string
  fieldCount: number
}

interface ImportedType {
  cmaId: string
  name: string
  fields: {
    cmaId: string
    name: string
    type: string
    required: boolean
    isArray: boolean
    linkTargets: string[]
    droppedTargets: string[]
  }[]
}

interface Props {
  onImport: (types: ImportedType[]) => void
  onClose: () => void
}

export default function ContentfulImportModal({ onImport, onClose }: Props) {
  const [spaceId, setSpaceId] = useState('')
  const [environmentId, setEnvironmentId] = useState('master')
  const [token, setToken] = useState('')

  const [available, setAvailable] = useState<AvailableType[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shares stored credentials with the export modal
  useEffect(() => {
    try {
      setSpaceId(localStorage.getItem('cf-space-id') ?? '')
      setEnvironmentId(localStorage.getItem('cf-environment-id') ?? 'master')
      setToken(localStorage.getItem('cf-cma-token') ?? '')
    } catch {}
  }, [])

  const call = useCallback(
    async (contentTypeIds?: string[]) => {
      setError(null)
      setLoading(true)
      try {
        localStorage.setItem('cf-space-id', spaceId)
        localStorage.setItem('cf-environment-id', environmentId)
        localStorage.setItem('cf-cma-token', token)

        const res = await fetch('/api/contentful/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spaceId, environmentId, token, contentTypeIds }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Request failed')

        if (!contentTypeIds) {
          setAvailable(data.available)
          if (!data.available.length) setError('This environment has no content types.')
        } else {
          onImport(data.types)
          onClose()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed')
      } finally {
        setLoading(false)
      }
    },
    [spaceId, environmentId, token, onImport, onClose]
  )

  const ready = spaceId.trim() && token.trim()
  const shown = available?.filter((t) =>
    `${t.name} ${t.id}`.toLowerCase().includes(query.toLowerCase())
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Import from Contentful</h2>
        <p className="text-sm text-gray-500 mb-5">
          Pull existing content types onto the board. This only reads from your space.
        </p>

        {available ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:border-blue-500 text-gray-900"
                  placeholder="Filter content types…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button
                className="text-xs text-blue-600 hover:underline flex-shrink-0"
                onClick={() =>
                  setSelected(
                    selected.size === available.length ? new Set() : new Set(available.map((t) => t.id))
                  )
                }
              >
                {selected.size === available.length ? 'None' : 'All'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 mb-4 min-h-0">
              {shown?.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    className="accent-blue-600 flex-shrink-0"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                  <span className="text-sm text-gray-800 flex-1 truncate">{t.name}</span>
                  <code className="text-[11px] text-gray-400 flex-shrink-0">{t.id}</code>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 w-14 text-right">
                    {t.fieldCount} field{t.fieldCount === 1 ? '' : 's'}
                  </span>
                </label>
              ))}
              {shown?.length === 0 && (
                <p className="text-xs text-gray-400 italic px-2 py-3">No matches.</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3 break-words">
                {error}
              </p>
            )}

            <div className="flex justify-between items-center flex-shrink-0">
              <button
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                onClick={() => { setAvailable(null); setSelected(new Set()) }}
              >
                ← Back
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#1773eb' }}
                onClick={() => call([...selected])}
                disabled={selected.size === 0 || loading}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                {loading ? 'Importing…' : `Import ${selected.size || ''}`.trim()}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
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
                onClick={() => call()}
                disabled={!ready || loading}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Reading space…' : 'List content types'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
