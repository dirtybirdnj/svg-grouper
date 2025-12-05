// Pattern Test Harness - tests all fill patterns with simple shapes and stress test
// Uses the same rat-king IPC interface as the main app
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
  parsePathIntoSubpaths,
  getBoundingBox,
  getPolygonsFromSubpaths,
} from '../utils/geometry'
import { FillPatternType } from '../utils/fillPatterns'
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

// Performance thresholds (ms) for stress test
const PERF_THRESHOLDS = {
  excellent: 100,   // < 100ms = green
  acceptable: 500,  // < 500ms = yellow
  slow: 2000,       // < 2000ms = orange
  // > 2000ms = red (unacceptable)
}

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

// Slider+Text combo input component
interface SliderInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
}

function SliderInput({ label, value, onChange, min, max, step = 1, unit }: SliderInputProps) {
  return (
    <div className="slider-input">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="slider-range"
      />
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="slider-number"
      />
      {unit && <span className="slider-unit">{unit}</span>}
    </div>
  )
}

interface PatternResult {
  pattern: FillPatternType
  lines: HatchLine[]
  timeMs: number
  error?: string
}

interface TortureTestResult {
  pattern: FillPatternType
  lines: number
  timeMs: number
  error?: string
  status: 'excellent' | 'acceptable' | 'slow' | 'failed'
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
  const [stressTestResult, setStressTestResult] = useState<{
    lines: HatchLine[]
    timeMs: number
    error?: string
    polygonStats: {
      total: number
      filled: number
      empty: number
      tooSmall: number  // Polygons smaller than line spacing
    }
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showPatterns, setShowPatterns] = useState(true)
  const [showHatchLines, setShowHatchLines] = useState(true)
  const [shapeFillOpacity, setShapeFillOpacity] = useState(20) // Default 20% so hatch lines are visible

  // Stress test state
  const [stressPaths, setStressPaths] = useState<StressTestPath[]>([])
  const [stressViewBox, setStressViewBox] = useState<string>('0 0 210 297')
  const [stressSvgOutlines, setStressSvgOutlines] = useState<string[]>([])
  const [stressSvgTransform, setStressSvgTransform] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  // Cached background PNG - rendered once, used as background layer
  const [backgroundPngUrl, setBackgroundPngUrl] = useState<string | null>(null)
  const [backgroundPngSize, setBackgroundPngSize] = useState({ width: 0, height: 0 })

  // Torture test state (runs all patterns on stress geometry)
  const [tortureTestResults, setTortureTestResults] = useState<TortureTestResult[]>([])
  const [isTortureRunning, setIsTortureRunning] = useState(false)
  const [isTorturePaused, setIsTorturePaused] = useState(false)
  const [tortureProgress, setTortureProgress] = useState(0)
  const [currentTorturePattern, setCurrentTorturePattern] = useState<FillPatternType | null>(null)
  const tortureAbortRef = useRef(false)
  const torturePauseRef = useRef(false)
  const tortureReportRef = useRef<HTMLDivElement>(null)

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

  // 15 second timeout for pattern generation
  const PATTERN_TIMEOUT_MS = 15000

