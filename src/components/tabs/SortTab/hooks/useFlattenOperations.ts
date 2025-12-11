import { useCallback } from 'react'
import { SVGNode } from '../../../../types/svg'
import { normalizeColor } from '../../../../utils/colorExtractor'
import { getElementColor } from '../../../../utils/elementColor'

interface UseFlattenOperationsProps {
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  setSelectedNodeIds: (ids: Set<string>) => void
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
  flattenArmed: boolean
  setFlattenArmed: (armed: boolean) => void
  setDeleteArmed: (armed: boolean) => void
  setSplitArmed: (armed: boolean) => void
  setStatusMessage: (msg: string) => void
}

export function useFlattenOperations({
  layerNodes,
  setLayerNodes,
  setSelectedNodeIds,
  rebuildSvgFromLayers,
  flattenArmed,
  setFlattenArmed,
  setDeleteArmed,
  setSplitArmed,
  setStatusMessage,
}: UseFlattenOperationsProps) {
  const handleFlattenAll = useCallback(() => {
    if (!flattenArmed) {
      setFlattenArmed(true)
      setDeleteArmed(false)
      setSplitArmed(false)
      setStatusMessage('Click Flatten again to confirm')
      return
    }

    setFlattenArmed(false)
    setStatusMessage('')

    const deleteEmptyLayers = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (node.customMarkup) {
          return true
        }
        if (node.isGroup && node.children.length === 0) {
          node.element.remove()
          return false
        }
        if (node.children.length > 0) {
          node.children = deleteEmptyLayers(node.children)
          if (node.isGroup && node.children.length === 0 && !node.customMarkup) {
            node.element.remove()
            return false
          }
        }
        return true
      })
    }

    const seenIds = new Set<string>()

    const ensureUniqueId = (node: SVGNode): void => {
      let nodeId = node.id
      if (seenIds.has(nodeId)) {
        const suffix = `-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        nodeId = `${node.id}${suffix}`
        node.element.setAttribute('id', nodeId)
        node.id = nodeId
      }
      seenIds.add(nodeId)
    }

    const extractLeafElements = (
      element: Element,
      inheritedTransform?: string,
      inheritedFill?: string,
      inheritedStroke?: string
    ): SVGNode[] => {
      const result: SVGNode[] = []
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
          result.push(...extractLeafElements(child, composedTransform, effectiveFill, effectiveStroke))
        }
      } else if (['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use'].includes(tag)) {
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
          ensureUniqueId(node)
          result.push(node)
        } else if (node.isGroup) {
          const leafElements = extractLeafElements(node.element)

          const parent = node.element.parentElement
          if (parent) {
            for (const leaf of leafElements) {
              parent.insertBefore(leaf.element, node.element)
            }
            node.element.remove()
          }

          result.push(...leafElements)
        } else {
          ensureUniqueId(node)
          result.push(node)
        }
      }

      return result
    }

    const groupByColor = (nodes: SVGNode[]): SVGNode[] => {
      const colorGroups = new Map<string, SVGNode[]>()
      nodes.forEach(node => {
        let color: string | null = null
        if (node.customMarkup && node.fillColor) {
          color = node.fillColor
        } else {
          color = getElementColor(node.element)
        }
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

    let currentNodes = deleteEmptyLayers([...layerNodes])
    currentNodes = ungroupAll(currentNodes)
    currentNodes = groupByColor(currentNodes)

    setLayerNodes(currentNodes)
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(currentNodes)
    setStatusMessage('Flattened: removed empty layers, ungrouped all, grouped by color')
  }, [
    layerNodes,
    flattenArmed,
    setLayerNodes,
    setSelectedNodeIds,
    rebuildSvgFromLayers,
    setFlattenArmed,
    setDeleteArmed,
    setSplitArmed,
    setStatusMessage,
  ])

  return {
    handleFlattenAll,
  }
}
