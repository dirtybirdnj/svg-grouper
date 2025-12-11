import { useMemo, useCallback, useEffect } from 'react'
import { useAppContext } from '../../../context/AppContext'
import { SVGNode } from '../../../types/svg'
import { UI } from '../../../constants'
import { usePanZoom } from '../../../hooks'
import { linesToCompoundPath } from '../../../utils/geometry'
import {
  TILE_SHAPES,
  optimizeLineOrderMultiPass,
} from '../../../utils/fillPatterns'
import { UnifiedLayerList, ItemRenderState } from '../../shared'
import patternStats from '../../../patternStats.json'
import './FillTab.css'

// Import types and hooks
import { FillLayer, FillLayerListItem } from './types'
import { useFillState, useFillPaths, useFillGeneration, useFillLayers } from './hooks'
import { weaveLayerLines } from './weaveAlgorithm'

// Filter out DNF patterns
const DNF_PATTERNS = new Set(
  Object.entries(patternStats.patterns)
    .filter(([_, stats]) => stats.status === 'dnf')
    .map(([name]) => name)
)

export default function FillTab() {
  const {
    svgContent,
    layerNodes,
    setLayerNodes,
    fillTargetNodeIds,
    setFillTargetNodeIds,
    selectedNodeIds,
    setActiveTab,
    rebuildSvgFromLayers,
    setOrderData,
    setIsProcessing,
    scale,
    setScale,
    offset,
    setOffset,
    weaveRequested,
    setWeaveRequested,
    setStatusMessage,
  } = useAppContext()

  // Use consolidated state hook
  const state = useFillState()

  // Destructure commonly used state values
  const {
    lineSpacing, setLineSpacing,
    angle, setAngle,
    crossHatch,
    inset, setInset,
    retainStrokes,
    penWidth,
    showHatchPreview, setShowHatchPreview,
    fillPattern, setFillPattern,
    wiggleAmplitude,
    wiggleFrequency,
    spiralOverDiameter, setSpiralOverDiameter,
    singleSpiral, setSingleSpiral,
    singleHilbert, setSingleHilbert,
    singleFermat, setSingleFermat,
    simplifyTolerance, setSimplifyTolerance,
    customTileShape, setCustomTileShape,
    customTileGap, setCustomTileGap,
    customTileScale, setCustomTileScale,
    customTileRotateOffset, setCustomTileRotateOffset,
    subpathMode,
    useEvenOdd,
    mergeBeforeFill, setMergeBeforeFill,
    enableCrop, setEnableCrop,
    cropInset, setCropInset,
    draftCropInset, setDraftCropInset,
    accumulatedLayers, setAccumulatedLayers,
    selectedLayerId, setSelectedLayerId,
    layerColor, setLayerColor,
    bannerCache, setBannerCache,
    highlightedPathId,
    newLayerAngle, setNewLayerAngle,
    selectedLayerIds, setSelectedLayerIds,
    weavePattern, setWeavePattern,
    weaveGapMargin, setWeaveGapMargin,
    draftLineSpacing, setDraftLineSpacing,
    draftAngle, setDraftAngle,
    draftInset, setDraftInset,
    draftWiggleAmplitude, setDraftWiggleAmplitude,
    draftWiggleFrequency, setDraftWiggleFrequency,
    draftPenWidth, setDraftPenWidth,
    draftSimplifyTolerance, setDraftSimplifyTolerance,
    draftLayerColor, setDraftLayerColor,
    selectedControl, setSelectedControl,
    setCrossHatch, setRetainStrokes, setPenWidth,
    setWiggleAmplitude, setWiggleFrequency,
  } = state

  // Handle arrow key nudging for selected control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedControl || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return

      const direction = e.key === 'ArrowRight' ? 1 : -1

      switch (selectedControl) {
        case 'lineSpacing': {
          const v = Math.max(1, Math.min(20, lineSpacing + direction))
          setLineSpacing(v)
          break
        }
        case 'angle': {
          const v = Math.max(0, Math.min(180, angle + direction * 5))
          setAngle(v)
          break
        }
        case 'inset': {
          const v = Math.max(0, Math.min(10, inset + direction))
          setInset(v)
          break
        }
        case 'wiggleAmplitude': {
          const v = Math.max(1, Math.min(10, wiggleAmplitude + direction))
          setWiggleAmplitude(v)
          break
        }
        case 'wiggleFrequency': {
          const v = Math.max(0.5, Math.min(5, wiggleFrequency + direction * 0.5))
          setWiggleFrequency(v)
          break
        }
        case 'penWidth': {
          const v = Math.max(0.1, Math.min(2, +(penWidth + direction * 0.1).toFixed(1)))
          setPenWidth(v)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedControl, lineSpacing, angle, inset, wiggleAmplitude, wiggleFrequency, penWidth, setLineSpacing, setAngle, setInset, setWiggleAmplitude, setWiggleFrequency, setPenWidth])

  // Use shared pan/zoom hook
  const { isPanning: isDragging, containerRef: previewRef, handlers: panZoomHandlers } = usePanZoom({
    externalState: { scale, setScale, offset, setOffset }
  })

  // Use fill paths hook
  const {
    targetNodes,
    targetNode,
    fillPaths,
    activeFillPaths,
    preservedFillData,
    setPreservedFillData,
    boundingBox,
  } = useFillPaths({
    layerNodes,
    fillTargetNodeIds,
    selectedNodeIds,
  })

  // Use fill generation hook
  const {
    simplifiedHatchedPaths,
    fillProgress,
  } = useFillGeneration({
    showHatchPreview,
    activeFillPaths,
    preservedFillData,
    boundingBox,
    fillPattern,
    lineSpacing,
    angle,
    crossHatch,
    inset,
    wiggleAmplitude,
    wiggleFrequency,
    spiralOverDiameter,
    singleSpiral,
    singleHilbert,
    singleFermat,
    customTileShape,
    customTileGap,
    customTileScale,
    customTileRotateOffset,
    subpathMode,
    enableCrop,
    cropInset,
    useEvenOdd,
    mergeBeforeFill,
    simplifyTolerance,
    setIsProcessing,
  })

  // Use fill layers hook
  const {
    handleAddLayer,
    handleClearLayers,
    handleDeleteLayer,
    handleToggleLayerVisibility,
    layerListItems,
    handleLayerSelectionChange,
    handleLayerReorder,
  } = useFillLayers({
    accumulatedLayers,
    setAccumulatedLayers,
    selectedLayerIds,
    setSelectedLayerIds,
    selectedLayerId,
    setSelectedLayerId,
    layerColor,
    setLayerColor,
    angle,
    setAngle,
    lineSpacing,
    setLineSpacing,
    fillPattern,
    setFillPattern,
    inset,
    setInset,
    penWidth,
    newLayerAngle,
    simplifiedHatchedPaths,
    showHatchPreview,
    setShowHatchPreview,
    fillPathsLength: fillPaths.length,
  })

  // Handle weave request
  useEffect(() => {
    if (weaveRequested) {
      setWeaveRequested(false)

      if (selectedLayerIds.size !== 2) {
        const msg = `Weave requires exactly 2 layers selected (you have ${selectedLayerIds.size}). Use Shift/Cmd+click to multi-select.`
        setStatusMessage(msg)
        return
      }

      const layerIds = Array.from(selectedLayerIds)
      const layer1 = accumulatedLayers.find(l => l.id === layerIds[0])
      const layer2 = accumulatedLayers.find(l => l.id === layerIds[1])

      if (!layer1 || !layer2) {
        setStatusMessage('Could not find selected layers')
        return
      }

      setStatusMessage(`Weaving ${layer1.lineCount} + ${layer2.lineCount} lines...`)
      setIsProcessing(true)

      const startTime = performance.now()
      const result = weaveLayerLines(
        layer1.lines,
        layer2.lines,
        layer1.penWidth,
        layer2.penWidth,
        weavePattern,
        weaveGapMargin
      )
      const elapsed = performance.now() - startTime

      const newLayer1: FillLayer = {
        ...layer1,
        id: `${layer1.id}-woven`,
        lines: result.layer1,
        lineCount: result.layer1.length,
      }

      const newLayer2: FillLayer = {
        ...layer2,
        id: `${layer2.id}-woven`,
        lines: result.layer2,
        lineCount: result.layer2.length,
      }

      setAccumulatedLayers(prev => {
        return prev.map(layer => {
          if (layer.id === layer1.id) return newLayer1
          if (layer.id === layer2.id) return newLayer2
          return layer
        })
      })

      setSelectedLayerIds(new Set())
      setIsProcessing(false)
      setStatusMessage(`Weave complete in ${elapsed.toFixed(0)}ms. ${result.layer1.length + result.layer2.length} line segments created.`)
    }
  }, [weaveRequested, setWeaveRequested, selectedLayerIds, accumulatedLayers, setStatusMessage, setIsProcessing, weavePattern, weaveGapMargin, setAccumulatedLayers, setSelectedLayerIds])

  // Calculate fill statistics
  const fillStats = useMemo(() => {
    if (!showHatchPreview || simplifiedHatchedPaths.length === 0) {
      return null
    }

    let totalLines = 0
    let totalPoints = 0

    simplifiedHatchedPaths.forEach(({ lines }) => {
      totalLines += lines.length
      totalPoints += lines.length * 2
    })

    accumulatedLayers.forEach(layer => {
      totalLines += layer.lines.length
      totalPoints += layer.lines.length * 2
    })

    return {
      lines: totalLines,
      points: totalPoints,
      paths: simplifiedHatchedPaths.length + (accumulatedLayers.length > 0 ? 1 : 0)
    }
  }, [showHatchPreview, simplifiedHatchedPaths, accumulatedLayers])

  // Convert mm to SVG units
  const penWidthPx = penWidth * 3.7795

  // Generate preview SVG content
  const previewSvg = useMemo(() => {
    if (fillPaths.length === 0 || !boundingBox) {
      return null
    }

    const padding = UI.PREVIEW_PADDING
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`

    const pathElements: string[] = []

    if (showHatchPreview) {
      // Draw accumulated layers
      accumulatedLayers.filter(layer => layer.visible).forEach(layer => {
        const pathD = linesToCompoundPath(layer.lines, 2)
        pathElements.push(`<g class="accumulated-layer"><path d="${pathD}" fill="${layer.color}" stroke="${layer.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/></g>`)
      })

      // Add outline strokes if retaining
      if (retainStrokes) {
        fillPaths.forEach((path) => {
          const outlineEl = path.element.cloneNode(true) as Element
          outlineEl.setAttribute('fill', 'none')
          outlineEl.setAttribute('stroke', path.color)
          outlineEl.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
          outlineEl.removeAttribute('style')
          pathElements.push(outlineEl.outerHTML)
        })
      }

      // Add highlight overlay
      fillPaths.forEach((path) => {
        const isHighlighted = path.id === highlightedPathId
        if (isHighlighted) {
          const highlightEl = path.element.cloneNode(true) as Element
          highlightEl.setAttribute('fill', 'rgba(255, 0, 0, 0.3)')
          highlightEl.setAttribute('stroke', '#ff0000')
          highlightEl.setAttribute('stroke-width', '3')
          highlightEl.removeAttribute('style')
          pathElements.push(highlightEl.outerHTML)
        }
      })
    } else {
      // Show original shapes
      fillPaths.forEach((path) => {
        const el = path.element.cloneNode(true) as Element
        el.setAttribute('fill', path.color)
        el.setAttribute('fill-opacity', '0.3')
        el.setAttribute('stroke', path.color)
        el.setAttribute('stroke-width', '2')
        pathElements.push(el.outerHTML)
      })
    }

    // Add crop rectangle indicator
    if (enableCrop && cropInset > 0) {
      const insetX = boundingBox.width * (cropInset / 100)
      const insetY = boundingBox.height * (cropInset / 100)
      const cropX = boundingBox.x + insetX
      const cropY = boundingBox.y + insetY
      const cropW = boundingBox.width - insetX * 2
      const cropH = boundingBox.height - insetY * 2

      pathElements.push(`<rect x="${cropX}" y="${cropY}" width="${cropW}" height="${cropH}" fill="none" stroke="#ff6600" stroke-width="2" stroke-dasharray="8,4" opacity="0.8"/>`)
      pathElements.push(`<rect x="${boundingBox.x - padding}" y="${boundingBox.y - padding}" width="${boundingBox.width + padding * 2}" height="${insetY + padding}" fill="rgba(0,0,0,0.3)"/>`)
      pathElements.push(`<rect x="${boundingBox.x - padding}" y="${cropY + cropH}" width="${boundingBox.width + padding * 2}" height="${insetY + padding}" fill="rgba(0,0,0,0.3)"/>`)
      pathElements.push(`<rect x="${boundingBox.x - padding}" y="${cropY}" width="${insetX + padding}" height="${cropH}" fill="rgba(0,0,0,0.3)"/>`)
      pathElements.push(`<rect x="${cropX + cropW}" y="${cropY}" width="${insetX + padding}" height="${cropH}" fill="rgba(0,0,0,0.3)"/>`)
    }

    return { viewBox, content: pathElements.join('\n') }
  }, [fillPaths, boundingBox, showHatchPreview, accumulatedLayers, retainStrokes, penWidthPx, highlightedPathId, enableCrop, cropInset])

  const handleBack = () => {
    setAccumulatedLayers([])
    setPreservedFillData(null)
    setLayerColor('')
    setShowHatchPreview(false)
    setFillTargetNodeIds([])
    setActiveTab('sort')
  }

  const handlePreview = useCallback(() => {
    setShowHatchPreview(!showHatchPreview)
  }, [showHatchPreview, setShowHatchPreview])

  const handleApplyFill = useCallback(() => {
    if (targetNodes.length === 0 || (simplifiedHatchedPaths.length === 0 && accumulatedLayers.length === 0)) return

    setIsProcessing(true)

    setTimeout(() => {
      const optimizedLines = optimizeLineOrderMultiPass(simplifiedHatchedPaths)
      const parser = new DOMParser()

      const allLinesByColor = new Map<string, { x1: number; y1: number; x2: number; y2: number }[]>()

      accumulatedLayers.filter(layer => layer.visible).forEach(layer => {
        const existing = allLinesByColor.get(layer.color) || []
        layer.lines.forEach(line => {
          existing.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })
        })
        allLinesByColor.set(layer.color, existing)
      })

      optimizedLines.forEach(line => {
        const color = layerColor || line.color
        const existing = allLinesByColor.get(color) || []
        existing.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })
        allLinesByColor.set(color, existing)
      })

      const uniqueColors = Array.from(allLinesByColor.keys())
      const fillNodes: SVGNode[] = []

      uniqueColors.forEach((color, index) => {
        const lines = allLinesByColor.get(color)
        if (!lines || lines.length === 0) return

        let pathD = linesToCompoundPath(lines, 2)

        if (retainStrokes && uniqueColors.length === 1) {
          simplifiedHatchedPaths.forEach(({ pathInfo }) => {
            const originalD = pathInfo.element.getAttribute('d')
            if (originalD) {
              pathD = pathD + ' ' + originalD
            }
          })
        }

        const nodeId = uniqueColors.length > 1
          ? `fill-${color.replace('#', '')}-${index}`
          : `fill-${Date.now()}`
        const nodeName = uniqueColors.length > 1
          ? `Fill ${color}`
          : `Fill`

        const pathMarkup = `<path id="${nodeId}" d="${pathD}" fill="${color}" stroke="${color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/>`

        const dummyDoc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${pathMarkup}</svg>`, 'image/svg+xml')
        const pathElement = dummyDoc.querySelector('path') as Element

        const fillNode: SVGNode = {
          id: nodeId,
          name: nodeName,
          type: 'path',
          element: pathElement,
          isGroup: false,
          fillColor: undefined,
          children: [],
          customMarkup: pathMarkup,
        }

        fillNodes.push(fillNode)
      })

      const fillNodesByTargetId = new Map<string, SVGNode[]>()
      if (targetNodes.length > 0) {
        fillNodesByTargetId.set(targetNodes[0].id, fillNodes)
      }

      const targetIdSet = new Set(targetNodes.map(n => n.id))

      const updateNodesWithFillChildren = (nodes: SVGNode[]): SVGNode[] => {
        return nodes.map(node => {
          if (targetIdSet.has(node.id)) {
            const newChildren = fillNodesByTargetId.get(node.id) || []
            return {
              ...node,
              isGroup: newChildren.length > 0,
              type: newChildren.length > 0 ? 'g' : node.type,
              children: newChildren,
              customMarkup: undefined,
            }
          }
          if (node.children.length > 0) {
            return { ...node, children: updateNodesWithFillChildren(node.children) }
          }
          return node
        })
      }

      const updatedNodes = updateNodesWithFillChildren(layerNodes)
      setLayerNodes(updatedNodes)
      rebuildSvgFromLayers(updatedNodes)

      setPreservedFillData(null)
      setAccumulatedLayers([])
      setLayerColor('')
      setIsProcessing(false)

      setFillTargetNodeIds([])
      setActiveTab('sort')
    }, 0)
  }, [targetNodes, simplifiedHatchedPaths, accumulatedLayers, layerColor, retainStrokes, penWidthPx, layerNodes, setLayerNodes, setFillTargetNodeIds, setActiveTab, rebuildSvgFromLayers, setPreservedFillData, setIsProcessing, setAccumulatedLayers, setLayerColor])

  // Enter key handler
  useEffect(() => {
    const handleEnterKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (showHatchPreview && fillPaths.length > 0) {
        e.preventDefault()
        handleApplyFill()
      }
    }

    window.addEventListener('keydown', handleEnterKey)
    return () => window.removeEventListener('keydown', handleEnterKey)
  }, [showHatchPreview, fillPaths.length, handleApplyFill])

  // Fetch pattern banners
  useEffect(() => {
    if (!window.electron?.patternBanner) return

    const needed = new Map<string, { pattern: string; spacing: number }>()
    accumulatedLayers.forEach(layer => {
      const key = `${layer.pattern}|${layer.lineSpacing}`
      if (!bannerCache.has(key) && !needed.has(key)) {
        needed.set(key, { pattern: layer.pattern, spacing: layer.lineSpacing })
      }
    })

    if (needed.size === 0) return

    needed.forEach(async ({ pattern, spacing }, key) => {
      try {
        const seed = pattern.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        const svg = await window.electron!.patternBanner({
          pattern,
          spacing,
          seed,
          width: 2,
          height: 0.5,
          cells: 1,
        })
        setBannerCache(prev => new Map(prev).set(key, svg))
      } catch (err) {
        console.warn(`[FillTab] Failed to generate banner for ${pattern}:`, err)
      }
    })
  }, [accumulatedLayers, bannerCache, setBannerCache])

  // Get cached banner preview for a layer
  const getLayerPreview = useCallback((layer: FillLayer): string | null => {
    const key = `${layer.pattern}|${layer.lineSpacing}`
    return bannerCache.get(key) || null
  }, [bannerCache])

  // Render function for layer list items
  const renderLayerItem = useCallback((item: FillLayerListItem, itemState: ItemRenderState) => {
    const layer = item.fillLayer
    const bannerSvg = getLayerPreview(layer)
    const coloredBanner = bannerSvg
      ? bannerSvg.replace(/stroke="[^"]*"/g, `stroke="${layer.color}"`)
      : null

    return (
      <div className="accumulated-layer-item-content">
        <span className="layer-drag-handle">⋮⋮</span>
        <button
          className={`layer-visibility-btn ${itemState.isVisible ? 'visible' : 'hidden'}`}
          onClick={(e) => {
            e.stopPropagation()
            handleToggleLayerVisibility(layer.id)
          }}
          title={itemState.isVisible ? 'Hide layer' : 'Show layer'}
        >
          {itemState.isVisible ? '👁' : '👁‍🗨'}
        </button>
        {coloredBanner ? (
          <span
            className="layer-preview"
            style={{ opacity: itemState.isVisible ? 1 : 0.4 }}
            dangerouslySetInnerHTML={{ __html: coloredBanner }}
          />
        ) : (
          <span
            className="layer-color-swatch"
            style={{ backgroundColor: layer.color, opacity: itemState.isVisible ? 1 : 0.4 }}
          />
        )}
        <span className="layer-info" style={{ opacity: itemState.isVisible ? 1 : 0.5 }}>
          <span className="layer-pattern">{layer.pattern}</span>
          <span className="layer-details">{layer.angle}° • {layer.penWidth}mm • {layer.lineCount.toLocaleString()}</span>
        </span>
        <button
          className="layer-delete-btn"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteLayer(layer.id)
            setSelectedLayerIds(prev => {
              const newSet = new Set(prev)
              newSet.delete(layer.id)
              return newSet
            })
          }}
          title="Delete this layer"
        >
          ×
        </button>
      </div>
    )
  }, [handleDeleteLayer, handleToggleLayerVisibility, getLayerPreview, setSelectedLayerIds])

  const handleNavigateToOrder = useCallback(() => {
    if (!boundingBox || simplifiedHatchedPaths.length === 0) return

    setIsProcessing(true)

    setTimeout(() => {
      const optimizedLines = optimizeLineOrderMultiPass(simplifiedHatchedPaths)

      const orderLines = optimizedLines.map(line => ({
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        color: line.color,
        pathId: line.pathId,
      }))

      setOrderData({
        lines: orderLines,
        boundingBox,
        source: 'fill',
        onApply: () => {
          handleApplyFill()
        },
      })
      setIsProcessing(false)
      setActiveTab('order')
    }, 0)
  }, [boundingBox, simplifiedHatchedPaths, setOrderData, setActiveTab, handleApplyFill, setIsProcessing])

  if (!svgContent) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No SVG Loaded</h3>
          <p>Go to the Sort tab and upload an SVG to use line fill features.</p>
        </div>
      </div>
    )
  }

  if (fillTargetNodeIds.length === 0 || targetNodes.length === 0) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No Layers Selected</h3>
          <p>Go to the Sort tab, select one or more layers with fills, and click the Fill button.</p>
          <button className="back-button" onClick={handleBack}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fill-tab three-column">
      <aside className="fill-sidebar left">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleBack}>
            ← Back
          </button>
          <h2>Fill Layers</h2>
        </div>

        <div className="sidebar-controls">
          {/* Layer action buttons */}
          <div className="fill-control compact layer-buttons">
            <button
              className="new-layer-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleAddLayer}
              title={`Add current pattern as a layer and rotate angle by ${newLayerAngle}°`}
            >
              + Add Layer
            </button>
            <div className="new-layer-angle">
              <span>at</span>
              <input
                type="number"
                min="0"
                max="180"
                step="15"
                value={newLayerAngle}
                onChange={(e) => setNewLayerAngle(Math.max(0, Math.min(180, Number(e.target.value))))}
                className="angle-input"
              />
              <span>°</span>
            </div>
          </div>

          {/* Accumulated layers list */}
          <div className="accumulated-layers-list">
            <div className="accumulated-layers-header">
              <span>{accumulatedLayers.length} layer{accumulatedLayers.length !== 1 ? 's' : ''}</span>
              {accumulatedLayers.length > 0 && (
                <button
                  className="clear-layers-btn-small"
                  onClick={handleClearLayers}
                  title="Clear all accumulated layers"
                >
                  Clear
                </button>
              )}
            </div>
            <UnifiedLayerList
              items={layerListItems}
              mode="flat"
              selectedIds={selectedLayerIds}
              onSelectionChange={handleLayerSelectionChange}
              selectionMode="multi-with-modifiers"
              enableDragDrop={true}
              onReorderFlat={handleLayerReorder}
              renderItem={renderLayerItem}
              emptyMessage="Click &quot;Add Layer&quot; to create fill layers"
              className="accumulated-layers-items"
              itemClassName="accumulated-layer-item"
            />
            {selectedLayerIds.size === 2 && (
              <div className="weave-section">
                <div className="weave-header">
                  <span>Weave Settings</span>
                  <span className="weave-selection-count">2 layers</span>
                </div>

                <div className="weave-control">
                  <label>Pattern</label>
                  <div className="weave-pattern-buttons">
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'trueWeave' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('trueWeave')}
                      title="Alternating over/under per line"
                    >
                      Weave
                    </button>
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'checkerboard' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('checkerboard')}
                      title="Alternating per crossing"
                    >
                      Check
                    </button>
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'layer1Over' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('layer1Over')}
                      title="First layer always on top"
                    >
                      L1 Over
                    </button>
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'layer2Over' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('layer2Over')}
                      title="Second layer always on top"
                    >
                      L2 Over
                    </button>
                  </div>
                </div>

                <div className="weave-control">
                  <label>Gap Size: {weaveGapMargin.toFixed(1)}px</label>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={weaveGapMargin}
                    onChange={(e) => setWeaveGapMargin(Number(e.target.value))}
                    className="weave-slider"
                  />
                  <div className="weave-slider-labels">
                    <span>Tight</span>
                    <span>Wide</span>
                  </div>
                </div>

                <button
                  className="weave-apply-btn"
                  onClick={() => setWeaveRequested(true)}
                  title="Apply weave pattern to selected layers (Cmd+Shift+W)"
                >
                  Apply Weave
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main
        className="fill-main"
        ref={previewRef}
        {...panZoomHandlers}
      >
        {previewSvg ? (
          <div
            className="fill-preview-container"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <svg
              className="fill-preview-svg"
              viewBox={previewSvg.viewBox}
              preserveAspectRatio="xMidYMid meet"
              dangerouslySetInnerHTML={{ __html: previewSvg.content }}
            />
          </div>
        ) : (
          <div className="fill-preview-empty">
            <p>No geometry to preview</p>
          </div>
        )}
      </main>

      <aside className="fill-sidebar right">
        <div className="sidebar-content">
          {/* Big Apply CTA at top */}
          <button
            className="apply-btn-primary"
            disabled={fillPaths.length === 0 || (accumulatedLayers.length === 0 && !showHatchPreview)}
            onClick={handleApplyFill}
            title="Apply all fill layers to the SVG (Enter) - uses rat-king"
          >
            Apply Fill
          </button>

          {/* Warning when multiple shapes may need merging */}
          {fillPaths.length > 3 && !mergeBeforeFill && (
            <div className="fill-warning-banner">
              <div className="warning-icon">⚠️</div>
              <div className="warning-content">
                <strong>{fillPaths.length} separate shapes</strong>
                <p>Fill may appear in gaps between shapes. For text or logos, merge shapes first or enable "Merge before fill".</p>
                <div className="warning-actions">
                  <button
                    className="warning-btn primary"
                    onClick={() => setActiveTab('merge')}
                  >
                    Go to Merge Tab
                  </button>
                  <button
                    className="warning-btn secondary"
                    onClick={() => setMergeBeforeFill(true)}
                  >
                    Enable Merge
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="fill-section">
            <h3>Pattern Type</h3>
            <div className="pattern-selector">
              <button
                className={`pattern-btn ${fillPattern === 'lines' ? 'active' : ''}`}
                onClick={() => setFillPattern('lines')}
                title="Parallel lines at an angle"
              >
                Lines
              </button>
              {!DNF_PATTERNS.has('concentric') && (
              <button
                className={`pattern-btn ${fillPattern === 'concentric' ? 'active' : ''}`}
                onClick={() => setFillPattern('concentric')}
                title="Concentric loops from outside in (snake)"
              >
                Concentric
              </button>
              )}
              <button
                className={`pattern-btn ${fillPattern === 'wiggle' ? 'active' : ''}`}
                onClick={() => setFillPattern('wiggle')}
                title="Wavy/wiggle lines"
              >
                Wiggle
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'spiral' ? 'active' : ''}`}
                onClick={() => setFillPattern('spiral')}
                title="Spiral from center outward"
              >
                Spiral
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'honeycomb' ? 'active' : ''}`}
                onClick={() => setFillPattern('honeycomb')}
                title="Hexagonal honeycomb pattern"
              >
                Honeycomb
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'gyroid' ? 'active' : ''}`}
                onClick={() => setFillPattern('gyroid')}
                title="Gyroid minimal surface pattern"
              >
                Gyroid
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'crosshatch' ? 'active' : ''}`}
                onClick={() => setFillPattern('crosshatch')}
                title="Automatic crosshatch (two line sets at 90°)"
              >
                Crosshatch
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'zigzag' ? 'active' : ''}`}
                onClick={() => setFillPattern('zigzag')}
                title="Zigzag/sawtooth lines"
              >
                Zigzag
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'wave' ? 'active' : ''}`}
                onClick={() => setFillPattern('wave')}
                title="Smooth sine wave pattern"
              >
                Wave
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'radial' ? 'active' : ''}`}
                onClick={() => setFillPattern('radial')}
                title="Lines radiating from center"
              >
                Radial
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'crossspiral' ? 'active' : ''}`}
                onClick={() => setFillPattern('crossspiral')}
                title="Clockwise and counter-clockwise spirals overlaid"
              >
                X-Spiral
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'fermat' ? 'active' : ''}`}
                onClick={() => setFillPattern('fermat')}
                title="Fermat spiral (sunflower pattern)"
              >
                Fermat
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'hilbert' ? 'active' : ''}`}
                onClick={() => setFillPattern('hilbert')}
                title="Hilbert space-filling curve"
              >
                Hilbert
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'scribble' ? 'active' : ''}`}
                onClick={() => setFillPattern('scribble')}
                title="Random scribble pattern"
              >
                Scribble
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'custom' ? 'active' : ''}`}
                onClick={() => setFillPattern('custom')}
                title="Custom shape tiling"
              >
                Custom
              </button>
            </div>
          </div>

          {/* Fill Color controls */}
          <div className="fill-section">
            <h3>Fill Color</h3>
            <div className="fill-control">
              <div className="control-row color-row">
                <input
                  type="color"
                  value={draftLayerColor || (fillPaths[0]?.color || '#000000')}
                  onInput={(e) => setDraftLayerColor((e.target as HTMLInputElement).value)}
                  onChange={(e) => setLayerColor(e.target.value)}
                  className="layer-color-picker"
                  title="Pick color for this fill layer"
                />
                <input
                  type="text"
                  value={draftLayerColor || (fillPaths[0]?.color || '#000000')}
                  onChange={(e) => setDraftLayerColor(e.target.value)}
                  onBlur={(e) => setLayerColor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setLayerColor((e.target as HTMLInputElement).value)
                    }
                  }}
                  className="layer-color-input"
                  placeholder="#000000"
                />
                {(layerColor || draftLayerColor) && (
                  <button
                    className="layer-color-reset"
                    onClick={() => {
                      setLayerColor('')
                      setDraftLayerColor('')
                    }}
                    title="Reset to original color"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="fill-control">
              <label>Pen Width</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={draftPenWidth}
                  onChange={(e) => setDraftPenWidth(Number(e.target.value))}
                  onPointerUp={() => setPenWidth(draftPenWidth)}
                  onKeyUp={() => setPenWidth(draftPenWidth)}
                  className="fill-slider"
                />
                <span className="control-value">{draftPenWidth}mm</span>
              </div>
            </div>
          </div>

          <div className="fill-section">
            <h3>Pattern Settings</h3>

            <div
              className={`fill-control selectable ${selectedControl === 'lineSpacing' ? 'selected' : ''}`}
              onClick={() => setSelectedControl('lineSpacing')}
            >
              <label>Line Spacing</label>
              <div className="control-row">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={draftLineSpacing}
                  onChange={(e) => setDraftLineSpacing(Number(e.target.value))}
                  onPointerUp={() => setLineSpacing(draftLineSpacing)}
                  onKeyUp={() => setLineSpacing(draftLineSpacing)}
                  className="fill-slider"
                />
                <span className="control-value">{draftLineSpacing}px</span>
              </div>
            </div>

            <div
              className={`fill-control selectable ${selectedControl === 'angle' ? 'selected' : ''} ${fillPattern === 'concentric' || fillPattern === 'spiral' ? 'disabled' : ''}`}
              onClick={() => fillPattern !== 'concentric' && fillPattern !== 'spiral' && setSelectedControl('angle')}
            >
              <label>Angle</label>
              <div className="control-row">
                <span
                  className="angle-arrow"
                  style={{ transform: `rotate(${draftAngle}deg)`, opacity: fillPattern === 'concentric' || fillPattern === 'spiral' ? 0.4 : 1 }}
                  title={fillPattern === 'concentric' || fillPattern === 'spiral' ? 'Not applicable for this pattern' : `${draftAngle}° direction`}
                >
                  →
                </span>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={draftAngle}
                  onChange={(e) => setDraftAngle(Number(e.target.value))}
                  onPointerUp={() => setAngle(draftAngle)}
                  onKeyUp={() => setAngle(draftAngle)}
                  className="fill-slider"
                  disabled={fillPattern === 'concentric' || fillPattern === 'spiral'}
                />
                <span className="control-value">{draftAngle}°</span>
              </div>
            </div>

            {fillPattern === 'lines' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={crossHatch}
                    onChange={(e) => setCrossHatch(e.target.checked)}
                  />
                  Cross-hatch
                </label>
              </div>
            )}

            {(fillPattern === 'wiggle' || fillPattern === 'zigzag' || fillPattern === 'wave') && (
              <div
                className={`fill-control selectable ${selectedControl === 'wiggleAmplitude' ? 'selected' : ''}`}
                onClick={() => setSelectedControl('wiggleAmplitude')}
              >
                <label>Amplitude</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={draftWiggleAmplitude}
                    onChange={(e) => setDraftWiggleAmplitude(Number(e.target.value))}
                    onPointerUp={() => setWiggleAmplitude(draftWiggleAmplitude)}
                    onKeyUp={() => setWiggleAmplitude(draftWiggleAmplitude)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftWiggleAmplitude}px</span>
                </div>
              </div>
            )}

            {(fillPattern === 'wiggle' || fillPattern === 'wave') && (
              <div
                className={`fill-control selectable ${selectedControl === 'wiggleFrequency' ? 'selected' : ''}`}
                onClick={() => setSelectedControl('wiggleFrequency')}
              >
                <label>Frequency</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={draftWiggleFrequency}
                    onChange={(e) => setDraftWiggleFrequency(Number(e.target.value))}
                    onPointerUp={() => setWiggleFrequency(draftWiggleFrequency)}
                    onKeyUp={() => setWiggleFrequency(draftWiggleFrequency)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftWiggleFrequency}</span>
                </div>
              </div>
            )}

            {fillPattern === 'spiral' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={singleSpiral}
                    onChange={(e) => setSingleSpiral(e.target.checked)}
                  />
                  Single spiral pattern
                </label>
                <p className="control-hint">
                  {singleSpiral
                    ? 'One spiral across all shapes'
                    : 'Individual spiral per shape'}
                </p>
              </div>
            )}

            {(fillPattern === 'spiral' || fillPattern === 'crossspiral' || fillPattern === 'fermat') && (
              <div className="fill-control">
                <label>Over Diameter</label>
                <div className="control-row">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    value={spiralOverDiameter}
                    onChange={(e) => setSpiralOverDiameter(Number(e.target.value))}
                    className="fill-input"
                    style={{ width: '80px' }}
                  />
                  <span className="control-value">× radius</span>
                </div>
              </div>
            )}

            {fillPattern === 'fermat' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={singleFermat}
                    onChange={(e) => setSingleFermat(e.target.checked)}
                  />
                  Single Fermat pattern
                </label>
                <p className="control-hint">
                  {singleFermat
                    ? 'One spiral across all shapes'
                    : 'Individual spiral per shape'}
                </p>
              </div>
            )}

            {fillPattern === 'hilbert' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={singleHilbert}
                    onChange={(e) => setSingleHilbert(e.target.checked)}
                  />
                  Single Hilbert pattern
                </label>
                <p className="control-hint">
                  {singleHilbert
                    ? 'One curve across all shapes'
                    : 'Individual curve per shape'}
                </p>
              </div>
            )}

            {fillPattern === 'custom' && (
              <>
                <div className="fill-control">
                  <label>Tile Shape</label>
                  <div className="tile-shape-selector">
                    {(Object.keys(TILE_SHAPES) as (keyof typeof TILE_SHAPES)[]).map(shape => (
                      <button
                        key={shape}
                        className={`tile-shape-btn ${customTileShape === shape ? 'active' : ''}`}
                        onClick={() => setCustomTileShape(shape)}
                        title={shape.charAt(0).toUpperCase() + shape.slice(1)}
                      >
                        {shape === 'triangle' && '△'}
                        {shape === 'square' && '□'}
                        {shape === 'diamond' && '◇'}
                        {shape === 'hexagon' && '⬡'}
                        {shape === 'star' && '☆'}
                        {shape === 'plus' && '+'}
                        {shape === 'circle' && '○'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fill-control">
                  <label>Tile Gap</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={customTileGap}
                      onChange={(e) => setCustomTileGap(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{customTileGap}px</span>
                  </div>
                </div>

                <div className="fill-control">
                  <label>Tile Size</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0.2"
                      max="2.0"
                      step="0.1"
                      value={customTileScale}
                      onChange={(e) => setCustomTileScale(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{(customTileScale * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="fill-control">
                  <label>Rotate Offset</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0"
                      max="45"
                      step="1"
                      value={customTileRotateOffset}
                      onChange={(e) => setCustomTileRotateOffset(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{customTileRotateOffset}°</span>
                  </div>
                </div>
              </>
            )}

            {(fillPattern === 'lines' || fillPattern === 'wiggle' || fillPattern === 'honeycomb' || fillPattern === 'crosshatch' || fillPattern === 'zigzag' || fillPattern === 'radial' || fillPattern === 'crossspiral' || fillPattern === 'hilbert' || fillPattern === 'gyroid' || fillPattern === 'fermat' || fillPattern === 'wave' || fillPattern === 'scribble' || fillPattern === 'custom') && (
              <div
                className={`fill-control selectable ${selectedControl === 'inset' ? 'selected' : ''}`}
                onClick={() => setSelectedControl('inset')}
              >
                <label>Inset</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={draftInset}
                    onChange={(e) => setDraftInset(Number(e.target.value))}
                    onPointerUp={() => setInset(draftInset)}
                    onKeyUp={() => setInset(draftInset)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftInset}px</span>
                </div>
              </div>
            )}

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={retainStrokes}
                  onChange={(e) => setRetainStrokes(e.target.checked)}
                />
                Retain strokes (edge outlines)
              </label>
            </div>

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={mergeBeforeFill}
                  onChange={(e) => setMergeBeforeFill(e.target.checked)}
                />
                Merge shapes before fill
              </label>
              <span className="control-hint">Union all shapes into one (for text/logos)</span>
            </div>
          </div>

          <div className="fill-actions">
            <button
              className={`fill-preview-btn ${showHatchPreview ? 'active' : ''}`}
              disabled={fillPaths.length === 0}
              onClick={handlePreview}
            >
              {showHatchPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              className="fill-order-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleNavigateToOrder}
              title="View and optimize path order for pen plotters"
            >
              Order
            </button>
          </div>

          {showHatchPreview && fillProgress < 100 && (
            <div className="fill-progress">
              <div className="fill-progress-bar">
                <div
                  className="fill-progress-fill"
                  style={{ width: `${fillProgress}%` }}
                />
              </div>
              <span className="fill-progress-text">{fillProgress}%</span>
            </div>
          )}

          {fillStats && (
            <div className="fill-stats">
              <div className="fill-stat">
                <span className="stat-label">Lines:</span>
                <span className="stat-value">{fillStats.lines.toLocaleString()}</span>
              </div>
              <div className="fill-stat">
                <span className="stat-label">Points:</span>
                <span className="stat-value">{fillStats.points.toLocaleString()}</span>
              </div>
            </div>
          )}

          {showHatchPreview && (
            <div className="fill-control">
              <label>Simplify</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={draftSimplifyTolerance}
                  onChange={(e) => setDraftSimplifyTolerance(Number(e.target.value))}
                  onPointerUp={() => setSimplifyTolerance(draftSimplifyTolerance)}
                  onKeyUp={() => setSimplifyTolerance(draftSimplifyTolerance)}
                  className="fill-slider"
                />
                <span className="control-value">{draftSimplifyTolerance === 0 ? 'Off' : draftSimplifyTolerance.toFixed(1)}</span>
              </div>
            </div>
          )}

          <div className="fill-section">
            <h3>Crop</h3>
            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={enableCrop}
                  onChange={(e) => setEnableCrop(e.target.checked)}
                />
                Enable crop
              </label>
            </div>

            {enableCrop && (
              <div className="fill-control">
                <label>Crop Inset</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={draftCropInset}
                    onChange={(e) => setDraftCropInset(Number(e.target.value))}
                    onPointerUp={() => setCropInset(draftCropInset)}
                    onKeyUp={() => setCropInset(draftCropInset)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftCropInset}%</span>
                </div>
                <p className="control-hint">
                  Percentage from each edge to crop
                </p>
              </div>
            )}
          </div>

          {/* Weave Settings - shown when 2 layers are selected */}
          {selectedLayerIds.size === 2 && (
            <div className="fill-section weave-section">
              <h3>Weave Settings</h3>
              <div className="fill-control">
                <label>Pattern</label>
                <div className="pattern-selector weave-patterns">
                  <button
                    className={`pattern-btn ${weavePattern === 'trueWeave' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('trueWeave')}
                    title="Each line alternates over/under"
                  >
                    True Weave
                  </button>
                  <button
                    className={`pattern-btn ${weavePattern === 'checkerboard' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('checkerboard')}
                    title="Based on line indices"
                  >
                    Checkerboard
                  </button>
                  <button
                    className={`pattern-btn ${weavePattern === 'layer1Over' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('layer1Over')}
                    title="First selected layer always on top"
                  >
                    Layer 1 Over
                  </button>
                  <button
                    className={`pattern-btn ${weavePattern === 'layer2Over' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('layer2Over')}
                    title="Second selected layer always on top"
                  >
                    Layer 2 Over
                  </button>
                </div>
              </div>
              <div className="fill-control">
                <label>Gap Margin: {weaveGapMargin.toFixed(1)}px</label>
                <div className="control-row">
                  <input
                    type="range"
                    className="fill-slider"
                    min={0}
                    max={3}
                    step={0.1}
                    value={weaveGapMargin}
                    onChange={(e) => setWeaveGapMargin(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <button
                className="apply-btn-primary weave-btn"
                onClick={() => setWeaveRequested(true)}
              >
                Apply Weave
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-bar-left">
          {targetNodes.length === 1 && targetNode && (
            <span className="status-filename">{targetNode.name || targetNode.id}</span>
          )}
          {targetNodes.length > 1 && (
            <span className="status-filename">{targetNodes.length} layers selected</span>
          )}
        </div>
        <div className="status-bar-center">
          {fillPaths.length > 0 && (
            <span className="status-info">{fillPaths.length} fillable shapes</span>
          )}
        </div>
        <div className="status-bar-right">
          {fillStats && (
            <span className="status-info">
              {fillStats.lines.toLocaleString()} lines • {fillStats.points.toLocaleString()} points
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
