import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppContext, OrderLine } from '../../context/AppContext'
import { Point, distance } from '../../utils/geometry'
import './OrderTab.css'

interface OrderedLine extends OrderLine {
  originalIndex: number
  reversed: boolean
}

// Animation speeds (in seconds for full animation)
const SPEED_OPTIONS = [
  { label: '0.5x', duration: 10000 },
  { label: '1x', duration: 5000 },
  { label: '2x', duration: 2500 },
  { label: '4x', duration: 1250 },
]

// Maximum lines for O(n²) optimization - beyond this, use chunked approach
const MAX_LINES_FOR_FULL_OPTIMIZATION = 5000

// Optimize lines using nearest-neighbor algorithm
// For large datasets, uses chunked optimization to avoid O(n²) blowup
function optimizeLines(lines: OrderLine[]): OrderedLine[] {
  if (lines.length === 0) return []

  // Filter out any invalid lines (missing coordinates)
  const validLines = lines.filter(line =>
    typeof line.x1 === 'number' && !isNaN(line.x1) &&
    typeof line.y1 === 'number' && !isNaN(line.y1) &&
    typeof line.x2 === 'number' && !isNaN(line.x2) &&
    typeof line.y2 === 'number' && !isNaN(line.y2)
  )

  if (validLines.length === 0) return []

  // For very large datasets, use chunked optimization
  if (validLines.length > MAX_LINES_FOR_FULL_OPTIMIZATION) {
    return optimizeLinesChunked(validLines)
  }

  return optimizeLinesNearestNeighbor(validLines)
}

// Full O(n²) nearest-neighbor optimization - only for smaller datasets
function optimizeLinesNearestNeighbor(lines: OrderLine[]): OrderedLine[] {
  const result: OrderedLine[] = []
  const remaining = lines.map((line, idx) => ({ ...line, originalIndex: idx }))
  let currentPoint: Point = { x: 0, y: 0 }

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

    for (let i = 0; i < remaining.length; i++) {
      const line = remaining[i]
      const start = { x: line.x1, y: line.y1 }
      const end = { x: line.x2, y: line.y2 }

      const distToStart = distance(currentPoint, start)
      if (distToStart < bestDistance) {
        bestDistance = distToStart
        bestIndex = i
        shouldReverse = false
      }

      const distToEnd = distance(currentPoint, end)
      if (distToEnd < bestDistance) {
        bestDistance = distToEnd
        bestIndex = i
        shouldReverse = true
      }
    }

    const chosenLine = remaining.splice(bestIndex, 1)[0]

    if (shouldReverse) {
      result.push({
        ...chosenLine,
        x1: chosenLine.x2,
        y1: chosenLine.y2,
        x2: chosenLine.x1,
        y2: chosenLine.y1,
        reversed: true
      })
      currentPoint = { x: chosenLine.x1, y: chosenLine.y1 }
    } else {
      result.push({
        ...chosenLine,
        reversed: false
      })
      currentPoint = { x: chosenLine.x2, y: chosenLine.y2 }
    }
  }

  return result
}

