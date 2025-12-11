import { useCallback } from 'react'
import { SVGNode } from '../../../../types/svg'
import { findNodeById } from '../../../../utils/nodeUtils'
import { normalizeColor } from '../../../../utils/colorExtractor'
import { getElementType } from '../elementTypeUtils'

interface UseSortOperationsProps {
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string>) => void
  setLastSelectedNodeId: (id: string | null) => void
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
  setIsProcessing: (processing: boolean) => void
  setStatusMessage: (msg: string) => void
  sizeSortAscending: boolean
  sizeSortFilter: 'all' | 'fills' | 'strokes'
  setShowFilterToolbar: (show: boolean) => void
}

export function useSortOperations({
  layerNodes,
  setLayerNodes,
  selectedNodeIds,
  setSelectedNodeIds,
  setLastSelectedNodeId,
  rebuildSvgFromLayers,
  setIsProcessing,
  setStatusMessage,
  sizeSortAscending,
  sizeSortFilter,
  setShowFilterToolbar,
}: UseSortOperationsProps) {

  // Get color from element
  const getColor = useCallback((node: SVGNode): string => {
    if (node.fillColor) return normalizeColor(node.fillColor)

    const element = node.element
    const fill = element.getAttribute('fill')
    const stroke = element.getAttribute('stroke')
    const style = element.getAttribute('style')

    if (style) {
      const fillMatch = style.match(/fill:\s*([^;]+)/)
      const strokeMatch = style.match(/stroke:\s*([^;]+)/)
      if (fillMatch && fillMatch[1] !== 'none') return normalizeColor(fillMatch[1].trim())
      if (strokeMatch && strokeMatch[1] !== 'none') return normalizeColor(strokeMatch[1].trim())
    }

    if (fill && fill !== 'none' && fill !== 'transparent') return normalizeColor(fill)
    if (stroke && stroke !== 'none' && stroke !== 'transparent') return normalizeColor(stroke)

    return '#000000'
  }, [])

  // Calculate bounding box area for an element
  const getElementArea = useCallback((node: SVGNode): number => {
    const element = node.element
    if (!element) return 0

    try {
      if (element instanceof SVGGraphicsElement && typeof element.getBBox === 'function') {
        const bbox = element.getBBox()
        return bbox.width * bbox.height
      }
    } catch {
      // getBBox can throw if element isn't rendered
    }

    if (node.children.length > 0) {
      return node.children.reduce((sum, child) => sum + getElementArea(child), 0)
    }

    const d = element.getAttribute('d')
    if (d) {
      return d.length
    }

    return 0
  }, [])

  // Sort children by color first, then by element type within each color
  const handleSortByType = useCallback(async (e?: React.MouseEvent) => {
    if (selectedNodeIds.size === 0) return

    const shouldGroup = e?.shiftKey ?? false

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    const selectedIds = Array.from(selectedNodeIds)
    let nodesToSort: SVGNode[] = []
    let parentNode: SVGNode | null = null
    let isSortingChildren = false

    if (selectedIds.length === 1) {
      const selectedNode = findNodeById(layerNodes, selectedIds[0])
      if (!selectedNode || selectedNode.children.length === 0) {
        setIsProcessing(false)
        return
      }
      nodesToSort = selectedNode.children
      parentNode = selectedNode
      isSortingChildren = true
    } else {
      const selectedNodes: SVGNode[] = []
      for (const id of selectedIds) {
        const node = findNodeById(layerNodes, id)
        if (node) selectedNodes.push(node)
      }

      if (selectedNodes.length < 2) {
        setIsProcessing(false)
        return
      }

      const findParentOf = (targetId: string, nodes: SVGNode[], parent: SVGNode | null): SVGNode | null => {
        for (const node of nodes) {
          if (node.id === targetId) return parent
          if (node.children.length > 0) {
            const found = findParentOf(targetId, node.children, node)
            if (found !== null) return found
          }
        }
        return null
      }

      const firstParent = findParentOf(selectedIds[0], layerNodes, null)
      let allSameParent = true
      for (let i = 1; i < selectedIds.length; i++) {
        const thisParent = findParentOf(selectedIds[i], layerNodes, null)
        if (thisParent?.id !== firstParent?.id) {
          allSameParent = false
          break
        }
      }

      if (!allSameParent) {
        setStatusMessage('error:Selected nodes must be siblings')
        setIsProcessing(false)
        return
      }

      parentNode = firstParent
      nodesToSort = selectedNodes
      isSortingChildren = false
    }

    // Get element type with better priority
    const getTypeForSort = (node: SVGNode): string => {
      return getElementType(node)
    }

    // Define type order: fills before strokes, then by specific type
    const typeOrder: Record<string, number> = {
      'fill': 0,      // Filled shapes first
      'stroke': 1,    // Stroke paths second
      'group': 2,     // Groups last
    }

    // Group by color first, then sort by type within each color
    const colorGroups = new Map<string, SVGNode[]>()
    nodesToSort.forEach(node => {
      const color = getColor(node)
      if (!colorGroups.has(color)) {
        colorGroups.set(color, [])
      }
      colorGroups.get(color)!.push(node)
    })

    // Sort within each color group by type
    colorGroups.forEach((nodes) => {
      nodes.sort((a, b) => {
        const typeA = getTypeForSort(a)
        const typeB = getTypeForSort(b)
        return (typeOrder[typeA] ?? 99) - (typeOrder[typeB] ?? 99)
      })
    })

    // Flatten back, maintaining color grouping (colors sorted alphabetically)
    const sortedNodes: SVGNode[] = []
    const sortedColors = Array.from(colorGroups.keys()).sort()
    sortedColors.forEach(color => {
      sortedNodes.push(...colorGroups.get(color)!)
    })

    // Apply the sorted order
    let updatedNodes: SVGNode[]

    if (shouldGroup) {
      // Group by type - create subgroups for each type
      const typeGroups = new Map<string, SVGNode[]>()
      sortedNodes.forEach(node => {
        const type = getTypeForSort(node)
        if (!typeGroups.has(type)) {
          typeGroups.set(type, [])
        }
        typeGroups.get(type)!.push(node)
      })

      // Create group nodes for each type
      const newChildren: SVGNode[] = []
      const typeNames: Record<string, string> = {
        'fill': 'Fills',
        'stroke': 'Lines',
        'group': 'Groups',
      }

      typeGroups.forEach((nodes, type) => {
        if (nodes.length === 1) {
          newChildren.push(nodes[0])
        } else {
          const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          const groupId = `type-${type}-${Date.now()}`
          newGroup.setAttribute('id', groupId)

          nodes.forEach(node => {
            newGroup.appendChild(node.element)
          })

          if (parentNode) {
            parentNode.element.appendChild(newGroup)
          }

          const groupNode: SVGNode = {
            id: groupId,
            type: 'g',
            name: typeNames[type] || type,
            element: newGroup,
            isGroup: true,
            children: nodes
          }

          newChildren.push(groupNode)
        }
      })

      // Update the parent node's children
      const updateParent = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.id === parentNode?.id) {
            return { ...node, children: newChildren }
          }
          if (node.children.length > 0) {
            return { ...node, children: updateParent(node.children) }
          }
          return node
        })
      }

      updatedNodes = isSortingChildren ? updateParent(layerNodes) : layerNodes
      setStatusMessage(`Grouped into ${typeGroups.size} type groups`)
    } else {
      // Just sort, don't create new groups
      if (isSortingChildren && parentNode) {
        // Update DOM order
        sortedNodes.forEach(node => {
          parentNode.element.appendChild(node.element)
        })

        // Update tree
        const updateChildren = (nodes: SVGNode[]): SVGNode[] => {
          return nodes.map(node => {
            if (node.id === parentNode?.id) {
              return { ...node, children: sortedNodes }
            }
            if (node.children.length > 0) {
              return { ...node, children: updateChildren(node.children) }
            }
            return node
          })
        }

        updatedNodes = updateChildren(layerNodes)
      } else {
        // Sorting selected nodes within their parent level
        const selectedIdSet = new Set(selectedIds)
        const sortedMap = new Map<string, number>()
        sortedNodes.forEach((node, index) => {
          sortedMap.set(node.id, index)
        })

        const reorderAtLevel = (nodes: SVGNode[]): SVGNode[] => {
          const selectedAtThisLevel = nodes.filter(n => selectedIdSet.has(n.id))
          if (selectedAtThisLevel.length > 1) {
            const indices = selectedAtThisLevel.map(n => nodes.findIndex(node => node.id === n.id))
            const sorted = [...indices].sort((a, b) => a - b)

            // Sort selected nodes by their new order
            const sortedSelected = [...selectedAtThisLevel].sort((a, b) =>
              (sortedMap.get(a.id) ?? 0) - (sortedMap.get(b.id) ?? 0)
            )

            const newNodes = [...nodes]
            for (let i = 0; i < sorted.length; i++) {
              newNodes[sorted[i]] = sortedSelected[i]
            }

            // Update DOM
            const parent = nodes[0]?.element.parentElement
            if (parent) {
              newNodes.forEach(node => parent.appendChild(node.element))
            }

            return newNodes.map(node => {
              if (node.children.length > 0) {
                return { ...node, children: reorderAtLevel(node.children) }
              }
              return node
            })
          }

          return nodes.map(node => {
            if (node.children.length > 0) {
              return { ...node, children: reorderAtLevel(node.children) }
            }
            return node
          })
        }

        updatedNodes = reorderAtLevel(layerNodes)
      }
      setStatusMessage(`Sorted ${sortedNodes.length} items by color and type`)
    }

    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)
    setIsProcessing(false)
  }, [selectedNodeIds, layerNodes, setLayerNodes, rebuildSvgFromLayers, setIsProcessing, setStatusMessage, getColor])

  // Count fills and strokes in the selected node's children
  const getFilterCounts = useCallback((): { fills: number; strokes: number } => {
    if (selectedNodeIds.size !== 1) return { fills: 0, strokes: 0 }

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)
    if (!selectedNode) return { fills: 0, strokes: 0 }

    let fills = 0
    let strokes = 0

    selectedNode.children.forEach(child => {
      const type = getElementType(child)
      if (type === 'fill') fills++
      if (type === 'stroke') strokes++
    })

    return { fills, strokes }
  }, [selectedNodeIds, layerNodes])

  // Get total children count for the selected node
  const getTotalChildrenCount = useCallback((): number => {
    if (selectedNodeIds.size !== 1) return 0

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)
    return selectedNode?.children.length || 0
  }, [selectedNodeIds, layerNodes])

  // Sort children by size (bounding box area)
  const handleSortBySize = useCallback(async (ascendingOverride?: boolean) => {
    if (selectedNodeIds.size !== 1) return

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) {
      setIsProcessing(false)
      return
    }

    const ascending = ascendingOverride !== undefined ? ascendingOverride : sizeSortAscending

    if (sizeSortFilter === 'all') {
      const sortedChildren = [...selectedNode.children].sort((a, b) => {
        const areaA = getElementArea(a)
        const areaB = getElementArea(b)
        return ascending ? areaA - areaB : areaB - areaA
      })

      sortedChildren.forEach(child => {
        selectedNode.element.appendChild(child.element)
      })

      const updateNodeChildren = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.id === selectedId) {
            return { ...node, children: sortedChildren }
          }
          if (node.children.length > 0) {
            return { ...node, children: updateNodeChildren(node.children) }
          }
          return node
        })
      }

      const updatedNodes = updateNodeChildren(layerNodes)
      setLayerNodes(updatedNodes)
      rebuildSvgFromLayers(updatedNodes)
    } else {
      const childrenToExtract: SVGNode[] = []
      const childrenToKeep: SVGNode[] = []

      selectedNode.children.forEach(child => {
        const type = getElementType(child)
        if ((sizeSortFilter === 'fills' && type === 'fill') ||
            (sizeSortFilter === 'strokes' && type === 'stroke')) {
          childrenToExtract.push(child)
        } else {
          childrenToKeep.push(child)
        }
      })

      if (childrenToExtract.length === 0) {
        setStatusMessage(`No ${sizeSortFilter === 'fills' ? 'fills' : 'lines'} found to extract`)
        setIsProcessing(false)
        return
      }

      const sortedExtracted = childrenToExtract.sort((a, b) => {
        const areaA = getElementArea(a)
        const areaB = getElementArea(b)
        return ascending ? areaA - areaB : areaB - areaA
      })

      const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const groupId = `${sizeSortFilter}-${Date.now()}`
      const groupName = sizeSortFilter === 'fills' ? 'Fills' : 'Lines'
      newGroup.setAttribute('id', groupId)

      sortedExtracted.forEach(node => {
        newGroup.appendChild(node.element)
      })

      const parentElement = selectedNode.element.parentElement
      if (parentElement) {
        parentElement.insertBefore(newGroup, selectedNode.element.nextSibling)
      }

      const newGroupNode: SVGNode = {
        id: groupId,
        type: 'g',
        name: `${groupName} (${sortedExtracted.length})`,
        element: newGroup,
        isGroup: true,
        children: sortedExtracted
      }

      const updateNodes = (nodes: SVGNode[]): SVGNode[] => {
        const result: SVGNode[] = []
        for (const node of nodes) {
          if (node.id === selectedId) {
            result.push({ ...node, children: childrenToKeep })
            result.push(newGroupNode)
          } else if (node.children.length > 0) {
            result.push({ ...node, children: updateNodes(node.children) })
          } else {
            result.push(node)
          }
        }
        return result
      }

      const updatedNodes = updateNodes(layerNodes)
      setLayerNodes(updatedNodes)
      setSelectedNodeIds(new Set([groupId]))
      setLastSelectedNodeId(groupId)
      rebuildSvgFromLayers(updatedNodes)
      setStatusMessage(`Extracted ${sortedExtracted.length} ${sizeSortFilter === 'fills' ? 'fills' : 'lines'} into new group`)
      setShowFilterToolbar(false)
    }

    setIsProcessing(false)
  }, [selectedNodeIds, layerNodes, setLayerNodes, setSelectedNodeIds, setLastSelectedNodeId, rebuildSvgFromLayers, setIsProcessing, setStatusMessage, sizeSortAscending, sizeSortFilter, setShowFilterToolbar, getElementArea])

  const canSortBySize = useCallback((): boolean => {
    if (selectedNodeIds.size !== 1) return false

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    return selectedNode !== null && selectedNode.children.length >= 2
  }, [selectedNodeIds, layerNodes])

  return {
    handleSortByType,
    handleSortBySize,
    getFilterCounts,
    getTotalChildrenCount,
    canSortBySize,
  }
}
