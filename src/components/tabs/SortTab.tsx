import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAppContext } from '../../context/AppContext'
import FileUpload from '../FileUpload'
import SVGCanvas from '../SVGCanvas'
import LayerTree from '../LayerTree'
import LoadingOverlay from '../LoadingOverlay'
import { Rulers, RulerUnit } from '../shared/Rulers'
import { ScaleControls } from '../shared/ScaleControls'
import { SVGNode } from '../../types/svg'
import { parseSVGFlatProgressively } from '../../utils/svgParser'
import { normalizeColor } from '../../utils/colorExtractor'
import { simplifyPathElement, countPathPoints, SIMPLIFY_PRESETS } from '../../utils/pathSimplify'
import { linesToCompoundPath, HatchLine, Rect } from '../../utils/geometry'
import { cropSVGInBrowser, getCropDimensions } from '../../utils/cropSVG'
import { analyzeSVGDimensions } from '../../utils/svgDimensions'
import { scaleArtwork } from '../../utils/svgTransform'
import {
  findNodeById,
  updateNodeChildren,
  removeNodeById,
  insertNodeAtPosition,
  findSiblings,
  isDescendant,
  updateVisibilityForSelected,
  showAllNodes,
  isolateNodes,
} from '../../utils/nodeUtils'
import {
  getElementColor,
  getNodeColor,
  getNodeStrokeWidth,
} from '../../utils/elementColor'
import { useArrangeTools } from '../../hooks/useArrangeTools'
import { useToolHandlers } from '../../hooks/useToolHandlers'
import './SortTab.css'

