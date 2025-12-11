// FillTab module exports

export { default } from './FillTab'

// Utilities
export { simplifyLines, unionPolygonsForFill, polygonWithHolesToClip, clipResultToPolygonWithHoles } from './fillUtils'
export type { FillPathInfo } from './fillUtils'
export { weaveLayerLines } from './weaveAlgorithm'
export type { WeavePattern } from './weaveAlgorithm'

// Types
export type { FillLayer, FillLayerListItem, ControlId } from './types'

// Hooks
export { useFillState, useFillPaths, useFillGeneration, useFillLayers } from './hooks'
export type { FillState, BoundingBox, HatchedPath } from './hooks'
