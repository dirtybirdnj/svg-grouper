// Polygon analysis utilities - hole detection, containment, nesting

import type { Point, PolygonWithHoles } from './types'
import { calcPolygonArea, polygonCentroid, isPointInsidePolygon, isPolygonContainedIn } from './math'

/**
 * Identify which subpath is the outer boundary and which are holes
 * Key insight: holes are INSIDE the outer boundary, disconnected regions are OUTSIDE
 */
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

  // Check each smaller subpath - is its centroid inside the largest?
  for (let i = 1; i < areasWithIndex.length; i++) {
    const item = areasWithIndex[i]
    if (isPointInsidePolygon(item.centroid, outer)) {
      // This subpath is inside the outer - it's a hole
      holes.push(item.subpath)
    }
    // Disconnected regions (outside the outer) are dropped
    // TODO: Consider returning multiple PolygonWithHoles for compound paths with disconnected regions
  }

  return { outer, holes }
}

/**
 * Get all subpaths as separate polygons (for compound paths with disconnected regions)
 */
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

/**
 * Get polygons with ALL nested regions fillable
 * Unlike getPolygonsFromSubpaths which only fills outer regions (treating inner as holes),
 * this returns a fillable region for EVERY level of nesting
 */
export function getPolygonsFromSubpathsNested(subpaths: Point[][]): PolygonWithHoles[] {
  if (subpaths.length === 0) return []
  if (subpaths.length === 1) return [{ outer: subpaths[0], holes: [] }]

  interface SubpathInfo {
    index: number
    subpath: Point[]
    area: number
    centroid: Point
    parent: number | null
    children: number[]
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
  for (let i = 0; i < sortedByArea.length; i++) {
    const current = sortedByArea[i]

    let foundParent = false
    for (let j = i - 1; j >= 0 && !foundParent; j--) {
      const larger = sortedByArea[j]
      if (isPolygonContainedIn(current.subpath, larger.subpath)) {
        // Check if there's an intermediate polygon
        let hasIntermediateParent = false
        for (let k = j + 1; k < i; k++) {
          const intermediate = sortedByArea[k]
          if (isPolygonContainedIn(current.subpath, intermediate.subpath)) {
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
