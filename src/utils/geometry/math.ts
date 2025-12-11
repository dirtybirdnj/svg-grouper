// Math utilities for geometry operations

import type { Point, Rect } from './types'

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Squared distance between two points (faster than distance() when comparing)
 */
export function distanceSquared(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return dx * dx + dy * dy
}

/**
 * Calculate signed area of polygon (positive = clockwise, negative = counter-clockwise)
 */
export function calcPolygonArea(polygon: Point[]): number {
  if (polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].x * polygon[j].y
    area -= polygon[j].x * polygon[i].y
  }
  return area / 2
}

/**
 * Calculate centroid of a polygon
 */
export function polygonCentroid(polygon: Point[]): Point {
  if (polygon.length === 0) return { x: 0, y: 0 }
  const sumX = polygon.reduce((sum, p) => sum + p.x, 0)
  const sumY = polygon.reduce((sum, p) => sum + p.y, 0)
  return { x: sumX / polygon.length, y: sumY / polygon.length }
}

/**
 * Calculate the centroid (center of mass) of a polygon
 * Alias for polygonCentroid for backward compatibility
 */
export function getCentroid(points: Point[]): Point {
  return polygonCentroid(points)
}

/**
 * Calculate the bounding box of a set of points
 */
export function getBoundingBox(points: Point[]): Rect {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * Simple point-in-polygon test (ray casting)
 */
export function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Check if polygon A is contained within polygon B using multiple sample points
 * More robust than just checking centroid for complex/concave shapes
 */
export function isPolygonContainedIn(inner: Point[], outer: Point[]): boolean {
  if (inner.length === 0 || outer.length === 0) return false

  // Sample multiple points from the inner polygon
  const samplePoints: Point[] = []

  // Add centroid
  samplePoints.push(polygonCentroid(inner))

  // Add some vertices (evenly spaced)
  const step = Math.max(1, Math.floor(inner.length / 5))
  for (let i = 0; i < inner.length; i += step) {
    samplePoints.push(inner[i])
  }

  // Count how many sample points are inside the outer polygon
  let insideCount = 0
  for (const p of samplePoints) {
    if (isPointInsidePolygon(p, outer)) insideCount++
  }

  // Consider contained if majority of samples are inside
  return insideCount > samplePoints.length / 2
}
