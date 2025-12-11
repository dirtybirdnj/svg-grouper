import { ReactNode } from 'react'

// Re-export ColorSwatch from shared (avoid duplication)
// Use: import { ColorSwatch } from '../shared' in your components

// Inline Color Swatch (simpler version for list items)
interface InlineSwatchProps {
  color: string
  size?: number
  onClick?: (e: React.MouseEvent) => void
  title?: string
}

export function InlineSwatch({ color, size = 16, onClick, title }: InlineSwatchProps) {
  return (
    <span
      className="item-color-swatch"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
      title={title || color}
    />
  )
}

// Count Badge (generic)
interface CountBadgeProps {
  count: number
  label?: string
  icon?: ReactNode
  title?: string
  highlight?: boolean
}

export function CountBadge({ count, label, icon, title, highlight }: CountBadgeProps) {
  return (
    <span
      className={`count-badge ${highlight ? 'highlight' : ''}`}
      title={title}
    >
      {icon && <span className="badge-icon">{icon}</span>}
      {count}
      {label && <span className="badge-label"> {label}</span>}
    </span>
  )
}

// Touch Badge (for merge tab - shows adjacent shapes)
interface TouchBadgeProps {
  count: number
  title?: string
}

export function TouchBadge({ count, title }: TouchBadgeProps) {
  if (count === 0) return null

  return (
    <span
      className="touch-badge"
      title={title || `Touches ${count} other shape${count > 1 ? 's' : ''}`}
    >
      ⟷{count}
    </span>
  )
}

// Compound Badge (for paths with multiple subpaths)
interface CompoundBadgeProps {
  subpathCount: number
  title?: string
}

export function CompoundBadge({ subpathCount, title }: CompoundBadgeProps) {
  if (subpathCount <= 1) return null

  return (
    <span
      className="compound-badge"
      title={title || `Compound path: ${subpathCount} subpaths`}
    >
      ◈{subpathCount}
    </span>
  )
}

// Holes Badge (for shapes with holes)
interface HolesBadgeProps {
  holeCount: number
  title?: string
}

export function HolesBadge({ holeCount, title }: HolesBadgeProps) {
  if (holeCount === 0) return null

  return (
    <span
      className="count-badge"
      title={title || `${holeCount} hole${holeCount > 1 ? 's' : ''}`}
    >
      ◯{holeCount}
    </span>
  )
}

// Status Badge (processing states)
interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'complete' | 'error'
  title?: string
}

export function StatusBadge({ status, title }: StatusBadgeProps) {
  const titles = {
    pending: 'Pending',
    processing: 'Processing...',
    complete: 'Complete',
    error: 'Error',
  }

  return (
    <span
      className={`status-badge ${status}`}
      title={title || titles[status]}
    />
  )
}

// Fill Status Badge (for fill tab)
interface FillStatusBadgeProps {
  hasFill: boolean
  pattern?: string
}

export function FillStatusBadge({ hasFill, pattern }: FillStatusBadgeProps) {
  return (
    <span
      className={`count-badge ${hasFill ? 'highlight' : ''}`}
      title={hasFill ? `Filled with ${pattern || 'pattern'}` : 'No fill'}
    >
      {hasFill ? '✓' : '○'}
    </span>
  )
}

// Point Count Badge
interface PointCountBadgeProps {
  count: number
  label?: string
}

export function PointCountBadge({ count, label = 'pts' }: PointCountBadgeProps) {
  return (
    <span className="count-badge" title={`${count} points`}>
      {count} {label}
    </span>
  )
}

// Vertex Count Badge (alias for MergeTab compatibility)
export const VertexCountBadge = PointCountBadge

// Checkbox indicator (for merge tab style selection)
interface CheckboxIndicatorProps {
  checked: boolean
}

export function CheckboxIndicator({ checked }: CheckboxIndicatorProps) {
  return (
    <span className="item-checkbox">
      {checked ? '✓' : ''}
    </span>
  )
}

// Fill Readiness Badge (for merge tab - shows if shape is ready for filling)
export type FillReadinessStatus = 'ready' | 'warning' | 'issue'

interface FillReadinessBadgeProps {
  status: FillReadinessStatus
  message?: string
}

export function FillReadinessBadge({ status, message }: FillReadinessBadgeProps) {
  const icons = {
    ready: '✓',
    warning: '⚠',
    issue: '✗',
  }

  const defaultMessages = {
    ready: 'Ready for fill',
    warning: 'May cause fill issues',
    issue: 'Needs attention before fill',
  }

  return (
    <span
      className={`fill-readiness-badge ${status}`}
      title={message || defaultMessages[status]}
    >
      {icons[status]}
    </span>
  )
}
