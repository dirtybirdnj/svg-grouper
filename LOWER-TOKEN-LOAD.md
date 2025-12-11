# Lower Token Load: Modularization Plan

## Overview

This document outlines a plan to refactor large files into smaller, focused modules. This enables:
- **Parallel agent work** - Multiple agents can work on different modules simultaneously
- **Lower context requirements** - Agents only need to read relevant modules
- **Better maintainability** - Smaller files are easier to understand and modify
- **Faster iteration** - Changes are isolated to specific modules

---

## Current State Analysis

### Largest Files (Lines of Code)

| File | Lines | Status |
|------|-------|--------|
| `SortTab.tsx` | 3,146 | 🔴 Critical |
| `FillTab.tsx` | 2,831 | 🔴 Critical |
| `ExportTab.tsx` | 1,487 | 🟡 High |
| `geometry.ts` | 1,402 | 🟡 High |
| `MergeTab.tsx` | 1,377 | 🟡 High |
| `App.tsx` | 1,362 | 🟡 High |
| `PatternTest.tsx` | 1,181 | 🟢 Low (dev tool) |
| `OrderTab.tsx` | 838 | 🟢 OK |
| `LayerTree.tsx` | 691 | 🟡 Consolidate |
| `cropSVG.ts` | 689 | 🟢 OK |
| `AppContext.tsx` | 630 | 🟢 OK |
| `ImportDialog.tsx` | 437 | 🟢 OK |

**Target:** All files under 500 lines

---

## Layer List Consolidation (Priority: High)

### Current State - Fragmented Layer Lists

The codebase has **3 different layer list implementations**:

| Component | Location | Lines | Used By |
|-----------|----------|-------|---------|
| `LayerTree` | `src/components/LayerTree.tsx` | 691 | SortTab only |
| `UnifiedLayerList` | `src/components/shared/UnifiedLayerList/` | ~800 total | FillTab, MergeTab, OrderTab |
| `LayerList` | `src/components/shared/LayerList.tsx` | 207 | Legacy, possibly unused |

### Problem

- **SortTab uses `LayerTree`** - a standalone component with its own drag-drop, selection, and rendering
- **Other tabs use `UnifiedLayerList`** - a more modular, reusable system
- **Inconsistent UX** - different visual styles and behaviors across tabs
- **Duplicate code** - selection logic, drag-drop, keyboard nav implemented multiple times

### Solution: Consolidate on UnifiedLayerList

**Goal:** Migrate SortTab from `LayerTree` to `UnifiedLayerList`, then delete `LayerTree.tsx`

**UnifiedLayerList Module Structure (Already Exists):**
```
src/components/shared/UnifiedLayerList/
├── index.ts                    # Re-exports (37 lines)
├── types.ts                    # Shared types (139 lines)
├── UnifiedLayerList.tsx        # Main component (340 lines)
├── UnifiedLayerList.css        # Styles (374 lines)
├── hooks/
│   ├── index.ts                # Hook exports (2 lines)
│   ├── useLayerSelection.ts    # Selection logic (119 lines)
│   └── useDragDrop.ts          # Drag-drop logic (189 lines)
└── badges/
    └── index.tsx               # Badge components (207 lines)
```

**Migration Steps:**

1. **Audit LayerTree features** - List all features SortTab uses from LayerTree
2. **Add missing features to UnifiedLayerList** - Tree mode, expand/collapse, icons
3. **Create SortTab adapter** - Custom `renderItem` for SortTab's specific needs
4. **Replace LayerTree import** in SortTab with UnifiedLayerList
5. **Delete LayerTree.tsx and LayerTree.css** (691 + 520 = 1,211 lines removed)

**Features to Port from LayerTree → UnifiedLayerList:**

| Feature | In LayerTree | In UnifiedLayerList | Action |
|---------|--------------|---------------------|--------|
| Tree hierarchy | ✅ | ✅ (tree mode) | None |
| Expand/collapse | ✅ | ✅ | None |
| Multi-select | ✅ | ✅ | None |
| Drag-drop reorder | ✅ | ✅ | Verify tree support |
| Color swatches | ✅ | ✅ (via renderItem) | None |
| Group icons | ✅ | ❌ | Add to badges |
| Visibility toggle | ✅ | ✅ | None |
| Context menu | ✅ | ❌ | Add or use renderActions |
| Keyboard nav | ✅ | ✅ | None |

---

## Phase 1: SortTab Refactor (Priority: Critical)

**Current:** `src/components/tabs/SortTab.tsx` (3,146 lines)

