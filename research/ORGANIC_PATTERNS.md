# Organic Patterns for Generative Fill

Natural and biological pattern generation for pen plotter output.

---

## Overview

Organic patterns derive from natural phenomena: cell division, chemical reactions, growth processes, and physical forces. They create visual interest through controlled randomness and emergent complexity.

---

## 1. Voronoi Diagrams

### Mathematical Definition

Given a set of seed points, the Voronoi diagram partitions space so each region contains all points closest to one seed.

```
FORMAL:
  V(pi) = { x : d(x, pi) ≤ d(x, pj) for all j ≠ i }

WHERE:
  pi = seed point i
  d(x, y) = distance function (usually Euclidean)
```

### Fortune's Algorithm (Sweep Line)

```
function fortuneVoronoi(points):
  events = PriorityQueue()  // sorted by y-coordinate
  beachline = BalancedBST() // parabola arcs
  edges = []

  // Initialize with site events
  for p in points:
    events.push(SiteEvent(p))

  while not events.empty():
    event = events.pop()

    if event.type == SITE:
      // New parabola appears in beachline
      handleSiteEvent(event.point, beachline, events)
    else:  // CIRCLE event
      // Parabola disappears, vertex formed
      handleCircleEvent(event, beachline, edges, events)

  // Clip infinite edges to bounding box
  return clipEdges(edges, bounds)
```

### Seed Point Distributions

```
RANDOM UNIFORM:
  - Simple but clumpy
  - Some cells very large, some tiny
  - Least natural appearance

POISSON DISK (Blue Noise):
  - Minimum distance between points
  - More even cell sizes
  - Looks more natural

  function poissonDiskSampling(bounds, min_distance, max_attempts=30):
    cells = spatial_hash_grid(bounds, min_distance)
    active = []
    points = []

    // Start with random point
    initial = randomPointIn(bounds)
    points.push(initial)
    active.push(initial)
    cells.insert(initial)

    while active.length > 0:
      idx = randomInt(0, active.length)
      point = active[idx]
      found = false

      for attempt in 0..max_attempts:
        // Generate candidate in annulus [r, 2r]
        candidate = randomInAnnulus(point, min_distance, 2*min_distance)

        if inBounds(candidate) and not cells.hasNeighborCloserThan(candidate, min_distance):
          points.push(candidate)
          active.push(candidate)
          cells.insert(candidate)
          found = true
          break

      if not found:
        active.remove(idx)

    return points

WEIGHTED/STIPPLED:
  - Density varies by image brightness
  - Dark areas = more seeds = smaller cells
  - Creates halftone-like effect

LLOYD RELAXATION (Centroidal Voronoi):
  - Iteratively move seeds to cell centroids
  - Cells become more regular
  - Useful for even distribution

  function lloydRelaxation(points, bounds, iterations):
    for i in 0..iterations:
      voronoi = computeVoronoi(points, bounds)
      for j in 0..points.length:
        points[j] = voronoi.cells[j].centroid()
    return points
```

### Voronoi Variations for Fill

```
BASIC OUTLINE:
  - Draw cell edges only
  - Creates cracked/mosaic look

STIPPLE AT CENTROIDS:
  - Dot at center of each cell
  - Evenly-spaced stippling

CELL FILL:
  - Each cell filled with hatch lines
  - Vary angle per cell for visual interest
  - Vary density based on some property

WEIGHTED EDGES:
  - Edge weight = distance to both seeds
  - Thicker edges where seeds far apart

VORONOI + NOISE:
  - Perturb vertices with noise
  - More organic, less geometric

ROUNDED VORONOI:
  - Replace straight edges with curves
  - Edges become circular arcs
```

---

## 2. Delaunay Triangulation

### Definition

Dual of Voronoi: connect seeds that share a Voronoi edge. No point lies inside any triangle's circumcircle.

```
PROPERTIES:
  - Maximizes minimum angle (avoids thin triangles)
  - Unique for points in general position
  - Contains minimum spanning tree

ALGORITHM (Bowyer-Watson):
  function bowyerWatson(points):
    // Super-triangle containing all points
    triangulation = [superTriangle(points)]

    for point in points:
      bad_triangles = []

      // Find triangles whose circumcircle contains point
      for triangle in triangulation:
        if triangle.circumcircleContains(point):
          bad_triangles.push(triangle)

      // Find boundary polygon of bad triangles
      polygon = findBoundaryPolygon(bad_triangles)

      // Remove bad triangles
      triangulation.removeAll(bad_triangles)

      // Create new triangles connecting point to polygon
      for edge in polygon:
        triangulation.push(Triangle(edge, point))

    // Remove triangles connected to super-triangle vertices
    return triangulation.filter(t => !t.touchesSuperTriangle())
```

