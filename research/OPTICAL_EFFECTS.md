# Optical Effects and Illusion Patterns

Creating visual phenomena through geometric precision - moiré, op-art, and interference patterns for pen plotter output.

---

## Overview

Optical patterns exploit human visual perception to create effects like movement, depth, vibration, and impossible geometry. Pen plotters are ideal for these: precise lines at exact spacings are critical, and slight imperfections (hand-drawn quality) can enhance the effect.

---

## 1. Moiré Patterns

### Basic Theory

Moiré occurs when two regular patterns overlap with slight differences in angle, spacing, or position.

```
INTERFERENCE FORMULA:
  For two line grids at angle θ with same spacing d:
  Moiré spacing = d / (2 * sin(θ/2))

  For small angles:
  Moiré spacing ≈ d / θ (in radians)

EXAMPLE:
  d = 1mm, θ = 2° ≈ 0.035 rad
  Moiré spacing ≈ 1 / 0.035 ≈ 29mm
```

### Line Grid Moiré

```
function generateLineMoire(bounds, params):
  layers = []

  // Layer 1: Base grid
  layer1 = generateParallelLines(
    bounds,
    spacing: params.spacing,
    angle: 0
  )
  layers.push(layer1)

  // Layer 2: Offset grid
  layer2 = generateParallelLines(
    bounds,
    spacing: params.spacing * params.spacing_ratio,  // slight difference
    angle: params.angle_offset  // typically 1-5 degrees
  )
  layers.push(layer2)

  return layers

VARIATIONS:
  - Both grids same angle, different spacing: parallel moiré bands
  - Same spacing, different angle: radiating moiré
  - Both different: complex interference
```

### Circular Moiré

```
function generateCircularMoire(bounds, params):
  layers = []

  // Layer 1: Concentric circles from center1
  layer1 = generateConcentricCircles(
    center: params.center1,
    min_radius: 0,
    max_radius: params.max_radius,
    spacing: params.spacing
  )
  layers.push(layer1)

  // Layer 2: Concentric circles from offset center
  layer2 = generateConcentricCircles(
    center: params.center2,  // slightly offset from center1
    min_radius: 0,
    max_radius: params.max_radius,
    spacing: params.spacing
  )
  layers.push(layer2)

  return layers

EFFECT:
  - Creates hyperbolic moiré curves
  - Appears to have depth/movement
  - Very sensitive to center offset distance
```

### Radial Moiré

```
function generateRadialMoire(bounds, params):
  layers = []

  // Layer 1: Lines radiating from center1
  layer1 = generateRadialLines(
    center: params.center1,
    count: params.line_count,
    length: params.max_radius
  )
  layers.push(layer1)

  // Layer 2: Rotated radial lines
  layer2 = generateRadialLines(
    center: params.center1,  // same center
    count: params.line_count,
    length: params.max_radius,
    rotation: params.angle_offset  // rotate slightly
  )
  layers.push(layer2)

  return layers
```

### Dynamic Moiré (for animation/flipbooks)

```
CONCEPT:
  - Generate frames with progressively shifted overlay
  - When flipped, moiré pattern animates

function generateMoireAnimation(bounds, params, frame_count):
  frames = []
  base_layer = generatePattern(params.base)

  for f in 0..frame_count:
    overlay = generatePattern(params.overlay, offset = f * params.step)
    frame = combine(base_layer, overlay)
    frames.push(frame)

  return frames
```

---

## 2. Op-Art Distortion Patterns

### Bridget Riley Style - Line Distortion

```
function rileyLines(bounds, params):
  lines = []

  for y in range(bounds.top, bounds.bottom, params.spacing):
    points = []

    for x in range(bounds.left, bounds.right, params.resolution):
      // Distortion function determines y-offset
      distortion = params.wave_amplitude * sin(
        (x - bounds.left) / params.wave_length * TWO_PI +
        (y - bounds.top) / bounds.height * params.phase_shift
      )

      // Additional radial bulge
      dx = x - bounds.centerX
      dy = y - bounds.centerY
      dist = sqrt(dx*dx + dy*dy)
      radial = params.bulge_amplitude * exp(-dist*dist / params.bulge_radius)

      points.push((x, y + distortion + radial))

    lines.push(smoothCurve(points))

  return lines
```

### Vasarely Style - Grid Distortion

