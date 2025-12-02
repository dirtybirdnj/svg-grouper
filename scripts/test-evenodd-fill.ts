#!/usr/bin/env npx tsx
/**
 * Test script for evenodd fill algorithm
 *
 * Tests the clipLinesToPolygonsEvenOdd function against compound paths
 * to verify correct evenodd fill behavior.
 *
 * Run with: npx tsx scripts/test-evenodd-fill.ts [--svg path/to/file.svg]
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  Point,
  HatchLine,
  Rect,
  generateGlobalHatchLines,
  clipLinesToPolygon,
  clipLinesToPolygonsEvenOdd,
  parsePathIntoSubpaths,
  isPointInsideEvenOdd,
  pointInPolygon,
} from '../src/utils/geometry'

// ============= TEST SHAPES =============

// Simple ring (outer circle with inner circle hole) - should fill the ring area
function createRing(): { subpaths: Point[][]; name: string; boundingBox: Rect } {
  const segments = 32
  const outerRadius = 100
  const innerRadius = 50
  const cx = 100
  const cy = 100

  const outer: Point[] = []
  const inner: Point[] = []

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    outer.push({ x: cx + outerRadius * Math.cos(angle), y: cy + outerRadius * Math.sin(angle) })
    // Inner circle goes counter-clockwise (opposite winding)
    inner.push({ x: cx + innerRadius * Math.cos(-angle), y: cy + innerRadius * Math.sin(-angle) })
  }

  return {
    subpaths: [outer, inner],
    name: 'Ring (outer circle with hole)',
    boundingBox: { x: 0, y: 0, width: 200, height: 200 }
  }
}

// Nested squares - outer, middle (hole), inner (filled again)
function createNestedSquares(): { subpaths: Point[][]; name: string; boundingBox: Rect } {
  const outer: Point[] = [
    { x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 150 }, { x: 0, y: 150 }
  ]
  const middle: Point[] = [ // hole
    { x: 25, y: 25 }, { x: 125, y: 25 }, { x: 125, y: 125 }, { x: 25, y: 125 }
  ]
  const inner: Point[] = [ // filled again (inside odd # of boundaries)
    { x: 50, y: 50 }, { x: 100, y: 100 }, { x: 100, y: 50 }, { x: 50, y: 100 }
  ]

  return {
    subpaths: [outer, middle, inner],
    name: 'Nested squares (3 levels)',
    boundingBox: { x: 0, y: 0, width: 150, height: 150 }
  }
}

// Two separate circles (non-overlapping) - both should be filled
function createTwoCircles(): { subpaths: Point[][]; name: string; boundingBox: Rect } {
  const segments = 32
  const radius = 30

  const circle1: Point[] = []
  const circle2: Point[] = []

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    circle1.push({ x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) })
    circle2.push({ x: 150 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) })
  }

  return {
    subpaths: [circle1, circle2],
    name: 'Two separate circles',
    boundingBox: { x: 0, y: 0, width: 200, height: 100 }
  }
}

// ============= TESTS =============

function runPointInPolygonTests() {
  console.log('\n=== Point in Polygon Tests ===\n')

  const ring = createRing()
  const [outer, inner] = ring.subpaths

  // Test points
  const centerPoint = { x: 100, y: 100 } // Center - inside inner circle
  const ringPoint = { x: 100, y: 75 }    // In ring area - inside outer, outside inner
  const outsidePoint = { x: 250, y: 250 } // Outside everything

  console.log('Ring test:')
  console.log(`  Center (100,100) in outer: ${pointInPolygon(centerPoint, outer)}`) // true
  console.log(`  Center (100,100) in inner: ${pointInPolygon(centerPoint, inner)}`) // true
  console.log(`  Center evenodd result: ${isPointInsideEvenOdd(centerPoint, ring.subpaths)}`) // false (2 boundaries = even)

  console.log(`  Ring point (100,75) in outer: ${pointInPolygon(ringPoint, outer)}`) // true
  console.log(`  Ring point (100,75) in inner: ${pointInPolygon(ringPoint, inner)}`) // false
  console.log(`  Ring point evenodd result: ${isPointInsideEvenOdd(ringPoint, ring.subpaths)}`) // true (1 boundary = odd)

  console.log(`  Outside (250,250) evenodd result: ${isPointInsideEvenOdd(outsidePoint, ring.subpaths)}`) // false (0 boundaries)
}

function runClippingTest(
  shape: { subpaths: Point[][]; name: string; boundingBox: Rect },
  lineSpacing: number = 5,
  angle: number = 45
) {
  console.log(`\nTesting: ${shape.name}`)
  console.log('-'.repeat(50))

  const { subpaths, boundingBox } = shape

  // Generate global hatch lines
  const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
  console.log(`Generated ${globalLines.length} global hatch lines`)
  console.log(`Subpaths: ${subpaths.length} with point counts: [${subpaths.map(sp => sp.length).join(', ')}]`)

  // Test evenodd clipping
  const evenoddLines = clipLinesToPolygonsEvenOdd(globalLines, subpaths, 0)
  console.log(`Evenodd clipping result: ${evenoddLines.length} lines`)

  // For comparison, test standard clipping (treating first subpath as outer with others as holes)
  // This mimics the default behavior
  const polygonWithHoles = { outer: subpaths[0], holes: subpaths.slice(1) }
  const standardLines = clipLinesToPolygon(globalLines, polygonWithHoles, 0)
  console.log(`Standard clipping result: ${standardLines.length} lines`)

  // Calculate total line length for each
  const evenoddLength = evenoddLines.reduce((sum, l) =>
    sum + Math.sqrt(Math.pow(l.x2 - l.x1, 2) + Math.pow(l.y2 - l.y1, 2)), 0)
  const standardLength = standardLines.reduce((sum, l) =>
    sum + Math.sqrt(Math.pow(l.x2 - l.x1, 2) + Math.pow(l.y2 - l.y1, 2)), 0)

  console.log(`Evenodd total length: ${evenoddLength.toFixed(2)}`)
  console.log(`Standard total length: ${standardLength.toFixed(2)}`)

  return { evenoddLines, standardLines }
}

function generateTestSVG(
  shape: { subpaths: Point[][]; name: string; boundingBox: Rect },
  evenoddLines: HatchLine[],
  standardLines: HatchLine[],
  outputPath: string
) {
  const { subpaths, boundingBox } = shape
  const padding = 20
  const spacing = 50 // Space between the two comparisons

  // Create two side-by-side views: evenodd on left, standard on right
  const totalWidth = (boundingBox.width + padding * 2) * 2 + spacing
  const totalHeight = boundingBox.height + padding * 2 + 50 // Extra for labels

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f0f0f0"/>

  <!-- Labels -->
  <text x="${boundingBox.width / 2 + padding}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">Evenodd (${evenoddLines.length} lines)</text>
  <text x="${boundingBox.width + padding * 3 + spacing + boundingBox.width / 2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">Standard (${standardLines.length} lines)</text>

  <!-- Left: Evenodd -->
  <g transform="translate(${padding}, ${padding + 30})">
    <!-- Shape outline -->
    ${subpaths.map((sp, i) => {
      const d = sp.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
      return `<path d="${d}" fill="none" stroke="#ccc" stroke-width="1"/>`
    }).join('\n    ')}
    <!-- Fill lines -->
    ${evenoddLines.map(l =>
      `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#000" stroke-width="0.5"/>`
    ).join('\n    ')}
  </g>

  <!-- Right: Standard -->
  <g transform="translate(${boundingBox.width + padding * 3 + spacing}, ${padding + 30})">
    <!-- Shape outline -->
    ${subpaths.map((sp, i) => {
      const d = sp.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
      return `<path d="${d}" fill="none" stroke="#ccc" stroke-width="1"/>`
    }).join('\n    ')}
    <!-- Fill lines -->
    ${standardLines.map(l =>
      `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#000" stroke-width="0.5"/>`
    ).join('\n    ')}
  </g>
</svg>`

  fs.writeFileSync(outputPath, svg)
  console.log(`Wrote test SVG to: ${outputPath}`)
}

function testSVGFile(svgPath: string) {
  console.log(`\n=== Testing SVG File: ${svgPath} ===\n`)

  const content = fs.readFileSync(svgPath, 'utf-8')

  // Simple regex to extract path d attributes
  const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/g
  let match
  let pathIndex = 0

  while ((match = pathRegex.exec(content)) !== null) {
    const d = match[1]
    const subpaths = parsePathIntoSubpaths(d)

    if (subpaths.length > 1) {
      console.log(`\nPath ${pathIndex}: Compound path with ${subpaths.length} subpaths`)
      console.log(`  Subpath sizes: [${subpaths.map(sp => sp.length).join(', ')}]`)

      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const sp of subpaths) {
        for (const p of sp) {
          minX = Math.min(minX, p.x)
          minY = Math.min(minY, p.y)
          maxX = Math.max(maxX, p.x)
          maxY = Math.max(maxY, p.y)
        }
      }

      const boundingBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      console.log(`  Bounding box: ${JSON.stringify(boundingBox)}`)

      const shape = { subpaths, name: `Path ${pathIndex}`, boundingBox }
      runClippingTest(shape, 10, 45)
    } else if (subpaths.length === 1) {
      console.log(`Path ${pathIndex}: Simple path with ${subpaths[0].length} points`)
    } else {
      console.log(`Path ${pathIndex}: No subpaths extracted`)
    }

    pathIndex++
    if (pathIndex >= 5) {
      console.log('\n... (showing first 5 paths only)')
      break
    }
  }
}

// ============= MAIN =============

function main() {
  const args = process.argv.slice(2)
  const svgIndex = args.indexOf('--svg')
  const svgPath = svgIndex >= 0 ? args[svgIndex + 1] : null

  console.log('='.repeat(60))
  console.log('Evenodd Fill Algorithm Test')
  console.log('='.repeat(60))

  // Run point-in-polygon tests first
  runPointInPolygonTests()

  // Test built-in shapes
  const testShapes = [
    createRing(),
    createNestedSquares(),
    createTwoCircles(),
  ]

  for (const shape of testShapes) {
    const { evenoddLines, standardLines } = runClippingTest(shape)

    // Generate comparison SVG
    const outputName = shape.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const outputPath = path.join(__dirname, `../test-output-${outputName}.svg`)
    generateTestSVG(shape, evenoddLines, standardLines, outputPath)
  }

  // Test SVG file if provided
  if (svgPath) {
    if (fs.existsSync(svgPath)) {
      testSVGFile(svgPath)
    } else {
      console.error(`\nError: SVG file not found: ${svgPath}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Test complete!')
  console.log('='.repeat(60))
}

main()
