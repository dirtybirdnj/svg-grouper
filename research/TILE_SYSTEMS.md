# Tile Systems for Generative Fill Patterns

Deep-dive into tile-based pattern generation for pen plotter output.

---

## Overview

Tile systems create complex emergent patterns from simple, repeated units. The magic is in the **edge-matching rules** and **placement algorithms** that determine how tiles connect.

Key advantage for plotters: tiles can be pre-optimized as efficient single-stroke paths, then assembled.

---

## 1. Truchet Tiles

### History
Sébastien Truchet (1704) studied quarter-circle tiles for textile patterns. Simple rules, infinite variety.

### Classic Truchet (2-tile system)

```
TILES:
  Tile A: arc from top-edge to left-edge, arc from bottom-edge to right-edge
  Tile B: arc from top-edge to right-edge, arc from bottom-edge to left-edge

  (B is A rotated 90°)

VISUAL:
  ┌──╮    ╭──┐
  │  │    │  │
  │  │    │  │
  ╰──┘    └──╯
  Tile A   Tile B

PLACEMENT:
  - Random: 50/50 chance each cell
  - Noise-based: Perlin noise threshold determines tile
  - Image-based: brightness threshold determines tile
```

### Multi-Scale Truchet

```
CONCEPT:
  Each tile contains smaller tiles recursively

ALGORITHM:
  function drawTruchetRecursive(x, y, size, depth):
    if depth == 0:
      drawBaseTile(x, y, size, randomChoice())
    else:
      for quadrant in [TL, TR, BL, BR]:
        qx, qy = quadrantPosition(x, y, size, quadrant)
        drawTruchetRecursive(qx, qy, size/2, depth-1)

EFFECT:
  - Large-scale curves from big tiles
  - Fine detail from small tiles
  - Fractal-like appearance
```

### Extended Truchet Variants

```
10-TILE TRUCHET (Smith, 2020s):
  - Additional tiles: straight through, T-junctions, crossings
  - More connectivity options
  - Can create closed loops guaranteed

TRIANGLE TRUCHET:
  - Triangular grid instead of square
  - 3-way connections possible
  - Creates hexagonal emergent patterns

CURVED TRUCHET:
  - Replace quarter-circles with bezier curves
  - Varying curvature per tile
  - Smoother, more organic feel

3D TRUCHET (for visual effect):
  - Tiles suggest 3D pipe/ribbon
  - Over/under crossings like Celtic knots
  - Requires careful edge matching
```

### Truchet Path Optimization

```
PROBLEM:
  Random Truchet = many disconnected arcs = many pen lifts

SOLUTION - Connected Path Finding:
  1. Build graph: nodes at tile edges, edges through tiles
  2. Find Eulerian path (visits each edge once)
  3. If no Eulerian path exists, find minimum set of paths

ALGORITHM:
  function optimizeTruchetPaths(tiles):
    graph = buildConnectionGraph(tiles)

    // Count odd-degree nodes
    odd_nodes = nodes where degree % 2 == 1

    if len(odd_nodes) == 0:
      // Eulerian circuit exists
      return findEulerianCircuit(graph)
    elif len(odd_nodes) == 2:
      // Eulerian path exists
      return findEulerianPath(graph, odd_nodes[0], odd_nodes[1])
    else:
      // Need multiple paths - pair up odd nodes optimally
      pairings = minimumWeightMatching(odd_nodes)
      add virtual edges for pairings (pen-up moves)
      return findEulerianCircuit(augmented_graph)
```

---

## 2. Wang Tiles

### Concept

Each tile edge has a "color" or "code". Tiles placed so adjacent edges match. Originally studied for decidability in computation (Hao Wang, 1961).

### Basic Wang Tile Set

```
TILE DEFINITION:
  struct WangTile {
    north_edge: Color
    east_edge: Color
    south_edge: Color
    west_edge: Color
    pattern: SVGPath  // visual content
  }

PLACEMENT RULE:
  tile[x,y].east_edge == tile[x+1,y].west_edge
  tile[x,y].south_edge == tile[x,y+1].north_edge

EXAMPLE (4-color edges, some valid tiles):
  NESW: RRBB, RBRB, BRRB, BBRR, RRBR, BRBR...
```

### Aperiodic Wang Tiles

```
PROPERTY:
  Some tile sets CANNOT tile periodically
  They fill the plane, but pattern never exactly repeats
  (Proven: 11-tile aperiodic set exists)

APPLICATION:
  - Texture that never has obvious repeat
  - Natural-looking variation
  - Game terrain generation
```

