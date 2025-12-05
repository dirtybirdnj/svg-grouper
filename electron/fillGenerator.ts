// Backend fill generator - runs fill generation in worker threads
// This keeps the main process responsive during expensive computations

import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
import * as path from 'path'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
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

// Track active workers for abort support
const activeWorkers = new Map<number, Worker>()
let nextWorkerId = 1

// Get worker script path (handles both dev and production)
function getWorkerPath(): string {
  // In development, TypeScript files are in electron/
  // In production, compiled JS files are in dist-electron/
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
    // For development, we need to use ts-node or compile the worker
    // The worker will be compiled along with main.ts by electron-vite
    return path.join(__dirname, 'fillWorker.js')
  } else {
    return path.join(__dirname, 'fillWorker.js')
  }
}

// Import app for isPackaged check
import { app } from 'electron'

// Run fill generation in a worker thread
function runInWorker<T>(
  type: 'generate' | 'optimize',
  data: FillGenerationParams | HatchLine[],
  onProgress: (progress: number, status: string) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const workerId = nextWorkerId++

    try {
      const workerPath = getWorkerPath()
      const worker = new Worker(workerPath)
      activeWorkers.set(workerId, worker)

      worker.on('message', (message: { type: string; progress?: number; status?: string; data?: T }) => {
        switch (message.type) {
          case 'ready':
            // Worker is ready, send the task
            if (type === 'generate') {
              worker.postMessage({ type: 'generate', params: data })
            } else {
              worker.postMessage({ type: 'optimize', lines: data })
            }
            break
          case 'progress':
            if (message.progress !== undefined && message.status) {
              onProgress(message.progress, message.status)
            }
            break
          case 'result':
            activeWorkers.delete(workerId)
            worker.terminate()
            resolve(message.data as T)
            break
        }
      })

      worker.on('error', (error) => {
        console.error('[fillGenerator] Worker error:', error)
        activeWorkers.delete(workerId)
        worker.terminate()
        reject(error)
      })

      worker.on('exit', (code) => {
        activeWorkers.delete(workerId)
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`))
        }
      })

    } catch (error) {
      activeWorkers.delete(workerId)
      console.error('[fillGenerator] Failed to create worker:', error)
      reject(error)
    }
  })
}

// Abort all active workers
function abortAllWorkers() {
  for (const [id, worker] of activeWorkers) {
    try {
      worker.postMessage({ type: 'abort' })
      worker.terminate()
    } catch (e) {
      // Worker may already be terminated
    }
    activeWorkers.delete(id)
  }
}

// Fallback: run fill generation in main process (if worker fails)
async function generateFillsMainProcess(
  params: FillGenerationParams,
  sendProgress: (progress: number, status: string) => void
): Promise<FillGenerationResult> {
  // Dynamic import to avoid loading all fill code into main process
  // if workers are available
  const {
    generateGlobalHatchLines,
    clipLinesToPolygon,
    clipLinesToRect,
    clipPolygonWithHolesToRect,
  } = await import('../src/utils/geometry')

  const {
    generateConcentricLines,
    generateHoneycombLines,
    generateWiggleLines,
    generateSpiralLines,
    generateGlobalSpiralLines,
    clipSpiralToPolygon,
    generateGyroidLines,
    generateCrosshatchLines,
    generateZigzagLines,
    generateRadialLines,
    generateCrossSpiralLines,
    generateHilbertLines,
    generateGlobalHilbertLines,
    clipHilbertToPolygon,
    generateFermatLines,
    generateGlobalFermatLines,
    clipFermatToPolygon,
    generateWaveLines,
    generateScribbleLines,
    generateCustomTileLines,
    TILE_SHAPES,
  } = await import('../src/utils/fillPatterns')

  const {
    paths,
    boundingBox,
    fillPattern,
    lineSpacing,
    angle,
    crossHatch,
    inset,
    wiggleAmplitude,
    wiggleFrequency,
    spiralOverDiameter,
    singleSpiral,
    singleHilbert,
    singleFermat,
    customTileShape,
    customTileGap,
    customTileScale,
    customTileRotateOffset,
    enableCrop,
    cropInset,
  } = params

  try {
    let cropRect: Rect | null = null
    if (enableCrop && cropInset > 0 && boundingBox) {
      const insetX = boundingBox.width * (cropInset / 100)
      const insetY = boundingBox.height * (cropInset / 100)
      cropRect = {
        x: boundingBox.x + insetX,
        y: boundingBox.y + insetY,
        width: boundingBox.width - insetX * 2,
        height: boundingBox.height - insetY * 2
      }
    }

    const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
    const globalCrossLines = crossHatch ? generateGlobalHatchLines(boundingBox, lineSpacing, angle + 90) : []

    let globalSpiralLines: HatchLine[] = []
    if (fillPattern === 'spiral' && singleSpiral) {
      const centerX = boundingBox.x + boundingBox.width / 2
      const centerY = boundingBox.y + boundingBox.height / 2
      const maxRadius = Math.sqrt(
        Math.pow(boundingBox.width / 2, 2) + Math.pow(boundingBox.height / 2, 2)
      ) * spiralOverDiameter
      globalSpiralLines = generateGlobalSpiralLines(centerX, centerY, maxRadius, lineSpacing, angle)
    }

    let globalHilbertLines: HatchLine[] = []
    if (fillPattern === 'hilbert' && singleHilbert) {
      globalHilbertLines = generateGlobalHilbertLines(boundingBox, lineSpacing)
    }

    let globalFermatLines: HatchLine[] = []
    if (fillPattern === 'fermat' && singleFermat) {
      globalFermatLines = generateGlobalFermatLines(boundingBox, lineSpacing, angle, spiralOverDiameter)
    }

    const results: FillPathOutput[] = []
    const totalPaths = paths.length

    for (let i = 0; i < paths.length; i++) {
      const progress = Math.round((i / totalPaths) * 100)
      sendProgress(progress, `Generating ${fillPattern} fill (${i + 1}/${totalPaths})`)

      const pathInput = paths[i]
      let allPolygons = pathInput.polygons

      if (cropRect) {
        allPolygons = allPolygons
          .map(p => clipPolygonWithHolesToRect(p, cropRect!))
          .filter(p => p.outer.length >= 3)
      }

      let allLines: HatchLine[] = []
      let firstValidPolygon: Point[] | null = null

      for (const polygonData of allPolygons) {
        if (polygonData.outer.length < 3) continue
        if (!firstValidPolygon) firstValidPolygon = polygonData.outer

        let lines: HatchLine[] = []

        switch (fillPattern) {
          case 'concentric':
            lines = generateConcentricLines(polygonData, lineSpacing, true)
            break
          case 'wiggle':
            lines = generateWiggleLines(polygonData, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
            break
          case 'spiral':
            if (singleSpiral) {
              lines = clipSpiralToPolygon(globalSpiralLines, polygonData, inset)
            } else {
              lines = generateSpiralLines(polygonData, lineSpacing, inset, angle, spiralOverDiameter)
            }
            break
          case 'honeycomb':
            lines = generateHoneycombLines(polygonData, lineSpacing, inset, angle)
            break
          case 'gyroid':
            lines = generateGyroidLines(polygonData, lineSpacing, inset, angle)
            break
          case 'crosshatch':
            lines = generateCrosshatchLines(polygonData, boundingBox, lineSpacing, angle, inset)
            break
          case 'zigzag':
            lines = generateZigzagLines(polygonData, boundingBox, lineSpacing, angle, wiggleAmplitude, inset)
            break
          case 'radial':
            lines = generateRadialLines(polygonData, lineSpacing, inset)
            break
          case 'crossspiral':
            lines = generateCrossSpiralLines(polygonData, lineSpacing, inset, angle, spiralOverDiameter)
            break
          case 'hilbert':
            if (singleHilbert) {
              lines = clipHilbertToPolygon(globalHilbertLines, polygonData, inset)
            } else {
              lines = generateHilbertLines(polygonData, lineSpacing, inset)
            }
            break
          case 'fermat':
            if (singleFermat) {
              lines = clipFermatToPolygon(globalFermatLines, polygonData, inset)
            } else {
              lines = generateFermatLines(polygonData, lineSpacing, inset, angle, spiralOverDiameter)
            }
            break
          case 'wave':
            lines = generateWaveLines(polygonData, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
            break
          case 'scribble':
            lines = generateScribbleLines(polygonData, lineSpacing, inset)
            break
          case 'custom':
            lines = generateCustomTileLines(polygonData, lineSpacing, TILE_SHAPES[customTileShape], inset, angle, false, customTileGap, customTileScale, customTileRotateOffset)
            break
          case 'lines':
          default: {
            const clippedLines = clipLinesToPolygon(globalLines, polygonData, inset)
            lines = cropRect ? clipLinesToRect(clippedLines, cropRect) : clippedLines
            if (crossHatch) {
              const clippedCrossLines = clipLinesToPolygon(globalCrossLines, polygonData, inset)
              const croppedCrossLines = cropRect ? clipLinesToRect(clippedCrossLines, cropRect) : clippedCrossLines
              for (const cl of croppedCrossLines) {
                lines.push(cl)
              }
            }
            break
          }
        }

        // Use push to avoid O(n²) array allocations from spread operator
        for (const line of lines) {
          allLines.push(line)
        }
      }

      if (allLines.length > 0 && firstValidPolygon) {
        results.push({
          pathId: pathInput.id,
          lines: allLines,
          polygon: firstValidPolygon
        })
      }

      // Yield to event loop
      await new Promise(resolve => setImmediate(resolve))
    }

    sendProgress(100, 'Fill generation complete')
    return { paths: results, success: true }

  } catch (error) {
    console.error('[fillGenerator] Error:', error)
    return {
      paths: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
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

  // Separate optimization handler
  ipcMain.handle('optimize-fill-lines', async (event, lines: HatchLine[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendProgress = (progress: number, status: string) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fill-progress', { progress, status })
      }
    }

    try {
      // Try to use worker thread first
      const result = await runInWorker<HatchLine[]>(
        'optimize',
        lines,
        sendProgress
      )
      return result
    } catch (error) {
      console.warn('[fillGenerator] Worker failed for optimization, falling back to main process')
      // Fallback: run in main process
      const { optimizeLineOrderMultiPass } = await import('../src/utils/fillPatterns')
      sendProgress(0, 'Optimizing line order...')
      const optimized = optimizeLineOrderMultiPass(lines)
      sendProgress(100, 'Optimization complete')
      return optimized
    }
  })

  // Abort handler - cancel any in-progress fill generation
  ipcMain.handle('abort-fill-generation', async () => {
    abortAllWorkers()
    return { success: true }
  })

  // rat-king fill generation (Rust-based, much faster) - returns full SVG
  ipcMain.handle('generate-fills-ratking', async (event, svgContent: string, pattern: string, spacing: number, angle: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (progress: number, status: string) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fill-progress', { progress, status })
      }
    }

    const ratKingPattern = mapPatternName(pattern)
    const { inputPath, outputPath } = getTempPaths()

    try {
      fs.writeFileSync(inputPath, svgContent)
      sendProgress(10, `Running rat-king ${ratKingPattern}...`)

      const result = await runRatKing(inputPath, outputPath, ratKingPattern, spacing, angle)
      sendProgress(100, 'rat-king complete')
      return { success: true, svg: result }
    } catch (e) {
      return { success: false, error: String(e) }
    } finally {
      try { fs.unlinkSync(inputPath) } catch {}
      try { fs.unlinkSync(outputPath) } catch {}
    }
  })

  // rat-king fill for layer workflow - takes polygons, returns lines
  ipcMain.handle('generate-fills-ratking-polygons', async (event, params: {
    polygons: Array<{ id: string; points: Point[] }>
    boundingBox: Rect
    pattern: string
    spacing: number
    angle: number
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (progress: number, status: string) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fill-progress', { progress, status })
      }
    }

    const { polygons, boundingBox, pattern, spacing, angle } = params
    const ratKingPattern = mapPatternName(pattern)

    // Build minimal SVG with just the polygons
    const svgContent = buildSvgFromPolygons(polygons, boundingBox)
    const { inputPath, outputPath } = getTempPaths()

    try {
      fs.writeFileSync(inputPath, svgContent)
      sendProgress(10, `Running rat-king ${ratKingPattern}...`)

      const resultSvg = await runRatKing(inputPath, outputPath, ratKingPattern, spacing, angle)

      // Parse lines from output SVG
      const lines = parseLinesFromSvg(resultSvg)
      sendProgress(100, 'rat-king complete')

      return {
        success: true,
        lines,
        // Return all lines under a single "all" path since rat-king doesn't track per-polygon
        paths: [{ pathId: 'all', lines, polygon: polygons[0]?.points || [] }]
      }
    } catch (e) {
      console.error('rat-king error:', e)
      return { success: false, error: String(e), paths: [] }
    } finally {
      try { fs.unlinkSync(inputPath) } catch {}
      try { fs.unlinkSync(outputPath) } catch {}
    }
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

function getTempPaths() {
  const tmpDir = os.tmpdir()
  const timestamp = Date.now()
  return {
    inputPath: path.join(tmpDir, `ratking-input-${timestamp}.svg`),
    outputPath: path.join(tmpDir, `ratking-output-${timestamp}.svg`)
  }
}

function findRatKingBinary(): string {
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

function runRatKing(inputPath: string, outputPath: string, pattern: string, spacing: number, angle: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const ratKingBin = findRatKingBinary()
    const args = [
      'fill', inputPath,
      '-p', pattern,
      '-s', spacing.toString(),
      '-a', angle.toString(),
      '-o', outputPath
    ]

    const proc = spawn(ratKingBin, args)
    let stderr = ''

    proc.stderr.on('data', (d) => stderr += d.toString())

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const outputSvg = fs.readFileSync(outputPath, 'utf-8')
          resolve(outputSvg)
        } catch (e) {
          reject(new Error(`Failed to read output: ${e}`))
        }
      } else {
        reject(new Error(`rat-king failed (code ${code}): ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn rat-king: ${err.message}`))
    })
  })
}

// New: Run rat-king with JSON output via stdin/stdout (no temp files)
interface RatKingLine { x1: number; y1: number; x2: number; y2: number }
interface RatKingShape { id: string; index: number; lines: RatKingLine[] }
interface RatKingJsonResult { shapes: RatKingShape[] }

function runRatKingJson(svgContent: string, pattern: string, spacing: number, angle: number): Promise<RatKingJsonResult> {
  return new Promise((resolve, reject) => {
    const ratKingBin = findRatKingBinary()
    const args = [
      'fill', '-',  // stdin
      '-p', pattern,
      '-s', spacing.toString(),
      '-a', angle.toString(),
      '-f', 'json',
      '--grouped',
      '-o', '-'  // stdout
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

function parseLinesFromSvg(svgContent: string): HatchLine[] {
  const lines: HatchLine[] = []
  // Parse <line x1="..." y1="..." x2="..." y2="..."/> elements
  const lineRegex = /<line\s+x1="([^"]+)"\s+y1="([^"]+)"\s+x2="([^"]+)"\s+y2="([^"]+)"/g
  let match
  while ((match = lineRegex.exec(svgContent)) !== null) {
    lines.push({
      x1: parseFloat(match[1]),
      y1: parseFloat(match[2]),
      x2: parseFloat(match[3]),
      y2: parseFloat(match[4])
    })
  }
  return lines
}
