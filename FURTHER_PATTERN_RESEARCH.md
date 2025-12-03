# Further Pattern Research

Exploration of generative fill patterns and advanced repetition systems for pen plotter output.

---

## Table of Contents
1. [Custom Pattern System](#custom-pattern-system)
2. [Mathematical Curves & Space-Fillers](#mathematical-curves--space-fillers)
3. [Tile-Based Systems](#tile-based-systems)
4. [Flow & Field-Based Patterns](#flow--field-based-patterns)
5. [Organic & Natural Patterns](#organic--natural-patterns)
6. [Optical & Interference Patterns](#optical--interference-patterns)
7. [Historical & Cultural Patterns](#historical--cultural-patterns)
8. [Hybrid & Experimental Ideas](#hybrid--experimental-ideas)

---

## Custom Pattern System

### Core Concept: Pattern Upload + Repetition Control

Allow users to upload simple SVG motifs and define complex repetition behaviors.

### Repetition Modes

```
GRID REPEAT:
  - Rows/columns count or spacing
  - Offset per row (brick pattern)
  - Offset per column
  - Scale variation per cell
  - Rotation variation per cell
  - Random jitter (position, scale, rotation)

RADIAL REPEAT:
  - Count around center
  - Radius rings (concentric)
  - Angular offset per ring
  - Scale by distance from center
  - Rotation: face-center, face-outward, tangent, fixed

ALONG PATH REPEAT:
  - Follow any curve/shape boundary
  - Spacing (fixed or count-based)
  - Scale to fit path width
  - Orient to path tangent
  - Corner behavior: stretch, skip, special motif

PACK/SCATTER:
  - Fill region with non-overlapping copies
  - Size variation range
  - Rotation variation
  - Gravity/clustering options
  - Avoid certain regions
```

### Multi-Shape Pattern Composition

```
SHAPE SETS:
  - Define multiple motifs (A, B, C...)
  - Assignment rules:
    - Alternating (ABABAB, ABCABC)
    - Random weighted selection
    - Position-based (center vs edge)
    - Size-based (large motif A, small motif B)
    - Checkerboard / spatial rules

ALIGNMENT SYSTEM:
  - Define anchor points on each motif
  - Snap rules between motifs
  - Connector pieces (like puzzle edges)
  - Allow motifs to interlock

EXAMPLE: Custom tessellation
  - Upload: hexagon, triangle, square
  - Define: hex connects to 6 triangles
  - System generates: semi-regular tessellation
```

### Pattern Operators

```
BOOLEAN ON PATTERNS:
  - Pattern A union Pattern B (overlay)
  - Pattern A minus Pattern B (knockout)
  - Pattern A intersect Pattern B
  - Pattern A XOR Pattern B

TRANSFORMATIONS:
  - Mirror pattern
  - Kaleidoscope (6-fold, 8-fold symmetry)
  - Twist/spiral warp
  - Perspective warp
  - Fish-eye / spherize
```

---

## Mathematical Curves & Space-Fillers

### 1. Lindenmayer Systems (L-Systems)

Recursive string-rewriting that generates fractal curves.

```
CLASSIC L-SYSTEM CURVES:
  - Dragon curve
  - Lévy C curve
  - Sierpiński triangle/carpet
  - Koch snowflake
  - Peano curve (space-filling)

PARAMETERS:
  - Axiom (starting string)
  - Production rules
  - Iteration depth
  - Angle increment
  - Segment length decay

PLOTTER ADVANTAGE:
  - Many are single continuous path
  - Self-similar at multiple scales
  - Can be fitted to arbitrary bounds
```

### 2. Lissajous & Harmonograph Curves

Parametric curves from oscillating motion.

```
LISSAJOUS:
  x(t) = A * sin(a*t + δ)
  y(t) = B * sin(b*t)

  - Ratio a:b determines figure (1:1=ellipse, 1:2=figure-8, 3:2=pretzel)
  - Phase δ rotates/morphs the figure
  - Damping creates spiral-in effect

HARMONOGRAPH (compound pendulum):
  x(t) = A1*sin(f1*t + p1)*decay + A2*sin(f2*t + p2)*decay
  y(t) = A3*sin(f3*t + p3)*decay + A4*sin(f4*t + p4)*decay

  - Creates intricate spirograph-like patterns
  - Single continuous line (ideal for plotter)
  - Decay parameter = pen slowly spiraling to center
```

### 3. Rose Curves & Spirograph Mathematics

```
RHODONEA (rose):
  r = cos(k * θ)

  - k integer: k or 2k petals
  - k rational (p/q): complex multi-lobed figures
  - Single path when traced fully

EPITROCHOID / HYPOTROCHOID (spirograph):
  - Rolling circle inside/outside fixed circle
  - Parameters: R (fixed), r (rolling), d (pen distance)
  - Closed curves when R/r is rational
```

### 4. Superformula (Gielis curves)

Generalization that creates many organic and geometric shapes:

```
r(θ) = (|cos(m*θ/4)/a|^n2 + |sin(m*θ/4)/b|^n3)^(-1/n1)

PARAMETERS:
  - m: rotational symmetry
  - n1, n2, n3: shape morphing
  - a, b: scaling

GENERATES:
  - Circles, ellipses
  - Stars, polygons
  - Organic leaf/petal shapes
  - Biological forms (diatoms, shells)
```

---

## Tile-Based Systems

### 5. Truchet Tiles

Quarter-circle or diagonal tiles that create emergent patterns.

```
CLASSIC TRUCHET:
  - 2 tile types (diagonal arc orientations)
  - Random or rule-based placement
  - Creates maze-like continuous curves

VARIATIONS:
  - Multi-scale Truchet (tiles contain smaller tiles)
  - 3+ tile types for more complexity
  - Colored/weighted regions
  - Triangle-grid Truchet

PLOTTER OPTIMIZATION:
  - Trace connected arcs as single paths
  - Graph traversal to minimize pen-ups
```

### 6. Wang Tiles

Edge-matching tiles that can be aperiodic.

```
CONCEPT:
  - Each tile edge has a "color" or connector type
  - Tiles placed so adjacent edges match
  - Small tile sets can produce infinite non-repeating patterns

APPLICATION:
  - Texture synthesis without obvious repetition
  - Each tile contains a pattern fragment
  - Edges designed to connect seamlessly
```

### 7. Penrose & Aperiodic Tilings

```
PENROSE RHOMBS:
  - 2 rhombus shapes (72° and 36° acute angles)
  - Matching rules create aperiodic pattern
  - 5-fold rotational symmetry
  - Never repeats, always fills plane

PENROSE DARTS & KITES:
  - Alternative Penrose set
  - Can be decorated with arcs for continuous curves

AMMANN BARS:
  - Linear patterns emerge from Penrose tilings
  - Can overlay as additional line pattern
```

### 8. Escheresque Tessellation

```
PROCESS:
  1. Start with regular tessellation (squares, hexagons, triangles)
  2. Modify edges with matching curves
  3. Apply same modification to all translated edges
  4. Optional: add internal detail to tiles

SYMMETRY TYPES:
  - Translation only
  - Translation + rotation
  - Translation + glide reflection
  - 17 wallpaper groups possible

PLOTTER APPLICATION:
  - Outline each modified tile
  - Internal fill per tile (hatch at varying angles)
  - Continuous path through all tile edges
```

---

## Flow & Field-Based Patterns

### 9. Vector Field Flow Lines

```
CONCEPT:
  - Define a vector field F(x,y) = (u, v)
  - Trace streamlines following the field
  - Evenly-spaced streamlines fill region

FIELD SOURCES:
  - Mathematical: sin(x)*cos(y), curl of potential functions
  - Image-derived: gradient of brightness
  - Noise-based: Perlin/Simplex noise derivatives
  - Attraction/repulsion points

PARAMETERS:
  - Streamline density (separation distance)
  - Line length (fixed or until boundary)
  - Integration step size
  - Seed point distribution

VISUAL EFFECTS:
  - Wood grain
  - Fingerprints
  - Magnetic field lines
  - Topographic contours
```

### 10. Differential Growth

```
CONCEPT:
  - Start with simple closed curve
  - Points on curve repel nearby points
  - Curve grows and wrinkles to fill space
  - Creates organic, coral-like patterns

ALGORITHM:
  1. Initialize curve with N points
  2. For each point, calculate repulsion from neighbors
  3. Move points outward (growth force)
  4. If segment too long, subdivide
  5. If points too close, merge
  6. Repeat

VARIATIONS:
  - Multiple growing curves that avoid each other
  - Constrained to fill specific region
  - Growth rate varies by position
```

### 11. Contour Lines from Scalar Fields

```
FIELDS TO CONTOUR:
  - Distance from point(s)
  - Distance from edge(s)
  - Perlin noise
  - Mathematical functions (sin, Gaussian, etc.)
  - Image brightness values

MARCHING SQUARES:
  - Grid-based contour extraction
  - Produces isoclines at specified values
  - Evenly spaced values = evenly spaced lines

APPLICATIONS:
  - Topographic map effect
  - Halftone-like density variation
  - Moiré when overlaid
```

---

## Organic & Natural Patterns

### 12. Voronoi & Delaunay Patterns

```
VORONOI:
  - Partition space by nearest seed point
  - Cell edges are equidistant from adjacent seeds
  - Seed distribution controls cell sizes

DELAUNAY:
  - Dual of Voronoi (connect seeds that share Voronoi edge)
  - Triangulation with nice properties

VARIATIONS:
  - Weighted Voronoi (seeds have radii)
  - Centroidal Voronoi (Lloyd relaxation)
  - Voronoi + internal hatch per cell
  - Stippled Voronoi (dots at centroids)

SEED DISTRIBUTIONS:
  - Random uniform
  - Poisson disk (blue noise)
  - Halton/Sobol sequences
  - Image-density weighted
```

### 13. Reaction-Diffusion (Turing Patterns)

```
CONCEPT:
  - Two chemicals: activator and inhibitor
  - Diffuse at different rates
  - Local activation, long-range inhibition
  - Produces spots, stripes, labyrinths

GRAY-SCOTT MODEL:
  dA/dt = Da*∇²A - A*B² + f*(1-A)
  dB/dt = Db*∇²B + A*B² - (k+f)*B

  - Parameters f, k control pattern type
  - Simulate on grid, extract contours

PATTERNS GENERATED:
  - Spots (like leopard)
  - Stripes (like zebra)
  - Labyrinth/maze
  - Mitosis-like splitting shapes

VECTORIZATION:
  - Threshold simulation result
  - Trace contours of high-concentration regions
  - Multiple thresholds = multiple line sets
```

### 14. Phyllotaxis (Sunflower) Spirals

```
GOLDEN ANGLE: 137.507764° ≈ 360° / φ²

ALGORITHM:
  for i in 0..N:
    angle = i * golden_angle
    radius = sqrt(i) * scale  // or: i * scale for Archimedes
    x = radius * cos(angle)
    y = radius * sin(angle)
    place_element(x, y, rotation=angle)

CREATES:
  - Parastichy spirals (visible spiral arms)
  - Fibonacci numbers appear naturally
  - Maximum packing efficiency

FILL APPLICATION:
  - Place dots/shapes at each position
  - Connect sequentially for spiral path
  - Size variation by radius
```

### 15. Crack & Shatter Patterns

```
CONCEPT:
  - Simulate material fracture
  - Cracks propagate, branch, and terminate
  - Creates organic cellular divisions

ALGORITHM:
  1. Start crack at boundary or random point
  2. Grow in direction with some randomness
  3. Occasionally branch (spawn new crack)
  4. Terminate when hitting another crack or boundary
  5. Repeat until density threshold

PARAMETERS:
  - Branch probability
  - Direction randomness
  - Crack width variation
  - Seed point distribution
```

---

## Optical & Interference Patterns

### 16. Moiré Patterns

```
CONCEPT:
  - Overlay two regular patterns
  - Interference creates new larger-scale pattern
  - Sensitive to angle and frequency differences

GENERATION:
  - Two line grids at slight angle offset
  - Two concentric circle sets with different centers
  - Two radial line sets from different origins
  - Pattern + slightly scaled copy of itself

APPLICATIONS:
  - Visual depth illusion
  - Motion illusion in static image
  - Reveals hidden patterns when overlay moved
```

### 17. Op-Art Geometric Patterns

```
BRIDGET RILEY STYLE:
  - Parallel lines with controlled distortion
  - Wave deformation along line length
  - Width variation creates 3D illusion

VICTOR VASARELY STYLE:
  - Grid of shapes with systematic variation
  - Size, color, position shifts
  - Creates bulge/warp illusion

PARAMETERS:
  - Base pattern (lines, circles, squares)
  - Distortion function (sine wave, radial bulge)
  - Frequency of distortion
  - Amplitude of distortion
```

### 18. Chladni Figures

```
CONCEPT:
  - Standing wave patterns on vibrating plates
  - Nodes (stationary points) form patterns
  - Different frequencies = different patterns

MATHEMATICAL:
  cos(n*π*x/L)*cos(m*π*y/L) - cos(m*π*x/L)*cos(n*π*y/L) = 0

  - Integers n, m determine pattern complexity
  - Contour the zero-set

VARIATIONS:
  - Circular plates (Bessel functions)
  - Arbitrary plate shapes
  - Overlay multiple frequencies
```

---

## Historical & Cultural Patterns

### 19. Guilloche Patterns

```
CONCEPT:
  - Intricate interlocking curves
  - Used on currency, certificates for anti-counterfeiting
  - Machine-generated with rose engine lathe

ELEMENTS:
  - Base rosette (often epitrochoid)
  - Envelope curves (tangent to moving circle)
  - Parallel offset curves
  - Border frames

GENERATION:
  - Parametric curves with many harmonics
  - Combine multiple frequency components
  - Apply to various base shapes (circles, ovals, frames)
```

### 20. Islamic Geometric Patterns

```
CONSTRUCTION:
  1. Start with grid (square, hexagonal, or complex)
  2. Draw circles at vertices
  3. Connect intersection points with straight lines
  4. Erase construction, keep pattern
  5. Apply weaving (over/under at crossings)

STAR PATTERNS:
  - 6-point, 8-point, 10-point, 12-point stars
  - Interlocking creates complex tessellations
  - Girih tiles for larger patterns

PLOTTER APPLICATION:
  - Outline strokes create interlace effect
  - Fill regions with different hatch densities
  - Single continuous path possible with careful planning
```

### 21. Japanese Patterns (Wagara)

```
COMMON MOTIFS:
  - Seigaiha (wave): overlapping concentric arcs
  - Asanoha (hemp leaf): 6-pointed star tessellation
  - Shippo (seven treasures): interlocking circles
  - Yagasuri (arrow feathers): chevron tessellation
  - Kanoko (fawn spots): tied shibori dots

CHARACTERISTICS:
  - Simple geometric base
  - High repetition density
  - Often single continuous motif repeated
  - Strong positive/negative space interplay
```

---

## Hybrid & Experimental Ideas

### 22. TSP Art (Traveling Salesman)

```
CONCEPT:
  - Place stipple points based on image darkness
  - Solve TSP to connect all points with shortest path
  - Single continuous line recreates image

PROCESS:
  1. Image → weighted point distribution
  2. More points in dark areas
  3. Solve/approximate TSP
  4. Draw solution path

OPTIMIZATIONS:
  - Use nearest-neighbor heuristic
  - 2-opt improvement
  - Christofides algorithm
  - Or-tools / Concorde solver
```

### 23. Fourier Drawing

```
CONCEPT:
  - Any closed curve = sum of rotating circles (epicycles)
  - DFT of path points gives circle radii and speeds
  - Recreate drawing as single continuous motion

PROCESS:
  1. Sample points along target curve
  2. Compute DFT of complex coordinates
  3. Each frequency = one rotating arm
  4. Sum of all arms traces original curve

APPLICATION:
  - Recreate any shape as continuous path
  - Simplify by using fewer harmonics
  - Visual: show epicycles as construction
```

### 24. Recursive Subdivision Patterns

```
QUADTREE FILL:
  - Divide region into 4 quadrants
  - Subdivide further based on rule (image darkness, randomness)
  - Draw squares/circles at leaf nodes
  - Creates variable-density pattern

BINARY SPACE PARTITION:
  - Recursive splitting with alternating axis
  - Random split positions
  - Mondrian-like compositions

FRACTAL SUBDIVISION:
  - Replace each square with smaller arrangement
  - Different replacement rules = different fractals
```

### 25. Displacement-Based Pattern Morphing

```
CONCEPT:
  - Start with regular pattern (grid lines, circles)
  - Apply displacement based on image or function
  - Pattern deforms to reveal image

DISPLACEMENT SOURCES:
  - Grayscale image → displacement magnitude
  - Vector field → direction and magnitude
  - Mathematical function

EXAMPLE:
  - Grid of horizontal lines
  - Displace vertically based on portrait brightness
  - Lines bunch together in dark areas = face emerges
```

### 26. Sound/Data Visualization

```
WAVEFORM PATTERNS:
  - Audio amplitude over time
  - Stack multiple channels
  - Circular/spiral layout

SPECTRAL PATTERNS:
  - FFT frequency bands as radial bars
  - Spectrogram as height-varying lines
  - Mel-frequency bands for perceptual mapping

DATA SPIRALS:
  - Time series data on spiral
  - Each revolution = one period (day, year)
  - Radius encodes value
```

### 27. Generative Typography Fill

```
CONCEPT:
  - Fill region with tiny text
  - Text content can be meaningful
  - Creates texture + message

VARIATIONS:
  - Single repeated word
  - Lorem ipsum
  - Actual content (poem fills its own shape)
  - Varying font size by density
  - Text along curves, not just horizontal
```

### 28. Pen Stroke Simulation

```
BRUSH STROKE FILL:
  - Simulate natural brush strokes
  - Variable width along stroke
  - Multiple passes with offset
  - Creates painterly texture

PARAMETERS:
  - Stroke width range
  - Stroke length
  - Curvature randomness
  - Overlap amount
  - Orientation (follow shape, fixed angle, flow field)
```

---

## Implementation Priority Suggestions

### High Impact, Moderate Complexity
1. **Custom Pattern Upload + Grid Repeat** - Immediate user value
2. **Flow Field Lines** - Unique, visually striking
3. **Truchet Tiles** - Simple to implement, emergent complexity
4. **Lissajous/Harmonograph** - Single-path, always looks good

### High Impact, Higher Complexity
5. **Voronoi/Delaunay** - Very versatile, many variations
6. **Reaction-Diffusion** - Unique organic look
7. **TSP Art** - Impressive single-line images
8. **Islamic Geometric** - Cultural significance, mathematical elegance

### Experimental / Niche
9. **Differential Growth** - Requires physics simulation
10. **Fourier Drawing** - Novel but limited practical use
11. **Chladni Figures** - Scientific/educational appeal

---

## Pattern Combination Ideas

```
LAYERED PATTERNS:
  - Base: Voronoi cells
  - Per-cell fill: different hatch angles
  - Overlay: flow lines following cell boundaries

DENSITY MAPPING:
  - Import image
  - Map brightness to pattern density/scale
  - Any pattern becomes "halftone" version of image

REGION-AWARE:
  - Different patterns for different semantic regions
  - Example: water=waves, land=hatching, sky=stippling

ANIMATED SEQUENCES:
  - Generate pattern with varying parameter
  - Export frame sequence for flipbook/animation
  - Example: Moiré with shifting angle
```

---

## Questions for Discussion

1. Should patterns be resolution-independent (regenerate for any size) or fixed SVG?
2. How to handle pattern continuity across shape boundaries?
3. Priority: more built-in patterns vs. better custom pattern tools?
4. Interest in pattern-to-pattern morphing/blending?
5. Should we support pattern export/import for sharing?
