# Unified Layer List Component Plan

## Problem Statement

Currently, the Sort, Merge, and Fill tabs each implement their own layer/shape list UI with:
- Different data structures and state management
- Different selection behaviors
- Different display formats
- Different interaction patterns

This leads to:
- Code duplication (~300-500 lines per tab)
- Inconsistent UX across tabs
- Difficulty maintaining feature parity
- Potential for divergent behavior bugs

## Current Implementations

### SortTab Layer List
- Shows hierarchical SVGNode tree
- Supports drag-drop reordering
- Multi-select with Cmd/Shift
- Shows: name, path count, bounding box
- Selection stored in: `selectedNodeIds` (global context)
- Actions: visibility toggle, group/ungroup, delete

### MergeTab Shape List
- Flattens to PolygonData[] (no hierarchy)
- Shows only filled shapes
- Click to toggle selection
- Shows: name, color swatch, vertex count, touch badges
- Selection stored in: `selectedForMerge` (local state)
- Actions: merge operations

### FillTab Layer List
- Shows hierarchical SVGNode tree
- Multi-select for batch fill operations
- Shows: name, fill status indicator
- Selection stored in: `selectedNodeIds` (global context)
- Actions: apply fill pattern

## Proposed Unified Component

### Core Component: `<UnifiedLayerList>`

```tsx
interface UnifiedLayerListProps {
  // Data
  nodes: SVGNode[]

  // Display mode
  mode: 'tree' | 'flat'  // hierarchical vs flattened
  filter?: (node: SVGNode) => boolean  // e.g., only filled shapes

  // Selection
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  selectionMode: 'single' | 'multi' | 'multi-with-modifiers'

  // Optional features (enable via props)
  enableDragDrop?: boolean
  enableVisibilityToggle?: boolean
  enableContextMenu?: boolean

  // Item rendering customization
  renderBadges?: (node: SVGNode) => React.ReactNode
  renderActions?: (node: SVGNode) => React.ReactNode
  getItemClassName?: (node: SVGNode) => string

  // Callbacks
  onNodeClick?: (node: SVGNode, event: React.MouseEvent) => void
  onNodeDoubleClick?: (node: SVGNode) => void
  onNodesReorder?: (newOrder: SVGNode[]) => void
}
```

### Supporting Types

```tsx
interface LayerListItem {
  id: string
  name: string
  type: 'group' | 'path' | 'shape' | 'polygon'
  depth: number  // for indentation
  isExpanded?: boolean
  isVisible?: boolean

  // Optional metadata
  color?: string
  pathCount?: number
  vertexCount?: number
  boundingBox?: { x: number; y: number; width: number; height: number }

  // For merge tab
  touchCount?: number
  isMergeable?: boolean
  subpathCount?: number

  // For fill tab
  hasFill?: boolean
  fillPattern?: string

  // Reference to original
  node: SVGNode
}
```

### Feature Matrix

| Feature | Sort | Merge | Fill |
|---------|------|-------|------|
| Tree view | Yes | No | Yes |
| Flat view | No | Yes | Optional |
| Drag-drop | Yes | No | No |
| Multi-select | Yes | Yes | Yes |
| Color swatch | Optional | Yes | Optional |
| Visibility toggle | Yes | No | No |
| Touch indicators | No | Yes | No |
| Fill status | No | No | Yes |
| Compound badge | No | Yes | Optional |
| Context menu | Yes | No | No |

## Implementation Plan

### Phase 1: Create Base Component
1. Create `src/components/shared/UnifiedLayerList/`
   - `UnifiedLayerList.tsx` - main component
   - `LayerListItem.tsx` - single item renderer
   - `UnifiedLayerList.css` - shared styles
   - `types.ts` - TypeScript interfaces
   - `hooks.ts` - selection, drag-drop hooks

2. Implement core functionality:
   - Tree rendering with expand/collapse
   - Flat list rendering
   - Basic selection (single, multi)
   - Keyboard navigation

