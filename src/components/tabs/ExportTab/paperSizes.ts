// Paper size utilities

import { PaperSize } from './types'
import defaultPaperSizes from '../../../config/paperSizes.json'

const PAPER_SIZES_STORAGE_KEY = 'svg-grouper-paper-sizes'

/**
 * Load paper sizes from localStorage or use defaults
 */
export function loadPaperSizes(): PaperSize[] {
  try {
    const stored = localStorage.getItem(PAPER_SIZES_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (e) {
    console.error('Failed to load paper sizes from localStorage:', e)
  }
  return defaultPaperSizes.paperSizes as PaperSize[]
}

/**
 * Save paper sizes to localStorage
 */
export function savePaperSizes(sizes: PaperSize[]): void {
  try {
    localStorage.setItem(PAPER_SIZES_STORAGE_KEY, JSON.stringify(sizes))
  } catch (e) {
    console.error('Failed to save paper sizes to localStorage:', e)
  }
}

/**
 * Get default paper sizes from config
 */
export function getDefaultPaperSizes(): PaperSize[] {
  return defaultPaperSizes.paperSizes as PaperSize[]
}

/**
 * Validate paper size entry
 */
export function validatePaperSize(size: unknown): size is PaperSize {
  if (typeof size !== 'object' || size === null) return false
  const s = size as Record<string, unknown>
  return (
    typeof s.id === 'string' &&
    typeof s.label === 'string' &&
    typeof s.width === 'number' &&
    typeof s.height === 'number'
  )
}

/**
 * Validate array of paper sizes
 */
export function validatePaperSizes(sizes: unknown): sizes is PaperSize[] {
  if (!Array.isArray(sizes)) return false
  return sizes.every(validatePaperSize)
}
