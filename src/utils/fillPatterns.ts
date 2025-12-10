// Fill pattern types and line ordering optimization
// NOTE: All pattern generation is now handled by rat-king (Rust) via IPC
// This file only contains types and post-processing optimization functions

import { Point, HatchLine, distance } from './geometry'

// Ordered line with metadata for plotter optimization
export interface OrderedLine extends HatchLine {
  originalIndex: number
  pathId: string
  color: string
  reversed: boolean
}

// Fill pattern types - these match rat-king pattern names
export type FillPatternType =
  | 'lines'
  | 'concentric'
  | 'wiggle'
  | 'spiral'
  | 'honeycomb'
  | 'gyroid'
  | 'crosshatch'
  | 'zigzag'
  | 'radial'
  | 'crossspiral'
  | 'hilbert'
  | 'fermat'
  | 'wave'
  | 'scribble'
  | 'custom'
  | 'guilloche'
  | 'lissajous'
  | 'rose'
  | 'phyllotaxis'
  | 'pentagon15'
  | 'pentagon14'
  | 'grid'
  | 'brick'
  | 'truchet'
  | 'stipple'
  | 'peano'
  | 'sierpinski'
  | 'diagonal'
  | 'herringbone'
  | 'stripe'
  | 'tessellation'
  | 'harmonograph'

// Tile shape type for custom pattern
export type TileShapeType =
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'hexagon'
  | 'star'
  | 'plus'
  | 'circle'

// Predefined tile shapes (normalized to unit size)
export const TILE_SHAPES: Record<TileShapeType, Point[]> = {
  // Triangle pointing up
  triangle: [
    { x: 0, y: -0.5 },
    { x: 0.433, y: 0.25 },
    { x: -0.433, y: 0.25 }
  ],
  // Square
  square: [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 }
  ],
  // Diamond
  diamond: [
    { x: 0, y: -0.5 },
    { x: 0.5, y: 0 },
    { x: 0, y: 0.5 },
    { x: -0.5, y: 0 }
  ],
  // Hexagon
  hexagon: [
    { x: 0.5, y: 0 },
    { x: 0.25, y: 0.433 },
    { x: -0.25, y: 0.433 },
    { x: -0.5, y: 0 },
    { x: -0.25, y: -0.433 },
    { x: 0.25, y: -0.433 }
  ],
  // Star (5-pointed)
  star: [
    { x: 0, y: -0.5 },
    { x: 0.118, y: -0.154 },
    { x: 0.476, y: -0.154 },
    { x: 0.191, y: 0.059 },
    { x: 0.294, y: 0.405 },
    { x: 0, y: 0.191 },
    { x: -0.294, y: 0.405 },
    { x: -0.191, y: 0.059 },
    { x: -0.476, y: -0.154 },
    { x: -0.118, y: -0.154 }
  ],
  // Plus/Cross
  plus: [
    { x: -0.167, y: -0.5 },
    { x: 0.167, y: -0.5 },
    { x: 0.167, y: -0.167 },
    { x: 0.5, y: -0.167 },
    { x: 0.5, y: 0.167 },
    { x: 0.167, y: 0.167 },
    { x: 0.167, y: 0.5 },
    { x: -0.167, y: 0.5 },
    { x: -0.167, y: 0.167 },
    { x: -0.5, y: 0.167 },
    { x: -0.5, y: -0.167 },
    { x: -0.167, y: -0.167 }
  ],
  // Circle approximation (12-sided)
  circle: Array.from({ length: 12 }, (_, i) => ({
    x: 0.5 * Math.cos((i / 12) * Math.PI * 2),
    y: 0.5 * Math.sin((i / 12) * Math.PI * 2)
  }))
}

// ============= LINE ORDERING OPTIMIZATION =============
// These functions optimize the order of drawing lines to minimize pen travel
// This is post-processing done after rat-king generates the fill lines

// Thresholds for optimization - skip expensive algorithms for large datasets
const OPTIMIZATION_LINE_THRESHOLD = 5000 // Skip within-shape optimization above this
const OPTIMIZATION_SHAPE_THRESHOLD = 200 // Skip 2-opt improvement above this many shapes
const ENDPOINT_TOLERANCE = 0.01 // Tolerance for matching endpoints (in SVG units)

// Calculate the centroid of a set of lines
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

