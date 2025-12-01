import { SVGNode } from '../types/svg'
import { normalizeColor } from './colorExtractor'

/**
 * Get color from an element's attributes and style
 * Checks fill first, then stroke
 */
export function getElementColor(element: Element): string | null {
  const fill = element.getAttribute('fill')
  const stroke = element.getAttribute('stroke')
  const style = element.getAttribute('style')

  if (style) {
    const fillMatch = style.match(/fill:\s*([^;]+)/)
    const strokeMatch = style.match(/stroke:\s*([^;]+)/)
    if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1].trim() !== 'transparent') {
      return fillMatch[1].trim()
    }
    if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1].trim() !== 'transparent') {
      return strokeMatch[1].trim()
    }
  }

  if (fill && fill !== 'none' && fill !== 'transparent') return fill
  if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

  return null
}

/**
 * Get stroke color from an element (prioritizes stroke over fill)
 */
export function getElementStrokeColor(element: Element): string | null {
  const stroke = element.getAttribute('stroke')
  const fill = element.getAttribute('fill')
  const style = element.getAttribute('style') || ''

  const strokeMatch = style.match(/stroke:\s*([^;]+)/)
  if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1].trim() !== 'transparent') {
    return strokeMatch[1].trim()
  }
  if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

  const fillMatch = style.match(/fill:\s*([^;]+)/)
  if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1].trim() !== 'transparent') {
    return fillMatch[1].trim()
  }
  if (fill && fill !== 'none' && fill !== 'transparent') return fill

  return null
}

/**
 * Get stroke width from an element
 */
export function getElementStrokeWidth(element: Element): string | null {
  const strokeWidth = element.getAttribute('stroke-width')
  const style = element.getAttribute('style') || ''

  const widthMatch = style.match(/stroke-width:\s*([^;]+)/)
  if (widthMatch) return widthMatch[1].trim()
  if (strokeWidth) return strokeWidth
  return null
}

/**
 * Get color from a node, recursively searching children if needed
 */
export function getNodeColor(node: SVGNode, defaultColor: string = '#000000'): string {
  // Check for fillColor from line fill (customMarkup nodes)
  if (node.fillColor) return node.fillColor

  // Try the node's own element
  const color = getElementColor(node.element)
  if (color) return normalizeColor(color)

  // If it's a group, search children recursively for first color
  for (const child of node.children) {
    const childColor = getNodeColor(child, defaultColor)
    if (childColor !== defaultColor) return childColor
  }

  return defaultColor
}

/**
 * Get stroke width from a node, recursively searching children if needed
 */
export function getNodeStrokeWidth(node: SVGNode, defaultWidth: string = '1'): string {
  const width = getElementStrokeWidth(node.element)
  if (width) return width

  // If it's a group, search children recursively
  for (const child of node.children) {
    const childWidth = getNodeStrokeWidth(child, defaultWidth)
    if (childWidth !== defaultWidth) return childWidth
  }

  return defaultWidth
}

/**
 * Check if an element has a fill (not stroke-only)
 */
export function isElementFill(element: Element): boolean {
  const fill = element.getAttribute('fill')
  const stroke = element.getAttribute('stroke')
  const style = element.getAttribute('style') || ''

  const hasFillStyle = style.includes('fill:') &&
    !style.includes('fill:none') &&
    !style.includes('fill: none')
  const hasStrokeStyle = style.includes('stroke:') &&
    !style.includes('stroke:none') &&
    !style.includes('stroke: none')

  const hasFill = hasFillStyle || (fill && fill !== 'none' && fill !== 'transparent')
  const hasStroke = hasStrokeStyle || (stroke && stroke !== 'none' && stroke !== 'transparent')

  return !!(hasFill && !hasStroke)
}

/**
 * Check if an element is stroke-only (no fill)
 */
export function isElementStroke(element: Element): boolean {
  const fill = element.getAttribute('fill')
  const stroke = element.getAttribute('stroke')
  const style = element.getAttribute('style') || ''

  const hasFillStyle = style.includes('fill:') &&
    !style.includes('fill:none') &&
    !style.includes('fill: none')
  const hasStrokeStyle = style.includes('stroke:') &&
    !style.includes('stroke:none') &&
    !style.includes('stroke: none')

  const hasFill = hasFillStyle || (fill && fill !== 'none' && fill !== 'transparent')
  const hasStroke = hasStrokeStyle || (stroke && stroke !== 'none' && stroke !== 'transparent')

  return !!(hasStroke && !hasFill)
}

/**
 * Get element type classification
 */
export function getElementTypeClass(element: Element): 'fill' | 'stroke' | 'both' | 'none' {
  const fill = element.getAttribute('fill')
  const stroke = element.getAttribute('stroke')
  const style = element.getAttribute('style') || ''

  const hasFillStyle = style.includes('fill:') &&
    !style.includes('fill:none') &&
    !style.includes('fill: none')
  const hasStrokeStyle = style.includes('stroke:') &&
    !style.includes('stroke:none') &&
    !style.includes('stroke: none')

  const hasFill = hasFillStyle || (fill && fill !== 'none' && fill !== 'transparent')
  const hasStroke = hasStrokeStyle || (stroke && stroke !== 'none' && stroke !== 'transparent')

  if (hasFill && hasStroke) return 'both'
  if (hasFill) return 'fill'
  if (hasStroke) return 'stroke'
  return 'none'
}

/**
 * Get node type for sorting/filtering purposes
 */
export function getNodeElementType(node: SVGNode): 'fill' | 'stroke' | 'other' {
  if (node.isGroup) {
    // For groups, determine based on children content
    let hasFillChildren = false
    let hasStrokeChildren = false

    const checkChildren = (n: SVGNode) => {
      if (!n.isGroup) {
        const type = getElementTypeClass(n.element)
        if (type === 'fill' || type === 'both') hasFillChildren = true
        if (type === 'stroke') hasStrokeChildren = true
      }
      n.children.forEach(checkChildren)
    }
    checkChildren(node)

    if (hasFillChildren && !hasStrokeChildren) return 'fill'
    if (hasStrokeChildren && !hasFillChildren) return 'stroke'
    return 'other' // Mixed or empty
  }

  const type = getElementTypeClass(node.element)
  if (type === 'fill' || type === 'both') return 'fill'
  if (type === 'stroke') return 'stroke'
  return 'other'
}

/**
 * Categorize node for grouping purposes
 */
export function getNodeCategory(node: SVGNode): 'fills' | 'lines' | 'other' {
  const type = getNodeElementType(node)
  if (type === 'fill') return 'fills'
  if (type === 'stroke') return 'lines'
  return 'other'
}
