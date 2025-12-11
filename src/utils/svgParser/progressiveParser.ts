// Progressive SVG parsing for large files

import { SVGNode } from '../../types/svg'
import { ProgressCallback } from './types'
import {
  generateNodeId,
  getElementName,
  isGroupElement,
  shouldIncludeElement,
  isLeafElement,
  countTotalElements,
  countLeafElements,
} from './elementParsing'

/**
 * Parse a node progressively, yielding to browser periodically
 */
async function parseNodeProgressively(
  element: Element,
  _totalElements: number,
  onElementProcessed: (count: number) => void
): Promise<SVGNode> {
  // Use existing ID if present, otherwise generate one
  let nodeId = element.getAttribute('id')
  if (!nodeId) {
    nodeId = generateNodeId()
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
    const childNode = await parseNodeProgressively(children[i], _totalElements, onElementProcessed)
    node.children.push(childNode)
  }

  return node
}

/**
 * Progressive parsing for large SVGs - preserves group hierarchy
 */
export async function parseSVGProgressively(
  svgElement: SVGSVGElement,
  onProgress?: ProgressCallback
): Promise<SVGNode[]> {
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

    // Yield to browser every 10 elements to keep UI responsive
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  onProgress?.(100, 'Parsing complete')
  return nodes
}

/**
 * Progressive flat parsing for large SVGs - extracts only leaf elements
 * Applies inherited transforms and styles from parent groups to each leaf.
 * This is the preferred parsing mode for pen plotter workflows.
 */
export async function parseSVGFlatProgressively(
  svgElement: SVGSVGElement,
  onProgress?: ProgressCallback
): Promise<SVGNode[]> {
  const result: SVGNode[] = []
  const totalLeaves = countLeafElements(svgElement)

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
    } else if (isLeafElement(element)) {
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
