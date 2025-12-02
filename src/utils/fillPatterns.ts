// Fill pattern generators for pen plotter hatching

import {
  Point,
  HatchLine,
  PolygonWithHoles,
  distance,
  pointInPolygon,
  linePolygonIntersections,
  clipLinesToPolygon,
  clipSegmentAroundHoles,
  generateGlobalHatchLines,
  offsetPolygon,
  polygonSignedArea,
  offsetPolygonInward
} from './geometry'

export interface OrderedLine extends HatchLine {
  originalIndex: number
  pathId: string
  color: string
  reversed: boolean
}

export type FillPatternType = 'lines' | 'concentric' | 'wiggle' | 'spiral' | 'honeycomb' | 'gyroid' | 'crosshatch' | 'zigzag' | 'radial' | 'crossspiral' | 'hilbert' | 'fermat' | 'wave' | 'scribble' | 'custom'

// Check if a polygon is self-intersecting (simple check for validity)
function isPolygonSelfIntersecting(polygon: Point[]): boolean {
  const n = polygon.length
  if (n < 4) return false

  // Check each edge against non-adjacent edges
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i]
    const a2 = polygon[(i + 1) % n]

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges
      if (j === (i + n - 1) % n) continue

      const b1 = polygon[j]
      const b2 = polygon[(j + 1) % n]

      // Check if segments intersect
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true
      }
    }
  }
  return false
}

// Check if two line segments intersect (excluding endpoints)
function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = direction(b1, b2, a1)
  const d2 = direction(b1, b2, a2)
  const d3 = direction(a1, a2, b1)
  const d4 = direction(a1, a2, b2)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y)
}

// Simple robust inset for concentric (uses centroid scaling as fallback)
function robustInsetPolygon(polygon: Point[], insetDistance: number): Point[] {
  if (polygon.length < 3) return []

  // First try standard offset
  const offsetResult = offsetPolygonInward(polygon, insetDistance)

  // Validate the result
  if (offsetResult.length >= 3 && !isPolygonSelfIntersecting(offsetResult)) {
    const originalArea = Math.abs(polygonSignedArea(polygon))
    const newArea = Math.abs(polygonSignedArea(offsetResult))
    // Make sure area decreased (valid inset)
    if (newArea < originalArea && newArea > 0) {
      return offsetResult
    }
  }

  // Fallback: use centroid-based scaling (simpler but works for any shape)
  const centroidX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length
  const centroidY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length

  // Calculate average distance to centroid
  let avgDist = 0
  for (const p of polygon) {
    avgDist += Math.sqrt(Math.pow(p.x - centroidX, 2) + Math.pow(p.y - centroidY, 2))
  }
  avgDist /= polygon.length

  if (avgDist <= insetDistance) return [] // Would collapse to point

  const scale = (avgDist - insetDistance) / avgDist

  return polygon.map(p => ({
    x: centroidX + (p.x - centroidX) * scale,
    y: centroidY + (p.y - centroidY) * scale
  }))
}

// Generate concentric fill lines (snake pattern from outside in)
export function generateConcentricLines(
  polygon: Point[],
  spacing: number,
  connectLoops: boolean = true
): HatchLine[] {
  const lines: HatchLine[] = []
  if (polygon.length < 3) return lines

  const minArea = spacing * spacing * 0.5 // Reduced threshold for small shapes

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const maxDimension = Math.max(maxX - minX, maxY - minY)
  const maxLoops = Math.min(100, Math.ceil(maxDimension / spacing) + 2)

  const loops: Point[][] = []
  let currentPolygon = [...polygon]
  let lastArea = Math.abs(polygonSignedArea(currentPolygon))

  for (let loopCount = 0; loopCount < maxLoops; loopCount++) {
    if (currentPolygon.length < 3 || lastArea < minArea) break

    loops.push([...currentPolygon])

    // Use robust inset that handles complex shapes
    currentPolygon = robustInsetPolygon(currentPolygon, spacing)

    if (currentPolygon.length < 3) break

    const newArea = Math.abs(polygonSignedArea(currentPolygon))
    if (newArea >= lastArea || newArea < minArea) break
    lastArea = newArea
  }

  // If no loops were generated, at least draw the original polygon outline
  if (loops.length === 0 && polygon.length >= 3) {
    loops.push([...polygon])
  }

  for (let loopIdx = 0; loopIdx < loops.length; loopIdx++) {
    const loop = loops[loopIdx]

    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length
      lines.push({
        x1: loop[i].x,
        y1: loop[i].y,
        x2: loop[j].x,
        y2: loop[j].y
      })
    }

    if (connectLoops && loopIdx < loops.length - 1) {
      const nextLoop = loops[loopIdx + 1]
      const lastPoint = loop[loop.length - 1]
      let closestIdx = 0
      let closestDist = Infinity

      for (let i = 0; i < nextLoop.length; i++) {
        const d = Math.sqrt(
          Math.pow(nextLoop[i].x - lastPoint.x, 2) +
          Math.pow(nextLoop[i].y - lastPoint.y, 2)
        )
        if (d < closestDist) {
          closestDist = d
          closestIdx = i
        }
      }

      lines.push({
        x1: lastPoint.x,
        y1: lastPoint.y,
        x2: nextLoop[closestIdx].x,
        y2: nextLoop[closestIdx].y
      })
    }
  }

  return lines
}

// Generate a honeycomb/hexagonal grid pattern
export function generateHoneycombLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  angleDegrees: number = 0
): HatchLine[] {
  const { outer, holes } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  const workingHoles = holes.map(hole => {
    if (inset > 0) {
      const centroidX = hole.reduce((sum, p) => sum + p.x, 0) / hole.length
      const centroidY = hole.reduce((sum, p) => sum + p.y, 0) / hole.length
      return hole.map(p => {
        const dx = p.x - centroidX
        const dy = p.y - centroidY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = (dist + inset) / dist
        return { x: centroidX + dx * scale, y: centroidY + dy * scale }
      })
    }
    return hole
  })

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const angleRad = (angleDegrees * Math.PI) / 180

  const rotatePoint = (p: Point): Point => {
    const dx = p.x - centerX
    const dy = p.y - centerY
    return {
      x: centerX + dx * Math.cos(angleRad) - dy * Math.sin(angleRad),
      y: centerY + dx * Math.sin(angleRad) + dy * Math.cos(angleRad)
    }
  }

  const hexSize = spacing * 1.5
  const hexWidth = hexSize * 2
  const hexHeight = hexSize * Math.sqrt(3)
  const horizSpacing = hexWidth * 0.75
  const vertSpacing = hexHeight

  const lines: HatchLine[] = []
  // Expand padding based on diagonal to ensure coverage at all rotation angles
  // When rotating, hexagons at the edges of the unrotated grid need to reach
  // parts of the shape that are diagonal from the center
  const diagonal = Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2))
  const padding = hexSize * 2 + diagonal / 2

  // OPTIMIZATION: Pre-compute hex vertex offsets (same for all hexes)
  const hexOffsets: Point[] = []
  for (let i = 0; i < 6; i++) {
    const hexAngle = (Math.PI / 3) * i
    hexOffsets.push({
      x: hexSize * Math.cos(hexAngle),
      y: hexSize * Math.sin(hexAngle)
    })
  }

  // OPTIMIZATION: Helper to check if point might be inside polygon (fast bbox pre-check)
  const mightBeInside = (p: Point): boolean => {
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  }

  let row = 0
  for (let y = minY - padding; y <= maxY + padding; y += vertSpacing * 0.5) {
    const isOddRow = row % 2 === 1
    const xOffset = isOddRow ? horizSpacing * 0.5 : 0

    for (let x = minX - padding + xOffset; x <= maxX + padding; x += horizSpacing) {
      const rotatedCenter = rotatePoint({ x, y })

      // OPTIMIZATION: Early rejection - skip if rotated center is far from polygon
      if (!mightBeInside(rotatedCenter) &&
          rotatedCenter.x < minX - hexSize && rotatedCenter.x > maxX + hexSize &&
          rotatedCenter.y < minY - hexSize && rotatedCenter.y > maxY + hexSize) {
        continue
      }

      // Build hex points using pre-computed offsets
      const hexPoints: Point[] = hexOffsets.map(off =>
        rotatePoint({ x: x + off.x, y: y + off.y })
      )

      // OPTIMIZATION: bbox check before expensive pointInPolygon
      const centerInside = mightBeInside(rotatedCenter) && pointInPolygon(rotatedCenter, workingPolygon)
      const anyVertexInside = !centerInside && hexPoints.some(p =>
        mightBeInside(p) && pointInPolygon(p, workingPolygon)
      )

      if (anyVertexInside || centerInside) {
        for (let i = 0; i < 6; i++) {
          const p1 = hexPoints[i]
          const p2 = hexPoints[(i + 1) % 6]

          // OPTIMIZATION: bbox check before pointInPolygon
          const p1Inside = mightBeInside(p1) && pointInPolygon(p1, workingPolygon)
          const p2Inside = mightBeInside(p2) && pointInPolygon(p2, workingPolygon)

          let candidateSegments: HatchLine[] = []

          if (p1Inside && p2Inside) {
            candidateSegments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
          } else if (p1Inside || p2Inside) {
            const intersections = linePolygonIntersections(
              { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
              workingPolygon
            )
            if (intersections.length > 0) {
              const inside = p1Inside ? p1 : p2
              const closest = intersections.reduce((a, b) => {
                const distA = Math.sqrt(Math.pow(a.x - inside.x, 2) + Math.pow(a.y - inside.y, 2))
                const distB = Math.sqrt(Math.pow(b.x - inside.x, 2) + Math.pow(b.y - inside.y, 2))
                return distA > distB ? a : b
              })
              candidateSegments.push({ x1: inside.x, y1: inside.y, x2: closest.x, y2: closest.y })
            }
          }

          for (const seg of candidateSegments) {
            const clippedSegments = clipSegmentAroundHoles(seg, workingHoles)
            lines.push(...clippedSegments)
          }
        }
      }
    }
    row++
  }

  const uniqueLines: HatchLine[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const key1 = `${line.x1.toFixed(2)},${line.y1.toFixed(2)}-${line.x2.toFixed(2)},${line.y2.toFixed(2)}`
    const key2 = `${line.x2.toFixed(2)},${line.y2.toFixed(2)}-${line.x1.toFixed(2)},${line.y1.toFixed(2)}`

    if (!seen.has(key1) && !seen.has(key2)) {
      seen.add(key1)
      uniqueLines.push(line)
    }
  }

  return uniqueLines
}

