# Next Session: Codebase Modularization

## Completed This Session - Phase 4: Tab Modularization

### Tab Modularization Summary
All four major tabs modularized into directory modules with extracted types, utilities, and hooks:

| Tab | Before | After | Reduction | Files Created |
|-----|--------|-------|-----------|---------------|
| FillTab | 2363 | 1546 | -34.5% | types.ts, useFillState.ts, useFillPaths.ts, useFillGeneration.ts, useFillLayers.ts |
| ExportTab | 1487 | 1176 | -20.9% | types.ts, svgAnalysis.ts, paperSizes.ts, usePageLayout.ts |
| MergeTab | 1377 | 986 | -28.4% | types.ts, polygonUtils.ts, pathConversion.ts, booleanOperations.ts |
| OrderTab | 838 | 648 | -22.7% | types.ts, lineOptimization.ts |

### FillTab Directory Structure
```
src/components/tabs/FillTab/
├── types.ts                    # FillLayer, FillLayerListItem, ControlId
├── hooks/
│   ├── useFillState.ts         # ~40 consolidated state variables
│   ├── useFillPaths.ts         # Target node & path extraction
│   ├── useFillGeneration.ts    # IPC-based fill generation
│   ├── useFillLayers.ts        # Layer CRUD operations
│   └── index.ts
├── FillTab.tsx
├── FillTab.css
└── index.ts
```

### ExportTab Directory Structure
```
src/components/tabs/ExportTab/
├── types.ts            # PaperSize, ColorStats, SVGStatistics, PageLayout
├── svgAnalysis.ts      # analyzeSVG, analyzeOptimizationState, formatBytes
├── paperSizes.ts       # localStorage load/save utilities
├── usePageLayout.ts    # Page dimension calculations
├── ExportTab.tsx
├── ExportTab.css
└── index.ts
```

### MergeTab Directory Structure
```
src/components/tabs/MergeTab/
├── types.ts              # PolygonData, MergeShapeListItem, UnionResult, BooleanResult
├── polygonUtils.ts       # edgeKey, findTouchingShapes, unionPolygons
├── pathConversion.ts     # pointsToPathD, polygonWithHolesToPathD, multiPolygonToPathD
├── booleanOperations.ts  # performBooleanOperation, polygon-clipping wrappers
├── MergeTab.tsx
├── MergeTab.css
└── index.ts
```

### OrderTab Directory Structure
```
src/components/tabs/OrderTab/
├── types.ts             # OrderedLine, LayerInfo, OrderLayerListItem
├── lineOptimization.ts  # optimizeLinesByColor, optimizeLinesNearestNeighbor, optimizeLinesChunked
├── OrderTab.tsx
├── OrderTab.css
└── index.ts
```

### Shared Patterns Identified
- **usePanZoom hook** - Used by FillTab, MergeTab, OrderTab with externalState pattern
- **UnifiedLayerList** - Shared layer list component with configurable rendering
- **StatSection/StatRow** - Consistent statistics display components

---

## Previously Completed - Phase 3: Component Modularization

### LayerTree.tsx Split (691 → 6 files)
| File | Purpose |
|------|---------|
| `types.ts` | Interface definitions for drag/drop and props |
| `nodeUtils.ts` | Helper functions for element type detection and path info |
| `ColorPickerPopup.tsx` | Standalone color picker popup component |
| `LayerNode.tsx` | Recursive tree node renderer |
| `LayerTree.tsx` | Main tree component with drag/drop logic |
| `index.ts` | Barrel exports |

### PatternTest.tsx Split (1181 → 9 files)
| File | Purpose |
|------|---------|
| `types.ts` | Interface definitions for test results and settings |
| `constants.ts` | Pattern lists, thresholds, helper polygon functions |
| `SliderInput.tsx` | Reusable slider+text input component |
| `usePatternGenerator.ts` | Hook for IPC-based pattern generation |
| `PatternGrid.tsx` | Grid display of pattern preview cells |
| `TortureTestReport.tsx` | Results table for torture test |
| `StressTestViewport.tsx` | Zoomable/pannable SVG viewport |
| `PatternTest.tsx` | Main component orchestrating all features |
| `index.ts` | Barrel exports |

### SortTab.tsx Full Modularization (2562 → 1006 lines, 61% reduction)

**Hooks Integrated (from previous session):**
| Hook | Purpose |
|------|---------|
| `useNodeOperations` | visibility, isolation, delete, reorder |
| `useColorOperations` | color change, group by color |
| `useGroupOperations` | group/ungroup, flip order |
| `usePathHighlight` | path highlighting and point markers |
| `useFlattenOperations` | flatten all with color grouping |

**New Hooks Created:**
| Hook | Lines | Purpose |
|------|-------|---------|
| `useSortOperations` | ~400 | Sort by type/size, filter counts, extraction |
| `usePathOperations` | ~200 | simplify paths, weld compound paths |
| `useCropHandler` | ~180 | crop SVG with coordinate transformation |
| `useKeyboardShortcuts` | ~130 | keyboard shortcuts for layer operations |

**Bug Fixes Applied:**
- Crop coordinate transformation: Fixed ruler padding offset causing misaligned crops
- Fit to view: Added auto-fit when importing files to maximize display size

**Total: 2562 lines → 1006 lines (61% reduction)**

