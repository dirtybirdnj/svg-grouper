// Pattern Test Harness - tests all fill patterns with simple shapes and stress test
// Uses the same rat-king IPC interface as the main app
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Rect,
  parsePathIntoSubpaths,
  getBoundingBox,
  getPolygonsFromSubpaths,
} from '../../utils/geometry'
import { FillPatternType } from '../../utils/fillPatterns'
import '../PatternTest.css'

import {
  PatternTestProps,
  PatternResult,
  TortureTestResult,
  StressTestPath,
  StressTestResultData,
  PatternSettings,
} from './types'
import {
  ALL_PATTERNS,
  PERF_THRESHOLDS,
  SQUARE_SIZE,
  createSquarePolygon,
  createComplexTestPolygon,
} from './constants'
import { SliderInput } from './SliderInput'
import { usePatternGenerator } from './usePatternGenerator'
import { PatternGrid } from './PatternGrid'
import { TortureTestReport } from './TortureTestReport'
import { StressTestViewport } from './StressTestViewport'

// Get performance status based on time
function getPerformanceStatus(timeMs: number, hasError: boolean): TortureTestResult['status'] {
  if (hasError) return 'failed'
  if (timeMs < PERF_THRESHOLDS.excellent) return 'excellent'
  if (timeMs < PERF_THRESHOLDS.acceptable) return 'acceptable'
  if (timeMs < PERF_THRESHOLDS.slow) return 'slow'
  return 'failed'
}