// Generate a single wiggle/wave line
function generateWiggleLine(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  amplitude: number,
  frequency: number
): Point[] {
  const points: Point[] = []
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.1) return [{ x: startX, y: startY }]

  const dirX = dx / length
  const dirY = dy / length
  const perpX = -dirY
  const perpY = dirX

  const numPoints = Math.max(2, Math.ceil(length * frequency / 10))

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    const baseX = startX + dx * t
    const baseY = startY + dy * t
    const wave = Math.sin(t * Math.PI * 2 * frequency) * amplitude

    points.push({
      x: baseX + perpX * wave,
      y: baseY + perpY * wave
    })
  }

  return points
}

// Generate wiggle fill pattern (wavy parallel lines)
export function generateWiggleLines(
  polygonData: PolygonWithHoles,
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number,
  amplitude: number,
  frequency: number,
  inset: number = 0
): HatchLine[] {
  const straightLines = generateGlobalHatchLines(globalBbox, spacing, angleDegrees)
  const clippedLines = clipLinesToPolygon(straightLines, polygonData, inset)

  const wiggleLines: HatchLine[] = []

  for (const line of clippedLines) {
    const wigglePoints = generateWiggleLine(
      line.x1, line.y1,
      line.x2, line.y2,
      amplitude,
      frequency
    )

    for (let i = 0; i < wigglePoints.length - 1; i++) {
      wiggleLines.push({
        x1: wigglePoints[i].x,
        y1: wigglePoints[i].y,
        x2: wigglePoints[i + 1].x,
        y2: wigglePoints[i + 1].y
      })
    }
  }

  return wiggleLines
}

// Generate an Archimedean spiral from center outward
export function generateSpiralLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  angleDegrees: number = 0,
  overDiameter: number = 1.5
): HatchLine[] {
  const { outer, holes } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  const workingHoles = holes.map(hole => {
    if (inset > 0) {
      const centroidX = hole.reduce((sum, p) => sum + p.x, 0) / hole.length
      const centroidY = hole.reduce((sum, p) => sum + p.y, 0) / hole.length
      return hole.map(p => {
        const dx = p.x - centroidX
        const dy = p.y - centroidY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = (dist + inset) / dist
        return { x: centroidX + dx * scale, y: centroidY + dy * scale }
      })
    }
    return hole
  })

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  let maxRadius = 0
  for (const p of workingPolygon) {
    const dist = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2))
    maxRadius = Math.max(maxRadius, dist)
  }
  maxRadius *= overDiameter

  const angleOffset = (angleDegrees * Math.PI) / 180

  const spiralPoints: Point[] = []
  // Use finer angle step (0.02 rad) for better coverage, matching global spiral
  const angleStep = 0.02
  const radiusPerTurn = spacing
  let angle = 0

  while (true) {
    const radius = (angle / (2 * Math.PI)) * radiusPerTurn
    if (radius > maxRadius) break

    const rotatedAngle = angle + angleOffset
    spiralPoints.push({
      x: centerX + radius * Math.cos(rotatedAngle),
      y: centerY + radius * Math.sin(rotatedAngle)
    })

    angle += angleStep
    // Increased limit for finer angle step
    if (spiralPoints.length > 50000) break
  }

  const lines: HatchLine[] = []
  for (let i = 0; i < spiralPoints.length - 1; i++) {
    const p1 = spiralPoints[i]
    const p2 = spiralPoints[i + 1]

    if (pointInPolygon(p1, workingPolygon) && pointInPolygon(p2, workingPolygon)) {
      const segment = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
      const clippedSegments = clipSegmentAroundHoles(segment, workingHoles)
      for (const seg of clippedSegments) {
        lines.push(seg)
      }
    }
  }

  return lines
}

// Generate a single spiral from a given center point, returning raw lines (not clipped)
// This is used for "single spiral" mode where we generate one spiral for all shapes
export function generateGlobalSpiralLines(
  centerX: number,
  centerY: number,
  maxRadius: number,
  spacing: number,
  angleDegrees: number = 0
): HatchLine[] {
  // Convert angle offset to radians
  const angleOffset = (angleDegrees * Math.PI) / 180

  // Generate spiral points
  const spiralPoints: Point[] = []
  // Use smaller angle step for finer segments that intersect more shapes
  // At radius r, arc length = r * angleStep. We want arc length ~= spacing/2
  // So angleStep should adapt, but for simplicity use a small fixed value
  const angleStep = 0.02 // radians per step (was 0.1, now 5x finer)
  const radiusPerTurn = spacing
  let angle = 0

  while (true) {
    const radius = (angle / (2 * Math.PI)) * radiusPerTurn
    if (radius > maxRadius) break

    // Apply angle offset to rotate the entire spiral
    const rotatedAngle = angle + angleOffset
    spiralPoints.push({
      x: centerX + radius * Math.cos(rotatedAngle),
      y: centerY + radius * Math.sin(rotatedAngle)
    })

    angle += angleStep

    // Safety limit (increased for finer angle step)
    if (spiralPoints.length > 250000) break
  }

  // Convert to lines (not clipped)
  const lines: HatchLine[] = []
  for (let i = 0; i < spiralPoints.length - 1; i++) {
    const p1 = spiralPoints[i]
    const p2 = spiralPoints[i + 1]
    lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
  }

  return lines
}

// Clip spiral lines to a specific polygon (used for single spiral mode)
// This properly clips lines at polygon boundaries, not just checking endpoints
export function clipSpiralToPolygon(
  spiralLines: HatchLine[],
  polygonData: PolygonWithHoles,
  inset: number = 0
): HatchLine[] {
  // Reuse the existing clipLinesToPolygon which properly handles
  // line-polygon intersections for correct clipping
  return clipLinesToPolygon(spiralLines, polygonData, inset)
}

