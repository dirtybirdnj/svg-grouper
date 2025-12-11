export { LayerList, ColorLayerItem } from './LayerList'
export type { LayerListItem } from './LayerList'

export { StatSection, StatRow, StatGrid } from './StatSection'

export { ColorSwatch, ColorPalette } from './ColorSwatch'

export { ColorPickerPopup } from './ColorPickerPopup'
export type { ColorPickerPopupProps } from './ColorPickerPopup'

// Unified Layer List (new)
export { UnifiedLayerList } from './UnifiedLayerList'
export type {
  LayerListItem as UnifiedLayerListItem,
  LayerListItemFull,
  UnifiedLayerListProps,
  ItemRenderState,
  SelectionMode,
  DisplayMode,
} from './UnifiedLayerList'
export { useLayerSelection, useDragDrop } from './UnifiedLayerList'
export {
  InlineSwatch,
  CountBadge,
  TouchBadge,
  CompoundBadge,
  HolesBadge,
  StatusBadge,
  FillStatusBadge,
  PointCountBadge,
  CheckboxIndicator,
  FillReadinessBadge,
} from './UnifiedLayerList'
export type { FillReadinessStatus } from './UnifiedLayerList'
