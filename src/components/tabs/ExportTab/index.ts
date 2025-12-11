// ExportTab module exports

export { default } from './ExportTab'

// Types
export type {
  PaperSize,
  ColorStats,
  LayerStats,
  SVGStatistics,
  PageLayout,
  PageDimensions,
  Margins,
} from './types'
export { COMMAND_NAMES } from './types'

// SVG analysis utilities
export { analyzeSVG, analyzeOptimizationState, formatBytes } from './svgAnalysis'
export type { OptimizationSummary } from './svgAnalysis'

// Paper size utilities
export {
  loadPaperSizes,
  savePaperSizes,
  getDefaultPaperSizes,
  validatePaperSize,
  validatePaperSizes,
} from './paperSizes'

// Hooks
export { usePageLayout } from './usePageLayout'
