import { useEffect } from 'react'
import { SVGNode } from '../../../../types/svg'
import { findNodeById } from '../../../../utils/nodeUtils'

interface UseKeyboardShortcutsProps {
  selectedNodeIds: Set<string>
  layerNodes: SVGNode[]
  deleteArmed: boolean
  setDeleteArmed: (armed: boolean) => void
  splitArmed: boolean
  setSplitArmed: (armed: boolean) => void
  showFilterToolbar: boolean
  setShowFilterToolbar: (show: boolean) => void
  disarmActions: () => void
  handleToggleVisibility: () => void
  handleIsolate: () => void
  handleDeleteNode: () => void
  handleGroupUngroup: () => void
  canGroupByColor: () => boolean
  handleGroupByColor: () => void
  canSortBySize: () => boolean
}

export function useKeyboardShortcuts({
  selectedNodeIds,
  layerNodes,
  deleteArmed,
  setDeleteArmed,
  splitArmed,
  setSplitArmed,
  showFilterToolbar,
  setShowFilterToolbar,
  disarmActions,
  handleToggleVisibility,
  handleIsolate,
  handleDeleteNode,
  handleGroupUngroup,
  canGroupByColor,
  handleGroupByColor,
  canSortBySize,
}: UseKeyboardShortcutsProps) {

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.key === 'Escape') {
        disarmActions()
        return
      }

      const hasSelection = selectedNodeIds.size > 0

      switch (e.key.toLowerCase()) {
        case 'v':
          if (hasSelection) {
            e.preventDefault()
            handleToggleVisibility()
            disarmActions()
          }
          break
        case 'i':
          if (hasSelection) {
            e.preventDefault()
            handleIsolate()
            disarmActions()
          }
          break
        case 'd':
          if (hasSelection) {
            e.preventDefault()
            if (deleteArmed) {
              handleDeleteNode()
              setDeleteArmed(false)
            } else {
              setDeleteArmed(true)
              setSplitArmed(false)
            }
          }
          break
        case 'g':
          if (hasSelection) {
            e.preventDefault()
            if (selectedNodeIds.size === 1) {
              const selectedId = Array.from(selectedNodeIds)[0]
              const selectedNode = findNodeById(layerNodes, selectedId)

              if (selectedNode?.isGroup && selectedNode.children.length > 0) {
                if (splitArmed) {
                  handleGroupUngroup()
                  setSplitArmed(false)
                } else {
                  setSplitArmed(true)
                  setDeleteArmed(false)
                }
              }
            } else {
              handleGroupUngroup()
              disarmActions()
            }
          }
          break
        case 'p':
          if (canGroupByColor()) {
            e.preventDefault()
            handleGroupByColor()
            disarmActions()
          }
          break
        case 's':
          if (canSortBySize()) {
            e.preventDefault()
            setShowFilterToolbar(!showFilterToolbar)
            disarmActions()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    selectedNodeIds,
    layerNodes,
    deleteArmed,
    setDeleteArmed,
    splitArmed,
    setSplitArmed,
    showFilterToolbar,
    setShowFilterToolbar,
    disarmActions,
    handleToggleVisibility,
    handleIsolate,
    handleDeleteNode,
    handleGroupUngroup,
    canGroupByColor,
    handleGroupByColor,
    canSortBySize,
  ])
}
