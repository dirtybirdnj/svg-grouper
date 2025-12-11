// Line optimization algorithms for pen plotters

import { OrderLine } from '../../../context/AppContext'
import { Point, distance } from '../../../utils/geometry'
import { OPTIMIZATION } from '../../../constants'
import { OrderedLine } from './types'

/**
 * Optimize lines by color - groups lines by color, optimizes within each group.
 * This simulates real pen plotter behavior: draw all of one color before changing pens.
 */
export function optimizeLinesByColor(lines: OrderLine[], colorOrder: string[]): OrderedLine[] {
  if (lines.length === 0) return []

  // Filter out any invalid lines
  const validLines = lines.filter(line =>
    typeof line.x1 === 'number' && !isNaN(line.x1) &&
    typeof line.y1 === 'number' && !isNaN(line.y1) &&
    typeof line.x2 === 'number' && !isNaN(line.x2) &&
    typeof line.y2 === 'number' && !isNaN(line.y2)
  )

  if (validLines.length === 0) return []

  // Group lines by color
  const colorGroups = new Map<string, OrderLine[]>()
  for (const line of validLines) {
    const key = line.color
    if (!colorGroups.has(key)) {
      colorGroups.set(key, [])
    }
    colorGroups.get(key)!.push(line)
  }

  // Process colors in specified order, then any remaining colors
  const result: OrderedLine[] = []
  const processedColors = new Set<string>()

  // First, process colors in the specified order
  for (const color of colorOrder) {
    const groupLines = colorGroups.get(color)
    if (groupLines && groupLines.length > 0) {
      const optimizedGroup = groupLines.length > OPTIMIZATION.MAX_LINES_FOR_FULL
        ? optimizeLinesChunked(groupLines)
        : optimizeLinesNearestNeighbor(groupLines)
      result.push(...optimizedGroup)
      processedColors.add(color)
    }
  }

  // Then process any colors not in the specified order
  for (const [color, groupLines] of colorGroups) {
    if (!processedColors.has(color) && groupLines.length > 0) {
      const optimizedGroup = groupLines.length > OPTIMIZATION.MAX_LINES_FOR_FULL
        ? optimizeLinesChunked(groupLines)
        : optimizeLinesNearestNeighbor(groupLines)
      result.push(...optimizedGroup)
    }
  }

  return result
}

/**
 * Full O(n²) nearest-neighbor optimization - only for smaller datasets
 */
export function optimizeLinesNearestNeighbor(lines: OrderLine[]): OrderedLine[] {
  const result: OrderedLine[] = []
  const remaining = lines.map((line, idx) => ({ ...line, originalIndex: idx }))
  let currentPoint: Point = { x: 0, y: 0 }

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

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
        ...chosenLine,
        x1: chosenLine.x2,
        y1: chosenLine.y2,
        x2: chosenLine.x1,
        y2: chosenLine.y1,
        reversed: true
      })
      currentPoint = { x: chosenLine.x1, y: chosenLine.y1 }
    } else {
      result.push({
        ...chosenLine,
        reversed: false
      })
      currentPoint = { x: chosenLine.x2, y: chosenLine.y2 }
    }
  }

  return result
}

/**
 * Chunked optimization for large datasets - O(n * chunkSize) instead of O(n²).
 * Divides lines into spatial chunks and optimizes within/between chunks.
 */
export function optimizeLinesChunked(lines: OrderLine[]): OrderedLine[] {
  // Sort lines by their starting x coordinate to get some spatial locality
  const indexedLines = lines.map((line, idx) => ({ ...line, originalIndex: idx }))
  indexedLines.sort((a, b) => a.x1 - b.x1)

  const result: OrderedLine[] = []
  let currentPoint: Point = { x: 0, y: 0 }

  // Process in chunks
  for (let chunkStart = 0; chunkStart < indexedLines.length; chunkStart += OPTIMIZATION.CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + OPTIMIZATION.CHUNK_SIZE, indexedLines.length)
    const chunk = indexedLines.slice(chunkStart, chunkEnd)

    // Optimize within this chunk using nearest-neighbor
    const remaining = [...chunk]

    while (remaining.length > 0) {
      let bestIndex = 0
      let bestDistance = Infinity
      let shouldReverse = false

      for (let i = 0; i < remaining.length; i++) {
        const line = remaining[i]
        const distToStart = distance(currentPoint, { x: line.x1, y: line.y1 })
        if (distToStart < bestDistance) {
          bestDistance = distToStart
          bestIndex = i
          shouldReverse = false
        }

        const distToEnd = distance(currentPoint, { x: line.x2, y: line.y2 })
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd
          bestIndex = i
          shouldReverse = true
        }
      }

      const chosenLine = remaining.splice(bestIndex, 1)[0]

      if (shouldReverse) {
        result.push({
          ...chosenLine,
          x1: chosenLine.x2,
          y1: chosenLine.y2,
          x2: chosenLine.x1,
          y2: chosenLine.y1,
          reversed: true
        })
        currentPoint = { x: chosenLine.x1, y: chosenLine.y1 }
      } else {
        result.push({
          ...chosenLine,
          reversed: false
        })
        currentPoint = { x: chosenLine.x2, y: chosenLine.y2 }
      }
    }
  }

  return result
}
