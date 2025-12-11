// Fill utility functions - polygon operations and line simplification

import { Point, HatchLine, PolygonWithHoles } from '../../../utils/geometry'
import { OPTIMIZATION } from '../../../constants'
import simplify from 'simplify-js'
import polygonClipping, { Polygon as ClipPolygon } from 'polygon-clipping'

// Helper functions for polygon union
export function polygonWithHolesToClip(poly: PolygonWithHoles): ClipPolygon {
  const outer: [number, number][] = poly.outer.map(p => [p.x, p.y])
  const holes: [number, number][][] = poly.holes.map(hole => hole.map(p => [p.x, p.y]))
  return [outer, ...holes]
}

export function clipResultToPolygonWithHoles(result: ClipPolygon[]): PolygonWithHoles[] {
  return result.map(poly => {
    const outer: Point[] = poly[0].map(([x, y]) => ({ x, y }))
    const holes: Point[][] = poly.slice(1).map(ring => ring.map(([x, y]) => ({ x, y })))
    return { outer, holes }
  })
}

// Union multiple polygons into one compound shape
export function unionPolygonsForFill(polygons: PolygonWithHoles[]): PolygonWithHoles[] {
  if (polygons.length === 0) return []
  if (polygons.length === 1) return polygons

  try {
    let result: ClipPolygon[] = [polygonWithHolesToClip(polygons[0])]

    for (let i = 1; i < polygons.length; i++) {
      const clipPoly: ClipPolygon[] = [polygonWithHolesToClip(polygons[i])]
      result = polygonClipping.union(result, clipPoly)
    }

    return clipResultToPolygonWithHoles(result)
  } catch (error) {
    console.error('[FillTab] Polygon union failed:', error)
    return polygons // Return original if union fails
  }
}

// Chain connected line segments into polylines, then simplify each polyline
// Returns simplified lines that approximate the original with fewer points
// Uses spatial indexing for O(n) performance instead of O(n²)
export function simplifyLines(lines: HatchLine[], tolerance: number): HatchLine[] {
  if (tolerance <= 0 || lines.length === 0) return lines

  const CONNECT_THRESHOLD = OPTIMIZATION.CONNECT_THRESHOLD
  const GRID_SIZE = CONNECT_THRESHOLD * 2 // Grid cell size for spatial hashing

  // Spatial hash function - rounds point to grid cell
  const hashPoint = (x: number, y: number): string => {
    const gx = Math.floor(x / GRID_SIZE)
    const gy = Math.floor(y / GRID_SIZE)
    return `${gx},${gy}`
  }

  // Build spatial index: map from grid cell to line indices with endpoints in that cell
  // Each line is indexed by both its endpoints
  const spatialIndex = new Map<string, Set<number>>()

  const addToIndex = (x: number, y: number, lineIndex: number) => {
    const hash = hashPoint(x, y)
    let set = spatialIndex.get(hash)
    if (!set) {
      set = new Set()
      spatialIndex.set(hash, set)
    }
    set.add(lineIndex)
    // Also add to adjacent cells for threshold tolerance
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        const gx = Math.floor(x / GRID_SIZE) + dx
        const gy = Math.floor(y / GRID_SIZE) + dy
        const adjHash = `${gx},${gy}`
        let adjSet = spatialIndex.get(adjHash)
        if (!adjSet) {
          adjSet = new Set()
          spatialIndex.set(adjHash, adjSet)
        }
        adjSet.add(lineIndex)
      }
    }
  }

  // Index all line endpoints
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    addToIndex(line.x1, line.y1, i)
    addToIndex(line.x2, line.y2, i)
  }

  // Build chains using spatial index for fast neighbor lookup
  const chains: Point[][] = []
  const used = new Set<number>()

  // Helper to find connecting line using spatial index
  const findConnectingLine = (x: number, y: number): { lineIndex: number; isP1: boolean } | null => {
    const hash = hashPoint(x, y)
    const candidates = spatialIndex.get(hash)
    if (!candidates) return null

    for (const j of candidates) {
      if (used.has(j)) continue
      const line = lines[j]

      const d1 = Math.hypot(line.x1 - x, line.y1 - y)
      if (d1 < CONNECT_THRESHOLD) {
        return { lineIndex: j, isP1: true }
      }

      const d2 = Math.hypot(line.x2 - x, line.y2 - y)
      if (d2 < CONNECT_THRESHOLD) {
        return { lineIndex: j, isP1: false }
      }
    }
    return null
  }

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue

    // Start a new chain
    const chain: Point[] = [
      { x: lines[i].x1, y: lines[i].y1 },
      { x: lines[i].x2, y: lines[i].y2 }
    ]
    used.add(i)

    // Extend chain from end
    let found = true
    while (found) {
      found = false
      const chainEnd = chain[chain.length - 1]
      const result = findConnectingLine(chainEnd.x, chainEnd.y)
      if (result) {
        const line = lines[result.lineIndex]
        // Add the other endpoint
        const newPoint = result.isP1
          ? { x: line.x2, y: line.y2 }
          : { x: line.x1, y: line.y1 }
        chain.push(newPoint)
        used.add(result.lineIndex)
        found = true
      }
    }

    // Extend chain from start
    found = true
    while (found) {
      found = false
      const chainStart = chain[0]
      const result = findConnectingLine(chainStart.x, chainStart.y)
      if (result) {
        const line = lines[result.lineIndex]
        // Add the other endpoint
        const newPoint = result.isP1
          ? { x: line.x2, y: line.y2 }
          : { x: line.x1, y: line.y1 }
        chain.unshift(newPoint)
        used.add(result.lineIndex)
        found = true
      }
    }

    chains.push(chain)
  }

  // Simplify each chain and convert back to lines
  const simplifiedLines: HatchLine[] = []

  for (const chain of chains) {
    if (chain.length < 2) continue

    // Apply Ramer-Douglas-Peucker simplification
    const simplified = simplify(chain, tolerance, true)

    // Convert simplified points back to line segments
    for (let i = 0; i < simplified.length - 1; i++) {
      simplifiedLines.push({
        x1: simplified[i].x,
        y1: simplified[i].y,
        x2: simplified[i + 1].x,
        y2: simplified[i + 1].y
      })
    }
  }

  return simplifiedLines
}

// Types
export interface FillPathInfo {
  id: string
  type: string
  color: string
  pathData: string
  element: Element
}
