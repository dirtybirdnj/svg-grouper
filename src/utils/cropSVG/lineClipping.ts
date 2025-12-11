// Cohen-Sutherland line clipping algorithm for polylines

import { Point, Rect } from '../geometry'

// Outcodes for Cohen-Sutherland algorithm
const INSIDE = 0
const LEFT = 1
const RIGHT = 2
const BOTTOM = 4
const TOP = 8

// Compute outcode for a point relative to a rectangle
function computeOutCode(x: number, y: number, rect: Rect): number {
  let code = INSIDE
  if (x < rect.x) code |= LEFT
  else if (x > rect.x + rect.width) code |= RIGHT
  if (y < rect.y) code |= TOP
  else if (y > rect.y + rect.height) code |= BOTTOM
  return code
}

// Clip a single line segment to a rectangle
// Returns the clipped segment or null if completely outside
export function clipLineSegment(
  x1: number, y1: number,
  x2: number, y2: number,
  cropRect: Rect
): Point[] | null {
  let outcode1 = computeOutCode(x1, y1, cropRect)
  let outcode2 = computeOutCode(x2, y2, cropRect)
  let cx1 = x1, cy1 = y1, cx2 = x2, cy2 = y2

  while (true) {
    if ((outcode1 | outcode2) === 0) {
      // Both inside
      return [{ x: cx1, y: cy1 }, { x: cx2, y: cy2 }]
    } else if ((outcode1 & outcode2) !== 0) {
      // Both outside same edge
      return null
    } else {
      const outcodeOut = outcode1 !== 0 ? outcode1 : outcode2
      let x = 0, y = 0
      if (outcodeOut & BOTTOM) {
        x = cx1 + (cx2 - cx1) * (cropRect.y + cropRect.height - cy1) / (cy2 - cy1)
        y = cropRect.y + cropRect.height
      } else if (outcodeOut & TOP) {
        x = cx1 + (cx2 - cx1) * (cropRect.y - cy1) / (cy2 - cy1)
        y = cropRect.y
      } else if (outcodeOut & RIGHT) {
        y = cy1 + (cy2 - cy1) * (cropRect.x + cropRect.width - cx1) / (cx2 - cx1)
        x = cropRect.x + cropRect.width
      } else if (outcodeOut & LEFT) {
        y = cy1 + (cy2 - cy1) * (cropRect.x - cx1) / (cx2 - cx1)
        x = cropRect.x
      }
      if (outcodeOut === outcode1) {
        cx1 = x; cy1 = y
        outcode1 = computeOutCode(cx1, cy1, cropRect)
      } else {
        cx2 = x; cy2 = y
        outcode2 = computeOutCode(cx2, cy2, cropRect)
      }
    }
  }
}

// Clip an open polyline to a rectangle using Cohen-Sutherland style clipping
// Returns multiple line segments (the polyline may be split into multiple pieces)
export function clipPolylineToRect(points: Point[], cropRect: Rect): Point[][] {
  if (points.length < 2) return []

  // Clip each segment and collect results
  const resultSegments: Point[][] = []
  let currentRun: Point[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipLineSegment(
      points[i].x, points[i].y,
      points[i + 1].x, points[i + 1].y,
      cropRect
    )
    if (clipped) {
      if (currentRun.length === 0) {
        currentRun.push(clipped[0], clipped[1])
      } else {
        // Check if this segment continues from the previous one
        const lastPoint = currentRun[currentRun.length - 1]
        const dist = Math.abs(lastPoint.x - clipped[0].x) + Math.abs(lastPoint.y - clipped[0].y)
        if (dist < 0.01) {
          // Continues - just add the end point
          currentRun.push(clipped[1])
        } else {
          // Discontinuity - start new segment
          if (currentRun.length >= 2) {
            resultSegments.push(currentRun)
          }
          currentRun = [clipped[0], clipped[1]]
        }
      }
    } else {
      // Segment fully outside - end current run
      if (currentRun.length >= 2) {
        resultSegments.push(currentRun)
      }
      currentRun = []
    }
  }

  // Don't forget the last run
  if (currentRun.length >= 2) {
    resultSegments.push(currentRun)
  }

  return resultSegments
}
