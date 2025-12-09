import { useState, useCallback, useRef } from 'react'

interface UseLayerSelectionOptions<T> {
  items: T[]
  getItemId: (item: T) => string
  initialSelection?: Set<string>
  multiSelect?: boolean
  onSelectionChange?: (selectedIds: Set<string>) => void
}

interface UseLayerSelectionReturn {
  selectedIds: Set<string>
  setSelectedIds: (ids: Set<string>) => void
  handleItemClick: (id: string, e: React.MouseEvent) => void
  handleToggleItem: (id: string) => void
  selectAll: () => void
  selectNone: () => void
  isSelected: (id: string) => boolean
  selectedCount: number
}

/**
 * Hook for managing layer/item selection with support for:
 * - Single click selection
 * - Cmd/Ctrl+click toggle
 * - Shift+click range selection
 * - Select all / select none
 *
 * Usage:
 * ```tsx
 * const { selectedIds, handleItemClick, selectAll, selectNone } = useLayerSelection({
 *   items: layers,
 *   getItemId: (layer) => layer.id,
 * })
 * ```
 */
export function useLayerSelection<T>(options: UseLayerSelectionOptions<T>): UseLayerSelectionReturn {
  const {
    items,
    getItemId,
    initialSelection = new Set<string>(),
    multiSelect = true,
    onSelectionChange,
  } = options

  const [selectedIds, setSelectedIdsInternal] = useState<Set<string>>(initialSelection)
  const lastSelectedRef = useRef<string | null>(null)

  const setSelectedIds = useCallback((ids: Set<string>) => {
    setSelectedIdsInternal(ids)
    onSelectionChange?.(ids)
  }, [onSelectionChange])

  const handleItemClick = useCallback((id: string, e: React.MouseEvent) => {
    if (multiSelect && (e.metaKey || e.ctrlKey)) {
      // Toggle selection
      const newSelection = new Set(selectedIds)
      if (newSelection.has(id)) {
        newSelection.delete(id)
      } else {
        newSelection.add(id)
      }
      setSelectedIds(newSelection)
      lastSelectedRef.current = id
    } else if (multiSelect && e.shiftKey && lastSelectedRef.current) {
      // Range selection
      const lastIndex = items.findIndex(item => getItemId(item) === lastSelectedRef.current)
      const currentIndex = items.findIndex(item => getItemId(item) === id)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = items.slice(start, end + 1).map(getItemId)
        setSelectedIds(new Set(rangeIds))
      }
    } else {
      // Single selection
      setSelectedIds(new Set([id]))
      lastSelectedRef.current = id
    }
  }, [items, getItemId, selectedIds, setSelectedIds, multiSelect])

  const handleToggleItem = useCallback((id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }, [selectedIds, setSelectedIds])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(getItemId)))
  }, [items, getItemId, setSelectedIds])

  const selectNone = useCallback(() => {
    setSelectedIds(new Set())
  }, [setSelectedIds])

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id)
  }, [selectedIds])

  return {
    selectedIds,
    setSelectedIds,
    handleItemClick,
    handleToggleItem,
    selectAll,
    selectNone,
    isSelected,
    selectedCount: selectedIds.size,
  }
}

export default useLayerSelection
