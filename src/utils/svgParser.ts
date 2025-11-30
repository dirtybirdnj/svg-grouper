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

export function parseSVG(svgElement: SVGSVGElement): SVGNode[] {
  nodeIdCounter = 0 // Reset counter for each parse

  const children = Array.from(svgElement.children).filter(shouldIncludeElement)
  return children.map(child => parseNode(child))
}

// Progressive parsing for large SVGs
export async function parseSVGProgressively(
  svgElement: SVGSVGElement,
  onProgress?: (progress: number, status: string) => void
): Promise<SVGNode[]> {
  nodeIdCounter = 0

  const children = Array.from(svgElement.children).filter(shouldIncludeElement)
  const totalElements = countTotalElements(svgElement)
  let processedElements = 0

  onProgress?.(0, 'Parsing SVG structure...')

  const nodes: SVGNode[] = []

  // Process in chunks to avoid blocking UI
  for (let i = 0; i < children.length; i++) {
    const node = await parseNodeProgressively(children[i], totalElements, (count) => {
      processedElements += count
      const progress = (processedElements / totalElements) * 100
      onProgress?.(progress, `Parsing elements (${processedElements}/${totalElements})...`)
    })
    nodes.push(node)

    // Yield to browser every 50ms to keep UI responsive
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  onProgress?.(100, 'Parsing complete')
  return nodes
}

function countTotalElements(element: Element): number {
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

async function parseNodeProgressively(
  element: Element,
  totalElements: number,
  onElementProcessed: (count: number) => void
): Promise<SVGNode> {
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

  onElementProcessed(1)

  const children = Array.from(element.children).filter(shouldIncludeElement)

  // Process children
  for (let i = 0; i < children.length; i++) {
    const childNode = await parseNodeProgressively(children[i], totalElements, onElementProcessed)
    node.children.push(childNode)
  }

  return node
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
