// SVG element to polygon conversion utilities

import type { Point, PolygonWithHoles, SubpathMode, HatchLine } from './types'
import { parsePathIntoSubpaths } from './pathParsing'
import { getPolygonsFromSubpaths, getPolygonsFromSubpathsNested } from './polygonAnalysis'

/**
 * Get polygon points from an SVG element (returns first/largest polygon only)
 * For compound paths with disconnected regions, use getAllPolygonsFromElement instead
 */
export function getPolygonPoints(element: Element): PolygonWithHoles {
  const polygons = getAllPolygonsFromElement(element)
  return polygons.length > 0 ? polygons[0] : { outer: [], holes: [] }
}

/**
 * Get ALL polygons from an SVG element (handles compound paths with disconnected regions)
 * subpathMode controls how nested shapes are handled:
 *   'default' - inner shapes are holes (excluded from fill)
 *   'independent' - each subpath filled separately (ignores nesting)
 *   'nested' - all regions filled (outer with holes + each inner region)
 */
export function getAllPolygonsFromElement(element: Element, subpathMode: SubpathMode = 'default'): PolygonWithHoles[] {
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'polygon') {
    const points: Point[] = []
    const pointsAttr = element.getAttribute('points') || ''
    const pairs = pointsAttr.trim().split(/[\s,]+/)
    for (let i = 0; i < pairs.length - 1; i += 2) {
      points.push({ x: parseFloat(pairs[i]), y: parseFloat(pairs[i + 1]) })
    }
    return [{ outer: points, holes: [] }]
  }

  if (tagName === 'polyline') {
    const points: Point[] = []
    const pointsAttr = element.getAttribute('points') || ''
    const pairs = pointsAttr.trim().split(/[\s,]+/)
    for (let i = 0; i < pairs.length - 1; i += 2) {
      points.push({ x: parseFloat(pairs[i]), y: parseFloat(pairs[i + 1]) })
    }
    if (points.length >= 2) {
      const first = points[0]
      const last = points[points.length - 1]
      const dist = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2))
      if (dist > 1) {
        points.push({ x: first.x, y: first.y })
      }
    }
    return [{ outer: points, holes: [] }]
  }

  if (tagName === 'rect') {
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const w = parseFloat(element.getAttribute('width') || '0')
    const h = parseFloat(element.getAttribute('height') || '0')
    return [{ outer: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], holes: [] }]
  }

  if (tagName === 'path') {
    const d = element.getAttribute('d') || ''
    const subpaths = parsePathIntoSubpaths(d)
    if (subpaths.length === 0) return []
    if (subpaths.length === 1) return [{ outer: subpaths[0], holes: [] }]

    // Handle different modes
    if (subpathMode === 'independent') {
      return subpaths.map(sp => ({ outer: sp, holes: [] }))
    } else if (subpathMode === 'nested') {
      return getPolygonsFromSubpathsNested(subpaths)
    }

    // Default: Use the function that detects holes based on containment
    return getPolygonsFromSubpaths(subpaths)
  }

  if (tagName === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const r = parseFloat(element.getAttribute('r') || '0')
    const points: Point[] = []
    const segments = 32
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
    return [{ outer: points, holes: [] }]
  }

  if (tagName === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const rx = parseFloat(element.getAttribute('rx') || '0')
    const ry = parseFloat(element.getAttribute('ry') || '0')
    const points: Point[] = []
    const segments = 32
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
    }
    return [{ outer: points, holes: [] }]
  }

  return []
}

/**
 * Convert an array of HatchLines to a compound path d attribute string.
 * This combines multiple line segments into a single path with M/L commands,
 * reducing element count significantly (important for Cricut compatibility).
 */
export function linesToCompoundPath(lines: HatchLine[], precision: number = 2): string {
  if (lines.length === 0) return ''

  const commands: string[] = []

  for (const line of lines) {
    commands.push(
      `M${line.x1.toFixed(precision)},${line.y1.toFixed(precision)} L${line.x2.toFixed(precision)},${line.y2.toFixed(precision)}`
    )
  }

  return commands.join(' ')
}
