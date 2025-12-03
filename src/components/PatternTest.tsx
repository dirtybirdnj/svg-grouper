// Pattern Test Harness - tests all fill patterns with simple shapes and stress test
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
  generateGlobalHatchLines,
  clipLinesToPolygon,
  parsePathIntoSubpaths,
  getBoundingBox,
} from '../utils/geometry'
import {
  FillPatternType,
  generateConcentricLines,
  generateHoneycombLines,
  generateWiggleLines,
  generateSpiralLines,
  generateGyroidLines,
  generateCrosshatchLines,
  generateZigzagLines,
  generateRadialLines,
  generateCrossSpiralLines,
  generateHilbertLines,
  generateFermatLines,
  generateWaveLines,
  generateScribbleLines,
} from '../utils/fillPatterns'
import './PatternTest.css'

// All pattern types to test
const ALL_PATTERNS: FillPatternType[] = [
  'lines',
  'concentric',
  'wiggle',
  'spiral',
  'honeycomb',
  'gyroid',
  'crosshatch',
  'zigzag',
  'radial',
  'crossspiral',
  'hilbert',
  'fermat',
  'wave',
  'scribble',
]

// Simple square polygon for grid test
const SQUARE_SIZE = 80
const createSquarePolygon = (x: number, y: number, size: number): PolygonWithHoles => ({
  outer: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
  holes: [],
})

interface PatternResult {
  pattern: FillPatternType
  lines: HatchLine[]
  timeMs: number
  error?: string
}

interface StressTestPath {
  id: string
  polygon: PolygonWithHoles
  bbox: Rect
  color: string
}

interface PatternTestProps {
  onBack: () => void
}

