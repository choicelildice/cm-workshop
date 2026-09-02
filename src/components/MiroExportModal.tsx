'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, X, Loader2, CheckCircle2 } from 'lucide-react'
import type { KindDef } from '@/lib/field-type-meta'

interface ExportPayload {
  nodes: unknown[]
  edges: unknown[]
}

interface Props {
  getExportData: () => ExportPayload
  /** Kind labels/colours, so the export matches the canvas. */
  kinds: KindDef[]
  onClose: () => void
}

export default function MiroExportModal({ getExportData, kinds, onClose }: Props) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [boardId, setBoardId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [boardUrl, setBoardUrl] = useState<string | null>(null)

  useEffect(() => {
    try {
      setClientId(localStorage.getItem('miro-client-id') ?? '')
      setClientSecret(localStorage.getItem('miro-client-secret') ?? '')
      setToken(localStorage.getItem('miro-token'))
      setBoardId(localStorage.getItem('miro-board-id') ?? '')
    } catch {}
  }, [])

  async function handleConnect() {
    setError(null)
    setLoading(true)
    try {
      localStorage.setItem('miro-client-id', clientId)
      localStorage.setItem('miro-client-secret', clientSecret)
      const res = await fetch('/api/miro/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })
      const { authUrl } = await res.json()
      window.location.href = authUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setLoading(false)
    }
  }

  async function handleExport() {
    setError(null)
    setLoading(true)
    try {
      localStorage.setItem('miro-board-id', boardId)
      const payload = getExportData()
      const res = await fetch('/api/miro/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, token, boardId, kinds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Export failed')
      setBoardUrl(data.boardUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  function disconnect() {
    localStorage.removeItem('miro-token')
    setToken(null)
    setBoardUrl(null)
    setError(null)
  }

  const [pasteMode, setPasteMode] = useState(false)
  const [pasteToken, setPasteToken] = useState('')

  function savePastedToken() {
    const t = pasteToken.trim()
    if (!t) return
    try { localStorage.setItem('miro-token', t) } catch {}
    setToken(t)
    setPasteMode(false)
    setPasteToken('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors" onClick={onClose}>
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Export to Miro</h2>
        <p className="text-sm text-gray-500 mb-5">
          Content types and reference arrows will be added to your board.
        </p>

        {boardUrl ? (
          <div className="text-center py-4">
            <p className="text-green-700 font-semibold mb-4">Export complete!</p>
            <a
              href={boardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              <ExternalLink size={14} /> Open in Miro
            </a>
          </div>
        ) : token ? (
          /* ── Connected: show export form ── */
          <>
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
              <CheckCircle2 size={14} />
              <span className="flex-1 font-medium">Connected to Miro</span>
              <button className="text-xs text-gray-400 hover:text-red-500 transition-colors underline" onClick={disconnect}>
                Disconnect
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Board ID or URL</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="https://miro.com/app/board/… or board ID"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex justify-end gap-2 mt-6">
              <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors" onClick={onClose}>Cancel</button>
              <button
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleExport}
                disabled={!boardId.trim() || loading}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                {loading ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </>
        ) : (
          /* ── Not connected: show OAuth setup or paste token ── */
          <>
            {pasteMode ? (
              <div className="space-y-3">
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
                  In your Miro app settings, click{' '}
                  <strong>"Install app and get OAuth token"</strong>, then paste the token below.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access token</label>
                  <input
                    autoFocus
                    type="password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Paste token here"
                    value={pasteToken}
                    onChange={(e) => setPasteToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePastedToken()}
                  />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <div className="flex justify-between items-center mt-4">
                  <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setPasteMode(false)}>
                    ← Use OAuth instead
                  </button>
                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                    onClick={savePastedToken}
                    disabled={!pasteToken.trim()}
                  >
                    Save token
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
                  Go to{' '}
                  <a href="https://miro.com/app/settings/user-profile/apps" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    Miro → Profile → Apps
                  </a>
                  , build a new app, and add{' '}
                  <code className="bg-gray-200 px-1 rounded">http://localhost:3099/api/miro/callback</code>{' '}
                  as a redirect URI. Then paste the Client ID and Secret below.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                  <input
                    type="password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Client Secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                <div className="flex justify-between items-center mt-4">
                  <button className="text-xs text-blue-500 hover:underline" onClick={() => setPasteMode(true)}>
                    Paste token directly instead →
                  </button>
                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleConnect}
                    disabled={!clientId.trim() || !clientSecret.trim() || loading}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    {loading ? 'Redirecting…' : 'Connect Miro'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
