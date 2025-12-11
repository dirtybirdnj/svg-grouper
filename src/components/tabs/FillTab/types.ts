// FillTab types

import { HatchLine } from '../../../utils/geometry'
import { FillPatternType } from '../../../utils/fillPatterns'
import { LayerListItemFull } from '../../shared'

/**
 * A fill layer representing a set of hatched lines with associated settings.
 * Used for accumulating multiple fill passes with different angles/patterns.
 */
export interface FillLayer {
  id: string  // Unique ID for drag-and-drop
  lines: HatchLine[]
  color: string  // Display/output color (can be overridden by user)
  originalColor: string  // Original color from source paths (used for matching)
  pathId: string
  // Settings stored for re-population
  angle: number
  lineSpacing: number
  pattern: FillPatternType
  inset: number
  lineCount: number  // For display
  penWidth: number   // Pen width in mm - used for weave gap calculation
  visible: boolean   // Layer visibility toggle
}

/**
 * Extended type for UnifiedLayerList that includes FillLayer fields
 */
export type FillLayerListItem = LayerListItemFull & {
  fillLayer: FillLayer  // Reference to original layer
}

/**
 * Control IDs for keyboard nudging
 */
export type ControlId = 'lineSpacing' | 'angle' | 'inset' | 'wiggleAmplitude' | 'wiggleFrequency' | 'penWidth' | null