### Wang Tile Pattern Synthesis

```
CREATING TILEABLE PATTERNS:

1. Sample source texture/pattern
2. Extract edge "colors" as actual pixel strips
3. Build tiles that connect these edges
4. Solve which tiles can be placed where

CORNER MATCHING:
  - Also match diagonal corners for seamless appearance
  - 8-way matching instead of 4-way
  - More complex but better results
```

### Wang Tile Fill Algorithm

```
function fillWithWangTiles(region, tile_set):
  grid = create2DArray(region.width / tile_size, region.height / tile_size)

  // Scanline fill with constraint propagation
  for y in 0..grid.height:
    for x in 0..grid.width:
      constraints = {}

      if x > 0:
        constraints.west = grid[x-1, y].east_edge
      if y > 0:
        constraints.north = grid[x, y-1].south_edge

      valid_tiles = tile_set.filter(t => matchesConstraints(t, constraints))
      grid[x, y] = randomChoice(valid_tiles)

  return grid
```

---

## 3. Penrose Tilings

### The Two Rhombs

```
THIN RHOMB:
  - Angles: 36° and 144°
  - Golden ratio in diagonal lengths

FAT RHOMB:
  - Angles: 72° and 108°
  - Also golden ratio proportions

MATCHING RULES:
  - Edges have arrows/markings
  - Adjacent edges must have matching marks
  - Prevents periodic arrangement
```

### Penrose Generation Methods

```
METHOD 1: SUBSTITUTION
  Each tile replaced by smaller tiles in fixed pattern

  function penroseSubstitute(tiles, generations):
    for gen in 0..generations:
      new_tiles = []
      for tile in tiles:
        if tile.type == FAT:
          // Fat rhomb splits into 2 fat + 1 thin
          new_tiles.extend(splitFatRhomb(tile))
        else:
          // Thin rhomb splits into 1 fat + 1 thin
          new_tiles.extend(splitThinRhomb(tile))
      tiles = new_tiles
    return tiles

METHOD 2: DE BRUIJN PENTAGRIDS
  - 5 families of parallel lines
  - Angles: 0°, 72°, 144°, 216°, 288°
  - Rhombs at line intersections
  - Mathematically elegant, harder to implement

METHOD 3: PROJECTION FROM 5D
  - Penrose tiling = slice of 5D cubic lattice
  - Most mathematically pure
  - Complex to implement
```

### Penrose Arc Decoration

```
CONCEPT:
  Draw circular arcs on each rhomb
  Arcs connect across tile edges
  Creates continuous curved paths through tiling

ARC RULES:
  - Fat rhomb: two arcs of different radii
  - Thin rhomb: two arcs
  - Arcs positioned to connect at matching edges

RESULT:
  - 5 families of nested curves
  - Aperiodic, but locally organized
  - Single continuous paths possible
```

### Other Penrose Sets

```
DARTS AND KITES:
  - Alternative to rhombs
  - Same matching rules concept
  - Different visual character

PENROSE CHICKENS (joke set):
  - Actual bird shapes
  - Proves any shape can be made aperiodic with right rules
```

---

## 4. Substitution Tilings

### General Concept

Start with shape(s), replace with scaled-down arrangement of same shapes. Repeat.

### Classic Substitution Tilings

```
CHAIR TILING:
  - L-shaped tile
  - Replaces with 4 smaller L-shapes
  - Creates space-filling with 4-fold symmetry

SPHINX TILING:
  - Sphinx shape (hexagon with notches)
  - Replaces with 4 smaller sphinxes
  - Self-similar fractal boundary

PINWHEEL TILING:
  - Right triangle (1:2:√5)
  - Replaces with 5 smaller triangles
  - Tiles appear at infinitely many angles
  - Not just 0°, 90°, etc.
```

### Substitution Algorithm

```
function generateSubstitutionTiling(initial_tile, rules, depth):
  tiles = [initial_tile]

  for d in 0..depth:
    next_tiles = []
    for tile in tiles:
      // Get replacement tiles from rules
      replacements = rules[tile.type].apply(tile)
      // Scale down and position
      for r in replacements:
        r.scale(rules.scale_factor)
        r.transform(tile.transform)
        next_tiles.push(r)
    tiles = next_tiles

  return tiles
```

---

## 5. Truchet-Penrose Hybrids

### Concept

Apply Truchet-style arc decoration to Penrose (or other) tilings.

```
ALGORITHM:
  1. Generate Penrose tiling
  2. For each rhomb type, define arc positions
  3. Draw arcs that connect at matching edges
  4. Trace connected paths

RESULT:
  - Aperiodic structure of Penrose
  - Flowing curves of Truchet
  - Never-repeating organic curves
```

