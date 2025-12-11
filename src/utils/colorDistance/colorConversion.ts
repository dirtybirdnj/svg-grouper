// Color conversion utilities - RGB, LAB, XYZ, Hex

import { RGBTuple, LABTuple, XYZTuple } from './types'

/**
 * Convert any color string to RGB tuple
 * Handles hex (#fff, #ffffff) and rgb(r,g,b) formats
 */
export function colorToRgb(color: string): RGBTuple {
  // Handle rgb/rgba format first
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1], 10),
      parseInt(rgbMatch[2], 10),
      parseInt(rgbMatch[3], 10)
    ]
  }

  // Handle hex format
  let h = color.replace('#', '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const num = parseInt(h, 16)
  if (!isNaN(num)) {
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  }

  // Default fallback
  return [0, 0, 0]
}

// Alias for backwards compatibility
export const hexToRgb = colorToRgb

/**
 * Convert RGB to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * Convert RGB to XYZ color space (intermediate for LAB)
 */
export function rgbToXyz(r: number, g: number, b: number): XYZTuple {
  // Normalize RGB to 0-1 and apply gamma correction
  let rr = r / 255
  let gg = g / 255
  let bb = b / 255

  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92

  rr *= 100
  gg *= 100
  bb *= 100

  // Convert to XYZ using sRGB matrix
  const x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750
  const z = rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041

  return [x, y, z]
}

/**
 * Convert XYZ to LAB color space
 */
export function xyzToLab(x: number, y: number, z: number): LABTuple {
  // Reference white D65
  const refX = 95.047
  const refY = 100.000
  const refZ = 108.883

  let xx = x / refX
  let yy = y / refY
  let zz = z / refZ

  const epsilon = 0.008856
  const kappa = 903.3

  xx = xx > epsilon ? Math.pow(xx, 1/3) : (kappa * xx + 16) / 116
  yy = yy > epsilon ? Math.pow(yy, 1/3) : (kappa * yy + 16) / 116
  zz = zz > epsilon ? Math.pow(zz, 1/3) : (kappa * zz + 16) / 116

  const L = 116 * yy - 16
  const a = 500 * (xx - yy)
  const b = 200 * (yy - zz)

  return [L, a, b]
}

/**
 * Convert RGB to LAB color space
 */
export function rgbToLab(r: number, g: number, b: number): LABTuple {
  const [x, y, z] = rgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

/**
 * Convert any color string to LAB
 */
export function colorToLab(color: string): LABTuple {
  const [r, g, b] = colorToRgb(color)
  return rgbToLab(r, g, b)
}

// Alias for backwards compatibility
export const hexToLab = colorToLab
