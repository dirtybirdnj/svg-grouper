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

---

# Detailed Extraction Plans

## SortTab.tsx Extraction Plan (3,146 lines → ~300 lines)

### File Structure Overview

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-56 | React, context, utils, components |
| Constants | 57-72 | GRID_SIZE, MIN_ZOOM, MAX_ZOOM |
| Helper Functions | 73-260 | flattenLayer, getLayerPathCount, etc. |
| Type Definitions | 261-310 | TreeItem, FlatItem, DragState |
| Main Component | 311-3146 | SortTab function |

### Extraction Order (Dependencies → Dependents)

#### Step 1: Extract Types & Constants → `sortTypes.ts` (~100 lines)
```
Lines 57-72:   Constants (GRID_SIZE, MIN_ZOOM, MAX_ZOOM, colors)
Lines 261-310: Types (TreeItem, FlatItem, DragState, etc.)
```

#### Step 2: Extract Pure Helpers → `layerHelpers.ts` (~190 lines)
```
Lines 73-130:  flattenLayer() - recursive layer flattening
Lines 131-160: getLayerPathCount() - path counting
Lines 161-200: getChildBounds() - bounding box calculation
Lines 201-260: createTreeItems() - tree structure creation
```

#### Step 3: Extract `useSortByType` Hook (~270 lines)
```
Lines 420-690: handleSortByType logic including:
  - Path extraction from layers
  - Color-based grouping
  - Dimension-based sorting
  - Layer reconstruction
```

#### Step 4: Extract `useWeld` Hook (~280 lines)
```
Lines 750-1030: Weld operations:
  - handleWeld() - main weld function
  - weldSelectedPaths() - path merging
  - reconstructLayerWithWeldedPaths()
  - Clipper library integration
```

#### Step 5: Extract `useFlattenAll` Hook (~200 lines)
```
Lines 1100-1300: Flatten operations:
  - handleFlattenAll()
  - flattenSelectedGroups()
  - Recursive group flattening logic
```

#### Step 6: Extract `useKeyboardShortcuts` Hook (~150 lines)
```
Lines 2800-2950: Keyboard handlers:
  - Delete, Escape, Enter shortcuts
  - Arrow key navigation
  - Modifier key combinations
```

#### Step 7: Extract `SortCanvas` Component (~450 lines)
```
Lines 1500-1950: Canvas rendering:
  - SVG rendering with pan/zoom
  - Mouse handlers (pan, select, drag)
  - Grid overlay
  - Selection rectangles
  - viewBox calculations
```

#### Step 8: Extract `SortToolbar` Component (~200 lines)
```
Lines 2950-3100: Toolbar buttons:
  - Group/Ungroup buttons
  - Sort dropdown
  - Flatten button
  - Weld button
```

### Final Directory Structure

```
src/components/tabs/SortTab/
├── index.ts                 # Re-exports SortTab
├── SortTab.tsx              # Main component (~300 lines)
├── SortTab.css              # Styles (existing)
├── components/
│   ├── SortCanvas.tsx       # Canvas rendering (~450 lines)
│   ├── SortToolbar.tsx      # Toolbar actions (~200 lines)
│   └── SortLayerItem.tsx    # Custom list item (~150 lines)
├── hooks/
│   ├── useSortByType.ts     # Sort operations (~270 lines)
│   ├── useWeld.ts           # Weld operations (~280 lines)
│   ├── useFlattenAll.ts     # Flatten operations (~200 lines)
│   └── useKeyboardShortcuts.ts # Key handlers (~150 lines)
└── utils/
    ├── sortTypes.ts         # Types & constants (~100 lines)
    └── layerHelpers.ts      # Pure helper functions (~190 lines)
```

---

## FillTab.tsx Extraction Plan (2,831 lines → ~300 lines)

### File Structure Overview

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-68 | React, context, types, components |
| Types | 69-180 | FillLayerItem, PatternSettings, etc. |
| Constants | 181-220 | Default pattern values, color lists |
| Weave Algorithm | 221-490 | generateWeavePattern, WeaveCell, etc. |
| Main Component | 491-2831 | FillTab function |

### Extraction Order

