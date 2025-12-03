# Cultural and Historical Patterns

Traditional geometric patterns from world cultures, adapted for generative fill and pen plotter output.

---

## Overview

Historical patterns developed over centuries encode deep mathematical understanding. They're optimized for hand-construction, making them naturally suitable for plotters. Each tradition has distinct rules, symmetries, and construction methods.

---

## 1. Islamic Geometric Patterns

### Fundamental Concepts

```
KEY PRINCIPLES:
  - Infinite extension (patterns continue beyond frame)
  - Interlace (strands weave over/under)
  - Radial symmetry (6, 8, 10, 12-fold common)
  - Construction from circles (compass and straightedge)
  - No representation of living beings (geometric abstraction)

STRUCTURAL ELEMENTS:
  - Stars: n-pointed star polygons
  - Rosettes: stars with added petals
  - Polygons: filling shapes between stars
  - Khatam: interlace bands
```

### Star Polygon Construction

```
BASIC STAR {n/k}:
  - n = number of points
  - k = skip (connect every kth point)
  - Valid when gcd(n, k) = 1

function starPolygon(center, radius, n, k):
  points = []
  for i in 0..n:
    angle = i * TWO_PI / n - PI/2  // start at top
    points.push((
      center.x + radius * cos(angle),
      center.y + radius * sin(angle)
    ))

  // Connect every kth point
  path = []
  current = 0
  for step in 0..n:
    path.push(points[current])
    current = (current + k) % n
  path.push(points[0])  // close

  return path

COMMON STARS:
  {5/2}: 5-pointed star (pentagram)
  {6/2}: 6-pointed star (Star of David) - actually two triangles
  {8/2}: 8-pointed star
  {8/3}: 8-pointed star with different proportions
  {10/3}: 10-pointed star
  {12/5}: 12-pointed star
```

### Rosette Construction

```
function rosette(center, outer_radius, inner_radius, n, petal_type):
  elements = []

  // Central star
  star = starPolygon(center, inner_radius, n, getK(n))
  elements.push(star)

  // Petals between star points
  for i in 0..n:
    angle = i * TWO_PI / n
    petal = createPetal(center, inner_radius, outer_radius, angle, petal_type)
    elements.push(petal)

  return elements

PETAL TYPES:
  - Pointed: simple triangular extension
  - Curved: convex or concave sides
  - Split: petal divided into two parts
  - Compound: nested smaller elements
```

### Grid-Based Islamic Patterns

```
SQUARE GRID PATTERNS:
  function squareGridPattern(bounds, params):
    // Place stars at grid intersections
    // Fill spaces with appropriate polygons

    elements = []

    for row in range(0, bounds.height, params.repeat_size):
      for col in range(0, bounds.width, params.repeat_size):
        // Star at intersection
        center = (col, row)
        star = starPolygon(center, params.star_radius, params.n, params.k)
        elements.push(star)

        // Fill polygons determined by star type
        fills = generateFillers(center, params)
        elements.extend(fills)

    return elements

HEXAGONAL GRID PATTERNS:
  - 6-fold symmetry base
  - Stars at hex centers and vertices
  - More complex filling rules
```

### Girih Tiles

```
CONCEPT:
  - 5 tile shapes that create complex patterns
  - Used in medieval Persian architecture
  - Discovered to produce quasi-periodic tilings

TILE SHAPES:
  1. Decagon (10 sides)
  2. Pentagon (5 sides)
  3. Bowtie (concave hexagon)
  4. Rhombus (72° angles)
  5. Elongated hexagon

DECORATION LINES:
  - Each tile has internal line pattern
  - Lines connect at midpoints of edges
  - Lines continue across tile boundaries
  - Creates apparent stars and complex motifs

function girihTile(type, position, rotation, scale):
  tile = GIRIH_SHAPES[type]

  // Tile outline
  outline = transformPolygon(tile.outline, position, rotation, scale)

  // Internal decoration (strapwork lines)
  decoration = []
  for line in tile.decoration_lines:
    transformed = transformLine(line, position, rotation, scale)
    decoration.push(transformed)

  return {outline, decoration}
```

