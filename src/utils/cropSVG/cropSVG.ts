// Main crop SVG function

import { Rect } from '../geometry'
import { analyzeSVGDimensions } from '../svgDimensions'
import { CropDimensions } from './types'
import { elementIntersectsCrop } from './elementIntersection'
import { clipElement } from './elementClipping'

/**
 * Crop an SVG string to a specified rectangle.
 * Preserves fill shapes by clipping polygons properly.
 */
export function cropSVGInBrowser(svgString: string, cropRect: Rect): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement

  // Parse viewBox and dimensions using proper utilities that handle all units
  const dimInfo = analyzeSVGDimensions(svg as unknown as SVGSVGElement)

  // Use computed dimensions (properly handles pt, cm, mm, etc.)
  const displayWidth = dimInfo.computedWidth || cropRect.width
  const displayHeight = dimInfo.computedHeight || cropRect.height

  // Get viewBox, falling back to computed dimensions
  const viewBox = dimInfo.viewBox || {
    minX: 0,
    minY: 0,
    width: displayWidth,
    height: displayHeight
  }

  // Transform crop rect from display coordinates to viewBox coordinates
  // With proper normalization, viewBox starts at (0,0) and path coords match
  const scaleX = viewBox.width / displayWidth
  const scaleY = viewBox.height / displayHeight

  const transformedCropRect: Rect = {
    x: viewBox.minX + cropRect.x * scaleX,
    y: viewBox.minY + cropRect.y * scaleY,
    width: cropRect.width * scaleX,
    height: cropRect.height * scaleY
  }

  const actualCropRect = transformedCropRect

  // Process all elements recursively
  const processElement = (elem: Element): void => {
    const tagName = elem.tagName.toLowerCase()

    // Skip non-graphical elements
    if (['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient'].includes(tagName)) {
      return
    }

    // For groups, process children
    if (tagName === 'g' || tagName === 'svg') {
      const children = Array.from(elem.children)
      for (const child of children) {
        processElement(child)
      }
      // Remove empty groups
      if (tagName === 'g' && elem.children.length === 0) {
        elem.parentNode?.removeChild(elem)
      }
      return
    }

    // Check if element intersects crop
    if (!elementIntersectsCrop(elem, actualCropRect)) {
      elem.parentNode?.removeChild(elem)
      return
    }

    // Clip element
    clipElement(elem, actualCropRect, doc)
  }

  // Process all children of svg
  const children = Array.from(svg.children)
  for (const child of children) {
    processElement(child)
  }

  // Update SVG dimensions - elements are already translated to origin by clipElement
  svg.setAttribute('width', String(actualCropRect.width))
  svg.setAttribute('height', String(actualCropRect.height))
  svg.setAttribute('viewBox', `0 0 ${actualCropRect.width} ${actualCropRect.height}`)

  // Serialize back to string
  const serializer = new XMLSerializer()
  return serializer.serializeToString(svg)
}

/**
 * Calculate crop dimensions based on aspect ratio and size percentage
 */
export function getCropDimensions(
  svgDimensions: { width: number; height: number } | null,
  cropAspectRatio: string,
  cropSize: number
): CropDimensions {
  if (!svgDimensions) return { width: 0, height: 0 }

  const [w, h] = cropAspectRatio.split(':').map(Number)
  const aspectRatio = w / h

  const minDimension = Math.min(svgDimensions.width, svgDimensions.height)
  const baseSize = minDimension * cropSize

  let width: number
  let height: number

  if (aspectRatio >= 1) {
    width = baseSize
    height = baseSize / aspectRatio
  } else {
    height = baseSize
    width = baseSize * aspectRatio
  }

  return { width, height }
}
