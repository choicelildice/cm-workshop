'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ImageIcon, PlusSquare, Trash2, Settings, UploadCloud, DownloadCloud, StickyNote, HelpCircle, Share2, Network, Image as ImageDownloadIcon, ChevronDown, Search, Menu, X } from 'lucide-react'
import FieldLibrary from '@/components/FieldLibrary'
import ContentfulExportModal from '@/components/ContentfulExportModal'
import ContentfulImportModal from '@/components/ContentfulImportModal'
import ProjectMenu from '@/components/ProjectMenu'
import KindSettingsModal from '@/components/KindSettingsModal'
import { ensureCurrentProject, setCurrentProjectId, findProjectByName, createProjectWithData } from '@/lib/projects'
import { loadKinds } from '@/lib/kind-config'
import { hasSeenTour } from '@/lib/tour'
import { buildSampleModel, SAMPLE_PROJECT_NAME } from '@/lib/sample-model'
import ShareModal from '@/components/ShareModal'
import ShareOpenPrompt from '@/components/ShareOpenPrompt'
import { clearShareFromUrl, decodeShare, readShareFromUrl, type SharePayload } from '@/lib/share'
import { createProjectFromShare, replaceProjectFromShare } from '@/lib/projects'
import TourGuide from '@/components/TourGuide'
import { DEFAULT_KINDS, type KindDef } from '@/lib/field-type-meta'

const Canvas = dynamic(() => import('@/components/Canvas'), { ssr: false })

interface CanvasActions {
  addContentType: (name: string) => void
  addImageNode: (file: File) => void
  addSticky: () => void
  arrangeBoard: () => { cycles: string[][]; orphans: number }
  arrangeByKind: () => { groups: number; unassigned: number }
  clearBoard: () => void
  getExportData: () => { nodes: unknown[]; edges: unknown[] }
  exportImage: () => Promise<void>
  importContentTypes: (types: {
    cmaId: string
    name: string
    fields: { cmaId: string; name: string; type: string; required: boolean; isArray: boolean; localized?: boolean; linkTargets: string[] }[]
  }[]) => void
  listContentTypes: () => { id: string; label: string }[]
  jumpToType: (nodeId: string) => void
}

