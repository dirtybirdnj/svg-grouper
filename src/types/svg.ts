/**
 * Tracks what optimization steps have been applied to a node.
 * Used for visual indicators and workflow guidance.
 */
export interface OptimizationState {
  /** Fill pattern was applied */
  fillApplied?: {
    pattern: string        // 'lines', 'crosshatch', 'spiral', etc.
    lineCount: number      // Number of fill lines generated
    timestamp: number      // When the fill was applied
  }
  /** Path order optimization was applied */
  orderOptimized?: {
    improvement: number    // % travel distance saved
    timestamp: number      // When optimization was applied
  }
}

export interface SVGNode {
  id: string
  type: string
  name: string
  element: Element
  children: SVGNode[]
  isGroup: boolean
  isHidden?: boolean
  // Custom SVG markup to render instead of the original element (used for line fill)
  customMarkup?: string
  // Color of fill lines when customMarkup is used (for color swatch display)
  fillColor?: string
  // Tracks optimization steps applied to this node
  optimizationState?: OptimizationState
}
