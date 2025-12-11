// MergeTab types

import { Point, PolygonWithHoles } from '../../../utils/geometry'
import { LayerListItemFull, FillReadinessStatus } from '../../shared'

/**
 * Boolean operation types for polygon merging
 */
export type MergeOperation = 'union' | 'intersect' | 'subtract' | 'xor'

/**
 * Polygon data with metadata for merge operations
 */
export interface PolygonData {
  nodeId: string
  originalNodeId: string  // Original element ID (before splitting compound paths)
  name: string
  color: string
  vertices: Point[]
  polygonWithHoles: PolygonWithHoles  // Full polygon data including holes
  element: Element  // Original element for rendering
  subpathCount: number  // Number of subpaths in original element
  pathD: string  // Original path d attribute
}

/**
 * Extended layer list item for merge UI
 */
export type MergeShapeListItem = LayerListItemFull & {
  polygon: PolygonData
  isMergeable: boolean
  touchesSelected: boolean
  touchCount: number
  hasHoles: boolean
  isCompound: boolean
  fillReadiness: FillReadinessStatus
  fillReadinessMessage: string
}

/**
 * Result of union operation including holes and adjacency info
 */
export interface UnionResult {
  outer: Point[]  // Merged outer boundary
  holes: Point[][]  // All holes from input shapes
  sharedEdges: Array<{ p1: Point; p2: Point }>  // Edges that were shared
  touchingPairs: Set<string>  // Set of "nodeId1|nodeId2" pairs that touch
}

/**
 * Boolean operation result (imported from booleanOperations but re-exported here for convenience)
 */
export interface BooleanResult {
  polygons: PolygonWithHoles[]
  operationType: MergeOperation
}

// Re-export for module consumers
export type { BooleanResult as BooleanOperationResult }
