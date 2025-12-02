/**
 * SVG Dimension Parsing Utilities
 *
 * Handles proper parsing of SVG dimensions including:
 * - Unit conversion (pt, px, in, cm, mm, em, etc.)
 * - ViewBox parsing and validation
 * - Aspect ratio detection and mismatch warnings
 * - Coordinate space normalization
 */

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

// Unit conversion factors to pixels (at 96 DPI)
const UNIT_TO_PX: Record<string, number> = {
  'px': 1,
  'pt': 96 / 72,        // 1pt = 1.333px
  'pc': 96 / 6,         // 1pc = 16px
  'in': 96,             // 1in = 96px
  'cm': 96 / 2.54,      // 1cm = 37.8px
  'mm': 96 / 25.4,      // 1mm = 3.78px
  'em': 16,             // Assume 16px base font
  'rem': 16,            // Assume 16px root font
  '%': 1,               // Percentage - context dependent
  '': 1,                // No unit = pixels
}

/**
 * Parse a CSS length value with unit
 * Returns { value, unit } or null if invalid
 */
export function parseLengthWithUnit(str: string | null): { value: number; unit: string } | null {
  if (!str) return null

  const trimmed = str.trim()
  if (!trimmed) return null

  // Match number (including scientific notation) followed by optional unit
  const match = trimmed.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*([a-z%]*)$/i)
  if (!match) return null

  const value = parseFloat(match[1])
  if (isNaN(value)) return null

  const unit = match[2].toLowerCase()

  return { value, unit }
}

/**
 * Convert a length value with unit to pixels
 */
export function lengthToPixels(value: number, unit: string): number {
  const factor = UNIT_TO_PX[unit.toLowerCase()]
  if (factor === undefined) {
    console.warn(`Unknown unit "${unit}", treating as pixels`)
    return value
  }
  return value * factor
}

/**
 * Parse viewBox attribute
 */
export function parseViewBox(viewBoxAttr: string | null): ViewBox | null {
  if (!viewBoxAttr) return null

  // ViewBox can be comma or space separated
  const parts = viewBoxAttr.trim().split(/[\s,]+/).map(parseFloat)

  if (parts.length !== 4 || parts.some(isNaN)) {
    return null
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3]
  }
}

/**
 * Analyze SVG dimensions from an SVG string or element
 */
