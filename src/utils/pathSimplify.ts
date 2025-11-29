// Path simplification utilities using the Ramer-Douglas-Peucker algorithm
// Uses simplify-js library for efficient path point reduction

import simplify from 'simplify-js'
import { Point, parsePathIntoSubpaths } from './geometry'

export interface SimplifyOptions {
  tolerance: number       // Distance tolerance for simplification (higher = more simplification)
  highQuality?: boolean   // Use slower but better algorithm
  preserveEndpoints?: boolean  // Keep first and last points unchanged
}

export interface SimplifyResult {
  originalPoints: number
  simplifiedPoints: number
  reductionPercent: number
  pathData: string
}

// Simplify an array of points
export function simplifyPoints(points: Point[], options: SimplifyOptions): Point[] {
  if (points.length < 3) return points

  const { tolerance, highQuality = true } = options

  // Convert to simplify-js format and back
  const simplified = simplify(
    points.map(p => ({ x: p.x, y: p.y })),
    tolerance,
    highQuality
  )

  return simplified.map(p => ({ x: p.x, y: p.y }))
}

// Convert simplified points back to SVG path data
export function pointsToPathData(points: Point[], closed: boolean = false): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`]

  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x} ${points[i].y}`)
  }

  if (closed) {
    parts.push('Z')
  }

  return parts.join(' ')
}

// Convert simplified points to optimized SVG path data (using H/V where possible)
export function pointsToOptimizedPathData(
  points: Point[],
  closed: boolean = false,
  precision: number = 2
): string {
  if (points.length === 0) return ''

  const round = (n: number) => {
    const factor = Math.pow(10, precision)
    return Math.round(n * factor) / factor
  }

  if (points.length === 1) {
    return `M${round(points[0].x)} ${round(points[0].y)}`
  }

  const parts: string[] = [`M${round(points[0].x)} ${round(points[0].y)}`]

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const dx = Math.abs(curr.x - prev.x)
    const dy = Math.abs(curr.y - prev.y)

    // Use H for horizontal lines
    if (dy < 0.001 && dx > 0.001) {
      parts.push(`H${round(curr.x)}`)
    }
    // Use V for vertical lines
    else if (dx < 0.001 && dy > 0.001) {
      parts.push(`V${round(curr.y)}`)
    }
    // Use L for diagonal lines
    else if (dx > 0.001 || dy > 0.001) {
      parts.push(`L${round(curr.x)} ${round(curr.y)}`)
    }
    // Skip if point is effectively the same
  }

  if (closed) {
    parts.push('Z')
  }

  return parts.join('')
}

// Simplify an SVG path element and return the result
export function simplifyPathElement(
  element: Element,
  options: SimplifyOptions
): SimplifyResult | null {
  const d = element.getAttribute('d')
  if (!d) return null

  const subpaths = parsePathIntoSubpaths(d)
  if (subpaths.length === 0) return null

  let originalTotal = 0
  let simplifiedTotal = 0
  const simplifiedSubpaths: string[] = []

  for (const subpath of subpaths) {
    originalTotal += subpath.length

    const simplified = simplifyPoints(subpath, options)
    simplifiedTotal += simplified.length

    // Check if path appears closed (first point ~= last point)
    const isClosed = subpath.length >= 3 &&
      Math.abs(subpath[0].x - subpath[subpath.length - 1].x) < 0.1 &&
      Math.abs(subpath[0].y - subpath[subpath.length - 1].y) < 0.1

    simplifiedSubpaths.push(pointsToOptimizedPathData(simplified, isClosed))
  }

  const pathData = simplifiedSubpaths.join(' ')
  const reductionPercent = originalTotal > 0
    ? Math.round((1 - simplifiedTotal / originalTotal) * 100)
    : 0

  return {
    originalPoints: originalTotal,
    simplifiedPoints: simplifiedTotal,
    reductionPercent,
    pathData
  }
}

// Count total points in a path element
export function countPathPoints(element: Element): number {
  const d = element.getAttribute('d')
  if (!d) return 0

  const subpaths = parsePathIntoSubpaths(d)
  return subpaths.reduce((total, subpath) => total + subpath.length, 0)
}

// Simplify all paths in a group recursively
export function simplifyGroup(
  element: Element,
  options: SimplifyOptions
): { totalOriginal: number; totalSimplified: number } {
  let totalOriginal = 0
  let totalSimplified = 0

  const paths = element.querySelectorAll('path')

  for (const path of paths) {
    const result = simplifyPathElement(path, options)
    if (result) {
      totalOriginal += result.originalPoints
      totalSimplified += result.simplifiedPoints
      path.setAttribute('d', result.pathData)
    }
  }

  // Also handle polylines
  const polylines = element.querySelectorAll('polyline, polygon')
  for (const poly of polylines) {
    const pointsAttr = poly.getAttribute('points')
    if (!pointsAttr) continue

    const pairs = pointsAttr.trim().split(/[\s,]+/)
    const points: Point[] = []
    for (let i = 0; i < pairs.length - 1; i += 2) {
      points.push({ x: parseFloat(pairs[i]), y: parseFloat(pairs[i + 1]) })
    }

    totalOriginal += points.length
    const simplified = simplifyPoints(points, options)
    totalSimplified += simplified.length

    const newPoints = simplified.map(p => `${p.x},${p.y}`).join(' ')
    poly.setAttribute('points', newPoints)
  }

  return { totalOriginal, totalSimplified }
}

// Preset tolerance levels for common use cases
export const SIMPLIFY_PRESETS = {
  minimal: 0.1,    // Barely noticeable - good for detailed work
  light: 0.5,      // Slight reduction - good balance
  moderate: 1.0,   // Noticeable reduction - good for pen plotters
  aggressive: 2.0, // Significant reduction - may affect quality
  extreme: 5.0     // Maximum reduction - for rough previews
} as const

export type SimplifyPreset = keyof typeof SIMPLIFY_PRESETS
