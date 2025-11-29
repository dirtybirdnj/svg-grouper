import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppContext } from '../../context/AppContext'
import FileUpload from '../FileUpload'
import SVGCanvas from '../SVGCanvas'
import LayerTree from '../LayerTree'
import LoadingOverlay from '../LoadingOverlay'
import { SVGNode } from '../../types/svg'
import { parseSVGProgressively } from '../../utils/svgParser'
import { normalizeColor } from '../../utils/colorExtractor'
import { simplifyPathElement, countPathPoints, SIMPLIFY_PRESETS } from '../../utils/pathSimplify'
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
    setShowCrop,
    cropAspectRatio,
    setCropAspectRatio,
    cropSize,
    setCropSize,
    statusMessage,
    setStatusMessage,
    rebuildSvgFromLayers,
    skipNextParse,
    setIsProcessing,
  } = useAppContext()

  // Ref for the canvas container to get its dimensions
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [splitArmed, setSplitArmed] = useState(false)
  const [layerProcessingStates] = useState<Record<string, 'pending' | 'processing' | 'complete'>>({})
  const [isIsolated, setIsIsolated] = useState(false)
  const [highlightedPathId, setHighlightedPathId] = useState<string | null>(null)
  const [isHighlightPersistent, setIsHighlightPersistent] = useState(false)
  const [showPointMarkers, setShowPointMarkers] = useState<'none' | 'start' | 'end' | 'all'>('none')
  const [pointMarkerCoords, setPointMarkerCoords] = useState<{ x: number; y: number }[]>([])

  // Simplification state
  const [simplifyTolerance] = useState<number>(SIMPLIFY_PRESETS.moderate)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_simplifyResult, setSimplifyResult] = useState<{ before: number; after: number } | null>(null)

  const handleFileLoad = useCallback((content: string, name: string) => {
    setSvgContent(content)
    setFileName(name)
    setSelectedNodeIds(new Set())
    setLastSelectedNodeId(null)
    parsingRef.current = false
  }, [setSvgContent, setFileName, setSelectedNodeIds, setLastSelectedNodeId, parsingRef])

  const handleSVGParsed = useCallback(async (svg: SVGSVGElement) => {
    // Skip parsing if this was a programmatic update from rebuildSvgFromLayers
    if (skipNextParse.current) {
      skipNextParse.current = false
      return
    }

    if (parsingRef.current) {
      return
    }

    parsingRef.current = true
    handleProgress(0, 'Starting to parse SVG...')

    try {
      const nodes = await parseSVGProgressively(svg, handleProgress)
      setLayerNodes(nodes)

      // Auto-select if there's only one top-level group
      if (nodes.length === 1 && nodes[0].isGroup) {
        setSelectedNodeIds(new Set([nodes[0].id]))
        setLastSelectedNodeId(nodes[0].id)
      } else {
        // Clear any previous selection
        setSelectedNodeIds(new Set())
        setLastSelectedNodeId(null)
      }

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
  }, [handleProgress, setLayerNodes, setSvgDimensions, setLoadingState, parsingRef, skipNextParse, setSelectedNodeIds, setLastSelectedNodeId])

  const disarmActions = useCallback(() => {
    setDeleteArmed(false)
    setSplitArmed(false)
  }, [])

  // Helper function to count points in an element
  const countElementPoints = (element: Element): number => {
    const tagName = element.tagName.toLowerCase()
    if (tagName === 'path') {
      const d = element.getAttribute('d') || ''
      const coordMatches = d.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
      return coordMatches ? coordMatches.length : 0
    } else if (tagName === 'line') {
      return 2
    } else if (tagName === 'polyline' || tagName === 'polygon') {
      const points = element.getAttribute('points') || ''
      const coordMatches = points.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
      return coordMatches ? coordMatches.length : 0
    } else if (tagName === 'rect') {
      return 4
    } else if (tagName === 'circle' || tagName === 'ellipse') {
      return 1
    }
    return 0
  }

  const collectAllColorsWithCounts = useCallback((nodes: SVGNode[]): Map<string, { paths: number; points: number }> => {
    const colorStats = new Map<string, { paths: number; points: number }>()

    const addColorStat = (color: string, pointCount: number) => {
      const normalized = normalizeColor(color)
      const existing = colorStats.get(normalized) || { paths: 0, points: 0 }
      colorStats.set(normalized, {
        paths: existing.paths + 1,
        points: existing.points + pointCount
      })
    }

    const traverse = (node: SVGNode) => {
      if (!node.isGroup) {
        const element = node.element
        const style = element.getAttribute('style') || ''
        let color = ''

        // Check for fillColor from line fill (customMarkup nodes)
        if (node.fillColor) {
          color = node.fillColor
        } else {
          // Get color from fill or stroke
          const fill = element.getAttribute('fill')
          const stroke = element.getAttribute('stroke')

          if (style.includes('fill:')) {
            const match = style.match(/fill:\s*([^;]+)/)
            if (match && match[1] !== 'none') color = match[1].trim()
          }
          if (!color && style.includes('stroke:')) {
            const match = style.match(/stroke:\s*([^;]+)/)
            if (match && match[1] !== 'none') color = match[1].trim()
          }
          if (!color && fill && fill !== 'none' && fill !== 'transparent') color = fill
          if (!color && stroke && stroke !== 'none' && stroke !== 'transparent') color = stroke
        }

        if (color) {
          const pointCount = countElementPoints(element)
          addColorStat(color, pointCount)
        }
      }
      node.children.forEach(traverse)
    }

    nodes.forEach(traverse)
    return colorStats
  }, [])

  const documentColorStats = collectAllColorsWithCounts(layerNodes)
  const documentColors = Array.from(documentColorStats.keys())

  // Extract path info for the selected node (when single path is selected)
  const getSelectedPathInfo = useCallback(() => {
    if (selectedNodeIds.size !== 1) return null

    const selectedId = Array.from(selectedNodeIds)[0]
    const findNode = (nodes: SVGNode[]): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === selectedId) return node
        const found = findNode(node.children)
        if (found) return found
      }
      return null
    }

    const node = findNode(layerNodes)
    if (!node || node.isGroup) return null

    const element = node.element
    const tagName = element.tagName.toLowerCase()

    // Get color (fill or stroke)
    let color = element.getAttribute('fill') || element.getAttribute('stroke') || ''
    const style = element.getAttribute('style') || ''
    if (style.includes('fill:')) {
      const match = style.match(/fill:\s*([^;]+)/)
      if (match) color = match[1].trim()
    }
    if (!color || color === 'none') {
      if (style.includes('stroke:')) {
        const match = style.match(/stroke:\s*([^;]+)/)
        if (match) color = match[1].trim()
      }
      if (!color || color === 'none') {
        color = element.getAttribute('stroke') || ''
      }
    }

    // Get stroke width
    let strokeWidth = element.getAttribute('stroke-width') || ''
    if (style.includes('stroke-width:')) {
      const match = style.match(/stroke-width:\s*([^;]+)/)
      if (match) strokeWidth = match[1].trim()
    }

    // Count points and get start/end positions from path data
    let pointCount = 0
    let startPos = { x: 0, y: 0 }
    let endPos = { x: 0, y: 0 }
    const allPoints: { x: number; y: number }[] = []

    const parseCoordPair = (match: string): { x: number; y: number } | null => {
      const parsed = match.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/)
      if (parsed) {
        return { x: parseFloat(parsed[1]), y: parseFloat(parsed[2]) }
      }
      return null
    }

    if (tagName === 'path') {
      const d = element.getAttribute('d') || ''
      // Match all coordinate pairs in path data
      const coordMatches = d.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
      if (coordMatches) {
        pointCount = coordMatches.length
        coordMatches.forEach(match => {
          const pt = parseCoordPair(match)
          if (pt) allPoints.push(pt)
        })
        if (allPoints.length > 0) {
          startPos = allPoints[0]
          endPos = allPoints[allPoints.length - 1]
        }
      }
    } else if (tagName === 'line') {
      pointCount = 2
      startPos = {
        x: parseFloat(element.getAttribute('x1') || '0'),
        y: parseFloat(element.getAttribute('y1') || '0')
      }
      endPos = {
        x: parseFloat(element.getAttribute('x2') || '0'),
        y: parseFloat(element.getAttribute('y2') || '0')
      }
      allPoints.push(startPos, endPos)
    } else if (tagName === 'polyline' || tagName === 'polygon') {
      const points = element.getAttribute('points') || ''
      const coordMatches = points.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
      if (coordMatches) {
        pointCount = coordMatches.length
        coordMatches.forEach(match => {
          const pt = parseCoordPair(match)
          if (pt) allPoints.push(pt)
        })
        if (allPoints.length > 0) {
          startPos = allPoints[0]
          endPos = allPoints[allPoints.length - 1]
        }
      }
    } else if (tagName === 'rect') {
      pointCount = 4
      const x = parseFloat(element.getAttribute('x') || '0')
      const y = parseFloat(element.getAttribute('y') || '0')
      const w = parseFloat(element.getAttribute('width') || '0')
      const h = parseFloat(element.getAttribute('height') || '0')
      startPos = { x, y }
      endPos = { x, y }
      allPoints.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h })
    } else if (tagName === 'circle' || tagName === 'ellipse') {
      pointCount = 1
      const cx = parseFloat(element.getAttribute('cx') || '0')
      const cy = parseFloat(element.getAttribute('cy') || '0')
      startPos = { x: cx, y: cy }
      endPos = { x: cx, y: cy }
      allPoints.push(startPos)
    }

    return {
      id: selectedId,
      color: color && color !== 'none' ? normalizeColor(color) : null,
      strokeWidth: strokeWidth || null,
      pointCount,
      startPos,
      endPos,
      allPoints
    }
  }, [selectedNodeIds, layerNodes])

  const selectedPathInfo = getSelectedPathInfo()

  // Extract group info for the selected node (when single group is selected)
  const getSelectedGroupInfo = useCallback(() => {
    if (selectedNodeIds.size !== 1) return null

    const selectedId = Array.from(selectedNodeIds)[0]
    const findNode = (nodes: SVGNode[]): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === selectedId) return node
        const found = findNode(node.children)
        if (found) return found
      }
      return null
    }

    const node = findNode(layerNodes)
    if (!node || !node.isGroup) return null

    // Count fills and paths, and collect colors
    let fillCount = 0
    let pathCount = 0
    const colorCounts: Record<string, { fill: number; path: number }> = {}

    const countElements = (n: SVGNode) => {
      if (!n.isGroup) {
        const element = n.element
        const fill = element.getAttribute('fill')
        const stroke = element.getAttribute('stroke')
        const style = element.getAttribute('style') || ''

        let hasFill = !!(fill && fill !== 'none' && fill !== 'transparent')
        let hasStroke = !!(stroke && stroke !== 'none' && stroke !== 'transparent')

        // Check style
        if (style.includes('fill:')) {
          const match = style.match(/fill:\s*([^;]+)/)
          if (match && match[1].trim() !== 'none' && match[1].trim() !== 'transparent') {
            hasFill = true
          }
        }
        if (style.includes('stroke:')) {
          const match = style.match(/stroke:\s*([^;]+)/)
          if (match && match[1].trim() !== 'none' && match[1].trim() !== 'transparent') {
            hasStroke = true
          }
        }

        // Also check for customMarkup (line fill)
        if (n.customMarkup) {
          hasFill = true
        }

        // Get color for this element
        let color = ''
        if (hasFill) {
          color = fill || ''
          if (style.includes('fill:')) {
            const match = style.match(/fill:\s*([^;]+)/)
            if (match) color = match[1].trim()
          }
          if (n.fillColor) color = n.fillColor
        } else if (hasStroke) {
          color = stroke || ''
          if (style.includes('stroke:')) {
            const match = style.match(/stroke:\s*([^;]+)/)
            if (match) color = match[1].trim()
          }
        }

        if (color && color !== 'none' && color !== 'transparent') {
          const normalizedColor = normalizeColor(color)
          if (!colorCounts[normalizedColor]) {
            colorCounts[normalizedColor] = { fill: 0, path: 0 }
          }
          if (hasFill) {
            fillCount++
            colorCounts[normalizedColor].fill++
          } else {
            pathCount++
            colorCounts[normalizedColor].path++
          }
        } else {
          // Element without clear fill/stroke
          if (hasFill) fillCount++
          else pathCount++
        }
      }
      n.children.forEach(countElements)
    }

    node.children.forEach(countElements)

    return {
      fillCount,
      pathCount,
      colorCounts
    }
  }, [selectedNodeIds, layerNodes])

  const selectedGroupInfo = getSelectedGroupInfo()

  // Clear highlight and point markers when selection changes
  useEffect(() => {
    setHighlightedPathId(null)
    setIsHighlightPersistent(false)
    setShowPointMarkers('none')
    setPointMarkerCoords([])
  }, [selectedNodeIds])

  // Apply/remove highlight effect on the SVG element
  useEffect(() => {
    if (!highlightedPathId) return

    // Find the element in the DOM by ID
    const element = document.getElementById(highlightedPathId)
    if (!element) return

    // Store original styles
    const originalOutline = element.style.outline
    const originalOutlineOffset = element.style.outlineOffset

    // Apply highlight
    element.style.outline = '3px solid #4a90e2'
    element.style.outlineOffset = '2px'

    return () => {
      // Remove highlight
      element.style.outline = originalOutline
      element.style.outlineOffset = originalOutlineOffset
    }
  }, [highlightedPathId])

  // Handlers for status bar path info interaction
  const handlePathInfoMouseEnter = useCallback(() => {
    if (selectedPathInfo && !isHighlightPersistent) {
      setHighlightedPathId(selectedPathInfo.id)
    }
  }, [selectedPathInfo, isHighlightPersistent])

  const handlePathInfoMouseLeave = useCallback(() => {
    if (!isHighlightPersistent) {
      setHighlightedPathId(null)
    }
  }, [isHighlightPersistent])

  const handlePathInfoClick = useCallback(() => {
    if (selectedPathInfo) {
      if (isHighlightPersistent && highlightedPathId === selectedPathInfo.id) {
        // Toggle off
        setIsHighlightPersistent(false)
        setHighlightedPathId(null)
      } else {
        // Toggle on
        setHighlightedPathId(selectedPathInfo.id)
        setIsHighlightPersistent(true)
      }
    }
  }, [selectedPathInfo, isHighlightPersistent, highlightedPathId])

  // Handler for clicking start point info
  const handleStartPointClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedPathInfo) return

    if (showPointMarkers === 'start') {
      // Toggle off
      setShowPointMarkers('none')
      setPointMarkerCoords([])
    } else {
      // Show start point and also enable highlight
      setShowPointMarkers('start')
      setPointMarkerCoords([selectedPathInfo.startPos])
      setHighlightedPathId(selectedPathInfo.id)
      setIsHighlightPersistent(true)
    }
  }, [selectedPathInfo, showPointMarkers])

  // Handler for clicking end point info
  const handleEndPointClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedPathInfo) return

    if (showPointMarkers === 'end') {
      // Toggle off
      setShowPointMarkers('none')
      setPointMarkerCoords([])
    } else {
      // Show end point and also enable highlight
      setShowPointMarkers('end')
      setPointMarkerCoords([selectedPathInfo.endPos])
      setHighlightedPathId(selectedPathInfo.id)
      setIsHighlightPersistent(true)
    }
  }, [selectedPathInfo, showPointMarkers])

  // Handler for clicking point count info
  const handlePointCountClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedPathInfo) return

    if (showPointMarkers === 'all') {
      // Toggle off
      setShowPointMarkers('none')
      setPointMarkerCoords([])
    } else {
      // Show all points and also enable highlight
      setShowPointMarkers('all')
      setPointMarkerCoords(selectedPathInfo.allPoints)
      setHighlightedPathId(selectedPathInfo.id)
      setIsHighlightPersistent(true)
    }
  }, [selectedPathInfo, showPointMarkers])

  // Handler for hovering over path in layer tree
  const handleLayerPathHover = useCallback((pathId: string | null) => {
    if (!isHighlightPersistent) {
      setHighlightedPathId(pathId)
    }
  }, [isHighlightPersistent])

  // Handler for clicking path in layer tree
  const handleLayerPathClick = useCallback((pathId: string) => {
    if (isHighlightPersistent && highlightedPathId === pathId) {
      // Toggle off
      setIsHighlightPersistent(false)
      setHighlightedPathId(null)
    } else {
      // Toggle on
      setHighlightedPathId(pathId)
      setIsHighlightPersistent(true)
    }
  }, [isHighlightPersistent, highlightedPathId])

  // Handle color change from layer tree swatch double-click
  const handleColorChange = useCallback((nodeId: string, oldColor: string, newColor: string, mode?: 'fill' | 'stroke', strokeWidth?: string) => {
    const normalizedOld = normalizeColor(oldColor)
    const normalizedNew = normalizeColor(newColor)

    // Update colors in the node and its children
    const updateNodeColors = (node: SVGNode): SVGNode => {
      // Update element attributes
      const updateElementColor = (element: Element) => {
        const fill = element.getAttribute('fill')
        const stroke = element.getAttribute('stroke')
        const style = element.getAttribute('style')

        if (mode === 'fill') {
          // Set as fill, remove stroke
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
          // Set as stroke, remove fill
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
          // Legacy behavior - just replace colors
          if (fill && normalizeColor(fill) === normalizedOld) {
            element.setAttribute('fill', normalizedNew)
          }
          if (stroke && normalizeColor(stroke) === normalizedOld) {
            element.setAttribute('stroke', normalizedNew)
          }
          if (style) {
            let newStyle = style
            // Replace fill color in style
            newStyle = newStyle.replace(
              /fill:\s*([^;]+)/g,
              (match, color) => normalizeColor(color.trim()) === normalizedOld ? `fill: ${normalizedNew}` : match
            )
            // Replace stroke color in style
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

      // Update customMarkup if present (for line fill)
      let updatedMarkup = node.customMarkup
      if (updatedMarkup && normalizedOld) {
        // Replace stroke colors in the markup
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

      // Update fillColor if it matches
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

    // Find the node and update it
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

  // Handle drag-and-drop reordering of layers
  const handleReorder = useCallback((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    // Find a node by ID
    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    // Find parent of a node
    const findParent = (nodes: SVGNode[], id: string, parent: SVGNode | null = null): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return parent
        const found = findParent(node.children, id, node)
        if (found !== undefined) return found
      }
      return null
    }

    // Remove a node from the tree
    const removeNode = (nodes: SVGNode[], id: string): SVGNode[] => {
      return nodes.filter(n => n.id !== id).map(n => ({
        ...n,
        children: removeNode(n.children, id)
      }))
    }

    // Insert node at position relative to target
    const insertNode = (nodes: SVGNode[], targetId: string, nodeToInsert: SVGNode, pos: 'before' | 'after' | 'inside'): SVGNode[] => {
      const result: SVGNode[] = []
      for (const node of nodes) {
        if (node.id === targetId) {
          if (pos === 'before') {
            result.push(nodeToInsert)
            result.push(node)
          } else if (pos === 'after') {
            result.push(node)
            result.push(nodeToInsert)
          } else if (pos === 'inside') {
            // Add as first child of target
            result.push({
              ...node,
              children: [nodeToInsert, ...node.children]
            })
          }
        } else {
          result.push({
            ...node,
            children: insertNode(node.children, targetId, nodeToInsert, pos)
          })
        }
      }
      return result
    }

    const draggedNode = findNode(layerNodes, draggedId)
    const targetNode = findNode(layerNodes, targetId)

    if (!draggedNode || !targetNode) return

    // Check if we're trying to drop a parent into its own child (would create cycle)
    const isDescendant = (parentNode: SVGNode, childId: string): boolean => {
      if (parentNode.id === childId) return true
      return parentNode.children.some(child => isDescendant(child, childId))
    }

    if (isDescendant(draggedNode, targetId)) return

    // Remove the dragged node first
    let newNodes = removeNode(layerNodes, draggedId)

    // Insert at new position
    newNodes = insertNode(newNodes, targetId, draggedNode, position)

    // Update DOM: move the element
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
    // Find the first selected node to determine target visibility state
    const findFirstSelectedNode = (nodes: SVGNode[]): SVGNode | null => {
      for (const node of nodes) {
        if (selectedNodeIds.has(node.id)) return node
        const found = findFirstSelectedNode(node.children)
        if (found) return found
      }
      return null
    }

    const firstSelected = findFirstSelectedNode(layerNodes)
    if (!firstSelected) return

    // All selected nodes will be set to the opposite of the first node's state
    const targetHiddenState = !firstSelected.isHidden

    const setNodeVisibility = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (selectedNodeIds.has(node.id)) {
          const updateVisibility = (n: SVGNode, hidden: boolean): SVGNode => {
            return {
              ...n,
              isHidden: hidden,
              children: n.children.map(child => updateVisibility(child, hidden))
            }
          }

          return updateVisibility(node, targetHiddenState)
        }
        if (node.children.length > 0) {
          return { ...node, children: setNodeVisibility(node.children) }
        }
        return node
      })
    }

    const updatedNodes = setNodeVisibility(layerNodes)
    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)
  }

  const handleIsolate = () => {
    if (isIsolated) {
      // Un-isolate: show all layers
      const showAllNodes = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          return {
            ...node,
            isHidden: false,
            children: showAllNodes(node.children)
          }
        })
      }

      const updatedNodes = showAllNodes(layerNodes)
      setLayerNodes(updatedNodes)
      setIsIsolated(false)
      rebuildSvgFromLayers(updatedNodes)
    } else {
      // Isolate: hide all except selected
      const isolateNodes = (nodes: SVGNode[], parentSelected: boolean): SVGNode[] => {
        return nodes.map(node => {
          const isSelected = selectedNodeIds.has(node.id)
          const shouldBeVisible = isSelected || parentSelected
          const hidden = !shouldBeVisible

          return {
            ...node,
            isHidden: hidden,
            children: isolateNodes(node.children, shouldBeVisible)
          }
        })
      }

      const updatedNodes = isolateNodes(layerNodes, false)
      setLayerNodes(updatedNodes)
      setIsIsolated(true)
      rebuildSvgFromLayers(updatedNodes)
    }
  }

  const handleDeleteNode = () => {
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
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(updatedNodes)
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

    const updatedNodes = updateNodeChildren(layerNodes)
    setLayerNodes(updatedNodes)
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(updatedNodes)
  }

  // Sort/reorder children by color - puts all elements of same color together
  const handleSortByColor = () => {
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

    const getElementColor = (element: Element): string => {
      // Check for fillColor first (from line fill customMarkup nodes)
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

      return '#000000' // default
    }

    const getNodeColor = (node: SVGNode): string => {
      // Check fillColor first (from line fill)
      if (node.fillColor) return normalizeColor(node.fillColor)
      return getElementColor(node.element)
    }

    // Sort children by color (reorder without creating new groups)
    const sortedChildren = [...selectedNode.children].sort((a, b) => {
      const colorA = getNodeColor(a)
      const colorB = getNodeColor(b)
      return colorA.localeCompare(colorB)
    })

    // Reorder DOM elements to match sorted order
    sortedChildren.forEach(child => {
      selectedNode.element.appendChild(child.element)
    })

    // Update the node in the tree
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
  }

  // Check if sorting by color would change the order
  const canSortByColor = (): boolean => {
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

    if (!selectedNode || selectedNode.children.length < 2) return false
    return true
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

        const updatedNodes = ungroupNode(layerNodes, selectedId)
        setLayerNodes(updatedNodes)
        setSelectedNodeIds(new Set())
        rebuildSvgFromLayers(updatedNodes)
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

      const updatedNodes = removeAndGroup(layerNodes)
      setLayerNodes(updatedNodes)
      setSelectedNodeIds(new Set([groupId]))
      setLastSelectedNodeId(groupId)
      rebuildSvgFromLayers(updatedNodes)
    }
  }

  // Check if simplification is possible
  const canSimplify = (): boolean => {
    if (selectedNodeIds.size === 0) return false

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    // Check if any selected node is a path or group with paths
    for (const id of selectedNodeIds) {
      const node = findNode(layerNodes, id)
      if (node) {
        if (!node.isGroup && node.element.tagName.toLowerCase() === 'path') {
          return true
        }
        if (node.isGroup && node.element.querySelectorAll('path').length > 0) {
          return true
        }
      }
    }
    return false
  }

  // Handle simplify paths
  const handleSimplifyPaths = () => {
    if (!canSimplify()) return

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    let totalBefore = 0
    let totalAfter = 0

    for (const id of selectedNodeIds) {
      const node = findNode(layerNodes, id)
      if (!node) continue

      if (!node.isGroup && node.element.tagName.toLowerCase() === 'path') {
        // Single path
        const before = countPathPoints(node.element)
        const result = simplifyPathElement(node.element, {
          tolerance: simplifyTolerance,
          highQuality: true
        })

        if (result) {
          totalBefore += before
          totalAfter += result.simplifiedPoints
          node.element.setAttribute('d', result.pathData)
        }
      } else if (node.isGroup) {
        // Group - simplify all paths within
        const paths = node.element.querySelectorAll('path')
        for (const path of paths) {
          const before = countPathPoints(path)
          const result = simplifyPathElement(path, {
            tolerance: simplifyTolerance,
            highQuality: true
          })

          if (result) {
            totalBefore += before
            totalAfter += result.simplifiedPoints
            path.setAttribute('d', result.pathData)
          }
        }
      }
    }

    if (totalBefore > 0) {
      setSimplifyResult({ before: totalBefore, after: totalAfter })
      rebuildSvgFromLayers(layerNodes)

      const reduction = Math.round((1 - totalAfter / totalBefore) * 100)
      setStatusMessage(`Simplified: ${totalBefore} → ${totalAfter} points (${reduction}% reduction)`)
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
      return
    }

    try {
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

      // Parse the flattened group into new child nodes
      const parseElement = (element: Element, parentId: string): SVGNode[] => {
        const nodes: SVGNode[] = []
        const children = Array.from(element.children)

        children.forEach((child, index) => {
          const tagName = child.tagName.toLowerCase()
          const id = child.getAttribute('id') || `${parentId}-${tagName}-${index}`

          const node: SVGNode = {
            id,
            name: id,
            type: tagName,
            element: child,
            isGroup: tagName === 'g',
            children: tagName === 'g' ? parseElement(child, id) : []
          }
          nodes.push(node)
        })

        return nodes
      }

      // Import the flattened group into the document
      const parent = selectedNode.element.parentElement
      if (parent) {
        const importedGroup = document.importNode(flattenedGroup, true) as SVGGElement
        parent.replaceChild(importedGroup, selectedNode.element)

        // Parse new children from the flattened group
        const newChildren = parseElement(importedGroup, selectedNode.id)

        // Update the node tree with the new flattened structure
        const updateNode = (nodes: SVGNode[]): SVGNode[] => {
          return nodes.map(node => {
            if (node.id === selectedId) {
              return {
                ...node,
                element: importedGroup,
                children: newChildren
              }
            }
            if (node.children.length > 0) {
              return { ...node, children: updateNode(node.children) }
            }
            return node
          })
        }

        const updatedNodes = updateNode(layerNodes)
        setLayerNodes(updatedNodes)
        rebuildSvgFromLayers(updatedNodes)
        setSelectedNodeIds(new Set())
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('Flatten error:', error, message)
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

  // Apply crop to SVG
  const handleApplyCrop = async () => {
    if (!svgContent || !svgDimensions || !window.electron?.cropSVG) {
      setStatusMessage('error:Crop not available - requires Electron')
      return
    }

    // Get crop dimensions in SVG coordinates
    const cropDims = getCropDimensions()

    // Get the canvas container dimensions
    const container = canvasContainerRef.current
    if (!container) {
      setStatusMessage('error:Could not find canvas container')
      return
    }

    // Get container rect to verify it exists (dimensions used for coordinate transform)
    container.getBoundingClientRect()

    // The SVG is centered at the viewport center, then transformed by offset and scale
    // The crop overlay is always centered at the viewport center.
    // To convert the crop center from viewport to SVG coordinates:
    // svgCenterX = -offset.x / scale + svgDimensions.width / 2
    // svgCenterY = -offset.y / scale + svgDimensions.height / 2

    const svgCenterX = -offset.x / scale + svgDimensions.width / 2
    const svgCenterY = -offset.y / scale + svgDimensions.height / 2

    // Crop box in SVG coordinates
    const cropX = svgCenterX - cropDims.width / 2
    const cropY = svgCenterY - cropDims.height / 2

    setStatusMessage('Applying crop...')
    setIsProcessing(true)

    try {
      const croppedSvg = await window.electron.cropSVG({
        svg: svgContent,
        x: cropX,
        y: cropY,
        width: cropDims.width,
        height: cropDims.height
      })

      // Update SVG content with cropped result
      setSvgContent(croppedSvg)
      setShowCrop(false)
      setStatusMessage(`Cropped to ${cropDims.width.toFixed(0)} × ${cropDims.height.toFixed(0)} px`)

      // Reset pan/zoom
      setScale(1)
      setOffset({ x: 0, y: 0 })
    } catch (err) {
      console.error('Crop failed:', err)
      setStatusMessage(`error:Crop failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
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
        case 's':
          if (canSortByColor()) {
            e.preventDefault()
            handleSortByColor()
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
              title="Group by Color (P) - Create subgroups for each color"
            >
              🎨
            </button>
            <button
              className="action-button"
              onClick={handleSortByColor}
              disabled={!canSortByColor()}
              title="Shape Type Sort (S) - Reorder children by color"
            >
              ⇅
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
              onClick={handleSimplifyPaths}
              disabled={!canSimplify()}
              title={`Simplify Paths - Reduce points (tolerance: ${simplifyTolerance})`}
            >
              ✂
            </button>
{/* Visibility and delete buttons hidden - use keyboard shortcuts V and D instead */}
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
              onColorChange={handleColorChange}
              onReorder={handleReorder}
              onPathHover={handleLayerPathHover}
              onPathClick={handleLayerPathClick}
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
            <button
              className="crop-apply-button"
              onClick={handleApplyCrop}
              title="Apply crop - clips SVG content to crop region"
              style={{
                marginLeft: '1rem',
                padding: '0.4rem 1rem',
                background: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}
            >
              ✓ Apply Crop
            </button>
          </div>
        )}
        <div ref={canvasContainerRef} className="canvas-container">
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

          {/* Point markers overlay */}
          {pointMarkerCoords.length > 0 && svgDimensions && (
            <div
              className="point-markers-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                zIndex: 30,
              }}
            >
              {pointMarkerCoords.map((pt, index) => {
                const isStart = showPointMarkers === 'start' || (showPointMarkers === 'all' && index === 0)
                const isEnd = showPointMarkers === 'end' || (showPointMarkers === 'all' && index === pointMarkerCoords.length - 1)
                const size = showPointMarkers === 'all' ? 6 : 10

                return (
                  <div
                    key={index}
                    className="point-marker"
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${offset.x + pt.x * scale}px)`,
                      top: `calc(50% + ${offset.y + pt.y * scale}px)`,
                      width: size,
                      height: size,
                      borderRadius: '50%',
                      backgroundColor: isStart ? '#27ae60' : isEnd ? '#e74c3c' : '#e74c3c',
                      border: '1px solid white',
                      transform: 'translate(-50%, -50%)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                )
              })}
            </div>
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
            {fileName && <span className="status-filename">{fileName}</span>}
            {statusMessage && (
              <span className={`status-message ${statusMessage.startsWith('error:') ? 'error' : ''}`}>
                {statusMessage.startsWith('error:') ? statusMessage.slice(6) : statusMessage}
              </span>
            )}
          </div>
          <div className="status-bar-center">
            {svgDimensions && (
              <span className="status-dimensions">
                {svgDimensions.width} × {svgDimensions.height} px • {(svgDimensions.width / 96).toFixed(2)} × {(svgDimensions.height / 96).toFixed(2)} in • {(svgDimensions.width / 37.8).toFixed(2)} × {(svgDimensions.height / 37.8).toFixed(2)} cm
              </span>
            )}
          </div>
          <div className="status-bar-right">
            {selectedPathInfo && (
              <div
                className={`status-path-info ${isHighlightPersistent ? 'highlight-active' : ''}`}
                onMouseEnter={handlePathInfoMouseEnter}
                onMouseLeave={handlePathInfoMouseLeave}
                onClick={handlePathInfoClick}
                title={isHighlightPersistent ? 'Click to hide highlight' : 'Hover to highlight, click to lock'}
              >
                {selectedPathInfo.color && (
                  <span className="path-info-item">
                    <span className="path-info-swatch" style={{ backgroundColor: selectedPathInfo.color }} />
                    {selectedPathInfo.color}
                  </span>
                )}
                {selectedPathInfo.strokeWidth && (
                  <span className="path-info-item">
                    stroke: {selectedPathInfo.strokeWidth}
                  </span>
                )}
                <span
                  className={`path-info-item clickable ${showPointMarkers === 'all' ? 'active' : ''}`}
                  onClick={handlePointCountClick}
                  title="Click to show all points"
                >
                  {selectedPathInfo.pointCount} pts
                </span>
                <span
                  className={`path-info-item clickable ${showPointMarkers === 'start' ? 'active' : ''}`}
                  onClick={handleStartPointClick}
                  title="Click to show start point"
                >
                  start: ({selectedPathInfo.startPos.x.toFixed(1)}, {selectedPathInfo.startPos.y.toFixed(1)})
                </span>
                <span
                  className={`path-info-item clickable ${showPointMarkers === 'end' ? 'active' : ''}`}
                  onClick={handleEndPointClick}
                  title="Click to show end point"
                >
                  end: ({selectedPathInfo.endPos.x.toFixed(1)}, {selectedPathInfo.endPos.y.toFixed(1)})
                </span>
              </div>
            )}
            {selectedGroupInfo && (
              <div className="status-group-info">
                <span className="group-info-summary">
                  {selectedGroupInfo.fillCount}F / {selectedGroupInfo.pathCount}P
                </span>
                {Object.entries(selectedGroupInfo.colorCounts).map(([color, counts]) => (
                  <span key={color} className="group-color-item">
                    <span className="path-info-swatch" style={{ backgroundColor: color }} />
                    <span className="group-color-counts">
                      {counts.fill > 0 && <span className="count-fill">{counts.fill}F</span>}
                      {counts.path > 0 && <span className="count-path">{counts.path}P</span>}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {!selectedPathInfo && !selectedGroupInfo && documentColors.length > 0 && (
              <div className="status-bar-colors">
                {documentColors.map((color, index) => {
                  const stats = documentColorStats.get(color)
                  return (
                    <span
                      key={index}
                      className="color-stat-item"
                      title={`${color} - ${stats?.paths || 0} paths, ${stats?.points || 0} points`}
                    >
                      <span
                        className="color-swatch"
                        style={{
                          backgroundColor: color,
                        }}
                      />
                      <span className="color-stat-counts">
                        {stats?.paths || 0}/{stats?.points || 0}
                      </span>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
