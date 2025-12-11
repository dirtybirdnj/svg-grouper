# Next Session: Codebase Modularization

## Completed This Session - Phase 3: Component Modularization

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

### SortTab.tsx Hooks Extracted (5 hooks)
| Hook | Purpose |
|------|---------|
| `useNodeOperations` | visibility, isolation, delete, reorder |
| `useColorOperations` | color change, group by color |
| `useGroupOperations` | group/ungroup, flip order |
| `usePathHighlight` | path highlighting and point markers |
| `useFlattenOperations` | flatten all with color grouping |

**Total: ~1,900 lines → 15 files + 5 hooks (~950 lines)**

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
- FillTab: 45 KB
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

## Remaining Phases

### Goals
1. **Reduce context for AI agents** - Smaller, focused files allow agents to work with less context
2. **Improve code organization** - Single responsibility principle for each module
3. **Enable parallel development** - Multiple agents can work on different modules simultaneously
4. **Better maintainability** - Easier to understand, test, and modify individual modules

### Large Tabs Still Pending
| File | Lines | Status |
|------|-------|--------|
| `FillTab.tsx` | 2363 | Has fillUtils.ts, weaveAlgorithm.ts extracted |
| `ExportTab.tsx` | 1487 | Could extract export handlers |
| `MergeTab.tsx` | 1377 | Could extract merge logic |
| `OrderTab.tsx` | 838 | Moderate size |
| `App.tsx` | 1023 | Main orchestration |

### Shared Components (could modularize further)
- `SVGCanvas.tsx` - 320 lines, reasonable size
- `ImportDialog.tsx` - 437 lines, moderate
- `UnifiedLayerList.tsx` - 340 lines, reasonable

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
