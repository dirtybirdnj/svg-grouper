import { useCallback } from 'react'
import { SVGNode } from '../../../../types/svg'
import { findNodeById } from '../../../../utils/nodeUtils'
import { simplifyPathElement, countPathPoints } from '../../../../utils/pathSimplify'
import { linesToCompoundPath } from '../../../../utils/geometry'
import { getNodeColor, getNodeStrokeWidth } from '../../../../utils/elementColor'
import { collectLines } from '../weldUtils'

interface UsePathOperationsProps {
  selectedNodeIds: Set<string>
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void
  rebuildSvgFromLayers: (nodes?: SVGNode[]) => void
  setStatusMessage: (msg: string) => void
  simplifyTolerance: number
  weldArmed: boolean
  setWeldArmed: (armed: boolean) => void
  setDeleteArmed: (armed: boolean) => void
  setSplitArmed: (armed: boolean) => void
  setFlattenArmed: (armed: boolean) => void
}

export function usePathOperations({
  selectedNodeIds,
  layerNodes,
  setLayerNodes,
  rebuildSvgFromLayers,
  setStatusMessage,
  simplifyTolerance,
  weldArmed,
  setWeldArmed,
  setDeleteArmed,
  setSplitArmed,
  setFlattenArmed,
}: UsePathOperationsProps) {

  // Check if simplification is possible
  const canSimplify = useCallback((): boolean => {
    if (selectedNodeIds.size === 0) return false

    // Check if any selected node is a path or group with paths
    for (const id of selectedNodeIds) {
      const node = findNodeById(layerNodes, id)
      if (node) {
        if (!node.isGroup && node.element.tagName.toLowerCase() === 'path') {
          return true
        }
        if (node.isGroup && node.element.querySelectorAll('path').length > 0) {
          return true
        }
      }
    }
    return false
  }, [selectedNodeIds, layerNodes])

  // Handle simplify paths
  const handleSimplifyPaths = useCallback(() => {
    if (!canSimplify()) return

    let totalBefore = 0
    let totalAfter = 0

    for (const id of selectedNodeIds) {
      const node = findNodeById(layerNodes, id)
      if (!node) continue

      if (!node.isGroup && node.element.tagName.toLowerCase() === 'path') {
        // Single path
        const before = countPathPoints(node.element)
        const result = simplifyPathElement(node.element, {
          tolerance: simplifyTolerance,
          highQuality: true
        })

        if (result) {
          totalBefore += before
          totalAfter += result.simplifiedPoints
          node.element.setAttribute('d', result.pathData)
        }
      } else if (node.isGroup) {
        // Group - simplify all paths within
        const paths = node.element.querySelectorAll('path')
        for (const path of paths) {
          const before = countPathPoints(path)
          const result = simplifyPathElement(path, {
            tolerance: simplifyTolerance,
            highQuality: true
          })

          if (result) {
            totalBefore += before
            totalAfter += result.simplifiedPoints
            path.setAttribute('d', result.pathData)
          }
        }
      }
    }

    if (totalBefore > 0) {
      rebuildSvgFromLayers(layerNodes)

      const reduction = Math.round((1 - totalAfter / totalBefore) * 100)
      setStatusMessage(`Simplified: ${totalBefore} → ${totalAfter} points (${reduction}% reduction)`)
    }
  }, [selectedNodeIds, layerNodes, simplifyTolerance, rebuildSvgFromLayers, setStatusMessage, canSimplify])

  // Check if weld is possible (need a selected group with paths)
  const canWeld = useCallback((): boolean => {
    if (selectedNodeIds.size === 0) return false

    for (const nodeId of selectedNodeIds) {
      const node = findNodeById(layerNodes, nodeId)
      if (!node) continue

      // Check if this node or its children have paths
      const hasPaths = (n: SVGNode): boolean => {
        const tagName = n.element.tagName.toLowerCase()
        if (['path', 'line', 'polyline', 'polygon'].includes(tagName)) return true
        return n.children.some(hasPaths)
      }

      if (hasPaths(node)) return true
    }
    return false
  }, [selectedNodeIds, layerNodes])

  // Handle weld - combine all paths in selected group(s) into a single compound path
  const handleWeld = useCallback(() => {
    if (!canWeld()) return

    if (!weldArmed) {
      setWeldArmed(true)
      setDeleteArmed(false)
      setSplitArmed(false)
      setFlattenArmed(false)
      setStatusMessage('Click Weld again to confirm - will combine paths into compound path')
      return
    }

    setWeldArmed(false)
    setStatusMessage('')

    // Process each selected node
    let totalBefore = 0
    let totalAfter = 0

    const updateNodes = (nodes: SVGNode[]): SVGNode[] => {
      return nodes.map(node => {
        if (selectedNodeIds.has(node.id)) {
          // Collect all lines from this node
          const lines = collectLines(node)
          totalBefore += lines.length

          if (lines.length === 0) return node

          // Get color and stroke width from first drawable child
          const color = getNodeColor(node)
          const strokeWidth = getNodeStrokeWidth(node)

          // Create compound path
          const pathD = linesToCompoundPath(lines, 2)
          totalAfter++

          // Create new path element
          const nodeId = `welded-${node.id}`
          const pathMarkup = `<path id="${nodeId}" d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`

          // Parse to create element
          const parser = new DOMParser()
          const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${pathMarkup}</svg>`, 'image/svg+xml')
          const pathElement = doc.querySelector('path') as Element

          // Return new node with compound path
          return {
            ...node,
            id: nodeId,
            name: `Welded (${lines.length} lines)`,
            type: 'path',
            element: pathElement,
            isGroup: false,
            children: [],
            customMarkup: pathMarkup,
          }
        }

        // Process children recursively
        if (node.children.length > 0) {
          return { ...node, children: updateNodes(node.children) }
        }

        return node
      })
    }

    const updatedNodes = updateNodes(layerNodes)
    setLayerNodes(updatedNodes)
    rebuildSvgFromLayers(updatedNodes)

    setStatusMessage(`Welded: ${totalBefore} segments → ${totalAfter} compound path(s)`)
  }, [
    selectedNodeIds,
    layerNodes,
    setLayerNodes,
    rebuildSvgFromLayers,
    setStatusMessage,
    weldArmed,
    setWeldArmed,
    setDeleteArmed,
    setSplitArmed,
    setFlattenArmed,
    canWeld,
  ])

  return {
    canSimplify,
    handleSimplifyPaths,
    canWeld,
    handleWeld,
  }
}
