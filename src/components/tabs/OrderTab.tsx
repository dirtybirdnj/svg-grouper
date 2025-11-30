import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppContext, OrderLine } from '../../context/AppContext'
import { Point, distance } from '../../utils/geometry'
import './OrderTab.css'

interface OrderedLine extends OrderLine {
  originalIndex: number
  reversed: boolean
}

// Optimize lines using nearest-neighbor algorithm
function optimizeLines(lines: OrderLine[]): OrderedLine[] {
  if (lines.length === 0) return []

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

export default function OrderTab() {
  const { orderData, setOrderData, setActiveTab, scale, setScale, offset, setOffset } = useAppContext()

  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const animationRef = useRef<number | null>(null)

  // Drag state for pan
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const previewRef = useRef<HTMLDivElement>(null)

  // Optimize lines
  const { optimizedLines, stats } = useMemo(() => {
    if (!orderData || orderData.lines.length === 0) {
      return {
        optimizedLines: [],
        stats: { unoptimizedDistance: 0, optimizedDistance: 0, improvement: 0 }
      }
    }

    // Create unoptimized version for distance calculation
    const unoptimized: OrderedLine[] = orderData.lines.map((line, idx) => ({
      ...line,
      originalIndex: idx,
      reversed: false
    }))

    const optimized = optimizeLines(orderData.lines)

    const unoptimizedDistance = calculateTravelDistance(unoptimized)
    const optimizedDistance = calculateTravelDistance(optimized)
    const improvement = unoptimizedDistance > 0
      ? ((unoptimizedDistance - optimizedDistance) / unoptimizedDistance) * 100
      : 0

    return {
      optimizedLines: optimized,
      stats: { unoptimizedDistance, optimizedDistance, improvement }
    }
  }, [orderData])

  // Generate SVG preview
  const previewSvg = useMemo(() => {
    if (!orderData || optimizedLines.length === 0) return null

    const { boundingBox } = orderData
    const padding = 20
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`

    const totalLines = optimizedLines.length
    const visibleCount = isAnimating
      ? Math.floor((animationProgress / 100) * totalLines)
      : totalLines

    // Draw lines with gradient colors
    const linesHtml = optimizedLines.slice(0, visibleCount).map((line, index) => {
      const position = totalLines > 1 ? index / (totalLines - 1) : 0
      const color = getGradientColor(position)
      return `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${color}" stroke-width="1" stroke-linecap="round" />`
    }).join('\n')

    // Draw travel paths
    const travelLines: string[] = []
    const lineCount = isAnimating ? visibleCount : optimizedLines.length
    for (let i = 1; i < lineCount; i++) {
      const prevEnd = { x: optimizedLines[i - 1].x2, y: optimizedLines[i - 1].y2 }
      const currStart = { x: optimizedLines[i].x1, y: optimizedLines[i].y1 }
      travelLines.push(
        `<line x1="${prevEnd.x.toFixed(2)}" y1="${prevEnd.y.toFixed(2)}" x2="${currStart.x.toFixed(2)}" y2="${currStart.y.toFixed(2)}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5" />`
      )
    }

    const content = `
      <g class="order-lines">${linesHtml}</g>
      <g class="travel-paths">${travelLines.join('\n')}</g>
    `

    return { viewBox, content }
  }, [orderData, optimizedLines, isAnimating, animationProgress])

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

  const handleToggleAnimation = useCallback(() => {
    if (isAnimating) {
      setIsAnimating(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    } else {
      setIsAnimating(true)
      setAnimationProgress(0)
      const startTime = performance.now()
      const duration = 5000

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min((elapsed / duration) * 100, 100)
        setAnimationProgress(progress)

        if (progress < 100) {
          animationRef.current = requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
          animationRef.current = null
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }
  }, [isAnimating])

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

          <div className="order-section">
            <h3>Animation</h3>
            <div className="animation-controls">
              <button
                className={`animate-btn ${isAnimating ? 'active' : ''}`}
                onClick={handleToggleAnimation}
              >
                {isAnimating ? 'Stop' : 'Play'}
              </button>
              {isAnimating && (
                <div className="animation-progress">
                  <div
                    className="animation-progress-bar"
                    style={{ width: `${animationProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="order-section">
            <h3>Legend</h3>
            <div className="order-legend">
              <div className="legend-item">
                <span className="legend-gradient" />
                <span className="legend-text">Draw order (red → blue)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dashed" />
                <span className="legend-text">Travel moves (pen up)</span>
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
