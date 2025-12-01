import { SVGNode } from '../types/svg'

/**
 * Find a node by ID in the tree
 */
export function findNodeById(nodes: SVGNode[], id: string): SVGNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found) return found
  }
  return null
}

/**
 * Find the parent of a node by ID
 */
export function findParentNode(nodes: SVGNode[], id: string, parent: SVGNode | null = null): SVGNode | null {
  for (const node of nodes) {
    if (node.id === id) return parent
    const found = findParentNode(node.children, id, node)
    if (found !== undefined) return found
  }
  return null
}

/**
 * Update a node by ID using an updater function
 */
export function updateNodeById(
  nodes: SVGNode[],
  id: string,
  updater: (node: SVGNode) => SVGNode
): SVGNode[] {
  return nodes.map(node => {
    if (node.id === id) {
      return updater(node)
    }
    if (node.children.length > 0) {
      return { ...node, children: updateNodeById(node.children, id, updater) }
    }
    return node
  })
}

/**
 * Update children of a node by ID
 */
export function updateNodeChildren(
  nodes: SVGNode[],
  id: string,
  newChildren: SVGNode[]
): SVGNode[] {
  return nodes.map(node => {
    if (node.id === id) {
      return { ...node, children: newChildren }
    }
    if (node.children.length > 0) {
      return { ...node, children: updateNodeChildren(node.children, id, newChildren) }
    }
    return node
  })
}

/**
 * Remove a node by ID from the tree
 */
export function removeNodeById(nodes: SVGNode[], id: string): SVGNode[] {
  return nodes
    .filter(node => node.id !== id)
    .map(node => ({
      ...node,
      children: removeNodeById(node.children, id)
    }))
}

/**
 * Remove multiple nodes by IDs from the tree
 */
export function removeNodesByIds(nodes: SVGNode[], ids: Set<string>): SVGNode[] {
  return nodes
    .filter(node => !ids.has(node.id))
    .map(node => ({
      ...node,
      children: node.children.length > 0 ? removeNodesByIds(node.children, ids) : node.children
    }))
}

/**
 * Insert a node at a position relative to a target node
 */
export function insertNodeAtPosition(
  nodes: SVGNode[],
  targetId: string,
  nodeToInsert: SVGNode,
  position: 'before' | 'after' | 'inside'
): SVGNode[] {
  const result: SVGNode[] = []
  for (const node of nodes) {
    if (node.id === targetId) {
      if (position === 'before') {
        result.push(nodeToInsert)
        result.push(node)
      } else if (position === 'after') {
        result.push(node)
        result.push(nodeToInsert)
      } else if (position === 'inside') {
        result.push({
          ...node,
          children: [nodeToInsert, ...node.children]
        })
      }
    } else {
      result.push({
        ...node,
        children: insertNodeAtPosition(node.children, targetId, nodeToInsert, position)
      })
    }
  }
  return result
}

/**
 * Traverse all nodes in the tree, calling callback for each
 */
export function traverseNodes(nodes: SVGNode[], callback: (node: SVGNode) => void): void {
  for (const node of nodes) {
    callback(node)
    traverseNodes(node.children, callback)
  }
}

/**
 * Traverse nodes and collect results using a mapper function
 */
export function mapNodes<T>(nodes: SVGNode[], mapper: (node: SVGNode) => T | null): T[] {
  const results: T[] = []
  traverseNodes(nodes, node => {
    const result = mapper(node)
    if (result !== null) results.push(result)
  })
  return results
}

/**
 * Find siblings of two nodes (returns their parent's children array if both are siblings)
 */
export function findSiblings(nodes: SVGNode[], id1: string, id2: string): SVGNode[] | null {
  const hasNode1 = nodes.some(n => n.id === id1)
  const hasNode2 = nodes.some(n => n.id === id2)

  if (hasNode1 && hasNode2) {
    return nodes
  }

  for (const node of nodes) {
    if (node.children.length > 0) {
      const result = findSiblings(node.children, id1, id2)
      if (result) return result
    }
  }

  return null
}

/**
 * Check if a node is a descendant of another node
 */
export function isDescendant(parentNode: SVGNode, childId: string): boolean {
  if (parentNode.id === childId) return true
  return parentNode.children.some(child => isDescendant(child, childId))
}

/**
 * Count all leaf nodes (non-groups) in the tree
 */
export function countLeafNodes(nodes: SVGNode[]): number {
  let count = 0
  traverseNodes(nodes, node => {
    if (!node.isGroup) count++
  })
  return count
}

/**
 * Collect all leaf nodes from the tree
 */
export function collectLeafNodes(nodes: SVGNode[]): SVGNode[] {
  return mapNodes(nodes, node => node.isGroup ? null : node)
}

/**
 * Update visibility of a node and all its children
 */
export function setNodeVisibility(node: SVGNode, hidden: boolean): SVGNode {
  return {
    ...node,
    isHidden: hidden,
    children: node.children.map(child => setNodeVisibility(child, hidden))
  }
}

/**
 * Apply visibility update to selected nodes in the tree
 */
export function updateVisibilityForSelected(
  nodes: SVGNode[],
  selectedIds: Set<string>,
  hidden: boolean
): SVGNode[] {
  return nodes.map(node => {
    if (selectedIds.has(node.id)) {
      return setNodeVisibility(node, hidden)
    }
    if (node.children.length > 0) {
      return { ...node, children: updateVisibilityForSelected(node.children, selectedIds, hidden) }
    }
    return node
  })
}

/**
 * Show all nodes in the tree
 */
export function showAllNodes(nodes: SVGNode[]): SVGNode[] {
  return nodes.map(node => ({
    ...node,
    isHidden: false,
    children: showAllNodes(node.children)
  }))
}

/**
 * Isolate selected nodes (hide all except selected and their children)
 */
export function isolateNodes(
  nodes: SVGNode[],
  selectedIds: Set<string>,
  parentSelected: boolean = false
): SVGNode[] {
  return nodes.map(node => {
    const isSelected = selectedIds.has(node.id)
    const shouldBeVisible = isSelected || parentSelected
    return {
      ...node,
      isHidden: !shouldBeVisible,
      children: isolateNodes(node.children, selectedIds, shouldBeVisible)
    }
  })
}
