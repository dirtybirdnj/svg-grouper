# SVG-Grouper Architecture

## Project Overview

**Total Source Lines:** ~15,000+ lines
**Purpose:** SVG editing and optimization tool for pen plotters

## Directory Structure

```
src/
├── App.tsx (1023)              # Main orchestrator
├── components/
│   ├── tabs/                   # 5 main tabs (~7500 lines total)
│   │   ├── SortTab/           # 1006 + 2026 hooks = 3032
│   │   ├── FillTab/           # 2363
│   │   ├── MergeTab.tsx       # 1377
│   │   ├── OrderTab.tsx       # 838
│   │   └── ExportTab.tsx      # 1487
│   ├── PatternTest/           # 943 (testing harness)
│   ├── shared/                # 826 (reusable components)
│   ├── LayerTree/             # 524
│   └── [core components]      # ~1400
├── context/                   # 754 (6 contexts + provider)
├── hooks/                     # 1166 (shared hooks)
├── utils/                     # 6597 (utility libraries)
└── types/                     # Type definitions
```

---

## Tab Architecture

### SortTab - Primary Layer Editor (3032 lines total)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `SortTab.tsx` | 1006 | Main UI, layer tree, canvas |
| 9 hooks | 2026 | Modular operations |

**Hooks:**
- `useNodeOperations` (122) - CRUD on nodes
- `useColorOperations` (222) - Color assignment
- `useGroupOperations` (220) - Group/ungroup
- `usePathHighlight` (150) - Visual feedback
- `useFlattenOperations` (232) - Flatten groups
- `useSortOperations` (496) - Sorting algorithms
- `usePathOperations` (220) - Path manipulation
- `useCropHandler` (210) - Crop tool
- `useKeyboardShortcuts` (144) - Keyboard events

**Key Features:**
- Layer tree with multi-select (Shift/Cmd)
- Color sorting and grouping
- Crop tool with aspect ratio presets
- Path simplification (Ramer-Douglas-Peucker)
- Weld paths to compound paths
- Keyboard shortcuts (V, I, D, G, P, S)

---

### FillTab - Pattern Generation (2363 lines)

**Purpose:** Convert filled shapes to hatch lines for pen plotters

**Key Features:**
- 20+ fill patterns (lines, cross-hatch, wiggle, spiral, Hilbert, Fermat)
- Configurable: spacing, angle, density, pen width
- Polygon union before fill
- Real-time preview
- Weave pattern generation

**Data Flow:**
```
Selected shapes → Extract polygons → Generate hatch lines → Optimize order → Apply to SVG
```

---

### MergeTab - Polygon Operations (1377 lines)

**Purpose:** Boolean operations on shapes

**Key Features:**
- Union, intersection, subtract, XOR
- Hole preservation
- Edge-based touching detection
- Batch merge operations

**External Dependency:** `polygon-clipping` library

---

### OrderTab - Line Order Optimization (838 lines)

**Purpose:** Minimize pen travel distance for plotters

**Key Features:**
- Nearest-neighbor TSP approximation
- Color grouping (simulate pen changes)
- Chunked optimization for >10K lines
- Travel distance reduction calculation

**Data Structure:**
```typescript
interface OrderLine {
  x1, y1, x2, y2: number
  color: string
  pathId: string
}
```

---

### ExportTab - Export & Statistics (1487 lines)

**Purpose:** Export optimized SVG with analytics

**Key Features:**
- Plotter optimization options
- Paper size templates (A4, Letter, custom)
- Color palette visualization
- Statistics: elements, paths, colors, operations
- Stroke/fill attribute management

---

### PatternTest - Testing Harness (943 lines)

**Purpose:** Stress-test fill patterns

| Component | Lines | Purpose |
|-----------|-------|---------|
| `PatternTest.tsx` | 594 | Main harness |
| `PatternGrid.tsx` | 66 | Grid display |
| `StressTestViewport.tsx` | 236 | Complex shapes |
| `TortureTestReport.tsx` | 76 | Performance report |

**Independent** - Does not use AppContext

---

## Context System

```
┌─────────────────────────────────────────────────────────────┐
│                      AppProvider                             │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐          │
│  │ SVGContext  │ │ LayerContext │ │CanvasContext│          │
│  │ - content   │ │ - nodes      │ │ - scale     │          │
│  │ - dims      │ │ - selection  │ │ - offset    │          │
│  │ - rebuild   │ │ - nodeIndex  │ │ - crop      │          │
│  └─────────────┘ └──────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐          │
│  │ToolContext  │ │  UIContext   │ │ FillContext │          │
│  │ - activeTool│ │ - activeTab  │ │ - targets   │          │
│  │ - settings  │ │ - loading    │ │ - orderData │          │
│  │ - handlers  │ │ - status     │ │ - weave     │          │
│  └─────────────┘ └──────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
         ↓
    useAppContext() ← Legacy compatibility shim
```

### Context Dependencies by Tab

