// Rectangular clipping functions (for cropping)

import type { Point, Rect, HatchLine, PolygonWithHoles } from './types'

// Cohen-Sutherland outcodes
const INSIDE = 0
const LEFT = 1
const RIGHT = 2
const BOTTOM = 4
const TOP = 8

function computeOutCode(x: number, y: number, rect: Rect): number {
  let code = INSIDE
  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  if (x < xMin) code |= LEFT
  else if (x > xMax) code |= RIGHT
  if (y < yMin) code |= TOP
  else if (y > yMax) code |= BOTTOM

  return code
}

/**
 * Cohen-Sutherland line clipping algorithm
 * Clips a line segment to a rectangle
 * @returns The clipped line or null if completely outside
 */
export function clipLineToRect(line: HatchLine, rect: Rect): HatchLine | null {
  let x0 = line.x1
  let y0 = line.y1
  let x1 = line.x2
  let y1 = line.y2

  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  let outcode0 = computeOutCode(x0, y0, rect)
  let outcode1 = computeOutCode(x1, y1, rect)

  while (true) {
    if ((outcode0 | outcode1) === 0) {
      // Both points inside, accept
      return { x1: x0, y1: y0, x2: x1, y2: y1 }
    } else if ((outcode0 & outcode1) !== 0) {
      // Both points share an outside region, reject
      return null
    } else {
      // Line needs clipping
      const outcodeOut = outcode0 !== 0 ? outcode0 : outcode1
      let x: number = 0
      let y: number = 0

      if (outcodeOut & BOTTOM) {
        x = x0 + (x1 - x0) * (yMax - y0) / (y1 - y0)
        y = yMax
      } else if (outcodeOut & TOP) {
        x = x0 + (x1 - x0) * (yMin - y0) / (y1 - y0)
        y = yMin
      } else if (outcodeOut & RIGHT) {
        y = y0 + (y1 - y0) * (xMax - x0) / (x1 - x0)
        x = xMax
      } else if (outcodeOut & LEFT) {
        y = y0 + (y1 - y0) * (xMin - x0) / (x1 - x0)
        x = xMin
      }

      if (outcodeOut === outcode0) {
        x0 = x
        y0 = y
        outcode0 = computeOutCode(x0, y0, rect)
      } else {
        x1 = x
        y1 = y
        outcode1 = computeOutCode(x1, y1, rect)
      }
    }
  }
}

/**
 * Clip an array of lines to a rectangle
 * @returns Array of clipped lines (empty for lines completely outside)
 */
export function clipLinesToRect(lines: HatchLine[], rect: Rect): HatchLine[] {
  const result: HatchLine[] = []
  for (const line of lines) {
    const clipped = clipLineToRect(line, rect)
    if (clipped) {
      result.push(clipped)
    }
  }
  return result
}

/**
 * Helper for Sutherland-Hodgman: clip polygon against a single edge
 */
function clipPolygonAgainstEdge(
  polygon: Point[],
  isInside: (p: Point) => boolean,
  intersect: (p1: Point, p2: Point) => Point
): Point[] {
  const output: Point[] = []
  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const current = polygon[i]
    const next = polygon[(i + 1) % n]
    const currentInside = isInside(current)
    const nextInside = isInside(next)

    if (currentInside) {
      output.push(current)
      if (!nextInside) {
        // Exiting
        output.push(intersect(current, next))
      }
    } else if (nextInside) {
      // Entering
      output.push(intersect(current, next))
    }
  }

  return output
}

/**
 * Sutherland-Hodgman polygon clipping algorithm
 * Clips a polygon to a rectangle
 * @returns The clipped polygon vertices (may be empty if completely outside)
 */
export function clipPolygonToRect(polygon: Point[], rect: Rect): Point[] {
  if (polygon.length < 3) return []

  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  // Clip against each edge in sequence
  let output = polygon

  // Left edge
  output = clipPolygonAgainstEdge(output, (p) => p.x >= xMin, (p1, p2) => {
    const t = (xMin - p1.x) / (p2.x - p1.x)
    return { x: xMin, y: p1.y + t * (p2.y - p1.y) }
  })
  if (output.length === 0) return []

  // Right edge
  output = clipPolygonAgainstEdge(output, (p) => p.x <= xMax, (p1, p2) => {
    const t = (xMax - p1.x) / (p2.x - p1.x)
    return { x: xMax, y: p1.y + t * (p2.y - p1.y) }
  })
  if (output.length === 0) return []

  // Top edge
  output = clipPolygonAgainstEdge(output, (p) => p.y >= yMin, (p1, p2) => {
    const t = (yMin - p1.y) / (p2.y - p1.y)
    return { x: p1.x + t * (p2.x - p1.x), y: yMin }
  })
  if (output.length === 0) return []

  // Bottom edge
  output = clipPolygonAgainstEdge(output, (p) => p.y <= yMax, (p1, p2) => {
    const t = (yMax - p1.y) / (p2.y - p1.y)
    return { x: p1.x + t * (p2.x - p1.x), y: yMax }
  })

  return output
}

/**
 * Clip a PolygonWithHoles to a rectangle
 * @returns Clipped polygon with holes (both outer and holes are clipped)
 */
export function clipPolygonWithHolesToRect(polygon: PolygonWithHoles, rect: Rect): PolygonWithHoles {
  const clippedOuter = clipPolygonToRect(polygon.outer, rect)
  if (clippedOuter.length < 3) {
    return { outer: [], holes: [] }
  }

  const clippedHoles: Point[][] = []
  for (const hole of polygon.holes) {
    const clippedHole = clipPolygonToRect(hole, rect)
    if (clippedHole.length >= 3) {
      clippedHoles.push(clippedHole)
    }
  }

  return { outer: clippedOuter, holes: clippedHoles }
}