### Delaunay Fill Patterns

```
TRIANGLE OUTLINES:
  - Simple triangular mesh

DUAL VORONOI + DELAUNAY:
  - Draw both overlaid
  - Complex geometric lattice

TRIANGLE FILL:
  - Each triangle filled differently
  - Angle based on triangle orientation

EDGE WEIGHTS:
  - Thicker edges for longer edges
  - Or: edge weight from image brightness at midpoint
```

---

## 3. Reaction-Diffusion (Turing Patterns)

### Gray-Scott Model

```
EQUATIONS:
  ∂A/∂t = Da∇²A - AB² + f(1-A)
  ∂B/∂t = Db∇²B + AB² - (k+f)B

WHERE:
  A, B = chemical concentrations
  Da, Db = diffusion rates (typically Db > Da)
  f = feed rate (A added)
  k = kill rate (B removed)
  ∇² = Laplacian (spatial second derivative)

PARAMETERS:
  f = 0.055, k = 0.062: mitosis (spots splitting)
  f = 0.030, k = 0.057: coral/maze
  f = 0.025, k = 0.055: spots
  f = 0.078, k = 0.061: stripes
```

### Implementation

```
function simulateGrayScott(width, height, params, iterations):
  // Initialize grids
  A = Array2D(width, height, fill=1.0)
  B = Array2D(width, height, fill=0.0)

  // Seed with initial B concentration
  seedRegion(B, center, radius, value=1.0)

  for iter in 0..iterations:
    // Compute Laplacians
    lapA = laplacian(A)
    lapB = laplacian(B)

    // Update concentrations
    for x, y in grid:
      reaction = A[x,y] * B[x,y] * B[x,y]

      A[x,y] += params.Da * lapA[x,y] - reaction + params.f * (1 - A[x,y])
      B[x,y] += params.Db * lapB[x,y] + reaction - (params.k + params.f) * B[x,y]

      // Clamp to [0, 1]
      A[x,y] = clamp(A[x,y], 0, 1)
      B[x,y] = clamp(B[x,y], 0, 1)

  return B  // Return pattern (B concentration)

function laplacian(grid):
  // 3x3 kernel convolution
  kernel = [
    [0.05, 0.2, 0.05],
    [0.2, -1.0, 0.2],
    [0.05, 0.2, 0.05]
  ]
  return convolve(grid, kernel)
```

### Vectorizing Reaction-Diffusion Output

```
MARCHING SQUARES:
  - Threshold the B concentration grid
  - Extract contours at threshold value
  - Multiple thresholds = multiple line sets

function vectorizeReactionDiffusion(grid, thresholds):
  paths = []

  for threshold in thresholds:
    contours = marchingSquares(grid, threshold)
    for contour in contours:
      smoothed = smoothContour(contour)  // Remove grid artifacts
      paths.push(smoothed)

  return paths

DENSITY-BASED:
  - Use concentration as line density
  - Higher B = more hatch lines
  - Requires spatial mapping
```

---

## 4. Differential Growth

### Concept

A curve that grows and wrinkles, points repelling neighbors while being pushed outward.

```
ALGORITHM:
  function differentialGrowth(initial_curve, params, iterations):
    points = initial_curve.points

    for iter in 0..iterations:
      forces = Array(points.length, fill=Vector(0,0))

      // Repulsion between nearby points
      for i in 0..points.length:
        for j in i+1..points.length:
          dist = distance(points[i], points[j])
          if dist < params.repulsion_radius:
            direction = normalize(points[i] - points[j])
            force = direction * (params.repulsion_radius - dist) * params.repulsion_strength
            forces[i] += force
            forces[j] -= force

      // Attraction to neighbors (spring force)
      for i in 0..points.length:
        prev = points[(i - 1 + points.length) % points.length]
        next = points[(i + 1) % points.length]

        forces[i] += (prev - points[i]) * params.spring_strength
        forces[i] += (next - points[i]) * params.spring_strength

      // Growth force (outward)
      for i in 0..points.length:
        normal = computeNormal(points, i)
        forces[i] += normal * params.growth_force

      // Apply forces
      for i in 0..points.length:
        points[i] += forces[i] * params.dt

      // Subdivision: split long segments
      points = subdivideIfNeeded(points, params.max_segment_length)

      // Simplification: merge close points
      points = mergeIfNeeded(points, params.min_segment_length)

    return points
```

### Variations

