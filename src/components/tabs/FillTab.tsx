import { useState, useMemo, useRef, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import './FillTab.css'

interface FillPathInfo {
  id: string
  type: string
  color: string
  pathData: string
  element: Element
}

interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Point {
  x: number
  y: number
}

interface OrderedLine extends HatchLine {
  originalIndex: number
  pathId: string
  color: string
  reversed: boolean
}

// Get polygon points from an SVG element
function getPolygonPoints(element: Element): Point[] {
  const points: Point[] = []
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'polygon' || tagName === 'polyline') {
    const pointsAttr = element.getAttribute('points') || ''
    const pairs = pointsAttr.trim().split(/[\s,]+/)
    for (let i = 0; i < pairs.length - 1; i += 2) {
      points.push({ x: parseFloat(pairs[i]), y: parseFloat(pairs[i + 1]) })
    }
  } else if (tagName === 'rect') {
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const w = parseFloat(element.getAttribute('width') || '0')
    const h = parseFloat(element.getAttribute('height') || '0')
    points.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h })
  } else if (tagName === 'path') {
    // Parse path data to extract polygon points
    // This handles simple paths - for complex curves, we'd need to sample them
    const d = element.getAttribute('d') || ''
    const commands = d.match(/[MLHVCZmlhvcsqtaz][^MLHVCZmlhvcsqtaz]*/gi) || []
    let currentX = 0, currentY = 0
    let startX = 0, startY = 0

    for (const cmd of commands) {
      const type = cmd[0]
      const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))

      switch (type) {
        case 'M':
          currentX = args[0]
          currentY = args[1]
          startX = currentX
          startY = currentY
          points.push({ x: currentX, y: currentY })
          // Handle implicit lineto after moveto
          for (let i = 2; i < args.length; i += 2) {
            currentX = args[i]
            currentY = args[i + 1]
            points.push({ x: currentX, y: currentY })
          }
          break
        case 'm':
          currentX += args[0]
          currentY += args[1]
          startX = currentX
          startY = currentY
          points.push({ x: currentX, y: currentY })
          for (let i = 2; i < args.length; i += 2) {
            currentX += args[i]
            currentY += args[i + 1]
            points.push({ x: currentX, y: currentY })
          }
          break
        case 'L':
          for (let i = 0; i < args.length; i += 2) {
            currentX = args[i]
            currentY = args[i + 1]
            points.push({ x: currentX, y: currentY })
          }
          break
        case 'l':
          for (let i = 0; i < args.length; i += 2) {
            currentX += args[i]
            currentY += args[i + 1]
            points.push({ x: currentX, y: currentY })
          }
          break
        case 'H':
          currentX = args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'h':
          currentX += args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'V':
          currentY = args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'v':
          currentY += args[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'Z':
        case 'z':
          currentX = startX
          currentY = startY
          break
        // For curves, we'll sample points along them
        case 'C':
          for (let i = 0; i < args.length; i += 6) {
            // Sample cubic bezier
            const x0 = currentX, y0 = currentY
            const x1 = args[i], y1 = args[i + 1]
            const x2 = args[i + 2], y2 = args[i + 3]
            const x3 = args[i + 4], y3 = args[i + 5]
            for (let t = 0.1; t <= 1; t += 0.1) {
              const mt = 1 - t
              const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
              const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
              points.push({ x: px, y: py })
            }
            currentX = x3
            currentY = y3
          }
          break
        case 'c':
          for (let i = 0; i < args.length; i += 6) {
            const x0 = currentX, y0 = currentY
            const x1 = currentX + args[i], y1 = currentY + args[i + 1]
            const x2 = currentX + args[i + 2], y2 = currentY + args[i + 3]
            const x3 = currentX + args[i + 4], y3 = currentY + args[i + 5]
            for (let t = 0.1; t <= 1; t += 0.1) {
              const mt = 1 - t
              const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
              const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
              points.push({ x: px, y: py })
            }
            currentX = x3
            currentY = y3
          }
          break
      }
    }
  } else if (tagName === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const r = parseFloat(element.getAttribute('r') || '0')
    // Approximate circle with polygon
    const segments = 32
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    }
  } else if (tagName === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const rx = parseFloat(element.getAttribute('rx') || '0')
    const ry = parseFloat(element.getAttribute('ry') || '0')
    const segments = 32
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
    }
  }

  return points
}

