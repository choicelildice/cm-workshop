'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  type ProjectMeta,
} from '@/lib/projects'

interface Props {
  projectId: string
  onSwitch: (id: string) => void
}

export default function ProjectMenu({ projectId, onSwitch }: Props) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const refresh = () => setProjects(listProjects())

  useEffect(refresh, [projectId])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as globalThis.Node)) {
        setOpen(false)
        setConfirmDelete(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (renaming) renameInputRef.current?.select()
  }, [renaming])

  const current = projects.find((p) => p.id === projectId)
  const currentName = current?.name ?? 'Untitled'

  function handleNew() {
    const meta = createProject(`Untitled ${projects.length + 1}`)
    refresh()
    setOpen(false)
    onSwitch(meta.id)
  }

  function handleDuplicate() {
    const meta = duplicateProject(projectId, `${currentName} copy`)
    refresh()
    setOpen(false)
    if (meta) onSwitch(meta.id)
  }

  function startRename() {
    setNameDraft(currentName)
    setRenaming(true)
  }

  function commitRename() {
    renameProject(projectId, nameDraft)
    setRenaming(false)
    refresh()
  }

  function handleDelete() {
    const remaining = projects.filter((p) => p.id !== projectId)
    deleteProject(projectId)
    refresh()
    setConfirmDelete(false)
    setOpen(false)
    // Always leave a project open: fall back to the next one, or a fresh board
    onSwitch(remaining[0]?.id ?? createProject('Untitled').id)
  }

  return (
    <div className="relative" ref={wrapRef}>
      {renaming ? (
        <input
          ref={renameInputRef}
          className="border border-blue-400 rounded-lg px-2.5 py-1.5 text-base outline-none focus:ring-2 focus:ring-blue-100 w-48 text-gray-900"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <button
          className="flex items-center gap-1.5 text-base font-semibold text-gray-800 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors max-w-[220px]"
          onClick={() => setOpen((v) => !v)}
          title="Switch project"
        >
          <FolderOpen size={15} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{currentName}</span>
          <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5">
          <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Projects
          </p>

          <div className="max-h-64 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setOpen(false)
                  if (p.id !== projectId) onSwitch(p.id)
                }}
              >
                {p.id === projectId ? (
                  <Check size={13} className="text-blue-600 flex-shrink-0" />
                ) : (
                  <span className="w-[13px] flex-shrink-0" />
                )}
                <span className="flex-1 truncate text-gray-800">{p.name}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={handleNew}
            >
              <Plus size={13} className="text-gray-400" /> New project
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => { setOpen(false); startRename() }}
            >
              <Pencil size={13} className="text-gray-400" /> Rename
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={handleDuplicate}
            >
              <Copy size={13} className="text-gray-400" /> Duplicate
            </button>

            {confirmDelete ? (
              <div className="mx-2 my-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                <p className="text-[11px] text-red-700 font-medium mb-1">
                  Delete &ldquo;{currentName}&rdquo;?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="text-[11px] px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                  <button
                    className="text-[11px] text-gray-600 hover:text-gray-900 transition-colors"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} /> Delete project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
