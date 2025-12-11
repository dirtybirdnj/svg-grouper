// Hook for flattening all layers - ungroups, splits fill/stroke, groups by color

import { useCallback } from 'react'
import { SVGNode } from '../types/svg'
import { getElementColor, getElementTypeClass } from '../utils/elementColor'
import { normalizeColor } from '../utils/colorExtractor'

interface UseFlattenAllParams {
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  setSelectedNodeIds: (ids: Set<string>) => void
  rebuildSvgFromLayers: (nodes: SVGNode[]) => void
  flattenArmed: boolean
  setFlattenArmed: (armed: boolean) => void
  setStatusMessage: (message: string) => void
}

export function useFlattenAll({
  layerNodes,
  setLayerNodes,
  setSelectedNodeIds,
  rebuildSvgFromLayers,
  flattenArmed,
  setFlattenArmed,
  setStatusMessage,
}: UseFlattenAllParams) {
  const handleFlattenAll = useCallback(() => {
    if (!flattenArmed) {
      setFlattenArmed(true)
      setStatusMessage('Click Flatten again to confirm')
      return
    }

    setFlattenArmed(false)
    setStatusMessage('')

    const deleteEmptyLayers = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        // Don't delete nodes with customMarkup (line fill patterns) even if they have no children
        if (node.customMarkup) {
          return true
        }
        if (node.isGroup && node.children.length === 0) {
          node.element.remove()
          return false
        }
        if (node.children.length > 0) {
          node.children = deleteEmptyLayers(node.children)
          // After filtering children, check if group is now empty (but still preserve customMarkup)
          if (node.isGroup && node.children.length === 0 && !node.customMarkup) {
            node.element.remove()
            return false
          }
        }
        return true
      })
    }

    // Track seen IDs to avoid duplicates
    const seenIds = new Set<string>()

    // Extract all leaf elements from DOM, creating nodes for them
    const extractLeafElements = (element: Element, inheritedTransform?: string, inheritedFill?: string, inheritedStroke?: string): SVGNode[] => {
      const result: SVGNode[] = []
      const tag = element.tagName.toLowerCase()

      // Get this element's styles (will be inherited by children)
      const transform = element.getAttribute('transform')
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')

      // Compose transforms
      const composedTransform = inheritedTransform && transform
        ? `${inheritedTransform} ${transform}`
        : inheritedTransform || transform || undefined

      // Inherit fill/stroke (child overrides parent)
      const effectiveFill = fill || inheritedFill
      const effectiveStroke = stroke || inheritedStroke

      if (tag === 'g') {
        // It's a group - recurse into children
        for (const child of Array.from(element.children)) {
          result.push(...extractLeafElements(child, composedTransform, effectiveFill, effectiveStroke))
        }
      } else if (['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use'].includes(tag)) {
        // It's a leaf element - apply inherited styles and create node
        if (composedTransform) {
          element.setAttribute('transform', composedTransform)
        }
        if (effectiveFill && !element.getAttribute('fill')) {
          element.setAttribute('fill', effectiveFill)
        }
        if (effectiveStroke && !element.getAttribute('stroke')) {
          element.setAttribute('stroke', effectiveStroke)
        }

        // Ensure unique ID
        let nodeId = element.getAttribute('id')
        if (!nodeId || seenIds.has(nodeId)) {
          nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          element.setAttribute('id', nodeId)
        }
        seenIds.add(nodeId)

        result.push({
          id: nodeId,
          type: tag,
          name: element.getAttribute('id') || tag,
          element: element,
          children: [],
          isGroup: false
        })
      }

      return result
    }

    const ungroupAll = (nodes: SVGNode[]): SVGNode[] => {
      let result: SVGNode[] = []

      for (const node of nodes) {
        if (node.customMarkup) {
          result.push(node)
        } else if (node.isGroup) {
          // For groups, extract all leaf elements from DOM directly
          const leafElements = extractLeafElements(node.element)

          // Move leaf elements to parent in DOM
          const parent = node.element.parentElement
          if (parent) {
            for (const leaf of leafElements) {
              parent.insertBefore(leaf.element, node.element)
            }
            node.element.remove()
          }

          result.push(...leafElements)
        } else {
          // Non-group element - keep as is
          result.push(node)
        }
      }

      return result
    }

    // Split elements that have both fill AND stroke into separate elements
    // This is essential for pen plotters where each color = one pen
    const splitFillAndStroke = (nodes: SVGNode[]): SVGNode[] => {
      const result: SVGNode[] = []
      const svgElement = document.querySelector('.canvas-content svg')
      if (!svgElement) return nodes

      for (const node of nodes) {
        // Skip nodes with customMarkup (already processed line fills)
        if (node.customMarkup) {
          result.push(node)
          continue
        }

        const elementType = getElementTypeClass(node.element)

        if (elementType === 'both') {
          // This element has both fill and stroke - split it
          const originalElement = node.element

          // Capture stroke values BEFORE modifying the original element
          const strokeValue = originalElement.getAttribute('stroke') ||
            (originalElement.getAttribute('style')?.match(/stroke:\s*([^;]+)/)?.[1])
          const strokeWidth = originalElement.getAttribute('stroke-width') ||
            (originalElement.getAttribute('style')?.match(/stroke-width:\s*([^;]+)/)?.[1])
          const strokeLinejoin = originalElement.getAttribute('stroke-linejoin')
          const strokeLinecap = originalElement.getAttribute('stroke-linecap')

          // Create stroke-only version (clone BEFORE modifying original)
          const strokeClone = originalElement.cloneNode(true) as Element
          strokeClone.setAttribute('fill', 'none')
          strokeClone.setAttribute('stroke', strokeValue || '#000000')
          if (strokeWidth) strokeClone.setAttribute('stroke-width', strokeWidth)
          if (strokeLinejoin) strokeClone.setAttribute('stroke-linejoin', strokeLinejoin)
          if (strokeLinecap) strokeClone.setAttribute('stroke-linecap', strokeLinecap)

          // Create fill-only version (modify original)
          originalElement.setAttribute('stroke', 'none')
          originalElement.removeAttribute('stroke-width')
          originalElement.removeAttribute('stroke-linejoin')
          originalElement.removeAttribute('stroke-linecap')
          // Remove stroke from style if present
          const origStyle = originalElement.getAttribute('style')
          if (origStyle) {
            originalElement.setAttribute('style',
              origStyle
                .replace(/stroke:\s*[^;]+;?/g, '')
                .replace(/stroke-width:\s*[^;]+;?/g, '')
                .replace(/stroke-linejoin:\s*[^;]+;?/g, '')
                .replace(/stroke-linecap:\s*[^;]+;?/g, ''))
          }

          const fillNodeId = `${node.id}-fill`
          originalElement.setAttribute('id', fillNodeId)

          result.push({
            id: fillNodeId,
            type: node.type,
            name: `${node.name} (fill)`,
            element: originalElement,
            children: [],
            isGroup: false
          })

          const strokeNodeId = `${node.id}-stroke`
          strokeClone.setAttribute('id', strokeNodeId)

          // Insert stroke clone after the fill element in DOM
          originalElement.parentElement?.insertBefore(strokeClone, originalElement.nextSibling)

          result.push({
            id: strokeNodeId,
            type: node.type,
            name: `${node.name} (stroke)`,
            element: strokeClone,
            children: [],
            isGroup: false
          })
        } else {
          // Element has only fill or only stroke - keep as is
          result.push(node)
        }
      }

      return result
    }

    const groupByColor = (nodes: SVGNode[]): SVGNode[] => {
      const colorGroups = new Map<string, SVGNode[]>()
      nodes.forEach(node => {
        // For nodes with customMarkup (line fills), use the fillColor property
        let color: string | null = null
        if (node.customMarkup && node.fillColor) {
          color = node.fillColor
        } else {
          color = getElementColor(node.element)
        }
        // Normalize color to ensure consistent grouping (e.g., #fff and rgb(255,255,255) are same)
        const colorKey = color ? normalizeColor(color) : 'no-color'
        if (!colorGroups.has(colorKey)) {
          colorGroups.set(colorKey, [])
        }
        colorGroups.get(colorKey)!.push(node)
      })

      if (colorGroups.size <= 1) return nodes

      const svgElement = document.querySelector('.canvas-content svg')
      if (!svgElement) return nodes

      const newNodes: SVGNode[] = []
      colorGroups.forEach((groupNodes, color) => {
        if (groupNodes.length === 1) {
          newNodes.push(groupNodes[0])
        } else {
          const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          const groupId = `color-group-${color.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          newGroup.setAttribute('id', groupId)

          groupNodes.forEach(node => {
            newGroup.appendChild(node.element)
          })

          svgElement.appendChild(newGroup)

          const groupNode: SVGNode = {
            id: groupId,
            type: 'g',
            name: `color-${color}`,
            element: newGroup,
            isGroup: true,
            children: groupNodes
          }

          newNodes.push(groupNode)
        }
      })

      return newNodes
    }

    let processedNodes = [...layerNodes]

    processedNodes = deleteEmptyLayers(processedNodes)
    processedNodes = ungroupAll(processedNodes)
    processedNodes = splitFillAndStroke(processedNodes)
    processedNodes = groupByColor(processedNodes)

    setLayerNodes(processedNodes)
    setSelectedNodeIds(new Set())
    // Use rebuildSvgFromLayers to properly render customMarkup (line fill patterns)
    rebuildSvgFromLayers(processedNodes)
  }, [
    layerNodes,
    setLayerNodes,
    setSelectedNodeIds,
    rebuildSvgFromLayers,
    flattenArmed,
    setFlattenArmed,
    setStatusMessage,
  ])

  return handleFlattenAll
}
