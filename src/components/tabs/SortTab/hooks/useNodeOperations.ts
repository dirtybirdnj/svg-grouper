import { useCallback } from 'react'
import { SVGNode } from '../../../../types/svg'
import {
  findNodeById,
  updateVisibilityForSelected,
  showAllNodes,
  isolateNodes,
  removeNodeById,
  insertNodeAtPosition,
  isDescendant,
} from '../../../../utils/nodeUtils'

interface UseNodeOperationsProps {
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string>) => void
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
  isIsolated: boolean
  setIsIsolated: (isolated: boolean) => void
}

export function useNodeOperations({
  layerNodes,
  setLayerNodes,
  selectedNodeIds,
  setSelectedNodeIds,
  rebuildSvgFromLayers,
  isIsolated,
  setIsIsolated,
}: UseNodeOperationsProps) {
  const handleToggleVisibility = useCallback(() => {
    const firstSelectedId = Array.from(selectedNodeIds)[0]
    if (!firstSelectedId) return

    const firstSelected = findNodeById(layerNodes, firstSelectedId)
    if (!firstSelected) return

    const targetHiddenState = !firstSelected.isHidden

    const updatedNodes = updateVisibilityForSelected(layerNodes, selectedNodeIds, targetHiddenState)
    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)
  }, [layerNodes, selectedNodeIds, setLayerNodes, rebuildSvgFromLayers])

  const handleIsolate = useCallback(() => {
    if (isIsolated) {
      const updatedNodes = showAllNodes(layerNodes)
      setLayerNodes(updatedNodes)
      setIsIsolated(false)
      rebuildSvgFromLayers(updatedNodes)
    } else {
      const updatedNodes = isolateNodes(layerNodes, selectedNodeIds)
      setLayerNodes(updatedNodes)
      setIsIsolated(true)
      rebuildSvgFromLayers(updatedNodes)
    }
  }, [isIsolated, layerNodes, selectedNodeIds, setLayerNodes, setIsIsolated, rebuildSvgFromLayers])

  const handleDeleteNode = useCallback(() => {
    const deleteNode = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (selectedNodeIds.has(node.id)) {
          return false
        }
        if (node.children.length > 0) {
          return { ...node, children: deleteNode(node.children) }
        }
        return true
      }).map(node => {
        if (node.children && node.children.length > 0) {
          return { ...node, children: deleteNode(node.children) }
        }
        return node
      })
    }

    const updatedNodes = deleteNode(layerNodes)
    setLayerNodes(updatedNodes)

    if (updatedNodes.length === 1) {
      setSelectedNodeIds(new Set([updatedNodes[0].id]))
    } else {
      setSelectedNodeIds(new Set())
    }

    rebuildSvgFromLayers(updatedNodes)
  }, [layerNodes, selectedNodeIds, setLayerNodes, setSelectedNodeIds, rebuildSvgFromLayers])

  const handleReorder = useCallback((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    const draggedNode = findNodeById(layerNodes, draggedId)
    const targetNode = findNodeById(layerNodes, targetId)

    if (!draggedNode || !targetNode) return

    if (isDescendant(draggedNode, targetId)) return

    let newNodes = removeNodeById(layerNodes, draggedId)
    newNodes = insertNodeAtPosition(newNodes, targetId, draggedNode, position)

    const draggedElement = draggedNode.element
    const targetElement = targetNode.element

    if (position === 'before') {
      targetElement.parentElement?.insertBefore(draggedElement, targetElement)
    } else if (position === 'after') {
      targetElement.parentElement?.insertBefore(draggedElement, targetElement.nextSibling)
    } else if (position === 'inside') {
      targetElement.insertBefore(draggedElement, targetElement.firstChild)
    }

    setLayerNodes(newNodes)
    rebuildSvgFromLayers(newNodes)
  }, [layerNodes, setLayerNodes, rebuildSvgFromLayers])

  return {
    handleToggleVisibility,
    handleIsolate,
    handleDeleteNode,
    handleReorder,
  }
}
