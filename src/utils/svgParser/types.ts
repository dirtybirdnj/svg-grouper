// SVG Parser types

/**
 * Progress callback for progressive parsing
 */
export type ProgressCallback = (progress: number, status: string) => void

/**
 * Leaf element tags (non-group drawable elements)
 */
export const LEAF_TAGS = [
  'path', 'rect', 'circle', 'ellipse', 'line',
  'polyline', 'polygon', 'text', 'image', 'use'
] as const

export type LeafTag = typeof LEAF_TAGS[number]

/**
 * Tags that should be included when parsing (groups + leaf elements)
 */
export const INCLUDED_TAGS = ['g', ...LEAF_TAGS] as const

export type IncludedTag = typeof INCLUDED_TAGS[number]
