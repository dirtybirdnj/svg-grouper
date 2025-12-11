import { HatchLine, PolygonWithHoles, Rect } from '../../utils/geometry'
import { FillPatternType } from '../../utils/fillPatterns'

export interface PatternResult {
  pattern: FillPatternType
  lines: HatchLine[]
  timeMs: number
  error?: string
}

export interface TortureTestResult {
  pattern: FillPatternType
  lines: number
  timeMs: number
  error?: string
  status: 'excellent' | 'acceptable' | 'slow' | 'failed'
}

export interface StressTestPath {
  id: string
  polygon: PolygonWithHoles
  bbox: Rect
  color: string
}

export interface PatternSettings {
  lineSpacing: number
  angle: number
  inset: number
  crossHatch: boolean
  wiggleAmplitude: number
  wiggleFrequency: number
  spiralOverDiameter: number
}

export interface PolygonStats {
  total: number
  filled: number
  empty: number
  tooSmall: number
}

export interface StressTestResultData {
  lines: HatchLine[]
  timeMs: number
  error?: string
  polygonStats: PolygonStats
}

export interface PatternTestProps {
  onBack: () => void
}
