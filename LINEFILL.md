# Line Fill Patterns for Pen Plotter Rendering

## Problem Statement

Pen plotters draw lines, not filled areas. When you have an SVG with solid fills (like `fill="#000000"`), the plotter can only trace the outline. To render the *appearance* of a solid fill, we need to replace fill areas with a pattern of parallel lines (hatching) that the pen can physically draw.

## Goal

Create a "Line Fill" feature that:
1. Takes a selected layer/group containing filled shapes
2. Generates a pattern of parallel lines at a configurable angle and spacing
3. Clips those lines to only the portions that intersect the filled shapes
4. Outputs clean stroke paths (no fills) suitable for pen plotting

---

## Algorithm Overview

### High-Level Approach

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Input Shape    │ ──► │  Generate Line   │ ──► │  Boolean Clip   │
│  (filled path)  │     │  Pattern Grid    │     │  (intersection) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Output Strokes │
                                                 │  (hatched fill) │
                                                 └─────────────────┘
```

### Step-by-Step Algorithm

#### 1. Extract Shape Geometry
- Get the bounding box of the target shape
- Convert SVG path to a polygon/path representation suitable for boolean operations
- Handle compound paths (paths with holes)

#### 2. Generate Hatch Line Pattern
- Calculate the diagonal extent of the bounding box (ensures full coverage at any angle)
- Generate parallel lines spanning this extent
- Parameters:
  - **Spacing**: Distance between lines (typically pen width, e.g., 0.3-0.5mm)
  - **Angle**: 0° = horizontal, 45° = diagonal, 90° = vertical
  - **Offset**: Starting offset for the pattern

```
Diagonal = √(width² + height²)
Number of lines = Diagonal / spacing
```

#### 3. Rotate Lines (if angled hatching)
- Rotate line pattern around the shape's centroid
- Common angles: 0°, 45°, 90°, 135° (or any custom angle)

#### 4. Boolean Intersection (Clipping)
- For each hatch line, compute intersection with the shape polygon
- Result: line segments that are *inside* the shape only
- Handle edge cases:
  - Multiple intersection segments per line (concave shapes)
  - Shapes with holes (subtract inner boundaries)

#### 5. Output Clean Strokes
- Convert clipped segments to SVG `<path>` or `<line>` elements
- Set `fill="none"` and `stroke="currentColor"`
- Optionally optimize path ordering for faster plotting (minimize pen-up travel)

---

## Implementation Options

### Option A: Pure JavaScript (Browser-based)

**Recommended Libraries:**

| Library | Pros | Cons |
|---------|------|------|
| [Paper.js](http://paperjs.org/) | True bezier support, excellent boolean ops | Larger bundle (~300KB) |
| [Clipper.js](https://github.com/junmer/clipper-lib) | Fast, battle-tested, small | Polygons only (must flatten curves) |
| [paper-clipper](https://github.com/northamerican/paper-clipper) | Best of both worlds | Additional dependency |

**Paper.js Approach:**
```javascript
// Pseudocode for Paper.js implementation
import paper from 'paper'

function createLineFill(shapePath, spacing, angle) {
  const bounds = shapePath.bounds
  const diagonal = Math.sqrt(bounds.width ** 2 + bounds.height ** 2)
  const center = bounds.center

  // Create hatch lines
  const lines = []
  for (let offset = -diagonal/2; offset < diagonal/2; offset += spacing) {
    const line = new paper.Path.Line(
      new paper.Point(center.x - diagonal, center.y + offset),
      new paper.Point(center.x + diagonal, center.y + offset)
    )
    line.rotate(angle, center)
    lines.push(line)
  }

  // Clip each line to shape
  const clippedLines = lines.map(line => {
    return line.intersect(shapePath)  // Boolean intersection
  }).filter(result => result && result.length > 0)

  return clippedLines
}
```

**Clipper.js Approach:**
```javascript
// Pseudocode for Clipper.js implementation
import ClipperLib from 'clipper-lib'

function createLineFill(pathPoints, spacing, angle) {
  // 1. Convert shape to Clipper polygon format
  const subjectPolygon = pathPoints.map(p => ({ X: p.x * 1000, Y: p.y * 1000 }))

  // 2. Generate line pattern as thin rectangles (Clipper needs polygons)
  const linePolygons = generateHatchLines(bounds, spacing, angle)

  // 3. Perform intersection
  const clipper = new ClipperLib.Clipper()
  clipper.AddPath(subjectPolygon, ClipperLib.PolyType.ptSubject, true)
  linePolygons.forEach(line => {
    clipper.AddPath(line, ClipperLib.PolyType.ptClip, true)
  })

  const solution = new ClipperLib.Paths()
  clipper.Execute(ClipperLib.ClipType.ctIntersection, solution)

  return solution
}
```

### Option B: External Tool Integration (vpype)

Use [vpype](https://github.com/abey79/vpype) with the [hatched plugin](https://github.com/plottertools/hatched) for preprocessing:

```bash
# Install vpype with hatched plugin
pip install vpype hatched

