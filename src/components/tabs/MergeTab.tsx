import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { SVGNode } from '../../types/svg'
import { Point, getAllPolygonsFromElement, PolygonWithHoles } from '../../utils/geometry'
import './MergeTab.css'

type MergeOperation = 'union' | 'intersect' | 'subtract'

interface PolygonData {
  nodeId: string
  name: string
  color: string
  vertices: Point[]
  polygonWithHoles: PolygonWithHoles  // Full polygon data including holes
  element: Element  // Original element for rendering
}

// Edge key for finding duplicates
function edgeKey(p1: Point, p2: Point, tolerance: number = 0.01): string {
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

  console.log('[Union] Starting with tolerance:', tolerance)

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
    console.log(`[Union] Polygon ${polyIdx} has ${vertices.length} edges`)
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i]
      const p2 = vertices[(i + 1) % vertices.length]
      const key = edgeKey(p1, p2, tolerance)

      edges.push({ p1, p2, polygonIndex: polyIdx })
      const newCount = (edgeCounts.get(key) || 0) + 1
      edgeCounts.set(key, newCount)
    }
  }

  console.log(`[Union] Total edges: ${edges.length}, unique edge keys: ${edgeCounts.size}`)

  // Collect shared edges for visualization and count
  const sharedEdgeKeys = new Set<string>()
  edgeCounts.forEach((count, key) => {
    if (count > 1) sharedEdgeKeys.add(key)
  })
  console.log(`[Union] Shared edges found: ${sharedEdgeKeys.size}`)

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

  console.log(`[Union] Boundary edges: ${boundaryEdges.length}`)

  if (boundaryEdges.length === 0) return null

  // Build the merged polygon by walking the boundary edges
  const result: Point[] = []
  const usedEdges = new Set<number>()

  // Start with the first edge
  let currentEdge = boundaryEdges[0]
  result.push(currentEdge.p1)
  result.push(currentEdge.p2)
  usedEdges.add(0)

  // Walk the boundary
  let iterations = 0
  const maxIterations = boundaryEdges.length * 2

  while (usedEdges.size < boundaryEdges.length && iterations < maxIterations) {
    iterations++
    const lastPoint = result[result.length - 1]

    // Find the next edge that starts where we are
    let foundNext = false
    for (let i = 0; i < boundaryEdges.length; i++) {
      if (usedEdges.has(i)) continue

      const edge = boundaryEdges[i]

      // Check if edge.p1 matches lastPoint
      if (Math.abs(edge.p1.x - lastPoint.x) < tolerance &&
          Math.abs(edge.p1.y - lastPoint.y) < tolerance) {
        result.push(edge.p2)
        usedEdges.add(i)
        foundNext = true
        break
      }

      // Check if edge.p2 matches lastPoint (reverse edge)
      if (Math.abs(edge.p2.x - lastPoint.x) < tolerance &&
          Math.abs(edge.p2.y - lastPoint.y) < tolerance) {
        result.push(edge.p1)
        usedEdges.add(i)
        foundNext = true
        break
      }
    }

    if (!foundNext) {
      // No connecting edge found - might have multiple separate boundaries
      break
    }
  }

  // Remove duplicate last point if it matches first
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    if (Math.abs(first.x - last.x) < tolerance && Math.abs(first.y - last.y) < tolerance) {
      result.pop()
    }
  }

  if (result.length < 3) return null

  // Collect all holes from input polygons
  const allHoles: Point[][] = []
  for (const poly of polygons) {
    for (const hole of poly.polygonWithHoles.holes) {
      if (hole.length >= 3) {
        allHoles.push(hole)
      }
    }
  }
  console.log(`[Union] Collected ${allHoles.length} holes from input shapes`)

  // Find touching pairs
  const touchingPairs = findTouchingShapes(polygons, tolerance)

  return {
    outer: result,
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
  } = useAppContext()

  const [operation, setOperation] = useState<MergeOperation>('union')
  const [previewResult, setPreviewResult] = useState<UnionResult | null>(null)
  const [touchingPairs, setTouchingPairs] = useState<Set<string>>(new Set())
  const [tolerance, setTolerance] = useState(0.1)

  // All shapes available for selection (imported from group)
  const [availableShapes, setAvailableShapes] = useState<PolygonData[]>([])
  // Which shapes are selected for merging
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())

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

    // Helper to add a shape from an element
    const addShapeFromElement = (nodeId: string, name: string, element: Element) => {
      if (!hasFill(element)) return

      // Use getAllPolygonsFromElement - same as FillTab for consistent polygon extraction
      const polygons = getAllPolygonsFromElement(element)
      if (polygons.length === 0) return

      // For merge, we use the first/largest polygon
      const polygonWithHoles = polygons[0]
      if (polygonWithHoles.outer.length < 3) return

      const fill = element.getAttribute('fill') || '#666'
      shapes.push({
        nodeId,
        name,
        color: fill,
        vertices: polygonWithHoles.outer,  // Main boundary for union
        polygonWithHoles,  // Full data for reference
        element,  // Original element for rendering
      })
    }

    for (const id of selectedNodeIds) {
      const node = findNode(layerNodes, id)
      if (!node) continue

      // If it's a group, get all children
      if (node.isGroup) {
        const leaves = collectLeafNodes(node)
        for (const leaf of leaves) {
          addShapeFromElement(leaf.id, leaf.name || leaf.id, leaf.element)
        }
      } else {
        // Single shape
        addShapeFromElement(node.id, node.name || node.id, node.element)
      }
    }

    if (shapes.length > 0) {
      console.log('[Merge] Loaded', shapes.length, 'shapes:')
      shapes.forEach((s, i) => {
        console.log(`[Merge]   ${i}: ${s.name}, ${s.vertices.length} vertices, color: ${s.color}`)
      })
      setAvailableShapes(shapes)
      setStatusMessage(`Loaded ${shapes.length} fill shapes for merging`)
    } else {
      console.log('[Merge] No fill shapes found')
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
      console.log('[Merge] Found', pairs.size, 'touching pairs')
    } else {
      setTouchingPairs(new Set())
    }
  }, [availableShapes, tolerance])

  // Compute preview when selection changes
  useEffect(() => {
    if (selectedPolygons.length >= 2 && operation === 'union') {
      console.log('[Merge] Computing union for', selectedPolygons.length, 'polygons')
      console.log('[Merge] Tolerance:', tolerance)
      selectedPolygons.forEach((p, i) => {
        console.log(`[Merge] Polygon ${i}: ${p.name}, ${p.vertices.length} vertices, ${p.polygonWithHoles.holes.length} holes`)
        if (p.vertices.length > 0) {
          console.log(`[Merge]   First vertex: (${p.vertices[0].x.toFixed(2)}, ${p.vertices[0].y.toFixed(2)})`)
          console.log(`[Merge]   Last vertex: (${p.vertices[p.vertices.length-1].x.toFixed(2)}, ${p.vertices[p.vertices.length-1].y.toFixed(2)})`)
        }
      })
      const merged = unionPolygons(selectedPolygons, tolerance)
      console.log('[Merge] Result:', merged ? `${merged.outer.length} vertices, ${merged.holes.length} holes` : 'null (no shared edges found)')
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

  // Select all / deselect all
  const handleSelectAll = useCallback(() => {
    setSelectedForMerge(new Set(availableShapes.map(s => s.nodeId)))
  }, [availableShapes])

  const handleDeselectAll = useCallback(() => {
    setSelectedForMerge(new Set())
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

    const padding = 20
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    }
  }, [availableShapes])

  // Apply the merge
  const handleApplyMerge = useCallback(() => {
    console.log('[Merge] handleApplyMerge called')
    console.log('[Merge] previewResult:', previewResult)
    console.log('[Merge] selectedPolygons:', selectedPolygons.length)

    if (!previewResult || selectedPolygons.length < 2) {
      setStatusMessage('error:Select at least 2 shapes to merge')
      return
    }

    // Create compound path with outer boundary and holes
    const pathD = polygonWithHolesToPathD(previewResult.outer, previewResult.holes)
    console.log('[Merge] Generated path d:', pathD.substring(0, 100) + '...')
    const firstPoly = selectedPolygons[0]

    // Get attributes from first polygon
    const fill = firstPoly.element.getAttribute('fill') || 'none'
    const stroke = firstPoly.element.getAttribute('stroke') || 'none'
    const strokeWidth = firstPoly.element.getAttribute('stroke-width') || '1'
    console.log('[Merge] Attributes - fill:', fill, 'stroke:', stroke, 'strokeWidth:', strokeWidth)

    // Create new path element
    const svgElement = document.querySelector('.canvas-content svg')
    console.log('[Merge] Found SVG element:', svgElement)
    if (!svgElement) {
      setStatusMessage('error:SVG not found')
      return
    }

    const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const newId = `merged-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    newPath.setAttribute('id', newId)
    newPath.setAttribute('d', pathD)
    newPath.setAttribute('fill', fill)
    newPath.setAttribute('fill-rule', 'evenodd')  // Use evenodd to punch out holes
    newPath.setAttribute('stroke', stroke)
    newPath.setAttribute('stroke-width', strokeWidth)

    // Add to SVG
    svgElement.appendChild(newPath)
    console.log('[Merge] Created new path with id:', newId)

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
    const idsToRemove = new Set(selectedPolygons.map(p => p.nodeId))
    console.log('[Merge] IDs to remove:', Array.from(idsToRemove))
    console.log('[Merge] Layer nodes before:', layerNodes.length)

    // Deep clone and filter nodes
    const removeNodesByIds = (nodes: SVGNode[], idsToRemove: Set<string>): SVGNode[] => {
      const result: SVGNode[] = []
      for (const node of nodes) {
        if (idsToRemove.has(node.id)) {
          console.log('[Merge] Removing node:', node.id)
          node.element.remove()
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
    console.log('[Merge] Layer nodes after:', updatedNodes.length)

    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)
    setStatusMessage(`Merged ${selectedPolygons.length} shapes into 1${holesMsg}`)
    console.log('[Merge] Complete, switching to sort tab')
    setActiveTab('sort')
  }, [previewResult, selectedPolygons, layerNodes, setLayerNodes, rebuildSvgFromLayers, setStatusMessage, setActiveTab])

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
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(Math.min(10, Math.max(0.1, scale * delta)))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scale, setScale])

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
              <h3>Shapes ({selectedForMerge.size} / {availableShapes.length} selected)</h3>
              <div className="selection-buttons">
                <button className="mini-btn" onClick={handleSelectAll}>All</button>
                <button className="mini-btn" onClick={handleDeselectAll}>None</button>
              </div>
            </div>
            <p className="hint">Click shapes below or on the preview to select them for merging.</p>
            <div className="shape-list">
              {availableShapes.map((poly) => {
                const isSelected = selectedForMerge.has(poly.nodeId)
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
                    className={`shape-item clickable ${isSelected ? 'selected' : ''} ${touchesSelected ? 'touches-selected' : ''}`}
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
                console.log('[Merge] Button clicked! previewResult:', !!previewResult, 'selectedPolygons:', selectedPolygons.length)
                handleApplyMerge()
              }}
              disabled={!previewResult || selectedPolygons.length < 2}
            >
              {selectedPolygons.length < 2
                ? `Select ${2 - selectedPolygons.length} more shape${selectedPolygons.length === 1 ? '' : 's'}`
                : previewResult
                  ? `Merge ${selectedPolygons.length} Shapes`
                  : 'No shared edges found'
              }
            </button>
            <button className="cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className="merge-main">
        <div
          className="merge-preview-container"
          ref={canvasRef}
        >
          {boundingBox && (
            <svg
              className="merge-preview-svg"
              viewBox={`${boundingBox.x - offset.x / scale} ${boundingBox.y - offset.y / scale} ${boundingBox.width / scale} ${boundingBox.height / scale}`}
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
                      strokeWidth={(isSelected ? 2 : 1) / scale}
                      strokeDasharray={isSelected ? 'none' : `${4/scale},${4/scale}`}
                      className="clickable-shape"
                      onClick={() => toggleShapeSelection(poly.nodeId)}
                      style={{ cursor: 'pointer' }}
                    />
                  )
                })}
              </g>

              {/* Shared edges visualization - highlight edges that will be removed */}
              {previewResult && previewResult.sharedEdges.length > 0 && (
                <g className="shared-edges">
                  {previewResult.sharedEdges.map((edge, idx) => (
                    <line
                      key={`shared-${idx}`}
                      x1={edge.p1.x}
                      y1={edge.p1.y}
                      x2={edge.p2.x}
                      y2={edge.p2.y}
                      stroke="#e74c3c"
                      strokeWidth={4 / scale}
                      strokeLinecap="round"
                      pointerEvents="none"
                      opacity={0.8}
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
                    strokeWidth={3 / scale}
                    strokeDasharray={`${8/scale},${4/scale}`}
                    pointerEvents="none"
                  />
                  {/* Holes - shown in different color */}
                  {previewResult.holes.map((hole, idx) => (
                    <path
                      key={`hole-${idx}`}
                      d={pointsToPathD(hole)}
                      fill="none"
                      stroke="#9b59b6"
                      strokeWidth={2 / scale}
                      strokeDasharray={`${4/scale},${4/scale}`}
                      pointerEvents="none"
                    />
                  ))}
                </g>
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
