import { useState, useMemo, useRef, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import './FillTab.css'

interface FillPathInfo {
  id: string
  type: string
  color: string
  pathData: string
  element: Element
}

interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Point {
  x: number
  y: number
}

interface OrderedLine extends HatchLine {
  originalIndex: number
  pathId: string
  color: string
  reversed: boolean
}

// Get polygon points from an SVG element
function getPolygonPoints(element: Element): Point[] {
  const points: Point[] = []
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'polygon' || tagName === 'polyline') {
    const pointsAttr = element.getAttribute('points') || ''
    const pairs = pointsAttr.trim().split(/[\s,]+/)
    for (let i = 0; i < pairs.length - 1; i += 2) {
      points.push({ x: parseFloat(pairs[i]), y: parseFloat(pairs[i + 1]) })
    }
  } else if (tagName === 'rect') {
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const w = parseFloat(element.getAttribute('width') || '0')
    const h = parseFloat(element.getAttribute('height') || '0')
    points.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h })
  } else if (tagName === 'path') {
    // Parse path data to extract polygon points
    // This handles simple paths - for complex curves, we'd need to sample them
    const d = element.getAttribute('d') || ''
    const commands = d.match(/[MLHVCZmlhvcsqtaz][^MLHVCZmlhvcsqtaz]*/gi) || []
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
          // Handle implicit lineto after moveto
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
          currentX = args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'h':
          currentX += args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'V':
          currentY = args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'v':
          currentY += args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'Z':
        case 'z':
          currentX = startX
          currentY = startY
          break
        // For curves, we'll sample points along them
        case 'C':
          for (let i = 0; i < args.length; i += 6) {
            // Sample cubic bezier
            const x0 = currentX, y0 = currentY
            const x1 = args[i], y1 = args[i + 1]
            const x2 = args[i + 2], y2 = args[i + 3]
            const x3 = args[i + 4], y3 = args[i + 5]
            for (let t = 0.1; t <= 1; t += 0.1) {
              const mt = 1 - t
              const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
              const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
              points.push({ x: px, y: py })
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
              points.push({ x: px, y: py })
            }
            currentX = x3
            currentY = y3
          }
          break
      }
    }
  } else if (tagName === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const r = parseFloat(element.getAttribute('r') || '0')
    // Approximate circle with polygon
    const segments = 32
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
  } else if (tagName === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const rx = parseFloat(element.getAttribute('rx') || '0')
    const ry = parseFloat(element.getAttribute('ry') || '0')
    const segments = 32
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
    }
  }

  return points
}

// Line segment intersection with polygon edge
function lineSegmentIntersection(
  p1: Point, p2: Point, // Line segment
  p3: Point, p4: Point  // Polygon edge
): Point | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y)
  if (Math.abs(denom) < 1e-10) return null // Parallel

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom

  // Check if intersection is within both segments
  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y)
    }
  }
  return null
}

// Find all intersections of a line with a polygon
function linePolygonIntersections(line: HatchLine, polygon: Point[]): Point[] {
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

  // Sort intersections along the line direction
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  intersections.sort((a, b) => {
    const ta = Math.abs(dx) > Math.abs(dy) ? (a.x - p1.x) / dx : (a.y - p1.y) / dy
    const tb = Math.abs(dx) > Math.abs(dy) ? (b.x - p1.x) / dx : (b.y - p1.y) / dy
    return ta - tb
  })

  return intersections
}

// Generate a grid of hatch lines covering a large area, aligned to origin
// This ensures consistent alignment across all shapes
function generateGlobalHatchLines(
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number
): HatchLine[] {
  const lines: HatchLine[] = []
  const angleRad = (angleDegrees * Math.PI) / 180

  // Extend bbox to ensure full coverage
  const padding = Math.max(globalBbox.width, globalBbox.height)
  const width = globalBbox.width + padding * 2
  const height = globalBbox.height + padding * 2

  // Calculate diagonal for line extent
  const diagonal = Math.sqrt(width * width + height * height) * 2

  // Direction perpendicular to hatch lines (for stepping)
  const perpX = Math.cos(angleRad + Math.PI / 2)
  const perpY = Math.sin(angleRad + Math.PI / 2)

  // Direction along hatch lines
  const dirX = Math.cos(angleRad)
  const dirY = Math.sin(angleRad)

  // Start from origin (0,0) to ensure global alignment
  // Calculate how many lines we need in each direction from origin
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

// Clip a set of lines to a polygon, returning only the segments inside
function clipLinesToPolygon(
  lines: HatchLine[],
  polygon: Point[],
  inset: number = 0
): HatchLine[] {
  const clippedLines: HatchLine[] = []
  if (polygon.length < 3) return clippedLines

  // Apply inset to polygon if needed
  let workingPolygon = polygon
  if (inset > 0) {
    // Simple inset: shrink polygon toward centroid
    const centroidX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length
    const centroidY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
    workingPolygon = polygon.map(p => {
      const dx = p.x - centroidX
      const dy = p.y - centroidY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < inset) return { x: centroidX, y: centroidY }
      const scale = (dist - inset) / dist
      return { x: centroidX + dx * scale, y: centroidY + dy * scale }
    })
  }

  for (const line of lines) {
    const intersections = linePolygonIntersections(line, workingPolygon)

    // Create line segments from pairs of intersections
    for (let j = 0; j < intersections.length - 1; j += 2) {
      if (j + 1 < intersections.length) {
        clippedLines.push({
          x1: intersections[j].x,
          y1: intersections[j].y,
          x2: intersections[j + 1].x,
          y2: intersections[j + 1].y
        })
      }
    }
  }

  return clippedLines
}

