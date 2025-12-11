// Path Analysis module exports

// Re-export types
export type {
  SubpathInfo,
  PathDiagnostics,
  PathIssue,
} from './types'

// Re-export subpath parsing utilities
export {
  countSubpaths,
  parsePathIntoSubpaths,
  isSubpathClosed,
  separateSubpaths,
  extractPointsFromSubpath,
} from './subpathParsing'

// Re-export geometry calculations
export {
  getWindingDirection,
  calculateArea,
  getBoundingBox,
  reversePathWinding,
  pointsToPathD,
} from './geometryCalc'

// Re-export diagnostics
export {
  analyzePathD,
} from './diagnostics'
