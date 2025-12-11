import { SVGNode } from '../../types/svg'

// Drop position indicator
export type DropPosition = 'before' | 'after' | 'inside' | null

export interface DragState {
  draggedNodeId: string | null
  dropTargetId: string | null
  dropPosition: DropPosition
}

export interface LayerTreeProps {
  nodes: SVGNode[]
  selectedNodeIds?: Set<string>
  onNodeSelect?: (node: SVGNode, isMultiSelect: boolean, isRangeSelect: boolean) => void
  processingStates?: Record<string, 'pending' | 'processing' | 'complete'>
  onColorChange?: (nodeId: string, oldColor: string, newColor: string, mode?: 'fill' | 'stroke', strokeWidth?: string) => void
  onReorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void
  onPathHover?: (pathId: string | null) => void
  onPathClick?: (pathId: string) => void
}

export interface LayerNodeProps {
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

export interface ColorPickerPopupProps {
  color: string
  position: { x: number; y: number }
  onColorChange: (newColor: string, mode: 'fill' | 'stroke', strokeWidth?: string) => void
  onClose: () => void
  initialMode?: 'fill' | 'stroke'
  initialStrokeWidth?: string
}
