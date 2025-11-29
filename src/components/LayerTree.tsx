import { useState, useRef, useEffect } from 'react'
import { SVGNode } from '../types/svg'
import { extractColors, normalizeColor } from '../utils/colorExtractor'
import './LayerTree.css'

// Color picker popup component
interface ColorPickerPopupProps {
  color: string
  position: { x: number; y: number }
  onColorChange: (newColor: string, mode: 'fill' | 'stroke', strokeWidth?: string) => void
  onClose: () => void
  initialMode?: 'fill' | 'stroke'
  initialStrokeWidth?: string
}

function ColorPickerPopup({ color, position, onColorChange, onClose, initialMode = 'fill', initialStrokeWidth = '1' }: ColorPickerPopupProps) {
  const [currentColor, setCurrentColor] = useState(normalizeColor(color))
  const [hexInput, setHexInput] = useState(normalizeColor(color))
  const [mode, setMode] = useState<'fill' | 'stroke'>(initialMode)
  const [strokeWidth, setStrokeWidth] = useState(initialStrokeWidth)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setCurrentColor(newColor)
    setHexInput(newColor)
  }

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setHexInput(value)
    // Only update color if it's a valid hex
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setCurrentColor(value)
    }
  }

  const handleApply = () => {
    onColorChange(currentColor, mode, mode === 'stroke' ? strokeWidth : undefined)
    onClose()
  }

  return (
    <div
      ref={popupRef}
      className="color-picker-popup"
      style={{ left: position.x, top: position.y }}
    >
      <div className="color-picker-header">
        <span>Edit Layer</span>
        <button className="color-picker-close" onClick={onClose}>×</button>
      </div>
      <div className="color-picker-content">
        {/* Fill/Stroke toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-toggle-btn ${mode === 'fill' ? 'active' : ''}`}
            onClick={() => setMode('fill')}
          >
            Fill
          </button>
          <button
            className={`mode-toggle-btn ${mode === 'stroke' ? 'active' : ''}`}
            onClick={() => setMode('stroke')}
          >
            Stroke
          </button>
        </div>

        <input
          type="color"
          value={currentColor}
          onChange={handleColorPickerChange}
          className="color-picker-input"
        />
        <div className="color-picker-hex-row">
          <input
            type="text"
            value={hexInput}
            onChange={handleHexInputChange}
            className="color-picker-hex-input"
            placeholder="#000000"
          />
        </div>

        {/* Stroke width controls - only show when stroke mode */}
        {mode === 'stroke' && (
          <div className="stroke-width-controls">
            <label className="stroke-width-label">Stroke Width</label>
            <div className="stroke-width-row">
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(e.target.value)}
                className="stroke-width-slider"
              />
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(e.target.value)}
                className="stroke-width-input"
              />
            </div>
          </div>
        )}

        <div className="color-picker-preview">
          <span
            className="color-preview-swatch"
            style={{
              backgroundColor: mode === 'fill' ? currentColor : 'transparent',
              border: mode === 'stroke' ? `${Math.min(parseFloat(strokeWidth), 4)}px solid ${currentColor}` : 'none'
            }}
          />
          <span className="color-preview-label">
            {currentColor} {mode === 'stroke' && `(${strokeWidth}px)`}
          </span>
        </div>
        <button className="color-picker-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  )
}

// Helper to check if an element has fill or stroke
function checkElementType(elem: Element): { hasFill: boolean; hasStroke: boolean } {
  const fill = elem.getAttribute('fill')
  const stroke = elem.getAttribute('stroke')
  const style = elem.getAttribute('style') || ''

  let hasFill = !!(fill && fill !== 'none' && fill !== 'transparent')
  let hasStroke = !!(stroke && stroke !== 'none' && stroke !== 'transparent')

  // Check style attribute
  if (style.includes('fill:')) {
    const fillMatch = style.match(/fill:\s*([^;]+)/)
    if (fillMatch && fillMatch[1].trim() !== 'none' && fillMatch[1].trim() !== 'transparent') {
      hasFill = true
    }
  }
  if (style.includes('stroke:')) {
    const strokeMatch = style.match(/stroke:\s*([^;]+)/)
    if (strokeMatch && strokeMatch[1].trim() !== 'none' && strokeMatch[1].trim() !== 'transparent') {
      hasStroke = true
    }
  }

  return { hasFill, hasStroke }
}

