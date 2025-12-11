// SVG Dimensions module exports

// Re-export types
export type {
  ViewBox,
  SVGDimensionInfo,
  SVGDimensionIssue,
  PaperSize,
  DPIOption,
} from './types'

// Re-export unit conversion utilities
export {
  UNIT_TO_PX,
  PAPER_SIZES,
  DPI_OPTIONS,
  parseLengthWithUnit,
  lengthToPixels,
  paperSizeToPixels,
} from './unitConversion'

// Re-export viewBox utilities
export {
  parseViewBox,
  getViewBoxAspectRatio,
  hasNonZeroOrigin,
  hasNegativeCoordinates,
  formatViewBox,
  normalizeViewBox,
} from './viewBoxUtils'

// Re-export dimension analysis
export {
  analyzeSVGDimensions,
} from './dimensionAnalysis'

// Re-export element transforms
export {
  transformPathD,
  transformPoints,
  transformRect,
  transformCircle,
  transformEllipse,
  transformLine,
  transformAllElements,
} from './elementTransforms'

// Re-export normalization
export {
  normalizeSVG,
} from './normalization'
