// Geometry module - re-exports all geometry utilities

// Types
export type {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
  PathSegment,
  SubpathMode,
} from './types'

// Math utilities
export {
  distance,
  distanceSquared,
  calcPolygonArea,
  polygonCentroid,
  getCentroid,
  getBoundingBox,
  isPointInsidePolygon,
  isPolygonContainedIn,
} from './math'

// Path parsing
export {
  getSubpathsAsPathStrings,
  parsePathIntoSubpaths,
  parsePathToPoints,
  pointsToPathD,
} from './pathParsing'

// Polygon analysis
export {
  identifyOuterAndHoles,
  getPolygonsFromSubpaths,
  getPolygonsFromSubpathsNested,
} from './polygonAnalysis'

// SVG conversion
export {
  getPolygonPoints,
  getAllPolygonsFromElement,
  linesToCompoundPath,
} from './svgConversion'

// Clipping
export {
  clipLineToRect,
  clipLinesToRect,
  clipPolygonToRect,
  clipPolygonWithHolesToRect,
} from './clipping'

// Plotter optimization
export {
  elementToPathSegment,
  optimizePathOrder,
  joinConnectingPaths,
  optimizeForPlotter,
} from './plotterOptimization'
