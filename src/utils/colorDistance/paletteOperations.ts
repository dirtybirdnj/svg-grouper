// Palette operations - merge and reduce operations on SVG nodes

import { SVGNode } from '../../types/svg'
import { getNodeColor } from '../elementColor'
import { normalizeColor } from '../colorExtractor'
import { MergeResult, ReduceResult } from './types'
import { labDistance } from './distanceMetrics'
import { UnionFind, kMeansClustering } from './clustering'

/**
 * Extract color info from layer nodes
 */
export function extractGroupColors(nodes: SVGNode[]): Map<string, string> {
  const colorMap = new Map<string, string>()
  for (const node of nodes) {
    const color = getNodeColor(node)
    const normalized = normalizeColor(color)
    colorMap.set(node.id, normalized)
  }
  return colorMap
}

/**
 * Calculate merge result without executing
 * Returns the number of resulting groups, the merge mapping, and resulting colors
 */
export function calculateMergeResult(
  nodes: SVGNode[],
  tolerance: number
): MergeResult {
  const colorMap = extractGroupColors(nodes)
  const colors = Array.from(colorMap.entries())

  if (colors.length === 0) {
    return { resultCount: 0, clusters: new Map(), resultColors: [] }
  }

  // Create union-find structure
  const uf = new UnionFind()
  for (const [id] of colors) {
    uf.makeSet(id)
  }

  // Convert tolerance (0-100) to LAB distance threshold
  // 0 = exact match only, 100 = merge everything
  // LAB distance: 2.3 = just noticeable, 10 = significant, 50 = very different
  const labThreshold = tolerance * 0.5 // 0-50 LAB distance

  // Compare all pairs and union if within tolerance
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const [id1, color1] = colors[i]
      const [id2, color2] = colors[j]

      const distance = labDistance(color1, color2)
      if (distance <= labThreshold) {
        uf.union(id1, id2)
      }
    }
  }

  const clusters = uf.getClusters()

  // Get one representative color per cluster
  const resultColors: string[] = []
  for (const [rootId] of clusters) {
    const color = colorMap.get(rootId)
    if (color) {
      resultColors.push(color)
    }
  }

  return {
    resultCount: clusters.size,
    clusters,
    resultColors
  }
}

/**
 * Execute the merge operation
 * Combines groups that should be merged based on color similarity
 */
export function executeMergeColors(
  nodes: SVGNode[],
  tolerance: number,
  svgElement: SVGSVGElement
): SVGNode[] {
  const { clusters } = calculateMergeResult(nodes, tolerance)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const result: SVGNode[] = []

  for (const [, memberIds] of clusters) {
    if (memberIds.length === 1) {
      // Single node, keep as-is
      const node = nodeMap.get(memberIds[0])
      if (node) result.push(node)
    } else {
      // Multiple nodes to merge into one group
      const memberNodes = memberIds.map(id => nodeMap.get(id)!).filter(Boolean)
      if (memberNodes.length === 0) continue

      // Use the first node's color for the group name
      const primaryColor = getNodeColor(memberNodes[0])

      // Create new group element
      const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const groupId = `merged-${normalizeColor(primaryColor).replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`
      newGroup.setAttribute('id', groupId)

      // Move all child elements into the new group
      for (const memberNode of memberNodes) {
        if (memberNode.isGroup) {
          // If it's a group, move its children
          while (memberNode.element.firstChild) {
            newGroup.appendChild(memberNode.element.firstChild)
          }
          memberNode.element.remove()
        } else {
          // Move the element itself
          newGroup.appendChild(memberNode.element)
        }
      }

      svgElement.appendChild(newGroup)

      // Flatten children for the new node
      const allChildren: SVGNode[] = []
      for (const memberNode of memberNodes) {
        if (memberNode.isGroup) {
          allChildren.push(...memberNode.children)
        } else {
          allChildren.push(memberNode)
        }
      }

      result.push({
        id: groupId,
        type: 'g',
        name: `merged-${normalizeColor(primaryColor)}`,
        element: newGroup,
        isGroup: true,
        children: allChildren
      })
    }
  }

  return result
}

/**
 * Calculate palette reduction result without executing
 * Returns the number of resulting groups, the color mapping, and resulting colors
 */
export function calculateReduceResult(
  nodes: SVGNode[],
  targetColors: number
): ReduceResult {
  const groupColors = extractGroupColors(nodes)
  const colors = Array.from(groupColors.values())

  if (colors.length === 0) {
    return { resultCount: 0, colorMap: new Map(), resultColors: [] }
  }

  const { centroids, assignments } = kMeansClustering(colors, targetColors)

  // Build mapping from node ID to new color
  const colorMap = new Map<string, string>()
  for (const [nodeId, originalColor] of groupColors) {
    const newColor = assignments.get(originalColor) || originalColor
    colorMap.set(nodeId, newColor)
  }

  return {
    resultCount: centroids.length,
    colorMap,
    resultColors: centroids
  }
}

/**
 * Execute palette reduction
 * Regroups nodes by their new palette colors
 */
export function executeReducePalette(
  nodes: SVGNode[],
  targetColors: number,
  svgElement: SVGSVGElement
): SVGNode[] {
  const { colorMap } = calculateReduceResult(nodes, targetColors)

  // Group nodes by their new color
  const newGroups = new Map<string, SVGNode[]>()
  for (const node of nodes) {
    const newColor = colorMap.get(node.id) || getNodeColor(node)
    if (!newGroups.has(newColor)) {
      newGroups.set(newColor, [])
    }
    newGroups.get(newColor)!.push(node)
  }

  const result: SVGNode[] = []

  for (const [color, memberNodes] of newGroups) {
    if (memberNodes.length === 1 && !memberNodes[0].isGroup) {
      // Single non-group node, keep as-is but update color reference
      result.push(memberNodes[0])
    } else {
      // Create new group for this palette color
      const newGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const groupId = `palette-${color.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`
      newGroup.setAttribute('id', groupId)

      const allChildren: SVGNode[] = []

      for (const memberNode of memberNodes) {
        if (memberNode.isGroup) {
          // Move children from existing group
          while (memberNode.element.firstChild) {
            newGroup.appendChild(memberNode.element.firstChild)
          }
          memberNode.element.remove()
          allChildren.push(...memberNode.children)
        } else {
          newGroup.appendChild(memberNode.element)
          allChildren.push(memberNode)
        }
      }

      svgElement.appendChild(newGroup)

      result.push({
        id: groupId,
        type: 'g',
        name: `palette-${color}`,
        element: newGroup,
        isGroup: true,
        children: allChildren
      })
    }
  }

  return result
}
