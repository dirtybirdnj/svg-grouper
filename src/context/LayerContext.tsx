// Layer Context - Layer tree and selection state

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'
import { SVGNode } from '../types/svg'

/**
 * Build an index of all nodes in the tree for O(1) lookups
 */
function buildNodeIndex(nodes: SVGNode[]): Map<string, SVGNode> {
  const index = new Map<string, SVGNode>()
  const addToIndex = (nodeList: SVGNode[]) => {
    for (const node of nodeList) {
      index.set(node.id, node)
      if (node.children.length > 0) {
        addToIndex(node.children)
      }
    }
  }
  addToIndex(nodes)
  return index
}

interface LayerContextType {
  // Layer state
  layerNodes: SVGNode[]
  setLayerNodes: (nodes: SVGNode[]) => void

  // O(1) lookup of node by ID - uses cached index
  getNodeById: (id: string) => SVGNode | undefined

  // Selection state
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  lastSelectedNodeId: string | null
  setLastSelectedNodeId: (id: string | null) => void
}

const LayerContext = createContext<LayerContextType | null>(null)

export function LayerProvider({ children }: { children: ReactNode }) {
  // Layer state
  const [layerNodes, setLayerNodes] = useState<SVGNode[]>([])

  // Node index for O(1) lookups - rebuilt when layerNodes changes
  const nodeIndex = useMemo(() => buildNodeIndex(layerNodes), [layerNodes])

  // O(1) node lookup function
  const getNodeById = useCallback((id: string): SVGNode | undefined => {
    return nodeIndex.get(id)
  }, [nodeIndex])

  // Selection state
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [lastSelectedNodeId, setLastSelectedNodeId] = useState<string | null>(null)

  const value: LayerContextType = {
    layerNodes,
    setLayerNodes,
    getNodeById,
    selectedNodeIds,
    setSelectedNodeIds,
    lastSelectedNodeId,
    setLastSelectedNodeId,
  }

  return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>
}

export function useLayerContext() {
  const context = useContext(LayerContext)
  if (!context) {
    throw new Error('useLayerContext must be used within a LayerProvider')
  }
  return context
}
