# Next Session: Codebase Modularization

## Completed This Session - Phase 1: Utility Modularization

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

## In Progress: Modularization Plan

### Goals
1. **Reduce context for AI agents** - Smaller, focused files allow agents to work with less context
2. **Improve code organization** - Single responsibility principle for each module
3. **Enable parallel development** - Multiple agents can work on different modules simultaneously
4. **Better maintainability** - Easier to understand, test, and modify individual modules

### Remaining Phases

#### Phase 2: Shared Components (~500 lines each)
- `SVGCanvas.tsx` - Canvas rendering, zoom, pan
- `LayerTree.tsx` - Tree view component
- `ImportDialog.tsx` - File import UI
- `UnifiedLayerList.tsx` - Layer management

#### Phase 3: Context Refactoring
- `AppContext.tsx` (~800 lines) - Split into domain-specific contexts

#### Phase 4: Medium Components
- `PatternTest.tsx` - Pattern testing UI
- `OrderTab.tsx` - Ordering tab

#### Phase 5: Large Tabs (Future)
- `MergeTab.tsx` - Color merging
- `ExportTab.tsx` - Export functionality
- `FillTab.tsx` - Fill pattern application
- `SortTab.tsx` - Sorting and layer management
- `App.tsx` - Main application

---

## Previous Session Completed

- **Merge Tab Fill Readiness UI** - Added fill readiness indicators
- **Pattern Preview Swatch Fix** - Updated `pattern-banner` handler
- **Banner ENOENT fix** - Switched to stdout mode
- **Transform baking** - Rewrote `normalize_svg.py`
- **Merge before fill** - Added checkbox option
- **Smart warning banner** - Shows warning when >3 shapes detected

---

## Questions for Next Session

1. **Phase 2 Priority**: Should we prioritize shared components (SVGCanvas, LayerTree) or move directly to tab refactoring?

2. **Context Split Strategy**: AppContext has ~800 lines. Options:
   - Split by feature (SVGContext, SelectionContext, ToolContext)
   - Split by lifecycle (LoadContext, EditContext, ExportContext)
   - Keep unified but extract helper hooks

3. **Testing**: Should we add unit tests as we modularize, or defer testing?

4. **Bundle Size**: The build shows chunks >500KB. Should we implement code splitting during this refactor?

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
