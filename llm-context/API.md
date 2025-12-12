# SVG Grouper - API Reference

## Context APIs

### SVGContext (`src/context/SVGContext.tsx`)

```typescript
// Rebuild SVG from layer tree
rebuildSvgFromLayers(nodes: SVGNode[], setLayerNodes: (nodes: SVGNode[]) => void): void

// Sync canvas content to state
syncSvgContent(): void

// Get current SVG content
svgContent: string

// SVG dimensions
svgDimensions: { width: number; height: number; viewBox: string }
```

### LayerContext (`src/context/LayerContext.tsx`)

```typescript
// Layer tree (root nodes)
layerNodes: SVGNode[]
setLayerNodes: (nodes: SVGNode[]) => void

// Selection state
selectedNodeIds: Set<string>
setSelectedNodeIds: (ids: Set<string>) => void

// O(1) node lookup via memoized index
getNodeById(id: string): SVGNode | undefined

// Last selected (for shift-click range)
lastSelectedNodeId: string | null
setLastSelectedNodeId: (id: string | null) => void
```

### CanvasContext (`src/context/CanvasContext.tsx`)

```typescript
scale: number
setScale: (s: number) => void
offset: { x: number; y: number }
setOffset: (o: { x: number; y: number }) => void
showCrop: boolean
cropAspectRatio: string    // '1:1', '16:9', etc.
cropSize: number           // 0-100 percentage
```

---

## Tree Navigation (`src/utils/nodeUtils.ts`)

```typescript
// Find node by ID (O(n) tree search)
findNodeById(nodes: SVGNode[], id: string): SVGNode | null

// Find parent of node
findParentNode(nodes: SVGNode[], id: string): SVGNode | null

// Immutable update
updateNodeById(
  nodes: SVGNode[],
  id: string,
  updater: (node: SVGNode) => SVGNode
): SVGNode[]

// Remove node from tree
removeNodeById(nodes: SVGNode[], id: string): SVGNode[]

// Insert node at position
insertNodeAtPosition(
  nodes: SVGNode[],
  targetId: string,
  nodeToInsert: SVGNode,
  position: 'before' | 'after' | 'inside'
): SVGNode[]

// DFS traversal
traverseNodes(
  nodes: SVGNode[],
  callback: (node: SVGNode, parent: SVGNode | null) => void
): void

// Hide all except selected
isolateNodes(nodes: SVGNode[], selectedIds: Set<string>): SVGNode[]

// Show all hidden nodes
showAllNodes(nodes: SVGNode[]): SVGNode[]
```

---

## Geometry APIs (`src/utils/geometry/`)

### Path Parsing (`pathParsing.ts`)

```typescript
// Split compound path into subpaths
parsePathIntoSubpaths(pathD: string): Subpath[]

// Convert subpaths to path strings
getSubpathsAsPathStrings(subpaths: Subpath[]): string[]

// Parse path to points
parsePathToPoints(pathD: string): Point[]
```

### Polygon Operations (`polygonAnalysis.ts`)

```typescript
// Extract polygons with holes from subpaths
getPolygonsFromSubpaths(subpaths: Subpath[]): PolygonWithHoles[]

// Identify outer rings vs holes
identifyOuterAndHoles(polygons: Point[][]): { outer: Point[][]; holes: Point[][] }

// Check if polygon contains point
pointInPolygon(point: Point, polygon: Point[]): boolean
```

### Line Optimization (`plotterOptimization.ts`)

```typescript
// Nearest-neighbor TSP approximation
optimizeLineOrder(lines: OrderLine[]): OrderLine[]

// Multi-pass chunked optimization for large sets
optimizeLineOrderMultiPass(
  lines: OrderLine[],
  boundingBox: BoundingBox,
  options?: { chunkSize?: number; passes?: number }
): { lines: OrderLine[]; improvement: number }

// Calculate total travel distance
calculateTravelDistance(lines: OrderLine[]): number
```

### Clipping (`clipping.ts`)

```typescript
// Clip polygon to rectangle
clipPolygonToRect(
  polygon: Point[],
  rect: { x: number; y: number; width: number; height: number }
): Point[]

// Clip lines to rectangle
clipLinesToRect(
  lines: HatchLine[],
  rect: { x: number; y: number; width: number; height: number }
): HatchLine[]
```

---

## Color Operations (`src/utils/colorDistance/`)

### Color Extraction

```typescript
// Get unique colors from nodes
extractGroupColors(nodes: SVGNode[]): string[]

// Parse color string to RGB
parseColor(color: string): { r: number; g: number; b: number } | null
```

### Color Merging (`clustering.ts`)

```typescript
// Merge similar colors within tolerance
executeMergeColors(
  nodes: SVGNode[],
  tolerance: number,          // 0-100
  svgElement: SVGElement
): { merged: number; remaining: number }

// Reduce to N colors via K-means
executeReducePalette(
  nodes: SVGNode[],
  targetCount: number,
  svgElement: SVGElement
): { original: number; reduced: number }
```

