// Line optimization for pen plotter export

import type { Point, PathSegment } from './types'
import { distance } from './math'
import { parsePathToPoints, pointsToPathD } from './pathParsing'

/**
 * Parse an SVG element into a PathSegment for optimization
 */
export function elementToPathSegment(element: Element, id: string): PathSegment | null {
  const tagName = element.tagName.toLowerCase()
  let points: Point[] = []

  if (tagName === 'path') {
    const d = element.getAttribute('d')
    if (!d) return null
    points = parsePathToPoints(d)
  } else if (tagName === 'line') {
    const x1 = parseFloat(element.getAttribute('x1') || '0')
    const y1 = parseFloat(element.getAttribute('y1') || '0')
    const x2 = parseFloat(element.getAttribute('x2') || '0')
    const y2 = parseFloat(element.getAttribute('y2') || '0')
    points = [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const pointsAttr = element.getAttribute('points') || ''
    const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat)
    for (let i = 0; i < coords.length - 1; i += 2) {
      if (!isNaN(coords[i]) && !isNaN(coords[i + 1])) {
        points.push({ x: coords[i], y: coords[i + 1] })
      }
    }
    // Close polygon
    if (tagName === 'polygon' && points.length >= 2) {
      points.push({ ...points[0] })
    }
  } else if (tagName === 'rect') {
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const w = parseFloat(element.getAttribute('width') || '0')
    const h = parseFloat(element.getAttribute('height') || '0')
    points = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y }
    ]
  } else if (tagName === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const r = parseFloat(element.getAttribute('r') || '0')
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
  } else if (tagName === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const rx = parseFloat(element.getAttribute('rx') || '0')
    const ry = parseFloat(element.getAttribute('ry') || '0')
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2
      points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
    }
  }

  if (points.length < 2) return null

  return {
    id,
    element,
    startPoint: points[0],
    endPoint: points[points.length - 1],
    points,
    reversed: false
  }
}

/**
 * Optimize path order using nearest-neighbor algorithm
 * Returns elements in optimized order with optional reversal flags
 */
export function optimizePathOrder(elements: Element[]): { element: Element; reversed: boolean }[] {
  if (elements.length === 0) return []
  if (elements.length === 1) return [{ element: elements[0], reversed: false }]

  // Parse all elements into segments
  const segments: PathSegment[] = []
  for (let i = 0; i < elements.length; i++) {
    const seg = elementToPathSegment(elements[i], `path-${i}`)
    if (seg) segments.push(seg)
  }

  if (segments.length === 0) return elements.map(e => ({ element: e, reversed: false }))

  // Nearest neighbor ordering
  const ordered: PathSegment[] = []
  const remaining = [...segments]
  let currentPoint: Point = { x: 0, y: 0 }

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i]
      const distToStart = distance(currentPoint, seg.startPoint)
      const distToEnd = distance(currentPoint, seg.endPoint)

      if (distToStart < bestDistance) {
        bestDistance = distToStart
        bestIndex = i
        shouldReverse = false
      }
      if (distToEnd < bestDistance) {
        bestDistance = distToEnd
        bestIndex = i
        shouldReverse = true
      }
    }

    const chosen = remaining.splice(bestIndex, 1)[0]
    if (shouldReverse) {
      chosen.reversed = true
      const temp = chosen.startPoint
      chosen.startPoint = chosen.endPoint
      chosen.endPoint = temp
      chosen.points.reverse()
    }
    ordered.push(chosen)
    currentPoint = chosen.endPoint
  }

  return ordered.map(seg => ({ element: seg.element, reversed: seg.reversed }))
}

/**
 * Join connecting paths that share endpoints within tolerance
 * Returns new path elements with connected paths merged
 */
export function joinConnectingPaths(
  elements: Element[],
  tolerance: number = 0.5
): Element[] {
  if (elements.length <= 1) return elements

  // Parse all elements
  const segments: PathSegment[] = []
  for (let i = 0; i < elements.length; i++) {
    const seg = elementToPathSegment(elements[i], `path-${i}`)
    if (seg) segments.push(seg)
  }

  if (segments.length <= 1) return elements

  // Build chains of connected segments
  const used = new Set<number>()
  const chains: PathSegment[][] = []

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue

    const chain: PathSegment[] = [segments[i]]
    used.add(i)

    // Extend chain forward
    let extending = true
    while (extending) {
      extending = false
      const lastSeg = chain[chain.length - 1]

      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const candidate = segments[j]

        if (distance(lastSeg.endPoint, candidate.startPoint) <= tolerance) {
          chain.push(candidate)
          used.add(j)
          extending = true
          break
        }
        if (distance(lastSeg.endPoint, candidate.endPoint) <= tolerance) {
          candidate.points.reverse()
          const temp = candidate.startPoint
          candidate.startPoint = candidate.endPoint
          candidate.endPoint = temp
          candidate.reversed = !candidate.reversed
          chain.push(candidate)
          used.add(j)
          extending = true
          break
        }
      }
    }

    // Extend chain backward
    extending = true
    while (extending) {
      extending = false
      const firstSeg = chain[0]

      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const candidate = segments[j]

        if (distance(candidate.endPoint, firstSeg.startPoint) <= tolerance) {
          chain.unshift(candidate)
          used.add(j)
          extending = true
          break
        }
        if (distance(candidate.startPoint, firstSeg.startPoint) <= tolerance) {
          candidate.points.reverse()
          const temp = candidate.startPoint
          candidate.startPoint = candidate.endPoint
          candidate.endPoint = temp
          candidate.reversed = !candidate.reversed
          chain.unshift(candidate)
          used.add(j)
          extending = true
          break
        }
      }
    }

    chains.push(chain)
  }

  // Convert chains back to elements
  const result: Element[] = []
  const svgNS = 'http://www.w3.org/2000/svg'

  for (const chain of chains) {
    if (chain.length === 1) {
      result.push(chain[0].element)
    } else {
      // Multiple segments, create new combined path
      const combinedPoints: Point[] = []
      for (let i = 0; i < chain.length; i++) {
        const seg = chain[i]
        if (i === 0) {
          combinedPoints.push(...seg.points)
        } else {
          combinedPoints.push(...seg.points.slice(1))
        }
      }

      const pathD = pointsToPathD(combinedPoints)
      const newPath = document.createElementNS(svgNS, 'path')
      newPath.setAttribute('d', pathD)

      // Copy style from first element
      const firstEl = chain[0].element
      const stroke = firstEl.getAttribute('stroke')
      const strokeWidth = firstEl.getAttribute('stroke-width')
      const fill = firstEl.getAttribute('fill')
      const style = firstEl.getAttribute('style')

      if (stroke) newPath.setAttribute('stroke', stroke)
      if (strokeWidth) newPath.setAttribute('stroke-width', strokeWidth)
      if (fill) newPath.setAttribute('fill', fill)
      if (style) newPath.setAttribute('style', style)

      newPath.setAttribute('stroke-linecap', 'round')
      newPath.setAttribute('stroke-linejoin', 'round')

      result.push(newPath)
    }
  }

  return result
}

/**
 * Apply both optimizations: join connecting paths, then optimize order
 */
export function optimizeForPlotter(
  elements: Element[],
  options: { joinTolerance?: number; optimize?: boolean; join?: boolean } = {}
): Element[] {
  const { joinTolerance = 0.5, optimize = true, join = true } = options

  let result = elements

  if (join) {
    result = joinConnectingPaths(result, joinTolerance)
  }

  if (optimize) {
    const optimized = optimizePathOrder(result)
    result = optimized.map(o => o.element)
  }

  return result
}
