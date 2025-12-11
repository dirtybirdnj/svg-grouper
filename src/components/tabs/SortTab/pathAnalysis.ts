// Path analysis utilities for SortTab

import { SVGNode } from '../../../types/svg'
import { normalizeColor } from '../../../utils/colorExtractor'

/**
 * Count points in an SVG element based on its type
 */
export function countElementPoints(element: Element): number {
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'path') {
    const d = element.getAttribute('d') || ''
    const coordMatches = d.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    return coordMatches ? coordMatches.length : 0
  } else if (tagName === 'line') {
    return 2
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const points = element.getAttribute('points') || ''
    const coordMatches = points.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    return coordMatches ? coordMatches.length : 0
  } else if (tagName === 'rect') {
    return 4
  } else if (tagName === 'circle' || tagName === 'ellipse') {
    return 1
  }
  return 0
}

export interface ColorStats {
  paths: number
  points: number
}

/**
 * Collect all colors with their path counts and point counts
 */
export function collectAllColorsWithCounts(nodes: SVGNode[]): Map<string, ColorStats> {
  const colorStats = new Map<string, ColorStats>()

  const addColorStat = (color: string, pointCount: number) => {
    const normalized = normalizeColor(color)
    const existing = colorStats.get(normalized) || { paths: 0, points: 0 }
    colorStats.set(normalized, {
      paths: existing.paths + 1,
      points: existing.points + pointCount
    })
  }

  const traverse = (node: SVGNode) => {
    if (!node.isGroup) {
      const element = node.element
      const style = element.getAttribute('style') || ''
      let color = ''

      // Check for fillColor from line fill (customMarkup nodes)
      if (node.fillColor) {
        color = node.fillColor
      } else {
        // Get color from fill or stroke
        const fill = element.getAttribute('fill')
        const stroke = element.getAttribute('stroke')

        if (style.includes('fill:')) {
          const match = style.match(/fill:\s*([^;]+)/)
          if (match && match[1] !== 'none') color = match[1].trim()
        }
        if (!color && style.includes('stroke:')) {
          const match = style.match(/stroke:\s*([^;]+)/)
          if (match && match[1] !== 'none') color = match[1].trim()
        }
        if (!color && fill && fill !== 'none' && fill !== 'transparent') color = fill
        if (!color && stroke && stroke !== 'none' && stroke !== 'transparent') color = stroke
      }

      if (color) {
        const pointCount = countElementPoints(element)
        addColorStat(color, pointCount)
      }
    }
    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return colorStats
}

export interface PathInfo {
  id: string
  color: string | null
  strokeWidth: string | null
  pointCount: number
  startPos: { x: number; y: number }
  endPos: { x: number; y: number }
  allPoints: { x: number; y: number }[]
}

/**
 * Extract path info for a node (when it's a path element)
 */
export function extractPathInfo(node: SVGNode): PathInfo | null {
  if (node.isGroup) return null

  const element = node.element
  const tagName = element.tagName.toLowerCase()

  // Get color (fill or stroke)
  let color = element.getAttribute('fill') || element.getAttribute('stroke') || ''
  const style = element.getAttribute('style') || ''
  if (style.includes('fill:')) {
    const match = style.match(/fill:\s*([^;]+)/)
    if (match) color = match[1].trim()
  }
  if (!color || color === 'none') {
    if (style.includes('stroke:')) {
      const match = style.match(/stroke:\s*([^;]+)/)
      if (match) color = match[1].trim()
    }
    if (!color || color === 'none') {
      color = element.getAttribute('stroke') || ''
    }
  }

  // Get stroke width
  let strokeWidth = element.getAttribute('stroke-width') || ''
  if (style.includes('stroke-width:')) {
    const match = style.match(/stroke-width:\s*([^;]+)/)
    if (match) strokeWidth = match[1].trim()
  }

  // Count points and get start/end positions from path data
  let pointCount = 0
  let startPos = { x: 0, y: 0 }
  let endPos = { x: 0, y: 0 }
  const allPoints: { x: number; y: number }[] = []

  const parseCoordPair = (match: string): { x: number; y: number } | null => {
    const parsed = match.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/)
    if (parsed) {
      return { x: parseFloat(parsed[1]), y: parseFloat(parsed[2]) }
    }
    return null
  }

  if (tagName === 'path') {
    const d = element.getAttribute('d') || ''
    // Match all coordinate pairs in path data
    const coordMatches = d.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    if (coordMatches) {
      pointCount = coordMatches.length
      coordMatches.forEach(match => {
        const pt = parseCoordPair(match)
        if (pt) allPoints.push(pt)
      })
      if (allPoints.length > 0) {
        startPos = allPoints[0]
        endPos = allPoints[allPoints.length - 1]
      }
    }
  } else if (tagName === 'line') {
    pointCount = 2
    startPos = {
      x: parseFloat(element.getAttribute('x1') || '0'),
      y: parseFloat(element.getAttribute('y1') || '0')
    }
    endPos = {
      x: parseFloat(element.getAttribute('x2') || '0'),
      y: parseFloat(element.getAttribute('y2') || '0')
    }
    allPoints.push(startPos, endPos)
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const points = element.getAttribute('points') || ''
    const coordMatches = points.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    if (coordMatches) {
      pointCount = coordMatches.length
      coordMatches.forEach(match => {
        const pt = parseCoordPair(match)
        if (pt) allPoints.push(pt)
      })
      if (allPoints.length > 0) {
        startPos = allPoints[0]
        endPos = allPoints[allPoints.length - 1]
      }
    }
  } else if (tagName === 'rect') {
    pointCount = 4
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const w = parseFloat(element.getAttribute('width') || '0')
    const h = parseFloat(element.getAttribute('height') || '0')
    startPos = { x, y }
    endPos = { x, y }
    allPoints.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h })
  } else if (tagName === 'circle' || tagName === 'ellipse') {
    pointCount = 1
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    startPos = { x: cx, y: cy }
    endPos = { x: cx, y: cy }
    allPoints.push(startPos)
  }

  return {
    id: node.id,
    color: color && color !== 'none' ? normalizeColor(color) : null,
    strokeWidth: strokeWidth || null,
    pointCount,
    startPos,
    endPos,
    allPoints
  }
}