### Islamic Interlace (Zillij)

```
INTERLACE RULES:
  - Bands weave over and under
  - Consistent alternation along each band
  - Crossings at regular positions

function islamicInterlace(base_pattern, band_width):
  // Convert line pattern to interlaced bands

  bands = []
  crossings = findCrossings(base_pattern)

  for line in base_pattern.lines:
    band = expandToBand(line, band_width)
    bands.push(band)

  // Determine over/under at each crossing
  for crossing in crossings:
    assignOverUnder(crossing, bands)

  // Cut gaps in under-bands
  for band in bands:
    band.cutGaps(crossings, band_width)

  return bands
```

---

## 2. Japanese Traditional Patterns (Wagara)

### Seigaiha (Wave)

```
CONCEPT:
  - Overlapping concentric arcs
  - Represents waves/ocean
  - Stacked in offset rows

function seigaiha(bounds, params):
  arcs = []

  row = 0
  y = bounds.top

  while y < bounds.bottom + params.radius:
    x_offset = (row % 2) * params.radius  // Offset alternate rows
    x = bounds.left - params.radius + x_offset

    while x < bounds.right + params.radius:
      // Multiple concentric arcs per unit
      for ring in 0..params.num_rings:
        r = params.radius * (1 - ring / params.num_rings)
        arc = createArc(
          center: (x, y),
          radius: r,
          start_angle: PI,  // bottom half only
          end_angle: TWO_PI
        )
        arcs.push(arc)

      x += params.radius * 2

    y += params.radius * params.row_ratio  // typically 0.5-0.7
    row++

  return arcs
```

### Asanoha (Hemp Leaf)

```
CONCEPT:
  - 6-pointed star tessellation
  - Lines radiate from each hexagon center
  - Very strong/durable visual pattern

function asanoha(bounds, params):
  lines = []

  // Hexagonal grid
  for hex_center in hexagonalGrid(bounds, params.hex_size):
    // 6 lines from center to midpoints of hex edges
    for i in 0..6:
      angle = i * PI / 3
      mid_point = (
        hex_center.x + params.hex_size * cos(angle),
        hex_center.y + params.hex_size * sin(angle)
      )
      lines.push(Line(hex_center, mid_point))

    // 6 lines from center to vertices
    for i in 0..6:
      angle = i * PI / 3 + PI / 6
      vertex = (
        hex_center.x + params.hex_size * 2/sqrt(3) * cos(angle),
        hex_center.y + params.hex_size * 2/sqrt(3) * sin(angle)
      )
      lines.push(Line(hex_center, vertex))

  // Remove duplicates and clip to bounds
  return deduplicateAndClip(lines, bounds)
```

### Shippo (Seven Treasures)

```
CONCEPT:
  - Interlocking circles
  - Each circle centered on intersection of 4 others
  - Creates lens/petal shapes at overlaps

function shippo(bounds, params):
  circles = []

  for row in range with spacing = params.radius:
    for col in range with spacing = params.radius:
      center = (col * params.radius, row * params.radius)
      circles.push(Circle(center, params.radius))

  return circles

// For more traditional look, show only the "petals"
function shippoPetals(bounds, params):
  // Boolean intersection of overlapping circles
  // Or: directly construct lens shapes
```

### Sayagata (Interlocking Manji)

```
CONCEPT:
  - Interlocking swastika/manji pattern
  - Very ancient symbol (pre-dates Nazi misuse by millennia)
  - Creates continuous meandering line

function sayagata(bounds, params):
  paths = []

  // Each unit is a 90° rotated connected manji
  for row, col in grid:
    rotation = ((row + col) % 4) * 90
    unit = createManjiUnit(col * params.size, row * params.size, params.size, rotation)
    paths.extend(unit)

  // Connect units into continuous meander
  return connectPaths(paths)
```

### Yagasuri (Arrow Feathers)

