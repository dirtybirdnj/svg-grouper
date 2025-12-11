// ExportTab types

/**
 * Paper size definition
 */
export interface PaperSize {
  id: string
  label: string
  width: number
  height: number
  unit: string
}

/**
 * Statistics for a single color in the SVG
 */
export interface ColorStats {
  color: string
  paths: number
  points: number
}

/**
 * Layer statistics for display
 */
export interface LayerStats {
  name: string
  paths: number
  depth: number
  colors: string[]
}

/**
 * Complete SVG statistics
 */
export interface SVGStatistics {
  totalNodes: number
  totalPaths: number
  totalGroups: number
  totalShapes: number
  maxDepth: number
  colorPalette: ColorStats[]
  operationCounts: Record<string, number>
  layerStats: LayerStats[]
}

/**
 * Page layout calculation result
 */
export interface PageLayout {
  printableWidth: number
  printableHeight: number
  scale: number
  scaledWidth: number
  scaledHeight: number
  offsetX: number
  offsetY: number
  insetPx: number
  croppedWidthMm: number
  croppedHeightMm: number
}

/**
 * Page dimensions in mm and px
 */
export interface PageDimensions {
  width: number
  height: number
  widthPx: number
  heightPx: number
}

/**
 * Margin values for all four sides
 */
export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Command name mapping for path commands
 */
export const COMMAND_NAMES: Record<string, string> = {
  'M': 'MoveTo',
  'L': 'LineTo',
  'H': 'HorizLineTo',
  'V': 'VertLineTo',
  'C': 'CurveTo',
  'S': 'SmoothCurve',
  'Q': 'QuadCurve',
  'T': 'SmoothQuad',
  'A': 'Arc',
  'Z': 'ClosePath',
}