export interface GroupInfo {
  fillCount: number
  pathCount: number
  colorCounts: Record<string, { fill: number; path: number }>
}

/**
 * Extract group info (counts of fills, paths, colors) for a group node
 */
export function extractGroupInfo(node: SVGNode): GroupInfo | null {
  if (!node.isGroup) return null

  // Count fills and paths, and collect colors
  let fillCount = 0
  let pathCount = 0
  const colorCounts: Record<string, { fill: number; path: number }> = {}

  const countElements = (n: SVGNode) => {
    if (!n.isGroup) {
      const element = n.element
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')
      const style = element.getAttribute('style') || ''

      let hasFill = !!(fill && fill !== 'none' && fill !== 'transparent')
      let hasStroke = !!(stroke && stroke !== 'none' && stroke !== 'transparent')

      // Check style
      if (style.includes('fill:')) {
        const match = style.match(/fill:\s*([^;]+)/)
        if (match && match[1].trim() !== 'none' && match[1].trim() !== 'transparent') {
          hasFill = true
        }
      }
      if (style.includes('stroke:')) {
        const match = style.match(/stroke:\s*([^;]+)/)
        if (match && match[1].trim() !== 'none' && match[1].trim() !== 'transparent') {
          hasStroke = true
        }
      }

      // Also check for customMarkup (line fill)
      if (n.customMarkup) {
        hasFill = true
      }

      // Get color for this element
      let color = ''
      if (hasFill) {
        color = fill || ''
        if (style.includes('fill:')) {
          const match = style.match(/fill:\s*([^;]+)/)
          if (match) color = match[1].trim()
        }
        if (n.fillColor) color = n.fillColor
      } else if (hasStroke) {
        color = stroke || ''
        if (style.includes('stroke:')) {
          const match = style.match(/stroke:\s*([^;]+)/)
          if (match) color = match[1].trim()
        }
      }

      if (color && color !== 'none' && color !== 'transparent') {
        const normalizedColor = normalizeColor(color)
        if (!colorCounts[normalizedColor]) {
          colorCounts[normalizedColor] = { fill: 0, path: 0 }
        }
        if (hasFill) {
          fillCount++
          colorCounts[normalizedColor].fill++
        } else {
          pathCount++
          colorCounts[normalizedColor].path++
        }
      } else {
        // Element without clear fill/stroke
        if (hasFill) fillCount++
        else pathCount++
      }
    }
    n.children.forEach(countElements)
  }

  node.children.forEach(countElements)

  return {
    fillCount,
    pathCount,
    colorCounts
  }
}
