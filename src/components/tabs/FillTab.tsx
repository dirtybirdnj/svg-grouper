import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import { findNodeById } from '../../utils/nodeUtils'
import { OPTIMIZATION, UI } from '../../constants'
import { usePanZoom } from '../../hooks'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  SubpathMode,
  getAllPolygonsFromElement,
  linesToCompoundPath,
  parsePathIntoSubpaths,
} from '../../utils/geometry'
import {
  FillPatternType,
  TileShapeType,
  TILE_SHAPES,
  optimizeLineOrderMultiPass,
} from '../../utils/fillPatterns'
import { UnifiedLayerList, LayerListItemFull, ItemRenderState } from '../shared'
import simplify from 'simplify-js'
import polygonClipping, { Polygon as ClipPolygon } from 'polygon-clipping'
import patternStats from '../../patternStats.json'
import './FillTab.css'

// Helper functions for polygon union (from MergeTab)
function polygonWithHolesToClip(poly: PolygonWithHoles): ClipPolygon {
  const outer: [number, number][] = poly.outer.map(p => [p.x, p.y])
  const holes: [number, number][][] = poly.holes.map(hole => hole.map(p => [p.x, p.y]))
  return [outer, ...holes]
}

function clipResultToPolygonWithHoles(result: ClipPolygon[]): PolygonWithHoles[] {
  return result.map(poly => {
    const outer: Point[] = poly[0].map(([x, y]) => ({ x, y }))
    const holes: Point[][] = poly.slice(1).map(ring => ring.map(([x, y]) => ({ x, y })))
    return { outer, holes }
  })
}

// Union multiple polygons into one compound shape
function unionPolygonsForFill(polygons: PolygonWithHoles[]): PolygonWithHoles[] {
  if (polygons.length === 0) return []
  if (polygons.length === 1) return polygons

  try {
    let result: ClipPolygon[] = [polygonWithHolesToClip(polygons[0])]

    for (let i = 1; i < polygons.length; i++) {
      const clipPoly: ClipPolygon[] = [polygonWithHolesToClip(polygons[i])]
      result = polygonClipping.union(result, clipPoly)
    }

    return clipResultToPolygonWithHoles(result)
  } catch (error) {
    console.error('[FillTab] Polygon union failed:', error)
    return polygons // Return original if union fails
  }
}

// Filter out DNF patterns
const DNF_PATTERNS = new Set(
  Object.entries(patternStats.patterns)
    .filter(([_, stats]) => stats.status === 'dnf')
    .map(([name]) => name)
)

interface FillPathInfo {
  id: string
  type: string
  color: string
  pathData: string
  element: Element
}

// Chain connected line segments into polylines, then simplify each polyline
// Returns simplified lines that approximate the original with fewer points
// Uses spatial indexing for O(n) performance instead of O(n²)
function simplifyLines(lines: HatchLine[], tolerance: number): HatchLine[] {
  if (tolerance <= 0 || lines.length === 0) return lines

  const CONNECT_THRESHOLD = OPTIMIZATION.CONNECT_THRESHOLD
  const GRID_SIZE = CONNECT_THRESHOLD * 2 // Grid cell size for spatial hashing

  // Spatial hash function - rounds point to grid cell
  const hashPoint = (x: number, y: number): string => {
    const gx = Math.floor(x / GRID_SIZE)
    const gy = Math.floor(y / GRID_SIZE)
    return `${gx},${gy}`
  }

  // Build spatial index: map from grid cell to line indices with endpoints in that cell
  // Each line is indexed by both its endpoints
  const spatialIndex = new Map<string, Set<number>>()

  const addToIndex = (x: number, y: number, lineIndex: number) => {
    const hash = hashPoint(x, y)
    let set = spatialIndex.get(hash)
    if (!set) {
      set = new Set()
      spatialIndex.set(hash, set)
    }
    set.add(lineIndex)
    // Also add to adjacent cells for threshold tolerance
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        const gx = Math.floor(x / GRID_SIZE) + dx
        const gy = Math.floor(y / GRID_SIZE) + dy
        const adjHash = `${gx},${gy}`
        let adjSet = spatialIndex.get(adjHash)
        if (!adjSet) {
          adjSet = new Set()
          spatialIndex.set(adjHash, adjSet)
        }
        adjSet.add(lineIndex)
      }
    }
  }

  // Index all line endpoints
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    addToIndex(line.x1, line.y1, i)
    addToIndex(line.x2, line.y2, i)
  }

  // Build chains using spatial index for fast neighbor lookup
  const chains: Point[][] = []
  const used = new Set<number>()

  // Helper to find connecting line using spatial index
  const findConnectingLine = (x: number, y: number): { lineIndex: number; isP1: boolean } | null => {
    const hash = hashPoint(x, y)
    const candidates = spatialIndex.get(hash)
    if (!candidates) return null

    for (const j of candidates) {
      if (used.has(j)) continue
      const line = lines[j]

      const d1 = Math.hypot(line.x1 - x, line.y1 - y)
      if (d1 < CONNECT_THRESHOLD) {
        return { lineIndex: j, isP1: true }
      }

      const d2 = Math.hypot(line.x2 - x, line.y2 - y)
      if (d2 < CONNECT_THRESHOLD) {
        return { lineIndex: j, isP1: false }
      }
    }
    return null
  }

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue

    // Start a new chain
    const chain: Point[] = [
      { x: lines[i].x1, y: lines[i].y1 },
      { x: lines[i].x2, y: lines[i].y2 }
    ]
    used.add(i)

    // Extend chain from end
    let found = true
    while (found) {
      found = false
      const chainEnd = chain[chain.length - 1]
      const result = findConnectingLine(chainEnd.x, chainEnd.y)
      if (result) {
        const line = lines[result.lineIndex]
        // Add the other endpoint
        const newPoint = result.isP1
          ? { x: line.x2, y: line.y2 }
          : { x: line.x1, y: line.y1 }
        chain.push(newPoint)
        used.add(result.lineIndex)
        found = true
      }
    }

    // Extend chain from start
    found = true
    while (found) {
      found = false
      const chainStart = chain[0]
      const result = findConnectingLine(chainStart.x, chainStart.y)
      if (result) {
        const line = lines[result.lineIndex]
        // Add the other endpoint
        const newPoint = result.isP1
          ? { x: line.x2, y: line.y2 }
          : { x: line.x1, y: line.y1 }
        chain.unshift(newPoint)
        used.add(result.lineIndex)
        found = true
      }
    }

    chains.push(chain)
  }

  // Simplify each chain and convert back to lines
  const simplifiedLines: HatchLine[] = []

  for (const chain of chains) {
    if (chain.length < 2) continue

    // Apply Ramer-Douglas-Peucker simplification
    const simplified = simplify(chain, tolerance, true)

    // Convert simplified points back to line segments
    for (let i = 0; i < simplified.length - 1; i++) {
      simplifiedLines.push({
        x1: simplified[i].x,
        y1: simplified[i].y,
        x2: simplified[i + 1].x,
        y2: simplified[i + 1].y
      })
    }
  }

  return simplifiedLines
}

// NOTE: All pattern generation handled by rat-king (Rust) via IPC
// See RAT-KING-OPTIMIZATIONS.md for migration details

