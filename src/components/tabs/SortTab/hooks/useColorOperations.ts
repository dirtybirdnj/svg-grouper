import { useCallback } from 'react'
import { SVGNode } from '../../../../types/svg'
import { normalizeColor } from '../../../../utils/colorExtractor'
import { findNodeById, updateNodeChildren } from '../../../../utils/nodeUtils'
import { getElementColor } from '../../../../utils/elementColor'

interface UseColorOperationsProps {
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string>) => void
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
  setIsProcessing: (processing: boolean) => void
}

export function useColorOperations({
  layerNodes,
  setLayerNodes,
  selectedNodeIds,
  setSelectedNodeIds,
  rebuildSvgFromLayers,
  setIsProcessing,
}: UseColorOperationsProps) {
  const handleColorChange = useCallback((
    nodeId: string,
    oldColor: string,
    newColor: string,
    mode?: 'fill' | 'stroke',
    strokeWidth?: string
  ) => {
    const normalizedOld = normalizeColor(oldColor)
    const normalizedNew = normalizeColor(newColor)

    const updateNodeColors = (node: SVGNode): SVGNode => {
      const updateElementColor = (element: Element) => {
        const fill = element.getAttribute('fill')
        const stroke = element.getAttribute('stroke')
        const style = element.getAttribute('style')

        if (mode === 'fill') {
          element.setAttribute('fill', normalizedNew)
          element.setAttribute('stroke', 'none')
          if (style) {
            let newStyle = style
              .replace(/fill:\s*[^;]+;?/g, '')
              .replace(/stroke:\s*[^;]+;?/g, '')
              .replace(/stroke-width:\s*[^;]+;?/g, '')
              .trim()
            if (newStyle) {
              element.setAttribute('style', newStyle)
            } else {
              element.removeAttribute('style')
            }
          }
        } else if (mode === 'stroke') {
          element.setAttribute('fill', 'none')
          element.setAttribute('stroke', normalizedNew)
          if (strokeWidth) {
            element.setAttribute('stroke-width', strokeWidth)
          }
          if (style) {
            let newStyle = style
              .replace(/fill:\s*[^;]+;?/g, '')
              .replace(/stroke:\s*[^;]+;?/g, '')
              .replace(/stroke-width:\s*[^;]+;?/g, '')
              .trim()
            if (newStyle) {
              element.setAttribute('style', newStyle)
            } else {
              element.removeAttribute('style')
            }
          }
        } else {
          if (fill && normalizeColor(fill) === normalizedOld) {
            element.setAttribute('fill', normalizedNew)
          }
          if (stroke && normalizeColor(stroke) === normalizedOld) {
            element.setAttribute('stroke', normalizedNew)
          }
          if (style) {
            let newStyle = style
            newStyle = newStyle.replace(
              /fill:\s*([^;]+)/g,
              (match, color) => normalizeColor(color.trim()) === normalizedOld ? `fill: ${normalizedNew}` : match
            )
            newStyle = newStyle.replace(
              /stroke:\s*([^;]+)/g,
              (match, color) => normalizeColor(color.trim()) === normalizedOld ? `stroke: ${normalizedNew}` : match
            )
            if (newStyle !== style) {
              element.setAttribute('style', newStyle)
            }
          }
        }
      }

      updateElementColor(node.element)

      let updatedMarkup = node.customMarkup
      if (updatedMarkup && normalizedOld) {
        updatedMarkup = updatedMarkup.replace(
          new RegExp(`stroke="${normalizedOld}"`, 'gi'),
          `stroke="${normalizedNew}"`
        )
        if (strokeWidth) {
          updatedMarkup = updatedMarkup.replace(
            /stroke-width="[^"]+"/g,
            `stroke-width="${strokeWidth}"`
          )
        }
      }

      let updatedFillColor = node.fillColor
      if (updatedFillColor && normalizeColor(updatedFillColor) === normalizedOld) {
        updatedFillColor = normalizedNew
      }

      return {
        ...node,
        customMarkup: updatedMarkup,
        fillColor: updatedFillColor,
        children: node.children.map(updateNodeColors)
      }
    }

    const updateNodes = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return updateNodeColors(node)
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNodes(node.children) }
        }
        return node
      })
    }

    const updatedNodes = updateNodes(layerNodes)
    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)
  }, [layerNodes, setLayerNodes, rebuildSvgFromLayers])

  const canGroupByColor = useCallback((): boolean => {
    if (selectedNodeIds.size !== 1) return false

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) return false

    const colors = new Set<string>()
    selectedNode.children.forEach(child => {
      const color = getElementColor(child.element)
      if (color) colors.add(color)
    })

    return colors.size > 1
  }, [selectedNodeIds, layerNodes])

  const handleGroupByColor = useCallback(async () => {
    if (selectedNodeIds.size !== 1) return

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) return

    const colorGroups = new Map<string, SVGNode[]>()
    selectedNode.children.forEach(child => {
      const color = getElementColor(child.element) || 'no-color'
      if (!colorGroups.has(color)) {
        colorGroups.set(color, [])
      }
      colorGroups.get(color)!.push(child)
    })

    if (colorGroups.size <= 1) return

    const newChildren: SVGNode[] = []
    colorGroups.forEach((nodes, color) => {
      if (nodes.length === 1) {
        newChildren.push(nodes[0])
      } else {
        const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const groupId = `color-group-${color.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`
        newGroup.setAttribute('id', groupId)

        nodes.forEach(node => {
          newGroup.appendChild(node.element)
        })

        selectedNode.element.appendChild(newGroup)

        const groupNode: SVGNode = {
          id: groupId,
          type: 'g',
          name: `color-${color}`,
          element: newGroup,
          isGroup: true,
          children: nodes
        }

        newChildren.push(groupNode)
      }
    })

    const updatedNodes = updateNodeChildren(layerNodes, selectedId, newChildren)
    setLayerNodes(updatedNodes)
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(updatedNodes)
    setIsProcessing(false)
  }, [selectedNodeIds, layerNodes, setLayerNodes, setSelectedNodeIds, rebuildSvgFromLayers, setIsProcessing])

  return {
    handleColorChange,
    canGroupByColor,
    handleGroupByColor,
  }
}
