import { SVGNode } from '../../types/svg'

// Helper to check if an element has fill or stroke
export function checkElementType(elem: Element): { hasFill: boolean; hasStroke: boolean } {
  const fill = elem.getAttribute('fill')
  const stroke = elem.getAttribute('stroke')
  const style = elem.getAttribute('style') || ''

  let hasFill = !!(fill && fill !== 'none' && fill !== 'transparent')
  let hasStroke = !!(stroke && stroke !== 'none' && stroke !== 'transparent')

  // Check style attribute
  if (style.includes('fill:')) {
    const fillMatch = style.match(/fill:\s*([^;]+)/)
    if (fillMatch && fillMatch[1].trim() !== 'none' && fillMatch[1].trim() !== 'transparent') {
      hasFill = true
    }
  }
  if (style.includes('stroke:')) {
    const strokeMatch = style.match(/stroke:\s*([^;]+)/)
    if (strokeMatch && strokeMatch[1].trim() !== 'none' && strokeMatch[1].trim() !== 'transparent') {
      hasStroke = true
    }
  }

  return { hasFill, hasStroke }
}

// Helper to determine if a path element is fill-based or stroke-based
export function getPathType(node: SVGNode): 'fill' | 'stroke' {
  if (node.isGroup) return 'stroke'
  // For custom markup nodes, check the actual SVG fill attribute
  // Generated fill patterns have fill="none" and are stroke-only
  if (node.customMarkup && node.element) {
    const fill = node.element.getAttribute('fill')
    if (!fill || fill === 'none') return 'stroke'
    return 'fill'
  }
  const { hasFill } = checkElementType(node.element)
  // If has fill (and possibly stroke), consider it a fill path
  if (hasFill) return 'fill'
  return 'stroke'
}

// Helper to determine group type: 'fill', 'stroke', or 'mixed'
export function getGroupType(node: SVGNode): 'fill' | 'stroke' | 'mixed' | null {
  if (!node.isGroup) return null

  let hasAnyFills = false
  let hasAnyStrokes = false

  const checkNode = (n: SVGNode) => {
    // customMarkup with fillColor indicates line fill pattern - count as fill
    // customMarkup without fillColor is a stroke-only path (outline)
    if (n.customMarkup) {
      if (n.fillColor) {
        hasAnyFills = true
      } else {
        hasAnyStrokes = true
      }
    } else {
      const result = checkElementType(n.element)
      if (result.hasFill) hasAnyFills = true
      if (result.hasStroke && !result.hasFill) hasAnyStrokes = true
    }
    n.children.forEach(checkNode)
  }

  node.children.forEach(checkNode)

  if (hasAnyFills && hasAnyStrokes) return 'mixed'
  if (hasAnyFills) return 'fill'
  if (hasAnyStrokes) return 'stroke'
  return 'stroke' // default to stroke if unclear
}

// Helper to get path info for display (points, start/end)
export function getPathInfo(node: SVGNode): { pointCount: number; startPos: { x: number; y: number }; endPos: { x: number; y: number } } | null {
  if (node.isGroup) return null

  const element = node.element
  const tagName = element.tagName.toLowerCase()

  let pointCount = 0
  let startPos = { x: 0, y: 0 }
  let endPos = { x: 0, y: 0 }

  const parseCoordPair = (match: string): { x: number; y: number } | null => {
    const parsed = match.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/)
    if (parsed) {
      return { x: parseFloat(parsed[1]), y: parseFloat(parsed[2]) }
    }
    return null
  }

  if (tagName === 'path') {
    const d = element.getAttribute('d') || ''
    const coordMatches = d.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    if (coordMatches) {
      pointCount = coordMatches.length
      const first = parseCoordPair(coordMatches[0])
      const last = parseCoordPair(coordMatches[coordMatches.length - 1])
      if (first) startPos = first
      if (last) endPos = last
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
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const points = element.getAttribute('points') || ''
    const coordMatches = points.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    if (coordMatches) {
      pointCount = coordMatches.length
      const first = parseCoordPair(coordMatches[0])
      const last = parseCoordPair(coordMatches[coordMatches.length - 1])
      if (first) startPos = first
      if (last) endPos = last
    }
  } else if (tagName === 'rect') {
    pointCount = 4
    startPos = {
      x: parseFloat(element.getAttribute('x') || '0'),
      y: parseFloat(element.getAttribute('y') || '0')
    }
    endPos = startPos
  } else if (tagName === 'circle' || tagName === 'ellipse') {
    pointCount = 1
    startPos = {
      x: parseFloat(element.getAttribute('cx') || '0'),
      y: parseFloat(element.getAttribute('cy') || '0')
    }
    endPos = startPos
  }

  return { pointCount, startPos, endPos }
}

// Count total elements in a node (including nested children)
export function countElements(node: SVGNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countElements(child), 0)
}
