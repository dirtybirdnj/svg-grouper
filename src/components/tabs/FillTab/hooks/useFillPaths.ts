import { useMemo, useState, useEffect } from 'react'
import { SVGNode } from '../../../../types/svg'
import { findNodeById } from '../../../../utils/nodeUtils'
import { PolygonWithHoles, getAllPolygonsFromElement } from '../../../../utils/geometry'
import { FillPathInfo } from '../fillUtils'

interface UseFillPathsProps {
  layerNodes: SVGNode[]
  fillTargetNodeIds: string[]
  selectedNodeIds: Set<string>
}

/**
 * Extract fill paths from target nodes and calculate bounding box.
 */
export function useFillPaths({
  layerNodes,
  fillTargetNodeIds,
  selectedNodeIds,
}: UseFillPathsProps) {
  // Find the target nodes (supports multiple selection)
  const targetNodes = useMemo(() => {
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

  // Preserve original fill paths for "Apply & Fill Again"
  const [preservedFillData, setPreservedFillData] = useState<{ pathInfo: FillPathInfo; polygon: PolygonWithHoles }[] | null>(null)

  // Clear preserved data when target changes
  useEffect(() => {
    setPreservedFillData(null)
  }, [fillTargetNodeIds])

  // Calculate bounding box of all fill paths
  const boundingBox = useMemo(() => {
    // Use preserved polygon data if available
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
      const allPolygons = getAllPolygonsFromElement(path.element)
      for (const polygonData of allPolygons) {
        for (const p of polygonData.outer) {
          minX = Math.min(minX, p.x)
          minY = Math.min(minY, p.y)
          maxX = Math.max(maxX, p.x)
          maxY = Math.max(maxY, p.y)
        }
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

  // Active fill paths (uses preserved data if available)
  const activeFillPaths = useMemo(() => {
    return preservedFillData
      ? preservedFillData.map(d => d.pathInfo)
      : fillPaths
  }, [preservedFillData, fillPaths])

  return {
    targetNodes,
    targetNode,
    fillPaths,
    activeFillPaths,
    preservedFillData,
    setPreservedFillData,
    boundingBox,
  }
}

export type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
} | null
