import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import { Point, getAllPolygonsFromElement, PolygonWithHoles } from '../../utils/geometry'
import { OPTIMIZATION, UI } from '../../constants'
import './MergeTab.css'

// Debug logging - set to false for production
const DEBUG_MERGE = false

type MergeOperation = 'union' | 'intersect' | 'subtract'

interface PolygonData {
  nodeId: string
  originalNodeId: string  // Original element ID (before splitting compound paths)
  name: string
  color: string
  vertices: Point[]
  polygonWithHoles: PolygonWithHoles  // Full polygon data including holes
  element: Element  // Original element for rendering
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

export default function MergeTab() {
  const {
    selectedNodeIds,
    layerNodes,
    setLayerNodes,
    setActiveTab,
    rebuildSvgFromLayers,
    setStatusMessage,
    scale,  // Use global zoom state
    setScale,  // Update global zoom
    offset, // Use global pan state
    setOffset, // Update global pan
  } = useAppContext()

  const [operation, setOperation] = useState<MergeOperation>('union')
  const [previewResult, setPreviewResult] = useState<UnionResult | null>(null)
  const [touchingPairs, setTouchingPairs] = useState<Set<string>>(new Set())
  const [tolerance, setTolerance] = useState(0.1)

  // All shapes available for selection (imported from group)
  const [availableShapes, setAvailableShapes] = useState<PolygonData[]>([])
  // Which shapes are selected for merging
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())

  // Pan state
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const canvasRef = useRef<HTMLDivElement>(null)
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

  // Check if all selected shapes are connected (form a single connected component)
  const selectionIsConnected = useMemo(() => {
    if (selectedForMerge.size < 2) return true

    DEBUG_MERGE && console.log('[Merge] Checking connectivity for selected shapes:', Array.from(selectedForMerge))
    DEBUG_MERGE && console.log('[Merge] All touching pairs:', Array.from(touchingPairs))

    // Build adjacency list for selected shapes only
    const adjacency = new Map<string, Set<string>>()
    selectedForMerge.forEach(id => adjacency.set(id, new Set()))

    let foundConnections = 0
    touchingPairs.forEach(pairKey => {
      const [id1, id2] = pairKey.split('|')
      if (selectedForMerge.has(id1) && selectedForMerge.has(id2)) {
        adjacency.get(id1)!.add(id2)
        adjacency.get(id2)!.add(id1)
        foundConnections++
        DEBUG_MERGE && console.log(`[Merge] Found connection: ${id1} <-> ${id2}`)
      }
    })
    DEBUG_MERGE && console.log(`[Merge] Found ${foundConnections} connections between selected shapes`)

    // BFS to check connectivity
    const visited = new Set<string>()
    const queue = [Array.from(selectedForMerge)[0]]
    visited.add(queue[0])

    while (queue.length > 0) {
      const current = queue.shift()!
      adjacency.get(current)?.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      })
    }

    const isConnected = visited.size === selectedForMerge.size
    DEBUG_MERGE && console.log(`[Merge] Connectivity check: visited ${visited.size}/${selectedForMerge.size}, connected=${isConnected}`)

