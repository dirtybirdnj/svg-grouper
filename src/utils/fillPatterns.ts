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

export type FillPatternType = 'lines' | 'concentric' | 'wiggle' | 'spiral' | 'honeycomb' | 'gyroid'

// Generate concentric fill lines (snake pattern from outside in)
export function generateConcentricLines(
  polygon: Point[],
  spacing: number,
  connectLoops: boolean = true
): HatchLine[] {
  const lines: HatchLine[] = []
  if (polygon.length < 3) return lines

  const minArea = spacing * spacing

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

  for (let loopCount = 0; loopCount < maxLoops; loopCount++) {
    const area = Math.abs(polygonSignedArea(currentPolygon))

    if (currentPolygon.length < 3 || area < minArea) break

    loops.push([...currentPolygon])
    currentPolygon = offsetPolygonInward(currentPolygon, spacing)

    if (currentPolygon.length < 3) break

    const newArea = Math.abs(polygonSignedArea(currentPolygon))
    if (newArea >= area) break
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
  const padding = hexSize * 2

  let row = 0
  for (let y = minY - padding; y <= maxY + padding; y += vertSpacing * 0.5) {
    const isOddRow = row % 2 === 1
    const xOffset = isOddRow ? horizSpacing * 0.5 : 0

    for (let x = minX - padding + xOffset; x <= maxX + padding; x += horizSpacing) {
      const rotatedCenter = rotatePoint({ x, y })

      const hexPoints: Point[] = []
      for (let i = 0; i < 6; i++) {
        const hexAngle = (Math.PI / 3) * i
        const unrotated = {
          x: x + hexSize * Math.cos(hexAngle),
          y: y + hexSize * Math.sin(hexAngle)
        }
        hexPoints.push(rotatePoint(unrotated))
      }

      const anyVertexInside = hexPoints.some(p => pointInPolygon(p, workingPolygon))
      const centerInside = pointInPolygon(rotatedCenter, workingPolygon)

      if (anyVertexInside || centerInside) {
        for (let i = 0; i < 6; i++) {
          const p1 = hexPoints[i]
          const p2 = hexPoints[(i + 1) % 6]

          const p1Inside = pointInPolygon(p1, workingPolygon)
          const p2Inside = pointInPolygon(p2, workingPolygon)

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
  const angleStep = 0.1
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
    if (spiralPoints.length > 10000) break
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
  const angleStep = 0.1 // radians per step
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

    // Safety limit
    if (spiralPoints.length > 50000) break
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

  const rotatePoint = (p: Point): Point => {
    const dx = p.x - centerX
    const dy = p.y - centerY
    return {
      x: centerX + dx * Math.cos(angleRad) - dy * Math.sin(angleRad),
      y: centerY + dx * Math.sin(angleRad) + dy * Math.cos(angleRad)
    }
  }

  const lines: HatchLine[] = []
  const scale = (2 * Math.PI) / spacing
  const gridStep = spacing / 8
  const padding = spacing * 2

  const zValues = [0, Math.PI / 2]

  for (const zVal of zValues) {
    const sinZ = Math.sin(zVal)
    const cosZ = Math.cos(zVal)

    const gyroidFunc = (x: number, y: number): number => {
      const sx = Math.sin(x * scale)
      const cx = Math.cos(x * scale)
      const sy = Math.sin(y * scale)
      const cy = Math.cos(y * scale)
      return sx * cy + sy * cosZ + sinZ * cx
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
            const p1In = pointInPolygon(p1, workingPolygon)
            const p2In = pointInPolygon(p2, workingPolygon)

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
              const p1In = pointInPolygon(p1, workingPolygon)
              const p2In = pointInPolygon(p2, workingPolygon)
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
  }

  return lines
}

// distance() is now imported from geometry.ts

// Optimize lines within a single shape using nearest-neighbor algorithm
function optimizeLinesWithinShape(
  lines: HatchLine[],
  pathId: string,
  color: string,
  startingPoint: Point,
  startingIndex: number
): { orderedLines: OrderedLine[]; endPoint: Point } {
  if (lines.length === 0) return { orderedLines: [], endPoint: startingPoint }

  const result: OrderedLine[] = []
  const remaining = [...lines]
  let currentPoint = startingPoint
  let globalIndex = startingIndex

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

    for (let i = 0; i < remaining.length; i++) {
      const line = remaining[i]
      const start = { x: line.x1, y: line.y1 }
      const end = { x: line.x2, y: line.y2 }

      const distToStart = distance(currentPoint, start)
      if (distToStart < bestDistance) {
        bestDistance = distToStart
        bestIndex = i
        shouldReverse = false
      }

      const distToEnd = distance(currentPoint, end)
      if (distToEnd < bestDistance) {
        bestDistance = distToEnd
        bestIndex = i
        shouldReverse = true
      }
    }

    const chosenLine = remaining.splice(bestIndex, 1)[0]

    if (shouldReverse) {
      result.push({
        x1: chosenLine.x2,
        y1: chosenLine.y2,
        x2: chosenLine.x1,
        y2: chosenLine.y1,
        pathId,
        color,
        originalIndex: globalIndex++,
        reversed: true
      })
      currentPoint = { x: chosenLine.x1, y: chosenLine.y1 }
    } else {
      result.push({
        ...chosenLine,
        pathId,
        color,
        originalIndex: globalIndex++,
        reversed: false
      })
      currentPoint = { x: chosenLine.x2, y: chosenLine.y2 }
    }
  }

  return { orderedLines: result, endPoint: currentPoint }
}

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

// Multi-pass optimization for line ordering
export function optimizeLineOrderMultiPass(
  hatchedPaths: { pathInfo: { id: string; color: string }; lines: HatchLine[] }[]
): OrderedLine[] {
  if (hatchedPaths.length === 0) return []

  const shapes = hatchedPaths.map(({ pathInfo, lines }) => ({
    pathId: pathInfo.id,
    color: pathInfo.color,
    lines: [...lines],
    centroid: calculateShapeCentroid(lines),
    topLeft: getShapeTopLeft(lines)
  }))

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

  let result: OrderedLine[] = []
  let penPosition: Point = { x: 0, y: 0 }
  let globalIndex = 0

  for (const shape of orderedShapes) {
    const { orderedLines, endPoint } = optimizeLinesWithinShape(
      shape.lines,
      shape.pathId,
      shape.color,
      penPosition,
      globalIndex
    )

    for (const line of orderedLines) {
      line.originalIndex = globalIndex++
    }

    result = result.concat(orderedLines)
    penPosition = endPoint
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
