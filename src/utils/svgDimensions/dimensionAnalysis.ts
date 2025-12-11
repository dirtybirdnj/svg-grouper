// SVG dimension analysis

import { SVGDimensionInfo, SVGDimensionIssue } from './types'
import { parseLengthWithUnit, lengthToPixels } from './unitConversion'
import { parseViewBox, hasNonZeroOrigin, hasNegativeCoordinates as checkNegativeCoords } from './viewBoxUtils'

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
  const widthPx = widthParsed ? lengthToPixels(widthParsed.value, widthParsed.unit) : null
  const heightPx = heightParsed ? lengthToPixels(heightParsed.value, heightParsed.unit) : null

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
  const needsTranslation = hasNonZeroOrigin(viewBox)
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
  const hasNegativeCoordinates = checkNegativeCoords(viewBox)

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
