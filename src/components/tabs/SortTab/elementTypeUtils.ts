// Element type utilities - determine if elements are fills or strokes

import { SVGNode } from '../../../types/svg'

export type ElementType = 'fill' | 'stroke' | 'other'

/**
 * Get type for a leaf (non-group) element
 */
export function getLeafElementType(node: SVGNode): ElementType {
  const element = node.element
  const fill = element?.getAttribute('fill')
  const stroke = element?.getAttribute('stroke')
  const style = element?.getAttribute('style') || ''

  const hasFillStyle = style.includes('fill:') && !style.includes('fill:none') && !style.includes('fill: none')
  const hasStrokeStyle = style.includes('stroke:') && !style.includes('stroke:none') && !style.includes('stroke: none')

  const hasFill = hasFillStyle || (fill && fill !== 'none' && fill !== 'transparent')
  const hasStroke = hasStrokeStyle || (stroke && stroke !== 'none' && stroke !== 'transparent')

  if (hasFill && !hasStroke) return 'fill'
  if (hasStroke && !hasFill) return 'stroke'
  return 'other'
}

/**
 * Get element type for filtering - checks if element is fill or stroke
 * For groups, determines type based on children content
 */
export function getElementType(node: SVGNode): ElementType {
  if (node.isGroup) {
    // For groups, determine based on children content
    let hasFillChildren = false
    let hasStrokeChildren = false

    const checkChildren = (n: SVGNode) => {
      if (!n.isGroup) {
        const type = getLeafElementType(n)
        if (type === 'fill') hasFillChildren = true
        if (type === 'stroke') hasStrokeChildren = true
      }
      n.children.forEach(checkChildren)
    }
    checkChildren(node)

    if (hasFillChildren && !hasStrokeChildren) return 'fill'
    if (hasStrokeChildren && !hasFillChildren) return 'stroke'
    return 'other' // Mixed or empty
  }
  return getLeafElementType(node)
}
