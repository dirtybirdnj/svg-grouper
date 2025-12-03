# Generative Typography Fills

Using text and letterforms as fill patterns for pen plotter output.

---

## Overview

Typography-based fills create dual-purpose patterns: visual texture AND readable (or semi-readable) content. The interplay between micro-scale text and macro-scale shape creates visual interest and potential hidden messages.

---

## 1. Basic Text Fill Patterns

### Simple Text Fill

```
CONCEPT:
  - Fill region with lines of text
  - Text flows left-to-right, top-to-bottom
  - Clipped to region boundary

function simpleTextFill(region, text, params):
  lines = []
  y = region.bounds.top + params.line_height
  text_index = 0

  while y < region.bounds.bottom:
    // Find horizontal extent of region at this y
    spans = region.horizontalSpansAt(y)

    for span in spans:
      x = span.left + params.margin

      while x < span.right - params.margin:
        char = text[text_index % text.length]
        char_width = measureChar(char, params.font, params.font_size)

        if x + char_width < span.right - params.margin:
          lines.extend(renderChar(char, x, y, params))
          x += char_width + params.letter_spacing
          text_index++
        else:
          break

    y += params.line_height

  return lines

PARAMETERS:
  - font: font family or custom letterforms
  - font_size: character height
  - line_height: vertical spacing between baselines
  - letter_spacing: horizontal space between characters
  - word_spacing: additional space at word boundaries
```

### Justified Text Fill

```
function justifiedTextFill(region, text, params):
  lines = []
  y = region.bounds.top + params.line_height

  while y < region.bounds.bottom:
    spans = region.horizontalSpansAt(y)

    for span in spans:
      span_width = span.right - span.left - 2 * params.margin

      // Determine how much text fits
      words_that_fit, remaining = fitWords(text, span_width, params)

      if words_that_fit.length > 1:
        // Calculate spacing to justify
        total_word_width = sum(measureWord(w, params) for w in words_that_fit)
        total_gaps = len(words_that_fit) - 1
        gap_size = (span_width - total_word_width) / total_gaps

        // Render with calculated spacing
        x = span.left + params.margin
        for i, word in enumerate(words_that_fit):
          lines.extend(renderWord(word, x, y, params))
          x += measureWord(word, params)
          if i < total_gaps:
            x += gap_size

      text = remaining

    y += params.line_height

  return lines
```

### Circular/Path Text

```
function textAlongPath(path, text, params):
  lines = []
  path_length = path.totalLength()
  char_position = 0

  for i, char in enumerate(text):
    if char_position > path_length:
      break

    // Get position and tangent at this point on path
    point, tangent = path.pointAndTangentAt(char_position)
    angle = atan2(tangent.y, tangent.x)

    // Render character rotated to follow path
    char_paths = renderChar(char, 0, 0, params)
    transformed = rotateAndTranslate(char_paths, angle, point)
    lines.extend(transformed)

    char_position += measureChar(char, params) + params.letter_spacing

  return lines

function spiralText(center, text, params):
  // Text follows Archimedean spiral
  path = archimedeanSpiral(
    center,
    params.start_radius,
    params.end_radius,
    params.turns
  )
  return textAlongPath(path, text, params)
```

---

## 2. Density-Modulated Text

### Text as Halftone

```
CONCEPT:
  - Text size/density varies based on underlying image
  - Dark areas = larger or more text
  - Creates image from text

function textHalftone(image, text, params):
  elements = []
  text_index = 0

  for y in range(0, image.height, params.cell_size):
    for x in range(0, image.width, params.cell_size):
      // Sample image brightness
      brightness = sampleImageCell(image, x, y, params.cell_size)

      if brightness < params.threshold:
        // Place text, size based on darkness
        font_size = params.min_size + (1 - brightness) * (params.max_size - params.min_size)
        char = text[text_index % text.length]

        elements.extend(renderChar(char, x, y, {
          font_size: font_size,
          ...params
        }))

        text_index++

  return elements
```

### Readable Image from Text

```
function asciiArtFill(image, region, params):
  // Map brightness to character density
  // @ # $ % & * + = - . (from dense to sparse)

  DENSITY_CHARS = "@#$%&*+=-.  "

  lines = []

  for row in range(0, region.height, params.char_height):
    row_chars = []

    for col in range(0, region.width, params.char_width):
      // Sample image at this position
      brightness = sampleImage(image,
        region.left + col,
        region.top + row,
        params.char_width,
        params.char_height
      )

      // Map to character
      char_index = floor(brightness * (len(DENSITY_CHARS) - 1))
      char = DENSITY_CHARS[char_index]

      if char != ' ':
        lines.extend(renderChar(char, col, row, params))

  return lines
```