// Chunked optimization for large datasets - O(n * chunkSize) instead of O(n²)
// Divides lines into spatial chunks and optimizes within/between chunks
function optimizeLinesChunked(lines: OrderLine[]): OrderedLine[] {
  const CHUNK_SIZE = 1000

  // Sort lines by their starting x coordinate to get some spatial locality
  const indexedLines = lines.map((line, idx) => ({ ...line, originalIndex: idx }))
  indexedLines.sort((a, b) => a.x1 - b.x1)

  const result: OrderedLine[] = []
  let currentPoint: Point = { x: 0, y: 0 }

  // Process in chunks
  for (let chunkStart = 0; chunkStart < indexedLines.length; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, indexedLines.length)
    const chunk = indexedLines.slice(chunkStart, chunkEnd)

    // Optimize within this chunk using nearest-neighbor
    const remaining = [...chunk]

    while (remaining.length > 0) {
      let bestIndex = 0
      let bestDistance = Infinity
      let shouldReverse = false

      for (let i = 0; i < remaining.length; i++) {
        const line = remaining[i]
        const distToStart = distance(currentPoint, { x: line.x1, y: line.y1 })
        if (distToStart < bestDistance) {
          bestDistance = distToStart
          bestIndex = i
          shouldReverse = false
        }

        const distToEnd = distance(currentPoint, { x: line.x2, y: line.y2 })
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd
          bestIndex = i
          shouldReverse = true
        }
      }

      const chosenLine = remaining.splice(bestIndex, 1)[0]

      if (shouldReverse) {
        result.push({
          ...chosenLine,
          x1: chosenLine.x2,
          y1: chosenLine.y2,
          x2: chosenLine.x1,
          y2: chosenLine.y1,
          reversed: true
        })
        currentPoint = { x: chosenLine.x1, y: chosenLine.y1 }
      } else {
        result.push({
          ...chosenLine,
          reversed: false
        })
        currentPoint = { x: chosenLine.x2, y: chosenLine.y2 }
      }
    }
  }

  return result
}

// Calculate total travel distance
function calculateTravelDistance(lines: OrderedLine[]): number {
  if (lines.length <= 1) return 0

  let totalDistance = 0
  for (let i = 1; i < lines.length; i++) {
    const prevEnd = { x: lines[i - 1].x2, y: lines[i - 1].y2 }
    const currStart = { x: lines[i].x1, y: lines[i].y1 }
    totalDistance += distance(prevEnd, currStart)
  }
  return totalDistance
}

// Interpolate between red and blue based on position
function getGradientColor(position: number): string {
  const r = Math.round(255 * (1 - position))
  const g = 0
  const b = Math.round(255 * position)
  return `rgb(${r}, ${g}, ${b})`
}

// Layer info extracted from lines
interface LayerInfo {
  pathId: string
  color: string
  lineCount: number
  visible: boolean
}

