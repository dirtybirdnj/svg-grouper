import { useCallback } from 'react'
import { SVGNode } from '../../../../types/svg'
import { findNodeById } from '../../../../utils/nodeUtils'

interface UseGroupOperationsProps {
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string>) => void
  lastSelectedNodeId: string | null
  setLastSelectedNodeId: (id: string | null) => void
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
}

export function useGroupOperations({
  layerNodes,
  setLayerNodes,
  selectedNodeIds,
  setSelectedNodeIds,
  setLastSelectedNodeId,
  rebuildSvgFromLayers,
}: UseGroupOperationsProps) {
  const handleGroupUngroup = useCallback(() => {
    if (selectedNodeIds.size === 1) {
      const selectedId = Array.from(selectedNodeIds)[0]
      const selectedNode = findNodeById(layerNodes, selectedId)

      if (selectedNode?.isGroup && selectedNode.children.length > 0) {
        const ungroupNode = (nodes: SVGNode[], parentId: string): SVGNode[] => {
          const result: SVGNode[] = []

          for (const node of nodes) {
            if (node.id === parentId && node.isGroup) {
              result.push(...node.children)
              const parent = node.element.parentElement
              if (parent) {
                node.children.forEach(child => {
                  parent.insertBefore(child.element, node.element)
                })
                node.element.remove()
              }
            } else {
              if (node.children.length > 0) {
                result.push({ ...node, children: ungroupNode(node.children, parentId) })
              } else {
                result.push(node)
              }
            }
          }

          return result
        }

        const updatedNodes = ungroupNode(layerNodes, selectedId)
        setLayerNodes(updatedNodes)
        setSelectedNodeIds(new Set())
        rebuildSvgFromLayers(updatedNodes)
        return
      }
    }

    if (selectedNodeIds.size > 1) {
      const selectedIds = Array.from(selectedNodeIds)
      const selectedIdSet = new Set(selectedIds)

      const findParentLevel = (nodes: SVGNode[], parentPath: string = ''): { level: SVGNode[], path: string } | null => {
        const selectedAtThisLevel = nodes.filter(n => selectedIdSet.has(n.id))
        if (selectedAtThisLevel.length > 0) {
          return { level: nodes, path: parentPath }
        }

        for (const node of nodes) {
          if (node.children.length > 0) {
            const result = findParentLevel(node.children, `${parentPath}/${node.id}`)
            if (result) return result
          }
        }
        return null
      }

      const levelInfo = findParentLevel(layerNodes)
      if (!levelInfo) return

      const selectedNodes = levelInfo.level.filter(n => selectedIdSet.has(n.id))
      if (selectedNodes.length < 2) return

      const allAtSameLevel = selectedIds.every(id => {
        return levelInfo.level.some(n => n.id === id)
      })
      if (!allAtSameLevel) {
        return
      }

      const groupId = `group-${Date.now()}`
      const newGroupNode: SVGNode = {
        id: groupId,
        type: 'g',
        name: groupId,
        element: document.createElementNS('http://www.w3.org/2000/svg', 'g'),
        isGroup: true,
        children: selectedNodes
      }

      const removeAndGroup = (nodes: SVGNode[]): SVGNode[] => {
        const result: SVGNode[] = []
        let insertedGroup = false

        for (const node of nodes) {
          if (selectedIdSet.has(node.id)) {
            if (!insertedGroup) {
              result.push(newGroupNode)
              insertedGroup = true
            }
          } else {
            if (node.children.length > 0) {
              const newChildren = removeAndGroup(node.children)
              result.push({ ...node, children: newChildren })
            } else {
              result.push(node)
            }
          }
        }

        return result
      }

      const updatedNodes = removeAndGroup(layerNodes)
      setLayerNodes(updatedNodes)
      setSelectedNodeIds(new Set([groupId]))
      setLastSelectedNodeId(groupId)
      rebuildSvgFromLayers(updatedNodes)
    }
  }, [selectedNodeIds, layerNodes, setLayerNodes, setSelectedNodeIds, setLastSelectedNodeId, rebuildSvgFromLayers])

  const canFlipOrder = useCallback((): boolean => {
    if (selectedNodeIds.size > 1) return true
    if (selectedNodeIds.size === 1) {
      const nodeId = Array.from(selectedNodeIds)[0]
      const node = findNodeById(layerNodes, nodeId)
      return node ? node.children.length > 1 : false
    }
    return false
  }, [selectedNodeIds, layerNodes])

  const handleFlipOrder = useCallback(() => {
    if (!canFlipOrder()) return

    if (selectedNodeIds.size === 1) {
      const nodeId = Array.from(selectedNodeIds)[0]

      const flipChildrenOfNode = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.id === nodeId) {
            const reversedChildren = [...node.children].reverse()
            const parent = node.element
            reversedChildren.forEach(child => {
              parent.appendChild(child.element)
            })
            return { ...node, children: reversedChildren }
          }
          if (node.children.length > 0) {
            return { ...node, children: flipChildrenOfNode(node.children) }
          }
          return node
        })
      }

      const updatedNodes = flipChildrenOfNode(layerNodes)
      setLayerNodes(updatedNodes)
      rebuildSvgFromLayers(updatedNodes)
    } else {
      const selectedIds = Array.from(selectedNodeIds)

      const flipSelectedInNodes = (nodes: SVGNode[]): SVGNode[] => {
        const selectedAtThisLevel = nodes.filter(n => selectedIds.includes(n.id))

        if (selectedAtThisLevel.length > 1) {
          const indices = selectedAtThisLevel.map(n => nodes.findIndex(node => node.id === n.id))
          const sorted = [...indices].sort((a, b) => a - b)

          const newNodes = [...nodes]
          for (let i = 0; i < sorted.length; i++) {
            newNodes[sorted[i]] = nodes[sorted[sorted.length - 1 - i]]
          }

          const parent = nodes[0]?.element.parentElement
          if (parent) {
            newNodes.forEach(node => {
              parent.appendChild(node.element)
            })
          }

          return newNodes.map(node => {
            if (node.children.length > 0) {
              return { ...node, children: flipSelectedInNodes(node.children) }
            }
            return node
          })
        }

        return nodes.map(node => {
          if (node.children.length > 0) {
            return { ...node, children: flipSelectedInNodes(node.children) }
          }
          return node
        })
      }

      const updatedNodes = flipSelectedInNodes(layerNodes)
      setLayerNodes(updatedNodes)
      rebuildSvgFromLayers(updatedNodes)
    }
  }, [selectedNodeIds, layerNodes, setLayerNodes, rebuildSvgFromLayers, canFlipOrder])

  return {
    handleGroupUngroup,
    canFlipOrder,
    handleFlipOrder,
  }
}
