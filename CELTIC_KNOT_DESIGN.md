# Celtic Knot Pattern Generation

Research notes for implementing Celtic knotwork patterns as fill shapes for pen plotter output.

Based on: Fisher, G. & Mellor, B. (2004) "On the Topology of Celtic Knot Designs"

## Overview

Celtic knotwork consists of interlacing ribbons that weave over and under each other in an alternating pattern. The visual effect requires:
1. **Ribbon shapes** - The strands themselves (foreground)
2. **Gap regions** - Where ribbons pass "under" (background showing through)
3. **Border outlines** - Edge lines defining ribbon boundaries

For pen plotting with line fills, we generate closed polygon shapes and fill them with different patterns/densities to create the over/under illusion.

---

## Core Construction Algorithm

### 1. Grid Setup

```
GRID PARAMETERS:
  p = number of rows
  q = number of columns
  cell_size = size of each grid cell
  ribbon_width = width of the interlacing ribbon (typically cell_size * 0.3)

DERIVED VALUES:
  grid_width = q * cell_size
  grid_height = p * cell_size
  num_components = gcd(p, q)  // number of separate closed loops
```

### 2. Diamond Lattice Construction

Each grid cell contains an inscribed diamond (square rotated 45°) with vertices at the midpoints of the cell edges.

```
function createDiamondLattice(p, q, cell_size):
  diamonds = []

  for row in 0..p-1:
    for col in 0..q-1:
      // Cell corners
      x0 = col * cell_size
      y0 = row * cell_size
      x1 = x0 + cell_size
      y1 = y0 + cell_size

      // Diamond vertices (midpoints of cell edges)
      diamond = [
        (x0 + cell_size/2, y0),           // top
        (x1, y0 + cell_size/2),           // right
        (x0 + cell_size/2, y1),           // bottom
        (x0, y0 + cell_size/2)            // left
      ]
      diamonds.push(diamond)

  return diamonds
```

### 3. Crossing Point Generation

Where two diamonds meet, we create a crossing. The over/under rule:
- **Vertical meeting** (diamonds above/below): SW-to-NE strand goes OVER
- **Horizontal meeting** (diamonds left/right): NW-to-SE strand goes OVER

This is equivalent to: if `(col + row) % 2 == 0`, the "/" diagonal is over; else "\" is over.

```
function determineCrossingType(row, col):
  // Checkerboard pattern determines which strand is on top
  if (row + col) % 2 == 0:
    return DIAGONAL_FORWARD_OVER   // "/" on top
  else:
    return DIAGONAL_BACKWARD_OVER  // "\" on top
```

### 4. Interior Crossing Points

Crossings occur at the interior grid vertices (where 4 cells meet).

```
function getCrossingPoints(p, q, cell_size):
  crossings = []

  // Interior vertices only (not on boundary)
  for row in 1..p-1:
    for col in 1..q-1:
      x = col * cell_size
      y = row * cell_size
      crossing_type = determineCrossingType(row, col)
      crossings.push({x, y, type: crossing_type})

  return crossings
```

---

## Ribbon Path Tracing

### 5. Strand Tracing Algorithm

Each strand has slope +1 or -1 at all times. Strands bounce off boundaries and weave through crossings.

```
function traceAllStrands(p, q, cell_size):
  strands = []
  visited_segments = Set()

  // Start points are along left edge, between diamond vertices
  for i in 0..2p-1:
    start = getStartPoint(i, cell_size)
    if start not in visited_segments:
      strand = traceSingleStrand(start, p, q, cell_size, visited_segments)
      strands.push(strand)

  return strands

function traceSingleStrand(start, p, q, cell_size, visited):
  path = []
  current = start
  direction = INITIAL_DIRECTION  // based on start position

  loop:
    path.push(current.position)
    visited.add(current.segment_id)

    // Move in current direction (slope +1 or -1)
    next = moveAlongDiagonal(current, direction, cell_size)

    if atBoundary(next, p, q, cell_size):
      // Bounce: reverse the perpendicular component
      direction = bounceDirection(direction, boundary_type)
      next = applyBounce(next, boundary_type)

    if atCrossing(next):
      // Pass through crossing (over or under doesn't affect path)
      // Just continue in same diagonal direction
      pass

    if next == start:
      break  // completed the loop

    current = next

  return path
```

