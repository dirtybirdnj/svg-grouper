// Backend fill generator - uses rat-king (Rust) for fast fill pattern generation
// All pattern generation is handled by rat-king via IPC

import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
} from '../src/utils/geometry'
import { FillPatternType, TileShapeType } from '../src/utils/fillPatterns'

// Input data for a single path to fill
export interface FillPathInput {
  id: string
  color: string
  polygons: PolygonWithHoles[]
  rawSubpaths?: Point[][] // For evenodd mode - all subpaths as flat arrays
}

// Output data for a filled path
export interface FillPathOutput {
  pathId: string
  lines: HatchLine[]
  polygon: Point[]
}

// Fill generation parameters
export interface FillGenerationParams {
  paths: FillPathInput[]
  boundingBox: Rect
  fillPattern: FillPatternType
  lineSpacing: number
  angle: number
  crossHatch: boolean
  inset: number
  wiggleAmplitude: number
  wiggleFrequency: number
  spiralOverDiameter: number
  singleSpiral: boolean
  singleHilbert: boolean
  singleFermat: boolean
  customTileShape: TileShapeType
  customTileGap: number
  customTileScale: number
  customTileRotateOffset: number
  enableCrop: boolean
  cropInset: number
  useEvenOdd: boolean // Use evenodd fill rule for compound paths
}

// Result of fill generation
export interface FillGenerationResult {
  paths: FillPathOutput[]
  success: boolean
  error?: string
}

// Register IPC handlers
export function registerFillGeneratorIPC() {
  // Main fill generation handler - USES RAT-KING with JSON output
  ipcMain.handle('generate-fills', async (event, params: FillGenerationParams) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendProgress = (progress: number, status: string) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fill-progress', { progress, status })
      }
    }

    const { paths, boundingBox, fillPattern, lineSpacing, angle } = params

    // Convert FillPathInput polygons to simple polygon format for rat-king
    const allPolygons: Array<{ id: string; points: Point[] }> = []
    for (const pathInput of paths) {
      for (const poly of pathInput.polygons) {
        if (poly.outer.length >= 3) {
          allPolygons.push({
            id: pathInput.id,
            points: poly.outer
          })
        }
      }
    }

    if (allPolygons.length === 0) {
      return { paths: [], success: true }
    }

    const ratKingPattern = mapPatternName(fillPattern)
    const svgContent = buildSvgFromPolygons(allPolygons, boundingBox)

    try {
      sendProgress(10, `Running rat-king ${ratKingPattern}...`)

      // Use new JSON stdin/stdout approach - no temp files!
      const result = await runRatKingJson(svgContent, ratKingPattern, lineSpacing, angle)

      // Log chain optimization stats if available
      if (result.chain_stats) {
        console.log(`[rat-king] Line chaining: ${result.chain_stats.input_lines} lines → ${result.chain_stats.output_chains} chains (${result.chain_stats.reduction_percent}% reduction)`)
      }

      sendProgress(90, 'Processing results...')

      // Build ID lookup map for matching shapes back to paths
      const pathIdMap = new Map<string, { pathInput: typeof paths[0]; polygon: Point[] }>()
      for (const pathInput of paths) {
        for (const poly of pathInput.polygons) {
          if (poly.outer.length >= 3) {
            pathIdMap.set(pathInput.id, { pathInput, polygon: poly.outer })
          }
        }
      }

      // Map rat-king shapes back to path results with per-shape colors
      const pathResults: FillPathOutput[] = []
      for (const shape of result.shapes) {
        const match = pathIdMap.get(shape.id)
        if (match && shape.lines.length > 0) {
          pathResults.push({
            pathId: shape.id,
            lines: shape.lines,
            polygon: match.polygon
          })
        }
      }

      sendProgress(100, 'rat-king complete')

      return {
        paths: pathResults,
        success: true
      }
    } catch (error) {
      console.error('[fillGenerator] rat-king error:', error)
      return {
        paths: [],
        success: false,
        error: error instanceof Error ? error.message : 'rat-king failed'
      }
    }
  })

  // Separate optimization handler - runs line ordering optimization
  ipcMain.handle('optimize-fill-lines', async (event, lines: HatchLine[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendProgress = (progress: number, status: string) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fill-progress', { progress, status })
      }
    }

    const { optimizeLineOrderMultiPass } = await import('../src/utils/fillPatterns')
    sendProgress(0, 'Optimizing line order...')
    const optimized = optimizeLineOrderMultiPass(lines)
    sendProgress(100, 'Optimization complete')
    return optimized
  })

  // Abort handler - no-op since rat-king handles fill generation synchronously
  ipcMain.handle('abort-fill-generation', async () => {
    return { success: true }
  })
}

