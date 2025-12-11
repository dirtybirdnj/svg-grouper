// SVG path parsing utilities

import type { Point } from './types'

/**
 * Get all subpaths from a path element as separate path d strings
 */
export function getSubpathsAsPathStrings(element: Element): string[] {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== 'path') return []

  const d = element.getAttribute('d') || ''
  if (!d.trim()) return []

  // Split path data by M/m commands while preserving original commands
  const mCommandRegex = /[Mm][^Mm]*/g
  const matches = d.match(mCommandRegex)

  if (!matches || matches.length === 0) return []
  if (matches.length === 1) return [] // Single subpath, not a compound path

  // Track current position for converting relative to absolute
  let currentX = 0
  let currentY = 0
  const subpathStrings: string[] = []

  for (const match of matches) {
    const trimmed = match.trim()
    if (!trimmed) continue

    // Parse the first command to get starting position
    const isRelative = trimmed.startsWith('m')
    const coordStr = trimmed.slice(1).trim()

    // Extract first coordinate pair
    const coordMatch = coordStr.match(/^[\s,]*(-?[\d.]+)[\s,]+(-?[\d.]+)/)
    if (coordMatch) {
      const x = parseFloat(coordMatch[1])
      const y = parseFloat(coordMatch[2])

      if (isRelative && subpathStrings.length > 0) {
        // Relative m - convert to absolute
        const absX = currentX + x
        const absY = currentY + y
        // Replace the relative coordinates with absolute
        const restOfPath = coordStr.slice(coordMatch[0].length)
        subpathStrings.push(`M ${absX} ${absY} ${restOfPath}`)
        currentX = absX
        currentY = absY
      } else {
        // Absolute M or first subpath
        subpathStrings.push(isRelative ? 'M' + trimmed.slice(1) : trimmed)
        currentX = x
        currentY = y
      }

      // Try to find the last position in this subpath for the next relative m
      const allCoords = trimmed.match(/-?[\d.]+/g)
      if (allCoords && allCoords.length >= 2) {
        currentX = parseFloat(allCoords[allCoords.length - 2])
        currentY = parseFloat(allCoords[allCoords.length - 1])
      }
    } else {
      subpathStrings.push(trimmed)
    }
  }

  return subpathStrings
}

/**
 * Parse SVG path data into separate subpaths (split at M commands after Z)
 */
