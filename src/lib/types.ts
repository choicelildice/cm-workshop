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
  /** Maps to the CMA's `localized` flag: per-locale values for this field. */
  localized?: boolean
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
  onUpdateField: (nodeId: string, fieldId: string, patch: Partial<Omit<ContentField, 'id'>>) => void
  /**
   * Clicking a reference field traces its arrows; clicking again clears it.
   * `additive` (Cmd/Ctrl-click) adds to the selection instead of replacing it,
   * so several fields can be compared at once.
   */
  onTraceField: (nodeId: string, fieldId: string, additive: boolean) => void
  /** Field id -> trace colour, for the rows this card owns. */
  tracedFieldColors?: Record<string, string>
  /** Set when this card is a target of a trace; the colour to outline it with. */
  traceTargetColor?: string
  onRenameType: (nodeId: string, newName: string) => void
  onSetTypeKind: (nodeId: string, kind?: ContentTypeKind) => void
  onSetTypeEmoji: (nodeId: string, emoji?: string) => void
  onDeleteType: (nodeId: string) => void
  /**
   * Cmd/Ctrl-click a card header to select it for comparison. A second
   * Cmd-click on a different card compares them; on the same card, clears it.
   */
  onCompareType: (nodeId: string) => void
  /** True while this card is the lone selection, waiting for a second pick. */
  isCompareSelected?: boolean
}

export interface ImageNodeData {
  imageUrl: string
  label: string
  onDelete: (nodeId: string) => void
}

export interface StickyNodeData {
  text: string
  /** Hex from STICKY_COLORS; maps to a named Miro sticky colour on export. */
  color?: string
  onChangeText: (nodeId: string, text: string) => void
  onChangeColor: (nodeId: string, color: string) => void
  onDelete: (nodeId: string) => void
}
