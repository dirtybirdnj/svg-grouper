// Shape utility functions for fill pattern optimization

import { Point, HatchLine } from '../geometry'
import { OrderedLine } from './types'

// Calculate the centroid of a set of lines
export function calculateShapeCentroid(lines: HatchLine[]): Point {
  if (lines.length === 0) return { x: 0, y: 0 }

  let sumX = 0
  let sumY = 0
  let count = 0

  for (const line of lines) {
    sumX += line.x1 + line.x2
    sumY += line.y1 + line.y2
    count += 2
  }

  return { x: sumX / count, y: sumY / count }
}

// Get the top-left-most point of a shape
export function getShapeTopLeft(lines: HatchLine[]): Point {
  if (lines.length === 0) return { x: Infinity, y: Infinity }

  let minX = Infinity
  let minY = Infinity

  for (const line of lines) {
    minX = Math.min(minX, line.x1, line.x2)
    minY = Math.min(minY, line.y1, line.y2)
  }

  return { x: minX, y: minY }
}

// Get the entry and exit points of a shape's optimized lines
export function getShapeEndpoints(lines: HatchLine[]): { entry: Point; exit: Point } {
  if (lines.length === 0) {
    return { entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 } }
  }
  return {
    entry: { x: lines[0].x1, y: lines[0].y1 },
    exit: { x: lines[lines.length - 1].x2, y: lines[lines.length - 1].y2 }
  }
}

// Reverse all lines in a shape (for traversing in opposite direction)
export function reverseShapeLines(lines: OrderedLine[]): OrderedLine[] {
  return lines
    .map((line) => ({
      ...line,
      x1: line.x2,
      y1: line.y2,
      x2: line.x1,
      y2: line.y1,
      reversed: !line.reversed
    }))
    .reverse()
}
