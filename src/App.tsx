import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'
import FileUpload from './components/FileUpload'
import SVGCanvas from './components/SVGCanvas'
import LayerTree from './components/LayerTree'
import LoadingOverlay from './components/LoadingOverlay'
import { SVGNode } from './types/svg'
import { parseSVGProgressively } from './utils/svgParser'
import { normalizeColor } from './utils/colorExtractor'

interface LoadingState {
  isLoading: boolean
  progress: number
  status: string
  startTime?: number
  estimatedTimeLeft?: number
}

function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [svgDimensions, setSvgDimensions] = useState<{ width: number; height: number } | null>(null)
  const [layerNodes, setLayerNodes] = useState<SVGNode[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [lastSelectedNodeId, setLastSelectedNodeId] = useState<string | null>(null)
  const [cropAspectRatio, setCropAspectRatio] = useState<'1:2' | '3:4' | '16:9' | '9:16'>('3:4')
  const [cropSize, setCropSize] = useState(0.25) // 0-1 scale relative to SVG smallest dimension (25%)
  const [showCrop, setShowCrop] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    status: '',
  })
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [splitArmed, setSplitArmed] = useState(false)
  const [cropArmed, setCropArmed] = useState(false)
  const [flattenArmed, setFlattenArmed] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [cropProgress, setCropProgress] = useState<{
    current: number
    total: number
    status: string
  } | null>(null)
  const [layerProcessingStates, setLayerProcessingStates] = useState<Record<string, 'pending' | 'processing' | 'complete'>>({})
  const parsingRef = useRef(false)

  const handleLoadStart = useCallback(() => {
    setLoadingState({
      isLoading: true,
      progress: 0,
      status: 'Preparing...',
      startTime: Date.now(),
    })
  }, [])

  const handleProgress = useCallback((progress: number, status: string) => {
    setLoadingState(prev => {
      const elapsed = prev.startTime ? (Date.now() - prev.startTime) / 1000 : 0
      const estimatedTotal = progress > 5 ? (elapsed / progress) * 100 : 0
      const estimatedTimeLeft = progress > 5 ? estimatedTotal - elapsed : undefined

      return {
        ...prev,
        progress,
        status,
        estimatedTimeLeft,
      }
    })
  }, [])

  const handleFileLoad = useCallback((content: string, name: string) => {
    setSvgContent(content)
    setFileName(name)
    setSelectedNodeIds(new Set())
    setLastSelectedNodeId(null)
    parsingRef.current = false // Reset parsing flag
  }, [])

  const handleSVGParsed = useCallback(async (svg: SVGSVGElement) => {
    // Prevent multiple simultaneous parsing attempts
    if (parsingRef.current) {
      return
    }

    parsingRef.current = true
    handleProgress(0, 'Starting to parse SVG...')

    try {
      const nodes = await parseSVGProgressively(svg, handleProgress)
      setLayerNodes(nodes)

      // Get SVG dimensions
      const viewBox = svg.getAttribute('viewBox')
      let width = parseFloat(svg.getAttribute('width') || '0')
      let height = parseFloat(svg.getAttribute('height') || '0')

      if (viewBox && (!width || !height)) {
        const [, , vbWidth, vbHeight] = viewBox.split(' ').map(parseFloat)
        width = vbWidth
        height = vbHeight
      }

      if (width && height) {
        setSvgDimensions({ width, height })
      }

      // Clear loading state after a brief delay
      setTimeout(() => {
        setLoadingState({
          isLoading: false,
          progress: 100,
          status: 'Complete',
        })
      }, 300)
    } catch (error) {
      console.error('Failed to parse SVG:', error)
      setLoadingState({
        isLoading: false,
        progress: 0,
        status: 'Error parsing SVG',
      })
    }
  }, [handleProgress])

  // Disarm delete/split/crop/flatten when user interacts with other features
  const disarmActions = useCallback(() => {
    setDeleteArmed(false)
    setSplitArmed(false)
    setCropArmed(false)
    setFlattenArmed(false)
    setStatusMessage('')
  }, [])

  // Collect all unique colors from the layer tree
  const collectAllColors = useCallback((nodes: SVGNode[]): string[] => {
    const colors = new Set<string>()

    const extractFromElement = (element: Element) => {
      const style = element.getAttribute('style')
      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') colors.add(fillMatch[1].trim())
        if (strokeMatch && strokeMatch[1] !== 'none') colors.add(strokeMatch[1].trim())
      }

      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')

      if (fill && fill !== 'none' && fill !== 'transparent') colors.add(fill)
      if (stroke && stroke !== 'none' && stroke !== 'transparent') colors.add(stroke)
    }

    const traverse = (node: SVGNode) => {
      extractFromElement(node.element)
      node.children.forEach(traverse)
    }

    nodes.forEach(traverse)
    return Array.from(colors)
  }, [])

  const documentColors = collectAllColors(layerNodes)

  const handleNodeSelect = (node: SVGNode, isMultiSelect: boolean, isRangeSelect: boolean) => {
    // Disarm delete/split when clicking on elements
    disarmActions()

    if (isRangeSelect && lastSelectedNodeId) {
      // Find the parent that contains both nodes
      const findParentAndSiblings = (nodes: SVGNode[], targetId1: string, targetId2: string): SVGNode[] | null => {
        // Check if both nodes are in this level
        const hasNode1 = nodes.some(n => n.id === targetId1)
        const hasNode2 = nodes.some(n => n.id === targetId2)

        if (hasNode1 && hasNode2) {
          // Both nodes are siblings, return this level
          return nodes
        }

        // Search children
        for (const n of nodes) {
          if (n.children.length > 0) {
            const result = findParentAndSiblings(n.children, targetId1, targetId2)
            if (result) return result
          }
        }

        return null
      }

      const siblings = findParentAndSiblings(layerNodes, lastSelectedNodeId, node.id)

      if (siblings) {
        // Find indices of both nodes
        const index1 = siblings.findIndex(n => n.id === lastSelectedNodeId)
        const index2 = siblings.findIndex(n => n.id === node.id)

        if (index1 !== -1 && index2 !== -1) {
          // Select all nodes between index1 and index2 (inclusive)
          const start = Math.min(index1, index2)
          const end = Math.max(index1, index2)

          const rangeIds = siblings.slice(start, end + 1).map(n => n.id)
          setSelectedNodeIds(new Set(rangeIds))
          setLastSelectedNodeId(node.id)
          return
        }
      }

      // If range selection failed, fall back to normal selection
      setSelectedNodeIds(new Set([node.id]))
      setLastSelectedNodeId(node.id)
    } else if (isMultiSelect) {
      setSelectedNodeIds(prev => {
        const newSet = new Set(prev)
        if (newSet.has(node.id)) {
          newSet.delete(node.id)
        } else {
          newSet.add(node.id)
        }
        return newSet
      })
      setLastSelectedNodeId(node.id)
    } else {
      setSelectedNodeIds(new Set([node.id]))
      setLastSelectedNodeId(node.id)
    }
  }

  const handleZoomIn = () => {
    setScale(prev => Math.min(10, prev * 1.2))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.1, prev / 1.2))
  }

  const handleFitToScreen = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const handleToggleVisibility = () => {
    const toggleNodeVisibility = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (selectedNodeIds.has(node.id)) {
          const newHiddenState = !node.isHidden

          // Recursively update both DOM and node state
          const updateVisibility = (n: SVGNode, hidden: boolean): SVGNode => {
            // Update DOM element
            if (n.element instanceof SVGElement || n.element instanceof HTMLElement) {
              n.element.style.display = hidden ? 'none' : ''
            }

            // Update node and all children recursively
            return {
              ...n,
              isHidden: hidden,
              children: n.children.map(child => updateVisibility(child, hidden))
            }
          }

          return updateVisibility(node, newHiddenState)
        }
        if (node.children.length > 0) {
          return { ...node, children: toggleNodeVisibility(node.children) }
        }
        return node
      })
    }

    setLayerNodes(toggleNodeVisibility(layerNodes))
  }

  const handleIsolate = () => {
    // Helper to check if a node or any of its ancestors is selected
    const isNodeOrAncestorSelected = (nodeId: string): boolean => {
      return selectedNodeIds.has(nodeId)
    }

    const isolateNodes = (nodes: SVGNode[], parentSelected: boolean): SVGNode[] => {
      return nodes.map(node => {
        const isSelected = selectedNodeIds.has(node.id)
        // Node should be visible if it's selected OR if its parent is selected
        const shouldBeVisible = isSelected || parentSelected

        // Recursively update both DOM and node state
        const updateVisibility = (n: SVGNode, visible: boolean): SVGNode => {
          const hidden = !visible

          // Update DOM element
          if (n.element instanceof SVGElement || n.element instanceof HTMLElement) {
            n.element.style.display = hidden ? 'none' : ''
          }

          // Update node and all children recursively (children inherit parent's visibility)
          return {
            ...n,
            isHidden: hidden,
            children: n.children.map(child => updateVisibility(child, visible))
          }
        }

        const updatedNode = updateVisibility(node, shouldBeVisible)

        // Recursively process children, passing down whether this node is selected
        if (node.children.length > 0) {
          return {
            ...updatedNode,
            children: isolateNodes(node.children, isSelected || parentSelected)
          }
        }

        return updatedNode
      })
    }

    setLayerNodes(isolateNodes(layerNodes, false))
  }

  const handleDeleteNode = () => {
    const deleteNode = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (selectedNodeIds.has(node.id)) {
          // Remove from DOM
          node.element.remove()
          return false
        }
        if (node.children.length > 0) {
          node.children = deleteNode(node.children)
        }
        return true
      })
    }

    setLayerNodes(deleteNode(layerNodes))
    setSelectedNodeIds(new Set())
  }

  const canGroupByColor = (): boolean => {
    if (selectedNodeIds.size !== 1) return false

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNode(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) return false

    // Get colors from all children
    const getElementColor = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') return fillMatch[1].trim()
        if (strokeMatch && strokeMatch[1] !== 'none') return strokeMatch[1].trim()
      }

      if (fill && fill !== 'none' && fill !== 'transparent') return fill
      if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

      return null
    }

    const colors = new Set<string>()
    selectedNode.children.forEach(child => {
      const color = getElementColor(child.element)
      if (color) colors.add(color)
    })

    return colors.size > 1
  }

  const handleGroupByColor = () => {
    if (selectedNodeIds.size !== 1) return

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNode(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) return

    // Get color of an element
    const getElementColor = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') return fillMatch[1].trim()
        if (strokeMatch && strokeMatch[1] !== 'none') return strokeMatch[1].trim()
      }

      if (fill && fill !== 'none' && fill !== 'transparent') return fill
      if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

      return null
    }

    // Group children by color
    const colorGroups = new Map<string, SVGNode[]>()
    selectedNode.children.forEach(child => {
      const color = getElementColor(child.element) || 'no-color'
      if (!colorGroups.has(color)) {
        colorGroups.set(color, [])
      }
      colorGroups.get(color)!.push(child)
    })

    // Only create groups if there are multiple colors
    if (colorGroups.size <= 1) return

    // Create new groups in the DOM and tree
    const newChildren: SVGNode[] = []
    colorGroups.forEach((nodes, color) => {
      if (nodes.length === 1) {
        // Single node, don't group
        newChildren.push(nodes[0])
      } else {
        // Create a new group
        const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const groupId = `color-group-${color.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`
        newGroup.setAttribute('id', groupId)

        // Move elements into the new group
        nodes.forEach(node => {
          newGroup.appendChild(node.element)
        })

        // Insert group into DOM
        selectedNode.element.appendChild(newGroup)

        // Create SVGNode for the group
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

    // Update the selected node's children
    const updateNodeChildren = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (node.id === selectedId) {
          return { ...node, children: newChildren }
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNodeChildren(node.children) }
        }
        return node
      })
    }

    setLayerNodes(updateNodeChildren(layerNodes))
    setSelectedNodeIds(new Set())
  }

  const handleGroupUngroup = () => {
    // Helper to find a node by ID
    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    // If single group selected, ungroup it
    if (selectedNodeIds.size === 1) {
      const selectedId = Array.from(selectedNodeIds)[0]
      const selectedNode = findNode(layerNodes, selectedId)

      if (selectedNode?.isGroup && selectedNode.children.length > 0) {
        // Ungroup: move children to parent level
        const ungroupNode = (nodes: SVGNode[], parentId: string): SVGNode[] => {
          const result: SVGNode[] = []

          for (const node of nodes) {
            if (node.id === parentId && node.isGroup) {
              // Replace this group with its children
              result.push(...node.children)
              // In DOM, move children out of the group
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

        setLayerNodes(ungroupNode(layerNodes, selectedId))
        setSelectedNodeIds(new Set())
        return
      }
    }

    // If multiple nodes selected, group them
    if (selectedNodeIds.size > 1) {
      const selectedIds = Array.from(selectedNodeIds)

      // Collect all selected nodes
      const collectSelectedNodes = (nodes: SVGNode[]): SVGNode[] => {
        const selected: SVGNode[] = []
        for (const node of nodes) {
          if (selectedIds.includes(node.id)) {
            selected.push(node)
          }
          if (node.children.length > 0) {
            selected.push(...collectSelectedNodes(node.children))
          }
        }
        return selected
      }

      const selectedNodes = collectSelectedNodes(layerNodes)
      if (selectedNodes.length < 2) return

      // Find the common parent in the DOM
      const firstElement = selectedNodes[0].element
      let commonParent = firstElement.parentElement

      // Verify all selected elements share this parent
      const allSameParent = selectedNodes.every(n => n.element.parentElement === commonParent)

      if (!allSameParent || !commonParent) {
        // Can't group nodes from different parents
        return
      }

      // Create a new group element in DOM
      const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const groupId = `group-${Date.now()}`
      newGroup.setAttribute('id', groupId)

      // Find a reference node that won't be moved (next sibling that's not selected)
      let referenceNode: Node | null = firstElement.nextSibling
      const selectedElements = new Set(selectedNodes.map(n => n.element))

      while (referenceNode && selectedElements.has(referenceNode as Element)) {
        referenceNode = referenceNode.nextSibling
      }

      // Move selected elements into the new group
      selectedNodes.forEach(node => {
        newGroup.appendChild(node.element)
      })

      // Insert the group before the reference node (or at the end if no reference)
      if (referenceNode) {
        commonParent.insertBefore(newGroup, referenceNode)
      } else {
        commonParent.appendChild(newGroup)
      }

      // Create new SVGNode for the group
      const newGroupNode: SVGNode = {
        id: groupId,
        type: 'g',
        name: groupId,
        element: newGroup,
        isGroup: true,
        children: selectedNodes
      }

      // Remove selected nodes from tree and add the new group
      const removeAndGroup = (nodes: SVGNode[]): SVGNode[] => {
        const result: SVGNode[] = []
        let insertedGroup = false

        for (const node of nodes) {
          if (selectedIds.includes(node.id)) {
            // Insert group at the position of the first selected node
            if (!insertedGroup) {
              result.push(newGroupNode)
              insertedGroup = true
            }
            // Skip this node as it's now part of the group
          } else {
            // Keep this node, but check its children
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

      setLayerNodes(removeAndGroup(layerNodes))
      setSelectedNodeIds(new Set())
    }
  }

  const handleSave = () => {
    if (!svgContent) return

    // Get the current SVG element from the DOM
    const svgElement = document.querySelector('.canvas-content svg')
    if (!svgElement) return

    // Serialize the SVG to string
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgElement)

    // Create a blob and download
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || 'edited.svg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const canFlatten = (): boolean => {
    if (selectedNodeIds.size !== 1) return false

    const selectedId = Array.from(selectedNodeIds)[0]
    const findNode = (nodes: SVGNode[]): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === selectedId) return node
        const found = findNode(node.children)
        if (found) return found
      }
      return null
    }

    const selectedNode = findNode(layerNodes)
    if (!selectedNode || !selectedNode.isGroup) return false

    // Check if all children have the same color
    const colors = new Set<string>()
    const collectColors = (node: SVGNode) => {
      const style = node.element.getAttribute('style') || ''
      const fill = node.element.getAttribute('fill') || ''

      let color = fill
      if (style.includes('fill:')) {
        const match = style.match(/fill:\s*([^;]+)/)
        if (match) color = match[1].trim()
      }

      if (color && color !== 'none') {
        colors.add(color)
      }

      node.children.forEach(collectColors)
    }

    selectedNode.children.forEach(collectColors)

    return colors.size === 1
  }

  const handleFlatten = async () => {
    if (!canFlatten() || !window.electron?.flattenShapes) {
      alert('Flatten is not available. Select a group with all children of the same color.')
      return
    }

    const selectedId = Array.from(selectedNodeIds)[0]
    const findNode = (nodes: SVGNode[]): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === selectedId) return node
        const found = findNode(node.children)
        if (found) return found
      }
      return null
    }

    const selectedNode = findNode(layerNodes)
    if (!selectedNode) return

    // Get the color
    let color = ''
    const findColor = (node: SVGNode): string => {
      const style = node.element.getAttribute('style') || ''
      const fill = node.element.getAttribute('fill') || ''

      let c = fill
      if (style.includes('fill:')) {
        const match = style.match(/fill:\s*([^;]+)/)
        if (match) c = match[1].trim()
      }

      if (c && c !== 'none') return c

      for (const child of node.children) {
        const childColor = findColor(child)
        if (childColor) return childColor
      }

      return ''
    }

    color = findColor(selectedNode)

    if (!color) {
      alert('Could not determine color of shapes.')
      return
    }

    const confirmed = confirm(
      `This will merge all touching shapes of color ${color} in group "${selectedNode.name}".\n\n` +
      `Continue?`
    )

    if (!confirmed) return

    try {
      // Get the parent SVG to maintain document structure
      const svgElement = document.querySelector('.canvas-content svg')
      if (!svgElement) {
        throw new Error('SVG element not found')
      }

      // Wrap the selected group in a complete SVG document
      const groupSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgDimensions?.width || 1000}" height="${svgDimensions?.height || 1000}" viewBox="0 0 ${svgDimensions?.width || 1000} ${svgDimensions?.height || 1000}">
  ${selectedNode.element.outerHTML}