---

## 3. Micrography

### Traditional Micrography

```
CONCEPT:
  - Ancient Jewish/Islamic art form
  - Tiny text forms images or decorative shapes
  - Entire books written as single image

function micrographyFill(region, text, contour_path, params):
  lines = []

  // Text follows contour lines within region
  contours = generateContours(region, params.contour_spacing)
  text_index = 0

  for contour in contours:
    contour_length = contour.totalLength()
    position = 0

    while position < contour_length:
      char = text[text_index % text.length]
      point, tangent = contour.pointAndTangentAt(position)
      angle = atan2(tangent.y, tangent.x)

      char_paths = renderChar(char, 0, 0, params)
      transformed = rotateAndTranslate(char_paths, angle, point)
      lines.extend(transformed)

      position += measureChar(char, params) + params.spacing
      text_index++

  return lines
```

### Calligram

```
CONCEPT:
  - Text arranged to form picture of subject
  - e.g., poem about cat arranged in cat shape

function calligram(region, text, params):
  // Analyze region to determine text flow
  // Text lines follow shape boundary

  // Option 1: Horizontal lines clipped to region
  return simpleTextFill(region, text, params)

  // Option 2: Text follows region contour, spiraling in
  return contourTextFill(region, text, params)

  // Option 3: Text radiates from center
  return radialTextFill(region, text, params)
```

---

## 4. Single-Stroke Typography

### Hershey Fonts

```
CONCEPT:
  - Vector fonts designed for CNC/plotter
  - Characters defined as single strokes
  - No fills, just lines
  - Very efficient for pen plotting

HERSHEY CHARACTER FORMAT:
  Each character = series of polylines
  Move commands (pen up) and draw commands (pen down)

function renderHersheyChar(char, x, y, scale):
  glyph = HERSHEY_FONT[char]
  paths = []

  for stroke in glyph.strokes:
    path = []
    for point in stroke:
      path.push((
        x + point.x * scale,
        y + point.y * scale
      ))
    paths.push(path)

  return paths

HERSHEY VARIANTS:
  - Roman simplex (clean sans-serif)
  - Roman duplex (thicker strokes)
  - Script (cursive)
  - Gothic (blackletter)
  - Greek, Cyrillic, Japanese available
```

### Custom Single-Stroke Fonts

```
DESIGN PRINCIPLES:
  - Each letter = continuous path where possible
  - Minimize pen lifts
  - Clear letterforms at small sizes
  - Consistent stroke width

LETTER CONSTRUCTION:
  function designLetter_A(params):
    // Single stroke: up-over-down with crossbar branch
    return [
      // Main stroke
      [
        (0, params.height),              // bottom left
        (params.width/2, 0),             // apex
        (params.width, params.height),   // bottom right
      ],
      // Crossbar (separate stroke)
      [
        (params.width * 0.2, params.height * 0.5),
        (params.width * 0.8, params.height * 0.5),
      ]
    ]

OPTIMIZATION:
  - Design connected script fonts
  - All letters connect = one continuous path
  - Much faster plotting
```

---

## 5. Generative Letterforms

### Parametric Type

```
CONCEPT:
  - Letterforms with adjustable parameters
  - Same text, different expressions
  - Parameters can vary spatially

function parametricLetter(char, params):
  // Base skeleton
  skeleton = LETTER_SKELETONS[char]

  // Apply parameters
  modified = skeleton.map(point => ({
    x: point.x * params.width_scale,
    y: point.y * params.height_scale,
    // Local modifications
    offset: noise(point.x, point.y) * params.noise_amount
  }))

  // Expand to stroke
  return expandStroke(modified, params.stroke_width)

PARAMETERS:
  - width_scale, height_scale: proportion
  - stroke_width: line thickness
  - corner_radius: roundness
  - noise_amount: organic distortion
  - slant: italic angle
```

### Destructive Typography