export default function OrderTab() {
  const { orderData, setOrderData, setActiveTab, scale, setScale, offset, setOffset } = useAppContext()

  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1) // Default to 1x speed
  const [showTravelLines, setShowTravelLines] = useState(true)
  const [colorByLayer, setColorByLayer] = useState(true) // Use layer colors vs gradient
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set())
  const animationRef = useRef<number | null>(null)
  const animationStartRef = useRef<{ time: number; progress: number }>({ time: 0, progress: 0 })

  // Drag state for pan
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const previewRef = useRef<HTMLDivElement>(null)

  // Extract unique layers from lines
  const layers = useMemo((): LayerInfo[] => {
    if (!orderData || orderData.lines.length === 0) return []

    const layerMap = new Map<string, { color: string; count: number }>()

    for (const line of orderData.lines) {
      const existing = layerMap.get(line.pathId)
      if (existing) {
        existing.count++
      } else {
        layerMap.set(line.pathId, { color: line.color, count: 1 })
      }
    }

    return Array.from(layerMap.entries()).map(([pathId, info]) => ({
      pathId,
      color: info.color,
      lineCount: info.count,
      visible: visibleLayers.size === 0 || visibleLayers.has(pathId)
    }))
  }, [orderData, visibleLayers])

  // Initialize visible layers when orderData changes
  useEffect(() => {
    if (orderData && orderData.lines.length > 0) {
      const allPathIds = new Set(orderData.lines.map(l => l.pathId))
      setVisibleLayers(allPathIds)
    }
  }, [orderData])

  // Filter lines by visible layers
  const visibleLines = useMemo(() => {
    if (!orderData) return []
    if (visibleLayers.size === 0) return orderData.lines
    return orderData.lines.filter(line => visibleLayers.has(line.pathId))
  }, [orderData, visibleLayers])

  // Optimize lines (only visible ones)
  const { optimizedLines, stats } = useMemo(() => {
    if (visibleLines.length === 0) {
      return {
        optimizedLines: [],
        stats: { unoptimizedDistance: 0, optimizedDistance: 0, improvement: 0 }
      }
    }

    // Create unoptimized version for distance calculation
    const unoptimized: OrderedLine[] = visibleLines.map((line, idx) => ({
      ...line,
      originalIndex: idx,
      reversed: false
    }))

    const optimized = optimizeLines(visibleLines)

    const unoptimizedDistance = calculateTravelDistance(unoptimized)
    const optimizedDistance = calculateTravelDistance(optimized)
    const improvement = unoptimizedDistance > 0
      ? ((unoptimizedDistance - optimizedDistance) / unoptimizedDistance) * 100
      : 0

    return {
      optimizedLines: optimized,
      stats: { unoptimizedDistance, optimizedDistance, improvement }
    }
  }, [visibleLines])

  // Calculate pen position based on animation progress
  const penPosition = useMemo(() => {
    if (optimizedLines.length === 0) return null

    const totalLines = optimizedLines.length
    const visibleCount = Math.floor((animationProgress / 100) * totalLines)

    if (visibleCount === 0) {
      // At start, position at first line's start point
      const firstLine = optimizedLines[0]
      if (!firstLine) return null
      return { x: firstLine.x1, y: firstLine.y1, isDrawing: false }
    }

    // Calculate fractional progress within current line
    const exactLineIndex = (animationProgress / 100) * totalLines
    const currentLineIndex = Math.min(visibleCount - 1, totalLines - 1)
    const fractionWithinLine = exactLineIndex - Math.floor(exactLineIndex)

    const currentLine = optimizedLines[currentLineIndex]

    // Guard against undefined line (shouldn't happen, but be safe)
    if (!currentLine) return null

    // Interpolate position along current line
    const x = currentLine.x1 + (currentLine.x2 - currentLine.x1) * fractionWithinLine
    const y = currentLine.y1 + (currentLine.y2 - currentLine.y1) * fractionWithinLine

    return { x, y, isDrawing: true }
  }, [optimizedLines, animationProgress])

  // Generate SVG preview
  const previewSvg = useMemo(() => {
    if (!orderData || optimizedLines.length === 0) return null

    const { boundingBox } = orderData
    const padding = 20
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`

    const totalLines = optimizedLines.length
    const visibleCount = isAnimating || animationProgress < 100
      ? Math.floor((animationProgress / 100) * totalLines)
      : totalLines

    // For large datasets, use batched path elements instead of individual lines
    // Group lines by color and render as paths for better performance
    const MAX_INDIVIDUAL_LINES = 10000

    let linesHtml: string
    if (visibleCount > MAX_INDIVIDUAL_LINES) {
      // Batch render: group by color, create path elements
      const colorGroups = new Map<string, string[]>()

      for (let i = 0; i < visibleCount; i++) {
        const line = optimizedLines[i]
        if (!line) continue
        const color = colorByLayer ? (line.color || '#333') : getGradientColor(totalLines > 1 ? i / (totalLines - 1) : 0)
        if (!colorGroups.has(color)) {
          colorGroups.set(color, [])
        }
        colorGroups.get(color)!.push(`M${line.x1.toFixed(1)},${line.y1.toFixed(1)}L${line.x2.toFixed(1)},${line.y2.toFixed(1)}`)
      }

      linesHtml = Array.from(colorGroups.entries()).map(([color, paths]) =>
        `<path d="${paths.join(' ')}" stroke="${color}" stroke-width="1" stroke-linecap="round" fill="none" />`
      ).join('\n')
    } else {
      // Standard render: individual line elements
      linesHtml = optimizedLines.slice(0, visibleCount).map((line, index) => {
        if (!line) return ''
        let color: string
        if (colorByLayer) {
          color = line.color || '#333'
        } else {
          const position = totalLines > 1 ? index / (totalLines - 1) : 0
          color = getGradientColor(position)
        }
        return `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${color}" stroke-width="1" stroke-linecap="round" />`
      }).join('\n')
    }

    // Draw travel paths (pen-up moves) - limit for performance
    let travelLinesHtml = ''
    if (showTravelLines) {
      const lineCount = isAnimating || animationProgress < 100 ? visibleCount : optimizedLines.length
      // Limit travel lines to avoid performance issues
      const maxTravelLines = 5000
      const step = lineCount > maxTravelLines ? Math.ceil(lineCount / maxTravelLines) : 1

      const travelPaths: string[] = []
      for (let i = 1; i < lineCount; i += step) {
        const prev = optimizedLines[i - 1]
        const curr = optimizedLines[i]
        if (!prev || !curr) continue
        travelPaths.push(`M${prev.x2.toFixed(1)},${prev.y2.toFixed(1)}L${curr.x1.toFixed(1)},${curr.y1.toFixed(1)}`)
      }
      if (travelPaths.length > 0) {
        travelLinesHtml = `<path d="${travelPaths.join(' ')}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5" fill="none" />`
      }
    }

    // Pen position marker (circle with crosshair)
    let penMarkerHtml = ''
    if (penPosition && (isAnimating || animationProgress < 100)) {
      const markerSize = Math.min(boundingBox.width, boundingBox.height) * 0.02
      const color = penPosition.isDrawing ? '#e74c3c' : '#999'
      penMarkerHtml = `
        <g class="pen-marker">
          <circle cx="${penPosition.x.toFixed(2)}" cy="${penPosition.y.toFixed(2)}" r="${markerSize}" fill="none" stroke="${color}" stroke-width="1.5" />
          <line x1="${(penPosition.x - markerSize * 1.5).toFixed(2)}" y1="${penPosition.y.toFixed(2)}" x2="${(penPosition.x + markerSize * 1.5).toFixed(2)}" y2="${penPosition.y.toFixed(2)}" stroke="${color}" stroke-width="1" />
          <line x1="${penPosition.x.toFixed(2)}" y1="${(penPosition.y - markerSize * 1.5).toFixed(2)}" x2="${penPosition.x.toFixed(2)}" y2="${(penPosition.y + markerSize * 1.5).toFixed(2)}" stroke="${color}" stroke-width="1" />
        </g>
      `
    }

    const content = `
      <g class="travel-paths">${travelLinesHtml}</g>
      <g class="order-lines">${linesHtml}</g>
      ${penMarkerHtml}
    `

    return { viewBox, content }
  }, [orderData, optimizedLines, isAnimating, animationProgress, showTravelLines, penPosition, colorByLayer])

  // Handlers
  const handleBack = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    setOrderData(null)
    setActiveTab(orderData?.source === 'fill' ? 'fill' : 'sort')
  }, [orderData, setOrderData, setActiveTab])

  const handleApply = useCallback(() => {
    if (orderData?.onApply) {
      orderData.onApply(optimizedLines)
    }
    setOrderData(null)
    setActiveTab('sort')
  }, [orderData, optimizedLines, setOrderData, setActiveTab])

  // Start animation from current progress
  const startAnimation = useCallback((fromProgress: number = 0) => {
    const duration = SPEED_OPTIONS[speedIndex].duration
    animationStartRef.current = { time: performance.now(), progress: fromProgress }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - animationStartRef.current.time
      const progressGain = (elapsed / duration) * 100
      const progress = Math.min(animationStartRef.current.progress + progressGain, 100)
      setAnimationProgress(progress)

      if (progress < 100) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
        animationRef.current = null
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [speedIndex])

  const handleToggleAnimation = useCallback(() => {
    if (isAnimating) {
      // Pause
      setIsAnimating(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    } else {
      // Play from current position, or from start if at end
      setIsAnimating(true)
      const fromProgress = animationProgress >= 100 ? 0 : animationProgress
      if (animationProgress >= 100) setAnimationProgress(0)
      startAnimation(fromProgress)
    }
  }, [isAnimating, animationProgress, startAnimation])

  // Step forward one line
  const handleStepForward = useCallback(() => {
    if (isAnimating) return
    const totalLines = optimizedLines.length
    if (totalLines === 0) return
    const lineProgress = 100 / totalLines
    setAnimationProgress(Math.min(100, animationProgress + lineProgress))
  }, [isAnimating, optimizedLines.length, animationProgress])

  // Step backward one line
  const handleStepBackward = useCallback(() => {
    if (isAnimating) return
    const totalLines = optimizedLines.length
    if (totalLines === 0) return
    const lineProgress = 100 / totalLines
    setAnimationProgress(Math.max(0, animationProgress - lineProgress))
  }, [isAnimating, optimizedLines.length, animationProgress])

  // Handle progress scrubber drag
  const handleProgressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAnimating) {
      // Stop animation while scrubbing
      cancelAnimationFrame(animationRef.current!)
      animationRef.current = null
      setIsAnimating(false)
    }
    setAnimationProgress(parseFloat(e.target.value))
  }, [isAnimating])

  // Toggle layer visibility
  const handleToggleLayer = useCallback((pathId: string) => {
    setVisibleLayers(prev => {
      const next = new Set(prev)
      if (next.has(pathId)) {
        next.delete(pathId)
      } else {
        next.add(pathId)
      }
      return next
    })
    // Reset animation when layers change
    setAnimationProgress(0)
  }, [])

  // Toggle all layers on/off
  const handleToggleAllLayers = useCallback((visible: boolean) => {
    if (visible && orderData) {
      setVisibleLayers(new Set(orderData.lines.map(l => l.pathId)))
    } else {
      setVisibleLayers(new Set())
    }
    setAnimationProgress(0)
  }, [orderData])

  // Restart animation after speed change while playing
  useEffect(() => {
    if (isAnimating && animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      startAnimation(animationProgress)
    }
  }, [speedIndex]) // Only re-run when speed changes

  // Wheel zoom handler - use native event listener to support passive: false
  useEffect(() => {
    const element = previewRef.current
    if (!element) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(Math.max(0.1, Math.min(10, scale * delta)))
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [scale, setScale])

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
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart, setOffset])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  if (!orderData) {
    return (
      <div className="order-tab empty-state">
        <div className="empty-content">
          <h3>No Lines to Order</h3>
          <p>Select a group with line elements from the Sort tab, or generate fill lines from the Fill tab.</p>
          <button className="back-button" onClick={() => setActiveTab('sort')}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="order-tab">
      <aside className="order-sidebar">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleBack}>
            ← Back
          </button>
          <h2>Path Order</h2>
        </div>
        <div className="sidebar-content">
          <div className="order-section">
            <h3>Statistics</h3>
            <div className="order-stats">
              <div className="stat-row">
                <span className="stat-label">Total Lines:</span>
                <span className="stat-value">{optimizedLines.length}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Travel (original):</span>
                <span className="stat-value">{stats.unoptimizedDistance.toFixed(1)}px</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Travel (optimized):</span>
                <span className="stat-value">{stats.optimizedDistance.toFixed(1)}px</span>
              </div>
              <div className="stat-row highlight">
                <span className="stat-label">Saved:</span>
                <span className="stat-value">{stats.improvement.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Layers section - only show if multiple layers */}
          {layers.length > 1 && (
            <div className="order-section">
              <h3>Layers ({layers.length})</h3>
              <div className="layer-controls">
                <div className="layer-actions">
                  <button
                    className="layer-action-btn"
                    onClick={() => handleToggleAllLayers(true)}
                    disabled={visibleLayers.size === layers.length}
                  >
                    All
                  </button>
                  <button
                    className="layer-action-btn"
                    onClick={() => handleToggleAllLayers(false)}
                    disabled={visibleLayers.size === 0}
                  >
                    None
                  </button>
                </div>
                <div className="layer-list">
                  {layers.map((layer, idx) => (
                    <label key={layer.pathId} className="layer-item">
                      <input
                        type="checkbox"
                        checked={visibleLayers.has(layer.pathId)}
                        onChange={() => handleToggleLayer(layer.pathId)}
                      />
                      <span
                        className="layer-color"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="layer-name">
                        Layer {idx + 1}
                      </span>
                      <span className="layer-count">
                        {layer.lineCount}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="order-section">
            <h3>Playback</h3>
            <div className="animation-controls">
              {/* Transport controls */}
              <div className="transport-row">
                <button
                  className="transport-btn"
                  onClick={handleStepBackward}
                  disabled={isAnimating || animationProgress === 0}
                  title="Step back"
                >
                  ⏮
                </button>
                <button
                  className={`transport-btn play-btn ${isAnimating ? 'active' : ''}`}
                  onClick={handleToggleAnimation}
                  title={isAnimating ? 'Pause' : 'Play'}
                >
                  {isAnimating ? '⏸' : '▶'}
                </button>
                <button
                  className="transport-btn"
                  onClick={handleStepForward}
                  disabled={isAnimating || animationProgress >= 100}
                  title="Step forward"
                >
                  ⏭
                </button>
              </div>

              {/* Progress scrubber */}
              <div className="progress-scrubber">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={animationProgress}
                  onChange={handleProgressChange}
                  className="progress-slider"
                />
                <div className="progress-labels">
                  <span className="progress-current">
                    {Math.floor((animationProgress / 100) * optimizedLines.length)} / {optimizedLines.length} lines
                  </span>
                </div>
              </div>

              {/* Speed controls */}
              <div className="speed-controls">
                <span className="speed-label">Speed:</span>
                <div className="speed-buttons">
                  {SPEED_OPTIONS.map((opt, idx) => (
                    <button
                      key={opt.label}
                      className={`speed-btn ${speedIndex === idx ? 'active' : ''}`}
                      onClick={() => setSpeedIndex(idx)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="order-section">
            <h3>Display</h3>
            <div className="display-controls">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showTravelLines}
                  onChange={(e) => setShowTravelLines(e.target.checked)}
                />
                <span>Show travel moves (pen up)</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={colorByLayer}
                  onChange={(e) => setColorByLayer(e.target.checked)}
                />
                <span>Color by layer</span>
              </label>
            </div>
            <div className="order-legend">
              {colorByLayer ? (
                <div className="legend-item">
                  <span className="legend-layers" />
                  <span className="legend-text">Colored by layer</span>
                </div>
              ) : (
                <div className="legend-item">
                  <span className="legend-gradient" />
                  <span className="legend-text">Draw order (red → blue)</span>
                </div>
              )}
              {showTravelLines && (
                <div className="legend-item">
                  <span className="legend-dashed" />
                  <span className="legend-text">Travel moves</span>
                </div>
              )}
              <div className="legend-item">
                <span className="legend-pen" />
                <span className="legend-text">Pen position</span>
              </div>
            </div>
          </div>

          <div className="order-actions">
            {orderData.onApply && (
              <button className="apply-btn" onClick={handleApply}>
                Apply Order
              </button>
            )}
            <button className="cancel-btn" onClick={handleBack}>
              Cancel
            </button>
          </div>
        </div>
      </aside>

      <main
        className="order-main"
        ref={previewRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {previewSvg ? (
          <div
            className="order-preview-container"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <svg
              className="order-preview-svg"
              viewBox={previewSvg.viewBox}
              preserveAspectRatio="xMidYMid meet"
              dangerouslySetInnerHTML={{ __html: previewSvg.content }}
            />
          </div>
        ) : (
          <div className="order-preview-empty">
            <p>No lines to display</p>
          </div>
        )}
      </main>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-bar-left">
          {orderData?.source && <span className="status-filename">Source: {orderData.source}</span>}
        </div>
        <div className="status-bar-center">
          {optimizedLines.length > 0 && (
            <span className="status-info">{optimizedLines.length} lines</span>
          )}
        </div>
        <div className="status-bar-right">
          {stats.improvement > 0 && (
            <span className="status-info">
              Travel reduced: {stats.improvement.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
