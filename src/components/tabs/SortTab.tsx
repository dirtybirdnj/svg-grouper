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
import { linesToCompoundPath, HatchLine } from '../../utils/geometry'
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
    isProcessing,
    setIsProcessing,
    setFillTargetNodeIds,
    setOrderData,
    flattenArmed,
    setFlattenArmed,
  } = useAppContext()

  // Ref for the canvas container to get its dimensions
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [splitArmed, setSplitArmed] = useState(false)
  const [weldArmed, setWeldArmed] = useState(false)
  const [sizeSortAscending, setSizeSortAscending] = useState(false) // false = largest first
  const [sizeSortFilter, setSizeSortFilter] = useState<'all' | 'fills' | 'strokes'>('all')
  const [showFilterToolbar, setShowFilterToolbar] = useState(false)
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
    setWeldArmed(false)
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

  const handleGroupByColor = async () => {
    if (selectedNodeIds.size !== 1) return

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

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
    setIsProcessing(false)
  }

  // Sort children by color first, then by element type within each color
  // If shift is held, group by type instead of just sorting
  const handleSortByType = async (e?: React.MouseEvent) => {
    if (selectedNodeIds.size !== 1) return

    const shouldGroup = e?.shiftKey ?? false

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

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

    if (!selectedNode || selectedNode.children.length === 0) {
      setIsProcessing(false)
      return
    }

    // Get color from element
    const getColor = (node: SVGNode): string => {
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
    }

    // Get element type - distinguish between fill paths and stroke paths
    const getType = (node: SVGNode): string => {
      if (node.isGroup) return 'g'

      const element = node.element
      const tagName = element?.tagName?.toLowerCase() || node.type || 'unknown'

      if (tagName === 'path' || tagName === 'polygon' || tagName === 'rect' || tagName === 'circle' || tagName === 'ellipse') {
        const fill = element?.getAttribute('fill')
        const stroke = element?.getAttribute('stroke')
        const style = element?.getAttribute('style') || ''

        const hasFillStyle = style.includes('fill:') && !style.includes('fill:none') && !style.includes('fill: none')
        const hasStrokeStyle = style.includes('stroke:') && !style.includes('stroke:none') && !style.includes('stroke: none')

        const hasFill = hasFillStyle || (fill && fill !== 'none' && fill !== 'transparent')
        const hasStroke = hasStrokeStyle || (stroke && stroke !== 'none' && stroke !== 'transparent')

        if (hasFill && !hasStroke) return 'fill-shape'
        if (hasStroke && !hasFill) return 'stroke-path'
        if (hasFill && hasStroke) return 'fill+stroke'
      }

      return tagName
    }

    // Categorize as fills or lines for grouping
    const getCategory = (node: SVGNode): 'fills' | 'lines' | 'other' => {
      const type = getType(node)
      if (type === 'fill-shape') return 'fills'
      if (type === 'stroke-path' || type === 'line' || type === 'polyline') return 'lines'
      if (type === 'fill+stroke') return 'fills' // Treat as fills
      return 'other'
    }

    const typeOrder: Record<string, number> = {
      'g': 0, 'fill-shape': 1, 'fill+stroke': 2, 'stroke-path': 3,
      'path': 4, 'line': 5, 'polyline': 6, 'polygon': 7,
      'rect': 8, 'circle': 9, 'ellipse': 10, 'text': 11, 'image': 12,
    }

    let newChildren: SVGNode[]

    if (shouldGroup) {
      // Group by type - create subgroups for fills and lines
      const fills: SVGNode[] = []
      const lines: SVGNode[] = []
      const other: SVGNode[] = []

      selectedNode.children.forEach(child => {
        const category = getCategory(child)
        if (category === 'fills') fills.push(child)
        else if (category === 'lines') lines.push(child)
        else other.push(child)
      })

      newChildren = []

      // Create Fills group if there are fills
      if (fills.length > 0) {
        const fillGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const fillGroupId = `fills-${Date.now()}`
        fillGroup.setAttribute('id', fillGroupId)

        fills.forEach(node => fillGroup.appendChild(node.element))
        selectedNode.element.appendChild(fillGroup)

        newChildren.push({
          id: fillGroupId,
          type: 'g',
          name: `Fills (${fills.length})`,
          element: fillGroup,
          isGroup: true,
          children: fills
        })
      }

      // Create Lines group if there are lines
      if (lines.length > 0) {
        const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const lineGroupId = `lines-${Date.now()}`
        lineGroup.setAttribute('id', lineGroupId)

        lines.forEach(node => lineGroup.appendChild(node.element))
        selectedNode.element.appendChild(lineGroup)

        newChildren.push({
          id: lineGroupId,
          type: 'g',
          name: `Lines (${lines.length})`,
          element: lineGroup,
          isGroup: true,
          children: lines
        })
      }

      // Add other elements ungrouped
      newChildren.push(...other)

      setStatusMessage(`Grouped into ${fills.length > 0 ? 'Fills' : ''}${fills.length > 0 && lines.length > 0 ? ' and ' : ''}${lines.length > 0 ? 'Lines' : ''}`)
    } else {
      // Sort children: first by color, then by type
      newChildren = [...selectedNode.children].sort((a, b) => {
        const colorA = getColor(a)
        const colorB = getColor(b)
        const colorCompare = colorA.localeCompare(colorB)
        if (colorCompare !== 0) return colorCompare

        const typeA = getType(a)
        const typeB = getType(b)
        return (typeOrder[typeA] ?? 99) - (typeOrder[typeB] ?? 99)
      })

      // Reorder DOM elements
      newChildren.forEach(child => {
        selectedNode.element.appendChild(child.element)
      })
    }

    // Update the node in the tree
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
    rebuildSvgFromLayers(updatedNodes)
    setIsProcessing(false)
  }

  // Get element type for filtering - checks if element is fill or stroke
  const getElementType = (node: SVGNode): 'fill' | 'stroke' | 'other' => {
    if (node.isGroup) {
      // For groups, determine based on children content
      let hasFillChildren = false
      let hasStrokeChildren = false

      const checkChildren = (n: SVGNode) => {
        if (!n.isGroup) {
          const type = getLeafElementType(n)
          if (type === 'fill') hasFillChildren = true
          if (type === 'stroke') hasStrokeChildren = true
        }
        n.children.forEach(checkChildren)
      }
      checkChildren(node)

      if (hasFillChildren && !hasStrokeChildren) return 'fill'
      if (hasStrokeChildren && !hasFillChildren) return 'stroke'
      return 'other' // Mixed or empty
    }
    return getLeafElementType(node)
  }

  // Get type for a leaf (non-group) element
  const getLeafElementType = (node: SVGNode): 'fill' | 'stroke' | 'other' => {
    const element = node.element
    const fill = element?.getAttribute('fill')
    const stroke = element?.getAttribute('stroke')
    const style = element?.getAttribute('style') || ''

    const hasFillStyle = style.includes('fill:') && !style.includes('fill:none') && !style.includes('fill: none')
    const hasStrokeStyle = style.includes('stroke:') && !style.includes('stroke:none') && !style.includes('stroke: none')

    const hasFill = hasFillStyle || (fill && fill !== 'none' && fill !== 'transparent')
    const hasStroke = hasStrokeStyle || (stroke && stroke !== 'none' && stroke !== 'transparent')

    if (hasFill && !hasStroke) return 'fill'
    if (hasStroke && !hasFill) return 'stroke'
    return 'other'
  }

  // Count fills and strokes in the selected node's children
  const getFilterCounts = useCallback((): { fills: number; strokes: number } => {
    if (selectedNodeIds.size !== 1) return { fills: 0, strokes: 0 }

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

  const filterCounts = getFilterCounts()

  // Get total children count for the selected node
  const getTotalChildrenCount = useCallback((): number => {
    if (selectedNodeIds.size !== 1) return 0

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
    return selectedNode?.children.length || 0
  }, [selectedNodeIds, layerNodes])

  const totalChildrenCount = getTotalChildrenCount()

  // Sort children by size (bounding box area)
  // When filter is applied, extract filtered items into a new sibling group
  const handleSortBySize = async (ascendingOverride?: boolean) => {
    if (selectedNodeIds.size !== 1) return

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

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

    if (!selectedNode || selectedNode.children.length === 0) {
      setIsProcessing(false)
      return
    }

    // Calculate bounding box area for an element
    const getElementArea = (node: SVGNode): number => {
      const element = node.element
      if (!element) return 0

      try {
        // Try to get bounding box from SVG element
        if (element instanceof SVGGraphicsElement && typeof element.getBBox === 'function') {
          const bbox = element.getBBox()
          return bbox.width * bbox.height
        }
      } catch {
        // getBBox can throw if element isn't rendered
      }

      // Fallback: count children or estimate from attributes
      if (node.children.length > 0) {
        return node.children.reduce((sum, child) => sum + getElementArea(child), 0)
      }

      // For paths, estimate from path data length as proxy for complexity/size
      const d = element.getAttribute('d')
      if (d) {
        return d.length // Rough proxy - longer path data usually means larger/more complex shape
      }

      return 0
    }

    // Use override if provided, otherwise use current state
    const ascending = ascendingOverride !== undefined ? ascendingOverride : sizeSortAscending

    if (sizeSortFilter === 'all') {
      // No filter - just sort children in place
      const sortedChildren = [...selectedNode.children].sort((a, b) => {
        const areaA = getElementArea(a)
        const areaB = getElementArea(b)
        return ascending ? areaA - areaB : areaB - areaA
      })

      // Reorder DOM elements
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
    } else {
      // Filter applied - extract matching items into a new sibling group
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

      // Sort extracted children by area
      const sortedExtracted = childrenToExtract.sort((a, b) => {
        const areaA = getElementArea(a)
        const areaB = getElementArea(b)
        return ascending ? areaA - areaB : areaB - areaA
      })

      // Create new group for extracted items
      const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const groupId = `${sizeSortFilter}-${Date.now()}`
      const groupName = sizeSortFilter === 'fills' ? 'Fills' : 'Lines'
      newGroup.setAttribute('id', groupId)

      // Move extracted elements to the new group
      sortedExtracted.forEach(node => {
        newGroup.appendChild(node.element)
      })

      // Insert the new group as a sibling after the selected node
      const parentElement = selectedNode.element.parentElement
      if (parentElement) {
        parentElement.insertBefore(newGroup, selectedNode.element.nextSibling)
      }

      // Create the new group node for the tree
      const newGroupNode: SVGNode = {
        id: groupId,
        type: 'g',
        name: `${groupName} (${sortedExtracted.length})`,
        element: newGroup,
        isGroup: true,
        children: sortedExtracted
      }

      // Update the tree: modify selected node's children and add new sibling group
      const updateNodes = (nodes: SVGNode[]): SVGNode[] => {
        const result: SVGNode[] = []
        for (const node of nodes) {
          if (node.id === selectedId) {
            // Update original node with remaining children
            result.push({ ...node, children: childrenToKeep })
            // Add new group as sibling right after
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
  }

  const canSortBySize = (): boolean => {
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

    return selectedNode !== null && selectedNode.children.length >= 2
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

  // Check if weld is possible (need a selected group with paths)
  const canWeld = (): boolean => {
    if (selectedNodeIds.size === 0) return false

    // Check if any selected node has paths
    const findNodeById = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNodeById(node.children, id)
        if (found) return found
      }
      return null
    }

    for (const nodeId of selectedNodeIds) {
      const node = findNodeById(layerNodes, nodeId)
      if (!node) continue

      // Check if this node or its children have paths
      const hasPaths = (n: SVGNode): boolean => {
        const tagName = n.element.tagName.toLowerCase()
        if (['path', 'line', 'polyline', 'polygon'].includes(tagName)) return true
        return n.children.some(hasPaths)
      }

      if (hasPaths(node)) return true
    }
    return false
  }

  // Handle weld - combine all paths in selected group(s) into a single compound path
  const handleWeld = () => {
    if (!canWeld()) return

    if (!weldArmed) {
      setWeldArmed(true)
      setDeleteArmed(false)
      setSplitArmed(false)
      setFlattenArmed(false)
      setStatusMessage('Click Weld again to confirm - will combine paths into compound path')
      return
    }

    setWeldArmed(false)
    setStatusMessage('')

    // Extract path d attribute as HatchLines
    const pathToLines = (pathD: string): HatchLine[] => {
      const lines: HatchLine[] = []
      // Parse path d attribute to extract line segments
      const commands = pathD.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/gi) || []

      let currentX = 0, currentY = 0
      let startX = 0, startY = 0

      for (const cmd of commands) {
        const type = cmd[0]
        const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

        switch (type) {
          case 'M':
            currentX = args[0]
            currentY = args[1]
            startX = currentX
            startY = currentY
            // Process additional coordinates as implicit L commands
            for (let i = 2; i < args.length; i += 2) {
              const nextX = args[i]
              const nextY = args[i + 1]
              lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
              currentX = nextX
              currentY = nextY
            }
            break
          case 'm':
            currentX += args[0]
            currentY += args[1]
            startX = currentX
            startY = currentY
            for (let i = 2; i < args.length; i += 2) {
              const nextX = currentX + args[i]
              const nextY = currentY + args[i + 1]
              lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
              currentX = nextX
              currentY = nextY
            }
            break
          case 'L':
            for (let i = 0; i < args.length; i += 2) {
              const nextX = args[i]
              const nextY = args[i + 1]
              lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
              currentX = nextX
              currentY = nextY
            }
            break
          case 'l':
            for (let i = 0; i < args.length; i += 2) {
              const nextX = currentX + args[i]
              const nextY = currentY + args[i + 1]
              lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: nextY })
              currentX = nextX
              currentY = nextY
            }
            break
          case 'H':
            for (const x of args) {
              lines.push({ x1: currentX, y1: currentY, x2: x, y2: currentY })
              currentX = x
            }
            break
          case 'h':
            for (const dx of args) {
              const nextX = currentX + dx
              lines.push({ x1: currentX, y1: currentY, x2: nextX, y2: currentY })
              currentX = nextX
            }
            break
          case 'V':
            for (const y of args) {
              lines.push({ x1: currentX, y1: currentY, x2: currentX, y2: y })
              currentY = y
            }
            break
          case 'v':
            for (const dy of args) {
              const nextY = currentY + dy
              lines.push({ x1: currentX, y1: currentY, x2: currentX, y2: nextY })
              currentY = nextY
            }
            break
          case 'Z':
          case 'z':
            if (currentX !== startX || currentY !== startY) {
              lines.push({ x1: currentX, y1: currentY, x2: startX, y2: startY })
            }
            currentX = startX
            currentY = startY
            break
          // For curves (C, S, Q, T, A), we approximate with the start and end points
          case 'C':
            for (let i = 0; i < args.length; i += 6) {
              const endX = args[i + 4]
              const endY = args[i + 5]
              lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
              currentX = endX
              currentY = endY
            }
            break
          case 'c':
            for (let i = 0; i < args.length; i += 6) {
              const endX = currentX + args[i + 4]
              const endY = currentY + args[i + 5]
              lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
              currentX = endX
              currentY = endY
            }
            break
          case 'S':
          case 's':
            for (let i = 0; i < args.length; i += 4) {
              const endX = type === 'S' ? args[i + 2] : currentX + args[i + 2]
              const endY = type === 'S' ? args[i + 3] : currentY + args[i + 3]
              lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
              currentX = endX
              currentY = endY
            }
            break
          case 'Q':
          case 'q':
            for (let i = 0; i < args.length; i += 4) {
              const endX = type === 'Q' ? args[i + 2] : currentX + args[i + 2]
              const endY = type === 'Q' ? args[i + 3] : currentY + args[i + 3]
              lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
              currentX = endX
              currentY = endY
            }
            break
          case 'T':
          case 't':
            for (let i = 0; i < args.length; i += 2) {
              const endX = type === 'T' ? args[i] : currentX + args[i]
              const endY = type === 'T' ? args[i + 1] : currentY + args[i + 1]
              lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
              currentX = endX
              currentY = endY
            }
            break
          case 'A':
          case 'a':
            // Arc - approximate with line to endpoint
            for (let i = 0; i < args.length; i += 7) {
              const endX = type === 'A' ? args[i + 5] : currentX + args[i + 5]
              const endY = type === 'A' ? args[i + 6] : currentY + args[i + 6]
              lines.push({ x1: currentX, y1: currentY, x2: endX, y2: endY })
              currentX = endX
              currentY = endY
            }
            break
        }
      }

      return lines
    }

    // Convert line element to HatchLine
    const lineElementToLine = (el: Element): HatchLine | null => {
      const x1 = parseFloat(el.getAttribute('x1') || '0')
      const y1 = parseFloat(el.getAttribute('y1') || '0')
      const x2 = parseFloat(el.getAttribute('x2') || '0')
      const y2 = parseFloat(el.getAttribute('y2') || '0')
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null
      return { x1, y1, x2, y2 }
    }

    // Collect all lines from a node recursively
    const collectLines = (node: SVGNode): HatchLine[] => {
      const lines: HatchLine[] = []
      const tagName = node.element.tagName.toLowerCase()

      if (tagName === 'path') {
        const d = node.element.getAttribute('d')
        if (d) {
          lines.push(...pathToLines(d))
        }
      } else if (tagName === 'line') {
        const line = lineElementToLine(node.element)
        if (line) lines.push(line)
      } else if (tagName === 'polyline' || tagName === 'polygon') {
        const points = node.element.getAttribute('points') || ''
        const pairs = points.trim().split(/[\s,]+/).map(parseFloat)
        for (let i = 0; i < pairs.length - 3; i += 2) {
          lines.push({ x1: pairs[i], y1: pairs[i + 1], x2: pairs[i + 2], y2: pairs[i + 3] })
        }
        // Close polygon
        if (tagName === 'polygon' && pairs.length >= 4) {
          lines.push({
            x1: pairs[pairs.length - 2],
            y1: pairs[pairs.length - 1],
            x2: pairs[0],
            y2: pairs[1]
          })
        }
      }

      // Collect from children
      for (const child of node.children) {
        lines.push(...collectLines(child))
      }

      return lines
    }

    // Get color from an element
    const getElementColor = (el: Element): string | null => {
      const stroke = el.getAttribute('stroke')
      const fill = el.getAttribute('fill')
      const style = el.getAttribute('style') || ''

      const strokeMatch = style.match(/stroke:\s*([^;]+)/)
      if (strokeMatch && strokeMatch[1] !== 'none' && strokeMatch[1] !== 'transparent') {
        return strokeMatch[1].trim()
      }
      if (stroke && stroke !== 'none' && stroke !== 'transparent') return stroke

      const fillMatch = style.match(/fill:\s*([^;]+)/)
      if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
        return fillMatch[1].trim()
      }
      if (fill && fill !== 'none' && fill !== 'transparent') return fill

      return null
    }

    // Get stroke color from node - recursively search children if needed
    const getStrokeColor = (node: SVGNode): string => {
      // First try the node's own element
      const color = getElementColor(node.element)
      if (color) return color

      // If it's a group, search children recursively for first color
      for (const child of node.children) {
        const childColor = getStrokeColor(child)
        if (childColor !== '#000000') return childColor
      }

      return '#000000'
    }

    // Get stroke width from an element
    const getElementStrokeWidth = (el: Element): string | null => {
      const strokeWidth = el.getAttribute('stroke-width')
      const style = el.getAttribute('style') || ''

      const widthMatch = style.match(/stroke-width:\s*([^;]+)/)
      if (widthMatch) return widthMatch[1].trim()
      if (strokeWidth) return strokeWidth
      return null
    }

    // Get stroke width from node - recursively search children if needed
    const getStrokeWidth = (node: SVGNode): string => {
      const width = getElementStrokeWidth(node.element)
      if (width) return width

      // If it's a group, search children recursively
      for (const child of node.children) {
        const childWidth = getStrokeWidth(child)
        if (childWidth !== '1') return childWidth
      }

      return '1'
    }

    // Find node by id
    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    // Process each selected node
    let totalBefore = 0
    let totalAfter = 0

    const updateNodes = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (selectedNodeIds.has(node.id)) {
          // Collect all lines from this node
          const lines = collectLines(node)
          totalBefore += lines.length

          if (lines.length === 0) return node

          // Get color and stroke width from first drawable child
          const color = getStrokeColor(node)
          const strokeWidth = getStrokeWidth(node)

          // Create compound path
          const pathD = linesToCompoundPath(lines, 2)
          totalAfter++

          // Create new path element
          const nodeId = `welded-${node.id}`
          const pathMarkup = `<path id="${nodeId}" d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`

          // Parse to create element
          const parser = new DOMParser()
          const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${pathMarkup}</svg>`, 'image/svg+xml')
          const pathElement = doc.querySelector('path') as Element

          // Return new node with compound path
          return {
            ...node,
            id: nodeId,
            name: `Welded (${lines.length} lines)`,
            type: 'path',
            element: pathElement,
            isGroup: false,
            children: [],
            customMarkup: pathMarkup,
          }
        }

        // Process children recursively
        if (node.children.length > 0) {
          return { ...node, children: updateNodes(node.children) }
        }

        return node
      })
    }

    const updatedNodes = updateNodes(layerNodes)
    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)

    setStatusMessage(`Welded: ${totalBefore} segments → ${totalAfter} compound path(s)`)
  }

  // Check if flip order is possible
  const canFlipOrder = (): boolean => {
    // Can flip if multiple nodes selected, or if a single selected node has children
    if (selectedNodeIds.size > 1) return true
    if (selectedNodeIds.size === 1) {
      const findNodeById = (nodes: SVGNode[], id: string): SVGNode | null => {
        for (const node of nodes) {
          if (node.id === id) return node
          const found = findNodeById(node.children, id)
          if (found) return found
        }
        return null
      }
      const nodeId = Array.from(selectedNodeIds)[0]
      const node = findNodeById(layerNodes, nodeId)
      return node ? node.children.length > 1 : false
    }
    return false
  }

  // Handle flip order - reverse the order of selected nodes or children of a selected group
  const handleFlipOrder = () => {
    if (!canFlipOrder()) return

    const findNodeById = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNodeById(node.children, id)
        if (found) return found
      }
      return null
    }

    if (selectedNodeIds.size === 1) {
      // Single node selected - flip its children
      const nodeId = Array.from(selectedNodeIds)[0]

      const flipChildrenOfNode = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.id === nodeId) {
            // Reverse children order
            const reversedChildren = [...node.children].reverse()
            // Also reverse DOM order
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

      const node = findNodeById(layerNodes, nodeId)
      setStatusMessage(`Flipped order of ${node?.children.length || 0} children`)
    } else {
      // Multiple nodes selected - flip their order within their common parent
      // Find the common parent and flip selected siblings
      const selectedIds = Array.from(selectedNodeIds)

      const flipSelectedInNodes = (nodes: SVGNode[]): SVGNode[] => {
        // Check if selected nodes are at this level
        const selectedAtThisLevel = nodes.filter(n => selectedIds.includes(n.id))

        if (selectedAtThisLevel.length > 1) {
          // Get indices of selected nodes
          const indices = selectedAtThisLevel.map(n => nodes.findIndex(node => node.id === n.id))
          const sorted = [...indices].sort((a, b) => a - b)

          // Reverse the selected nodes within the array
          const newNodes = [...nodes]
          for (let i = 0; i < sorted.length; i++) {
            newNodes[sorted[i]] = nodes[sorted[sorted.length - 1 - i]]
          }

          // Update DOM order for all nodes at this level
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

        // Recurse into children
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
      setStatusMessage(`Flipped order of ${selectedIds.length} selected items`)
    }
  }

  // Handle flatten all - remove empty layers, ungroup all, group by color
  const handleFlattenAll = () => {
    if (!flattenArmed) {
      setFlattenArmed(true)
      setDeleteArmed(false)
      setSplitArmed(false)
      setStatusMessage('Click Flatten again to confirm')
      return
    }

    setFlattenArmed(false)
    setStatusMessage('')

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

    const deleteEmptyLayers = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.filter(node => {
        if (node.customMarkup) {
          return true
        }
        if (node.isGroup && node.children.length === 0) {
          node.element.remove()
          return false
        }
        if (node.children.length > 0) {
          node.children = deleteEmptyLayers(node.children)
          if (node.isGroup && node.children.length === 0 && !node.customMarkup) {
            node.element.remove()
            return false
          }
        }
        return true
      })
    }

    const ungroupAll = (nodes: SVGNode[]): SVGNode[] => {
      let result: SVGNode[] = []

      for (const node of nodes) {
        if (node.customMarkup) {
          result.push(node)
        } else if (node.isGroup && node.children.length > 0) {
          const ungroupedChildren = ungroupAll(node.children)
          const parent = node.element.parentElement
          if (parent) {
            for (const child of ungroupedChildren) {
              if (!child.customMarkup) {
                parent.insertBefore(child.element, node.element)
              }
            }
            node.element.remove()
          }
          for (const child of ungroupedChildren) {
            result.push(child)
          }
        } else if (!node.isGroup) {
          result.push(node)
        }
      }

      return result
    }

    const groupByColor = (nodes: SVGNode[]): SVGNode[] => {
      const colorGroups = new Map<string, SVGNode[]>()
      nodes.forEach(node => {
        let color: string | null = null
        if (node.customMarkup && node.fillColor) {
          color = node.fillColor
        } else {
          color = getElementColor(node.element)
        }
        const colorKey = color || 'no-color'
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

    // Execute flatten operations
    let currentNodes = deleteEmptyLayers([...layerNodes])
    currentNodes = ungroupAll(currentNodes)
    currentNodes = groupByColor(currentNodes)

    setLayerNodes(currentNodes)
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(currentNodes)
    setStatusMessage('Flattened: removed empty layers, ungrouped all, grouped by color')
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

  // Check if SVG has filled shapes (not line-based content)
  const countFilledShapes = (): number => {
    if (!svgContent) return 0

    const parser = new DOMParser()
    const doc = parser.parseFromString(svgContent, 'image/svg+xml')
    let fillCount = 0

    const checkElement = (el: Element) => {
      const tagName = el.tagName.toLowerCase()
      if (['path', 'polygon', 'rect', 'circle', 'ellipse'].includes(tagName)) {
        const fill = el.getAttribute('fill')
        const stroke = el.getAttribute('stroke')
        const style = el.getAttribute('style') || ''

        // Check if element has fill but no stroke
        let hasFill = false
        let hasStroke = false

        if (style.includes('fill:')) {
          const fillMatch = style.match(/fill:\s*([^;]+)/)
          hasFill = fillMatch ? fillMatch[1].trim() !== 'none' : false
        } else if (fill && fill !== 'none') {
          hasFill = true
        }

        if (style.includes('stroke:')) {
          const strokeMatch = style.match(/stroke:\s*([^;]+)/)
          hasStroke = strokeMatch ? strokeMatch[1].trim() !== 'none' : false
        } else if (stroke && stroke !== 'none') {
          hasStroke = true
        }

        if (hasFill && !hasStroke) {
          fillCount++
        }
      }

      // Check children
      for (const child of Array.from(el.children)) {
        checkElement(child)
      }
    }

    const svg = doc.querySelector('svg')
    if (svg) {
      for (const child of Array.from(svg.children)) {
        checkElement(child)
      }
    }

    return fillCount
  }

  // Apply crop to SVG
  const handleApplyCrop = async () => {
    console.log('[Crop] handleApplyCrop called')
    console.log('[Crop] svgContent exists:', !!svgContent)
    console.log('[Crop] svgDimensions:', svgDimensions)
    console.log('[Crop] window.electron?.cropSVG exists:', !!window.electron?.cropSVG)

    if (!svgContent || !svgDimensions || !window.electron?.cropSVG) {
      setStatusMessage('error:Crop not available - requires Electron')
      console.log('[Crop] Aborting: missing requirements')
      return
    }

    // Check for filled shapes
    const filledShapeCount = countFilledShapes()
    console.log('[Crop] Filled shape count:', filledShapeCount)
    if (filledShapeCount > 0) {
      setStatusMessage(`Cropping ${filledShapeCount} filled shapes (will become outlines). Use Fill to convert to lines first for better results.`)
    }

    // Get crop dimensions in SVG coordinates
    const cropDims = getCropDimensions()
    console.log('[Crop] Crop dimensions:', cropDims)

    // Get the canvas container dimensions
    const container = canvasContainerRef.current
    if (!container) {
      setStatusMessage('error:Could not find canvas container')
      console.log('[Crop] Aborting: no canvas container')
      return
    }

    // Get container rect for coordinate transform
    const containerRect = container.getBoundingClientRect()

    // Find the actual SVG element to get its rendered size
    const svgElement = container.querySelector('svg')
    if (!svgElement) {
      console.log('[Crop] ERROR: Could not find SVG element')
      setStatusMessage('error:Could not find SVG element')
      return
    }

    // Get the SVG element's bounding rect to see its actual rendered size
    const svgRect = svgElement.getBoundingClientRect()
    console.log('[Crop] SVG element rect:', svgRect.width.toFixed(2), 'x', svgRect.height.toFixed(2))

    // The SVG is displayed with CSS max-width: 90%; max-height: 90%
    // This means its base (untransformed) size is constrained to fit in 90% of the container
    // Then the transform scale is applied on top
    //
    // So the SVG's rendered size = (baseSize * scale) where baseSize fits in 90% of container
    // We can calculate baseSize from: renderedSize / scale = baseSize
    const baseSvgWidth = svgRect.width / scale
    const baseSvgHeight = svgRect.height / scale
    console.log('[Crop] SVG base size (before zoom):', baseSvgWidth.toFixed(2), 'x', baseSvgHeight.toFixed(2))

    // The base scale is the ratio of base rendered size to SVG coordinate size
    const baseScale = baseSvgWidth / svgDimensions.width
    console.log('[Crop] Base scale (SVG coords to base pixels):', baseScale.toFixed(4))

    // Total effective scale from SVG coords to current viewport pixels
    const effectiveScale = baseScale * scale

    console.log('[Crop] Container size:', containerRect.width, 'x', containerRect.height)
    console.log('[Crop] SVG dimensions:', svgDimensions.width, 'x', svgDimensions.height)
    console.log('[Crop] Base scale (fit to container):', baseScale.toFixed(4))
    console.log('[Crop] User zoom scale:', scale.toFixed(4))
    console.log('[Crop] Effective scale:', effectiveScale.toFixed(4))
    console.log('[Crop] Current offset:', offset)

    // The crop overlay is centered at the viewport center.
    // The SVG (after base scale + translation + user scale) has its center at:
    //   viewport position = (containerWidth/2 + offset.x, containerHeight/2 + offset.y)
    //
    // To find the SVG coordinate at viewport center:
    // Distance from SVG center (in viewport) to viewport center = (-offset.x, -offset.y)
    // This distance in SVG coords = (-offset.x / effectiveScale, -offset.y / effectiveScale)
    // SVG coord at viewport center = SVG center + distance
    //   = (svgWidth/2 - offset.x/effectiveScale, svgHeight/2 - offset.y/effectiveScale)

    const svgCenterX = svgDimensions.width / 2 - offset.x / effectiveScale
    const svgCenterY = svgDimensions.height / 2 - offset.y / effectiveScale

    console.log('[Crop] SVG coord at viewport center:', { svgCenterX: svgCenterX.toFixed(2), svgCenterY: svgCenterY.toFixed(2) })

    // Crop box in SVG coordinates - centered at the viewport center's SVG position
    let cropX = svgCenterX - cropDims.width / 2
    let cropY = svgCenterY - cropDims.height / 2
    console.log('[Crop] Raw crop box: x=', cropX.toFixed(2), 'y=', cropY.toFixed(2), 'w=', cropDims.width.toFixed(2), 'h=', cropDims.height.toFixed(2))

    // Clamp crop box to SVG bounds
    if (cropX < 0) {
      console.log('[Crop] Clamping X from', cropX.toFixed(2), 'to 0')
      cropX = 0
    }
    if (cropY < 0) {
      console.log('[Crop] Clamping Y from', cropY.toFixed(2), 'to 0')
      cropY = 0
    }
    if (cropX + cropDims.width > svgDimensions.width) {
      const oldX = cropX
      cropX = svgDimensions.width - cropDims.width
      console.log('[Crop] Clamping X from', oldX.toFixed(2), 'to', cropX.toFixed(2), '(right edge)')
    }
    if (cropY + cropDims.height > svgDimensions.height) {
      const oldY = cropY
      cropY = svgDimensions.height - cropDims.height
      console.log('[Crop] Clamping Y from', oldY.toFixed(2), 'to', cropY.toFixed(2), '(bottom edge)')
    }

    console.log('[Crop] Final crop box: x=', cropX.toFixed(2), 'y=', cropY.toFixed(2), 'w=', cropDims.width.toFixed(2), 'h=', cropDims.height.toFixed(2))

    if (filledShapeCount === 0) {
      setStatusMessage('Applying crop...')
    }
    setIsProcessing(true)

    try {
      console.log('[Crop] Calling window.electron.cropSVG...')
      console.log('[Crop] Input SVG length:', svgContent.length)

      const croppedSvg = await window.electron.cropSVG({
        svg: svgContent,
        x: cropX,
        y: cropY,
        width: cropDims.width,
        height: cropDims.height
      })

      console.log('[Crop] Received cropped SVG, length:', croppedSvg.length)
      console.log('[Crop] First 500 chars of result:', croppedSvg.substring(0, 500))

      // Treat the cropped SVG as a new file - reset all state
      // Clear layer nodes and selection
      setLayerNodes([])
      setSelectedNodeIds(new Set())
      setLastSelectedNodeId(null)

      // Clear any fill/order mode data
      setFillTargetNodeIds([])
      setOrderData(null)

      // Reset pan/zoom before loading new content
      setScale(1)
      setOffset({ x: 0, y: 0 })

      // Clear the SVG dimensions so they get recalculated
      setSvgDimensions(null)

      // Ensure the next parse is NOT skipped
      skipNextParse.current = false
      parsingRef.current = false

      // Hide crop overlay
      setShowCrop(false)

      // Update SVG content with cropped result - this will trigger re-parsing
      setSvgContent(croppedSvg)

      setStatusMessage(`Cropped to ${cropDims.width.toFixed(0)} × ${cropDims.height.toFixed(0)} px`)
      console.log('[Crop] Crop complete, all state reset for new SVG')
    } catch (err) {
      console.error('[Crop] Crop failed:', err)
      setStatusMessage(`error:Crop failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Listen for apply-crop event from header button
  useEffect(() => {
    const handleApplyCropEvent = () => {
      console.log('[Crop] Received apply-crop event')
      handleApplyCrop()
    }

    window.addEventListener('apply-crop', handleApplyCropEvent)
    return () => window.removeEventListener('apply-crop', handleApplyCropEvent)
  }, [svgContent, svgDimensions, scale, offset, cropSize, cropAspectRatio])

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
          if (canSortBySize()) {
            e.preventDefault()
            setShowFilterToolbar(!showFilterToolbar)
            disarmActions()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNodeIds, layerNodes, deleteArmed, splitArmed, disarmActions, showFilterToolbar])

  return (
    <div className="sort-tab">
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <h2>Layers</h2>
          <div className="sidebar-actions">
            <button
              className={`action-button ${showFilterToolbar ? 'active' : ''}`}
              onClick={() => setShowFilterToolbar(!showFilterToolbar)}
              disabled={!canSortBySize()}
            >
              ▼
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
              onClick={handleSimplifyPaths}
              disabled={!canSimplify()}
              title={`Simplify Paths - Reduce points (tolerance: ${simplifyTolerance})`}
            >
              ✂
            </button>
            <button
              className="action-button"
              onClick={handleWeld}
              disabled={!canWeld()}
              style={{
                background: weldArmed ? '#e74c3c' : undefined,
                color: weldArmed ? 'white' : undefined,
              }}
              title={weldArmed ? "Click again to confirm weld" : "Weld - Combine paths into compound path (reduces path count)"}
            >
              ⚡
            </button>
            <div className="toolbar-divider" />
            <button
              className="action-button"
              onClick={handleFlipOrder}
              disabled={!canFlipOrder()}
              title="Flip Order - Reverse order of selected items or children of selected group"
            >
              ⇅
            </button>
            <button
              className="action-button"
              onClick={handleFlattenAll}
              disabled={layerNodes.length === 0}
              style={{
                background: flattenArmed ? '#e74c3c' : undefined,
                color: flattenArmed ? 'white' : undefined,
              }}
              title={flattenArmed ? "Click again to confirm flatten" : "Flatten - Remove empty layers, ungroup all, group by color"}
            >
              🗄️
            </button>
{/* Visibility and delete buttons hidden - use keyboard shortcuts V and D instead */}
          </div>
        </div>
        <div className="sidebar-content">
          {isProcessing && (
            <div className="sidebar-processing-overlay" />
          )}
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
          </div>
        )}
        {showFilterToolbar && canSortBySize() && (
          <div className="filter-options-bar">
            <div className="filter-section">
              <span className="filter-label">Filter:</span>
              <div className="filter-buttons">
                <button
                  className={`filter-button ${sizeSortFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setSizeSortFilter('all')}
                >
                  All ({totalChildrenCount})
                </button>
                <button
                  className={`filter-button ${sizeSortFilter === 'fills' ? 'active' : ''}`}
                  onClick={() => setSizeSortFilter('fills')}
                  disabled={filterCounts.fills === 0}
                >
                  Fills ({filterCounts.fills})
                </button>
                <button
                  className={`filter-button ${sizeSortFilter === 'strokes' ? 'active' : ''}`}
                  onClick={() => setSizeSortFilter('strokes')}
                  disabled={filterCounts.strokes === 0}
                >
                  Lines ({filterCounts.strokes})
                </button>
              </div>
            </div>
            <div className="filter-divider" />
            <div className="filter-section">
              <span className="filter-label">Size:</span>
              <div className="filter-buttons">
                <button
                  className={`filter-button ${!sizeSortAscending ? 'active' : ''}`}
                  onClick={() => {
                    setSizeSortAscending(false)
                    handleSortBySize(false)
                  }}
                  title="Sort largest first"
                >
                  ↓ Lg
                </button>
                <button
                  className={`filter-button ${sizeSortAscending ? 'active' : ''}`}
                  onClick={() => {
                    setSizeSortAscending(true)
                    handleSortBySize(true)
                  }}
                  title="Sort smallest first"
                >
                  ↑ Sm
                </button>
              </div>
              <button
                className="filter-button"
                onClick={(e) => handleSortByType(e)}
                title="Sort by color, then by type (fills before lines). Shift+click to group into Fills and Lines"
              >
                Type Sort
              </button>
            </div>
            {sizeSortFilter !== 'all' && (
              <div className="filter-actions">
                <button
                  className="filter-apply-button"
                  onClick={() => handleSortBySize()}
                  disabled={
                    (sizeSortFilter === 'fills' && filterCounts.fills === 0) ||
                    (sizeSortFilter === 'strokes' && filterCounts.strokes === 0)
                  }
                >
                  Extract {sizeSortFilter === 'fills' ? filterCounts.fills : filterCounts.strokes} {sizeSortFilter === 'fills' ? 'fills' : 'lines'}
                </button>
              </div>
            )}
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