export function parsePathIntoSubpaths(d: string): Point[][] {
  const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/gi) || []

  const subpaths: Point[][] = []
  let currentSubpath: Point[] = []
  let currentX = 0, currentY = 0
  let startX = 0, startY = 0
  let justClosed = false

  for (const cmd of commands) {
    const type = cmd[0]
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    if ((type === 'M' || type === 'm') && (justClosed || currentSubpath.length === 0)) {
      if (currentSubpath.length >= 3) {
        subpaths.push(currentSubpath)
      }
      currentSubpath = []
      justClosed = false
    }

    switch (type) {
      case 'M':
        currentX = args[0]
        currentY = args[1]
        startX = currentX
        startY = currentY
        currentSubpath.push({ x: currentX, y: currentY })
        for (let i = 2; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'm':
        currentX += args[0]
        currentY += args[1]
        startX = currentX
        startY = currentY
        currentSubpath.push({ x: currentX, y: currentY })
        for (let i = 2; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i]
          currentY = args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          currentX += args[i]
          currentY += args[i + 1]
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'H':
        for (const arg of args) {
          currentX = arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'h':
        for (const arg of args) {
          currentX += arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'V':
        for (const arg of args) {
          currentY = arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'v':
        for (const arg of args) {
          currentY += arg
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'Z':
      case 'z': {
        const dist = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2))
        if (dist > 0.1) {
          currentSubpath.push({ x: startX, y: startY })
        }
        currentX = startX
        currentY = startY
        justClosed = true
        break
      }
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          const x0 = currentX, y0 = currentY
          const x1 = args[i], y1 = args[i + 1]
          const x2 = args[i + 2], y2 = args[i + 3]
          const x3 = args[i + 4], y3 = args[i + 5]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          const x0 = currentX, y0 = currentY
          const x1 = currentX + args[i], y1 = currentY + args[i + 1]
          const x2 = currentX + args[i + 2], y2 = currentY + args[i + 3]
          const x3 = currentX + args[i + 4], y3 = currentY + args[i + 5]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 'S':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x2 = args[i], y2 = args[i + 1]
          const x3 = args[i + 2], y3 = args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x0 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 's':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x2 = currentX + args[i], y2 = currentY + args[i + 1]
          const x3 = currentX + args[i + 2], y3 = currentY + args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * mt * x0 + 3 * mt * mt * t * x0 + 3 * mt * t * t * x2 + t * t * t * x3
            const py = mt * mt * mt * y0 + 3 * mt * mt * t * y0 + 3 * mt * t * t * y2 + t * t * t * y3
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x3
          currentY = y3
        }
        break
      case 'Q':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x1 = args[i], y1 = args[i + 1]
          const x2 = args[i + 2], y2 = args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
            const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x2
          currentY = y2
        }
        break
      case 'q':
        for (let i = 0; i < args.length; i += 4) {
          const x0 = currentX, y0 = currentY
          const x1 = currentX + args[i], y1 = currentY + args[i + 1]
          const x2 = currentX + args[i + 2], y2 = currentY + args[i + 3]
          for (let t = 0.1; t <= 1; t += 0.1) {
            const mt = 1 - t
            const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
            const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x2
          currentY = y2
        }
        break
      case 'A':
        for (let i = 0; i < args.length; i += 7) {
          const x = args[i + 5]
          const y = args[i + 6]
          const dx = x - currentX
          const dy = y - currentY
          for (let t = 0.2; t <= 1; t += 0.2) {
            currentSubpath.push({ x: currentX + dx * t, y: currentY + dy * t })
          }
          currentX = x
          currentY = y
        }
        break
      case 'a':
        for (let i = 0; i < args.length; i += 7) {
          const x = currentX + args[i + 5]
          const y = currentY + args[i + 6]
          const dx = x - currentX
          const dy = y - currentY
          for (let t = 0.2; t <= 1; t += 0.2) {
            currentSubpath.push({ x: currentX + dx * t, y: currentY + dy * t })
          }
          currentX = x
          currentY = y
        }
        break
    }
  }

  if (currentSubpath.length >= 3) {
    subpaths.push(currentSubpath)
  }

  return subpaths
}

/**
 * Parse path d attribute to points (simplified - extracts endpoints of each segment)
 */
export function parsePathToPoints(d: string): Point[] {
  const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/gi) || []
  const points: Point[] = []
  let currentX = 0, currentY = 0
  let startX = 0, startY = 0

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
        for (const x of args) {
          currentX = x
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'h':
        for (const dx of args) {
          currentX += dx
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'V':
        for (const y of args) {
          currentY = y
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'v':
        for (const dy of args) {
          currentY += dy
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'C':
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
      case 'S': case 's':
        for (let i = 0; i < args.length; i += 4) {
          if (type === 'S') {
            currentX = args[i + 2]
            currentY = args[i + 3]
          } else {
            currentX += args[i + 2]
            currentY += args[i + 3]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'Q': case 'q':
        for (let i = 0; i < args.length; i += 4) {
          if (type === 'Q') {
            currentX = args[i + 2]
            currentY = args[i + 3]
          } else {
            currentX += args[i + 2]
            currentY += args[i + 3]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'T': case 't':
        for (let i = 0; i < args.length; i += 2) {
          if (type === 'T') {
            currentX = args[i]
            currentY = args[i + 1]
          } else {
            currentX += args[i]
            currentY += args[i + 1]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'A': case 'a':
        for (let i = 0; i < args.length; i += 7) {
          if (type === 'A') {
            currentX = args[i + 5]
            currentY = args[i + 6]
          } else {
            currentX += args[i + 5]
            currentY += args[i + 6]
          }
          points.push({ x: currentX, y: currentY })
        }
        break
      case 'Z': case 'z':
        currentX = startX
        currentY = startY
        points.push({ x: currentX, y: currentY })
        break
    }
  }

  return points
}

/**
 * Convert points array to SVG path d attribute
 */
export function pointsToPathD(points: Point[]): string {
  if (points.length === 0) return ''
  const parts: string[] = [`M${points[0].x.toFixed(3)},${points[0].y.toFixed(3)}`]
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${points[i].x.toFixed(3)},${points[i].y.toFixed(3)}`)
  }
  return parts.join('')
}