export function analyzeSVGDimensions(svgInput: string | SVGSVGElement): SVGDimensionInfo {
  let svg: SVGSVGElement

  if (typeof svgInput === 'string') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgInput, 'image/svg+xml')
    const svgElement = doc.querySelector('svg')
    if (!svgElement) {
      throw new Error('No SVG element found in content')
    }
    svg = svgElement as SVGSVGElement
  } else {
    svg = svgInput
  }

  const issues: SVGDimensionIssue[] = []

  // Parse width and height attributes
  const widthAttr = svg.getAttribute('width')
  const heightAttr = svg.getAttribute('height')
  const viewBoxAttr = svg.getAttribute('viewBox')

  const widthParsed = parseLengthWithUnit(widthAttr)
  const heightParsed = parseLengthWithUnit(heightAttr)
  const viewBox = parseViewBox(viewBoxAttr)

  // Track raw values
  const width = widthParsed?.value ?? null
  const height = heightParsed?.value ?? null
  const widthUnit = widthParsed?.unit ?? null
  const heightUnit = heightParsed?.unit ?? null

  // Check for unit issues
  if (widthUnit && widthUnit !== 'px' && widthUnit !== '') {
    issues.push({
      type: 'warning',
      code: 'NON_PX_WIDTH',
      message: `Width uses "${widthUnit}" units`,
      details: `Original: ${widthAttr}, Converted: ${widthParsed ? lengthToPixels(widthParsed.value, widthParsed.unit).toFixed(2) : 'N/A'}px`
    })
  }

  if (heightUnit && heightUnit !== 'px' && heightUnit !== '') {
    issues.push({
      type: 'warning',
      code: 'NON_PX_HEIGHT',
      message: `Height uses "${heightUnit}" units`,
      details: `Original: ${heightAttr}, Converted: ${heightParsed ? lengthToPixels(heightParsed.value, heightParsed.unit).toFixed(2) : 'N/A'}px`
    })
  }

  // Convert to pixels
  let widthPx = widthParsed ? lengthToPixels(widthParsed.value, widthParsed.unit) : null
  let heightPx = heightParsed ? lengthToPixels(heightParsed.value, heightParsed.unit) : null

  // Calculate aspect ratios
  let dimensionAspectRatio: number | null = null
  let viewBoxAspectRatio: number | null = null

  if (widthPx && heightPx) {
    dimensionAspectRatio = widthPx / heightPx
  }

  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    viewBoxAspectRatio = viewBox.width / viewBox.height
  }

  // Check for aspect ratio mismatch
  if (dimensionAspectRatio !== null && viewBoxAspectRatio !== null) {
    const aspectDiff = Math.abs(dimensionAspectRatio - viewBoxAspectRatio)
    const aspectDiffPercent = (aspectDiff / viewBoxAspectRatio) * 100

    if (aspectDiffPercent > 1) {
      issues.push({
        type: 'error',
        code: 'ASPECT_RATIO_MISMATCH',
        message: `Aspect ratio mismatch: ${aspectDiffPercent.toFixed(1)}% difference`,
        details: `width/height: ${dimensionAspectRatio.toFixed(3)}, viewBox: ${viewBoxAspectRatio.toFixed(3)}. Content may appear stretched.`
      })
    }
  }

  // Determine computed dimensions
  // Priority: viewBox dimensions (most accurate for content), then converted width/height
  let computedWidth: number
  let computedHeight: number

  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    computedWidth = viewBox.width
    computedHeight = viewBox.height

    if (!widthPx || !heightPx) {
      issues.push({
        type: 'info',
        code: 'USING_VIEWBOX_DIMENSIONS',
        message: 'Using viewBox dimensions (no width/height specified)',
        details: `${viewBox.width.toFixed(2)} × ${viewBox.height.toFixed(2)}`
      })
    }
  } else if (widthPx && heightPx) {
    computedWidth = widthPx
    computedHeight = heightPx

    issues.push({
      type: 'warning',
      code: 'NO_VIEWBOX',
      message: 'No viewBox attribute found',
      details: 'Using width/height attributes for dimensions'
    })
  } else {
    // No dimensions at all - this is a problem
    computedWidth = 300  // SVG default
    computedHeight = 150 // SVG default

    issues.push({
      type: 'error',
      code: 'NO_DIMENSIONS',
      message: 'No dimensions found (no width, height, or viewBox)',
      details: 'Using SVG default: 300 × 150'
    })
  }

  // Check for non-zero viewBox origin
  const needsTranslation = viewBox !== null && (viewBox.minX !== 0 || viewBox.minY !== 0)
  const translateX = viewBox?.minX ?? 0
  const translateY = viewBox?.minY ?? 0

  if (needsTranslation) {
    issues.push({
      type: 'info',
      code: 'NON_ZERO_ORIGIN',
      message: `ViewBox origin at (${translateX.toFixed(2)}, ${translateY.toFixed(2)})`,
      details: 'Content coordinates are offset from (0, 0)'
    })
  }

  // Check for negative coordinates
  const hasNegativeCoordinates = viewBox !== null && viewBox.minY < 0

  if (hasNegativeCoordinates) {
    issues.push({
      type: 'warning',
      code: 'NEGATIVE_COORDINATES',
      message: 'SVG uses negative Y coordinates',
      details: `Y range: ${viewBox!.minY.toFixed(2)} to ${(viewBox!.minY + viewBox!.height).toFixed(2)}`
    })
  }

  // Calculate recommended dimensions (use viewBox if available, else computed)
  const recommendedWidth = viewBox?.width ?? computedWidth
  const recommendedHeight = viewBox?.height ?? computedHeight

  return {
    width,
    height,
    widthUnit,
    heightUnit,
    viewBox,
    computedWidth,
    computedHeight,
    dimensionAspectRatio,
    viewBoxAspectRatio,
    issues,
    recommendedWidth,
    recommendedHeight,
    needsTranslation,
    translateX,
    translateY,
    hasNegativeCoordinates
  }
}

/**
 * Standard paper sizes in inches
 */
export const PAPER_SIZES: Record<string, { width: number; height: number; label: string }> = {
  'letter': { width: 8.5, height: 11, label: 'Letter (8.5" × 11")' },
  'legal': { width: 8.5, height: 14, label: 'Legal (8.5" × 14")' },
  'tabloid': { width: 11, height: 17, label: 'Tabloid (11" × 17")' },
  'a4': { width: 8.27, height: 11.69, label: 'A4 (210mm × 297mm)' },
  'a3': { width: 11.69, height: 16.54, label: 'A3 (297mm × 420mm)' },
  'a2': { width: 16.54, height: 23.39, label: 'A2 (420mm × 594mm)' },
  'a1': { width: 23.39, height: 33.11, label: 'A1 (594mm × 841mm)' },
  'a0': { width: 33.11, height: 46.81, label: 'A0 (841mm × 1189mm)' },
  'custom': { width: 0, height: 0, label: 'Custom' },
}

