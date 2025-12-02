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
  cropAspectRatio?: '1:2' | '2:3' | '3:4' | '16:9' | '9:16'
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
  // Zoom is centered on the viewport center (where the crop crosshairs are)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.1, Math.min(10, scale * delta))

      // Adjust offset to keep the viewport center fixed
      // The transform is: translate(offset) then scale from center
      // When scale changes, we need to adjust offset proportionally
      const scaleRatio = newScale / scale
      const newOffsetX = offset.x * scaleRatio
      const newOffsetY = offset.y * scaleRatio

      setScale(newScale)
      setOffset({ x: newOffsetX, y: newOffsetY })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [scale, setScale, offset, setOffset])

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

        {/* Fixed viewport crop overlay - ALWAYS centered in viewport with fixed screen size */}
        {showCrop && svgDimensions && (() => {
          // Get container dimensions
          const containerRect = containerRef.current?.getBoundingClientRect()
          if (!containerRect) return null

          // Get the actual SVG element
          const svgElement = svgContainerRef.current?.querySelector('svg')
          if (!svgElement) return null

          // Container dimensions
          const containerWidth = containerRect.width
          const containerHeight = containerRect.height

          // Don't render overlay if container hasn't rendered yet
          if (containerWidth <= 0 || containerHeight <= 0) {
            return null
          }

          // Crop box is a FIXED percentage of viewport, not tied to SVG coordinates
          // This means it stays the same size on screen regardless of zoom
          const [w, h] = cropAspectRatio.split(':').map(Number)
          const aspectRatio = w / h

          // Base the crop box size on the smaller viewport dimension
          const minViewportDim = Math.min(containerWidth, containerHeight)
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

          // ALWAYS center the crop box in the viewport
          const cropLeft = (containerWidth - viewportCropWidth) / 2
          const cropTop = (containerHeight - viewportCropHeight) / 2

          return (
            <>
              {/* Dark overlay with cutout - covers entire viewport */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                {/* Top overlay */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: Math.max(0, cropTop),
                  background: 'rgba(0, 0, 0, 0.5)',
                }} />
                {/* Bottom overlay */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: Math.max(0, containerHeight - cropTop - viewportCropHeight),
                  background: 'rgba(0, 0, 0, 0.5)',
                }} />
                {/* Left overlay */}
                <div style={{
                  position: 'absolute',
                  top: cropTop,
                  left: 0,
                  width: Math.max(0, cropLeft),
                  height: viewportCropHeight,
                  background: 'rgba(0, 0, 0, 0.5)',
                }} />
                {/* Right overlay */}
                <div style={{
                  position: 'absolute',
                  top: cropTop,
                  right: 0,
                  width: Math.max(0, containerWidth - cropLeft - viewportCropWidth),
                  height: viewportCropHeight,
                  background: 'rgba(0, 0, 0, 0.5)',
                }} />
                {/* Crop border */}
                <div style={{
                  position: 'absolute',
                  left: cropLeft,
                  top: cropTop,
                  width: viewportCropWidth,
                  height: viewportCropHeight,
                  border: '2px dashed #4a90e2',
                  boxSizing: 'border-box',
                }}>
                  {/* Center crosshairs */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: '#4a90e2',
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    background: '#4a90e2',
                  }} />
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