// ============================================================================
// CONCENTRIC (SNAKE) FILL PATTERN
// ============================================================================

// Offset a polygon inward by a given distance using vertex normals
// This is a simplified polygon offset that works well for convex and mildly concave shapes
function offsetPolygon(polygon: Point[], offsetDistance: number): Point[] {
  if (polygon.length < 3) return []

  const result: Point[] = []
  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]
    const curr = polygon[i]
    const next = polygon[(i + 1) % n]

    // Calculate edge vectors
    const e1x = curr.x - prev.x
    const e1y = curr.y - prev.y
    const e2x = next.x - curr.x
    const e2y = next.y - curr.y

    // Normalize edge vectors
    const len1 = Math.sqrt(e1x * e1x + e1y * e1y)
    const len2 = Math.sqrt(e2x * e2x + e2y * e2y)

    if (len1 < 0.0001 || len2 < 0.0001) continue

    const n1x = -e1y / len1
    const n1y = e1x / len1
    const n2x = -e2y / len2
    const n2y = e2x / len2

    // Average normal (bisector direction)
    let nx = n1x + n2x
    let ny = n1y + n2y
    const nlen = Math.sqrt(nx * nx + ny * ny)

    if (nlen < 0.0001) {
      // Edges are parallel, use single normal
      nx = n1x
      ny = n1y
    } else {
      nx /= nlen
      ny /= nlen

      // Calculate miter length to maintain offset distance
      const dot = n1x * nx + n1y * ny
      if (dot > 0.1) {
        const miterScale = 1 / dot
        // Limit miter to avoid spikes at sharp angles
        const limitedScale = Math.min(miterScale, 3)
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

// Check if a polygon is valid (has area and reasonable shape)
function isValidPolygon(polygon: Point[], minArea: number = 1): boolean {
  if (polygon.length < 3) return false

  // Calculate signed area using shoelace formula
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].x * polygon[j].y
    area -= polygon[j].x * polygon[i].y
  }
  area = Math.abs(area) / 2

  return area >= minArea
}

// Generate concentric fill lines (snake pattern from outside in)
function generateConcentricLines(
  polygon: Point[],
  spacing: number,
  connectLoops: boolean = true
): HatchLine[] {
  const lines: HatchLine[] = []
  if (polygon.length < 3) return lines

  const loops: Point[][] = []
  let currentPolygon = [...polygon]

  // Generate inward offset polygons until we can't anymore
  while (isValidPolygon(currentPolygon, spacing * spacing)) {
    loops.push([...currentPolygon])
    currentPolygon = offsetPolygon(currentPolygon, -spacing)

    // Safety limit
    if (loops.length > 1000) break
  }

  // Convert polygon loops to lines
  for (let loopIdx = 0; loopIdx < loops.length; loopIdx++) {
    const loop = loops[loopIdx]

    // Create lines for this loop
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length
      lines.push({
        x1: loop[i].x,
        y1: loop[i].y,
        x2: loop[j].x,
        y2: loop[j].y
      })
    }

    // Connect to next inner loop if enabled
    if (connectLoops && loopIdx < loops.length - 1) {
      const nextLoop = loops[loopIdx + 1]
      // Find closest point on next loop to current loop's last point
      const lastPoint = loop[loop.length - 1]
      let closestIdx = 0
      let closestDist = Infinity

      for (let i = 0; i < nextLoop.length; i++) {
        const d = Math.sqrt(
          Math.pow(nextLoop[i].x - lastPoint.x, 2) +
          Math.pow(nextLoop[i].y - lastPoint.y, 2)
        )
        if (d < closestDist) {
          closestDist = d
          closestIdx = i
        }
      }

      // Add connecting line
      lines.push({
        x1: lastPoint.x,
        y1: lastPoint.y,
        x2: nextLoop[closestIdx].x,
        y2: nextLoop[closestIdx].y
      })
    }
  }

  return lines
}

// ============================================================================
// WIGGLE/WAVE FILL PATTERN
// ============================================================================

// Generate a single wiggle/wave line
function generateWiggleLine(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  amplitude: number,
  frequency: number
): Point[] {
  const points: Point[] = []
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.1) return [{ x: startX, y: startY }]

  // Direction along the line
  const dirX = dx / length
  const dirY = dy / length

  // Perpendicular direction (for wave displacement)
  const perpX = -dirY
  const perpY = dirX

  // Number of points based on length and frequency
  const numPoints = Math.max(2, Math.ceil(length * frequency / 10))

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    const baseX = startX + dx * t
    const baseY = startY + dy * t

    // Sine wave displacement
    const wave = Math.sin(t * Math.PI * 2 * frequency) * amplitude

    points.push({
      x: baseX + perpX * wave,
      y: baseY + perpY * wave
    })
  }

  return points
}

// Generate wiggle fill pattern (wavy parallel lines)
function generateWiggleLines(
  polygon: Point[],
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number,
  amplitude: number,
  frequency: number,
  inset: number = 0
): HatchLine[] {
  // First generate straight hatch lines
  const straightLines = generateGlobalHatchLines(globalBbox, spacing, angleDegrees)
  const clippedLines = clipLinesToPolygon(straightLines, polygon, inset)

  // Convert each straight line to a wiggle
  const wiggleLines: HatchLine[] = []

  for (const line of clippedLines) {
    const wigglePoints = generateWiggleLine(
      line.x1, line.y1,
      line.x2, line.y2,
      amplitude,
      frequency
    )

    // Convert points to line segments
    for (let i = 0; i < wigglePoints.length - 1; i++) {
      wiggleLines.push({
        x1: wigglePoints[i].x,
        y1: wigglePoints[i].y,
        x2: wigglePoints[i + 1].x,
        y2: wigglePoints[i + 1].y
      })
    }
  }

  return wiggleLines
}

