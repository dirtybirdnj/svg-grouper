// Fill pattern types and tile shape definitions

import { Point, HatchLine } from '../geometry'

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

// Internal types for optimization
export interface EndpointEntry {
  lineIndex: number
  isStart: boolean // true = start of line, false = end of line
}

export interface OptimizedShape {
  pathId: string
  color: string
  lines: OrderedLine[]
  entry: Point
  exit: Point
  reversed: boolean
}

export interface ShapeInfo {
  pathId: string
  color: string
  lines: HatchLine[]
  centroid: Point
  topLeft: Point
}