### Distance Metrics (`distanceMetrics.ts`)

```typescript
// RGB Euclidean distance
rgbDistance(c1: RGB, c2: RGB): number

// LAB perceptual distance (more accurate)
labDistance(c1: LAB, c2: LAB): number
```

---

## Electron IPC (`window.electron`)

### Fill Generation

```typescript
// Generate fill patterns via rat-king
window.electron.generateFills(params: FillGenerationParams): Promise<{
  success: boolean
  fills: Array<{ id: string; svg: string; lineCount: number }>
  error?: string
}>

// Optimize fill line order
window.electron.optimizeFillLines(lines: HatchLine[]): Promise<{
  lines: HatchLine[]
  improvement: number
}>

// Get pattern banner preview
window.electron.patternBanner(args: {
  pattern: string
  width: number
  height: number
}): Promise<string>
```

### SVG Operations

```typescript
// Normalize SVG coordinates to 0,0 origin
window.electron.normalizeSVG(args: NormalizeSVGArgs): Promise<string>

// Crop SVG to rectangle
window.electron.cropSVG(args: CropSVGArgs): Promise<string>

// Flatten shapes by color
window.electron.flattenShapes(args: FlattenShapesArgs): Promise<string>
```

### File Operations

```typescript
// Export multiple files (by color)
window.electron.exportMultipleFiles(args: ExportFilesArgs): Promise<{
  success: boolean
  savedCount: number
}>

// Open file dialog
window.electron.openFile(): Promise<FileOpenedData>

// Save file dialog
window.electron.saveFile(content: string, defaultName: string): Promise<boolean>
```

---

## Hooks

### useArrangeTools (`src/hooks/useArrangeTools.ts`)

```typescript
const {
  handleMoveUp,        // Move selected up in tree
  handleMoveDown,      // Move selected down
  handleBringToFront,  // Move to top of parent
  handleSendToBack     // Move to bottom of parent
} = useArrangeTools({
  selectedNodeIds: Set<string>,
  layerNodes: SVGNode[],
  setLayerNodes: (nodes: SVGNode[]) => void,
  rebuildSvgFromLayers: (nodes: SVGNode[]) => void
})
```

### usePanZoom (`src/hooks/usePanZoom.ts`)

```typescript
const {
  isPanning: boolean,
  containerRef: RefObject<HTMLDivElement>,
  handlers: {
    onMouseDown: (e: MouseEvent) => void,
    onMouseMove: (e: MouseEvent) => void,
    onMouseUp: () => void,
    onWheel: (e: WheelEvent) => void
  }
} = usePanZoom({
  externalState: {
    scale: number,
    setScale: (s: number) => void,
    offset: { x: number; y: number },
    setOffset: (o: { x: number; y: number }) => void
  }
})
```

### useLayerSelection (`src/hooks/useLayerSelection.ts`)

```typescript
const {
  toggleSelection,     // Cmd/Ctrl click
  selectRange,         // Shift click
  selectAll,           // Select all visible
  clearSelection       // Deselect all
} = useLayerSelection({
  selectedNodeIds: Set<string>,
  setSelectedNodeIds: (ids: Set<string>) => void,
  lastSelectedNodeId: string | null,
  setLastSelectedNodeId: (id: string | null) => void
})
```

### useFlattenAll (`src/hooks/useFlattenAll.ts`)

```typescript
// Double-click to flatten hierarchy
const handleFlattenAll = useFlattenAll({
  layerNodes: SVGNode[],
  setLayerNodes: (nodes: SVGNode[]) => void,
  setSelectedNodeIds: (ids: Set<string>) => void,
  rebuildSvgFromLayers: (nodes: SVGNode[]) => void,
  flattenArmed: boolean,
  setFlattenArmed: (armed: boolean) => void,
  setStatusMessage: (msg: string) => void
})
```

---

## SVG Parser (`src/utils/svgParser/`)

### Progressive Parsing

```typescript
// Parse large SVG with progress callback
parseSVGFlatProgressively(
  svgElement: SVGElement,
  onProgress: (progress: number, status: string) => void
): Promise<SVGNode[]>

// Parse single element
parseElement(element: Element): SVGNode

// Extract element metadata
getElementName(element: Element): string
getElementColor(element: Element): string | null
```

---

## Fill Pattern Types

Available patterns (passed to `generateFills`):

```
lines, crosshatch, zigzag, spiral, concentric,
hilbert, fermat, honeycomb, brick, wave,
diamond, triangle, hexagon, square, circle,
random, stipple, voronoi, delaunay
```

Pattern parameters:
```typescript
interface FillGenerationParams {
  paths: FillPathInput[]
  pattern: string
  spacing: number       // Line spacing in px
  angle: number         // Rotation in degrees
  penWidth: number      // Stroke width
  unionBeforeFill?: boolean
}
```