// Generate gyroid infill pattern
export function generateGyroidLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  angleDegrees: number = 0
): HatchLine[] {
  const { outer, holes } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  const workingHoles = holes.map(hole => {
    if (inset > 0) {
      const centroidX = hole.reduce((sum, p) => sum + p.x, 0) / hole.length
      const centroidY = hole.reduce((sum, p) => sum + p.y, 0) / hole.length
      return hole.map(p => {
        const dx = p.x - centroidX
        const dy = p.y - centroidY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = (dist + inset) / dist
        return { x: centroidX + dx * scale, y: centroidY + dy * scale }
      })
    }
    return hole
  })

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const angleRad = (angleDegrees * Math.PI) / 180
  const cosAngle = Math.cos(angleRad)
  const sinAngle = Math.sin(angleRad)

  const rotatePoint = (p: Point): Point => {
    const dx = p.x - centerX
    const dy = p.y - centerY
    return {
      x: centerX + dx * cosAngle - dy * sinAngle,
      y: centerY + dx * sinAngle + dy * cosAngle
    }
  }

  const lines: HatchLine[] = []
  const scale = (2 * Math.PI) / spacing
  // OPTIMIZATION: Increased grid step from spacing/8 to spacing/3 (7x fewer cells)
  // This reduces iterations from millions to hundreds of thousands
  const gridStep = spacing / 3
  const padding = spacing

  // OPTIMIZATION: Use single z-value for faster rendering (still looks good)
  // Original used [0, Math.PI/2] which doubled computation
  const zVal = Math.PI / 4 // Single value that gives good visual result
  const sinZ = Math.sin(zVal)
  const cosZ = Math.cos(zVal)

  // Pre-compute scale for gyroid function
  const gyroidFunc = (x: number, y: number): number => {
    const sx = Math.sin(x * scale)
    const cx = Math.cos(x * scale)
    const sy = Math.sin(y * scale)
    const cy = Math.cos(y * scale)
    return sx * cy + sy * cosZ + sinZ * cx
  }

  // OPTIMIZATION: Quick bounding box check before expensive pointInPolygon
  const inBounds = (p: Point): boolean => {
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  }

  for (let gridY = minY - padding; gridY < maxY + padding; gridY += gridStep) {
    for (let gridX = minX - padding; gridX < maxX + padding; gridX += gridStep) {
      const v00 = gyroidFunc(gridX, gridY)
      const v10 = gyroidFunc(gridX + gridStep, gridY)
      const v01 = gyroidFunc(gridX, gridY + gridStep)
      const v11 = gyroidFunc(gridX + gridStep, gridY + gridStep)

      const crossings: Point[] = []

      if ((v00 > 0) !== (v10 > 0)) {
        const t = v00 / (v00 - v10)
        crossings.push({ x: gridX + t * gridStep, y: gridY })
      }
      if ((v10 > 0) !== (v11 > 0)) {
        const t = v10 / (v10 - v11)
        crossings.push({ x: gridX + gridStep, y: gridY + t * gridStep })
      }
      if ((v01 > 0) !== (v11 > 0)) {
        const t = v01 / (v01 - v11)
        crossings.push({ x: gridX + t * gridStep, y: gridY + gridStep })
      }
      if ((v00 > 0) !== (v01 > 0)) {
        const t = v00 / (v00 - v01)
        crossings.push({ x: gridX, y: gridY + t * gridStep })
      }

      if (crossings.length >= 2) {
        if (crossings.length === 2) {
          const p1 = rotatePoint(crossings[0])
          const p2 = rotatePoint(crossings[1])

          // OPTIMIZATION: Skip if both points clearly outside bounds
          if (!inBounds(p1) && !inBounds(p2)) continue

          const p1In = inBounds(p1) && pointInPolygon(p1, workingPolygon)
          const p2In = inBounds(p2) && pointInPolygon(p2, workingPolygon)

          let candidateSegments: HatchLine[] = []
          if (p1In && p2In) {
            candidateSegments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
          } else if (p1In || p2In) {
            const intersections = linePolygonIntersections(
              { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
              workingPolygon
            )
            if (intersections.length > 0) {
              const inside = p1In ? p1 : p2
              const closest = intersections[0]
              candidateSegments.push({ x1: inside.x, y1: inside.y, x2: closest.x, y2: closest.y })
            }
          }
          for (const seg of candidateSegments) {
            const clippedSegments = clipSegmentAroundHoles(seg, workingHoles)
            lines.push(...clippedSegments)
          }
        } else if (crossings.length === 4) {
          const centerVal = gyroidFunc(gridX + gridStep / 2, gridY + gridStep / 2)
          const cellCenterX = gridX + gridStep / 2
          const cellCenterY = gridY + gridStep / 2
          crossings.sort((a, b) => {
            const angleA = Math.atan2(a.y - cellCenterY, a.x - cellCenterX)
            const angleB = Math.atan2(b.y - cellCenterY, b.x - cellCenterX)
            return angleA - angleB
          })
          const pairs = centerVal > 0
            ? [[0, 1], [2, 3]]
            : [[0, 3], [1, 2]]
          for (const [i1, i2] of pairs) {
            const p1 = rotatePoint(crossings[i1])
            const p2 = rotatePoint(crossings[i2])

            // OPTIMIZATION: Skip if both points clearly outside bounds
            if (!inBounds(p1) && !inBounds(p2)) continue

            const p1In = inBounds(p1) && pointInPolygon(p1, workingPolygon)
            const p2In = inBounds(p2) && pointInPolygon(p2, workingPolygon)
            if (p1In && p2In) {
              const candidateSeg = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
              const clippedSegments = clipSegmentAroundHoles(candidateSeg, workingHoles)
              lines.push(...clippedSegments)
            }
          }
        }
      }
    }
  }

  return lines
}

// Generate crosshatch pattern (two sets of lines at different angles)
export function generateCrosshatchLines(
  polygonData: PolygonWithHoles,
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number,
  inset: number = 0,
  crossAngle: number = 90 // Angle between the two line sets
): HatchLine[] {
  // Generate first set of lines
  const lines1 = generateGlobalHatchLines(globalBbox, spacing, angleDegrees)
  const clipped1 = clipLinesToPolygon(lines1, polygonData, inset)

  // Generate second set of lines at crossAngle offset
  const lines2 = generateGlobalHatchLines(globalBbox, spacing, angleDegrees + crossAngle)
  const clipped2 = clipLinesToPolygon(lines2, polygonData, inset)

  return [...clipped1, ...clipped2]
}

// Generate zigzag/sawtooth pattern
export function generateZigzagLines(
  polygonData: PolygonWithHoles,
  _globalBbox: { x: number; y: number; width: number; height: number }, // Unused after optimization
  spacing: number,
  angleDegrees: number,
  amplitude: number,
  inset: number = 0
): HatchLine[] {
  const { outer } = polygonData
  if (outer.length < 3) return []

  // OPTIMIZATION: Use polygon bbox instead of global bbox diagonal
  // This significantly reduces the number of generated lines
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of outer) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const polyWidth = maxX - minX
  const polyHeight = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const angleRad = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)

  // Use polygon diagonal + padding for rotation coverage
  const diagonal = Math.sqrt(polyWidth * polyWidth + polyHeight * polyHeight)
  const padding = amplitude * 2 // Extra coverage for zigzag amplitude
  const extent = diagonal / 2 + padding

  const allLines: HatchLine[] = []
  const numRows = Math.ceil(extent * 2 / spacing) + 2

  for (let row = -numRows; row <= numRows; row++) {
    const perpOffset = row * spacing
    const numZigs = Math.ceil(extent * 2 / amplitude) + 2

    for (let zig = -numZigs; zig < numZigs; zig++) {
      // Create zigzag points
      const t1 = zig * amplitude
      const t2 = (zig + 0.5) * amplitude
      const t3 = (zig + 1) * amplitude

      // Alternate direction
      const zigOffset = (zig % 2 === 0) ? spacing / 4 : -spacing / 4

      const p1 = {
        x: centerX + perpOffset * (-sin) + t1 * cos,
        y: centerY + perpOffset * cos + t1 * sin
      }
      const p2 = {
        x: centerX + (perpOffset + zigOffset) * (-sin) + t2 * cos,
        y: centerY + (perpOffset + zigOffset) * cos + t2 * sin
      }
      const p3 = {
        x: centerX + perpOffset * (-sin) + t3 * cos,
        y: centerY + perpOffset * cos + t3 * sin
      }

      allLines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
      allLines.push({ x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y })
    }
  }

  return clipLinesToPolygon(allLines, polygonData, inset)
}

