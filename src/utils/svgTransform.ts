/**
 * SVG Transform Utilities
 *
 * Functions for scaling and transforming SVG artwork while preserving structure.
 */

// Conversion constants (SVG uses pixels at 96 DPI)
const MM_PER_INCH = 25.4
const PX_PER_INCH = 96
const PX_PER_MM = PX_PER_INCH / MM_PER_INCH

export type Unit = 'mm' | 'in' | 'px'

/**
 * Get the dimensions of an SVG element in pixels
 */
export function getSvgDimensions(svgElement: SVGSVGElement): { width: number; height: number } {
  // Try viewBox first
  const viewBox = svgElement.viewBox.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height }
  }

  // Fall back to width/height attributes
  const width = svgElement.width.baseVal.value || parseFloat(svgElement.getAttribute('width') || '0')
  const height = svgElement.height.baseVal.value || parseFloat(svgElement.getAttribute('height') || '0')

  if (width > 0 && height > 0) {
    return { width, height }
  }

  // Last resort: use getBBox
  try {
    const bbox = svgElement.getBBox()
    return { width: bbox.width, height: bbox.height }
  } catch {
    return { width: 100, height: 100 }
  }
}

/**
 * Convert pixels to a specific unit
 */
export function pxToUnit(px: number, unit: Unit): number {
  switch (unit) {
    case 'mm':
      return px / PX_PER_MM
    case 'in':
      return px / PX_PER_INCH
    case 'px':
    default:
      return px
  }
}

/**
 * Convert a unit value to pixels
 */
export function unitToPx(value: number, unit: Unit): number {
  switch (unit) {
    case 'mm':
      return value * PX_PER_MM
    case 'in':
      return value * PX_PER_INCH
    case 'px':
    default:
      return value
  }
}

/**
 * Get artwork dimensions in a specific unit
 */
export function getArtworkDimensions(
  svgElement: SVGSVGElement,
  unit: Unit
): { width: number; height: number; unit: Unit } {
  const dims = getSvgDimensions(svgElement)
  return {
    width: pxToUnit(dims.width, unit),
    height: pxToUnit(dims.height, unit),
    unit,
  }
}

/**
 * Scale SVG artwork by a factor.
 * This modifies the viewBox to effectively scale the content.
 *
 * @param svgElement The SVG element to scale (modified in place)
 * @param factor Scale factor (e.g., 2 doubles size, 0.5 halves it)
 */
export function scaleArtwork(svgElement: SVGSVGElement, factor: number): void {
  if (factor <= 0 || factor === 1) return

  const viewBox = svgElement.viewBox.baseVal
  const currentWidth = viewBox.width || parseFloat(svgElement.getAttribute('width') || '100')
  const currentHeight = viewBox.height || parseFloat(svgElement.getAttribute('height') || '100')

  // To scale up the output, we make the viewBox larger
  // (more SVG units map to the same output size)
  // Actually, to make the artwork BIGGER in output, we make viewBox SMALLER
  // Think of it like zooming in
  const newViewBoxWidth = currentWidth / factor
  const newViewBoxHeight = currentHeight / factor

  // Update viewBox
  const x = viewBox.x || 0
  const y = viewBox.y || 0
  svgElement.setAttribute('viewBox', `${x} ${y} ${newViewBoxWidth} ${newViewBoxHeight}`)

  // Update width/height attributes if present
  const widthAttr = svgElement.getAttribute('width')
  const heightAttr = svgElement.getAttribute('height')

  if (widthAttr) {
    const widthValue = parseFloat(widthAttr)
    if (!isNaN(widthValue)) {
      // Check if it has a unit suffix
      const unit = widthAttr.replace(/[\d.]/g, '').trim() || ''
      svgElement.setAttribute('width', `${(widthValue * factor).toFixed(2)}${unit}`)
    }
  }

  if (heightAttr) {
    const heightValue = parseFloat(heightAttr)
    if (!isNaN(heightValue)) {
      const unit = heightAttr.replace(/[\d.]/g, '').trim() || ''
      svgElement.setAttribute('height', `${(heightValue * factor).toFixed(2)}${unit}`)
    }
  }
}