// Line segment intersection with polygon edge
function lineSegmentIntersection(
  p1: Point, p2: Point, // Line segment
  p3: Point, p4: Point  // Polygon edge
): Point | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y)
  if (Math.abs(denom) < 1e-10) return null // Parallel

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom

  // Check if intersection is within both segments
  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y)
    }
  }
  return null
}

// Find all intersections of a line with a polygon
function linePolygonIntersections(line: HatchLine, polygon: Point[]): Point[] {
  const intersections: Point[] = []
  const p1 = { x: line.x1, y: line.y1 }
  const p2 = { x: line.x2, y: line.y2 }

  for (let i = 0; i < polygon.length; i++) {
    const p3 = polygon[i]
    const p4 = polygon[(i + 1) % polygon.length]
    const intersection = lineSegmentIntersection(p1, p2, p3, p4)
    if (intersection) {
      intersections.push(intersection)
    }
  }

  // Sort intersections along the line direction
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  intersections.sort((a, b) => {
    const ta = Math.abs(dx) > Math.abs(dy) ? (a.x - p1.x) / dx : (a.y - p1.y) / dy
    const tb = Math.abs(dx) > Math.abs(dy) ? (b.x - p1.x) / dx : (b.y - p1.y) / dy
    return ta - tb
  })

  return intersections
}

// Generate a grid of hatch lines covering a large area, aligned to origin
// This ensures consistent alignment across all shapes
function generateGlobalHatchLines(
  globalBbox: { x: number; y: number; width: number; height: number },
  spacing: number,
  angleDegrees: number
): HatchLine[] {
  const lines: HatchLine[] = []
  const angleRad = (angleDegrees * Math.PI) / 180

  // Extend bbox to ensure full coverage
  const padding = Math.max(globalBbox.width, globalBbox.height)
  const width = globalBbox.width + padding * 2
  const height = globalBbox.height + padding * 2

  // Calculate diagonal for line extent
  const diagonal = Math.sqrt(width * width + height * height) * 2

  // Direction perpendicular to hatch lines (for stepping)
  const perpX = Math.cos(angleRad + Math.PI / 2)
  const perpY = Math.sin(angleRad + Math.PI / 2)

  // Direction along hatch lines
  const dirX = Math.cos(angleRad)
  const dirY = Math.sin(angleRad)

  // Start from origin (0,0) to ensure global alignment
  // Calculate how many lines we need in each direction from origin
  const centerX = 0
  const centerY = 0

  const numLines = Math.ceil(diagonal / spacing) + 1

  for (let i = -numLines; i <= numLines; i++) {
    const offset = i * spacing
    const lineCenterX = centerX + perpX * offset
    const lineCenterY = centerY + perpY * offset

    lines.push({
      x1: lineCenterX - dirX * diagonal,
      y1: lineCenterY - dirY * diagonal,
      x2: lineCenterX + dirX * diagonal,
      y2: lineCenterY + dirY * diagonal
    })
  }

  return lines
}

// Clip a set of lines to a polygon, returning only the segments inside
function clipLinesToPolygon(
  lines: HatchLine[],
  polygon: Point[],
  inset: number = 0
): HatchLine[] {
  const clippedLines: HatchLine[] = []
  if (polygon.length < 3) return clippedLines

  // Apply inset to polygon if needed
  let workingPolygon = polygon
  if (inset > 0) {
    // Simple inset: shrink polygon toward centroid
    const centroidX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length
    const centroidY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
    workingPolygon = polygon.map(p => {
      const dx = p.x - centroidX
      const dy = p.y - centroidY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < inset) return { x: centroidX, y: centroidY }
      const scale = (dist - inset) / dist
      return { x: centroidX + dx * scale, y: centroidY + dy * scale }
    })
  }

  for (const line of lines) {
    const intersections = linePolygonIntersections(line, workingPolygon)

    // Create line segments from pairs of intersections
    for (let j = 0; j < intersections.length - 1; j += 2) {
      if (j + 1 < intersections.length) {
        clippedLines.push({
          x1: intersections[j].x,
          y1: intersections[j].y,
          x2: intersections[j + 1].x,
          y2: intersections[j + 1].y
        })
      }
    }
  }

  return clippedLines
}

// Calculate distance between two points
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Get the start and end points of a line
function lineEndpoints(line: HatchLine): { start: Point; end: Point } {
  return {
    start: { x: line.x1, y: line.y1 },
    end: { x: line.x2, y: line.y2 }
  }
}

