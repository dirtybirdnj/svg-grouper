import { useEffect, useRef, useState } from 'react'
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
  onCropResize
}: SVGCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [internalScale, setInternalScale] = useState(1)
  const [internalOffset, setInternalOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [isResizingCrop, setIsResizingCrop] = useState(false)
  const [resizeDirection, setResizeDirection] = useState<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null>(null)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, cropSize: 0 })
  const [previewCropSize, setPreviewCropSize] = useState<number | null>(null)

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
      }
    }
  }, [svgContent])

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

  // Render crop overlay as SVG elements inside the SVG
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !showCrop || !svgDimensions) {
      // Remove crop overlay if it exists
      const existing = svg?.querySelector('#crop-overlay-group')
      if (existing) {
        existing.remove()
      }
      return
    }

    const dims = getCropDimensionsInPixels()

    // Center the crop in SVG coordinates
    const centerX = svgDimensions.width / 2
    const centerY = svgDimensions.height / 2

    const x = centerX - dims.width / 2
    const y = centerY - dims.height / 2

    // Remove existing overlay
    const existing = svg.querySelector('#crop-overlay-group')
    if (existing) {
      existing.remove()
    }

    // Create crop overlay group
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.id = 'crop-overlay-group'
    group.style.pointerEvents = 'none'

    // Darken overlay (outside crop area)
    const darkOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    darkOverlay.setAttribute('x', '0')
    darkOverlay.setAttribute('y', '0')
    darkOverlay.setAttribute('width', String(svgDimensions.width))
    darkOverlay.setAttribute('height', String(svgDimensions.height))
    darkOverlay.setAttribute('fill', 'rgba(0, 0, 0, 0.5)')
    darkOverlay.setAttribute('mask', 'url(#crop-mask)')
    group.appendChild(darkOverlay)

    // Create mask to cut out the crop area
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask')
    mask.id = 'crop-mask'
    const maskBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    maskBg.setAttribute('x', '0')
    maskBg.setAttribute('y', '0')
    maskBg.setAttribute('width', String(svgDimensions.width))
    maskBg.setAttribute('height', String(svgDimensions.height))
    maskBg.setAttribute('fill', 'white')
    const maskCutout = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    maskCutout.setAttribute('x', String(x))
    maskCutout.setAttribute('y', String(y))
    maskCutout.setAttribute('width', String(dims.width))
    maskCutout.setAttribute('height', String(dims.height))
    maskCutout.setAttribute('fill', 'black')
    mask.appendChild(maskBg)
    mask.appendChild(maskCutout)
    defs.appendChild(mask)
    group.appendChild(defs)

    // Crop border
    const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    border.setAttribute('x', String(x))
    border.setAttribute('y', String(y))
    border.setAttribute('width', String(dims.width))
    border.setAttribute('height', String(dims.height))
    border.setAttribute('fill', 'none')
    border.setAttribute('stroke', '#4a90e2')
    border.setAttribute('stroke-width', '2')
    border.setAttribute('stroke-dasharray', '10 5')
    group.appendChild(border)

    // Center crosshairs
    const crosshairH = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    crosshairH.setAttribute('x1', String(x))
    crosshairH.setAttribute('y1', String(centerY))
    crosshairH.setAttribute('x2', String(x + dims.width))
    crosshairH.setAttribute('y2', String(centerY))
    crosshairH.setAttribute('stroke', '#4a90e2')
    crosshairH.setAttribute('stroke-width', '1')
    group.appendChild(crosshairH)

    const crosshairV = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    crosshairV.setAttribute('x1', String(centerX))
    crosshairV.setAttribute('y1', String(y))
    crosshairV.setAttribute('x2', String(centerX))
    crosshairV.setAttribute('y2', String(y + dims.height))
    crosshairV.setAttribute('stroke', '#4a90e2')
    crosshairV.setAttribute('stroke-width', '1')
    group.appendChild(crosshairV)

    svg.appendChild(group)
  }, [showCrop, svgDimensions, cropAspectRatio, cropSize, previewCropSize])

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

  // Calculate crop dimensions based on aspect ratio and size
  // Returns dimensions in SVG coordinate space (NOT VIEWPORT PIXELS!)
  const getCropDimensionsInPixels = () => {
    if (!svgDimensions) return { width: 0, height: 0 }

    // Use preview size during drag, otherwise use actual cropSize
    const effectiveCropSize = previewCropSize !== null ? previewCropSize : cropSize

    // Parse aspect ratio
    const [w, h] = cropAspectRatio.split(':').map(Number)
    const aspectRatio = w / h

    // Base size on smallest SVG dimension (PURE SVG COORDINATES, NO VIEWPORT SCALING)
    const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
    const baseSize = minDimension * effectiveCropSize

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

  const handleCropResizeStart = (e: React.MouseEvent | MouseEvent, direction: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    e.stopPropagation()
    e.preventDefault()
    setIsResizingCrop(true)
    setResizeDirection(direction)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      cropSize: cropSize
    })
  }

  useEffect(() => {
    if (!isResizingCrop || !svgDimensions) return

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate delta in viewport pixels
      const dx = e.clientX - resizeStart.x
      const dy = e.clientY - resizeStart.y

      // Choose the dominant direction
      let delta = 0
      if (resizeDirection?.includes('e')) delta = dx
      if (resizeDirection?.includes('w')) delta = -dx
      if (resizeDirection?.includes('s')) {
        const vertDelta = dy
        delta = Math.abs(vertDelta) > Math.abs(delta) ? vertDelta : delta
      }
      if (resizeDirection?.includes('n')) {
        const vertDelta = -dy
        delta = Math.abs(vertDelta) > Math.abs(delta) ? vertDelta : delta
      }

      // Convert viewport pixels to SVG units
      // Multiply by 2 because crop grows from center (both sides move)
      const svgDelta = (delta * 2) / scale

      // Current dimensions in SVG units
      const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
      const currentBaseSize = minDimension * resizeStart.cropSize

      // New base size
      const newBaseSize = currentBaseSize + svgDelta

      // Calculate new cropSize
      const newCropSize = newBaseSize / minDimension

      // Clamp to reasonable range (10% to 200%)
      const clampedCropSize = Math.max(0.1, Math.min(2.0, newCropSize))

      // Update preview only (don't trigger parent re-render)
      setPreviewCropSize(clampedCropSize)
    }

    const handleMouseUp = () => {
      // Commit the change to parent
      if (previewCropSize !== null && onCropResize) {
        onCropResize(previewCropSize)
      }
      setPreviewCropSize(null)
      setIsResizingCrop(false)
      setResizeDirection(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingCrop, resizeDirection, resizeStart, svgDimensions, scale, previewCropSize, onCropResize])

  return (
    <div className="svg-canvas">
      <div
        ref={containerRef}
        className={`canvas-content ${isPanning ? 'panning' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={svgContainerRef}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />

        {showCrop && svgDimensions && (() => {
          const svg = svgRef.current
          if (!svg) return null

          const dims = getCropDimensionsInPixels()
          const svgRect = svg.getBoundingClientRect()
          const containerRect = containerRef.current?.getBoundingClientRect()
          if (!containerRect) return null

          // Crop box in SVG coordinates (centered)
          const cropX = svgDimensions.width / 2 - dims.width / 2
          const cropY = svgDimensions.height / 2 - dims.height / 2

          // The SVG is scaled and translated, so we need to account for that
          // Calculate the actual scale of the SVG based on current zoom and viewport
          const svgNaturalScaleX = svgRect.width / svgDimensions.width
          const svgNaturalScaleY = svgRect.height / svgDimensions.height

          // Apply the zoom scale on top of the natural scale
          const effectiveScaleX = svgNaturalScaleX * scale
          const effectiveScaleY = svgNaturalScaleY * scale

          // Position in viewport relative to container, accounting for transform
          // The crop is at (cropX, cropY) in SVG coordinates
          // After scaling and translating, its position in viewport is:
          const viewportX = svgRect.left - containerRect.left + offset.x + cropX * effectiveScaleX
          const viewportY = svgRect.top - containerRect.top + offset.y + cropY * effectiveScaleY
          const viewportWidth = dims.width * effectiveScaleX
          const viewportHeight = dims.height * effectiveScaleY

          return (
            <div style={{
              position: 'absolute',
              left: `${viewportX}px`,
              top: `${viewportY}px`,
              width: `${viewportWidth}px`,
              height: `${viewportHeight}px`,
              pointerEvents: 'none',
              zIndex: 30
            }}>
              <div className="crop-handle crop-handle-n" onMouseDown={(e) => handleCropResizeStart(e, 'n')} />
              <div className="crop-handle crop-handle-s" onMouseDown={(e) => handleCropResizeStart(e, 's')} />
              <div className="crop-handle crop-handle-e" onMouseDown={(e) => handleCropResizeStart(e, 'e')} />
              <div className="crop-handle crop-handle-w" onMouseDown={(e) => handleCropResizeStart(e, 'w')} />
              <div className="crop-handle crop-handle-ne" onMouseDown={(e) => handleCropResizeStart(e, 'ne')} />
              <div className="crop-handle crop-handle-nw" onMouseDown={(e) => handleCropResizeStart(e, 'nw')} />
              <div className="crop-handle crop-handle-se" onMouseDown={(e) => handleCropResizeStart(e, 'se')} />
              <div className="crop-handle crop-handle-sw" onMouseDown={(e) => handleCropResizeStart(e, 'sw')} />
            </div>
          )
        })()}
      </div>
    </div>
  )
}
