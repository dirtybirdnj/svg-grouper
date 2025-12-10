import { useState, useCallback, useRef } from 'react'
import { LayerListItem, DropPosition, DragState, DisplayMode } from '../types'

interface UseDragDropOptions<T extends LayerListItem> {
  items: T[]  // Reserved for future virtualization
  mode: DisplayMode
  enabled: boolean
  onReorder?: (fromId: string, toId: string, position: DropPosition) => void
  onReorderFlat?: (fromIndex: number, toIndex: number) => void
}

export function useDragDrop<T extends LayerListItem>({
  items: _items,  // Reserved for future virtualization
  mode,
  enabled,
  onReorder,
  onReorderFlat,
}: UseDragDropOptions<T>) {
  const [dragState, setDragState] = useState<DragState>({
    draggedId: null,
    dropTargetId: null,
    dropPosition: null,
  })

  const draggedIndexRef = useRef<number | null>(null)

  const handleDragStart = useCallback(
    (item: T, index: number, e: React.DragEvent) => {
      if (!enabled) return

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', item.id)

      setDragState({
        draggedId: item.id,
        dropTargetId: null,
        dropPosition: null,
      })
      draggedIndexRef.current = index

      // Add a slight delay for visual feedback
      requestAnimationFrame(() => {
        const target = e.target as HTMLElement
        target.classList.add('dragging')
      })
    },
    [enabled]
  )

  const handleDragOver = useCallback(
    (item: T, _index: number, e: React.DragEvent) => {
      if (!enabled || dragState.draggedId === null) return
      if (dragState.draggedId === item.id) return

      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      // Calculate drop position based on mouse position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height

      let position: DropPosition

      if (mode === 'tree' && item.isGroup) {
        // For groups in tree mode, allow before/inside/after
        if (y < height * 0.25) {
          position = 'before'
        } else if (y > height * 0.75) {
          position = 'after'
        } else {
          position = 'inside'
        }
      } else {
        // For non-groups or flat mode, just before/after
        position = y < height / 2 ? 'before' : 'after'
      }

      setDragState((prev) => ({
        ...prev,
        dropTargetId: item.id,
        dropPosition: position,
      }))
    },
    [enabled, dragState.draggedId, mode]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear if leaving the item entirely (not entering a child)
      const relatedTarget = e.relatedTarget as HTMLElement
      const currentTarget = e.currentTarget as HTMLElement

      if (!currentTarget.contains(relatedTarget)) {
        setDragState((prev) => ({
          ...prev,
          dropTargetId: null,
          dropPosition: null,
        }))
      }
    },
    []
  )

  const handleDrop = useCallback(
    (item: T, index: number, e: React.DragEvent) => {
      e.preventDefault()

      if (!enabled) return
      if (dragState.draggedId === null) return
      if (dragState.draggedId === item.id) return

      const { dropPosition } = dragState

      if (mode === 'flat' && onReorderFlat && draggedIndexRef.current !== null) {
        // Flat mode: use index-based reorder
        let targetIndex = index
        if (dropPosition === 'after') {
          targetIndex = index + 1
        }
        // Adjust if dragging from before the target
        if (draggedIndexRef.current < targetIndex) {
          targetIndex -= 1
        }
        if (draggedIndexRef.current !== targetIndex) {
          onReorderFlat(draggedIndexRef.current, targetIndex)
        }
      } else if (mode === 'tree' && onReorder && dropPosition) {
        // Tree mode: use id-based reorder with position
        onReorder(dragState.draggedId, item.id, dropPosition)
      }

      // Reset drag state
      setDragState({
        draggedId: null,
        dropTargetId: null,
        dropPosition: null,
      })
      draggedIndexRef.current = null
    },
    [enabled, dragState, mode, onReorder, onReorderFlat]
  )

  const handleDragEnd = useCallback(() => {
    setDragState({
      draggedId: null,
      dropTargetId: null,
      dropPosition: null,
    })
    draggedIndexRef.current = null

    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach((el) => {
      el.classList.remove('dragging')
    })
  }, [])

  const getDragProps = useCallback(
    (item: T, index: number) => {
      if (!enabled) return {}

      return {
        draggable: true,
        onDragStart: (e: React.DragEvent) => handleDragStart(item, index, e),
        onDragOver: (e: React.DragEvent) => handleDragOver(item, index, e),
        onDragLeave: handleDragLeave,
        onDrop: (e: React.DragEvent) => handleDrop(item, index, e),
        onDragEnd: handleDragEnd,
      }
    },
    [enabled, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd]
  )

  const isDragging = (itemId: string) => dragState.draggedId === itemId
  const isDragOver = (itemId: string) => dragState.dropTargetId === itemId
  const getDropPosition = (itemId: string) =>
    dragState.dropTargetId === itemId ? dragState.dropPosition : null

  return {
    dragState,
    getDragProps,
    isDragging,
    isDragOver,
    getDropPosition,
    handleDragEnd,
  }
}

export default useDragDrop
