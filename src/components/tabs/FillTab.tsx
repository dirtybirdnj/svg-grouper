import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import {
  Point,
  HatchLine,
  PolygonWithHoles,
  Rect,
  getAllPolygonsFromElement,
  generateGlobalHatchLines,
  clipLinesToPolygon,
  clipLinesToRect,
  clipPolygonWithHolesToRect,
  linesToCompoundPath,
} from '../../utils/geometry'
import {
  FillPatternType,
  TileShapeType,
  generateConcentricLines,
  generateHoneycombLines,
  generateWiggleLines,
  generateSpiralLines,
  generateGlobalSpiralLines,
  clipSpiralToPolygon,
  generateGyroidLines,
  generateCrosshatchLines,
  generateZigzagLines,
  generateRadialLines,
  generateCrossSpiralLines,
  generateHilbertLines,
  generateGlobalHilbertLines,
  clipHilbertToPolygon,
  generateFermatLines,
  generateGlobalFermatLines,
  clipFermatToPolygon,
  generateWaveLines,
  generateScribbleLines,
  generateCustomTileLines,
  TILE_SHAPES,
  optimizeLineOrderMultiPass,
} from '../../utils/fillPatterns'
import simplify from 'simplify-js'
import './FillTab.css'

interface FillPathInfo {
  id: string
  type: string
  color: string
  pathData: string
  element: Element
}

