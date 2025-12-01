// Fill generation worker - runs in separate thread to avoid blocking main process
import { parentPort, workerData } from 'worker_threads'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
  generateGlobalHatchLines,
  clipLinesToPolygon,
  clipLinesToRect,
  clipPolygonWithHolesToRect,
} from '../src/utils/geometry'
import {
  FillPatternType,
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
  TileShapeType,
  TILE_SHAPES,
  optimizeLineOrderMultiPass,
} from '../src/utils/fillPatterns'

// Input data for a single path to fill
interface FillPathInput {
  id: string
  color: string
  polygons: PolygonWithHoles[]
}

// Output data for a filled path
interface FillPathOutput {
  pathId: string
  lines: HatchLine[]
  polygon: Point[]
}

// Fill generation parameters
interface FillGenerationParams {
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
  enableCrop: boolean
  cropInset: number
}

// Worker message types
type WorkerMessage =
  | { type: 'generate'; params: FillGenerationParams }
  | { type: 'optimize'; lines: HatchLine[] }
  | { type: 'abort' }

// Send progress update to main thread
function sendProgress(progress: number, status: string) {
  parentPort?.postMessage({ type: 'progress', progress, status })
}

// Generate fills for all paths
function generateFills(params: FillGenerationParams): { paths: FillPathOutput[]; success: boolean; error?: string } {
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
    enableCrop,
    cropInset,
  } = params

  try {
    // Calculate crop rectangle if enabled
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

    // Generate global patterns once for patterns that support it
    const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
    const globalCrossLines = crossHatch ? generateGlobalHatchLines(boundingBox, lineSpacing, angle + 90) : []

    // Global spiral
    let globalSpiralLines: HatchLine[] = []
    if (fillPattern === 'spiral' && singleSpiral) {
      const centerX = boundingBox.x + boundingBox.width / 2
      const centerY = boundingBox.y + boundingBox.height / 2
      const maxRadius = Math.sqrt(
        Math.pow(boundingBox.width / 2, 2) + Math.pow(boundingBox.height / 2, 2)
      ) * spiralOverDiameter
      globalSpiralLines = generateGlobalSpiralLines(centerX, centerY, maxRadius, lineSpacing, angle)
    }

    // Global Hilbert
    let globalHilbertLines: HatchLine[] = []
    if (fillPattern === 'hilbert' && singleHilbert) {
      globalHilbertLines = generateGlobalHilbertLines(boundingBox, lineSpacing)
    }

    // Global Fermat
    let globalFermatLines: HatchLine[] = []
    if (fillPattern === 'fermat' && singleFermat) {
      globalFermatLines = generateGlobalFermatLines(boundingBox, lineSpacing, angle, spiralOverDiameter)
    }

    const results: FillPathOutput[] = []
    const totalPaths = paths.length

    for (let i = 0; i < paths.length; i++) {
      // Report progress
      const progress = Math.round((i / totalPaths) * 100)
      sendProgress(progress, `Generating ${fillPattern} fill (${i + 1}/${totalPaths})`)

      const pathInput = paths[i]
      let allPolygons = pathInput.polygons

      // Apply crop if enabled
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
            lines = generateCustomTileLines(polygonData, lineSpacing, TILE_SHAPES[customTileShape], inset, angle)
            break
          case 'lines':
          default: {
            // Use pre-generated global lines and clip to this polygon
            const clippedLines = clipLinesToPolygon(globalLines, polygonData, inset)
            lines = cropRect ? clipLinesToRect(clippedLines, cropRect) : clippedLines
            if (crossHatch) {
              const clippedCrossLines = clipLinesToPolygon(globalCrossLines, polygonData, inset)
              const croppedCrossLines = cropRect ? clipLinesToRect(clippedCrossLines, cropRect) : clippedCrossLines
              lines = [...lines, ...croppedCrossLines]
            }
            break
          }
        }

        allLines = [...allLines, ...lines]
      }

      if (allLines.length > 0 && firstValidPolygon) {
        results.push({
          pathId: pathInput.id,
          lines: allLines,
          polygon: firstValidPolygon
        })
      }
    }

    sendProgress(100, 'Fill generation complete')
    return { paths: results, success: true }

  } catch (error) {
    console.error('[fillWorker] Error:', error)
    return {
      paths: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Optimize line order
function optimizeLines(lines: HatchLine[]): HatchLine[] {
  sendProgress(0, 'Optimizing line order...')
  const optimized = optimizeLineOrderMultiPass(lines)
  sendProgress(100, 'Optimization complete')
  return optimized
}

// Handle messages from main thread
parentPort?.on('message', (message: WorkerMessage) => {
  switch (message.type) {
    case 'generate': {
      const result = generateFills(message.params)
      parentPort?.postMessage({ type: 'result', data: result })
      break
    }
    case 'optimize': {
      const optimized = optimizeLines(message.lines)
      parentPort?.postMessage({ type: 'result', data: optimized })
      break
    }
    case 'abort': {
      // Worker will terminate - nothing to clean up
      process.exit(0)
    }
  }
})

// Signal ready
parentPort?.postMessage({ type: 'ready' })