```
function vasarelyGrid(bounds, params):
  shapes = []

  for row in 0..params.rows:
    for col in 0..params.cols:
      // Base position
      x = bounds.left + (col + 0.5) * params.cell_size
      y = bounds.top + (row + 0.5) * params.cell_size

      // Distortion based on position
      dx = x - bounds.centerX
      dy = y - bounds.centerY
      dist = sqrt(dx*dx + dy*dy)

      // Radial displacement (bulge effect)
      if dist > 0:
        displacement = params.bulge_strength * exp(-dist / params.bulge_falloff)
        x += dx / dist * displacement
        y += dy / dist * displacement

      // Size variation
      size = params.base_size * (1 + params.size_variation * (1 - dist / params.max_dist))

      // Shape (circle, square, or interpolation)
      shape = generateShape(x, y, size, params.shape_type, params.roundness)
      shapes.push(shape)

  return shapes
```

### Checkerboard Warp

```
function warpedCheckerboard(bounds, params):
  cells = []

  for row in 0..params.rows:
    for col in 0..params.cols:
      if (row + col) % 2 == 0:  // Checkerboard condition
        // Get warped corner positions
        corners = []
        for corner in [(0,0), (1,0), (1,1), (0,1)]:
          // Original position
          ox = bounds.left + (col + corner[0]) * params.cell_size
          oy = bounds.top + (row + corner[1]) * params.cell_size

          // Apply warp function
          wx, wy = applyWarp(ox, oy, params.warp_function)
          corners.push((wx, wy))

        cells.push(Polygon(corners))

  return cells

WARP FUNCTIONS:
  - Spherize: points pushed outward from center
  - Pinch: points pulled toward center
  - Wave: sinusoidal displacement
  - Twist: rotation varies with radius
```

---

## 3. Depth Illusion Patterns

### Stereographic Illusions

```
LINE DENSITY = DEPTH:
  - Closer lines = darker = appears further away (or closer, depending)
  - Create 3D form through line spacing variation

function depthLines(bounds, depth_map, params):
  lines = []
  y = bounds.top

  while y < bounds.bottom:
    // Sample depth at this y position
    avg_depth = averageDepth(depth_map, y)

    // Spacing inversely proportional to depth
    spacing = params.min_spacing + (params.max_spacing - params.min_spacing) * avg_depth

    // Generate line with depth-based curvature
    line = []
    for x in range(bounds.left, bounds.right, params.resolution):
      depth = sampleDepth(depth_map, x, y)
      y_offset = depth * params.displacement
      line.push((x, y + y_offset))

    lines.push(smoothCurve(line))
    y += spacing

  return lines
```

### Impossible Figures

```
PENROSE TRIANGLE:
  function penroseTriangle(center, size, line_width):
    // Three bars that appear to connect impossibly
    // Each bar has two parallel edges
    // Connections at corners create the illusion

    corners = [
      (center.x, center.y - size),
      (center.x - size * 0.866, center.y + size * 0.5),
      (center.x + size * 0.866, center.y + size * 0.5)
    ]

    paths = []
    for i in 0..3:
      bar = createBar(corners[i], corners[(i+1)%3], line_width, params)
      paths.extend(bar)

    return paths

ESCHER-STYLE:
  - Waterfall: water appears to flow upward
  - Ascending stairs: endless staircase
  - Requires careful edge connections to create paradox
```

---

## 4. Kinetic/Movement Illusions

### Rotating Snakes (Kitaoka)

```
CONCEPT:
  - Concentric rings with asymmetric color/pattern gradient
  - Appears to rotate when viewed peripherally

function rotatingSnakes(center, params):
  paths = []

  for ring in 0..params.num_rings:
    radius = params.inner_radius + ring * params.ring_spacing

    for segment in 0..params.segments_per_ring:
      angle_start = segment * (TWO_PI / params.segments_per_ring)

      // Asymmetric pattern within segment creates motion illusion
      // Pattern: dark -> light -> dark on one side
      // Gradient direction alternates between rings

      direction = (ring % 2 == 0) ? 1 : -1

      arc = createGradientArc(
        center, radius,
        angle_start, angle_start + TWO_PI / params.segments_per_ring,
        direction
      )
      paths.extend(arc)

  return paths

GRADIENT ARC FOR PLOTTER:
  - Approximate gradient with varying line density
  - Denser lines = darker
  - Gradient direction critical for motion effect
```

### Scintillating Grid