export default function PatternTest({ onBack }: PatternTestProps) {
  const [results, setResults] = useState<PatternResult[]>([])
  const [stressTestPattern, setStressTestPattern] = useState<FillPatternType>('lines')
  const [stressTestResult, setStressTestResult] = useState<{ lines: HatchLine[]; timeMs: number; error?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Stress test state
  const [stressPaths, setStressPaths] = useState<StressTestPath[]>([])
  const [stressViewBox, setStressViewBox] = useState<string>('0 0 210 297')
  const [stressSvgOutlines, setStressSvgOutlines] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)

  // Test settings - matching FillTab defaults
  const [lineSpacing, setLineSpacing] = useState(5)
  const [angle, setAngle] = useState(45)
  const [inset, setInset] = useState(0)
  const [crossHatch, setCrossHatch] = useState(false)
  const [wiggleAmplitude, setWiggleAmplitude] = useState(3)
  const [wiggleFrequency, setWiggleFrequency] = useState(0.5)
  const [spiralOverDiameter, setSpiralOverDiameter] = useState(1.5)

  // Zoom and pan state for stress test
  const [stressScale, setStressScale] = useState(1)
  const [stressOffset, setStressOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const stressContainerRef = useRef<HTMLDivElement>(null)

  // Settings interface for pattern generation
  interface PatternSettings {
    lineSpacing: number
    angle: number
    inset: number
    crossHatch: boolean
    wiggleAmplitude: number
    wiggleFrequency: number
    spiralOverDiameter: number
  }

  // Generate fills for a single pattern
  const generatePatternFill = useCallback((
    pattern: FillPatternType,
    polygon: PolygonWithHoles,
    bbox: Rect,
    settings: PatternSettings
  ): { lines: HatchLine[]; timeMs: number; error?: string } => {
    const startTime = performance.now()
    let lines: HatchLine[] = []
    let error: string | undefined

    try {
      switch (pattern) {
        case 'lines': {
          const globalLines = generateGlobalHatchLines(bbox, settings.lineSpacing, settings.angle)
          lines = clipLinesToPolygon(globalLines, polygon, settings.inset)
          // Add crosshatch if enabled
          if (settings.crossHatch) {
            const crossLines = generateGlobalHatchLines(bbox, settings.lineSpacing, settings.angle + 90)
            lines = lines.concat(clipLinesToPolygon(crossLines, polygon, settings.inset))
          }
          break
        }
        case 'concentric':
          lines = generateConcentricLines(polygon.outer, settings.lineSpacing, false)
          break
        case 'wiggle':
          lines = generateWiggleLines(polygon, bbox, settings.lineSpacing, settings.angle, settings.wiggleAmplitude, settings.wiggleFrequency, settings.inset)
          break
        case 'spiral':
          lines = generateSpiralLines(polygon, settings.lineSpacing, settings.inset, settings.angle, settings.spiralOverDiameter)
          break
        case 'honeycomb':
          lines = generateHoneycombLines(polygon, settings.lineSpacing, settings.inset, settings.angle)
          break
        case 'gyroid':
          lines = generateGyroidLines(polygon, settings.lineSpacing, settings.inset, settings.angle)
          break
        case 'crosshatch':
          lines = generateCrosshatchLines(polygon, bbox, settings.lineSpacing, settings.angle, settings.inset)
          break
        case 'zigzag':
          lines = generateZigzagLines(polygon, bbox, settings.lineSpacing, settings.angle, settings.wiggleAmplitude, settings.inset)
          break
        case 'radial':
          lines = generateRadialLines(polygon, settings.lineSpacing, settings.inset, settings.angle)
          break
        case 'crossspiral':
          lines = generateCrossSpiralLines(polygon, settings.lineSpacing, settings.inset, settings.angle, settings.spiralOverDiameter)
          break
        case 'hilbert':
          lines = generateHilbertLines(polygon, settings.lineSpacing, settings.inset)
          break
        case 'fermat':
          lines = generateFermatLines(polygon, settings.lineSpacing, settings.inset, settings.angle, settings.spiralOverDiameter)
          break
        case 'wave':
          lines = generateWaveLines(polygon, bbox, settings.lineSpacing, settings.angle, settings.wiggleAmplitude, settings.wiggleFrequency, settings.inset)
          break
        case 'scribble':
          lines = generateScribbleLines(polygon, settings.lineSpacing, settings.inset)
          break
        default:
          error = `Unknown pattern: ${pattern}`
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      console.error(`[PatternTest] Error generating ${pattern}:`, e)
    }

    const timeMs = performance.now() - startTime
    return { lines, timeMs, error }
  }, [])

  // Build full settings object
  const patternSettings: PatternSettings = {
    lineSpacing,
    angle,
    inset,
    crossHatch,
    wiggleAmplitude,
    wiggleFrequency,
    spiralOverDiameter,
  }

  // Run all pattern tests on mount
  useEffect(() => {
    setIsLoading(true)
    const testResults: PatternResult[] = []

    // Create test polygon (simple square)
    const polygon = createSquarePolygon(10, 10, SQUARE_SIZE)
    const bbox: Rect = { x: 10, y: 10, width: SQUARE_SIZE, height: SQUARE_SIZE }

    for (const pattern of ALL_PATTERNS) {
      const { lines, timeMs, error } = generatePatternFill(pattern, polygon, bbox, patternSettings)
      testResults.push({
        pattern,
        lines,
        timeMs,
        error,
      })
    }

    setResults(testResults)
    setIsLoading(false)
  }, [lineSpacing, angle, inset, crossHatch, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, generatePatternFill])

  // Convert lines to SVG path
  const linesToPath = (lines: HatchLine[]): string => {
    if (lines.length === 0) return ''
    return lines.map(l => `M${l.x1},${l.y1}L${l.x2},${l.y2}`).join(' ')
  }

  // Load Essex SVG - parse ALL paths from the document
  useEffect(() => {
    const loadEssex = async () => {
      try {
        const response = await fetch('/essex-vt-stress-test.svg')
        if (response.ok) {
          const svgText = await response.text()

          // Parse the SVG
          const parser = new DOMParser()
          const doc = parser.parseFromString(svgText, 'image/svg+xml')

          // Get viewBox from the SVG
          const svgEl = doc.querySelector('svg')
          if (svgEl) {
            const viewBox = svgEl.getAttribute('viewBox')
            if (viewBox) {
              setStressViewBox(viewBox)
            }
          }

          // Parse all paths
          const pathElements = doc.querySelectorAll('path')
          const paths: StressTestPath[] = []
          const outlines: string[] = []

          pathElements.forEach((pathEl, index) => {
            const d = pathEl.getAttribute('d') || ''
            const fill = pathEl.getAttribute('fill') || '#000000'
            const id = pathEl.getAttribute('id') || `path-${index}`

            // Store original path for outline rendering
            outlines.push(d)

            // Parse into subpaths
            const subpaths = parsePathIntoSubpaths(d)

            // Process each subpath as a separate polygon
            for (let i = 0; i < subpaths.length; i++) {
              const subpath = subpaths[i]
              if (subpath.length < 3) continue

              paths.push({
                id: `${id}-subpath-${i}`,
                polygon: { outer: subpath, holes: [] },
                bbox: getBoundingBox(subpath),
                color: fill,
              })
            }
          })

          setStressPaths(paths)
          setStressSvgOutlines(outlines)
        }
      } catch (e) {
        console.error('[PatternTest] Failed to load Essex SVG:', e)
        // Fall back to a complex polygon
        const complexPolygon = createComplexTestPolygon()
        setStressPaths([{
          id: 'fallback',
          polygon: complexPolygon.polygon,
          bbox: complexPolygon.bbox,
          color: '#a8d483',
        }])
        setStressViewBox(`${complexPolygon.bbox.x - 10} ${complexPolygon.bbox.y - 10} ${complexPolygon.bbox.width + 20} ${complexPolygon.bbox.height + 20}`)
      }
    }
    loadEssex()
  }, [])

  // Run stress test when pattern changes or paths load
  useEffect(() => {
    if (stressPaths.length === 0) return

    setIsGenerating(true)
    setGenerateProgress(0)
    setStressTestResult(null)

    // Use setTimeout to allow UI to update before heavy computation
    const timeoutId = setTimeout(() => {
      const startTime = performance.now()
      let allLines: HatchLine[] = []
      let hasError = false
      let errorMsg = ''
      const totalPaths = stressPaths.length

      for (let i = 0; i < totalPaths; i++) {
        const path = stressPaths[i]
        const result = generatePatternFill(stressTestPattern, path.polygon, path.bbox, patternSettings)
        if (result.error) {
          hasError = true
          errorMsg = result.error
        }
        allLines = allLines.concat(result.lines)

        // Update progress periodically (every 10 paths or so)
        if (i % 10 === 0 || i === totalPaths - 1) {
          setGenerateProgress(Math.round(((i + 1) / totalPaths) * 100))
        }
      }

      const totalTime = performance.now() - startTime
      setStressTestResult({
        lines: allLines,
        timeMs: totalTime,
        error: hasError ? errorMsg : undefined,
      })
      setIsGenerating(false)
      setGenerateProgress(100)
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [stressTestPattern, stressPaths, lineSpacing, angle, inset, crossHatch, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, generatePatternFill])

  // Zoom handlers for stress test
  const handleStressWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setStressScale(prev => Math.min(20, Math.max(0.1, prev * delta)))
  }, [])

  const handleStressMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - stressOffset.x, y: e.clientY - stressOffset.y })
    }
  }, [stressOffset])

  const handleStressMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setStressOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleStressMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleStressDoubleClick = useCallback((e: React.MouseEvent) => {
    // Zoom in on double-click, centered on clicked point
    const container = stressContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const newScale = Math.min(20, stressScale * 1.5)
    const scaleFactor = newScale / stressScale

    // Adjust offset to zoom toward click point
    setStressOffset(prev => ({
      x: clickX - (clickX - prev.x) * scaleFactor,
      y: clickY - (clickY - prev.y) * scaleFactor,
    }))
    setStressScale(newScale)
  }, [stressScale])

  const handleStressReset = useCallback(() => {
    setStressScale(1)
    setStressOffset({ x: 0, y: 0 })
  }, [])

  return (
    <div className="pattern-test">
      <div className="pattern-test-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <h2>Pattern Test Harness</h2>
      </div>

      {isLoading ? (
        <div className="loading">Running pattern tests...</div>
      ) : (
        <>
          {/* Grid of all patterns */}
          <div className="pattern-grid-section">
            <h3>All Patterns (Simple Square)</h3>
            <div className="pattern-grid">
              {results.map((result) => (
                <div
                  key={result.pattern}
                  className={`pattern-cell ${result.error ? 'error' : ''} ${result.lines.length === 0 && !result.error ? 'empty' : ''}`}
                >
                  <div className="pattern-name">{result.pattern}</div>
                  <svg
                    viewBox={`0 0 ${SQUARE_SIZE + 20} ${SQUARE_SIZE + 20}`}
                    className="pattern-preview"
                  >
                    {/* Draw the square outline */}
                    <rect
                      x={10}
                      y={10}
                      width={SQUARE_SIZE}
                      height={SQUARE_SIZE}
                      fill="none"
                      stroke="#ccc"
                      strokeWidth={1}
                    />
                    {/* Draw the fill lines */}
                    <path
                      d={linesToPath(result.lines)}
                      fill="none"
                      stroke={result.error ? '#e74c3c' : (result.lines.length === 0 ? '#f39c12' : '#3498db')}
                      strokeWidth={0.5}
                    />
                  </svg>
                  <div className="pattern-stats">
                    {result.error ? (
                      <span className="error-text" title={result.error}>ERROR</span>
                    ) : (
                      <>
                        <span className={result.lines.length === 0 ? 'warning-text' : ''}>
                          {result.lines.length} lines
                        </span>
                        <span>{result.timeMs.toFixed(1)}ms</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stress test section */}
          <div className="stress-test-section">
            <div className="stress-test-title-row">
              <h3>Stress Test (Essex VT - {stressPaths.length} polygons)</h3>
              <div className="stress-zoom-controls">
                <button onClick={() => setStressScale(s => Math.min(20, s * 1.2))} title="Zoom In">+</button>
                <button onClick={() => setStressScale(s => Math.max(0.1, s / 1.2))} title="Zoom Out">−</button>
                <button onClick={handleStressReset} title="Reset View">Fit</button>
                <span className="zoom-level">{Math.round(stressScale * 100)}%</span>
              </div>
            </div>

            {/* Pattern buttons and settings row */}
            <div className="pattern-controls-row">
              <div className="pattern-buttons">
                {ALL_PATTERNS.map((p) => (
                  <button
                    key={p}
                    className={`pattern-btn ${stressTestPattern === p ? 'active' : ''}`}
                    onClick={() => setStressTestPattern(p)}
                    disabled={isGenerating}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Settings panel - 4x4 grid */}
              <div className="pattern-settings-panel">
                <h4>{stressTestPattern} Settings</h4>
                <div className="settings-grid">
                  {/* Line Spacing - always shown */}
                  <label className="setting-row">
                    <span>Spacing</span>
                    <input
                      type="number"
                      value={lineSpacing}
                      onChange={(e) => setLineSpacing(Number(e.target.value))}
                      min={1}
                      max={50}
                    />
                    <span className="unit">px</span>
                  </label>

                  {/* Angle - for most patterns */}
                  {['lines', 'wiggle', 'wave', 'zigzag', 'crosshatch', 'honeycomb', 'gyroid', 'spiral', 'crossspiral', 'fermat', 'radial'].includes(stressTestPattern) && (
                    <label className="setting-row">
                      <span>Angle</span>
                      <input
                        type="number"
                        value={angle}
                        onChange={(e) => setAngle(Number(e.target.value))}
                        min={0}
                        max={360}
                      />
                      <span className="unit">°</span>
                    </label>
                  )}

                  {/* Inset - always shown */}
                  <label className="setting-row">
                    <span>Inset</span>
                    <input
                      type="number"
                      value={inset}
                      onChange={(e) => setInset(Number(e.target.value))}
                      min={0}
                      max={20}
                      step={0.5}
                    />
                    <span className="unit">px</span>
                  </label>

                  {/* Cross-hatch toggle - only for lines */}
                  {stressTestPattern === 'lines' && (
                    <label className="setting-row checkbox">
                      <input
                        type="checkbox"
                        checked={crossHatch}
                        onChange={(e) => setCrossHatch(e.target.checked)}
                      />
                      <span>Cross-hatch</span>
                    </label>
                  )}

                  {/* Wiggle settings */}
                  {['wiggle', 'wave', 'zigzag'].includes(stressTestPattern) && (
                    <>
                      <label className="setting-row">
                        <span>Amplitude</span>
                        <input
                          type="number"
                          value={wiggleAmplitude}
                          onChange={(e) => setWiggleAmplitude(Number(e.target.value))}
                          min={0.5}
                          max={20}
                          step={0.5}
                        />
                        <span className="unit">px</span>
                      </label>
                      {['wiggle', 'wave'].includes(stressTestPattern) && (
                        <label className="setting-row">
                          <span>Frequency</span>
                          <input
                            type="number"
                            value={wiggleFrequency}
                            onChange={(e) => setWiggleFrequency(Number(e.target.value))}
                            min={0.1}
                            max={2}
                            step={0.1}
                          />
                        </label>
                      )}
                    </>
                  )}

                  {/* Spiral over-diameter */}
                  {['spiral', 'crossspiral', 'fermat'].includes(stressTestPattern) && (
                    <label className="setting-row">
                      <span>Over-draw</span>
                      <input
                        type="number"
                        value={spiralOverDiameter}
                        onChange={(e) => setSpiralOverDiameter(Number(e.target.value))}
                        min={1}
                        max={3}
                        step={0.1}
                      />
                      <span className="unit">×</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="stress-progress-container">
              {isGenerating ? (
                <div className="stress-progress">
                  <div className="stress-progress-bar" style={{ width: `${generateProgress}%` }} />
                  <span className="stress-progress-text">Generating {stressTestPattern}... {generateProgress}%</span>
                </div>
              ) : (
                <div className="stress-progress done">
                  <div className="stress-progress-bar" style={{ width: '100%' }} />
                </div>
              )}
            </div>

            {stressPaths.length > 0 && (
              <div className="stress-test-result">
                <div className="stress-test-stats">
                  <div>Polygons: {stressPaths.length}</div>
                  <div>Total vertices: {stressPaths.reduce((sum, p) => sum + p.polygon.outer.length, 0).toLocaleString()}</div>
                  {stressTestResult && (
                    <>
                      <div>Generated lines: {stressTestResult.lines.length.toLocaleString()}</div>
                      <div>Time: {stressTestResult.timeMs.toFixed(1)}ms</div>
                      {stressTestResult.error && (
                        <div className="error-text">Error: {stressTestResult.error}</div>
                      )}
                    </>
                  )}
                </div>
                <div
                  ref={stressContainerRef}
                  className="stress-test-viewport"
                  onWheel={handleStressWheel}
                  onMouseDown={handleStressMouseDown}
                  onMouseMove={handleStressMouseMove}
                  onMouseUp={handleStressMouseUp}
                  onMouseLeave={handleStressMouseUp}
                  onDoubleClick={handleStressDoubleClick}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  <div
                    className="stress-svg-container"
                    style={{
                      transform: `translate(${stressOffset.x}px, ${stressOffset.y}px) scale(${stressScale})`,
                    }}
                  >
                    <svg
                      viewBox={stressViewBox}
                      className="stress-test-preview"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Draw all original path outlines */}
                      {stressSvgOutlines.map((d, i) => (
                        <path
                          key={`outline-${i}`}
                          d={d}
                          fill="none"
                          stroke="#ccc"
                          strokeWidth={0.3}
                        />
                      ))}
                      {/* Draw the fill lines */}
                      {stressTestResult && (
                        <path
                          d={linesToPath(stressTestResult.lines)}
                          fill="none"
                          stroke={stressTestResult.error ? '#e74c3c' : (stressTestResult.lines.length === 0 ? '#f39c12' : '#3498db')}
                          strokeWidth={0.15}
                        />
                      )}
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Fallback complex polygon if Essex doesn't load
function createComplexTestPolygon(): { polygon: PolygonWithHoles; bbox: Rect } {
  // Create a star-like shape with many vertices
  const centerX = 150
  const centerY = 150
  const outerRadius = 120
  const innerRadius = 50
  const points = 12

  const outer: Point[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    outer.push({
      x: centerX + Math.cos(a) * radius,
      y: centerY + Math.sin(a) * radius,
    })
  }

  return {
    polygon: { outer, holes: [] },
    bbox: { x: centerX - outerRadius, y: centerY - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
  }
}
