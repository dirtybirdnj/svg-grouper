// Context module exports

// Re-export types
export type {
  LoadingState,
  OrderLine,
  OrderData,
  ArrangeHandlers,
  ToolHandlers,
  OptimizationSettings,
  ActiveToolType,
  CropAspectRatio,
} from './types'

// Re-export SVGContext
export { SVGProvider, useSVGContext } from './SVGContext'

// Re-export LayerContext
export { LayerProvider, useLayerContext } from './LayerContext'

// Re-export CanvasContext
export { CanvasProvider, useCanvasContext } from './CanvasContext'

// Re-export ToolContext
export { ToolProvider, useToolContext } from './ToolContext'

// Re-export UIContext
export { UIProvider, useUIContext } from './UIContext'

// Re-export FillContext
export { FillProvider, useFillContext } from './FillContext'

// Re-export combined provider
export { AppProvider } from './AppProvider'

// Legacy compatibility - useAppContext that combines all contexts
// This allows gradual migration of existing code
import { useSVGContext } from './SVGContext'
import { useLayerContext } from './LayerContext'
import { useCanvasContext } from './CanvasContext'
import { useToolContext } from './ToolContext'
import { useUIContext } from './UIContext'
import { useFillContext } from './FillContext'

/**
 * Legacy compatibility hook that returns all context values combined.
 * Use this for gradual migration - new code should use specific context hooks.
 *
 * @deprecated Use specific context hooks (useSVGContext, useLayerContext, etc.) instead
 */
export function useAppContext() {
  const svg = useSVGContext()
  const layer = useLayerContext()
  const canvas = useCanvasContext()
  const tool = useToolContext()
  const ui = useUIContext()
  const fill = useFillContext()

  // Combine all contexts into a single object for backward compatibility
  return {
    // SVG Context
    svgContent: svg.svgContent,
    setSvgContent: svg.setSvgContent,
    fileName: svg.fileName,
    setFileName: svg.setFileName,
    svgDimensions: svg.svgDimensions,
    setSvgDimensions: svg.setSvgDimensions,
    svgElementRef: svg.svgElementRef,
    syncSvgContent: svg.syncSvgContent,
    skipNextParse: svg.skipNextParse,
    originalSvgAttrs: svg.originalSvgAttrs,
    // Note: rebuildSvgFromLayers signature changed - needs layer.setLayerNodes
    rebuildSvgFromLayers: (nodes?: any) => {
      svg.rebuildSvgFromLayers(nodes ?? layer.layerNodes, layer.setLayerNodes)
    },
    refreshElementRefs: () => {
      svg.refreshElementRefs(layer.layerNodes, layer.setLayerNodes)
    },

    // Layer Context
    layerNodes: layer.layerNodes,
    setLayerNodes: layer.setLayerNodes,
    getNodeById: layer.getNodeById,
    selectedNodeIds: layer.selectedNodeIds,
    setSelectedNodeIds: layer.setSelectedNodeIds,
    lastSelectedNodeId: layer.lastSelectedNodeId,
    setLastSelectedNodeId: layer.setLastSelectedNodeId,

    // Canvas Context
    scale: canvas.scale,
    setScale: canvas.setScale,
    offset: canvas.offset,
    setOffset: canvas.setOffset,
    showCrop: canvas.showCrop,
    setShowCrop: canvas.setShowCrop,
    cropAspectRatio: canvas.cropAspectRatio,
    setCropAspectRatio: canvas.setCropAspectRatio,
    cropSize: canvas.cropSize,
    setCropSize: canvas.setCropSize,

    // Tool Context
    arrangeHandlers: tool.arrangeHandlers,
    toolHandlers: tool.toolHandlers,
    activeTool: tool.activeTool,
    setActiveTool: tool.setActiveTool,
    mergeColorTolerance: tool.mergeColorTolerance,
    setMergeColorTolerance: tool.setMergeColorTolerance,
    reducePaletteCount: tool.reducePaletteCount,
    setReducePaletteCount: tool.setReducePaletteCount,
    fillPatternType: tool.fillPatternType,
    setFillPatternType: tool.setFillPatternType,
    fillPatternSpacing: tool.fillPatternSpacing,
    setFillPatternSpacing: tool.setFillPatternSpacing,
    fillPatternAngle: tool.fillPatternAngle,
    setFillPatternAngle: tool.setFillPatternAngle,
    fillPatternKeepStrokes: tool.fillPatternKeepStrokes,
    setFillPatternKeepStrokes: tool.setFillPatternKeepStrokes,
    optimizationSettings: tool.optimizationSettings,
    setOptimizationSettings: tool.setOptimizationSettings,

    // UI Context
    activeTab: ui.activeTab,
    setActiveTab: ui.setActiveTab,
    loadingState: ui.loadingState,
    setLoadingState: ui.setLoadingState,
    handleLoadStart: ui.handleLoadStart,
    handleProgress: ui.handleProgress,
    parsingRef: ui.parsingRef,
    statusMessage: ui.statusMessage,
    setStatusMessage: ui.setStatusMessage,
    isProcessing: ui.isProcessing,
    setIsProcessing: ui.setIsProcessing,
    flattenArmed: ui.flattenArmed,
    setFlattenArmed: ui.setFlattenArmed,
    flattenOnImport: ui.flattenOnImport,
    setFlattenOnImport: ui.setFlattenOnImport,
    pendingFlatten: ui.pendingFlatten,
    setPendingFlatten: ui.setPendingFlatten,

    // Fill Context
    fillTargetNodeIds: fill.fillTargetNodeIds,
    setFillTargetNodeIds: fill.setFillTargetNodeIds,
    weaveRequested: fill.weaveRequested,
    setWeaveRequested: fill.setWeaveRequested,
    orderData: fill.orderData,
    setOrderData: fill.setOrderData,
  }
}