```
MULTIPLE CURVES:
  - Start with several curves
  - They repel each other
  - Fill space without overlapping

CONSTRAINED GROWTH:
  - Curve cannot exit bounding region
  - Add repulsion from boundary

SEEDED GROWTH:
  - Multiple starting circles
  - Grow until they touch
  - Creates cell-like packing

GROWTH WITH BRANCHING:
  - Occasionally split curve into two
  - Creates tree/root-like structures
```

---

## 5. Phyllotaxis Patterns

### Golden Angle Spiral

```
GOLDEN ANGLE: φ = 360° / φ² ≈ 137.507764°
  where φ = (1 + √5) / 2 (golden ratio)

ALGORITHM:
  function phyllotaxis(count, scale, offset=0):
    points = []

    for i in 0..count:
      angle = i * GOLDEN_ANGLE + offset
      radius = scale * sqrt(i)  // Fermat spiral
      // radius = scale * i      // Archimedes spiral

      x = radius * cos(radians(angle))
      y = radius * sin(radians(angle))
      points.push((x, y))

    return points
```

### Visible Spirals (Parastichies)

```
CONCEPT:
  - Connect nth point to (n+F)th point
  - Where F is a Fibonacci number
  - Creates visible spiral arms

COMMON PATTERNS:
  - 8 and 13 spirals (clockwise/counterclockwise)
  - 13 and 21 spirals
  - 21 and 34 spirals
  - Fibonacci numbers emerge naturally!

DRAWING:
  function drawParastichies(points, fib_number):
    paths = []
    for start in 0..fib_number:
      path = []
      i = start
      while i < points.length:
        path.push(points[i])
        i += fib_number
      paths.push(path)
    return paths
```

### Phyllotaxis Variations

```
VARIABLE ANGLE:
  - Slightly different from golden angle
  - Creates different spiral counts
  - angle = 360° * k where k varies

SUNFLOWER HEADS:
  - Phyllotaxis for positions
  - Circle/hexagon at each position
  - Size varies by radius

CONE PROJECTION:
  - Map flat phyllotaxis onto cone surface
  - Creates pinecone pattern
```

---

## 6. Crack Patterns

### Propagating Cracks

```
function generateCrackPattern(bounds, params):
  cracks = []

  // Initialize with edge cracks or random seeds
  for i in 0..params.initial_cracks:
    start = randomPointOnBoundary(bounds) // or random inside
    direction = randomDirection()
    cracks.push(Crack(start, direction))

  while activeCracksExist(cracks):
    for crack in cracks:
      if crack.active:
        // Extend crack
        new_point = crack.tip + crack.direction * params.step_size

        // Add some randomness to direction
        crack.direction = rotate(crack.direction, randomAngle(-params.wander, params.wander))

        // Check for termination
        if outsideBounds(new_point, bounds) or hitsOtherCrack(new_point, cracks):
          crack.active = false
        else:
          crack.points.push(new_point)
          crack.tip = new_point

          // Possibly branch
          if random() < params.branch_probability:
            branch_dir = rotate(crack.direction, randomChoice([-90, 90]) + randomAngle(-20, 20))
            cracks.push(Crack(new_point, branch_dir))

  return cracks
```

### Mud Crack Simulation

```
CONCEPT:
  - Start with grid of tension points
  - Cracks form between tension regions
  - Cracks perpendicular to tension gradient

SHRINKAGE MODEL:
  - Material shrinks uniformly
  - Creates roughly hexagonal cells
  - Cracks meet at ~120° angles
```

---

## 7. Coral/Branching Structures

### Diffusion-Limited Aggregation (DLA)

```
function DLA(bounds, seed_point, num_particles):
  structure = Set([seed_point])

  for p in 0..num_particles:
    // Start particle at random position on circle around structure
    particle = randomPointOnCircle(center=seed_point, radius=currentRadius(structure) * 2)

    while true:
      // Random walk
      particle += randomStep()

      // Check if adjacent to structure
      if adjacentToStructure(particle, structure):
        structure.add(particle)
        break

      // If wandered too far, restart
      if distance(particle, seed_point) > killRadius:
        particle = randomPointOnCircle(...)

  return structure
```

### Space Colonization Algorithm