---

## Break/Barrier System

Breaks modify the basic plaitwork by redirecting strands at crossings.

### 6. Break Types

At any crossing, instead of the normal weave, strands can be redirected:

```
BREAK TYPES:
  HORIZONTAL_BREAK: top-to-top and bottom-to-bottom connection
  VERTICAL_BREAK:   left-to-left and right-to-right connection
  NO_BREAK:         normal crossing (over/under weave)

function applyBreak(crossing, break_type):
  if break_type == HORIZONTAL_BREAK:
    // Strands reflect horizontally at this point
    // Creates a "wall" blocking vertical passage
    return redirectHorizontal(crossing)

  elif break_type == VERTICAL_BREAK:
    // Strands reflect vertically at this point
    // Creates a "wall" blocking horizontal passage
    return redirectVertical(crossing)

  else:
    return normalCrossing(crossing)
```

### 7. Break Placement for Design Control

```
function placeBreaksForSingleComponent(p, q):
  // To guarantee a single continuous strand (true knot),
  // strategically place breaks to merge components

  breaks = []
  current_components = gcd(p, q)

  while current_components > 1:
    // Find a break position that merges two components
    break_pos = findMergingBreak(current_strand_paths)
    breaks.push(break_pos)
    current_components = recalculateComponents()

  return breaks
```

---

## Ribbon Geometry Generation

### 8. Converting Centerline to Ribbon Shape

The traced path is the centerline. We need to expand it into a ribbon with width.

```
function expandToRibbon(centerline_path, ribbon_width):
  left_edge = []
  right_edge = []

  for i in 0..len(centerline_path)-1:
    p0 = centerline_path[i]
    p1 = centerline_path[(i+1) % len(centerline_path)]

    // Direction vector
    dx = p1.x - p0.x
    dy = p1.y - p0.y
    len = sqrt(dx*dx + dy*dy)

    // Perpendicular offset
    nx = -dy / len * ribbon_width / 2
    ny = dx / len * ribbon_width / 2

    left_edge.push((p0.x + nx, p0.y + ny))
    right_edge.push((p0.x - nx, p0.y - ny))

  // Close the ribbon as a polygon
  ribbon_polygon = left_edge + reverse(right_edge)
  return ribbon_polygon
```

### 9. Crossing Gap Generation

At each crossing, the "under" strand needs a gap cut out where the "over" strand passes.

```
function generateCrossingGaps(crossings, ribbon_width):
  gaps = []

  for crossing in crossings:
    // The "over" strand cuts through the "under" strand
    over_direction = crossing.type  // which diagonal is on top

    // Create a rectangular gap perpendicular to the under-strand
    gap_rect = createGapRectangle(
      center: crossing.position,
      width: ribbon_width * 1.2,  // slightly wider than ribbon
      height: ribbon_width * 0.4, // gap height
      angle: over_direction == FORWARD ? 45 : -45
    )

    gaps.push({
      position: crossing.position,
      shape: gap_rect,
      cuts_strand: under_strand_id
    })

  return gaps
```

---

## Shape Assembly for Fill Generation

### 10. Final Shape Generation

```
function generateCelticKnotShapes(p, q, cell_size, ribbon_width):
  // Step 1: Trace all strand centerlines
  strands = traceAllStrands(p, q, cell_size)

  // Step 2: Expand to ribbon polygons
  ribbons = []
  for strand in strands:
    ribbon = expandToRibbon(strand, ribbon_width)
    ribbons.push(ribbon)

  // Step 3: Generate crossing gaps
  crossings = getCrossingPoints(p, q, cell_size)
  gaps = generateCrossingGaps(crossings, ribbon_width)

  // Step 4: Cut gaps from ribbons to create over/under effect
  final_shapes = []
  for ribbon in ribbons:
    // Find all gaps that affect this ribbon (where it goes "under")
    relevant_gaps = gaps.filter(g => g.cuts_strand == ribbon.id)

    // Boolean difference: ribbon - gaps
    cut_ribbon = booleanDifference(ribbon, relevant_gaps)
    final_shapes.push(cut_ribbon)

  // Step 5: Generate background shape (optional)
  bounding_box = getBoundingBox(p, q, cell_size)
  background = booleanDifference(bounding_box, union(ribbons))

  return {
    foreground: final_shapes,  // ribbon pieces (fill with dense lines)
    background: background,     // negative space (fill with sparse lines or different angle)
    outlines: extractOutlines(final_shapes)  // edge strokes
  }
```

