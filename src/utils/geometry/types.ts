// Geometry type definitions

export interface Point {
  x: number
  y: number
}

export interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PolygonWithHoles {
  outer: Point[]
  holes: Point[][]
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Represents a path with its endpoints for optimization
 */
export interface PathSegment {
  id: string
  element: Element
  startPoint: Point
  endPoint: Point
  points: Point[]  // All points for joining
  reversed: boolean
}

// Subpath handling mode for getAllPolygonsFromElement
export type SubpathMode = 'default' | 'independent' | 'nested' | 'evenodd'
// - 'default': Inner shapes are treated as holes (not filled)
// - 'independent': Each subpath is filled separately (holes get filled over)
// - 'nested': All nested regions are fillable (outer has holes, each hole also gets filled)
// - 'evenodd': Use SVG evenodd fill rule - fills areas inside odd number of boundaries
