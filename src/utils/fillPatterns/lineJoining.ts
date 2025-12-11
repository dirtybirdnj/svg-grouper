// Line joining optimization - joins lines that share endpoints into continuous paths

import { Point, HatchLine, distance } from '../geometry'
import { OrderedLine, EndpointEntry } from './types'

// Thresholds for optimization
export const ENDPOINT_TOLERANCE = 0.01 // Tolerance for matching endpoints (in SVG units)

// Build spatial index of endpoints using a grid for O(1) lookup
export function buildEndpointGrid(
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
export function findNearbyEndpoints(
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
