import { FieldType } from './types'
import { FIELD_TYPES } from './field-types'

export interface LibraryField {
  name: string
  type: FieldType
  required?: boolean
  isArray?: boolean
}

export interface LibraryGroup {
  label: string
  fields: LibraryField[]
}

export const FIELD_LIBRARY: LibraryGroup[] = [
  {
    label: 'Field Types',
    fields: (Object.entries(FIELD_TYPES) as [FieldType, { label: string }][]).map(
      ([type, { label }]) => ({ name: label, type })
    ),
  },
]

export const DRAG_TYPE = 'application/cm-field'

// Distinct from DRAG_TYPE so a reorder drag inside a card is never mistaken
// for a new field being dragged in from the library.
export const REORDER_TYPE = 'application/cm-field-reorder'

/**
 * The two board items in the sidebar. They are pulled onto the canvas with
 * pointer events (see ToolItem in FieldLibrary.tsx and pullTool in
 * Canvas.tsx), not HTML5 drag-and-drop, so unlike fields they carry no MIME
 * type: a field dropped on the open canvas still does nothing, and a board
 * item never enters a card's drop handler in the first place.
 */
export type ToolDragKind = 'sticky' | 'image'