    return isConnected
  }, [selectedForMerge, touchingPairs])

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
    if (selectedPolygons.length >= 2 && operation === 'union') {
      DEBUG_MERGE && console.log('[Merge] Computing union for', selectedPolygons.length, 'polygons')
      DEBUG_MERGE && console.log('[Merge] Tolerance:', tolerance)
      selectedPolygons.forEach((p, i) => {
        DEBUG_MERGE && console.log(`[Merge] Polygon ${i}: ${p.name}, ${p.vertices.length} vertices, ${p.polygonWithHoles.holes.length} holes`)
        if (p.vertices.length > 0) {
          DEBUG_MERGE && console.log(`[Merge]   First vertex: (${p.vertices[0].x.toFixed(2)}, ${p.vertices[0].y.toFixed(2)})`)
          DEBUG_MERGE && console.log(`[Merge]   Last vertex: (${p.vertices[p.vertices.length-1].x.toFixed(2)}, ${p.vertices[p.vertices.length-1].y.toFixed(2)})`)
        }
      })
      const merged = unionPolygons(selectedPolygons, tolerance)
      DEBUG_MERGE && console.log('[Merge] Result:', merged ? `${merged.outer.length} vertices, ${merged.holes.length} holes` : 'null (no shared edges found)')
      setPreviewResult(merged)
    } else {
      setPreviewResult(null)
    }
  }, [selectedPolygons, operation, tolerance])

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
    DEBUG_MERGE && console.log('[Merge] previewResult:', previewResult)
    DEBUG_MERGE && console.log('[Merge] selectedPolygons:', selectedPolygons.length)

    if (!previewResult || selectedPolygons.length < 2) {
      setStatusMessage('error:Select at least 2 shapes to merge')
      return
    }

    // Create compound path with outer boundary and holes
    const pathD = polygonWithHolesToPathD(previewResult.outer, previewResult.holes)
    DEBUG_MERGE && console.log('[Merge] Generated path d:', pathD.substring(0, 100) + '...')
    const firstPoly = selectedPolygons[0]

    // Get attributes from first polygon
    const fill = firstPoly.element.getAttribute('fill') || 'none'
    const stroke = firstPoly.element.getAttribute('stroke') || 'none'
    const strokeWidth = firstPoly.element.getAttribute('stroke-width') || '1'
    DEBUG_MERGE && console.log('[Merge] Attributes - fill:', fill, 'stroke:', stroke, 'strokeWidth:', strokeWidth)

    // Create new path element in memory (will be added to DOM by rebuildSvgFromLayers)
    const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const newId = `merged-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    newPath.setAttribute('id', newId)
    newPath.setAttribute('d', pathD)
    newPath.setAttribute('fill', fill)
    newPath.setAttribute('fill-rule', 'evenodd')  // Use evenodd to punch out holes
    newPath.setAttribute('stroke', stroke)
    newPath.setAttribute('stroke-width', strokeWidth)
    DEBUG_MERGE && console.log('[Merge] Created new path element with id:', newId)

    // Create new node
    const holesMsg = previewResult.holes.length > 0 ? ` with ${previewResult.holes.length} holes` : ''
    const newNode: SVGNode = {
      id: newId,
      type: 'path',
      name: `Merged (${selectedPolygons.length} shapes${holesMsg})`,
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
    const newShape: PolygonData = {
      nodeId: newId,
      originalNodeId: newId,  // New merged shape has same nodeId and originalNodeId
      name: newNode.name,
      color: fill,
      vertices: previewResult.outer,
      polygonWithHoles: { outer: previewResult.outer, holes: previewResult.holes },
      element: newPath
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

  // Handle scroll wheel zoom on merge preview - updates global scale
  useEffect(() => {
    const container = canvasRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Support both regular scroll and pinch-to-zoom (ctrlKey is set for pinch)
      const delta = e.ctrlKey
        ? (e.deltaY > 0 ? 0.95 : 1.05)  // Finer control for pinch
        : (e.deltaY > 0 ? 0.9 : 1.1)
      setScale(Math.min(10, Math.max(0.1, scale * delta)))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scale, setScale])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on left click
    if (e.button === 0) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }, [offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      })
    }
  }, [isPanning, panStart, setOffset])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Stats
  const stats = useMemo(() => {
    const originalVertices = selectedPolygons.reduce((sum, p) => sum + p.vertices.length, 0)
    const originalHoles = selectedPolygons.reduce((sum, p) => sum + p.polygonWithHoles.holes.length, 0)
    const originalEdges = originalVertices
    const mergedVertices = previewResult?.outer.length || 0
    const mergedHoles = previewResult?.holes.length || 0
    const sharedEdges = previewResult?.sharedEdges.length || 0
    const removedEdges = originalEdges - mergedVertices

    return { originalVertices, originalHoles, originalEdges, mergedVertices, mergedHoles, sharedEdges, removedEdges }
  }, [selectedPolygons, previewResult])

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

                return (
                  <div
                    key={poly.nodeId}
                    className={`shape-item clickable ${isSelected ? 'selected' : ''} ${isMergeable ? 'mergeable' : ''} ${touchesSelected ? 'touches-selected' : ''}`}
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
                className="operation-btn disabled"
                disabled
                title="Coming soon"
              >
                ⊗ Intersect
              </button>
              <button
                className="operation-btn disabled"
                disabled
                title="Coming soon"
              >
                ⊖ Subtract
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

          {selectedPolygons.length >= 2 && (
            <div className="merge-section">
              <h3>Statistics</h3>
              <div className="merge-stats">
                <div className="stat-row">
                  <span className="stat-label">Original vertices</span>
                  <span className="stat-value">{stats.originalVertices}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Merged vertices</span>
                  <span className="stat-value">{stats.mergedVertices}</span>
                </div>
                {stats.originalHoles > 0 && (
                  <div className="stat-row">
                    <span className="stat-label">Holes preserved</span>
                    <span className="stat-value">{stats.mergedHoles}</span>
                  </div>
                )}
                <div className="stat-row highlight">
                  <span className="stat-label">Shared edges</span>
                  <span className="stat-value">{stats.sharedEdges}</span>
                </div>
                <div className="stat-row highlight">
                  <span className="stat-label">Edges removed</span>
                  <span className="stat-value">{stats.removedEdges}</span>
                </div>
              </div>
            </div>
          )}

          <div className="merge-actions">
            <button
              className="apply-btn"
              onClick={() => {
                DEBUG_MERGE && console.log('[Merge] Button clicked! previewResult:', !!previewResult, 'selectedPolygons:', selectedPolygons.length, 'connected:', selectionIsConnected)
                handleApplyMerge()
              }}
              disabled={!previewResult || selectedPolygons.length < 2 || !selectionIsConnected}
            >
              {selectedPolygons.length < 2
                ? `Select ${2 - selectedPolygons.length} more shape${selectedPolygons.length === 1 ? '' : 's'}`
                : !selectionIsConnected
                  ? 'Selected shapes not all connected'
                  : previewResult
                    ? `Merge ${selectedPolygons.length} Shapes`
                    : 'No shared edges found'
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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
