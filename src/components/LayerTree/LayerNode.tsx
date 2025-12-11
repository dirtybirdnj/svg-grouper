import { useState } from 'react'
import { extractColors, normalizeColor } from '../../utils/colorExtractor'
import { LayerNodeProps } from './types'
import { ColorPickerPopup } from './ColorPickerPopup'
import { getGroupType, getPathType, getPathInfo, countElements } from './nodeUtils'

export function LayerNode({
  node,
  level,
  selectedNodeIds,
  onNodeSelect,
  processingStates,
  onColorChange,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onPathHover,
  onPathClick
}: LayerNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false) // Start collapsed
  const [colorPickerState, setColorPickerState] = useState<{
    color: string
    position: { x: number; y: number }
    mode: 'fill' | 'stroke'
    strokeWidth: string
  } | null>(null)
  const [copiedColor, setCopiedColor] = useState<string | null>(null)
  const hasChildren = node.children.length > 0
  const isSelected = selectedNodeIds?.has(node.id) || false

  // Drag state for this node
  const isDragging = dragState.draggedNodeId === node.id
  const isDropTarget = dragState.dropTargetId === node.id
  const dropPosition = isDropTarget ? dragState.dropPosition : null

  // Get processing state
  const nodeId = node.element?.id || node.name
  const processingState = processingStates?.[nodeId]

  // Count elements (-1 to exclude the group itself)
  const elementCount = hasChildren ? countElements(node) - 1 : 0

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleClick = (e: React.MouseEvent) => {
    const isMultiSelect = e.ctrlKey || e.metaKey
    const isRangeSelect = e.shiftKey
    onNodeSelect?.(node, isMultiSelect, isRangeSelect)
    // Trigger path click for highlight if not a group
    if (!node.isGroup && onPathClick) {
      onPathClick(node.id)
    }
  }

  // Handle mouse enter for non-group nodes
  const handleMouseEnter = () => {
    if (!node.isGroup && onPathHover) {
      onPathHover(node.id)
    }
  }

  // Handle mouse leave for non-group nodes
  const handleMouseLeave = () => {
    if (!node.isGroup && onPathHover) {
      onPathHover(null)
    }
  }

  const getIcon = () => {
    if (node.isGroup) return 'G'
    // For paths, return empty - we'll use CSS shapes instead
    return ''
  }

  // Handle single click on swatch - copy to clipboard
  const handleSwatchClick = (e: React.MouseEvent, color: string) => {
    e.stopPropagation()
    const hexColor = normalizeColor(color)
    navigator.clipboard.writeText(hexColor).then(() => {
      setCopiedColor(hexColor)
      setTimeout(() => setCopiedColor(null), 1500)
    })
  }

  // Determine group type and icon class
  const groupType = getGroupType(node)
  const pathType = !node.isGroup ? getPathType(node) : null

  // Handle double click on swatch - open color picker
  const handleSwatchDoubleClick = (e: React.MouseEvent, color: string) => {
    e.stopPropagation()
    const rect = (e.target as HTMLElement).getBoundingClientRect()

    // Determine initial mode based on node type
    const initialMode: 'fill' | 'stroke' = pathType === 'stroke' ? 'stroke' : 'fill'

    // Get current stroke width from element
    let currentStrokeWidth = '1'
    if (!node.isGroup) {
      const sw = node.element.getAttribute('stroke-width')
      const style = node.element.getAttribute('style') || ''
      if (sw) {
        currentStrokeWidth = sw
      } else if (style.includes('stroke-width:')) {
        const match = style.match(/stroke-width:\s*([^;]+)/)
        if (match) currentStrokeWidth = match[1].trim()
      }
    }

    setColorPickerState({
      color,
      position: { x: rect.left, y: rect.bottom + 4 },
      mode: initialMode,
      strokeWidth: currentStrokeWidth
    })
  }

  const handleColorChange = (newColor: string, mode: 'fill' | 'stroke', strokeWidth?: string) => {
    if (colorPickerState && onColorChange) {
      // Pass the mode and strokeWidth info - the parent will need to handle this
      onColorChange(node.id, colorPickerState.color, newColor, mode, strokeWidth)
    }
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
    onDragStart(node.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragOver(e, node.id)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    onDragLeave()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDrop(e, node.id)
  }

  const iconClass = node.isGroup
    ? groupType === 'fill'
      ? 'group-fill'
      : groupType === 'mixed'
        ? 'group-mixed'
        : 'group-stroke'
    : pathType === 'fill'
      ? 'path-fill'
      : 'path-stroke'

  const colors = extractColors(node)

  // For non-group nodes, only show F label for fills (no P for paths)
  const swatchLabel = !node.isGroup && pathType === 'fill' ? 'F' : null

  // Get path info for non-group nodes
  const pathInfo = !node.isGroup ? getPathInfo(node) : null

  // Build class names for drag state
  const dragClasses = [
    isDragging ? 'dragging' : '',
    dropPosition === 'before' ? 'drop-before' : '',
    dropPosition === 'after' ? 'drop-after' : '',
    dropPosition === 'inside' ? 'drop-inside' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`layer-node ${dragClasses}`}>
      <div
        className={`layer-node-content ${isSelected ? 'selected' : ''} ${node.isHidden ? 'hidden' : ''} ${processingState ? `processing-${processingState}` : ''} ${groupType === 'mixed' ? 'mixed-group' : ''}`}
        style={{ paddingLeft: `${level * 1.5}rem` }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={onDragEnd}
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
        {pathInfo && (
          <span className="path-info-compact">
            {pathInfo.pointCount} {Math.round(pathInfo.startPos.x)},{Math.round(pathInfo.startPos.y)}-{Math.round(pathInfo.endPos.x)},{Math.round(pathInfo.endPos.y)}
          </span>
        )}
        {colors.length > 0 && (
          <div className="color-swatches">
            {colors.map((color, index) => {
              const hexColor = normalizeColor(color)
              const isCopied = copiedColor === hexColor
              return (
                <span
                  key={index}
                  className={`color-swatch ${swatchLabel ? 'with-label' : ''} ${isCopied ? 'copied' : ''}`}
                  style={{ backgroundColor: hexColor }}
                  title={isCopied ? 'Copied!' : `${color} - Click to copy, double-click to edit`}
                  onClick={(e) => handleSwatchClick(e, color)}
                  onDoubleClick={(e) => handleSwatchDoubleClick(e, color)}
                >
                  {isCopied ? '✓' : swatchLabel}
                </span>
              )
            })}
          </div>
        )}
      </div>
      {colorPickerState && (
        <ColorPickerPopup
          color={colorPickerState.color}
          position={colorPickerState.position}
          onColorChange={handleColorChange}
          onClose={() => setColorPickerState(null)}
          initialMode={colorPickerState.mode}
          initialStrokeWidth={colorPickerState.strokeWidth}
        />
      )}
      {hasChildren && isExpanded && (
        <div className="layer-children">
          {/* Reverse order: last in DOM = visually on top = shown first */}
          {[...node.children].reverse().map(child => (
            <LayerNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeIds={selectedNodeIds}
              onNodeSelect={onNodeSelect}
              processingStates={processingStates}
              onColorChange={onColorChange}
              dragState={dragState}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onPathHover={onPathHover}
              onPathClick={onPathClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
