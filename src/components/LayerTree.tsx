import { useState } from 'react'
import { SVGNode } from '../types/svg'
import { extractColors, normalizeColor } from '../utils/colorExtractor'
import './LayerTree.css'

// Helper to determine group type: 'fill', 'stroke', or 'mixed'
function getGroupType(node: SVGNode): 'fill' | 'stroke' | 'mixed' | null {
  if (!node.isGroup) return null

  const checkElement = (elem: Element): { hasFill: boolean; hasStroke: boolean } => {
    const fill = elem.getAttribute('fill')
    const stroke = elem.getAttribute('stroke')
    const style = elem.getAttribute('style') || ''

    let hasFill = !!(fill && fill !== 'none')
    let hasStroke = !!(stroke && stroke !== 'none')

    // Check style attribute
    if (style.includes('fill:')) {
      const fillMatch = style.match(/fill:\s*([^;]+)/)
      if (fillMatch && fillMatch[1].trim() !== 'none') {
        hasFill = true
      }
    }
    if (style.includes('stroke:')) {
      const strokeMatch = style.match(/stroke:\s*([^;]+)/)
      if (strokeMatch && strokeMatch[1].trim() !== 'none') {
        hasStroke = true
      }
    }

    return { hasFill, hasStroke }
  }

  let hasAnyFills = false
  let hasAnyStrokes = false

  const checkNode = (n: SVGNode) => {
    const result = checkElement(n.element)
    if (result.hasFill && !result.hasStroke) hasAnyFills = true
    if (result.hasStroke && !result.hasFill) hasAnyStrokes = true
    n.children.forEach(checkNode)
  }

  node.children.forEach(checkNode)

  if (hasAnyFills && hasAnyStrokes) return 'mixed'
  if (hasAnyFills) return 'fill'
  if (hasAnyStrokes) return 'stroke'
  return 'stroke' // default to stroke if unclear
}

interface LayerTreeProps {
  nodes: SVGNode[]
  selectedNodeIds?: Set<string>
  onNodeSelect?: (node: SVGNode, isMultiSelect: boolean, isRangeSelect: boolean) => void
  processingStates?: Record<string, 'pending' | 'processing' | 'complete'>
}

interface LayerNodeProps {
  node: SVGNode
  level: number
  selectedNodeIds?: Set<string>
  onNodeSelect?: (node: SVGNode, isMultiSelect: boolean, isRangeSelect: boolean) => void
  processingStates?: Record<string, 'pending' | 'processing' | 'complete'>
}

function LayerNode({ node, level, selectedNodeIds, onNodeSelect, processingStates }: LayerNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false) // Start collapsed
  const hasChildren = node.children.length > 0
  const isSelected = selectedNodeIds?.has(node.id) || false

  // Get processing state
  const nodeId = node.element?.id || node.name
  const processingState = processingStates?.[nodeId]

  // Count total elements in this node (including nested children)
  const countElements = (n: SVGNode): number => {
    return 1 + n.children.reduce((sum, child) => sum + countElements(child), 0)
  }
  const elementCount = hasChildren ? countElements(node) - 1 : 0 // -1 to exclude the group itself

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleClick = (e: React.MouseEvent) => {
    const isMultiSelect = e.ctrlKey || e.metaKey
    const isRangeSelect = e.shiftKey
    onNodeSelect?.(node, isMultiSelect, isRangeSelect)
  }

  const getIcon = () => {
    return node.isGroup ? 'G' : 'P'
  }

  // Determine group type and icon class
  const groupType = getGroupType(node)
  const iconClass = node.isGroup
    ? groupType === 'fill'
      ? 'group-fill'
      : groupType === 'mixed'
        ? 'group-mixed'
        : 'group-stroke'
    : 'path'

  const colors = extractColors(node)

  return (
    <div className="layer-node">
      <div
        className={`layer-node-content ${isSelected ? 'selected' : ''} ${node.isHidden ? 'hidden' : ''} ${processingState ? `processing-${processingState}` : ''}`}
        style={{ paddingLeft: `${level * 1.5}rem` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <span
            className={`layer-icon ${iconClass} ${isExpanded ? 'expanded' : ''}`}
            onClick={handleToggle}
          >
            {getIcon()}
          </span>
        ) : (
          <span className={`layer-icon ${iconClass}`}>{getIcon()}</span>
        )}
        <span className="layer-name">{node.name}</span>
        {hasChildren && elementCount > 0 && (
          <span className="element-count">({elementCount})</span>
        )}
        {colors.length > 0 && (
          <div className="color-swatches">
            {colors.map((color, index) => (
              <span
                key={index}
                className="color-swatch"
                style={{ backgroundColor: normalizeColor(color) }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div className="layer-children">
          {node.children.map(child => (
            <LayerNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeIds={selectedNodeIds}
              onNodeSelect={onNodeSelect}
              processingStates={processingStates}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function LayerTree({ nodes, selectedNodeIds, onNodeSelect, processingStates }: LayerTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="layer-tree-empty">
        <p>No layers found</p>
      </div>
    )
  }

  return (
    <div className="layer-tree">
      {nodes.map(node => (
        <LayerNode
          key={node.id}
          node={node}
          level={0}
          selectedNodeIds={selectedNodeIds}
          onNodeSelect={onNodeSelect}
          processingStates={processingStates}
        />
      ))}
    </div>
  )
}