```
function yagasuri(bounds, params):
  chevrons = []

  for row in range:
    direction = (row % 2 == 0) ? 1 : -1  // Alternate direction
    y = row * params.height

    for col in range:
      x = col * params.width + (row % 2) * params.width / 2

      // Draw chevron/arrow shape
      chevron = [
        (x, y),
        (x + params.width * 0.5, y + params.height * 0.5 * direction),
        (x + params.width, y)
      ]
      chevrons.push(chevron)

  return chevrons
```

---

## 3. Guilloche Patterns

### Historical Context

```
ORIGIN:
  - Developed for security printing (currency, bonds, certificates)
  - Machine-generated using rose engine lathes
  - Extremely difficult to reproduce by hand
  - Now used decoratively

CHARACTERISTICS:
  - Very fine, precise lines
  - Interlocking curved bands
  - Often symmetrical/radial
  - Multiple overlapping wave patterns
```

### Basic Guilloche Elements

```
ROSETTE:
  - Overlapping sinusoidal curves around center
  - Different frequencies/phases create pattern

function guillocheRosette(center, params):
  paths = []

  for layer in 0..params.num_layers:
    phase_offset = layer * params.phase_step

    for t in range(0, TWO_PI, params.resolution):
      // Parametric curve with multiple harmonics
      r = params.base_radius +
          params.amp1 * sin(params.freq1 * t + phase_offset) +
          params.amp2 * sin(params.freq2 * t + phase_offset * 2)

      x = center.x + r * cos(t)
      y = center.y + r * sin(t)

      path.push((x, y))

    paths.push(path)

  return paths

BORDER:
  - Two parallel wavy lines
  - Internal connecting curves

function guillocheBorder(start, end, width, params):
  // Main spine (could be straight, curved, or complex path)
  spine = createSpine(start, end)

  // Upper and lower bounds with wave modulation
  upper = offsetCurve(spine, width/2, waveFunction1)
  lower = offsetCurve(spine, -width/2, waveFunction2)

  // Cross-connections
  connections = createConnections(upper, lower, params)

  return {upper, lower, connections}
```

### Spirograph Mathematics

```
EPITROCHOID (rolling outside):
  x(t) = (R + r) * cos(t) - d * cos((R + r) / r * t)
  y(t) = (R + r) * sin(t) - d * sin((R + r) / r * t)

HYPOTROCHOID (rolling inside):
  x(t) = (R - r) * cos(t) + d * cos((R - r) / r * t)
  y(t) = (R - r) * sin(t) - d * sin((R - r) / r * t)

WHERE:
  R = fixed circle radius
  r = rolling circle radius
  d = distance from rolling circle center to pen

function spirograph(center, R, r, d, params):
  points = []

  // Calculate how many revolutions for closed curve
  revolutions = lcm(R, r) / r

  for t in range(0, TWO_PI * revolutions, params.resolution):
    if params.type == 'epitrochoid':
      x = (R + r) * cos(t) - d * cos((R + r) / r * t)
      y = (R + r) * sin(t) - d * sin((R + r) / r * t)
    else:  // hypotrochoid
      x = (R - r) * cos(t) + d * cos((R - r) / r * t)
      y = (R - r) * sin(t) - d * sin((R - r) / r * t)

    points.push((center.x + x, center.y + y))

  return points
```

### Envelope Curves

```
CONCEPT:
  - Draw many lines/curves
  - Their envelope forms a new curve
  - Classic "string art" effect

function envelopeCurves(params):
  lines = []

  for i in 0..params.num_lines:
    t = i / params.num_lines

    // Points move along different curves
    p1 = curve1(t)
    p2 = curve2(1 - t)  // opposite direction creates envelope

    lines.push(Line(p1, p2))

  return lines

EXAMPLES:
  - Parabola from two line segments
  - Cardioid from circle and point
  - Nephroid from two circles
```

---

## 4. Celtic Key Patterns

### Concept

```
DISTINCT FROM CELTIC KNOTS:
  - Key patterns are angular, maze-like
  - Based on square/diagonal grids
  - No over/under weaving
  - Related to Greek key/meander

CONSTRUCTION:
  - Draw on diagonal grid
  - Lines follow grid, make 90° turns
  - Create spiraling, stepping patterns
```

