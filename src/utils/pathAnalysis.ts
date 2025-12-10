/**
 * Path Analysis Utilities
 * Analyzes SVG path structure, detects compound paths, calculates winding direction, etc.
 */

import { Point } from './geometry'

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

/**
 * Count subpaths in a path d attribute (count M/m commands)
 */
export function countSubpaths(d: string): number {
  if (!d) return 0
  // Count all M and m commands
  const matches = d.match(/[Mm]/g)
  return matches ? matches.length : 0
}

/**
 * Parse a path d attribute into subpaths
 */
export function parsePathIntoSubpaths(d: string): string[] {
  if (!d) return []

  // Split on M commands, keeping the M
  const subpaths: string[] = []
  let current = ''
  let i = 0

  while (i < d.length) {
    const char = d[i]

    if ((char === 'M' || char === 'm') && current.trim()) {
      // Found new M, save current subpath
      subpaths.push(current.trim())
      current = char
    } else {
      current += char
    }
    i++
  }

  // Don't forget the last subpath
  if (current.trim()) {
    subpaths.push(current.trim())
  }

  return subpaths
}

/**
 * Extract points from a path subpath string
 */
export function extractPointsFromSubpath(subpath: string): Point[] {
  const points: Point[] = []

  // Parse path commands - simplified parser for M, L, H, V, Z, C, Q, A
  // This handles absolute commands primarily
  const commands = subpath.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g) || []

  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0

  for (const cmd of commands) {
    const type = cmd[0]
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    switch (type) {
      case 'M':
        currentX = args[0]
        currentY = args[1]
        startX = currentX
        startY = currentY
        points.push({ x: currentX, y: currentY })
        // M can have implicit L commands after
        for (let i = 2; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'm':
        currentX += args[0]
        currentY += args[1]
        startX = currentX
        startY = currentY
        points.push({ x: currentX, y: currentY })
        for (let i = 2; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'H':
        currentX = args[0]
        points.push({ x: currentX, y: currentY })
        break
      case 'h':
        currentX += args[0]
        points.push({ x: currentX, y: currentY })
        break
      case 'V':
        currentY = args[0]
        points.push({ x: currentX, y: currentY })
        break
      case 'v':
        currentY += args[0]
        points.push({ x: currentX, y: currentY })
        break
      case 'C': // Cubic bezier - sample endpoints
        for (let i = 0; i < args.length; i += 6) {
          currentX = args[i + 4]
          currentY = args[i + 5]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          currentX += args[i + 4]
          currentY += args[i + 5]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'Q': // Quadratic bezier
        for (let i = 0; i < args.length; i += 4) {
          currentX = args[i + 2]
          currentY = args[i + 3]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'q':
        for (let i = 0; i < args.length; i += 4) {
          currentX += args[i + 2]
          currentY += args[i + 3]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'A': // Arc - just use endpoint
        for (let i = 0; i < args.length; i += 7) {
          currentX = args[i + 5]
          currentY = args[i + 6]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'a':
        for (let i = 0; i < args.length; i += 7) {
          currentX += args[i + 5]
          currentY += args[i + 6]
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'Z':
      case 'z':
        // Return to start
        if (points.length > 0) {
          currentX = startX
          currentY = startY
        }
        break
    }
  }

  return points
}

/**
 * Calculate winding direction using shoelace formula
 * Positive = CCW, Negative = CW
 */
export function getWindingDirection(points: Point[]): 'CW' | 'CCW' {
  if (points.length < 3) return 'CW'

  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += (points[j].x - points[i].x) * (points[j].y + points[i].y)
  }

  return sum > 0 ? 'CW' : 'CCW'
}

/**
 * Calculate polygon area using shoelace formula
 */
export function calculateArea(points: Point[]): number {
  if (points.length < 3) return 0

  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }

  return Math.abs(area / 2)
}

/**
 * Calculate bounding box of points
 */
export function getBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Check if a subpath is closed (has Z command)
 */
export function isSubpathClosed(subpath: string): boolean {
  return /[Zz]\s*$/.test(subpath.trim())
}

/**
 * Full path diagnostics
 */
export function analyzePathD(d: string): PathDiagnostics {
  const subpathStrings = parsePathIntoSubpaths(d)
  const subpaths: SubpathInfo[] = []
  const issues: PathIssue[] = []

  let totalPointCount = 0
  let hasUnclosedPaths = false
  const windings: string[] = []

  subpathStrings.forEach((subpathStr, index) => {
    const points = extractPointsFromSubpath(subpathStr)
    const isClosed = isSubpathClosed(subpathStr)
    const winding = getWindingDirection(points)
    const bbox = getBoundingBox(points)
    const area = calculateArea(points)

    totalPointCount += points.length
    windings.push(winding)

    if (!isClosed) {
      hasUnclosedPaths = true
      issues.push({
        type: 'unclosed',
        message: `Subpath ${index + 1} is not closed (no Z command)`,
        subpathIndex: index,
        severity: 'warning'
      })
    }

    if (area < 0.01 && points.length > 0) {
      issues.push({
        type: 'zero-area',
        message: `Subpath ${index + 1} has near-zero area`,
        subpathIndex: index,
        severity: 'warning'
      })
    }

    if (points.length < 3 && points.length > 0) {
      issues.push({
        type: 'degenerate',
        message: `Subpath ${index + 1} has fewer than 3 points`,
        subpathIndex: index,
        severity: 'error'
      })
    }

    subpaths.push({
      index,
      startIndex: d.indexOf(subpathStr),
      commands: subpathStr,
      points,
      isClosed,
      windingDirection: winding,
      boundingBox: bbox,
      pointCount: points.length,
      area
    })
  })

  const hasCompoundPath = subpaths.length > 1
  const hasMixedWinding = new Set(windings).size > 1

  if (hasCompoundPath) {
    issues.unshift({
      type: 'compound',
      message: `Path contains ${subpaths.length} subpaths`,
      severity: 'info'
    })
  }

  if (hasMixedWinding && subpaths.length > 1) {
    issues.push({
      type: 'mixed-winding',
      message: 'Mixed winding directions (may indicate holes)',
      severity: 'info'
    })
  }

  return {
    subpathCount: subpaths.length,
    subpaths,
    totalPointCount,
    hasCompoundPath,
    hasUnclosedPaths,
    hasMixedWinding,
    issues
  }
}

/**
 * Separate a compound path into individual path d strings
 */
export function separateSubpaths(d: string): string[] {
  return parsePathIntoSubpaths(d)
}

/**
 * Reverse the winding direction of a path
 */
export function reversePathWinding(points: Point[]): Point[] {
  return [...points].reverse()
}

/**
 * Convert points back to SVG path d string
 */
export function pointsToPathD(points: Point[], close: boolean = true): string {
  if (points.length === 0) return ''

  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x},${points[i].y}`
  }
  if (close) d += ' Z'

  return d
}
