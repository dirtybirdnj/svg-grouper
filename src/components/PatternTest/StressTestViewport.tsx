import { useRef, useEffect, useCallback, useState } from 'react'
import { HatchLine } from '../../utils/geometry'
import { StressTestResultData, StressTestPath } from './types'

interface StressTestViewportProps {
  stressPaths: StressTestPath[]
  stressViewBox: string
  stressSvgOutlines: string[]
  stressSvgTransform: string
  stressTestResult: StressTestResultData | null
  backgroundPngUrl: string | null
  backgroundPngSize: { width: number; height: number }
  shapeFillOpacity: number
  showHatchLines: boolean
}

// Convert lines to SVG path
function linesToPath(lines: HatchLine[]): string {
  if (lines.length === 0) return ''
  return lines.map(l => `M${l.x1},${l.y1}L${l.x2},${l.y2}`).join(' ')
}

export function StressTestViewport({
  stressPaths,
  stressViewBox,
  stressSvgOutlines,
  stressSvgTransform,
  stressTestResult,
  backgroundPngUrl,
  backgroundPngSize,
  shapeFillOpacity,
  showHatchLines,
}: StressTestViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom and pan state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Auto-center and zoom geometry when it loads
  useEffect(() => {
    if (stressPaths.length === 0 || !containerRef.current) return

    // Parse viewBox to get SVG dimensions
    const vbParts = stressViewBox.split(' ').map(Number)
    if (vbParts.length !== 4) return

    const [, , svgWidth, svgHeight] = vbParts
    const svgDisplayWidth = svgWidth * 4 // matches the inline style multiplier
    const svgDisplayHeight = svgHeight * 4

    // Get container dimensions
    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    // Calculate scale - target ~175% zoom for good detail visibility
    const padding = 40
    const scaleX = (containerWidth - padding * 2) / svgDisplayWidth
    const scaleY = (containerHeight - padding * 2) / svgDisplayHeight
    const fitScale = Math.min(scaleX, scaleY)
    // Boost to ~175% if the fit scale is smaller
    const targetScale = Math.max(fitScale, 1.75)

    // Calculate offset to center at target scale
    const scaledWidth = svgDisplayWidth * targetScale
    const scaledHeight = svgDisplayHeight * targetScale
    const offsetX = (containerWidth - scaledWidth) / 2
    const offsetY = (containerHeight - scaledHeight) / 2

    setScale(targetScale)
    setOffset({ x: offsetX, y: offsetY })
  }, [stressPaths.length, stressViewBox])

  // Zoom handler - attached via useEffect to use passive: false
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(prev => Math.min(20, Math.max(0.1, prev * delta)))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }, [offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    // Zoom in on double-click, centered on clicked point
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const newScale = Math.min(20, scale * 1.5)
    const scaleFactor = newScale / scale

    // Adjust offset to zoom toward click point
    setOffset(prev => ({
      x: clickX - (clickX - prev.x) * scaleFactor,
      y: clickY - (clickY - prev.y) * scaleFactor,
    }))
    setScale(newScale)
  }, [scale])

  if (stressPaths.length === 0) return null

  return (
    <div className="stress-test-result">
      <div className="stress-test-stats">
        <div>Polygons: {stressPaths.length}</div>
        <div>Vertices: {stressPaths.reduce((sum, p) => sum + p.polygon.outer.length, 0).toLocaleString()}</div>
        {backgroundPngSize.width > 0 && (
          <div>BG: {backgroundPngSize.width}x{backgroundPngSize.height}</div>
        )}
        {stressTestResult && (
          <>
            <div>Generated lines: {stressTestResult.lines.length.toLocaleString()}</div>
            <div>Time: {stressTestResult.timeMs.toFixed(1)}ms</div>
            <div className="polygon-stats">
              <span className="stat-filled">Filled: {stressTestResult.polygonStats.filled}</span>
              {stressTestResult.polygonStats.empty > 0 && (
                <>
                  <span className="stat-empty"> | Empty: {stressTestResult.polygonStats.empty}</span>
                  {stressTestResult.polygonStats.tooSmall > 0 && (
                    <span className="stat-small"> ({stressTestResult.polygonStats.tooSmall} too small)</span>
                  )}
                  {stressTestResult.polygonStats.empty - stressTestResult.polygonStats.tooSmall > 0 && (
                    <span className="stat-bug"> ({stressTestResult.polygonStats.empty - stressTestResult.polygonStats.tooSmall} missing!)</span>
                  )}
                </>
              )}
            </div>
            {stressTestResult.error && (
              <div className="error-text">Error: {stressTestResult.error}</div>
            )}
          </>
        )}
      </div>
      <div
        ref={containerRef}
        className="stress-test-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div
          className="stress-svg-container"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            viewBox={stressViewBox}
            className="stress-test-preview"
            preserveAspectRatio="xMidYMid meet"
            style={{
              width: `${parseFloat(stressViewBox.split(' ')[2] || '210') * 4}px`,
              height: `${parseFloat(stressViewBox.split(' ')[3] || '297') * 4}px`,
            }}
          >
            {/* Use cached PNG as background layer (much faster than drawing paths) */}
            {backgroundPngUrl && (
              <image
                href={backgroundPngUrl}
                x={stressViewBox.split(' ')[0]}
                y={stressViewBox.split(' ')[1]}
                width={stressViewBox.split(' ')[2]}
                height={stressViewBox.split(' ')[3]}
                opacity={shapeFillOpacity / 100}
                preserveAspectRatio="none"
              />
            )}
            {/* Fallback: draw paths if PNG not ready */}
            {!backgroundPngUrl && (
              <g transform={stressSvgTransform}>
                {stressSvgOutlines.map((d, i) => (
                  <path
                    key={`outline-${i}`}
                    d={d}
                    fill="#a8d483"
                    fillOpacity={shapeFillOpacity / 100}
                    stroke="#666"
                    strokeWidth={0.5}
                  />
                ))}
              </g>
            )}
            {/* Draw the hatch/pattern lines on top */}
            <g transform={stressSvgTransform}>
              {showHatchLines && stressTestResult && (
                <path
                  d={linesToPath(stressTestResult.lines)}
                  fill="none"
                  stroke={stressTestResult.error ? '#e74c3c' : (stressTestResult.lines.length === 0 ? '#f39c12' : '#3498db')}
                  strokeWidth={0.3}
                />
              )}
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