### Step Patterns

```
function celticStep(bounds, params):
  path = []

  // Start at corner
  x, y = bounds.left, bounds.top
  direction = 'right'

  for step in 0..params.num_steps:
    // Move in current direction
    path.push((x, y))

    // Step sizes create pattern
    if direction == 'right':
      x += params.h_step
      direction = 'down'
    elif direction == 'down':
      y += params.v_step
      direction = 'left' if step % params.turn_freq == 0 else 'right'
    // ... etc

  return path
```

### Spiral Key

```
function celticSpiralKey(center, params):
  // Square spiral that steps outward
  path = []
  x, y = center
  size = params.initial_size

  for ring in 0..params.num_rings:
    // Right
    path.extend([(x + i, y) for i in range(size)])
    x += size
    // Down
    path.extend([(x, y + i) for i in range(size)])
    y += size
    // Left
    size += params.growth
    path.extend([(x - i, y) for i in range(size)])
    x -= size
    // Up
    path.extend([(x, y - i) for i in range(size)])
    y -= size
    size += params.growth

  return path
```

---

## 5. Greek Key / Meander

### Basic Meander

```
function greekKey(bounds, params):
  // Repeating unit of connected right angles
  path = []
  x = bounds.left
  y = bounds.top + params.height / 2

  while x < bounds.right:
    // One meander unit
    unit = [
      (x, y),
      (x, y - params.height/2),
      (x + params.width * 0.75, y - params.height/2),
      (x + params.width * 0.75, y + params.height/2 - params.line_width),
      (x + params.width * 0.25, y + params.height/2 - params.line_width),
      (x + params.width * 0.25, y + params.height/2),
      (x + params.width, y + params.height/2),
      (x + params.width, y)
    ]
    path.extend(unit)
    x += params.width

  return path
```

### Double Meander

```
// Two interlocking meander patterns
function doubleGreekKey(bounds, params):
  meander1 = greekKey(bounds, params)

  // Second meander offset and reflected
  offset_bounds = offset(bounds, params.width / 2, 0)
  meander2 = reflect(greekKey(offset_bounds, params), 'horizontal')

  return [meander1, meander2]
```

---

## 6. Art Deco Patterns

### Sunburst / Fan

```
function decoSunburst(center, params):
  rays = []

  // Radiating lines with varying lengths
  for i in 0..params.num_rays:
    angle = params.start_angle + i * params.angle_step

    // Alternating long/short rays
    length = params.long_length if i % 2 == 0 else params.short_length

    end = (
      center.x + length * cos(angle),
      center.y + length * sin(angle)
    )

    rays.push(Line(center, end))

  // Optional: concentric arcs between rays
  arcs = []
  for r in params.arc_radii:
    arc = createArc(center, r, params.start_angle, params.end_angle)
    arcs.push(arc)

  return {rays, arcs}
```

### Chevron / Zigzag

```
function decoChevron(bounds, params):
  paths = []

  for row in 0..params.num_rows:
    y = bounds.top + row * params.row_spacing
    path = []

    for col in 0..params.cols_per_row:
      x = bounds.left + col * params.chevron_width

      // Peak and valley points
      path.push((x, y))
      path.push((x + params.chevron_width/2, y - params.amplitude))
      path.push((x + params.chevron_width, y))

    paths.push(path)

  return paths
```

### Stepped Pyramid

```
function decoSteppedPyramid(center, params):
  shapes = []

  for level in 0..params.num_levels:
    // Decreasing size rectangles
    width = params.base_width * (1 - level / params.num_levels * 0.7)
    height = params.level_height
    y = params.base_y - level * height

    rect = Rectangle(
      center.x - width/2, y - height,
      width, height
    )
    shapes.push(rect)

  return shapes
```

---

## 7. African Patterns

### Kente Cloth Patterns