// ============================================================================
// SPIRAL FILL PATTERN
// ============================================================================

// Generate an Archimedean spiral from center outward
function generateSpiralLines(
  polygon: Point[],
  spacing: number,
  inset: number = 0
): HatchLine[] {
  if (polygon.length < 3) return []

  // Apply inset first
  let workingPolygon = polygon
  if (inset > 0) {
    workingPolygon = offsetPolygon(polygon, -inset)
    if (!isValidPolygon(workingPolygon)) return []
  }

  // Find bounding box and center
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const maxRadius = Math.sqrt(
    Math.pow((maxX - minX) / 2, 2) +
    Math.pow((maxY - minY) / 2, 2)
  ) * 1.5

  // Generate spiral points
  const spiralPoints: Point[] = []
  const angleStep = 0.1 // radians per step
  const radiusPerTurn = spacing
  let angle = 0

  while (true) {
    const radius = (angle / (2 * Math.PI)) * radiusPerTurn
    if (radius > maxRadius) break

    spiralPoints.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    })

    angle += angleStep

    // Safety limit
    if (spiralPoints.length > 10000) break
  }

  // Convert to lines and clip to polygon
  const lines: HatchLine[] = []
  for (let i = 0; i < spiralPoints.length - 1; i++) {
    const p1 = spiralPoints[i]
    const p2 = spiralPoints[i + 1]

    // Simple point-in-polygon test for both endpoints
    if (pointInPolygon(p1, workingPolygon) && pointInPolygon(p2, workingPolygon)) {
      lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
    }
  }

  return lines
}

// Point in polygon test using ray casting
function pointInPolygon(point: Point, polygon: Point[]): boolean {
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

// Fill pattern type
type FillPatternType = 'lines' | 'concentric' | 'wiggle' | 'spiral'

// Calculate distance between two points
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Optimize lines within a single shape using nearest-neighbor algorithm
// Returns optimized lines and the final endpoint for chaining to next shape
function optimizeLinesWithinShape(
  lines: HatchLine[],
  pathId: string,
  color: string,
  startingPoint: Point,
  startingIndex: number
): { orderedLines: OrderedLine[]; endPoint: Point } {
  if (lines.length === 0) return { orderedLines: [], endPoint: startingPoint }

  const result: OrderedLine[] = []
  const remaining = [...lines]
  let currentPoint = startingPoint
  let globalIndex = startingIndex

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

    // Find the nearest line (considering both orientations)
    for (let i = 0; i < remaining.length; i++) {
      const line = remaining[i]
      const start = { x: line.x1, y: line.y1 }
      const end = { x: line.x2, y: line.y2 }

      const distToStart = distance(currentPoint, start)
      if (distToStart < bestDistance) {
        bestDistance = distToStart
        bestIndex = i
        shouldReverse = false
      }

      const distToEnd = distance(currentPoint, end)
      if (distToEnd < bestDistance) {
        bestDistance = distToEnd
        bestIndex = i
        shouldReverse = true
      }
    }

    const chosenLine = remaining.splice(bestIndex, 1)[0]

    if (shouldReverse) {
      result.push({
        x1: chosenLine.x2,
        y1: chosenLine.y2,
        x2: chosenLine.x1,
        y2: chosenLine.y1,
        pathId,
        color,
        originalIndex: globalIndex++,
        reversed: true
      })
      currentPoint = { x: chosenLine.x1, y: chosenLine.y1 }
    } else {
      result.push({
        ...chosenLine,
        pathId,
        color,
        originalIndex: globalIndex++,
        reversed: false
      })
      currentPoint = { x: chosenLine.x2, y: chosenLine.y2 }
    }
  }

  return { orderedLines: result, endPoint: currentPoint }
}

// Calculate the centroid (center point) of a set of lines
function calculateShapeCentroid(lines: HatchLine[]): Point {
  if (lines.length === 0) return { x: 0, y: 0 }

  let sumX = 0
  let sumY = 0
  let count = 0

  for (const line of lines) {
    sumX += line.x1 + line.x2
    sumY += line.y1 + line.y2
    count += 2
  }

  return { x: sumX / count, y: sumY / count }
}

// Get the top-left-most point of a shape (for starting point selection)
function getShapeTopLeft(lines: HatchLine[]): Point {
  if (lines.length === 0) return { x: Infinity, y: Infinity }

  let minX = Infinity
  let minY = Infinity

  for (const line of lines) {
    minX = Math.min(minX, line.x1, line.x2)
    minY = Math.min(minY, line.y1, line.y2)
  }

  return { x: minX, y: minY }
}

