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
