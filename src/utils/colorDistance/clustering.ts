// Color clustering utilities - Union-Find and K-means

import { LABTuple, ClusteringResult } from './types'
import { hexToLab } from './colorConversion'
import { labDistanceFromTuples } from './distanceMetrics'

/**
 * Union-Find data structure for clustering similar colors
 */
export class UnionFind {
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
 * K-means clustering for palette reduction
 */
export function kMeansClustering(
  colors: string[],
  k: number,
  maxIterations: number = 50
): ClusteringResult {
  if (colors.length <= k) {
    // Already at or below target, each color is its own centroid
    const assignments = new Map<string, string>()
    colors.forEach(c => assignments.set(c, c))
    return { centroids: [...colors], assignments }
  }

  // Initialize centroids by picking k evenly spaced colors
  const uniqueColors = [...new Set(colors)]
  let centroids: LABTuple[] = []

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
        const dist = labDistanceFromTuples(lab, centroids[i])
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
    const sums: LABTuple[] = centroids.map(() => [0, 0, 0])
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

  // Find the best representative hex for each centroid
  const centroidRepresentatives: string[] = centroids.map((centroid, idx) => {
    // Find the color closest to this centroid
    let minDist = Infinity
    let bestHex = '#000000'
    for (const { hex, lab } of colorLabs) {
      if (assignments.get(hex) === idx) {
        const dist = labDistanceFromTuples(lab, centroid)
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
