import { useEffect, useState, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { calculateMergeResult, calculateReduceResult } from '../utils/colorDistance'
import './ToolsOverlay.css'

interface ToolsOverlayProps {
  onAccept: () => void
}

export function ToolsOverlay({ onAccept }: ToolsOverlayProps) {
  const {
    activeTool,
    setActiveTool,
    layerNodes,
    mergeColorTolerance,
    setMergeColorTolerance,
    reducePaletteCount,
    setReducePaletteCount,
  } = useAppContext()

  // Local draft state for immediate feedback while dragging
  const [draftTolerance, setDraftTolerance] = useState(mergeColorTolerance)
  const [draftPaletteCount, setDraftPaletteCount] = useState(reducePaletteCount)

  // Sync draft with actual when tool opens or actual changes
  useEffect(() => {
    setDraftTolerance(mergeColorTolerance)
  }, [mergeColorTolerance])

  useEffect(() => {
    setDraftPaletteCount(reducePaletteCount)
  }, [reducePaletteCount])

  // Calculate current group count
  const currentGroupCount = useMemo(() => {
    return layerNodes.length
  }, [layerNodes])

  // Calculate result for merge tool
  const mergeResult = useMemo(() => {
    if (activeTool !== 'merge-colors' || layerNodes.length === 0) {
      return { resultCount: 0, resultColors: [] as string[] }
    }
    return calculateMergeResult(layerNodes, draftTolerance)
  }, [activeTool, layerNodes, draftTolerance])

  // Calculate result for reduce tool
  const reduceResult = useMemo(() => {
    if (activeTool !== 'reduce-palette' || layerNodes.length === 0) {
      return { resultCount: 0, resultColors: [] as string[] }
    }
    return calculateReduceResult(layerNodes, draftPaletteCount)
  }, [activeTool, layerNodes, draftPaletteCount])

  // Get the result colors to display
  const resultColors = activeTool === 'merge-colors'
    ? mergeResult.resultColors
    : reduceResult.resultColors

  if (activeTool === 'none') {
    return null
  }

  const handleClose = () => {
    setActiveTool('none')
  }

  const handleAccept = () => {
    // Commit draft values to actual state
    if (activeTool === 'merge-colors') {
      setMergeColorTolerance(draftTolerance)
    } else if (activeTool === 'reduce-palette') {
      setReducePaletteCount(draftPaletteCount)
    }
    onAccept()
  }

  const handleToleranceChange = (value: number) => {
    setDraftTolerance(value)
  }

  const handlePaletteCountChange = (value: number) => {
    setDraftPaletteCount(value)
  }

  return (
    <div className="tools-overlay">
      <div className="tools-overlay-header">
        <h3 className="tools-overlay-title">
          {activeTool === 'merge-colors' && 'Merge Similar Colors'}
          {activeTool === 'reduce-palette' && 'Reduce to Palette'}
        </h3>
        <button className="tools-overlay-close" onClick={handleClose} title="Close">
          &times;
        </button>
      </div>

      <div className="tools-overlay-content">
        {activeTool === 'merge-colors' && (
          <div className="tool-control">
            <label className="tool-control-label">Tolerance</label>
            <div className="tool-slider-row">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={draftTolerance}
                onChange={(e) => handleToleranceChange(Number(e.target.value))}
                className="tool-slider"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={draftTolerance}
                onChange={(e) => handleToleranceChange(Number(e.target.value))}
                className="tool-number"
              />
            </div>
            <div className="tool-help">
              0 = exact match only, 100 = merge all similar colors
            </div>
          </div>
        )}

        {activeTool === 'reduce-palette' && (
          <div className="tool-control">
            <label className="tool-control-label">Target Colors</label>
            <div className="tool-slider-row">
              <input
                type="range"
                min={2}
                max={16}
                step={1}
                value={draftPaletteCount}
                onChange={(e) => handlePaletteCountChange(Number(e.target.value))}
                className="tool-slider"
              />
              <input
                type="number"
                min={2}
                max={16}
                value={draftPaletteCount}
                onChange={(e) => handlePaletteCountChange(Number(e.target.value))}
                className="tool-number"
              />
            </div>
            <div className="tool-help">
              Reduce colors to this many groups using k-means clustering
            </div>
          </div>
        )}

        <div className="tools-overlay-stats">
          <span className="stat-current">
            Current: <strong>{currentGroupCount}</strong> groups
          </span>
          <span className="stat-arrow">&rarr;</span>
          <span className="stat-result">
            Result: <strong>
              {activeTool === 'merge-colors' ? mergeResult.resultCount : reduceResult.resultCount}
            </strong> groups
          </span>
        </div>

        {resultColors.length > 0 && (
          <div className="tools-overlay-swatches">
            <label className="tool-control-label">Resulting Colors</label>
            <div className="swatch-grid">
              {resultColors.map((color, index) => (
                <div
                  key={index}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="tools-overlay-actions">
        <button className="tool-button tool-button-cancel" onClick={handleClose}>
          Cancel
        </button>
        <button className="tool-button tool-button-accept" onClick={handleAccept}>
          Accept
        </button>
      </div>
    </div>
  )
}
