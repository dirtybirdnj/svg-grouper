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

// Get all subpaths from a path element as separate path d strings
export function getSubpathsAsPathStrings(element: Element): string[] {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== 'path') return []

  const d = element.getAttribute('d') || ''
  if (!d.trim()) return []

  // Split path data by M/m commands while preserving original commands
  // Use regex to find M or m commands and split accordingly
  const mCommandRegex = /[Mm][^Mm]*/g
  const matches = d.match(mCommandRegex)

  if (!matches || matches.length === 0) return []
  if (matches.length === 1) return [] // Single subpath, not a compound path

  // Track current position for converting relative to absolute
  let currentX = 0
  let currentY = 0
  const subpathStrings: string[] = []

  for (const match of matches) {
    const trimmed = match.trim()
    if (!trimmed) continue

    // Parse the first command to get starting position
    const isRelative = trimmed.startsWith('m')
    const coordStr = trimmed.slice(1).trim()

    // Extract first coordinate pair
    const coordMatch = coordStr.match(/^[\s,]*(-?[\d.]+)[\s,]+(-?[\d.]+)/)
    if (coordMatch) {
      const x = parseFloat(coordMatch[1])
      const y = parseFloat(coordMatch[2])

      if (isRelative && subpathStrings.length > 0) {
        // Relative m - convert to absolute
        const absX = currentX + x
        const absY = currentY + y
        // Replace the relative coordinates with absolute
        const restOfPath = coordStr.slice(coordMatch[0].length)
        subpathStrings.push(`M ${absX} ${absY} ${restOfPath}`)
        currentX = absX
        currentY = absY
      } else {
        // Absolute M or first subpath
        subpathStrings.push(isRelative ? 'M' + trimmed.slice(1) : trimmed)
        currentX = x
        currentY = y
      }

      // Try to find the last position in this subpath for the next relative m
      // Look for the last coordinate pair before Z
      const allCoords = trimmed.match(/-?[\d.]+/g)
      if (allCoords && allCoords.length >= 2) {
        // Take the last two numbers as x,y (rough approximation)
        currentX = parseFloat(allCoords[allCoords.length - 2])
        currentY = parseFloat(allCoords[allCoords.length - 1])
      }
    } else {
      // Couldn't parse coordinates, just add as-is
      subpathStrings.push(trimmed)
    }
  }

  return subpathStrings
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

// Check if polygon A is contained within polygon B using multiple sample points
// More robust than just checking centroid for complex/concave shapes
function isPolygonContainedIn(inner: Point[], outer: Point[]): boolean {
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

// Get polygons with ALL nested regions fillable
// Unlike getPolygonsFromSubpaths which only fills outer regions (treating inner as holes),
// this returns a fillable region for EVERY level of nesting
export function getPolygonsFromSubpathsNested(subpaths: Point[][]): PolygonWithHoles[] {
  if (subpaths.length === 0) return []
  if (subpaths.length === 1) return [{ outer: subpaths[0], holes: [] }]

  interface SubpathInfo {
    index: number
    subpath: Point[]
    area: number
    centroid: Point
    parent: number | null  // Index of containing polygon
    children: number[]     // Indices of directly contained polygons
  }

  // Calculate info for each subpath
  const infos: SubpathInfo[] = subpaths.map((subpath, index) => ({
    index,
    subpath,
    area: Math.abs(calcPolygonArea(subpath)),
    centroid: polygonCentroid(subpath),
    parent: null,
    children: []
  }))

  // Sort by area descending for processing
  const sortedByArea = [...infos].sort((a, b) => b.area - a.area)

  // Build containment hierarchy
  // For each polygon, find the smallest polygon that contains it
  for (let i = 0; i < sortedByArea.length; i++) {
    const current = sortedByArea[i]

    // Look for smallest containing polygon (larger than current)
    // We iterate from just-larger to largest, finding the first one that contains us
    // without any intermediate polygon also containing us
    let foundParent = false
    for (let j = i - 1; j >= 0 && !foundParent; j--) {
      const larger = sortedByArea[j]
      if (isPolygonContainedIn(current.subpath, larger.subpath)) {
        // Check if there's an intermediate polygon (between larger and current in size)
        // that also contains current - if so, skip larger and keep looking
        let hasIntermediateParent = false
        for (let k = j + 1; k < i; k++) {
          const intermediate = sortedByArea[k]
          if (isPolygonContainedIn(current.subpath, intermediate.subpath)) {
            // Current is inside this intermediate polygon, so larger isn't the direct parent
            hasIntermediateParent = true
            break
          }
        }

        if (!hasIntermediateParent) {
          current.parent = larger.index
          larger.children.push(current.index)
          foundParent = true
        }
      }
    }
  }

  // Generate results: each polygon becomes a fillable region with direct children as holes
  const results: PolygonWithHoles[] = []

  for (const info of infos) {
    const holes: Point[][] = info.children.map(childIdx => infos[childIdx].subpath)
    results.push({ outer: info.subpath, holes })
  }

  return results
}

// Get polygon points from an SVG element (returns first/largest polygon only)
// For compound paths with disconnected regions, use getAllPolygonsFromElement instead
export function getPolygonPoints(element: Element): PolygonWithHoles {
  const polygons = getAllPolygonsFromElement(element)
  return polygons.length > 0 ? polygons[0] : { outer: [], holes: [] }
}

// Subpath handling mode for getAllPolygonsFromElement
export type SubpathMode = 'default' | 'independent' | 'nested' | 'evenodd'
// - 'default': Inner shapes are treated as holes (not filled)
// - 'independent': Each subpath is filled separately (holes get filled over)
// - 'nested': All nested regions are fillable (outer has holes, each hole also gets filled)
// - 'evenodd': Use SVG evenodd fill rule - fills areas inside odd number of boundaries

// Get ALL polygons from an SVG element (handles compound paths with disconnected regions)
// subpathMode controls how nested shapes are handled:
//   'default' - inner shapes are holes (excluded from fill)
//   'independent' - each subpath filled separately (ignores nesting)
//   'nested' - all regions filled (outer with holes + each inner region)
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
      // Each subpath becomes its own polygon (no hole detection)
      return subpaths.map(sp => ({ outer: sp, holes: [] }))
    } else if (subpathMode === 'nested') {
      // All nested regions get filled (outer + each inner)
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
// ============================================
// Math Utilities
// ============================================

/**
 * Calculate the centroid (center of mass) of a polygon
 */
export function getCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const sumX = points.reduce((sum, p) => sum + p.x, 0)
  const sumY = points.reduce((sum, p) => sum + p.y, 0)
  return { x: sumX / points.length, y: sumY / points.length }
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
 * Squared distance between two points (faster than distance() when comparing)
 */
export function distanceSquared(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return dx * dx + dy * dy
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