```
CONCEPT:
  - Woven textile tradition (Ghana)
  - Bold geometric shapes
  - Strong horizontal banding

function kentePattern(bounds, params):
  elements = []

  for band in 0..params.num_bands:
    y = bounds.top + band * params.band_height
    band_type = params.sequence[band % params.sequence.length]

    if band_type == 'zigzag':
      elements.extend(zigzagBand(y, bounds.width, params))
    elif band_type == 'blocks':
      elements.extend(blockBand(y, bounds.width, params))
    elif band_type == 'diamonds':
      elements.extend(diamondBand(y, bounds.width, params))

  return elements
```

### Adinkra Symbols

```
CONCEPT:
  - Ghanaian symbolic language
  - Each symbol has meaning
  - Stamped in grid patterns on fabric

COMMON SYMBOLS (simplified for plotting):
  - Gye Nyame: supremacy of God (complex curved shape)
  - Sankofa: learning from past (heart/bird shape)
  - Adinkrahene: leadership (concentric circles with cross)

function adinkraGrid(bounds, symbol, params):
  placements = []

  for row, col in grid(bounds, params.spacing):
    rotation = (row + col) % 4 * 90  // Optional rotation variation
    placements.push({
      position: (col * params.spacing, row * params.spacing),
      symbol: symbol,
      rotation: rotation,
      scale: params.scale
    })

  return placements
```

---

## 8. Chinese Lattice Patterns

### Window Lattice (Chuang)

```
CONCEPT:
  - Intricate wooden lattice for windows/doors
  - Geometric, often with symbolic meaning
  - Ice-ray (cracked ice) common pattern

function iceRayLattice(bounds, params):
  // Start with rectangle
  cells = [bounds]

  for iteration in 0..params.subdivisions:
    new_cells = []
    for cell in cells:
      // Subdivide cell with random internal point
      point = randomPointIn(cell, margin=params.margin)
      subcells = subdivideFromPoint(cell, point)
      new_cells.extend(subcells)
    cells = new_cells

  // Extract edges
  edges = []
  for cell in cells:
    edges.extend(cell.edges())

  return deduplicateEdges(edges)

function subdivideFromPoint(rect, point):
  // Connect point to random points on each edge
  // Creates 3-5 subcells
  edge_points = [randomPointOnEdge(edge) for edge in rect.edges]
  // Connect point to edge_points, divide resulting regions
```

### Interlocking Coins (Fang Sheng)

```
function fangSheng(bounds, params):
  // Overlapping squares rotated 45°
  squares = []

  for row, col in grid:
    center = gridToPosition(row, col, params.spacing)

    // Two overlapping squares
    sq1 = rotatedSquare(center, params.size, 0)
    sq2 = rotatedSquare(center, params.size, 45)

    squares.extend([sq1, sq2])

  return squares
```

---

## Implementation Considerations

### Cultural Sensitivity

```
GUIDELINES:
  - Research pattern meanings and contexts
  - Avoid sacred/restricted patterns without understanding
  - Credit traditions appropriately
  - Be aware of cultural appropriation concerns
  - Some patterns (like swastika) have complex histories
```

### Parametric Flexibility

```
Each pattern should support:
  - Scale (overall size)
  - Density (line spacing, element count)
  - Line weight (stroke width)
  - Bounds (rectangular, circular, arbitrary)
  - Orientation (rotation)
  - Repetition rules (tile, mirror, etc.)
```

### Path Optimization

```
CULTURAL PATTERN CHALLENGES:
  - Many small disconnected elements
  - Grid patterns = many parallel short lines
  - Interlace requires specific draw order

STRATEGIES:
  - Group nearby parallel lines
  - For interlace: draw all "under" first, then "over"
  - Use traveling salesman for element ordering
```

---

## References

- Bourgoin, J. (1879) "Arabic Geometrical Pattern and Design"
- Critchlow, K. (1976) "Islamic Patterns"
- Broug, E. (2013) "Islamic Geometric Design"
- Meehan, A. (1991-1996) Celtic Design series
- Japan Pattern Research Society, "Traditional Japanese Patterns"
- Christie, A. (1969) "Pattern Design"
- Washburn, D. & Crowe, D. (1988) "Symmetries of Culture"
