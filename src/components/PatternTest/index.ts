// PatternTest module exports

// Main component
export { default as PatternTest } from './PatternTest'
export { default } from './PatternTest'

// Sub-components
export { SliderInput } from './SliderInput'
export { PatternGrid } from './PatternGrid'
export { TortureTestReport } from './TortureTestReport'
export { StressTestViewport } from './StressTestViewport'

// Hooks
export { usePatternGenerator } from './usePatternGenerator'

// Constants
export {
  ALL_PATTERNS,
  PERF_THRESHOLDS,
  SQUARE_SIZE,
  PATTERN_TIMEOUT_MS,
  createSquarePolygon,
  createComplexTestPolygon,
} from './constants'

// Types
export type {
  PatternResult,
  TortureTestResult,
  StressTestPath,
  PatternSettings,
  PolygonStats,
  StressTestResultData,
  PatternTestProps,
} from './types'