/**
 * Common DPI values
 */
export const DPI_OPTIONS = [
  { value: 72, label: '72 DPI (Screen)' },
  { value: 96, label: '96 DPI (Web Standard)' },
  { value: 150, label: '150 DPI (Draft Print)' },
  { value: 300, label: '300 DPI (Print Quality)' },
  { value: 600, label: '600 DPI (High Quality)' },
]

/**
 * Calculate the pixel dimensions for a given paper size and DPI
 */
export function paperSizeToPixels(
  paperKey: string,
  dpi: number,
  orientation: 'portrait' | 'landscape' = 'portrait',
  customWidth?: number,
  customHeight?: number
): { width: number; height: number } {
  let widthInches: number
  let heightInches: number

  if (paperKey === 'custom') {
    widthInches = customWidth ?? 8.5
    heightInches = customHeight ?? 11
  } else {
    const paper = PAPER_SIZES[paperKey]
    if (!paper) {
      widthInches = 8.5
      heightInches = 11
    } else {
      widthInches = paper.width
      heightInches = paper.height
    }
  }

  // Swap for landscape
  if (orientation === 'landscape') {
    [widthInches, heightInches] = [heightInches, widthInches]
  }

  return {
    width: Math.round(widthInches * dpi),
    height: Math.round(heightInches * dpi)
  }
}

/**
 * Transform a path's d attribute by applying an offset
 */
function transformPathD(d: string, offsetX: number, offsetY: number): string {
  // Match commands and their parameters
  // This regex captures the command letter and all following numbers
  const result: string[] = []
  const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || []

  for (const cmd of commands) {
    const type = cmd[0]
    const isRelative = type === type.toLowerCase()
    const upperType = type.toUpperCase()

    // For relative commands, don't transform (they're relative to current point)
    if (isRelative && upperType !== 'M') {
      result.push(cmd)
      continue
    }

    const values = cmd.slice(1).trim()
    if (!values) {
      result.push(cmd)
      continue
    }

    // Parse numbers (handles negative numbers and decimals)
    const nums = values.match(/-?[\d.]+(?:e[+-]?\d+)?/gi)?.map(parseFloat) || []

    let transformed: number[] = []

    switch (upperType) {
      case 'M': // moveto: x,y pairs
      case 'L': // lineto: x,y pairs
      case 'T': // smooth quadratic: x,y pairs
        for (let i = 0; i < nums.length; i += 2) {
          transformed.push(nums[i] + offsetX, nums[i + 1] + offsetY)
        }
        break

      case 'H': // horizontal line: x values only
        for (const n of nums) {
          transformed.push(n + offsetX)
        }
        break

      case 'V': // vertical line: y values only
        for (const n of nums) {
          transformed.push(n + offsetY)
        }
        break

      case 'C': // cubic bezier: x1,y1,x2,y2,x,y
        for (let i = 0; i < nums.length; i += 6) {
          transformed.push(
            nums[i] + offsetX, nums[i + 1] + offsetY,
            nums[i + 2] + offsetX, nums[i + 3] + offsetY,
            nums[i + 4] + offsetX, nums[i + 5] + offsetY
          )
        }
        break

      case 'S': // smooth cubic: x2,y2,x,y
      case 'Q': // quadratic: x1,y1,x,y
        for (let i = 0; i < nums.length; i += 4) {
          transformed.push(
            nums[i] + offsetX, nums[i + 1] + offsetY,
            nums[i + 2] + offsetX, nums[i + 3] + offsetY
          )
        }
        break

      case 'A': // arc: rx,ry,rotation,large-arc,sweep,x,y
        for (let i = 0; i < nums.length; i += 7) {
          transformed.push(
            nums[i], nums[i + 1], nums[i + 2], nums[i + 3], nums[i + 4],
            nums[i + 5] + offsetX, nums[i + 6] + offsetY
          )
        }
        break

      case 'Z': // closepath: no parameters
        result.push(type)
        continue

      default:
        result.push(cmd)
        continue
    }

    result.push(type + transformed.map(n => n.toFixed(6)).join(' '))
  }

  return result.join(' ')
}

/**
 * Transform points attribute (for polygon/polyline) by applying an offset
 */
function transformPoints(points: string, offsetX: number, offsetY: number): string {
  const nums = points.trim().split(/[\s,]+/).map(parseFloat)
  const transformed: number[] = []

  for (let i = 0; i < nums.length; i += 2) {
    if (!isNaN(nums[i]) && !isNaN(nums[i + 1])) {
      transformed.push(nums[i] + offsetX, nums[i + 1] + offsetY)
    }
  }

  return transformed.map(n => n.toFixed(6)).join(' ')
}

