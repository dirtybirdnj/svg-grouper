// SVG analysis utilities

import { SVGNode, OptimizationState } from '../../../types/svg'
import { getPlotterColor } from '../../../utils/elementColor'
import { SVGStatistics } from './types'

/**
 * Optimization summary for all layers
 */
export interface OptimizationSummary {
  totalLayers: number
  fillApplied: { node: SVGNode; state: NonNullable<OptimizationState['fillApplied']> }[]
  orderOptimized: { node: SVGNode; state: NonNullable<OptimizationState['orderOptimized']> }[]
  unoptimized: SVGNode[]
  partiallyOptimized: SVGNode[]
}

/**
 * Analyze SVG structure and collect statistics
 */
export function analyzeSVG(nodes: SVGNode[]): SVGStatistics {
  const stats: SVGStatistics = {
    totalNodes: 0,
    totalPaths: 0,
    totalGroups: 0,
    totalShapes: 0,
    maxDepth: 0,
    colorPalette: [],
    operationCounts: {},
    layerStats: [],
  }

  const colorStats = new Map<string, { paths: number; points: number }>()

  const countOperations = (element: Element) => {
    const d = element.getAttribute('d')
    if (d) {
      const commands = d.match(/[MLHVCSQTAZ]/gi) || []
      commands.forEach(cmd => {
        const key = cmd.toUpperCase()
        stats.operationCounts[key] = (stats.operationCounts[key] || 0) + 1
      })
    }
  }

  const countPoints = (element: Element): number => {
    const d = element.getAttribute('d')
    if (!d) return 0
    const commands = d.match(/[MLHVCSQTAZ]/gi) || []
    return commands.length
  }

  const addColorStats = (color: string, paths: number, points: number) => {
    const existing = colorStats.get(color)
    if (existing) {
      existing.paths += paths
      existing.points += points
    } else {
      colorStats.set(color, { paths, points })
    }
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
      countOperations(node.element)

      const color = getPlotterColor(node.element, node.fillColor)
      if (color) {
        const points = countPoints(node.element)
        addColorStats(color, 1, points)
      }
    }

    if (['rect', 'circle', 'ellipse'].includes(tagName)) {
      stats.totalShapes++
    }

    node.children.forEach(child => traverse(child, depth + 1))
  }

  const collectLayerStats = (node: SVGNode, depth: number) => {
    let pathCount = 0
    const layerColors = new Set<string>()

    const collectFromNode = (n: SVGNode) => {
      const tagName = n.element.tagName.toLowerCase()
      if (['path', 'line', 'polyline', 'polygon'].includes(tagName)) {
        pathCount++
      }

      if (n.fillColor) {
        layerColors.add(n.fillColor)
      }

      const fill = n.element.getAttribute('fill')
      const stroke = n.element.getAttribute('stroke')
      const style = n.element.getAttribute('style')

      if (fill && fill !== 'none' && fill !== 'transparent') {
        layerColors.add(fill)
      }
      if (stroke && stroke !== 'none' && stroke !== 'transparent') {
        layerColors.add(stroke)
      }
      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        const strokeMatch = style.match(/stroke:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none') layerColors.add(fillMatch[1].trim())
        if (strokeMatch && strokeMatch[1] !== 'none') layerColors.add(strokeMatch[1].trim())
      }

      n.children.forEach(collectFromNode)
    }
    collectFromNode(node)

    stats.layerStats.push({
      name: node.name || node.id,
      paths: pathCount,
      depth,
      colors: Array.from(layerColors),
    })

    node.children.forEach(child => {
      if (child.isGroup) {
        collectLayerStats(child, depth + 1)
      }
    })
  }

  nodes.forEach(node => {
    traverse(node, 0)
    if (node.isGroup) {
      collectLayerStats(node, 0)
    }
  })

  stats.colorPalette = Array.from(colorStats.entries())
    .map(([color, data]) => ({ color, paths: data.paths, points: data.points }))
    .sort((a, b) => (b.paths + b.points) - (a.paths + a.points))

  return stats
}

/**
 * Analyze optimization state of all layers
 */
export function analyzeOptimizationState(nodes: SVGNode[]): OptimizationSummary {
  const summary: OptimizationSummary = {
    totalLayers: 0,
    fillApplied: [],
    orderOptimized: [],
    unoptimized: [],
    partiallyOptimized: [],
  }

  const traverse = (node: SVGNode) => {
    const isLeaf = node.children.length === 0 || node.customMarkup
    if (isLeaf) {
      summary.totalLayers++

      const opt = node.optimizationState
      const hasFill = !!opt?.fillApplied
      const hasOrder = !!opt?.orderOptimized

      if (hasFill && opt?.fillApplied) {
        summary.fillApplied.push({ node, state: opt.fillApplied })
      }
      if (hasOrder && opt?.orderOptimized) {
        summary.orderOptimized.push({ node, state: opt.orderOptimized })
      }

      if (hasFill && !hasOrder) {
        summary.partiallyOptimized.push(node)
      } else if (!hasFill && !hasOrder) {
        const tagName = node.element.tagName.toLowerCase()
        if (['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'].includes(tagName) || node.customMarkup) {
          summary.unoptimized.push(node)
        }
      }
    }

    node.children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return summary
}

/**
 * Format byte size for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