// Generate radial lines pattern (lines emanating from center)
export function generateRadialLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  startAngle: number = 0
): HatchLine[] {
  const { outer } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  // Find center and max radius
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const maxRadius = Math.sqrt(
    Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2)
  ) / 2 * 1.5

  // Calculate number of radial lines based on spacing at the perimeter
  const circumference = 2 * Math.PI * maxRadius
  const numLines = Math.max(8, Math.floor(circumference / spacing))
  const angleStep = (2 * Math.PI) / numLines
  const startAngleRad = (startAngle * Math.PI) / 180

  const allLines: HatchLine[] = []

  for (let i = 0; i < numLines; i++) {
    const angle = startAngleRad + i * angleStep
    const endX = centerX + maxRadius * Math.cos(angle)
    const endY = centerY + maxRadius * Math.sin(angle)

    allLines.push({
      x1: centerX,
      y1: centerY,
      x2: endX,
      y2: endY
    })
  }

  return clipLinesToPolygon(allLines, polygonData, inset)
}

// Generate cross-spiral pattern (two spirals at different angles)
export function generateCrossSpiralLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  angleDegrees: number = 0,
  overDiameter: number = 1.5
): HatchLine[] {
  // Generate two spirals at 90 degree offset
  const spiral1 = generateSpiralLines(polygonData, spacing, inset, angleDegrees, overDiameter)
  const spiral2 = generateSpiralLines(polygonData, spacing, inset, angleDegrees + 90, overDiameter)

  return [...spiral1, ...spiral2]
}

// Generate Hilbert curve pattern (space-filling curve)
export function generateHilbertLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0
): HatchLine[] {
  const { outer } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const width = maxX - minX
  const height = maxY - minY
  const size = Math.max(width, height)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // Calculate order so that cell size approximately equals spacing
  // cellSize = size / 2^order, so order = log2(size / spacing)
  // Max order 9 allows denser patterns (2^9 = 512 grid cells)
  const order = Math.max(2, Math.min(9, Math.round(Math.log2(size / spacing))))
  const gridSize = Math.pow(2, order)
  const cellSize = size / gridSize

  // Generate Hilbert curve points
  const points: Point[] = []

  function hilbert(x: number, y: number, ax: number, ay: number, bx: number, by: number): void {
    const w = Math.abs(ax + ay)
    const h = Math.abs(bx + by)

    const dax = ax > 0 ? 1 : ax < 0 ? -1 : 0
    const day = ay > 0 ? 1 : ay < 0 ? -1 : 0
    const dbx = bx > 0 ? 1 : bx < 0 ? -1 : 0
    const dby = by > 0 ? 1 : by < 0 ? -1 : 0

    if (h === 1) {
      for (let i = 0; i < w; i++) {
        points.push({
          x: centerX - size / 2 + (x + 0.5) * cellSize,
          y: centerY - size / 2 + (y + 0.5) * cellSize
        })
        x += dax
        y += day
      }
      return
    }

    if (w === 1) {
      for (let i = 0; i < h; i++) {
        points.push({
          x: centerX - size / 2 + (x + 0.5) * cellSize,
          y: centerY - size / 2 + (y + 0.5) * cellSize
        })
        x += dbx
        y += dby
      }
      return
    }

    const ax2 = Math.floor(ax / 2)
    const ay2 = Math.floor(ay / 2)
    const bx2 = Math.floor(bx / 2)
    const by2 = Math.floor(by / 2)

    const w2 = Math.abs(ax2 + ay2)
    const h2 = Math.abs(bx2 + by2)

    if (2 * w > 3 * h) {
      if ((ax2 & 1) !== 0 && (w2 & 1) === 0) {
        // Prefer even steps
      }
      hilbert(x, y, ax2, ay2, bx, by)
      hilbert(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by)
    } else {
      if ((bx2 & 1) !== 0 && (h2 & 1) === 0) {
        // Prefer even steps
      }
      hilbert(x, y, bx2, by2, ax2, ay2)
      hilbert(x + bx2, y + by2, ax, ay, bx - bx2, by - by2)
      hilbert(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2))
    }
  }

  // Generate the curve
  hilbert(0, 0, gridSize, 0, 0, gridSize)

  // Convert points to lines
  const allLines: HatchLine[] = []
  for (let i = 0; i < points.length - 1; i++) {
    allLines.push({
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y
    })
  }

  return clipLinesToPolygon(allLines, polygonData, inset)
}

// Generate a global Hilbert curve that spans the entire bounding box
// Used for "single pattern" mode where one curve covers all shapes
export function generateGlobalHilbertLines(
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number
): HatchLine[] {
  const size = Math.max(globalBbox.width, globalBbox.height) * 1.1 // Slight padding
  const centerX = globalBbox.x + globalBbox.width / 2
  const centerY = globalBbox.y + globalBbox.height / 2

  // Calculate order so that cell size approximately equals spacing
  // cellSize = size / 2^order, so order = log2(size / spacing)
  // Max order 9 allows denser patterns (2^9 = 512 grid cells)
  const order = Math.max(2, Math.min(9, Math.round(Math.log2(size / spacing))))
  const gridSize = Math.pow(2, order)
  const cellSize = size / gridSize

  const points: Point[] = []

  function hilbert(x: number, y: number, ax: number, ay: number, bx: number, by: number): void {
    const w = Math.abs(ax + ay)
    const h = Math.abs(bx + by)

    const dax = ax > 0 ? 1 : ax < 0 ? -1 : 0
    const day = ay > 0 ? 1 : ay < 0 ? -1 : 0
    const dbx = bx > 0 ? 1 : bx < 0 ? -1 : 0
    const dby = by > 0 ? 1 : by < 0 ? -1 : 0

    if (h === 1) {
      for (let i = 0; i < w; i++) {
        points.push({
          x: centerX - size / 2 + (x + 0.5) * cellSize,
          y: centerY - size / 2 + (y + 0.5) * cellSize
        })
        x += dax
        y += day
      }
      return
    }

    if (w === 1) {
      for (let i = 0; i < h; i++) {
        points.push({
          x: centerX - size / 2 + (x + 0.5) * cellSize,
          y: centerY - size / 2 + (y + 0.5) * cellSize
        })
        x += dbx
        y += dby
      }
      return
    }

    const ax2 = Math.floor(ax / 2)
    const ay2 = Math.floor(ay / 2)
    const bx2 = Math.floor(bx / 2)
    const by2 = Math.floor(by / 2)

    const w2 = Math.abs(ax2 + ay2)
    const h2 = Math.abs(bx2 + by2)

    if (2 * w > 3 * h) {
      if ((ax2 & 1) !== 0 && (w2 & 1) === 0) { /* prefer even */ }
      hilbert(x, y, ax2, ay2, bx, by)
      hilbert(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by)
    } else {
      if ((bx2 & 1) !== 0 && (h2 & 1) === 0) { /* prefer even */ }
      hilbert(x, y, bx2, by2, ax2, ay2)
      hilbert(x + bx2, y + by2, ax, ay, bx - bx2, by - by2)
      hilbert(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2))
    }
  }

  hilbert(0, 0, gridSize, 0, 0, gridSize)

  // Convert points to lines
  const lines: HatchLine[] = []
  for (let i = 0; i < points.length - 1; i++) {
    lines.push({
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y
    })
  }

  return lines
}

// Clip global Hilbert lines to a polygon
export function clipHilbertToPolygon(
  hilbertLines: HatchLine[],
  polygonData: PolygonWithHoles,
  inset: number = 0
): HatchLine[] {
  return clipLinesToPolygon(hilbertLines, polygonData, inset)
}

