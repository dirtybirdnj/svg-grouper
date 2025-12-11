// Element clipping and transformation for crop operations

import { Point, Rect, clipPolygonToRect } from '../geometry'
import { pathToSubpathsWithMetadata, polygonToPath, polylineToPath, getPolygonPoints } from './pathParsing'
import { clipPolylineToRect, clipLineSegment } from './lineClipping'

// Clip and transform element
export function clipElement(elem: Element, cropRect: Rect, doc: Document): void {
  const tagName = elem.tagName.toLowerCase()

  if (tagName === 'path') {
    clipPathElement(elem, cropRect)
  } else if (tagName === 'polygon') {
    clipPolygonElement(elem, cropRect)
  } else if (tagName === 'rect') {
    clipRectElement(elem, cropRect)
  } else if (tagName === 'circle' || tagName === 'ellipse') {
    clipCircleOrEllipseElement(elem, cropRect, doc, tagName)
  } else if (tagName === 'line') {
    clipLineElement(elem, cropRect)
  } else if (tagName === 'polyline') {
    clipPolylineElement(elem, cropRect)
  }
}

function clipPathElement(elem: Element, cropRect: Rect): void {
  const d = elem.getAttribute('d')
  if (!d) return

  const subpaths = pathToSubpathsWithMetadata(d)
  if (subpaths.length === 0) return

  const resultParts: string[] = []

  for (const { points, isClosed } of subpaths) {
    if (points.length < 2) continue

    if (isClosed && points.length >= 3) {
      // Closed path - use polygon clipping
      const clipped = clipPolygonToRect(points, cropRect)
      if (clipped.length >= 3) {
        const translated = clipped.map(p => ({
          x: p.x - cropRect.x,
          y: p.y - cropRect.y
        }))
        resultParts.push(polygonToPath(translated))
      }
    } else {
      // Open path - use polyline clipping (contour lines, strokes, etc.)
      const clippedSegments = clipPolylineToRect(points, cropRect)
      for (const segment of clippedSegments) {
        const translated = segment.map(p => ({
          x: p.x - cropRect.x,
          y: p.y - cropRect.y
        }))
        resultParts.push(polylineToPath(translated))
      }
    }
  }

  if (resultParts.length === 0) {
    elem.parentNode?.removeChild(elem)
    return
  }

  elem.setAttribute('d', resultParts.join(' '))
}

function clipPolygonElement(elem: Element, cropRect: Rect): void {
  const points = getPolygonPoints(elem)
  if (points.length < 3) return

  const clipped = clipPolygonToRect(points, cropRect)
  if (clipped.length < 3) {
    elem.parentNode?.removeChild(elem)
    return
  }

  const translated = clipped.map(p => ({
    x: p.x - cropRect.x,
    y: p.y - cropRect.y
  }))
  elem.setAttribute('points', translated.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '))
}

function clipRectElement(elem: Element, cropRect: Rect): void {
  const x = parseFloat(elem.getAttribute('x') || '0')
  const y = parseFloat(elem.getAttribute('y') || '0')
  const w = parseFloat(elem.getAttribute('width') || '0')
  const h = parseFloat(elem.getAttribute('height') || '0')

  const newX = Math.max(x, cropRect.x)
  const newY = Math.max(y, cropRect.y)
  const newX2 = Math.min(x + w, cropRect.x + cropRect.width)
  const newY2 = Math.min(y + h, cropRect.y + cropRect.height)

  if (newX2 <= newX || newY2 <= newY) {
    elem.parentNode?.removeChild(elem)
    return
  }

  elem.setAttribute('x', String(newX - cropRect.x))
  elem.setAttribute('y', String(newY - cropRect.y))
  elem.setAttribute('width', String(newX2 - newX))
  elem.setAttribute('height', String(newY2 - newY))
}

function clipCircleOrEllipseElement(
  elem: Element,
  cropRect: Rect,
  doc: Document,
  tagName: string
): void {
  const cx = parseFloat(elem.getAttribute('cx') || '0')
  const cy = parseFloat(elem.getAttribute('cy') || '0')
  let rx: number, ry: number
  if (tagName === 'circle') {
    rx = ry = parseFloat(elem.getAttribute('r') || '0')
  } else {
    rx = parseFloat(elem.getAttribute('rx') || '0')
    ry = parseFloat(elem.getAttribute('ry') || '0')
  }

  const numPoints = 36
  const points: Point[] = []
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2
    points.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle)
    })
  }

  const clipped = clipPolygonToRect(points, cropRect)
  if (clipped.length < 3) {
    elem.parentNode?.removeChild(elem)
    return
  }

  const translated = clipped.map(p => ({
    x: p.x - cropRect.x,
    y: p.y - cropRect.y
  }))
  const pathD = polygonToPath(translated)

  const pathElem = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  pathElem.setAttribute('d', pathD)

  for (const attr of Array.from(elem.attributes)) {
    if (!['cx', 'cy', 'r', 'rx', 'ry'].includes(attr.name)) {
      pathElem.setAttribute(attr.name, attr.value)
    }
  }

  elem.parentNode?.replaceChild(pathElem, elem)
}

function clipLineElement(elem: Element, cropRect: Rect): void {
  const x1 = parseFloat(elem.getAttribute('x1') || '0')
  const y1 = parseFloat(elem.getAttribute('y1') || '0')
  const x2 = parseFloat(elem.getAttribute('x2') || '0')
  const y2 = parseFloat(elem.getAttribute('y2') || '0')

  const clipped = clipLineSegment(x1, y1, x2, y2, cropRect)

  if (!clipped) {
    elem.parentNode?.removeChild(elem)
  } else {
    elem.setAttribute('x1', String(clipped[0].x - cropRect.x))
    elem.setAttribute('y1', String(clipped[0].y - cropRect.y))
    elem.setAttribute('x2', String(clipped[1].x - cropRect.x))
    elem.setAttribute('y2', String(clipped[1].y - cropRect.y))
  }
}

function clipPolylineElement(elem: Element, cropRect: Rect): void {
  const points = getPolygonPoints(elem)
  if (points.length < 2) return

  const translated = points
    .filter(p =>
      p.x >= cropRect.x && p.x <= cropRect.x + cropRect.width &&
      p.y >= cropRect.y && p.y <= cropRect.y + cropRect.height
    )
    .map(p => ({
      x: p.x - cropRect.x,
      y: p.y - cropRect.y
    }))

  if (translated.length < 2) {
    elem.parentNode?.removeChild(elem)
    return
  }

  elem.setAttribute('points', translated.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '))
}
