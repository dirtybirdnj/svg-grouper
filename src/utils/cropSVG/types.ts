// Crop SVG types

import { Point } from '../geometry'

// Subpath with metadata about whether it was closed
export interface ParsedSubpath {
  points: Point[]
  isClosed: boolean
}

export interface CropDimensions {
  width: number
  height: number
}
