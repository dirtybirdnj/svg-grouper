# Next Session: Bug Fixes & Error Handling

## Completed This Session

### Bug Fixes

**1. Image Upload Zoom Issue**
- **Problem:** SVG appeared tiny on import, even at 1000% zoom still too small
- **Cause:** Double-scaling - CSS `max-width: 90%` constrained SVG, then JS transform scaled it further
- **Fix:** Removed CSS constraints in `SVGCanvas.css`, let transform handle all sizing
- **Files:** `src/components/SVGCanvas.css`

**2. SVG Dimension Mismatch**
- **Problem:** Crop calculations were inaccurate due to SVG intrinsic size not matching `svgDimensions`
- **Fix:** Added effect in SVGCanvas to set SVG width/height attributes to match `svgDimensions`
- **Files:** `src/components/SVGCanvas.tsx`

**3. Import Error Handling (Major)**
- **Problem:** Loading overlay stuck at 100% showing "Error" with no details, no way to dismiss
- **Root Cause:** `FileUpload.tsx` called `onProgress(100, 'Error')` on failure but never dismissed loading state
- **Fix:** Added `onLoadError` and `onLoadCancel` callbacks to properly dismiss overlay and show errors
- **Files:** `src/components/FileUpload.tsx`, `src/components/tabs/SortTab/SortTab.tsx`

**4. SVG Validation Case Sensitivity**
- **Problem:** SVG check `content.includes('<svg')` was case-sensitive
- **Fix:** Made check case-insensitive with `content.toLowerCase().includes('<svg')`
- **Files:** `src/components/FileUpload.tsx`

**5. Parse Error Visibility**
- **Problem:** SVG parsing errors only logged to console, user saw nothing
- **Fix:** Added status bar message for parse failures
- **Files:** `src/components/tabs/SortTab/SortTab.tsx`

### New Documentation

**Project Charter Created** (`llm-context/PROJECT_CHARTER.md`)
- Core mission: preparing vectors for pen plotter output
- What matters vs what doesn't (viewBox is tolerated, not valued)
- Decision framework for implementation choices
- Technical principles for SVG handling
- Anti-patterns to avoid

### Files Changed
```
src/components/FileUpload.tsx        - Added onLoadError, onLoadCancel callbacks
src/components/SVGCanvas.css         - Removed max-width/height constraints
src/components/SVGCanvas.tsx         - Added dimension sync effect
src/components/tabs/SortTab/SortTab.tsx - Connected error handlers, better error messages
src/utils/cropSVG/cropSVG.ts         - Comment clarification
llm-context/PROJECT_CHARTER.md       - NEW: Mission & decision framework
llm-context/README.md                - Added PROJECT_CHARTER to table
```

---

## Known Issues

### Google Drive CloudStorage
- **Problem:** Files in Google Drive CloudStorage are placeholders that Electron's FileReader can't access
- **Error:** "Failed to read file" when importing from cloud-synced folders
- **Workaround:** Copy files locally or use "Make Available Offline" in Finder
- **Potential Fix:** Use Electron main process for file reading (bypasses sandbox)

### Crop Functionality
- Still needs testing after CSS changes
- Coordinate transformation logic in `useCropHandler` may need adjustment

---

## Architecture Notes

### Error Handling Pattern Established
```typescript
// FileUpload.tsx props
interface FileUploadProps {
  onFileLoad: (content, fileName, dimensions?) => void
  onLoadStart?: () => void
  onProgress?: (progress, status) => void
  onLoadError?: (error: string) => void   // NEW - dismisses loading, shows error
  onLoadCancel?: () => void               // NEW - dismisses loading on cancel
}
```

### Status Message Convention
```typescript
// Prefix with 'error:' for red styling in status bar
setStatusMessage('error:Failed to parse SVG: ' + error.message)
setStatusMessage('Cropped to 200 × 300 px')  // Normal message
```

---

## Previously Completed (Reference)

See sections below for prior session work on:
- Phase 4: Tab Modularization (FillTab, ExportTab, MergeTab, OrderTab)
- Phase 3: Component Modularization (LayerTree, PatternTest, SortTab)
- Phase 2: Context Split + Code Splitting
- Phase 1: Utility Modularization

---

## Remaining Work

### High Priority
1. **Test zoom/crop fixes** with various SVG files
2. **Better Google Drive handling** - detect cloud files, show helpful message
3. **Error boundary** - wrap SVG rendering to catch crashes

### Medium Priority
1. Extract more hooks from `App.tsx` (1023 lines)
2. Unified color handling utilities
3. Better import dialog error states

### Project Charter Questions (Awaiting User Input)
1. Specific plotter hardware constraints?
2. Fill hatching preferences (always convert vs preserve)?
3. Multi-pen workflow details?
4. Common SVG source tools?
5. Definition of "clean" output?

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