export default function PatternTest({ onBack }: PatternTestProps) {
  const { generatePatternFillAsync } = usePatternGenerator()

  const [results, setResults] = useState<PatternResult[]>([])
  const [stressTestPattern, setStressTestPattern] = useState<FillPatternType>('lines')
  const [stressTestResult, setStressTestResult] = useState<StressTestResultData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showPatterns, setShowPatterns] = useState(true)
  const [showHatchLines, setShowHatchLines] = useState(true)
  const [shapeFillOpacity, setShapeFillOpacity] = useState(20)

  // Stress test state
  const [stressPaths, setStressPaths] = useState<StressTestPath[]>([])
  const [stressViewBox, setStressViewBox] = useState<string>('0 0 210 297')
  const [stressSvgOutlines, setStressSvgOutlines] = useState<string[]>([])
  const [stressSvgTransform, setStressSvgTransform] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [backgroundPngUrl, setBackgroundPngUrl] = useState<string | null>(null)
  const [backgroundPngSize, setBackgroundPngSize] = useState({ width: 0, height: 0 })

  // Torture test state
  const [tortureTestResults, setTortureTestResults] = useState<TortureTestResult[]>([])
  const [isTortureRunning, setIsTortureRunning] = useState(false)
  const [isTorturePaused, setIsTorturePaused] = useState(false)
  const [tortureProgress, setTortureProgress] = useState(0)
  const [currentTorturePattern, setCurrentTorturePattern] = useState<FillPatternType | null>(null)
  const tortureAbortRef = useRef(false)
  const torturePauseRef = useRef(false)
  const tortureReportRef = useRef<HTMLDivElement>(null)

  // Test settings
  const [lineSpacing, setLineSpacing] = useState(5)
  const [angle, setAngle] = useState(45)
  const [inset, setInset] = useState(0)
  const [crossHatch, setCrossHatch] = useState(false)
  const [wiggleAmplitude, setWiggleAmplitude] = useState(3)
  const [wiggleFrequency, setWiggleFrequency] = useState(0.5)
  const [spiralOverDiameter, setSpiralOverDiameter] = useState(1.5)

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

      const polygon = createSquarePolygon(10, 10, SQUARE_SIZE)
      const bbox: Rect = { x: 10, y: 10, width: SQUARE_SIZE, height: SQUARE_SIZE }

      for (const pattern of ALL_PATTERNS) {
        const { lines, timeMs, error } = await generatePatternFillAsync(
          pattern,
          [{ id: 'test', polygon, bbox }],
          bbox,
          patternSettings
        )
        testResults.push({ pattern, lines, timeMs, error })
      }

      setResults(testResults)
      setIsLoading(false)
    }

    runTests()
  }, [lineSpacing, angle, inset, crossHatch, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, generatePatternFillAsync])

  // Load Essex SVG
  useEffect(() => {
    const loadEssex = async () => {
      try {
        const response = await fetch('/essex-vt-stress-test.svg')
        if (response.ok) {
          const svgText = await response.text()
          const parser = new DOMParser()
          const doc = parser.parseFromString(svgText, 'image/svg+xml')

          const svgEl = doc.querySelector('svg')
          if (svgEl) {
            const viewBox = svgEl.getAttribute('viewBox')
            if (viewBox) setStressViewBox(viewBox)
          }

          const transformGroup = doc.querySelector('g[transform]')
          if (transformGroup) {
            const transform = transformGroup.getAttribute('transform') || ''
            setStressSvgTransform(transform)
          }

          const pathElements = doc.querySelectorAll('path')
          const paths: StressTestPath[] = []
          const outlines: string[] = []

          pathElements.forEach((pathEl, index) => {
            const d = pathEl.getAttribute('d') || ''
            const fill = pathEl.getAttribute('fill') || '#000000'
            const id = pathEl.getAttribute('id') || `path-${index}`

            outlines.push(d)

            const subpaths = parsePathIntoSubpaths(d)
            const polygons = getPolygonsFromSubpaths(subpaths)

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
        }
      } catch (e) {
        console.error('[PatternTest] Failed to load Essex SVG:', e)
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

  // Generate background PNG
  useEffect(() => {
    if (stressSvgOutlines.length === 0 || !stressViewBox) return

    const generateBackgroundPng = async () => {
      const vbParts = stressViewBox.split(' ').map(Number)
      if (vbParts.length !== 4) return

      const [vbX, vbY, vbWidth, vbHeight] = vbParts
      const scale = 4
      const width = Math.ceil(vbWidth * scale)
      const height = Math.ceil(vbHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      ctx.save()
      ctx.scale(scale, scale)
      ctx.translate(-vbX, -vbY)

      if (stressSvgTransform) {
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

      ctx.fillStyle = '#a8d483'
      ctx.strokeStyle = '#666666'
      ctx.lineWidth = 0.5

      for (const d of stressSvgOutlines) {
        const path = new Path2D(d)
        ctx.fill(path)
        ctx.stroke(path)
      }

      ctx.restore()

      const dataUrl = canvas.toDataURL('image/png')
      setBackgroundPngUrl(dataUrl)
      setBackgroundPngSize({ width, height })
    }

    generateBackgroundPng()
  }, [stressSvgOutlines, stressViewBox, stressSvgTransform])

  // Run stress test when pattern changes
  useEffect(() => {
    if (stressPaths.length === 0) return

    const runStressTest = async () => {
      setIsGenerating(true)
      setStressTestResult(null)

      const globalBbox = stressPaths.reduce((acc, path) => ({
        x: Math.min(acc.x, path.bbox.x),
        y: Math.min(acc.y, path.bbox.y),
        width: Math.max(acc.x + acc.width, path.bbox.x + path.bbox.width) - Math.min(acc.x, path.bbox.x),
        height: Math.max(acc.y + acc.height, path.bbox.y + path.bbox.height) - Math.min(acc.y, path.bbox.y),
      }), stressPaths[0].bbox)

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

  // Run torture test
  const runTortureTest = useCallback(async () => {
    if (stressPaths.length === 0) return

    tortureAbortRef.current = false
    torturePauseRef.current = false
    setIsTortureRunning(true)
    setIsTorturePaused(false)
    setTortureTestResults([])
    setTortureProgress(0)
    setShowPatterns(false)

    const results: TortureTestResult[] = []

    for (let i = 0; i < ALL_PATTERNS.length; i++) {
      if (tortureAbortRef.current) break

      while (torturePauseRef.current && !tortureAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      if (tortureAbortRef.current) break

      const pattern = ALL_PATTERNS[i]
      setCurrentTorturePattern(pattern)
      setStressTestPattern(pattern)

      await new Promise(resolve => setTimeout(resolve, 50))

      const globalBbox = stressPaths.reduce((acc, path) => ({
        x: Math.min(acc.x, path.bbox.x),
        y: Math.min(acc.y, path.bbox.y),
        width: Math.max(acc.x + acc.width, path.bbox.x + path.bbox.width) - Math.min(acc.x, path.bbox.x),
        height: Math.max(acc.y + acc.height, path.bbox.y + path.bbox.height) - Math.min(acc.y, path.bbox.y),
      }), stressPaths[0].bbox)

      const result = await generatePatternFillAsync(
        pattern,
        stressPaths.map(p => ({ id: p.id, polygon: p.polygon, bbox: p.bbox })),
        globalBbox,
        patternSettings
      )

      const hasError = !!result.error
      const filledCount = result.lines.length > 0 ? stressPaths.length : 0
      const emptyCount = result.lines.length === 0 ? stressPaths.length : 0

      results.push({
        pattern,
        lines: result.lines.length,
        timeMs: result.timeMs,
        error: hasError ? result.error : undefined,
        status: getPerformanceStatus(result.timeMs, hasError),
      })

      setTortureTestResults([...results])
      setTortureProgress(Math.round(((i + 1) / ALL_PATTERNS.length) * 100))

      setStressTestResult({
        lines: result.lines,
        timeMs: result.timeMs,
        error: hasError ? result.error : undefined,
        polygonStats: {
          total: stressPaths.length,
          filled: filledCount,
          empty: emptyCount,
          tooSmall: 0,
        },
      })
    }

    setIsTortureRunning(false)
    setIsTorturePaused(false)
    setCurrentTorturePattern(null)

    setTimeout(() => {
      tortureReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [stressPaths, patternSettings, generatePatternFillAsync])

  const toggleTorturePause = useCallback(() => {
    torturePauseRef.current = !torturePauseRef.current
    setIsTorturePaused(torturePauseRef.current)
  }, [])

  const stopTortureTest = useCallback(() => {
    tortureAbortRef.current = true
    torturePauseRef.current = false
    setIsTorturePaused(false)
  }, [])

  const handlePatternSelect = (pattern: FillPatternType) => {
    setStressTestPattern(pattern)
    setShowPatterns(false)
  }

  return (
    <div className="pattern-test">
      <div className="pattern-test-header">
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
              Torture Test
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
          <button onClick={onBack} className="back-button">← Back</button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Running pattern tests...</div>
      ) : (
        <>
          {showPatterns && (
            <PatternGrid
              results={results}
              stressTestPattern={stressTestPattern}
              onPatternSelect={handlePatternSelect}
            />
          )}

          {/* Settings bar */}
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

            {!['concentric', 'tessellation'].includes(stressTestPattern) && (
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
          </div>

          {/* Stress test section */}
          <div className="stress-test-section">
            <StressTestViewport
              stressPaths={stressPaths}
              stressViewBox={stressViewBox}
              stressSvgOutlines={stressSvgOutlines}
              stressSvgTransform={stressSvgTransform}
              stressTestResult={stressTestResult}
              backgroundPngUrl={backgroundPngUrl}
              backgroundPngSize={backgroundPngSize}
              shapeFillOpacity={shapeFillOpacity}
              showHatchLines={showHatchLines}
            />
          </div>

          <TortureTestReport
            ref={tortureReportRef}
            results={tortureTestResults}
          />
        </>
      )}
    </div>
  )
}