// Multi-pass optimization:
// 1. Order shapes by proximity (nearest-neighbor starting from top-left)
// 2. Within each shape, optimize line order
// 3. Chain shapes together so end of one shape connects to start of next
function optimizeLineOrderMultiPass(
  hatchedPaths: { pathInfo: { id: string; color: string }; lines: HatchLine[] }[]
): OrderedLine[] {
  if (hatchedPaths.length === 0) return []

  // Build shape data with centroids for ordering
  const shapes = hatchedPaths.map(({ pathInfo, lines }) => ({
    pathId: pathInfo.id,
    color: pathInfo.color,
    lines: [...lines],
    centroid: calculateShapeCentroid(lines),
    topLeft: getShapeTopLeft(lines)
  }))

  // Order shapes using nearest-neighbor starting from origin (0,0)
  const orderedShapes: typeof shapes = []
  const remainingShapes = [...shapes]
  let currentPoint: Point = { x: 0, y: 0 }

  while (remainingShapes.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity

    // Find nearest shape (by top-left corner for consistent ordering)
    for (let i = 0; i < remainingShapes.length; i++) {
      const dist = distance(currentPoint, remainingShapes[i].topLeft)
      if (dist < bestDistance) {
        bestDistance = dist
        bestIndex = i
      }
    }

    const chosen = remainingShapes.splice(bestIndex, 1)[0]
    orderedShapes.push(chosen)
    // Update current point to this shape's centroid for next shape selection
    currentPoint = chosen.centroid
  }

  // Now optimize lines within each shape, chaining them together
  const result: OrderedLine[] = []
  let penPosition: Point = { x: 0, y: 0 }
  let globalIndex = 0

  for (const shape of orderedShapes) {
    const { orderedLines, endPoint } = optimizeLinesWithinShape(
      shape.lines,
      shape.pathId,
      shape.color,
      penPosition,
      globalIndex
    )

    // Update indices to be globally sequential
    for (const line of orderedLines) {
      line.originalIndex = globalIndex++
    }

    result.push(...orderedLines)
    penPosition = endPoint
  }

  return result
}

// Calculate total travel distance (sum of distances between consecutive line ends and starts)
function calculateTravelDistance(lines: OrderedLine[]): number {
  if (lines.length <= 1) return 0

  let totalDistance = 0
  for (let i = 1; i < lines.length; i++) {
    const prevEnd = { x: lines[i - 1].x2, y: lines[i - 1].y2 }
    const currStart = { x: lines[i].x1, y: lines[i].y1 }
    totalDistance += distance(prevEnd, currStart)
  }
  return totalDistance
}

// Interpolate between red and blue based on position (0 = red, 1 = blue)
function getGradientColor(position: number): string {
  // Red to blue gradient
  const r = Math.round(255 * (1 - position))
  const g = 0
  const b = Math.round(255 * position)
  return `rgb(${r}, ${g}, ${b})`
}