# Convert fills to hatching
vpype read input.svg hatched --levels 128 --pitch 2 write output.svg
```

**Integration approach:**
- Export selected layers to temporary SVG
- Shell out to vpype for hatching
- Import result back into the app

### Option C: Scanline Algorithm (Custom Implementation)

Implement a [scanline fill algorithm](https://www.tutorialspoint.com/computer_graphics/polygon_filling_algorithm.htm) from scratch:

```javascript
function scanlineHatch(polygon, spacing, angle) {
  // 1. Rotate polygon to make hatching horizontal
  const rotated = rotatePolygon(polygon, -angle)

  // 2. Find y-extent
  const { minY, maxY } = getBounds(rotated)

  // 3. For each scanline, find intersections
  const segments = []
  for (let y = minY; y <= maxY; y += spacing) {
    const intersections = findEdgeIntersections(rotated.edges, y)
    intersections.sort((a, b) => a.x - b.x)

    // Pair up intersections (entry/exit points)
    for (let i = 0; i < intersections.length; i += 2) {
      if (intersections[i + 1]) {
        segments.push({
          start: intersections[i],
          end: intersections[i + 1]
        })
      }
    }
  }

  // 4. Rotate segments back
  return segments.map(seg => rotateSegment(seg, angle))
}
```

---

## UI/UX Considerations

### Parameters to Expose

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Line Spacing | 2px | 0.5-10px | Distance between hatch lines |
| Angle | 45° | 0-180° | Hatching direction |
| Cross-hatch | off | on/off | Add perpendicular lines for denser fill |
| Inset | 0px | 0-5px | Shrink shape before hatching (prevents overflow) |

### Workflow in SVG Grouper

1. User selects a layer/group with fills
2. User clicks "Line Fill" button (or right-click menu)
3. Options panel appears with spacing/angle controls
4. Preview shows hatching in real-time
5. User confirms → filled shapes replaced with hatched strokes

### Before/After Example

**Before (filled shape):**
```svg
<path d="M10,10 L90,10 L90,90 L10,90 Z" fill="#000000" />
```

**After (hatched strokes):**
```svg
<g class="linefill-group">
  <path d="M10,10 L90,10 L90,90 L10,90 Z" fill="none" stroke="#000000" />
  <line x1="10" y1="15" x2="90" y2="15" stroke="#000000" />
  <line x1="10" y1="20" x2="90" y2="20" stroke="#000000" />
  <line x1="10" y1="25" x2="90" y2="25" stroke="#000000" />
  <!-- ... more lines ... -->
</g>
```

---

## Edge Cases & Challenges

### 1. Curved Paths (Beziers)
- **Problem**: Boolean operations on beziers are complex
- **Solution A**: Use Paper.js (handles beziers natively)
- **Solution B**: Flatten curves to polylines first (with configurable tolerance)

### 2. Compound Paths (Holes)
- **Problem**: A shape like a donut has an outer boundary and inner hole
- **Solution**: Use even-odd or non-zero fill rule; subtract holes from hatching

### 3. Self-Intersecting Paths
- **Problem**: Some shapes cross themselves
- **Solution**: Normalize path first, or use robust library (Clipper handles this)

### 4. Very Small Shapes
- **Problem**: Spacing larger than shape = no lines
- **Solution**: Warn user, or auto-adjust spacing

### 5. Performance
- **Problem**: Many shapes × many lines = slow
- **Solution**:
  - Use spatial indexing (R-tree) for intersection tests
  - Process in web worker to avoid UI freeze
  - Show progress indicator

---

## Recommended Implementation Path

### Phase 1: MVP (Minimum Viable Product)
1. Add Paper.js as dependency
2. Implement basic horizontal hatching for selected paths
3. Single spacing control
4. Replace original fill with hatched strokes

### Phase 2: Enhanced Features
1. Add angle control
2. Add cross-hatching option
3. Real-time preview
4. Path optimization (minimize pen travel)

### Phase 3: Advanced
1. Variable density hatching (darker = tighter spacing)
2. Contour-following hatching (lines follow shape curves)
3. Custom pattern support (stippling, waves, etc.)

---

## References & Resources

### Libraries
- [Paper.js Boolean Operations](http://paperjs.org/reference/path/#intersect-path)
- [JavaScript Clipper](https://github.com/junmer/clipper-lib)
- [paper-clipper](https://github.com/northamerican/paper-clipper) - Combines Paper.js with Clipper

### Algorithms
- [Scanline Fill Algorithm](https://www.tutorialspoint.com/computer_graphics/polygon_filling_algorithm.htm)
- [DIY SVG Hatching](https://observablehq.com/@plmrry/diy-svg-hatching) - Observable notebook
- [Simple SVG Hatching](https://observablehq.com/@plmrry/simple-svg-hatching) - Paul Murray

### Plotter-Specific
- [vpype](https://github.com/abey79/vpype) - Swiss-army knife for plotter graphics
- [hatched plugin](https://github.com/plottertools/hatched) - vpype plugin for image hatching
- [Optimal Path Planning for Pen Plotters](https://engineerdog.com/2021/08/18/optimal-path-planning-and-hatch-filling-for-pen-plotters/)
- [Shapely Hatching Example](https://gis.stackexchange.com/questions/91362/looking-for-a-simple-hatching-algorithm) - Python/GIS approach

### Discussions
- [Boolean Operations on SVG Paths (Stack Overflow)](https://stackoverflow.com/questions/15035884/boolean-operations-on-svg-paths)
- [SVG-Edit Boolean Operations Discussion](https://github.com/SVG-Edit/svgedit/discussions/785)

---

## File Structure for Implementation

```
src/
├── utils/
│   └── lineFill.ts          # Core hatching algorithm
├── components/
│   └── LineFillPanel.tsx    # UI controls for hatching options
└── workers/
    └── lineFillWorker.ts    # Web worker for heavy computation (optional)
```

---

## Next Steps

1. [ ] Choose implementation approach (Paper.js recommended for bezier support)
2. [ ] Install dependencies: `npm install paper`
3. [ ] Create `src/utils/lineFill.ts` with core algorithm
4. [ ] Add UI button and options panel
5. [ ] Integrate with existing layer selection system
6. [ ] Test with various SVG shapes (simple, complex, compound)
