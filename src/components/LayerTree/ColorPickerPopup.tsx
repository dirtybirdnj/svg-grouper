import { useState, useRef, useEffect } from 'react'
import { normalizeColor } from '../../utils/colorExtractor'
import { ColorPickerPopupProps } from './types'

export function ColorPickerPopup({
  color,
  position,
  onColorChange,
  onClose,
  initialMode = 'fill',
  initialStrokeWidth = '1'
}: ColorPickerPopupProps) {
  const [currentColor, setCurrentColor] = useState(normalizeColor(color))
  const [hexInput, setHexInput] = useState(normalizeColor(color))
  const [mode, setMode] = useState<'fill' | 'stroke'>(initialMode)
  const [strokeWidth, setStrokeWidth] = useState(initialStrokeWidth)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setCurrentColor(newColor)
    setHexInput(newColor)
  }

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setHexInput(value)
    // Only update color if it's a valid hex
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setCurrentColor(value)
    }
  }

  const handleApply = () => {
    onColorChange(currentColor, mode, mode === 'stroke' ? strokeWidth : undefined)
    onClose()
  }

  return (
    <div
      ref={popupRef}
      className="color-picker-popup"
      style={{ left: position.x, top: position.y }}
    >
      <div className="color-picker-header">
        <span>Edit Layer</span>
        <button className="color-picker-close" onClick={onClose}>×</button>
      </div>
      <div className="color-picker-content">
        {/* Fill/Stroke toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-toggle-btn ${mode === 'fill' ? 'active' : ''}`}
            onClick={() => setMode('fill')}
          >
            Fill
          </button>
          <button
            className={`mode-toggle-btn ${mode === 'stroke' ? 'active' : ''}`}
            onClick={() => setMode('stroke')}
          >
            Stroke
          </button>
        </div>

        <input
          type="color"
          value={currentColor}
          onChange={handleColorPickerChange}
          className="color-picker-input"
        />
        <div className="color-picker-hex-row">
          <input
            type="text"
            value={hexInput}
            onChange={handleHexInputChange}
            className="color-picker-hex-input"
            placeholder="#000000"
          />
        </div>

        {/* Stroke width controls - only show when stroke mode */}
        {mode === 'stroke' && (
          <div className="stroke-width-controls">
            <label className="stroke-width-label">Stroke Width</label>
            <div className="stroke-width-row">
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(e.target.value)}
                className="stroke-width-slider"
              />
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(e.target.value)}
                className="stroke-width-input"
              />
            </div>
          </div>
        )}

        <div className="color-picker-preview">
          <span
            className="color-preview-swatch"
            style={{
              backgroundColor: mode === 'fill' ? currentColor : 'transparent',
              border: mode === 'stroke' ? `${Math.min(parseFloat(strokeWidth), 4)}px solid ${currentColor}` : 'none'
            }}
          />
          <span className="color-preview-label">
            {currentColor} {mode === 'stroke' && `(${strokeWidth}px)`}
          </span>
        </div>
        <button className="color-picker-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  )
}
