import { useEffect, useState, useRef, useMemo } from 'react'
import './App.css'
import { AppProvider, useAppContext, OrderLine } from './context/AppContext'
import TabNavigation from './components/TabNavigation'
import { SortTab, FillTab, ExportTab } from './components/tabs'
import OrderTab from './components/tabs/OrderTab'
import { SVGNode } from './types/svg'
import { getElementColor } from './utils/elementColor'
import { normalizeColor } from './utils/colorExtractor'

function AppContent() {
  const {
    activeTab,
    setActiveTab,
    svgContent,
    setSvgContent,
    setFileName,
    scale,
    setScale,
    setOffset,
    showCrop,
    setShowCrop,
    flattenArmed,
    setFlattenArmed,
    setCropArmed,
    setStatusMessage,
    layerNodes,
    setLayerNodes,
    getNodeById,
    selectedNodeIds,
    setSelectedNodeIds,
    setFillTargetNodeIds,
    rebuildSvgFromLayers,
    setOrderData,
    isProcessing,
    arrangeHandlers,
    toolHandlers,
  } = useAppContext()

  // Calculate SVG stats from layer nodes
  const svgStats = useMemo(() => {
    let totalElements = 0
    let groups = 0
    let paths = 0

    const countNodes = (nodes: SVGNode[]) => {
      for (const node of nodes) {
        totalElements++
        if (node.isGroup) {
          groups++
        } else {
          paths++
        }
        if (node.children.length > 0) {
          countNodes(node.children)
        }
      }
    }

    countNodes(layerNodes)
    return { totalElements, groups, paths }
  }, [layerNodes])

  // Check if selected nodes have fill or stroke paths
  const selectionState = useMemo(() => {
    if (selectedNodeIds.size === 0) {
      return { hasFills: false, hasStrokes: false, hasSelection: false }
    }

    let hasFills = false
    let hasStrokes = false

    const checkNode = (node: SVGNode) => {
      const element = node.element
      const fill = element.getAttribute('fill')
      const stroke = element.getAttribute('stroke')
      const style = element.getAttribute('style') || ''

      // Check for fill
      const fillMatch = style.match(/fill:\s*([^;]+)/)
      const fillValue = fillMatch ? fillMatch[1].trim() : fill
      if (fillValue && fillValue !== 'none' && fillValue !== 'transparent') {
        hasFills = true
      }

      // Check for stroke
      const strokeMatch = style.match(/stroke:\s*([^;]+)/)
      const strokeValue = strokeMatch ? strokeMatch[1].trim() : stroke
      if (strokeValue && strokeValue !== 'none' && strokeValue !== 'transparent') {
        hasStrokes = true
      }

      // Check children
      for (const child of node.children) {
        checkNode(child)
      }
    }

    for (const id of selectedNodeIds) {
      const node = getNodeById(id)
      if (node) {
        checkNode(node)
      }
    }

    return { hasFills, hasStrokes, hasSelection: true }
  }, [selectedNodeIds, getNodeById])

  // Stroke panel state
  const [showStrokePanel, setShowStrokePanel] = useState(false)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(1)
  const strokePanelRef = useRef<HTMLDivElement>(null)
  const strokeButtonRef = useRef<HTMLButtonElement>(null)

  const handleZoomIn = () => {
    setScale(Math.min(10, scale * 1.2))
  }

  const handleZoomOut = () => {
    setScale(Math.max(0.1, scale / 1.2))
  }

  const handleFitToScreen = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const disarmActions = () => {
    setFlattenArmed(false)
    setCropArmed(false)
    setStatusMessage('')
  }

  const handleFlattenAll = () => {
    if (!flattenArmed) {
      setFlattenArmed(true)
      setCropArmed(false)
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
    processedNodes = groupByColor(processedNodes)

    setLayerNodes(processedNodes)
    setSelectedNodeIds(new Set())
    // Use rebuildSvgFromLayers to properly render customMarkup (line fill patterns)
    rebuildSvgFromLayers(processedNodes)
  }

  const handleToggleCrop = async () => {
    disarmActions()
    if (showCrop) {
      // If crop is active, apply the crop then navigate to Sort tab
      // We need to trigger the crop operation from here
      // For now, just navigate to Sort tab - crop will be applied there
      setActiveTab('sort')
      // Dispatch a custom event that SortTab can listen for to apply crop
      window.dispatchEvent(new CustomEvent('apply-crop'))
    }
    setShowCrop(!showCrop)
  }

  const handleFill = () => {
    disarmActions()

    // Check if at least one layer is selected
    if (selectedNodeIds.size === 0) {
      setStatusMessage('error:Select one or more layers to use Fill')
      return
    }

    const selectedIds = Array.from(selectedNodeIds)

    // Check if the layer contains fill paths (closed shapes with fill attribute)
    const hasFillPaths = (node: SVGNode): boolean => {
      const element = node.element
      const fill = element.getAttribute('fill')
      const style = element.getAttribute('style')

      // Check for fill in attributes or style
      if (fill && fill !== 'none' && fill !== 'transparent') {
        return true
      }
      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
          return true
        }
      }

      // Check children recursively
      for (const child of node.children) {
        if (hasFillPaths(child)) return true
      }

      return false
    }

    // Validate all selected nodes exist and have fill paths
    const validIds: string[] = []
    for (const id of selectedIds) {
      const node = getNodeById(id)
      if (!node) {
        setStatusMessage('error:Could not find selected layer')
        return
      }
      if (!hasFillPaths(node)) {
        setStatusMessage('error:All selected layers must contain closed shapes with fills')
        return
      }
      validIds.push(id)
    }

    // Navigate to Fill tab with the selected nodes
    setFillTargetNodeIds(validIds)
    setActiveTab('fill')
    setStatusMessage('')
  }

  const handleOrder = () => {
    disarmActions()

    // Check if a layer is selected
    if (selectedNodeIds.size !== 1) {
      setStatusMessage('error:Select a single layer or group to use Order')
      return
    }

    const selectedId = Array.from(selectedNodeIds)[0]

    const selectedNode = getNodeById(selectedId)
    if (!selectedNode) {
      setStatusMessage('error:Could not find selected layer')
      return
    }

    // Extract line elements from the selected node
    const lines: OrderLine[] = []
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    const extractLines = (node: SVGNode) => {
      // Helper to extract lines from path data string
      const extractFromPathData = (d: string, stroke: string, pathId: string) => {
        const lineRegex = /M\s*([\d.-]+)[,\s]+([\d.-]+)\s*L\s*([\d.-]+)[,\s]+([\d.-]+)/gi
        let lineMatch
        while ((lineMatch = lineRegex.exec(d)) !== null) {
          const x1 = parseFloat(lineMatch[1])
          const y1 = parseFloat(lineMatch[2])
          const x2 = parseFloat(lineMatch[3])
          const y2 = parseFloat(lineMatch[4])

          lines.push({ x1, y1, x2, y2, color: stroke, pathId })

          minX = Math.min(minX, x1, x2)
          minY = Math.min(minY, y1, y2)
          maxX = Math.max(maxX, x1, x2)
          maxY = Math.max(maxY, y1, y2)
        }
      }

      // Check for customMarkup first (used by fill layers)
      if (node.customMarkup) {
        // Parse customMarkup to extract path data and stroke color
        const pathMatch = node.customMarkup.match(/<path[^>]*d="([^"]*)"[^>]*>/)
        const strokeMatch = node.customMarkup.match(/stroke="([^"]*)"/)
        if (pathMatch) {
          const d = pathMatch[1]
          const stroke = strokeMatch ? strokeMatch[1] : '#000'
          extractFromPathData(d, stroke, node.id)
        }
        return // Don't process element if we have customMarkup
      }

      const element = node.element
      const tagName = element.tagName.toLowerCase()

      if (tagName === 'line') {
        const x1 = parseFloat(element.getAttribute('x1') || '0')
        const y1 = parseFloat(element.getAttribute('y1') || '0')
        const x2 = parseFloat(element.getAttribute('x2') || '0')
        const y2 = parseFloat(element.getAttribute('y2') || '0')
        const stroke = element.getAttribute('stroke') || '#000'

        lines.push({ x1, y1, x2, y2, color: stroke, pathId: node.id })

        minX = Math.min(minX, x1, x2)
        minY = Math.min(minY, y1, y2)
        maxX = Math.max(maxX, x1, x2)
        maxY = Math.max(maxY, y1, y2)
      } else if (tagName === 'path') {
        // Extract lines from path elements - handles both simple and compound paths
        const d = element.getAttribute('d') || ''
        const stroke = element.getAttribute('stroke') || '#000'

        extractFromPathData(d, stroke, node.id)
      } else if (tagName === 'polyline') {
        // Extract lines from polyline points
        const pointsAttr = element.getAttribute('points') || ''
        const stroke = element.getAttribute('stroke') || '#000'
        const points = pointsAttr.trim().split(/[\s,]+/).map(Number)

        for (let i = 0; i < points.length - 3; i += 2) {
          const x1 = points[i]
          const y1 = points[i + 1]
          const x2 = points[i + 2]
          const y2 = points[i + 3]

          if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            lines.push({ x1, y1, x2, y2, color: stroke, pathId: node.id })

            minX = Math.min(minX, x1, x2)
            minY = Math.min(minY, y1, y2)
            maxX = Math.max(maxX, x1, x2)
            maxY = Math.max(maxY, y1, y2)
          }
        }
      }

      // Process children
      for (const child of node.children) {
        extractLines(child)
      }
    }

    extractLines(selectedNode)

    if (lines.length === 0) {
      setStatusMessage('error:No line elements found in selection')
      return
    }

    // Create OrderData and navigate to Order tab
    // onApply callback will rebuild the SVG with optimized line order
    setOrderData({
      lines,
      boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      source: 'sort',
      onApply: (orderedLines: OrderLine[]) => {
        // Rebuild the selected node's content with optimized line order
        // Generate new path data as a compound path with all lines in order
        const pathD = orderedLines.map(line =>
          `M${line.x1.toFixed(2)},${line.y1.toFixed(2)} L${line.x2.toFixed(2)},${line.y2.toFixed(2)}`
        ).join(' ')

        // Get the color from the first line (all should be same in a group)
        const strokeColor = orderedLines.length > 0 ? orderedLines[0].color : '#000000'

        // Create new markup for the optimized paths
        const optimizedMarkup = `<path id="${selectedId}-optimized" d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-linecap="round"/>`

        // Update the selected node to use the optimized path
        const updateNodeInTree = (nodes: SVGNode[]): SVGNode[] => {
          return nodes.map(node => {
            if (node.id === selectedId) {
              // Replace with optimized version
              return {
                ...node,
                customMarkup: optimizedMarkup,
                children: [], // Clear children since we've merged into single path
              }
            }
            if (node.children.length > 0) {
              return { ...node, children: updateNodeInTree(node.children) }
            }
            return node
          })
        }

        const updatedNodes = updateNodeInTree(layerNodes)
        setLayerNodes(updatedNodes)
        rebuildSvgFromLayers(updatedNodes)
        setStatusMessage(`Optimized ${orderedLines.length} lines`)
      },
    })
    setActiveTab('order')
    setStatusMessage('')
  }

  // Handle stroke button click
  const handleStrokeClick = () => {
    disarmActions()

    if (selectedNodeIds.size === 0) {
      setStatusMessage('error:Select one or more layers to modify stroke')
      return
    }

    // Get current stroke color from first selected element
    const selectedId = Array.from(selectedNodeIds)[0]

    const selectedNode = getNodeById(selectedId)
    if (selectedNode) {
      // Helper to extract color from an element (checks fill first, then stroke)
      const extractColor = (el: Element): string | null => {
        const style = el.getAttribute('style') || ''

        // Check fill first (most shapes have fill)
        let fill = el.getAttribute('fill')
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        if (fillMatch) fill = fillMatch[1].trim()
        if (fill && fill !== 'none' && fill !== 'transparent') return fill

        // Fall back to stroke
        let stroke = el.getAttribute('stroke')
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (strokeMatch) stroke = strokeMatch[1].trim()
        if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

        return null
      }

      // Recursively find color from element or its children
      const findColorInTree = (node: SVGNode): string | null => {
        const color = extractColor(node.element)
        if (color) return color

        for (const child of node.children) {
          const childColor = findColorInTree(child)
          if (childColor) return childColor
        }
        return null
      }

      let color = findColorInTree(selectedNode) || '#000000'

      // Normalize to hex if possible
      if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g)
        if (rgb && rgb.length >= 3) {
          color = '#' + rgb.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('')
        }
      }
      setStrokeColor(color)

      // Get stroke width (default to 1 for fill shapes)
      const el = selectedNode.element
      const style = el.getAttribute('style') || ''
      let width = parseFloat(el.getAttribute('stroke-width') || '1')
      const widthMatch = style.match(/stroke-width:\s*([^;]+)/)
      if (widthMatch) width = parseFloat(widthMatch[1])
      setStrokeWidth(isNaN(width) ? 1 : width)
    }

    setShowStrokePanel(!showStrokePanel)
    setStatusMessage('')
  }

  // Apply stroke to selected elements
  const applyStroke = () => {
    if (selectedNodeIds.size === 0) return

    // Apply stroke to all selected nodes and their children
    const applyStrokeToNode = (node: SVGNode) => {
      const el = node.element
      const tagName = el.tagName.toLowerCase()

      // Only apply stroke to drawable elements
      if (['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'].includes(tagName)) {
        el.setAttribute('stroke', strokeColor)
        el.setAttribute('stroke-width', String(strokeWidth))

        // Update style attribute if it exists
        const style = el.getAttribute('style')
        if (style) {
          let newStyle = style
            .replace(/stroke:\s*[^;]+;?/g, '')
            .replace(/stroke-width:\s*[^;]+;?/g, '')
          newStyle = `stroke:${strokeColor};stroke-width:${strokeWidth}px;${newStyle}`
          el.setAttribute('style', newStyle)
        }
      }

      // Apply to children
      for (const child of node.children) {
        applyStrokeToNode(child)
      }
    }

    for (const id of selectedNodeIds) {
      const node = getNodeById(id)
      if (node) {
        applyStrokeToNode(node)
      }
    }

    rebuildSvgFromLayers(layerNodes)
    setShowStrokePanel(false)
    setStatusMessage(`Applied stroke: ${strokeColor}, ${strokeWidth}px`)
  }

  // Close stroke panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showStrokePanel &&
        strokePanelRef.current &&
        strokeButtonRef.current &&
        !strokePanelRef.current.contains(e.target as Node) &&
        !strokeButtonRef.current.contains(e.target as Node)
      ) {
        setShowStrokePanel(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStrokePanel])

  // Handle Escape key to cancel crop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCrop) {
        setShowCrop(false)
        setCropArmed(false)
        setStatusMessage('')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showCrop, setShowCrop, setCropArmed, setStatusMessage])

  // Handle menu commands from Electron
  useEffect(() => {
    if (!window.electron) return

    // Handle menu commands
    window.electron.onMenuCommand((command: string) => {
      switch (command) {
        case 'flatten':
          handleFlattenAll()
          break
        case 'fill':
          handleFill()
          break
        case 'order':
          handleOrder()
          break
        case 'crop':
          handleToggleCrop()
          break
        case 'export':
          setActiveTab('export')
          break
        case 'tab-sort':
          setActiveTab('sort')
          break
        case 'tab-fill':
          setActiveTab('fill')
          break
        case 'tab-order':
          setActiveTab('order')
          break
        case 'tab-export':
          setActiveTab('export')
          break
        case 'zoom-in':
          handleZoomIn()
          break
        case 'zoom-out':
          handleZoomOut()
          break
        case 'zoom-fit':
          handleFitToScreen()
          break
        case 'arrange-move-up':
          arrangeHandlers.current?.moveUp()
          break
        case 'arrange-move-down':
          arrangeHandlers.current?.moveDown()
          break
        case 'arrange-bring-front':
          arrangeHandlers.current?.bringToFront()
          break
        case 'arrange-send-back':
          arrangeHandlers.current?.sendToBack()
          break
        case 'arrange-group':
          arrangeHandlers.current?.group()
          break
        case 'arrange-ungroup':
          arrangeHandlers.current?.ungroup()
          break
        case 'convert-to-fills':
          toolHandlers.current?.convertToFills()
          break
        case 'normalize-colors':
          toolHandlers.current?.normalizeColors()
          break
        case 'separate-compound-paths':
          toolHandlers.current?.separateCompoundPaths()
          break
      }
    })

    // Handle file opened from menu
    window.electron.onFileOpened((data) => {
      setSvgContent(data.content)
      setFileName(data.fileName)
      setActiveTab('sort')
    })
  }, []) // Empty deps - these are one-time listeners

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">📐</span>
          <h1>SVG Grouper</h1>
          <span className={`processing-gear ${isProcessing ? 'spinning' : ''}`} title={isProcessing ? 'Processing...' : ''}>⚙</span>
        </div>
        {svgStats.totalElements > 0 && (
          <div className="header-stats" title="Total Elements / Groups / Paths">
            <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>{svgStats.totalElements.toLocaleString()}</span>
            <span style={{ color: '#666' }}>/</span>
            <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{svgStats.groups.toLocaleString()}</span>
            <span style={{ color: '#666' }}>/</span>
            <span style={{ color: '#3498db', fontWeight: 'bold' }}>{svgStats.paths.toLocaleString()}</span>
          </div>
        )}
        <TabNavigation />
        {svgContent && (
          <div className="header-right-controls">
            <div className="header-function-buttons">
              <div className="stroke-button-container">
                <button
                  ref={strokeButtonRef}
                  onClick={handleStrokeClick}
                  className="function-button"
                  disabled={activeTab === 'fill' || showCrop || selectedNodeIds.size === 0}
                  title={
                    activeTab === 'fill' ? "Disabled on Fill tab" :
                    showCrop ? "Disabled during crop" :
                    selectedNodeIds.size > 0 ? "Modify stroke color and width" : "Select one or more layers first"
                  }
                  style={{
                    background: (activeTab !== 'fill' && !showCrop && selectedNodeIds.size > 0)
                      ? (showStrokePanel ? '#27ae60' : '#27ae60')
                      : '#bdc3c7',
                    opacity: (activeTab !== 'fill' && !showCrop && selectedNodeIds.size > 0) ? 1 : 0.5,
                    cursor: (activeTab === 'fill' || showCrop || selectedNodeIds.size === 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  ✏ Stroke
                </button>
                {showStrokePanel && (
                  <div ref={strokePanelRef} className="stroke-panel">
                    <div className="stroke-panel-header">
                      <h4>Stroke Settings</h4>
                    </div>
                    <div className="stroke-panel-content">
                      <div className="stroke-control">
                        <label>Color</label>
                        <div className="stroke-color-row">
                          <div
                            className="stroke-color-swatch"
                            style={{ backgroundColor: strokeColor }}
                          />
                          <input
                            type="color"
                            value={strokeColor}
                            onChange={(e) => setStrokeColor(e.target.value)}
                            className="stroke-color-picker"
                          />
                          <input
                            type="text"
                            value={strokeColor}
                            onChange={(e) => setStrokeColor(e.target.value)}
                            className="stroke-color-hex"
                            placeholder="#000000"
                          />
                        </div>
                      </div>
                      <div className="stroke-control">
                        <label>Width</label>
                        <div className="stroke-width-row">
                          <input
                            type="range"
                            min="0.1"
                            max="10"
                            step="0.1"
                            value={strokeWidth}
                            onChange={(e) => setStrokeWidth(Number(e.target.value))}
                            className="stroke-width-slider"
                          />
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.1"
                            value={strokeWidth}
                            onChange={(e) => setStrokeWidth(Number(e.target.value))}
                            className="stroke-width-input"
                          />
                          <span className="stroke-width-unit">px</span>
                        </div>
                      </div>
                    </div>
                    <div className="stroke-panel-actions">
                      <button
                        className="stroke-apply-btn"
                        onClick={applyStroke}
                      >
                        Apply
                      </button>
                      <button
                        className="stroke-cancel-btn"
                        onClick={() => setShowStrokePanel(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleFill}
                className="function-button"
                disabled={activeTab === 'fill' || showCrop || !selectionState.hasFills}
                title={
                  activeTab === 'fill' ? "Already on Fill tab" :
                  showCrop ? "Disabled during crop" :
                  !selectionState.hasSelection ? "Select a layer first" :
                  !selectionState.hasFills ? "Selection must contain filled shapes" :
                  "Convert fills to line hatching"
                }
                style={{
                  background: (activeTab !== 'fill' && !showCrop && selectionState.hasFills) ? '#9b59b6' : '#bdc3c7',
                  opacity: (activeTab !== 'fill' && !showCrop && selectionState.hasFills) ? 1 : 0.5,
                  cursor: (activeTab === 'fill' || showCrop || !selectionState.hasFills) ? 'not-allowed' : 'pointer',
                }}
              >
                ▤ Fill
              </button>
              <button
                onClick={handleOrder}
                className="function-button"
                disabled={activeTab === 'fill' || showCrop || !selectionState.hasStrokes}
                title={
                  activeTab === 'fill' ? "Disabled on Fill tab" :
                  showCrop ? "Disabled during crop" :
                  !selectionState.hasSelection ? "Select a layer first" :
                  !selectionState.hasStrokes ? "Selection must contain strokes/lines" :
                  "Optimize line drawing order for pen plotters"
                }
                style={{
                  background: (activeTab !== 'fill' && !showCrop && selectionState.hasStrokes) ? '#e67e22' : '#bdc3c7',
                  opacity: (activeTab !== 'fill' && !showCrop && selectionState.hasStrokes) ? 1 : 0.5,
                  cursor: (activeTab === 'fill' || showCrop || !selectionState.hasStrokes) ? 'not-allowed' : 'pointer',
                }}
              >
                ⇄ Order
              </button>
              <button
                className="function-button"
                onClick={handleToggleCrop}
                disabled={activeTab === 'fill'}
                title={
                  activeTab === 'fill' ? "Disabled on Fill tab" :
                  showCrop ? "Hide Crop" : "Show Crop"
                }
                style={{
                  background: activeTab === 'fill' ? '#bdc3c7' : (showCrop ? '#c0392b' : '#e74c3c'),
                  opacity: activeTab === 'fill' ? 0.5 : 1,
                  cursor: activeTab === 'fill' ? 'not-allowed' : 'pointer',
                }}
              >
                {showCrop ? '✕ Crop' : '◫ Crop'}
              </button>
            </div>
            <div className="header-zoom-controls">
              <button onClick={handleZoomIn} title="Zoom In">+</button>
              <button onClick={handleZoomOut} title="Zoom Out">-</button>
              <button onClick={handleFitToScreen} title="Fit to Screen">Fit</button>
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
            </div>
          </div>
        )}
      </header>
      <div className="app-content">
        {activeTab === 'sort' && <SortTab />}
        {activeTab === 'fill' && <FillTab />}
        {activeTab === 'order' && <OrderTab />}
        {activeTab === 'export' && <ExportTab />}
      </div>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