// Helper to determine if a path element is fill-based or stroke-based
function getPathType(node: SVGNode): 'fill' | 'stroke' {
  if (node.isGroup) return 'stroke'
  // If node has customMarkup (line fill applied), it's a fill type
  if (node.customMarkup) return 'fill'
  const { hasFill } = checkElementType(node.element)
  // If has fill (and possibly stroke), consider it a fill path
  if (hasFill) return 'fill'
  return 'stroke'
}

// Helper to determine group type: 'fill', 'stroke', or 'mixed'
function getGroupType(node: SVGNode): 'fill' | 'stroke' | 'mixed' | null {
  if (!node.isGroup) return null

  let hasAnyFills = false
  let hasAnyStrokes = false

  const checkNode = (n: SVGNode) => {
    // customMarkup indicates line fill was applied - count as fill
    if (n.customMarkup) {
      hasAnyFills = true
    } else {
      const result = checkElementType(n.element)
      if (result.hasFill) hasAnyFills = true
      if (result.hasStroke && !result.hasFill) hasAnyStrokes = true
    }
    n.children.forEach(checkNode)
  }

  node.children.forEach(checkNode)

  if (hasAnyFills && hasAnyStrokes) return 'mixed'
  if (hasAnyFills) return 'fill'
  if (hasAnyStrokes) return 'stroke'
  return 'stroke' // default to stroke if unclear
}

// Helper to get path info for display (points, start/end)
function getPathInfo(node: SVGNode): { pointCount: number; startPos: { x: number; y: number }; endPos: { x: number; y: number } } | null {
  if (node.isGroup) return null

  const element = node.element
  const tagName = element.tagName.toLowerCase()

  let pointCount = 0
  let startPos = { x: 0, y: 0 }
  let endPos = { x: 0, y: 0 }

  const parseCoordPair = (match: string): { x: number; y: number } | null => {
    const parsed = match.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/)
    if (parsed) {
      return { x: parseFloat(parsed[1]), y: parseFloat(parsed[2]) }
    }
    return null
  }

  if (tagName === 'path') {
    const d = element.getAttribute('d') || ''
    const coordMatches = d.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    if (coordMatches) {
      pointCount = coordMatches.length
      const first = parseCoordPair(coordMatches[0])
      const last = parseCoordPair(coordMatches[coordMatches.length - 1])
      if (first) startPos = first
      if (last) endPos = last
    }
  } else if (tagName === 'line') {
    pointCount = 2
    startPos = {
      x: parseFloat(element.getAttribute('x1') || '0'),
      y: parseFloat(element.getAttribute('y1') || '0')
    }
    endPos = {
      x: parseFloat(element.getAttribute('x2') || '0'),
      y: parseFloat(element.getAttribute('y2') || '0')
    }
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const points = element.getAttribute('points') || ''
    const coordMatches = points.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/g)
    if (coordMatches) {
      pointCount = coordMatches.length
      const first = parseCoordPair(coordMatches[0])
      const last = parseCoordPair(coordMatches[coordMatches.length - 1])
      if (first) startPos = first
      if (last) endPos = last
    }
  } else if (tagName === 'rect') {
    pointCount = 4
    startPos = {
      x: parseFloat(element.getAttribute('x') || '0'),
      y: parseFloat(element.getAttribute('y') || '0')
    }
    endPos = startPos
  } else if (tagName === 'circle' || tagName === 'ellipse') {
    pointCount = 1
    startPos = {
      x: parseFloat(element.getAttribute('cx') || '0'),
      y: parseFloat(element.getAttribute('cy') || '0')
    }
    endPos = startPos
  }

  return { pointCount, startPos, endPos }
}

