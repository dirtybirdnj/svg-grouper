import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import { Point, getAllPolygonsFromElement, PolygonWithHoles } from '../../utils/geometry'
import { OPTIMIZATION, UI } from '../../constants'
import { usePanZoom } from '../../hooks'
import { StatSection, StatRow } from '../shared'
import { countSubpaths, analyzePathD, separateSubpaths, PathDiagnostics } from '../../utils/pathAnalysis'
import polygonClipping, { Polygon as ClipPolygon } from 'polygon-clipping'
import './MergeTab.css'

// Debug logging - set to false for production
const DEBUG_MERGE = false

type MergeOperation = 'union' | 'intersect' | 'subtract' | 'xor'

interface PolygonData {
  nodeId: string
  originalNodeId: string  // Original element ID (before splitting compound paths)
  name: string
  color: string
  vertices: Point[]
  polygonWithHoles: PolygonWithHoles  // Full polygon data including holes
  element: Element  // Original element for rendering
  subpathCount: number  // Number of subpaths in original element
  pathD: string  // Original path d attribute
}

// Edge key for finding duplicates
function edgeKey(p1: Point, p2: Point, tolerance: number = OPTIMIZATION.DEFAULT_TOLERANCE): string {
  // Round to tolerance and sort points to make edge direction-independent
  const x1 = Math.round(p1.x / tolerance) * tolerance
  const y1 = Math.round(p1.y / tolerance) * tolerance
  const x2 = Math.round(p2.x / tolerance) * tolerance
  const y2 = Math.round(p2.y / tolerance) * tolerance

  // Sort so smaller point comes first
  if (x1 < x2 || (x1 === x2 && y1 < y2)) {
    return `${x1.toFixed(4)},${y1.toFixed(4)}-${x2.toFixed(4)},${y2.toFixed(4)}`
  } else {
    return `${x2.toFixed(4)},${y2.toFixed(4)}-${x1.toFixed(4)},${y1.toFixed(4)}`
  }
}

// Result of union operation including holes and adjacency info
interface UnionResult {
  outer: Point[]  // Merged outer boundary
  holes: Point[][]  // All holes from input shapes
  sharedEdges: Array<{ p1: Point; p2: Point }>  // Edges that were shared (for visualization)
  touchingPairs: Set<string>  // Set of "nodeId1|nodeId2" pairs that touch
}

