import { useState, useCallback, useRef, ReactNode } from 'react'
import './LayerList.css'

export interface LayerListItem {
  id: string
  color?: string
  name?: string
}

interface LayerListProps<T extends LayerListItem> {
  items: T[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  renderItem: (item: T, isSelected: boolean) => ReactNode
  onReorder?: (fromIndex: number, toIndex: number) => void
  showToggleAll?: boolean
  onToggleAll?: (selectAll: boolean) => void
  emptyMessage?: string
  className?: string
  multiSelect?: boolean
}

export function LayerList<T extends LayerListItem>({
  items,
  selectedIds,
  onSelectionChange,
  renderItem,
  onReorder,
  showToggleAll = false,
  onToggleAll,
  emptyMessage = 'No items',
  className = '',
  multiSelect = true,
}: LayerListProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const lastSelectedRef = useRef<string | null>(null)

  const handleItemClick = useCallback((item: T, e: React.MouseEvent) => {
    const id = item.id

    if (multiSelect && (e.metaKey || e.ctrlKey)) {
      // Toggle selection
      const newSelection = new Set(selectedIds)
      if (newSelection.has(id)) {
        newSelection.delete(id)
      } else {
        newSelection.add(id)
      }
      onSelectionChange(newSelection)
      lastSelectedRef.current = id
    } else if (multiSelect && e.shiftKey && lastSelectedRef.current) {
      // Range selection
      const lastIndex = items.findIndex(i => i.id === lastSelectedRef.current)
      const currentIndex = items.findIndex(i => i.id === id)
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = items.slice(start, end + 1).map(i => i.id)
        onSelectionChange(new Set(rangeIds))
      }
    } else {
      // Single selection
      onSelectionChange(new Set([id]))
      lastSelectedRef.current = id
    }
  }, [items, selectedIds, onSelectionChange, multiSelect])

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    if (!onReorder) return
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [onReorder])

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    if (!onReorder || draggedIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [onReorder, draggedIndex])

  const handleDragEnd = useCallback(() => {
    if (onReorder && draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      onReorder(draggedIndex, dragOverIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [onReorder, draggedIndex, dragOverIndex])

  const handleToggleAll = useCallback((selectAll: boolean) => {
    if (onToggleAll) {
      onToggleAll(selectAll)
    } else {
      if (selectAll) {
        onSelectionChange(new Set(items.map(i => i.id)))
      } else {
        onSelectionChange(new Set())
      }
    }
  }, [items, onSelectionChange, onToggleAll])

  if (items.length === 0) {
    return (
      <div className={`layer-list empty ${className}`}>
        <div className="layer-list-empty">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className={`layer-list ${className}`}>
      {showToggleAll && (
        <div className="layer-list-controls">
          <button
            className="layer-list-btn"
            onClick={() => handleToggleAll(true)}
            disabled={selectedIds.size === items.length}
          >
            All
          </button>
          <button
            className="layer-list-btn"
            onClick={() => handleToggleAll(false)}
            disabled={selectedIds.size === 0}
          >
            None
          </button>
        </div>
      )}
      <div className="layer-list-items">
        {items.map((item, index) => {
          const isSelected = selectedIds.has(item.id)
          const isDragging = draggedIndex === index
          const isDragOver = dragOverIndex === index && draggedIndex !== index

          return (
            <div
              key={item.id}
              className={`layer-list-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
              onClick={(e) => handleItemClick(item, e)}
              draggable={!!onReorder}
              onDragStart={(e) => handleDragStart(index, e)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => setDragOverIndex(null)}
            >
              {renderItem(item, isSelected)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Pre-built item renderers for common use cases

interface ColorLayerItemProps {
  color: string
  name: string
  count?: number
  countLabel?: string
  badge?: ReactNode
  showCheckbox?: boolean
  checked?: boolean
  onCheckChange?: (checked: boolean) => void
}

export function ColorLayerItem({
  color,
  name,
  count,
  countLabel = 'items',
  badge,
  showCheckbox = false,
  checked = false,
  onCheckChange,
}: ColorLayerItemProps) {
  return (
    <div className="color-layer-item">
      {showCheckbox && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            e.stopPropagation()
            onCheckChange?.(e.target.checked)
          }}
          onClick={(e) => e.stopPropagation()}
          className="layer-checkbox"
        />
      )}
      <span
        className="layer-color-swatch"
        style={{ backgroundColor: color }}
      />
      <span className="layer-name">{name}</span>
      {badge && <span className="layer-badge">{badge}</span>}
      {count !== undefined && (
        <span className="layer-count">{count} {countLabel}</span>
      )}
    </div>
  )
}

export default LayerList
