// Geometry utilities for SVG fill patterns

export interface Point {
  x: number
  y: number
}

export interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PolygonWithHoles {
  outer: Point[]
  holes: Point[][]
}

// Calculate distance between two points
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Parse SVG path data into separate subpaths (split at M commands after Z)
export function parsePathIntoSubpaths(d: string): Point[][] {
  const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/gi) || []

  const subpaths: Point[][] = []
  let currentSubpath: Point[] = []
  let currentX = 0, currentY = 0
  let startX = 0, startY = 0
  let justClosed = false

  for (const cmd of commands) {
    const type = cmd[0]
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    if ((type === 'M' || type === 'm') && (justClosed || currentSubpath.length === 0)) {
      if (currentSubpath.length >= 3) {
        subpaths.push(currentSubpath)
      }
      currentSubpath = []
      justClosed = false
    }

    switch (type) {
      case 'M':
        currentX = args[0]
        currentY = args[1]
        startX = currentX
        startY = currentY
        currentSubpath.push({ x: currentX, y: currentY })
        for (let i = 2; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'm':
        currentX += args[0]
        currentY += args[1]
        startX = currentX
        startY = currentY
        currentSubpath.push({ x: currentX, y: currentY })
        for (let i = 2; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'H':
        for (const arg of args) {
          currentX = arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'h':
        for (const arg of args) {
          currentX += arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'V':
        for (const arg of args) {
          currentY = arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'v':
        for (const arg of args) {
          currentY += arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'Z':
      case 'z': {
        const dist = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2))
        if (dist > 0.1) {
          currentSubpath.push({ x: startX, y: startY })
        }
        currentX = startX
        currentY = startY
        justClosed = true
        break
      }
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          const x0 = currentX, y0 = currentY
          const x1 = args[i], y1 = args[i + 1]
          const x2 = args[i + 2], y2 = args[i + 3]
          const x3 = args[i + 4], y3 = args[i + 5]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          const x0 = currentX, y0 = currentY
          const x1 = currentX + args[i], y1 = currentY + args[i + 1]
          const x2 = currentX + args[i + 2], y2 = currentY + args[i + 3]
          const x3 = currentX + args[i + 4], y3 = currentY + args[i + 5]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 'S':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x2 = args[i], y2 = args[i + 1]
          const x3 = args[i + 2], y3 = args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x0 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 's':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x2 = currentX + args[i], y2 = currentY + args[i + 1]
          const x3 = currentX + args[i + 2], y3 = currentY + args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x0 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 'Q':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x1 = args[i], y1 = args[i + 1]
          const x2 = args[i + 2], y2 = args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
            const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x2
          currentY = y2
        }
        break
      case 'q':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x1 = currentX + args[i], y1 = currentY + args[i + 1]
          const x2 = currentX + args[i + 2], y2 = currentY + args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
            const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x2
          currentY = y2
        }
        break
      case 'A':
        for (let i = 0; i < args.length; i += 7) {
          const x = args[i + 5]
          const y = args[i + 6]
          const dx = x - currentX
          const dy = y - currentY
          for (let t = 0.2; t <= 1; t += 0.2) {
            currentSubpath.push({ x: currentX + dx * t, y: currentY + dy * t })
          }
          currentX = x
          currentY = y
        }
        break
      case 'a':
        for (let i = 0; i < args.length; i += 7) {
          const x = currentX + args[i + 5]
          const y = currentY + args[i + 6]
          const dx = x - currentX
          const dy = y - currentY
          for (let t = 0.2; t <= 1; t += 0.2) {
            currentSubpath.push({ x: currentX + dx * t, y: currentY + dy * t })
          }
          currentX = x
          currentY = y
        }
        break
    }
  }

  if (currentSubpath.length >= 3) {
    subpaths.push(currentSubpath)
  }

  return subpaths
}

// Calculate signed area of polygon
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

// Calculate centroid of a polygon
function polygonCentroid(polygon: Point[]): Point {
  if (polygon.length === 0) return { x: 0, y: 0 }
  const sumX = polygon.reduce((sum, p) => sum + p.x, 0)
  const sumY = polygon.reduce((sum, p) => sum + p.y, 0)
  return { x: sumX / polygon.length, y: sumY / polygon.length }
}

// Simple point-in-polygon test (ray casting) - used before pointInPolygon is defined
function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
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

// Identify which subpath is the outer boundary and which are holes
// Key insight: holes are INSIDE the outer boundary, disconnected regions are OUTSIDE
export function identifyOuterAndHoles(subpaths: Point[][]): PolygonWithHoles {
  if (subpaths.length === 0) return { outer: [], holes: [] }
  if (subpaths.length === 1) return { outer: subpaths[0], holes: [] }

  const areasWithIndex = subpaths.map((subpath, index) => ({
    index,
    subpath,
    area: Math.abs(calcPolygonArea(subpath)),
    centroid: polygonCentroid(subpath)
  }))

  // Sort by area descending - largest first
  areasWithIndex.sort((a, b) => b.area - a.area)

  const largest = areasWithIndex[0]
  const outer = largest.subpath
  const holes: Point[][] = []
  const disconnectedRegions: Point[][] = []

  // Check each smaller subpath - is its centroid inside the largest?
  for (let i = 1; i < areasWithIndex.length; i++) {
    const item = areasWithIndex[i]
    if (isPointInsidePolygon(item.centroid, outer)) {
      // This subpath is inside the outer - it's a hole
      holes.push(item.subpath)
    } else {
      // This subpath is outside the outer - it's a disconnected region
      disconnectedRegions.push(item.subpath)
    }
  }

  // If there are disconnected regions, we have a problem:
  // The current PolygonWithHoles structure only supports one outer + holes
  // For now, we return just the largest region with its actual holes
  // The disconnected regions will be lost - this is a limitation
  // TODO: Consider returning multiple PolygonWithHoles for compound paths with disconnected regions

  return { outer, holes }
}

// Get all subpaths as separate polygons (for compound paths with disconnected regions)
export function getPolygonsFromSubpaths(subpaths: Point[][]): PolygonWithHoles[] {
  if (subpaths.length === 0) return []
  if (subpaths.length === 1) return [{ outer: subpaths[0], holes: [] }]

  const areasWithIndex = subpaths.map((subpath, index) => ({
    index,
    subpath,
    area: Math.abs(calcPolygonArea(subpath)),
    centroid: polygonCentroid(subpath)
  }))

  // Sort by area descending
  areasWithIndex.sort((a, b) => b.area - a.area)

  const results: PolygonWithHoles[] = []
  const usedIndices = new Set<number>()

  // Process each potential outer boundary
  for (let i = 0; i < areasWithIndex.length; i++) {
    if (usedIndices.has(areasWithIndex[i].index)) continue

    const candidate = areasWithIndex[i]
    const holes: Point[][] = []

    // Find holes for this outer (smaller subpaths whose centroids are inside)
    for (let j = i + 1; j < areasWithIndex.length; j++) {
      if (usedIndices.has(areasWithIndex[j].index)) continue

      const smaller = areasWithIndex[j]
      if (isPointInsidePolygon(smaller.centroid, candidate.subpath)) {
        holes.push(smaller.subpath)
        usedIndices.add(smaller.index)
      }
    }

    usedIndices.add(candidate.index)
    results.push({ outer: candidate.subpath, holes })
  }

  return results
}

// Get polygon points from an SVG element (returns first/largest polygon only)
// For compound paths with disconnected regions, use getAllPolygonsFromElement instead
export function getPolygonPoints(element: Element): PolygonWithHoles {
  const polygons = getAllPolygonsFromElement(element)
  return polygons.length > 0 ? polygons[0] : { outer: [], holes: [] }
}

// Get ALL polygons from an SVG element (handles compound paths with disconnected regions)
export function getAllPolygonsFromElement(element: Element): PolygonWithHoles[] {
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
    // Use the new function that properly handles disconnected regions
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

// Check if a point is inside a polygon using ray casting
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }

  return inside
}