```
CONCEPT:
  - Gray lines on white background
  - White dots at intersections
  - Black dots appear to flash at intersections not directly viewed

function scintillatingGrid(bounds, params):
  paths = []

  // Horizontal lines
  for y in range(bounds.top, bounds.bottom, params.spacing):
    paths.push(Line(bounds.left, y, bounds.right, y))

  // Vertical lines
  for x in range(bounds.left, bounds.right, params.spacing):
    paths.push(Line(x, bounds.top, x, bounds.bottom))

  // White circles at intersections (drawn as outline or left blank)
  for y in range(bounds.top, bounds.bottom, params.spacing):
    for x in range(bounds.left, bounds.right, params.spacing):
      // For plotter: either leave blank or draw small circle
      // The scintillation happens in perception
      pass

  return paths
```

### Pulsating Patterns

```
function pulsatingCircles(center, params):
  paths = []

  for ring in 0..params.num_rings:
    radius = params.inner_radius + ring * params.spacing

    // Varying line weight per ring
    // Creates illusion of pulsation
    weight = params.base_weight * (1 + params.variation * sin(ring * params.frequency))

    circle = createCircle(center, radius, weight)
    paths.push(circle)

  return paths
```

---

## 5. Chladni Figures

### Mathematical Basis

```
VIBRATING SQUARE PLATE:
  Standing wave equation:
  f(x, y) = cos(m*π*x/L) * cos(n*π*y/L) - cos(n*π*x/L) * cos(m*π*y/L)

  where:
    L = plate size
    m, n = mode numbers (integers)

  Nodal lines (where f = 0) form the pattern

VIBRATING CIRCULAR PLATE:
  f(r, θ) = Jm(λ*r/R) * cos(m*θ)

  where:
    Jm = Bessel function of first kind
    λ = roots of Bessel function (eigenvalues)
    R = plate radius
    m = angular mode number
```

### Implementation

```
function chladniSquare(bounds, m, n, params):
  // Generate contour at f = 0

  function f(x, y):
    // Normalize coordinates to [0, 1]
    nx = (x - bounds.left) / bounds.width
    ny = (y - bounds.top) / bounds.height

    return cos(m * PI * nx) * cos(n * PI * ny) -
           cos(n * PI * nx) * cos(m * PI * ny)

  // Use marching squares to find zero contour
  contours = marchingSquares(bounds, f, threshold=0, resolution=params.resolution)

  return contours

function chladniCircle(center, radius, m, lambda_index, params):
  // Get appropriate Bessel function root
  lambda = besselZeros(m)[lambda_index]

  function f(r, theta):
    return besselJ(m, lambda * r / radius) * cos(m * theta)

  // Convert to Cartesian and use marching squares
  // Or: trace contour directly in polar coordinates

  contours = marchingSquaresPolar(center, radius, f, threshold=0)

  return contours
```

### Chladni Variations

```
OVERLAID MODES:
  - Sum multiple (m,n) patterns
  - Creates more complex figures

  function multiModeChladni(bounds, modes, weights):
    function f(x, y):
      total = 0
      for (m, n), weight in zip(modes, weights):
        total += weight * chladniFunction(x, y, m, n)
      return total

    return marchingSquares(bounds, f, threshold=0)

DAMPED CHLADNI:
  - Add decay term: f * exp(-distance_from_center)
  - Pattern fades toward edges
```

---

## 6. Interference Patterns

### Wave Interference (Ripples)

```
function waveInterference(bounds, sources, params):
  function amplitude(x, y):
    total = 0
    for source in sources:
      dist = distance((x, y), source.position)
      phase = dist / params.wavelength * TWO_PI + source.phase
      total += source.amplitude * cos(phase) * exp(-dist * params.decay)
    return total

  // Contour at multiple amplitude levels
  contours = []
  for level in range(-1, 1, params.contour_step):
    contours.extend(marchingSquares(bounds, amplitude, threshold=level))

  return contours

VARIATIONS:
  - Point sources: circular waves
  - Line sources: parallel waves
  - Moving sources: Doppler effect patterns
```

### Double-Slit Pattern

```
function doubleSlitPattern(bounds, params):
  // Two point sources (slit positions)
  slit1 = (params.centerX - params.slit_separation/2, params.sourceY)
  slit2 = (params.centerX + params.slit_separation/2, params.sourceY)

  function intensity(x, y):
    d1 = distance((x, y), slit1)
    d2 = distance((x, y), slit2)

    // Phase difference determines interference
    phase_diff = (d2 - d1) / params.wavelength * TWO_PI

    // Intensity pattern (squared sum of waves)
    return pow(cos(phase_diff / 2), 2)

  // Draw as line density variation
  return densityLines(bounds, intensity, params)
```

---

## 7. Anamorphic Patterns

### Cylindrical Anamorphosis

