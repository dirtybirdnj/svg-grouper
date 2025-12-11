// ViewBox parsing and analysis utilities

import { ViewBox } from './types'

/**
 * Parse viewBox attribute
 */
export function parseViewBox(viewBoxAttr: string | null): ViewBox | null {
  if (!viewBoxAttr) return null

  // ViewBox can be comma or space separated
  const parts = viewBoxAttr.trim().split(/[\s,]+/).map(parseFloat)

  if (parts.length !== 4 || parts.some(isNaN)) {
    return null
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3]
  }
}

/**
 * Calculate aspect ratio from viewBox
 */
export function getViewBoxAspectRatio(viewBox: ViewBox | null): number | null {
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
    return null
  }
  return viewBox.width / viewBox.height
}

/**
 * Check if viewBox has non-zero origin
 */
export function hasNonZeroOrigin(viewBox: ViewBox | null): boolean {
  return viewBox !== null && (viewBox.minX !== 0 || viewBox.minY !== 0)
}

/**
 * Check if viewBox has negative coordinates
 */
export function hasNegativeCoordinates(viewBox: ViewBox | null): boolean {
  return viewBox !== null && viewBox.minY < 0
}

/**
 * Format viewBox as string
 */
export function formatViewBox(viewBox: ViewBox): string {
  return `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
}

/**
 * Create a normalized viewBox (starting at 0,0)
 */
export function normalizeViewBox(viewBox: ViewBox): ViewBox {
  return {
    minX: 0,
    minY: 0,
    width: viewBox.width,
    height: viewBox.height
  }
}