// Generate Fermat spiral (parabolic spiral - tighter, more organic than Archimedean)
export function generateFermatLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  angleDegrees: number = 0,
  overDiameter: number = 1.5
): HatchLine[] {
  const { outer, holes } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  const workingHoles = holes.map(hole => {
    if (inset > 0) {
      const centroidX = hole.reduce((sum, p) => sum + p.x, 0) / hole.length
      const centroidY = hole.reduce((sum, p) => sum + p.y, 0) / hole.length
      return hole.map(p => {
        const dx = p.x - centroidX
        const dy = p.y - centroidY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = (dist + inset) / dist
        return { x: centroidX + dx * scale, y: centroidY + dy * scale }
      })
    }
    return hole
  })

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  let maxRadius = 0
  for (const p of workingPolygon) {
    const dist = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2))
    maxRadius = Math.max(maxRadius, dist)
  }
  maxRadius *= overDiameter

  const angleOffset = (angleDegrees * Math.PI) / 180

  // Fermat spiral: r = a * sqrt(theta)
  // We want spacing between arms, so a = spacing / sqrt(2*PI)
  const a = spacing / Math.sqrt(2 * Math.PI)

  // OPTIMIZATION: Bounding box check before expensive pointInPolygon
  const inBounds = (p: Point): boolean => {
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  }

  // OPTIMIZATION: Adaptive angle step - larger steps for outer rings
  // This reduces points from 50k to ~10k while maintaining visual quality
  const getAngleStep = (currentAngle: number): number => {
    // For small angles (center), use smaller steps for smoothness
    // For larger angles (outer), use larger steps since arcs are longer
    const baseStep = 0.15 // Increased from 0.05
    const radius = a * Math.sqrt(currentAngle)
    if (radius < 1) return 0.1 // Very center needs fine detail
    // Target arc length of about spacing/2 for consistent visual density
    const targetArcLength = spacing / 2
    // Arc length = radius * angle_step, so angle_step = targetArcLength / radius
    return Math.min(0.5, Math.max(baseStep, targetArcLength / radius))
  }

  const spiralPoints: Point[] = []
  let angle = 0
  // OPTIMIZATION: Reduced point limit from 50k to 15k
  const maxPoints = 15000

  while (spiralPoints.length < maxPoints) {
    const radius = a * Math.sqrt(angle)
    if (radius > maxRadius) break

    const rotatedAngle = angle + angleOffset
    spiralPoints.push({
      x: centerX + radius * Math.cos(rotatedAngle),
      y: centerY + radius * Math.sin(rotatedAngle)
    })

    angle += getAngleStep(angle)
  }

  // Also generate the mirror spiral (Fermat has two arms)
  const mirrorPoints: Point[] = []
  angle = 0
  while (mirrorPoints.length < maxPoints) {
    const radius = a * Math.sqrt(angle)
    if (radius > maxRadius) break

    const rotatedAngle = angle + angleOffset + Math.PI // 180 degree offset
    mirrorPoints.push({
      x: centerX + radius * Math.cos(rotatedAngle),
      y: centerY + radius * Math.sin(rotatedAngle)
    })

    angle += getAngleStep(angle)
  }

  const lines: HatchLine[] = []

  // Process main spiral
  for (let i = 0; i < spiralPoints.length - 1; i++) {
    const p1 = spiralPoints[i]
    const p2 = spiralPoints[i + 1]

    // OPTIMIZATION: Skip if both points clearly outside bounds
    if (!inBounds(p1) && !inBounds(p2)) continue

    const p1In = inBounds(p1) && pointInPolygon(p1, workingPolygon)
    const p2In = inBounds(p2) && pointInPolygon(p2, workingPolygon)

    if (p1In && p2In) {
      const segment = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
      const clippedSegments = clipSegmentAroundHoles(segment, workingHoles)
      lines.push(...clippedSegments)
    }
  }

  // Process mirror spiral
  for (let i = 0; i < mirrorPoints.length - 1; i++) {
    const p1 = mirrorPoints[i]
    const p2 = mirrorPoints[i + 1]

    // OPTIMIZATION: Skip if both points clearly outside bounds
    if (!inBounds(p1) && !inBounds(p2)) continue

    const p1In = inBounds(p1) && pointInPolygon(p1, workingPolygon)
    const p2In = inBounds(p2) && pointInPolygon(p2, workingPolygon)

    if (p1In && p2In) {
      const segment = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
      const clippedSegments = clipSegmentAroundHoles(segment, workingHoles)
      lines.push(...clippedSegments)
    }
  }

  return lines
}

// Generate a global Fermat spiral that spans the entire bounding box
// Used for "single pattern" mode where one spiral covers all shapes
export function generateGlobalFermatLines(
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number = 0,
  overDiameter: number = 1.5
): HatchLine[] {
  const centerX = globalBbox.x + globalBbox.width / 2
  const centerY = globalBbox.y + globalBbox.height / 2

  // Calculate max radius to cover the entire bounding box
  const maxRadius = Math.sqrt(
    Math.pow(globalBbox.width / 2, 2) + Math.pow(globalBbox.height / 2, 2)
  ) * overDiameter

  const angleOffset = (angleDegrees * Math.PI) / 180

  // Fermat spiral: r = a * sqrt(theta)
  const a = spacing / Math.sqrt(2 * Math.PI)

  const lines: HatchLine[] = []

  // OPTIMIZATION: Adaptive angle step for consistent arc length
  const getAngleStep = (currentAngle: number): number => {
    const baseStep = 0.1 // Increased from 0.02
    const radius = a * Math.sqrt(currentAngle)
    if (radius < 1) return 0.1
    const targetArcLength = spacing / 2
    return Math.min(0.4, Math.max(baseStep, targetArcLength / radius))
  }

  // Generate main spiral
  const spiralPoints: Point[] = []
  let angle = 0
  // OPTIMIZATION: Reduced limit from 100k to 30k
  const maxPoints = 30000

  while (spiralPoints.length < maxPoints) {
    const radius = a * Math.sqrt(angle)
    if (radius > maxRadius) break

    const rotatedAngle = angle + angleOffset
    spiralPoints.push({
      x: centerX + radius * Math.cos(rotatedAngle),
      y: centerY + radius * Math.sin(rotatedAngle)
    })

    angle += getAngleStep(angle)
  }

  // Generate mirror spiral (Fermat has two arms)
  const mirrorPoints: Point[] = []
  angle = 0
  while (mirrorPoints.length < maxPoints) {
    const radius = a * Math.sqrt(angle)
    if (radius > maxRadius) break

    const rotatedAngle = angle + angleOffset + Math.PI
    mirrorPoints.push({
      x: centerX + radius * Math.cos(rotatedAngle),
      y: centerY + radius * Math.sin(rotatedAngle)
    })

    angle += getAngleStep(angle)
  }

  // Convert to lines
  for (let i = 0; i < spiralPoints.length - 1; i++) {
    lines.push({
      x1: spiralPoints[i].x,
      y1: spiralPoints[i].y,
      x2: spiralPoints[i + 1].x,
      y2: spiralPoints[i + 1].y
    })
  }

  for (let i = 0; i < mirrorPoints.length - 1; i++) {
    lines.push({
      x1: mirrorPoints[i].x,
      y1: mirrorPoints[i].y,
      x2: mirrorPoints[i + 1].x,
      y2: mirrorPoints[i + 1].y
    })
  }

  return lines
}

// Clip global Fermat lines to a polygon
export function clipFermatToPolygon(
  fermatLines: HatchLine[],
  polygonData: PolygonWithHoles,
  inset: number = 0
): HatchLine[] {
  return clipLinesToPolygon(fermatLines, polygonData, inset)
}

// Generate smooth wave/sine pattern
export function generateWaveLines(
  polygonData: PolygonWithHoles,
  _globalBbox: { x: number; y: number; width: number; height: number }, // Unused after optimization
  spacing: number,
  angleDegrees: number,
  amplitude: number,
  frequency: number,
  inset: number = 0
): HatchLine[] {
  const { outer } = polygonData
  if (outer.length < 3) return []

  // OPTIMIZATION: Use polygon bbox instead of global bbox diagonal
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of outer) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const polyWidth = maxX - minX
  const polyHeight = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const angleRad = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)

  // Use polygon diagonal + padding for rotation coverage
  const diagonal = Math.sqrt(polyWidth * polyWidth + polyHeight * polyHeight)
  const padding = amplitude * 2
  const extent = diagonal / 2 + padding

  const allLines: HatchLine[] = []
  const numRows = Math.ceil(extent * 2 / spacing) + 2

  for (let row = -numRows; row <= numRows; row++) {
    const perpOffset = row * spacing

    // Generate smooth sine wave points along this row
    // OPTIMIZATION: Adaptive point density - use larger step for smoother waves
    const wavePoints: Point[] = []
    const pointStep = Math.max(2, spacing / 2) // Coarser points for performance
    const numPoints = Math.ceil(extent * 2 / pointStep)

    for (let i = 0; i <= numPoints; i++) {
      const t = -extent + (i / numPoints) * extent * 2
      // Sine wave displacement perpendicular to line direction
      const waveOffset = Math.sin(t * frequency * 0.1) * amplitude

      const x = centerX + (perpOffset + waveOffset) * (-sin) + t * cos
      const y = centerY + (perpOffset + waveOffset) * cos + t * sin

      wavePoints.push({ x, y })
    }

    // Convert wave points to line segments
    for (let i = 0; i < wavePoints.length - 1; i++) {
      allLines.push({
        x1: wavePoints[i].x,
        y1: wavePoints[i].y,
        x2: wavePoints[i + 1].x,
        y2: wavePoints[i + 1].y
      })
    }
  }

  return clipLinesToPolygon(allLines, polygonData, inset)
}