---

## Line Fill Strategy

### 11. Two-Color Effect via Line Fill

For pen plotter output, we simulate two colors using line fill patterns:

```
FILL STRATEGY:

Foreground (ribbon strands):
  - Dense parallel lines (spacing: 0.5-1mm)
  - Angle: 45° or perpendicular to local strand direction
  - Creates solid "filled" appearance

Background (negative space):
  - Sparse lines or crosshatch (spacing: 2-3mm)
  - Different angle than foreground (e.g., 0° or 90°)
  - Or: leave empty for "white" background

Gap regions (under-crossings):
  - Match background fill
  - Creates illusion of strand passing behind

Border outlines:
  - Single stroke along ribbon edges
  - Drawn last to clean up fill edges
```

### 12. Fill Generation Pseudocode

```
function generateCelticKnotFills(knot_shapes, fill_params):
  output_paths = []

  // Layer 1: Background fill (if desired)
  if fill_params.fill_background:
    bg_lines = generateLineFill(
      shape: knot_shapes.background,
      spacing: fill_params.bg_spacing,
      angle: fill_params.bg_angle
    )
    output_paths.push({layer: "background", paths: bg_lines})

  // Layer 2: Foreground ribbon fill
  for ribbon_piece in knot_shapes.foreground:
    fg_lines = generateLineFill(
      shape: ribbon_piece,
      spacing: fill_params.fg_spacing,
      angle: fill_params.fg_angle
    )
    output_paths.push({layer: "foreground", paths: fg_lines})

  // Layer 3: Outlines (drawn last)
  output_paths.push({layer: "outline", paths: knot_shapes.outlines})

  return output_paths
```

---

## Design Variations

### Circular Borders

```
function generateCircularKnot(p, q, inner_radius, outer_radius):
  // p can be half-integer for odd strand counts
  // Components = gcd(2p, q)

  // Generate on flat grid, then map to annulus
  flat_knot = generateCelticKnotShapes(p, q, ...)

  // Transform: x -> angle, y -> radius
  circular_knot = mapToAnnulus(flat_knot, inner_radius, outer_radius)

  return circular_knot
```

### Rectangular Frames

```
function generateFrameKnot(p, q, width_n):
  // Components = 2 * gcd(|p-q|, n)

  // Generate four sides + four corners
  // Use corner permutation α_n for turns

  top = generateStrip(q - 2*n, n)
  bottom = generateStrip(q - 2*n, n)
  left = generateStrip(p - 2*n, n)
  right = generateStrip(p - 2*n, n)
  corners = generateCorners(n)  // 4 corner pieces

  return assembleFrame(top, bottom, left, right, corners)
```

---

## Component Count Formulas (Reference)

| Design Type | Formula | Notes |
|-------------|---------|-------|
| p × q Panel | gcd(p, q) | Basic rectangular plaitwork |
| p × q Circular | gcd(2p, q) | p can be half-integer |
| p × q Frame width n | 2·gcd(\|p-q\|, n) | Integer width |
| p × q Frame width n | gcd(\|p-q\|, 2n) | Half-integer width |
| p × q L-shape width n | gcd(\|p-q\|, n) | Half frame |

---

## Implementation Notes

1. **Boolean operations** are critical - need robust polygon clipping (e.g., Clipper library)
2. **Numerical precision** at crossing points requires care
3. **Strand direction tracking** needed to know which gaps apply to which ribbon
4. **Self-intersection handling** may be needed for complex break patterns
5. **SVG output** should group: background layer, foreground layer, outline layer

---

## References

- Fisher, G. & Mellor, B. (2004) "On the Topology of Celtic Knot Designs", BRIDGES 2004
- Bain, G. (1973) "Celtic Art: The Method of Construction", Dover
- Cromwell, P.R. (1993) "Celtic Knotwork: Mathematical Art", Mathematical Intelligencer
- Meehan, A. (1991) "Celtic Design: Knotwork", Thames and Hudson
