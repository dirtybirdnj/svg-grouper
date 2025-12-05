import { useEffect, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import './ToolsOverlay.css'

const AVAILABLE_PATTERNS = [
  { value: 'lines', label: 'Lines' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'wiggle', label: 'Wiggle' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'fermat', label: 'Fermat Spiral' },
  { value: 'concentric', label: 'Concentric' },
  { value: 'radial', label: 'Radial' },
  { value: 'honeycomb', label: 'Honeycomb' },
]

interface FillPatternOverlayProps {
  onAccept: () => void
}

export function FillPatternOverlay({ onAccept }: FillPatternOverlayProps) {
  const {
    activeTool,
    setActiveTool,
    selectedNodeIds,
    fillPatternType,
    setFillPatternType,
    fillPatternSpacing,
    setFillPatternSpacing,
    fillPatternAngle,
    setFillPatternAngle,
    fillPatternKeepStrokes,
    setFillPatternKeepStrokes,
  } = useAppContext()

  // Local draft state for immediate feedback
  const [draftPattern, setDraftPattern] = useState(fillPatternType)
  const [draftSpacing, setDraftSpacing] = useState(fillPatternSpacing)
  const [draftAngle, setDraftAngle] = useState(fillPatternAngle)
  const [draftKeepStrokes, setDraftKeepStrokes] = useState(fillPatternKeepStrokes)

  // Sync draft with actual when tool opens
  useEffect(() => {
    setDraftPattern(fillPatternType)
    setDraftSpacing(fillPatternSpacing)
    setDraftAngle(fillPatternAngle)
    setDraftKeepStrokes(fillPatternKeepStrokes)
  }, [fillPatternType, fillPatternSpacing, fillPatternAngle, fillPatternKeepStrokes])

  if (activeTool !== 'fill-pattern') {
    return null
  }

  const handleClose = () => {
    setActiveTool('none')
  }

  const handleAccept = () => {
    // Commit draft values to actual state
    setFillPatternType(draftPattern)
    setFillPatternSpacing(draftSpacing)
    setFillPatternAngle(draftAngle)
    setFillPatternKeepStrokes(draftKeepStrokes)
    onAccept()
  }

  const selectedCount = selectedNodeIds.size

  return (
    <div className="tools-overlay">
      <div className="tools-overlay-header">
        <h3 className="tools-overlay-title">Fill with Pattern</h3>
        <button className="tools-overlay-close" onClick={handleClose} title="Close">
          &times;
        </button>
      </div>

      <div className="tools-overlay-content">
        <div className="tool-control">
          <label className="tool-control-label">Pattern</label>
          <select
            className="tool-select"
            value={draftPattern}
            onChange={(e) => setDraftPattern(e.target.value)}
          >
            {AVAILABLE_PATTERNS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="tool-control">
          <label className="tool-control-label">Spacing</label>
          <div className="tool-slider-row">
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.1}
              value={draftSpacing}
              onChange={(e) => setDraftSpacing(Number(e.target.value))}
              className="tool-slider"
            />
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.1}
              value={draftSpacing}
              onChange={(e) => setDraftSpacing(Number(e.target.value))}
              className="tool-number"
            />
          </div>
          <div className="tool-help">Line spacing in SVG units</div>
        </div>

        <div className="tool-control">
          <label className="tool-control-label">Angle</label>
          <div className="tool-slider-row">
            <input
              type="range"
              min={0}
              max={180}
              step={1}
              value={draftAngle}
              onChange={(e) => setDraftAngle(Number(e.target.value))}
              className="tool-slider"
            />
            <input
              type="number"
              min={0}
              max={360}
              step={1}
              value={draftAngle}
              onChange={(e) => setDraftAngle(Number(e.target.value))}
              className="tool-number"
            />
          </div>
          <div className="tool-help">Pattern angle in degrees</div>
        </div>

        <div className="tool-control tool-checkbox-row">
          <label className="tool-checkbox-label">
            <input
              type="checkbox"
              checked={draftKeepStrokes}
              onChange={(e) => setDraftKeepStrokes(e.target.checked)}
            />
            Keep original strokes
          </label>
        </div>

        <div className="tools-overlay-stats">
          <span className="stat-current">
            Selected: <strong>{selectedCount}</strong> {selectedCount === 1 ? 'layer' : 'layers'}
          </span>
        </div>

        {selectedCount === 0 && (
          <div className="tool-warning">
            Select layers to fill with pattern
          </div>
        )}
      </div>

      <div className="tools-overlay-actions">
        <button className="tool-button tool-button-cancel" onClick={handleClose}>
          Cancel
        </button>
        <button
          className="tool-button tool-button-accept"
          onClick={handleAccept}
          disabled={selectedCount === 0}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
