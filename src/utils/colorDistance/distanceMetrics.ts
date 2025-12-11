// Color distance metrics

import { colorToRgb, colorToLab } from './colorConversion'

/**
 * Calculate Euclidean distance between two RGB colors
 * Handles both hex and rgb() format strings
 * Returns value 0-441 (sqrt(255^2 * 3))
 */
export function rgbDistance(color1: string, color2: string): number {
  const [r1, g1, b1] = colorToRgb(color1)
  const [r2, g2, b2] = colorToRgb(color2)
  return Math.sqrt(
    Math.pow(r2 - r1, 2) +
    Math.pow(g2 - g1, 2) +
    Math.pow(b2 - b1, 2)
  )
}

/**
 * Calculate perceptual distance between two colors using CIELAB Delta E
 * Handles both hex and rgb() format strings
 * This better matches human perception of color difference
 * Returns value typically 0-100+ (0 = identical, 2.3 = just noticeable difference)
 */
export function labDistance(color1: string, color2: string): number {
  const [L1, a1, b1] = colorToLab(color1)
  const [L2, a2, b2] = colorToLab(color2)
  return Math.sqrt(
    Math.pow(L2 - L1, 2) +
    Math.pow(a2 - a1, 2) +
    Math.pow(b2 - b1, 2)
  )
}

/**
 * Calculate LAB distance from LAB tuples directly (for performance in loops)
 */
export function labDistanceFromTuples(
  lab1: [number, number, number],
  lab2: [number, number, number]
): number {
  return Math.sqrt(
    Math.pow(lab2[0] - lab1[0], 2) +
    Math.pow(lab2[1] - lab1[1], 2) +
    Math.pow(lab2[2] - lab1[2], 2)
  )
}
