import { useState } from 'react'
import { SVGNode } from '../types/svg'
import './LayerTree.css'

interface LayerTreeProps {
  nodes: SVGNode[]
  selectedNodeId?: string | null
  onNodeSelect?: (node: SVGNode) => void
}

interface LayerNodeProps {
  node: SVGNode
  level: number
  selectedNodeId?: string | null
  onNodeSelect?: (node: SVGNode) => void
}

function LayerNode({ node, level, selectedNodeId, onNodeSelect }: LayerNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false) // Start collapsed
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedNodeId

  // Count total elements in this node (including nested children)
  const countElements = (n: SVGNode): number => {
    return 1 + n.children.reduce((sum, child) => sum + countElements(child), 0)
  }
  const elementCount = hasChildren ? countElements(node) - 1 : 0 // -1 to exclude the group itself

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleClick = () => {
    onNodeSelect?.(node)
  }

  const getIcon = () => {
    if (node.isGroup) return '📁'
    switch (node.type) {
      case 'path': return '✏️'
      case 'rect': return '▭'
      case 'circle': return '●'
      case 'ellipse': return '⬭'
      case 'line': return '─'
      case 'polyline': return '〰️'
      case 'polygon': return '⬡'
      case 'text': return '📝'
      case 'image': return '🖼️'
      default: return '○'
    }
  }

  return (
    <div className="layer-node">
      <div
        className={`layer-node-content ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 1.5}rem` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <button
            className={`expand-button ${isExpanded ? 'expanded' : ''}`}
            onClick={handleToggle}
          >
            ▶
          </button>
        )}
        {!hasChildren && <span className="expand-spacer" />}
        <span className="layer-icon">{getIcon()}</span>
        <span className="layer-name">{node.name}</span>
        {hasChildren && elementCount > 0 && (
          <span className="element-count">({elementCount})</span>
        )}
        <span className="layer-type">{node.type}</span>
      </div>
      {hasChildren && isExpanded && (
        <div className="layer-children">
          {node.children.map(child => (
            <LayerNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function LayerTree({ nodes, selectedNodeId, onNodeSelect }: LayerTreeProps) {
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
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
        />
      ))}
    </div>
  )
}