// Get the top-left-most point of a shape
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

// Get the entry and exit points of a shape's optimized lines
function getShapeEndpoints(lines: HatchLine[]): { entry: Point; exit: Point } {
  if (lines.length === 0) {
    return { entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 } }
  }
  return {
    entry: { x: lines[0].x1, y: lines[0].y1 },
    exit: { x: lines[lines.length - 1].x2, y: lines[lines.length - 1].y2 }
  }
}

// Reverse all lines in a shape (for traversing in opposite direction)
function reverseShapeLines(lines: OrderedLine[]): OrderedLine[] {
  return lines
    .map((line) => ({
      ...line,
      x1: line.x2,
      y1: line.y2,
      x2: line.x1,
      y2: line.y1,
      reversed: !line.reversed
    }))
    .reverse()
}

// ============= LINE JOINING OPTIMIZATION =============
// Joins lines that share endpoints into continuous paths to reduce pen lifts

interface EndpointEntry {
  lineIndex: number
  isStart: boolean // true = start of line, false = end of line
}

// Build spatial index of endpoints using a grid for O(1) lookup
function buildEndpointGrid(
  lines: HatchLine[],
  tolerance: number
): Map<string, EndpointEntry[]> {
  const grid = new Map<string, EndpointEntry[]>()
  const cellSize = tolerance * 10 // Grid cell size

  const getKey = (x: number, y: number): string => {
    const cx = Math.floor(x / cellSize)
    const cy = Math.floor(y / cellSize)
    return `${cx},${cy}`
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Add start point
    const startKey = getKey(line.x1, line.y1)
    if (!grid.has(startKey)) grid.set(startKey, [])
    grid.get(startKey)!.push({ lineIndex: i, isStart: true })

    // Add end point
    const endKey = getKey(line.x2, line.y2)
    if (!grid.has(endKey)) grid.set(endKey, [])
    grid.get(endKey)!.push({ lineIndex: i, isStart: false })
  }

  return grid
}

