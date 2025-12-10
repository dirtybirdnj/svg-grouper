# ⚠️ OBSOLETE - Original Python Plan

> **This document is obsolete.** rat-king was implemented in Rust, not Python.
> See these docs for current status:
> - `NEXT_SESSION.md` - Current integration status
> - `RAT-KING-REFACTOR.md` - Remaining features to implement
> - `RAT-KING-OPTIMIZATIONS.md` - Performance optimizations

---

# Rat-King: vpype Plugin for Pen Plotter Workflows (ARCHIVED)

## Overview

**Rat-King** ~~will be~~ **was** a vpype plugin plan that has been superseded by a Rust implementation. The original goal was to extract fill generation algorithms into Python, but we instead built rat-king in Rust for ~200x better performance.

**Current rat-king**: https://github.com/dirtybirdnj/rat-king (Rust CLI)

~~**Rat-King** will be a vpype plugin that extracts the line fill generation algorithms from svg-grouper into a reusable CLI tool. This enables:~~

1. **CLI usage**: Direct command-line access to fill patterns
2. **vpype integration**: Chain with other vpype commands (crop, optimize, etc.)
3. **svg-grouper backend**: Replace internal JS fill generation with subprocess calls

Repository: https://github.com/dirtybirdnj/rat-king (currently empty)

---

## Current State

### svg-grouper Already Uses vpype

The app already shells out to vpype for cropping:

```python
# scripts/crop_svg.py
vpype_cmd = [
    'vpype',
    'read', '--attr', 'stroke', '--attr', 'stroke-width', '-',
    'crop', f'{x}', f'{y}', f'{width}', f'{height}',
    'translate', '--', f'{-x}', f'{-y}',
    'write', '--page-size', f'{width}x{height}', '--restore-attribs', '-'
]
```

### Fill Patterns to Extract

From `src/utils/fillPatterns.ts` (15 patterns):

| Pattern | Description | Key Parameters |
|---------|-------------|----------------|
| `lines` | Parallel line hatching | spacing, angle, inset |
| `crosshatch` | Perpendicular line sets | spacing, angle |
| `concentric` | Nested polygon outlines | spacing, connect |
| `wiggle` | Wavy lines | amplitude, frequency |
| `wave` | Sine wave lines | amplitude, frequency |
| `zigzag` | Alternating diagonals | amplitude |
| `spiral` | Archimedes spiral | spacing, overdraw |
| `crossspiral` | Nested spirals | spacing, overdraw |
| `fermat` | Fermat spiral | spacing, overdraw |
| `radial` | Lines from center | spacing, angle step |
| `honeycomb` | Hexagonal grid | spacing |
| `gyroid` | 3D mathematical surface | scale, frequency |
| `hilbert` | Space-filling curve | spacing |
| `scribble` | Random scribble | spacing |
| `custom` | Tile-based patterns | tile shape, spacing |

---

## Proposed Rat-King Commands

### Core Fill Commands

```bash
# Basic line fill
vpype read input.svg ratking fill --pattern lines --spacing 2 --angle 45 write output.svg

# Crosshatch
vpype read input.svg ratking fill --pattern crosshatch --spacing 3 --angle 30 write output.svg

# Spiral fill
vpype read input.svg ratking fill --pattern spiral --spacing 2 --overdraw 1.5 write output.svg

# Concentric (outline-in)
vpype read input.svg ratking fill --pattern concentric --spacing 2 write output.svg

# Wiggle/wave patterns
vpype read input.svg ratking fill --pattern wiggle --spacing 3 --amplitude 2 --frequency 0.5 write output.svg
```

### Standalone CLI Mode

```bash
# Direct CLI usage (without vpype)
rat-king fill input.svg --pattern lines --spacing 2 -o output.svg

# Pipe mode
cat input.svg | rat-king fill --pattern spiral | vpype linesort write output.svg
```

---

## vpype Plugin Ecosystem Integration

### Plugins That Complement Rat-King

