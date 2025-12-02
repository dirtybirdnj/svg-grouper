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
    // Check for fillColor from line fill (customMarkup nodes)
    if (n.fillColor) {
      colors.add(n.fillColor)
    }
    extractFromElement(n.element)
    n.children.forEach(traverse)
  }

  traverse(node)

  return Array.from(colors).slice(0, 5) // Limit to 5 colors for display
}

/**
 * Convert any color to RGB components
 */
function colorToRGB(color: string): { r: number; g: number; b: number } | null {
  // Handle hex colors
  const hexMatch = color.match(/^#([0-9A-Fa-f]{3,8})$/)
  if (hexMatch) {
    let hex = hexMatch[1]
    // Expand 3-char hex to 6-char
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    }
    // Take first 6 chars (ignore alpha if present)
    hex = hex.substring(0, 6)
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return { r, g, b }
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    }
  }

  return null
}

/**
 * Convert any color format to a standard rgb(r,g,b) string for consistent comparison
 * This ensures #d9e9ff and rgb(217, 233, 255) are treated as the same color
 */
export function normalizeColor(color: string): string {
  const rgb = colorToRGB(color.trim())
  if (rgb) {
    return `rgb(${rgb.r},${rgb.g},${rgb.b})`
  }
  // For named colors and other formats, return as-is (lowercase for consistency)
  return color.toLowerCase().trim()
}
