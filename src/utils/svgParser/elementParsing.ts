// Element parsing utilities

import { SVGNode } from '../../types/svg'
import { nanoid } from 'nanoid'
import { INCLUDED_TAGS, LEAF_TAGS } from './types'

/**
 * Generate a unique node ID using nanoid.
 * Ensures IDs are unique across multiple parse operations and SVG imports.
 */
export function generateNodeId(): string {
  return `svg-${nanoid(10)}`
}

/**
 * Get a human-readable name for an element
 */
export function getElementName(element: Element): string {
  // Try to get name from various attributes
  const id = element.getAttribute('id')
  if (id) return id

  const title = element.querySelector('title')?.textContent
  if (title) return title

  const label = element.getAttribute('aria-label')
  if (label) return label

  // Fallback to element type
  return element.tagName.toLowerCase()
}

/**
 * Check if element is a group (<g>) element
 */
export function isGroupElement(element: Element): boolean {
  return element.tagName.toLowerCase() === 'g'
}

/**
 * Check if element should be included in parsing
 */
export function shouldIncludeElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  return (INCLUDED_TAGS as readonly string[]).includes(tag)
}

/**
 * Check if element is a leaf (drawable, non-group) element
 */
export function isLeafElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  return (LEAF_TAGS as readonly string[]).includes(tag)
}

/**
 * Parse a single element into an SVGNode
 */
export function parseNode(element: Element): SVGNode {
  // Use existing ID if present, otherwise generate one
  let nodeId = element.getAttribute('id')
  if (!nodeId) {
    nodeId = generateNodeId()
    // Set the ID on the DOM element so we can find it later for highlighting
    element.setAttribute('id', nodeId)
  }

  const node: SVGNode = {
    id: nodeId,
    type: element.tagName.toLowerCase(),
    name: getElementName(element),
    element,
    children: [],
    isGroup: isGroupElement(element),
  }

  // Parse children
  const children = Array.from(element.children).filter(shouldIncludeElement)
  node.children = children.map(child => parseNode(child))

  return node
}

/**
 * Count total includable elements in an element tree
 */
export function countTotalElements(element: Element): number {
  let count = 0
  const walk = (el: Element) => {
    if (shouldIncludeElement(el)) {
      count++
      Array.from(el.children).forEach(walk)
    }
  }
  Array.from(element.children).forEach(walk)
  return count
}

/**
 * Count total leaf elements in an element tree
 */
export function countLeafElements(element: Element): number {
  let count = 0
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (isLeafElement(el)) {
      count++
    } else if (tag === 'g') {
      Array.from(el.children).forEach(walk)
    }
  }
  Array.from(element.children).forEach(walk)
  return count
}
