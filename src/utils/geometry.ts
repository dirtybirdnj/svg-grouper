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

  // OPTIMIZATION: Pre-compute polygon bounding box for fast rejection
  let bboxMinX = Infinity, bboxMinY = Infinity, bboxMaxX = -Infinity, bboxMaxY = -Infinity
  for (const p of workingOuter) {
    if (p.x < bboxMinX) bboxMinX = p.x
    if (p.y < bboxMinY) bboxMinY = p.y
    if (p.x > bboxMaxX) bboxMaxX = p.x
    if (p.y > bboxMaxY) bboxMaxY = p.y
  }

  for (const line of lines) {
    // OPTIMIZATION: Fast bbox rejection - skip lines entirely outside polygon bbox
    const lineMinX = Math.min(line.x1, line.x2)
    const lineMaxX = Math.max(line.x1, line.x2)
    const lineMinY = Math.min(line.y1, line.y2)
    const lineMaxY = Math.max(line.y1, line.y2)

    if (lineMaxX < bboxMinX || lineMinX > bboxMaxX ||
        lineMaxY < bboxMinY || lineMinY > bboxMaxY) {
      continue // Line is completely outside polygon bbox
    }

    const p1 = { x: line.x1, y: line.y1 }
    const p2 = { x: line.x2, y: line.y2 }
    const p1Inside = pointInPolygon(p1, workingOuter)
    const p2Inside = pointInPolygon(p2, workingOuter)

    const outerIntersections = linePolygonIntersections(line, workingOuter)

    if (outerIntersections.length === 0) {
      // No intersections - either entirely inside or entirely outside
      if (p1Inside && p2Inside) {
        // Line is entirely inside the polygon - keep it!
        const segment = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
        const finalSegments = clipSegmentAroundHoles(segment, workingHoles)
        clippedLines.push(...finalSegments)
      }
      // If both outside, skip the line
    } else if (outerIntersections.length === 1) {
      // One intersection - line enters or exits the polygon
      const intersection = outerIntersections[0]
      if (p1Inside) {
        // p1 inside, exits at intersection
        const segment = { x1: p1.x, y1: p1.y, x2: intersection.x, y2: intersection.y }
        const finalSegments = clipSegmentAroundHoles(segment, workingHoles)
        clippedLines.push(...finalSegments)
      } else if (p2Inside) {
        // p2 inside, enters at intersection
        const segment = { x1: intersection.x, y1: intersection.y, x2: p2.x, y2: p2.y }
        const finalSegments = clipSegmentAroundHoles(segment, workingHoles)
        clippedLines.push(...finalSegments)
      }
    } else {
      // Multiple intersections - process in pairs
      // Add endpoints if they're inside
      const allPoints: { point: Point; t: number }[] = []

      // Calculate t parameter for sorting along line
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const len = Math.sqrt(dx * dx + dy * dy)

      if (p1Inside) {
        allPoints.push({ point: p1, t: 0 })
      }

      for (const intersection of outerIntersections) {
        const t = len > 0.001
          ? (Math.abs(dx) > Math.abs(dy)
              ? (intersection.x - p1.x) / dx
              : (intersection.y - p1.y) / dy)
          : 0
        allPoints.push({ point: intersection, t })
      }

      if (p2Inside) {
        allPoints.push({ point: p2, t: 1 })
      }

      // Sort by t parameter
      allPoints.sort((a, b) => a.t - b.t)

      // Process in pairs - segments between consecutive points that are inside
      for (let j = 0; j < allPoints.length - 1; j++) {
        const segStart = allPoints[j].point
        const segEnd = allPoints[j + 1].point
        // Check if midpoint is inside (to determine if this segment is inside)
        const midpoint = {
          x: (segStart.x + segEnd.x) / 2,
          y: (segStart.y + segEnd.y) / 2
        }
        if (pointInPolygon(midpoint, workingOuter)) {
          const segment = { x1: segStart.x, y1: segStart.y, x2: segEnd.x, y2: segEnd.y }
          const finalSegments = clipSegmentAroundHoles(segment, workingHoles)
          clippedLines.push(...finalSegments)
        }
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

// ============================================
// Rectangular Clipping Functions (for cropping)
// ============================================

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Cohen-Sutherland outcodes
const INSIDE = 0
const LEFT = 1
const RIGHT = 2
const BOTTOM = 4
const TOP = 8

function computeOutCode(x: number, y: number, rect: Rect): number {
  let code = INSIDE
  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  if (x < xMin) code |= LEFT
  else if (x > xMax) code |= RIGHT
  if (y < yMin) code |= TOP
  else if (y > yMax) code |= BOTTOM

  return code
}

/**
 * Cohen-Sutherland line clipping algorithm
 * Clips a line segment to a rectangle
 * @returns The clipped line or null if completely outside
 */
export function clipLineToRect(line: HatchLine, rect: Rect): HatchLine | null {
  let x0 = line.x1
  let y0 = line.y1
  let x1 = line.x2
  let y1 = line.y2

  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  let outcode0 = computeOutCode(x0, y0, rect)
  let outcode1 = computeOutCode(x1, y1, rect)

  while (true) {
    if ((outcode0 | outcode1) === 0) {
      // Both points inside, accept
      return { x1: x0, y1: y0, x2: x1, y2: y1 }
    } else if ((outcode0 & outcode1) !== 0) {
      // Both points share an outside region, reject
      return null
    } else {
      // Line needs clipping
      const outcodeOut = outcode0 !== 0 ? outcode0 : outcode1
      let x: number = 0
      let y: number = 0

      if (outcodeOut & BOTTOM) {
        x = x0 + (x1 - x0) * (yMax - y0) / (y1 - y0)
        y = yMax
      } else if (outcodeOut & TOP) {
        x = x0 + (x1 - x0) * (yMin - y0) / (y1 - y0)
        y = yMin
      } else if (outcodeOut & RIGHT) {
        y = y0 + (y1 - y0) * (xMax - x0) / (x1 - x0)
        x = xMax
      } else if (outcodeOut & LEFT) {
        y = y0 + (y1 - y0) * (xMin - x0) / (x1 - x0)
        x = xMin
      }

      if (outcodeOut === outcode0) {
        x0 = x
        y0 = y
        outcode0 = computeOutCode(x0, y0, rect)
      } else {
        x1 = x
        y1 = y
        outcode1 = computeOutCode(x1, y1, rect)
      }
    }
  }
}

/**
 * Clip an array of lines to a rectangle
 * @returns Array of clipped lines (empty for lines completely outside)
 */
export function clipLinesToRect(lines: HatchLine[], rect: Rect): HatchLine[] {
  const result: HatchLine[] = []
  for (const line of lines) {
    const clipped = clipLineToRect(line, rect)
    if (clipped) {
      result.push(clipped)
    }
  }
  return result
}

/**
 * Sutherland-Hodgman polygon clipping algorithm
 * Clips a polygon to a rectangle
 * @returns The clipped polygon vertices (may be empty if completely outside)
 */
export function clipPolygonToRect(polygon: Point[], rect: Rect): Point[] {
  if (polygon.length < 3) return []

  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  // Clip against each edge in sequence
  let output = polygon

  // Left edge
  output = clipPolygonAgainstEdge(output, (p) => p.x >= xMin, (p1, p2) => {
    const t = (xMin - p1.x) / (p2.x - p1.x)
    return { x: xMin, y: p1.y + t * (p2.y - p1.y) }
  })
  if (output.length === 0) return []

  // Right edge
  output = clipPolygonAgainstEdge(output, (p) => p.x <= xMax, (p1, p2) => {
    const t = (xMax - p1.x) / (p2.x - p1.x)
    return { x: xMax, y: p1.y + t * (p2.y - p1.y) }
  })
  if (output.length === 0) return []

  // Top edge
  output = clipPolygonAgainstEdge(output, (p) => p.y >= yMin, (p1, p2) => {
    const t = (yMin - p1.y) / (p2.y - p1.y)
    return { x: p1.x + t * (p2.x - p1.x), y: yMin }
  })
  if (output.length === 0) return []

  // Bottom edge
  output = clipPolygonAgainstEdge(output, (p) => p.y <= yMax, (p1, p2) => {
    const t = (yMax - p1.y) / (p2.y - p1.y)
    return { x: p1.x + t * (p2.x - p1.x), y: yMax }
  })

  return output
}

/**
 * Helper for Sutherland-Hodgman: clip polygon against a single edge
 */
function clipPolygonAgainstEdge(
  polygon: Point[],
  isInside: (p: Point) => boolean,
  intersect: (p1: Point, p2: Point) => Point
): Point[] {
  const output: Point[] = []
  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const current = polygon[i]
    const next = polygon[(i + 1) % n]
    const currentInside = isInside(current)
    const nextInside = isInside(next)

    if (currentInside) {
      output.push(current)
      if (!nextInside) {
        // Exiting
        output.push(intersect(current, next))
      }
    } else if (nextInside) {
      // Entering
      output.push(intersect(current, next))
    }
  }

  return output
}

/**
 * Clip a PolygonWithHoles to a rectangle
 * @returns Clipped polygon with holes (both outer and holes are clipped)
 */
export function clipPolygonWithHolesToRect(polygon: PolygonWithHoles, rect: Rect): PolygonWithHoles {
  const clippedOuter = clipPolygonToRect(polygon.outer, rect)
  if (clippedOuter.length < 3) {
    return { outer: [], holes: [] }
  }

  const clippedHoles: Point[][] = []
  for (const hole of polygon.holes) {
    const clippedHole = clipPolygonToRect(hole, rect)
    if (clippedHole.length >= 3) {
      clippedHoles.push(clippedHole)
    }
  }

  return { outer: clippedOuter, holes: clippedHoles }
}

// ============================================================
// LINE OPTIMIZATION FOR PEN PLOTTER EXPORT
// ============================================================

/**
 * Represents a path with its endpoints for optimization
 */
export interface PathSegment {
  id: string
  element: Element
  startPoint: Point
  endPoint: Point
  points: Point[]  // All points for joining
  reversed: boolean
}

/**
 * Parse an SVG element into a PathSegment for optimization
 */
export function elementToPathSegment(element: Element, id: string): PathSegment | null {
  const tagName = element.tagName.toLowerCase()
  let points: Point[] = []

  if (tagName === 'path') {
    const d = element.getAttribute('d')
    if (!d) return null
    points = parsePathToPoints(d)
  } else if (tagName === 'line') {
    const x1 = parseFloat(element.getAttribute('x1') || '0')
    const y1 = parseFloat(element.getAttribute('y1') || '0')
    const x2 = parseFloat(element.getAttribute('x2') || '0')
    const y2 = parseFloat(element.getAttribute('y2') || '0')
    points = [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const pointsAttr = element.getAttribute('points') || ''
    const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)
    for (let i = 0; i < coords.length - 1; i += 2) {
      if (!isNaN(coords[i]) && !isNaN(coords[i + 1])) {
        points.push({ x: coords[i], y: coords[i + 1] })
      }
    }
    // Close polygon
    if (tagName === 'polygon' && points.length >= 2) {
      points.push({ ...points[0] })
    }
  } else if (tagName === 'rect') {
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const w = parseFloat(element.getAttribute('width') || '0')
    const h = parseFloat(element.getAttribute('height') || '0')
    points = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y }
    ]
  } else if (tagName === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const r = parseFloat(element.getAttribute('r') || '0')
    // Approximate circle with 32 points
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
  } else if (tagName === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const rx = parseFloat(element.getAttribute('rx') || '0')
    const ry = parseFloat(element.getAttribute('ry') || '0')
    // Approximate ellipse with 32 points
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2
      points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
    }
  }

  if (points.length < 2) return null

  return {
    id,
    element,
    startPoint: points[0],
    endPoint: points[points.length - 1],
    points,
    reversed: false
  }
}

