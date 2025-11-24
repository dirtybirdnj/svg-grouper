import { SVGNode } from '../types/svg'

/**
 * Extract unique colors from an SVG node and its children
 * Returns array of color strings (hex, rgb, named colors, etc.)
 */
export function extractColors(node: SVGNode): string[] {
  const colors = new Set<string>()

  const extractFromElement = (element: Element) => {
    // Get computed style if available
    const style = element.getAttribute('style')
    if (style) {
      const fillMatch = style.match(/fill:\s*([^;]+)/)
      const strokeMatch = style.match(/stroke:\s*([^;]+)/)
      if (fillMatch && fillMatch[1] !== 'none') colors.add(fillMatch[1].trim())
      if (strokeMatch && strokeMatch[1] !== 'none') colors.add(strokeMatch[1].trim())
    }

    // Get fill and stroke attributes
    const fill = element.getAttribute('fill')
    const stroke = element.getAttribute('stroke')

    if (fill && fill !== 'none' && fill !== 'transparent') colors.add(fill)
    if (stroke && stroke !== 'none' && stroke !== 'transparent') colors.add(stroke)
  }

  const traverse = (n: SVGNode) => {
    extractFromElement(n.element)
    n.children.forEach(traverse)
  }

  traverse(node)

  return Array.from(colors).slice(0, 5) // Limit to 5 colors for display
}

/**
 * Convert any color format to a standard hex or rgb for display
 */
export function normalizeColor(color: string): string {
  // If it's already a hex color, return it
  if (/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
    return color
  }

  // If it's rgb/rgba, return as-is
  if (color.startsWith('rgb')) {
    return color
  }

  // For named colors and other formats, return as-is
  // (browser will handle rendering)
  return color
}