---

## 6. Programmable/Parameterized Tiles

### Concept

Tiles aren't fixed SVGs - they're generated based on parameters.

```
TILE PARAMETERS:
  - Edge connection points (normalized 0-1 along edge)
  - Internal curve control points
  - Stroke width variation
  - Fill pattern within tile

MATCHING RULE:
  - Tiles match if edge connection points align
  - More flexible than discrete edge colors

EXAMPLE:
  tile_a.east_connections = [0.2, 0.6, 0.9]
  tile_b.west_connections = [0.2, 0.6, 0.9]
  // These tiles can connect

  tile_c.west_connections = [0.3, 0.7]
  // This tile CANNOT connect to tile_a's east edge
```

### Interpolating Tiles

```
CONCEPT:
  - Tiles smoothly vary across the grid
  - Connection points shift gradually
  - Creates warped/flowing tile pattern

IMPLEMENTATION:
  function generateInterpolatedTile(x, y, grid_size):
    // Parameters vary based on position
    curve_intensity = sin(x / grid_size * PI)
    connection_offset = y / grid_size * 0.2

    return generateTile({
      curve_intensity,
      connection_offset,
      ...
    })
```

---

## 7. Escher-Style Tile Modification

### Edge Modification Rules

```
TRANSLATION TILES (square grid):
  - Modify top edge with curve
  - Copy SAME curve to bottom edge
  - Modify left edge with curve
  - Copy SAME curve to right edge
  - Tiles tessellate by translation

ROTATION TILES (square grid):
  - Modify top-half of left edge
  - Rotate 90° and apply to top-half of top edge
  - Similar for other edges
  - 4-fold rotational symmetry

GLIDE REFLECTION TILES:
  - Modify edge, apply flipped version to opposite
  - Creates interlocking "swimming" shapes
```

### Implementation

```
function createEscherTile(base_shape, edge_curves):
  tile = base_shape.copy()

  for edge in tile.edges:
    modification = edge_curves[edge.type]

    // Get corresponding edge based on symmetry rules
    partner_edge = getPartnerEdge(edge, symmetry_type)
    partner_modification = transformCurve(modification, symmetry_type)

    // Apply modifications
    edge.applyCurve(modification)
    partner_edge.applyCurve(partner_modification)

  return tile
```

---

## Implementation Considerations

### Tile Library Format

```json
{
  "name": "Classic Truchet",
  "grid_type": "square",
  "tile_size": 100,
  "tiles": [
    {
      "id": "A",
      "edges": {"N": "a", "E": "b", "S": "a", "W": "b"},
      "path": "M 0,50 Q 0,0 50,0 M 50,100 Q 100,100 100,50"
    },
    {
      "id": "B",
      "edges": {"N": "b", "E": "a", "S": "b", "W": "a"},
      "path": "M 50,0 Q 100,0 100,50 M 0,50 Q 0,100 50,100"
    }
  ],
  "placement": "random",
  "seed": null
}
```

### Path Optimization for Tiles

```
STRATEGY:
  1. Generate all tile paths
  2. Build connection graph between tiles
  3. Find minimum spanning tree of pen-up moves
  4. Order path drawing to minimize total pen-up distance

METRICS:
  - Total path length (pen down)
  - Total travel distance (pen up)
  - Number of pen lifts
  - Maximum single pen-up distance
```

### Clipping Tiles to Region

```
function fillRegionWithTiles(region, tile_system):
  // Get bounding box, slightly expanded
  bbox = region.bounds.expand(tile_system.tile_size)

  // Generate full grid of tiles
  tiles = generateTileGrid(bbox, tile_system)

  // Clip each tile's paths to region
  clipped_paths = []
  for tile in tiles:
    for path in tile.paths:
      clipped = clipPathToRegion(path, region)
      if clipped.length > 0:
        clipped_paths.extend(clipped)

  // Optimize path order
  return optimizePathOrder(clipped_paths)
```

---

## References

- Truchet, S. (1704) "Memoir sur les combinaisons"
- Wang, H. (1961) "Proving theorems by pattern recognition II"
- Grünbaum, B. & Shephard, G.C. (1987) "Tilings and Patterns"
- Penrose, R. (1974) "The role of aesthetics in pure and applied mathematical research"
- Smith et al. (2023) "An aperiodic monotile" (the "hat" tile)
- Kaplan, C. (2009) "Introductory Tiling Theory for Computer Graphics"
