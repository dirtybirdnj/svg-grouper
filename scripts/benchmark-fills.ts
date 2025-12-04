#!/usr/bin/env npx ts-node
/**
 * Fill Pattern Benchmark
 *
 * Tests all fill pattern generators against various test shapes
 * to measure performance and identify bottlenecks.
 *
 * Run with: npx ts-node scripts/benchmark-fills.ts
 */

import {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
  generateGlobalHatchLines,
  clipLinesToPolygon,
} from '../src/utils/geometry'

import {
  FillPatternType,
  generateConcentricLines,
  generateHoneycombLines,
  generateWiggleLines,
  generateGlobalSpiralLines,
  clipSpiralToPolygon,
  generateGyroidLines,
  generateCrosshatchLines,
  generateZigzagLines,
  generateRadialLines,
  generateCrossSpiralLines,
  generateGlobalHilbertLines,
  clipHilbertToPolygon,
  generateGlobalFermatLines,
  clipFermatToPolygon,
  generateWaveLines,
  generateScribbleLines,
  generateCustomTileLines,
  TILE_SHAPES,
} from '../src/utils/fillPatterns'

// Test shape definitions
interface TestShape {
  name: string
  polygon: PolygonWithHoles
  boundingBox: Rect
}

// Simple rectangle
function createRectangle(width: number, height: number): TestShape {
  const outer: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  return {
    name: `Rectangle ${width}x${height}`,
    polygon: { outer, holes: [] },
    boundingBox: { x: 0, y: 0, width, height }
  }
}

// Circle approximation
function createCircle(radius: number, segments: number = 64): TestShape {
  const outer: Point[] = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    outer.push({
      x: radius + radius * Math.cos(angle),
      y: radius + radius * Math.sin(angle)
    })
  }
  return {
    name: `Circle r=${radius}`,
    polygon: { outer, holes: [] },
    boundingBox: { x: 0, y: 0, width: radius * 2, height: radius * 2 }
  }
}

// Rectangle with circular hole
function createRectWithHole(width: number, height: number, holeRadius: number): TestShape {
  const outer: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]

  // Create hole in center
  const hole: Point[] = []
  const cx = width / 2
  const cy = height / 2
  const segments = 32
  for (let i = segments - 1; i >= 0; i--) { // Reverse winding for hole
    const angle = (i / segments) * Math.PI * 2
    hole.push({
      x: cx + holeRadius * Math.cos(angle),
      y: cy + holeRadius * Math.sin(angle)
    })
  }

  return {
    name: `Rectangle ${width}x${height} with hole`,
    polygon: { outer, holes: [hole] },
    boundingBox: { x: 0, y: 0, width, height }
  }
}

// Complex star shape
function createStar(outerRadius: number, innerRadius: number, points: number = 5): TestShape {
  const outer: Point[] = []
  const cx = outerRadius
  const cy = outerRadius

  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    outer.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    })
  }

  return {
    name: `Star ${points}-point`,
    polygon: { outer, holes: [] },
    boundingBox: { x: 0, y: 0, width: outerRadius * 2, height: outerRadius * 2 }
  }
}

// All fill patterns to test
const FILL_PATTERNS: FillPatternType[] = [
  'lines',
  'crosshatch',
  'concentric',
  'spiral',
  'fermat',
  'hilbert',
  'radial',
  'zigzag',
  'wave',
  'wiggle',
  'scribble',
  'honeycomb',
  'gyroid',
  'crossspiral',
  'custom',
]

// Default parameters
const DEFAULT_PARAMS = {
  lineSpacing: 3,
  angle: 45,
  inset: 0,
  wiggleAmplitude: 5,
  wiggleFrequency: 2,
  spiralOverDiameter: 2.0,
}

