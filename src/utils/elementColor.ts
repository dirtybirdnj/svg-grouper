import { SVGNode } from '../types/svg'
import { normalizeColor } from './colorExtractor'

// Pre-compiled regex patterns for style attribute parsing
const STYLE_FILL_REGEX = /fill:\s*([^;]+)/
const STYLE_STROKE_REGEX = /stroke:\s*([^;]+)/
const STYLE_STROKE_WIDTH_REGEX = /stroke-width:\s*([^;]+)/
const STYLE_OPACITY_REGEX = /opacity:\s*([^;]+)/
const STYLE_FILL_OPACITY_REGEX = /fill-opacity:\s*([^;]+)/
const STYLE_STROKE_OPACITY_REGEX = /stroke-opacity:\s*([^;]+)/

/**
 * Parsed style attributes from a style string
 */
export interface ParsedStyle {
  fill?: string
  stroke?: string
  strokeWidth?: string
  opacity?: string
  fillOpacity?: string
  strokeOpacity?: string
}

/**
 * Parse a style attribute string into an object
 * Uses pre-compiled regex for efficiency
 */
export function parseStyleAttribute(style: string | null): ParsedStyle {
  if (!style) return {}

  const result: ParsedStyle = {}

  const fillMatch = STYLE_FILL_REGEX.exec(style)
  if (fillMatch) result.fill = fillMatch[1].trim()

  const strokeMatch = STYLE_STROKE_REGEX.exec(style)
  if (strokeMatch) result.stroke = strokeMatch[1].trim()

  const strokeWidthMatch = STYLE_STROKE_WIDTH_REGEX.exec(style)
  if (strokeWidthMatch) result.strokeWidth = strokeWidthMatch[1].trim()

  const opacityMatch = STYLE_OPACITY_REGEX.exec(style)
  if (opacityMatch) result.opacity = opacityMatch[1].trim()

  const fillOpacityMatch = STYLE_FILL_OPACITY_REGEX.exec(style)
  if (fillOpacityMatch) result.fillOpacity = fillOpacityMatch[1].trim()

  const strokeOpacityMatch = STYLE_STROKE_OPACITY_REGEX.exec(style)
  if (strokeOpacityMatch) result.strokeOpacity = strokeOpacityMatch[1].trim()

  return result
}

/**
 * Check if a color value is valid (not none/transparent/empty)
 */
export function isValidColor(color: string | undefined | null): color is string {
  return !!(color && color !== 'none' && color !== 'transparent')
}

/**
 * Get all attributes needed for color extraction at once
 */
export function getElementAttrs(element: Element): {
  fill: string | null
  stroke: string | null
  strokeWidth: string | null
  parsedStyle: ParsedStyle
} {
  return {
    fill: element.getAttribute('fill'),
    stroke: element.getAttribute('stroke'),
    strokeWidth: element.getAttribute('stroke-width'),
    parsedStyle: parseStyleAttribute(element.getAttribute('style'))
  }
}

/**
 * Get color from an element's attributes and style
 * Checks fill first, then stroke
 * Falls back to computed styles for CSS-defined colors
 */
export function getElementColor(element: Element): string | null {
  const { fill, stroke, parsedStyle } = getElementAttrs(element)

  // Check inline style first (highest specificity for inline)
  if (isValidColor(parsedStyle.fill)) return parsedStyle.fill
  if (isValidColor(parsedStyle.stroke)) return parsedStyle.stroke

  // Check direct attributes
  if (isValidColor(fill)) return fill
  if (isValidColor(stroke)) return stroke

  // Fall back to computed styles (catches CSS from <style> blocks)
  if (element instanceof SVGElement || element instanceof HTMLElement) {
    try {
      const computed = getComputedStyle(element)
      const computedFill = computed.fill
      const computedStroke = computed.stroke

      // Computed fill/stroke return rgb() strings, check they're not "none" or default black
      if (computedFill && computedFill !== 'none' && computedFill !== 'rgb(0, 0, 0)') {
        return computedFill
      }
      if (computedStroke && computedStroke !== 'none' && computedStroke !== 'rgb(0, 0, 0)') {
        return computedStroke
      }
    } catch {
      // getComputedStyle can fail if element not in DOM
    }
  }

  return null
}

/**
 * Get stroke color from an element (prioritizes stroke over fill)
 */
export function getElementStrokeColor(element: Element): string | null {
  const { fill, stroke, parsedStyle } = getElementAttrs(element)

  // Check style first (higher specificity), prioritize stroke
  if (isValidColor(parsedStyle.stroke)) return parsedStyle.stroke
  if (isValidColor(stroke)) return stroke

  // Fall back to fill
  if (isValidColor(parsedStyle.fill)) return parsedStyle.fill
  if (isValidColor(fill)) return fill

  return null
}

/**
 * Get color for pen plotter context - prioritizes stroke over fill
 * Optionally accepts an override fillColor (for line fill/custom markup nodes)
 * Normalizes to lowercase for consistency
 */
export function getPlotterColor(element: Element, fillColorOverride?: string): string | null {
  // Check for override fillColor from line fill (customMarkup nodes)
  if (fillColorOverride) return fillColorOverride.toLowerCase()

  const { fill, stroke, parsedStyle } = getElementAttrs(element)

  // Prefer stroke for pen plotter context
  if (isValidColor(parsedStyle.stroke)) return parsedStyle.stroke.toLowerCase()
  if (isValidColor(stroke)) return stroke.toLowerCase()

  // Fall back to fill
  if (isValidColor(parsedStyle.fill)) return parsedStyle.fill.toLowerCase()
  if (isValidColor(fill)) return fill.toLowerCase()

  return null
}

/**
 * Get stroke width from an element
 */
export function getElementStrokeWidth(element: Element): string | null {
  const { strokeWidth, parsedStyle } = getElementAttrs(element)

  // Style has higher specificity
  if (parsedStyle.strokeWidth) return parsedStyle.strokeWidth
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
 * Check if element has fill and/or stroke
 * Returns { hasFill, hasStroke } for use by classification functions
 */
function getElementFillStrokeState(element: Element): { hasFill: boolean; hasStroke: boolean } {
  const { fill, stroke, parsedStyle } = getElementAttrs(element)

  const hasFill = isValidColor(parsedStyle.fill) || isValidColor(fill)
  const hasStroke = isValidColor(parsedStyle.stroke) || isValidColor(stroke)

  return { hasFill, hasStroke }
}

/**
 * Check if an element has a fill (not stroke-only)
 */
export function isElementFill(element: Element): boolean {
  const { hasFill, hasStroke } = getElementFillStrokeState(element)
  return hasFill && !hasStroke
}

/**
 * Check if an element is stroke-only (no fill)
 */
export function isElementStroke(element: Element): boolean {
  const { hasFill, hasStroke } = getElementFillStrokeState(element)
  return hasStroke && !hasFill
}

/**
 * Get element type classification
 */
export function getElementTypeClass(element: Element): 'fill' | 'stroke' | 'both' | 'none' {
  const { hasFill, hasStroke } = getElementFillStrokeState(element)

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
