export type TabKey = 'sort' | 'merge' | 'fill' | 'order' | 'export'

export interface TabDefinition {
  key: TabKey
  label: string
  icon?: string
}

export const TABS: TabDefinition[] = [
  { key: 'sort', label: 'Sort', icon: '📑' },
  { key: 'merge', label: 'Merge', icon: '⊕' },
  { key: 'fill', label: 'Fill', icon: '▤' },
  { key: 'order', label: 'Order', icon: '🔀' },
  { key: 'export', label: 'Export', icon: '💾' },
]