```
CONCEPT:
  - Letterforms that degrade, glitch, or dissolve
  - Readable to abstract gradient

function degradedText(text, params):
  elements = []

  for i, char in enumerate(text):
    // Degradation increases along text
    degradation = i / len(text) * params.max_degradation

    // Get character paths
    char_paths = renderChar(char, i * params.spacing, 0, params)

    // Apply degradation
    degraded = applyDegradation(char_paths, degradation, params.degrade_type)
    elements.extend(degraded)

  return elements

DEGRADATION TYPES:
  - Fragment: break into pieces
  - Noise: displace points randomly
  - Dissolve: remove random segments
  - Glitch: horizontal slice displacement
  - Melt: vertical smearing
```

### Growing/Organic Letters

```
function organicLetter(char, params):
  // Start with letter skeleton
  skeleton = LETTER_SKELETONS[char]

  // Apply differential growth to edges
  grown = differentialGrowth(skeleton, params.growth_params)

  return grown

function vineLetters(text, params):
  letters = []

  for i, char in enumerate(text):
    base = renderChar(char, i * params.spacing, 0, params)

    // Add organic tendrils
    for branch_point in selectBranchPoints(base, params.branches):
      tendril = growTendril(branch_point, params.tendril_params)
      letters.extend(tendril)

    letters.extend(base)

  return letters
```

---

## 6. Text Pattern Combinations

### Text + Geometric

```
function textInShapes(shapes, text, params):
  elements = []
  text_index = 0

  for shape in shapes:
    // Fill each shape with portion of text
    fill = simpleTextFill(shape, text.substring(text_index), params)
    elements.extend(fill)

    // Count characters used
    chars_in_shape = countCharacters(fill)
    text_index += chars_in_shape

  return elements

EXAMPLES:
  - Text in Voronoi cells
  - Text in geometric tessellation
  - Text in concentric shapes
```

### Layered Text

```
function layeredText(region, texts, params):
  layers = []

  for i, text in enumerate(texts):
    layer_params = {
      ...params,
      angle: i * params.angle_increment,  // Each layer rotated
      font_size: params.base_size * (1 - i * 0.2),  // Decreasing size
      opacity: 1 - i * 0.3  // If rendering supports it
    }

    layer = simpleTextFill(region, text, layer_params)
    layers.push(layer)

  return flatten(layers)
```

### Text Mask

```
function textMask(text, fill_pattern, params):
  // Text acts as mask for another pattern

  // 1. Render text as filled shapes
  text_shapes = renderTextAsShapes(text, params)

  // 2. Generate fill pattern for bounding box
  bounds = getBounds(text_shapes)
  pattern = generatePattern(bounds, params.pattern_type)

  // 3. Clip pattern to text shapes
  masked = []
  for shape in text_shapes:
    clipped = clipPathsToShape(pattern, shape)
    masked.extend(clipped)

  return masked
```

---

## 7. Semantic Text Patterns

### Content-Aware Fill

```
function contentAwareFill(region, content_source, params):
  // Text relates to what it fills

  // Option 1: Image tags/description
  text = getImageDescription(region)

  // Option 2: Region name/label
  text = region.label or region.id

  // Option 3: Coordinates/data
  text = formatCoordinates(region.center)

  return simpleTextFill(region, repeatText(text), params)
```

### Data Visualization Text

```
function dataTextFill(region, data, params):
  // Data values become the fill

  text = ""
  for value in data:
    text += formatValue(value) + " "

  return simpleTextFill(region, text, params)

EXAMPLES:
  - Stock prices filling stock chart
  - Timestamps filling timeline
  - Names filling portrait
```

### Multi-Language Fill

```
function multiLanguageFill(region, message, languages, params):
  // Same message in multiple languages

  translations = [translate(message, lang) for lang in languages]
  combined = " | ".join(translations)

  return simpleTextFill(region, combined, params)
```

---

## 8. Implementation Details

### Font Rendering for Plotters

```
APPROACHES:

1. HERSHEY FONTS (recommended):
   - Already vector/stroke-based
   - Multiple styles available
   - Public domain

2. TRUETYPE/OPENTYPE CONVERSION:
   - Outline fonts need stroke extraction
   - Use center-line tracing
   - Or: draw outline only

   function ttfToStrokes(font, char):
     outline = font.getOutline(char)
     // Option A: use outline as-is (thick characters)
     // Option B: compute skeleton/center-line
     skeleton = computeSkeleton(outline)
     return skeleton

3. CUSTOM VECTOR FONTS:
   - Design specifically for plotter
   - Single continuous path per letter if possible
   - Store as SVG or JSON path data
```

