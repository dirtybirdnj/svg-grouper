// SVG normalization utilities

import { analyzeSVGDimensions } from './dimensionAnalysis'
import { transformAllElements } from './elementTransforms'

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

    // Transform all elements
    transformAllElements(svg, offsetX, offsetY)

    // Update viewBox to start at (0, 0)
    svg.setAttribute('viewBox', `0 0 ${info.viewBox.width} ${info.viewBox.height}`)
  } else if (info.viewBox) {
    // ViewBox already starts at (0, 0), just ensure it's set
    svg.setAttribute('viewBox', `0 0 ${info.viewBox.width} ${info.viewBox.height}`)
  } else {
    // Add a viewBox if missing
    svg.setAttribute('viewBox', `0 0 ${newWidth} ${newHeight}`)
  }

  // Ensure preserveAspectRatio is set correctly
  if (!svg.hasAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }

  const serializer = new XMLSerializer()
  return serializer.serializeToString(svg)
}