**Target Structure:**
```
src/components/tabs/SortTab/
├── index.ts                    # Re-exports
├── SortTab.tsx                 # Main component (~300 lines)
├── SortTab.css                 # Styles (move existing)
├── components/
│   ├── SortCanvas.tsx          # Canvas rendering & pan/zoom (~400 lines)
│   ├── SortSidebar.tsx         # Left sidebar wrapper (~150 lines)
│   ├── SortToolbar.tsx         # Top toolbar actions (~200 lines)
│   └── SortLayerItem.tsx       # Custom renderItem for UnifiedLayerList (~150 lines)
├── hooks/
│   ├── useSortSelection.ts     # Selection state & handlers (~200 lines)
│   ├── useSortDragDrop.ts      # Tree drag-drop logic (~200 lines)
│   └── useSortKeyboard.ts      # Keyboard shortcuts (~100 lines)
└── utils/
    ├── layerOperations.ts      # Group, ungroup, flatten logic (~300 lines)
    ├── selectionUtils.ts       # Selection helpers (~100 lines)
    └── sortTypes.ts            # Types and constants (~50 lines)
```

**Key Change:** Replace `LayerTree` with `UnifiedLayerList` + custom `SortLayerItem` renderer

---

## Phase 2: FillTab Refactor (Priority: Critical)

**Current:** `src/components/tabs/FillTab.tsx` (2,831 lines)

**Target Structure:**
```
src/components/tabs/FillTab/
├── index.ts
├── FillTab.tsx                 # Main component (~300 lines)
├── FillTab.css
├── components/
│   ├── FillCanvas.tsx          # Preview canvas (~400 lines)
│   ├── FillLayerList.tsx       # Layer list wrapper (~200 lines)
│   ├── FillLayerItem.tsx       # Custom renderItem (~150 lines)
│   ├── PatternSettings.tsx     # Pattern selection & params (~400 lines)
│   ├── FillProgress.tsx        # Progress indicator (~100 lines)
│   └── FillWarningBanner.tsx   # Warning about shape count (~80 lines)
├── hooks/
│   ├── useFillGeneration.ts    # Fill generation orchestration (~300 lines)
│   ├── useFillLayers.ts        # Layer accumulation state (~200 lines)
│   ├── usePatternBanners.ts    # Banner preview fetching (~100 lines)
│   └── useFillProgress.ts      # Progress tracking (~80 lines)
└── utils/
    ├── fillLayerUtils.ts       # Layer manipulation (~150 lines)
    ├── fillTypes.ts            # Types (~100 lines)
    └── patternDefaults.ts      # Default pattern settings (~50 lines)
```

**Already uses UnifiedLayerList** - just needs extraction into submodules

---

## Phase 3: App.tsx Refactor (Priority: High)

**Current:** `src/App.tsx` (1,362 lines)

**Target Structure:**
```
src/
├── App.tsx                     # Shell component (~200 lines)
├── App.css
├── components/
│   ├── AppHeader.tsx           # Header bar with actions (~200 lines)
│   ├── AppStatusBar.tsx        # Bottom status bar (~100 lines)
│   └── TabContainer.tsx        # Tab switching logic (~150 lines)
├── hooks/
│   ├── useFileHandlers.ts      # Open, save, export (~200 lines)
│   ├── useKeyboardShortcuts.ts # Global keyboard shortcuts (~150 lines)
│   ├── useMenuCommands.ts      # Electron menu handling (~100 lines)
│   └── useAppInitialization.ts # Startup logic (~100 lines)
└── utils/
    └── appConstants.ts         # App-level constants (~50 lines)
```

---

## Phase 4: Other Tab Refactors (Priority: Medium)

### MergeTab.tsx (1,377 lines)

```
src/components/tabs/MergeTab/
├── index.ts
├── MergeTab.tsx                # Main (~300 lines)
├── MergeTab.css
├── components/
│   ├── MergeCanvas.tsx         # Preview (~300 lines)
│   ├── MergeShapeList.tsx      # Shape list wrapper (~150 lines)
│   ├── MergeShapeItem.tsx      # Custom renderItem with readiness (~150 lines)
│   ├── MergeOperations.tsx     # Union/intersect buttons (~150 lines)
│   └── MergeReadinessBanner.tsx # Fill readiness summary (~100 lines)
├── hooks/
│   ├── useMergeSelection.ts    # Shape selection (~100 lines)
│   └── useMergeOperations.ts   # Boolean operations (~200 lines)
└── utils/
    ├── mergeUtils.ts           # Boolean operation wrappers (~200 lines)
    └── touchingShapes.ts       # Edge detection (~150 lines)
```

**Already uses UnifiedLayerList** - just needs extraction

### ExportTab.tsx (1,487 lines)

```
src/components/tabs/ExportTab/
├── index.ts
├── ExportTab.tsx               # Main (~300 lines)
├── ExportTab.css
├── components/
│   ├── ExportPreview.tsx       # SVG preview (~300 lines)
│   ├── ExportSettings.tsx      # Format, dimensions (~250 lines)
│   ├── ExportLayerList.tsx     # Layer selection (~150 lines)
│   └── SVGAnalysis.tsx         # Stats display (~200 lines)
├── hooks/
│   └── useExportGeneration.ts  # Export logic (~200 lines)
└── utils/
    └── exportUtils.ts          # Helper functions (~100 lines)
```

