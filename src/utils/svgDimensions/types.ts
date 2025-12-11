// SVG dimension types and interfaces

export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export interface SVGDimensionInfo {
  // Raw parsed values
  width: number | null
  height: number | null
  widthUnit: string | null
  heightUnit: string | null
  viewBox: ViewBox | null

  // Computed values (in pixels, 96 DPI standard)
  computedWidth: number
  computedHeight: number

  // Aspect ratios
  dimensionAspectRatio: number | null  // from width/height attributes
  viewBoxAspectRatio: number | null    // from viewBox

  // Issues detected
  issues: SVGDimensionIssue[]

  // Recommendations
  recommendedWidth: number
  recommendedHeight: number

  // Whether coordinates need translation (non-zero viewBox origin)
  needsTranslation: boolean
  translateX: number
  translateY: number

  // Whether the SVG uses negative coordinates
  hasNegativeCoordinates: boolean
}

export interface SVGDimensionIssue {
  type: 'error' | 'warning' | 'info'
  code: string
  message: string
  details?: string
}

export interface PaperSize {
  width: number
  height: number
  label: string
}

export interface DPIOption {
  value: number
  label: string
}
