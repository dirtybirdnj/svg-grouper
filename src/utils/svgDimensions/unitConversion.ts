// Unit conversion utilities

import { PaperSize, DPIOption } from './types'

// Unit conversion factors to pixels (at 96 DPI)
export const UNIT_TO_PX: Record<string, number> = {
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
 * Standard paper sizes in inches
 */
export const PAPER_SIZES: Record<string, PaperSize> = {
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
export const DPI_OPTIONS: DPIOption[] = [
  { value: 72, label: '72 DPI (Screen)' },
  { value: 96, label: '96 DPI (Web Standard)' },
  { value: 150, label: '150 DPI (Draft Print)' },
  { value: 300, label: '300 DPI (Print Quality)' },
  { value: 600, label: '600 DPI (High Quality)' },
]

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