export default function FillTab() {
  const {
    svgContent,
    layerNodes,
    setLayerNodes,
    fillTargetNodeId,
    setFillTargetNodeId,
    setActiveTab,
    rebuildSvgFromLayers,
    svgElementRef,
  } = useAppContext()

  const [lineSpacing, setLineSpacing] = useState(5)
  const [angle, setAngle] = useState(45)
  const [crossHatch, setCrossHatch] = useState(false)
  const [inset, setInset] = useState(0)
  const [retainStrokes, setRetainStrokes] = useState(true)
  const [penWidth, setPenWidth] = useState(0.5) // in mm, converted to px for display
  const [showHatchPreview, setShowHatchPreview] = useState(false)
  const [fillPattern, setFillPattern] = useState<FillPatternType>('lines')
  const [wiggleAmplitude, setWiggleAmplitude] = useState(3)
  const [wiggleFrequency, setWiggleFrequency] = useState(2)
  const [showOrderVisualization, setShowOrderVisualization] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const animationRef = useRef<number | null>(null)

  const previewRef = useRef<HTMLDivElement>(null)

  // Find the target node
  const targetNode = useMemo(() => {
    if (!fillTargetNodeId) return null

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    return findNode(layerNodes, fillTargetNodeId)
  }, [layerNodes, fillTargetNodeId])

  // Helper to get a fresh element reference from the live DOM
  const getFreshElement = useCallback((nodeId: string, originalElement: Element): Element => {
    if (!svgElementRef.current) {
      console.log(`getFreshElement: No svgElementRef for ${nodeId}`)
      return originalElement
    }

    // If original element is still connected to DOM, use it directly
    if (originalElement.isConnected) {
      console.log(`getFreshElement: Using connected original element for ${nodeId}`)
      return originalElement
    }

    // Try to find the element by ID in the live DOM
    try {
      const freshElement = svgElementRef.current.querySelector(`#${CSS.escape(nodeId)}`)
      if (freshElement) {
        console.log(`getFreshElement: Found fresh element by ID for ${nodeId}`)
        return freshElement
      }
    } catch (e) {
      console.log(`getFreshElement: querySelector failed for ${nodeId}:`, e)
    }

    // Try to find by matching tag and attributes from original element
    const origD = originalElement.getAttribute('d')
    const origPoints = originalElement.getAttribute('points')

    if (origD) {
      // For paths, try to find by d attribute
      const allPaths = svgElementRef.current.querySelectorAll('path')
      for (const path of allPaths) {
        if (path.getAttribute('d') === origD) {
          console.log(`getFreshElement: Found fresh path by d attribute for ${nodeId}`)
          return path
        }
      }
    } else if (origPoints) {
      // For polygons, try to find by points attribute
      const allPolygons = svgElementRef.current.querySelectorAll('polygon')
      for (const poly of allPolygons) {
        if (poly.getAttribute('points') === origPoints) {
          console.log(`getFreshElement: Found fresh polygon by points for ${nodeId}`)
          return poly
        }
      }
    }

    console.log(`getFreshElement: Could not find fresh element for ${nodeId}, using disconnected original`)
    return originalElement
  }, [svgElementRef])

  // Extract all fill paths from the target node (including nested children)
  const fillPaths = useMemo(() => {
    console.log('=== fillPaths useMemo running ===')
    console.log('targetNode:', targetNode?.id, targetNode?.name)
    console.log('svgElementRef.current:', svgElementRef.current ? 'exists' : 'null')

    if (!targetNode) {
      console.log('No targetNode, returning empty array')
      return []
    }

    const paths: FillPathInfo[] = []

    const getElementFill = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
          return fillMatch[1].trim()
        }
      }

      if (fill && fill !== 'none' && fill !== 'transparent') {
        return fill
      }

      return null
    }

    const extractFillPaths = (node: SVGNode) => {
      // Skip nodes that already have customMarkup (already filled)
      if (node.customMarkup) {
        console.log(`Skipping node ${node.id} - has customMarkup`)
        return
      }

      // Get fresh element reference from the live DOM
      const element = getFreshElement(node.id, node.element)
      const fill = getElementFill(element)

      console.log(`Processing node ${node.id}: isGroup=${node.isGroup}, fill=${fill}, tagName=${element.tagName}, isConnected=${element.isConnected}`)

      // Only include actual shape elements with fills (not groups)
      if (fill && !node.isGroup) {
        const tagName = element.tagName.toLowerCase()
        let pathData = ''

        // Get path data based on element type
        if (tagName === 'path') {
          pathData = element.getAttribute('d') || ''
        } else if (tagName === 'rect') {
          const x = element.getAttribute('x') || '0'
          const y = element.getAttribute('y') || '0'
          const w = element.getAttribute('width') || '0'
          const h = element.getAttribute('height') || '0'
          pathData = `rect(${x}, ${y}, ${w}, ${h})`
        } else if (tagName === 'circle') {
          const cx = element.getAttribute('cx') || '0'
          const cy = element.getAttribute('cy') || '0'
          const r = element.getAttribute('r') || '0'
          pathData = `circle(${cx}, ${cy}, r=${r})`
        } else if (tagName === 'ellipse') {
          const cx = element.getAttribute('cx') || '0'
          const cy = element.getAttribute('cy') || '0'
          const rx = element.getAttribute('rx') || '0'
          const ry = element.getAttribute('ry') || '0'
          pathData = `ellipse(${cx}, ${cy}, ${rx}, ${ry})`
        } else if (tagName === 'polygon') {
          pathData = element.getAttribute('points') || ''
        }

        console.log(`  -> Adding path: ${node.id}, type=${tagName}, pathData length=${pathData.length}`)
        paths.push({
          id: node.id,
          type: tagName,
          color: fill,
          pathData,
          element,
        })
      }

      // Recursively process children
      for (const child of node.children) {
        extractFillPaths(child)
      }
    }

    extractFillPaths(targetNode)
    console.log(`fillPaths result: ${paths.length} paths`)
    return paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNode, getFreshElement, svgContent]) // svgContent dependency ensures we get fresh elements after rebuild

  // Calculate bounding box of all fill paths
  const boundingBox = useMemo(() => {
    console.log('=== boundingBox useMemo running ===')
    console.log(`fillPaths.length: ${fillPaths.length}`)

    if (fillPaths.length === 0) {
      console.log('No fill paths, returning null')
      return null
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let successfulBBoxCount = 0

    fillPaths.forEach((path, index) => {
      try {
        const element = path.element as SVGGraphicsElement
        console.log(`  Path ${index} (${path.id}): isConnected=${element.isConnected}, tagName=${element.tagName}`)

        const bbox = element.getBBox?.()
        if (bbox) {
          console.log(`    -> getBBox success: x=${bbox.x}, y=${bbox.y}, w=${bbox.width}, h=${bbox.height}`)
          minX = Math.min(minX, bbox.x)
          minY = Math.min(minY, bbox.y)
          maxX = Math.max(maxX, bbox.x + bbox.width)
          maxY = Math.max(maxY, bbox.y + bbox.height)
          successfulBBoxCount++
        } else {
          console.log(`    -> getBBox returned null/undefined`)
        }
      } catch (e) {
        console.log(`    -> getBBox FAILED:`, e)
      }
    })

    console.log(`Successful getBBox calls: ${successfulBBoxCount}/${fillPaths.length}`)

    if (minX === Infinity) {
      console.log('No valid bboxes found, returning null')
      return null
    }

    const result = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
    console.log('boundingBox result:', result)
    return result
  }, [fillPaths])

  // Generate hatch lines for each path
  const hatchedPaths = useMemo(() => {
    console.log('=== hatchedPaths useMemo running ===')
    console.log(`showHatchPreview=${showHatchPreview}, fillPaths.length=${fillPaths.length}, boundingBox=`, boundingBox)

    if (!showHatchPreview || fillPaths.length === 0 || !boundingBox) {
      console.log('Early return from hatchedPaths')
      return []
    }

    // Generate global hatch lines for line-based patterns
    const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
    const globalCrossLines = crossHatch ? generateGlobalHatchLines(boundingBox, lineSpacing, angle + 90) : []

    const results: { pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[] = []

    fillPaths.forEach((path, index) => {
      try {
        console.log(`Generating ${fillPattern} fill for path ${index} (${path.id}): element connected=${path.element.isConnected}`)
        const polygon = getPolygonPoints(path.element)
        console.log(`  -> polygon points: ${polygon.length}`)

        if (polygon.length >= 3) {
          let lines: HatchLine[] = []

          switch (fillPattern) {
            case 'concentric':
              // Generate concentric (snake) pattern
              lines = generateConcentricLines(polygon, lineSpacing, true)
              break

            case 'wiggle':
              // Generate wiggle/wave pattern
              lines = generateWiggleLines(polygon, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
              break

            case 'spiral':
              // Generate spiral pattern
              lines = generateSpiralLines(polygon, lineSpacing, inset)
              break

            case 'lines':
            default:
              // Standard line hatching
              lines = clipLinesToPolygon(globalLines, polygon, inset)
              // Add cross-hatch if enabled
              if (crossHatch) {
                const crossLines = clipLinesToPolygon(globalCrossLines, polygon, inset)
                lines = [...lines, ...crossLines]
              }
              break
          }

          console.log(`  -> generated ${lines.length} lines`)
          results.push({ pathInfo: path, lines, polygon })
        } else {
          console.log(`  -> skipping, not enough polygon points`)
        }
      } catch (e) {
        console.log(`  -> FAILED:`, e)
      }
    })

    console.log(`hatchedPaths result: ${results.length} paths with ${fillPattern} fill`)
    return results
  }, [showHatchPreview, fillPaths, boundingBox, lineSpacing, angle, crossHatch, inset, fillPattern, wiggleAmplitude, wiggleFrequency])

  // Compute ordered lines using multi-pass optimization:
  // 1. Order shapes by proximity (starting from top-left)
  // 2. Optimize lines within each shape
  // 3. Chain shapes together
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { unoptimizedLines: _unoptimizedLines, optimizedLines, stats } = useMemo(() => {
    if (hatchedPaths.length === 0) {
      return { unoptimizedLines: [], optimizedLines: [], stats: { unoptimizedDistance: 0, optimizedDistance: 0, improvement: 0, shapeCount: 0 } }
    }

    // Unoptimized: flatten lines in original order
    const unoptimized: OrderedLine[] = []
    let globalIndex = 0
    hatchedPaths.forEach(({ pathInfo, lines }) => {
      lines.forEach(line => {
        unoptimized.push({
          ...line,
          pathId: pathInfo.id,
          color: pathInfo.color,
          originalIndex: globalIndex++,
          reversed: false
        })
      })
    })

    // Optimized: use multi-pass algorithm (shape ordering + line optimization within shapes)
    const optimized = optimizeLineOrderMultiPass(hatchedPaths)

    // Calculate statistics
    const unoptimizedDistance = calculateTravelDistance(unoptimized)
    const optimizedDistance = calculateTravelDistance(optimized)
    const improvement = unoptimizedDistance > 0
      ? ((unoptimizedDistance - optimizedDistance) / unoptimizedDistance) * 100
      : 0

    return {
      unoptimizedLines: unoptimized,
      optimizedLines: optimized,
      stats: { unoptimizedDistance, optimizedDistance, improvement, shapeCount: hatchedPaths.length }
    }
  }, [hatchedPaths])

  // Convert mm to SVG units (assuming 96 DPI, 1mm = 3.7795px)
  const penWidthPx = penWidth * 3.7795

  // Generate preview SVG content
  const previewSvg = useMemo(() => {
    console.log('=== previewSvg useMemo running ===')
    console.log(`fillPaths.length=${fillPaths.length}, boundingBox=`, boundingBox)

    if (fillPaths.length === 0 || !boundingBox) {
      console.log('previewSvg: early return, no fillPaths or boundingBox')
      return null
    }

    const padding = 20
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`
    console.log(`previewSvg viewBox: ${viewBox}`)

    const pathElements: string[] = []

    if (showHatchPreview && showOrderVisualization) {
      // Show ordered lines with gradient visualization
      const linesToShow = optimizedLines
      const totalLines = linesToShow.length

      // For animation, only show lines up to the current progress
      const visibleCount = isAnimating
        ? Math.floor((animationProgress / 100) * totalLines)
        : totalLines

      // Draw the hatch lines with gradient colors
      const linesHtml = linesToShow.slice(0, visibleCount).map((line, index) => {
        const position = totalLines > 1 ? index / (totalLines - 1) : 0
        const color = getGradientColor(position)
        return `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round" />`
      }).join('\n')

      pathElements.push(`<g class="order-visualization">${linesHtml}</g>`)

      // Draw travel paths (connections between line ends and next line starts)
      if (!isAnimating || visibleCount > 1) {
        const travelLines: string[] = []
        const lineCount = isAnimating ? visibleCount : linesToShow.length
        for (let i = 1; i < lineCount; i++) {
          const prevEnd = { x: linesToShow[i - 1].x2, y: linesToShow[i - 1].y2 }
          const currStart = { x: linesToShow[i].x1, y: linesToShow[i].y1 }
          travelLines.push(
            `<line x1="${prevEnd.x.toFixed(2)}" y1="${prevEnd.y.toFixed(2)}" x2="${currStart.x.toFixed(2)}" y2="${currStart.y.toFixed(2)}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5" />`
          )
        }
        if (travelLines.length > 0) {
          pathElements.push(`<g class="travel-paths">${travelLines.join('\n')}</g>`)
        }
      }

      // Add outline strokes if retaining strokes
      if (retainStrokes) {
        fillPaths.forEach((path) => {
          const outlineEl = path.element.cloneNode(true) as Element
          outlineEl.setAttribute('fill', 'none')
          outlineEl.setAttribute('stroke', '#ccc')
          outlineEl.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
          outlineEl.removeAttribute('style')
          pathElements.push(outlineEl.outerHTML)
        })
      }
    } else if (showHatchPreview) {
      // Normal hatch preview (original color, no ordering)
      fillPaths.forEach((path) => {
        const hatchData = hatchedPaths.find(h => h.pathInfo.id === path.id)
        if (hatchData && hatchData.lines.length > 0) {
          const linesHtml = hatchData.lines.map(line =>
            `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${path.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round" />`
          ).join('\n')

          pathElements.push(`<g>${linesHtml}</g>`)
        }

        // Add outline stroke if retaining strokes
        if (retainStrokes) {
          const outlineEl = path.element.cloneNode(true) as Element
          outlineEl.setAttribute('fill', 'none')
          outlineEl.setAttribute('stroke', path.color)
          outlineEl.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
          outlineEl.removeAttribute('style')
          pathElements.push(outlineEl.outerHTML)
        }
      })
    } else {
      // Show original shapes with semi-transparent fill
      fillPaths.forEach((path) => {
        const el = path.element.cloneNode(true) as Element
        el.setAttribute('fill', path.color)
        el.setAttribute('fill-opacity', '0.3')
        el.setAttribute('stroke', path.color)
        el.setAttribute('stroke-width', '2')
        pathElements.push(el.outerHTML)
      })
    }

    return { viewBox, content: pathElements.join('\n') }
  }, [fillPaths, boundingBox, showHatchPreview, hatchedPaths, retainStrokes, penWidthPx, showOrderVisualization, optimizedLines, isAnimating, animationProgress])

  const handleBack = () => {
    setFillTargetNodeId(null)
    setActiveTab('sort')
  }

  const handlePreview = useCallback(() => {
    setShowHatchPreview(!showHatchPreview)
    // Reset order visualization when toggling preview
    if (showHatchPreview) {
      setShowOrderVisualization(false)
      setIsAnimating(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [showHatchPreview])

  const handleToggleOrder = useCallback(() => {
    if (!showOrderVisualization) {
      // Turning on order visualization
      setShowOrderVisualization(true)
    } else {
      // Turning off - also stop animation
      setShowOrderVisualization(false)
      setIsAnimating(false)
      setAnimationProgress(0)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [showOrderVisualization])

  const handleToggleAnimation = useCallback(() => {
    if (isAnimating) {
      // Stop animation
      setIsAnimating(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    } else {
      // Start animation
      setIsAnimating(true)
      setAnimationProgress(0)
      const startTime = performance.now()
      const duration = 5000 // 5 seconds for full animation

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min((elapsed / duration) * 100, 100)
        setAnimationProgress(progress)

        if (progress < 100) {
          animationRef.current = requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
          animationRef.current = null
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }
  }, [isAnimating])

  const handleApplyFill = useCallback(() => {
    if (!targetNode || hatchedPaths.length === 0) return

    // Build a map of node ID to custom markup
    const customMarkupMap = new Map<string, string>()

    // Group optimized lines by their original path ID to maintain per-path grouping
    // but use the optimized order within each path
    const linesByPath = new Map<string, OrderedLine[]>()
    optimizedLines.forEach(line => {
      const existing = linesByPath.get(line.pathId) || []
      existing.push(line)
      linesByPath.set(line.pathId, existing)
    })

    // Generate markup for each hatched path using optimized line order
    hatchedPaths.forEach(({ pathInfo }) => {
      const lines = linesByPath.get(pathInfo.id) || []
      // Build the hatch group markup as a string using optimized order
      const linesMarkup = lines.map(line =>
        `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${line.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/>`
      ).join('\n')

      let outlineMarkup = ''
      if (retainStrokes) {
        // Clone the original element and modify attributes for outline
        const el = pathInfo.element.cloneNode(true) as Element
        el.setAttribute('fill', 'none')
        el.setAttribute('stroke', pathInfo.color)
        el.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
        el.removeAttribute('style')
        const serializer = new XMLSerializer()
        outlineMarkup = serializer.serializeToString(el)
      }

      const groupMarkup = `<g id="hatch-${pathInfo.id}">\n${linesMarkup}\n${outlineMarkup}\n</g>`
      customMarkupMap.set(pathInfo.id, groupMarkup)
    })

    // Update layer nodes with custom markup
    const updateNodeMarkup = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        const customMarkup = customMarkupMap.get(node.id)
        if (customMarkup) {
          return {
            ...node,
            customMarkup,
            type: 'g',
            isGroup: true,
            name: `hatch-${node.name || node.id}`,
          }
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNodeMarkup(node.children) }
        }
        return node
      })
    }

    const updatedNodes = updateNodeMarkup(layerNodes)
    setLayerNodes(updatedNodes)

    // Rebuild SVG with the updated nodes (pass explicitly to avoid stale closure)
    rebuildSvgFromLayers(updatedNodes)

    setFillTargetNodeId(null)
    setActiveTab('sort')
  }, [targetNode, hatchedPaths, optimizedLines, retainStrokes, penWidthPx, layerNodes, setLayerNodes, setFillTargetNodeId, setActiveTab, rebuildSvgFromLayers])

  if (!svgContent) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No SVG Loaded</h3>
          <p>Go to the Sort tab and upload an SVG to use line fill features.</p>
        </div>
      </div>
    )
  }

  if (!fillTargetNodeId || !targetNode) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No Layer Selected</h3>
          <p>Go to the Sort tab, select a layer with fills, and click the Fill button.</p>
          <button className="back-button" onClick={handleBack}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fill-tab">
      <aside className="fill-sidebar">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleBack}>
            ← Back
          </button>
          <h2>Line Fill</h2>
        </div>
        <div className="sidebar-content">
          <div className="fill-section">
            <h3>Target Layer</h3>
            <div className="target-layer-info">
              <span className="target-layer-name">{targetNode.name || targetNode.id}</span>
              {targetNode.isGroup && (
                <span className="target-layer-type">Group</span>
              )}
            </div>
          </div>

          <div className="fill-section">
            <h3>Fill Paths ({fillPaths.length})</h3>
            <div className="fill-paths-list">
              {fillPaths.map((path, index) => (
                <div key={path.id} className="fill-path-item">
                  <span
                    className="path-color-swatch"
                    style={{ backgroundColor: path.color }}
                  />
                  <span className="path-info">
                    <span className="path-type">{path.type}</span>
                    <span className="path-id">{path.id || `path-${index + 1}`}</span>
                  </span>
                </div>
              ))}
              {fillPaths.length === 0 && (
                <div className="no-paths-message">
                  No fill paths found in selection
                </div>
              )}
            </div>
          </div>

          <div className="fill-section">
            <h3>Pattern Type</h3>
            <div className="pattern-selector">
              <button
                className={`pattern-btn ${fillPattern === 'lines' ? 'active' : ''}`}
                onClick={() => setFillPattern('lines')}
                title="Parallel lines at an angle"
              >
                Lines
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'concentric' ? 'active' : ''}`}
                onClick={() => setFillPattern('concentric')}
                title="Concentric loops from outside in (snake)"
              >
                Concentric
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'wiggle' ? 'active' : ''}`}
                onClick={() => setFillPattern('wiggle')}
                title="Wavy/wiggle lines"
              >
                Wiggle
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'spiral' ? 'active' : ''}`}
                onClick={() => setFillPattern('spiral')}
                title="Spiral from center outward"
              >
                Spiral
              </button>
            </div>
          </div>

          <div className="fill-section">
            <h3>Pattern Settings</h3>

            <div className="fill-control">
              <label>Line Spacing</label>
              <div className="control-row">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{lineSpacing}px</span>
              </div>
            </div>

            <div className="fill-control">
              <label>Angle</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{angle}°</span>
              </div>
            </div>

            {fillPattern === 'lines' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={crossHatch}
                    onChange={(e) => setCrossHatch(e.target.checked)}
                  />
                  Cross-hatch
                </label>
              </div>
            )}

            {fillPattern === 'wiggle' && (
              <>
                <div className="fill-control">
                  <label>Amplitude</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={wiggleAmplitude}
                      onChange={(e) => setWiggleAmplitude(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{wiggleAmplitude}px</span>
                  </div>
                </div>
                <div className="fill-control">
                  <label>Frequency</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={wiggleFrequency}
                      onChange={(e) => setWiggleFrequency(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{wiggleFrequency}</span>
                  </div>
                </div>
              </>
            )}

            {(fillPattern === 'lines' || fillPattern === 'wiggle') && (
              <div className="fill-control">
                <label>Inset</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={inset}
                  onChange={(e) => setInset(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{inset}px</span>
              </div>
            </div>
            )}

            <div className="fill-control">
              <label>Pen Width</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{penWidth}mm</span>
              </div>
            </div>

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={retainStrokes}
                  onChange={(e) => setRetainStrokes(e.target.checked)}
                />
                Retain strokes (edge outlines)
              </label>
            </div>
          </div>

          <div className="fill-actions">
            <button
              className={`fill-preview-btn ${showHatchPreview ? 'active' : ''}`}
              disabled={fillPaths.length === 0}
              onClick={handlePreview}
            >
              {showHatchPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              className={`fill-order-btn ${showOrderVisualization ? 'active' : ''}`}
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleToggleOrder}
              title="Visualize path order with red→blue gradient"
            >
              {showOrderVisualization ? 'Hide Order' : 'Order'}
            </button>
          </div>

          {showOrderVisualization && (
            <div className="order-controls">
              <button
                className={`animate-btn ${isAnimating ? 'active' : ''}`}
                onClick={handleToggleAnimation}
                disabled={optimizedLines.length === 0}
              >
                {isAnimating ? 'Stop' : 'Play'}
              </button>
              {isAnimating && (
                <div className="animation-progress">
                  <div
                    className="animation-progress-bar"
                    style={{ width: `${animationProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {showOrderVisualization && stats.unoptimizedDistance > 0 && (
            <div className="order-stats">
              <div className="stat-row">
                <span className="stat-label">Shapes:</span>
                <span className="stat-value">{stats.shapeCount}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Lines:</span>
                <span className="stat-value">{optimizedLines.length}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Travel (orig):</span>
                <span className="stat-value">{stats.unoptimizedDistance.toFixed(1)}px</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Travel (opt):</span>
                <span className="stat-value">{stats.optimizedDistance.toFixed(1)}px</span>
              </div>
              <div className="stat-row highlight">
                <span className="stat-label">Saved:</span>
                <span className="stat-value">{stats.improvement.toFixed(1)}%</span>
              </div>
            </div>
          )}

          <div className="fill-actions secondary">
            <button
              className="fill-apply-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleApplyFill}
              title={!showHatchPreview ? 'Preview first to see the result' : 'Apply hatching to the SVG'}
            >
              Apply Fill
            </button>
          </div>
        </div>
      </aside>

      <main className="fill-main" ref={previewRef}>
        {previewSvg ? (
          <div className="fill-preview-container">
            <svg
              className="fill-preview-svg"
              viewBox={previewSvg.viewBox}
              preserveAspectRatio="xMidYMid meet"
              dangerouslySetInnerHTML={{ __html: previewSvg.content }}
            />
            {showHatchPreview && !showOrderVisualization && (
              <div className="preview-label">Hatch Preview</div>
            )}
            {showOrderVisualization && (
              <div className="preview-label order">
                Order View
                <span className="gradient-legend">
                  <span className="start">Start</span>
                  <span className="gradient-bar" />
                  <span className="end">End</span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="fill-preview-empty">
            <p>No geometry to preview</p>
          </div>
        )}
      </main>
    </div>
  )
}