// Optimize line order using nearest-neighbor algorithm (greedy TSP approximation)
// Also considers reversing lines to minimize travel distance
function optimizeLineOrder(
  lines: { line: HatchLine; pathId: string; color: string; originalIndex: number }[]
): OrderedLine[] {
  if (lines.length === 0) return []
  if (lines.length === 1) {
    const { line, pathId, color, originalIndex } = lines[0]
    return [{ ...line, pathId, color, originalIndex, reversed: false }]
  }

  const result: OrderedLine[] = []
  const remaining = [...lines]

  // Start with the first line (could also start from top-left corner)
  const first = remaining.shift()!
  result.push({ ...first.line, pathId: first.pathId, color: first.color, originalIndex: first.originalIndex, reversed: false })

  let currentEnd = lineEndpoints(first.line).end

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    let shouldReverse = false

    // Find the nearest line (considering both orientations)
    for (let i = 0; i < remaining.length; i++) {
      const { start, end } = lineEndpoints(remaining[i].line)

      // Distance to start of line (normal orientation)
      const distToStart = distance(currentEnd, start)
      if (distToStart < bestDistance) {
        bestDistance = distToStart
        bestIndex = i
        shouldReverse = false
      }

      // Distance to end of line (reversed orientation)
      const distToEnd = distance(currentEnd, end)
      if (distToEnd < bestDistance) {
        bestDistance = distToEnd
        bestIndex = i
        shouldReverse = true
      }
    }

    const chosen = remaining.splice(bestIndex, 1)[0]
    const { line, pathId, color, originalIndex } = chosen

    if (shouldReverse) {
      // Reverse the line direction
      result.push({
        x1: line.x2,
        y1: line.y2,
        x2: line.x1,
        y2: line.y1,
        pathId,
        color,
        originalIndex,
        reversed: true
      })
      currentEnd = { x: line.x1, y: line.y1 }
    } else {
      result.push({ ...line, pathId, color, originalIndex, reversed: false })
      currentEnd = { x: line.x2, y: line.y2 }
    }
  }

  return result
}

// Calculate total travel distance (sum of distances between consecutive line ends and starts)
function calculateTravelDistance(lines: OrderedLine[]): number {
  if (lines.length <= 1) return 0

  let totalDistance = 0
  for (let i = 1; i < lines.length; i++) {
    const prevEnd = { x: lines[i - 1].x2, y: lines[i - 1].y2 }
    const currStart = { x: lines[i].x1, y: lines[i].y1 }
    totalDistance += distance(prevEnd, currStart)
  }
  return totalDistance
}

// Interpolate between red and blue based on position (0 = red, 1 = blue)
function getGradientColor(position: number): string {
  // Red to blue gradient
  const r = Math.round(255 * (1 - position))
  const g = 0
  const b = Math.round(255 * position)
  return `rgb(${r}, ${g}, ${b})`
}

