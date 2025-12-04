# Next Session: Fill Pattern Migration to rat-king

## Session Goal

Complete the fill pattern infrastructure in rat-king and bring over a standalone test harness so pattern development can happen independently of svg-grouper.

---

## Current State

### svg-grouper (TypeScript/Electron)
- 15 fill patterns in `src/utils/fillPatterns.ts` (2171 lines)
- Pattern Test harness at `src/components/PatternTest.tsx`
- Torture test: Essex VT map (506 polygons, 159,510 vertices)

**Fixes applied this session:**
1. **Polygon loading** - Now uses `getPolygonsFromSubpaths()` to properly detect holes
2. **Concentric pattern** - Now accepts `PolygonWithHoles` and clips around holes
3. **Lines pattern** - Fixed `generateGlobalHatchLines()` to center on bbox instead of origin (0,0)

### rat-king (Python CLI)
- Location: `/Users/mgilbert/Code/rat-king`
- Basic CLI with `fill` command
- Only `concentric` pattern ported
- Performance: 19 seconds for Essex SVG (314 shapes, 4.7M lines)

---

## Phase 1: Verify TypeScript Fixes

Before porting more patterns, confirm the fixes work:

```bash
cd /Users/mgilbert/Code/svg-grouper
npm run dev
# Navigate to Pattern Test tab → Stress Test
# Test these patterns specifically:
```

