// Path parsing utilities for crop operations

import { Point } from '../geometry'
import { ParsedSubpath } from './types'

// Parse path d attribute to multiple subpaths, tracking open vs closed
export function pathToSubpathsWithMetadata(d: string): ParsedSubpath[] {
  const subpaths: ParsedSubpath[] = []
  let currentSubpath: Point[] = []
  let currentIsClosed = false
  const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || []
  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0

  const saveCurrentSubpath = () => {
    if (currentSubpath.length >= 2) {
      subpaths.push({ points: currentSubpath, isClosed: currentIsClosed })
    }
  }

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase()
    const isRelative = cmd[0] === cmd[0].toLowerCase()
    const values = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

    switch (type) {
      case 'M':
        saveCurrentSubpath()
        currentSubpath = []
        currentIsClosed = false

        if (isRelative && subpaths.length > 0) {
          currentX += values[0]
          currentY += values[1]
        } else {
          currentX = values[0]
          currentY = values[1]
        }
        startX = currentX
        startY = currentY
        currentSubpath.push({ x: currentX, y: currentY })
        for (let i = 2; i < values.length; i += 2) {
          if (isRelative) {
            currentX += values[i]
            currentY += values[i + 1]
          } else {
            currentX = values[i]
            currentY = values[i + 1]
          }
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'L':
        for (let i = 0; i < values.length; i += 2) {
          if (isRelative) {
            currentX += values[i]
            currentY += values[i + 1]
          } else {
            currentX = values[i]
            currentY = values[i + 1]
          }
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'H':
        for (const v of values) {
          currentX = isRelative ? currentX + v : v
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'V':
        for (const v of values) {
          currentY = isRelative ? currentY + v : v
          currentSubpath.push({ x: currentX, y: currentY })
        }
        break
      case 'Z':
        currentIsClosed = true
        currentX = startX
        currentY = startY
        break
      case 'C':
        for (let i = 0; i < values.length; i += 6) {
          const x1 = isRelative ? currentX + values[i] : values[i]
          const y1 = isRelative ? currentY + values[i + 1] : values[i + 1]
          const x2 = isRelative ? currentX + values[i + 2] : values[i + 2]
          const y2 = isRelative ? currentY + values[i + 3] : values[i + 3]
          const x = isRelative ? currentX + values[i + 4] : values[i + 4]
          const y = isRelative ? currentY + values[i + 5] : values[i + 5]
          // Sample at 20 points for better curve accuracy
          for (let t = 0.05; t <= 1; t += 0.05) {
            const mt = 1 - t
            const px = mt * mt * mt * currentX + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x
            const py = mt * mt * mt * currentY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x
          currentY = y
        }
        break
      case 'Q':
        for (let i = 0; i < values.length; i += 4) {
          const x1 = isRelative ? currentX + values[i] : values[i]
          const y1 = isRelative ? currentY + values[i + 1] : values[i + 1]
          const x = isRelative ? currentX + values[i + 2] : values[i + 2]
          const y = isRelative ? currentY + values[i + 3] : values[i + 3]
          // Sample at 20 points for better curve accuracy
          for (let t = 0.05; t <= 1; t += 0.05) {
            const mt = 1 - t
            const px = mt * mt * currentX + 2 * mt * t * x1 + t * t * x
            const py = mt * mt * currentY + 2 * mt * t * y1 + t * t * y
            currentSubpath.push({ x: px, y: py })
          }
          currentX = x
          currentY = y
        }
        break
      case 'A':
        for (let i = 0; i < values.length; i += 7) {
          const endX = isRelative ? currentX + values[i + 5] : values[i + 5]
          const endY = isRelative ? currentY + values[i + 6] : values[i + 6]
          // Sample at 20 points for better arc accuracy
          for (let t = 0.05; t <= 1; t += 0.05) {
            currentSubpath.push({
              x: currentX + (endX - currentX) * t,
              y: currentY + (endY - currentY) * t
            })
          }
          currentX = endX
          currentY = endY
        }
        break
    }
  }

  saveCurrentSubpath()
  return subpaths
}

// Legacy function for backward compatibility
export function pathToSubpaths(d: string): Point[][] {
  return pathToSubpathsWithMetadata(d).map(sp => sp.points)
}

// Convert polygon points back to path d attribute (closed path)
export function polygonToPath(points: Point[]): string {
  if (points.length < 3) return ''
  const pathParts = points.map((p, i) =>
    i === 0 ? `M${p.x.toFixed(2)},${p.y.toFixed(2)}` : `L${p.x.toFixed(2)},${p.y.toFixed(2)}`
  )
  pathParts.push('Z')
  return pathParts.join('')
}

// Convert polyline points to path d attribute (open path - no Z)
export function polylineToPath(points: Point[]): string {
  if (points.length < 2) return ''
  return points.map((p, i) =>
    i === 0 ? `M${p.x.toFixed(2)},${p.y.toFixed(2)}` : `L${p.x.toFixed(2)},${p.y.toFixed(2)}`
  ).join('')
}

// Get points from polygon element
export function getPolygonPoints(elem: Element): Point[] {
  const pointsAttr = elem.getAttribute('points') || ''
  const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)
  const points: Point[] = []
  for (let i = 0; i < coords.length; i += 2) {
    if (!isNaN(coords[i]) && !isNaN(coords[i + 1])) {
      points.push({ x: coords[i], y: coords[i + 1] })
    }
  }
  return points
}