/**
 * Normalize an SVG to have a viewBox starting at (0, 0) with positive coordinates
 * by transforming actual element coordinates (not using a wrapper transform)
 */
export function normalizeSVG(svgContent: string, targetDimensions?: { width: number; height: number }): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgContent, 'image/svg+xml')
  const svg = doc.querySelector('svg')

  if (!svg) return svgContent

  const info = analyzeSVGDimensions(svg)

  console.log('[normalizeSVG Debug] Input viewBox:', info.viewBox)
  console.log('[normalizeSVG Debug] Needs transform:', info.viewBox && (info.viewBox.minX !== 0 || info.viewBox.minY !== 0))

  // Use target dimensions or recommended dimensions
  const newWidth = targetDimensions?.width ?? info.recommendedWidth
  const newHeight = targetDimensions?.height ?? info.recommendedHeight

  // Update width/height attributes (unitless = pixels)
  svg.setAttribute('width', String(newWidth))
  svg.setAttribute('height', String(newHeight))

  // Normalize the viewBox to start at (0, 0) by transforming actual coordinates
  if (info.viewBox && (info.viewBox.minX !== 0 || info.viewBox.minY !== 0)) {
    const offsetX = -info.viewBox.minX
    const offsetY = -info.viewBox.minY

    console.log('[normalizeSVG Debug] Baking transform into coordinates:', { offsetX, offsetY })

    // Transform all path elements
    const paths = svg.querySelectorAll('path')
    console.log('[normalizeSVG Debug] Transforming', paths.length, 'paths')
    for (const path of paths) {
      const d = path.getAttribute('d')
      if (d) {
        path.setAttribute('d', transformPathD(d, offsetX, offsetY))
      }
    }

    // Transform polygon/polyline elements
    const polys = svg.querySelectorAll('polygon, polyline')
    for (const poly of polys) {
      const points = poly.getAttribute('points')
      if (points) {
        poly.setAttribute('points', transformPoints(points, offsetX, offsetY))
      }
    }

    // Transform rect elements
    const rects = svg.querySelectorAll('rect')
    for (const rect of rects) {
      const x = parseFloat(rect.getAttribute('x') || '0')
      const y = parseFloat(rect.getAttribute('y') || '0')
      rect.setAttribute('x', String(x + offsetX))
      rect.setAttribute('y', String(y + offsetY))
    }

    // Transform circle elements
    const circles = svg.querySelectorAll('circle')
    for (const circle of circles) {
      const cx = parseFloat(circle.getAttribute('cx') || '0')
      const cy = parseFloat(circle.getAttribute('cy') || '0')
      circle.setAttribute('cx', String(cx + offsetX))
      circle.setAttribute('cy', String(cy + offsetY))
    }

    // Transform ellipse elements
    const ellipses = svg.querySelectorAll('ellipse')
    for (const ellipse of ellipses) {
      const cx = parseFloat(ellipse.getAttribute('cx') || '0')
      const cy = parseFloat(ellipse.getAttribute('cy') || '0')
      ellipse.setAttribute('cx', String(cx + offsetX))
      ellipse.setAttribute('cy', String(cy + offsetY))
    }

    // Transform line elements
    const lines = svg.querySelectorAll('line')
    for (const line of lines) {
      const x1 = parseFloat(line.getAttribute('x1') || '0')
      const y1 = parseFloat(line.getAttribute('y1') || '0')
      const x2 = parseFloat(line.getAttribute('x2') || '0')
      const y2 = parseFloat(line.getAttribute('y2') || '0')
      line.setAttribute('x1', String(x1 + offsetX))
      line.setAttribute('y1', String(y1 + offsetY))
      line.setAttribute('x2', String(x2 + offsetX))
      line.setAttribute('y2', String(y2 + offsetY))
    }

    // Update viewBox to start at (0, 0)
    svg.setAttribute('viewBox', `0 0 ${info.viewBox.width} ${info.viewBox.height}`)
    console.log('[normalizeSVG Debug] Transformation complete')
  } else if (info.viewBox) {
    // ViewBox already starts at (0, 0), just ensure it's set
    console.log('[normalizeSVG Debug] ViewBox already at origin, no transform needed')
    svg.setAttribute('viewBox', `0 0 ${info.viewBox.width} ${info.viewBox.height}`)
  } else {
    // Add a viewBox if missing
    console.log('[normalizeSVG Debug] No viewBox, creating one')
    svg.setAttribute('viewBox', `0 0 ${newWidth} ${newHeight}`)
  }

  // Ensure preserveAspectRatio is set correctly
  if (!svg.hasAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }

  const serializer = new XMLSerializer()
  return serializer.serializeToString(svg)
}
