/**
 * SVG Analysis Utilities
 * Provides functions for analyzing SVG structure, colors, and statistics
 */

import { SVGNode } from '../types/svg'
import { normalizeColor } from './colorExtractor'
import { getPlotterColor } from './elementColor'

/**
 * Color statistics for a single color
 */
export interface ColorStats {
  paths: number
  points: number
}

/**
 * Overall SVG document statistics
 */
export interface SVGDocumentStats {
  totalNodes: number
  totalGroups: number
  totalPaths: number
  totalShapes: number
  totalOperations: number
  maxDepth: number
  colorStats: Map<string, ColorStats>
}

/**
 * Count the number of points in an SVG element
 */
export function countElementPoints(element: Element): number {
  const tagName = element.tagName.toLowerCase()

  switch (tagName) {
    case 'path': {
      const d = element.getAttribute('d') || ''
      // Count M, L, H, V, C, S, Q, T, A commands as approximation of point count
      const commands = d.match(/[MLHVCSQTAZ]/gi) || []
      return commands.length
    }
    case 'polyline':
    case 'polygon': {
      const points = element.getAttribute('points') || ''
      // Each point pair is separated by space or comma
      const coords = points.trim().split(/[\s,]+/)
      return Math.floor(coords.length / 2)
    }
    case 'line':
      return 2
    case 'rect':
      return 4
    case 'circle':
    case 'ellipse':
      // Approximate as 4 points (quarter arcs)
      return 4
    default:
      return 0
  }
}

/**
 * Count path operations (draw commands) in an element
 */
export function countPathOperations(element: Element): number {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== 'path') return 0

  const d = element.getAttribute('d') || ''
  const commands = d.match(/[MLHVCSQTAZ]/gi) || []
  return commands.length
}

/**
 * Collect all colors with statistics from SVG nodes
 * Returns a map of normalized color -> { paths, points }
 */
export function collectColorStats(nodes: SVGNode[]): Map<string, ColorStats> {
  const colorStats = new Map<string, ColorStats>()

  const addColorStat = (color: string, pointCount: number) => {
    const normalized = normalizeColor(color)
    const existing = colorStats.get(normalized) || { paths: 0, points: 0 }
    colorStats.set(normalized, {
      paths: existing.paths + 1,
      points: existing.points + pointCount
    })
  }

  const traverse = (node: SVGNode) => {
    if (!node.isGroup) {
      const color = getPlotterColor(node.element, node.fillColor)
      if (color) {
        const pointCount = countElementPoints(node.element)
        addColorStat(color, pointCount)
      }
    }
    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return colorStats
}

/**
 * Get unique colors from SVG nodes (normalized and deduplicated)
 */
export function getUniqueColors(nodes: SVGNode[]): string[] {
  const colorStats = collectColorStats(nodes)
  return Array.from(colorStats.keys())
}

/**
 * Analyze SVG document and return comprehensive statistics
 */
export function analyzeSVGDocument(nodes: SVGNode[]): SVGDocumentStats {
  const stats: SVGDocumentStats = {
    totalNodes: 0,
    totalGroups: 0,
    totalPaths: 0,
    totalShapes: 0,
    totalOperations: 0,
    maxDepth: 0,
    colorStats: new Map()
  }

  const traverse = (node: SVGNode, depth: number) => {
    stats.totalNodes++
    stats.maxDepth = Math.max(stats.maxDepth, depth)

    if (node.isGroup) {
      stats.totalGroups++
    }

    const tagName = node.element.tagName.toLowerCase()
    if (['path', 'line', 'polyline', 'polygon'].includes(tagName)) {
      stats.totalPaths++
      stats.totalOperations += countPathOperations(node.element)

      // Track color stats
      const color = getPlotterColor(node.element, node.fillColor)
      if (color) {
        const normalized = normalizeColor(color)
        const points = countElementPoints(node.element)
        const existing = stats.colorStats.get(normalized) || { paths: 0, points: 0 }
        stats.colorStats.set(normalized, {
          paths: existing.paths + 1,
          points: existing.points + points
        })
      }
    }

    if (['rect', 'circle', 'ellipse'].includes(tagName)) {
      stats.totalShapes++
    }

    node.children.forEach(child => traverse(child, depth + 1))
  }

  nodes.forEach(node => traverse(node, 0))
  return stats
}

/**
 * Count total drawable elements in nodes
 */
export function countDrawableElements(nodes: SVGNode[]): number {
  let count = 0
  const traverse = (node: SVGNode) => {
    if (!node.isGroup) {
      const tagName = node.element.tagName.toLowerCase()
      if (['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'].includes(tagName)) {
        count++
      }
    }
    node.children.forEach(traverse)
  }
  nodes.forEach(traverse)
  return count
}

/**
 * Get all nodes of a specific color
 */
export function getNodesByColor(nodes: SVGNode[], targetColor: string): SVGNode[] {
  const normalizedTarget = normalizeColor(targetColor)
  const result: SVGNode[] = []

  const traverse = (node: SVGNode) => {
    if (!node.isGroup) {
      const color = getPlotterColor(node.element, node.fillColor)
      if (color && normalizeColor(color) === normalizedTarget) {
        result.push(node)
      }
    }
    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return result
}