/**
 * Parse path d attribute to points (simplified - extracts endpoints of each segment)
 */
function parsePathToPoints(d: string): Point[] {
  const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/gi) || []
  const points: Point[] = []
  let currentX = 0, currentY = 0
  let startX = 0, startY = 0

  for (const cmd of commands) {
    const type = cmd[0]
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    switch (type) {
      case 'M':
        currentX = args[0]
        currentY = args[1]
        startX = currentX
        startY = currentY
        points.push({ x: currentX, y: currentY })
        // Handle implicit lineto
        for (let i = 2; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'm':
        currentX += args[0]
        currentY += args[1]
        startX = currentX
        startY = currentY
        points.push({ x: currentX, y: currentY })
        for (let i = 2; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'H':
        for (const x of args) {
          currentX = x
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'h':
        for (const dx of args) {
          currentX += dx
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'V':
        for (const y of args) {
          currentY = y
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'v':
        for (const dy of args) {
          currentY += dy
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          currentX = args[i + 4]
          currentY = args[i + 5]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          currentX += args[i + 4]
          currentY += args[i + 5]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'S': case 's':
        for (let i = 0; i < args.length; i += 4) {
          if (type === 'S') {
            currentX = args[i + 2]
            currentY = args[i + 3]
          } else {
            currentX += args[i + 2]
            currentY += args[i + 3]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'Q': case 'q':
        for (let i = 0; i < args.length; i += 4) {
          if (type === 'Q') {
            currentX = args[i + 2]
            currentY = args[i + 3]
          } else {
            currentX += args[i + 2]
            currentY += args[i + 3]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'T': case 't':
        for (let i = 0; i < args.length; i += 2) {
          if (type === 'T') {
            currentX = args[i]
            currentY = args[i + 1]
          } else {
            currentX += args[i]
            currentY += args[i + 1]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'A': case 'a':
        for (let i = 0; i < args.length; i += 7) {
          if (type === 'A') {
            currentX = args[i + 5]
            currentY = args[i + 6]
          } else {
            currentX += args[i + 5]
            currentY += args[i + 6]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'Z': case 'z':
        currentX = startX
        currentY = startY
        points.push({ x: currentX, y: currentY })
        break
    }
  }

  return points
}

/**
 * Optimize path order using nearest-neighbor algorithm
 * Returns elements in optimized order with optional reversal flags
 */
export function optimizePathOrder(elements: Element[]): { element: Element; reversed: boolean }[] {
  if (elements.length === 0) return []
  if (elements.length === 1) return [{ element: elements[0], reversed: false }]

  // Parse all elements into segments
  const segments: PathSegment[] = []
  for (let i = 0; i < elements.length; i++) {
    const seg = elementToPathSegment(elements[i], `path-${i}`)
    if (seg) segments.push(seg)
  }

  if (segments.length === 0) return elements.map(e => ({ element: e, reversed: false }))

  // Nearest neighbor ordering
  const ordered: PathSegment[] = []
  const remaining = [...segments]
  let currentPoint: Point = { x: 0, y: 0 }

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i]
      const distToStart = distance(currentPoint, seg.startPoint)
      const distToEnd = distance(currentPoint, seg.endPoint)

      if (distToStart < bestDistance) {
        bestDistance = distToStart
        bestIndex = i
        shouldReverse = false
      }
      if (distToEnd < bestDistance) {
        bestDistance = distToEnd
        bestIndex = i
        shouldReverse = true
      }
    }

    const chosen = remaining.splice(bestIndex, 1)[0]
    if (shouldReverse) {
      chosen.reversed = true
      const temp = chosen.startPoint
      chosen.startPoint = chosen.endPoint
      chosen.endPoint = temp
      chosen.points.reverse()
    }
    ordered.push(chosen)
    currentPoint = chosen.endPoint
  }

  return ordered.map(seg => ({ element: seg.element, reversed: seg.reversed }))
}

/**
 * Join connecting paths that share endpoints within tolerance
 * Returns new path elements with connected paths merged
 */
export function joinConnectingPaths(
  elements: Element[],
  tolerance: number = 0.5
): Element[] {
  if (elements.length <= 1) return elements

  // Parse all elements
  const segments: PathSegment[] = []
  for (let i = 0; i < elements.length; i++) {
    const seg = elementToPathSegment(elements[i], `path-${i}`)
    if (seg) segments.push(seg)
  }

  if (segments.length <= 1) return elements

  // Build chains of connected segments
  const used = new Set<number>()
  const chains: PathSegment[][] = []

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue

    const chain: PathSegment[] = [segments[i]]
    used.add(i)

    // Extend chain forward
    let extending = true
    while (extending) {
      extending = false
      const lastSeg = chain[chain.length - 1]

      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const candidate = segments[j]

        // Check if candidate connects to end of chain
        if (distance(lastSeg.endPoint, candidate.startPoint) <= tolerance) {
          chain.push(candidate)
          used.add(j)
          extending = true
          break
        }
        if (distance(lastSeg.endPoint, candidate.endPoint) <= tolerance) {
          // Reverse candidate
          candidate.points.reverse()
          const temp = candidate.startPoint
          candidate.startPoint = candidate.endPoint
          candidate.endPoint = temp
          candidate.reversed = !candidate.reversed
          chain.push(candidate)
          used.add(j)
          extending = true
          break
        }
      }
    }

    // Extend chain backward
    extending = true
    while (extending) {
      extending = false
      const firstSeg = chain[0]

      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const candidate = segments[j]

        // Check if candidate connects to start of chain
        if (distance(candidate.endPoint, firstSeg.startPoint) <= tolerance) {
          chain.unshift(candidate)
          used.add(j)
          extending = true
          break
        }
        if (distance(candidate.startPoint, firstSeg.startPoint) <= tolerance) {
          // Reverse candidate
          candidate.points.reverse()
          const temp = candidate.startPoint
          candidate.startPoint = candidate.endPoint
          candidate.endPoint = temp
          candidate.reversed = !candidate.reversed
          chain.unshift(candidate)
          used.add(j)
          extending = true
          break
        }
      }
    }

    chains.push(chain)
  }

  // Convert chains back to elements
  const result: Element[] = []
  const svgNS = 'http://www.w3.org/2000/svg'

  for (const chain of chains) {
    if (chain.length === 1) {
      // Single segment, keep original element
      result.push(chain[0].element)
    } else {
      // Multiple segments, create new combined path
      const combinedPoints: Point[] = []
      for (let i = 0; i < chain.length; i++) {
        const seg = chain[i]
        if (i === 0) {
          combinedPoints.push(...seg.points)
        } else {
          // Skip first point as it should match previous end
          combinedPoints.push(...seg.points.slice(1))
        }
      }

      // Create new path element
      const pathD = pointsToPathD(combinedPoints)
      const newPath = document.createElementNS(svgNS, 'path')
      newPath.setAttribute('d', pathD)

      // Copy style from first element
      const firstEl = chain[0].element
      const stroke = firstEl.getAttribute('stroke')
      const strokeWidth = firstEl.getAttribute('stroke-width')
      const fill = firstEl.getAttribute('fill')
      const style = firstEl.getAttribute('style')

      if (stroke) newPath.setAttribute('stroke', stroke)
      if (strokeWidth) newPath.setAttribute('stroke-width', strokeWidth)
      if (fill) newPath.setAttribute('fill', fill)
      if (style) newPath.setAttribute('style', style)

      newPath.setAttribute('stroke-linecap', 'round')
      newPath.setAttribute('stroke-linejoin', 'round')

      result.push(newPath)
    }
  }

  return result
}

/**
 * Convert points array to SVG path d attribute
 */
function pointsToPathD(points: Point[]): string {
  if (points.length === 0) return ''
  const parts: string[] = [`M${points[0].x.toFixed(3)},${points[0].y.toFixed(3)}`]
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${points[i].x.toFixed(3)},${points[i].y.toFixed(3)}`)
  }
  return parts.join('')
}

/**
 * Apply both optimizations: join connecting paths, then optimize order
 */
export function optimizeForPlotter(
  elements: Element[],
  options: { joinTolerance?: number; optimize?: boolean; join?: boolean } = {}
): Element[] {
  const { joinTolerance = 0.5, optimize = true, join = true } = options

  let result = elements

  // Step 1: Join connecting paths
  if (join) {
    result = joinConnectingPaths(result, joinTolerance)
  }

  // Step 2: Optimize path order
  if (optimize) {
    const optimized = optimizePathOrder(result)
    result = optimized.map(o => o.element)
  }

  return result
}