// Find all endpoints near a given point
function findNearbyEndpoints(
  point: Point,
  grid: Map<string, EndpointEntry[]>,
  lines: HatchLine[],
  usedLines: Set<number>,
  tolerance: number
): Array<{ entry: EndpointEntry; dist: number }> {
  const cellSize = tolerance * 10
  const cx = Math.floor(point.x / cellSize)
  const cy = Math.floor(point.y / cellSize)

  const results: Array<{ entry: EndpointEntry; dist: number }> = []

  // Check current cell and all 8 neighbors
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cx + dx},${cy + dy}`
      const entries = grid.get(key)
      if (!entries) continue

      for (const entry of entries) {
        if (usedLines.has(entry.lineIndex)) continue

        const line = lines[entry.lineIndex]
        const endPoint = entry.isStart
          ? { x: line.x1, y: line.y1 }
          : { x: line.x2, y: line.y2 }

        const dist = distance(point, endPoint)
        if (dist <= tolerance) {
          results.push({ entry, dist })
        }
      }
    }
  }

  // Sort by distance
  results.sort((a, b) => a.dist - b.dist)
  return results
}

// Join lines into continuous paths
export function joinContinuousLines(
  lines: HatchLine[],
  pathId: string,
  color: string,
  startingPoint: Point,
  startingIndex: number,
  tolerance: number = ENDPOINT_TOLERANCE
): { orderedLines: OrderedLine[]; endPoint: Point } {
  if (lines.length === 0) return { orderedLines: [], endPoint: startingPoint }

  const grid = buildEndpointGrid(lines, tolerance)
  const usedLines = new Set<number>()
  const result: OrderedLine[] = []
  let currentPoint = startingPoint
  let globalIndex = startingIndex

  while (usedLines.size < lines.length) {
    // First, try to find a line that connects to current position
    const connected = findNearbyEndpoints(
      currentPoint,
      grid,
      lines,
      usedLines,
      tolerance
    )

    if (connected.length > 0) {
      // Found a connecting line - use it
      const { entry } = connected[0]
      const line = lines[entry.lineIndex]
      usedLines.add(entry.lineIndex)

      // If we connected to the END of the line, reverse it
      const shouldReverse = !entry.isStart

      if (shouldReverse) {
        result.push({
          x1: line.x2,
          y1: line.y2,
          x2: line.x1,
          y2: line.y1,
          pathId,
          color,
          originalIndex: globalIndex++,
          reversed: true
        })
        currentPoint = { x: line.x1, y: line.y1 }
      } else {
        result.push({
          x1: line.x1,
          y1: line.y1,
          x2: line.x2,
          y2: line.y2,
          pathId,
          color,
          originalIndex: globalIndex++,
          reversed: false
        })
        currentPoint = { x: line.x2, y: line.y2 }
      }
    } else {
      // No connecting line found - need to lift pen and find nearest unvisited line
      let bestIndex = -1
      let bestDistance = Infinity
      let bestIsStart = true

      for (let i = 0; i < lines.length; i++) {
        if (usedLines.has(i)) continue

        const line = lines[i]
        const distToStart = distance(currentPoint, { x: line.x1, y: line.y1 })
        const distToEnd = distance(currentPoint, { x: line.x2, y: line.y2 })

        if (distToStart < bestDistance) {
          bestDistance = distToStart
          bestIndex = i
          bestIsStart = true
        }
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd
          bestIndex = i
          bestIsStart = false
        }
      }

      if (bestIndex >= 0) {
        const line = lines[bestIndex]
        usedLines.add(bestIndex)

        if (!bestIsStart) {
          // Start from end, so reverse
          result.push({
            x1: line.x2,
            y1: line.y2,
            x2: line.x1,
            y2: line.y1,
            pathId,
            color,
            originalIndex: globalIndex++,
            reversed: true
          })
          currentPoint = { x: line.x1, y: line.y1 }
        } else {
          result.push({
            x1: line.x1,
            y1: line.y1,
            x2: line.x2,
            y2: line.y2,
            pathId,
            color,
            originalIndex: globalIndex++,
            reversed: false
          })
          currentPoint = { x: line.x2, y: line.y2 }
        }
      }
    }
  }

  return { orderedLines: result, endPoint: currentPoint }
}

// Multi-pass optimization for line ordering with 2-opt improvement
export function optimizeLineOrderMultiPass(
  hatchedPaths: { pathInfo: { id: string; color: string }; lines: HatchLine[] }[]
): OrderedLine[] {
  if (hatchedPaths.length === 0) return []

  // Count total lines to decide optimization level
  const totalLines = hatchedPaths.reduce((sum, p) => sum + p.lines.length, 0)
  const skipWithinShapeOptimization = totalLines > OPTIMIZATION_LINE_THRESHOLD
  const skipTwoOptImprovement =
    hatchedPaths.length > OPTIMIZATION_SHAPE_THRESHOLD

  // ===== PASS 1: Initial ordering with nearest-neighbor =====
  const shapes = hatchedPaths.map(({ pathInfo, lines }) => ({
    pathId: pathInfo.id,
    color: pathInfo.color,
    lines: [...lines],
    centroid: calculateShapeCentroid(lines),
    topLeft: getShapeTopLeft(lines)
  }))

  // Order shapes by nearest-neighbor starting from origin
  const orderedShapes: typeof shapes = []
  const remainingShapes = [...shapes]
  let currentPoint: Point = { x: 0, y: 0 }

  while (remainingShapes.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity

    for (let i = 0; i < remainingShapes.length; i++) {
      const dist = distance(currentPoint, remainingShapes[i].topLeft)
      if (dist < bestDistance) {
        bestDistance = dist
        bestIndex = i
      }
    }

    const chosen = remainingShapes.splice(bestIndex, 1)[0]
    orderedShapes.push(chosen)
    currentPoint = chosen.centroid
  }

  // Optimize lines within each shape and track endpoints
  interface OptimizedShape {
    pathId: string
    color: string
    lines: OrderedLine[]
    entry: Point
    exit: Point
    reversed: boolean
  }

  const optimizedShapes: OptimizedShape[] = []
  let penPosition: Point = { x: 0, y: 0 }
  let globalIndex = 0

  for (const shape of orderedShapes) {
    let orderedLines: OrderedLine[]
    let endPoint: Point

    if (skipWithinShapeOptimization) {
      // Fast path: just convert lines to OrderedLine without optimization
      orderedLines = shape.lines.map((line, idx) => ({
        ...line,
        pathId: shape.pathId,
        color: shape.color,
        originalIndex: globalIndex + idx,
        reversed: false
      }))
      endPoint =
        orderedLines.length > 0
          ? {
              x: orderedLines[orderedLines.length - 1].x2,
              y: orderedLines[orderedLines.length - 1].y2
            }
          : penPosition
    } else {
      // Full optimization: join continuous lines and nearest-neighbor for disconnected ones
      const result = joinContinuousLines(
        shape.lines,
        shape.pathId,
        shape.color,
        penPosition,
        globalIndex
      )
      orderedLines = result.orderedLines
      endPoint = result.endPoint
    }

    const endpoints = getShapeEndpoints(orderedLines)
    optimizedShapes.push({
      pathId: shape.pathId,
      color: shape.color,
      lines: orderedLines,
      entry: endpoints.entry,
      exit: endpoints.exit,
      reversed: false
    })

    globalIndex += orderedLines.length
    penPosition = endPoint
  }

  // ===== PASS 2: 2-opt style improvement =====
  // Try reversing individual shapes and swapping adjacent pairs
  // Skip for large shape counts

  if (optimizedShapes.length > 1 && !skipTwoOptImprovement) {
    let improved = true
    let iterations = 0
    const maxIterations = optimizedShapes.length * 2 // Limit iterations

    while (improved && iterations < maxIterations) {
      improved = false
      iterations++

      // Try reversing each shape
      for (let i = 0; i < optimizedShapes.length; i++) {
        const shape = optimizedShapes[i]
        const prevExit =
          i === 0 ? { x: 0, y: 0 } : optimizedShapes[i - 1].exit
        const nextEntry =
          i < optimizedShapes.length - 1
            ? optimizedShapes[i + 1].entry
            : null

        // Current distances
        const currentEntryDist = distance(prevExit, shape.entry)
        const currentExitDist = nextEntry
          ? distance(shape.exit, nextEntry)
          : 0

        // If reversed
        const reversedEntryDist = distance(prevExit, shape.exit)
        const reversedExitDist = nextEntry
          ? distance(shape.entry, nextEntry)
          : 0

        if (
          reversedEntryDist + reversedExitDist <
          currentEntryDist + currentExitDist - 0.01
        ) {
          // Reverse this shape
          shape.lines = reverseShapeLines(shape.lines)
          const temp = shape.entry
          shape.entry = shape.exit
          shape.exit = temp
          shape.reversed = !shape.reversed
          improved = true
        }
      }

      // Try swapping adjacent pairs
      for (let i = 0; i < optimizedShapes.length - 1; i++) {
        const shapeA = optimizedShapes[i]
        const shapeB = optimizedShapes[i + 1]
        const prevExit =
          i === 0 ? { x: 0, y: 0 } : optimizedShapes[i - 1].exit
        const nextEntry =
          i < optimizedShapes.length - 2
            ? optimizedShapes[i + 2].entry
            : null

        // Current: prev -> A -> B -> next
        const currentDist =
          distance(prevExit, shapeA.entry) +
          distance(shapeA.exit, shapeB.entry) +
          (nextEntry ? distance(shapeB.exit, nextEntry) : 0)

        // Swapped: prev -> B -> A -> next
        const swappedDist =
          distance(prevExit, shapeB.entry) +
          distance(shapeB.exit, shapeA.entry) +
          (nextEntry ? distance(shapeA.exit, nextEntry) : 0)

        if (swappedDist < currentDist - 0.01) {
          // Swap shapes
          optimizedShapes[i] = shapeB
          optimizedShapes[i + 1] = shapeA
          improved = true
        }
      }
    }
  }

  // ===== Reassemble final result with updated indices =====
  const result: OrderedLine[] = []
  globalIndex = 0

  for (const shape of optimizedShapes) {
    for (const line of shape.lines) {
      result.push({
        ...line,
        originalIndex: globalIndex++
      })
    }
  }

  return result
}

// Calculate total travel distance (useful for debugging optimization)
export function calculateTravelDistance(lines: OrderedLine[]): number {
  if (lines.length <= 1) return 0

  let totalDistance = 0
  for (let i = 1; i < lines.length; i++) {
    const prevEnd = { x: lines[i - 1].x2, y: lines[i - 1].y2 }
    const currStart = { x: lines[i].x1, y: lines[i].y1 }
    totalDistance += distance(prevEnd, currStart)
  }
  return totalDistance
}
