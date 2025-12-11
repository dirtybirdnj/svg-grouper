// Shared types for contexts

import { SVGNode } from '../types/svg'
import { TabKey } from '../types/tabs'

// Loading state
export interface LoadingState {
  isLoading: boolean
  progress: number
  status: string
  startTime?: number
  estimatedTimeLeft?: number
}

// Data structure for the Order tab
export interface OrderLine {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  pathId: string
}

export interface OrderData {
  lines: OrderLine[]
  boundingBox: { x: number; y: number; width: number; height: number }
  source: 'fill' | 'sort'
  onApply?: (orderedLines: OrderLine[], improvement: number) => void
}

// Arrange handlers interface
export interface ArrangeHandlers {
  moveUp: () => void
  moveDown: () => void
  bringToFront: () => void
  sendToBack: () => void
  group: () => void
  ungroup: () => void
}

// Tool handlers interface
export interface ToolHandlers {
  convertToFills: () => void
  normalizeColors: () => void
  separateCompoundPaths: () => void
}

// Optimization settings
export interface OptimizationSettings {
  optimizePaths: boolean
  joinPaths: boolean
  joinTolerance: number
}

// Active tool type
export type ActiveToolType = 'none' | 'merge-colors' | 'reduce-palette' | 'fill-pattern'

// Crop aspect ratio type
export type CropAspectRatio = '1:2' | '2:3' | '3:4' | '16:9' | '9:16'

// Re-export for convenience
export type { SVGNode, TabKey }