// Benchmark a single pattern against a shape
function benchmarkPattern(
  pattern: FillPatternType,
  shape: TestShape,
  iterations: number = 3
): { avgTime: number; lineCount: number; minTime: number; maxTime: number } {
  const { polygon, boundingBox } = shape
  const { lineSpacing, angle, inset, wiggleAmplitude, wiggleFrequency, spiralOverDiameter } = DEFAULT_PARAMS

  const times: number[] = []
  let lineCount = 0

  // Pre-generate global patterns
  const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
  const globalSpiralLines = generateGlobalSpiralLines(
    boundingBox.x + boundingBox.width / 2,
    boundingBox.y + boundingBox.height / 2,
    Math.sqrt(Math.pow(boundingBox.width / 2, 2) + Math.pow(boundingBox.height / 2, 2)) * spiralOverDiameter,
    lineSpacing,
    angle
  )
  const globalHilbertLines = generateGlobalHilbertLines(boundingBox, lineSpacing)
  const globalFermatLines = generateGlobalFermatLines(boundingBox, lineSpacing, angle, spiralOverDiameter)

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()

    let lines: HatchLine[] = []

    switch (pattern) {
      case 'lines':
        lines = clipLinesToPolygon(globalLines, polygon, inset)
        break
      case 'crosshatch':
        lines = generateCrosshatchLines(polygon, boundingBox, lineSpacing, angle, inset)
        break
      case 'concentric':
        lines = generateConcentricLines(polygon, lineSpacing, true)
        break
      case 'spiral':
        lines = clipSpiralToPolygon(globalSpiralLines, polygon, inset)
        break
      case 'fermat':
        lines = clipFermatToPolygon(globalFermatLines, polygon, inset)
        break
      case 'hilbert':
        lines = clipHilbertToPolygon(globalHilbertLines, polygon, inset)
        break
      case 'radial':
        lines = generateRadialLines(polygon, lineSpacing, inset, angle)
        break
      case 'zigzag':
        lines = generateZigzagLines(polygon, boundingBox, lineSpacing, angle, wiggleAmplitude, inset)
        break
      case 'wave':
        lines = generateWaveLines(polygon, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
        break
      case 'wiggle':
        lines = generateWiggleLines(polygon, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
        break
      case 'scribble':
        lines = generateScribbleLines(polygon, lineSpacing, inset)
        break
      case 'honeycomb':
        lines = generateHoneycombLines(polygon, lineSpacing, inset, angle)
        break
      case 'gyroid':
        lines = generateGyroidLines(polygon, lineSpacing, inset, angle)
        break
      case 'crossspiral':
        lines = generateCrossSpiralLines(polygon, lineSpacing, inset, angle, spiralOverDiameter)
        break
      case 'custom':
        lines = generateCustomTileLines(polygon, lineSpacing, TILE_SHAPES.triangle, inset, angle)
        break
    }

    const end = performance.now()
    times.push(end - start)
    lineCount = lines.length
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)

  return { avgTime, lineCount, minTime, maxTime }
}

// Main benchmark runner
function runBenchmarks() {
  console.log('='.repeat(80))
  console.log('Fill Pattern Benchmark')
  console.log('='.repeat(80))
  console.log('')

  // Test shapes of different sizes/complexity
  const testShapes: TestShape[] = [
    createRectangle(100, 100),
    createRectangle(500, 500),
    createCircle(100),
    createCircle(250),
    createRectWithHole(200, 200, 50),
    createStar(100, 40, 5),
    createStar(200, 80, 8),
  ]

  const results: Map<string, Map<string, { avgTime: number; lineCount: number }>> = new Map()

  for (const shape of testShapes) {
    console.log(`\nTesting: ${shape.name}`)
    console.log('-'.repeat(60))
    console.log(`${'Pattern'.padEnd(15)} | ${'Avg Time'.padStart(10)} | ${'Lines'.padStart(8)} | ${'Min'.padStart(8)} | ${'Max'.padStart(8)}`)
    console.log('-'.repeat(60))

    const shapeResults: Map<string, { avgTime: number; lineCount: number }> = new Map()

    for (const pattern of FILL_PATTERNS) {
      try {
        const { avgTime, lineCount, minTime, maxTime } = benchmarkPattern(pattern, shape)
        shapeResults.set(pattern, { avgTime, lineCount })

        const avgStr = `${avgTime.toFixed(2)}ms`.padStart(10)
        const linesStr = String(lineCount).padStart(8)
        const minStr = `${minTime.toFixed(2)}ms`.padStart(8)
        const maxStr = `${maxTime.toFixed(2)}ms`.padStart(8)

        // Color code based on performance
        const prefix = avgTime > 100 ? '🔴' : avgTime > 20 ? '🟡' : '🟢'
        console.log(`${prefix} ${pattern.padEnd(13)} | ${avgStr} | ${linesStr} | ${minStr} | ${maxStr}`)
      } catch (err) {
        console.log(`❌ ${pattern.padEnd(13)} | ERROR: ${(err as Error).message}`)
      }
    }

    results.set(shape.name, shapeResults)
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY: Average times across all shapes')
  console.log('='.repeat(80))

  const patternTotals: Map<string, { totalTime: number; count: number }> = new Map()

  for (const [, shapeResults] of results) {
    for (const [pattern, { avgTime }] of shapeResults) {
      const current = patternTotals.get(pattern) || { totalTime: 0, count: 0 }
      patternTotals.set(pattern, {
        totalTime: current.totalTime + avgTime,
        count: current.count + 1
      })
    }
  }

  // Sort by average time
  const sortedPatterns = Array.from(patternTotals.entries())
    .map(([pattern, { totalTime, count }]) => ({
      pattern,
      avgTime: totalTime / count
    }))
    .sort((a, b) => a.avgTime - b.avgTime)

  console.log(`\n${'Pattern'.padEnd(15)} | ${'Overall Avg'.padStart(12)}`)
  console.log('-'.repeat(32))

  for (const { pattern, avgTime } of sortedPatterns) {
    const prefix = avgTime > 50 ? '🔴' : avgTime > 10 ? '🟡' : '🟢'
    console.log(`${prefix} ${pattern.padEnd(13)} | ${avgTime.toFixed(2)}ms`.padStart(12))
  }

  console.log('\n✅ Benchmark complete!')
  console.log('\nLegend: 🟢 < 10ms, 🟡 10-50ms, 🔴 > 50ms')
}

// Run benchmarks
runBenchmarks()
