'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Link2, Loader2, X } from 'lucide-react'
import { URL_WARN_LENGTH, buildShareUrl, encodeShare, stripUnshareable } from '@/lib/share'
import { loadProjectData, listProjects } from '@/lib/projects'

interface Props {
  projectId: string
  onClose: () => void
}

export default function ShareModal({ projectId, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [droppedImages, setDroppedImages] = useState(0)
  const [usedBlobStorage, setUsedBlobStorage] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const build = useCallback(async () => {
    try {
      const data = loadProjectData(projectId)
      if (!data) throw new Error('This project has nothing saved yet.')

      const name = listProjects().find((p) => p.id === projectId)?.name ?? 'Shared board'
      const { nodes, droppedImages: dropped } = stripUnshareable(data.nodes ?? [])
      setDroppedImages(dropped)

      if (nodes.length === 0) {
        throw new Error('This board is empty, so there is nothing to share yet.')
      }

      const encoded = await encodeShare({ v: 1, name, nodes, edges: data.edges ?? [] })
      const { url: shareUrl, usedBlobStorage: blobbed } = await buildShareUrl(encoded)
      setUrl(shareUrl)
      setUsedBlobStorage(blobbed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build a link')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { build() }, [build])

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Could not copy automatically. Select the link and copy it manually.')
    }
  }

  const tooLong = !!url && url.length > URL_WARN_LENGTH

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Share this board</h2>
        <p className="text-sm text-gray-500 mb-5">
          The whole model is packed into the link itself, so anyone with it can open a copy. No
          account needed.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 size={14} className="animate-spin" /> Building the link…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <input
                readOnly
                value={url ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 text-gray-700 bg-gray-50"
              />
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium flex-shrink-0 transition-opacity hover:opacity-90"
                style={{ backgroundColor: copied ? '#008539' : '#1773eb' }}
                onClick={copy}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <p className="text-[11px] text-gray-400 mb-3">
              {url?.length.toLocaleString()} characters
            </p>

            {usedBlobStorage ? (
              <p className="flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                This model was too large to fit in the link itself, so it was stored and this link
                points to it. Anyone with the link can open it, same as a normal share link.
              </p>
            ) : tooLong && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                This link is long enough that some email clients may mangle it. In Slack or Teams,
                attach it as a link with short display text rather than pasting the raw URL.
              </p>
            )}

            {droppedImages > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                {droppedImages} image{droppedImages === 1 ? '' : 's'} left out. Images are too large
                to fit in a URL, so content types and sticky notes are shared but images are not.
              </p>
            )}

            <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
              <strong className="text-gray-700">This is a snapshot, not a live board.</strong>{' '}
              Opening the link copies the model into that person&rsquo;s browser. Later edits on
              either side stay separate, so send a fresh link when the model changes.
            </div>
          </>
        )}

        <div className="flex justify-end mt-5">
          <button
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            onClick={onClose}
          >
            <Link2 size={13} /> Done
          </button>
        </div>
      </div>
    </div>
  )
}
