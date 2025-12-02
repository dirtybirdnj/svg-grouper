import { useCallback } from 'react'
import { SVGNode } from '../types/svg'

interface UseArrangeToolsProps {
  selectedNodeIds: Set<string>
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  rebuildSvgFromLayers: (nodes: SVGNode[]) => void
}

interface ArrangeResult {
  nodes: SVGNode[]
  moved: boolean
}

/**
 * Hook for layer arrangement operations (move up/down, bring to front/back)
 * Extracted from SortTab to reduce file size and improve modularity
 */
export function useArrangeTools({
  selectedNodeIds,
  layerNodes,
  setLayerNodes,
  rebuildSvgFromLayers,
}: UseArrangeToolsProps) {

  // Helper to apply movement result
  const applyResult = useCallback((result: ArrangeResult) => {
    if (result.moved) {
      setLayerNodes(result.nodes)
      rebuildSvgFromLayers(result.nodes)
    }
  }, [setLayerNodes, rebuildSvgFromLayers])

  // Move selected node up in the tree (earlier in render order = lower z-index)
  const handleMoveUp = useCallback(() => {
    if (selectedNodeIds.size !== 1) return
    const selectedId = Array.from(selectedNodeIds)[0]

    const moveInArray = (nodes: SVGNode[]): ArrangeResult => {
      const idx = nodes.findIndex(n => n.id === selectedId)
      if (idx > 0) {
        // Swap with previous sibling
        const newNodes = [...nodes]
        const temp = newNodes[idx - 1]
        newNodes[idx - 1] = newNodes[idx]
        newNodes[idx] = temp
        return { nodes: newNodes, moved: true }
      }
      // Check children
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].children.length > 0) {
          const result = moveInArray(nodes[i].children)
          if (result.moved) {
            const newNodes = [...nodes]
            newNodes[i] = { ...nodes[i], children: result.nodes }
            return { nodes: newNodes, moved: true }
          }
        }
      }
      return { nodes, moved: false }
    }

    applyResult(moveInArray(layerNodes))
  }, [selectedNodeIds, layerNodes, applyResult])

  // Move selected node down in the tree (later in render order = higher z-index)
  const handleMoveDown = useCallback(() => {
    if (selectedNodeIds.size !== 1) return
    const selectedId = Array.from(selectedNodeIds)[0]

    const moveInArray = (nodes: SVGNode[]): ArrangeResult => {
      const idx = nodes.findIndex(n => n.id === selectedId)
      if (idx >= 0 && idx < nodes.length - 1) {
        // Swap with next sibling
        const newNodes = [...nodes]
        const temp = newNodes[idx + 1]
        newNodes[idx + 1] = newNodes[idx]
        newNodes[idx] = temp
        return { nodes: newNodes, moved: true }
      }
      // Check children
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].children.length > 0) {
          const result = moveInArray(nodes[i].children)
          if (result.moved) {
            const newNodes = [...nodes]
            newNodes[i] = { ...nodes[i], children: result.nodes }
            return { nodes: newNodes, moved: true }
          }
        }
      }
      return { nodes, moved: false }
    }

    applyResult(moveInArray(layerNodes))
  }, [selectedNodeIds, layerNodes, applyResult])

  // Bring selected node to front (last in render order = highest z-index)
  const handleBringToFront = useCallback(() => {
    if (selectedNodeIds.size !== 1) return
    const selectedId = Array.from(selectedNodeIds)[0]

    const bringToFront = (nodes: SVGNode[]): ArrangeResult => {
      const idx = nodes.findIndex(n => n.id === selectedId)
      if (idx >= 0 && idx < nodes.length - 1) {
        // Move to end
        const newNodes = nodes.filter(n => n.id !== selectedId)
        newNodes.push(nodes[idx])
        return { nodes: newNodes, moved: true }
      }
      // Check children
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].children.length > 0) {
          const result = bringToFront(nodes[i].children)
          if (result.moved) {
            const newNodes = [...nodes]
            newNodes[i] = { ...nodes[i], children: result.nodes }
            return { nodes: newNodes, moved: true }
          }
        }
      }
      return { nodes, moved: false }
    }

    applyResult(bringToFront(layerNodes))
  }, [selectedNodeIds, layerNodes, applyResult])

  // Send selected node to back (first in render order = lowest z-index)
  const handleSendToBack = useCallback(() => {
    if (selectedNodeIds.size !== 1) return
    const selectedId = Array.from(selectedNodeIds)[0]

    const sendToBack = (nodes: SVGNode[]): ArrangeResult => {
      const idx = nodes.findIndex(n => n.id === selectedId)
      if (idx > 0) {
        // Move to beginning
        const newNodes = nodes.filter(n => n.id !== selectedId)
        newNodes.unshift(nodes[idx])
        return { nodes: newNodes, moved: true }
      }
      // Check children
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].children.length > 0) {
          const result = sendToBack(nodes[i].children)
          if (result.moved) {
            const newNodes = [...nodes]
            newNodes[i] = { ...nodes[i], children: result.nodes }
            return { nodes: newNodes, moved: true }
          }
        }
      }
      return { nodes, moved: false }
    }

    applyResult(sendToBack(layerNodes))
  }, [selectedNodeIds, layerNodes, applyResult])

  return {
    handleMoveUp,
    handleMoveDown,
    handleBringToFront,
    handleSendToBack,
  }
}
