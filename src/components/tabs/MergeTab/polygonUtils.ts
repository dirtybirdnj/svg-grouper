// Polygon utility functions for merge operations

import { Point } from '../../../utils/geometry'
import { OPTIMIZATION } from '../../../constants'
import { PolygonData, UnionResult } from './types'

// Debug logging - set to false for production
const DEBUG_MERGE = false

/**
 * Create a unique key for an edge (direction-independent)
 */
export function edgeKey(p1: Point, p2: Point, tolerance: number = OPTIMIZATION.DEFAULT_TOLERANCE): string {
  // Round to tolerance and sort points to make edge direction-independent
  const x1 = Math.round(p1.x / tolerance) * tolerance
  const y1 = Math.round(p1.y / tolerance) * tolerance
  const x2 = Math.round(p2.x / tolerance) * tolerance
  const y2 = Math.round(p2.y / tolerance) * tolerance

  // Sort so smaller point comes first
  if (x1 < x2 || (x1 === x2 && y1 < y2)) {
    return `${x1.toFixed(4)},${y1.toFixed(4)}-${x2.toFixed(4)},${y2.toFixed(4)}`
  } else {
    return `${x2.toFixed(4)},${y2.toFixed(4)}-${x1.toFixed(4)},${y1.toFixed(4)}`
  }
}

/**
 * Find which shapes are touching (share edges)
 */
export function findTouchingShapes(polygons: PolygonData[], tolerance: number): Set<string> {
  const touchingPairs = new Set<string>()

  // Build edge map: edge key -> list of polygon indices
  const edgeToPolygons = new Map<string, number[]>()

  for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
    const vertices = polygons[polyIdx].vertices
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i]
      const p2 = vertices[(i + 1) % vertices.length]
      const key = edgeKey(p1, p2, tolerance)

      const existing = edgeToPolygons.get(key) || []
      existing.push(polyIdx)
      edgeToPolygons.set(key, existing)
    }
  }

  // Find pairs that share edges
  edgeToPolygons.forEach((polyIndices) => {
    if (polyIndices.length >= 2) {
      // All combinations of polygons sharing this edge
      for (let i = 0; i < polyIndices.length; i++) {
        for (let j = i + 1; j < polyIndices.length; j++) {
          const id1 = polygons[polyIndices[i]].nodeId
          const id2 = polygons[polyIndices[j]].nodeId
          // Store in consistent order
          const pairKey = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`
          touchingPairs.add(pairKey)
        }
      }
    }
  })

  return touchingPairs
}

/**
 * Union adjacent polygons by removing shared edges, preserving holes
 */
export function unionPolygons(polygons: PolygonData[], tolerance: number = 0.1): UnionResult | null {
  if (polygons.length === 0) return null
  if (polygons.length === 1) {
    return {
      outer: polygons[0].vertices,
      holes: polygons[0].polygonWithHoles.holes,
      sharedEdges: [],
      touchingPairs: new Set()
    }
  }

  DEBUG_MERGE && console.log('[Union] Starting with tolerance:', tolerance)

  // Collect all edges with their polygons
  interface Edge {
    p1: Point
    p2: Point
    polygonIndex: number
  }

  const edges: Edge[] = []
  const edgeCounts = new Map<string, number>()
  const sharedEdgesList: Array<{ p1: Point; p2: Point }> = []

  for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
    const vertices = polygons[polyIdx].vertices
    DEBUG_MERGE && console.log(`[Union] Polygon ${polyIdx} has ${vertices.length} edges`)
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i]
      const p2 = vertices[(i + 1) % vertices.length]
      const key = edgeKey(p1, p2, tolerance)

      edges.push({ p1, p2, polygonIndex: polyIdx })
      const newCount = (edgeCounts.get(key) || 0) + 1
      edgeCounts.set(key, newCount)
    }
  }

  DEBUG_MERGE && console.log(`[Union] Total edges: ${edges.length}, unique edge keys: ${edgeCounts.size}`)

  // Collect shared edges for visualization and count
  const sharedEdgeKeys = new Set<string>()
  edgeCounts.forEach((count, key) => {
    if (count > 1) sharedEdgeKeys.add(key)
  })
  DEBUG_MERGE && console.log(`[Union] Shared edges found: ${sharedEdgeKeys.size}`)

  // Filter to boundary edges (only appearing once)
  const boundaryEdges: Edge[] = edges.filter(edge => {
    const key = edgeKey(edge.p1, edge.p2, tolerance)
    const isShared = sharedEdgeKeys.has(key)
    if (isShared) {
      sharedEdgesList.push({ p1: edge.p1, p2: edge.p2 })
    }
    return !isShared
  })

  DEBUG_MERGE && console.log(`[Union] Boundary edges: ${boundaryEdges.length}`)

  if (boundaryEdges.length === 0) {
    DEBUG_MERGE && console.log('[Union] No boundary edges found - shapes completely overlap')
    return null
  }

  // Build adjacency map for tracing
  const adjacency = new Map<string, { p1: Point; p2: Point; used: boolean }[]>()

  const pointKey = (p: Point): string => {
    const x = Math.round(p.x / tolerance) * tolerance
    const y = Math.round(p.y / tolerance) * tolerance
    return `${x.toFixed(4)},${y.toFixed(4)}`
  }

  for (const edge of boundaryEdges) {
    const key1 = pointKey(edge.p1)
    const existing1 = adjacency.get(key1) || []
    existing1.push({ p1: edge.p1, p2: edge.p2, used: false })
    adjacency.set(key1, existing1)
  }

  // Trace the boundary starting from the leftmost point
  let startPoint: Point | null = null
  let minX = Infinity

  for (const edge of boundaryEdges) {
    if (edge.p1.x < minX) {
      minX = edge.p1.x
      startPoint = edge.p1
    }
    if (edge.p2.x < minX) {
      minX = edge.p2.x
      startPoint = edge.p2
    }
  }

  if (!startPoint) {
    DEBUG_MERGE && console.log('[Union] No start point found')
    return null
  }

  const result: Point[] = [startPoint]
  let currentPoint = startPoint
  const maxIterations = boundaryEdges.length * 2

  for (let iter = 0; iter < maxIterations; iter++) {
    const key = pointKey(currentPoint)
    const edgesFromPoint = adjacency.get(key) || []

    // Find unused edge from current point
    const nextEdge = edgesFromPoint.find(e => !e.used)
    if (!nextEdge) {
      // Check if we're back at start
      const startKey = pointKey(startPoint)
      if (key === startKey && result.length > 2) {
        DEBUG_MERGE && console.log(`[Union] Completed boundary trace with ${result.length} points`)
        break
      }
      DEBUG_MERGE && console.log(`[Union] No unused edge from ${key}, trace incomplete`)
      break
    }

    nextEdge.used = true
    currentPoint = nextEdge.p2
    result.push(currentPoint)

    // Check if back at start
    const nextKey = pointKey(currentPoint)
    const startKey = pointKey(startPoint)
    if (nextKey === startKey && result.length > 2) {
      result.pop() // Remove duplicate start point
      DEBUG_MERGE && console.log(`[Union] Completed boundary trace with ${result.length} points`)
      break
    }
  }

  // Collect all holes from input polygons (they become holes in the merged shape)
  const allHoles: Point[][] = []
  for (const poly of polygons) {
    allHoles.push(...poly.polygonWithHoles.holes)
  }

  // Calculate which shapes were touching
  const touchingPairs = findTouchingShapes(polygons, tolerance)

  return {
    outer: result,
    holes: allHoles,
    sharedEdges: sharedEdgesList,
    touchingPairs
  }
}