// Helper functions for rat-king integration

function mapPatternName(pattern: string): string {
  const patternMap: Record<string, string> = {
    'lines': 'lines',
    'crosshatch': 'crosshatch',
    'zigzag': 'zigzag',
    'wiggle': 'wiggle',
    'spiral': 'spiral',
    'fermat': 'fermat',
    'concentric': 'concentric',
    'radial': 'radial',
    'honeycomb': 'honeycomb',
    'crossspiral': 'crossspiral',
    'hilbert': 'hilbert',
    'gyroid': 'gyroid',
    'scribble': 'scribble',
    'guilloche': 'guilloche',
    'lissajous': 'lissajous',
    'rose': 'rose',
    'phyllotaxis': 'phyllotaxis',
    // Map unsupported patterns to lines
    'wave': 'wiggle',
    'custom': 'lines',
  }
  return patternMap[pattern] || 'lines'
}

export function findRatKingBinary(): string {
  const paths = [
    path.join(os.homedir(), '.cargo', 'bin', 'rat-king'),
    '/usr/local/bin/rat-king',
    'rat-king'
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  return 'rat-king'
}

// Run rat-king with JSON output via stdin/stdout (no temp files)
interface RatKingLine { x1: number; y1: number; x2: number; y2: number }
interface RatKingPoint { x: number; y: number }
interface RatKingChainStats {
  input_lines: number
  output_chains: number
  reduction_percent: number
  avg_chain_length: number
}
interface RatKingShape {
  id: string
  index: number
  lines: RatKingLine[]           // Raw line segments (always present)
  chains?: RatKingPoint[][]      // Chained polylines (optional, more efficient)
}
interface RatKingJsonResult {
  shapes: RatKingShape[]
  chain_stats?: RatKingChainStats  // Stats about line chaining optimization
}

function runRatKingJson(svgContent: string, pattern: string, spacing: number, angle: number): Promise<RatKingJsonResult> {
  return new Promise((resolve, reject) => {
    const ratKingBin = findRatKingBinary()
    const args = [
      'fill', '-',  // stdin (read SVG from stdin)
      '-p', pattern,
      '-s', spacing.toString(),
      '-a', angle.toString(),
      '--json',     // output as JSON (not -f json)
      '--grouped',  // group lines by polygon
    ]

    const proc = spawn(ratKingBin, args)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => stdout += d.toString())
    proc.stderr.on('data', (d) => stderr += d.toString())

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout) as RatKingJsonResult
          resolve(result)
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e}`))
        }
      } else {
        reject(new Error(`rat-king failed (code ${code}): ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn rat-king: ${err.message}`))
    })

    // Handle stdin errors (EPIPE if process exits early)
    proc.stdin.on('error', (err) => {
      // EPIPE is expected if process exits before we finish writing
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        console.error('[rat-king] stdin error:', err)
      }
    })

    // Write SVG to stdin
    proc.stdin.write(svgContent)
    proc.stdin.end()
  })
}

function buildSvgFromPolygons(polygons: Array<{ id: string; points: Point[] }>, boundingBox: Rect): string {
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${boundingBox.x} ${boundingBox.y} ${boundingBox.width} ${boundingBox.height}">
`
  for (const poly of polygons) {
    if (poly.points.length < 3) continue
    const d = poly.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
    svg += `  <path d="${d}" fill="black" id="${poly.id}"/>\n`
  }
  svg += '</svg>\n'
  return svg
}

