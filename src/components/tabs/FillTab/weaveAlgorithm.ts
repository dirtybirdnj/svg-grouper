// Weave algorithm for interleaving two layers of fill lines

import { Point, HatchLine } from '../../../utils/geometry'

export type WeavePattern = 'trueWeave' | 'checkerboard' | 'layer1Over' | 'layer2Over'

interface Intersection {
  point: Point
  line1Index: number
  line2Index: number
  t1: number // Parameter along line1 (0-1)
  t2: number // Parameter along line2 (0-1)
}

// Find intersection point of two line segments
// Returns null if they don't intersect, or { point, t1, t2 } if they do
function lineSegmentIntersection(
  a1: Point, a2: Point,
  b1: Point, b2: Point
): { point: Point; t1: number; t2: number } | null {
  const dx1 = a2.x - a1.x
  const dy1 = a2.y - a1.y
  const dx2 = b2.x - b1.x
  const dy2 = b2.y - b1.y

  const denom = dx1 * dy2 - dy1 * dx2

  // Parallel or coincident lines
  if (Math.abs(denom) < 1e-10) return null

  const dx3 = b1.x - a1.x
  const dy3 = b1.y - a1.y

  const t1 = (dx3 * dy2 - dy3 * dx2) / denom
  const t2 = (dx3 * dy1 - dy3 * dx1) / denom

  // Check if intersection is within both segments
  if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
    return {
      point: {
        x: a1.x + t1 * dx1,
        y: a1.y + t1 * dy1
      },
      t1,
      t2
    }
  }

  return null
}

// Determine if layer1 is "over" at this intersection based on pattern
function isLayer1Over(
  pattern: WeavePattern,
  line1Index: number,
  line2Index: number,
  crossingCount: number // Number of crossings this line1 has had so far
): boolean {
  switch (pattern) {
    case 'layer1Over':
      return true
    case 'layer2Over':
      return false
    case 'checkerboard':
      return (line1Index + line2Index) % 2 === 0
    case 'trueWeave':
    default:
      // Each line alternates over/under as it crosses lines from the other layer
      return crossingCount % 2 === 0
  }
}

// Cut a gap in a line at a given point
// Returns the remaining segments after cutting
function cutGapInLine(
  line: HatchLine,
  intersectionT: number, // Parameter along line (0-1)
  gapHalfWidth: number // Half the total gap width in pixels
): HatchLine[] {
  const dx = line.x2 - line.x1
  const dy = line.y2 - line.y1
  const lineLength = Math.sqrt(dx * dx + dy * dy)

  if (lineLength < 1e-6) return [line] // Degenerate line

  // Convert gap half-width to parameter space
  const gapHalfT = gapHalfWidth / lineLength

  const gapStart = intersectionT - gapHalfT
  const gapEnd = intersectionT + gapHalfT

  const result: HatchLine[] = []

  // Segment before gap
  if (gapStart > 0.001) {
    result.push({
      x1: line.x1,
      y1: line.y1,
      x2: line.x1 + gapStart * dx,
      y2: line.y1 + gapStart * dy
    })
  }

  // Segment after gap
  if (gapEnd < 0.999) {
    result.push({
      x1: line.x1 + gapEnd * dx,
      y1: line.y1 + gapEnd * dy,
      x2: line.x2,
      y2: line.y2
    })
  }

  return result
}

