// Geometry calculations for path analysis

import { Point } from '../geometry'

/**
 * Calculate winding direction using shoelace formula
 * Positive = CCW, Negative = CW
 */
export function getWindingDirection(points: Point[]): 'CW' | 'CCW' {
  if (points.length < 3) return 'CW'

  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += (points[j].x - points[i].x) * (points[j].y + points[i].y)
  }

  return sum > 0 ? 'CW' : 'CCW'
}

/**
 * Calculate polygon area using shoelace formula
 */
export function calculateArea(points: Point[]): number {
  if (points.length < 3) return 0

  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }

  return Math.abs(area / 2)
}

/**
 * Calculate bounding box of points
 */
export function getBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Reverse the winding direction of a path
 */
export function reversePathWinding(points: Point[]): Point[] {
  return [...points].reverse()
}

/**
 * Convert points back to SVG path d string
 */
export function pointsToPathD(points: Point[], close: boolean = true): string {
  if (points.length === 0) return ''

  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x},${points[i].y}`
  }
  if (close) d += ' Z'

  return d
}
