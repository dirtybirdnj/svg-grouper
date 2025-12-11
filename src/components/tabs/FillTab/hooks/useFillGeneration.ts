import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  SubpathMode,
  getAllPolygonsFromElement,
  parsePathIntoSubpaths,
} from '../../../../utils/geometry'
import { FillPatternType, TileShapeType } from '../../../../utils/fillPatterns'
import { FillPathInfo, simplifyLines, unionPolygonsForFill } from '../fillUtils'
import { BoundingBox } from './useFillPaths'

interface UseFillGenerationProps {
  showHatchPreview: boolean
  activeFillPaths: FillPathInfo[]
  preservedFillData: { pathInfo: FillPathInfo; polygon: PolygonWithHoles }[] | null
  boundingBox: BoundingBox
  // Pattern settings
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
  subpathMode: SubpathMode
  enableCrop: boolean
  cropInset: number
  useEvenOdd: boolean
  mergeBeforeFill: boolean
  simplifyTolerance: number
  // Callbacks
  setIsProcessing: (processing: boolean) => void
}

export interface HatchedPath {
  pathInfo: FillPathInfo
  lines: HatchLine[]
  polygon: Point[]
}

/**
 * Hook that handles fill generation using the rat-king backend via IPC.
 */
export function useFillGeneration({
  showHatchPreview,
  activeFillPaths,
  preservedFillData,
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
  subpathMode,
  enableCrop,
  cropInset,
  useEvenOdd,
  mergeBeforeFill,
  simplifyTolerance,
  setIsProcessing,
}: UseFillGenerationProps) {
  const [hatchedPaths, setHatchedPaths] = useState<HatchedPath[]>([])
  const [, setIsGeneratingHatch] = useState(false)
  const [fillProgress, setFillProgress] = useState(0)
  const hatchAbortRef = useRef<{ aborted: boolean }>({ aborted: false })

  // Listen for progress updates from backend
  useEffect(() => {
    if (!window.electron?.onFillProgress) return

    const handleProgress = (data: { progress: number; status: string }) => {
      setFillProgress(data.progress)
    }

    window.electron.onFillProgress(handleProgress)

    return () => {
      window.electron?.offFillProgress?.()
    }
  }, [])

  // Generate fills using backend IPC
  useEffect(() => {
    // Abort any in-progress generation
    hatchAbortRef.current.aborted = true

    const pathsToProcess = activeFillPaths
    if (!showHatchPreview || pathsToProcess.length === 0 || !boundingBox) {
      setHatchedPaths([])
      return
    }

    // Create new abort controller for this generation
    const abortController = { aborted: false }
    hatchAbortRef.current = abortController

    // Debounce fill generation
    const DEBOUNCE_MS = 50
    const debounceTimer = setTimeout(async () => {
      if (abortController.aborted) return

      setIsGeneratingHatch(true)
      setIsProcessing(true)
      setFillProgress(0)

      try {
        // Step 1: Extract polygon data from DOM elements
        const pathInputs: Array<{
          id: string
          color: string
          polygons: PolygonWithHoles[]
          rawSubpaths?: Point[][]
        }> = []

        // Build lookup map for preserved data
        const preservedDataMap = new Map<string, PolygonWithHoles>()
        if (preservedFillData) {
          for (const p of preservedFillData) {
            if (p.polygon) {
              preservedDataMap.set(p.pathInfo.id, p.polygon as PolygonWithHoles)
            }
          }
        }

        // Extract polygons with yielding to prevent blocking
        const BATCH_SIZE = 20
        for (let i = 0; i < pathsToProcess.length; i++) {
          if (abortController.aborted) return

          const path = pathsToProcess[i]
          let polygons: PolygonWithHoles[]
          let rawSubpaths: Point[][] | undefined

          const preserved = preservedDataMap.get(path.id)
          if (preserved && subpathMode === 'default') {
            polygons = [preserved]
          } else {
            polygons = getAllPolygonsFromElement(path.element, subpathMode)
          }

          // For evenodd mode, also extract raw subpaths
          if (useEvenOdd && path.type === 'path') {
            const d = path.element.getAttribute('d') || ''
            rawSubpaths = parsePathIntoSubpaths(d)
          }

          pathInputs.push({
            id: path.id,
            color: path.color,
            polygons,
            rawSubpaths
          })

          // Yield periodically
          if (i > 0 && i % BATCH_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }

        // Merge shapes if enabled
        let finalPathInputs = pathInputs
        if (mergeBeforeFill && pathInputs.length > 1) {
          const allPolygons: PolygonWithHoles[] = []
          for (const input of pathInputs) {
            allPolygons.push(...input.polygons)
          }

          const mergedPolygons = unionPolygonsForFill(allPolygons)
          const firstPath = pathInputs[0]
          finalPathInputs = [{
            id: 'merged-fill',
            color: firstPath.color,
            polygons: mergedPolygons,
            rawSubpaths: undefined
          }]

          console.log(`[FillTab] Merged ${allPolygons.length} polygons into ${mergedPolygons.length} compound shapes`)
        }

        // Step 2: Call backend IPC
        if (window.electron?.generateFills) {
          const result = await window.electron.generateFills({
            paths: finalPathInputs,
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
            useEvenOdd
          })

          if (abortController.aborted) return

          if (result.success) {
            const pathsMap = new Map<string, FillPathInfo>()
            for (const p of pathsToProcess) {
              pathsMap.set(p.id, p)
            }

            const results: HatchedPath[] = []
            for (const pathResult of result.paths) {
              const originalPath = pathsMap.get(pathResult.pathId)
              if (originalPath) {
                results.push({
                  pathInfo: originalPath,
                  lines: pathResult.lines,
                  polygon: pathResult.polygon
                })
              }
            }

            setHatchedPaths(results)
          } else {
            console.error('Fill generation failed:', result.error)
            setHatchedPaths([])
          }
        } else {
          console.error('Fill generation requires Electron/rat-king')
          setHatchedPaths([])
        }
      } catch (err) {
        console.error('Fill generation error:', err)
        setHatchedPaths([])
      } finally {
        if (!abortController.aborted) {
          setFillProgress(100)
          setIsGeneratingHatch(false)
          setIsProcessing(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(debounceTimer)
      abortController.aborted = true
      setIsProcessing(false)
    }
  }, [
    showHatchPreview, activeFillPaths, preservedFillData, boundingBox,
    lineSpacing, angle, crossHatch, inset, fillPattern,
    wiggleAmplitude, wiggleFrequency, spiralOverDiameter,
    singleSpiral, singleHilbert, singleFermat,
    customTileShape, customTileGap, customTileScale, customTileRotateOffset,
    subpathMode, enableCrop, cropInset, useEvenOdd, mergeBeforeFill,
    setIsProcessing
  ])

  // Apply simplification to hatched paths
  const simplifiedHatchedPaths = useMemo(() => {
    if (simplifyTolerance <= 0 || hatchedPaths.length === 0) {
      return hatchedPaths
    }

    return hatchedPaths.map(({ pathInfo, lines, polygon }) => ({
      pathInfo,
      polygon,
      lines: simplifyLines(lines, simplifyTolerance)
    }))
  }, [hatchedPaths, simplifyTolerance])

  return {
    hatchedPaths,
    simplifiedHatchedPaths,
    fillProgress,
  }
}
