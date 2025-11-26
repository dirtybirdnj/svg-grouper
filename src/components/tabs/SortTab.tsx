import { useState, useCallback, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import FileUpload from '../FileUpload'
import SVGCanvas from '../SVGCanvas'
import LayerTree from '../LayerTree'
import LoadingOverlay from '../LoadingOverlay'
import { SVGNode } from '../../types/svg'
import { parseSVGProgressively } from '../../utils/svgParser'
import { normalizeColor } from '../../utils/colorExtractor'
import './SortTab.css'

export default function SortTab() {
  const {
    svgContent,
    setSvgContent,
    fileName,
    setFileName,
    svgDimensions,
    setSvgDimensions,
    layerNodes,
    setLayerNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    lastSelectedNodeId,
    setLastSelectedNodeId,
    loadingState,
    setLoadingState,
    handleLoadStart,
    handleProgress,
    parsingRef,
    scale,
    setScale,
    offset,
    setOffset,
    showCrop,
    cropAspectRatio,
    setCropAspectRatio,
    cropSize,
    setCropSize,
    statusMessage,
    syncSvgContent,
  } = useAppContext()

  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [splitArmed, setSplitArmed] = useState(false)
  const [layerProcessingStates] = useState<Record<string, 'pending' | 'processing' | 'complete'>>({})
  const [isIsolated, setIsIsolated] = useState(false)

  const handleFileLoad = useCallback((content: string, name: string) => {
    setSvgContent(content)
    setFileName(name)
    setSelectedNodeIds(new Set())
    setLastSelectedNodeId(null)
    parsingRef.current = false
  }, [setSvgContent, setFileName, setSelectedNodeIds, setLastSelectedNodeId, parsingRef])

  const handleSVGParsed = useCallback(async (svg: SVGSVGElement) => {
    if (parsingRef.current) {
      return
    }

    parsingRef.current = true
    handleProgress(0, 'Starting to parse SVG...')

    try {
      const nodes = await parseSVGProgressively(svg, handleProgress)
      setLayerNodes(nodes)

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
  }, [handleProgress, setLayerNodes, setSvgDimensions, setLoadingState, parsingRef])

  const disarmActions = useCallback(() => {
    setDeleteArmed(false)
    setSplitArmed(false)
  }, [])

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
    disarmActions()

    if (isRangeSelect && lastSelectedNodeId) {
      const findParentAndSiblings = (nodes: SVGNode[], targetId1: string, targetId2: string): SVGNode[] | null => {
        const hasNode1 = nodes.some(n => n.id === targetId1)
        const hasNode2 = nodes.some(n => n.id === targetId2)

        if (hasNode1 && hasNode2) {
          return nodes
        }

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
        const index1 = siblings.findIndex(n => n.id === lastSelectedNodeId)
        const index2 = siblings.findIndex(n => n.id === node.id)

        if (index1 !== -1 && index2 !== -1) {
          const start = Math.min(index1, index2)
          const end = Math.max(index1, index2)

          const rangeIds = siblings.slice(start, end + 1).map(n => n.id)
          setSelectedNodeIds(new Set(rangeIds))
          setLastSelectedNodeId(node.id)
          return
        }
      }

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

  const handleToggleVisibility = () => {
    const toggleNodeVisibility = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (selectedNodeIds.has(node.id)) {
          const newHiddenState = !node.isHidden

          const updateVisibility = (n: SVGNode, hidden: boolean): SVGNode => {
            if (n.element instanceof SVGElement || n.element instanceof HTMLElement) {
              n.element.style.display = hidden ? 'none' : ''
            }

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
    syncSvgContent()
  }

  const handleIsolate = () => {
    if (isIsolated) {
      // Un-isolate: show all layers
      const showAllNodes = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.element instanceof SVGElement || node.element instanceof HTMLElement) {
            node.element.style.display = ''
          }

          return {
            ...node,
            isHidden: false,
            children: showAllNodes(node.children)
          }
        })
      }

      setLayerNodes(showAllNodes(layerNodes))
      setIsIsolated(false)
      syncSvgContent()
    } else {
      // Isolate: hide all except selected
      const isolateNodes = (nodes: SVGNode[], parentSelected: boolean): SVGNode[] => {
        return nodes.map(node => {
          const isSelected = selectedNodeIds.has(node.id)
          const shouldBeVisible = isSelected || parentSelected
          const hidden = !shouldBeVisible

          if (node.element instanceof SVGElement || node.element instanceof HTMLElement) {
            node.element.style.display = hidden ? 'none' : ''
          }

          return {
            ...node,
            isHidden: hidden,
            children: isolateNodes(node.children, shouldBeVisible)
          }
        })
      }

      setLayerNodes(isolateNodes(layerNodes, false))
      setIsIsolated(true)
      syncSvgContent()
    }
  }

  const handleDeleteNode = () => {
    const deleteNode = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (selectedNodeIds.has(node.id)) {
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
    syncSvgContent()
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
    syncSvgContent()
  }

  const handleGroupUngroup = () => {
    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    if (selectedNodeIds.size === 1) {
      const selectedId = Array.from(selectedNodeIds)[0]
      const selectedNode = findNode(layerNodes, selectedId)

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

        setLayerNodes(ungroupNode(layerNodes, selectedId))
        setSelectedNodeIds(new Set())
        syncSvgContent()
        return
      }
    }

    if (selectedNodeIds.size > 1) {
      const selectedIds = Array.from(selectedNodeIds)

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

      const firstElement = selectedNodes[0].element
      let commonParent = firstElement.parentElement

      const allSameParent = selectedNodes.every(n => n.element.parentElement === commonParent)

      if (!allSameParent || !commonParent) {
        return
      }

      const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const groupId = `group-${Date.now()}`
      newGroup.setAttribute('id', groupId)

      let referenceNode: Node | null = firstElement.nextSibling
      const selectedElements = new Set(selectedNodes.map(n => n.element))

      while (referenceNode && selectedElements.has(referenceNode as Element)) {
        referenceNode = referenceNode.nextSibling
      }

      selectedNodes.forEach(node => {
        newGroup.appendChild(node.element)
      })

      if (referenceNode) {
        commonParent.insertBefore(newGroup, referenceNode)
      } else {
        commonParent.appendChild(newGroup)
      }

      const newGroupNode: SVGNode = {
        id: groupId,
        type: 'g',
        name: groupId,
        element: newGroup,
        isGroup: true,
        children: selectedNodes
      }

      const removeAndGroup = (nodes: SVGNode[]): SVGNode[] => {
        const result: SVGNode[] = []
        let insertedGroup = false

        for (const node of nodes) {
          if (selectedIds.includes(node.id)) {
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

      setLayerNodes(removeAndGroup(layerNodes))
      setSelectedNodeIds(new Set())
      syncSvgContent()
    }
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
      const svgElement = document.querySelector('.canvas-content svg')
      if (!svgElement) {
        throw new Error('SVG element not found')
      }

      const groupSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgDimensions?.width || 1000}" height="${svgDimensions?.height || 1000}" viewBox="0 0 ${svgDimensions?.width || 1000} ${svgDimensions?.height || 1000}">
  ${selectedNode.element.outerHTML}
</svg>`

      console.log(`Flattening group "${selectedNode.name}" with color: ${color}`)

      const flattenedSVG = await window.electron.flattenShapes({
        svg: groupSVG,
        color: color
      })

      const parser = new DOMParser()
      const doc = parser.parseFromString(flattenedSVG, 'image/svg+xml')
      const flattenedGroup = doc.querySelector('g')

      if (!flattenedGroup) {
        throw new Error('Failed to parse flattened SVG')
      }

      const parent = selectedNode.element.parentElement
      if (parent) {
        const importedGroup = document.importNode(flattenedGroup, true)
        parent.replaceChild(importedGroup, selectedNode.element)
        selectedNode.element = importedGroup as SVGGElement

        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svgElement)
        setSvgContent(svgString)

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

    const [w, h] = cropAspectRatio.split(':').map(Number)
    const aspectRatio = w / h

    const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
    const baseSize = minDimension * cropSize

    let width: number
    let height: number

    if (aspectRatio >= 1) {
      width = baseSize
      height = baseSize / aspectRatio
    } else {
      height = baseSize
      width = baseSize * aspectRatio
    }

    return { width, height }
  }

  const rotateCropAspectRatio = () => {
    const [w, h] = cropAspectRatio.split(':')
    setCropAspectRatio(`${h}:${w}` as '1:2' | '3:4' | '16:9' | '9:16')
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

  useEffect(() => {
    disarmActions()
  }, [showCrop, scale, offset, disarmActions])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.key === 'Escape') {
        disarmActions()
        return
      }

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
              handleDeleteNode()
              setDeleteArmed(false)
            } else {
              setDeleteArmed(true)
              setSplitArmed(false)
            }
          }
          break
        case 'g':
          if (hasSelection) {
            e.preventDefault()
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
                if (splitArmed) {
                  handleGroupUngroup()
                  setSplitArmed(false)
                } else {
                  setSplitArmed(true)
                  setDeleteArmed(false)
                }
              }
            } else {
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
    <div className="sort-tab">
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
        {showCrop && svgContent && (
          <div className="crop-options-bar">
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
            <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.5rem', marginRight: '0.5rem' }}>
              {(getCropDimensions().width / 96).toFixed(1)} × {(getCropDimensions().height / 96).toFixed(1)} in • {getCropDimensions().width.toFixed(0)} × {getCropDimensions().height.toFixed(0)} px
            </span>
            <div className="crop-ratio-buttons">
              <button
                className="crop-ratio-button"
                onClick={() => setCropAspectRatio('1:2')}
                title="Aspect Ratio 1:2"
                style={{
                  background: cropAspectRatio === '1:2' ? '#4a90e2' : 'white',
                  color: cropAspectRatio === '1:2' ? 'white' : 'inherit',
                }}
              >
                1:2
              </button>
              <button
                className="crop-ratio-button"
                onClick={() => setCropAspectRatio('3:4')}
                title="Aspect Ratio 3:4"
                style={{
                  background: cropAspectRatio === '3:4' ? '#4a90e2' : 'white',
                  color: cropAspectRatio === '3:4' ? 'white' : 'inherit',
                }}
              >
                3:4
              </button>
              <button
                className="crop-ratio-button"
                onClick={() => setCropAspectRatio('16:9')}
                title="Aspect Ratio 16:9"
                style={{
                  background: cropAspectRatio === '16:9' ? '#4a90e2' : 'white',
                  color: cropAspectRatio === '16:9' ? 'white' : 'inherit',
                }}
              >
                16:9
              </button>
              <button
                className="crop-ratio-button"
                onClick={() => setCropAspectRatio('9:16')}
                title="Aspect Ratio 9:16"
                style={{
                  background: cropAspectRatio === '9:16' ? '#4a90e2' : 'white',
                  color: cropAspectRatio === '9:16' ? 'white' : 'inherit',
                }}
              >
                9:16
              </button>
              <button
                className="crop-ratio-button"
                onClick={rotateCropAspectRatio}
                title="Rotate Aspect Ratio 90°"
                style={{
                  background: '#8e44ad',
                  color: 'white'
                }}
              >
                ↻
              </button>
            </div>
          </div>
        )}
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
          <div className="status-bar-left">
            {fileName && (
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
            )}
          </div>
          <div className="status-bar-center">
            {statusMessage && (
              <span className={`status-message ${statusMessage.startsWith('error:') ? 'error' : ''}`}>
                {statusMessage.startsWith('error:') ? statusMessage.slice(6) : statusMessage}
              </span>
            )}
          </div>
          <div className="status-bar-right">
            {documentColors.length > 0 && (
              <div className="status-bar-colors">
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
          </div>
        </div>
      )}
    </div>
  )
}
