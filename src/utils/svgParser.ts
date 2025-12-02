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

// Leaf element tags (non-group drawable elements)
const LEAF_TAGS = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use']

/**
 * Parse SVG extracting ONLY leaf elements (no groups).
 * Applies inherited transforms and styles from parent groups to each leaf.
 * This is the preferred parsing mode for pen plotter workflows.
 */
export function parseSVGFlat(svgElement: SVGSVGElement): SVGNode[] {
  nodeIdCounter = 0
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
    } else if (LEAF_TAGS.includes(tag)) {
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
 * Progressive flat parsing for large SVGs
 */
export async function parseSVGFlatProgressively(
  svgElement: SVGSVGElement,
  onProgress?: (progress: number, status: string) => void
): Promise<SVGNode[]> {
  nodeIdCounter = 0
  const result: SVGNode[] = []

  // Count total leaf elements
  let totalLeaves = 0
  function countLeaves(el: Element) {
    const tag = el.tagName.toLowerCase()
    if (LEAF_TAGS.includes(tag)) {
      totalLeaves++
    } else if (tag === 'g') {
      Array.from(el.children).forEach(countLeaves)
    }
  }
  Array.from(svgElement.children).forEach(countLeaves)

  let processed = 0
  onProgress?.(0, 'Extracting elements...')

  async function extractLeaves(
    element: Element,
    inheritedTransform?: string,
    inheritedFill?: string,
    inheritedStroke?: string
  ) {
    const tag = element.tagName.toLowerCase()

    const transform = element.getAttribute('transform')
    const fill = element.getAttribute('fill')
    const stroke = element.getAttribute('stroke')

    const composedTransform = inheritedTransform && transform
      ? `${inheritedTransform} ${transform}`
      : inheritedTransform || transform || undefined

    const effectiveFill = fill || inheritedFill
    const effectiveStroke = stroke || inheritedStroke

    if (tag === 'g') {
      for (const child of Array.from(element.children)) {
        await extractLeaves(child, composedTransform, effectiveFill, effectiveStroke)
      }
    } else if (LEAF_TAGS.includes(tag)) {
      if (composedTransform) {
        element.setAttribute('transform', composedTransform)
      }
      if (effectiveFill && !element.getAttribute('fill')) {
        element.setAttribute('fill', effectiveFill)
      }
      if (effectiveStroke && !element.getAttribute('stroke')) {
        element.setAttribute('stroke', effectiveStroke)
      }

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

      processed++
      if (processed % 100 === 0) {
        const progress = (processed / totalLeaves) * 100
        onProgress?.(progress, `Extracting elements (${processed}/${totalLeaves})...`)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
  }

  for (const child of Array.from(svgElement.children)) {
    await extractLeaves(child)
  }

  onProgress?.(100, 'Extraction complete')
  return result
}
