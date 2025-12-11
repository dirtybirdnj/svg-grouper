// Page layout calculation hook

import { useMemo } from 'react'
import { MM_TO_PX } from '../../../constants'
import { PaperSize, PageDimensions, PageLayout, Margins } from './types'

interface UsePageLayoutProps {
  paperSizes: PaperSize[]
  paperSize: string
  orientation: 'portrait' | 'landscape'
  margins: Margins
  scaleToFit: boolean
  centerContent: boolean
  designInset: number
  svgDimensions: { width: number; height: number } | null
}

interface UsePageLayoutResult {
  pageDimensions: PageDimensions | null
  pageLayout: PageLayout | null
}

/**
 * Hook to calculate page dimensions and layout for export
 */
export function usePageLayout({
  paperSizes,
  paperSize,
  orientation,
  margins,
  scaleToFit,
  centerContent,
  designInset,
  svgDimensions,
}: UsePageLayoutProps): UsePageLayoutResult {
  // Calculate page dimensions based on paper size and orientation
  const pageDimensions = useMemo((): PageDimensions | null => {
    const size = paperSizes.find(s => s.id === paperSize)
    if (!size) return null

    const width = orientation === 'portrait' ? size.width : size.height
    const height = orientation === 'portrait' ? size.height : size.width

    return {
      width,
      height,
      widthPx: width * MM_TO_PX,
      heightPx: height * MM_TO_PX,
    }
  }, [paperSize, orientation, paperSizes])

  // Calculate printable area and content transform
  const pageLayout = useMemo((): PageLayout | null => {
    if (!pageDimensions || !svgDimensions) return null

    const printableWidth = pageDimensions.width - margins.left - margins.right
    const printableHeight = pageDimensions.height - margins.top - margins.bottom

    if (printableWidth <= 0 || printableHeight <= 0) return null

    // Apply design inset - crops into the design from each edge
    const insetPx = designInset * MM_TO_PX
    const croppedWidth = Math.max(1, svgDimensions.width - insetPx * 2)
    const croppedHeight = Math.max(1, svgDimensions.height - insetPx * 2)
    const croppedWidthMm = croppedWidth / MM_TO_PX
    const croppedHeightMm = croppedHeight / MM_TO_PX

    // Calculate scale to fit cropped content in printable area
    let scale = 1
    if (scaleToFit) {
      const scaleX = printableWidth / croppedWidthMm
      const scaleY = printableHeight / croppedHeightMm
      scale = Math.min(scaleX, scaleY)
    }

    const scaledWidth = croppedWidthMm * scale
    const scaledHeight = croppedHeightMm * scale

    // Calculate offset to center content in printable area
    let offsetX = margins.left
    let offsetY = margins.top

    if (centerContent) {
      offsetX = margins.left + (printableWidth - scaledWidth) / 2
      offsetY = margins.top + (printableHeight - scaledHeight) / 2
    }

    return {
      printableWidth,
      printableHeight,
      scale,
      scaledWidth,
      scaledHeight,
      offsetX,
      offsetY,
      insetPx,
      croppedWidthMm,
      croppedHeightMm,
    }
  }, [pageDimensions, svgDimensions, margins, scaleToFit, centerContent, designInset])

  return { pageDimensions, pageLayout }
}
