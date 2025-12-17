import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAppContext } from '../../../context/AppContext'
import FileUpload from '../../FileUpload'
import SVGCanvas from '../../SVGCanvas'
import LayerTree from '../../LayerTree'
import LoadingOverlay from '../../LoadingOverlay'
import { Rulers, RulerUnit } from '../../shared/Rulers'
import { ScaleControls } from '../../shared/ScaleControls'
import { SVGNode } from '../../../types/svg'
import { parseSVGFlatProgressively } from '../../../utils/svgParser'
import { SIMPLIFY_PRESETS } from '../../../utils/pathSimplify'
import { getCropDimensions } from '../../../utils/cropSVG'
import { analyzeSVGDimensions } from '../../../utils/svgDimensions'
import { scaleArtwork } from '../../../utils/svgTransform'
import {
  findNodeById,
  findSiblings,
} from '../../../utils/nodeUtils'
import { useArrangeTools } from '../../../hooks/useArrangeTools'
import { useToolHandlers } from '../../../hooks/useToolHandlers'
import {
  useNodeOperations,
  useColorOperations,
  useGroupOperations,
  usePathHighlight,
  useFlattenOperations,
  useSortOperations,
  usePathOperations,
  useCropHandler,
  useKeyboardShortcuts,
} from './hooks'
import { collectAllColorsWithCounts, extractPathInfo, extractGroupInfo } from './pathAnalysis'
import StatusBar from './StatusBar'
import SidebarToolbar from './SidebarToolbar'
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

  // Track when we need to fit the SVG to the viewport
  const needsFitToView = useRef(false)

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

    // Flag that we need to fit the new content to view
    needsFitToView.current = true

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
        status: '',
      })
      setStatusMessage(`error:Failed to parse SVG: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [handleProgress, setLayerNodes, setSvgDimensions, setLoadingState, setStatusMessage, parsingRef, skipNextParse, setSelectedNodeIds, setLastSelectedNodeId, originalSvgAttrs, svgDimensions, flattenOnImport, setPendingFlatten])

  const disarmActions = useCallback(() => {
    setDeleteArmed(false)
    setSplitArmed(false)
    setWeldArmed(false)
  }, [])

  // Memoize color stats to avoid O(n) traversal on every render
  const documentColorStats = useMemo(() => collectAllColorsWithCounts(layerNodes), [layerNodes])
  const documentColors = useMemo(() => Array.from(documentColorStats.keys()), [documentColorStats])

  // Extract path info for the selected node (when single path is selected)
  const selectedPathInfo = useMemo(() => {
    if (selectedNodeIds.size !== 1) return null
    const selectedId = Array.from(selectedNodeIds)[0]
    const node = findNodeById(layerNodes, selectedId)
    if (!node || node.isGroup) return null
    return extractPathInfo(node)
  }, [selectedNodeIds, layerNodes])

  // Extract group info for the selected node (when single group is selected)
  const selectedGroupInfo = useMemo(() => {
    if (selectedNodeIds.size !== 1) return null
    const selectedId = Array.from(selectedNodeIds)[0]
    const node = findNodeById(layerNodes, selectedId)
    if (!node || !node.isGroup) return null
    return extractGroupInfo(node)
  }, [selectedNodeIds, layerNodes])

  // Use extracted node operations hook
  const {
    handleToggleVisibility,
    handleIsolate,
    handleDeleteNode,
    handleReorder,
  } = useNodeOperations({
    layerNodes,
    setLayerNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    rebuildSvgFromLayers,
    isIsolated,
    setIsIsolated,
  })

  // Use extracted color operations hook
  const {
    handleColorChange,
    canGroupByColor,
    handleGroupByColor,
  } = useColorOperations({
    layerNodes,
    setLayerNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    rebuildSvgFromLayers,
    setIsProcessing,
  })

  // Use extracted group operations hook
  const {
    handleGroupUngroup,
    canFlipOrder,
    handleFlipOrder,
  } = useGroupOperations({
    layerNodes,
    setLayerNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    lastSelectedNodeId,
    setLastSelectedNodeId,
    rebuildSvgFromLayers,
  })

  // Use extracted path highlight hook
  const {
    isHighlightPersistent,
    showPointMarkers,
    pointMarkerCoords,
    handlePathInfoMouseEnter,
    handlePathInfoMouseLeave,
    handlePathInfoClick,
    handleStartPointClick,
    handleEndPointClick,
    handlePointCountClick,
    handleLayerPathHover,
    handleLayerPathClick,
  } = usePathHighlight({
    selectedNodeIds,
    selectedPathInfo,
  })

  // Use extracted flatten operations hook
  const {
    handleFlattenAll,
  } = useFlattenOperations({
    layerNodes,
    setLayerNodes,
    setSelectedNodeIds,
    rebuildSvgFromLayers,
    flattenArmed,
    setFlattenArmed,
    setDeleteArmed,
    setSplitArmed,
    setStatusMessage,
  })

  // Use extracted sort operations hook
  const {
    handleSortByType,
    handleSortBySize,
    getFilterCounts,
    getTotalChildrenCount,
    canSortBySize,
  } = useSortOperations({
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
  })

  // Use extracted path operations hook
  const {
    canSimplify,
    handleSimplifyPaths,
    canWeld,
    handleWeld,
  } = usePathOperations({
    selectedNodeIds,
    layerNodes,
    setLayerNodes,
    rebuildSvgFromLayers,
    setStatusMessage,
    simplifyTolerance,
    weldArmed,
    setWeldArmed,
    setDeleteArmed,
    setSplitArmed,
    setFlattenArmed,
  })

  // Use extracted crop handler hook
  const {
    rotateCropAspectRatio,
  } = useCropHandler({
    canvasContainerRef,
    needsFitToView,
    svgContent,
    svgDimensions,
    cropAspectRatio,
    setCropAspectRatio,
    cropSize,
    setStatusMessage,
    setIsProcessing,
    setSvgContent,
    setLayerNodes,
    setSelectedNodeIds,
    setLastSelectedNodeId,
    setFillTargetNodeIds,
    setOrderData,
    setSvgDimensions,
    originalSvgAttrs,
    skipNextParse,
    parsingRef,
    setShowCrop,
  })

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    selectedNodeIds,
    layerNodes,
    deleteArmed,
    setDeleteArmed,
    splitArmed,
    setSplitArmed,
    showFilterToolbar,
    setShowFilterToolbar,
    disarmActions,
    handleToggleVisibility,
    handleIsolate,
    handleDeleteNode,
    handleGroupUngroup,
    canGroupByColor,
    handleGroupByColor,
    canSortBySize,
  })

  // Persist ruler unit to localStorage
  useEffect(() => {
    localStorage.setItem('svg-grouper-ruler-unit', rulerUnit)
  }, [rulerUnit])

  // Fit SVG to view - calculate optimal scale and center offset
  const fitToView = useCallback(() => {
    if (!svgDimensions || !canvasContainerRef.current) return

    const container = canvasContainerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (containerWidth <= 0 || containerHeight <= 0) return

    // Calculate scale to fit SVG in container with padding
    // The SVG is constrained by CSS max-width/max-height: 90%, but we want to
    // fill more of the viewport. Use 85% to leave some margin.
    const padding = 0.85
    const scaleX = (containerWidth * padding) / svgDimensions.width
    const scaleY = (containerHeight * padding) / svgDimensions.height
    const optimalScale = Math.min(scaleX, scaleY)

    // Clamp scale to reasonable bounds
    const clampedScale = Math.max(0.1, Math.min(10, optimalScale))

    // Center the SVG (offset 0,0 centers it due to transformOrigin: center center)
    setScale(clampedScale)
    setOffset({ x: 0, y: 0 })
  }, [svgDimensions, setScale, setOffset])

  // Auto-fit to view when a new file is loaded
  useEffect(() => {
    if (needsFitToView.current && svgDimensions && canvasDimensions.width > 0) {
      needsFitToView.current = false
      // Small delay to ensure the SVG is rendered
      requestAnimationFrame(() => {
        fitToView()
      })
    }
  }, [svgDimensions, canvasDimensions, fitToView])

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

  // Handle node selection (multi-select with Cmd, range-select with Shift)
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

  // Derived values from sort operations hook
  const filterCounts = getFilterCounts()
  const totalChildrenCount = getTotalChildrenCount()

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

  return (
    <div className="sort-tab">
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <h2>Layers</h2>
          <SidebarToolbar
            showFilterToolbar={showFilterToolbar}
            weldArmed={weldArmed}
            flattenArmed={flattenArmed}
            simplifyTolerance={simplifyTolerance}
            canSortBySize={canSortBySize()}
            canGroupByColor={canGroupByColor()}
            canSimplify={canSimplify()}
            canWeld={canWeld()}
            canFlipOrder={canFlipOrder()}
            hasLayerNodes={layerNodes.length > 0}
            onToggleFilterToolbar={() => setShowFilterToolbar(!showFilterToolbar)}
            onGroupByColor={handleGroupByColor}
            onSimplifyPaths={handleSimplifyPaths}
            onWeld={handleWeld}
            onFlipOrder={handleFlipOrder}
            onFlattenAll={handleFlattenAll}
          />
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
              onLoadError={(error) => {
                setLoadingState({ isLoading: false, progress: 0, status: '' })
                setStatusMessage(`error:${error}`)
              }}
              onLoadCancel={() => {
                setLoadingState({ isLoading: false, progress: 0, status: '' })
              }}
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

      <StatusBar
        fileName={fileName}
        statusMessage={statusMessage}
        svgDimensions={svgDimensions}
        selectedPathInfo={selectedPathInfo}
        selectedGroupInfo={selectedGroupInfo}
        documentColors={documentColors}
        documentColorStats={documentColorStats}
        isHighlightPersistent={isHighlightPersistent}
        showPointMarkers={showPointMarkers}
        onPathInfoMouseEnter={handlePathInfoMouseEnter}
        onPathInfoMouseLeave={handlePathInfoMouseLeave}
        onPathInfoClick={handlePathInfoClick}
        onStartPointClick={handleStartPointClick}
        onEndPointClick={handleEndPointClick}
        onPointCountClick={handlePointCountClick}
      />
    </div>
  )
}