```
CONCEPT:
  - Attractors scattered in space
  - Branch tips grow toward nearest attractors
  - Attractors removed when reached

function spaceColonization(attractors, root, params):
  branches = [Branch(root, null)]  // tip, parent

  while attractors.length > 0 and iterations < max:
    // Associate attractors with nearest branch tip
    for attractor in attractors:
      nearest = findNearestBranchTip(attractor, branches)
      if distance(attractor, nearest.tip) < params.influence_radius:
        nearest.attractors.push(attractor)

    // Grow branches toward their attractors
    new_branches = []
    for branch in branches:
      if branch.attractors.length > 0:
        // Average direction to attractors
        direction = averageDirection(branch.tip, branch.attractors)
        new_tip = branch.tip + direction * params.step_size
        new_branches.push(Branch(new_tip, branch))
      branch.attractors = []

    branches.extend(new_branches)

    // Remove reached attractors
    attractors = attractors.filter(a =>
      distance(a, nearestBranchTip(a, branches)) > params.kill_radius
    )

  return branches
```

---

## 8. Flow-Based Organic Patterns

### Vector Field from Noise

```
function noiseFlowField(bounds, params):
  field = Array2D(bounds.width / params.resolution, bounds.height / params.resolution)

  for x, y in field:
    // Multi-octave noise for organic feel
    angle = noise(x * params.scale, y * params.scale) * TWO_PI * params.angle_range

    // Optional: add curl to prevent sinks
    angle += curl(x, y, params.curl_strength)

    field[x, y] = Vector(cos(angle), sin(angle))

  return field

function traceStreamlines(field, bounds, params):
  lines = []

  // Evenly-spaced seed points
  seeds = poissonDiskSampling(bounds, params.line_spacing)

  for seed in seeds:
    line = traceStreamline(seed, field, params)
    if line.length > params.min_length:
      lines.push(line)

  return lines

function traceStreamline(start, field, params):
  points = [start]
  current = start

  for step in 0..params.max_steps:
    // Get vector at current position
    vec = field.sample(current)  // bilinear interpolation

    // Step forward
    next = current + vec * params.step_size

    // Check bounds and separation from other lines
    if not inBounds(next) or tooCloseToOtherLine(next, existing_lines):
      break

    points.push(next)
    current = next

  return points
```

---

## 9. Cell Packing / Circle Packing

### Iterative Circle Packing

```
function packCircles(bounds, params):
  circles = []

  for attempt in 0..params.max_attempts:
    // Try to place new circle
    center = randomPointIn(bounds)

    // Find maximum radius that doesn't overlap
    max_radius = params.max_radius

    for existing in circles:
      dist = distance(center, existing.center)
      allowed = dist - existing.radius
      max_radius = min(max_radius, allowed)

    // Also check boundary distance
    max_radius = min(max_radius, distanceToBoundary(center, bounds))

    if max_radius >= params.min_radius:
      circles.push(Circle(center, max_radius))

  return circles
```

### Apollonian Gasket

```
CONCEPT:
  - Start with three mutually tangent circles
  - Find circle tangent to all three
  - Recurse into each gap

function apollonianGasket(c1, c2, c3, depth):
  if depth == 0:
    return []

  circles = []

  // Find circles tangent to all three
  // Uses Descartes' Circle Theorem
  new_circles = findTangentCircles(c1, c2, c3)

  for nc in new_circles:
    if nc.radius > min_radius:
      circles.push(nc)

      // Recurse with each triple containing new circle
      circles.extend(apollonianGasket(c1, c2, nc, depth-1))
      circles.extend(apollonianGasket(c1, c3, nc, depth-1))
      circles.extend(apollonianGasket(c2, c3, nc, depth-1))

  return circles
```

---

## Implementation Notes

### Converting to Pen Plotter Output

```
ORGANIC PATTERN WORKFLOW:
  1. Generate pattern (points, cells, curves)
  2. Convert to vector paths
  3. Clip to fill region
  4. Optimize path ordering
  5. Export as SVG

PATH OPTIMIZATION:
  - Organic patterns often produce many disconnected paths
  - Use nearest-neighbor or 2-opt for path ordering
  - Consider path direction to reduce pen-up distance
```

### Combining Organic Patterns

```
VORONOI + FLOW:
  - Flow lines within each Voronoi cell
  - Flow direction based on cell centroid

REACTION-DIFFUSION + HATCHING:
  - R-D determines density zones
  - Hatch lines fill zones with varying spacing

GROWTH + VORONOI:
  - Differential growth curve defines region
  - Voronoi fills the irregular region
```

---

## References

- Fortune, S. (1987) "A sweepline algorithm for Voronoi diagrams"
- Turing, A. (1952) "The Chemical Basis of Morphogenesis"
- Gray, P. & Scott, S. (1984) "Autocatalytic reactions in the CSTR"
- Prusinkiewicz, P. & Lindenmayer, A. (1990) "The Algorithmic Beauty of Plants"
- Witten, T. & Sander, L. (1981) "Diffusion-limited aggregation"
- Runions, A. et al. (2005) "Modeling and visualization of leaf venation patterns"
