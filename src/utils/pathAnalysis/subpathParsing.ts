// Subpath parsing utilities

import { Point } from '../geometry'

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
 * Check if a subpath is closed (has Z command)
 */
export function isSubpathClosed(subpath: string): boolean {
  return /[Zz]\s*$/.test(subpath.trim())
}

/**
 * Separate a compound path into individual path d strings
 */
export function separateSubpaths(d: string): string[] {
  return parsePathIntoSubpaths(d)
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
