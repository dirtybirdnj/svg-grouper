import { clipPolygonToRect, Rect, Point } from './geometry'
import { analyzeSVGDimensions } from './svgDimensions'

/**
 * Crop SVG utility functions
 * Extracted from SortTab for modularity
 */

// Subpath with metadata about whether it was closed
interface ParsedSubpath {
  points: Point[]
  isClosed: boolean
}

// Parse path d attribute to multiple subpaths, tracking open vs closed
function pathToSubpathsWithMetadata(d: string): ParsedSubpath[] {
  const subpaths: ParsedSubpath[] = []
  let currentSubpath: Point[] = []
  let currentIsClosed = false
  const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || []
  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0

  const saveCurrentSubpath = () => {
    if (currentSubpath.length >= 2) {
      subpaths.push({ points: currentSubpath, isClosed: currentIsClosed })
    }
  }

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase()
    const isRelative = cmd[0] === cmd[0].toLowerCase()
    const values = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    switch (type) {
      case 'M':
        saveCurrentSubpath()
        currentSubpath = []
        currentIsClosed = false

        if (isRelative && subpaths.length > 0) {
          currentX += values[0]
          currentY += values[1]
        } else {
          currentX = values[0]
          currentY = values[1]
        }
        startX = currentX
        startY = currentY
        currentSubpath.push({ x: currentX, y: currentY })
        for (let i = 2; i < values.length; i += 2) {
          if (isRelative) {
            currentX += values[i]
            currentY += values[i + 1]
          } else {
            currentX = values[i]
            currentY = values[i + 1]
          }
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'L':
        for (let i = 0; i < values.length; i += 2) {
          if (isRelative) {
            currentX += values[i]
            currentY += values[i + 1]
          } else {
            currentX = values[i]
            currentY = values[i + 1]
          }
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'H':
        for (const v of values) {
          currentX = isRelative ? currentX + v : v
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'V':
        for (const v of values) {
          currentY = isRelative ? currentY + v : v
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'Z':
        currentIsClosed = true
        currentX = startX
        currentY = startY
        break
      case 'C':
        for (let i = 0; i < values.length; i += 6) {
          const x1 = isRelative ? currentX + values[i] : values[i]
          const y1 = isRelative ? currentY + values[i + 1] : values[i + 1]
          const x2 = isRelative ? currentX + values[i + 2] : values[i + 2]
          const y2 = isRelative ? currentY + values[i + 3] : values[i + 3]
          const x = isRelative ? currentX + values[i + 4] : values[i + 4]
          const y = isRelative ? currentY + values[i + 5] : values[i + 5]
          // Sample at 20 points for better curve accuracy
          for (let t = 0.05; t <= 1; t += 0.05) {
            const mt = 1 - t
            const px = mt * mt * mt * currentX + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x
            const py = mt * mt * mt * currentY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x
          currentY = y
        }
        break
      case 'Q':
        for (let i = 0; i < values.length; i += 4) {
          const x1 = isRelative ? currentX + values[i] : values[i]
          const y1 = isRelative ? currentY + values[i + 1] : values[i + 1]
          const x = isRelative ? currentX + values[i + 2] : values[i + 2]
          const y = isRelative ? currentY + values[i + 3] : values[i + 3]
          // Sample at 20 points for better curve accuracy
          for (let t = 0.05; t <= 1; t += 0.05) {
            const mt = 1 - t
            const px = mt * mt * currentX + 2 * mt * t * x1 + t * t * x
            const py = mt * mt * currentY + 2 * mt * t * y1 + t * t * y
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x
          currentY = y
        }
        break
      case 'A':
        for (let i = 0; i < values.length; i += 7) {
          const endX = isRelative ? currentX + values[i + 5] : values[i + 5]
          const endY = isRelative ? currentY + values[i + 6] : values[i + 6]
          // Sample at 20 points for better arc accuracy
          for (let t = 0.05; t <= 1; t += 0.05) {
            currentSubpath.push({
              x: currentX + (endX - currentX) * t,
              y: currentY + (endY - currentY) * t
            })
          }
          currentX = endX
          currentY = endY
        }
        break
    }
  }

  saveCurrentSubpath()
  return subpaths
}

// Legacy function for backward compatibility
function pathToSubpaths(d: string): Point[][] {
  return pathToSubpathsWithMetadata(d).map(sp => sp.points)
}

// Convert polygon points back to path d attribute (closed path)
function polygonToPath(points: Point[]): string {
  if (points.length < 3) return ''
  const pathParts = points.map((p, i) =>
    i === 0 ? `M${p.x.toFixed(2)},${p.y.toFixed(2)}` : `L${p.x.toFixed(2)},${p.y.toFixed(2)}`
  )
  pathParts.push('Z')
  return pathParts.join('')
}

// Convert polyline points to path d attribute (open path - no Z)
function polylineToPath(points: Point[]): string {
  if (points.length < 2) return ''
  return points.map((p, i) =>
    i === 0 ? `M${p.x.toFixed(2)},${p.y.toFixed(2)}` : `L${p.x.toFixed(2)},${p.y.toFixed(2)}`
  ).join('')
}

// Clip an open polyline to a rectangle using Cohen-Sutherland style clipping
// Returns multiple line segments (the polyline may be split into multiple pieces)
function clipPolylineToRect(points: Point[], cropRect: Rect): Point[][] {
  if (points.length < 2) return []

  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8
  const computeOutCode = (x: number, y: number) => {
    let code = INSIDE
    if (x < cropRect.x) code |= LEFT
    else if (x > cropRect.x + cropRect.width) code |= RIGHT
    if (y < cropRect.y) code |= TOP
    else if (y > cropRect.y + cropRect.height) code |= BOTTOM
    return code
  }

  const clipSegment = (x1: number, y1: number, x2: number, y2: number): Point[] | null => {
    let outcode1 = computeOutCode(x1, y1)
    let outcode2 = computeOutCode(x2, y2)
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
          outcode1 = computeOutCode(cx1, cy1)
        } else {
          cx2 = x; cy2 = y
          outcode2 = computeOutCode(cx2, cy2)
        }
      }
    }
  }

  // Clip each segment and collect results
  const resultSegments: Point[][] = []
  let currentRun: Point[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
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

// Get points from polygon element
function getPolygonPoints(elem: Element): Point[] {
  const pointsAttr = elem.getAttribute('points') || ''
  const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)
  const points: Point[] = []
  for (let i = 0; i < coords.length; i += 2) {
    if (!isNaN(coords[i]) && !isNaN(coords[i + 1])) {
      points.push({ x: coords[i], y: coords[i + 1] })
    }
  }
  return points
}

// Check if polygon intersects with crop rect (using bounding box)
function polygonIntersectsCrop(points: Point[], cropRect: Rect): boolean {
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
function elementIntersectsCrop(elem: Element, cropRect: Rect): boolean {
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

// Clip and transform element
function clipElement(elem: Element, cropRect: Rect, doc: Document): void {
  const tagName = elem.tagName.toLowerCase()

  if (tagName === 'path') {
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
  } else if (tagName === 'polygon') {
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
  } else if (tagName === 'rect') {
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
  } else if (tagName === 'circle' || tagName === 'ellipse') {
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
  } else if (tagName === 'line') {
    const x1 = parseFloat(elem.getAttribute('x1') || '0')
    const y1 = parseFloat(elem.getAttribute('y1') || '0')
    const x2 = parseFloat(elem.getAttribute('x2') || '0')
    const y2 = parseFloat(elem.getAttribute('y2') || '0')

    const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8
    const computeOutCode = (x: number, y: number) => {
      let code = INSIDE
      if (x < cropRect.x) code |= LEFT
      else if (x > cropRect.x + cropRect.width) code |= RIGHT
      if (y < cropRect.y) code |= TOP
      else if (y > cropRect.y + cropRect.height) code |= BOTTOM
      return code
    }

    let cx1 = x1, cy1 = y1, cx2 = x2, cy2 = y2
    let outcode1 = computeOutCode(cx1, cy1)
    let outcode2 = computeOutCode(cx2, cy2)
    let accept = false

    while (true) {
      if ((outcode1 | outcode2) === 0) {
        accept = true
        break
      } else if ((outcode1 & outcode2) !== 0) {
        break
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
          outcode1 = computeOutCode(cx1, cy1)
        } else {
          cx2 = x; cy2 = y
          outcode2 = computeOutCode(cx2, cy2)
        }
      }
    }

    if (!accept) {
      elem.parentNode?.removeChild(elem)
    } else {
      elem.setAttribute('x1', String(cx1 - cropRect.x))
      elem.setAttribute('y1', String(cy1 - cropRect.y))
      elem.setAttribute('x2', String(cx2 - cropRect.x))
      elem.setAttribute('y2', String(cy2 - cropRect.y))
    }
  } else if (tagName === 'polyline') {
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
}

/**
 * Crop an SVG string to a specified rectangle.
 * Preserves fill shapes by clipping polygons properly.
 */
export function cropSVGInBrowser(svgString: string, cropRect: Rect): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement

  // Parse viewBox and dimensions using proper utilities that handle all units
  const dimInfo = analyzeSVGDimensions(svg as unknown as SVGSVGElement)

  // Use computed dimensions (properly handles pt, cm, mm, etc.)
  const displayWidth = dimInfo.computedWidth || cropRect.width
  const displayHeight = dimInfo.computedHeight || cropRect.height

  // Get viewBox, falling back to computed dimensions
  const viewBox = dimInfo.viewBox || {
    minX: 0,
    minY: 0,
    width: displayWidth,
    height: displayHeight
  }

  // Transform crop rect from display coordinates to viewBox coordinates
  // With proper normalization, viewBox starts at (0,0) and path coords match
  const scaleX = viewBox.width / displayWidth
  const scaleY = viewBox.height / displayHeight

  const transformedCropRect: Rect = {
    x: viewBox.minX + cropRect.x * scaleX,
    y: viewBox.minY + cropRect.y * scaleY,
    width: cropRect.width * scaleX,
    height: cropRect.height * scaleY
  }

  const actualCropRect = transformedCropRect

  // Process all elements recursively
  const processElement = (elem: Element): void => {
    const tagName = elem.tagName.toLowerCase()

    // Skip non-graphical elements
    if (['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient'].includes(tagName)) {
      return
    }

    // For groups, process children
    if (tagName === 'g' || tagName === 'svg') {
      const children = Array.from(elem.children)
      for (const child of children) {
        processElement(child)
      }
      // Remove empty groups
      if (tagName === 'g' && elem.children.length === 0) {
        elem.parentNode?.removeChild(elem)
      }
      return
    }

    // Check if element intersects crop
    if (!elementIntersectsCrop(elem, actualCropRect)) {
      elem.parentNode?.removeChild(elem)
      return
    }

    // Clip element
    clipElement(elem, actualCropRect, doc)
  }

  // Process all children of svg
  const children = Array.from(svg.children)
  for (const child of children) {
    processElement(child)
  }

  // Update SVG dimensions
  svg.setAttribute('width', String(actualCropRect.width))
  svg.setAttribute('height', String(actualCropRect.height))
  svg.setAttribute('viewBox', `0 0 ${actualCropRect.width} ${actualCropRect.height}`)

  // Serialize back to string
  const serializer = new XMLSerializer()
  return serializer.serializeToString(svg)
}

export interface CropDimensions {
  width: number
  height: number
}

/**
 * Calculate crop dimensions based on aspect ratio and size percentage
 */
export function getCropDimensions(
  svgDimensions: { width: number; height: number } | null,
  cropAspectRatio: string,
  cropSize: number
): CropDimensions {
  if (!svgDimensions) return { width: 0, height: 0 }

  const [w, h] = cropAspectRatio.split(':').map(Number)
  const aspectRatio = w / h

  const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
  const baseSize = minDimension * cropSize

  let width: number
  let height: number

  if (aspectRatio >= 1) {
    width = baseSize
    height = baseSize / aspectRatio
  } else {
    height = baseSize
    width = baseSize * aspectRatio
  }

  return { width, height }
}
