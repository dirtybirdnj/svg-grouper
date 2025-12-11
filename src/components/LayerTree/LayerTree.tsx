import { useState } from 'react'
import { LayerTreeProps, DragState, DropPosition } from './types'
import { LayerNode } from './LayerNode'
import '../LayerTree.css'

export default function LayerTree({
  nodes,
  selectedNodeIds,
  onNodeSelect,
  processingStates,
  onColorChange,
  onReorder,
  onPathHover,
  onPathClick
}: LayerTreeProps) {
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
      {/* Reverse order: last in DOM = visually on top = shown first */}
      {[...nodes].reverse().map(node => (
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
