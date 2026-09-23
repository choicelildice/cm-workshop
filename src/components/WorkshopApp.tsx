'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ImageIcon, PlusSquare, ExternalLink, Trash2, Settings, UploadCloud, DownloadCloud, StickyNote, HelpCircle, Share2, Network, X } from 'lucide-react'
import FieldLibrary from '@/components/FieldLibrary'
import MiroExportModal from '@/components/MiroExportModal'
import ContentfulExportModal from '@/components/ContentfulExportModal'
import ContentfulImportModal from '@/components/ContentfulImportModal'
import ProjectMenu from '@/components/ProjectMenu'
import KindSettingsModal from '@/components/KindSettingsModal'
import { ensureCurrentProject, setCurrentProjectId } from '@/lib/projects'
import { loadKinds } from '@/lib/kind-config'
import { hasSeenTour } from '@/lib/tour'
import ShareModal from '@/components/ShareModal'
import ShareOpenPrompt from '@/components/ShareOpenPrompt'
import { clearShareFromUrl, decodeShare, readShareFromUrl, type SharePayload } from '@/lib/share'
import { createProjectFromShare } from '@/lib/projects'
import TourGuide from '@/components/TourGuide'
import { DEFAULT_KINDS, type KindDef } from '@/lib/field-type-meta'

const Canvas = dynamic(() => import('@/components/Canvas'), { ssr: false })

interface CanvasActions {
  addContentType: (name: string) => void
  addImageNode: (file: File) => void
  addSticky: () => void
  arrangeBoard: () => { cycles: string[][]; orphans: number }
  clearBoard: () => void
  getExportData: () => { nodes: unknown[]; edges: unknown[] }
  importContentTypes: (types: {
    cmaId: string
    name: string
    fields: { cmaId: string; name: string; type: string; required: boolean; isArray: boolean; localized?: boolean; linkTargets: string[] }[]
  }[]) => void
}

