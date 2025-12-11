# Next Session: Fill Tab & Export Improvements

## Completed This Session

- **Merge Tab Fill Readiness UI** - Added fill readiness indicators to help users identify shapes that need merging before fill:
  - `FillReadinessBadge` component showing green/orange/red status for each shape
  - Summary banner at top showing overall readiness with counts
  - Shapes with shared edges marked as "issue" (need merging)
  - Compound paths with many subpaths marked as "warning"
  - Isolated shapes shown as "ready" (green checkmark)

- **Pattern Preview Swatch Fix** - Updated `pattern-banner` handler to use rat-king's new `banner` command:
  - Single cell (`-n 1`) for clean preview
  - Narrow rectangle (2" x 0.5") for consistent display
  - Quiet mode (`-q`) to suppress info messages
  - Uses `-p pattern` for single-pattern mode

---

## Previous Session Completed

- **Banner ENOENT fix** - Switched `pattern-banner` handler to stdout mode (`-o -`)
- **Transform baking** - Rewrote `normalize_svg.py` to fully bake all transforms into coordinates
- **Merge before fill** - Added checkbox option to union all shapes before filling (for text/logos)
- **Smart warning banner** - Shows warning when >3 shapes detected, with "Go to Merge Tab" and "Enable Merge" buttons

---

## Remaining Issues / Future Work

### 1. Gap Detection Between Shapes (Enhancement)

**Description:** Currently the merge tab detects shared edges, but doesn't detect shapes that are very close but not quite touching (small gaps that cause fill artifacts).

**Implementation Ideas:**
- Compute distance between nearest points of non-adjacent shapes
- Flag shapes within threshold distance (e.g., < 0.5px) as potential issues
- Suggest merging or checking alignment

### 2. Pattern Preview in Layer List (Enhancement)

**Current State:** Banner previews are fetched asynchronously and cached. Could improve by:
- Pre-generating common pattern banners at app startup
- Adding loading spinner while fetching
- Better error handling when rat-king binary not found

### 3. Export Tab UX Improvements

**Ideas:**
- Show estimated export time based on line count
- Progress indicator during export
- Preview of output dimensions

---

## SVG Transforms Reference

### Matrix Format
```
| a  c  e |
| b  d  f |
| 0  0  1 |
```

### Point Transformation
```
x' = a*x + c*y + e
y' = b*x + d*y + f
```

### Transform Functions → Matrices
| Transform | Matrix |
|-----------|--------|
| `translate(tx, ty)` | `[1, 0, 0, 1, tx, ty]` |
| `scale(sx, sy)` | `[sx, 0, 0, sy, 0, 0]` |
| `rotate(θ)` | `[cos(θ), sin(θ), -sin(θ), cos(θ), 0, 0]` |
| `skewX(θ)` | `[1, 0, tan(θ), 1, 0, 0]` |
| `skewY(θ)` | `[1, tan(θ), 0, 1, 0, 0]` |

### Key Behaviors
- Transforms compose via matrix multiplication
- Order matters: `translate rotate ≠ rotate translate`
- Nested group transforms multiply: `CTM = child × parent × grandparent`
- Stroke-width scales with transform (unless `vector-effect: non-scaling-stroke`)
- `viewBox` with non-zero origin creates implicit translate
