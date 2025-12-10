import { useMemo, useCallback, useState } from 'react'
import {
  LayerListItem,
  UnifiedLayerListProps,
  ItemRenderState,
} from './types'
import { useLayerSelection, useDragDrop } from './hooks'
import './UnifiedLayerList.css'

// Helper to flatten tree items for selection range calculation
function flattenItems<T extends LayerListItem>(
  items: T[],
  expandedIds?: Set<string>
): T[] {
  const result: T[] = []

  const traverse = (items: T[], depth: number) => {
    for (const item of items) {
      result.push({ ...item, depth } as T)

      // Only traverse children if expanded (or if expandedIds not provided)
      if (
        item.children &&
        item.children.length > 0 &&
        (!expandedIds || expandedIds.has(item.id))
      ) {
        traverse(item.children as T[], depth + 1)
      }
    }
  }

  traverse(items, 0)
  return result
}

export function UnifiedLayerList<T extends LayerListItem>({
  items,
  mode = 'flat',
  filter,
  selectedIds,
  onSelectionChange,
  selectionMode = 'multi-with-modifiers',
  enableDragDrop = false,
  enableVisibilityToggle = false,
  enableExpandCollapse = true,
  showToggleAll = false,
  renderItem,
  renderBadges,
  renderActions,
  getItemClassName,
  onItemClick,
  onItemDoubleClick,
  onItemHover,
  onToggleExpand,
  onToggleVisibility,
  onReorder,
  onReorderFlat,
  emptyMessage = 'No items',
  className = '',
  itemClassName = '',
  maxHeight,
}: UnifiedLayerListProps<T>) {
  // Track expanded state for tree mode (internal state, can be controlled via callbacks)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  // Apply filter if provided
  const filteredItems = useMemo(() => {
    if (!filter) return items
    return items.filter(filter)
  }, [items, filter])

  // Flatten items for display (tree mode) or use as-is (flat mode)
  const displayItems = useMemo(() => {
    if (mode === 'flat') {
      return filteredItems.map((item) => ({
        ...item,
        depth: item.depth ?? 0,
      }))
    }

    // Tree mode: flatten with depth tracking
    return flattenItems(filteredItems, expandedIds)
  }, [filteredItems, mode, expandedIds])

  // Selection hook
  const {
    handleSelect,
    selectAll,
    selectNone,
    isAllSelected,
    isNoneSelected,
  } = useLayerSelection({
    items: filteredItems,
    selectedIds,
    onSelectionChange,
    selectionMode,
    flattenedItems: displayItems,
  })

  // Drag-drop hook
  const { getDragProps, isDragging, isDragOver, getDropPosition } = useDragDrop({
    items: displayItems,
    mode,
    enabled: enableDragDrop,
    onReorder,
    onReorderFlat,
  })

  // Handle expand/collapse
  const handleToggleExpand = useCallback(
    (itemId: string, e: React.MouseEvent) => {
      e.stopPropagation()

      const isCurrentlyExpanded = expandedIds.has(itemId)

      setExpandedIds((prev) => {
        const newExpanded = new Set(prev)
        if (isCurrentlyExpanded) {
          newExpanded.delete(itemId)
        } else {
          newExpanded.add(itemId)
        }
        return newExpanded
      })

      // Also call external callback if provided
      onToggleExpand?.(itemId, !isCurrentlyExpanded)
    },
    [expandedIds, onToggleExpand]
  )

  // Handle visibility toggle
  const handleVisibilityToggle = useCallback(
    (itemId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const item = displayItems.find((i) => i.id === itemId)
      if (item) {
        onToggleVisibility?.(itemId, !item.isVisible)
      }
    },
    [displayItems, onToggleVisibility]
  )

  // Handle item click
  const handleItemClick = useCallback(
    (item: T, e: React.MouseEvent) => {
      handleSelect(item, e)
      onItemClick?.(item, e)
    },
    [handleSelect, onItemClick]
  )

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, item: T, index: number) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (index < displayItems.length - 1) {
            const nextItem = displayItems[index + 1]
            handleSelect(nextItem, e as unknown as React.MouseEvent)
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (index > 0) {
            const prevItem = displayItems[index - 1]
            handleSelect(prevItem, e as unknown as React.MouseEvent)
          }
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          handleSelect(item, e as unknown as React.MouseEvent)
          break
        case 'ArrowRight':
          // Expand in tree mode
          if (mode === 'tree' && item.children?.length && !expandedIds.has(item.id)) {
            setExpandedIds((prev) => new Set([...prev, item.id]))
          }
          break
        case 'ArrowLeft':
          // Collapse in tree mode
          if (mode === 'tree' && expandedIds.has(item.id)) {
            setExpandedIds((prev) => {
              const next = new Set(prev)
              next.delete(item.id)
              return next
            })
          }
          break
      }
    },
    [displayItems, handleSelect, mode, expandedIds]
  )

  // Default item renderer
  const defaultRenderItem = useCallback(
    (item: T, state: ItemRenderState) => (
      <div className="layer-item-content">
        {/* Expand/collapse for tree mode */}
        {mode === 'tree' && item.children && item.children.length > 0 && enableExpandCollapse && (
          <button
            className={`expand-btn ${state.isExpanded ? 'expanded' : ''}`}
            onClick={(e) => handleToggleExpand(item.id, e)}
          >
            ▶
          </button>
        )}

        {/* Visibility toggle */}
        {enableVisibilityToggle && (
          <button
            className={`visibility-btn ${state.isVisible ? 'visible' : 'hidden'}`}
            onClick={(e) => handleVisibilityToggle(item.id, e)}
            title={state.isVisible ? 'Hide' : 'Show'}
          >
            {state.isVisible ? '👁' : '👁‍🗨'}
          </button>
        )}

        {/* Color swatch */}
        {item.color && (
          <span
            className="item-color-swatch"
            style={{ backgroundColor: item.color }}
          />
        )}

        {/* Name */}
        <span className="item-name">{item.name || item.id}</span>

        {/* Custom badges */}
        {renderBadges && (
          <span className="item-badges">{renderBadges(item)}</span>
        )}

        {/* Custom actions */}
        {renderActions && (
          <span className="item-actions">{renderActions(item)}</span>
        )}
      </div>
    ),
    [mode, enableExpandCollapse, enableVisibilityToggle, renderBadges, renderActions, handleToggleExpand, handleVisibilityToggle]
  )

  // Empty state
  if (displayItems.length === 0) {
    return (
      <div className={`unified-layer-list empty ${className}`}>
        <div className="layer-list-empty">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div
      className={`unified-layer-list ${mode}-mode ${className}`}
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      role="listbox"
      aria-label="Layer list"
      aria-multiselectable={selectionMode !== 'single'}
    >
      {/* Toggle all controls */}
      {showToggleAll && (
        <div className="layer-list-controls">
          <button
            className="layer-list-btn"
            onClick={selectAll}
            disabled={isAllSelected}
          >
            All
          </button>
          <button
            className="layer-list-btn"
            onClick={selectNone}
            disabled={isNoneSelected}
          >
            None
          </button>
        </div>
      )}

      {/* Item list */}
      <div className="layer-list-items">
        {displayItems.map((item, index) => {
          const state: ItemRenderState = {
            isSelected: selectedIds.has(item.id),
            isExpanded: expandedIds.has(item.id),
            isVisible: item.isVisible !== false,
            isDragging: isDragging(item.id),
            isDragOver: isDragOver(item.id),
            dropPosition: getDropPosition(item.id),
            depth: item.depth ?? 0,
          }

          const itemClasses = [
            'layer-list-item',
            itemClassName,
            state.isSelected ? 'selected' : '',
            state.isDragging ? 'dragging' : '',
            state.isDragOver ? 'drag-over' : '',
            state.dropPosition ? `drop-${state.dropPosition}` : '',
            item.isGroup ? 'is-group' : '',
            getItemClassName?.(item, state) ?? '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <div
              key={item.id}
              className={itemClasses}
              style={
                mode === 'tree'
                  ? { paddingLeft: `${(state.depth + 1) * 16}px` }
                  : undefined
              }
              role="option"
              aria-selected={state.isSelected}
              tabIndex={state.isSelected ? 0 : -1}
              onClick={(e) => handleItemClick(item, e)}
              onDoubleClick={() => onItemDoubleClick?.(item)}
              onKeyDown={(e) => handleKeyDown(e, item, index)}
              onMouseEnter={() => onItemHover?.(item)}
              onMouseLeave={() => onItemHover?.(null)}
              {...getDragProps(item, index)}
            >
              {renderItem
                ? renderItem(item, state)
                : defaultRenderItem(item, state)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default UnifiedLayerList
