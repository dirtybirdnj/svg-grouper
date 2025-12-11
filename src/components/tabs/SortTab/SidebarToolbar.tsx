// SidebarToolbar component - toolbar with sorting, grouping, and path manipulation actions

interface SidebarToolbarProps {
  // State
  showFilterToolbar: boolean
  weldArmed: boolean
  flattenArmed: boolean
  simplifyTolerance: number

  // Ability checks
  canSortBySize: boolean
  canGroupByColor: boolean
  canSimplify: boolean
  canWeld: boolean
  canFlipOrder: boolean
  hasLayerNodes: boolean

  // Handlers
  onToggleFilterToolbar: () => void
  onGroupByColor: () => void
  onSimplifyPaths: () => void
  onWeld: () => void
  onFlipOrder: () => void
  onFlattenAll: () => void
}

export default function SidebarToolbar({
  showFilterToolbar,
  weldArmed,
  flattenArmed,
  simplifyTolerance,
  canSortBySize,
  canGroupByColor,
  canSimplify,
  canWeld,
  canFlipOrder,
  hasLayerNodes,
  onToggleFilterToolbar,
  onGroupByColor,
  onSimplifyPaths,
  onWeld,
  onFlipOrder,
  onFlattenAll,
}: SidebarToolbarProps) {
  return (
    <div className="sidebar-actions">
      <button
        className={`action-button ${showFilterToolbar ? 'active' : ''}`}
        onClick={onToggleFilterToolbar}
        disabled={!canSortBySize}
      >
        ▼
      </button>
      <button
        className="action-button"
        onClick={onGroupByColor}
        disabled={!canGroupByColor}
        title="Group by Color (P) - Create subgroups for each color"
      >
        🎨
      </button>
      <button
        className="action-button"
        onClick={onSimplifyPaths}
        disabled={!canSimplify}
        title={`Simplify Paths - Reduce points (tolerance: ${simplifyTolerance})`}
      >
        ✂
      </button>
      <button
        className="action-button"
        onClick={onWeld}
        disabled={!canWeld}
        style={{
          background: weldArmed ? '#e74c3c' : undefined,
          color: weldArmed ? 'white' : undefined,
        }}
        title={weldArmed ? "Click again to confirm weld" : "Weld - Combine paths into compound path (reduces path count)"}
      >
        ⚡
      </button>
      <div className="toolbar-divider" />
      <button
        className="action-button"
        onClick={onFlipOrder}
        disabled={!canFlipOrder}
        title="Flip Order - Reverse order of selected items or children of selected group"
      >
        ⇅
      </button>
      <button
        className="action-button"
        onClick={onFlattenAll}
        disabled={!hasLayerNodes}
        style={{
          background: flattenArmed ? '#e74c3c' : undefined,
          color: flattenArmed ? 'white' : undefined,
        }}
        title={flattenArmed ? "Click again to confirm flatten" : "Flatten - Remove empty layers, ungroup all, group by color"}
      >
        🗄️
      </button>
    </div>
  )
}
