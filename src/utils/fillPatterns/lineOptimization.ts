// Multi-pass line ordering optimization with 2-opt improvement

import { Point, HatchLine, distance } from '../geometry'
import { OrderedLine, OptimizedShape, ShapeInfo } from './types'
import { calculateShapeCentroid, getShapeTopLeft, getShapeEndpoints, reverseShapeLines } from './shapeUtils'
import { joinContinuousLines } from './lineJoining'

// Thresholds for optimization - skip expensive algorithms for large datasets
const OPTIMIZATION_LINE_THRESHOLD = 5000 // Skip within-shape optimization above this
const OPTIMIZATION_SHAPE_THRESHOLD = 200 // Skip 2-opt improvement above this many shapes

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
  const shapes: ShapeInfo[] = hatchedPaths.map(({ pathInfo, lines }) => ({
    pathId: pathInfo.id,
    color: pathInfo.color,
    lines: [...lines],
    centroid: calculateShapeCentroid(lines),
    topLeft: getShapeTopLeft(lines)
  }))

  // Order shapes by nearest-neighbor starting from origin
  const orderedShapes: ShapeInfo[] = []
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