/**
 * Scale SVG to a target size in specified units.
 *
 * @param svgElement The SVG element to scale (modified in place)
 * @param targetWidth Target width in the specified unit
 * @param targetHeight Target height in the specified unit (optional, maintains aspect if omitted)
 * @param unit The unit for the target dimensions
 */
export function scaleToSize(
  svgElement: SVGSVGElement,
  targetWidth: number,
  targetHeight?: number,
  unit: Unit = 'mm'
): void {
  const currentDims = getSvgDimensions(svgElement)

  // Convert target to pixels
  const targetWidthPx = unitToPx(targetWidth, unit)
  const targetHeightPx = targetHeight ? unitToPx(targetHeight, unit) : undefined

  // Calculate scale factors
  const widthFactor = targetWidthPx / currentDims.width
  const heightFactor = targetHeightPx ? targetHeightPx / currentDims.height : widthFactor

  // Use uniform scaling (based on width) to maintain aspect ratio
  const factor = targetHeightPx ? Math.min(widthFactor, heightFactor) : widthFactor

  scaleArtwork(svgElement, factor)
}

/**
 * Transform all coordinates in path data by a scale factor.
 * This is a more thorough scaling that modifies actual path coordinates.
 *
 * @param pathD The path d attribute
 * @param factor Scale factor
 * @returns Scaled path d attribute
 */
export function scalePathData(pathD: string, factor: number): string {
  if (factor === 1) return pathD

  // Match numbers (including decimals and scientific notation)
  return pathD.replace(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi, (match) => {
    const num = parseFloat(match)
    return (num * factor).toFixed(2)
  })
}

/**
 * Apply a uniform scale transform to all direct children of an SVG.
 * This wraps content in a group with a transform.
 *
 * @param svgElement The SVG element to transform (modified in place)
 * @param factor Scale factor
 */
export function applyScaleTransform(svgElement: SVGSVGElement, factor: number): void {
  if (factor === 1) return

  // Create a wrapper group with the transform
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  wrapper.setAttribute('transform', `scale(${factor})`)

  // Move all children into the wrapper
  while (svgElement.firstChild) {
    wrapper.appendChild(svgElement.firstChild)
  }

  svgElement.appendChild(wrapper)

  // Update viewBox to maintain visual size
  const viewBox = svgElement.viewBox.baseVal
  if (viewBox.width > 0) {
    svgElement.setAttribute(
      'viewBox',
      `${viewBox.x} ${viewBox.y} ${viewBox.width * factor} ${viewBox.height * factor}`
    )
  }
}

/**
 * Common plotter dimensions for reference
 */
export const PLOTTER_SIZES = {
  axidrawMini: { width: 152, height: 101, unit: 'mm' as Unit },
  axidrawA4: { width: 297, height: 218, unit: 'mm' as Unit },
  axidrawA3: { width: 430, height: 297, unit: 'mm' as Unit },
  letterPortrait: { width: 8.5, height: 11, unit: 'in' as Unit },
  letterLandscape: { width: 11, height: 8.5, unit: 'in' as Unit },
  a4Portrait: { width: 210, height: 297, unit: 'mm' as Unit },
  a4Landscape: { width: 297, height: 210, unit: 'mm' as Unit },
}

/**
 * Check if artwork fits within plotter dimensions
 */
export function checkFitsPlotter(
  svgElement: SVGSVGElement,
  plotter: keyof typeof PLOTTER_SIZES
): { fits: boolean; widthRatio: number; heightRatio: number } {
  const plotterDims = PLOTTER_SIZES[plotter]
  const artworkDims = getArtworkDimensions(svgElement, plotterDims.unit)

  const widthRatio = artworkDims.width / plotterDims.width
  const heightRatio = artworkDims.height / plotterDims.height

  return {
    fits: widthRatio <= 1 && heightRatio <= 1,
    widthRatio,
    heightRatio,
  }
}