// Seeded random number generator for reproducible scribble patterns
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

// Generate scribble/random fill pattern
export function generateScribbleLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  inset: number = 0,
  density: number = 1.0, // Multiplier for number of scribbles
  seed: number = 12345
): HatchLine[] {
  const { outer } = polygonData
  if (outer.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const width = maxX - minX
  const height = maxY - minY
  const area = width * height

  // Calculate number of scribble segments based on area and spacing
  const numSegments = Math.floor((area / (spacing * spacing)) * density * 2)

  const random = seededRandom(seed)
  const lines: HatchLine[] = []

  for (let i = 0; i < numSegments; i++) {
    // Random start point within bounding box
    const x1 = minX + random() * width
    const y1 = minY + random() * height

    // Random direction and length
    const angle = random() * Math.PI * 2
    const length = spacing * (0.5 + random() * 1.5) // Variable length

    const x2 = x1 + Math.cos(angle) * length
    const y2 = y1 + Math.sin(angle) * length

    // Check if both points are inside the polygon
    const p1Inside = pointInPolygon({ x: x1, y: y1 }, workingPolygon)
    const p2Inside = pointInPolygon({ x: x2, y: y2 }, workingPolygon)

    if (p1Inside && p2Inside) {
      lines.push({ x1, y1, x2, y2 })
    } else if (p1Inside || p2Inside) {
      // Clip to polygon boundary
      const intersections = linePolygonIntersections({ x1, y1, x2, y2 }, workingPolygon)
      if (intersections.length > 0) {
        const inside = p1Inside ? { x: x1, y: y1 } : { x: x2, y: y2 }
        const clip = intersections[0]
        lines.push({ x1: inside.x, y1: inside.y, x2: clip.x, y2: clip.y })
      }
    }
  }

  return lines
}

// Custom shape definition for tiling
export interface CustomTileShape {
  // Path data as array of points (closed polygon)
  points: Point[]
  // Scale factor (1.0 = use spacing as size)
  scale: number
}

// Tile shape type
export type TileShapeType = 'triangle' | 'square' | 'diamond' | 'hexagon' | 'star' | 'plus' | 'circle'

// Predefined tile shapes
export const TILE_SHAPES: Record<TileShapeType, Point[]> = {
  // Triangle pointing up
  triangle: [
    { x: 0, y: -0.5 },
    { x: 0.433, y: 0.25 },
    { x: -0.433, y: 0.25 }
  ],
  // Square
  square: [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 }
  ],
  // Diamond
  diamond: [
    { x: 0, y: -0.5 },
    { x: 0.5, y: 0 },
    { x: 0, y: 0.5 },
    { x: -0.5, y: 0 }
  ],
  // Hexagon
  hexagon: [
    { x: 0.5, y: 0 },
    { x: 0.25, y: 0.433 },
    { x: -0.25, y: 0.433 },
    { x: -0.5, y: 0 },
    { x: -0.25, y: -0.433 },
    { x: 0.25, y: -0.433 }
  ],
  // Star (5-pointed)
  star: [
    { x: 0, y: -0.5 },
    { x: 0.118, y: -0.154 },
    { x: 0.476, y: -0.154 },
    { x: 0.191, y: 0.059 },
    { x: 0.294, y: 0.405 },
    { x: 0, y: 0.191 },
    { x: -0.294, y: 0.405 },
    { x: -0.191, y: 0.059 },
    { x: -0.476, y: -0.154 },
    { x: -0.118, y: -0.154 }
  ],
  // Plus/Cross
  plus: [
    { x: -0.167, y: -0.5 },
    { x: 0.167, y: -0.5 },
    { x: 0.167, y: -0.167 },
    { x: 0.5, y: -0.167 },
    { x: 0.5, y: 0.167 },
    { x: 0.167, y: 0.167 },
    { x: 0.167, y: 0.5 },
    { x: -0.167, y: 0.5 },
    { x: -0.167, y: 0.167 },
    { x: -0.5, y: 0.167 },
    { x: -0.5, y: -0.167 },
    { x: -0.167, y: -0.167 }
  ],
  // Circle approximation (12-sided)
  circle: Array.from({ length: 12 }, (_, i) => ({
    x: 0.5 * Math.cos((i / 12) * Math.PI * 2),
    y: 0.5 * Math.sin((i / 12) * Math.PI * 2)
  }))
}

