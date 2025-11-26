export type TabKey = 'sort' | 'fill' | 'export'

export interface TabDefinition {
  key: TabKey
  label: string
  icon?: string
}

export const TABS: TabDefinition[] = [
  { key: 'sort', label: 'Sort', icon: '📑' },
  { key: 'fill', label: 'Fill', icon: '▤' },
  { key: 'export', label: 'Export', icon: '💾' },
]
