import { useEffect, useRef, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import './SVGCanvas.css'

interface SVGCanvasProps {
  svgContent: string
  onSVGParsed?: (svgElement: SVGSVGElement) => void
  scale?: number
  onScaleChange?: (scale: number) => void
  offset?: { x: number; y: number }
  onOffsetChange?: (offset: { x: number; y: number }) => void
  showCrop?: boolean
  cropAspectRatio?: '1:2' | '3:4' | '16:9' | '9:16'
  cropSize?: number
  svgDimensions?: { width: number; height: number } | null
  onCropResize?: (newSize: number) => void
}

export default function SVGCanvas({
  svgContent,
  onSVGParsed,
  scale: externalScale,
  onScaleChange,
  offset: externalOffset,
  onOffsetChange,
  showCrop = false,
  cropAspectRatio = '3:4',
  cropSize = 0.5,
  svgDimensions = null,
  onCropResize: _onCropResize
}: SVGCanvasProps) {
  const { svgElementRef } = useAppContext()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [internalScale, setInternalScale] = useState(1)
  const [internalOffset, setInternalOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const parsedRef = useRef(false)
  const currentContentRef = useRef<string>('')

  // Use external state if provided, otherwise use internal state
  const scale = externalScale ?? internalScale
  const offset = externalOffset ?? internalOffset
  const setScale = onScaleChange ?? setInternalScale
  const setOffset = onOffsetChange ?? setInternalOffset

  useEffect(() => {
    // Only update DOM when svgContent actually changes
    if (svgContainerRef.current && currentContentRef.current !== svgContent) {
      svgContainerRef.current.innerHTML = svgContent
      currentContentRef.current = svgContent
      parsedRef.current = false

      // Get reference to the SVG element
      const svg = svgContainerRef.current.querySelector('svg')
      if (svg) {
        svgRef.current = svg
        // Store in context for export functionality
        svgElementRef.current = svg
      }
    }
  }, [svgContent, svgElementRef])

  useEffect(() => {
    // Parse and notify parent of SVG element only once per content change
    if (containerRef.current && !parsedRef.current && currentContentRef.current) {
      const svgElement = containerRef.current.querySelector('svg')
      if (svgElement && onSVGParsed) {
        parsedRef.current = true
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          onSVGParsed(svgElement)
        }, 0)
      }
    }
  }, [svgContent, onSVGParsed])

  // Add native wheel event listener to properly handle preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.1, Math.min(10, scale * delta))
      setScale(newScale)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [scale, setScale])

  // Render crop overlay as fixed viewport overlay when crop is active
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Remove SVG-based crop overlay if it exists
    const existing = svg.querySelector('#crop-overlay-group')
    if (existing) {
      existing.remove()
    }
  }, [showCrop])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      setIsPanning(true)
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()

    // Get container bounds
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()

    // Click position relative to container
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Container center
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Calculate new scale (zoom in by 1.5x)
    const zoomFactor = 1.5
    const newScale = Math.min(10, scale * zoomFactor)

    // Convert click position to SVG coordinates (before zoom)
    // The SVG is transformed from center, so we need to account for that
    const svgX = (clickX - centerX - offset.x) / scale
    const svgY = (clickY - centerY - offset.y) / scale

    // Calculate new offset to center the clicked point
    // After zoom, we want the clicked SVG point to be at the container center
    const newOffsetX = -svgX * newScale
    const newOffsetY = -svgY * newScale

    setScale(newScale)
    setOffset({ x: newOffsetX, y: newOffsetY })
  }

  // Calculate crop dimensions based on aspect ratio and size
  // Returns dimensions in SVG coordinate space (NOT VIEWPORT PIXELS!)
  const getCropDimensionsInPixels = () => {
    if (!svgDimensions) return { width: 0, height: 0 }

    // Parse aspect ratio
    const [w, h] = cropAspectRatio.split(':').map(Number)
    const aspectRatio = w / h

    // Base size on smallest SVG dimension (PURE SVG COORDINATES, NO VIEWPORT SCALING)
    const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
    const baseSize = minDimension * cropSize

    // Calculate width and height maintaining aspect ratio
    let width: number
    let height: number

    if (aspectRatio >= 1) {
      // Landscape or square
      width = baseSize
      height = baseSize / aspectRatio
    } else {
      // Portrait
      height = baseSize
      width = baseSize * aspectRatio
    }

    return { width, height }
  }

  return (
    <div className="svg-canvas">
      <div
        ref={containerRef}
        className={`canvas-content ${isPanning ? 'panning' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <div
          ref={svgContainerRef}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />

        {/* Fixed viewport crop overlay */}
        {showCrop && svgDimensions && (() => {
          const dims = getCropDimensionsInPixels()

          // Get container dimensions
          const containerRect = containerRef.current?.getBoundingClientRect()
          if (!containerRect) return null

          // Get the actual SVG element to calculate proper positioning
          const svgElement = svgContainerRef.current?.querySelector('svg')
          if (!svgElement) return null

          // Calculate viewport center
          const viewportCenterX = containerRect.width / 2
          const viewportCenterY = containerRect.height / 2

          // Calculate the effective scale (base CSS scale + user zoom)
          const svgRect = svgElement.getBoundingClientRect()
          const baseSvgWidth = svgRect.width / scale
          const baseScale = baseSvgWidth / svgDimensions.width
          const effectiveScale = baseScale * scale

          // Calculate crop position in SVG coordinates
          const svgCenterX = svgDimensions.width / 2 - offset.x / effectiveScale
          const svgCenterY = svgDimensions.height / 2 - offset.y / effectiveScale

          let cropSvgX = svgCenterX - dims.width / 2
          let cropSvgY = svgCenterY - dims.height / 2

          // Clamp to SVG bounds
          if (cropSvgX < 0) cropSvgX = 0
          if (cropSvgY < 0) cropSvgY = 0
          if (cropSvgX + dims.width > svgDimensions.width) cropSvgX = svgDimensions.width - dims.width
          if (cropSvgY + dims.height > svgDimensions.height) cropSvgY = svgDimensions.height - dims.height

          // Convert SVG coords to viewport coords for rendering the overlay
          const cropLeft = viewportCenterX + offset.x + (cropSvgX - svgDimensions.width / 2) * effectiveScale
          const cropTop = viewportCenterY + offset.y + (cropSvgY - svgDimensions.height / 2) * effectiveScale
          const viewportWidth = dims.width * effectiveScale
          const viewportHeight = dims.height * effectiveScale

          return (
            <>
              {/* Dark overlay with cutout */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                <svg
                  style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                  }}
                >
                  <defs>
                    <mask id="viewport-crop-mask">
                      <rect width="100%" height="100%" fill="white" />
                      <rect
                        x={cropLeft}
                        y={cropTop}
                        width={viewportWidth}
                        height={viewportHeight}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.5)"
                    mask="url(#viewport-crop-mask)"
                  />
                  {/* Crop border */}
                  <rect
                    x={cropLeft}
                    y={cropTop}
                    width={viewportWidth}
                    height={viewportHeight}
                    fill="none"
                    stroke="#4a90e2"
                    strokeWidth="2"
                    strokeDasharray="10 5"
                  />
                  {/* Center crosshairs */}
                  <line
                    x1={cropLeft}
                    y1={cropTop + viewportHeight / 2}
                    x2={cropLeft + viewportWidth}
                    y2={cropTop + viewportHeight / 2}
                    stroke="#4a90e2"
                    strokeWidth="1"
                  />
                  <line
                    x1={cropLeft + viewportWidth / 2}
                    y1={cropTop}
                    x2={cropLeft + viewportWidth / 2}
                    y2={cropTop + viewportHeight}
                    stroke="#4a90e2"
                    strokeWidth="1"
                  />
                </svg>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
