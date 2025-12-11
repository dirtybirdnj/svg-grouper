// Boolean polygon operations using polygon-clipping library

import { Point, PolygonWithHoles } from '../../../utils/geometry'
import polygonClipping, { Polygon as ClipPolygon } from 'polygon-clipping'
import { PolygonData, MergeOperation, BooleanResult } from './types'

// Re-export BooleanResult for module consumers
export type { BooleanResult } from './types'

/**
 * Convert our PolygonWithHoles to polygon-clipping format (Polygon = Ring[])
 */
export function polygonWithHolesToClip(poly: PolygonWithHoles): ClipPolygon {
  const outer: [number, number][] = poly.outer.map(p => [p.x, p.y])
  const holes: [number, number][][] = poly.holes.map(hole => hole.map(p => [p.x, p.y]))
  return [outer, ...holes]
}

/**
 * Convert polygon-clipping MultiPolygon result back to our format
 * MultiPolygon = Polygon[] = Ring[][]
 */
export function clipResultToPolygonWithHoles(result: ClipPolygon[]): PolygonWithHoles[] {
  return result.map(poly => {
    const outer: Point[] = poly[0].map(([x, y]) => ({ x, y }))
    const holes: Point[][] = poly.slice(1).map(ring => ring.map(([x, y]) => ({ x, y })))
    return { outer, holes }
  })
}

/**
 * Perform boolean operation on polygons using polygon-clipping library
 */
export function performBooleanOperation(
  polygons: PolygonData[],
  operation: MergeOperation
): BooleanResult | null {
  if (polygons.length < 2) return null

  try {
    // Convert first polygon - wrap in array to make it a MultiPolygon
    let result: ClipPolygon[] = [polygonWithHolesToClip(polygons[0].polygonWithHoles)]

    // Apply operation with each subsequent polygon
    for (let i = 1; i < polygons.length; i++) {
      const clipPoly: ClipPolygon[] = [polygonWithHolesToClip(polygons[i].polygonWithHoles)]

      switch (operation) {
        case 'union':
          result = polygonClipping.union(result, clipPoly)
          break
        case 'intersect':
          result = polygonClipping.intersection(result, clipPoly)
          break
        case 'subtract':
          result = polygonClipping.difference(result, clipPoly)
          break
        case 'xor':
          result = polygonClipping.xor(result, clipPoly)
          break
      }
    }

    // Convert result back to our format
    const resultPolygons = clipResultToPolygonWithHoles(result)

    return {
      polygons: resultPolygons,
      operationType: operation
    }
  } catch (error) {
    console.error('[Merge] Boolean operation failed:', error)
    return null
  }
}
