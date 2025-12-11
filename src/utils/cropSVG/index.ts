// Crop SVG module exports

// Re-export types
export type {
  ParsedSubpath,
  CropDimensions,
} from './types'

// Re-export path parsing utilities
export {
  pathToSubpathsWithMetadata,
  pathToSubpaths,
  polygonToPath,
  polylineToPath,
  getPolygonPoints,
} from './pathParsing'

// Re-export line clipping utilities
export {
  clipLineSegment,
  clipPolylineToRect,
} from './lineClipping'

// Re-export element intersection utilities
export {
  polygonIntersectsCrop,
  elementIntersectsCrop,
} from './elementIntersection'

// Re-export element clipping utilities
export {
  clipElement,
} from './elementClipping'

// Re-export main crop functions
export {
  cropSVGInBrowser,
  getCropDimensions,
} from './cropSVG'
