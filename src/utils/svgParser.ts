import { SVGNode } from '../types/svg'

let nodeIdCounter = 0

function generateNodeId(): string {
  return `node-${nodeIdCounter++}`
}

function getElementName(element: Element): string {
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

function isGroupElement(element: Element): boolean {
  return element.tagName.toLowerCase() === 'g'
}

function shouldIncludeElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase()

  // Include groups and drawable elements
  const includedTags = [
    'g', 'path', 'rect', 'circle', 'ellipse', 'line',
    'polyline', 'polygon', 'text', 'image', 'use'
  ]

  return includedTags.includes(tag)
}

function parseNode(element: Element): SVGNode {
  const node: SVGNode = {
    id: generateNodeId(),
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

export function parseSVG(svgElement: SVGSVGElement): SVGNode[] {
  nodeIdCounter = 0 // Reset counter for each parse

  const children = Array.from(svgElement.children).filter(shouldIncludeElement)
  return children.map(child => parseNode(child))
}

export function flattenTree(nodes: SVGNode[]): SVGNode[] {
  const result: SVGNode[] = []

  function traverse(node: SVGNode) {
    result.push(node)
    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return result
}