### Text Layout Engine

```
function layoutText(text, region, params):
  // Handle:
  // - Word wrapping
  // - Justification
  // - Hyphenation (optional)
  // - Orphan/widow control

  words = text.split(' ')
  lines = []
  current_line = []
  current_width = 0

  for word in words:
    word_width = measureWord(word, params)

    if current_width + word_width > region.width:
      // Wrap to new line
      lines.push(current_line)
      current_line = [word]
      current_width = word_width
    else:
      current_line.push(word)
      current_width += word_width + params.word_spacing

  lines.push(current_line)  // Last line

  return lines
```

### Special Characters

```
PLOTTER-FRIENDLY SYMBOLS:
  - Simple geometric shapes render well
  - Avoid complex Unicode glyphs
  - Consider custom symbols for:
    - Bullets (•, *, -)
    - Arrows (→, ←, simple lines)
    - Math symbols (basic operators)
    - Decorative elements (custom vectors)

function renderSpecialChar(char, x, y, params):
  if char in CUSTOM_SYMBOLS:
    return CUSTOM_SYMBOLS[char].render(x, y, params)
  elif char in HERSHEY_FONT:
    return renderHersheyChar(char, x, y, params)
  else:
    // Fallback: simple placeholder
    return renderPlaceholder(x, y, params)
```

---

## 9. Performance Considerations

### Path Optimization

```
TEXT FILL CHALLENGES:
  - Many small disconnected paths (each letter)
  - Similar letters may be far apart
  - Natural reading order ≠ optimal plot order

OPTIMIZATIONS:
  1. Group by proximity, not reading order
  2. Plot same letters together (cache warm)
  3. Use traveling salesman for letter order
  4. For script fonts: design connected letters

function optimizeTextPaths(letters):
  // Extract all paths
  all_paths = []
  for letter in letters:
    all_paths.extend(letter.paths)

  // Reorder for minimum travel
  return nearestNeighborOrder(all_paths)
```

### Caching

```
// Cache rendered characters
CHARACTER_CACHE = {}

function getCachedChar(char, params):
  key = `${char}_${params.font}_${params.size}`

  if key not in CHARACTER_CACHE:
    CHARACTER_CACHE[key] = renderChar(char, 0, 0, params)

  return deepCopy(CHARACTER_CACHE[key])

function renderCharAt(char, x, y, params):
  cached = getCachedChar(char, params)
  return translate(cached, x, y)
```

---

## 10. Creative Applications

### Hidden Messages

```
CONCEPT:
  - Different messages visible at different scales
  - Micro text forms macro letters

function hiddenMessage(visible_text, hidden_text, params):
  elements = []

  for i, visible_char in enumerate(visible_text):
    // Get shape of visible character
    char_region = getCharRegion(visible_char, i * params.spacing, 0, params.visible_size)

    // Fill with hidden text (much smaller)
    hidden_params = {...params, font_size: params.visible_size / 20}
    fill = simpleTextFill(char_region, hidden_text, hidden_params)
    elements.extend(fill)

  return elements
```

### Concrete Poetry

```
CONCEPT:
  - Visual arrangement is part of meaning
  - Text forms relate to content

function concretePoem(poem, shape, params):
  // Analyze poem structure
  lines = poem.split('\n')

  // Arrange based on shape and meaning
  // Example: "rain" poem with text falling down

  if shape == 'rain':
    return rainText(lines, params)
  elif shape == 'spiral':
    return spiralText(center, poem.replace('\n', ' '), params)
  // ... etc
```

### Generative Poetry Fill

```
function generativePoetryFill(region, seed_words, params):
  // Generate text to fill region using Markov chain or similar

  chain = buildMarkovChain(corpus)
  generated = ""

  while textFits(generated, region, params):
    next_word = chain.generate()
    generated += next_word + " "

  return simpleTextFill(region, generated, params)
```

---

## References

- Knuth, D. (1979) "TeX and METAFONT"
- Hershey, A. (1967) "Calligraphy for Computers" (NBS)
- Noordzij, G. (2005) "The Stroke: Theory of Writing"
- Bringhurst, R. (2004) "The Elements of Typographic Style"
- Lupton, E. (2010) "Thinking with Type"
- Various: "Concrete Poetry: A World View"
