/**
 * Application-wide constants
 * Centralizes magic numbers and configuration values for easier maintenance
 */

// ============================================================================
// Unit Conversion
// ============================================================================

/** Standard DPI for web/screen rendering */
export const DPI = 96

/** Convert millimeters to pixels (at 96 DPI) */
export const MM_TO_PX = DPI / 25.4

// ============================================================================
// Animation
// ============================================================================

export const ANIMATION = {
  /** Minimum animation duration in ms */
  MIN_DURATION: 500,
  /** Maximum animation duration in ms */
  MAX_DURATION: 30000,
  /** Default animation duration in ms */
  DEFAULT_DURATION: 5000,
} as const

// ============================================================================
// Optimization Thresholds
// ============================================================================

export const OPTIMIZATION = {
  /** Points closer than this are considered connected */
  CONNECT_THRESHOLD: 0.5,
  /** Maximum lines before switching to chunked optimization */
  MAX_LINES_FOR_FULL: 5000,
  /** Chunk size for processing large line sets */
  CHUNK_SIZE: 1000,
  /** Default tolerance for point comparison */
  DEFAULT_TOLERANCE: 0.01,
} as const

// ============================================================================
// UI Defaults
// ============================================================================

export const UI = {
  /** Default preview padding in pixels */
  PREVIEW_PADDING: 20,
  /** Large preview padding (e.g., export) */
  PREVIEW_PADDING_LARGE: 40,
} as const

// ============================================================================
// Fill Defaults
// ============================================================================

export const FILL_DEFAULTS = {
  LINE_SPACING: 5,
  ANGLE: 45,
  INSET: 0,
  WIGGLE_AMPLITUDE: 3,
  WIGGLE_FREQUENCY: 0.5,
  SPIRAL_OVER_DIAMETER: 1.5,
} as const
