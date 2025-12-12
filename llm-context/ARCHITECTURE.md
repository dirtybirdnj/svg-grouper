# SVG Grouper - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   main.ts   │  │ preload.ts  │  │   fillGenerator.ts      │  │
│  │   Window    │  │   IPC       │  │   rat-king CLI bridge   │  │
│  │   Menu      │  │   Bridge    │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    IPC (contextBridge)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      React Renderer Process                       │
│                                                                   │
│  ┌───────────────────── App.tsx ─────────────────────────────┐  │
│  │                    Main Orchestrator                        │  │
│  │  - Tab routing                                              │  │
│  │  - Header with zoom/tool controls                          │  │
│  │  - Selection-dependent button states                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│  ┌───────────────────────────┴───────────────────────────────┐   │
│  │                    AppProvider (6 Contexts)                │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐          │   │
│  │  │  SVG    │ │  Layer  │ │ Canvas  │ │  Tool  │          │   │
│  │  │ Context │ │ Context │ │ Context │ │ Context│          │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘          │   │
│  │  ┌─────────┐ ┌─────────┐                                  │   │
│  │  │   UI    │ │  Fill   │                                  │   │
│  │  │ Context │ │ Context │                                  │   │
│  │  └─────────┘ └─────────┘                                  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────┴───────────────────────────────┐   │
│  │                      Tab Components                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │   │
│  │  │ SortTab │ │MergeTab │ │ FillTab │ │OrderTab │         │   │
│  │  │  3032L  │ │  1377L  │ │  2363L  │ │  838L   │         │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │   │
│  │  ┌─────────┐                                              │   │
│  │  │ExportTab│                                              │   │
│  │  │  1487L  │                                              │   │
│  │  └─────────┘                                              │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────── Utilities ────────────────────────────┐   │
│  │  geometry/   svgParser/   colorDistance/   cropSVG/       │   │
│  │  nodeUtils   pathAnalysis/   fillPatterns/   svgDimensions│   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Import Flow

```
User drops SVG file
        │
        ▼
FileUpload.tsx (drag/drop handler)
        │
        ▼
parseSVGFlatProgressively()
  - Streaming parse with progress callback
  - Creates SVGNode tree
        │
        ▼
setLayerNodes(nodes)
  - Updates LayerContext
  - Triggers memoized nodeIndex rebuild
        │
        ▼
UI renders layer tree + canvas preview
```

### 2. Edit Flow

```
User modifies layer (toggle visibility, reorder, etc.)
        │
        ▼
updateNodeById(nodes, id, updater)
  - Immutable tree update
        │
        ▼
setLayerNodes(updatedNodes)
        │
        ▼
rebuildSvgFromLayers(updatedNodes)
  - Serializes nodes to SVG string
  - Uses customMarkup if present
        │
        ▼
setSvgContent(newSvg)
        │
        ▼
Canvas re-renders with new content
```

### 3. Fill Pattern Flow

```
User selects shapes, chooses pattern, clicks Generate
        │
        ▼
FillTab extracts polygons from selected nodes
  - parsePathIntoSubpaths()
  - getPolygonsFromSubpaths()
        │
        ▼
window.electron.generateFills(params)
        │
        ▼
[Electron Main Process]
fillGenerator.ts spawns rat-king CLI
  - rat-king fill --pattern lines --spacing 5 ...
        │
        ▼
Returns SVG markup with hatch lines
        │
        ▼
Node.customMarkup = generated SVG
Node.optimizationState.fillApplied = {...}
        │
        ▼
rebuildSvgFromLayers()
  - Uses customMarkup for filled nodes
```

### 4. Order Optimization Flow

```
User navigates to OrderTab
        │
        ▼
OrderTab extracts OrderLine[] from visible paths
  - Each line: { x1, y1, x2, y2, color, pathId }
        │
        ▼
optimizeLineOrderMultiPass(lines, boundingBox)
  - Nearest-neighbor TSP approximation
  - Chunked processing for large sets
        │
        ▼
Returns optimized lines + improvement %
        │
        ▼
User clicks Apply
        │
        ▼
Nodes reordered in tree based on line order
rebuildSvgFromLayers()
```

---

## Context Architecture

### Split Context Design

The app uses 6 specialized contexts instead of one monolithic AppContext:

```
AppProvider
├── SVGProvider
│   └── svgContent, svgDimensions, rebuildSvgFromLayers
├── LayerProvider
│   └── layerNodes, selectedNodeIds, getNodeById (O(1))
├── CanvasProvider
│   └── scale, offset, showCrop, cropSettings
├── ToolProvider
│   └── activeTool, patternSettings, colorTolerance
├── UIProvider
│   └── activeTab, loadingState, statusMessage
└── FillProvider
    └── fillTargetNodeIds, orderData, weaveRequested
```

**Benefits:**
- Components only re-render when their context changes
- Clearer separation of concerns
- Easier testing

### Legacy Compatibility

```typescript
// useAppContext() provides combined access for gradual migration
const { layerNodes, svgContent, scale } = useAppContext()
// Internally pulls from all 6 contexts
```

### O(1) Node Lookup

LayerContext maintains a memoized index:

```typescript
// Rebuilt when layerNodes changes
const nodeIndex = useMemo(() => {
  const index = new Map<string, SVGNode>()
  traverseNodes(layerNodes, node => index.set(node.id, node))
  return index
}, [layerNodes])

// O(1) lookup
const getNodeById = useCallback((id: string) => {
  return nodeIndex.get(id)
}, [nodeIndex])
```