---

## Previously Completed - Phase 2: Context Split + Code Splitting

### AppContext Split (631 → 8 files)
Split monolithic AppContext.tsx into domain-specific contexts:

| Context | Lines | Purpose |
|---------|-------|---------|
| `types.ts` | 60 | Shared type definitions |
| `SVGContext.tsx` | 200 | SVG document state, rebuild, sync |
| `LayerContext.tsx` | 70 | Layer tree, selection, O(1) node lookup |
| `CanvasContext.tsx` | 45 | Viewport scale, offset, crop controls |
| `ToolContext.tsx` | 95 | Active tool, fill settings, handlers |
| `UIContext.tsx` | 115 | Tabs, loading, status, processing |
| `FillContext.tsx` | 45 | Fill targets, weave state, order data |
| `AppProvider.tsx` | 35 | Combined provider wrapper |
| `index.ts` | 150 | Barrel exports + legacy useAppContext() |

**Legacy compatibility**: `useAppContext()` shim combines all contexts for gradual migration.

### Code Splitting Implementation
Converted static tab imports to React.lazy() with dynamic imports:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Main bundle | 519 KB | 241 KB | **-54%** |

Tab chunk sizes:
- SortTab: 92 KB
- FillTab: 50 KB
- ExportTab: 40 KB
- MergeTab: 23 KB
- PatternTest: 17 KB
- OrderTab: 13 KB

---

## Previously Completed - Phase 1: Utility Modularization

Successfully modularized 6 large utility files into directory structures with barrel exports:

| File | Before | After | Purpose |
|------|--------|-------|---------|
| `svgParser.ts` | 328 lines | 4 files | SVG parsing, node extraction |
| `colorDistance.ts` | 563 lines | 6 files | LAB color space, clustering, palette ops |
| `svgDimensions.ts` | 578 lines | 7 files | ViewBox, unit conversion, normalization |
| `fillPatterns.ts` | 609 lines | 5 files | Line ordering, travel optimization |
| `cropSVG.ts` | 689 lines | 7 files | Cohen-Sutherland clipping, element cropping |
| `pathAnalysis.ts` | 389 lines | 5 files | Subpath parsing, winding direction, diagnostics |

**Total: 3,156 lines → 34 focused files**

### Directory Structure Created

```
src/utils/
├── svgParser/
│   ├── types.ts
│   ├── elementParsing.ts
│   ├── progressiveParser.ts
│   └── index.ts
├── colorDistance/
│   ├── types.ts
│   ├── colorConversion.ts
│   ├── distanceMetrics.ts
│   ├── clustering.ts
│   ├── paletteOperations.ts
│   └── index.ts
├── svgDimensions/
│   ├── types.ts
│   ├── unitConversion.ts
│   ├── viewBoxUtils.ts
│   ├── dimensionAnalysis.ts
│   ├── elementTransforms.ts
│   ├── normalization.ts
│   └── index.ts
├── fillPatterns/
│   ├── types.ts
│   ├── shapeUtils.ts
│   ├── lineJoining.ts
│   ├── lineOptimization.ts
│   └── index.ts
├── cropSVG/
│   ├── types.ts
│   ├── pathParsing.ts
│   ├── lineClipping.ts
│   ├── elementIntersection.ts
│   ├── elementClipping.ts
│   ├── cropSVG.ts
│   └── index.ts
└── pathAnalysis/
    ├── types.ts
    ├── subpathParsing.ts
    ├── geometryCalc.ts
    ├── diagnostics.ts
    └── index.ts
```

---

## Remaining Work

### Large Files That Could Still Be Modularized
| File | Lines | Notes |
|------|-------|-------|
| `App.tsx` | 1023 | Main orchestration - could extract more hooks |
| `SortTab.tsx` | ~1200 | Already has 5 hooks, but still large |
| `SVGCanvas.tsx` | 320 | Reasonable size |
| `ImportDialog.tsx` | 437 | Moderate |
| `UnifiedLayerList.tsx` | 340 | Reasonable |

### Potential Future Improvements
1. Extract more shared UI patterns into components
2. Further split SortTab.tsx hooks
3. Create unified color handling utilities
4. Add more comprehensive type exports

---

## SVG Transforms Reference

### Matrix Format
```
| a  c  e |
| b  d  f |
| 0  0  1 |
```

### Point Transformation
```
x' = a*x + c*y + e
y' = b*x + d*y + f
```

### Transform Functions → Matrices
| Transform | Matrix |
|-----------|--------|
| `translate(tx, ty)` | `[1, 0, 0, 1, tx, ty]` |
| `scale(sx, sy)` | `[sx, 0, 0, sy, 0, 0]` |
| `rotate(θ)` | `[cos(θ), sin(θ), -sin(θ), cos(θ), 0, 0]` |
| `skewX(θ)` | `[1, 0, tan(θ), 1, 0, 0]` |
| `skewY(θ)` | `[1, tan(θ), 0, 1, 0, 0]` |

### Key Behaviors
- Transforms compose via matrix multiplication
- Order matters: `translate rotate ≠ rotate translate`
- Nested group transforms multiply: `CTM = child × parent × grandparent`
- Stroke-width scales with transform (unless `vector-effect: non-scaling-stroke`)
- `viewBox` with non-zero origin creates implicit translate