// Drop position indicator
type DropPosition = 'before' | 'after' | 'inside' | null

interface DragState {
  draggedNodeId: string | null
  dropTargetId: string | null
  dropPosition: DropPosition
}

interface LayerTreeProps {
  nodes: SVGNode[]
  selectedNodeIds?: Set<string>
  onNodeSelect?: (node: SVGNode, isMultiSelect: boolean, isRangeSelect: boolean) => void
  processingStates?: Record<string, 'pending' | 'processing' | 'complete'>
  onColorChange?: (nodeId: string, oldColor: string, newColor: string, mode?: 'fill' | 'stroke', strokeWidth?: string) => void
  onReorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void
  onPathHover?: (pathId: string | null) => void
  onPathClick?: (pathId: string) => void
}

interface LayerNodeProps {
  node: SVGNode
  level: number
  selectedNodeIds?: Set<string>
  onNodeSelect?: (node: SVGNode, isMultiSelect: boolean, isRangeSelect: boolean) => void
  processingStates?: Record<string, 'pending' | 'processing' | 'complete'>
  onColorChange?: (nodeId: string, oldColor: string, newColor: string, mode?: 'fill' | 'stroke', strokeWidth?: string) => void
  dragState: DragState
  onDragStart: (nodeId: string) => void
  onDragOver: (e: React.DragEvent, nodeId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, nodeId: string) => void
  onDragEnd: () => void
  onPathHover?: (pathId: string | null) => void
  onPathClick?: (pathId: string) => void
}

function LayerNode({
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

  // Determine group type and icon class
  const groupType = getGroupType(node)
  const pathType = !node.isGroup ? getPathType(node) : null
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
          {node.children.map(child => (
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

export default function LayerTree({ nodes, selectedNodeIds, onNodeSelect, processingStates, onColorChange, onReorder, onPathHover, onPathClick }: LayerTreeProps) {
  const [dragState, setDragState] = useState<DragState>({
    draggedNodeId: null,
    dropTargetId: null,
    dropPosition: null
  })

  const handleDragStart = (nodeId: string) => {
    setDragState(prev => ({ ...prev, draggedNodeId: nodeId }))
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!dragState.draggedNodeId || dragState.draggedNodeId === targetId) return

    // Determine drop position based on mouse position within the element
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height

    let position: DropPosition
    if (y < height * 0.25) {
      position = 'before'
    } else if (y > height * 0.75) {
      position = 'after'
    } else {
      position = 'inside'
    }

    setDragState(prev => ({
      ...prev,
      dropTargetId: targetId,
      dropPosition: position
    }))
  }

  const handleDragLeave = () => {
    // Small delay to prevent flickering when moving between elements
    setTimeout(() => {
      setDragState(prev => ({
        ...prev,
        dropTargetId: null,
        dropPosition: null
      }))
    }, 50)
  }

  const handleDrop = (_e: React.DragEvent, targetId: string) => {
    if (!dragState.draggedNodeId || !dragState.dropPosition) return

    // Don't allow dropping onto itself
    if (dragState.draggedNodeId === targetId) {
      setDragState({ draggedNodeId: null, dropTargetId: null, dropPosition: null })
      return
    }

    // Call the reorder handler
    if (onReorder) {
      onReorder(dragState.draggedNodeId, targetId, dragState.dropPosition)
    }

    setDragState({ draggedNodeId: null, dropTargetId: null, dropPosition: null })
  }

  const handleDragEnd = () => {
    setDragState({ draggedNodeId: null, dropTargetId: null, dropPosition: null })
  }

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
          onColorChange={onColorChange}
          dragState={dragState}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onPathHover={onPathHover}
          onPathClick={onPathClick}
        />
      ))}
    </div>
  )
}