// Chain connected line segments into polylines, then simplify each polyline
// Returns simplified lines that approximate the original with fewer points
function simplifyLines(lines: HatchLine[], tolerance: number): HatchLine[] {
  if (tolerance <= 0 || lines.length === 0) return lines

  const CONNECT_THRESHOLD = 0.5 // Points closer than this are considered connected
  const MAX_CHAIN_ITERATIONS = 10000 // Safety limit to prevent infinite loops

  // Build chains of connected lines
  const chains: Point[][] = []
  const used = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue

    // Start a new chain
    const chain: Point[] = [
      { x: lines[i].x1, y: lines[i].y1 },
      { x: lines[i].x2, y: lines[i].y2 }
    ]
    used.add(i)

    // Try to extend the chain in both directions
    let extended = true
    let iterations = 0
    while (extended && iterations < MAX_CHAIN_ITERATIONS) {
      extended = false
      iterations++
      const chainStart = chain[0]
      const chainEnd = chain[chain.length - 1]

      for (let j = 0; j < lines.length; j++) {
        if (used.has(j)) continue

        const line = lines[j]
        const p1 = { x: line.x1, y: line.y1 }
        const p2 = { x: line.x2, y: line.y2 }

        // Check if line connects to end of chain
        const d1End = Math.hypot(p1.x - chainEnd.x, p1.y - chainEnd.y)
        const d2End = Math.hypot(p2.x - chainEnd.x, p2.y - chainEnd.y)
        const d1Start = Math.hypot(p1.x - chainStart.x, p1.y - chainStart.y)
        const d2Start = Math.hypot(p2.x - chainStart.x, p2.y - chainStart.y)

        if (d1End < CONNECT_THRESHOLD) {
          chain.push(p2)
          used.add(j)
          extended = true
          break // Found a connection, restart scan from chain ends
        } else if (d2End < CONNECT_THRESHOLD) {
          chain.push(p1)
          used.add(j)
          extended = true
          break
        } else if (d1Start < CONNECT_THRESHOLD) {
          chain.unshift(p2)
          used.add(j)
          extended = true
          break
        } else if (d2Start < CONNECT_THRESHOLD) {
          chain.unshift(p1)
          used.add(j)
          extended = true
          break
        }
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

// The following functions were imported from '../../utils/geometry' and '../../utils/fillPatterns':
// - getPolygonPoints
// - parsePathIntoSubpaths (via getPolygonPoints internally)
// - calcPolygonArea (via geometry.ts)
// - identifyOuterAndHoles (via geometry.ts)
// - pointInPolygon (via geometry.ts)
// - lineSegmentIntersection (via geometry.ts)
// - linePolygonIntersections (via geometry.ts)
// - generateGlobalHatchLines
// - clipLinesToPolygon
// - clipSegmentAroundHoles (via geometry.ts)
// - polygonSignedArea (via geometry.ts)
// - offsetPolygonInward (via geometry.ts)
// - offsetPolygon (via geometry.ts)
// - generateConcentricLines
// - generateHoneycombLines
// - generateWiggleLine (via fillPatterns.ts)
// - generateWiggleLines
// - generateSpiralLines
// - generateGlobalSpiralLines
// - clipSpiralToPolygon
// - generateGyroidLines
// - distance (via fillPatterns.ts)
// - optimizeLinesWithinShape (via fillPatterns.ts)
// - calculateShapeCentroid (via fillPatterns.ts)
// - getShapeTopLeft (via fillPatterns.ts)
// - optimizeLineOrderMultiPass

// == ALL DUPLICATED FUNCTIONS REMOVED - USING IMPORTS FROM UTILS ==

// Local fallback for fill generation (when not running in Electron)
async function generateFillsLocally(
  pathInputs: Array<{ id: string; color: string; polygons: PolygonWithHoles[] }>,
  pathsToProcess: FillPathInfo[],
  boundingBox: Rect,
  fillPattern: FillPatternType,
  lineSpacing: number,
  angle: number,
  crossHatch: boolean,
  inset: number,
  wiggleAmplitude: number,
  wiggleFrequency: number,
  spiralOverDiameter: number,
  singleSpiral: boolean,
  singleHilbert: boolean,
  singleFermat: boolean,
  customTileShape: TileShapeType,
  enableCrop: boolean,
  cropInset: number,
  abortController: { aborted: boolean },
  setProgress: (progress: number) => void
): Promise<{ pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[]> {
  // Calculate crop rectangle if enabled
  let cropRect: Rect | null = null
  if (enableCrop && cropInset > 0) {
    const insetX = boundingBox.width * (cropInset / 100)
    const insetY = boundingBox.height * (cropInset / 100)
    cropRect = {
      x: boundingBox.x + insetX,
      y: boundingBox.y + insetY,
      width: boundingBox.width - insetX * 2,
      height: boundingBox.height - insetY * 2
    }
  }

  // Generate global patterns
  const globalLines = generateGlobalHatchLines(boundingBox, lineSpacing, angle)
  const globalCrossLines = crossHatch ? generateGlobalHatchLines(boundingBox, lineSpacing, angle + 90) : []

  let globalSpiralLines: HatchLine[] = []
  if (fillPattern === 'spiral' && singleSpiral) {
    const centerX = boundingBox.x + boundingBox.width / 2
    const centerY = boundingBox.y + boundingBox.height / 2
    const maxRadius = Math.sqrt(Math.pow(boundingBox.width / 2, 2) + Math.pow(boundingBox.height / 2, 2)) * spiralOverDiameter
    globalSpiralLines = generateGlobalSpiralLines(centerX, centerY, maxRadius, lineSpacing, angle)
  }

  let globalHilbertLines: HatchLine[] = []
  if (fillPattern === 'hilbert' && singleHilbert) {
    globalHilbertLines = generateGlobalHilbertLines(boundingBox, lineSpacing)
  }

  let globalFermatLines: HatchLine[] = []
  if (fillPattern === 'fermat' && singleFermat) {
    globalFermatLines = generateGlobalFermatLines(boundingBox, lineSpacing, angle, spiralOverDiameter)
  }

  const results: { pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[] = []
  const totalPaths = pathInputs.length

  for (let i = 0; i < pathInputs.length; i++) {
    if (abortController.aborted) break

    setProgress(Math.round((i / totalPaths) * 100))
    const pathInput = pathInputs[i]
    const originalPath = pathsToProcess.find(p => p.id === pathInput.id)
    if (!originalPath) continue

    let allPolygons = pathInput.polygons
    if (cropRect) {
      allPolygons = allPolygons.map(p => clipPolygonWithHolesToRect(p, cropRect!)).filter(p => p.outer.length >= 3)
    }

    let allLines: HatchLine[] = []
    let firstValidPolygon: Point[] | null = null

    for (const polygonData of allPolygons) {
      if (polygonData.outer.length < 3) continue
      if (!firstValidPolygon) firstValidPolygon = polygonData.outer

      let lines: HatchLine[] = []

      switch (fillPattern) {
        case 'concentric':
          lines = generateConcentricLines(polygonData.outer, lineSpacing, true)
          break
        case 'wiggle':
          lines = generateWiggleLines(polygonData, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
          break
        case 'spiral':
          lines = singleSpiral
            ? clipSpiralToPolygon(globalSpiralLines, polygonData, inset)
            : generateSpiralLines(polygonData, lineSpacing, inset, angle, spiralOverDiameter)
          break
        case 'honeycomb':
          lines = generateHoneycombLines(polygonData, lineSpacing, inset, angle)
          break
        case 'gyroid':
          lines = generateGyroidLines(polygonData, lineSpacing, inset, angle)
          break
        case 'crosshatch':
          lines = generateCrosshatchLines(polygonData, boundingBox, lineSpacing, angle, inset)
          break
        case 'zigzag':
          lines = generateZigzagLines(polygonData, boundingBox, lineSpacing, angle, wiggleAmplitude, inset)
          break
        case 'radial':
          lines = generateRadialLines(polygonData, lineSpacing, inset, angle)
          break
        case 'crossspiral':
          lines = generateCrossSpiralLines(polygonData, lineSpacing, inset, angle, spiralOverDiameter)
          break
        case 'hilbert':
          lines = singleHilbert
            ? clipHilbertToPolygon(globalHilbertLines, polygonData, inset)
            : generateHilbertLines(polygonData, lineSpacing, inset)
          break
        case 'fermat':
          lines = singleFermat
            ? clipFermatToPolygon(globalFermatLines, polygonData, inset)
            : generateFermatLines(polygonData, lineSpacing, inset, angle, spiralOverDiameter)
          break
        case 'wave':
          lines = generateWaveLines(polygonData, boundingBox, lineSpacing, angle, wiggleAmplitude, wiggleFrequency, inset)
          break
        case 'scribble':
          lines = generateScribbleLines(polygonData, lineSpacing, inset)
          break
        case 'custom':
          lines = generateCustomTileLines(polygonData, lineSpacing, TILE_SHAPES[customTileShape], inset, angle)
          break
        case 'lines':
        default:
          lines = clipLinesToPolygon(globalLines, polygonData, inset)
          if (crossHatch) {
            lines = [...lines, ...clipLinesToPolygon(globalCrossLines, polygonData, inset)]
          }
          break
      }

      allLines = allLines.concat(lines)
    }

    if (cropRect && allLines.length > 0) {
      allLines = clipLinesToRect(allLines, cropRect)
    }

    if (allLines.length > 0 && firstValidPolygon) {
      results.push({ pathInfo: originalPath, lines: allLines, polygon: firstValidPolygon })
    }

    // Yield to browser
    if (i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  return results
}

export default function FillTab() {
  const {
    svgContent,
    layerNodes,
    setLayerNodes,
    fillTargetNodeIds,
    setFillTargetNodeIds,
    setActiveTab,
    rebuildSvgFromLayers,
    setOrderData,
    setIsProcessing,
    scale,
    setScale,
    offset,
    setOffset,
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

  // Crop support for fill patterns
  const [enableCrop, setEnableCrop] = useState(false)
  const [cropInset, setCropInset] = useState(0) // Percentage of bounding box to crop from edges (0-50%)
  const [draftCropInset, setDraftCropInset] = useState(0)

  // Accumulated fill layers - each layer has lines with a color
  interface FillLayer {
    lines: HatchLine[]
    color: string
    pathId: string
  }
  const [accumulatedLayers, setAccumulatedLayers] = useState<FillLayer[]>([])
  const [layerColor, setLayerColor] = useState<string>('') // Empty = use shape's original color
  const [highlightedPathId, setHighlightedPathId] = useState<string | null>(null)

  // Draft states for sliders - show value during drag, commit on release
  const [draftLineSpacing, setDraftLineSpacing] = useState(15)
  const [draftAngle, setDraftAngle] = useState(45)
  const [draftInset, setDraftInset] = useState(0)
  const [draftWiggleAmplitude, setDraftWiggleAmplitude] = useState(5)
  const [draftWiggleFrequency, setDraftWiggleFrequency] = useState(2)
  const [draftPenWidth, setDraftPenWidth] = useState(0.5)
  const [draftSimplifyTolerance, setDraftSimplifyTolerance] = useState(0)

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
  }, [lineSpacing, angle, inset, wiggleAmplitude, wiggleFrequency, penWidth, simplifyTolerance, cropInset])

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

  // Drag state for pan
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const previewRef = useRef<HTMLDivElement>(null)

  // Find the target nodes (supports multiple selection)
  const targetNodes = useMemo(() => {
    if (fillTargetNodeIds.length === 0) return []

    const findNode = (nodes: SVGNode[], id: string): SVGNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }

    const found: SVGNode[] = []
    for (const id of fillTargetNodeIds) {
      const node = findNode(layerNodes, id)
      if (node) found.push(node)
    }
    return found
  }, [layerNodes, fillTargetNodeIds])

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
        }> = []

        for (const path of pathsToProcess) {
          let polygons: PolygonWithHoles[]
          if (preservedFillData) {
            const preserved = preservedFillData.find(p => p.pathInfo.id === path.id)
            polygons = preserved ? [preserved.polygon] : getAllPolygonsFromElement(path.element)
          } else {
            polygons = getAllPolygonsFromElement(path.element)
          }

          pathInputs.push({
            id: path.id,
            color: path.color,
            polygons
          })
        }

        // Step 2: Check if electron API is available (running in Electron)
        if (window.electron?.generateFills) {
          // Use backend IPC for fill generation
          const result = await window.electron.generateFills({
            paths: pathInputs,
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
            enableCrop,
            cropInset
          })

          if (abortController.aborted) return

          if (result.success) {
            // Map backend results back to frontend format
            const results: { pathInfo: FillPathInfo; lines: HatchLine[]; polygon: Point[] }[] = []

            for (const pathResult of result.paths) {
              const originalPath = pathsToProcess.find(p => p.id === pathResult.pathId)
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
              console.log(`Fill summary: ${filledCount}/${totalCount} shapes filled. ${unfilledCount} shapes have no fill lines.`)
            }
          } else {
            console.error('Fill generation failed:', result.error)
            setHatchedPaths([])
          }
        } else {
          // Fallback: Run fill generation locally (for web browser or missing IPC)
          console.log('Running fill generation locally (no IPC available)')
          const results = await generateFillsLocally(
            pathInputs,
            pathsToProcess,
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
            enableCrop,
            cropInset,
            abortController,
            setFillProgress
          )

          if (!abortController.aborted) {
            setHatchedPaths(results)
          }
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
  }, [showHatchPreview, activeFillPaths, preservedFillData, boundingBox, lineSpacing, angle, crossHatch, inset, fillPattern, wiggleAmplitude, wiggleFrequency, spiralOverDiameter, singleSpiral, singleHilbert, singleFermat, customTileShape, enableCrop, cropInset, setIsProcessing])

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

  // Create lookup map from path ID to line count (using simplified paths)
  const pathLineCountMap = useMemo(() => {
    const map = new Map<string, number>()
    simplifiedHatchedPaths.forEach(({ pathInfo, lines }) => {
      map.set(pathInfo.id, lines.length)
    })
    return map
  }, [simplifiedHatchedPaths])

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

    const padding = 20
    const viewBox = `${boundingBox.x - padding} ${boundingBox.y - padding} ${boundingBox.width + padding * 2} ${boundingBox.height + padding * 2}`

    const pathElements: string[] = []

    if (showHatchPreview) {
      // First, draw accumulated layers (as compound paths for efficiency)
      accumulatedLayers.forEach(layer => {
        const pathD = linesToCompoundPath(layer.lines, 2)
        pathElements.push(`<g class="accumulated-layer"><path d="${pathD}" fill="none" stroke="${layer.color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/></g>`)
      })

      // Then draw current working layer (as compound paths, using simplified paths)
      fillPaths.forEach((path) => {
        const isHighlighted = path.id === highlightedPathId
        const hatchData = simplifiedHatchedPaths.find(h => h.pathInfo.id === path.id)

        if (hatchData && hatchData.lines.length > 0) {
          const currentColor = layerColor || path.color
          const pathD = linesToCompoundPath(hatchData.lines, 2)

          pathElements.push(`<g class="current-layer"><path d="${pathD}" fill="none" stroke="${currentColor}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/></g>`)
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

        // Add highlight overlay for selected path
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
  }, [fillPaths, boundingBox, showHatchPreview, simplifiedHatchedPaths, accumulatedLayers, layerColor, retainStrokes, penWidthPx, highlightedPathId, enableCrop, cropInset])

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
      // Group by path ID AND color so different colors become separate layer nodes
      const allLinesByPathAndColor = new Map<string, { x1: number; y1: number; x2: number; y2: number }[]>()

      // Add accumulated layers first
      accumulatedLayers.forEach(layer => {
        layer.lines.forEach(line => {
          const key = `${layer.pathId}|${layer.color}`
          const existing = allLinesByPathAndColor.get(key) || []
          existing.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })
          allLinesByPathAndColor.set(key, existing)
        })
      })

      // Add current optimized lines
      optimizedLines.forEach(line => {
        const color = layerColor || line.color
        const key = `${line.pathId}|${color}`
        const existing = allLinesByPathAndColor.get(key) || []
        existing.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })
        allLinesByPathAndColor.set(key, existing)
      })

      // Get unique colors used across all fills
      const colorsUsed = new Set<string>()
      accumulatedLayers.forEach(layer => colorsUsed.add(layer.color))
      optimizedLines.forEach(line => colorsUsed.add(layerColor || line.color))
      const uniqueColors = Array.from(colorsUsed)

    // For each original path, create child nodes for each color used
    // If retainStrokes is enabled, weld the outline into the fill compound path
    const fillNodesByTargetId = new Map<string, SVGNode[]>()

    // Initialize map for each target node
    targetNodes.forEach(node => fillNodesByTargetId.set(node.id, []))

    simplifiedHatchedPaths.forEach(({ pathInfo }) => {
      // Find which target node this path belongs to
      const findOwnerTargetId = (node: SVGNode, pathId: string): string | null => {
        if (node.id === pathId) return node.id
        for (const child of node.children) {
          if (child.id === pathId) return node.id
          const found = findOwnerTargetId(child, pathId)
          if (found) return node.id
        }
        return null
      }

      let ownerTargetId: string | null = null
      for (const targetNode of targetNodes) {
        // Check if this path is the target itself or a descendant
        if (targetNode.id === pathInfo.id) {
          ownerTargetId = targetNode.id
          break
        }
        const found = findOwnerTargetId(targetNode, pathInfo.id)
        if (found) {
          ownerTargetId = targetNode.id
          break
        }
      }
      if (!ownerTargetId) return

      // Find all color variations for this path
      uniqueColors.forEach(color => {
        const key = `${pathInfo.id}|${color}`
        const lines = allLinesByPathAndColor.get(key)
        if (!lines || lines.length === 0) return

        // Convert lines to a single compound path (reduces element count for Cricut compatibility)
        let pathD = linesToCompoundPath(lines, 2)

        // If retainStrokes, append the original outline to the compound path
        if (retainStrokes) {
          const originalD = pathInfo.element.getAttribute('d')
          if (originalD) {
            // Weld the outline path into the fill compound path
            pathD = pathD + ' ' + originalD
          }
        }

        const nodeId = uniqueColors.length > 1
          ? `hatch-${pathInfo.id}-${color.replace('#', '')}`
          : `hatch-${pathInfo.id}`
        const nodeName = uniqueColors.length > 1
          ? `Fill ${color}`
          : `Fill`

        // Create as a path element (not a group) for proper display in layer tree
        const pathMarkup = `<path id="${nodeId}" d="${pathD}" fill="none" stroke="${color}" stroke-width="${penWidthPx.toFixed(2)}" stroke-linecap="round"/>`

        // Create element for the node (reuse parser from outer scope)
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

        const existing = fillNodesByTargetId.get(ownerTargetId) || []
        existing.push(fillNode)
        fillNodesByTargetId.set(ownerTargetId, existing)
      })
    })

    // Get set of target node IDs for quick lookup
    const targetIdSet = new Set(targetNodes.map(n => n.id))

    // Replace each target node with a group containing its fill children
    const updateNodesWithFillChildren = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (targetIdSet.has(node.id)) {
          const newChildren = fillNodesByTargetId.get(node.id) || []
          // Replace this node with a group containing all fill layers
          return {
            ...node,
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

  // Maximum accumulated layers to prevent memory bloat
  const MAX_ACCUMULATED_LAYERS = 100

  // Add current hatch lines as a layer and rotate angle for next layer
  const handleAddLayer = useCallback(() => {
    if (simplifiedHatchedPaths.length === 0) return

    // Collect all current lines into accumulated layers (using simplified paths)
    // Group by path+color to reduce object count (much more efficient than one object per line)
    const newLayers: FillLayer[] = []
    simplifiedHatchedPaths.forEach(({ pathInfo, lines }) => {
      const color = layerColor || pathInfo.color // Use custom color or original
      // Create one FillLayer per path with all its lines (not one per line)
      newLayers.push({
        lines: lines, // All lines for this path in one object
        color,
        pathId: pathInfo.id,
      })
    })

    setAccumulatedLayers(prev => {
      const combined = [...prev, ...newLayers]
      // Limit to prevent memory bloat
      if (combined.length > MAX_ACCUMULATED_LAYERS) {
        console.warn(`[FillTab] Accumulated layers exceeded ${MAX_ACCUMULATED_LAYERS}, trimming oldest layers`)
        return combined.slice(-MAX_ACCUMULATED_LAYERS)
      }
      return combined
    })

    // Rotate angle for next layer (cross-hatching effect)
    const newAngle = (angle + 45) % 180
    setAngle(newAngle)

    // Reset layer color for next layer
    setLayerColor('')
  }, [simplifiedHatchedPaths, layerColor, angle, setAngle])

  // Clear all accumulated layers
  const handleClearLayers = useCallback(() => {
    setAccumulatedLayers([])
    setLayerColor('')
  }, [])

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
        onApply: () => {
          // When apply is clicked in Order tab, apply the fill
          handleApplyFill()
        },
      })
      setIsProcessing(false)
      setActiveTab('order')
    }, 0)
  }, [boundingBox, simplifiedHatchedPaths, setOrderData, setActiveTab, handleApplyFill, setIsProcessing])

  // Wheel zoom handler - use native event listener to support passive: false
  useEffect(() => {
    const element = previewRef.current
    if (!element) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(Math.max(0.1, Math.min(10, scale * delta)))
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [scale, setScale])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }, [offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart, setOffset])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

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
          <h2>Fill Paths ({fillPaths.length})</h2>
        </div>
        <div className="sidebar-content fill-paths-full">
          <div className="fill-paths-list expanded">
            {fillPaths.map((path, index) => {
              const lineCount = pathLineCountMap.get(path.id) ?? 0
              const isHighlighted = path.id === highlightedPathId
              const hasNoLines = showHatchPreview && lineCount === 0
              return (
                <div
                  key={path.id}
                  className={`fill-path-item clickable ${isHighlighted ? 'highlighted' : ''} ${hasNoLines ? 'no-fill' : ''}`}
                  onClick={() => setHighlightedPathId(isHighlighted ? null : path.id)}
                  title={`Click to highlight. ${showHatchPreview ? `${lineCount} lines` : ''}`}
                >
                  <span
                    className="path-color-swatch"
                    style={{ backgroundColor: path.color }}
                  />
                  <span className="path-info">
                    <span className="path-type">{path.type}</span>
                    <span className="path-id">{path.id || `path-${index + 1}`}</span>
                  </span>
                  {showHatchPreview && (
                    <span className={`path-line-count ${hasNoLines ? 'zero' : ''}`}>
                      {lineCount}
                    </span>
                  )}
                </div>
              )
            })}
            {fillPaths.length === 0 && (
              <div className="no-paths-message">
                No fill paths found in selection
              </div>
            )}
          </div>
        </div>
      </aside>

      <main
        className="fill-main"
        ref={previewRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
        <div className="sidebar-header">
          <h2>Settings</h2>
        </div>
        <div className="sidebar-content">
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
              <button
                className={`pattern-btn ${fillPattern === 'concentric' ? 'active' : ''}`}
                onClick={() => setFillPattern('concentric')}
                title="Concentric loops from outside in (snake)"
              >
                Concentric
              </button>
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

            <div
              className={`fill-control selectable ${selectedControl === 'penWidth' ? 'selected' : ''}`}
              onClick={() => setSelectedControl('penWidth')}
            >
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

          <div className="fill-section layer-section">
            <h3>Layer Color</h3>
            <div className="layer-color-row">
              <input
                type="color"
                value={layerColor || (fillPaths[0]?.color || '#000000')}
                onChange={(e) => setLayerColor(e.target.value)}
                className="layer-color-picker"
                title="Pick color for this fill layer"
              />
              <input
                type="text"
                value={layerColor || (fillPaths[0]?.color || '#000000')}
                onChange={(e) => setLayerColor(e.target.value)}
                className="layer-color-input"
                placeholder="#000000"
              />
              {layerColor && (
                <button
                  className="layer-color-reset"
                  onClick={() => setLayerColor('')}
                  title="Reset to original color"
                >
                  Reset
                </button>
              )}
            </div>
            {accumulatedLayers.length > 0 && (
              <div className="accumulated-layers-info">
                <span>{accumulatedLayers.length} lines in {new Set(accumulatedLayers.map(l => l.color)).size} layer(s) queued</span>
                <button
                  className="clear-layers-btn"
                  onClick={handleClearLayers}
                  title="Clear all accumulated layers"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="fill-actions secondary">
            <button
              className="fill-add-layer-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleAddLayer}
              title="Add current pattern as a layer and rotate angle for next (builds up cross-hatch)"
            >
              Add Layer (+45°)
            </button>
          </div>

          <div className="fill-actions secondary">
            <button
              className="fill-apply-btn"
              disabled={fillPaths.length === 0 || !showHatchPreview}
              onClick={handleApplyFill}
              title={!showHatchPreview ? 'Preview first to see the result' : 'Apply all layers to the SVG'}
            >
              Apply Fill{accumulatedLayers.length > 0 ? ` (${new Set(accumulatedLayers.map(l => l.color)).size + 1} layers)` : ''}
            </button>
          </div>
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