// Line segment intersection
export function lineSegmentIntersection(
  p1: Point, p2: Point,
  p3: Point, p4: Point
): Point | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y)
  if (Math.abs(denom) < 1e-10) return null

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y)
    }
  }
  return null
}

// Find all intersections of a line with a polygon
export function linePolygonIntersections(line: HatchLine, polygon: Point[]): Point[] {
  const intersections: Point[] = []
  const p1 = { x: line.x1, y: line.y1 }
  const p2 = { x: line.x2, y: line.y2 }

  for (let i = 0; i < polygon.length; i++) {
    const p3 = polygon[i]
    const p4 = polygon[(i + 1) % polygon.length]
    const intersection = lineSegmentIntersection(p1, p2, p3, p4)
    if (intersection) {
      intersections.push(intersection)
    }
  }

  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  intersections.sort((a, b) => {
    const ta = Math.abs(dx) > Math.abs(dy) ? (a.x - p1.x) / dx : (a.y - p1.y) / dy
    const tb = Math.abs(dx) > Math.abs(dy) ? (b.x - p1.x) / dx : (b.y - p1.y) / dy
    return ta - tb
  })

  return intersections
}

// Generate global hatch lines covering a bbox
export function generateGlobalHatchLines(
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number
): HatchLine[] {
  const lines: HatchLine[] = []
  const angleRad = (angleDegrees * Math.PI) / 180

  const padding = Math.max(globalBbox.width, globalBbox.height)
  const width = globalBbox.width + padding * 2
  const height = globalBbox.height + padding * 2
  const diagonal = Math.sqrt(width * width + height * height) * 2

  const perpX = Math.cos(angleRad + Math.PI / 2)
  const perpY = Math.sin(angleRad + Math.PI / 2)
  const dirX = Math.cos(angleRad)
  const dirY = Math.sin(angleRad)

  const centerX = 0
  const centerY = 0
  const numLines = Math.ceil(diagonal / spacing) + 1

  for (let i = -numLines; i <= numLines; i++) {
    const offset = i * spacing
    const lineCenterX = centerX + perpX * offset
    const lineCenterY = centerY + perpY * offset

    lines.push({
      x1: lineCenterX - dirX * diagonal,
      y1: lineCenterY - dirY * diagonal,
      x2: lineCenterX + dirX * diagonal,
      y2: lineCenterY + dirY * diagonal
    })
  }

  return lines
}