| Pattern | What to Check |
|---------|---------------|
| **Lines** | Should now fill ALL polygons (was only 4,841 lines vs honeycomb's 135,579) |
| **Honeycomb** | Should NOT double-fill holes anymore |
| **Concentric** | Should skip over hole regions |

---

## Phase 2: Port Core Geometry to rat-king

### Priority: Get `clipLinesToPolygon` working

This is the foundation for Lines, Crosshatch, and other clipping-based patterns.

**Files to port from svg-grouper:**
```
src/utils/geometry.ts:
  - generateGlobalHatchLines()     (line 712)
  - clipLinesToPolygon()           (line 811)
  - clipSegmentAroundHoles()       (line 750)
  - linePolygonIntersections()     (line 686)
  - pointInPolygon()               (line 646)
```

**Target location in rat-king:**
```
rat_king/
├── geometry/
│   ├── __init__.py
│   ├── polygon.py      # existing - Point, PolygonWithHoles
│   ├── clipping.py     # NEW - clipLinesToPolygon, clipSegmentAroundHoles
│   └── hatch.py        # NEW - generateGlobalHatchLines
```

---

## Phase 3: Port Pattern Generators

### Porting Order (by utility and complexity)

| # | Pattern | Complexity | Notes |
|---|---------|------------|-------|
| 1 | **lines** | Low | Uses hatch + clip infrastructure |
| 2 | **crosshatch** | Low | Lines at two angles |
| 3 | **honeycomb** | Medium | Hexagonal grid, good hole test |
| 4 | **zigzag** | Medium | Parallel zigzag lines |
| 5 | **wiggle** | Medium | Sinusoidal lines |
| 6 | **radial** | Medium | Lines from center |
| 7 | **spiral** | High | Archimedean spiral |
| 8 | **fermat** | High | Golden angle spiral |
| 9 | **hilbert** | High | Space-filling curve |
| 10 | **gyroid** | High | TPMS pattern |
| 11 | **wave** | Medium | Wave interference |
| 12 | **scribble** | Medium | Random walk |
| 13 | **crossspiral** | High | Crossed spirals |

### Pattern File Template

```python
# rat_king/patterns/lines.py
"""Lines fill pattern - parallel hatch lines."""

from ..geometry import Point, PolygonWithHoles, HatchLine
from ..geometry.hatch import generate_global_hatch_lines
from ..geometry.clipping import clip_lines_to_polygon

def generate_lines_fill(
    polygon: PolygonWithHoles,
    spacing: float,
    angle: float = 0,
    inset: float = 0
) -> list[HatchLine]:
    """Generate parallel line fill for a polygon."""
    bbox = get_bounding_box(polygon.outer)
    global_lines = generate_global_hatch_lines(bbox, spacing, angle)
    return clip_lines_to_polygon(global_lines, polygon, inset)
```

---

## Phase 4: Standalone Test Harness for rat-king

### Goal
A self-contained test interface in rat-king for pattern development, independent of svg-grouper.

### Option A: Web Interface (Recommended)

```
rat_king/
├── harness/
│   ├── __init__.py
│   ├── server.py       # Flask/FastAPI app
│   ├── templates/
│   │   └── index.html  # Single page with SVG preview
│   └── static/
│       └── app.js      # Interactive controls
```

**Features:**
- Load SVG file or paste path data
- Select pattern from dropdown
- Adjust parameters with sliders
- Live preview of fill result
- Performance timing display
- Export filled SVG

**Run with:**
```bash
rat-king harness
# Opens http://localhost:5000
```

### Option B: CLI Benchmark Tool

```bash
# Run all patterns against test file
rat-king benchmark test_assets/essex.svg --all

# Output:
# Pattern      Time      Lines    Status
# lines        0.12s     48,000   Excellent
# concentric   0.45s     2.5M     Acceptable
# honeycomb    1.20s     135,000  Slow
# ...
```

### Option C: Jupyter Notebook

```
rat_king/
└── notebooks/
    └── pattern_test.ipynb
```

Good for exploration but less convenient for iterative testing.

### Recommendation

**Start with Option B (CLI benchmark)** - quickest to implement, most useful for CI.
**Add Option A (web harness)** once patterns are stable.

---

## Phase 5: Test Assets

Copy torture test SVG to rat-king:

```bash
cp /Users/mgilbert/Code/svg-grouper/public/essex.svg \
   /Users/mgilbert/Code/rat-king/test_assets/
```

Create additional test cases:
```
test_assets/
├── essex.svg           # Complex torture test (506 polygons)
├── simple_square.svg   # Basic shape
├── donut.svg           # Shape with hole
├── nested_holes.svg    # Multiple nesting levels
└── thin_slivers.svg    # Edge case shapes
```

---

## Phase 6: svg-grouper Integration

Once rat-king patterns are stable:

```typescript
// electron/fillGenerator.ts
import { spawn } from 'child_process'

async function generateFillWithRatKing(
  svgPath: string,
  pattern: string,
  options: FillOptions
): Promise<HatchLine[]> {
  return new Promise((resolve, reject) => {
    const args = [
      'fill', svgPath,
      '--pattern', pattern,
      '--spacing', options.spacing.toString(),
      '--output', '-'  // stdout
    ]

    const proc = spawn('rat-king', args)
    let output = ''

    proc.stdout.on('data', (data) => output += data)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(parseSvgToLines(output))
      } else {
        reject(new Error(`rat-king exited with code ${code}`))
      }
    })
  })
}
```

---

## Quick Reference

### Key Files in svg-grouper
```
src/utils/fillPatterns.ts    # All 15 patterns
src/utils/geometry.ts        # Clipping, hatch generation
src/components/PatternTest.tsx  # Test harness UI
public/essex.svg             # Torture test asset
```

### Key Files in rat-king
```
rat_king/cli.py              # CLI entry point
rat_king/patterns/           # Pattern implementations
rat_king/geometry/           # Geometry utilities
rat_king/svg_io.py           # SVG parsing/output
tests/                       # pytest tests
```

### Commands
```bash
# svg-grouper
cd /Users/mgilbert/Code/svg-grouper
npm run dev                  # Start dev server
npm run build               # Build for production

# rat-king
cd /Users/mgilbert/Code/rat-king
source .venv/bin/activate
pip install -e .            # Install in dev mode
rat-king fill input.svg -o output.svg
pytest                      # Run tests
```

---

## Outstanding Issues

### Fixed This Session
- [x] Lines pattern missing polygons (bbox centering)
- [x] Honeycomb double-filling holes (polygon loading)
- [x] Concentric ignoring holes (PolygonWithHoles support)

### Still TODO
- [ ] Add "single pattern mode" option for Spiral/Fermat/Hilbert
- [ ] Optimize slow patterns (target: all under 500ms)
- [ ] Port remaining 14 patterns to rat-king
- [ ] Build test harness for rat-king

---

## Torture Test Baseline (Dec 3, 2025)

| Pattern | Time | Lines | Status |
|---------|------|-------|--------|
| Lines | 604ms | 4,841 | Slow (should improve with fix) |
| Concentric | 449ms | 2,503,754 | Acceptable |
| Wiggle | 1,335ms | 20,095 | Slow |
| Spiral | 9,288ms | 452,748 | Failed |
| Honeycomb | 3,176ms | 135,579 | Failed |
| Gyroid | 8,821ms | 596,998 | Failed |
| Crosshatch | 1,279ms | 9,668 | Slow |
| Zigzag | 10,347ms | 241,977 | Failed |
| Radial | 568ms | 40,225 | Slow |
| Crossspiral | 18,540ms | 904,117 | Failed |
| Hilbert | 4,264ms | 92,879 | Failed |
| Fermat | 26,550ms | 1,065,293 | Failed |
| Wave | 6,408ms | 147,675 | Failed |
| Scribble | 2,567ms | 150,451 | Failed |

**Re-run after fixes to get new baseline.**