export default function FillTab() {
  const {
    svgContent,
    layerNodes,
    setLayerNodes,
    fillTargetNodeId,
    setFillTargetNodeId,
    setActiveTab,
    rebuildSvgFromLayers,
    svgElementRef,
  } = useAppContext()

  const [lineSpacing, setLineSpacing] = useState(5)
  const [angle, setAngle] = useState(45)
  const [crossHatch, setCrossHatch] = useState(false)
  const [inset, setInset] = useState(0)
  const [retainStrokes, setRetainStrokes] = useState(true)
  const [penWidth, setPenWidth] = useState(0.5) // in mm, converted to px for display
  const [showHatchPreview, setShowHatchPreview] = useState(false)
  const [showOrderVisualization, setShowOrderVisualization] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const animationRef = useRef<number | null>(null)

  const previewRef = useRef<HTMLDivElement>(null)

  // Find the target node
  const targetNode = useMemo(() => {
    if (!fillTargetNodeId) return null

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    return findNode(layerNodes, fillTargetNodeId)
  }, [layerNodes, fillTargetNodeId])

  // Helper to get a fresh element reference from the live DOM
  const getFreshElement = useCallback((nodeId: string, originalElement: Element): Element => {
    if (!svgElementRef.current) {
      console.log(`getFreshElement: No svgElementRef for ${nodeId}`)
      return originalElement
    }

    // If original element is still connected to DOM, use it directly
    if (originalElement.isConnected) {
      console.log(`getFreshElement: Using connected original element for ${nodeId}`)
      return originalElement
    }

    // Try to find the element by ID in the live DOM
    try {
      const freshElement = svgElementRef.current.querySelector(`#${CSS.escape(nodeId)}`)
      if (freshElement) {
        console.log(`getFreshElement: Found fresh element by ID for ${nodeId}`)
        return freshElement
      }
    } catch (e) {
      console.log(`getFreshElement: querySelector failed for ${nodeId}:`, e)
    }

    // Try to find by matching tag and attributes from original element
    const origD = originalElement.getAttribute('d')
    const origPoints = originalElement.getAttribute('points')

    if (origD) {
      // For paths, try to find by d attribute
      const allPaths = svgElementRef.current.querySelectorAll('path')
      for (const path of allPaths) {
        if (path.getAttribute('d') === origD) {
          console.log(`getFreshElement: Found fresh path by d attribute for ${nodeId}`)
          return path
        }
      }
    } else if (origPoints) {
      // For polygons, try to find by points attribute
      const allPolygons = svgElementRef.current.querySelectorAll('polygon')
      for (const poly of allPolygons) {
        if (poly.getAttribute('points') === origPoints) {
          console.log(`getFreshElement: Found fresh polygon by points for ${nodeId}`)
          return poly
        }
      }
    }

    console.log(`getFreshElement: Could not find fresh element for ${nodeId}, using disconnected original`)
    return originalElement
  }, [svgElementRef])

  // Extract all fill paths from the target node (including nested children)
  const fillPaths = useMemo(() => {
    console.log('=== fillPaths useMemo running ===')
    console.log('targetNode:', targetNode?.id, targetNode?.name)
    console.log('svgElementRef.current:', svgElementRef.current ? 'exists' : 'null')

    if (!targetNode) {
      console.log('No targetNode, returning empty array')
      return []
    }

    const paths: FillPathInfo[] = []

    const getElementFill = (element: Element): string | null => {
      const fill = element.getAttribute('fill')
      const style = element.getAttribute('style')

      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/)
        if (fillMatch && fillMatch[1] !== 'none' && fillMatch[1] !== 'transparent') {
          return fillMatch[1].trim()
        }
      }

      if (fill && fill !== 'none' && fill !== 'transparent') {
        return fill
      }

      return null
    }

    const extractFillPaths = (node: SVGNode) => {
      // Skip nodes that already have customMarkup (already filled)
      if (node.customMarkup) {
        console.log(`Skipping node ${node.id} - has customMarkup`)
        return
      }

      // Get fresh element reference from the live DOM
      const element = getFreshElement(node.id, node.element)
      const fill = getElementFill(element)

      console.log(`Processing node ${node.id}: isGroup=${node.isGroup}, fill=${fill}, tagName=${element.tagName}, isConnected=${element.isConnected}`)

      // Only include actual shape elements with fills (not groups)
      if (fill && !node.isGroup) {
        const tagName = element.tagName.toLowerCase()
        let pathData = ''

        // Get path data based on element type
        if (tagName === 'path') {
          pathData = element.getAttribute('d') || ''
        } else if (tagName === 'rect') {
          const x = element.getAttribute('x') || '0'
          const y = element.getAttribute('y') || '0'
          const w = element.getAttribute('width') || '0'
          const h = element.getAttribute('height') || '0'
          pathData = `rect(${x}, ${y}, ${w}, ${h})`
        } else if (tagName === 'circle') {
          const cx = element.getAttribute('cx') || '0'
          const cy = element.getAttribute('cy') || '0'
          const r = element.getAttribute('r') || '0'
          pathData = `circle(${cx}, ${cy}, r=${r})`
        } else if (tagName === 'ellipse') {
          const cx = element.getAttribute('cx') || '0'
          const cy = element.getAttribute('cy') || '0'
          const rx = element.getAttribute('rx') || '0'
          const ry = element.getAttribute('ry') || '0'
          pathData = `ellipse(${cx}, ${cy}, ${rx}, ${ry})`
        } else if (tagName === 'polygon') {
          pathData = element.getAttribute('points') || ''
        }

        console.log(`  -> Adding path: ${node.id}, type=${tagName}, pathData length=${pathData.length}`)
        paths.push({
          id: node.id,
          type: tagName,
          color: fill,
          pathData,
          element,
        })
      }

      // Recursively process children
      for (const child of node.children) {
        extractFillPaths(child)
      }
    }

    extractFillPaths(targetNode)
    console.log(`fillPaths result: ${paths.length} paths`)
    return paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNode, getFreshElement, svgContent]) // svgContent dependency ensures we get fresh elements after rebuild

  // Calculate bounding box of all fill paths
  const boundingBox = useMemo(() => {
    console.log('=== boundingBox useMemo running ===')
    console.log(`fillPaths.length: ${fillPaths.length}`)

    if (fillPaths.length === 0) {
      console.log('No fill paths, returning null')
      return null
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let successfulBBoxCount = 0

    fillPaths.forEach((path, index) => {
      try {
        const element = path.element as SVGGraphicsElement
        console.log(`  Path ${index} (${path.id}): isConnected=${element.isConnected}, tagName=${element.tagName}`)

        const bbox = element.getBBox?.()
        if (bbox) {
          console.log(`    -> getBBox success: x=${bbox.x}, y=${bbox.y}, w=${bbox.width}, h=${bbox.height}`)
          minX = Math.min(minX, bbox.x)
          minY = Math.min(minY, bbox.y)
          maxX = Math.max(maxX, bbox.x + bbox.width)
          maxY = Math.max(maxY, bbox.y + bbox.height)
          successfulBBoxCount++
        } else {
          console.log(`    -> getBBox returned null/undefined`)
        }
      } catch (e) {
        console.log(`    -> getBBox FAILED:`, e)
      }
    })

    console.log(`Successful getBBox calls: ${successfulBBoxCount}/${fillPaths.length}`)

    if (minX === Infinity) {
      console.log('No valid bboxes found, returning null')
      return null
    }

    const result = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
    console.log('boundingBox result:', result)
    return result
  }, [fillPaths])

  // Generate hatch lines for each path
  const hatchedPaths = useMemo(() => {
    console.log('=== hatchedPaths useMemo running ===')
    console.log(`showHatchPreview=${showHatchPreview}, fillPaths.length=${fillPaths.length}, boundingBox=`, boundingBox)

    if (!showHatchPreview || fillPaths.length === 0 || !boundingBox) {
      console.log('Early return from hatchedPaths')
      return []
    }

    // Generate global hatch lines that cover all shapes - aligned to origin for consistency
    const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
    const globalCrossLines = crossHatch ? generateGlobalHatchLines(boundingBox, lineSpacing, angle + 90) : []

    const results: { pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[] = []

    fillPaths.forEach((path, index) => {
      try {
        console.log(`Generating hatch for path ${index} (${path.id}): element connected=${path.element.isConnected}`)
        const polygon = getPolygonPoints(path.element)
        console.log(`  -> polygon points: ${polygon.length}`)

        if (polygon.length >= 3) {
          // Clip global lines to this polygon
          let lines = clipLinesToPolygon(globalLines, polygon, inset)
          console.log(`  -> clipped lines: ${lines.length}`)

          // Add cross-hatch if enabled
          if (crossHatch) {
            const crossLines = clipLinesToPolygon(globalCrossLines, polygon, inset)
            lines = [...lines, ...crossLines]
          }

          results.push({ pathInfo: path, lines, polygon })
        } else {
          console.log(`  -> skipping, not enough polygon points`)
        }
      } catch (e) {
        console.log(`  -> FAILED:`, e)
      }
    })

    console.log(`hatchedPaths result: ${results.length} paths with hatching`)
    return results
  }, [showHatchPreview, fillPaths, boundingBox, lineSpacing, angle, crossHatch, inset])

  // Compute ordered lines - both unoptimized (original order) and optimized (TSP)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { unoptimizedLines: _unoptimizedLines, optimizedLines, stats } = useMemo(() => {
    if (hatchedPaths.length === 0) {
      return { unoptimizedLines: [], optimizedLines: [], stats: { unoptimizedDistance: 0, optimizedDistance: 0, improvement: 0 } }
    }

    // Flatten all hatch lines into a single array with metadata
    const allLines: { line: HatchLine; pathId: string; color: string; originalIndex: number }[] = []
    let globalIndex = 0

    hatchedPaths.forEach(({ pathInfo, lines }) => {
      lines.forEach(line => {
        allLines.push({
          line,
          pathId: pathInfo.id,
          color: pathInfo.color,
          originalIndex: globalIndex++
        })
      })
    })

    // Unoptimized: just use original order
    const unoptimized: OrderedLine[] = allLines.map(({ line, pathId, color, originalIndex }) => ({
      ...line,
      pathId,
      color,
      originalIndex,
      reversed: false
    }))

    // Optimized: use nearest-neighbor TSP
    const optimized = optimizeLineOrder(allLines)

    // Calculate statistics
    const unoptimizedDistance = calculateTravelDistance(unoptimized)
    const optimizedDistance = calculateTravelDistance(optimized)
    const improvement = unoptimizedDistance > 0
      ? ((unoptimizedDistance - optimizedDistance) / unoptimizedDistance) * 100
      : 0

    return {
      unoptimizedLines: unoptimized,
      optimizedLines: optimized,
      stats: { unoptimizedDistance, optimizedDistance, improvement }
    }
  }, [hatchedPaths])

  // Convert mm to SVG units (assuming 96 DPI, 1mm = 3.7795px)
  const penWidthPx = penWidth * 3.7795

  // Generate preview SVG content
  const previewSvg = useMemo(() => {
    console.log('=== previewSvg useMemo running ===')
    console.log(`fillPaths.length=${fillPaths.length}, boundingBox=`, boundingBox)

    if (fillPaths.length === 0 || !boundingBox) {
      console.log('previewSvg: early return, no fillPaths or boundingBox')
      return null
    }

    const padding = 20
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`
    console.log(`previewSvg viewBox: ${viewBox}`)

    const pathElements: string[] = []

    if (showHatchPreview && showOrderVisualization) {
      // Show ordered lines with gradient visualization
      const linesToShow = optimizedLines
      const totalLines = linesToShow.length

      // For animation, only show lines up to the current progress
      const visibleCount = isAnimating
        ? Math.floor((animationProgress / 100) * totalLines)
        : totalLines

      // Draw the hatch lines with gradient colors
      const linesHtml = linesToShow.slice(0, visibleCount).map((line, index) => {
        const position = totalLines > 1 ? index / (totalLines - 1) : 0
        const color = getGradientColor(position)
        return `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round" />`
      }).join('\n')

      pathElements.push(`<g class="order-visualization">${linesHtml}</g>`)

      // Draw travel paths (connections between line ends and next line starts)
      if (!isAnimating || visibleCount > 1) {
        const travelLines: string[] = []
        const lineCount = isAnimating ? visibleCount : linesToShow.length
        for (let i = 1; i < lineCount; i++) {
          const prevEnd = { x: linesToShow[i - 1].x2, y: linesToShow[i - 1].y2 }
          const currStart = { x: linesToShow[i].x1, y: linesToShow[i].y1 }
          travelLines.push(
            `<line x1="${prevEnd.x.toFixed(2)}" y1="${prevEnd.y.toFixed(2)}" x2="${currStart.x.toFixed(2)}" y2="${currStart.y.toFixed(2)}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5" />`
          )
        }
        if (travelLines.length > 0) {
          pathElements.push(`<g class="travel-paths">${travelLines.join('\n')}</g>`)
        }
      }

      // Add outline strokes if retaining strokes
      if (retainStrokes) {
        fillPaths.forEach((path) => {
          const outlineEl = path.element.cloneNode(true) as Element
          outlineEl.setAttribute('fill', 'none')
          outlineEl.setAttribute('stroke', '#ccc')
          outlineEl.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
          outlineEl.removeAttribute('style')
          pathElements.push(outlineEl.outerHTML)
        })
      }
    } else if (showHatchPreview) {
      // Normal hatch preview (original color, no ordering)
      fillPaths.forEach((path) => {
        const hatchData = hatchedPaths.find(h => h.pathInfo.id === path.id)
        if (hatchData && hatchData.lines.length > 0) {
          const linesHtml = hatchData.lines.map(line =>
            `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${path.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round" />`
          ).join('\n')

          pathElements.push(`<g>${linesHtml}</g>`)
        }

        // Add outline stroke if retaining strokes
        if (retainStrokes) {
          const outlineEl = path.element.cloneNode(true) as Element
          outlineEl.setAttribute('fill', 'none')
          outlineEl.setAttribute('stroke', path.color)
          outlineEl.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
          outlineEl.removeAttribute('style')
          pathElements.push(outlineEl.outerHTML)
        }
      })
    } else {
      // Show original shapes with semi-transparent fill
      fillPaths.forEach((path) => {
        const el = path.element.cloneNode(true) as Element
        el.setAttribute('fill', path.color)
        el.setAttribute('fill-opacity', '0.3')
        el.setAttribute('stroke', path.color)
        el.setAttribute('stroke-width', '2')
        pathElements.push(el.outerHTML)
      })
    }

    return { viewBox, content: pathElements.join('\n') }
  }, [fillPaths, boundingBox, showHatchPreview, hatchedPaths, retainStrokes, penWidthPx, showOrderVisualization, optimizedLines, isAnimating, animationProgress])

  const handleBack = () => {
    setFillTargetNodeId(null)
    setActiveTab('sort')
  }

  const handlePreview = useCallback(() => {
    setShowHatchPreview(!showHatchPreview)
    // Reset order visualization when toggling preview
    if (showHatchPreview) {
      setShowOrderVisualization(false)
      setIsAnimating(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [showHatchPreview])

  const handleToggleOrder = useCallback(() => {
    if (!showOrderVisualization) {
      // Turning on order visualization
      setShowOrderVisualization(true)
    } else {
      // Turning off - also stop animation
      setShowOrderVisualization(false)
      setIsAnimating(false)
      setAnimationProgress(0)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [showOrderVisualization])

  const handleToggleAnimation = useCallback(() => {
    if (isAnimating) {
      // Stop animation
      setIsAnimating(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    } else {
      // Start animation
      setIsAnimating(true)
      setAnimationProgress(0)
      const startTime = performance.now()
      const duration = 5000 // 5 seconds for full animation

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min((elapsed / duration) * 100, 100)
        setAnimationProgress(progress)

        if (progress < 100) {
          animationRef.current = requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
          animationRef.current = null
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }
  }, [isAnimating])

  const handleApplyFill = useCallback(() => {
    if (!targetNode || hatchedPaths.length === 0) return

    // Build a map of node ID to custom markup
    const customMarkupMap = new Map<string, string>()

    // Group optimized lines by their original path ID to maintain per-path grouping
    // but use the optimized order within each path
    const linesByPath = new Map<string, OrderedLine[]>()
    optimizedLines.forEach(line => {
      const existing = linesByPath.get(line.pathId) || []
      existing.push(line)
      linesByPath.set(line.pathId, existing)
    })

    // Generate markup for each hatched path using optimized line order
    hatchedPaths.forEach(({ pathInfo }) => {
      const lines = linesByPath.get(pathInfo.id) || []
      // Build the hatch group markup as a string using optimized order
      const linesMarkup = lines.map(line =>
        `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="${line.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/>`
      ).join('\n')

      let outlineMarkup = ''
      if (retainStrokes) {
        // Clone the original element and modify attributes for outline
        const el = pathInfo.element.cloneNode(true) as Element
        el.setAttribute('fill', 'none')
        el.setAttribute('stroke', pathInfo.color)
        el.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
        el.removeAttribute('style')
        const serializer = new XMLSerializer()
        outlineMarkup = serializer.serializeToString(el)
      }

      const groupMarkup = `<g id="hatch-${pathInfo.id}">\n${linesMarkup}\n${outlineMarkup}\n</g>`
      customMarkupMap.set(pathInfo.id, groupMarkup)
    })

    // Update layer nodes with custom markup
    const updateNodeMarkup = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        const customMarkup = customMarkupMap.get(node.id)
        if (customMarkup) {
          return {
            ...node,
            customMarkup,
            type: 'g',
            isGroup: true,
            name: `hatch-${node.name || node.id}`,
          }
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNodeMarkup(node.children) }
        }
        return node
      })
    }

    const updatedNodes = updateNodeMarkup(layerNodes)
    setLayerNodes(updatedNodes)

    // Rebuild SVG with the updated nodes (pass explicitly to avoid stale closure)
    rebuildSvgFromLayers(updatedNodes)

    setFillTargetNodeId(null)
    setActiveTab('sort')
  }, [targetNode, hatchedPaths, optimizedLines, retainStrokes, penWidthPx, layerNodes, setLayerNodes, setFillTargetNodeId, setActiveTab, rebuildSvgFromLayers])

  if (!svgContent) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No SVG Loaded</h3>
          <p>Go to the Sort tab and upload an SVG to use line fill features.</p>
        </div>
      </div>
    )
  }

  if (!fillTargetNodeId || !targetNode) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No Layer Selected</h3>
          <p>Go to the Sort tab, select a layer with fills, and click the Fill button.</p>
          <button className="back-button" onClick={handleBack}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fill-tab">
      <aside className="fill-sidebar">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleBack}>
            ← Back
          </button>
          <h2>Line Fill</h2>
        </div>
        <div className="sidebar-content">
          <div className="fill-section">
            <h3>Target Layer</h3>
            <div className="target-layer-info">
              <span className="target-layer-name">{targetNode.name || targetNode.id}</span>
              {targetNode.isGroup && (
                <span className="target-layer-type">Group</span>
              )}
            </div>
          </div>

          <div className="fill-section">
            <h3>Fill Paths ({fillPaths.length})</h3>
            <div className="fill-paths-list">
              {fillPaths.map((path, index) => (
                <div key={path.id} className="fill-path-item">
                  <span
                    className="path-color-swatch"
                    style={{ backgroundColor: path.color }}
                  />
                  <span className="path-info">
                    <span className="path-type">{path.type}</span>
                    <span className="path-id">{path.id || `path-${index + 1}`}</span>
                  </span>
                </div>
              ))}
              {fillPaths.length === 0 && (
                <div className="no-paths-message">
                  No fill paths found in selection
                </div>
              )}
            </div>
          </div>

          <div className="fill-section">
            <h3>Pattern Settings</h3>

            <div className="fill-control">
              <label>Line Spacing</label>
              <div className="control-row">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{lineSpacing}px</span>
              </div>
            </div>

            <div className="fill-control">
              <label>Angle</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{angle}°</span>
              </div>
            </div>

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={crossHatch}
                  onChange={(e) => setCrossHatch(e.target.checked)}
                />
                Cross-hatch
              </label>
            </div>

            <div className="fill-control">
              <label>Inset</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={inset}
                  onChange={(e) => setInset(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{inset}px</span>
              </div>
            </div>

            <div className="fill-control">
              <label>Pen Width</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  className="fill-slider"
                />
                <span className="control-value">{penWidth}mm</span>
              </div>
            </div>

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={retainStrokes}
                  onChange={(e) => setRetainStrokes(e.target.checked)}
                />
                Retain strokes (edge outlines)
              </label>
            </div>
          </div>

          <div className="fill-actions">
            <button
              className={`fill-preview-btn ${showHatchPreview ? 'active' : ''}`}
              disabled={fillPaths.length === 0}
              onClick={handlePreview}
            >
              {showHatchPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              className={`fill-order-btn ${showOrderVisualization ? 'active' : ''}`}
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleToggleOrder}
              title="Visualize path order with red→blue gradient"
            >
              {showOrderVisualization ? 'Hide Order' : 'Order'}
            </button>
          </div>

          {showOrderVisualization && (
            <div className="order-controls">
              <button
                className={`animate-btn ${isAnimating ? 'active' : ''}`}
                onClick={handleToggleAnimation}
                disabled={optimizedLines.length === 0}
              >
                {isAnimating ? 'Stop' : 'Play'}
              </button>
              {isAnimating && (
                <div className="animation-progress">
                  <div
                    className="animation-progress-bar"
                    style={{ width: `${animationProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {showOrderVisualization && stats.unoptimizedDistance > 0 && (
            <div className="order-stats">
              <div className="stat-row">
                <span className="stat-label">Lines:</span>
                <span className="stat-value">{optimizedLines.length}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Travel (orig):</span>
                <span className="stat-value">{stats.unoptimizedDistance.toFixed(1)}px</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Travel (opt):</span>
                <span className="stat-value">{stats.optimizedDistance.toFixed(1)}px</span>
              </div>
              <div className="stat-row highlight">
                <span className="stat-label">Saved:</span>
                <span className="stat-value">{stats.improvement.toFixed(1)}%</span>
              </div>
            </div>
          )}

          <div className="fill-actions secondary">
            <button
              className="fill-apply-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleApplyFill}
              title={!showHatchPreview ? 'Preview first to see the result' : 'Apply hatching to the SVG'}
            >
              Apply Fill
            </button>
          </div>
        </div>
      </aside>

      <main className="fill-main" ref={previewRef}>
        {previewSvg ? (
          <div className="fill-preview-container">
            <svg
              className="fill-preview-svg"
              viewBox={previewSvg.viewBox}
              preserveAspectRatio="xMidYMid meet"
              dangerouslySetInnerHTML={{ __html: previewSvg.content }}
            />
            {showHatchPreview && !showOrderVisualization && (
              <div className="preview-label">Hatch Preview</div>
            )}
            {showOrderVisualization && (
              <div className="preview-label order">
                Order View
                <span className="gradient-legend">
                  <span className="start">Start</span>
                  <span className="gradient-bar" />
                  <span className="end">End</span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="fill-preview-empty">
            <p>No geometry to preview</p>
          </div>
        )}
      </main>
    </div>
  )
}
