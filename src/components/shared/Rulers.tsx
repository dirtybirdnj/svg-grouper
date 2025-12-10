import { useRef, useEffect, useCallback, useState } from 'react'
import './Rulers.css'

export type RulerUnit = 'mm' | 'in'

// Conversion constants (SVG uses pixels at 96 DPI)
const MM_PER_INCH = 25.4
const PX_PER_INCH = 96
const PX_PER_MM = PX_PER_INCH / MM_PER_INCH // ~3.78 px/mm

interface RulersProps {
  /** Width of the canvas in pixels */
  canvasWidth: number
  /** Height of the canvas in pixels */
  canvasHeight: number
  /** Current zoom scale */
  scale: number
  /** Current pan offset */
  offset: { x: number; y: number }
  /** SVG dimensions in its native units (usually pixels) */
  svgDimensions: { width: number; height: number } | null
  /** Unit to display */
  unit: RulerUnit
  /** Callback when unit changes */
  onUnitChange?: (unit: RulerUnit) => void
  /** Current cursor position in canvas coordinates (optional) */
  cursorPosition?: { x: number; y: number } | null
}

/**
 * Rulers component that displays horizontal and vertical rulers
 * around the SVG canvas with zoom-aware tick marks and labels.
 */
export function Rulers({
  canvasWidth,
  canvasHeight,
  scale,
  offset,
  svgDimensions,
  unit,
  onUnitChange,
  cursorPosition,
}: RulersProps) {
  const hRulerRef = useRef<HTMLCanvasElement>(null)
  const vRulerRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState(false)

  // Convert pixels to the selected unit
  const pxToUnit = useCallback(
    (px: number): number => {
      if (unit === 'mm') {
        return px / PX_PER_MM
      } else {
        return px / PX_PER_INCH
      }
    },
    [unit]
  )

  // Get appropriate tick interval based on zoom and unit
  const getTickInterval = useCallback(
    (scaledPxPerUnit: number): { major: number; minor: number } => {
      // scaledPxPerUnit is how many screen pixels per unit at current zoom
      // We want major ticks roughly every 50-100 pixels on screen
      const targetMajorPx = 80

      // Calculate what unit interval gives us ~targetMajorPx
      const targetInterval = targetMajorPx / scaledPxPerUnit

      // Round to a nice number
      const niceNumbers = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
      let major = 1
      for (const n of niceNumbers) {
        if (n >= targetInterval) {
          major = n
          break
        }
      }

      // Minor ticks: 2, 4, 5, or 10 per major
      let minor = major / 5
      if (major >= 100) minor = major / 10
      else if (major === 0.25) minor = 0.05
      else if (major === 0.5) minor = 0.1

      return { major, minor }
    },
    []
  )

  // Draw horizontal ruler
  const drawHorizontalRuler = useCallback(() => {
    const canvas = hRulerRef.current
    if (!canvas || !svgDimensions) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = '#f8f8f8'
    ctx.fillRect(0, 0, width, height)

    // Border
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)

    // Calculate SVG to screen mapping
    // The SVG is centered in the canvas, then scaled and offset
    const svgScreenWidth = svgDimensions.width * scale
    const svgCenterX = width / 2 + offset.x
    const svgStartX = svgCenterX - svgScreenWidth / 2

    // Pixels per unit at current scale
    const pxPerUnit = unit === 'mm' ? PX_PER_MM * scale : PX_PER_INCH * scale
    const { major, minor } = getTickInterval(pxPerUnit)

    // Determine visible range in units
    const startUnit = pxToUnit(-offset.x / scale - svgDimensions.width / 2)
    const endUnit = pxToUnit((width - offset.x) / scale - svgDimensions.width / 2 + svgDimensions.width)

    // Draw ticks
    ctx.fillStyle = '#333'
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'

    // Start from a nice round number before startUnit
    const firstTick = Math.floor(startUnit / minor) * minor

    for (let u = firstTick; u <= endUnit; u += minor) {
      // Convert unit position to screen X
      const svgPx = u * (unit === 'mm' ? PX_PER_MM : PX_PER_INCH)
      const screenX = svgStartX + (svgPx / svgDimensions.width) * svgScreenWidth

      if (screenX < 0 || screenX > width) continue

      const isMajor = Math.abs(u % major) < minor / 2 || Math.abs(u % major - major) < minor / 2
      const tickHeight = isMajor ? 12 : 6

      ctx.beginPath()
      ctx.moveTo(screenX, height)
      ctx.lineTo(screenX, height - tickHeight)
      ctx.stroke()

      // Label major ticks
      if (isMajor) {
        const label = u === 0 ? '0' : u.toFixed(major < 1 ? 1 : 0)
        ctx.fillText(label, screenX, 10)
      }
    }

    // Draw cursor indicator
    if (cursorPosition) {
      const cursorScreenX = svgStartX + (cursorPosition.x / svgDimensions.width) * svgScreenWidth
      if (cursorScreenX >= 0 && cursorScreenX <= width) {
        ctx.fillStyle = '#4a90e2'
        ctx.beginPath()
        ctx.moveTo(cursorScreenX, height)
        ctx.lineTo(cursorScreenX - 4, height - 8)
        ctx.lineTo(cursorScreenX + 4, height - 8)
        ctx.closePath()
        ctx.fill()
      }
    }
  }, [svgDimensions, scale, offset, unit, getTickInterval, pxToUnit, cursorPosition])

  // Draw vertical ruler
  const drawVerticalRuler = useCallback(() => {
    const canvas = vRulerRef.current
    if (!canvas || !svgDimensions) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = '#f8f8f8'
    ctx.fillRect(0, 0, width, height)

    // Border
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)

    // Calculate SVG to screen mapping
    const svgScreenHeight = svgDimensions.height * scale
    const svgCenterY = height / 2 + offset.y
    const svgStartY = svgCenterY - svgScreenHeight / 2

    // Pixels per unit at current scale
    const pxPerUnit = unit === 'mm' ? PX_PER_MM * scale : PX_PER_INCH * scale
    const { major, minor } = getTickInterval(pxPerUnit)

    // Determine visible range in units
    const startUnit = pxToUnit(-offset.y / scale - svgDimensions.height / 2)
    const endUnit = pxToUnit((height - offset.y) / scale - svgDimensions.height / 2 + svgDimensions.height)

    // Draw ticks
    ctx.fillStyle = '#333'
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textBaseline = 'middle'

    const firstTick = Math.floor(startUnit / minor) * minor

    for (let u = firstTick; u <= endUnit; u += minor) {
      // Convert unit position to screen Y
      const svgPx = u * (unit === 'mm' ? PX_PER_MM : PX_PER_INCH)
      const screenY = svgStartY + (svgPx / svgDimensions.height) * svgScreenHeight

      if (screenY < 0 || screenY > height) continue

      const isMajor = Math.abs(u % major) < minor / 2 || Math.abs(u % major - major) < minor / 2
      const tickWidth = isMajor ? 12 : 6

      ctx.beginPath()
      ctx.moveTo(width, screenY)
      ctx.lineTo(width - tickWidth, screenY)
      ctx.stroke()

      // Label major ticks (rotated)
      if (isMajor) {
        ctx.save()
        ctx.translate(10, screenY)
        ctx.rotate(-Math.PI / 2)
        const label = u === 0 ? '0' : u.toFixed(major < 1 ? 1 : 0)
        ctx.textAlign = 'center'
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }

    // Draw cursor indicator
    if (cursorPosition) {
      const cursorScreenY = svgStartY + (cursorPosition.y / svgDimensions.height) * svgScreenHeight
      if (cursorScreenY >= 0 && cursorScreenY <= height) {
        ctx.fillStyle = '#4a90e2'
        ctx.beginPath()
        ctx.moveTo(width, cursorScreenY)
        ctx.lineTo(width - 8, cursorScreenY - 4)
        ctx.lineTo(width - 8, cursorScreenY + 4)
        ctx.closePath()
        ctx.fill()
      }
    }
  }, [svgDimensions, scale, offset, unit, getTickInterval, pxToUnit, cursorPosition])

  // Redraw on changes
  useEffect(() => {
    drawHorizontalRuler()
    drawVerticalRuler()
  }, [drawHorizontalRuler, drawVerticalRuler, canvasWidth, canvasHeight])

  // Handle unit toggle on corner click
  const handleCornerClick = () => {
    if (onUnitChange) {
      onUnitChange(unit === 'mm' ? 'in' : 'mm')
    }
  }

  return (
    <>
      {/* Corner with unit toggle */}
      <div
        className={`ruler-corner ${hovered ? 'hovered' : ''}`}
        onClick={handleCornerClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`Click to switch to ${unit === 'mm' ? 'inches' : 'mm'}`}
      >
        {unit}
      </div>

      {/* Horizontal ruler */}
      <canvas ref={hRulerRef} className="ruler ruler-horizontal" />

      {/* Vertical ruler */}
      <canvas ref={vRulerRef} className="ruler ruler-vertical" />
    </>
  )
}

export default Rulers