// Find which shapes are touching (share edges)
function findTouchingShapes(polygons: PolygonData[], tolerance: number): Set<string> {
  const touchingPairs = new Set<string>()

  // Build edge map: edge key -> list of polygon indices
  const edgeToPolygons = new Map<string, number[]>()

  for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
    const vertices = polygons[polyIdx].vertices
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i]
      const p2 = vertices[(i + 1) % vertices.length]
      const key = edgeKey(p1, p2, tolerance)

      const existing = edgeToPolygons.get(key) || []
      existing.push(polyIdx)
      edgeToPolygons.set(key, existing)
    }
  }

  // Find pairs that share edges
  edgeToPolygons.forEach((polyIndices) => {
    if (polyIndices.length >= 2) {
      // All combinations of polygons sharing this edge
      for (let i = 0; i < polyIndices.length; i++) {
        for (let j = i + 1; j < polyIndices.length; j++) {
          const id1 = polygons[polyIndices[i]].nodeId
          const id2 = polygons[polyIndices[j]].nodeId
          // Store in consistent order
          const pairKey = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`
          touchingPairs.add(pairKey)
        }
      }
    }
  })

  return touchingPairs
}

// Union adjacent polygons by removing shared edges, preserving holes
function unionPolygons(polygons: PolygonData[], tolerance: number = 0.1): UnionResult | null {
  if (polygons.length === 0) return null
  if (polygons.length === 1) {
    return {
      outer: polygons[0].vertices,
      holes: polygons[0].polygonWithHoles.holes,
      sharedEdges: [],
      touchingPairs: new Set()
    }
  }

  DEBUG_MERGE && console.log('[Union] Starting with tolerance:', tolerance)

  // Collect all edges with their polygons
  interface Edge {
    p1: Point
    p2: Point
    polygonIndex: number
  }

  const edges: Edge[] = []
  const edgeCounts = new Map<string, number>()
  const sharedEdgesList: Array<{ p1: Point; p2: Point }> = []

  for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
    const vertices = polygons[polyIdx].vertices
    DEBUG_MERGE && console.log(`[Union] Polygon ${polyIdx} has ${vertices.length} edges`)
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i]
      const p2 = vertices[(i + 1) % vertices.length]
      const key = edgeKey(p1, p2, tolerance)

      edges.push({ p1, p2, polygonIndex: polyIdx })
      const newCount = (edgeCounts.get(key) || 0) + 1
      edgeCounts.set(key, newCount)
    }
  }

  DEBUG_MERGE && console.log(`[Union] Total edges: ${edges.length}, unique edge keys: ${edgeCounts.size}`)

  // Collect shared edges for visualization and count
  const sharedEdgeKeys = new Set<string>()
  edgeCounts.forEach((count, key) => {
    if (count > 1) sharedEdgeKeys.add(key)
  })
  DEBUG_MERGE && console.log(`[Union] Shared edges found: ${sharedEdgeKeys.size}`)

  // Build shared edges list for visualization
  for (const edge of edges) {
    const key = edgeKey(edge.p1, edge.p2, tolerance)
    if (sharedEdgeKeys.has(key)) {
      // Only add once per unique edge
      if (!sharedEdgesList.some(e => edgeKey(e.p1, e.p2, tolerance) === key)) {
        sharedEdgesList.push({ p1: edge.p1, p2: edge.p2 })
      }
    }
  }

  // Keep only edges that appear once (boundary edges)
  const boundaryEdges: Edge[] = []
  for (const edge of edges) {
    const key = edgeKey(edge.p1, edge.p2, tolerance)
    if (edgeCounts.get(key) === 1) {
      boundaryEdges.push(edge)
    }
  }

  DEBUG_MERGE && console.log(`[Union] Boundary edges: ${boundaryEdges.length}`)

  if (boundaryEdges.length === 0) return null

  // Walk ALL boundary loops, not just one
  const allLoops: Point[][] = []
  const usedEdges = new Set<number>()

  // Helper to walk a single loop starting from a given edge
  const walkLoop = (startEdgeIdx: number): Point[] => {
    const loop: Point[] = []
    const startEdge = boundaryEdges[startEdgeIdx]
    loop.push(startEdge.p1)
    loop.push(startEdge.p2)
    usedEdges.add(startEdgeIdx)

    let iterations = 0
    const maxIterations = boundaryEdges.length * 2

    while (iterations < maxIterations) {
      iterations++
      const lastPoint = loop[loop.length - 1]
      const firstPoint = loop[0]

      // Check if we've closed the loop
      if (loop.length > 2 &&
          Math.abs(lastPoint.x - firstPoint.x) < tolerance &&
          Math.abs(lastPoint.y - firstPoint.y) < tolerance) {
        loop.pop() // Remove duplicate closing point
        break
      }

      // Find the next edge that starts where we are
      let foundNext = false
      for (let i = 0; i < boundaryEdges.length; i++) {
        if (usedEdges.has(i)) continue

        const edge = boundaryEdges[i]

        // Check if edge.p1 matches lastPoint
        if (Math.abs(edge.p1.x - lastPoint.x) < tolerance &&
            Math.abs(edge.p1.y - lastPoint.y) < tolerance) {
          loop.push(edge.p2)
          usedEdges.add(i)
          foundNext = true
          break
        }

        // Check if edge.p2 matches lastPoint (reverse edge)
        if (Math.abs(edge.p2.x - lastPoint.x) < tolerance &&
            Math.abs(edge.p2.y - lastPoint.y) < tolerance) {
          loop.push(edge.p1)
          usedEdges.add(i)
          foundNext = true
          break
        }
      }

      if (!foundNext) break
    }

    return loop
  }

  // Walk all loops
  for (let i = 0; i < boundaryEdges.length; i++) {
    if (usedEdges.has(i)) continue
    const loop = walkLoop(i)
    if (loop.length >= 3) {
      allLoops.push(loop)
    }
  }

  DEBUG_MERGE && console.log(`[Union] Found ${allLoops.length} boundary loops`)

  if (allLoops.length === 0) return null

  // Calculate area of each loop (absolute value, signed area gives winding)
  const loopAreas = allLoops.map(loop => {
    let area = 0
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length
      area += loop[i].x * loop[j].y
      area -= loop[j].x * loop[i].y
    }
    return Math.abs(area / 2)
  })

  // Find largest loop as outer boundary
  let maxAreaIdx = 0
  let maxArea = loopAreas[0]
  for (let i = 1; i < loopAreas.length; i++) {
    if (loopAreas[i] > maxArea) {
      maxArea = loopAreas[i]
      maxAreaIdx = i
    }
  }

  const outerLoop = allLoops[maxAreaIdx]
  DEBUG_MERGE && console.log(`[Union] Outer loop has ${outerLoop.length} vertices, area: ${maxArea.toFixed(2)}`)

  // Collect holes: smaller loops from union + existing holes from input shapes
  const allHoles: Point[][] = []

  // Add smaller boundary loops as holes (these are interior boundaries from the union)
  for (let i = 0; i < allLoops.length; i++) {
    if (i !== maxAreaIdx && allLoops[i].length >= 3) {
      allHoles.push(allLoops[i])
    }
  }

  // Add existing holes from input polygons
  for (const poly of polygons) {
    for (const hole of poly.polygonWithHoles.holes) {
      if (hole.length >= 3) {
        allHoles.push(hole)
      }
    }
  }
  DEBUG_MERGE && console.log(`[Union] Total holes: ${allHoles.length} (${allLoops.length - 1} from union, rest from inputs)`)

  // Find touching pairs
  const touchingPairs = findTouchingShapes(polygons, tolerance)

  return {
    outer: outerLoop,
    holes: allHoles,
    sharedEdges: sharedEdgesList,
    touchingPairs
  }
}

// Convert points to SVG path d attribute
function pointsToPathD(points: Point[]): string {
  if (points.length < 3) return ''

  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`
  }
  d += ' Z'
  return d
}

// Convert polygon with holes to compound SVG path (evenodd fill rule)
function polygonWithHolesToPathD(outer: Point[], holes: Point[][]): string {
  if (outer.length < 3) return ''

  // Start with outer boundary
  let d = `M ${outer[0].x.toFixed(2)},${outer[0].y.toFixed(2)}`
  for (let i = 1; i < outer.length; i++) {
    d += ` L ${outer[i].x.toFixed(2)},${outer[i].y.toFixed(2)}`
  }
  d += ' Z'

  // Add each hole as a separate subpath
  for (const hole of holes) {
    if (hole.length < 3) continue
    d += ` M ${hole[0].x.toFixed(2)},${hole[0].y.toFixed(2)}`
    for (let i = 1; i < hole.length; i++) {
      d += ` L ${hole[i].x.toFixed(2)},${hole[i].y.toFixed(2)}`
    }
    d += ' Z'
  }

  return d
}

// Convert our PolygonWithHoles to polygon-clipping format (Polygon = Ring[])
function polygonWithHolesToClip(poly: PolygonWithHoles): ClipPolygon {
  const outer: [number, number][] = poly.outer.map(p => [p.x, p.y])
  const holes: [number, number][][] = poly.holes.map(hole => hole.map(p => [p.x, p.y]))
  return [outer, ...holes]
}

// Convert polygon-clipping MultiPolygon result back to our format
// MultiPolygon = Polygon[] = Ring[][]
function clipResultToPolygonWithHoles(result: ClipPolygon[]): PolygonWithHoles[] {
  return result.map(poly => {
    const outer: Point[] = poly[0].map(([x, y]) => ({ x, y }))
    const holes: Point[][] = poly.slice(1).map(ring => ring.map(([x, y]) => ({ x, y })))
    return { outer, holes }
  })
}

// Boolean operations using polygon-clipping library
interface BooleanResult {
  polygons: PolygonWithHoles[]
  operationType: MergeOperation
}

function performBooleanOperation(
  polygons: PolygonData[],
  operation: MergeOperation
): BooleanResult | null {
  if (polygons.length < 2) return null

  try {
    // Convert first polygon - wrap in array to make it a MultiPolygon
    let result: ClipPolygon[] = [polygonWithHolesToClip(polygons[0].polygonWithHoles)]

    // Apply operation with each subsequent polygon
    for (let i = 1; i < polygons.length; i++) {
      const clipPoly: ClipPolygon[] = [polygonWithHolesToClip(polygons[i].polygonWithHoles)]

      switch (operation) {
        case 'union':
          result = polygonClipping.union(result, clipPoly)
          break
        case 'intersect':
          result = polygonClipping.intersection(result, clipPoly)
          break
        case 'subtract':
          result = polygonClipping.difference(result, clipPoly)
          break
        case 'xor':
          result = polygonClipping.xor(result, clipPoly)
          break
      }
    }

    // Convert result back to our format
    const resultPolygons = clipResultToPolygonWithHoles(result)

    return {
      polygons: resultPolygons,
      operationType: operation
    }
  } catch (error) {
    console.error('[Merge] Boolean operation failed:', error)
    return null
  }
}

// Convert multiple PolygonWithHoles to a single compound path d
function multiPolygonToPathD(polygons: PolygonWithHoles[]): string {
  return polygons.map(poly => polygonWithHolesToPathD(poly.outer, poly.holes)).join(' ')
}

export default function MergeTab() {
  const {
    selectedNodeIds,
    layerNodes,
    setLayerNodes,
    setActiveTab,
    rebuildSvgFromLayers,
    setStatusMessage,
    scale,
    setScale,
    offset,
    setOffset,
  } = useAppContext()

  const [operation, setOperation] = useState<MergeOperation>('union')
  const [previewResult, setPreviewResult] = useState<UnionResult | null>(null)
  const [booleanResult, setBooleanResult] = useState<BooleanResult | null>(null)
  const [touchingPairs, setTouchingPairs] = useState<Set<string>>(new Set())
  const [tolerance, setTolerance] = useState(0.1)

  // All shapes available for selection (imported from group)
  const [availableShapes, setAvailableShapes] = useState<PolygonData[]>([])
  // Which shapes are selected for merging
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())
  // Path diagnostics for selected shape
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<PathDiagnostics | null>(null)
  // Show diagnostics panel
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  // Use shared pan/zoom hook with global state
  const { isPanning, containerRef: canvasRef, handlers: panZoomHandlers } = usePanZoom({
    externalState: { scale, setScale, offset, setOffset }
  })
  const hasInitialized = useRef(false)

  // Helper to find node by ID
  const findNode = useCallback((nodes: SVGNode[], id: string): SVGNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = findNode(node.children, id)
      if (found) return found
    }
    return null
  }, [])

  // Collect all leaf nodes from a group recursively
  const collectLeafNodes = useCallback((node: SVGNode): SVGNode[] => {
    if (!node.isGroup || node.children.length === 0) {
      return [node]
    }
    const leaves: SVGNode[] = []
    for (const child of node.children) {
      leaves.push(...collectLeafNodes(child))
    }
    return leaves
  }, [])

  // Check if element has a fill (not just stroke)
  const hasFill = useCallback((element: Element): boolean => {
    const fill = element.getAttribute('fill')
    // Has fill if fill attribute exists and is not 'none' or empty
    return fill !== null && fill !== 'none' && fill !== ''
  }, [])

  // Auto-populate from selected groups on mount
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const shapes: PolygonData[] = []

    // Helper to add shapes from an element - splits compound paths into separate shapes
    const addShapesFromElement = (nodeId: string, name: string, element: Element) => {
      if (!hasFill(element)) return

      // Use getAllPolygonsFromElement (default mode) to get disconnected regions as separate polygons
      // while still preserving holes within each region
      const polygons = getAllPolygonsFromElement(element)

      DEBUG_MERGE && console.log(`[Merge] Element "${name}" has ${polygons.length} polygon(s)`)
      if (polygons.length === 0) return

      const fill = element.getAttribute('fill') || '#666'
      const pathD = element.getAttribute('d') || ''
      const subpathCount = countSubpaths(pathD)

      // Create a separate shape for EACH disconnected polygon region
      // This allows compound paths with multiple parts to be merged independently
      polygons.forEach((polygonWithHoles, polyIdx) => {
        if (polygonWithHoles.outer.length < 3) return

        // Generate unique ID for each sub-polygon
        const subId = polygons.length > 1 ? `${nodeId}__part${polyIdx}` : nodeId
        const subName = polygons.length > 1 ? `${name} (part ${polyIdx + 1})` : name

        DEBUG_MERGE && console.log(`[Merge]   Part ${polyIdx}: ${polygonWithHoles.outer.length} vertices`)

        shapes.push({
          nodeId: subId,
          originalNodeId: nodeId,  // Track original element ID for removal
          name: subName,
          color: fill,
          vertices: polygonWithHoles.outer,  // Main boundary for union
          polygonWithHoles,  // Full data for reference
          element,  // Original element for rendering (same for all parts)
          subpathCount,  // Number of subpaths in original
          pathD,  // Original path d attribute
        })
      })

      if (polygons.length > 1) {
        DEBUG_MERGE && console.log(`[Merge] Split compound path "${name}" into ${polygons.length} separate shapes`)
      }
    }

    for (const id of selectedNodeIds) {
      const node = findNode(layerNodes, id)
      if (!node) continue

      // If it's a group, get all children
      if (node.isGroup) {
        const leaves = collectLeafNodes(node)
        for (const leaf of leaves) {
          addShapesFromElement(leaf.id, leaf.name || leaf.id, leaf.element)
        }
      } else {
        // Single shape
        addShapesFromElement(node.id, node.name || node.id, node.element)
      }
    }

    if (shapes.length > 0) {
      DEBUG_MERGE && console.log('[Merge] Loaded', shapes.length, 'shapes:')
      shapes.forEach((s, i) => {
        DEBUG_MERGE && console.log(`[Merge]   ${i}: ${s.name}, ${s.vertices.length} vertices, color: ${s.color}`)
      })
      setAvailableShapes(shapes)
      setStatusMessage(`Loaded ${shapes.length} fill shapes for merging`)
    } else {
      DEBUG_MERGE && console.log('[Merge] No fill shapes found')
      setStatusMessage('warning:No fill shapes found - merge only works with filled polygons')
    }
  }, [selectedNodeIds, layerNodes, findNode, collectLeafNodes, hasFill, setStatusMessage])

  // Get selected polygons for merge operation
  const selectedPolygons = useMemo(() => {
    return availableShapes.filter(s => selectedForMerge.has(s.nodeId))
  }, [availableShapes, selectedForMerge])

  // Compute which shapes are touching (for all available shapes)
  useEffect(() => {
    if (availableShapes.length >= 2) {
      const pairs = findTouchingShapes(availableShapes, tolerance)
      setTouchingPairs(pairs)
      DEBUG_MERGE && console.log('[Merge] Found', pairs.size, 'touching pairs')
    } else {
      setTouchingPairs(new Set())
    }
  }, [availableShapes, tolerance])

  // Count shapes that have at least one touching neighbor (mergeable shapes)
  const mergeableShapes = useMemo(() => {
    const shapesWithNeighbors = new Set<string>()
    touchingPairs.forEach(pairKey => {
      const [id1, id2] = pairKey.split('|')
      shapesWithNeighbors.add(id1)
      shapesWithNeighbors.add(id2)
    })
    return shapesWithNeighbors
  }, [touchingPairs])

  // Get all shared edges between all shapes for visualization
  const allSharedEdges = useMemo(() => {
    if (availableShapes.length < 2) return []

    const edges: Array<{ p1: Point; p2: Point }> = []
    const edgeToPolygons = new Map<string, { p1: Point; p2: Point; polygons: number[] }>()

    // Build edge map
    for (let polyIdx = 0; polyIdx < availableShapes.length; polyIdx++) {
      const vertices = availableShapes[polyIdx].vertices
      for (let i = 0; i < vertices.length; i++) {
        const p1 = vertices[i]
        const p2 = vertices[(i + 1) % vertices.length]
        const key = edgeKey(p1, p2, tolerance)

        const existing = edgeToPolygons.get(key)
        if (existing) {
          existing.polygons.push(polyIdx)
        } else {
          edgeToPolygons.set(key, { p1, p2, polygons: [polyIdx] })
        }
      }
    }

    // Collect edges shared by 2+ polygons
    edgeToPolygons.forEach((data) => {
      if (data.polygons.length >= 2) {
        edges.push({ p1: data.p1, p2: data.p2 })
      }
    })

    return edges
  }, [availableShapes, tolerance])

  // Find the next shape that has touching neighbors (for "Next" button)
  const findNextMergeableShape = useCallback(() => {
    // Find first shape in list that is mergeable and not currently selected
    for (const shape of availableShapes) {
      if (mergeableShapes.has(shape.nodeId) && !selectedForMerge.has(shape.nodeId)) {
        setSelectedForMerge(new Set([shape.nodeId]))
        return
      }
    }
    // If all mergeable shapes are selected, or none found, clear selection
    setSelectedForMerge(new Set())
  }, [availableShapes, mergeableShapes, selectedForMerge])

  // Compute preview when selection changes
  useEffect(() => {
    if (selectedPolygons.length >= 2) {
      DEBUG_MERGE && console.log('[Merge] Computing', operation, 'for', selectedPolygons.length, 'polygons')

      // Use polygon-clipping library for all boolean operations
      const result = performBooleanOperation(selectedPolygons, operation)
      setBooleanResult(result)

      // Also compute shared edges for visualization (union only)
      if (operation === 'union') {
        const merged = unionPolygons(selectedPolygons, tolerance)
        setPreviewResult(merged)
      } else {
        setPreviewResult(null)
      }

      DEBUG_MERGE && console.log('[Merge] Boolean result:', result ? `${result.polygons.length} polygon(s)` : 'null')
    } else {
      setPreviewResult(null)
      setBooleanResult(null)
    }
  }, [selectedPolygons, operation, tolerance])

  // Update diagnostics when single shape is selected
  useEffect(() => {
    if (selectedForMerge.size === 1) {
      const selectedId = Array.from(selectedForMerge)[0]
      const shape = availableShapes.find(s => s.nodeId === selectedId)
      if (shape && shape.pathD) {
        const diagnostics = analyzePathD(shape.pathD)
        setSelectedDiagnostics(diagnostics)
      } else {
        setSelectedDiagnostics(null)
      }
    } else {
      setSelectedDiagnostics(null)
    }
  }, [selectedForMerge, availableShapes])

  // Toggle shape selection
  const toggleShapeSelection = useCallback((nodeId: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  // Explode a compound path into separate shapes
  const handleExplode = useCallback(() => {
    if (selectedForMerge.size !== 1) return

    const selectedId = Array.from(selectedForMerge)[0]
    const shape = availableShapes.find(s => s.nodeId === selectedId)
    if (!shape || shape.subpathCount <= 1) {
      setStatusMessage('warning:Selected shape is not a compound path')
      return
    }

    // Separate the subpaths
    const subpaths = separateSubpaths(shape.pathD)
    DEBUG_MERGE && console.log('[Explode] Separating', shape.name, 'into', subpaths.length, 'subpaths')

    const newShapes: PolygonData[] = []
    const newNodes: SVGNode[] = []
    const fill = shape.element.getAttribute('fill') || '#666'
    const stroke = shape.element.getAttribute('stroke') || 'none'
    const strokeWidth = shape.element.getAttribute('stroke-width') || '1'

    subpaths.forEach((subpathD, idx) => {
      // Create new path element for this subpath
      const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const newId = `explode-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
      newPath.setAttribute('id', newId)
      newPath.setAttribute('d', subpathD)
      newPath.setAttribute('fill', fill)
      newPath.setAttribute('fill-rule', 'evenodd')
      newPath.setAttribute('stroke', stroke)
      newPath.setAttribute('stroke-width', strokeWidth)

      // Extract polygon data from the new path
      const polygons = getAllPolygonsFromElement(newPath)
      if (polygons.length === 0 || polygons[0].outer.length < 3) return

      const polygonWithHoles = polygons[0]
      const baseName = shape.name.replace(/ \(part \d+\)$/, '') // Remove existing part suffix

      newShapes.push({
        nodeId: newId,
        originalNodeId: newId,
        name: `${baseName} (${idx + 1}/${subpaths.length})`,
        color: fill,
        vertices: polygonWithHoles.outer,
        polygonWithHoles,
        element: newPath,
        subpathCount: 1,
        pathD: subpathD
      })

      newNodes.push({
        id: newId,
        type: 'path',
        name: `${baseName} (${idx + 1}/${subpaths.length})`,
        element: newPath,
        children: [],
        isGroup: false
      })
    })

    if (newShapes.length === 0) {
      setStatusMessage('error:Could not separate subpaths')
      return
    }

    // Remove original shape from layerNodes
    const idsToRemove = new Set([shape.originalNodeId])
    const removeNodesByIds = (nodes: SVGNode[], idsToRemove: Set<string>): SVGNode[] => {
      const result: SVGNode[] = []
      for (const node of nodes) {
        if (idsToRemove.has(node.id)) continue
        const filteredChildren = removeNodesByIds(node.children, idsToRemove)
        result.push({ ...node, children: filteredChildren })
      }
      return result
    }

    let updatedNodes = removeNodesByIds(layerNodes, idsToRemove)
    updatedNodes = [...updatedNodes, ...newNodes]

    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)

    // Update available shapes
    setAvailableShapes(prev => {
      const filtered = prev.filter(s => s.nodeId !== selectedId && s.originalNodeId !== shape.originalNodeId)
      return [...filtered, ...newShapes]
    })

    // Clear selection
    setSelectedForMerge(new Set())
    setStatusMessage(`Exploded compound path into ${newShapes.length} separate shapes`)
  }, [selectedForMerge, availableShapes, layerNodes, setLayerNodes, rebuildSvgFromLayers, setStatusMessage])

  // Bounding box of all available shapes
  const boundingBox = useMemo(() => {
    if (availableShapes.length === 0) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const poly of availableShapes) {
      for (const p of poly.vertices) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }

    const padding = UI.PREVIEW_PADDING
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    }
  }, [availableShapes])

  // Apply the merge
  const handleApplyMerge = useCallback(() => {
    DEBUG_MERGE && console.log('[Merge] handleApplyMerge called')
    DEBUG_MERGE && console.log('[Merge] booleanResult:', booleanResult)
    DEBUG_MERGE && console.log('[Merge] selectedPolygons:', selectedPolygons.length)

    if (!booleanResult || selectedPolygons.length < 2) {
      setStatusMessage('error:Select at least 2 shapes to merge')
      return
    }

    // Create compound path from boolean result
    const pathD = multiPolygonToPathD(booleanResult.polygons)
    DEBUG_MERGE && console.log('[Merge] Generated path d:', pathD.substring(0, 100) + '...')
    const firstPoly = selectedPolygons[0]

    // Get attributes from first polygon
    const fill = firstPoly.element.getAttribute('fill') || 'none'
    const stroke = firstPoly.element.getAttribute('stroke') || 'none'
    const strokeWidth = firstPoly.element.getAttribute('stroke-width') || '1'
    DEBUG_MERGE && console.log('[Merge] Attributes - fill:', fill, 'stroke:', stroke, 'strokeWidth:', strokeWidth)

    // Create new path element in memory (will be added to DOM by rebuildSvgFromLayers)
    const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const newId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    newPath.setAttribute('id', newId)
    newPath.setAttribute('d', pathD)
    newPath.setAttribute('fill', fill)
    newPath.setAttribute('fill-rule', 'evenodd')  // Use evenodd to punch out holes
    newPath.setAttribute('stroke', stroke)
    newPath.setAttribute('stroke-width', strokeWidth)
    DEBUG_MERGE && console.log('[Merge] Created new path element with id:', newId)

    // Calculate total holes
    const totalHoles = booleanResult.polygons.reduce((sum, p) => sum + p.holes.length, 0)
    const holesMsg = totalHoles > 0 ? ` with ${totalHoles} holes` : ''
    const opLabel = operation.charAt(0).toUpperCase() + operation.slice(1)

    // Create new node
    const newNode: SVGNode = {
      id: newId,
      type: 'path',
      name: `${opLabel} (${selectedPolygons.length} shapes${holesMsg})`,
      element: newPath,
      children: [],
      isGroup: false
    }

    // Remove old nodes and add new one
    // Use originalNodeId to find the actual elements in layerNodes (not split part IDs)
    const idsToRemove = new Set(selectedPolygons.map(p => p.originalNodeId))
    DEBUG_MERGE && console.log('[Merge] Original IDs to remove:', Array.from(idsToRemove))
    DEBUG_MERGE && console.log('[Merge] Layer nodes before:', layerNodes.length)

    // Filter out merged nodes (rebuildSvgFromLayers will handle DOM)
    const removeNodesByIds = (nodes: SVGNode[], idsToRemove: Set<string>): SVGNode[] => {
      const result: SVGNode[] = []
      for (const node of nodes) {
        if (idsToRemove.has(node.id)) {
          DEBUG_MERGE && console.log('[Merge] Removing node from tree:', node.id)
          continue
        }
        // Keep the node, but filter its children
        const filteredChildren = removeNodesByIds(node.children, idsToRemove)
        result.push({
          ...node,
          children: filteredChildren
        })
      }
      return result
    }

    let updatedNodes = removeNodesByIds(layerNodes, idsToRemove)
    updatedNodes.push(newNode)
    DEBUG_MERGE && console.log('[Merge] Layer nodes after:', updatedNodes.length)

    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)

    // Update available shapes to reflect the merge (remove merged, add new)
    // Use the first polygon from booleanResult for the main vertices
    const firstResultPoly = booleanResult.polygons[0] || { outer: [], holes: [] }
    const newShape: PolygonData = {
      nodeId: newId,
      originalNodeId: newId,  // New merged shape has same nodeId and originalNodeId
      name: newNode.name,
      color: fill,
      vertices: firstResultPoly.outer,
      polygonWithHoles: firstResultPoly,
      element: newPath,
      subpathCount: booleanResult.polygons.length + totalHoles,
      pathD: pathD
    }
    // Filter out shapes whose originalNodeId matches any of the removed originals
    // This handles both single shapes and split compound path parts
    setAvailableShapes(prev => {
      const filtered = prev.filter(s => !idsToRemove.has(s.originalNodeId))
      return [...filtered, newShape]
    })

    // Clear selection so user can select more shapes to merge
    setSelectedForMerge(new Set())
    setPreviewResult(null)

    setStatusMessage(`Merged ${selectedPolygons.length} shapes into 1${holesMsg}`)
    DEBUG_MERGE && console.log('[Merge] Complete, staying on merge tab for additional operations')
  }, [previewResult, selectedPolygons, layerNodes, setLayerNodes, rebuildSvgFromLayers, setStatusMessage])

  // Cancel and go back
  const handleCancel = useCallback(() => {
    setActiveTab('sort')
  }, [setActiveTab])

  // Pan/zoom is now handled by usePanZoom hook

  // Stats
  const stats = useMemo(() => {
    const originalVertices = selectedPolygons.reduce((sum, p) => sum + p.vertices.length, 0)
    const originalHoles = selectedPolygons.reduce((sum, p) => sum + p.polygonWithHoles.holes.length, 0)
    const originalEdges = originalVertices

    // Calculate merged stats from booleanResult
    const mergedVertices = booleanResult?.polygons.reduce((sum, p) => sum + p.outer.length, 0) || 0
    const mergedHoles = booleanResult?.polygons.reduce((sum, p) => sum + p.holes.length, 0) || 0
    const sharedEdges = previewResult?.sharedEdges.length || 0  // Only available for union
    const removedEdges = originalEdges - mergedVertices

    return { originalVertices, originalHoles, originalEdges, mergedVertices, mergedHoles, sharedEdges, removedEdges }
  }, [selectedPolygons, booleanResult, previewResult])

  // Empty state - no shapes loaded
  if (availableShapes.length === 0) {
    return (
      <div className="merge-tab empty-state">
        <div className="empty-content">
          <h3>No Fill Shapes Found</h3>
          <p>Merge only works with filled polygons (not stroke paths).</p>
          <p>Select a fill layer group on the Sort tab, then click Merge.</p>
          <p className="hint">For stroke paths, use the Order tab to optimize drawing order instead.</p>
          <button className="back-button" onClick={handleCancel}>
            ← Back to Sort
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="merge-tab">
      <div className="merge-sidebar">
        <div className="sidebar-header">
          <button className="back-link" onClick={handleCancel}>← Back</button>
          <h2>Merge Shapes</h2>
        </div>

        <div className="sidebar-content">
          {/* Shape selection section */}
          <div className="merge-section">
            <div className="section-header">
              <h3>Connected Shapes: {mergeableShapes.size}</h3>
              {mergeableShapes.size > 0 && (
                <button className="mini-btn next-btn" onClick={findNextMergeableShape}>
                  Next →
                </button>
              )}
            </div>
            <p className="hint">
              {mergeableShapes.size > 0
                ? 'Red shapes have shared edges and can be merged.'
                : 'No shapes with shared edges found.'}
            </p>
            <div className="shape-list">
              {availableShapes.map((poly) => {
                const isSelected = selectedForMerge.has(poly.nodeId)
                const isMergeable = mergeableShapes.has(poly.nodeId)
                // Check if this shape touches any OTHER selected shape
                const touchesSelected = Array.from(selectedForMerge).some(otherId => {
                  if (otherId === poly.nodeId) return false
                  const pairKey = poly.nodeId < otherId
                    ? `${poly.nodeId}|${otherId}`
                    : `${otherId}|${poly.nodeId}`
                  return touchingPairs.has(pairKey)
                })
                // Count how many shapes this one touches (selected or not)
                const touchCount = availableShapes.filter(other => {
                  if (other.nodeId === poly.nodeId) return false
                  const pairKey = poly.nodeId < other.nodeId
                    ? `${poly.nodeId}|${other.nodeId}`
                    : `${other.nodeId}|${poly.nodeId}`
                  return touchingPairs.has(pairKey)
                }).length
                const hasHoles = poly.polygonWithHoles.holes.length > 0

                const isCompound = poly.subpathCount > 1

                return (
                  <div
                    key={poly.nodeId}
                    className={`shape-item clickable ${isSelected ? 'selected' : ''} ${isMergeable ? 'mergeable' : ''} ${touchesSelected ? 'touches-selected' : ''} ${isCompound ? 'compound' : ''}`}
                    onClick={() => toggleShapeSelection(poly.nodeId)}
                    title={touchCount > 0 ? `Touches ${touchCount} other shape${touchCount > 1 ? 's' : ''}` : 'Not adjacent to other shapes'}
                  >
                    <div className="shape-checkbox">
                      {isSelected ? '✓' : ''}
                    </div>
                    <div
                      className="shape-color"
                      style={{ backgroundColor: poly.color }}
                    />
                    <span className="shape-name">{poly.name}</span>
                    {isCompound && <span className="shape-compound-badge" title={`Compound path: ${poly.subpathCount} subpaths`}>◈{poly.subpathCount}</span>}
                    {hasHoles && <span className="shape-holes" title={`${poly.polygonWithHoles.holes.length} holes`}>◯</span>}
                    {touchCount > 0 && <span className="shape-touch-badge" title={`Touches ${touchCount}`}>⟷{touchCount}</span>}
                    <span className="shape-vertices">{poly.vertices.length} pts</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="merge-section">
            <h3>Operation</h3>
            <div className="operation-buttons">
              <button
                className={`operation-btn ${operation === 'union' ? 'active' : ''}`}
                onClick={() => setOperation('union')}
                title="Combine shapes, removing shared edges"
              >
                ⊕ Union
              </button>
              <button
                className={`operation-btn ${operation === 'intersect' ? 'active' : ''}`}
                onClick={() => setOperation('intersect')}
                title="Keep only overlapping areas"
              >
                ⊗ Intersect
              </button>
              <button
                className={`operation-btn ${operation === 'subtract' ? 'active' : ''}`}
                onClick={() => setOperation('subtract')}
                title="Subtract second shape from first"
              >
                ⊖ Subtract
              </button>
              <button
                className={`operation-btn ${operation === 'xor' ? 'active' : ''}`}
                onClick={() => setOperation('xor')}
                title="Keep non-overlapping areas (exclude)"
              >
                ⊘ Exclude
              </button>
            </div>
          </div>

          <div className="merge-section">
            <h3>Edge Tolerance</h3>
            <div className="tolerance-control">
              <input
                type="range"
                min="0.01"
                max="2"
                step="0.01"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
              <span className="tolerance-value">{tolerance.toFixed(2)}px</span>
            </div>
            <p className="hint">How close edges must be to be considered shared</p>
          </div>

          {/* Path Diagnostics Panel - shows when single shape selected */}
          {selectedDiagnostics && selectedForMerge.size === 1 && (
            <div className="merge-section diagnostics-panel">
              <h3>
                Path Diagnostics
                <button
                  className="mini-btn"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                >
                  {showDiagnostics ? '▼' : '▶'}
                </button>
              </h3>
              {showDiagnostics && (
                <div className="diagnostics-content">
                  <div className="diag-row">
                    <span className="diag-label">Subpaths:</span>
                    <span className={`diag-value ${selectedDiagnostics.hasCompoundPath ? 'warning' : ''}`}>
                      {selectedDiagnostics.subpathCount}
                      {selectedDiagnostics.hasCompoundPath && ' (compound)'}
                    </span>
                  </div>
                  <div className="diag-row">
                    <span className="diag-label">Total points:</span>
                    <span className="diag-value">{selectedDiagnostics.totalPointCount}</span>
                  </div>
                  <div className="diag-row">
                    <span className="diag-label">Winding:</span>
                    <span className={`diag-value ${selectedDiagnostics.hasMixedWinding ? 'warning' : ''}`}>
                      {selectedDiagnostics.hasMixedWinding ? 'Mixed (may have holes)' : selectedDiagnostics.subpaths[0]?.windingDirection || 'N/A'}
                    </span>
                  </div>
                  {selectedDiagnostics.hasUnclosedPaths && (
                    <div className="diag-row warning">
                      <span className="diag-label">⚠</span>
                      <span className="diag-value">Has unclosed paths</span>
                    </div>
                  )}
                  {selectedDiagnostics.issues.length > 0 && (
                    <div className="diag-issues">
                      {selectedDiagnostics.issues.slice(0, 3).map((issue, idx) => (
                        <div key={idx} className={`diag-issue ${issue.severity}`}>
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedDiagnostics.hasCompoundPath && (
                    <button
                      className="explode-btn"
                      onClick={handleExplode}
                      title="Separate compound path into individual shapes"
                    >
                      💥 Explode into {selectedDiagnostics.subpathCount} shapes
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedPolygons.length >= 2 && booleanResult && (
            <StatSection title="Result Preview" className="merge-section">
              <StatRow label="Input shapes" value={selectedPolygons.length} />
              <StatRow label="Output shapes" value={booleanResult.polygons.length} />
              <StatRow label="Operation" value={operation} />
              {operation === 'union' && stats.sharedEdges > 0 && (
                <StatRow label="Shared edges" value={stats.sharedEdges} highlight />
              )}
            </StatSection>
          )}

          <div className="merge-actions">
            <button
              className="apply-btn"
              onClick={() => {
                DEBUG_MERGE && console.log('[Merge] Button clicked! booleanResult:', !!booleanResult, 'selectedPolygons:', selectedPolygons.length)
                handleApplyMerge()
              }}
              disabled={!booleanResult || selectedPolygons.length < 2}
            >
              {selectedPolygons.length < 2
                ? `Select ${2 - selectedPolygons.length} more shape${selectedPolygons.length === 1 ? '' : 's'}`
                : booleanResult
                  ? `Apply ${operation.charAt(0).toUpperCase() + operation.slice(1)} (${selectedPolygons.length} shapes)`
                  : 'Computing...'
              }
            </button>
            <button className="cancel-btn" onClick={handleCancel}>
              Done
            </button>
          </div>
        </div>
      </div>

      <div
        className={`merge-main ${isPanning ? 'panning' : ''}`}
        ref={canvasRef}
        {...panZoomHandlers}
      >
        <div className="merge-preview-container">
          {boundingBox && (
            <div
              className="merge-preview-transform"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: 'center center'
              }}
            >
              <svg
                className="merge-preview-svg"
                viewBox={`${boundingBox.x} ${boundingBox.y} ${boundingBox.width} ${boundingBox.height}`}
                preserveAspectRatio="xMidYMid meet"
              >
              {/* All available shapes - render original elements for accurate display */}
              <g className="available-shapes">
                {availableShapes.map((poly) => {
                  const isSelected = selectedForMerge.has(poly.nodeId)
                  // Get original path data from element for accurate rendering
                  const tagName = poly.element.tagName.toLowerCase()
                  let pathD = ''
                  if (tagName === 'path') {
                    pathD = poly.element.getAttribute('d') || ''
                  } else {
                    // For non-path elements (rect, polygon, etc.), use extracted vertices
                    pathD = pointsToPathD(poly.vertices)
                  }

                  return (
                    <path
                      key={`shape-${poly.nodeId}`}
                      d={pathD}
                      fill={poly.color}
                      fillOpacity={isSelected ? 0.7 : 0.3}
                      stroke={isSelected ? '#2c3e50' : '#999'}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeDasharray={isSelected ? 'none' : '4,4'}
                      className="clickable-shape"
                      onClick={() => toggleShapeSelection(poly.nodeId)}
                      style={{ cursor: 'pointer' }}
                    />
                  )
                })}
              </g>

              {/* All shared edges visualization - show all edges shared between any shapes */}
              {allSharedEdges.length > 0 && (
                <g className="all-shared-edges">
                  {allSharedEdges.map((edge, idx) => (
                    <line
                      key={`all-shared-${idx}`}
                      x1={edge.p1.x}
                      y1={edge.p1.y}
                      x2={edge.p2.x}
                      y2={edge.p2.y}
                      stroke="#e74c3c"
                      strokeWidth={2}
                      strokeLinecap="round"
                      pointerEvents="none"
                      opacity={0.6}
                    />
                  ))}
                </g>
              )}

              {/* Selected shapes' shared edges - brighter highlight for edges that will be removed */}
              {previewResult && previewResult.sharedEdges.length > 0 && (
                <g className="selected-shared-edges">
                  {previewResult.sharedEdges.map((edge, idx) => (
                    <line
                      key={`shared-${idx}`}
                      x1={edge.p1.x}
                      y1={edge.p1.y}
                      x2={edge.p2.x}
                      y2={edge.p2.y}
                      stroke="#ff0000"
                      strokeWidth={4}
                      strokeLinecap="round"
                      pointerEvents="none"
                      opacity={1}
                    />
                  ))}
                </g>
              )}

              {/* Merged result overlay - shows outline of merged polygon with holes */}
              {previewResult && (
                <g className="merged-shape">
                  {/* Outer boundary */}
                  <path
                    d={pointsToPathD(previewResult.outer)}
                    fill="none"
                    stroke="#1abc9c"
                    strokeWidth={3}
                    strokeDasharray="8,4"
                    pointerEvents="none"
                  />
                  {/* Holes - shown in different color */}
                  {previewResult.holes.map((hole, idx) => (
                    <path
                      key={`hole-${idx}`}
                      d={pointsToPathD(hole)}
                      fill="none"
                      stroke="#9b59b6"
                      strokeWidth={2}
                      strokeDasharray="4,4"
                      pointerEvents="none"
                    />
                  ))}
                </g>
              )}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
