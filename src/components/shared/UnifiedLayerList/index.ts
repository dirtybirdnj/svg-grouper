// Main component
export { UnifiedLayerList, default } from './UnifiedLayerList'

// Types
export type {
  LayerListItem,
  LayerListItemFull,
  UnifiedLayerListProps,
  ItemRenderState,
  SelectionMode,
  DisplayMode,
  DropPosition,
  DragState,
  CountBadgeProps,
  StatusBadgeProps,
  NodeToItemAdapter,
} from './types'

// Hooks
export { useLayerSelection } from './hooks/useLayerSelection'
export { useDragDrop } from './hooks/useDragDrop'

// Badges
export {
  InlineSwatch,
  CountBadge,
  TouchBadge,
  CompoundBadge,
  HolesBadge,
  StatusBadge,
  FillStatusBadge,
  PointCountBadge,
  VertexCountBadge,
  CheckboxIndicator,
  FillReadinessBadge,
} from './badges'
export type { FillReadinessStatus } from './badges'