export default function SortTab() {
  const {
    svgContent,
    setSvgContent,
    fileName,
    setFileName,
    svgDimensions,
    setSvgDimensions,
    syncSvgContent,
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
    originalSvgAttrs,
    arrangeHandlers,
    toolHandlers,
    isProcessing,
    setIsProcessing,
    setFillTargetNodeIds,
    setOrderData,
    flattenArmed,
    setFlattenArmed,
    flattenOnImport,
    setPendingFlatten,
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

  // Ruler and scaling state
  const [showRulers, setShowRulers] = useState(false)
  const [rulerUnit, setRulerUnit] = useState<RulerUnit>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('svg-grouper-ruler-unit')
    return (saved === 'in' || saved === 'mm') ? saved : 'in'
  })
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 })
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null)

  // Use extracted arrange tools hook
  const {
    handleMoveUp,
    handleMoveDown,
    handleBringToFront,
    handleSendToBack,
  } = useArrangeTools({
    selectedNodeIds,
    layerNodes,
    setLayerNodes,
    rebuildSvgFromLayers,
  })

  // Use extracted tool handlers hook
  const {
    handleConvertToFills,
    handleNormalizeColors,
    handleSeparateCompoundPaths,
  } = useToolHandlers({
    selectedNodeIds,
    layerNodes,
    rebuildSvgFromLayers,
    syncSvgContent,
    skipNextParse,
    setStatusMessage,
  })

  const [isHighlightPersistent, setIsHighlightPersistent] = useState(false)
  const [showPointMarkers, setShowPointMarkers] = useState<'none' | 'start' | 'end' | 'all'>('none')
  const [pointMarkerCoords, setPointMarkerCoords] = useState<{ x: number; y: number }[]>([])

  // Simplification state
  const [simplifyTolerance] = useState<number>(SIMPLIFY_PRESETS.moderate)

  // Memoized crop dimensions for display
  const cropDims = useMemo(
    () => getCropDimensions(svgDimensions, cropAspectRatio, cropSize),
    [svgDimensions, cropAspectRatio, cropSize]
  )

  const handleFileLoad = useCallback((content: string, name: string, dimensions?: { width: number; height: number }) => {
    // Reset original SVG attributes when loading a new file
    // This ensures the new file's dimensions are captured fresh
    originalSvgAttrs.current = null
    setSvgContent(content)
    setFileName(name)
    setSelectedNodeIds(new Set())
    setLastSelectedNodeId(null)
    parsingRef.current = false

    // If dimensions were provided by the import dialog, use them directly
    if (dimensions) {
      setSvgDimensions(dimensions)
    }
  }, [setSvgContent, setFileName, setSelectedNodeIds, setLastSelectedNodeId, parsingRef, originalSvgAttrs, setSvgDimensions])

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
      const nodes = await parseSVGFlatProgressively(svg, handleProgress)
      setLayerNodes(nodes)

      // Capture original SVG attributes if not already set (preserves document dimensions)
      if (!originalSvgAttrs.current) {
        const attrs: string[] = []
        for (const attr of Array.from(svg.attributes)) {
          attrs.push(`${attr.name}="${attr.value}"`)
        }
        originalSvgAttrs.current = attrs
      } else {
      }

      // Auto-select if there's only one top-level group
      if (nodes.length === 1 && nodes[0].isGroup) {
        setSelectedNodeIds(new Set([nodes[0].id]))
        setLastSelectedNodeId(nodes[0].id)
      } else {
        // Clear any previous selection
        setSelectedNodeIds(new Set())
        setLastSelectedNodeId(null)
      }

      // Use the proper dimension parsing utility that handles units, viewBox, etc.
      // Only set dimensions if they weren't already set by the import dialog
      if (!svgDimensions) {
        try {
          const dimInfo = analyzeSVGDimensions(svg)
          setSvgDimensions({
            width: dimInfo.computedWidth,
            height: dimInfo.computedHeight
          })

        } catch (e) {
          console.error('[SVG Dimensions] Failed to analyze:', e)
          // Fallback to basic parsing
          const viewBox = svg.getAttribute('viewBox')
          let width = parseFloat(svg.getAttribute('width') || '0')
          let height = parseFloat(svg.getAttribute('height') || '0')

          if (viewBox && (!width || !height)) {
            const parts = viewBox.split(/[\s,]+/).map(parseFloat)
            if (parts.length === 4) {
              width = parts[2]
              height = parts[3]
            }
          }

          if (width && height) {
            setSvgDimensions({ width, height })
          }
        }
      }

      // Trigger auto-flatten if enabled
      if (flattenOnImport) {
        setPendingFlatten(true)
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
  }, [handleProgress, setLayerNodes, setSvgDimensions, setLoadingState, parsingRef, skipNextParse, setSelectedNodeIds, setLastSelectedNodeId, originalSvgAttrs, svgDimensions])

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

  // Memoize color stats to avoid O(n) traversal on every render
  const documentColorStats = useMemo(() => collectAllColorsWithCounts(layerNodes), [layerNodes])
  const documentColors = useMemo(() => Array.from(documentColorStats.keys()), [documentColorStats])

  // Extract path info for the selected node (when single path is selected)
  const getSelectedPathInfo = useCallback(() => {
    if (selectedNodeIds.size !== 1) return null

    const selectedId = Array.from(selectedNodeIds)[0]
    const node = findNodeById(layerNodes, selectedId)
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
    const node = findNodeById(layerNodes, selectedId)
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

  // Persist ruler unit to localStorage
  useEffect(() => {
    localStorage.setItem('svg-grouper-ruler-unit', rulerUnit)
  }, [rulerUnit])

  // Measure canvas dimensions on resize
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container) return

    const updateDimensions = () => {
      setCanvasDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  // Handle scale application
  const handleScaleApply = useCallback((factor: number) => {
    const svgElement = document.querySelector('.svg-canvas svg') as SVGSVGElement
    if (!svgElement) return

    // Apply scale transform
    scaleArtwork(svgElement, factor)

    // Update dimensions
    const viewBox = svgElement.viewBox.baseVal
    if (viewBox.width > 0) {
      setSvgDimensions({
        width: viewBox.width,
        height: viewBox.height,
      })
    }

    // Sync the modified SVG content
    syncSvgContent()
    setStatusMessage(`Scaled artwork by ${(factor * 100).toFixed(0)}%`)
  }, [setSvgDimensions, syncSvgContent, setStatusMessage])

  // Handle mouse move for cursor position in rulers
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!svgDimensions || !canvasContainerRef.current) return

    const rect = canvasContainerRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Convert screen position to SVG coordinates
    const svgX = (e.clientX - rect.left - centerX - offset.x) / scale + svgDimensions.width / 2
    const svgY = (e.clientY - rect.top - centerY - offset.y) / scale + svgDimensions.height / 2

    setCursorPosition({ x: svgX, y: svgY })
  }, [svgDimensions, scale, offset])

  const handleCanvasMouseLeave = useCallback(() => {
    setCursorPosition(null)
  }, [])

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
    const draggedNode = findNodeById(layerNodes, draggedId)
    const targetNode = findNodeById(layerNodes, targetId)

    if (!draggedNode || !targetNode) return

    // Check if we're trying to drop a parent into its own child (would create cycle)
    if (isDescendant(draggedNode, targetId)) return

    // Remove the dragged node first
    let newNodes = removeNodeById(layerNodes, draggedId)

    // Insert at new position
    newNodes = insertNodeAtPosition(newNodes, targetId, draggedNode, position)

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
      const siblings = findSiblings(layerNodes, lastSelectedNodeId, node.id)

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
    const firstSelectedId = Array.from(selectedNodeIds)[0]
    if (!firstSelectedId) return

    const firstSelected = findNodeById(layerNodes, firstSelectedId)
    if (!firstSelected) return

    // All selected nodes will be set to the opposite of the first node's state
    const targetHiddenState = !firstSelected.isHidden

    const updatedNodes = updateVisibilityForSelected(layerNodes, selectedNodeIds, targetHiddenState)
    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)
  }

  const handleIsolate = () => {
    if (isIsolated) {
      // Un-isolate: show all layers
      const updatedNodes = showAllNodes(layerNodes)
      setLayerNodes(updatedNodes)
      setIsIsolated(false)
      rebuildSvgFromLayers(updatedNodes)
    } else {
      // Isolate: hide all except selected
      const updatedNodes = isolateNodes(layerNodes, selectedNodeIds)
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

    // If exactly 1 top-level node remains, auto-select it
    if (updatedNodes.length === 1) {
      setSelectedNodeIds(new Set([updatedNodes[0].id]))
    } else {
      setSelectedNodeIds(new Set())
    }

    rebuildSvgFromLayers(updatedNodes)
  }

  const canGroupByColor = (): boolean => {
    if (selectedNodeIds.size !== 1) return false

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) return false

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

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    if (!selectedNode || selectedNode.children.length === 0) return

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

    const updatedNodes = updateNodeChildren(layerNodes, selectedId, newChildren)
    setLayerNodes(updatedNodes)
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(updatedNodes)
    setIsProcessing(false)
  }

  // Sort children by color first, then by element type within each color
  // If shift is held, group by type instead of just sorting
  // Works on: 1) single group's children, or 2) multiple selected nodes within their parent
  const handleSortByType = async (e?: React.MouseEvent) => {
    if (selectedNodeIds.size === 0) return

    const shouldGroup = e?.shiftKey ?? false

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    // Determine mode: single group (sort children) or multiple selection (sort selected nodes)
    const selectedIds = Array.from(selectedNodeIds)
    let nodesToSort: SVGNode[] = []
    let parentNode: SVGNode | null = null
    let isSortingChildren = false

    if (selectedIds.length === 1) {
      // Single selection - sort children of the selected group
      const selectedNode = findNodeById(layerNodes, selectedIds[0])
      if (!selectedNode || selectedNode.children.length === 0) {
        setIsProcessing(false)
        return
      }
      nodesToSort = selectedNode.children
      parentNode = selectedNode
      isSortingChildren = true
    } else {
      // Multiple selection - sort the selected nodes within their common parent
      // Find all selected nodes
      const selectedNodes: SVGNode[] = []
      for (const id of selectedIds) {
        const node = findNodeById(layerNodes, id)
        if (node) selectedNodes.push(node)
      }

      if (selectedNodes.length < 2) {
        setIsProcessing(false)
        return
      }

      // Find common parent by looking at where these nodes exist
      // They should all be siblings at the same level
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

      // Check if all selected nodes have the same parent
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

      nodesToSort.forEach(child => {
        const category = getCategory(child)
        if (category === 'fills') fills.push(child)
        else if (category === 'lines') lines.push(child)
        else other.push(child)
      })

      newChildren = []

      // Get the parent element for DOM operations
      const parentElement = parentNode?.element || document.querySelector('.canvas-content svg')
      if (!parentElement) {
        setStatusMessage('error:Could not find parent element')
        setIsProcessing(false)
        return
      }

      // Create Fills group if there are fills
      if (fills.length > 0) {
        const fillGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const fillGroupId = `fills-${Date.now()}`
        fillGroup.setAttribute('id', fillGroupId)

        fills.forEach(node => fillGroup.appendChild(node.element))
        parentElement.appendChild(fillGroup)

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
        parentElement.appendChild(lineGroup)

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
      // Sort nodes: first by color, then by type
      newChildren = [...nodesToSort].sort((a, b) => {
        const colorA = getColor(a)
        const colorB = getColor(b)
        const colorCompare = colorA.localeCompare(colorB)
        if (colorCompare !== 0) return colorCompare

        const typeA = getType(a)
        const typeB = getType(b)
        return (typeOrder[typeA] ?? 99) - (typeOrder[typeB] ?? 99)
      })

      // Reorder DOM elements
      const parentElement = parentNode?.element || document.querySelector('.canvas-content svg')
      if (parentElement) {
        newChildren.forEach(child => {
          parentElement.appendChild(child.element)
        })
      }
    }

    // Update the node tree based on mode
    let updatedNodes: SVGNode[]

    if (isSortingChildren && parentNode) {
      // Single group selected - update its children
      const updateNodeChildren = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.id === parentNode.id) {
            return { ...node, children: newChildren }
          }
          if (node.children.length > 0) {
            return { ...node, children: updateNodeChildren(node.children) }
          }
          return node
        })
      }
      updatedNodes = updateNodeChildren(layerNodes)
    } else if (parentNode) {
      // Multiple selection with a parent - update parent's children
      // Replace selected nodes with the sorted/grouped result
      const selectedIdSet = new Set(selectedIds)
      const updateParentChildren = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (node.id === parentNode.id) {
            // Filter out old selected nodes and add new sorted ones
            const otherChildren = node.children.filter(c => !selectedIdSet.has(c.id))
            return { ...node, children: [...otherChildren, ...newChildren] }
          }
          if (node.children.length > 0) {
            return { ...node, children: updateParentChildren(node.children) }
          }
          return node
        })
      }
      updatedNodes = updateParentChildren(layerNodes)
    } else {
      // Multiple selection at root level - update root nodes
      const selectedIdSet = new Set(selectedIds)
      const otherNodes = layerNodes.filter(n => !selectedIdSet.has(n.id))
      updatedNodes = [...otherNodes, ...newChildren]
    }

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

  const filterCounts = getFilterCounts()

  // Get total children count for the selected node
  const getTotalChildrenCount = useCallback((): number => {
    if (selectedNodeIds.size !== 1) return 0

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)
    return selectedNode?.children.length || 0
  }, [selectedNodeIds, layerNodes])

  const totalChildrenCount = getTotalChildrenCount()

  // Sort children by size (bounding box area)
  // When filter is applied, extract filtered items into a new sibling group
  const handleSortBySize = async (ascendingOverride?: boolean) => {
    if (selectedNodeIds.size !== 1) return

    setIsProcessing(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

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

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)

    return selectedNode !== null && selectedNode.children.length >= 2
  }

  const handleGroupUngroup = () => {
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

      // Find if all selected nodes are siblings (same level in tree)
      // This works with the layer tree structure, not DOM elements
      const findParentLevel = (nodes: SVGNode[], parentPath: string = ''): { level: SVGNode[], path: string } | null => {
        // Check if any selected nodes are at this level
        const selectedAtThisLevel = nodes.filter(n => selectedIdSet.has(n.id))
        if (selectedAtThisLevel.length > 0) {
          // Found selected nodes at this level
          return { level: nodes, path: parentPath }
        }

        // Recurse into children
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

      // Collect selected nodes from this level
      const selectedNodes = levelInfo.level.filter(n => selectedIdSet.has(n.id))
      if (selectedNodes.length < 2) return

      // Check that ALL selected nodes are at this same level
      // (not some at root and some nested)
      const allAtSameLevel = selectedIds.every(id => {
        return levelInfo.level.some(n => n.id === id)
      })
      if (!allAtSameLevel) {
        return
      }

      // Create new group node - no DOM manipulation needed
      // rebuildSvgFromLayers will create the DOM structure
      const groupId = `group-${Date.now()}`
      const newGroupNode: SVGNode = {
        id: groupId,
        type: 'g',
        name: groupId,
        element: document.createElementNS('http://www.w3.org/2000/svg', 'g'), // Placeholder, will be refreshed
        isGroup: true,
        children: selectedNodes
      }

      // Build new tree with selected nodes grouped
      const removeAndGroup = (nodes: SVGNode[]): SVGNode[] => {
        const result: SVGNode[] = []
        let insertedGroup = false

        for (const node of nodes) {
          if (selectedIdSet.has(node.id)) {
            // This is a selected node - insert group at first occurrence
            if (!insertedGroup) {
              result.push(newGroupNode)
              insertedGroup = true
            }
            // Skip adding the node itself (it's now inside the group)
          } else {
            // Not selected - keep it, but recurse into children
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

  // Register arrange handlers in context
  useEffect(() => {
    arrangeHandlers.current = {
      moveUp: handleMoveUp,
      moveDown: handleMoveDown,
      bringToFront: handleBringToFront,
      sendToBack: handleSendToBack,
      group: handleGroupUngroup,
      ungroup: handleGroupUngroup
    }
  }, [handleMoveUp, handleMoveDown, handleBringToFront, handleSendToBack, handleGroupUngroup, arrangeHandlers])


  // Register tool handlers in context
  useEffect(() => {
    toolHandlers.current = {
      convertToFills: handleConvertToFills,
      normalizeColors: handleNormalizeColors,
      separateCompoundPaths: handleSeparateCompoundPaths
    }
  }, [handleConvertToFills, handleNormalizeColors, handleSeparateCompoundPaths, toolHandlers])

  // Check if simplification is possible
  const canSimplify = (): boolean => {
    if (selectedNodeIds.size === 0) return false

    // Check if any selected node is a path or group with paths
    for (const id of selectedNodeIds) {
      const node = findNodeById(layerNodes, id)
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

    let totalBefore = 0
    let totalAfter = 0

    for (const id of selectedNodeIds) {
      const node = findNodeById(layerNodes, id)
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
      rebuildSvgFromLayers(layerNodes)

      const reduction = Math.round((1 - totalAfter / totalBefore) * 100)
      setStatusMessage(`Simplified: ${totalBefore} → ${totalAfter} points (${reduction}% reduction)`)
    }
  }

  // Check if weld is possible (need a selected group with paths)
  const canWeld = (): boolean => {
    if (selectedNodeIds.size === 0) return false

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
          const color = getNodeColor(node)
          const strokeWidth = getNodeStrokeWidth(node)

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
      const nodeId = Array.from(selectedNodeIds)[0]
      const node = findNodeById(layerNodes, nodeId)
      return node ? node.children.length > 1 : false
    }
    return false
  }

  // Handle flip order - reverse the order of selected nodes or children of a selected group
  const handleFlipOrder = () => {
    if (!canFlipOrder()) return

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

    // Track seen IDs to generate unique IDs during ungrouping
    const seenIds = new Set<string>()

    const ensureUniqueId = (node: SVGNode): void => {
      let nodeId = node.id
      if (seenIds.has(nodeId)) {
        const suffix = `-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        nodeId = `${node.id}${suffix}`
        node.element.setAttribute('id', nodeId)
        node.id = nodeId
      }
      seenIds.add(nodeId)
    }

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
          ensureUniqueId(node)
          result.push(node)
        } else if (node.isGroup) {
          // For groups, extract all leaf elements from DOM directly
          // This handles cases where node.children might be incomplete
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
          ensureUniqueId(node)
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

    // Execute flatten operations
    let currentNodes = deleteEmptyLayers([...layerNodes])
    currentNodes = ungroupAll(currentNodes)
    currentNodes = groupByColor(currentNodes)

    setLayerNodes(currentNodes)
    setSelectedNodeIds(new Set())
    rebuildSvgFromLayers(currentNodes)
    setStatusMessage('Flattened: removed empty layers, ungrouped all, grouped by color')
  }

  const rotateCropAspectRatio = () => {
    const [w, h] = cropAspectRatio.split(':')
    setCropAspectRatio(`${h}:${w}` as '1:2' | '2:3' | '3:4' | '16:9' | '9:16')
  }

  // Apply crop to SVG
  const handleApplyCrop = async () => {

    if (!svgContent || !svgDimensions) {
      setStatusMessage('error:No SVG content to crop')
      return
    }

    // Get the canvas container dimensions
    const container = canvasContainerRef.current
    if (!container) {
      setStatusMessage('error:Could not find canvas container')
      return
    }

    // Find the actual SVG element to get its rendered size
    const svgElement = container.querySelector('svg')
    if (!svgElement) {
      setStatusMessage('error:Could not find SVG element')
      return
    }

    // Get the SVG element's bounding rect to see its actual rendered size
    const svgRect = svgElement.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    // Calculate viewport crop box (same as SVGCanvas overlay)
    const [w, h] = cropAspectRatio.split(':').map(Number)
    const aspectRatio = w / h
    const minViewportDim = Math.min(containerRect.width, containerRect.height)
    const baseSize = minViewportDim * cropSize

    let viewportCropWidth: number
    let viewportCropHeight: number

    if (aspectRatio >= 1) {
      viewportCropWidth = baseSize
      viewportCropHeight = baseSize / aspectRatio
    } else {
      viewportCropHeight = baseSize
      viewportCropWidth = baseSize * aspectRatio
    }

    // Viewport crop box corners (always centered in viewport)
    const viewportCropLeft = (containerRect.width - viewportCropWidth) / 2
    const viewportCropTop = (containerRect.height - viewportCropHeight) / 2

    // SVG position relative to container
    const svgLeftInContainer = svgRect.left - containerRect.left
    const svgTopInContainer = svgRect.top - containerRect.top

    // Calculate scale from SVG coordinates to rendered pixels
    const effectiveScale = svgRect.width / svgDimensions.width

    // Convert viewport crop box to SVG coordinates
    const cropX = (viewportCropLeft - svgLeftInContainer) / effectiveScale
    const cropY = (viewportCropTop - svgTopInContainer) / effectiveScale
    const cropWidth = viewportCropWidth / effectiveScale
    const cropHeight = viewportCropHeight / effectiveScale

    setStatusMessage('Applying crop...')
    setIsProcessing(true)

    try {

      // Use JavaScript-based crop that preserves fill shapes
      const cropRect: Rect = {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight
      }

      const croppedSvg = cropSVGInBrowser(svgContent, cropRect)


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

      // Clear original attributes so they get recaptured for the cropped document
      originalSvgAttrs.current = null

      // Ensure the next parse is NOT skipped
      skipNextParse.current = false
      parsingRef.current = false

      // Hide crop overlay
      setShowCrop(false)

      // Update SVG content with cropped result - this will trigger re-parsing
      setSvgContent(croppedSvg)

      setStatusMessage(`Cropped to ${cropWidth.toFixed(0)} × ${cropHeight.toFixed(0)} px`)
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
              const selectedId = Array.from(selectedNodeIds)[0]
              const selectedNode = findNodeById(layerNodes, selectedId)

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

        {/* Scale controls at bottom of sidebar */}
        {svgContent && (
          <div className="sidebar-footer">
            <div className="sidebar-footer-header">
              <span>Transform</span>
              <button
                className={`ruler-toggle ${showRulers ? 'active' : ''}`}
                onClick={() => setShowRulers(!showRulers)}
                title={showRulers ? 'Hide rulers' : 'Show rulers'}
              >
                📏
              </button>
            </div>
            <ScaleControls
              svgDimensions={svgDimensions}
              unit={rulerUnit}
              onScale={handleScaleApply}
              onUnitChange={setRulerUnit}
              disabled={isProcessing}
            />
          </div>
        )}

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
              min="10"
              max="100"
              step="1"
              value={cropSize * 100}
              onChange={(e) => setCropSize(Number(e.target.value) / 100)}
              style={{ width: '150px' }}
              className="crop-size-slider"
            />
            <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.5rem', marginRight: '0.5rem' }}>
              {(cropDims.width / 96).toFixed(1)} × {(cropDims.height / 96).toFixed(1)} in • {cropDims.width.toFixed(0)} × {cropDims.height.toFixed(0)} px
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
                onClick={() => setCropAspectRatio('2:3')}
                title="Aspect Ratio 2:3 (12x18)"
                style={{
                  background: cropAspectRatio === '2:3' ? '#4a90e2' : 'white',
                  color: cropAspectRatio === '2:3' ? 'white' : 'inherit',
                }}
              >
                2:3
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
        <div
          ref={canvasContainerRef}
          className={`canvas-container ${showRulers && svgContent ? 'with-rulers' : ''}`}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        >
          {/* Rulers */}
          {showRulers && svgContent && svgDimensions && (
            <Rulers
              canvasWidth={canvasDimensions.width}
              canvasHeight={canvasDimensions.height}
              scale={scale}
              offset={offset}
              svgDimensions={svgDimensions}
              unit={rulerUnit}
              onUnitChange={setRulerUnit}
              cursorPosition={cursorPosition}
            />
          )}

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