| Plugin | What It Does | How It Helps |
|--------|--------------|--------------|
| [**occult**](https://github.com/LoicGoulefert/occult) | Hidden line removal | Remove lines behind filled shapes |
| [**deduplicate**](https://github.com/LoicGoulefert/deduplicate) | Remove overlapping lines | Clean up after merging |
| [**vpype-vectrace**](https://github.com/tatarize/vpype-vectrace) | Bitmap to vector | Convert images to paths for filling |
| [**hatched**](https://github.com/abey79/hatched) | Image hatching | Density-based fills from images |
| [**vpype-dxf**](https://github.com/tatarize/vpype-dxf) | DXF import | Read CAD files |
| [**vpype-ttf**](https://github.com/johnbentcope/vpype-ttf) | Text to outlines | Convert fonts for filling |
| [**vpype-flow-imager**](https://github.com/serycjon/vpype-flow-imager) | Flow field art | Artistic line patterns |
| [**vpype-gcode**](https://github.com/plottertools/vpype-gcode) | G-code export | Direct plotter output |

### Example Workflows

```bash
# Full workflow: trace image → fill → optimize → export
vpype \
  vectrace photo.jpg \
  ratking fill --pattern lines --spacing 2 \
  occult \
  linesort \
  gwrite output.gcode

# Map workflow: fill regions with different patterns per layer
vpype read map.svg \
  forlayer \
    ratking fill --pattern concentric --spacing 3 \
  end \
  deduplicate \
  linesort \
  write map-filled.svg

# Text artwork: convert text, fill, remove hidden lines
vpype \
  text "HELLO" --font-size 72 \
  ratking fill --pattern crosshatch \
  occult \
  write hello.svg
```

---

## Features svg-grouper Could Gain from vpype Integration

### Already Available in vpype Core

| Feature | vpype Command | Current svg-grouper Status |
|---------|---------------|---------------------------|
| Crop to bounds | `crop x y w h` | ✅ Using via Python script |
| Line optimization | `linesort`, `linemerge` | ✅ Custom TSP in OrderTab |
| Remove duplicates | `linesimplify` | ❌ Not implemented |
| Scale to page | `scaleto`, `layout` | ✅ ExportTab does this |
| Multi-page split | `pens` | ❌ Not implemented |

### From Plugins We Could Use

| Feature | Plugin | Benefit |
|---------|--------|---------|
| Hidden line removal | `occult` | Clean up overlapping fills |
| Bitmap vectorization | `vpype-vectrace` | Import photos/scans |
| G-code export | `vpype-gcode` | Direct AxiDraw output |
| DXF import | `vpype-dxf` | CAD file support |
| Font outlines | `vpype-ttf` | Text-to-path conversion |
| Flow field fills | `vpype-flow-imager` | Artistic pattern alternative |

---

## Architecture Options

### Option A: Pure vpype Plugin

```
rat-king/
├── pyproject.toml
├── rat_king/
│   ├── __init__.py
│   ├── cli.py           # Click commands for vpype
│   ├── patterns/
│   │   ├── lines.py
│   │   ├── spiral.py
│   │   ├── concentric.py
│   │   └── ...
│   └── geometry/
│       ├── polygon.py
│       └── clipping.py
```

**Integration with svg-grouper:**
```python
# scripts/fill_pattern.py
result = subprocess.run([
    'vpype', 'read', '-',
    'ratking', 'fill', '--pattern', pattern, '--spacing', str(spacing),
    'write', '-'
], input=svg_input, capture_output=True, text=True)
```

### Option B: Standalone CLI + vpype Adapter

```
rat-king/
├── pyproject.toml
├── rat_king/
│   ├── cli.py           # Standalone CLI (click)
│   ├── vpype_plugin.py  # vpype integration layer
│   ├── core/            # Core algorithms
│   │   ├── patterns.py
│   │   └── geometry.py
```

**Usage:**
```bash
# Standalone
rat-king fill input.svg --pattern spiral -o output.svg

# As vpype plugin
vpype read input.svg ratking fill --pattern spiral write output.svg
```

---

## Pattern Test Bed Requirements

To make the Pattern Test fully functional for development:

### Current State
- [x] 14 patterns tested on simple square
- [x] Stress test with complex SVG (Essex map)
- [x] Zoom/pan viewport
- [x] Context-sensitive settings
- [x] Performance timing

### Missing for Full Functionality
- [ ] **Multiple test shapes**: circle, star, donut (polygon with hole), concave shape
- [ ] **Load custom SVG**: User can drop any SVG for testing
- [ ] **Side-by-side comparison**: Same shape, different patterns
- [ ] **Export fills**: Download generated fills as SVG
- [ ] **Benchmark mode**: Run all patterns × all shapes, export timing report
- [ ] **Custom tile pattern**: Currently missing from test grid
- [ ] **Preset save/load**: Store pattern settings as JSON

### For Rat-King Development
- [ ] **Python parity tests**: Compare JS output to Python implementation
- [ ] **Regression suite**: Golden file tests for each pattern
- [ ] **CLI preview**: Integrate with vpype show for visual verification

---

## Implementation Roadmap

### Phase 1: Pattern Test Bed Completion
1. Add multiple test shapes (circle, star, donut)
2. Add custom SVG loading
3. Add export button for generated fills
4. Add `custom` tile pattern to test grid

### Phase 2: Rat-King CLI Foundation
1. Set up Python package structure
2. Port `lines` pattern as proof of concept
3. Create Click CLI with stdin/stdout support
4. Test integration with svg-grouper via subprocess

### Phase 3: vpype Integration
1. Add vpype plugin entry point
2. Register commands (`ratking fill`, etc.)
3. Support vpype layer model
4. Test with vpype pipeline commands

### Phase 4: Full Pattern Port
1. Port remaining 14 patterns to Python
2. Add pattern-specific CLI options
3. Create parity tests against JS implementation

### Phase 5: svg-grouper Backend Switch
1. Replace JS fill generation with rat-king subprocess calls
2. Keep JS for real-time preview, use rat-king for final export
3. Add vpype pipeline configuration in Export tab

---

## Technical Notes

### Geometry Library Choice

| Library | Pros | Cons |
|---------|------|------|
| **Shapely** | Standard, well-maintained, used by vpype | No bezier curves |
| **svgelements** | Full SVG path support | Less common |
| **Clipper2** | Fast boolean ops | C++ dependency |

**Recommendation**: Use Shapely for polygon operations (matching vpype's internals), flatten beziers to polylines first.

### vpype Data Model

vpype uses `LineCollection` objects:
- Each layer is a `LineCollection`
- Lines are numpy arrays of complex numbers (x + yj)
- Colors stored as layer properties

```python
from vpype import LineCollection, Document

def fill_command(document: Document, pattern: str, spacing: float) -> Document:
    for layer_id, layer in document.layers.items():
        # Convert layer to polygons
        # Generate fill lines
        # Add to new layer or replace
    return document
```

---

## Sources

- [vpype documentation](https://vpype.readthedocs.io/en/latest/plugins.html)
- [vpype GitHub](https://github.com/abey79/vpype)
- [hatched plugin](https://github.com/abey79/hatched)
- [occult plugin](https://github.com/LoicGoulefert/occult)
- [vpype-explorations](https://github.com/abey79/vpype-explorations)
- [vpype-gcode](https://github.com/plottertools/vpype-gcode)
- [vpype-vectrace](https://github.com/tatarize/vpype-vectrace)
- [vpype-flow-imager](https://github.com/serycjon/vpype-flow-imager)
