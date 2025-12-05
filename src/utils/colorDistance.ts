import { SVGNode } from '../types/svg'
import { getNodeColor } from './elementColor'
import { normalizeColor } from './colorExtractor'

/**
 * Color distance and clustering utilities for merging similar colors
 * and reducing to a limited palette.
 */

// Convert any color string to RGB tuple
// Handles hex (#fff, #ffffff) and rgb(r,g,b) formats
export function colorToRgb(color: string): [number, number, number] {
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

// Convert RGB to hex
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

// Convert RGB to XYZ color space (intermediate for LAB)
function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
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

// Convert XYZ to LAB color space
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
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

// Convert RGB to LAB color space
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

// Convert any color string to LAB
export function colorToLab(color: string): [number, number, number] {
  const [r, g, b] = colorToRgb(color)
  return rgbToLab(r, g, b)
}

// Alias for backwards compatibility
export const hexToLab = colorToLab

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
 * Union-Find data structure for clustering
 */
class UnionFind {
  private parent: Map<string, string>
  private rank: Map<string, number>

  constructor() {
    this.parent = new Map()
    this.rank = new Map()
  }

  makeSet(x: string) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
      this.rank.set(x, 0)
    }
  }

  find(x: string): string {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!))
    }
    return this.parent.get(x)!
  }

  union(x: string, y: string) {
    const rootX = this.find(x)
    const rootY = this.find(y)
    if (rootX === rootY) return

    const rankX = this.rank.get(rootX)!
    const rankY = this.rank.get(rootY)!

    if (rankX < rankY) {
      this.parent.set(rootX, rootY)
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX)
    } else {
      this.parent.set(rootY, rootX)
      this.rank.set(rootX, rankX + 1)
    }
  }

  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>()
    for (const x of this.parent.keys()) {
      const root = this.find(x)
      if (!clusters.has(root)) {
        clusters.set(root, [])
      }
      clusters.get(root)!.push(x)
    }
    return clusters
  }
}

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
): { resultCount: number; clusters: Map<string, string[]>; resultColors: string[] } {
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
 * K-means clustering for palette reduction
 */
function kMeansClustering(
  colors: string[],
  k: number,
  maxIterations: number = 50
): { centroids: string[]; assignments: Map<string, string> } {
  if (colors.length <= k) {
    // Already at or below target, each color is its own centroid
    const assignments = new Map<string, string>()
    colors.forEach(c => assignments.set(c, c))
    return { centroids: [...colors], assignments }
  }

  // Initialize centroids by picking k evenly spaced colors
  const uniqueColors = [...new Set(colors)]
  let centroids: [number, number, number][] = []

  // Pick initial centroids spread across the color list
  const step = Math.max(1, Math.floor(uniqueColors.length / k))
  for (let i = 0; i < k && i * step < uniqueColors.length; i++) {
    centroids.push(hexToLab(uniqueColors[i * step]))
  }

  // Fill remaining centroids if needed
  while (centroids.length < k && centroids.length < uniqueColors.length) {
    const idx = centroids.length
    if (idx < uniqueColors.length) {
      centroids.push(hexToLab(uniqueColors[idx]))
    }
  }

  // Convert all colors to LAB for faster comparison
  const colorLabs = colors.map(c => ({ hex: c, lab: hexToLab(c) }))

  let assignments = new Map<string, number>()

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each color to nearest centroid
    const newAssignments = new Map<string, number>()
    for (const { hex, lab } of colorLabs) {
      let minDist = Infinity
      let minIdx = 0
      for (let i = 0; i < centroids.length; i++) {
        const dist = Math.sqrt(
          Math.pow(lab[0] - centroids[i][0], 2) +
          Math.pow(lab[1] - centroids[i][1], 2) +
          Math.pow(lab[2] - centroids[i][2], 2)
        )
        if (dist < minDist) {
          minDist = dist
          minIdx = i
        }
      }
      newAssignments.set(hex, minIdx)
    }

    // Check for convergence
    let changed = false
    for (const [hex, idx] of newAssignments) {
      if (assignments.get(hex) !== idx) {
        changed = true
        break
      }
    }

    assignments = newAssignments

    if (!changed) break

    // Recalculate centroids
    const sums: [number, number, number][] = centroids.map(() => [0, 0, 0])
    const counts: number[] = centroids.map(() => 0)

    for (const { hex, lab } of colorLabs) {
      const idx = assignments.get(hex)!
      sums[idx][0] += lab[0]
      sums[idx][1] += lab[1]
      sums[idx][2] += lab[2]
      counts[idx]++
    }

    for (let i = 0; i < centroids.length; i++) {
      if (counts[i] > 0) {
        centroids[i] = [
          sums[i][0] / counts[i],
          sums[i][1] / counts[i],
          sums[i][2] / counts[i]
        ]
      }
    }
  }

  // Convert centroids back to hex and create final assignments
  const finalAssignments = new Map<string, string>()

  // First, find the best representative hex for each centroid
  const centroidRepresentatives: string[] = centroids.map((centroid, idx) => {
    // Find the color closest to this centroid
    let minDist = Infinity
    let bestHex = '#000000'
    for (const { hex, lab } of colorLabs) {
      if (assignments.get(hex) === idx) {
        const dist = Math.sqrt(
          Math.pow(lab[0] - centroid[0], 2) +
          Math.pow(lab[1] - centroid[1], 2) +
          Math.pow(lab[2] - centroid[2], 2)
        )
        if (dist < minDist) {
          minDist = dist
          bestHex = hex
        }
      }
    }
    return bestHex
  })

  for (const { hex } of colorLabs) {
    const idx = assignments.get(hex)!
    finalAssignments.set(hex, centroidRepresentatives[idx])
  }

  return {
    centroids: centroidRepresentatives.filter((c, i, arr) => arr.indexOf(c) === i),
    assignments: finalAssignments
  }
}

/**
 * Calculate palette reduction result without executing
 * Returns the number of resulting groups, the color mapping, and resulting colors
 */
export function calculateReduceResult(
  nodes: SVGNode[],
  targetColors: number
): { resultCount: number; colorMap: Map<string, string>; resultColors: string[] } {
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