  // Generate fills using rat-king via IPC (same as main app)
  const generatePatternFillAsync = useCallback(async (
    pattern: FillPatternType,
    polygons: Array<{ id: string; polygon: PolygonWithHoles; bbox: Rect }>,
    globalBbox: Rect,
    settings: PatternSettings
  ): Promise<{ lines: HatchLine[]; timeMs: number; error?: string }> => {
    const startTime = performance.now()

    if (!window.electron?.generateFills) {
      return { lines: [], timeMs: 0, error: 'Electron IPC not available' }
    }

    try {
      // Race between the actual call and a timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('DNF - exceeded 15s timeout')), PATTERN_TIMEOUT_MS)
      })

      const result = await Promise.race([
        window.electron.generateFills({
        paths: polygons.map(p => ({
          id: p.id,
          color: '#000000',
          polygons: [p.polygon],
        })),
        boundingBox: globalBbox,
        fillPattern: pattern,
        lineSpacing: settings.lineSpacing,
        angle: settings.angle,
        crossHatch: settings.crossHatch,
        inset: settings.inset,
        wiggleAmplitude: settings.wiggleAmplitude,
        wiggleFrequency: settings.wiggleFrequency,
        spiralOverDiameter: settings.spiralOverDiameter,
        singleSpiral: false,
        singleHilbert: false,
        singleFermat: false,
        customTileShape: 'triangle',
        customTileGap: 0,
        customTileScale: 1,
        customTileRotateOffset: 0,
        enableCrop: false,
        cropInset: 0,
        useEvenOdd: true,
      }),
        timeoutPromise
      ])

      const timeMs = performance.now() - startTime

      if (result.success) {
        // Flatten all path results into single lines array
        const allLines: HatchLine[] = []
        for (const pathResult of result.paths) {
          allLines.push(...pathResult.lines)
        }
        return { lines: allLines, timeMs }
      } else {
        return { lines: [], timeMs, error: result.error || 'Unknown error' }
      }
    } catch (e) {
      const timeMs = performance.now() - startTime
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[PatternTest] Error generating ${pattern}:`, e)
      return { lines: [], timeMs, error }
    }
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
    const runTests = async () => {
      setIsLoading(true)
      const testResults: PatternResult[] = []

      // Create test polygon (simple square)
      const polygon = createSquarePolygon(10, 10, SQUARE_SIZE)
      const bbox: Rect = { x: 10, y: 10, width: SQUARE_SIZE, height: SQUARE_SIZE }

      for (const pattern of ALL_PATTERNS) {
        const { lines, timeMs, error } = await generatePatternFillAsync(
          pattern,
          [{ id: 'test', polygon, bbox }],
          bbox,
          patternSettings
        )
        testResults.push({
          pattern,
          lines,
          timeMs,
          error,
        })
      }

      setResults(testResults)
      setIsLoading(false)
    }

    runTests()
  }, [lineSpacing, angle, inset, crossHatch, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, generatePatternFillAsync])

  // Convert lines to SVG path
  const linesToPath = (lines: HatchLine[]): string => {
    if (lines.length === 0) return ''
    return lines.map(l => `M${l.x1},${l.y1}L${l.x2},${l.y2}`).join(' ')
  }

  // Get performance status based on time
  const getPerformanceStatus = (timeMs: number, hasError: boolean): TortureTestResult['status'] => {
    if (hasError) return 'failed'
    if (timeMs < PERF_THRESHOLDS.excellent) return 'excellent'
    if (timeMs < PERF_THRESHOLDS.acceptable) return 'acceptable'
    if (timeMs < PERF_THRESHOLDS.slow) return 'slow'
    return 'failed'
  }

  // Run torture test - all patterns on stress geometry
  const runTortureTest = useCallback(async () => {
    if (stressPaths.length === 0) return

    tortureAbortRef.current = false
    torturePauseRef.current = false
    setIsTortureRunning(true)
    setIsTorturePaused(false)
    setTortureTestResults([])
    setTortureProgress(0)
    setShowPatterns(false) // Hide grid during test

    const results: TortureTestResult[] = []

    for (let i = 0; i < ALL_PATTERNS.length; i++) {
      // Check for abort
      if (tortureAbortRef.current) {
        break
      }

      // Check for pause - wait until unpaused
      while (torturePauseRef.current && !tortureAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      if (tortureAbortRef.current) {
        break
      }

      const pattern = ALL_PATTERNS[i]
      setCurrentTorturePattern(pattern)
      setStressTestPattern(pattern)

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 50))

      let hasError = false
      let errorMsg = ''

      // Calculate global bounding box for all stress paths
      const globalBbox = stressPaths.reduce((acc, path) => ({
        x: Math.min(acc.x, path.bbox.x),
        y: Math.min(acc.y, path.bbox.y),
        width: Math.max(acc.x + acc.width, path.bbox.x + path.bbox.width) - Math.min(acc.x, path.bbox.x),
        height: Math.max(acc.y + acc.height, path.bbox.y + path.bbox.height) - Math.min(acc.y, path.bbox.y),
      }), stressPaths[0].bbox)

      // Use rat-king via IPC for the entire batch
      const result = await generatePatternFillAsync(
        pattern,
        stressPaths.map(p => ({ id: p.id, polygon: p.polygon, bbox: p.bbox })),
        globalBbox,
        patternSettings
      )

      if (result.error) {
        hasError = true
        errorMsg = result.error
      }

      const allLines = result.lines
      const totalTime = result.timeMs

      // Track polygon statistics (approximate since rat-king batches)
      const filledCount = result.lines.length > 0 ? stressPaths.length : 0
      const emptyCount = result.lines.length === 0 ? stressPaths.length : 0
      const tooSmallCount = 0

      results.push({
        pattern,
        lines: allLines.length,
        timeMs: totalTime,
        error: hasError ? errorMsg : undefined,
        status: getPerformanceStatus(totalTime, hasError),
      })

      setTortureTestResults([...results])
      setTortureProgress(Math.round(((i + 1) / ALL_PATTERNS.length) * 100))

      // Update the stress test result to show current pattern
      setStressTestResult({
        lines: allLines,
        timeMs: totalTime,
        error: hasError ? errorMsg : undefined,
        polygonStats: {
          total: stressPaths.length,
          filled: filledCount,
          empty: emptyCount,
          tooSmall: tooSmallCount,
        },
      })
    }

    setIsTortureRunning(false)
    setIsTorturePaused(false)
    setCurrentTorturePattern(null)

    // Scroll to report after a brief delay to let it render
    setTimeout(() => {
      tortureReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [stressPaths, patternSettings, generatePatternFillAsync])

  // Pause/resume torture test
  const toggleTorturePause = useCallback(() => {
    torturePauseRef.current = !torturePauseRef.current
    setIsTorturePaused(torturePauseRef.current)
  }, [])

  // Stop torture test
  const stopTortureTest = useCallback(() => {
    tortureAbortRef.current = true
    torturePauseRef.current = false
    setIsTorturePaused(false)
  }, [])

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

          // Get transform from parent group (paths are nested in transformed groups)
          const transformGroup = doc.querySelector('g[transform]')
          if (transformGroup) {
            const transform = transformGroup.getAttribute('transform') || ''
            console.log('[PatternTest] Found transform:', transform)
            setStressSvgTransform(transform)
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

            // Parse into subpaths and properly identify holes
            const subpaths = parsePathIntoSubpaths(d)
            const polygons = getPolygonsFromSubpaths(subpaths)

            // Process each polygon (with proper hole detection)
            for (let i = 0; i < polygons.length; i++) {
              const polygon = polygons[i]
              if (polygon.outer.length < 3) continue

              paths.push({
                id: `${id}-polygon-${i}`,
                polygon: polygon,
                bbox: getBoundingBox(polygon.outer),
                color: fill,
              })
            }
          })

          setStressPaths(paths)
          setStressSvgOutlines(outlines)

          // Auto-center and zoom to fit the geometry
          // We'll use a useEffect to do this after the container is measured
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

  // Auto-center and zoom geometry when it loads
  useEffect(() => {
    if (stressPaths.length === 0 || !stressContainerRef.current) return

    // Parse viewBox to get SVG dimensions
    const vbParts = stressViewBox.split(' ').map(Number)
    if (vbParts.length !== 4) return

    const [, , svgWidth, svgHeight] = vbParts
    const svgDisplayWidth = svgWidth * 4 // matches the inline style multiplier
    const svgDisplayHeight = svgHeight * 4

    // Get container dimensions
    const container = stressContainerRef.current
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

    setStressScale(targetScale)
    setStressOffset({ x: offsetX, y: offsetY })
  }, [stressPaths.length, stressViewBox])

  // Generate high-res background PNG when SVG data loads
  // This is rendered once and cached, used as background layer for performance
  useEffect(() => {
    if (stressSvgOutlines.length === 0 || !stressViewBox) return

    const generateBackgroundPng = async () => {
      const vbParts = stressViewBox.split(' ').map(Number)
      if (vbParts.length !== 4) return

      const [vbX, vbY, vbWidth, vbHeight] = vbParts

      // High-res: 4x the viewBox size (same as display)
      const scale = 4
      const width = Math.ceil(vbWidth * scale)
      const height = Math.ceil(vbHeight * scale)

      // Create offscreen canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // White background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      // Apply transform to match SVG coordinate system
      ctx.save()
      ctx.scale(scale, scale)
      ctx.translate(-vbX, -vbY)

      // Parse and apply the SVG transform if present
      if (stressSvgTransform) {
        // Parse transform like "translate(10, 32.867) scale(0.111) translate(0, 0)"
        const transforms = stressSvgTransform.match(/\w+\([^)]+\)/g) || []
        for (const t of transforms) {
          const match = t.match(/(\w+)\(([^)]+)\)/)
          if (match) {
            const [, fn, args] = match
            const nums = args.split(/[,\s]+/).map(Number)
            if (fn === 'translate' && nums.length >= 2) {
              ctx.translate(nums[0], nums[1])
            } else if (fn === 'scale') {
              if (nums.length >= 2) {
                ctx.scale(nums[0], nums[1])
              } else if (nums.length === 1) {
                ctx.scale(nums[0], nums[0])
              }
            }
          }
        }
      }

      // Draw all paths with solid fill (for ground truth) and stroke
      ctx.fillStyle = '#a8d483'
      ctx.strokeStyle = '#666666'
      ctx.lineWidth = 0.5

      for (const d of stressSvgOutlines) {
        const path = new Path2D(d)
        ctx.fill(path)
        ctx.stroke(path)
      }

      ctx.restore()

      // Convert to PNG data URL
      const dataUrl = canvas.toDataURL('image/png')
      setBackgroundPngUrl(dataUrl)
      setBackgroundPngSize({ width, height })
      console.log(`[PatternTest] Generated background PNG: ${width}x${height}`)
    }

    generateBackgroundPng()
  }, [stressSvgOutlines, stressViewBox, stressSvgTransform])

  // Run stress test when pattern changes or paths load
  useEffect(() => {
    if (stressPaths.length === 0) return

    const runStressTest = async () => {
      setIsGenerating(true)
      setStressTestResult(null)

      // Calculate global bounding box
      const globalBbox = stressPaths.reduce((acc, path) => ({
        x: Math.min(acc.x, path.bbox.x),
        y: Math.min(acc.y, path.bbox.y),
        width: Math.max(acc.x + acc.width, path.bbox.x + path.bbox.width) - Math.min(acc.x, path.bbox.x),
        height: Math.max(acc.y + acc.height, path.bbox.y + path.bbox.height) - Math.min(acc.y, path.bbox.y),
      }), stressPaths[0].bbox)

      // Use rat-king via IPC
      const result = await generatePatternFillAsync(
        stressTestPattern,
        stressPaths.map(p => ({ id: p.id, polygon: p.polygon, bbox: p.bbox })),
        globalBbox,
        patternSettings
      )

      const totalPaths = stressPaths.length
      const filledCount = result.lines.length > 0 ? totalPaths : 0
      const emptyCount = result.lines.length === 0 ? totalPaths : 0

      setStressTestResult({
        lines: result.lines,
        timeMs: result.timeMs,
        error: result.error,
        polygonStats: {
          total: totalPaths,
          filled: filledCount,
          empty: emptyCount,
          tooSmall: 0,
        },
      })
      setIsGenerating(false)
    }

    runStressTest()
  }, [stressTestPattern, stressPaths, lineSpacing, angle, inset, crossHatch, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, generatePatternFillAsync])

  // Zoom handler for stress test - attached via useEffect to use passive: false
  useEffect(() => {
    const container = stressContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setStressScale(prev => Math.min(20, Math.max(0.1, prev * delta)))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
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

  // Handle pattern selection from grid
  const handlePatternSelect = (pattern: FillPatternType) => {
    setStressTestPattern(pattern)
    setShowPatterns(false)
  }

  return (
    <div className="pattern-test">
      <div className="pattern-test-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <h2>Pattern Tests</h2>

        {/* Pattern selection buttons in header */}
        <div className="header-pattern-buttons">
          {ALL_PATTERNS.map((p) => {
            const isCurrentTorture = isTortureRunning && currentTorturePattern === p
            const isCompletedTorture = isTortureRunning && tortureTestResults.some(r => r.pattern === p)
            const tortureResult = tortureTestResults.find(r => r.pattern === p)

            return (
              <button
                key={p}
                className={`pattern-btn ${stressTestPattern === p && !isTortureRunning ? 'active' : ''} ${isCurrentTorture ? 'throbbing' : ''} ${isCompletedTorture ? `completed-${tortureResult?.status}` : ''}`}
                onClick={() => !isTortureRunning && setStressTestPattern(p)}
                disabled={isGenerating || isTortureRunning}
              >
                {isCurrentTorture ? `${p} ${tortureProgress}%` : p}
              </button>
            )
          })}
        </div>

        <div className="header-controls">
          <button
            className={`toggle-btn ${showPatterns ? 'active' : ''}`}
            onClick={() => setShowPatterns(!showPatterns)}
            title="Toggle pattern preview grid"
            disabled={isTortureRunning}
          >
            Grid
          </button>
          {!isTortureRunning ? (
            <button
              className="torture-btn"
              onClick={runTortureTest}
              disabled={stressPaths.length === 0}
              title="Run all patterns on stress geometry"
            >
              Run Torture Test
            </button>
          ) : (
            <>
              <button
                className={`torture-btn pause ${isTorturePaused ? 'paused' : ''}`}
                onClick={toggleTorturePause}
                title={isTorturePaused ? 'Resume test' : 'Pause test'}
              >
                {isTorturePaused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button
                className="torture-btn stop"
                onClick={stopTortureTest}
                title="Stop test"
              >
                ■ Stop
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Running pattern tests...</div>
      ) : (
        <>
          {/* Grid of all patterns - collapsible */}
          {showPatterns && (
            <div className="pattern-grid-section">
              <div className="pattern-grid">
                {results.map((result) => (
                  <div
                    key={result.pattern}
                    className={`pattern-cell ${result.error ? 'error' : ''} ${result.lines.length === 0 && !result.error ? 'empty' : ''} ${stressTestPattern === result.pattern ? 'selected' : ''}`}
                    onClick={() => handlePatternSelect(result.pattern)}
                  >
                    <div className="pattern-name">{result.pattern}</div>
                    <svg
                      viewBox={`0 0 ${SQUARE_SIZE + 20} ${SQUARE_SIZE + 20}`}
                      className="pattern-preview"
                    >
                      <rect
                        x={10}
                        y={10}
                        width={SQUARE_SIZE}
                        height={SQUARE_SIZE}
                        fill="none"
                        stroke="#ccc"
                        strokeWidth={1}
                      />
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
          )}

          {/* Settings bar - full width, context-sensitive with slider+text inputs */}
          <div className="pattern-settings-bar">
            <SliderInput
              label="Spacing"
              value={lineSpacing}
              onChange={setLineSpacing}
              min={1}
              max={20}
              step={0.5}
              unit="px"
            />

            {['lines', 'wiggle', 'wave', 'zigzag', 'crosshatch', 'honeycomb', 'gyroid', 'spiral', 'crossspiral', 'fermat', 'radial'].includes(stressTestPattern) && (
              <SliderInput
                label="Angle"
                value={angle}
                onChange={setAngle}
                min={0}
                max={180}
                step={5}
                unit="°"
              />
            )}

            <SliderInput
              label="Inset"
              value={inset}
              onChange={setInset}
              min={0}
              max={10}
              step={0.5}
              unit="px"
            />

            {stressTestPattern === 'lines' && (
              <label className="setting-item checkbox">
                <input
                  type="checkbox"
                  checked={crossHatch}
                  onChange={(e) => setCrossHatch(e.target.checked)}
                />
                <span>Cross-hatch</span>
              </label>
            )}

            {['wiggle', 'wave', 'zigzag'].includes(stressTestPattern) && (
              <>
                <SliderInput
                  label="Amplitude"
                  value={wiggleAmplitude}
                  onChange={setWiggleAmplitude}
                  min={0.5}
                  max={15}
                  step={0.5}
                  unit="px"
                />
                {['wiggle', 'wave'].includes(stressTestPattern) && (
                  <SliderInput
                    label="Frequency"
                    value={wiggleFrequency}
                    onChange={setWiggleFrequency}
                    min={0.1}
                    max={2}
                    step={0.1}
                  />
                )}
              </>
            )}

            {['spiral', 'crossspiral', 'fermat'].includes(stressTestPattern) && (
              <SliderInput
                label="Over-draw"
                value={spiralOverDiameter}
                onChange={setSpiralOverDiameter}
                min={1}
                max={3}
                step={0.1}
                unit="×"
              />
            )}

            <span className="settings-label">{stressTestPattern}</span>
          </div>

          {/* View controls bar */}
          <div className="view-controls-bar">
            <div className="shape-fill-controls">
              <span className="control-label">Shape Fill:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={shapeFillOpacity}
                onChange={(e) => setShapeFillOpacity(Number(e.target.value))}
                className="opacity-slider"
                title={`Shape fill opacity: ${shapeFillOpacity}%`}
              />
              <span className="opacity-value">{shapeFillOpacity}%</span>
            </div>
            <div className="hatch-controls">
              <button
                className={`toggle-btn ${showHatchLines ? 'active' : ''}`}
                onClick={() => setShowHatchLines(!showHatchLines)}
              >
                {showHatchLines ? 'Hide Hatch' : 'Show Hatch'}
              </button>
            </div>
            <div className="zoom-controls">
              <button onClick={() => setStressScale(s => Math.min(20, s * 1.5))} title="Zoom In">+</button>
              <button onClick={() => setStressScale(s => Math.max(0.1, s / 1.5))} title="Zoom Out">−</button>
              <button onClick={() => { setStressScale(1); setStressOffset({ x: 0, y: 0 }) }} title="Reset View">Fit</button>
              <span className="zoom-level">{Math.round(stressScale * 100)}%</span>
            </div>
          </div>

          {/* Stress test section */}
          <div className="stress-test-section">
            {stressPaths.length > 0 && (
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
                  ref={stressContainerRef}
                  className="stress-test-viewport"
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
            )}

          </div>

          {/* Torture Test Report - shown at bottom when results exist */}
          {tortureTestResults.length > 0 && (
            <div className="torture-test-report" ref={tortureReportRef}>
              <h3>Torture Test Report</h3>
              <div className="torture-summary">
                <span className="summary-item">
                  Patterns tested: {tortureTestResults.length}/{ALL_PATTERNS.length}
                </span>
                <span className="summary-item excellent">
                  Excellent: {tortureTestResults.filter(r => r.status === 'excellent').length}
                </span>
                <span className="summary-item acceptable">
                  Acceptable: {tortureTestResults.filter(r => r.status === 'acceptable').length}
                </span>
                <span className="summary-item slow">
                  Slow: {tortureTestResults.filter(r => r.status === 'slow').length}
                </span>
                <span className="summary-item failed">
                  Failed: {tortureTestResults.filter(r => r.status === 'failed').length}
                </span>
              </div>
              <table className="torture-table">
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Time</th>
                    <th>Lines</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {tortureTestResults.map((result) => (
                    <tr key={result.pattern} className={`status-${result.status}`}>
                      <td className="pattern-name">{result.pattern}</td>
                      <td className="time">{result.timeMs.toFixed(1)}ms</td>
                      <td className="lines">{result.lines.toLocaleString()}</td>
                      <td className={`status ${result.status}`}>
                        {result.status === 'excellent' && '✓ Excellent'}
                        {result.status === 'acceptable' && '○ Acceptable'}
                        {result.status === 'slow' && '⚠ Slow'}
                        {result.status === 'failed' && '✗ Failed'}
                      </td>
                      <td className="notes">
                        {result.error && <span className="error">{result.error}</span>}
                        {result.lines === 0 && !result.error && <span className="warning">No lines generated</span>}
                        {result.timeMs > PERF_THRESHOLDS.slow && <span className="warning">Exceeds {PERF_THRESHOLDS.slow}ms threshold</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="threshold-legend">
                <span>Thresholds:</span>
                <span className="excellent">Excellent: &lt;{PERF_THRESHOLDS.excellent}ms</span>
                <span className="acceptable">Acceptable: &lt;{PERF_THRESHOLDS.acceptable}ms</span>
                <span className="slow">Slow: &lt;{PERF_THRESHOLDS.slow}ms</span>
                <span className="failed">Failed: &gt;{PERF_THRESHOLDS.slow}ms or error</span>
              </div>
            </div>
          )}
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
