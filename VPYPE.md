# vpype Integration Plan

## Overview

[vpype](https://github.com/abey79/vpype) is the Swiss-Army-knife CLI for pen plotter workflows. svg-grouper already uses it for cropping, and we plan to expand integration via the **rat-king** plugin.

---

## Current vpype Usage

svg-grouper shells out to vpype in `scripts/crop_svg.py`:

```python
vpype_cmd = [
    'vpype',
    'read', '--attr', 'stroke', '--attr', 'stroke-width', '-',
    'crop', f'{x}', f'{y}', f'{width}', f'{height}',
    'translate', '--', f'{-x}', f'{-y}',
    'write', '--page-size', f'{width}x{height}', '--restore-attribs', '-'
]
```

---

## Rat-King Plugin

**Repository**: https://github.com/dirtybirdnj/rat-king

Rat-King will extract svg-grouper's 15 fill patterns into a vpype plugin:

### Proposed Commands

```bash
# Line fills
vpype read input.svg ratking fill --pattern lines --spacing 2 --angle 45 write output.svg
vpype read input.svg ratking fill --pattern crosshatch --spacing 3 write output.svg
vpype read input.svg ratking fill --pattern spiral --spacing 2 --overdraw 1.5 write output.svg
vpype read input.svg ratking fill --pattern concentric --spacing 2 write output.svg

# Organic patterns
vpype read input.svg ratking fill --pattern wiggle --amplitude 2 --frequency 0.5 write output.svg
vpype read input.svg ratking fill --pattern scribble --spacing 3 write output.svg

# Mathematical patterns
vpype read input.svg ratking fill --pattern hilbert --spacing 2 write output.svg
vpype read input.svg ratking fill --pattern fermat --spacing 2 write output.svg
```

### Patterns to Port

| Pattern | Parameters | Status |
|---------|------------|--------|
| `lines` | spacing, angle, inset, crosshatch | Planned |
| `crosshatch` | spacing, angle | Planned |
| `concentric` | spacing, connect | Planned |
| `wiggle` | spacing, amplitude, frequency | Planned |
| `wave` | spacing, amplitude, frequency | Planned |
| `zigzag` | spacing, amplitude | Planned |
| `spiral` | spacing, overdraw, angle | Planned |
| `crossspiral` | spacing, overdraw | Planned |
| `fermat` | spacing, overdraw | Planned |
| `radial` | spacing, angle_step | Planned |
| `honeycomb` | spacing, angle | Planned |
| `gyroid` | spacing, scale | Planned |
| `hilbert` | spacing | Planned |
| `scribble` | spacing | Planned |
| `custom` | tile_shape, spacing | Planned |

---

## vpype Plugin Ecosystem

### Plugins to Integrate

| Plugin | Purpose | Integration Priority |
|--------|---------|---------------------|
| [occult](https://github.com/LoicGoulefert/occult) | Hidden line removal | High - clean overlapping fills |
| [deduplicate](https://github.com/LoicGoulefert/deduplicate) | Remove duplicate lines | High - post-merge cleanup |
| [vpype-dxf](https://github.com/tatarize/vpype-dxf) | DXF import | High - CAD file support |
| [vpype-vectrace](https://github.com/tatarize/vpype-vectrace) | Bitmap vectorization | Medium - photo/scan import |
| [hatched](https://github.com/abey79/hatched) | Image → density hatching | Medium - gradient fills |
| [vpype-ttf](https://github.com/johnbentcope/vpype-ttf) | Font → outlines | Medium - map labels |
| [vpype-gcode](https://github.com/plottertools/vpype-gcode) | G-code export | Medium - direct plotter output |
| [vpype-flow-imager](https://github.com/serycjon/vpype-flow-imager) | Flow field art | Low - artistic patterns |

### Installation

```bash
pip install vpype
pip install vpype-occult    # Hidden line removal
pip install vpype-dxf       # DXF import
pip install hatched         # Image hatching
pip install vpype-gcode     # G-code export
```

---

## Example Workflows

### Map Processing Pipeline

```bash
# Full map workflow
vpype \
  read map.svg \
  ratking fill --pattern lines --spacing 2 \
  occult \
  linesort \
  write map-filled.svg
```

### Image to Hatched Art

```bash
vpype \
  hatched photo.jpg --levels 64 128 192 --pitch 2 \
  linesort \
  write hatched-photo.svg
```

### CAD File Processing

```bash
vpype \
  dread schematic.dxf \
  ratking fill --pattern crosshatch --spacing 1.5 \
  linemerge \
  linesort \
  write schematic-filled.svg
```

### Multi-Layer Color Separation

```bash
vpype \
  read artwork.svg \
  forlayer \
    ratking fill --pattern concentric --spacing 2 \
  end \
  splitlayer \
  write "layer_%d.svg"
```

---

## DXF Test Files

### Sources for Historical/Technical DXF Files

#### Apollo Mission Schematics
- NASA Technical Reports Server: https://ntrs.nasa.gov/
- Search for "Apollo schematic" or "Apollo diagram"
- Many documents include vector diagrams that could be converted to DXF

#### Public Domain Technical Drawings
- Internet Archive: https://archive.org/
- Search for "technical drawing" or "blueprint"
- Old patent drawings are often in vector formats

#### OpenStreetMap Exports
- Export any region as SVG, convert to DXF
- Good for map-focused testing

#### USGS Maps
- Historical topographic maps: https://ngmdb.usgs.gov/topoview/
- Some available in vector formats

#### Library of Congress
- https://www.loc.gov/maps/
- Historical maps, many digitized

### Test File Candidates

| Source | Description | URL |
|--------|-------------|-----|
| Virtual AGC | Apollo electrical/mechanical DXF files | [ibiblio.org/apollo](https://www.ibiblio.org/apollo/ElectroMechanical.html) |
| NASA 3D | Apollo spacecraft 3D models | [nasa3d.arc.nasa.gov](https://nasa3d.arc.nasa.gov/models) |
| Archive.org | Grumman Lunar Module drawings | [archive.org/details/apertureCardBox502](https://archive.org/details/apertureCardBox502NARASW_images) |
| Smithsonian | Apollo 11 hatch CAD (public domain) | [3d.si.edu](https://3d.si.edu/object/3d/hatch-crew-apollo-11-cad-model:936d1822-b237-4431-bb3f-a1f9d39a2e90) |
| NASA Gallery | Apollo technical diagrams | [nasa.gov/gallery](https://www.nasa.gov/gallery/project-apollo-technical-diagrams/) |
| USGS Topo | Vermont quadrangle maps | ngmdb.usgs.gov |
| LOC Maps | Historical Vermont maps | loc.gov/maps |

### Virtual AGC DXF Files (Best Source)

The [Virtual AGC project](https://www.ibiblio.org/apollo/ElectroMechanical.html) provides:
- Complete engineering drawings in **DXF format**
- Electrical schematics for AGC/DSKY
- Mechanical drawings of fabricated parts
- File naming follows original Apollo drawing numbers (e.g., `1234567A.dxf`)

This is the ideal source for testing vpype-dxf integration.

---

## svg-grouper Integration Points

### Current (via subprocess)

```typescript
// electron/main.ts - crop operation
const result = subprocess.run(['vpype', 'read', '-', 'crop', ...])
```

### Planned (via rat-king)

```typescript
// Fill generation via rat-king
const result = subprocess.run([
  'vpype', 'read', '-',
  'ratking', 'fill', '--pattern', pattern, '--spacing', spacing,
  'write', '-'
])

// Hidden line removal
const result = subprocess.run([
  'vpype', 'read', '-',
  'occult',
  'write', '-'
])

// Path optimization
const result = subprocess.run([
  'vpype', 'read', '-',
  'linesort',
  'linemerge', '--tolerance', '0.5',
  'write', '-'
])
```

### Hybrid Approach

1. **Real-time preview**: Keep JS patterns for instant feedback
2. **Final export**: Use rat-king for production-quality output
3. **Advanced ops**: Use vpype plugins (occult, linesort) for features JS can't do

---

## vpype Core Commands Reference

### Geometry Operations

| Command | Description |
|---------|-------------|
| `crop X Y W H` | Crop to rectangle |
| `translate DX DY` | Move all geometry |
| `scale SX [SY]` | Scale geometry |
| `rotate ANGLE` | Rotate around origin |
| `skew AX AY` | Skew transformation |

### Line Operations

| Command | Description |
|---------|-------------|
| `linesort` | Optimize drawing order (TSP) |
| `linemerge` | Join nearby endpoints |
| `linesimplify` | Reduce point count |
| `reloop` | Rotate closed paths to optimal start |
| `multipass` | Duplicate lines for darker strokes |

### Layer Operations

| Command | Description |
|---------|-------------|
| `forlayer ... end` | Apply commands per layer |
| `splitlayer` | Separate merged geometry |
| `mergelayer` | Combine layers |
| `lmove` | Move geometry between layers |

### I/O Operations

| Command | Description |
|---------|-------------|
| `read FILE` | Load SVG/HPGL |
| `write FILE` | Save SVG |
| `show` | Display preview |
| `stat` | Print statistics |

---

## Development Roadmap

### Phase 1: Pattern Test Completion
- [x] Basic pattern grid
- [x] Stress test with complex SVG
- [ ] All patterns passing tests
- [ ] Multiple test shapes
- [ ] Export generated fills

### Phase 2: Rat-King Foundation
- [ ] Python package structure
- [ ] Port `lines` pattern
- [ ] Click CLI with stdin/stdout
- [ ] Basic vpype integration

### Phase 3: Full Pattern Port
- [ ] Port all 15 patterns
- [ ] Pattern-specific options
- [ ] Parity tests vs JS

### Phase 4: Plugin Integration
- [ ] Add occult for hidden lines
- [ ] Add vpype-dxf for CAD import
- [ ] Pipeline configuration in Export tab

---

## Resources

- [vpype Documentation](https://vpype.readthedocs.io/)
- [vpype GitHub](https://github.com/abey79/vpype)
- [vpype Plugins List](https://vpype.readthedocs.io/en/latest/plugins.html)
- [Creating vpype Plugins](https://vpype.readthedocs.io/en/latest/creating_plugins.html)
- [Shapely (geometry library)](https://shapely.readthedocs.io/)