// Main weave function - takes two layers and weaves them
export function weaveLayerLines(
  layer1Lines: HatchLine[],
  layer2Lines: HatchLine[],
  layer1PenWidth: number, // in mm
  layer2PenWidth: number, // in mm
  pattern: WeavePattern,
  gapMargin: number // extra margin in px
): { layer1: HatchLine[]; layer2: HatchLine[] } {
  // Convert pen widths from mm to px (assuming 96 DPI, 1mm ≈ 3.78px)
  const MM_TO_PX = 3.78
  const layer1GapHalf = (layer1PenWidth * MM_TO_PX / 2) + gapMargin
  const layer2GapHalf = (layer2PenWidth * MM_TO_PX / 2) + gapMargin

  // Find all intersections
  const intersections: Intersection[] = []
  for (let i = 0; i < layer1Lines.length; i++) {
    const line1 = layer1Lines[i]
    for (let j = 0; j < layer2Lines.length; j++) {
      const line2 = layer2Lines[j]
      const result = lineSegmentIntersection(
        { x: line1.x1, y: line1.y1 },
        { x: line1.x2, y: line1.y2 },
        { x: line2.x1, y: line2.y1 },
        { x: line2.x2, y: line2.y2 }
      )
      if (result) {
        intersections.push({
          point: result.point,
          line1Index: i,
          line2Index: j,
          t1: result.t1,
          t2: result.t2
        })
      }
    }
  }

  // Group intersections by line and sort by parameter
  const layer1Cuts = new Map<number, { t: number; gapHalf: number }[]>()
  const layer2Cuts = new Map<number, { t: number; gapHalf: number }[]>()

  // For true weave, track crossing counts per line
  const line1CrossingCounts = new Map<number, number>()

  // Sort intersections by line1Index, then by t1 for proper alternation in true weave
  intersections.sort((a, b) => {
    if (a.line1Index !== b.line1Index) return a.line1Index - b.line1Index
    return a.t1 - b.t1
  })

  for (const intersection of intersections) {
    const { line1Index, line2Index, t1, t2 } = intersection

    // Get current crossing count for this line1
    const crossingCount = line1CrossingCounts.get(line1Index) || 0
    line1CrossingCounts.set(line1Index, crossingCount + 1)

    const layer1Over = isLayer1Over(pattern, line1Index, line2Index, crossingCount)

    if (layer1Over) {
      // Layer1 is over, so cut a gap in layer2
      if (!layer2Cuts.has(line2Index)) layer2Cuts.set(line2Index, [])
      layer2Cuts.get(line2Index)!.push({ t: t2, gapHalf: layer1GapHalf })
    } else {
      // Layer2 is over, so cut a gap in layer1
      if (!layer1Cuts.has(line1Index)) layer1Cuts.set(line1Index, [])
      layer1Cuts.get(line1Index)!.push({ t: t1, gapHalf: layer2GapHalf })
    }
  }

  // Apply cuts to layer1
  const newLayer1Lines: HatchLine[] = []
  for (let i = 0; i < layer1Lines.length; i++) {
    const cuts = layer1Cuts.get(i)
    if (!cuts || cuts.length === 0) {
      newLayer1Lines.push(layer1Lines[i])
    } else {
      // Sort cuts by t
      cuts.sort((a, b) => a.t - b.t)
      // Apply cuts progressively
      let segments = [layer1Lines[i]]
      for (const cut of cuts) {
        const newSegments: HatchLine[] = []
        for (const seg of segments) {
          // Need to recalculate t for this segment
          const dx = layer1Lines[i].x2 - layer1Lines[i].x1
          const dy = layer1Lines[i].y2 - layer1Lines[i].y1
          const cutX = layer1Lines[i].x1 + cut.t * dx
          const cutY = layer1Lines[i].y1 + cut.t * dy

          // Check if cut point is within this segment
          const segDx = seg.x2 - seg.x1
          const segDy = seg.y2 - seg.y1
          const segLen = Math.sqrt(segDx * segDx + segDy * segDy)
          if (segLen < 1e-6) {
            newSegments.push(seg)
            continue
          }

          // Project cut point onto segment
          const toPoint = { x: cutX - seg.x1, y: cutY - seg.y1 }
          const segDir = { x: segDx / segLen, y: segDy / segLen }
          const proj = toPoint.x * segDir.x + toPoint.y * segDir.y
          const segT = proj / segLen

          if (segT > 0.001 && segT < 0.999) {
            const cutSegs = cutGapInLine(seg, segT, cut.gapHalf)
            newSegments.push(...cutSegs)
          } else {
            newSegments.push(seg)
          }
        }
        segments = newSegments
      }
      newLayer1Lines.push(...segments)
    }
  }

  // Apply cuts to layer2
  const newLayer2Lines: HatchLine[] = []
  for (let i = 0; i < layer2Lines.length; i++) {
    const cuts = layer2Cuts.get(i)
    if (!cuts || cuts.length === 0) {
      newLayer2Lines.push(layer2Lines[i])
    } else {
      cuts.sort((a, b) => a.t - b.t)
      let segments = [layer2Lines[i]]
      for (const cut of cuts) {
        const newSegments: HatchLine[] = []
        for (const seg of segments) {
          const dx = layer2Lines[i].x2 - layer2Lines[i].x1
          const dy = layer2Lines[i].y2 - layer2Lines[i].y1
          const cutX = layer2Lines[i].x1 + cut.t * dx
          const cutY = layer2Lines[i].y1 + cut.t * dy

          const segDx = seg.x2 - seg.x1
          const segDy = seg.y2 - seg.y1
          const segLen = Math.sqrt(segDx * segDx + segDy * segDy)
          if (segLen < 1e-6) {
            newSegments.push(seg)
            continue
          }

          const toPoint = { x: cutX - seg.x1, y: cutY - seg.y1 }
          const segDir = { x: segDx / segLen, y: segDy / segLen }
          const proj = toPoint.x * segDir.x + toPoint.y * segDir.y
          const segT = proj / segLen

          if (segT > 0.001 && segT < 0.999) {
            const cutSegs = cutGapInLine(seg, segT, cut.gapHalf)
            newSegments.push(...cutSegs)
          } else {
            newSegments.push(seg)
          }
        }
        segments = newSegments
      }
      newLayer2Lines.push(...segments)
    }
  }

  return { layer1: newLayer1Lines, layer2: newLayer2Lines }
}