```
CONCEPT:
  - Distorted image that appears correct when viewed in cylindrical mirror
  - Radial stretching around cylinder position

function cylindricalAnamorphosis(source_image, cylinder_center, cylinder_radius, bounds):
  transformed = []

  for path in source_image.paths:
    new_path = []
    for point in path:
      // Transform point for cylindrical viewing
      dx = point.x - cylinder_center.x
      dy = point.y - cylinder_center.y
      dist = sqrt(dx*dx + dy*dy)
      angle = atan2(dy, dx)

      // Radial stretching function
      new_dist = anamorphicRadialTransform(dist, cylinder_radius)

      new_x = cylinder_center.x + new_dist * cos(angle)
      new_y = cylinder_center.y + new_dist * sin(angle)
      new_path.push((new_x, new_y))

    transformed.push(new_path)

  return transformed

function anamorphicRadialTransform(dist, cyl_radius):
  // Based on reflection geometry
  // Points close to cylinder compressed, far points stretched
  return cyl_radius * tan(dist / cyl_radius)
```

### Conical Anamorphosis

```
CONCEPT:
  - View from above a cone for correct image
  - Angular transformation

function conicalAnamorphosis(source_image, cone_apex, cone_angle, bounds):
  // Transform to polar coordinates relative to apex
  // Stretch radially based on cone angle
  // Similar to cylindrical but different radial function
```

---

## 8. Halftone and Threshold Patterns

### Traditional Halftone

```
function halftonePattern(image, params):
  dots = []

  for row in 0..image.height / params.cell_size:
    for col in 0..image.width / params.cell_size:
      // Sample image brightness in cell
      brightness = sampleCell(image, col, row, params.cell_size)

      // Dot size inversely proportional to brightness
      dot_radius = (1 - brightness) * params.max_dot_size / 2

      center_x = (col + 0.5) * params.cell_size
      center_y = (row + 0.5) * params.cell_size

      if dot_radius > params.min_dot_size:
        dots.push(Circle(center_x, center_y, dot_radius))

  return dots
```

### Line Halftone

```
function lineHalftone(image, params):
  lines = []

  for row in 0..image.height / params.line_spacing:
    y = row * params.line_spacing

    points = []
    for x in 0..image.width by params.resolution:
      brightness = sampleImage(image, x, y)

      // Modulate line position based on brightness
      // Creates wave that appears darker in dark regions
      offset = (0.5 - brightness) * params.amplitude

      points.push((x, y + offset))

    lines.push(smoothCurve(points))

  return lines
```

### Cross-Hatch Halftone

```
function crossHatchHalftone(image, params):
  hatches = []

  // Multiple angles, each activated at different darkness thresholds
  angles = [45, -45, 0, 90]  // increasing darkness
  thresholds = [0.75, 0.5, 0.25, 0.1]  // brightness thresholds

  for angle, threshold in zip(angles, thresholds):
    for y in range with spacing based on angle:
      line_points = []
      for x in range:
        brightness = sampleImage(image, x, y)
        if brightness < threshold:
          // Include this segment
          line_points.push((x, y))
        else:
          // Break line
          if line_points.length > 1:
            hatches.push(rotateLine(line_points, angle))
          line_points = []

  return hatches
```

---

## Implementation Tips for Pen Plotters

### Line Weight Considerations

```
OPTICAL EFFECTS REQUIREMENTS:
  - Very consistent line weight critical for moiré
  - Pen pressure/speed affects perceived weight
  - Test specific pen/paper combination

RECOMMENDATIONS:
  - Use technical pens (0.1-0.5mm)
  - Constant plotting speed
  - High-quality smooth paper
  - Consider multiple passes for thicker "lines"
```

### Precision Requirements

```
MOIRÉ:
  - Extremely sensitive to spacing errors
  - Even 0.1mm deviation can break effect
  - Plotter calibration critical

OP-ART:
  - Smooth curves require high resolution
  - Bezier curves preferred over polylines
  - Min segment length: 0.5mm for smooth appearance
```

### Testing Workflow

```
1. Generate at small scale first (test plot)
2. Verify pattern works before full-size
3. Moiré especially needs physical test
4. Screen preview won't show true effect
5. Camera/scanner introduces own moiré - view in person
```

---

## References

- Riley, B. (various) Collected works and interviews
- Vasarely, V. (1969) "Vasarely" (monograph)
- Kitaoka, A. (2003) "Rotating snakes: a new type of illusory motion"
- Oster, G. (1965) "Optical Art" (Scientific American)
- Chladni, E. (1787) "Entdeckungen über die Theorie des Klanges"
- Amidror, I. (2009) "The Theory of the Moiré Phenomenon"
