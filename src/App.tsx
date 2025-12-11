import { useEffect, useState, useRef, useMemo } from 'react'
import './App.css'
import { AppProvider, useAppContext, OrderLine } from './context/AppContext'
import { SortTab, FillTab, ExportTab } from './components/tabs'
import OrderTab from './components/tabs/OrderTab'
import MergeTab from './components/tabs/MergeTab'
import PatternTest from './components/PatternTest'
import { SVGNode } from './types/svg'
import { ToolsOverlay } from './components/ToolsOverlay'
import { FillPatternOverlay } from './components/FillPatternOverlay'
import { executeMergeColors, executeReducePalette } from './utils/colorDistance'
import { useFlattenAll, useMenuCommands } from './hooks'

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
    setStatusMessage,
    layerNodes,
    setLayerNodes,
    getNodeById,
    selectedNodeIds,
    setSelectedNodeIds,
    setFillTargetNodeIds,
    setWeaveRequested,
    rebuildSvgFromLayers,
    setOrderData,
    isProcessing,
    arrangeHandlers,
    toolHandlers,
    pendingFlatten,
    setPendingFlatten,
    activeTool,
    setActiveTool,
    mergeColorTolerance,
    reducePaletteCount,
    svgElementRef,
    fillPatternType,
    fillPatternSpacing,
    fillPatternAngle,
    fillPatternKeepStrokes,
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

  // Pattern test harness
  const [showPatternTest, setShowPatternTest] = useState(false)

  // Use extracted hooks
  const handleFlattenAll = useFlattenAll({
    layerNodes,
    setLayerNodes,
    setSelectedNodeIds,
    rebuildSvgFromLayers,
    flattenArmed,
    setFlattenArmed,
    setStatusMessage,
  })

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

  // Select all layers - if a parent is selected, select its children; otherwise select all top-level
  const handleSelectAllLayers = () => {
    const newSelection = new Set<string>()

    // If exactly one node is selected and it has children, select all its children
    if (selectedNodeIds.size === 1) {
      const selectedId = Array.from(selectedNodeIds)[0]
      const selectedNode = getNodeById(selectedId)
      if (selectedNode && selectedNode.children.length > 0) {
        // Select all children of this parent
        for (const child of selectedNode.children) {
          newSelection.add(child.id)
        }
        setSelectedNodeIds(newSelection)
        return
      }
    }

    // Otherwise select all top-level nodes
    for (const node of layerNodes) {
      newSelection.add(node.id)
    }
    setSelectedNodeIds(newSelection)
  }

  const disarmActions = () => {
    setFlattenArmed(false)
    setStatusMessage('')
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

  // Handle tool overlay accept (merge colors or reduce palette)
  const handleToolAccept = () => {
    const svgElement = svgElementRef.current
    if (!svgElement || layerNodes.length === 0) {
      setActiveTool('none')
      return
    }

    let newNodes: SVGNode[] = []

    if (activeTool === 'merge-colors') {
      newNodes = executeMergeColors(layerNodes, mergeColorTolerance, svgElement)
      setStatusMessage(`Merged to ${newNodes.length} color groups`)
    } else if (activeTool === 'reduce-palette') {
      newNodes = executeReducePalette(layerNodes, reducePaletteCount, svgElement)
      setStatusMessage(`Reduced to ${newNodes.length} color groups`)
    }

    if (newNodes.length > 0) {
      setLayerNodes(newNodes)
      setSelectedNodeIds(new Set())
      rebuildSvgFromLayers(newNodes)
    }

    setActiveTool('none')
  }

  // Handle fill pattern accept (using rat-king-cli)
  const handleFillPatternAccept = async () => {
    if (selectedNodeIds.size === 0) {
      setStatusMessage('error:Select layers to fill with pattern')
      setActiveTool('none')
      return
    }

    if (!window.electron?.fillPattern) {
      setStatusMessage('error:Fill pattern not available')
      setActiveTool('none')
      return
    }

    setStatusMessage('Generating fill patterns...')

    try {
      // For each selected node, extract its SVG content and send to rat-king-cli
      for (const nodeId of selectedNodeIds) {
        const node = getNodeById(nodeId)
        if (!node) continue

        // Serialize the node's element to SVG
        const serializer = new XMLSerializer()
        let nodeContent = ''

        if (node.customMarkup) {
          nodeContent = node.customMarkup
        } else {
          nodeContent = serializer.serializeToString(node.element)
        }

        // Wrap in an SVG element with the document's dimensions
        const svgElement = svgElementRef.current
        const viewBox = svgElement?.getAttribute('viewBox') || '0 0 100 100'
        const width = svgElement?.getAttribute('width') || '100'
        const height = svgElement?.getAttribute('height') || '100'

        const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${nodeContent}</svg>`

        // Call rat-king-cli
        const result = await window.electron.fillPattern({
          svg: wrappedSvg,
          pattern: fillPatternType,
          spacing: fillPatternSpacing,
          angle: fillPatternAngle,
        })

        if (result) {
          // Parse the result and extract the fill lines
          const parser = new DOMParser()
          const resultDoc = parser.parseFromString(result, 'image/svg+xml')
          const resultSvg = resultDoc.querySelector('svg')

          if (resultSvg) {
            // Get the fill lines content (everything inside the SVG)
            const fillContent = resultSvg.innerHTML

            // Determine stroke color: use node's fill color or existing stroke
            let strokeColor = '#000000'
            const nodeFill = node.element.getAttribute('fill')
            const nodeStroke = node.element.getAttribute('stroke')

            if (nodeStroke && nodeStroke !== 'none') {
              strokeColor = nodeStroke
            } else if (nodeFill && nodeFill !== 'none') {
              strokeColor = nodeFill
            }

            // Build new customMarkup with the fill pattern
            let newMarkup = ''

            if (fillPatternKeepStrokes) {
              // Keep original strokes and add fill pattern
              const originalStroke = serializer.serializeToString(node.element)
              // Remove fill from original, keep stroke
              const strokeOnly = originalStroke
                .replace(/fill="[^"]*"/g, 'fill="none"')
                .replace(/fill:[^;]+;?/g, '')

              newMarkup = `<g id="fill-pattern-${nodeId}">
                <g class="fill-lines" stroke="${strokeColor}" fill="none">${fillContent}</g>
                <g class="original-stroke">${strokeOnly}</g>
              </g>`
            } else {
              // Replace with just fill pattern
              newMarkup = `<g id="fill-pattern-${nodeId}" stroke="${strokeColor}" fill="none">${fillContent}</g>`
            }

            // Count fill lines for optimization tracking
            const lineCount = (fillContent.match(/<(path|line|polyline)/g) || []).length

            // Update the node with the new customMarkup and optimization state
            const updateNode = (nodes: SVGNode[]): SVGNode[] => {
              return nodes.map(n => {
                if (n.id === nodeId) {
                  return {
                    ...n,
                    customMarkup: newMarkup,
                    fillColor: strokeColor,
                    optimizationState: {
                      ...n.optimizationState,
                      fillApplied: {
                        pattern: fillPatternType,
                        lineCount,
                        timestamp: Date.now(),
                      },
                    },
                  }
                }
                if (n.children.length > 0) {
                  return { ...n, children: updateNode(n.children) }
                }
                return n
              })
            }

            const updatedNodes = updateNode(layerNodes)
            setLayerNodes(updatedNodes)
            rebuildSvgFromLayers(updatedNodes)
          }
        }
      }

      setStatusMessage(`Applied ${fillPatternType} pattern to ${selectedNodeIds.size} layer(s)`)
    } catch (error) {
      console.error('Fill pattern error:', error)
      setStatusMessage(`error:Fill pattern failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    setActiveTool('none')
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
      onApply: (orderedLines: OrderLine[], improvement: number) => {
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
              // Replace with optimized version and set optimization state
              return {
                ...node,
                customMarkup: optimizedMarkup,
                children: [], // Clear children since we've merged into single path
                optimizationState: {
                  ...node.optimizationState,
                  orderOptimized: {
                    improvement,
                    timestamp: Date.now(),
                  },
                },
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
        setStatusMessage(`Optimized ${orderedLines.length} lines (${improvement.toFixed(1)}% travel saved)`)
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

  // Handle Escape key to cancel crop and prevent native select-all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCrop) {
        setShowCrop(false)
        setStatusMessage('')
      }
      // Prevent native text selection on Cmd+A / Ctrl+A
      // The Electron menu will handle this and trigger select-all-layers
      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showCrop, setShowCrop, setStatusMessage])

  // Auto-flatten when pendingFlatten is set (after import with flattenOnImport enabled)
  useEffect(() => {
    if (pendingFlatten && layerNodes.length > 0) {
      setPendingFlatten(false)
      // Use a short delay to ensure DOM is ready
      setTimeout(() => {
        handleFlattenAll()
      }, 100)
    }
  }, [pendingFlatten, layerNodes.length, setPendingFlatten])

  // Handle menu commands from Electron
  useMenuCommands({
    activeTab,
    setActiveTab,
    setSvgContent,
    setFileName,
    setWeaveRequested,
    setActiveTool,
    handleFlattenAll,
    handleFill,
    handleOrder,
    handleToggleCrop,
    handleSelectAllLayers,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    arrangeHandlers,
    toolHandlers,
  })

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">📐</span>
          <h1>SVG Grouper</h1>
          <span className={`processing-gear ${isProcessing ? 'spinning' : ''}`} title={isProcessing ? 'Processing...' : ''}>⚙</span>
          <button
            className="pattern-test-link"
            onClick={() => setShowPatternTest(true)}
            title="Open Pattern Test Harness"
          >
            Pattern Test
          </button>
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
        {svgContent && (
          <div className="header-right-controls">
            <div className="header-function-buttons">
              <button
                onClick={() => setActiveTab('sort')}
                className="function-button"
                disabled={activeTab === 'sort'}
                title={activeTab === 'sort' ? "Already on Sort view" : "Go to Sort view"}
                style={{
                  background: activeTab === 'sort' ? '#2980b9' : '#3498db',
                  opacity: 1,
                  cursor: activeTab === 'sort' ? 'default' : 'pointer',
                }}
              >
                ⋮⋮ Sort
              </button>
              <button
                onClick={() => setActiveTab('merge')}
                className="function-button"
                disabled={activeTab === 'merge' || selectedNodeIds.size === 0}
                title={
                  activeTab === 'merge' ? "Already on Merge view" :
                  selectedNodeIds.size === 0 ? "Select a group or shapes to merge" :
                  "Merge shapes (union adjacent polygons)"
                }
                style={{
                  background: activeTab === 'merge' ? '#16a085' : (selectedNodeIds.size >= 1 ? '#1abc9c' : '#bdc3c7'),
                  opacity: selectedNodeIds.size >= 1 || activeTab === 'merge' ? 1 : 0.5,
                  cursor: (activeTab === 'merge' || selectedNodeIds.size === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                ⊕ Merge
              </button>
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
              <button
                onClick={() => setActiveTab('export')}
                className="function-button"
                disabled={activeTab === 'export'}
                title={activeTab === 'export' ? "Already on Export view" : "Go to Export view"}
                style={{
                  background: activeTab === 'export' ? '#1a1a1a' : '#2c2c2c',
                  opacity: 1,
                  cursor: activeTab === 'export' ? 'default' : 'pointer',
                }}
              >
                ⬇ Export
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
        {showPatternTest ? (
          <PatternTest onBack={() => setShowPatternTest(false)} />
        ) : (
          <>
            {activeTab === 'sort' && <SortTab />}
            {activeTab === 'merge' && <MergeTab />}
            {activeTab === 'fill' && <FillTab />}
            {activeTab === 'order' && <OrderTab />}
            {activeTab === 'export' && <ExportTab />}
            {(activeTool === 'merge-colors' || activeTool === 'reduce-palette') && (
              <ToolsOverlay onAccept={handleToolAccept} />
            )}
            {activeTool === 'fill-pattern' && (
              <FillPatternOverlay onAccept={handleFillPatternAccept} />
            )}
          </>
        )}
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
