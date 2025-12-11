import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAppContext } from '../../../context/AppContext'
import { SVGNode } from '../../../types/svg'
import { Point, getAllPolygonsFromElement } from '../../../utils/geometry'
import { UI } from '../../../constants'
import { usePanZoom } from '../../../hooks'
import { StatSection, StatRow, UnifiedLayerList, ItemRenderState, FillReadinessBadge, FillReadinessStatus } from '../../shared'
import { countSubpaths, analyzePathD, separateSubpaths, PathDiagnostics } from '../../../utils/pathAnalysis'
import './MergeTab.css'

// Import types and utilities from module
import { MergeOperation, PolygonData, MergeShapeListItem, UnionResult, BooleanResult } from './types'
import { edgeKey, findTouchingShapes, unionPolygons } from './polygonUtils'
import { pointsToPathD, multiPolygonToPathD } from './pathConversion'
import { performBooleanOperation } from './booleanOperations'

// Debug logging - set to false for production
const DEBUG_MERGE = false

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

  // Toggle shape selection (kept for programmatic use)
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

  // UnifiedLayerList items with computed properties for each shape
  const shapeListItems = useMemo((): MergeShapeListItem[] => {
    return availableShapes.map((poly) => {
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

      // Determine fill readiness status
      let fillReadiness: FillReadinessStatus = 'ready'
      let fillReadinessMessage = 'Shape is isolated - ready for fill'

      if (isMergeable) {
        // Shape has shared edges with others - needs merging
        fillReadiness = 'issue'
        fillReadinessMessage = `Has ${touchCount} shared edge${touchCount > 1 ? 's' : ''} - merge to avoid fill artifacts`
      } else if (isCompound && poly.subpathCount > 2) {
        // Compound path with many subpaths - likely text or complex logo
        fillReadiness = 'warning'
        fillReadinessMessage = `Compound path with ${poly.subpathCount} parts - consider exploding first`
      }

      return {
        id: poly.nodeId,
        name: poly.name,
        color: poly.color,
        pointCount: poly.vertices.length,
        polygon: poly,
        isMergeable,
        touchesSelected,
        touchCount,
        hasHoles,
        isCompound,
        fillReadiness,
        fillReadinessMessage,
      }
    })
  }, [availableShapes, selectedForMerge, touchingPairs, mergeableShapes])

  // Overall fill readiness summary
  const fillReadinessSummary = useMemo(() => {
    const issueCount = shapeListItems.filter(s => s.fillReadiness === 'issue').length
    const warningCount = shapeListItems.filter(s => s.fillReadiness === 'warning').length
    const readyCount = shapeListItems.filter(s => s.fillReadiness === 'ready').length

    let overallStatus: FillReadinessStatus = 'ready'
    let message = 'All shapes are ready for fill'

    if (issueCount > 0) {
      overallStatus = 'issue'
      message = `${issueCount} shape${issueCount > 1 ? 's need' : ' needs'} merging before fill`
    } else if (warningCount > 0) {
      overallStatus = 'warning'
      message = `${warningCount} shape${warningCount > 1 ? 's have' : ' has'} potential issues`
    }

    return { issueCount, warningCount, readyCount, overallStatus, message }
  }, [shapeListItems])

  // Handle selection changes from UnifiedLayerList
  const handleShapeSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedForMerge(ids)
  }, [])

  // Custom render function for shape items
  const renderShapeItem = useCallback((item: MergeShapeListItem, state: ItemRenderState) => {
    const { isMergeable, touchesSelected, touchCount, hasHoles, isCompound, polygon, fillReadiness, fillReadinessMessage } = item

    return (
      <div
        className={`shape-item-inner ${isMergeable ? 'mergeable' : ''} ${touchesSelected ? 'touches-selected' : ''} ${isCompound ? 'compound' : ''} fill-${fillReadiness}`}
        title={fillReadinessMessage}
      >
        <FillReadinessBadge status={fillReadiness} message={fillReadinessMessage} />
        <div className="shape-checkbox">
          {state.isSelected ? '✓' : ''}
        </div>
        <div
          className="shape-color"
          style={{ backgroundColor: item.color }}
        />
        <span className="shape-name">{item.name}</span>
        {isCompound && <span className="shape-compound-badge" title={`Compound path: ${polygon.subpathCount} subpaths`}>◈{polygon.subpathCount}</span>}
        {hasHoles && <span className="shape-holes" title={`${polygon.polygonWithHoles.holes.length} holes`}>◯</span>}
        {touchCount > 0 && <span className="shape-touch-badge" title={`Touches ${touchCount}`}>⟷{touchCount}</span>}
        <span className="shape-vertices">{item.pointCount} pts</span>
      </div>
    )
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
          {/* Fill readiness summary banner */}
          <div className={`fill-readiness-banner ${fillReadinessSummary.overallStatus}`}>
            <div className="banner-icon">
              <FillReadinessBadge status={fillReadinessSummary.overallStatus} />
            </div>
            <div className="banner-content">
              <div className="banner-title">
                {fillReadinessSummary.overallStatus === 'ready' ? 'Ready for Fill' :
                 fillReadinessSummary.overallStatus === 'warning' ? 'Review Recommended' : 'Action Required'}
              </div>
              <div className="banner-message">{fillReadinessSummary.message}</div>
            </div>
            <div className="banner-stats">
              <span className="stat ready" title="Ready">{fillReadinessSummary.readyCount}</span>
              <span className="stat warning" title="Warnings">{fillReadinessSummary.warningCount}</span>
              <span className="stat issue" title="Issues">{fillReadinessSummary.issueCount}</span>
            </div>
          </div>

          {/* Shape selection section */}
          <div className="merge-section">
            <div className="section-header">
              <h3>Shapes: {availableShapes.length}</h3>
              {mergeableShapes.size > 0 && (
                <button className="mini-btn next-btn" onClick={findNextMergeableShape}>
                  Next Issue →
                </button>
              )}
            </div>
            <p className="hint">
              {mergeableShapes.size > 0
                ? `${mergeableShapes.size} shape${mergeableShapes.size > 1 ? 's have' : ' has'} shared edges - merge to avoid fill artifacts.`
                : 'All shapes are isolated islands.'}
            </p>
            <UnifiedLayerList
              items={shapeListItems}
              mode="flat"
              selectedIds={selectedForMerge}
              onSelectionChange={handleShapeSelectionChange}
              selectionMode="multi"
              enableDragDrop={false}
              renderItem={renderShapeItem}
              emptyMessage="No shapes available"
              className="shape-list"
              itemClassName="shape-item"
            />
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