// Generate custom tile pattern
export function generateCustomTileLines(
  polygonData: PolygonWithHoles,
  spacing: number,
  tileShape: Point[],
  inset: number = 0,
  angleDegrees: number = 0,
  fillTiles: boolean = false, // If true, fill tiles; if false, just outline
  tileGap: number = 0, // Extra gap between tiles (added to spacing)
  tileScale: number = 1.0, // Scale factor for tile size (0.5 = half size, 2.0 = double)
  rotateOffsetDegrees: number = 0 // Rotation offset applied incrementally to each tile
): HatchLine[] {
  const { outer } = polygonData
  if (outer.length < 3 || tileShape.length < 3) return []

  let workingPolygon = outer
  if (inset > 0) {
    workingPolygon = offsetPolygon(outer, -inset)
    if (workingPolygon.length < 3) return []
  }

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of workingPolygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const angleRad = (angleDegrees * Math.PI) / 180
  const rotateOffsetRad = (rotateOffsetDegrees * Math.PI) / 180

  const lines: HatchLine[] = []

  // Grid spacing = base spacing + gap between tiles
  const gridSpacing = spacing + tileGap
  const gridPadding = gridSpacing

  // Clamp tile scale to reasonable range
  const clampedScale = Math.max(0.1, Math.min(3.0, tileScale))

  // OPTIMIZATION: Pre-compute tile radius for quick bbox test
  const tileRadius = spacing * 0.75 * clampedScale // Approximate tile extent from center

  // Track tile index for rotation offset
  let tileIndex = 0

  // Grid of tile positions (uses gridSpacing for distance between centers)
  for (let y = minY - gridPadding; y <= maxY + gridPadding; y += gridSpacing) {
    for (let x = minX - gridPadding; x <= maxX + gridPadding; x += gridSpacing) {
      // OPTIMIZATION: Quick bbox rejection before any expensive operations
      // Skip tiles whose bounding circle doesn't intersect polygon bbox
      if (x + tileRadius < minX || x - tileRadius > maxX ||
          y + tileRadius < minY || y - tileRadius > maxY) {
        continue
      }

      // Calculate rotation for this tile: base angle + incremental offset
      const tileAngle = angleRad + (tileIndex * rotateOffsetRad)
      const cosA = Math.cos(tileAngle)
      const sinA = Math.sin(tileAngle)

      // Transform tile points to this position
      // Tile size is based on spacing * scale (not affected by gap)
      const transformedPoints: Point[] = tileShape.map(p => {
        const sx = p.x * spacing * clampedScale
        const sy = p.y * spacing * clampedScale
        // Rotate around origin
        const rx = sx * cosA - sy * sinA
        const ry = sx * sinA + sy * cosA
        // Translate
        return { x: x + rx, y: y + ry }
      })

      tileIndex++

      // OPTIMIZATION: First check if center is inside bbox before expensive pointInPolygon
      const centerInBbox = x >= minX && x <= maxX && y >= minY && y <= maxY
      const centerInPolygon = centerInBbox && pointInPolygon({ x, y }, workingPolygon)

      if (!centerInPolygon) {
        // Check if any vertex is inside (with bbox pre-check)
        const anyInside = transformedPoints.some(p =>
          p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY &&
          pointInPolygon(p, workingPolygon)
        )
        if (!anyInside) continue
      }

      // Draw tile edges
      for (let i = 0; i < transformedPoints.length; i++) {
        const p1 = transformedPoints[i]
        const p2 = transformedPoints[(i + 1) % transformedPoints.length]

        // OPTIMIZATION: bbox check before pointInPolygon
        const p1InBbox = p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY
        const p2InBbox = p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY
        const p1Inside = p1InBbox && pointInPolygon(p1, workingPolygon)
        const p2Inside = p2InBbox && pointInPolygon(p2, workingPolygon)

        if (p1Inside && p2Inside) {
          lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
        } else if (p1Inside || p2Inside) {
          // Clip to polygon
          const intersections = linePolygonIntersections(
            { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
            workingPolygon
          )
          if (intersections.length > 0) {
            const inside = p1Inside ? p1 : p2
            lines.push({ x1: inside.x, y1: inside.y, x2: intersections[0].x, y2: intersections[0].y })
          }
        }
      }

      // If fillTiles, add diagonal lines inside each tile
      if (fillTiles) {
        // Simple diagonal fill for the tile
        const tileMinX = Math.min(...transformedPoints.map(p => p.x))
        const tileMaxX = Math.max(...transformedPoints.map(p => p.x))
        const tileMinY = Math.min(...transformedPoints.map(p => p.y))
        const tileMaxY = Math.max(...transformedPoints.map(p => p.y))

        const step = spacing / 4
        for (let ty = tileMinY; ty <= tileMaxY; ty += step) {
          const lineStart = { x: tileMinX, y: ty }
          const lineEnd = { x: tileMaxX, y: ty }

          // Clip to both tile shape and main polygon
          if (pointInPolygon(lineStart, workingPolygon) && pointInPolygon(lineEnd, workingPolygon)) {
            lines.push({ x1: lineStart.x, y1: lineStart.y, x2: lineEnd.x, y2: lineEnd.y })
          }
        }
      }
    }
  }

  // Remove duplicate lines
  const uniqueLines: HatchLine[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const key1 = `${line.x1.toFixed(1)},${line.y1.toFixed(1)}-${line.x2.toFixed(1)},${line.y2.toFixed(1)}`
    const key2 = `${line.x2.toFixed(1)},${line.y2.toFixed(1)}-${line.x1.toFixed(1)},${line.y1.toFixed(1)}`

    if (!seen.has(key1) && !seen.has(key2)) {
      seen.add(key1)
      uniqueLines.push(line)
    }
  }

  return uniqueLines
}

// distance() is now imported from geometry.ts

// Calculate the centroid of a set of lines
function calculateShapeCentroid(lines: HatchLine[]): Point {
  if (lines.length === 0) return { x: 0, y: 0 }

  let sumX = 0
  let sumY = 0
  let count = 0

  for (const line of lines) {
    sumX += line.x1 + line.x2
    sumY += line.y1 + line.y2
    count += 2
  }

  return { x: sumX / count, y: sumY / count }
}

// Get the top-left-most point of a shape
function getShapeTopLeft(lines: HatchLine[]): Point {
  if (lines.length === 0) return { x: Infinity, y: Infinity }

  let minX = Infinity
  let minY = Infinity

  for (const line of lines) {
    minX = Math.min(minX, line.x1, line.x2)
    minY = Math.min(minY, line.y1, line.y2)
  }

  return { x: minX, y: minY }
}

// Get the entry and exit points of a shape's optimized lines
function getShapeEndpoints(lines: HatchLine[]): { entry: Point; exit: Point } {
  if (lines.length === 0) {
    return { entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 } }
  }
  return {
    entry: { x: lines[0].x1, y: lines[0].y1 },
    exit: { x: lines[lines.length - 1].x2, y: lines[lines.length - 1].y2 }
  }
}

// Reverse all lines in a shape (for traversing in opposite direction)
function reverseShapeLines(lines: OrderedLine[]): OrderedLine[] {
  return lines.map(line => ({
    ...line,
    x1: line.x2,
    y1: line.y2,
    x2: line.x1,
    y2: line.y1,
    reversed: !line.reversed
  })).reverse()
}

// Thresholds for optimization - skip expensive algorithms for large datasets
const OPTIMIZATION_LINE_THRESHOLD = 5000 // Skip within-shape optimization above this
const OPTIMIZATION_SHAPE_THRESHOLD = 200 // Skip 2-opt improvement above this many shapes
const ENDPOINT_TOLERANCE = 0.01 // Tolerance for matching endpoints (in SVG units)

// ============= LINE JOINING OPTIMIZATION =============
// Joins lines that share endpoints into continuous paths to reduce pen lifts

interface EndpointEntry {
  lineIndex: number
  isStart: boolean // true = start of line, false = end of line
}

// Build spatial index of endpoints using a grid for O(1) lookup
function buildEndpointGrid(
  lines: HatchLine[],
  tolerance: number
): Map<string, EndpointEntry[]> {
  const grid = new Map<string, EndpointEntry[]>()
  const cellSize = tolerance * 10 // Grid cell size

  const getKey = (x: number, y: number): string => {
    const cx = Math.floor(x / cellSize)
    const cy = Math.floor(y / cellSize)
    return `${cx},${cy}`
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Add start point
    const startKey = getKey(line.x1, line.y1)
    if (!grid.has(startKey)) grid.set(startKey, [])
    grid.get(startKey)!.push({ lineIndex: i, isStart: true })

    // Add end point
    const endKey = getKey(line.x2, line.y2)
    if (!grid.has(endKey)) grid.set(endKey, [])
    grid.get(endKey)!.push({ lineIndex: i, isStart: false })
  }

  return grid
}

