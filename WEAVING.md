# Weaving Feature

A feature to create woven fabric effects by interleaving two pattern layers.

## User Workflow

1. User selects two layers in the node tree (multi-select with Cmd/Ctrl+click)
2. User opens **Tools menu → "Weave Layers"**
3. App generates a woven pattern combining both layers

## Visual Effect

The weaving creates an over/under pattern at intersections:
- Layer A goes "over" Layer B at some intersections
- Layer B goes "over" Layer A at adjacent intersections
- Creates a checkerboard-style weave pattern

```
    Layer A (horizontal)
    ═══════╪═══════╪═══════
           │       │
    ───────╫───────╫───────  Layer B (vertical)
           │       │
    ═══════╪═══════╪═══════
           │       │
```

At each intersection, one layer is drawn on top (later in draw order).

## Technical Implementation

### Algorithm

1. **Input**: Two sets of lines (Layer A, Layer B)

2. **Find intersections**: For each line in A, find all intersections with lines in B
   - Use spatial indexing (grid or R-tree) for efficiency
   - Store intersection points with references to both lines

3. **Assign over/under**: At each intersection, determine which layer is "on top"
   - Use checkerboard pattern based on intersection index
   - Alternating: A-over, B-over, A-over, B-over...

4. **Break lines at intersections**: Split each line into segments
   - Each segment is between two adjacent intersections (or line endpoints)

5. **Reorder segments**: Group segments by their z-order
   - "Under" segments from both layers → draw first
   - "Over" segments from both layers → draw last

6. **Output**: Single ordered list of line segments

### Data Structures

```typescript
interface Intersection {
  point: Point
  lineA: HatchLine      // Line from Layer A
  lineB: HatchLine      // Line from Layer B
  indexAlongA: number   // Position along line A (0-1)
  indexAlongB: number   // Position along line B (0-1)
  aIsOver: boolean      // True if A is on top at this intersection
}

interface WeaveSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  layer: 'A' | 'B'
  isOver: boolean       // Draw order: false = early, true = late
  originalLineId: string
}
```

### Line-Line Intersection

```typescript
function lineIntersection(
  a1: Point, a2: Point,  // Line A
  b1: Point, b2: Point   // Line B
): Point | null {
  const denom = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y)
  if (Math.abs(denom) < 1e-10) return null  // Parallel

  const ua = ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denom
  const ub = ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denom

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null  // Outside segments

  return {
    x: a1.x + ua * (a2.x - a1.x),
    y: a1.y + ua * (a2.y - a1.y)
  }
}
```

### Checkerboard Pattern

To determine over/under at each intersection:

```typescript
function assignOverUnder(intersections: Intersection[]): void {
  // Sort intersections by position for consistent pattern
  intersections.sort((a, b) => {
    if (Math.abs(a.point.y - b.point.y) > 1e-6) return a.point.y - b.point.y
    return a.point.x - b.point.x
  })

  // Build grid of intersections
  // For each row of intersections, alternate A-over/B-over
  // Offset alternation for adjacent rows

  let rowIndex = 0
  let prevY = -Infinity

  for (let i = 0; i < intersections.length; i++) {
    const int = intersections[i]

    // New row?
    if (int.point.y - prevY > tolerance) {
      rowIndex++
      prevY = int.point.y
    }

    // Checkerboard: alternate based on row + column
    int.aIsOver = (rowIndex + i) % 2 === 0
  }
}
```

## Performance Considerations

- **Spatial indexing**: Use grid-based index for intersection finding
- **Line count**: O(n*m) intersections worst case for n×m lines
- **Segment count**: Each intersection adds 2 segments (one per layer)
- **Target**: Handle 10,000+ lines efficiently

## UI Integration

### Menu Item
- Location: Tools menu
- Label: "Weave Layers"
- Enabled: When exactly 2 layers are selected
- Shortcut: (TBD)

### Dialog Options (future)
- Weave pattern: Checkerboard, Twill, Satin
- Gap at intersections: Small gap for visual clarity
- Preview before applying

## Files to Modify

- `src/utils/weaving.ts` - New file for weaving algorithm
- `src/components/tabs/SortTab.tsx` - Add menu handler
- `electron/main/index.ts` - Add menu item
- `src/context/AppContext.tsx` - May need state for weave operation

## Testing

```typescript
// Test case: Simple crosshatch
const layerA = [
  { x1: 0, y1: 50, x2: 100, y2: 50 },  // Horizontal line
]
const layerB = [
  { x1: 50, y1: 0, x2: 50, y2: 100 },  // Vertical line
]

// Expected: 1 intersection at (50, 50)
// Output: 4 segments total
// - A left segment (0,50)→(50,50) - under
// - A right segment (50,50)→(100,50) - over
// - B top segment (50,0)→(50,50) - over
// - B bottom segment (50,50)→(50,100) - under
```
