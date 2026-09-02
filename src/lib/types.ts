import type { ContentTypeKind, KindDef } from './field-type-meta'

/**
 * The nine field types Contentful's "Add new field" dialog actually offers.
 * Short/long text and integer/number are NOT separate types here: they are
 * settings within Text and Number. A list of values is the `isArray` flag on
 * a field rather than a type of its own.
 */
export type FieldType =
  | 'richText'
  | 'text'
  | 'number'
  | 'dateTime'
  | 'location'
  | 'media'
  | 'boolean'
  | 'json'
  | 'reference'

export interface ContentField {
  id: string
  name: string
  type: FieldType
  required: boolean
  isArray: boolean
}

export interface ContentTypeNodeData {
  label: string
  fields: ContentField[]
  /** Topic / Assembly / Config. Drives the header colour. */
  kind?: ContentTypeKind
  /** Optional emoji shown before the name. */
  emoji?: string
  /** Configured kinds, so the header can resolve its own colours. */
  kinds: KindDef[]
  hasClipboard: boolean
  onAddField: (nodeId: string) => void
  onDeleteField: (nodeId: string, fieldId: string) => void
  onCopyField: (field: ContentField) => void
  onPasteField: (nodeId: string) => void
  onDropField: (nodeId: string, field: Omit<ContentField, 'id'>) => void
  onReorderField: (nodeId: string, fieldId: string, toIndex: number) => void
  onRenameType: (nodeId: string, newName: string) => void
  onSetTypeKind: (nodeId: string, kind?: ContentTypeKind) => void
  onSetTypeEmoji: (nodeId: string, emoji?: string) => void
  onDeleteType: (nodeId: string) => void
}

export interface ImageNodeData {
  imageUrl: string
  label: string
  onDelete: (nodeId: string) => void
}
