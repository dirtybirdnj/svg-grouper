// Color distance module exports

// Re-export types
export type {
  RGBTuple,
  LABTuple,
  XYZTuple,
  ClusteringResult,
  MergeResult,
  ReduceResult,
} from './types'

// Re-export color conversion utilities
export {
  colorToRgb,
  hexToRgb,
  rgbToHex,
  rgbToXyz,
  xyzToLab,
  rgbToLab,
  colorToLab,
  hexToLab,
} from './colorConversion'

// Re-export distance metrics
export {
  rgbDistance,
  labDistance,
  labDistanceFromTuples,
} from './distanceMetrics'

// Re-export clustering utilities
export {
  UnionFind,
  kMeansClustering,
} from './clustering'

// Re-export palette operations
export {
  extractGroupColors,
  calculateMergeResult,
  executeMergeColors,
  calculateReduceResult,
  executeReducePalette,
} from './paletteOperations'
