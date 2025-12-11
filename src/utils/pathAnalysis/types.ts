// Path analysis types

import { Point } from '../geometry'

export interface SubpathInfo {
  index: number
  startIndex: number  // Index in original d string
  commands: string    // The subpath commands
  points: Point[]     // Extracted points
  isClosed: boolean   // Has Z command
  windingDirection: 'CW' | 'CCW'
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number }
  pointCount: number
  area: number        // Absolute area
}

export interface PathDiagnostics {
  subpathCount: number
  subpaths: SubpathInfo[]
  totalPointCount: number
  hasCompoundPath: boolean
  hasUnclosedPaths: boolean
  hasMixedWinding: boolean
  issues: PathIssue[]
}

export interface PathIssue {
  type: 'compound' | 'unclosed' | 'mixed-winding' | 'zero-area' | 'self-intersect' | 'degenerate'
  message: string
  subpathIndex?: number
  severity: 'info' | 'warning' | 'error'
}