export default function WorkshopApp() {
  const actionsRef = useRef<CanvasActions | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const toolbarMenuRef = useRef<HTMLDivElement>(null)

  const [typeName, setTypeName] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  // Below the breakpoint where the full action row stops fitting, it
  // collapses into this single dropdown instead of wrapping and pushing
  // the toolbar's height into the canvas.
  const [showToolbarMenu, setShowToolbarMenu] = useState(false)
  const [showCfExport, setShowCfExport] = useState(false)
  const [showCfImport, setShowCfImport] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [imageExportError, setImageExportError] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<SharePayload | null>(null)
  const [arrangeNote, setArrangeNote] = useState<
    | { mode: 'reference'; cycles: string[][]; orphans: number }
    | { mode: 'kind'; groups: number; unassigned: number }
    | null
  >(null)
  const [showArrangeMenu, setShowArrangeMenu] = useState(false)
  const arrangeMenuRef = useRef<HTMLDivElement>(null)
  // Resolved on the client only — localStorage isn't available during SSR
  const [projectId, setProjectId] = useState<string | null>(null)
  const [kinds, setKinds] = useState<KindDef[]>(DEFAULT_KINDS)
  const [showKindSettings, setShowKindSettings] = useState(false)
  const [typeSearch, setTypeSearch] = useState('')
  const [showTypeSearch, setShowTypeSearch] = useState(false)
  const [typeSearchIndex, setTypeSearchIndex] = useState(0)
  // Read from actionsRef only inside handlers below, never during render —
  // accessing a ref's value while rendering can silently miss updates.
  const [allTypes, setAllTypes] = useState<{ id: string; label: string }[]>([])
  const typeSearchRef = useRef<HTMLDivElement>(null)
  const typeSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setProjectId(ensureCurrentProject({ name: SAMPLE_PROJECT_NAME, data: buildSampleModel() }))
    setKinds(loadKinds())

    // A share link takes precedence over the tour, so the two never stack
    readShareFromUrl().then((encoded) => {
      if (!encoded) {
        // First visit only; the Help button reopens it afterwards
        if (!hasSeenTour()) setShowTour(true)
        return
      }
      decodeShare(encoded).then(setIncoming).catch(clearShareFromUrl)
    }).catch(clearShareFromUrl) // e.g. the blob link expired or the fetch failed
  }, [])


  const switchProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    setProjectId(id)
  }, [])

  // When a share link's board name matches a project the recipient already
  // has, they most likely opened the same link before. Offer to update that
  // one in place rather than always piling up a "(2)", "(3)", …
  const existingShareTarget = incoming ? findProjectByName(incoming.name) : undefined

  // Bumped on overwrite to force Canvas to remount and reload from storage.
  // Without this, overwriting the project that's already open wouldn't
  // change `projectId`, so Canvas's own load effect would never re-fire —
  // its in-memory board would still be the old one, and the next autosave
  // would silently write it back over the overwrite that just happened.
  const [canvasResetKey, setCanvasResetKey] = useState(0)

  const acceptShare = useCallback((mode: 'new' | 'overwrite' = 'new') => {
    if (!incoming) return
    const data = { nodes: incoming.nodes, edges: incoming.edges }
    if (mode === 'overwrite' && existingShareTarget) {
      replaceProjectFromShare(existingShareTarget.id, data)
      clearShareFromUrl()
      setIncoming(null)
      const wasAlreadyOpen = existingShareTarget.id === projectId
      switchProject(existingShareTarget.id)
      if (wasAlreadyOpen) setCanvasResetKey((k) => k + 1)
      return
    }
    const meta = createProjectFromShare(incoming.name, data)
    clearShareFromUrl()
    setIncoming(null)
    switchProject(meta.id)
  }, [incoming, existingShareTarget, projectId, switchProject])

  /**
   * Puts the sample board in front of the tour. It is the first-run project, so
   * usually it is simply there; if it was deleted or renamed, a fresh one is
   * created rather than the tour running against an empty canvas.
   */
  const openTour = useCallback(() => {
    const existing = findProjectByName(SAMPLE_PROJECT_NAME)
    const meta = existing ?? createProjectWithData(SAMPLE_PROJECT_NAME, buildSampleModel())
    if (meta.id !== projectId) switchProject(meta.id)
    setShowTour(true)
  }, [projectId, switchProject])

  const dismissShare = useCallback(() => {
    clearShareFromUrl()
    setIncoming(null)
  }, [])

  const handleExportImage = useCallback(async () => {
    setShowShareMenu(false)
    setImageExportError(null)
    try {
      await actionsRef.current?.exportImage()
    } catch (err) {
      setImageExportError(err instanceof Error ? err.message : 'Could not export the board as an image.')
    }
  }, [])

  const handleCanvasReady = useCallback((actions: CanvasActions) => {
    actionsRef.current = actions
  }, [])

  const handleArrangeByReference = useCallback(() => {
    setShowArrangeMenu(false)
    const result = actionsRef.current?.arrangeBoard()
    if (result && (result.cycles.length || result.orphans)) {
      setArrangeNote({ mode: 'reference', ...result })
    }
  }, [])

  const handleArrangeByKind = useCallback(() => {
    setShowArrangeMenu(false)
    const result = actionsRef.current?.arrangeByKind()
    if (result && result.unassigned > 0) {
      setArrangeNote({ mode: 'kind', ...result })
    }
  }, [])

  // Close the Share dropdown on an outside click, same pattern as ProjectMenu.
  // Capture phase: React Flow's pan-to-drag stops a board mousedown from ever
  // bubbling to window, so a bubble-phase listener would miss board clicks.
  useEffect(() => {
    if (!showShareMenu) return
    function onDown(e: MouseEvent) {
      if (!shareMenuRef.current?.contains(e.target as globalThis.Node)) setShowShareMenu(false)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [showShareMenu])

  // Same pattern for the collapsed-toolbar menu.
  useEffect(() => {
    if (!showToolbarMenu) return
    function onDown(e: MouseEvent) {
      if (!toolbarMenuRef.current?.contains(e.target as globalThis.Node)) setShowToolbarMenu(false)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [showToolbarMenu])

  // Same pattern for the Arrange dropdown.
  useEffect(() => {
    if (!showArrangeMenu) return
    function onDown(e: MouseEvent) {
      if (!arrangeMenuRef.current?.contains(e.target as globalThis.Node)) setShowArrangeMenu(false)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [showArrangeMenu])

  const openTypeSearch = useCallback(() => {
    // Canvas owns the node list, so the toolbar re-reads it fresh each time
    // the box opens rather than trying to keep a live subscription.
    setAllTypes(actionsRef.current?.listContentTypes() ?? [])
    setTypeSearch('')
    setTypeSearchIndex(0)
    setShowTypeSearch(true)
  }, [])

  const closeTypeSearch = useCallback(() => {
    setShowTypeSearch(false)
    setTypeSearch('')
  }, [])

  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase()
    if (!q) return allTypes
    return allTypes.filter((t) => t.label.toLowerCase().includes(q))
  }, [allTypes, typeSearch])

  // Clamped at read time rather than re-synced by an effect: the stored index
  // can point past the end right after a keystroke narrows the list, and this
  // is the only place that matters.
  const activeTypeIndex = Math.min(typeSearchIndex, Math.max(filteredTypes.length - 1, 0))

  const jumpToType = useCallback((id: string) => {
    actionsRef.current?.jumpToType(id)
    closeTypeSearch()
  }, [closeTypeSearch])

  // Same capture-phase reasoning as the Share dropdown above.
  useEffect(() => {
    if (!showTypeSearch) return
    typeSearchInputRef.current?.focus()
    function onDown(e: MouseEvent) {
      if (!typeSearchRef.current?.contains(e.target as globalThis.Node)) closeTypeSearch()
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [showTypeSearch, closeTypeSearch])

  function handleTypeSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { closeTypeSearch(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setTypeSearchIndex(Math.min(activeTypeIndex + 1, filteredTypes.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setTypeSearchIndex(Math.max(activeTypeIndex - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const match = filteredTypes[activeTypeIndex]
      if (match) jumpToType(match.id)
    }
  }

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
      <div className="relative h-16 bg-white border-b border-gray-200 flex items-center gap-3 px-5 flex-shrink-0 shadow-sm">
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

        {/* Below ~1760px the full action row no longer fits and either wraps
            onto a second line (pushing the toolbar down into the canvas) or
            overflows past the right edge — measured live: overflow started
            at 1753px, so this threshold sits just under that with a little
            margin. Not a Tailwind default breakpoint, hence the arbitrary
            min-[] variant rather than xl:/2xl:. Below that width, hide the
            row and offer the same actions from this button instead. */}
        <button
          className="min-[1760px]:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:text-blue-700 hover:bg-blue-50 transition-colors flex-shrink-0"
          onClick={() => setShowToolbarMenu((v) => !v)}
          title="More actions"
        >
          <Menu size={18} />
        </button>

        {/* Everything below is one block: a normal row at the threshold above
            and up, or a dropdown panel toggled by the button above when
            narrower. Same elements either way — only the wrapping layout
            changes. */}
        <div
          ref={toolbarMenuRef}
          className={
            showToolbarMenu
              ? 'absolute left-3 top-full mt-1 w-72 max-h-[calc(100vh-5rem)] overflow-y-auto flex flex-col items-stretch gap-1 bg-white border border-gray-200 rounded-xl shadow-xl p-2 z-50 min-[1760px]:static min-[1760px]:mt-0 min-[1760px]:w-auto min-[1760px]:max-h-none min-[1760px]:overflow-visible min-[1760px]:flex-row min-[1760px]:items-center min-[1760px]:gap-3 min-[1760px]:bg-transparent min-[1760px]:border-0 min-[1760px]:rounded-none min-[1760px]:shadow-none min-[1760px]:p-0 min-[1760px]:z-auto'
              : 'hidden min-[1760px]:flex min-[1760px]:flex-row min-[1760px]:items-center min-[1760px]:gap-3'
          }
        >
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

        {/* Find a content type */}
        <div className="relative" ref={typeSearchRef} data-tour="find-type">
          {showTypeSearch ? (
            <div className="border border-blue-400 rounded-lg px-2.5 py-1.5 w-56 flex items-center gap-1.5">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                ref={typeSearchInputRef}
                type="text"
                className="flex-1 outline-none text-base text-gray-900 placeholder-gray-400 min-w-0"
                placeholder="Find a content type…"
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                onKeyDown={handleTypeSearchKeyDown}
              />
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 text-base font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
              onClick={openTypeSearch}
              title="Find a content type by name"
            >
              <Search size={14} />
              Find
            </button>
          )}

          {showTypeSearch && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 max-h-72 overflow-y-auto">
              {filteredTypes.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">
                  {allTypes.length === 0 ? 'No content types on this board yet.' : 'No match.'}
                </p>
              ) : (
                filteredTypes.map((t, i) => (
                  <button
                    key={t.id}
                    className={`w-full flex items-center px-3 py-1.5 text-sm text-left truncate transition-colors ${
                      i === activeTypeIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setTypeSearchIndex(i)}
                    onClick={() => jumpToType(t.id)}
                  >
                    {t.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Arrange */}
        <div className="relative" ref={arrangeMenuRef}>
          <button
            className="flex items-center gap-1.5 text-base font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 hover:border-blue-300"
            onClick={() => setShowArrangeMenu((v) => !v)}
            data-tour="arrange"
            title="Lay out the board automatically"
          >
            <Network size={15} />
            Arrange
            <ChevronDown size={12} className="text-gray-400" />
          </button>

          {showArrangeMenu && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5">
              <button
                className="w-full flex items-start gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={handleArrangeByReference}
              >
                <Network size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span>
                  By reference
                  <span className="block text-xs text-gray-400">Left to right, by what links to what</span>
                </span>
              </button>
              <button
                className="w-full flex items-start gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={handleArrangeByKind}
              >
                <Settings size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span>
                  By kind
                  <span className="block text-xs text-gray-400">
                    Clustered by {kinds.map((k) => k.label).join(' / ')}
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>

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

        {/* Spacer: pushes the rest right in the horizontal row only — in the
            stacked dropdown panel it would just add blank vertical space. */}
        <div className="hidden min-[1760px]:block min-[1760px]:flex-1" />

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
        <div className="relative" ref={shareMenuRef}>
          <button
            className="flex items-center gap-1.5 text-base font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
            onClick={() => setShowShareMenu((v) => !v)}
            data-tour="share"
            title="Share this board"
          >
            <Share2 size={14} />
            Share
            <ChevronDown size={12} className="text-gray-400" />
          </button>

          {showShareMenu && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5">
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => { setShowShareMenu(false); setShowShareModal(true) }}
              >
                <Share2 size={13} className="text-gray-400" /> Generate share link
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={handleExportImage}
              >
                <ImageDownloadIcon size={13} className="text-gray-400" /> Export to PNG
              </button>
            </div>
          )}
        </div>

        {/* Tour */}
        <button
          className="flex items-center gap-1.5 text-base font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          onClick={openTour}
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

        </div>
      </div>

      {imageExportError && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 shadow-lg">
          {imageExportError}
          <button className="text-red-400 hover:text-red-600" onClick={() => setImageExportError(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      {incoming && (
        <ShareOpenPrompt
          name={incoming.name}
          typeCount={incoming.nodes.filter((n) => (n as { type?: string }).type === 'contentType').length}
          stickyCount={incoming.nodes.filter((n) => (n as { type?: string }).type === 'sticky').length}
          existingProjectName={existingShareTarget?.name}
          onOpenAsNew={() => acceptShare('new')}
          onOverwrite={existingShareTarget ? () => acceptShare('overwrite') : undefined}
          onDismiss={dismissShare}
        />
      )}

      {showShareModal && projectId && (
        <ShareModal projectId={projectId} onClose={() => setShowShareModal(false)} />
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

          {arrangeNote.mode === 'reference' ? (
            <>
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
            </>
          ) : (
            <p className="text-[11px] text-gray-600">
              {arrangeNote.unassigned} type{arrangeNote.unassigned === 1 ? '' : 's'} with no kind
              set, or a kind no longer in the list, grouped in their own cluster at the end.
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

      {/* Main area: sidebar + canvas */}
      <div className="flex-1 flex overflow-hidden">
        <div data-tour="field-library" className="flex-shrink-0">
          <FieldLibrary />
        </div>
        <div className="flex-1 overflow-hidden" data-tour="canvas">
          {projectId && (
            <Canvas key={canvasResetKey} projectId={projectId} kinds={kinds} onReady={handleCanvasReady} />
          )}
        </div>
      </div>
    </div>
  )
}
