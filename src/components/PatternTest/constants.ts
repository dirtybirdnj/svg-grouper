import { FillPatternType } from '../../utils/fillPatterns'
import { Point, PolygonWithHoles, Rect } from '../../utils/geometry'

// All pattern types to test - organized by category
export const ALL_PATTERNS: FillPatternType[] = [
  // Basic line patterns
  'lines',
  'crosshatch',
  'diagonal',
  'stripe',
  'herringbone',
  'zigzag',
  'wiggle',
  'wave',
  // Grid/tile patterns
  'grid',
  'brick',
  'honeycomb',
  'truchet',
  'tessellation',
  // Spiral/circular patterns
  'spiral',
  'concentric',
  'radial',
  'crossspiral',
  'fermat',
  'phyllotaxis',
  // Mathematical curves
  'hilbert',
  'peano',
  'sierpinski',
  'gyroid',
  // Artistic patterns
  'guilloche',
  'lissajous',
  'rose',
  'harmonograph',
  'scribble',
  // Pentagon tilings
  'pentagon15',
  'pentagon14',
  // Point-based
  'stipple',
]

// Performance thresholds (ms) for stress test
export const PERF_THRESHOLDS = {
  excellent: 100,   // < 100ms = green
  acceptable: 500,  // < 500ms = yellow
  slow: 2000,       // < 2000ms = orange
  // > 2000ms = red (unacceptable)
}

// Simple square polygon for grid test
export const SQUARE_SIZE = 80

// 15 second timeout for pattern generation
export const PATTERN_TIMEOUT_MS = 15000

// Create a simple square polygon
export const createSquarePolygon = (x: number, y: number, size: number): PolygonWithHoles => ({
  outer: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
  holes: [],
})

// Fallback complex polygon if Essex doesn't load
export function createComplexTestPolygon(): { polygon: PolygonWithHoles; bbox: Rect } {
  // Create a star-like shape with many vertices
  const centerX = 150
  const centerY = 150
  const outerRadius = 120
  const innerRadius = 50
  const points = 12

  const outer: Point[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    outer.push({
      x: centerX + Math.cos(a) * radius,
      y: centerY + Math.sin(a) * radius,
    })
  }

  return {
    polygon: { outer, holes: [] },
    bbox: { x: centerX - outerRadius, y: centerY - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
  }
}