### Phase 2: Selection System
1. Create `useLayerSelection` hook (consolidate existing):
   - Handle Cmd+Click (toggle)
   - Handle Shift+Click (range)
   - Handle click (replace)
   - Keyboard: arrows, space, enter

2. Support both local and global selection state:
   ```tsx
   // Can use global context
   const { selectedNodeIds, setSelectedNodeIds } = useAppContext()
   <UnifiedLayerList
     selectedIds={selectedNodeIds}
     onSelectionChange={setSelectedNodeIds}
   />

   // Or local state
   const [selected, setSelected] = useState(new Set())
   <UnifiedLayerList
     selectedIds={selected}
     onSelectionChange={setSelected}
   />
   ```

### Phase 3: Feature Plugins
1. Drag-drop plugin (for Sort):
   ```tsx
   <UnifiedLayerList
     enableDragDrop
     onNodesReorder={handleReorder}
   />
   ```

2. Visibility plugin (for Sort):
   ```tsx
   <UnifiedLayerList
     enableVisibilityToggle
     renderActions={(node) => <VisibilityToggle node={node} />}
   />
   ```

3. Badge system (customizable per-tab):
   ```tsx
   <UnifiedLayerList
     renderBadges={(node) => (
       <>
         {node.subpathCount > 1 && <CompoundBadge count={node.subpathCount} />}
         {node.touchCount > 0 && <TouchBadge count={node.touchCount} />}
       </>
     )}
   />
   ```

### Phase 4: Migrate Tabs
1. **SortTab**: Replace custom list with UnifiedLayerList
   - Enable: tree mode, drag-drop, visibility toggle, context menu
   - Custom badges: path count, bbox

2. **MergeTab**: Replace shape list with UnifiedLayerList
   - Enable: flat mode, multi-select
   - Custom badges: color swatch, touch count, compound indicator
   - Filter: only filled shapes

3. **FillTab**: Replace layer list with UnifiedLayerList
   - Enable: tree mode, multi-select
   - Custom badges: fill status indicator

### Phase 5: Sync & Polish
1. Ensure selection syncs across tabs where appropriate
2. Add animations for expand/collapse
3. Add virtualization for large lists (>100 items)
4. Accessibility improvements (ARIA, keyboard nav)

## File Structure

```
src/components/shared/UnifiedLayerList/
├── index.ts                 # exports
├── UnifiedLayerList.tsx     # main component
├── LayerListItem.tsx        # item renderer
├── TreeView.tsx             # hierarchical rendering
├── FlatView.tsx             # flat list rendering
├── UnifiedLayerList.css     # styles
├── types.ts                 # interfaces
├── hooks/
│   ├── useLayerSelection.ts # selection logic
│   ├── useDragDrop.ts       # drag-drop logic
│   └── useKeyboardNav.ts    # keyboard navigation
└── badges/
    ├── ColorSwatch.tsx
    ├── CompoundBadge.tsx
    ├── TouchBadge.tsx
    └── FillStatusBadge.tsx
```

## Migration Strategy

1. Build UnifiedLayerList alongside existing implementations
2. Add feature flag to switch between old/new per tab
3. Migrate one tab at a time, starting with simplest (Fill)
4. Run both implementations in parallel for testing
5. Remove old implementations once stable

## Benefits

- **Single source of truth**: All tabs share same rendering logic
- **Consistent UX**: Selection, keyboard nav work the same everywhere
- **Easier maintenance**: Fix once, fix everywhere
- **Feature sharing**: New badges/features available to all tabs
- **Testing**: One component to test thoroughly
- **Performance**: Virtualization benefits all tabs

## Estimated Effort

- Phase 1 (Base): 4-6 hours
- Phase 2 (Selection): 2-3 hours
- Phase 3 (Plugins): 3-4 hours
- Phase 4 (Migration): 4-6 hours per tab
- Phase 5 (Polish): 2-4 hours

Total: ~20-30 hours of focused development

## Notes

- Keep existing implementations working during migration
- Consider backwards compatibility for any saved state
- Document the new component API thoroughly
- Add Storybook stories for visual testing of all modes