| Tab | SVG | Layer | Canvas | Tool | UI | Fill |
|-----|-----|-------|--------|------|-----|------|
| SortTab | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| FillTab | ✓ | ✓ | ✓ | | ✓ | ✓ |
| MergeTab | ✓ | ✓ | | | ✓ | |
| OrderTab | | | ✓ | | | ✓ |
| ExportTab | ✓ | ✓ | | ✓ | | |

---

## Shared Components

### UnifiedLayerList (340 lines)

Primary reusable list component.

| Feature | Description |
|---------|-------------|
| Tree/Flat modes | Hierarchical or flat list |
| Multi-select | Shift/Cmd modifiers |
| Drag-drop | Reorder with useDragDrop |
| Custom badges | Domain-specific indicators |

**Used By:** MergeTab, OrderTab, FillTab

### Other Shared Components

| Component | Lines | Used By |
|-----------|-------|---------|
| `StatSection` | 55 | SortTab, OrderTab, ExportTab |
| `ColorSwatch` | 102 | SortTab, ExportTab |
| `Rulers` | 301 | SortTab, FillTab |
| `ScaleControls` | 274 | SortTab, FillTab |
| `ColorPickerPopup` | 141 | SortTab, LayerTree |

---

## Utility Modules

| Module | Lines | Purpose |
|--------|-------|---------|
| `geometry/` | 1100+ | Path parsing, polygon ops, clipping |
| `svgDimensions/` | 700+ | ViewBox, unit conversion |
| `colorDistance/` | 615 | K-means clustering, palette ops |
| `cropSVG/` | 600+ | SVG cropping with clipping |
| `fillPatterns/` | 500+ | Hatch line generation |
| `pathAnalysis/` | 500+ | Subpath parsing, diagnostics |
| `svgParser/` | 400+ | Progressive SVG parsing |
| `svgTransform.ts` | 244 | Scale, rotate, translate |
| `nodeUtils.ts` | 250 | Tree navigation |
| `pathSimplify.ts` | 203 | Ramer-Douglas-Peucker |

---

## Data Flow: Import → Export

```
┌─────────────┐    ┌───────────────┐    ┌─────────────────────┐
│  FileUpload │───▶│ ImportDialog  │───▶│ parseSVGFlat        │
│  (drag/drop)│    │ (options)     │    │ Progressively()     │
└─────────────┘    └───────────────┘    └─────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    LayerContext.layerNodes                   │
│  SVGNode[] - Hierarchical tree with DOM element references   │
└─────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│   SortTab   │    │   FillTab    │    │  MergeTab    │
│  (edit tree)│    │(add patterns)│    │(union shapes)│
└─────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
                   ┌──────────────────┐
                   │ rebuildSvgFrom   │
                   │ Layers()         │
                   └──────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    SVGContext.svgContent                     │
│  Serialized SVG string with all modifications                │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │    ExportTab     │───▶ Download .svg
                   │  (stats, export) │
                   └──────────────────┘
```

---

## Layer Selection & Manipulation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ SELECTION FLOW                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ User clicks layer in LayerTree:                                 │
│   └─ LayerNode.tsx onClick handler                             │
│                                                                  │
│ Selection logic (useLayerSelection):                            │
│   ├─ Single click: set selectedNodeIds = {id}                  │
│   ├─ Shift+click: range select from lastSelectedNodeId to id   │
│   ├─ Ctrl/Cmd+click: toggle id in set                          │
│   └─ Double-click: enter edit mode                             │
│                                                                  │
│ Context update:                                                │
│   ├─ setSelectedNodeIds(Set<string>)                           │
│   ├─ setLastSelectedNodeId(id) for range support               │
│   └─ LayerContext notifies all subscribers                     │
│                                                                  │
│ Dependent Components Update:                                   │
│   ├─ UnifiedLayerList: highlight selected items                │
│   ├─ SVGCanvas: highlight paths                                │
│   ├─ Header buttons: enable/disable based on selection         │
│   ├─ SortTab: enable operations on selection                   │
│   └─ StatusBar: show selection count                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Core Data Structures

### SVGNode

```typescript
interface SVGNode {
  id: string
  name: string
  element: Element
  isGroup: boolean
  children: SVGNode[]
  fillColor?: string
  customMarkup?: string
  optimizationState?: {
    fillApplied?: { pattern: string; lineCount: number; timestamp: number }
    orderOptimized?: { improvement: number; timestamp: number }
  }
}
```

### HatchLine (Fill Pattern)

```typescript
interface HatchLine {
  x1: number; y1: number; x2: number; y2: number
  color: string
}
```

### PolygonWithHoles (Geometry)

```typescript
type PolygonWithHoles = Point[][] // [outerRing, hole1, hole2, ...]
type Point = { x: number; y: number }
```

---

## Design Patterns

1. **Hook Extraction** - Complex logic in custom hooks (SortTab has 9)
2. **CustomMarkup Pattern** - `node.customMarkup` preserves optimizations
3. **Progressive Parsing** - Streams large SVGs with progress callbacks
4. **Immutable Updates** - `setLayerNodes(newTree)` + `rebuildSvgFromLayers()`
5. **Code Splitting** - React.lazy() for each tab
6. **UnifiedLayerList** - Generic list abstraction reused across tabs

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
