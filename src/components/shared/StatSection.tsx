import { ReactNode } from 'react'
import './StatSection.css'

interface StatRowProps {
  label: string
  value: ReactNode
  highlight?: boolean
  className?: string
}

export function StatRow({ label, value, highlight = false, className = '' }: StatRowProps) {
  return (
    <div className={`stat-row ${highlight ? 'highlight' : ''} ${className}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}

interface StatSectionProps {
  title?: string
  children: ReactNode
  className?: string
}

export function StatSection({
  title,
  children,
  className = '',
}: StatSectionProps) {
  return (
    <div className={`stat-section ${className}`}>
      {title && <h3 className="stat-section-title">{title}</h3>}
      <div className="stat-section-content">
        {children}
      </div>
    </div>
  )
}

interface StatGridProps {
  children: ReactNode
  columns?: 2 | 3 | 4
  className?: string
}

export function StatGrid({ children, columns = 2, className = '' }: StatGridProps) {
  return (
    <div className={`stat-grid columns-${columns} ${className}`}>
      {children}
    </div>
  )
}

export default StatSection
