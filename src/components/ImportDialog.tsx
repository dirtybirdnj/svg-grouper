import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  analyzeSVGDimensions,
  PAPER_SIZES,
  DPI_OPTIONS,
  paperSizeToPixels
} from '../utils/svgDimensions'
import { useAppContext } from '../context/AppContext'
import { normalizeColor } from '../utils/colorExtractor'
import './ImportDialog.css'

interface DetectedColor {
  color: string
  count: number
}

// Extract colors from SVG content
function extractColorsFromSVG(svgContent: string): DetectedColor[] {
  const colorCounts = new Map<string, number>()

  // Parse color from various formats
  const addColor = (color: string | null) => {
    if (!color || color === 'none' || color === 'transparent' || color === 'inherit') return

    // Normalize color to consistent format
    const normalized = normalizeColor(color)
    if (normalized) {
      colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1)
    }
  }

  // Extract fill attributes
  const fillMatches = svgContent.matchAll(/fill\s*[=:]\s*["']?([^"';\s>]+)/gi)
  for (const match of fillMatches) {
    addColor(match[1])
  }

  // Extract stroke attributes
  const strokeMatches = svgContent.matchAll(/stroke\s*[=:]\s*["']?([^"';\s>]+)/gi)
  for (const match of strokeMatches) {
    addColor(match[1])
  }

  // Sort by count (most used first)
  return Array.from(colorCounts.entries())
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count)
}

interface ImportDialogProps {
  svgContent: string
  fileName: string
  onConfirm: (processedContent: string, dimensions: { width: number; height: number }) => void
  onCancel: () => void
}

export default function ImportDialog({ svgContent, fileName, onConfirm, onCancel }: ImportDialogProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const { flattenOnImport, setFlattenOnImport } = useAppContext()

  // Analyze SVG dimensions
  const dimensionInfo = useMemo(() => {
    try {
      return analyzeSVGDimensions(svgContent)
    } catch (e) {
      console.error('Failed to analyze SVG:', e)
      return null
    }
  }, [svgContent])

  // Extract colors from SVG
  const detectedColors = useMemo(() => {
    return extractColorsFromSVG(svgContent)
  }, [svgContent])

  // Import settings state
  const [paperSize, setPaperSize] = useState<string>('custom')
  const [dpi, setDpi] = useState<number>(96)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [customWidth, setCustomWidth] = useState<number>(8.5)
  const [customHeight, setCustomHeight] = useState<number>(11)
  const [useOriginalDimensions, setUseOriginalDimensions] = useState<boolean>(true)
  const [normalizeCoordinates, setNormalizeCoordinates] = useState<boolean>(true)

  // Auto-detect orientation from SVG aspect ratio
  useEffect(() => {
    if (dimensionInfo) {
      const aspect = dimensionInfo.computedWidth / dimensionInfo.computedHeight
      setOrientation(aspect >= 1 ? 'landscape' : 'portrait')
    }
  }, [dimensionInfo])

  // Calculate target dimensions
  const targetDimensions = useMemo(() => {
    if (useOriginalDimensions && dimensionInfo) {
      return {
        width: dimensionInfo.computedWidth,
        height: dimensionInfo.computedHeight
      }
    }

    return paperSizeToPixels(
      paperSize,
      dpi,
      orientation,
      customWidth,
      customHeight
    )
  }, [useOriginalDimensions, dimensionInfo, paperSize, dpi, orientation, customWidth, customHeight])

  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)

  // Handle confirm - uses backend for normalization
  const handleConfirm = async () => {
    let processedContent = svgContent

    if (normalizeCoordinates && window.electron?.normalizeSVG) {
      setIsProcessing(true)
      setProcessingError(null)
      try {
        processedContent = await window.electron.normalizeSVG({ svg: svgContent })
      } catch (err) {
        console.error('[ImportDialog] Normalization failed:', err)
        setProcessingError(err instanceof Error ? err.message : 'Normalization failed')
        setIsProcessing(false)
        return
      }
      setIsProcessing(false)
    }

    onConfirm(processedContent, targetDimensions)
  }

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing) return // Don't allow keyboard actions while processing
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        handleConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, handleConfirm, isProcessing])

  if (!dimensionInfo) {
    return createPortal(
      <div className="import-dialog-overlay">
        <div className="import-dialog">
          <div className="import-dialog-header">
            <h2>Import Error</h2>
          </div>
          <div className="import-dialog-content">
            <p>Failed to analyze SVG file. The file may be corrupted or invalid.</p>
          </div>
          <div className="import-dialog-actions">
            <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  const hasErrors = dimensionInfo.issues.some(i => i.type === 'error')
  const hasWarnings = dimensionInfo.issues.some(i => i.type === 'warning')

  return createPortal(
    <div className="import-dialog-overlay">
      <div className="import-dialog">
        <div className="import-dialog-header">
          <h2>Import SVG</h2>
          <span className="import-filename">{fileName}</span>
        </div>

        <div className="import-dialog-body">
          {/* Preview Section */}
          <div className="import-preview-section">
            <h3>Preview</h3>
            <div className="import-preview" ref={previewRef}>
              <div
                className="import-preview-svg"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>

            {/* Color Palette */}
            {detectedColors.length > 0 && (
              <div className="import-colors">
                <h4>Detected Colors ({detectedColors.length})</h4>
                <div className="import-color-palette">
                  {detectedColors.map((colorData, index) => {
                    // Determine text color for contrast
                    let textColor = '#333'
                    try {
                      // Simple luminance check
                      const hex = colorData.color.replace('#', '')
                      if (hex.length === 6) {
                        const r = parseInt(hex.substr(0, 2), 16)
                        const g = parseInt(hex.substr(2, 2), 16)
                        const b = parseInt(hex.substr(4, 2), 16)
                        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
                        textColor = luminance > 0.5 ? '#000' : '#fff'
                      }
                    } catch {
                      // Keep default
                    }

                    return (
                      <div
                        key={index}
                        className="import-color-swatch"
                        title={`${colorData.color} (${colorData.count} uses)`}
                        style={{
                          backgroundColor: colorData.color,
                          color: textColor,
                          border: `1px solid ${textColor === '#000' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)'}`
                        }}
                      >
                        <span className="color-count">{colorData.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Dimension Info Section */}
          <div className="import-info-section">
            <h3>Detected Dimensions</h3>

            <div className="dimension-grid">
              <div className="dimension-item">
                <label>Width</label>
                <span className="dimension-value">
                  {dimensionInfo.width !== null
                    ? `${dimensionInfo.width}${dimensionInfo.widthUnit || 'px'}`
                    : 'Not specified'}
                  {dimensionInfo.widthUnit && dimensionInfo.widthUnit !== 'px' && dimensionInfo.widthUnit !== '' && (
                    <span className="dimension-converted">
                      ({dimensionInfo.computedWidth.toFixed(1)}px)
                    </span>
                  )}
                </span>
              </div>

              <div className="dimension-item">
                <label>Height</label>
                <span className="dimension-value">
                  {dimensionInfo.height !== null
                    ? `${dimensionInfo.height}${dimensionInfo.heightUnit || 'px'}`
                    : 'Not specified'}
                  {dimensionInfo.heightUnit && dimensionInfo.heightUnit !== 'px' && dimensionInfo.heightUnit !== '' && (
                    <span className="dimension-converted">
                      ({dimensionInfo.computedHeight.toFixed(1)}px)
                    </span>
                  )}
                </span>
              </div>

              <div className="dimension-item">
                <label>ViewBox</label>
                <span className="dimension-value">
                  {dimensionInfo.viewBox
                    ? `${dimensionInfo.viewBox.minX.toFixed(1)}, ${dimensionInfo.viewBox.minY.toFixed(1)}, ${dimensionInfo.viewBox.width.toFixed(1)}, ${dimensionInfo.viewBox.height.toFixed(1)}`
                    : 'Not specified'}
                </span>
              </div>

              <div className="dimension-item">
                <label>Computed Size</label>
                <span className="dimension-value computed">
                  {dimensionInfo.computedWidth.toFixed(1)} × {dimensionInfo.computedHeight.toFixed(1)} px
                </span>
              </div>
            </div>

            {/* Issues */}
            {dimensionInfo.issues.length > 0 && (
              <div className="import-issues">
                <h4>
                  {hasErrors ? 'Issues Detected' : hasWarnings ? 'Warnings' : 'Info'}
                </h4>
                <ul className="issues-list">
                  {dimensionInfo.issues.map((issue, idx) => (
                    <li key={idx} className={`issue-item issue-${issue.type}`}>
                      <span className="issue-icon">
                        {issue.type === 'error' ? '!' : issue.type === 'warning' ? '!' : 'i'}
                      </span>
                      <div className="issue-content">
                        <span className="issue-message">{issue.message}</span>
                        {issue.details && (
                          <span className="issue-details">{issue.details}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Output Settings */}
            <div className="import-settings">
              <h3>Output Settings</h3>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useOriginalDimensions}
                  onChange={(e) => setUseOriginalDimensions(e.target.checked)}
                />
                <span>Use original dimensions</span>
              </label>

              {!useOriginalDimensions && (
                <div className="paper-settings">
                  <div className="setting-row">
                    <label>Paper Size</label>
                    <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
                      {Object.entries(PAPER_SIZES).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                      ))}
                    </select>
                  </div>

                  {paperSize === 'custom' && (
                    <div className="setting-row custom-size">
                      <label>Custom Size (inches)</label>
                      <div className="custom-inputs">
                        <input
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(parseFloat(e.target.value) || 0)}
                          step="0.1"
                          min="0.1"
                        />
                        <span>×</span>
                        <input
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(parseFloat(e.target.value) || 0)}
                          step="0.1"
                          min="0.1"
                        />
                      </div>
                    </div>
                  )}

                  <div className="setting-row">
                    <label>DPI</label>
                    <select value={dpi} onChange={(e) => setDpi(parseInt(e.target.value))}>
                      {DPI_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="setting-row">
                    <label>Orientation</label>
                    <div className="orientation-buttons">
                      <button
                        className={orientation === 'portrait' ? 'active' : ''}
                        onClick={() => setOrientation('portrait')}
                      >
                        Portrait
                      </button>
                      <button
                        className={orientation === 'landscape' ? 'active' : ''}
                        onClick={() => setOrientation('landscape')}
                      >
                        Landscape
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(dimensionInfo.needsTranslation || dimensionInfo.hasNegativeCoordinates) && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={normalizeCoordinates}
                    onChange={(e) => setNormalizeCoordinates(e.target.checked)}
                  />
                  <span>Normalize coordinates to (0, 0) origin</span>
                </label>
              )}

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={flattenOnImport}
                  onChange={(e) => setFlattenOnImport(e.target.checked)}
                />
                <span>Flatten on import (ungroup and group by color)</span>
              </label>

              <div className="output-summary">
                <label>Output Size</label>
                <span className="output-size">
                  {targetDimensions.width.toFixed(0)} × {targetDimensions.height.toFixed(0)} px
                  {!useOriginalDimensions && (
                    <span className="output-inches">
                      ({(targetDimensions.width / dpi).toFixed(2)}" × {(targetDimensions.height / dpi).toFixed(2)}")
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {processingError && (
          <div className="import-error">
            Error: {processingError}
          </div>
        )}

        <div className="import-dialog-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