---

## Phase 5: Utility Refactors (Priority: Medium)

### geometry.ts (1,402 lines)

Split into:
```
src/utils/geometry/
├── index.ts                    # Re-exports
├── types.ts                    # Point, Polygon, BoundingBox (~50 lines)
├── polygonOperations.ts        # Union, intersect, clip (~300 lines)
├── pointInPolygon.ts           # Hit testing (~100 lines)
├── pathParsing.ts              # SVG path to points (~400 lines)
├── boundingBox.ts              # BBox calculations (~150 lines)
├── simplification.ts           # Douglas-Peucker (~150 lines)
└── edgeUtils.ts                # Edge detection, shared edges (~250 lines)
```

---

## Cleanup Tasks

### Files to Delete After Migration

| File | Lines | Replaced By |
|------|-------|-------------|
| `LayerTree.tsx` | 691 | UnifiedLayerList |
| `LayerTree.css` | 520 | UnifiedLayerList.css |
| `LayerList.tsx` | 207 | UnifiedLayerList (if unused) |
| `LayerList.css` | 122 | UnifiedLayerList.css (if unused) |

**Total lines removed:** ~1,540

---

## Implementation Strategy

### For Each Module Extraction:

1. **Create directory structure** first
2. **Copy relevant code** to new files
3. **Update imports** in new files
4. **Create index.ts** with re-exports
5. **Update parent** to import from new location
6. **Test functionality** still works
7. **Delete old code** from parent file

### Agent Division Strategy

Each extraction can be done independently:

| Task | Files Involved | Can Parallelize With |
|------|----------------|----------------------|
| SortTab → SortCanvas | SortTab.tsx | FillTab work |
| SortTab → useSortSelection | SortTab.tsx | SortCanvas |
| SortTab → LayerTree migration | SortTab.tsx, LayerTree.tsx | After hooks done |
| FillTab → FillCanvas | FillTab.tsx | SortTab work |
| FillTab → PatternSettings | FillTab.tsx | FillCanvas |
| App → useKeyboardShortcuts | App.tsx | Any tab work |
| geometry → split | geometry.ts | Any component work |
| MergeTab → split | MergeTab.tsx | Any other tab |
| ExportTab → split | ExportTab.tsx | Any other tab |

### Naming Conventions

- **Components:** PascalCase, `.tsx`
- **Hooks:** `use` prefix, camelCase, `.ts`
- **Utils:** camelCase, `.ts`
- **Types:** in `types.ts` or co-located
- **Constants:** UPPER_SNAKE_CASE in `constants.ts`

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Largest file | 3,146 lines | < 500 lines |
| Files > 1000 lines | 7 | 0 |
| Files > 500 lines | 12 | 3 |
| Avg component size | ~400 lines | < 250 lines |
| Layer list implementations | 3 | 1 (UnifiedLayerList) |

---

## Quick Wins (Can Do Immediately)

1. **Extract `useKeyboardShortcuts`** from App.tsx (~150 lines)
2. **Extract `useFillGeneration`** from FillTab.tsx (~300 lines)
3. **Extract `layerOperations.ts`** from SortTab.tsx (~300 lines)
4. **Split `geometry.ts`** into focused modules
5. **Delete `LayerList.tsx`** if confirmed unused

---

## Notes for Agents

When working on extractions:

1. **Read only the specific file** you're extracting from
2. **Create the new file** with extracted code
3. **Update imports** in the parent file
4. **Run `npm run build`** to verify no TypeScript errors
5. **Don't refactor logic** - just move code as-is first

Keep extractions mechanical - logic refactoring is a separate task.

### UnifiedLayerList Usage Pattern

When a tab needs a layer list, use this pattern:

```tsx
import { UnifiedLayerList, LayerListItemFull, ItemRenderState } from '../shared'

// 1. Define extended item type
type MyTabListItem = LayerListItemFull & {
  myCustomField: string
}

// 2. Create custom renderItem
const renderItem = (item: MyTabListItem, state: ItemRenderState) => (
  <div className={`my-item ${state.isSelected ? 'selected' : ''}`}>
    <span className="color-swatch" style={{ background: item.color }} />
    <span className="name">{item.name}</span>
    {/* Custom badges/content */}
  </div>
)

// 3. Use UnifiedLayerList
<UnifiedLayerList
  items={myItems}
  mode="flat" // or "tree"
  selectedIds={selectedIds}
  onSelectionChange={setSelectedIds}
  selectionMode="multi"
  renderItem={renderItem}
/>
```
