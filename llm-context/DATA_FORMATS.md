# SVG Grouper - Data Formats

## Core Types

### SVGNode

The primary data structure representing elements in the layer tree.

```typescript
interface SVGNode {
  // Identity
  id: string                    // Unique nanoid
  type: string                  // 'g', 'path', 'rect', 'circle', etc.
  name: string                  // Display label (from id attr or generated)

  // Structure
  element: Element              // DOM reference
  children: SVGNode[]           // Child nodes (for groups)
  isGroup: boolean              // true for 'g' elements

  // Visibility
  isHidden?: boolean            // Layer visibility toggle

  // Optimization State
  customMarkup?: string         // Custom SVG content (replaces element)
  fillColor?: string            // Color of generated fill lines

  optimizationState?: {
    fillApplied?: {
      pattern: string           // 'lines', 'spiral', etc.
      lineCount: number         // Generated line count
      timestamp: number         // When applied
    }
    orderOptimized?: {
      improvement: number       // % travel distance saved
      timestamp: number
    }
  }
}
```

**Usage patterns:**
- When `customMarkup` is set, rebuild uses it instead of serializing `element`
- `isHidden` controls visibility without removing from tree
- `optimizationState` tracks what operations have been applied

---

### OrderLine

Represents a single line segment for path optimization.

```typescript
interface OrderLine {
  x1: number                    // Start X
  y1: number                    // Start Y
  x2: number                    // End X
  y2: number                    // End Y
  color: string                 // Stroke color (for pen grouping)
  pathId: string                // Source element ID
}
```

---

### OrderData

Data passed to OrderTab for optimization.

```typescript
interface OrderData {
  lines: OrderLine[]
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
  source: 'fill' | 'sort'       // Where data came from
  onApply?: (orderedLines: OrderLine[], improvement: number) => void
}
```

---

### Point & Polygon Types

```typescript
type Point = {
  x: number
  y: number
}

// Simple polygon (ring of points)
type Polygon = Point[]

// Polygon with holes
// First array is outer ring, subsequent arrays are holes
type PolygonWithHoles = Point[][]
```

**Example polygon with hole:**
```typescript
const letterO: PolygonWithHoles = [
  // Outer ring (clockwise)
  [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  // Inner hole (counter-clockwise)
  [{ x: 20, y: 20 }, { x: 20, y: 80 }, { x: 80, y: 80 }, { x: 80, y: 20 }]
]
```

---

### HatchLine

Output format from fill pattern generation.

```typescript
interface HatchLine {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}
```

---

### Subpath

Represents a single subpath within a compound path.

```typescript
interface Subpath {
  commands: PathCommand[]
  closed: boolean
  startPoint: Point
  endPoint: Point
}

interface PathCommand {
  type: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z' | 'H' | 'V'
  points: Point[]
  // For arcs
  rx?: number
  ry?: number
  rotation?: number
  largeArc?: boolean
  sweep?: boolean
}
```

---

## Fill System Types

### FillPathInput

Input to the fill pattern generator.

```typescript
interface FillPathInput {
  id: string                    // Node ID
  color: string                 // Fill color
  polygons: PolygonWithHoles[]  // Shapes to fill
  rawSubpaths?: Point[][]       // For evenodd fill-rule handling
}
```

### FillGenerationParams

Parameters for `window.electron.generateFills()`.

```typescript
interface FillGenerationParams {
  paths: FillPathInput[]
  pattern: string               // Pattern name
  spacing: number               // Line spacing (px)
  angle: number                 // Pattern angle (degrees)
  penWidth: number              // Stroke width
  unionBeforeFill?: boolean     // Union overlapping shapes first
}
```

### FillResult

Response from fill generation.

```typescript
interface FillResult {
  success: boolean
  fills: Array<{
    id: string                  // Source node ID
    svg: string                 // Generated SVG markup
    lineCount: number
  }>
  error?: string
}
```

---

## Context State Types

### LoadingState

```typescript
interface LoadingState {
  isLoading: boolean
  progress: number              // 0-1
  status: string                // Status message
  startTime?: number            // For ETA calculation
  estimatedTimeLeft?: number    // Milliseconds
}
```

### CropState

```typescript
interface CropState {
  showCrop: boolean
  cropAspectRatio: string       // '1:1', '16:9', '2:3', 'free'
  cropSize: number              // 0-100 percentage
  cropPosition: { x: number; y: number }
}
```

---

## Electron IPC Types

### File Operations

```typescript
interface FileOpenedData {
  filePath: string
  content: string
  fileName: string
}

interface ExportFilesArgs {
  files: Array<{
    name: string
    content: string
  }>
  directory: string
}
```

### SVG Operations

```typescript
interface NormalizeSVGArgs {
  svg: string
  targetOrigin?: { x: number; y: number }
}

interface CropSVGArgs {
  svg: string
  cropRect: {
    x: number
    y: number
    width: number
    height: number
  }
}

interface FlattenShapesArgs {
  svg: string
  color: string                 // Color to flatten
}
```

---

## Paper Size Format

From `src/config/paperSizes.json`:

```typescript
interface PaperSize {
  name: string                  // 'A4', 'Letter', etc.
  width: number                 // mm
  height: number                // mm
  category: 'standard' | 'custom'
}
```

**Default sizes:**
```json
[
  { "name": "A4", "width": 210, "height": 297, "category": "standard" },
  { "name": "A3", "width": 297, "height": 420, "category": "standard" },
  { "name": "Letter", "width": 215.9, "height": 279.4, "category": "standard" },
  { "name": "Legal", "width": 215.9, "height": 355.6, "category": "standard" }
]
```

---

## SVG Dimensions

```typescript
interface SVGDimensions {
  width: number                 // Computed width in px
  height: number                // Computed height in px
  viewBox: string               // Original viewBox attribute
  originalWidth?: string        // Original width attribute
  originalHeight?: string       // Original height attribute
}
```

---

## Color Types

```typescript
interface RGB {
  r: number                     // 0-255
  g: number
  b: number
}

interface LAB {
  l: number                     // 0-100 (lightness)
  a: number                     // -128 to 127 (green-red)
  b: number                     // -128 to 127 (blue-yellow)
}

interface ColorInfo {
  color: string                 // Original string
  rgb: RGB
  lab: LAB
  count: number                 // Occurrences in document
}
```

---

## Selection State

```typescript
// Selection is stored as a Set for O(1) lookup
type SelectionState = Set<string>  // Set of node IDs

// Selection patterns:
// - Single click: set to new Set([id])
// - Shift+click: range selection (build Set from range)
// - Cmd/Ctrl+click: toggle - add or remove from Set
```

---

## Tree Update Pattern

Immutable updates use spread operators:

```typescript
// Update single node
const updated = updateNodeById(nodes, id, node => ({
  ...node,
  isHidden: !node.isHidden
}))

// Update children
const updated = updateNodeById(nodes, parentId, parent => ({
  ...parent,
  children: [...parent.children, newChild]
}))
```
