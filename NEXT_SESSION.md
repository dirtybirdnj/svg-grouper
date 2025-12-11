# Next Session: UI Consistency & Fill Improvements

## Completed This Session

- **Banner ENOENT fix** - Switched `pattern-banner` handler to stdout mode (`-o -`)
- **Transform baking** - Rewrote `normalize_svg.py` to fully bake all transforms into coordinates
- **Merge before fill** - Added checkbox option to union all shapes before filling (for text/logos)
- **Smart warning banner** - Shows warning when >3 shapes detected, with "Go to Merge Tab" and "Enable Merge" buttons

---

## Remaining Issues

### 1. Unify Merge Tab Layer List (High Priority)

**Symptom:** The Merge tab layer list looks different from the Sort tab. Need to adopt the Sort tab's `LayerTree` style.

**Current State:**
- Sort tab uses `LayerTree` component (full-featured with icons, drag-drop, color swatches)
- Merge tab uses `UnifiedLayerList` with custom `renderShapeItem`
- Fill tab also uses `UnifiedLayerList`

**User Requirement:** The Merge tab workflow should be:
1. User loads the polygon set and any issues that will cause fill problems are **visually indicated**
2. User merges polygons until all shapes are "islands" capable of rendering properly
3. UI gives a **green light / positive confirmation** that shapes are ready for fill

**Implementation Plan:**
1. Update `MergeTab.tsx` to highlight shapes that may cause fill artifacts:
   - Shapes that are very close but not touching (gap detection)
   - Multiple small shapes with same color (likely text/logo)
2. Add visual indicators:
   - Red/orange highlight for shapes with potential issues
   - Green checkmark or highlight when shapes are properly isolated
3. Consider adopting `LayerTree` component or making `UnifiedLayerList` more consistent

**Files to Modify:**
- `src/components/tabs/MergeTab.tsx` - add issue detection and visual feedback
- `src/components/tabs/MergeTab.css` - styling for indicators

---

### 2. Pattern Preview Swatch Tuning (Medium Priority)

**Symptom:** Layer list swatches sometimes show multiple polygons instead of one clean shape.

**Fix:**
1. Ensure banner requests always use a clean rectangular test shape
2. Tune default banner settings for swatch visibility
3. Check if the returned SVG has multiple paths and merge if needed

**Files to Modify:**
- `src/components/tabs/FillTab.tsx` - banner request parameters around line 1750

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
