// Fill patterns module exports
// NOTE: All pattern generation is now handled by rat-king (Rust) via IPC
// This module only contains types and post-processing optimization functions

// Re-export types
export type {
  OrderedLine,
  FillPatternType,
  TileShapeType,
  EndpointEntry,
  OptimizedShape,
  ShapeInfo,
} from './types'

export {
  TILE_SHAPES,
} from './types'

// Re-export shape utilities
export {
  calculateShapeCentroid,
  getShapeTopLeft,
  getShapeEndpoints,
  reverseShapeLines,
} from './shapeUtils'

// Re-export line joining utilities
export {
  ENDPOINT_TOLERANCE,
  buildEndpointGrid,
  findNearbyEndpoints,
  joinContinuousLines,
} from './lineJoining'

// Re-export line optimization
export {
  optimizeLineOrderMultiPass,
  calculateTravelDistance,
} from './lineOptimization'