export default function WorkshopApp() {
  const actionsRef = useRef<CanvasActions | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [typeName, setTypeName] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [showMiroExport, setShowMiroExport] = useState(false)
  const [showCfExport, setShowCfExport] = useState(false)
  const [showCfImport, setShowCfImport] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [incoming, setIncoming] = useState<SharePayload | null>(null)
  const [arrangeNote, setArrangeNote] = useState<{ cycles: string[][]; orphans: number } | null>(null)
  // Resolved on the client only — localStorage isn't available during SSR
  const [projectId, setProjectId] = useState<string | null>(null)
  const [kinds, setKinds] = useState<KindDef[]>(DEFAULT_KINDS)
  const [showKindSettings, setShowKindSettings] = useState(false)

  useEffect(() => {
    setProjectId(ensureCurrentProject())
    setKinds(loadKinds())

    // A share link takes precedence over the tour, so the two never stack
    const encoded = readShareFromUrl()
    if (encoded) {
      decodeShare(encoded)
        .then(setIncoming)
        .catch(() => {
          // A corrupt or truncated link shouldn't leave a dead fragment behind
          clearShareFromUrl()
        })
      return
    }
    // First visit only; the Help button reopens it afterwards
    if (!hasSeenTour()) setShowTour(true)
  }, [])


  const switchProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    setProjectId(id)
  }, [])

  const acceptShare = useCallback(() => {
    if (!incoming) return
    const meta = createProjectFromShare(incoming.name, {
      nodes: incoming.nodes,
      edges: incoming.edges,
    })
    clearShareFromUrl()
    setIncoming(null)
    switchProject(meta.id)
  }, [incoming, switchProject])

  const dismissShare = useCallback(() => {
    clearShareFromUrl()
    setIncoming(null)
  }, [])

  // Catch the OAuth callback token and open the export modal. The token arrives
  // in the fragment rather than a query param so it is never sent to the server
  // (see the comment in api/miro/callback).
  useEffect(() => {
    const hash = window.location.hash
    // Share links also use the fragment, so only handle a miro_* one here
    if (!hash.startsWith('#miro_token=') && !hash.startsWith('#miro_error=')) return

    const params = new URLSearchParams(hash.slice(1))
    const token = params.get('miro_token')
    // Clear the fragment either way, so a reload can't replay it
    window.history.replaceState({}, '', window.location.pathname + window.location.search)

    if (token) {
      try { localStorage.setItem('miro-token', token) } catch {}
    }
    // Reopen the modal on success and on failure, so a failed connect is visible
    setShowMiroExport(true)
  }, [])

  const handleCanvasReady = useCallback((actions: CanvasActions) => {
    actionsRef.current = actions
  }, [])

  function commitAddType() {
    const name = typeName.trim()
    if (name && actionsRef.current) {
      actionsRef.current.addContentType(name)
    }
    setTypeName('')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && actionsRef.current) {
      actionsRef.current.addImageNode(file)
    }
    e.target.value = ''
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file && actionsRef.current) {
      actionsRef.current.addImageNode(file)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Toolbar */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center gap-3 px-5 flex-shrink-0 shadow-sm">
        {/* Logo / App name */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: '#1773eb' }}
          >
            C
          </div>
          <span className="text-2xl font-bold text-gray-900">CM Workshop</span>
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {projectId && <ProjectMenu projectId={projectId} onSwitch={switchProject} />}

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Add Content Type */}
        <div className="flex items-center gap-1.5" data-tour="add-type">
          <PlusSquare size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-44 transition-colors text-gray-900 placeholder-gray-400"
            placeholder="New content type…"
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAddType()
              if (e.key === 'Escape') setTypeName('')
            }}
          />
          <button
            className="text-base px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: typeName.trim() ? '#1773eb' : '#d1d5db',
              color: typeName.trim() ? '#ffffff' : '#9ca3af',
              cursor: typeName.trim() ? 'pointer' : 'default',
            }}
            onClick={commitAddType}
            disabled={!typeName.trim()}
          >
            Add
          </button>
        </div>

        {/* Arrange */}
        <button
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 hover:border-blue-300"
          onClick={() => {
            const result = actionsRef.current?.arrangeBoard()
            if (result && (result.cycles.length || result.orphans)) setArrangeNote(result)
          }}
          title="Lay out content types left to right by reference depth"
        >
          <Network size={15} />
          Arrange
        </button>

        {/* Sticky note */}
        <button
          data-tour="sticky"
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 hover:border-blue-300"
          onClick={() => actionsRef.current?.addSticky()}
        >
          <StickyNote size={15} />
          Sticky
        </button>

        {/* Upload Image */}
        <button
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 hover:border-blue-300"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon size={15} />
          Upload Image
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear Board */}
        {confirmClear ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <span className="text-sm text-red-700 font-medium">Clear everything?</span>
            <button
              className="text-sm px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
              onClick={() => { actionsRef.current?.clearBoard(); setConfirmClear(false) }}
            >
              Yes, clear
            </button>
            <button
              className="text-sm px-2 py-0.5 text-gray-600 hover:text-gray-900 transition-colors"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="flex items-center gap-1.5 text-base font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={14} />
            Clear Board
          </button>
        )}

        {/* Share */}
        <button
          className="flex items-center gap-1.5 text-base font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          onClick={() => setShowShare(true)}
          title="Share this board via a link"
        >
          <Share2 size={14} />
          Share
        </button>

        {/* Tour */}
        <button
          className="flex items-center gap-1.5 text-base font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          onClick={() => setShowTour(true)}
          title="Show the intro tour"
        >
          <HelpCircle size={14} />
          Help
        </button>

        {/* Kind settings */}
        <button
          data-tour="kinds"
          className="flex items-center gap-1.5 text-base font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          onClick={() => setShowKindSettings(true)}
          title="Configure content type kinds"
        >
          <Settings size={14} />
          Kinds
        </button>

        {/* Import from Contentful */}
        <button
          data-tour="import"
          className="flex items-center gap-1.5 text-base font-medium text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 hover:border-blue-300"
          onClick={() => setShowCfImport(true)}
        >
          <DownloadCloud size={14} />
          Import
        </button>

        {/* Export to Contentful */}
        <button
          data-tour="export"
          className="flex items-center gap-1.5 text-base font-semibold text-white px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#1773eb' }}
          onClick={() => setShowCfExport(true)}
        >
          <UploadCloud size={14} />
          To Contentful
        </button>

        {/* Export to Miro */}
        <button
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 hover:border-blue-300"
          onClick={() => setShowMiroExport(true)}
        >
          <ExternalLink size={14} />
          Export to Miro
        </button>
      </div>

      {incoming && (
        <ShareOpenPrompt
          name={incoming.name}
          typeCount={incoming.nodes.filter((n) => (n as { type?: string }).type === 'contentType').length}
          stickyCount={incoming.nodes.filter((n) => (n as { type?: string }).type === 'sticky').length}
          onOpen={acceptShare}
          onDismiss={dismissShare}
        />
      )}

      {showShare && projectId && (
        <ShareModal projectId={projectId} onClose={() => setShowShare(false)} />
      )}

      {/* What the arrange found. Circular references are usually intentional
          (Page <-> Section), so this is information rather than a warning. */}
      {arrangeNote && (
        <div className="fixed bottom-4 right-4 z-40 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4">
          <button
            className="absolute top-3 right-3 text-gray-300 hover:text-gray-600 transition-colors"
            onClick={() => setArrangeNote(null)}
          >
            <X size={13} />
          </button>
          <p className="text-xs font-bold text-gray-900 mb-2 pr-5">Arranged</p>

          {arrangeNote.cycles.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-gray-600 mb-1">
                {arrangeNote.cycles.length} circular reference
                {arrangeNote.cycles.length === 1 ? '' : 's'}, drawn dashed:
              </p>
              <ul className="space-y-0.5">
                {arrangeNote.cycles.slice(0, 5).map((path, i) => (
                  <li key={i} className="text-[11px] text-gray-500 font-mono break-words">
                    {path.join(' \u2192 ')}
                  </li>
                ))}
              </ul>
              {arrangeNote.cycles.length > 5 && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  and {arrangeNote.cycles.length - 5} more
                </p>
              )}
            </div>
          )}

          {arrangeNote.orphans > 0 && (
            <p className="text-[11px] text-gray-600">
              {arrangeNote.orphans} type{arrangeNote.orphans === 1 ? '' : 's'} with no references
              either way, grouped below.
            </p>
          )}
        </div>
      )}

      {showTour && <TourGuide onClose={() => setShowTour(false)} />}

      {showKindSettings && (
        <KindSettingsModal
          kinds={kinds}
          onChange={setKinds}
          onClose={() => setShowKindSettings(false)}
        />
      )}

      {showCfImport && (
        <ContentfulImportModal
          onImport={(types) => actionsRef.current?.importContentTypes(types)}
          onClose={() => setShowCfImport(false)}
        />
      )}

      {showCfExport && (
        <ContentfulExportModal
          getExportData={() => actionsRef.current?.getExportData() ?? { nodes: [], edges: [] }}
          onClose={() => setShowCfExport(false)}
        />
      )}

      {showMiroExport && (
        <MiroExportModal
          getExportData={() => actionsRef.current?.getExportData() ?? { nodes: [], edges: [] }}
          kinds={kinds}
          onClose={() => setShowMiroExport(false)}
        />
      )}

      {/* Main area: sidebar + canvas */}
      <div className="flex-1 flex overflow-hidden">
        <div data-tour="field-library" className="flex-shrink-0">
          <FieldLibrary />
        </div>
        <div className="flex-1 overflow-hidden" data-tour="canvas">
          {projectId && <Canvas projectId={projectId} kinds={kinds} onReady={handleCanvasReady} />}
        </div>
      </div>
    </div>
  )
}