// Find all endpoints near a given point
function findNearbyEndpoints(
  point: Point,
  grid: Map<string, EndpointEntry[]>,
  lines: HatchLine[],
  usedLines: Set<number>,
  tolerance: number
): Array<{ entry: EndpointEntry; dist: number }> {
  const cellSize = tolerance * 10
  const cx = Math.floor(point.x / cellSize)
  const cy = Math.floor(point.y / cellSize)

  const results: Array<{ entry: EndpointEntry; dist: number }> = []

  // Check current cell and all 8 neighbors
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cx + dx},${cy + dy}`
      const entries = grid.get(key)
      if (!entries) continue

      for (const entry of entries) {
        if (usedLines.has(entry.lineIndex)) continue

        const line = lines[entry.lineIndex]
        const endPoint = entry.isStart
          ? { x: line.x1, y: line.y1 }
          : { x: line.x2, y: line.y2 }

        const dist = distance(point, endPoint)
        if (dist <= tolerance) {
          results.push({ entry, dist })
        }
      }
    }
  }

  // Sort by distance
  results.sort((a, b) => a.dist - b.dist)
  return results
}

// Join lines into continuous paths
export function joinContinuousLines(
  lines: HatchLine[],
  pathId: string,
  color: string,
  startingPoint: Point,
  startingIndex: number,
  tolerance: number = ENDPOINT_TOLERANCE
): { orderedLines: OrderedLine[]; endPoint: Point } {
  if (lines.length === 0) return { orderedLines: [], endPoint: startingPoint }

  const grid = buildEndpointGrid(lines, tolerance)
  const usedLines = new Set<number>()
  const result: OrderedLine[] = []
  let currentPoint = startingPoint
  let globalIndex = startingIndex

  while (usedLines.size < lines.length) {
    // First, try to find a line that connects to current position
    const connected = findNearbyEndpoints(currentPoint, grid, lines, usedLines, tolerance)

    if (connected.length > 0) {
      // Found a connecting line - use it
      const { entry } = connected[0]
      const line = lines[entry.lineIndex]
      usedLines.add(entry.lineIndex)

      // If we connected to the END of the line, reverse it
      const shouldReverse = !entry.isStart

      if (shouldReverse) {
        result.push({
          x1: line.x2,
          y1: line.y2,
          x2: line.x1,
          y2: line.y1,
          pathId,
          color,
          originalIndex: globalIndex++,
          reversed: true
        })
        currentPoint = { x: line.x1, y: line.y1 }
      } else {
        result.push({
          x1: line.x1,
          y1: line.y1,
          x2: line.x2,
          y2: line.y2,
          pathId,
          color,
          originalIndex: globalIndex++,
          reversed: false
        })
        currentPoint = { x: line.x2, y: line.y2 }
      }
    } else {
      // No connecting line found - need to lift pen and find nearest unvisited line
      let bestIndex = -1
      let bestDistance = Infinity
      let bestIsStart = true

      for (let i = 0; i < lines.length; i++) {
        if (usedLines.has(i)) continue

        const line = lines[i]
        const distToStart = distance(currentPoint, { x: line.x1, y: line.y1 })
        const distToEnd = distance(currentPoint, { x: line.x2, y: line.y2 })

        if (distToStart < bestDistance) {
          bestDistance = distToStart
          bestIndex = i
          bestIsStart = true
        }
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd
          bestIndex = i
          bestIsStart = false
        }
      }

      if (bestIndex >= 0) {
        const line = lines[bestIndex]
        usedLines.add(bestIndex)

        if (!bestIsStart) {
          // Start from end, so reverse
          result.push({
            x1: line.x2,
            y1: line.y2,
            x2: line.x1,
            y2: line.y1,
            pathId,
            color,
            originalIndex: globalIndex++,
            reversed: true
          })
          currentPoint = { x: line.x1, y: line.y1 }
        } else {
          result.push({
            x1: line.x1,
            y1: line.y1,
            x2: line.x2,
            y2: line.y2,
            pathId,
            color,
            originalIndex: globalIndex++,
            reversed: false
          })
          currentPoint = { x: line.x2, y: line.y2 }
        }
      }
    }
  }

  return { orderedLines: result, endPoint: currentPoint }
}

// Multi-pass optimization for line ordering with 2-opt improvement
export function optimizeLineOrderMultiPass(
  hatchedPaths: { pathInfo: { id: string; color: string }; lines: HatchLine[] }[]
): OrderedLine[] {
  if (hatchedPaths.length === 0) return []

  // Count total lines to decide optimization level
  const totalLines = hatchedPaths.reduce((sum, p) => sum + p.lines.length, 0)
  const skipWithinShapeOptimization = totalLines > OPTIMIZATION_LINE_THRESHOLD
  const skipTwoOptImprovement = hatchedPaths.length > OPTIMIZATION_SHAPE_THRESHOLD

  if (skipWithinShapeOptimization) {
  }

  // ===== PASS 1: Initial ordering with nearest-neighbor =====
  const shapes = hatchedPaths.map(({ pathInfo, lines }) => ({
    pathId: pathInfo.id,
    color: pathInfo.color,
    lines: [...lines],
    centroid: calculateShapeCentroid(lines),
    topLeft: getShapeTopLeft(lines)
  }))

  // Order shapes by nearest-neighbor starting from origin
  const orderedShapes: typeof shapes = []
  const remainingShapes = [...shapes]
  let currentPoint: Point = { x: 0, y: 0 }

  while (remainingShapes.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity

    for (let i = 0; i < remainingShapes.length; i++) {
      const dist = distance(currentPoint, remainingShapes[i].topLeft)
      if (dist < bestDistance) {
        bestDistance = dist
        bestIndex = i
      }
    }

    const chosen = remainingShapes.splice(bestIndex, 1)[0]
    orderedShapes.push(chosen)
    currentPoint = chosen.centroid
  }

  // Optimize lines within each shape and track endpoints
  interface OptimizedShape {
    pathId: string
    color: string
    lines: OrderedLine[]
    entry: Point
    exit: Point
    reversed: boolean
  }

  const optimizedShapes: OptimizedShape[] = []
  let penPosition: Point = { x: 0, y: 0 }
  let globalIndex = 0

  for (const shape of orderedShapes) {
    let orderedLines: OrderedLine[]
    let endPoint: Point

    if (skipWithinShapeOptimization) {
      // Fast path: just convert lines to OrderedLine without optimization
      orderedLines = shape.lines.map((line, idx) => ({
        ...line,
        pathId: shape.pathId,
        color: shape.color,
        originalIndex: globalIndex + idx,
        reversed: false
      }))
      endPoint = orderedLines.length > 0
        ? { x: orderedLines[orderedLines.length - 1].x2, y: orderedLines[orderedLines.length - 1].y2 }
        : penPosition
    } else {
      // Full optimization: join continuous lines and nearest-neighbor for disconnected ones
      const result = joinContinuousLines(
        shape.lines,
        shape.pathId,
        shape.color,
        penPosition,
        globalIndex
      )
      orderedLines = result.orderedLines
      endPoint = result.endPoint
    }

    const endpoints = getShapeEndpoints(orderedLines)
    optimizedShapes.push({
      pathId: shape.pathId,
      color: shape.color,
      lines: orderedLines,
      entry: endpoints.entry,
      exit: endpoints.exit,
      reversed: false
    })

    globalIndex += orderedLines.length
    penPosition = endPoint
  }

  // ===== PASS 2: 2-opt style improvement =====
  // Try reversing individual shapes and swapping adjacent pairs
  // Skip for large shape counts

  if (optimizedShapes.length > 1 && !skipTwoOptImprovement) {
    let improved = true
    let iterations = 0
    const maxIterations = optimizedShapes.length * 2 // Limit iterations

    while (improved && iterations < maxIterations) {
      improved = false
      iterations++

      // Try reversing each shape
      for (let i = 0; i < optimizedShapes.length; i++) {
        const shape = optimizedShapes[i]
        const prevExit = i === 0 ? { x: 0, y: 0 } : optimizedShapes[i - 1].exit
        const nextEntry = i < optimizedShapes.length - 1 ? optimizedShapes[i + 1].entry : null

        // Current distances
        const currentEntryDist = distance(prevExit, shape.entry)
        const currentExitDist = nextEntry ? distance(shape.exit, nextEntry) : 0

        // If reversed
        const reversedEntryDist = distance(prevExit, shape.exit)
        const reversedExitDist = nextEntry ? distance(shape.entry, nextEntry) : 0

        if (reversedEntryDist + reversedExitDist < currentEntryDist + currentExitDist - 0.01) {
          // Reverse this shape
          shape.lines = reverseShapeLines(shape.lines)
          const temp = shape.entry
          shape.entry = shape.exit
          shape.exit = temp
          shape.reversed = !shape.reversed
          improved = true
        }
      }

      // Try swapping adjacent pairs
      for (let i = 0; i < optimizedShapes.length - 1; i++) {
        const shapeA = optimizedShapes[i]
        const shapeB = optimizedShapes[i + 1]
        const prevExit = i === 0 ? { x: 0, y: 0 } : optimizedShapes[i - 1].exit
        const nextEntry = i < optimizedShapes.length - 2 ? optimizedShapes[i + 2].entry : null

        // Current: prev -> A -> B -> next
        const currentDist = distance(prevExit, shapeA.entry) +
                           distance(shapeA.exit, shapeB.entry) +
                           (nextEntry ? distance(shapeB.exit, nextEntry) : 0)

        // Swapped: prev -> B -> A -> next
        const swappedDist = distance(prevExit, shapeB.entry) +
                           distance(shapeB.exit, shapeA.entry) +
                           (nextEntry ? distance(shapeA.exit, nextEntry) : 0)

        if (swappedDist < currentDist - 0.01) {
          // Swap shapes
          optimizedShapes[i] = shapeB
          optimizedShapes[i + 1] = shapeA
          improved = true
        }
      }
    }
  }

  // ===== Reassemble final result with updated indices =====
  const result: OrderedLine[] = []
  globalIndex = 0

  for (const shape of optimizedShapes) {
    for (const line of shape.lines) {
      result.push({
        ...line,
        originalIndex: globalIndex++
      })
    }
  }

  return result
}

// Calculate total travel distance
export function calculateTravelDistance(lines: OrderedLine[]): number {
  if (lines.length <= 1) return 0

  let totalDistance = 0
  for (let i = 1; i < lines.length; i++) {
    const prevEnd = { x: lines[i - 1].x2, y: lines[i - 1].y2 }
    const currStart = { x: lines[i].x1, y: lines[i].y1 }
    totalDistance += distance(prevEnd, currStart)
  }
  return totalDistance
}