</svg>`

      console.log(`Flattening group "${selectedNode.name}" with color: ${color}`)

      const flattenedSVG = await window.electron.flattenShapes({
        svg: groupSVG,
        color: color
      })

      // Parse the flattened SVG
      const parser = new DOMParser()
      const doc = parser.parseFromString(flattenedSVG, 'image/svg+xml')
      const flattenedGroup = doc.querySelector('g')

      if (!flattenedGroup) {
        throw new Error('Failed to parse flattened SVG')
      }

      // Replace the element in DOM
      const parent = selectedNode.element.parentElement
      if (parent) {
        const importedGroup = document.importNode(flattenedGroup, true)
        parent.replaceChild(importedGroup, selectedNode.element)
        selectedNode.element = importedGroup as SVGGElement

        // Update the canvas
        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svgElement)
        setSvgContent(svgString)

        // Refresh layer tree
        setLayerNodes([...layerNodes])

        alert('Shapes flattened successfully!')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Flatten failed: ${message}`)
      console.error('Flatten error:', error)
    }
  }

  const getCropDimensions = (): { width: number; height: number } => {
    if (!svgDimensions) return { width: 0, height: 0 }

    // Calculate dimensions based on aspect ratio and size
    const [w, h] = cropAspectRatio.split(':').map(Number)
    const aspectRatio = w / h

    // Base size on smallest SVG dimension (PURE SVG COORDINATES, NO VIEWPORT SCALING)
    const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
    const baseSize = minDimension * cropSize

    // Calculate width and height maintaining aspect ratio
    let width: number
    let height: number

    if (aspectRatio >= 1) {
      // Landscape or square
      width = baseSize
      height = baseSize / aspectRatio
    } else {
      // Portrait
      height = baseSize
      width = baseSize * aspectRatio
    }

    return { width, height }
  }

  const rotateCropAspectRatio = () => {
    const [w, h] = cropAspectRatio.split(':')
    setCropAspectRatio(`${h}:${w}` as '1:2' | '3:4' | '16:9' | '9:16')
  }

  const handleCrop = async () => {
    if (!svgDimensions) {
      setStatusMessage('Cropping is not available.')
      return
    }

    // Get crop dimensions in SVG coordinates
    const { width: cropW, height: cropH } = getCropDimensions()

    // Crop is centered in the SVG (not viewport)
    const svgCenterX = svgDimensions.width / 2
    const svgCenterY = svgDimensions.height / 2

    // Crop area top-left corner
    const cropX = svgCenterX - (cropW / 2)
    const cropY = svgCenterY - (cropH / 2)

    console.log(`Crop dimensions: ${cropW}×${cropH}`)
    console.log(`Crop position: (${cropX}, ${cropY})`)

    // TODO: Implement crop logic
  }

  const handleFlattenAll = () => {
    if (!flattenArmed) {
      // First click - arm the flatten action
      setFlattenArmed(true)
      setDeleteArmed(false)
      setSplitArmed(false)
      setCropArmed(false)
      setStatusMessage('Click Flatten again to confirm')
      return
    }

    // Second click - execute flatten
    setFlattenArmed(false)
    setStatusMessage('')

    // Helper to get color from an element
    const getElementColor = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') return fillMatch[1].trim()
        if (strokeMatch && strokeMatch[1] !== 'none') return strokeMatch[1].trim()
      }

      if (fill && fill !== 'none' && fill !== 'transparent') return fill
      if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

      return null
    }

    // Step 1: Delete empty layers (groups with no children)
    const deleteEmptyLayers = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (node.isGroup && node.children.length === 0) {
          // Remove empty group from DOM
          node.element.remove()
          return false
        }
        if (node.children.length > 0) {
          node.children = deleteEmptyLayers(node.children)
          // Check again after processing children
          if (node.isGroup && node.children.length === 0) {
            node.element.remove()
            return false
          }
        }
        return true
      })
    }

    // Step 2: Recursively ungroup all groups until only paths remain
    const ungroupAll = (nodes: SVGNode[]): SVGNode[] => {
      let result: SVGNode[] = []

      for (const node of nodes) {
        if (node.isGroup && node.children.length > 0) {
          // Move children out of this group in the DOM
          const parent = node.element.parentElement
          if (parent) {
            // First recursively ungroup children
            const ungroupedChildren = ungroupAll(node.children)

            // Move each child to the parent
            for (const child of ungroupedChildren) {
              parent.insertBefore(child.element, node.element)
              result.push(child)
            }

            // Remove the now-empty group
            node.element.remove()
          }
        } else if (!node.isGroup) {
          // It's a path or other non-group element, keep it
          result.push(node)
        }
      }

      return result
    }

    // Step 3: Group by color (similar to handleGroupByColor but operates on root level)
    const groupByColor = (nodes: SVGNode[]): SVGNode[] => {
      // Group children by color
      const colorGroups = new Map<string, SVGNode[]>()
      nodes.forEach(node => {
        const color = getElementColor(node.element) || 'no-color'
        if (!colorGroups.has(color)) {
          colorGroups.set(color, [])
        }
        colorGroups.get(color)!.push(node)
      })

      // If only one color or no colors, no grouping needed
      if (colorGroups.size <= 1) return nodes

      // Get the SVG element to append groups to
      const svgElement = document.querySelector('.canvas-content svg')
      if (!svgElement) return nodes

      // Create new groups
      const newNodes: SVGNode[] = []
      colorGroups.forEach((groupNodes, color) => {
        if (groupNodes.length === 1) {
          // Single node, don't group
          newNodes.push(groupNodes[0])
        } else {
          // Create a new group
          const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          const groupId = `color-group-${color.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          newGroup.setAttribute('id', groupId)

          // Move elements into the new group
          groupNodes.forEach(node => {
            newGroup.appendChild(node.element)
          })

          // Append group to SVG
          svgElement.appendChild(newGroup)

          // Create SVGNode for the group
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

    // Execute the flatten operation
    let processedNodes = [...layerNodes]

    // Step 1: Delete empty layers
    processedNodes = deleteEmptyLayers(processedNodes)

    // Step 2: Ungroup all groups recursively
    processedNodes = ungroupAll(processedNodes)

    // Step 3: Group by color
    processedNodes = groupByColor(processedNodes)

    setLayerNodes(processedNodes)
    setSelectedNodeIds(new Set())
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(250, Math.min(600, e.clientX))
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Disarm when crop or zoom changes
  useEffect(() => {
    disarmActions()
  }, [showCrop, scale, offset, disarmActions])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Escape key disarms
      if (e.key === 'Escape') {
        disarmActions()
        return
      }

      // Don't trigger if no nodes are selected (except for some keys)
      const hasSelection = selectedNodeIds.size > 0

      switch (e.key.toLowerCase()) {
        case 'v':
          if (hasSelection) {
            e.preventDefault()
            handleToggleVisibility()
            disarmActions()
          }
          break
        case 'i':
          if (hasSelection) {
            e.preventDefault()
            handleIsolate()
            disarmActions()
          }
          break
        case 'd':
          if (hasSelection) {
            e.preventDefault()
            if (deleteArmed) {
              // Second press - execute delete
              handleDeleteNode()
              setDeleteArmed(false)
            } else {
              // First press - arm delete
              setDeleteArmed(true)
              setSplitArmed(false)
            }
          }
          break
        case 'g':
          if (hasSelection) {
            e.preventDefault()
            // Check if it's a split (single group selected)
            if (selectedNodeIds.size === 1) {
              const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
                for (const node of nodes) {
                  if (node.id === id) return node
                  const found = findNode(node.children, id)
                  if (found) return found
                }
                return null
              }
              const selectedId = Array.from(selectedNodeIds)[0]
              const selectedNode = findNode(layerNodes, selectedId)

              if (selectedNode?.isGroup && selectedNode.children.length > 0) {
                // This is a split - use armed logic
                if (splitArmed) {
                  // Second press - execute split
                  handleGroupUngroup()
                  setSplitArmed(false)
                } else {
                  // First press - arm split
                  setSplitArmed(true)
                  setDeleteArmed(false)
                }
              } else {
                // Not a group, do nothing
              }
            } else {
              // Multiple selected - group immediately (no arming)
              handleGroupUngroup()
              disarmActions()
            }
          }
          break
        case 'p':
          if (canGroupByColor()) {
            e.preventDefault()
            handleGroupByColor()
            disarmActions()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNodeIds, layerNodes, deleteArmed, splitArmed, disarmActions])

  return (
    <div className="app">
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <h2>Layers</h2>
          <div className="sidebar-actions">
            <button
              className="action-button"
              onClick={handleFlatten}
              disabled={!canFlatten()}
              title="Flatten - Merge touching shapes of same color"
            >
              🥞
            </button>
            <button
              className="action-button"
              onClick={handleGroupByColor}
              disabled={!canGroupByColor()}
              title="Group by Color (P)"
            >
              🎨
            </button>
            <button
              className="action-button group-button"
              onClick={handleGroupUngroup}
              disabled={selectedNodeIds.size === 0}
              style={{
                background: splitArmed ? '#e74c3c' : undefined,
                color: splitArmed ? 'white' : undefined,
              }}
              title={
                (selectedNodeIds.size === 1 &&
                Array.from(selectedNodeIds).some(id => {
                  const findNode = (nodes: SVGNode[]): SVGNode | null => {
                    for (const node of nodes) {
                      if (node.id === id) return node
                      const found = findNode(node.children)
                      if (found) return found
                    }
                    return null
                  }
                  const node = findNode(layerNodes)
                  return node?.isGroup
                })
                  ? "Ungroup (G) - Press again to confirm"
                  : "Group (G)")
              }
            >
              G
            </button>
            <button
              className="action-button"
              onClick={handleToggleVisibility}
              disabled={selectedNodeIds.size === 0}
              title="Toggle Visibility (V)"
            >
              👁
            </button>
            <button
              className="action-button delete"
              onClick={handleDeleteNode}
              disabled={selectedNodeIds.size === 0}
              style={{
                background: deleteArmed ? '#e74c3c' : undefined,
              }}
              title={deleteArmed ? "Delete (D) - Press again to confirm" : "Delete (D)"}
            >
              🗑
            </button>
          </div>
        </div>
        <div className="sidebar-content">
          {!svgContent ? (
            <p style={{ padding: '1rem', color: '#999', fontSize: '0.9rem' }}>
              Upload an SVG to see layers
            </p>
          ) : (
            <LayerTree
              nodes={layerNodes}
              selectedNodeIds={selectedNodeIds}
              onNodeSelect={handleNodeSelect}
              processingStates={layerProcessingStates}
            />
          )}
        </div>
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeMouseDown}
        />
      </aside>

      <main className="main-panel">
        <div className="main-header">
          {svgContent && (
            <>
              {documentColors.length > 0 && (
                <div className="colors-display">
                  {documentColors.map((color, index) => (
                    <span
                      key={index}
                      className="color-swatch"
                      style={{
                        backgroundColor: normalizeColor(color),
                      }}
                      title={color}
                    />
                  ))}
                </div>
              )}
              <div className="header-controls">
              <div className="crop-controls">
                {showCrop && (
                  <>
                    <label style={{ fontSize: '0.85rem', color: '#666', marginRight: '0.5rem' }}>
                      Size: {Math.round(cropSize * 100)}%
                    </label>
                    <input
                      type="range"
                      min="25"
                      max="100"
                      value={cropSize * 100}
                      onChange={(e) => setCropSize(Number(e.target.value) / 100)}
                      style={{ width: '120px' }}
                      className="crop-size-slider"
                    />
                    <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.5rem', marginRight: '0.25rem' }}>
                      {(getCropDimensions().width / 96).toFixed(1)} × {(getCropDimensions().height / 96).toFixed(1)} in • {getCropDimensions().width.toFixed(0)} × {getCropDimensions().height.toFixed(0)} px
                    </span>
                    <button
                      className="crop-toggle-button"
                      onClick={() => setCropAspectRatio('1:2')}
                      title="Aspect Ratio 1:2"
                      style={{
                        background: cropAspectRatio === '1:2' ? '#4a90e2' : 'white',
                        color: cropAspectRatio === '1:2' ? 'white' : 'inherit',
                        width: 'auto',
                        padding: '0 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      1:2
                    </button>
                    <button
                      className="crop-toggle-button"
                      onClick={() => setCropAspectRatio('3:4')}
                      title="Aspect Ratio 3:4"
                      style={{
                        background: cropAspectRatio === '3:4' ? '#4a90e2' : 'white',
                        color: cropAspectRatio === '3:4' ? 'white' : 'inherit',
                        width: 'auto',
                        padding: '0 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      3:4
                    </button>
                    <button
                      className="crop-toggle-button"
                      onClick={() => setCropAspectRatio('16:9')}
                      title="Aspect Ratio 16:9"
                      style={{
                        background: cropAspectRatio === '16:9' ? '#4a90e2' : 'white',
                        color: cropAspectRatio === '16:9' ? 'white' : 'inherit',
                        width: 'auto',
                        padding: '0 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      16:9
                    </button>
                    <button
                      className="crop-toggle-button"
                      onClick={() => setCropAspectRatio('9:16')}
                      title="Aspect Ratio 9:16"
                      style={{
                        background: cropAspectRatio === '9:16' ? '#4a90e2' : 'white',
                        color: cropAspectRatio === '9:16' ? 'white' : 'inherit',
                        width: 'auto',
                        padding: '0 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      9:16
                    </button>
                    <button
                      className="crop-toggle-button"
                      onClick={rotateCropAspectRatio}
                      title="Rotate Aspect Ratio 90°"
                      style={{
                        background: '#8e44ad',
                        color: 'white'
                      }}
                    >
                      ↻
                    </button>
                  </>
                )}
                <button
                  className="crop-toggle-button"
                  onClick={() => setShowCrop(!showCrop)}
                  title={showCrop ? "Hide Crop" : "Show Crop"}
                  style={{
                    background: showCrop ? '#e74c3c' : '#e67e22',
                    color: 'white'
                  }}
                >
                  {showCrop ? '✕' : '◯'}
                </button>
              </div>
              <button
                onClick={handleFlattenAll}
                className="save-button"
                title={flattenArmed ? "Click again to confirm flatten" : "Flatten: Remove empty layers, ungroup all, group by color"}
                style={{
                  background: flattenArmed ? '#e67e22' : '#3498db',
                  borderColor: flattenArmed ? '#e67e22' : '#3498db',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🗄️ Flatten
              </button>
              {showCrop && (
                <button
                  onClick={handleCrop}
                  className="save-button"
                  title={cropArmed ? "Click again to confirm crop" : "Crop all groups"}
                  disabled={!!cropProgress}
                  style={{
                    background: cropProgress ? '#95a5a6' : cropArmed ? '#e67e22' : '#27ae60',
                    borderColor: cropProgress ? '#95a5a6' : cropArmed ? '#e67e22' : '#27ae60',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {cropProgress && (
                    <span className="spinner" style={{
                      width: '12px',
                      height: '12px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                  )}
                  {cropProgress ? `${cropProgress.current}/${cropProgress.total}` : 'Crop'}
                </button>
              )}
              <button onClick={handleSave} className="save-button" title="Save SVG">
                Save
              </button>
              <div className="zoom-controls">
                <button onClick={handleZoomIn} title="Zoom In">+</button>
                <button onClick={handleZoomOut} title="Zoom Out">-</button>
                <button onClick={handleFitToScreen} title="Fit to Screen">Fit</button>
                <span className="zoom-level">{Math.round(scale * 100)}%</span>
              </div>
            </div>
              </>
          )}
        </div>
        <div className="canvas-container">
          {!svgContent ? (
            <FileUpload
              onFileLoad={handleFileLoad}
              onLoadStart={handleLoadStart}
              onProgress={handleProgress}
            />
          ) : (
            <SVGCanvas
              svgContent={svgContent}
              onSVGParsed={handleSVGParsed}
              scale={scale}
              onScaleChange={setScale}
              offset={offset}
              onOffsetChange={setOffset}
              showCrop={showCrop}
              cropAspectRatio={cropAspectRatio}
              cropSize={cropSize}
              svgDimensions={svgDimensions}
              onCropResize={(newSize: number) => {
                setCropSize(newSize)
              }}
            />
          )}

          {loadingState.isLoading && (
            <LoadingOverlay
              progress={loadingState.progress}
              status={loadingState.status}
              estimatedTimeLeft={loadingState.estimatedTimeLeft}
            />
          )}
        </div>
      </main>

      {(statusMessage || fileName) && (
        <div className="status-bar">
          {statusMessage ? (
            statusMessage
          ) : (
            fileName && (
              <>
                <span className="status-filename">{fileName}</span>
                {svgDimensions && (
                  <span className="status-dimensions">
                    {' • '}
                    {svgDimensions.width} × {svgDimensions.height} px
                    {' • '}
                    {(svgDimensions.width / 96).toFixed(2)} × {(svgDimensions.height / 96).toFixed(2)} in
                    {' • '}
                    {(svgDimensions.width / 37.8).toFixed(2)} × {(svgDimensions.height / 37.8).toFixed(2)} cm
                  </span>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default App
