import { useCallback, useEffect, MutableRefObject } from 'react'
import { cropSVGInBrowser } from '../../../../utils/cropSVG'
import { Rect } from '../../../../utils/geometry'

interface UseCropHandlerProps {
  canvasContainerRef: MutableRefObject<HTMLDivElement | null>
  needsFitToView: MutableRefObject<boolean>
  svgContent: string | null
  svgDimensions: { width: number; height: number } | null
  cropAspectRatio: string
  setCropAspectRatio: (ratio: '1:2' | '2:3' | '3:4' | '16:9' | '9:16') => void
  cropSize: number
  setStatusMessage: (msg: string) => void
  setIsProcessing: (processing: boolean) => void
  setSvgContent: (content: string) => void
  setLayerNodes: (nodes: never[]) => void
  setSelectedNodeIds: (ids: Set<string>) => void
  setLastSelectedNodeId: (id: string | null) => void
  setFillTargetNodeIds: (ids: string[]) => void
  setOrderData: (data: null) => void
  setSvgDimensions: (dims: null) => void
  originalSvgAttrs: MutableRefObject<string[] | null>
  skipNextParse: MutableRefObject<boolean>
  parsingRef: MutableRefObject<boolean>
  setShowCrop: (show: boolean) => void
}

export function useCropHandler({
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
}: UseCropHandlerProps) {

  const rotateCropAspectRatio = useCallback(() => {
    const [w, h] = cropAspectRatio.split(':')
    setCropAspectRatio(`${h}:${w}` as '1:2' | '2:3' | '3:4' | '16:9' | '9:16')
  }, [cropAspectRatio, setCropAspectRatio])

  // Apply crop to SVG
  const handleApplyCrop = useCallback(async () => {
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

    // Find the actual canvas-content element inside SVGCanvas (not the outer container)
    // This is important because the outer container has padding when rulers are shown
    const canvasContent = container.querySelector('.canvas-content')
    if (!canvasContent) {
      setStatusMessage('error:Could not find canvas content')
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
    // Use canvas-content rect (same as SVGCanvas uses for its crop overlay)
    const contentRect = canvasContent.getBoundingClientRect()

    // Calculate viewport crop box (same as SVGCanvas overlay)
    const [w, h] = cropAspectRatio.split(':').map(Number)
    const aspectRatio = w / h
    const minViewportDim = Math.min(contentRect.width, contentRect.height)
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

    // Viewport crop box corners (always centered in canvas-content viewport)
    const viewportCropLeft = (contentRect.width - viewportCropWidth) / 2
    const viewportCropTop = (contentRect.height - viewportCropHeight) / 2

    // SVG position relative to canvas-content
    const svgLeftInContainer = svgRect.left - contentRect.left
    const svgTopInContainer = svgRect.top - contentRect.top

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

      // Flag that we need to fit the cropped content to view
      needsFitToView.current = true

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
  }, [
    canvasContainerRef,
    needsFitToView,
    svgContent,
    svgDimensions,
    cropAspectRatio,
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
  ])

  // Listen for apply-crop event from header button
  useEffect(() => {
    const handleApplyCropEvent = () => {
      handleApplyCrop()
    }

    window.addEventListener('apply-crop', handleApplyCropEvent)
    return () => window.removeEventListener('apply-crop', handleApplyCropEvent)
  }, [handleApplyCrop])

  return {
    rotateCropAspectRatio,
    handleApplyCrop,
  }
}