#### Step 1: Extract Types → `fillTypes.ts` (~120 lines)
```
Lines 69-180:  Interface definitions:
  - FillLayerItem
  - PatternSettings
  - FillProgress
  - LayerFillResult
```

#### Step 2: Extract Constants → `patternDefaults.ts` (~50 lines)
```
Lines 181-220: Default values:
  - DEFAULT_SPACING
  - DEFAULT_ANGLE
  - PATTERN_PRESETS
  - COLOR_SWATCHES
```

#### Step 3: Extract Weave Algorithm → `weaveAlgorithm.ts` (~270 lines)
```
Lines 221-490: Weave pattern generation:
  - WeaveCell interface
  - generateWeavePattern()
  - calculateWeaveIntersections()
  - clipWeaveToPolygon()
```

#### Step 4: Extract `useFillGeneration` Hook (~350 lines)
```
Lines 600-950: Fill orchestration:
  - handleGenerateFill()
  - Progress tracking
  - Layer accumulation
  - Error handling
  - rat-king CLI integration
```

#### Step 5: Extract `usePatternBanners` Hook (~120 lines)
```
Lines 1100-1220: Banner preview management:
  - fetchPatternBanner()
  - Banner cache state
  - Async loading logic
```

#### Step 6: Extract `FillLayerItem` Component (~180 lines)
```
Lines 1400-1580: Custom list item renderer:
  - Pattern preview swatch
  - Fill status indicators
  - Action buttons (regenerate, remove)
```

#### Step 7: Extract `PatternSettings` Component (~400 lines)
```
Lines 1700-2100: Pattern configuration UI:
  - Pattern type selector
  - Spacing/angle controls
  - Preview canvas
  - Preset buttons
```

#### Step 8: Extract `FillCanvas` Component (~400 lines)
```
Lines 2200-2600: Preview canvas:
  - SVG rendering
  - Fill preview overlay
  - Pan/zoom handlers
  - Progress indicator overlay
```

### Final Directory Structure

```
src/components/tabs/FillTab/
├── index.ts                  # Re-exports FillTab
├── FillTab.tsx               # Main component (~300 lines)
├── FillTab.css               # Styles (existing)
├── components/
│   ├── FillCanvas.tsx        # Preview canvas (~400 lines)
│   ├── FillLayerItem.tsx     # List item renderer (~180 lines)
│   ├── PatternSettings.tsx   # Pattern controls (~400 lines)
│   └── FillWarningBanner.tsx # Shape count warning (~80 lines)
├── hooks/
│   ├── useFillGeneration.ts  # Fill orchestration (~350 lines)
│   ├── usePatternBanners.ts  # Banner fetching (~120 lines)
│   └── useFillProgress.ts    # Progress tracking (~80 lines)
└── utils/
    ├── fillTypes.ts          # Type definitions (~120 lines)
    ├── patternDefaults.ts    # Default values (~50 lines)
    └── weaveAlgorithm.ts     # Weave pattern logic (~270 lines)
```

---

## App.tsx Extraction Plan (1,362 lines → ~200 lines)

### File Structure Overview

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-45 | React, components, context, utils |
| Constants | 46-75 | Tab definitions, default state |
| Main Component | 76-1362 | App function |

### Key Function Blocks to Extract

| Function | Lines | Target |
|----------|-------|--------|
| handleFlattenAll | 180-453 | ~273 lines → `useFlattenOperations.ts` |
| handleOrder | 500-664 | ~164 lines → `useOrderOperations.ts` |
| handleFillPatternAccept | 700-831 | ~131 lines → `useFillAccept.ts` |
| Menu command handler | 900-1050 | ~150 lines → `useMenuCommands.ts` |
| Keyboard shortcuts | 1100-1250 | ~150 lines → `useKeyboardShortcuts.ts` |

### Extraction Order

#### Step 1: Extract Menu Commands → `useMenuCommands.ts` (~150 lines)
```
Lines 900-1050: Electron menu handling:
  - useEffect for menu-command listener
  - Command routing (open, save, export, etc.)
  - File dialog integration
```

#### Step 2: Extract Keyboard Shortcuts → `useKeyboardShortcuts.ts` (~150 lines)
```
Lines 1100-1250: Global key handlers:
  - Cmd+S (save)
  - Cmd+O (open)
  - Cmd+Z (undo)
  - Escape (cancel)
```