---

## Component Relationships

### Tab → Shared Component Usage

```
SortTab
├── FileUpload (import)
├── LayerTree (hierarchy view)
├── SVGCanvas (preview)
├── StatusBar
└── 9 custom hooks

FillTab
├── UnifiedLayerList (flat selection)
├── SVGCanvas (preview)
├── Rulers
├── ScaleControls
└── Pattern controls

MergeTab
├── UnifiedLayerList (shape selection)
├── Boolean operation buttons
└── Preview canvas

OrderTab
├── OrderVisualization (gradient display)
├── Statistics display
└── Algorithm controls

ExportTab
├── Paper size selector
├── Margin controls
├── Preview canvas
└── Color palette display
```

### Shared Components

```
shared/
├── UnifiedLayerList    # Generic list with selection, drag-drop
├── ColorSwatch         # Color display + picker
├── Rulers              # Measurement rulers
├── ScaleControls       # Zoom controls
└── StatSection         # Consistent stats display
```

---

## State Update Patterns

### Immutable Tree Updates

```typescript
// Always create new objects, never mutate
const updated = updateNodeById(nodes, id, node => ({
  ...node,
  isHidden: !node.isHidden
}))
setLayerNodes(updated)
```

### Selection State

```typescript
// Set-based for O(1) operations
selectedNodeIds: Set<string>

// Multi-select patterns:
// Single click
setSelectedNodeIds(new Set([id]))

// Cmd/Ctrl click (toggle)
const newSet = new Set(selectedNodeIds)
if (newSet.has(id)) newSet.delete(id)
else newSet.add(id)
setSelectedNodeIds(newSet)

// Shift click (range)
const range = getNodesInRange(lastSelectedId, id)
setSelectedNodeIds(new Set(range.map(n => n.id)))
```

### CustomMarkup Pattern

When a node has been processed (fill, optimization), store result:

```typescript
node.customMarkup = '<g>processed SVG content</g>'

// During rebuild:
if (node.customMarkup) {
  return node.customMarkup  // Use processed content
} else {
  return serializeElement(node.element)  // Original
}
```

---

## Electron IPC Architecture

### Context Bridge

```typescript
// preload.ts exposes safe API
contextBridge.exposeInMainWorld('electron', {
  generateFills: (params) => ipcRenderer.invoke('generate-fills', params),
  optimizeFillLines: (lines) => ipcRenderer.invoke('optimize-fill-lines', lines),
  cropSVG: (args) => ipcRenderer.invoke('crop-svg', args),
  // ...
})
```

### Main Process Handlers

```typescript
// main.ts registers handlers
ipcMain.handle('generate-fills', async (event, params) => {
  return await fillGenerator.generate(params)
})
```

### rat-king Integration

```typescript
// fillGenerator.ts
export async function generate(params: FillGenerationParams) {
  const args = [
    'fill',
    '--pattern', params.pattern,
    '--spacing', params.spacing.toString(),
    '--angle', params.angle.toString(),
    '--stdin'  // Read SVG from stdin
  ]

  const result = await spawn('rat-king', args, {
    input: svgContent
  })

  return parseFillResult(result.stdout)
}
```

---

## Performance Optimizations

### 1. Progressive Parsing
Large SVGs parsed in chunks with progress feedback.

### 2. Memoized Node Index
O(1) lookup instead of O(n) tree traversal.

### 3. Chunked Line Optimization
```typescript
const CHUNK_SIZE = 5000
if (lines.length > CHUNK_SIZE) {
  // Process in spatial chunks
  // Merge results
}
```

### 4. Lazy Tab Loading
```typescript
const SortTab = lazy(() => import('./tabs/SortTab'))
// Loaded only when tab activated
```

### 5. Canvas Transform vs Redraw
Pan/zoom uses CSS transform, not SVG regeneration.

---

## Extension Points

### Adding a New Tab

1. Create `src/components/tabs/NewTab/NewTab.tsx`
2. Add to tab enum in `src/types/tabs.ts`
3. Add lazy import in `App.tsx`
4. Add routing in tab switch

### Adding a New Fill Pattern

1. Implement in rat-king (Rust)
2. Add pattern name to FillTab pattern list
3. Pattern automatically available via IPC

### Adding New Context

1. Create `src/context/NewContext.tsx`
2. Add provider to `AppProvider.tsx`
3. Export from `src/context/index.ts`
4. Add to `useAppContext()` if needed

### Adding New Utility

1. Create module in `src/utils/`
2. Export from index if commonly used
3. Import where needed

---

## Error Handling

### IPC Errors
```typescript
try {
  const result = await window.electron.generateFills(params)
  if (!result.success) {
    setStatusMessage(result.error)
  }
} catch (err) {
  setStatusMessage(`Fill generation failed: ${err.message}`)
}
```

### Parsing Errors
```typescript
// Progressive parser catches per-element
try {
  const node = parseElement(element)
  nodes.push(node)
} catch (err) {
  console.warn(`Skipping malformed element: ${err.message}`)
  // Continue with next element
}
```

### UI State
```typescript
// UIContext tracks loading/error state
setLoadingState({
  isLoading: true,
  progress: 0.5,
  status: 'Processing shapes...'
})
```
