# Last Session Context

## Session Date: 2025-11-27

## What Was Accomplished

### 1. TSP Path Optimization for Pen Plotters
- Implemented multi-pass optimization algorithm for fill patterns
- Shapes are ordered by proximity starting from top-left (0,0)
- Lines within each shape are optimized using nearest-neighbor algorithm
- Lines can be reversed if it reduces travel distance
- All shapes are completed before moving to the next (no jumping between shapes)

### 2. Order Visualization
- Added red→blue gradient visualization to show plotting order
- Added animated playback to preview the plotting sequence
- Statistics display shows: shape count, line count, original/optimized travel distance, % improvement
- Dashed lines show pen travel between segments

### 3. Multiple Fill Pattern Types
Added 4 fill patterns inspired by 3D printer slicer infill algorithms:

| Pattern | Status | Description |
|---------|--------|-------------|
| **Lines** | ✅ Working | Parallel line hatching with optional cross-hatch |
| **Wiggle** | ✅ Working | Sine wave pattern with adjustable amplitude/frequency |
| **Spiral** | ✅ Working | Archimedean spiral from center outward |
| **Concentric** | ❌ BUG | Causes app to become unresponsive |

---

## BUGS TO FIX

### Concentric Fill Pattern - App Becomes Unresponsive

**Location:** `src/components/tabs/FillTab.tsx`

**Functions involved:**
- `offsetPolygon()` - Line ~331
- `isValidPolygon()` - Line ~392
- `generateConcentricLines()` - Line ~408

**Suspected cause:**
The concentric pattern generates inward polygon offsets in a while loop until the polygon becomes invalid. Possible issues:

1. **Infinite loop** - The `isValidPolygon()` check may not be catching degenerate polygons, causing the loop to never terminate
2. **Self-intersecting polygons** - The simple vertex-normal offset algorithm can create self-intersecting polygons on concave shapes, which may cause issues
3. **Too many iterations** - Even with the safety limit of 1000 loops, if each loop generates many lines, it could overwhelm the browser

**How to debug:**
1. Add console.log in the while loop to see iteration count
2. Test with a simple convex shape (rectangle) first
3. Check if polygon area is actually decreasing each iteration
4. Consider using a more robust polygon offset library like Clipper2

**Potential fixes:**
1. Use Clipper2 library (used by PrusaSlicer, Cura) for robust polygon offsetting
2. Add better termination conditions (check for self-intersection, minimum vertex count)
3. Limit total line count, not just loop count
4. Process in web worker to avoid blocking UI

---

## FUTURE ENHANCEMENTS

### Additional Fill Patterns to Investigate

Research these patterns from 3D printer slicers (OrcaSlicer, PrusaSlicer, Cura):

| Pattern | Description | Algorithm |
|---------|-------------|-----------|
| **Honeycomb** | Hexagonal grid pattern | Generate hex grid, clip to polygon |
| **Gyroid** | Triply periodic minimal surface | `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0` |
| **Grid** | Perpendicular lines (like cross-hatch) | Already have as cross-hatch option |
| **Triangular** | Lines at 0°, 60°, 120° | Three-pass line generation |
| **Cubic** | 3D-inspired pattern | Line-based with Z-dependent shifting |
| **Hilbert Curve** | Space-filling fractal | Recursive fractal generation |
| **Lightning** | Tree-based support structure | Top-down branching algorithm |

### Key Resources Found During Research

- **Clipper2 Library**: https://github.com/AngusJohnson/Clipper2
  - Robust polygon clipping and offsetting
  - Used by all major slicers
  - Has JavaScript port available

- **PrusaSlicer Fill Source Code**:
  - `src/libslic3r/Fill/FillGyroid.cpp`
  - `src/libslic3r/Fill/FillConcentric.cpp`
  - `src/libslic3r/Fill/FillHoneycomb.cpp`

- **CuraEngine Source**:
  - `src/infill.cpp`
  - `src/infill/GyroidInfill.cpp`

- **Gyroid Math**:
  - Implicit surface: `sin(x)·cos(y) + sin(y)·cos(z) + sin(z)·cos(x) = 0`
  - For 2D slice at height z, solve for x,y pairs
  - Use adaptive refinement for smooth curves

---

## Code Structure Overview

### Fill Tab (`src/components/tabs/FillTab.tsx`)

**Pattern Generation Functions:**
- `generateGlobalHatchLines()` - Creates parallel lines at angle
- `clipLinesToPolygon()` - Clips lines to polygon boundary
- `generateConcentricLines()` - ❌ BUG - Outside-in loops
- `generateWiggleLines()` - Sine wave pattern
- `generateSpiralLines()` - Archimedean spiral

**Optimization Functions:**
- `optimizeLinesWithinShape()` - TSP within single shape
- `optimizeLineOrderMultiPass()` - Orders shapes, then optimizes within each
- `calculateTravelDistance()` - Measures total pen travel

**Helper Functions:**
- `getPolygonPoints()` - Extracts points from SVG elements
- `offsetPolygon()` - Vertex-normal based offset (simple, potentially buggy)
- `isValidPolygon()` - Checks polygon area
- `pointInPolygon()` - Ray casting point-in-polygon test

### CSS (`src/components/tabs/FillTab.css`)
- Pattern selector: `.pattern-selector`, `.pattern-btn`
- Order visualization: `.order-stats`, `.animate-btn`
- Preview label gradient: `.preview-label.order`

---

## Testing Notes

- Spiral pattern generates beautiful results on the pac-man style shapes
- Wiggle pattern works well with amplitude 3, frequency 2
- TSP optimization shows significant travel reduction (check stats panel)
- Test concentric fix with simple shapes first (rectangles, circles)