// Clip a single line segment around holes
export function clipSegmentAroundHoles(segment: HatchLine, holes: Point[][]): HatchLine[] {
  if (holes.length === 0) return [segment]

  let currentSegments: HatchLine[] = [segment]

  for (const hole of holes) {
    if (hole.length < 3) continue

    const newSegments: HatchLine[] = []

    for (const seg of currentSegments) {
      const line: HatchLine = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 }
      const intersections = linePolygonIntersections(line, hole)

      if (intersections.length === 0) {
        const midpoint = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }
        if (!pointInPolygon(midpoint, hole)) {
          newSegments.push(seg)
        }
      } else {
        const p1 = { x: seg.x1, y: seg.y1 }
        const p2 = { x: seg.x2, y: seg.y2 }
        const dx = p2.x - p1.x
        const dy = p2.y - p1.y

        const points: { t: number; point: Point }[] = [
          { t: 0, point: p1 },
          { t: 1, point: p2 }
        ]

        for (const inter of intersections) {
          const t = Math.abs(dx) > Math.abs(dy)
            ? (inter.x - p1.x) / dx
            : (inter.y - p1.y) / dy
          if (t > 0.001 && t < 0.999) {
            points.push({ t, point: inter })
          }
        }

        points.sort((a, b) => a.t - b.t)

        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i].point
          const end = points[i + 1].point
          const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

          if (!pointInPolygon(midpoint, hole)) {
            newSegments.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y })
          }
        }
      }
    }

    currentSegments = newSegments
  }

  return currentSegments
}

