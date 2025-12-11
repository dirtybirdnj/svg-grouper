// MergeTab module exports

export { default } from './MergeTab'

// Types
export type {
  MergeOperation,
  PolygonData,
  MergeShapeListItem,
  UnionResult,
  BooleanResult,
} from './types'

// Polygon utilities
export { edgeKey, findTouchingShapes, unionPolygons } from './polygonUtils'

// Path conversion
export { pointsToPathD, polygonWithHolesToPathD, multiPolygonToPathD } from './pathConversion'

// Boolean operations
export { polygonWithHolesToClip, clipResultToPolygonWithHoles, performBooleanOperation } from './booleanOperations'
