import { useState, useCallback, useEffect } from 'react'
import { RulerUnit } from './Rulers'
import './ScaleControls.css'

// Conversion constants
const MM_PER_INCH = 25.4
const PX_PER_INCH = 96
const PX_PER_MM = PX_PER_INCH / MM_PER_INCH

interface ScaleControlsProps {
  /** Current SVG dimensions in pixels */
  svgDimensions: { width: number; height: number } | null
  /** Current display unit */
  unit: RulerUnit
  /** Callback when scale factor is applied */
  onScale: (factor: number) => void
  /** Callback when unit changes */
  onUnitChange?: (unit: RulerUnit) => void
  /** Whether scaling is currently disabled */
  disabled?: boolean
}

/**
 * Scale controls for resizing SVG artwork.
 * Supports percentage scaling and target dimension inputs.
 */
export function ScaleControls({
  svgDimensions,
  unit,
  onScale,
  onUnitChange,
  disabled = false,
}: ScaleControlsProps) {
  // Handle double-click to toggle units
  const handleUnitDoubleClick = () => {
    if (onUnitChange) {
      onUnitChange(unit === 'mm' ? 'in' : 'mm')
    }
  }
  // Percentage mode
  const [scalePercent, setScalePercent] = useState('100')

  // Dimension mode
  const [targetWidth, setTargetWidth] = useState('')
  const [targetHeight, setTargetHeight] = useState('')
  const [lockAspect, setLockAspect] = useState(true)

  // Track which dimension was last edited for aspect lock
  const [lastEdited, setLastEdited] = useState<'width' | 'height' | null>(null)

  // Convert pixels to display units
  const pxToUnit = useCallback(
    (px: number): number => {
      return unit === 'mm' ? px / PX_PER_MM : px / PX_PER_INCH
    },
    [unit]
  )

  // Convert display units to pixels
  const unitToPx = useCallback(
    (val: number): number => {
      return unit === 'mm' ? val * PX_PER_MM : val * PX_PER_INCH
    },
    [unit]
  )

  // Update dimension inputs when SVG dimensions change
  useEffect(() => {
    if (svgDimensions) {
      setTargetWidth(pxToUnit(svgDimensions.width).toFixed(1))
      setTargetHeight(pxToUnit(svgDimensions.height).toFixed(1))
    }
  }, [svgDimensions, pxToUnit])

  // Handle percentage change
  const handlePercentChange = (value: string) => {
    setScalePercent(value)
  }

  // Apply percentage scale
  const handleApplyPercent = () => {
    const percent = parseFloat(scalePercent)
    if (!isNaN(percent) && percent > 0) {
      onScale(percent / 100)
    }
  }

  // Preset percentage buttons
  const presets = [50, 100, 150, 200]

  // Handle width change
  const handleWidthChange = (value: string) => {
    setTargetWidth(value)
    setLastEdited('width')

    // Auto-update height if aspect lock is on
    if (lockAspect && svgDimensions) {
      const newWidth = parseFloat(value)
      if (!isNaN(newWidth) && newWidth > 0) {
        const currentWidth = pxToUnit(svgDimensions.width)
        const currentHeight = pxToUnit(svgDimensions.height)
        const aspectRatio = currentHeight / currentWidth
        setTargetHeight((newWidth * aspectRatio).toFixed(1))
      }
    }
  }

  // Handle height change
  const handleHeightChange = (value: string) => {
    setTargetHeight(value)
    setLastEdited('height')

    // Auto-update width if aspect lock is on
    if (lockAspect && svgDimensions) {
      const newHeight = parseFloat(value)
      if (!isNaN(newHeight) && newHeight > 0) {
        const currentWidth = pxToUnit(svgDimensions.width)
        const currentHeight = pxToUnit(svgDimensions.height)
        const aspectRatio = currentWidth / currentHeight
        setTargetWidth((newHeight * aspectRatio).toFixed(1))
      }
    }
  }

  // Apply dimension-based scale
  const handleApplyDimensions = () => {
    if (!svgDimensions) return

    const newWidth = parseFloat(targetWidth)
    const newHeight = parseFloat(targetHeight)

    if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
      return
    }

    const newWidthPx = unitToPx(newWidth)
    const newHeightPx = unitToPx(newHeight)

    // Calculate scale factor based on last edited dimension or average
    let scaleFactor: number
    if (lockAspect) {
      // Use either dimension (they should give same factor if aspect locked)
      scaleFactor = newWidthPx / svgDimensions.width
    } else {
      // Non-uniform scale - use the dimension that was last edited
      if (lastEdited === 'width') {
        scaleFactor = newWidthPx / svgDimensions.width
      } else if (lastEdited === 'height') {
        scaleFactor = newHeightPx / svgDimensions.height
      } else {
        // Default to average
        const widthFactor = newWidthPx / svgDimensions.width
        const heightFactor = newHeightPx / svgDimensions.height
        scaleFactor = (widthFactor + heightFactor) / 2
      }
    }

    onScale(scaleFactor)
  }

  // Get current dimensions in display units
  const currentWidth = svgDimensions ? pxToUnit(svgDimensions.width).toFixed(1) : '-'
  const currentHeight = svgDimensions ? pxToUnit(svgDimensions.height).toFixed(1) : '-'

  return (
    <div className={`scale-controls ${disabled ? 'disabled' : ''}`}>
      <div className="scale-section">
        <div className="scale-header">Scale by Percentage</div>
        <div className="scale-row">
          <div className="preset-buttons">
            {presets.map((preset) => (
              <button
                key={preset}
                className={`preset-btn ${scalePercent === String(preset) ? 'active' : ''}`}
                onClick={() => {
                  setScalePercent(String(preset))
                }}
                disabled={disabled}
              >
                {preset}%
              </button>
            ))}
          </div>
        </div>
        <div className="scale-row">
          <input
            type="number"
            className="scale-input"
            value={scalePercent}
            onChange={(e) => handlePercentChange(e.target.value)}
            min="1"
            max="1000"
            step="10"
            disabled={disabled}
          />
          <span className="input-suffix">%</span>
          <button
            className="apply-btn"
            onClick={handleApplyPercent}
            disabled={disabled || !svgDimensions}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="scale-divider" />

      <div className="scale-section">
        <div className="scale-header">Scale to Size</div>
        <div className="current-size">
          Current: {currentWidth} × {currentHeight} {unit}
        </div>
        <div className="dimension-inputs">
          <div className="dimension-row">
            <label>W</label>
            <input
              type="number"
              className="dimension-input"
              value={targetWidth}
              onChange={(e) => handleWidthChange(e.target.value)}
              min="0.1"
              step="0.1"
              disabled={disabled}
            />
            <span
              className="input-suffix unit-toggle"
              onDoubleClick={handleUnitDoubleClick}
              title="Double-click to toggle units"
            >
              {unit}
            </span>
          </div>
          <button
            className={`aspect-lock ${lockAspect ? 'locked' : ''}`}
            onClick={() => setLockAspect(!lockAspect)}
            title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            disabled={disabled}
          >
            {lockAspect ? '🔗' : '⛓️‍💥'}
          </button>
          <div className="dimension-row">
            <label>H</label>
            <input
              type="number"
              className="dimension-input"
              value={targetHeight}
              onChange={(e) => handleHeightChange(e.target.value)}
              min="0.1"
              step="0.1"
              disabled={disabled}
            />
            <span
              className="input-suffix unit-toggle"
              onDoubleClick={handleUnitDoubleClick}
              title="Double-click to toggle units"
            >
              {unit}
            </span>
          </div>
        </div>
        <button
          className="apply-btn full-width"
          onClick={handleApplyDimensions}
          disabled={disabled || !svgDimensions}
        >
          Apply Size
        </button>
      </div>
    </div>
  )
}

export default ScaleControls