// Weave helper functions
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
  pattern: 'trueWeave' | 'checkerboard' | 'layer1Over' | 'layer2Over',
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
function weaveLayerLines(
  layer1Lines: HatchLine[],
  layer2Lines: HatchLine[],
  layer1PenWidth: number, // in mm
  layer2PenWidth: number, // in mm
  pattern: 'trueWeave' | 'checkerboard' | 'layer1Over' | 'layer2Over',
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

export default function FillTab() {
  const {
    svgContent,
    layerNodes,
    setLayerNodes,
    fillTargetNodeIds,
    setFillTargetNodeIds,
    selectedNodeIds,
    setActiveTab,
    rebuildSvgFromLayers,
    setOrderData,
    setIsProcessing,
    scale,
    setScale,
    offset,
    setOffset,
    weaveRequested,
    setWeaveRequested,
    setStatusMessage,
  } = useAppContext()

  const [lineSpacing, setLineSpacing] = useState(15)
  const [angle, setAngle] = useState(45)
  const [crossHatch, setCrossHatch] = useState(false)
  const [inset, setInset] = useState(0)
  const [retainStrokes, setRetainStrokes] = useState(true)
  const [penWidth, setPenWidth] = useState(0.5) // in mm, converted to px for display
  const [showHatchPreview, setShowHatchPreview] = useState(false)
  const [fillPattern, setFillPattern] = useState<FillPatternType>('lines')
  const [wiggleAmplitude, setWiggleAmplitude] = useState(5)
  const [wiggleFrequency, setWiggleFrequency] = useState(2)
  const [spiralOverDiameter, setSpiralOverDiameter] = useState(2.0) // Multiplier for spiral radius
  const [singleSpiral, setSingleSpiral] = useState(false) // Use one giant spiral for all shapes
  const [singleHilbert, setSingleHilbert] = useState(true) // Use one Hilbert curve for all shapes (default true)
  const [singleFermat, setSingleFermat] = useState(true) // Use one Fermat spiral for all shapes (default true)
  const [simplifyTolerance, setSimplifyTolerance] = useState(0) // 0 = no simplification
  const [customTileShape, setCustomTileShape] = useState<TileShapeType>('triangle') // Selected tile shape for custom pattern
  const [customTileGap, setCustomTileGap] = useState(0) // Gap between tiles (px)
  const [customTileScale, setCustomTileScale] = useState(1.0) // Scale factor for tile size
  const [customTileRotateOffset, setCustomTileRotateOffset] = useState(0) // Rotation offset per tile (degrees)
  const [subpathMode, _setSubpathMode] = useState<SubpathMode>('default') // How to handle nested shapes
  // Evenodd fill rule is always enabled - correctly handles compound paths by filling
  // areas inside an odd number of polygon boundaries. No UI toggle needed.
  const useEvenOdd = true

  // Merge shapes before fill - useful for text/logos where shapes should be unioned
  const [mergeBeforeFill, setMergeBeforeFill] = useState(false)

  // Crop support for fill patterns
  const [enableCrop, setEnableCrop] = useState(false)
  const [cropInset, setCropInset] = useState(0) // Percentage of bounding box to crop from edges (0-50%)
  const [draftCropInset, setDraftCropInset] = useState(0)

  // Accumulated fill layers - each layer has lines with a color and settings for re-population
  interface FillLayer {
    id: string  // Unique ID for drag-and-drop
    lines: HatchLine[]
    color: string  // Display/output color (can be overridden by user)
    originalColor: string  // Original color from source paths (used for matching)
    pathId: string
    // Settings stored for re-population
    angle: number
    lineSpacing: number
    pattern: FillPatternType
    inset: number
    lineCount: number  // For display
    penWidth: number   // Pen width in mm - used for weave gap calculation
    visible: boolean   // Layer visibility toggle
  }

  // Extended type for UnifiedLayerList that includes FillLayer fields
  type FillLayerListItem = LayerListItemFull & {
    fillLayer: FillLayer  // Reference to original layer
  }

  const [accumulatedLayers, setAccumulatedLayers] = useState<FillLayer[]>([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  // Note: draggedLayerId removed - drag state is now managed by UnifiedLayerList
  const [layerColor, setLayerColor] = useState<string>('') // Empty = use shape's original color
  // Cache for pattern banner previews (keyed by "pattern|spacing")
  const [bannerCache, setBannerCache] = useState<Map<string, string>>(new Map())
  const [highlightedPathId, _setHighlightedPathId] = useState<string | null>(null)
  const [newLayerAngle, setNewLayerAngle] = useState(45) // Angle increment when adding a new layer
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set()) // Multi-select for accumulated layers (for weaving)

  // Weave settings
  type WeavePattern = 'trueWeave' | 'checkerboard' | 'layer1Over' | 'layer2Over'
  const [weavePattern, setWeavePattern] = useState<WeavePattern>('trueWeave')
  const [weaveGapMargin, setWeaveGapMargin] = useState(0.5) // Extra gap in px beyond pen width

  // Draft states for sliders and color picker - show value during drag, commit on release
  const [draftLineSpacing, setDraftLineSpacing] = useState(15)
  const [draftAngle, setDraftAngle] = useState(45)
  const [draftInset, setDraftInset] = useState(0)
  const [draftWiggleAmplitude, setDraftWiggleAmplitude] = useState(5)
  const [draftWiggleFrequency, setDraftWiggleFrequency] = useState(2)
  const [draftPenWidth, setDraftPenWidth] = useState(0.5)
  const [draftSimplifyTolerance, setDraftSimplifyTolerance] = useState(0)
  const [draftLayerColor, setDraftLayerColor] = useState<string>('')

  // Sync all draft states when actual values change programmatically (e.g., auto-rotate angle)
  // Consolidated into single useEffect to reduce hook overhead
  useEffect(() => {
    setDraftLineSpacing(lineSpacing)
    setDraftAngle(angle)
    setDraftInset(inset)
    setDraftWiggleAmplitude(wiggleAmplitude)
    setDraftWiggleFrequency(wiggleFrequency)
    setDraftPenWidth(penWidth)
    setDraftSimplifyTolerance(simplifyTolerance)
    setDraftCropInset(cropInset)
    setDraftLayerColor(layerColor)
  }, [lineSpacing, angle, inset, wiggleAmplitude, wiggleFrequency, penWidth, simplifyTolerance, cropInset, layerColor])

  // Selected control for keyboard nudge
  type ControlId = 'lineSpacing' | 'angle' | 'inset' | 'wiggleAmplitude' | 'wiggleFrequency' | 'penWidth' | null
  const [selectedControl, setSelectedControl] = useState<ControlId>(null)

  // Handle arrow key nudging for selected control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedControl || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return

      const direction = e.key === 'ArrowRight' ? 1 : -1

      switch (selectedControl) {
        case 'lineSpacing': {
          const v = Math.max(1, Math.min(20, lineSpacing + direction))
          setLineSpacing(v)
          break
        }
        case 'angle': {
          const v = Math.max(0, Math.min(180, angle + direction * 5))
          setAngle(v)
          break
        }
        case 'inset': {
          const v = Math.max(0, Math.min(10, inset + direction))
          setInset(v)
          break
        }
        case 'wiggleAmplitude': {
          const v = Math.max(1, Math.min(10, wiggleAmplitude + direction))
          setWiggleAmplitude(v)
          break
        }
        case 'wiggleFrequency': {
          const v = Math.max(0.5, Math.min(5, wiggleFrequency + direction * 0.5))
          setWiggleFrequency(v)
          break
        }
        case 'penWidth': {
          const v = Math.max(0.1, Math.min(2, +(penWidth + direction * 0.1).toFixed(1)))
          setPenWidth(v)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedControl, lineSpacing, angle, inset, wiggleAmplitude, wiggleFrequency, penWidth])

  // Use shared pan/zoom hook with global state
  const { isPanning: isDragging, containerRef: previewRef, handlers: panZoomHandlers } = usePanZoom({
    externalState: { scale, setScale, offset, setOffset }
  })

  // Find the target nodes (supports multiple selection)
  // Falls back to selectedNodeIds from Sort tab when fillTargetNodeIds is empty
  const targetNodes = useMemo(() => {
    // Use fillTargetNodeIds if set, otherwise fall back to selected nodes from Sort tab
    const nodeIds = fillTargetNodeIds.length > 0
      ? fillTargetNodeIds
      : Array.from(selectedNodeIds)

    if (nodeIds.length === 0) return []

    const found: SVGNode[] = []
    for (const id of nodeIds) {
      const node = findNodeById(layerNodes, id)
      if (node) found.push(node)
    }
    return found
  }, [layerNodes, fillTargetNodeIds, selectedNodeIds])

  // For backward compatibility and display purposes
  const targetNode = targetNodes.length > 0 ? targetNodes[0] : null

  // Extract all fill paths from all target nodes (including nested children)
  const fillPaths = useMemo(() => {
    if (targetNodes.length === 0) return []

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
      if (node.customMarkup) return

      const element = node.element
      const fill = getElementFill(element)

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

    // Extract from all target nodes
    for (const node of targetNodes) {
      extractFillPaths(node)
    }
    return paths
  }, [targetNodes])

  // Preserve original fill paths for "Apply & Fill Again" - stores polygon boundaries for layering
  // Declared here so boundingBox can use it
  const [preservedFillData, setPreservedFillData] = useState<{ pathInfo: FillPathInfo; polygon: PolygonWithHoles }[] | null>(null)

  // Clear preserved data when target changes (user selected different layers)
  useEffect(() => {
    setPreservedFillData(null)
  }, [fillTargetNodeIds])

  // Calculate bounding box of all fill paths using polygon points (works on disconnected elements)
  const boundingBox = useMemo(() => {
    // Use preserved polygon data if available, otherwise compute from fillPaths
    if (preservedFillData && preservedFillData.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      preservedFillData.forEach(({ polygon }) => {
        for (const p of polygon.outer) {
          minX = Math.min(minX, p.x)
          minY = Math.min(minY, p.y)
          maxX = Math.max(maxX, p.x)
          maxY = Math.max(maxY, p.y)
        }
        for (const hole of polygon.holes) {
          for (const p of hole) {
            minX = Math.min(minX, p.x)
            minY = Math.min(minY, p.y)
            maxX = Math.max(maxX, p.x)
            maxY = Math.max(maxY, p.y)
          }
        }
      })
      if (minX !== Infinity) {
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }
    }

    if (fillPaths.length === 0) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    fillPaths.forEach(path => {
      // Use getAllPolygonsFromElement to handle compound paths with disconnected regions
      const allPolygons = getAllPolygonsFromElement(path.element)
      for (const polygonData of allPolygons) {
        for (const p of polygonData.outer) {
          minX = Math.min(minX, p.x)
          minY = Math.min(minY, p.y)
          maxX = Math.max(maxX, p.x)
          maxY = Math.max(maxY, p.y)
        }
        // Also check hole boundaries for complete bounding box
        for (const hole of polygonData.holes) {
          for (const p of hole) {
            minX = Math.min(minX, p.x)
            minY = Math.min(minY, p.y)
            maxX = Math.max(maxX, p.x)
            maxY = Math.max(maxY, p.y)
          }
        }
      }
    })

    if (minX === Infinity) return null

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }, [fillPaths, preservedFillData])

  // Generate hatch lines for each path - using async processing to keep UI responsive
  const [hatchedPaths, setHatchedPaths] = useState<{ pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[]>([])
  const [, setIsGeneratingHatch] = useState(false)
  const [fillProgress, setFillProgress] = useState(0)
  const hatchAbortRef = useRef<{ aborted: boolean }>({ aborted: false })

  // Use preserved data if available (after Apply & Fill Again), otherwise use computed fillPaths
  // IMPORTANT: Must be memoized to prevent creating new array reference on every render
  // which would trigger the expensive useEffect that depends on this
  const activeFillPaths = useMemo(() => {
    return preservedFillData
      ? preservedFillData.map(d => d.pathInfo)
      : fillPaths
  }, [preservedFillData, fillPaths])

  // Listen for progress updates from backend
  useEffect(() => {
    if (!window.electron?.onFillProgress) return

    const handleProgress = (data: { progress: number; status: string }) => {
      setFillProgress(data.progress)
    }

    window.electron.onFillProgress(handleProgress)

    return () => {
      window.electron?.offFillProgress?.()
    }
  }, [])

  // Generate fills using backend IPC for better performance
  useEffect(() => {
    // Abort any in-progress generation
    hatchAbortRef.current.aborted = true

    // Use activeFillPaths which falls back to preserved data if available
    const pathsToProcess = activeFillPaths
    if (!showHatchPreview || pathsToProcess.length === 0 || !boundingBox) {
      setHatchedPaths([])
      return
    }

    // Create new abort controller for this generation
    const abortController = { aborted: false }
    hatchAbortRef.current = abortController

    // Debounce fill generation to improve UI responsiveness
    const DEBOUNCE_MS = 50
    const debounceTimer = setTimeout(async () => {
      if (abortController.aborted) return

      setIsGeneratingHatch(true)
      setIsProcessing(true)
      setFillProgress(0)

      try {
        // Step 1: Extract polygon data from DOM elements (fast, runs on frontend)
        const pathInputs: Array<{
          id: string
          color: string
          polygons: PolygonWithHoles[]
          rawSubpaths?: Point[][]
        }> = []

        // Build lookup map for preserved data (O(1) lookup instead of O(n) find)
        const preservedDataMap = new Map<string, PolygonWithHoles>()
        if (preservedFillData) {
          for (const p of preservedFillData) {
            if (p.polygon) {
              preservedDataMap.set(p.pathInfo.id, p.polygon as PolygonWithHoles)
            }
          }
        }

        // Extract polygons with yielding to prevent blocking
        const BATCH_SIZE = 20 // Process 20 paths before yielding
        for (let i = 0; i < pathsToProcess.length; i++) {
          if (abortController.aborted) return

          const path = pathsToProcess[i]
          let polygons: PolygonWithHoles[]
          let rawSubpaths: Point[][] | undefined

          // Use O(1) Map lookup instead of O(n) find
          const preserved = preservedDataMap.get(path.id)
          if (preserved && subpathMode === 'default') {
            // Only use preserved data in default mode (since preserved may have hole detection)
            polygons = [preserved]
          } else {
            polygons = getAllPolygonsFromElement(path.element, subpathMode)
          }

          // For evenodd mode, also extract raw subpaths from path elements
          if (useEvenOdd && path.type === 'path') {
            const d = path.element.getAttribute('d') || ''
            rawSubpaths = parsePathIntoSubpaths(d)
          }

          pathInputs.push({
            id: path.id,
            color: path.color,
            polygons,
            rawSubpaths
          })

          // Yield to browser periodically to keep UI responsive
          if (i > 0 && i % BATCH_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }

        // If mergeBeforeFill is enabled, union all polygons into one compound shape
        let finalPathInputs = pathInputs
        if (mergeBeforeFill && pathInputs.length > 1) {
          // Collect all polygons from all paths
          const allPolygons: PolygonWithHoles[] = []
          for (const input of pathInputs) {
            allPolygons.push(...input.polygons)
          }

          // Union them all together
          const mergedPolygons = unionPolygonsForFill(allPolygons)

          // Create a single merged path input using the first path's id/color
          const firstPath = pathInputs[0]
          finalPathInputs = [{
            id: 'merged-fill',
            color: firstPath.color,
            polygons: mergedPolygons,
            rawSubpaths: undefined // Raw subpaths don't apply after merge
          }]

          console.log(`[FillTab] Merged ${allPolygons.length} polygons into ${mergedPolygons.length} compound shapes`)
        }

        // Step 2: Check if electron API is available (running in Electron)
        if (window.electron?.generateFills) {
          // Use backend IPC for fill generation
          const result = await window.electron.generateFills({
            paths: finalPathInputs,
            boundingBox,
            fillPattern,
            lineSpacing,
            angle,
            crossHatch,
            inset,
            wiggleAmplitude,
            wiggleFrequency,
            spiralOverDiameter,
            singleSpiral,
            singleHilbert,
            singleFermat,
            customTileShape,
            customTileGap,
            customTileScale,
            customTileRotateOffset,
            enableCrop,
            cropInset,
            useEvenOdd
          })

          if (abortController.aborted) return

          if (result.success) {
            // Map backend results back to frontend format
            // Use Map for O(1) lookup instead of O(n) find in loop
            const pathsMap = new Map<string, FillPathInfo>()
            for (const p of pathsToProcess) {
              pathsMap.set(p.id, p)
            }

            const results: { pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[] = []

            for (const pathResult of result.paths) {
              const originalPath = pathsMap.get(pathResult.pathId)
              if (originalPath) {
                results.push({
                  pathInfo: originalPath,
                  lines: pathResult.lines,
                  polygon: pathResult.polygon
                })
              }
            }

            setHatchedPaths(results)

            // Debug summary
            const filledCount = results.length
            const totalCount = pathsToProcess.length
            const unfilledCount = totalCount - filledCount
            if (unfilledCount > 0) {
            }
          } else {
            console.error('Fill generation failed:', result.error)
            setHatchedPaths([])
          }
        } else {
          // Electron API not available - rat-king is required
          console.error('Fill generation requires Electron/rat-king - not available in browser')
          setHatchedPaths([])
        }
      } catch (err) {
        console.error('Fill generation error:', err)
        setHatchedPaths([])
      } finally {
        if (!abortController.aborted) {
          setFillProgress(100)
          setIsGeneratingHatch(false)
          setIsProcessing(false)
        }
      }
    }, DEBOUNCE_MS)

    // Cleanup on unmount or dependency change
    return () => {
      clearTimeout(debounceTimer)
      abortController.aborted = true
      setIsProcessing(false)
    }
  }, [showHatchPreview, activeFillPaths, preservedFillData, boundingBox, lineSpacing, angle, crossHatch, inset, fillPattern, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, singleSpiral, singleHilbert, singleFermat, customTileShape, customTileGap, customTileScale, customTileRotateOffset, subpathMode, enableCrop, cropInset, useEvenOdd, setIsProcessing])

  // Apply simplification to hatched paths when tolerance > 0
  const simplifiedHatchedPaths = useMemo(() => {
    if (simplifyTolerance <= 0 || hatchedPaths.length === 0) {
      return hatchedPaths
    }

    return hatchedPaths.map(({ pathInfo, lines, polygon }) => ({
      pathInfo,
      polygon,
      lines: simplifyLines(lines, simplifyTolerance)
    }))
  }, [hatchedPaths, simplifyTolerance])

  // Note: pathLineCountMap was removed - it was created for displaying line count
  // badges in the path list but the fill-paths-full sidebar was removed.

  // Note: Line ordering optimization is deferred to handleApplyFill/handleNavigateToOrder
  // for better UI responsiveness during preview generation

  // Calculate fill statistics for display (uses simplified paths)
  const fillStats = useMemo(() => {
    if (!showHatchPreview || simplifiedHatchedPaths.length === 0) {
      return null
    }

    let totalLines = 0
    let totalPoints = 0

    // Count lines from current preview (simplified)
    simplifiedHatchedPaths.forEach(({ lines }) => {
      totalLines += lines.length
      // Each line has 2 points (start and end)
      totalPoints += lines.length * 2
    })

    // Add accumulated layers
    accumulatedLayers.forEach(layer => {
      totalLines += layer.lines.length
      totalPoints += layer.lines.length * 2
    })

    return {
      lines: totalLines,
      points: totalPoints,
      paths: simplifiedHatchedPaths.length + (accumulatedLayers.length > 0 ? 1 : 0)
    }
  }, [showHatchPreview, simplifiedHatchedPaths, accumulatedLayers])

  // Convert mm to SVG units (assuming 96 DPI, 1mm = 3.7795px)
  const penWidthPx = penWidth * 3.7795

  // Generate preview SVG content
  const previewSvg = useMemo(() => {
    if (fillPaths.length === 0 || !boundingBox) {
      return null
    }

    const padding = UI.PREVIEW_PADDING
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`

    const pathElements: string[] = []

    if (showHatchPreview) {
      // Draw accumulated layers (as compound paths for efficiency)
      // These ARE the fill preview - each layer represents committed fills
      // Only render visible layers
      accumulatedLayers.filter(layer => layer.visible).forEach(layer => {
        const pathD = linesToCompoundPath(layer.lines, 2)
        pathElements.push(`<g class="accumulated-layer"><path d="${pathD}" fill="${layer.color}" stroke="${layer.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/></g>`)
      })

      // Add outline strokes if retaining strokes
      if (retainStrokes) {
        fillPaths.forEach((path) => {
          const outlineEl = path.element.cloneNode(true) as Element
          outlineEl.setAttribute('fill', 'none')
          outlineEl.setAttribute('stroke', path.color)
          outlineEl.setAttribute('stroke-width', String(penWidthPx.toFixed(2)))
          outlineEl.removeAttribute('style')
          pathElements.push(outlineEl.outerHTML)
        })
      }

      // Add highlight overlay for selected path
      fillPaths.forEach((path) => {
        const isHighlighted = path.id === highlightedPathId
        if (isHighlighted) {
          const highlightEl = path.element.cloneNode(true) as Element
          highlightEl.setAttribute('fill', 'rgba(255, 0, 0, 0.3)')
          highlightEl.setAttribute('stroke', '#ff0000')
          highlightEl.setAttribute('stroke-width', '3')
          highlightEl.removeAttribute('style')
          pathElements.push(highlightEl.outerHTML)
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

    // Add crop rectangle indicator if crop is enabled
    if (enableCrop && cropInset > 0) {
      const insetX = boundingBox.width * (cropInset / 100)
      const insetY = boundingBox.height * (cropInset / 100)
      const cropX = boundingBox.x + insetX
      const cropY = boundingBox.y + insetY
      const cropW = boundingBox.width - insetX * 2
      const cropH = boundingBox.height - insetY * 2

      // Draw crop border rectangle
      pathElements.push(`<rect x="${cropX}" y="${cropY}" width="${cropW}" height="${cropH}" fill="none" stroke="#ff6600" stroke-width="2" stroke-dasharray="8,4" opacity="0.8"/>`)

      // Dim the area outside the crop (using a mask effect with rects)
      pathElements.push(`<rect x="${boundingBox.x - padding}" y="${boundingBox.y - padding}" width="${boundingBox.width + padding * 2}" height="${insetY + padding}" fill="rgba(0,0,0,0.3)"/>`)
      pathElements.push(`<rect x="${boundingBox.x - padding}" y="${cropY + cropH}" width="${boundingBox.width + padding * 2}" height="${insetY + padding}" fill="rgba(0,0,0,0.3)"/>`)
      pathElements.push(`<rect x="${boundingBox.x - padding}" y="${cropY}" width="${insetX + padding}" height="${cropH}" fill="rgba(0,0,0,0.3)"/>`)
      pathElements.push(`<rect x="${cropX + cropW}" y="${cropY}" width="${insetX + padding}" height="${cropH}" fill="rgba(0,0,0,0.3)"/>`)
    }

    return { viewBox, content: pathElements.join('\n') }
  }, [fillPaths, boundingBox, showHatchPreview, accumulatedLayers, retainStrokes, penWidthPx, highlightedPathId, enableCrop, cropInset])

  const handleBack = () => {
    // Clean up all fill state when navigating away
    setAccumulatedLayers([])
    setPreservedFillData(null)
    setLayerColor('')
    setShowHatchPreview(false)
    setFillTargetNodeIds([])
    setActiveTab('sort')
  }

  const handlePreview = useCallback(() => {
    setShowHatchPreview(!showHatchPreview)
  }, [showHatchPreview])

  // NOTE: All fill generation now uses rat-king via the generate-fills IPC handler
  // The preview and apply flow both use rat-king automatically

  const handleApplyFill = useCallback(() => {
    if (targetNodes.length === 0 || (simplifiedHatchedPaths.length === 0 && accumulatedLayers.length === 0)) return

    // Show processing state while optimizing
    setIsProcessing(true)

    // Use setTimeout to let UI update before running expensive optimization
    setTimeout(() => {
      // Run optimization now (deferred from preview for responsiveness)
      const optimizedLines = optimizeLineOrderMultiPass(simplifiedHatchedPaths)

      // Create DOMParser once and reuse (expensive to create repeatedly)
      const parser = new DOMParser()

      // Collect all lines: accumulated layers + current preview
      // Group by color so different colors become separate layer nodes
      const allLinesByColor = new Map<string, { x1: number; y1: number; x2: number; y2: number }[]>()

      // Add accumulated layers first (each layer now contains all lines for that layer)
      // Only export visible layers - hidden layers are excluded from final output
      accumulatedLayers.filter(layer => layer.visible).forEach(layer => {
        const existing = allLinesByColor.get(layer.color) || []
        layer.lines.forEach(line => {
          existing.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })
        })
        allLinesByColor.set(layer.color, existing)
      })

      // Add current optimized lines
      optimizedLines.forEach(line => {
        const color = layerColor || line.color
        const existing = allLinesByColor.get(color) || []
        existing.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })
        allLinesByColor.set(color, existing)
      })

      // Get unique colors used across all fills
      const uniqueColors = Array.from(allLinesByColor.keys())

      // Create fill nodes - one per color
      const fillNodes: SVGNode[] = []

      // For each color, create a single fill node with all lines
      uniqueColors.forEach((color, index) => {
        const lines = allLinesByColor.get(color)
        if (!lines || lines.length === 0) return

        // Convert lines to a single compound path
        let pathD = linesToCompoundPath(lines, 2)

        // If retainStrokes and only one color, append outline from original paths
        if (retainStrokes && uniqueColors.length === 1) {
          simplifiedHatchedPaths.forEach(({ pathInfo }) => {
            const originalD = pathInfo.element.getAttribute('d')
            if (originalD) {
              pathD = pathD + ' ' + originalD
            }
          })
        }

        const nodeId = uniqueColors.length > 1
          ? `fill-${color.replace('#', '')}-${index}`
          : `fill-${Date.now()}`
        const nodeName = uniqueColors.length > 1
          ? `Fill ${color}`
          : `Fill`

        // Create as a path element
        const pathMarkup = `<path id="${nodeId}" d="${pathD}" fill="${color}" stroke="${color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/>`

        // Create element for the node
        const dummyDoc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${pathMarkup}</svg>`, 'image/svg+xml')
        const pathElement = dummyDoc.querySelector('path') as Element

        const fillNode: SVGNode = {
          id: nodeId,
          name: nodeName,
          type: 'path',
          element: pathElement,
          isGroup: false,
          fillColor: undefined,
          children: [],
          customMarkup: pathMarkup,
        }

        fillNodes.push(fillNode)
      })

      // Map fill nodes to first target node
      const fillNodesByTargetId = new Map<string, SVGNode[]>()
      if (targetNodes.length > 0) {
        fillNodesByTargetId.set(targetNodes[0].id, fillNodes)
      }

    // Get set of target node IDs for quick lookup
    const targetIdSet = new Set(targetNodes.map(n => n.id))

    // Replace each target node with a group containing its fill children
    const updateNodesWithFillChildren = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (targetIdSet.has(node.id)) {
          const newChildren = fillNodesByTargetId.get(node.id) || []
          // Replace this node with a group containing all fill layers
          // Mark as group so children display properly in layer tree
          return {
            ...node,
            isGroup: newChildren.length > 0, // Mark as group if has children
            type: newChildren.length > 0 ? 'g' : node.type,
            children: newChildren,
            customMarkup: undefined, // Remove any custom markup on parent, children have it
          }
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNodesWithFillChildren(node.children) }
        }
        return node
      })
    }

      const updatedNodes = updateNodesWithFillChildren(layerNodes)
      setLayerNodes(updatedNodes)
      rebuildSvgFromLayers(updatedNodes)

      // Clear all state when done
      setPreservedFillData(null)
      setAccumulatedLayers([])
      setLayerColor('')
      setIsProcessing(false)

      setFillTargetNodeIds([])
      setActiveTab('sort')
    }, 0) // End setTimeout
  }, [targetNodes, simplifiedHatchedPaths, accumulatedLayers, layerColor, retainStrokes, penWidthPx, layerNodes, setLayerNodes, setFillTargetNodeIds, setActiveTab, rebuildSvgFromLayers, setPreservedFillData, setIsProcessing])

  // Enter key handler - triggers Apply Fill when preview is showing
  useEffect(() => {
    const handleEnterKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return

      const target = e.target as HTMLElement
      // Don't trigger if user is in an input field
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Only trigger if preview is showing and we have paths
      if (showHatchPreview && fillPaths.length > 0) {
        e.preventDefault()
        handleApplyFill()
      }
    }

    window.addEventListener('keydown', handleEnterKey)
    return () => window.removeEventListener('keydown', handleEnterKey)
  }, [showHatchPreview, fillPaths.length, handleApplyFill])

  // Maximum accumulated layers to prevent memory bloat
  const MAX_ACCUMULATED_LAYERS = 100

  // Track newly added layer that needs population when lines regenerate
  const pendingLayerId = useRef<string | null>(null)

  // Add a new layer with rotated angle
  // If multiple colors exist in the selected paths, creates one layer per unique color
  const handleAddLayer = useCallback(() => {
    // Calculate the new angle for this layer
    const newAngle = (angle + newLayerAngle) % 180

    // Group paths by color to create separate layers for each unique color
    const pathsByColor = new Map<string, typeof simplifiedHatchedPaths>()
    for (const hatchedPath of simplifiedHatchedPaths) {
      const color = hatchedPath.pathInfo.color || '#000000'
      if (!pathsByColor.has(color)) {
        pathsByColor.set(color, [])
      }
      pathsByColor.get(color)!.push(hatchedPath)
    }

    // If no paths, create a single default layer
    if (pathsByColor.size === 0) {
      pathsByColor.set('#000000', [])
    }

    const newLayers: FillLayer[] = []
    const newLayerIds: string[] = []
    const baseTimestamp = Date.now()

    // Create one layer per unique color
    let colorIndex = 0
    for (const [color, colorPaths] of pathsByColor) {
      const layerId = `layer-${baseTimestamp}-${colorIndex}-${Math.random().toString(36).substr(2, 9)}`
      newLayerIds.push(layerId)

      // Collect lines for this color
      const colorLines: HatchLine[] = []
      colorPaths.forEach(({ lines }) => {
        colorLines.push(...lines)
      })

      const firstPath = colorPaths[0]?.pathInfo

      const newLayer: FillLayer = {
        id: layerId,
        lines: colorLines,
        color,
        originalColor: color,  // Store original for path matching
        pathId: firstPath?.id || '',
        angle: newAngle,
        lineSpacing,
        pattern: fillPattern,
        inset,
        lineCount: colorLines.length,
        penWidth,
        visible: true,
      }

      newLayers.push(newLayer)
      colorIndex++
    }

    // Add all new layers
    setAccumulatedLayers(prev => {
      const combined = [...prev, ...newLayers]
      if (combined.length > MAX_ACCUMULATED_LAYERS) {
        console.warn(`[FillTab] Accumulated layers exceeded ${MAX_ACCUMULATED_LAYERS}, trimming oldest layers`)
        return combined.slice(-MAX_ACCUMULATED_LAYERS)
      }
      return combined
    })

    // Select the first new layer so it becomes editable
    if (newLayerIds.length > 0) {
      setSelectedLayerIds(new Set([newLayerIds[0]]))
    }

    // Track first layer ID for pending population (in case lines need regeneration)
    pendingLayerId.current = newLayerIds[0] || null

    // Set the angle to the new value (this will trigger line regeneration)
    setAngle(newAngle)

    // Reset layer color for the new layer
    setLayerColor('')
  }, [simplifiedHatchedPaths, angle, newLayerAngle, lineSpacing, fillPattern, inset, penWidth])

  // Populate pending layer when lines regenerate after Add Layer
  // This handles the case where lines need to be regenerated after angle change
  useEffect(() => {
    if (!pendingLayerId.current || simplifiedHatchedPaths.length === 0) return

    const layerId = pendingLayerId.current

    // Check if this layer exists in state yet
    const layer = accumulatedLayers.find(l => l.id === layerId)
    if (!layer) {
      // Layer not yet added to state - wait for next update
      return
    }

    if (layer.lines.length > 0) {
      // Layer already has lines - we're done
      pendingLayerId.current = null
      return
    }

    // Collect lines from the regenerated preview, filtered by this layer's color
    // Use originalColor for path matching (not color which may have been overridden)
    const originalColor = layer.originalColor
    const colorLines: HatchLine[] = []
    simplifiedHatchedPaths.forEach(({ pathInfo, lines }) => {
      // Only include lines from paths matching this layer's original color
      if (pathInfo.color === originalColor) {
        colorLines.push(...lines)
      }
    })

    if (colorLines.length > 0) {
      // Update the pending layer with the new lines
      setAccumulatedLayers(prev => prev.map(l => {
        if (l.id === layerId) {
          return { ...l, lines: colorLines, lineCount: colorLines.length }
        }
        return l
      }))
      pendingLayerId.current = null
    }
  }, [simplifiedHatchedPaths, accumulatedLayers])

  // Clear all accumulated layers
  const handleClearLayers = useCallback(() => {
    setAccumulatedLayers([])
    setLayerColor('')
    setSelectedLayerId(null)
  }, [])

  // Auto-enable preview on first load to show default fill
  useEffect(() => {
    if (fillPaths.length > 0 && !showHatchPreview) {
      setShowHatchPreview(true)
    }
  }, [fillPaths.length]) // Only run when fillPaths changes, not showHatchPreview

  // Auto-add first layer when entering Fill tab with paths but no layers
  // This ensures the user sees layers in the list, not just a preview
  // Creates one layer per unique color if multiple colors exist
  const hasAutoAddedFirstLayer = useRef(false)
  const firstLayerId = useRef<string | null>(null)
  useEffect(() => {
    // Only auto-add once, when we have hatched paths and no accumulated layers
    if (simplifiedHatchedPaths.length > 0 && accumulatedLayers.length === 0 && !hasAutoAddedFirstLayer.current) {
      hasAutoAddedFirstLayer.current = true

      // Group paths by color to create separate layers for each unique color
      const pathsByColor = new Map<string, typeof simplifiedHatchedPaths>()
      for (const hatchedPath of simplifiedHatchedPaths) {
        const color = hatchedPath.pathInfo.color || '#000000'
        if (!pathsByColor.has(color)) {
          pathsByColor.set(color, [])
        }
        pathsByColor.get(color)!.push(hatchedPath)
      }

      const newLayers: FillLayer[] = []
      const baseTimestamp = Date.now()
      let colorIndex = 0

      // Create one layer per unique color
      for (const [color, colorPaths] of pathsByColor) {
        const layerId = `layer-${baseTimestamp}-${colorIndex}-${Math.random().toString(36).substr(2, 9)}`

        // Store first layer ID for reference
        if (colorIndex === 0) {
          firstLayerId.current = layerId
        }

        // Collect lines for this color
        const colorLines: HatchLine[] = []
        colorPaths.forEach(({ lines }) => {
          colorLines.push(...lines)
        })

        const firstPath = colorPaths[0]?.pathInfo

        const newLayer: FillLayer = {
          id: layerId,
          lines: colorLines,
          color,
          originalColor: color,  // Store original for path matching
          pathId: firstPath?.id || '',
          angle,
          lineSpacing,
          pattern: fillPattern,
          inset,
          lineCount: colorLines.length,
          penWidth,
          visible: true,
        }

        newLayers.push(newLayer)
        colorIndex++
      }

      setAccumulatedLayers(newLayers)
      // Select the first layer so it becomes editable
      if (newLayers.length > 0) {
        setSelectedLayerIds(new Set([newLayers[0].id]))
      }
      // Don't rotate angle - keep it the same so layer 1 reflects current settings
    }
  }, [simplifiedHatchedPaths.length, accumulatedLayers.length])

  // Update selected layers when settings change
  // This provides live preview as user adjusts settings
  // When multiple layers are selected, applies the same pattern/settings to all of them
  useEffect(() => {
    // Don't update if a pending layer is being populated
    if (pendingLayerId.current) return

    // Need at least one layer selected and some paths
    if (selectedLayerIds.size === 0 || simplifiedHatchedPaths.length === 0) return

    const selectedIds = Array.from(selectedLayerIds)

    // Update all selected layers with the current settings
    setAccumulatedLayers(prev => {
      let hasChanges = false

      const updated = prev.map(layer => {
        // Only update layers that are selected
        if (!selectedIds.includes(layer.id)) return layer

        // Determine the target color for this layer
        // If user set a layerColor override, use that; otherwise keep the layer's current color
        // Note: layerColor override only applies when single layer is selected
        const targetColor = (selectedLayerIds.size === 1 && layerColor) ? layerColor : layer.color

        // Collect lines from paths matching this layer's ORIGINAL color
        // This ensures each color layer only gets lines from paths of that color
        // even if the display color has been overridden
        const colorLines: HatchLine[] = []
        simplifiedHatchedPaths.forEach(({ pathInfo, lines }) => {
          // Include lines if path matches the layer's original color (not the display color)
          if (pathInfo.color === layer.originalColor) {
            colorLines.push(...lines)
          }
        })

        // Check if anything actually changed to avoid unnecessary updates
        if (colorLines.length === layer.lineCount &&
            layer.angle === angle &&
            layer.lineSpacing === lineSpacing &&
            layer.pattern === fillPattern &&
            layer.inset === inset &&
            layer.penWidth === penWidth &&
            layer.color === targetColor) {
          return layer
        }

        hasChanges = true
        return {
          ...layer,
          lines: colorLines,
          color: targetColor,
          // originalColor is preserved via spread
          angle,
          lineSpacing,
          pattern: fillPattern,
          inset,
          lineCount: colorLines.length,
          penWidth,
        }
      })

      return hasChanges ? updated : prev
    })
  }, [simplifiedHatchedPaths, layerColor, angle, lineSpacing, fillPattern, inset, penWidth, selectedLayerIds])

  // Handle weave request from menu command or button
  useEffect(() => {
    if (weaveRequested) {
      // Reset the request immediately
      setWeaveRequested(false)

      console.log('[Weave] Triggered. Selected layers:', selectedLayerIds.size, Array.from(selectedLayerIds))
      console.log('[Weave] Accumulated layers:', accumulatedLayers.map(l => ({ id: l.id, lineCount: l.lineCount })))

      // Check if we have exactly 2 layers selected
      if (selectedLayerIds.size !== 2) {
        const msg = `Weave requires exactly 2 layers selected (you have ${selectedLayerIds.size}). Use Shift/Cmd+click to multi-select.`
        console.log('[Weave]', msg)
        setStatusMessage(msg)
        return
      }

      // Get the two selected layers
      const layerIds = Array.from(selectedLayerIds)
      const layer1 = accumulatedLayers.find(l => l.id === layerIds[0])
      const layer2 = accumulatedLayers.find(l => l.id === layerIds[1])

      console.log('[Weave] Layer 1:', layer1 ? { id: layer1.id, lines: layer1.lines.length } : 'NOT FOUND')
      console.log('[Weave] Layer 2:', layer2 ? { id: layer2.id, lines: layer2.lines.length } : 'NOT FOUND')

      if (!layer1 || !layer2) {
        setStatusMessage('Could not find selected layers')
        return
      }

      console.log(`[Weave] Processing ${layer1.lines.length} + ${layer2.lines.length} lines with pattern ${weavePattern}, gap ${weaveGapMargin}`)
      setStatusMessage(`Weaving ${layer1.lineCount} + ${layer2.lineCount} lines...`)
      setIsProcessing(true)

      // Run weave algorithm
      const startTime = performance.now()
      const result = weaveLayerLines(
        layer1.lines,
        layer2.lines,
        layer1.penWidth,
        layer2.penWidth,
        weavePattern,
        weaveGapMargin
      )
      const elapsed = performance.now() - startTime
      console.log(`[Weave] Result: layer1=${result.layer1.length} lines, layer2=${result.layer2.length} lines in ${elapsed.toFixed(0)}ms`)

      // Create new layers with woven lines
      const newLayer1: FillLayer = {
        ...layer1,
        id: `${layer1.id}-woven`,
        lines: result.layer1,
        lineCount: result.layer1.length,
      }

      const newLayer2: FillLayer = {
        ...layer2,
        id: `${layer2.id}-woven`,
        lines: result.layer2,
        lineCount: result.layer2.length,
      }

      // Replace the original layers with the woven versions
      setAccumulatedLayers(prev => {
        return prev.map(layer => {
          if (layer.id === layer1.id) return newLayer1
          if (layer.id === layer2.id) return newLayer2
          return layer
        })
      })

      // Clear selection
      setSelectedLayerIds(new Set())
      setIsProcessing(false)

      setStatusMessage(`Weave complete in ${elapsed.toFixed(0)}ms. ${result.layer1.length + result.layer2.length} line segments created.`)
    }
  }, [weaveRequested, setWeaveRequested, selectedLayerIds, accumulatedLayers, setStatusMessage, setIsProcessing, weavePattern, weaveGapMargin])

  // Note: Layer selection is now handled by UnifiedLayerList via handleLayerSelectionChange

  // Delete a specific layer
  const handleDeleteLayer = useCallback((layerId: string) => {
    setAccumulatedLayers(prev => {
      const remaining = prev.filter(l => l.id !== layerId)
      // If exactly 1 layer remains after deletion, auto-select it
      if (remaining.length === 1) {
        setSelectedLayerIds(new Set([remaining[0].id]))
      } else {
        // Clear selection for deleted layer
        setSelectedLayerIds(prevIds => {
          const newIds = new Set(prevIds)
          newIds.delete(layerId)
          return newIds
        })
      }
      return remaining
    })
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null)
    }
  }, [selectedLayerId])

  // Toggle visibility for a specific layer
  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    setAccumulatedLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ))
  }, [])

  // Note: Drag-drop is now handled by UnifiedLayerList via handleLayerReorder

  // Convert FillLayer[] to FillLayerListItem[] for UnifiedLayerList
  const layerListItems = useMemo<FillLayerListItem[]>(() => {
    return accumulatedLayers.map((layer) => ({
      id: layer.id,
      name: layer.pattern,
      color: layer.color,
      fillLayer: layer,
      // Additional metadata for badges
      pointCount: layer.lineCount,
      isVisible: layer.visible,
    }))
  }, [accumulatedLayers])

  // Handler for UnifiedLayerList selection changes
  const handleLayerSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedLayerIds(ids)
    // If single selection, also load settings
    if (ids.size === 1) {
      const layerId = Array.from(ids)[0]
      const layer = accumulatedLayers.find(l => l.id === layerId)
      if (layer) {
        setAngle(layer.angle)
        setLineSpacing(layer.lineSpacing)
        setFillPattern(layer.pattern)
        setInset(layer.inset)
        setLayerColor(layer.color)
      }
    }
  }, [accumulatedLayers])

  // Handler for UnifiedLayerList reorder (flat mode)
  const handleLayerReorder = useCallback((fromIndex: number, toIndex: number) => {
    setAccumulatedLayers(prev => {
      const newLayers = [...prev]
      const [dragged] = newLayers.splice(fromIndex, 1)
      newLayers.splice(toIndex, 0, dragged)
      return newLayers
    })
  }, [])

  // Fetch pattern banners for layers that don't have cached previews
  useEffect(() => {
    if (!window.electron?.patternBanner) return

    // Get unique pattern+spacing combinations that need banners
    const needed = new Map<string, { pattern: string; spacing: number }>()
    accumulatedLayers.forEach(layer => {
      const key = `${layer.pattern}|${layer.lineSpacing}`
      if (!bannerCache.has(key) && !needed.has(key)) {
        needed.set(key, { pattern: layer.pattern, spacing: layer.lineSpacing })
      }
    })

    if (needed.size === 0) return

    // Fetch each banner
    needed.forEach(async ({ pattern, spacing }, key) => {
      try {
        // Use pattern name hash as seed for consistency
        const seed = pattern.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        const svg = await window.electron!.patternBanner({
          pattern,
          spacing,
          seed,
          width: 4,
          height: 0.5,
          cells: 20,
        })
        setBannerCache(prev => new Map(prev).set(key, svg))
      } catch (err) {
        console.warn(`[FillTab] Failed to generate banner for ${pattern}:`, err)
      }
    })
  }, [accumulatedLayers, bannerCache])

  // Get cached banner preview for a layer, or fall back to color swatch
  const getLayerPreview = useCallback((layer: FillLayer): string | null => {
    const key = `${layer.pattern}|${layer.lineSpacing}`
    return bannerCache.get(key) || null
  }, [bannerCache])

  // Render function for layer list items
  const renderLayerItem = useCallback((item: FillLayerListItem, state: ItemRenderState) => {
    const layer = item.fillLayer
    const bannerSvg = getLayerPreview(layer)
    // Apply layer color to banner SVG by replacing stroke colors
    const coloredBanner = bannerSvg
      ? bannerSvg.replace(/stroke="[^"]*"/g, `stroke="${layer.color}"`)
      : null

    return (
      <div className="accumulated-layer-item-content">
        <span className="layer-drag-handle">⋮⋮</span>
        <button
          className={`layer-visibility-btn ${state.isVisible ? 'visible' : 'hidden'}`}
          onClick={(e) => {
            e.stopPropagation()
            handleToggleLayerVisibility(layer.id)
          }}
          title={state.isVisible ? 'Hide layer' : 'Show layer'}
        >
          {state.isVisible ? '👁' : '👁‍🗨'}
        </button>
        {coloredBanner ? (
          <span
            className="layer-preview"
            style={{ opacity: state.isVisible ? 1 : 0.4 }}
            dangerouslySetInnerHTML={{ __html: coloredBanner }}
          />
        ) : (
          <span
            className="layer-color-swatch"
            style={{ backgroundColor: layer.color, opacity: state.isVisible ? 1 : 0.4 }}
          />
        )}
        <span className="layer-info" style={{ opacity: state.isVisible ? 1 : 0.5 }}>
          <span className="layer-pattern">{layer.pattern}</span>
          <span className="layer-details">{layer.angle}° • {layer.penWidth}mm • {layer.lineCount.toLocaleString()}</span>
        </span>
        <button
          className="layer-delete-btn"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteLayer(layer.id)
            setSelectedLayerIds(prev => {
              const newSet = new Set(prev)
              newSet.delete(layer.id)
              return newSet
            })
          }}
          title="Delete this layer"
        >
          ×
        </button>
      </div>
    )
  }, [handleDeleteLayer, handleToggleLayerVisibility, getLayerPreview])

  const handleNavigateToOrder = useCallback(() => {
    if (!boundingBox || simplifiedHatchedPaths.length === 0) return

    // Show processing state while optimizing
    setIsProcessing(true)

    // Use setTimeout to let UI update before running expensive optimization
    setTimeout(() => {
      // Run optimization now (deferred from preview for responsiveness)
      const optimizedLines = optimizeLineOrderMultiPass(simplifiedHatchedPaths)

      // Convert optimized lines to OrderLine format
      const orderLines = optimizedLines.map(line => ({
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        color: line.color,
        pathId: line.pathId,
      }))

      // Set order data and navigate to Order tab
      setOrderData({
        lines: orderLines,
        boundingBox,
        source: 'fill',
        onApply: (_orderedLines, _improvement) => {
          // When apply is clicked in Order tab, apply the fill
          // Note: improvement is tracked by handleApplyFill which sets optimizationState.fillApplied
          handleApplyFill()
        },
      })
      setIsProcessing(false)
      setActiveTab('order')
    }, 0)
  }, [boundingBox, simplifiedHatchedPaths, setOrderData, setActiveTab, handleApplyFill, setIsProcessing])

  // Pan/zoom is now handled by usePanZoom hook

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

  if (fillTargetNodeIds.length === 0 || targetNodes.length === 0) {
    return (
      <div className="fill-tab empty-state">
        <div className="empty-content">
          <h3>No Layers Selected</h3>
          <p>Go to the Sort tab, select one or more layers with fills, and click the Fill button.</p>
          <button className="back-button" onClick={handleBack}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fill-tab three-column">
      <aside className="fill-sidebar left">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleBack}>
            ← Back
          </button>
          <h2>Fill Layers</h2>
        </div>

        <div className="sidebar-controls">
          {/* Layer action buttons */}
          <div className="fill-control compact layer-buttons">
            <button
              className="new-layer-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleAddLayer}
              title={`Add current pattern as a layer and rotate angle by ${newLayerAngle}°`}
            >
              + Add Layer
            </button>
            <div className="new-layer-angle">
              <span>at</span>
              <input
                type="number"
                min="0"
                max="180"
                step="15"
                value={newLayerAngle}
                onChange={(e) => setNewLayerAngle(Math.max(0, Math.min(180, Number(e.target.value))))}
                className="angle-input"
              />
              <span>°</span>
            </div>
          </div>

          {/* Accumulated layers list - always show */}
          <div className="accumulated-layers-list">
            <div className="accumulated-layers-header">
              <span>{accumulatedLayers.length} layer{accumulatedLayers.length !== 1 ? 's' : ''}</span>
              {accumulatedLayers.length > 0 && (
                <button
                  className="clear-layers-btn-small"
                  onClick={handleClearLayers}
                  title="Clear all accumulated layers"
                >
                  Clear
                </button>
              )}
            </div>
            <UnifiedLayerList
              items={layerListItems}
              mode="flat"
              selectedIds={selectedLayerIds}
              onSelectionChange={handleLayerSelectionChange}
              selectionMode="multi-with-modifiers"
              enableDragDrop={true}
              onReorderFlat={handleLayerReorder}
              renderItem={renderLayerItem}
              emptyMessage="Click &quot;Add Layer&quot; to create fill layers"
              className="accumulated-layers-items"
              itemClassName="accumulated-layer-item"
            />
            {selectedLayerIds.size === 2 && (
              <div className="weave-section">
                <div className="weave-header">
                  <span>Weave Settings</span>
                  <span className="weave-selection-count">2 layers</span>
                </div>

                <div className="weave-control">
                  <label>Pattern</label>
                  <div className="weave-pattern-buttons">
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'trueWeave' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('trueWeave')}
                      title="Alternating over/under per line"
                    >
                      Weave
                    </button>
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'checkerboard' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('checkerboard')}
                      title="Alternating per crossing"
                    >
                      Check
                    </button>
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'layer1Over' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('layer1Over')}
                      title="First layer always on top"
                    >
                      L1 Over
                    </button>
                    <button
                      className={`weave-pattern-btn ${weavePattern === 'layer2Over' ? 'active' : ''}`}
                      onClick={() => setWeavePattern('layer2Over')}
                      title="Second layer always on top"
                    >
                      L2 Over
                    </button>
                  </div>
                </div>

                <div className="weave-control">
                  <label>Gap Size: {weaveGapMargin.toFixed(1)}px</label>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={weaveGapMargin}
                    onChange={(e) => setWeaveGapMargin(Number(e.target.value))}
                    className="weave-slider"
                  />
                  <div className="weave-slider-labels">
                    <span>Tight</span>
                    <span>Wide</span>
                  </div>
                </div>

                <button
                  className="weave-apply-btn"
                  onClick={() => setWeaveRequested(true)}
                  title="Apply weave pattern to selected layers (Cmd+Shift+W)"
                >
                  Apply Weave
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main
        className="fill-main"
        ref={previewRef}
        {...panZoomHandlers}
      >
        {previewSvg ? (
          <div
            className="fill-preview-container"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
          >
            <svg
              className="fill-preview-svg"
              viewBox={previewSvg.viewBox}
              preserveAspectRatio="xMidYMid meet"
              dangerouslySetInnerHTML={{ __html: previewSvg.content }}
            />
          </div>
        ) : (
          <div className="fill-preview-empty">
            <p>No geometry to preview</p>
          </div>
        )}
      </main>

      <aside className="fill-sidebar right">
        <div className="sidebar-content">
          {/* Big Apply CTA at top */}
          <button
            className="apply-btn-primary"
            disabled={fillPaths.length === 0 || (accumulatedLayers.length === 0 && !showHatchPreview)}
            onClick={handleApplyFill}
            title="Apply all fill layers to the SVG (Enter) - uses rat-king"
          >
            Apply Fill
          </button>

          {/* Warning when multiple shapes may need merging */}
          {fillPaths.length > 3 && !mergeBeforeFill && (
            <div className="fill-warning-banner">
              <div className="warning-icon">⚠️</div>
              <div className="warning-content">
                <strong>{fillPaths.length} separate shapes</strong>
                <p>Fill may appear in gaps between shapes. For text or logos, merge shapes first or enable "Merge before fill".</p>
                <div className="warning-actions">
                  <button
                    className="warning-btn primary"
                    onClick={() => setActiveTab('merge')}
                  >
                    Go to Merge Tab
                  </button>
                  <button
                    className="warning-btn secondary"
                    onClick={() => setMergeBeforeFill(true)}
                  >
                    Enable Merge
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="fill-section">
            <h3>Pattern Type</h3>
            <div className="pattern-selector">
              <button
                className={`pattern-btn ${fillPattern === 'lines' ? 'active' : ''}`}
                onClick={() => setFillPattern('lines')}
                title="Parallel lines at an angle"
              >
                Lines
              </button>
              {!DNF_PATTERNS.has('concentric') && (
              <button
                className={`pattern-btn ${fillPattern === 'concentric' ? 'active' : ''}`}
                onClick={() => setFillPattern('concentric')}
                title="Concentric loops from outside in (snake)"
              >
                Concentric
              </button>
              )}
              <button
                className={`pattern-btn ${fillPattern === 'wiggle' ? 'active' : ''}`}
                onClick={() => setFillPattern('wiggle')}
                title="Wavy/wiggle lines"
              >
                Wiggle
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'spiral' ? 'active' : ''}`}
                onClick={() => setFillPattern('spiral')}
                title="Spiral from center outward"
              >
                Spiral
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'honeycomb' ? 'active' : ''}`}
                onClick={() => setFillPattern('honeycomb')}
                title="Hexagonal honeycomb pattern"
              >
                Honeycomb
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'gyroid' ? 'active' : ''}`}
                onClick={() => setFillPattern('gyroid')}
                title="Gyroid minimal surface pattern"
              >
                Gyroid
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'crosshatch' ? 'active' : ''}`}
                onClick={() => setFillPattern('crosshatch')}
                title="Automatic crosshatch (two line sets at 90°)"
              >
                Crosshatch
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'zigzag' ? 'active' : ''}`}
                onClick={() => setFillPattern('zigzag')}
                title="Zigzag/sawtooth lines"
              >
                Zigzag
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'wave' ? 'active' : ''}`}
                onClick={() => setFillPattern('wave')}
                title="Smooth sine wave pattern"
              >
                Wave
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'radial' ? 'active' : ''}`}
                onClick={() => setFillPattern('radial')}
                title="Lines radiating from center"
              >
                Radial
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'crossspiral' ? 'active' : ''}`}
                onClick={() => setFillPattern('crossspiral')}
                title="Clockwise and counter-clockwise spirals overlaid"
              >
                X-Spiral
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'fermat' ? 'active' : ''}`}
                onClick={() => setFillPattern('fermat')}
                title="Fermat spiral (sunflower pattern)"
              >
                Fermat
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'hilbert' ? 'active' : ''}`}
                onClick={() => setFillPattern('hilbert')}
                title="Hilbert space-filling curve"
              >
                Hilbert
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'scribble' ? 'active' : ''}`}
                onClick={() => setFillPattern('scribble')}
                title="Random scribble pattern"
              >
                Scribble
              </button>
              <button
                className={`pattern-btn ${fillPattern === 'custom' ? 'active' : ''}`}
                onClick={() => setFillPattern('custom')}
                title="Custom shape tiling"
              >
                Custom
              </button>
            </div>
          </div>

          {/* Fill Color controls - moved from left sidebar */}
          <div className="fill-section">
            <h3>Fill Color</h3>
            <div className="fill-control">
              <div className="control-row color-row">
                <input
                  type="color"
                  value={draftLayerColor || (fillPaths[0]?.color || '#000000')}
                  onInput={(e) => setDraftLayerColor((e.target as HTMLInputElement).value)}
                  onChange={(e) => setLayerColor(e.target.value)}
                  className="layer-color-picker"
                  title="Pick color for this fill layer"
                />
                <input
                  type="text"
                  value={draftLayerColor || (fillPaths[0]?.color || '#000000')}
                  onChange={(e) => setDraftLayerColor(e.target.value)}
                  onBlur={(e) => setLayerColor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setLayerColor((e.target as HTMLInputElement).value)
                    }
                  }}
                  className="layer-color-input"
                  placeholder="#000000"
                />
                {(layerColor || draftLayerColor) && (
                  <button
                    className="layer-color-reset"
                    onClick={() => {
                      setLayerColor('')
                      setDraftLayerColor('')
                    }}
                    title="Reset to original color"
                  >
                    ×
                  </button>
                )}
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
                  value={draftPenWidth}
                  onChange={(e) => setDraftPenWidth(Number(e.target.value))}
                  onPointerUp={() => setPenWidth(draftPenWidth)}
                  onKeyUp={() => setPenWidth(draftPenWidth)}
                  className="fill-slider"
                />
                <span className="control-value">{draftPenWidth}mm</span>
              </div>
            </div>
          </div>

          <div className="fill-section">
            <h3>Pattern Settings</h3>

            <div
              className={`fill-control selectable ${selectedControl === 'lineSpacing' ? 'selected' : ''}`}
              onClick={() => setSelectedControl('lineSpacing')}
            >
              <label>Line Spacing</label>
              <div className="control-row">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={draftLineSpacing}
                  onChange={(e) => setDraftLineSpacing(Number(e.target.value))}
                  onPointerUp={() => setLineSpacing(draftLineSpacing)}
                  onKeyUp={() => setLineSpacing(draftLineSpacing)}
                  className="fill-slider"
                />
                <span className="control-value">{draftLineSpacing}px</span>
              </div>
            </div>

            <div
              className={`fill-control selectable ${selectedControl === 'angle' ? 'selected' : ''} ${fillPattern === 'concentric' || fillPattern === 'spiral' ? 'disabled' : ''}`}
              onClick={() => fillPattern !== 'concentric' && fillPattern !== 'spiral' && setSelectedControl('angle')}
            >
              <label>Angle</label>
              <div className="control-row">
                <span
                  className="angle-arrow"
                  style={{ transform: `rotate(${draftAngle}deg)`, opacity: fillPattern === 'concentric' || fillPattern === 'spiral' ? 0.4 : 1 }}
                  title={fillPattern === 'concentric' || fillPattern === 'spiral' ? 'Not applicable for this pattern' : `${draftAngle}° direction`}
                >
                  →
                </span>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={draftAngle}
                  onChange={(e) => setDraftAngle(Number(e.target.value))}
                  onPointerUp={() => setAngle(draftAngle)}
                  onKeyUp={() => setAngle(draftAngle)}
                  className="fill-slider"
                  disabled={fillPattern === 'concentric' || fillPattern === 'spiral'}
                />
                <span className="control-value">{draftAngle}°</span>
              </div>
            </div>

            {fillPattern === 'lines' && (
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
            )}

            {(fillPattern === 'wiggle' || fillPattern === 'zigzag' || fillPattern === 'wave') && (
              <div
                className={`fill-control selectable ${selectedControl === 'wiggleAmplitude' ? 'selected' : ''}`}
                onClick={() => setSelectedControl('wiggleAmplitude')}
              >
                <label>Amplitude</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={draftWiggleAmplitude}
                    onChange={(e) => setDraftWiggleAmplitude(Number(e.target.value))}
                    onPointerUp={() => setWiggleAmplitude(draftWiggleAmplitude)}
                    onKeyUp={() => setWiggleAmplitude(draftWiggleAmplitude)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftWiggleAmplitude}px</span>
                </div>
              </div>
            )}

            {(fillPattern === 'wiggle' || fillPattern === 'wave') && (
              <div
                className={`fill-control selectable ${selectedControl === 'wiggleFrequency' ? 'selected' : ''}`}
                onClick={() => setSelectedControl('wiggleFrequency')}
              >
                <label>Frequency</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={draftWiggleFrequency}
                    onChange={(e) => setDraftWiggleFrequency(Number(e.target.value))}
                    onPointerUp={() => setWiggleFrequency(draftWiggleFrequency)}
                    onKeyUp={() => setWiggleFrequency(draftWiggleFrequency)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftWiggleFrequency}</span>
                </div>
              </div>
            )}

            {fillPattern === 'spiral' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={singleSpiral}
                    onChange={(e) => setSingleSpiral(e.target.checked)}
                  />
                  Single spiral pattern
                </label>
                <p className="control-hint">
                  {singleSpiral
                    ? 'One spiral across all shapes'
                    : 'Individual spiral per shape'}
                </p>
              </div>
            )}

            {(fillPattern === 'spiral' || fillPattern === 'crossspiral' || fillPattern === 'fermat') && (
              <div className="fill-control">
                <label>Over Diameter</label>
                <div className="control-row">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    value={spiralOverDiameter}
                    onChange={(e) => setSpiralOverDiameter(Number(e.target.value))}
                    className="fill-input"
                    style={{ width: '80px' }}
                  />
                  <span className="control-value">× radius</span>
                </div>
              </div>
            )}

            {fillPattern === 'fermat' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={singleFermat}
                    onChange={(e) => setSingleFermat(e.target.checked)}
                  />
                  Single Fermat pattern
                </label>
                <p className="control-hint">
                  {singleFermat
                    ? 'One spiral across all shapes'
                    : 'Individual spiral per shape'}
                </p>
              </div>
            )}

            {fillPattern === 'hilbert' && (
              <div className="fill-control checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={singleHilbert}
                    onChange={(e) => setSingleHilbert(e.target.checked)}
                  />
                  Single Hilbert pattern
                </label>
                <p className="control-hint">
                  {singleHilbert
                    ? 'One curve across all shapes'
                    : 'Individual curve per shape'}
                </p>
              </div>
            )}

            {fillPattern === 'custom' && (
              <>
                <div className="fill-control">
                  <label>Tile Shape</label>
                  <div className="tile-shape-selector">
                    {(Object.keys(TILE_SHAPES) as TileShapeType[]).map(shape => (
                      <button
                        key={shape}
                        className={`tile-shape-btn ${customTileShape === shape ? 'active' : ''}`}
                        onClick={() => setCustomTileShape(shape)}
                        title={shape.charAt(0).toUpperCase() + shape.slice(1)}
                      >
                        {shape === 'triangle' && '△'}
                        {shape === 'square' && '□'}
                        {shape === 'diamond' && '◇'}
                        {shape === 'hexagon' && '⬡'}
                        {shape === 'star' && '☆'}
                        {shape === 'plus' && '+'}
                        {shape === 'circle' && '○'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fill-control">
                  <label>Tile Gap</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={customTileGap}
                      onChange={(e) => setCustomTileGap(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{customTileGap}px</span>
                  </div>
                </div>

                <div className="fill-control">
                  <label>Tile Size</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0.2"
                      max="2.0"
                      step="0.1"
                      value={customTileScale}
                      onChange={(e) => setCustomTileScale(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{(customTileScale * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="fill-control">
                  <label>Rotate Offset</label>
                  <div className="control-row">
                    <input
                      type="range"
                      min="0"
                      max="45"
                      step="1"
                      value={customTileRotateOffset}
                      onChange={(e) => setCustomTileRotateOffset(Number(e.target.value))}
                      className="fill-slider"
                    />
                    <span className="control-value">{customTileRotateOffset}°</span>
                  </div>
                </div>
              </>
            )}

            {(fillPattern === 'lines' || fillPattern === 'wiggle' || fillPattern === 'honeycomb' || fillPattern === 'crosshatch' || fillPattern === 'zigzag' || fillPattern === 'radial' || fillPattern === 'crossspiral' || fillPattern === 'hilbert' || fillPattern === 'gyroid' || fillPattern === 'fermat' || fillPattern === 'wave' || fillPattern === 'scribble' || fillPattern === 'custom') && (
              <div
                className={`fill-control selectable ${selectedControl === 'inset' ? 'selected' : ''}`}
                onClick={() => setSelectedControl('inset')}
              >
                <label>Inset</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={draftInset}
                    onChange={(e) => setDraftInset(Number(e.target.value))}
                    onPointerUp={() => setInset(draftInset)}
                    onKeyUp={() => setInset(draftInset)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftInset}px</span>
                </div>
              </div>
            )}

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

            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={mergeBeforeFill}
                  onChange={(e) => setMergeBeforeFill(e.target.checked)}
                />
                Merge shapes before fill
              </label>
              <span className="control-hint">Union all shapes into one (for text/logos)</span>
            </div>

{/* Evenodd fill rule is always enabled - it correctly handles compound paths
                (like the Three Needs bar logo) by filling areas inside an odd number of
                polygon boundaries. The checkbox was removed since there's no reason to
                disable it - standard fill mode produces incorrect results for compound paths. */}
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
              className="fill-order-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleNavigateToOrder}
              title="View and optimize path order for pen plotters"
            >
              Order
            </button>
          </div>

          {showHatchPreview && fillProgress < 100 && (
            <div className="fill-progress">
              <div className="fill-progress-bar">
                <div
                  className="fill-progress-fill"
                  style={{ width: `${fillProgress}%` }}
                />
              </div>
              <span className="fill-progress-text">{fillProgress}%</span>
            </div>
          )}

          {fillStats && (
            <div className="fill-stats">
              <div className="fill-stat">
                <span className="stat-label">Lines:</span>
                <span className="stat-value">{fillStats.lines.toLocaleString()}</span>
              </div>
              <div className="fill-stat">
                <span className="stat-label">Points:</span>
                <span className="stat-value">{fillStats.points.toLocaleString()}</span>
              </div>
            </div>
          )}

          {showHatchPreview && (
            <div className="fill-control">
              <label>Simplify</label>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={draftSimplifyTolerance}
                  onChange={(e) => setDraftSimplifyTolerance(Number(e.target.value))}
                  onPointerUp={() => setSimplifyTolerance(draftSimplifyTolerance)}
                  onKeyUp={() => setSimplifyTolerance(draftSimplifyTolerance)}
                  className="fill-slider"
                />
                <span className="control-value">{draftSimplifyTolerance === 0 ? 'Off' : draftSimplifyTolerance.toFixed(1)}</span>
              </div>
            </div>
          )}

          <div className="fill-section">
            <h3>Crop</h3>
            <div className="fill-control checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={enableCrop}
                  onChange={(e) => setEnableCrop(e.target.checked)}
                />
                Enable crop
              </label>
            </div>

            {enableCrop && (
              <div className="fill-control">
                <label>Crop Inset</label>
                <div className="control-row">
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={draftCropInset}
                    onChange={(e) => setDraftCropInset(Number(e.target.value))}
                    onPointerUp={() => setCropInset(draftCropInset)}
                    onKeyUp={() => setCropInset(draftCropInset)}
                    className="fill-slider"
                  />
                  <span className="control-value">{draftCropInset}%</span>
                </div>
                <p className="control-hint">
                  Percentage from each edge to crop
                </p>
              </div>
            )}
          </div>

          {/* Weave Settings - shown when 2 layers are selected */}
          {selectedLayerIds.size === 2 && (
            <div className="fill-section weave-section">
              <h3>Weave Settings</h3>
              <div className="fill-control">
                <label>Pattern</label>
                <div className="pattern-selector weave-patterns">
                  <button
                    className={`pattern-btn ${weavePattern === 'trueWeave' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('trueWeave')}
                    title="Each line alternates over/under"
                  >
                    True Weave
                  </button>
                  <button
                    className={`pattern-btn ${weavePattern === 'checkerboard' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('checkerboard')}
                    title="Based on line indices"
                  >
                    Checkerboard
                  </button>
                  <button
                    className={`pattern-btn ${weavePattern === 'layer1Over' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('layer1Over')}
                    title="First selected layer always on top"
                  >
                    Layer 1 Over
                  </button>
                  <button
                    className={`pattern-btn ${weavePattern === 'layer2Over' ? 'active' : ''}`}
                    onClick={() => setWeavePattern('layer2Over')}
                    title="Second selected layer always on top"
                  >
                    Layer 2 Over
                  </button>
                </div>
              </div>
              <div className="fill-control">
                <label>Gap Margin: {weaveGapMargin.toFixed(1)}px</label>
                <div className="control-row">
                  <input
                    type="range"
                    className="fill-slider"
                    min={0}
                    max={3}
                    step={0.1}
                    value={weaveGapMargin}
                    onChange={(e) => setWeaveGapMargin(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <button
                className="apply-btn-primary weave-btn"
                onClick={() => setWeaveRequested(true)}
              >
                Apply Weave
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-bar-left">
          {targetNodes.length === 1 && targetNode && (
            <span className="status-filename">{targetNode.name || targetNode.id}</span>
          )}
          {targetNodes.length > 1 && (
            <span className="status-filename">{targetNodes.length} layers selected</span>
          )}
        </div>
        <div className="status-bar-center">
          {fillPaths.length > 0 && (
            <span className="status-info">{fillPaths.length} fillable shapes</span>
          )}
        </div>
        <div className="status-bar-right">
          {fillStats && (
            <span className="status-info">
              {fillStats.lines.toLocaleString()} lines • {fillStats.points.toLocaleString()} points
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
