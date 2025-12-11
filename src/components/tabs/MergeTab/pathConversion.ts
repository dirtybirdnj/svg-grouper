// Path conversion utilities for merge operations

import { Point, PolygonWithHoles } from '../../../utils/geometry'

/**
 * Convert points to SVG path d attribute
 */
export function pointsToPathD(points: Point[]): string {
  if (points.length < 3) return ''

  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`
  }
  d += ' Z'
  return d
}

/**
 * Convert polygon with holes to compound SVG path (evenodd fill rule)
 */
export function polygonWithHolesToPathD(outer: Point[], holes: Point[][]): string {
  if (outer.length < 3) return ''

  // Start with outer boundary
  let d = `M ${outer[0].x.toFixed(2)},${outer[0].y.toFixed(2)}`
  for (let i = 1; i < outer.length; i++) {
    d += ` L ${outer[i].x.toFixed(2)},${outer[i].y.toFixed(2)}`
  }
  d += ' Z'

  // Add each hole as a separate subpath
  for (const hole of holes) {
    if (hole.length < 3) continue
    d += ` M ${hole[0].x.toFixed(2)},${hole[0].y.toFixed(2)}`
    for (let i = 1; i < hole.length; i++) {
      d += ` L ${hole[i].x.toFixed(2)},${hole[i].y.toFixed(2)}`
    }
    d += ' Z'
  }

  return d
}

/**
 * Convert multiple PolygonWithHoles to a single compound path d
 */
export function multiPolygonToPathD(polygons: PolygonWithHoles[]): string {
  return polygons.map(poly => polygonWithHolesToPathD(poly.outer, poly.holes)).join(' ')
}