// Clip lines to a polygon with holes
export function clipLinesToPolygon(
  lines: HatchLine[],
  polygonData: PolygonWithHoles,
  inset: number = 0
): HatchLine[] {
  const clippedLines: HatchLine[] = []
  const { outer, holes } = polygonData

  if (outer.length < 3) return clippedLines

  let workingOuter = outer
  if (inset > 0) {
    const centroidX = outer.reduce((sum, p) => sum + p.x, 0) / outer.length
    const centroidY = outer.reduce((sum, p) => sum + p.y, 0) / outer.length
    workingOuter = outer.map(p => {
      const dx = p.x - centroidX
      const dy = p.y - centroidY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < inset) return { x: centroidX, y: centroidY }
      const scale = (dist - inset) / dist
      return { x: centroidX + dx * scale, y: centroidY + dy * scale }
    })
  }

  const workingHoles = holes.map(hole => {
    if (inset > 0) {
      const centroidX = hole.reduce((sum, p) => sum + p.x, 0) / hole.length
      const centroidY = hole.reduce((sum, p) => sum + p.y, 0) / hole.length
      return hole.map(p => {
        const dx = p.x - centroidX
        const dy = p.y - centroidY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = (dist + inset) / dist
        return { x: centroidX + dx * scale, y: centroidY + dy * scale }
      })
    }
    return hole
  })

  for (const line of lines) {
    const outerIntersections = linePolygonIntersections(line, workingOuter)

    for (let j = 0; j < outerIntersections.length - 1; j += 2) {
      if (j + 1 < outerIntersections.length) {
        const segment = {
          x1: outerIntersections[j].x,
          y1: outerIntersections[j].y,
          x2: outerIntersections[j + 1].x,
          y2: outerIntersections[j + 1].y
        }

        const finalSegments = clipSegmentAroundHoles(segment, workingHoles)
        clippedLines.push(...finalSegments)
      }
    }
  }

  return clippedLines
}

// Polygon signed area for winding detection
export function polygonSignedArea(polygon: Point[]): number {
  return calcPolygonArea(polygon)
}

// Offset polygon inward
export function offsetPolygonInward(polygon: Point[], offsetDistance: number): Point[] {
  if (polygon.length < 3) return []

  const signedArea = polygonSignedArea(polygon)
  const windingSign = signedArea > 0 ? 1 : -1

  const result: Point[] = []
  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]
    const curr = polygon[i]
    const next = polygon[(i + 1) % n]

    const e1x = curr.x - prev.x
    const e1y = curr.y - prev.y
    const e2x = next.x - curr.x
    const e2y = next.y - curr.y

    const len1 = Math.sqrt(e1x * e1x + e1y * e1y)
    const len2 = Math.sqrt(e2x * e2x + e2y * e2y)

    if (len1 < 0.0001 || len2 < 0.0001) continue

    const n1x = -e1y / len1 * windingSign
    const n1y = e1x / len1 * windingSign
    const n2x = -e2y / len2 * windingSign
    const n2y = e2x / len2 * windingSign

    let nx = n1x + n2x
    let ny = n1y + n2y
    const nlen = Math.sqrt(nx * nx + ny * ny)

    if (nlen < 0.0001) {
      nx = n1x
      ny = n1y
    } else {
      nx /= nlen
      ny /= nlen

      const dot = n1x * nx + n1y * ny
      if (Math.abs(dot) > 0.1) {
        const miterScale = 1 / Math.abs(dot)
        const limitedScale = Math.min(miterScale, 2.5)
        nx *= limitedScale
        ny *= limitedScale
      }
    }

    result.push({
      x: curr.x + nx * offsetDistance,
      y: curr.y + ny * offsetDistance
    })
  }

  return result
}

// Legacy offset function
export function offsetPolygon(polygon: Point[], offsetDistance: number): Point[] {
  if (offsetDistance < 0) {
    return offsetPolygonInward(polygon, -offsetDistance)
  }
  return offsetPolygonInward(polygon, -offsetDistance)
}

