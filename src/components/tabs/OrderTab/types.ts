// OrderTab types

import { OrderLine } from '../../../context/AppContext'
import { LayerListItemFull } from '../../shared'

/**
 * Extended OrderLine with optimization metadata
 */
export interface OrderedLine extends OrderLine {
  originalIndex: number
  reversed: boolean
}

/**
 * Layer information for grouping lines (internal to OrderTab)
 */
export interface LayerInfo {
  pathId: string
  color: string
  lineCount: number
  visible: boolean
}

/**
 * Extended layer list item for UnifiedLayerList
 */
export type OrderLayerListItem = LayerListItemFull & {
  layerInfo: LayerInfo
}
