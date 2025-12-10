import { useCallback, useRef } from 'react'
import { LayerListItem, SelectionMode } from '../types'

interface UseLayerSelectionOptions<T extends LayerListItem> {
  items: T[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  selectionMode: SelectionMode
  // For tree mode - flatten items to get correct range selection
  flattenedItems?: T[]
}

export function useLayerSelection<T extends LayerListItem>({
  items,
  selectedIds,
  onSelectionChange,
  selectionMode,
  flattenedItems,
}: UseLayerSelectionOptions<T>) {
  const lastSelectedRef = useRef<string | null>(null)

  // Get the list to use for range selection (flattened for tree mode)
  const itemsForRange = flattenedItems || items

  const handleSelect = useCallback(
    (item: T, event: React.MouseEvent) => {
      const id = item.id

      if (selectionMode === 'single') {
        // Single selection - always replace
        onSelectionChange(new Set([id]))
        lastSelectedRef.current = id
        return
      }

      if (selectionMode === 'multi') {
        // Multi without modifiers - toggle
        const newSelection = new Set(selectedIds)
        if (newSelection.has(id)) {
          newSelection.delete(id)
        } else {
          newSelection.add(id)
        }
        onSelectionChange(newSelection)
        lastSelectedRef.current = id
        return
      }

      // multi-with-modifiers
      if (event.metaKey || event.ctrlKey) {
        // Cmd/Ctrl + Click: Toggle individual item
        const newSelection = new Set(selectedIds)
        if (newSelection.has(id)) {
          newSelection.delete(id)
        } else {
          newSelection.add(id)
        }
        onSelectionChange(newSelection)
        lastSelectedRef.current = id
      } else if (event.shiftKey && lastSelectedRef.current) {
        // Shift + Click: Range selection
        const lastIndex = itemsForRange.findIndex(
          (i) => i.id === lastSelectedRef.current
        )
        const currentIndex = itemsForRange.findIndex((i) => i.id === id)

        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex)
          const end = Math.max(lastIndex, currentIndex)
          const rangeIds = itemsForRange.slice(start, end + 1).map((i) => i.id)
          onSelectionChange(new Set(rangeIds))
        } else {
          // Fallback to single selection
          onSelectionChange(new Set([id]))
          lastSelectedRef.current = id
        }
      } else {
        // Plain click: Replace selection
        onSelectionChange(new Set([id]))
        lastSelectedRef.current = id
      }
    },
    [itemsForRange, selectedIds, onSelectionChange, selectionMode]
  )

  const selectAll = useCallback(() => {
    const allIds = itemsForRange.map((i) => i.id)
    onSelectionChange(new Set(allIds))
  }, [itemsForRange, onSelectionChange])

  const selectNone = useCallback(() => {
    onSelectionChange(new Set())
  }, [onSelectionChange])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === itemsForRange.length) {
      selectNone()
    } else {
      selectAll()
    }
  }, [selectedIds.size, itemsForRange.length, selectAll, selectNone])

  const isAllSelected = selectedIds.size === itemsForRange.length && itemsForRange.length > 0
  const isNoneSelected = selectedIds.size === 0
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < itemsForRange.length

  return {
    handleSelect,
    selectAll,
    selectNone,
    toggleSelectAll,
    isAllSelected,
    isNoneSelected,
    isSomeSelected,
    lastSelectedId: lastSelectedRef.current,
  }
}

export default useLayerSelection
