// Color distance types

/**
 * RGB color as tuple [r, g, b] where each value is 0-255
 */
export type RGBTuple = [number, number, number]

/**
 * LAB color as tuple [L, a, b]
 * L: 0-100 (lightness)
 * a: -128 to 127 (green to red)
 * b: -128 to 127 (blue to yellow)
 */
export type LABTuple = [number, number, number]

/**
 * XYZ color as tuple [x, y, z]
 */
export type XYZTuple = [number, number, number]

/**
 * Color clustering result
 */
export interface ClusteringResult {
  centroids: string[]
  assignments: Map<string, string>
}

/**
 * Merge calculation result
 */
export interface MergeResult {
  resultCount: number
  clusters: Map<string, string[]>
  resultColors: string[]
}

/**
 * Palette reduction result
 */
export interface ReduceResult {
  resultCount: number
  colorMap: Map<string, string>
  resultColors: string[]
}
