// Backend fill generator - runs fill generation in worker threads
// This keeps the main process responsive during expensive computations

import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'worker_threads'
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
            lines = generateConcentricLines(polygonData.outer, lineSpacing, true)
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
  // Main fill generation handler
  ipcMain.handle('generate-fills', async (event, params: FillGenerationParams) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendProgress = (progress: number, status: string) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fill-progress', { progress, status })
      }
    }

    try {
      // Try to use worker thread first
      const result = await runInWorker<FillGenerationResult>(
        'generate',
        params,
        sendProgress
      )
      return result
    } catch (error) {
      console.warn('[fillGenerator] Worker failed, falling back to main process:', error)
      // Fallback to main process if worker fails
      return generateFillsMainProcess(params, sendProgress)
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
}
