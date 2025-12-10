// Unified Layer List Types
import { SVGNode } from '../../../types/svg'
import { ReactNode } from 'react'

// Base item interface - minimum required fields
export interface LayerListItem {
  id: string
  name: string
  color?: string
  depth?: number  // For tree indentation (0 = root level)
  isExpanded?: boolean
  isVisible?: boolean
  isGroup?: boolean
  children?: LayerListItem[]

  // Reference to original SVG node (optional)
  node?: SVGNode
}

// Extended item with all possible metadata
export interface LayerListItemFull extends LayerListItem {
  // Display info
  type?: 'group' | 'path' | 'shape' | 'polygon'
  pathCount?: number
  vertexCount?: number
  pointCount?: number
  boundingBox?: { x: number; y: number; width: number; height: number }

  // For merge tab
  touchCount?: number
  isMergeable?: boolean
  subpathCount?: number
  hasHoles?: boolean

  // For fill tab
  hasFill?: boolean
  fillPattern?: string

  // Processing state
  processingState?: 'pending' | 'processing' | 'complete'
}

// Selection mode
export type SelectionMode = 'single' | 'multi' | 'multi-with-modifiers'

// Display mode
export type DisplayMode = 'tree' | 'flat'

// Drag-drop position for tree mode
export type DropPosition = 'before' | 'after' | 'inside' | null

// Drag state
export interface DragState {
  draggedId: string | null
  dropTargetId: string | null
  dropPosition: DropPosition
}

// Props for the unified layer list
export interface UnifiedLayerListProps<T extends LayerListItem = LayerListItem> {
  // Data
  items: T[]

  // Display mode
  mode?: DisplayMode

  // Filtering
  filter?: (item: T) => boolean

  // Selection
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  selectionMode?: SelectionMode

  // Optional features
  enableDragDrop?: boolean
  enableVisibilityToggle?: boolean
  enableExpandCollapse?: boolean
  showToggleAll?: boolean

  // Item rendering customization
  renderItem?: (item: T, state: ItemRenderState) => ReactNode
  renderBadges?: (item: T) => ReactNode
  renderActions?: (item: T) => ReactNode
  getItemClassName?: (item: T, state: ItemRenderState) => string

  // Callbacks
  onItemClick?: (item: T, event: React.MouseEvent) => void
  onItemDoubleClick?: (item: T) => void
  onItemHover?: (item: T | null) => void
  onToggleExpand?: (itemId: string, expanded: boolean) => void
  onToggleVisibility?: (itemId: string, visible: boolean) => void
  onReorder?: (fromId: string, toId: string, position: DropPosition) => void

  // Flat mode reorder (index-based)
  onReorderFlat?: (fromIndex: number, toIndex: number) => void

  // Empty state
  emptyMessage?: string

  // Styling
  className?: string
  itemClassName?: string
  maxHeight?: string | number
}

// State passed to item renderers
export interface ItemRenderState {
  isSelected: boolean
  isExpanded: boolean
  isVisible: boolean
  isDragging: boolean
  isDragOver: boolean
  dropPosition: DropPosition
  depth: number
}

// Badge props for common badge types
export interface CountBadgeProps {
  count: number
  label?: string
  icon?: string
  title?: string
}

export interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'complete' | 'error'
  label?: string
}

// Adapter function type for converting SVGNode[] to LayerListItem[]
export type NodeToItemAdapter<T extends LayerListItem = LayerListItem> = (
  nodes: SVGNode[],
  options?: {
    includeChildren?: boolean
    depth?: number
    filter?: (node: SVGNode) => boolean
  }
) => T[]