#### Step 3: Extract Flatten Operations → `useFlattenOperations.ts` (~280 lines)
```
Lines 180-453: Flatten logic:
  - handleFlattenAll()
  - Layer recursion
  - Path extraction
  - Group dissolution
```

#### Step 4: Extract Order Operations → `useOrderOperations.ts` (~170 lines)
```
Lines 500-664: Ordering logic:
  - handleOrder()
  - TSP optimization
  - Layer reordering
```

#### Step 5: Extract Fill Accept → `useFillAccept.ts` (~140 lines)
```
Lines 700-831: Fill result handling:
  - handleFillPatternAccept()
  - Layer merging
  - State updates
```

#### Step 6: Extract Header Component → `AppHeader.tsx` (~200 lines)
```
Lines 1260-1362 (JSX): Header rendering:
  - Tab buttons
  - Action buttons (flatten, crop)
  - Zoom controls
```

#### Step 7: Extract Status Bar → `AppStatusBar.tsx` (~100 lines)
```
Footer JSX: Status bar rendering:
  - File name
  - Layer count
  - Color swatches
```

### Final Directory Structure

```
src/
├── App.tsx                      # Shell component (~200 lines)
├── App.css                      # Styles (existing)
├── components/
│   ├── AppHeader.tsx            # Header bar (~200 lines)
│   ├── AppStatusBar.tsx         # Status bar (~100 lines)
│   └── TabContainer.tsx         # Tab switching (~100 lines)
└── hooks/
    ├── useMenuCommands.ts       # Electron menus (~150 lines)
    ├── useKeyboardShortcuts.ts  # Global keys (~150 lines)
    ├── useFlattenOperations.ts  # Flatten logic (~280 lines)
    ├── useOrderOperations.ts    # Order logic (~170 lines)
    └── useFillAccept.ts         # Fill acceptance (~140 lines)
```

---

## geometry.ts Extraction Plan (1,402 lines → 8 modules)

### File Structure Overview

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-15 | Clipper2, external libs |
| Type Definitions | 16-80 | Point, Polygon, BoundingBox, etc. |
| Math Utilities | 81-180 | distance, lerp, normalizeAngle |
| Path Parsing | 181-480 | parsePath, SVG path to points |
| Polygon Analysis | 481-650 | pointInPolygon, isClockwise, area |
| SVG Conversion | 651-850 | elementToPolygon, shapeToPath |
| Clipping Operations | 851-1050 | union, intersect, difference |
| Line Generation | 1051-1250 | generateHatchLines, fillPolygon |
| Plotter Optimization | 1251-1402 | optimizePath, sortByDistance |

### Module Extraction Plan

#### Module 1: `geometry/types.ts` (~70 lines)
```
Lines 16-80: Core type definitions:
  - Point interface
  - Polygon type (Point[][])
  - BoundingBox interface
  - PathCommand type
  - ClipOperation enum
```

#### Module 2: `geometry/math.ts` (~100 lines)
```
Lines 81-180: Pure math functions:
  - distance(p1, p2)
  - lerp(a, b, t)
  - normalizeAngle(angle)
  - clamp(value, min, max)
  - degToRad, radToDeg
```

#### Module 3: `geometry/pathParsing.ts` (~300 lines)
```
Lines 181-480: SVG path parsing:
  - parsePath(d: string): PathCommand[]
  - pathToPolygon(commands): Polygon
  - parsePathData() - tokenizer
  - arcToBezier() - arc conversion
  - cubicBezierPoints() - curve sampling
```

#### Module 4: `geometry/polygonAnalysis.ts` (~170 lines)
```
Lines 481-650: Polygon analysis:
  - pointInPolygon(point, polygon)
  - isClockwise(polygon)
  - polygonArea(polygon)
  - polygonCentroid(polygon)
  - getBoundingBox(polygon)
```

#### Module 5: `geometry/svgConversion.ts` (~200 lines)
```
Lines 651-850: SVG ↔ polygon conversion:
  - elementToPolygon(svgElement)
  - polygonToPath(polygon): string
  - rectToPolygon(x, y, w, h)
  - circleToPolygon(cx, cy, r, segments)
  - ellipseToPolygon(cx, cy, rx, ry, segments)
```

