import { useCallback } from 'react'
import { HatchLine, PolygonWithHoles, Rect } from '../../utils/geometry'
import { FillPatternType } from '../../utils/fillPatterns'
import { PatternSettings } from './types'
import { PATTERN_TIMEOUT_MS } from './constants'

// Generate fills using rat-king via IPC (same as main app)
export function usePatternGenerator() {
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

  return { generatePatternFillAsync }
}
