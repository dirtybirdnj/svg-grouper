// Element intersection checking for crop operations

import { Point, Rect } from '../geometry'
import { pathToSubpaths, getPolygonPoints } from './pathParsing'

// Check if polygon intersects with crop rect (using bounding box)
export function polygonIntersectsCrop(points: Point[], cropRect: Rect): boolean {
  if (points.length < 2) return false

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  if (maxX < cropRect.x || minX > cropRect.x + cropRect.width ||
      maxY < cropRect.y || minY > cropRect.y + cropRect.height) {
    return false
  }

  return true
}

// Check if element is within or intersects crop region
export function elementIntersectsCrop(elem: Element, cropRect: Rect): boolean {
  const tagName = elem.tagName.toLowerCase()

  if (tagName === 'path') {
    const d = elem.getAttribute('d')
    if (!d) return false
    const subpaths = pathToSubpaths(d)
    const points = subpaths.flat()
    return polygonIntersectsCrop(points, cropRect)
  }

  if (tagName === 'polygon' || tagName === 'polyline') {
    const points = getPolygonPoints(elem)
    return polygonIntersectsCrop(points, cropRect)
  }

  if (tagName === 'rect') {
    const x = parseFloat(elem.getAttribute('x') || '0')
    const y = parseFloat(elem.getAttribute('y') || '0')
    const w = parseFloat(elem.getAttribute('width') || '0')
    const h = parseFloat(elem.getAttribute('height') || '0')
    return !(x + w < cropRect.x || x > cropRect.x + cropRect.width ||
             y + h < cropRect.y || y > cropRect.y + cropRect.height)
  }

  if (tagName === 'circle') {
    const cx = parseFloat(elem.getAttribute('cx') || '0')
    const cy = parseFloat(elem.getAttribute('cy') || '0')
    const r = parseFloat(elem.getAttribute('r') || '0')
    return !(cx + r < cropRect.x || cx - r > cropRect.x + cropRect.width ||
             cy + r < cropRect.y || cy - r > cropRect.y + cropRect.height)
  }

  if (tagName === 'ellipse') {
    const cx = parseFloat(elem.getAttribute('cx') || '0')
    const cy = parseFloat(elem.getAttribute('cy') || '0')
    const rx = parseFloat(elem.getAttribute('rx') || '0')
    const ry = parseFloat(elem.getAttribute('ry') || '0')
    return !(cx + rx < cropRect.x || cx - rx > cropRect.x + cropRect.width ||
             cy + ry < cropRect.y || cy - ry > cropRect.y + cropRect.height)
  }

  if (tagName === 'line') {
    const x1 = parseFloat(elem.getAttribute('x1') || '0')
    const y1 = parseFloat(elem.getAttribute('y1') || '0')
    const x2 = parseFloat(elem.getAttribute('x2') || '0')
    const y2 = parseFloat(elem.getAttribute('y2') || '0')

    const lineMinX = Math.min(x1, x2)
    const lineMaxX = Math.max(x1, x2)
    const lineMinY = Math.min(y1, y2)
    const lineMaxY = Math.max(y1, y2)

    return !(lineMaxX < cropRect.x || lineMinX > cropRect.x + cropRect.width ||
             lineMaxY < cropRect.y || lineMinY > cropRect.y + cropRect.height)
  }

  return true
}