/**
 * Convert an array of HatchLines to a compound path d attribute string.
 * This combines multiple line segments into a single path with M/L commands,
 * reducing element count significantly (important for Cricut compatibility).
 *
 * @param lines Array of line segments to combine
 * @param precision Number of decimal places for coordinates (default: 2)
 * @returns SVG path d attribute string
 */
export function linesToCompoundPath(lines: HatchLine[], precision: number = 2): string {
  if (lines.length === 0) return ''

  const commands: string[] = []

  for (const line of lines) {
    // Each line segment becomes M(move to start) L(line to end)
    commands.push(
      `M${line.x1.toFixed(precision)},${line.y1.toFixed(precision)} L${line.x2.toFixed(precision)},${line.y2.toFixed(precision)}`
    )
  }

  return commands.join(' ')
}

/**
 * Optimize lines into continuous chains where endpoints connect.
 * Lines that share endpoints are connected into single M...L...L... chains.
 * This further reduces path commands by avoiding redundant M commands.
 *
 * @param lines Array of line segments
 * @param tolerance Distance tolerance for considering points as connected (default: 0.1)
 * @param precision Decimal precision for output (default: 2)
 * @returns SVG path d attribute string with optimized chains
 */
export function linesToOptimizedCompoundPath(
  lines: HatchLine[],
  tolerance: number = 0.1,
  precision: number = 2
): string {
  if (lines.length === 0) return ''

  // Build chains of connected lines
  const remaining = [...lines]
  const chains: Point[][] = []

  while (remaining.length > 0) {
    // Start a new chain with the first remaining line
    const first = remaining.shift()!
    const chain: Point[] = [
      { x: first.x1, y: first.y1 },
      { x: first.x2, y: first.y2 }
    ]

    let extended = true
    while (extended && remaining.length > 0) {
      extended = false
      const chainStart = chain[0]
      const chainEnd = chain[chain.length - 1]

      for (let i = 0; i < remaining.length; i++) {
        const line = remaining[i]
        const lineStart = { x: line.x1, y: line.y1 }
        const lineEnd = { x: line.x2, y: line.y2 }

        // Check if line connects to chain end
        const distEndToStart = Math.sqrt(
          Math.pow(chainEnd.x - lineStart.x, 2) + Math.pow(chainEnd.y - lineStart.y, 2)
        )
        if (distEndToStart < tolerance) {
          chain.push(lineEnd)
          remaining.splice(i, 1)
          extended = true
          break
        }

        // Check if line connects to chain end (reversed)
        const distEndToEnd = Math.sqrt(
          Math.pow(chainEnd.x - lineEnd.x, 2) + Math.pow(chainEnd.y - lineEnd.y, 2)
        )
        if (distEndToEnd < tolerance) {
          chain.push(lineStart)
          remaining.splice(i, 1)
          extended = true
          break
        }

        // Check if line connects to chain start
        const distStartToEnd = Math.sqrt(
          Math.pow(chainStart.x - lineEnd.x, 2) + Math.pow(chainStart.y - lineEnd.y, 2)
        )
        if (distStartToEnd < tolerance) {
          chain.unshift(lineStart)
          remaining.splice(i, 1)
          extended = true
          break
        }

        // Check if line connects to chain start (reversed)
        const distStartToStart = Math.sqrt(
          Math.pow(chainStart.x - lineStart.x, 2) + Math.pow(chainStart.y - lineStart.y, 2)
        )
        if (distStartToStart < tolerance) {
          chain.unshift(lineEnd)
          remaining.splice(i, 1)
          extended = true
          break
        }
      }
    }

    chains.push(chain)
  }

  // Convert chains to path commands
  const commands: string[] = []

  for (const chain of chains) {
    if (chain.length < 2) continue

    // Start with M command
    let pathStr = `M${chain[0].x.toFixed(precision)},${chain[0].y.toFixed(precision)}`

    // Add L commands for remaining points
    for (let i = 1; i < chain.length; i++) {
      pathStr += ` L${chain[i].x.toFixed(precision)},${chain[i].y.toFixed(precision)}`
    }

    commands.push(pathStr)
  }

  return commands.join(' ')
}
