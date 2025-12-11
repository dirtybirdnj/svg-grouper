// SVG Parser module exports

import { SVGNode } from '../../types/svg'
import {
  parseNode,
  shouldIncludeElement,
  isLeafElement,
  generateNodeId,
  getElementName,
} from './elementParsing'
// Re-export types
export type { ProgressCallback } from './types'
export { LEAF_TAGS, INCLUDED_TAGS } from './types'

// Re-export element parsing utilities
export {
  generateNodeId,
  getElementName,
  isGroupElement,
  shouldIncludeElement,
  isLeafElement,
  parseNode,
  countTotalElements,
  countLeafElements,
} from './elementParsing'

// Re-export progressive parsers
export {
  parseSVGProgressively,
  parseSVGFlatProgressively,
} from './progressiveParser'

/**
 * Synchronous SVG parsing - preserves group hierarchy
 */
export function parseSVG(svgElement: SVGSVGElement): SVGNode[] {
  const children = Array.from(svgElement.children).filter(shouldIncludeElement)
  return children.map(child => parseNode(child))
}

/**
 * Parse SVG extracting ONLY leaf elements (no groups).
 * Applies inherited transforms and styles from parent groups to each leaf.
 * This is the preferred parsing mode for pen plotter workflows.
 */
export function parseSVGFlat(svgElement: SVGSVGElement): SVGNode[] {
  const result: SVGNode[] = []

  function extractLeaves(
    element: Element,
    inheritedTransform?: string,
    inheritedFill?: string,
    inheritedStroke?: string
  ) {
    const tag = element.tagName.toLowerCase()

    // Get this element's styles
    const transform = element.getAttribute('transform')
    const fill = element.getAttribute('fill')
    const stroke = element.getAttribute('stroke')

    // Compose transforms (parent first, then child)
    const composedTransform = inheritedTransform && transform
      ? `${inheritedTransform} ${transform}`
      : inheritedTransform || transform || undefined

    // Inherit fill/stroke (child overrides parent)
    const effectiveFill = fill || inheritedFill
    const effectiveStroke = stroke || inheritedStroke

    if (tag === 'g') {
      // Recurse into group children
      for (const child of Array.from(element.children)) {
        extractLeaves(child, composedTransform, effectiveFill, effectiveStroke)
      }
    } else if (isLeafElement(element)) {
      // Apply inherited styles to leaf element
      if (composedTransform) {
        element.setAttribute('transform', composedTransform)
      }
      if (effectiveFill && !element.getAttribute('fill')) {
        element.setAttribute('fill', effectiveFill)
      }
      if (effectiveStroke && !element.getAttribute('stroke')) {
        element.setAttribute('stroke', effectiveStroke)
      }

      // Generate/get ID
      let nodeId = element.getAttribute('id')
      if (!nodeId) {
        nodeId = generateNodeId()
        element.setAttribute('id', nodeId)
      }

      result.push({
        id: nodeId,
        type: tag,
        name: getElementName(element),
        element,
        children: [],
        isGroup: false
      })
    }
  }

  // Start extraction from SVG root children
  for (const child of Array.from(svgElement.children)) {
    extractLeaves(child)
  }

  return result
}

/**
 * Flatten an SVGNode tree into a flat array
 */
export function flattenTree(nodes: SVGNode[]): SVGNode[] {
  const result: SVGNode[] = []

  function traverse(node: SVGNode) {
    result.push(node)
    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return result
}
