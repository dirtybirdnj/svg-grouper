import { useCallback } from 'react'
import { SVGNode } from '../types/svg'
import { findNodeById } from '../utils/nodeUtils'
import { getSubpathsAsPathStrings } from '../utils/geometry'
import { parseStyleAttribute, isValidColor } from '../utils/elementColor'

// List of drawable SVG elements
const DRAWABLE_ELEMENTS = ['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']

interface UseToolHandlersProps {
  selectedNodeIds: Set<string>
  layerNodes: SVGNode[]
  rebuildSvgFromLayers: () => void
  syncSvgContent: () => void
  skipNextParse: React.MutableRefObject<boolean>
  setStatusMessage: (message: string) => void
}

/**
 * Hook for tool operations (convert to fills, normalize colors, separate compound paths)
 * Extracted from SortTab to reduce file size and improve modularity
 */
export function useToolHandlers({
  selectedNodeIds,
  layerNodes,
  rebuildSvgFromLayers,
  syncSvgContent,
  skipNextParse,
  setStatusMessage,
}: UseToolHandlersProps) {

  // Convert paths to fills - changes stroke color to fill color
  const handleConvertToFills = useCallback(() => {
    if (selectedNodeIds.size === 0) return

    let converted = 0
    const processNode = (node: SVGNode) => {
      const el = node.element
      const tagName = el.tagName.toLowerCase()

      if (DRAWABLE_ELEMENTS.includes(tagName)) {
        // Get the stroke color using the utility
        const style = el.getAttribute('style') || ''
        const parsedStyle = parseStyleAttribute(style)
        let strokeColor = parsedStyle.stroke || el.getAttribute('stroke')

        // If there's a stroke color, convert it to fill
        if (isValidColor(strokeColor)) {
          el.setAttribute('fill', strokeColor)
          el.setAttribute('stroke', 'none')

          // Also update style attribute if present
          if (style) {
            let newStyle = style
              .replace(/stroke:\s*[^;]+;?/g, 'stroke:none;')
              .replace(/fill:\s*[^;]+;?/g, `fill:${strokeColor};`)
            if (!newStyle.includes('fill:')) {
              newStyle += `fill:${strokeColor};`
            }
            el.setAttribute('style', newStyle)
          }
          converted++
        }
      }

      // Process children
      node.children.forEach(processNode)
    }

    // Process all selected nodes
    for (const id of selectedNodeIds) {
      const node = findNodeById(layerNodes, id)
      if (node) {
        processNode(node)
      }
    }

    if (converted > 0) {
      skipNextParse.current = true
      rebuildSvgFromLayers()
      setStatusMessage(`Converted ${converted} element${converted > 1 ? 's' : ''} to fills`)
    } else {
      setStatusMessage('No elements with strokes found to convert')
    }
  }, [selectedNodeIds, layerNodes, rebuildSvgFromLayers, skipNextParse, setStatusMessage])

  // Normalize colors - apply selected element's color attributes to all siblings
  const handleNormalizeColors = useCallback(() => {
    if (selectedNodeIds.size !== 1) {
      setStatusMessage('Select exactly one element to normalize colors from')
      return
    }

    const selectedId = Array.from(selectedNodeIds)[0]
    const selectedNode = findNodeById(layerNodes, selectedId)
    if (!selectedNode) return

    // Find the parent of the selected node
    let parentNode: SVGNode | null = null
    const findParent = (nodes: SVGNode[], parent: SVGNode | null): boolean => {
      for (const node of nodes) {
        if (node.id === selectedId) {
          parentNode = parent
          return true
        }
        if (findParent(node.children, node)) return true
      }
      return false
    }
    findParent(layerNodes, null)

    if (!parentNode) {
      setStatusMessage('Cannot normalize: selected element has no parent')
      return
    }

    // Get the color attributes from the selected element
    const sourceEl = selectedNode.element
    const sourceFill = sourceEl.getAttribute('fill')
    const sourceStroke = sourceEl.getAttribute('stroke')
    const sourceStrokeWidth = sourceEl.getAttribute('stroke-width')
    const sourceOpacity = sourceEl.getAttribute('opacity')
    const sourceFillOpacity = sourceEl.getAttribute('fill-opacity')
    const sourceStrokeOpacity = sourceEl.getAttribute('stroke-opacity')

    let normalized = 0
    // Apply to all siblings (other children of the parent)
    const parent = parentNode as SVGNode
    for (const sibling of parent.children) {
      if (sibling.id === selectedId) continue // Skip the source element

      const el = sibling.element
      const tagName = el.tagName.toLowerCase()
      if (!DRAWABLE_ELEMENTS.includes(tagName)) continue

      // Apply the attributes
      if (sourceFill) el.setAttribute('fill', sourceFill)
      if (sourceStroke) el.setAttribute('stroke', sourceStroke)
      if (sourceStrokeWidth) el.setAttribute('stroke-width', sourceStrokeWidth)
      if (sourceOpacity) el.setAttribute('opacity', sourceOpacity)
      if (sourceFillOpacity) el.setAttribute('fill-opacity', sourceFillOpacity)
      if (sourceStrokeOpacity) el.setAttribute('stroke-opacity', sourceStrokeOpacity)

      normalized++
    }

    if (normalized > 0) {
      skipNextParse.current = true
      rebuildSvgFromLayers()
      setStatusMessage(`Normalized colors on ${normalized} sibling${normalized > 1 ? 's' : ''}`)
    } else {
      setStatusMessage('No sibling elements found to normalize')
    }
  }, [selectedNodeIds, layerNodes, rebuildSvgFromLayers, skipNextParse, setStatusMessage])

  // Separate compound paths into individual path elements
  const handleSeparateCompoundPaths = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      setStatusMessage('Select a path or group to separate')
      return
    }

    let totalSeparated = 0

    // Helper to process a single path element
    const processPath = (el: Element, nodeId: string): number => {
      if (!el.parentElement) {
        return 0
      }

      const subpathStrings = getSubpathsAsPathStrings(el)

      if (subpathStrings.length <= 1) {
        return 0 // Not a compound path
      }

      // Create a group to hold the separated paths
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('id', `${nodeId}-separated`)

      // Copy relevant attributes from original path
      const fill = el.getAttribute('fill')
      const stroke = el.getAttribute('stroke')
      const strokeWidth = el.getAttribute('stroke-width')
      const transform = el.getAttribute('transform')
      const opacity = el.getAttribute('opacity')

      // Create individual path elements for each subpath
      for (let i = 0; i < subpathStrings.length; i++) {
        const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        newPath.setAttribute('d', subpathStrings[i])
        newPath.setAttribute('id', `${nodeId}-part${i + 1}`)

        if (fill) newPath.setAttribute('fill', fill)
        if (stroke) newPath.setAttribute('stroke', stroke)
        if (strokeWidth) newPath.setAttribute('stroke-width', strokeWidth)
        if (opacity) newPath.setAttribute('opacity', opacity)

        group.appendChild(newPath)
      }

      if (transform) group.setAttribute('transform', transform)

      // Replace original element with group in the DOM
      const parent = el.parentElement!
      parent.replaceChild(group, el)
      return subpathStrings.length
    }

    // Helper to recursively find and process paths in a node
    const processNode = (node: SVGNode): number => {
      let count = 0
      const el = node.element
      const tagName = el.tagName.toLowerCase()

      if (tagName === 'path') {
        count += processPath(el, node.id)
      } else if (tagName === 'g' || node.children.length > 0) {
        for (const child of node.children) {
          count += processNode(child)
        }
      }
      return count
    }

    for (const nodeId of selectedNodeIds) {
      const node = findNodeById(layerNodes, nodeId)
      if (!node) continue
      totalSeparated += processNode(node)
    }

    if (totalSeparated > 0) {
      skipNextParse.current = false // Re-parse to update layer tree
      syncSvgContent()
      setStatusMessage(`Separated into ${totalSeparated} individual path${totalSeparated > 1 ? 's' : ''}`)
    } else {
      setStatusMessage('No compound paths found in selection (paths must have multiple subpaths)')
    }
  }, [selectedNodeIds, layerNodes, syncSvgContent, skipNextParse, setStatusMessage])

  return {
    handleConvertToFills,
    handleNormalizeColors,
    handleSeparateCompoundPaths,
  }
}