#### Module 6: `geometry/clipping.ts` (~200 lines)
```
Lines 851-1050: Boolean operations (Clipper2):
  - unionPolygons(a, b)
  - intersectPolygons(a, b)
  - differencePolygons(a, b)
  - clipPolygonToRect(polygon, rect)
  - offsetPolygon(polygon, distance)
```

#### Module 7: `geometry/lineGeneration.ts` (~200 lines)
```
Lines 1051-1250: Fill line generation:
  - generateHatchLines(polygon, angle, spacing)
  - generateCrossHatch(polygon, angle, spacing)
  - clipLinesToPolygon(lines, polygon)
  - connectHatchLines(lines) - optimize pen travel
```

#### Module 8: `geometry/plotterOptimization.ts` (~160 lines)
```
Lines 1251-1402: Plotter path optimization:
  - optimizePath(paths) - minimize pen lifts
  - sortByDistance(paths, startPoint)
  - findNearestPath(paths, point)
  - reversePath(path) - for direction optimization
```

### Final Directory Structure

```
src/utils/geometry/
├── index.ts                  # Re-exports all modules
├── types.ts                  # Type definitions (~70 lines)
├── math.ts                   # Math utilities (~100 lines)
├── pathParsing.ts            # SVG path parsing (~300 lines)
├── polygonAnalysis.ts        # Polygon analysis (~170 lines)
├── svgConversion.ts          # SVG ↔ polygon (~200 lines)
├── clipping.ts               # Boolean operations (~200 lines)
├── lineGeneration.ts         # Hatch/fill lines (~200 lines)
└── plotterOptimization.ts    # Path optimization (~160 lines)
```

---

## Execution Priority Matrix

### Phase 1: Quick Wins (No Dependencies)

| Task | File | Lines Saved | Parallel? |
|------|------|-------------|-----------|
| geometry → modules | geometry.ts | N/A (reorg) | Yes |
| App → useKeyboardShortcuts | App.tsx | ~150 | Yes |
| App → useMenuCommands | App.tsx | ~150 | Yes |
| FillTab → fillTypes.ts | FillTab.tsx | ~120 | Yes |

### Phase 2: Hook Extractions

| Task | Depends On | Lines |
|------|------------|-------|
| SortTab → useSortByType | sortTypes.ts | ~270 |
| SortTab → useWeld | sortTypes.ts | ~280 |
| FillTab → useFillGeneration | fillTypes.ts | ~350 |
| FillTab → weaveAlgorithm.ts | fillTypes.ts | ~270 |
| App → useFlattenOperations | None | ~280 |

### Phase 3: Component Extractions

| Task | Depends On | Lines |
|------|------------|-------|
| SortTab → SortCanvas | hooks done | ~450 |
| SortTab → SortToolbar | hooks done | ~200 |
| FillTab → FillCanvas | hooks done | ~400 |
| FillTab → PatternSettings | fillTypes.ts | ~400 |
| App → AppHeader | hooks done | ~200 |

### Phase 4: Final Cleanup

| Task | Description |
|------|-------------|
| Delete LayerTree.tsx | After SortTab uses UnifiedLayerList |
| Delete LayerList.tsx | After confirming unused |
| Update all imports | Point to new module locations |
| Run full test suite | Verify no regressions |

---

## Agent Assignment Template

When starting an extraction task:

```markdown
## Task: Extract [component/hook] from [file]

### Input
- Source file: `src/[path]/[file].tsx`
- Lines to extract: [start]-[end]
- Target file: `src/[path]/[new-file].ts`

### Steps
1. Read source file lines [start]-[end]
2. Create new file with extracted code
3. Add necessary imports to new file
4. Update source file to import from new location
5. Run `npm run build` to verify

### Dependencies
- Requires: [list any files that must exist first]
- Blocks: [list any tasks that depend on this]

### Success Criteria
- [ ] New file created with extracted code
- [ ] Source file imports from new location
- [ ] Build passes with no TypeScript errors
- [ ] Functionality unchanged
```
