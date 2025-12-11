# Next Session: Fill Tab Fixes

## IMPORTANT: rat-king stdout support is now available!

The rat-king binary has been updated to support `-o -` for stdout output.
**First task:** Update `electron/main.ts` pattern-banner handler to use stdout instead of temp files.
The current temp file approach in main.ts is causing ENOENT errors - switch to the stdout pattern shown below in issue #3.

---

## Issues to Fix

### 1. Fill Offset from Strokes (High Priority)

**Symptom:** Pattern fills are consistently offset from shape outlines - fills don't align with strokes.

**Root Cause:** `getAllPolygonsFromElement` in `src/utils/geometry.ts:557` extracts raw coordinate attributes WITHOUT applying SVG transforms. When an element has a `transform` attribute (translate, rotate, scale, matrix), the polygon coordinates are in local space but the stroke outline is displayed with transforms applied.

**Diagnosis Steps:**
1. Check if input SVGs have transforms on shape elements
2. Log the extracted polygon bounds vs the displayed element bounds

**Fix Options:**

**Option A: Apply transforms during polygon extraction** (Recommended)
- Modify `getAllPolygonsFromElement` to detect and apply the element's CTM (current transform matrix)
- Use `element.getCTM()` or `element.getScreenCTM()` to get the cumulative transform
- Transform each extracted point by the matrix before returning

**Option B: Flatten transforms in SVG before processing**
- Add a preprocessing step that bakes all transforms into coordinates
- Use the existing `normalizeSVG` IPC handler to flatten transforms
- This is cleaner but requires modifying the input SVG

**Files to Modify:**
- `src/utils/geometry.ts` - `getAllPolygonsFromElement` function
- Possibly `electron/fillGenerator.ts` - `buildSvgFromPolygons` if transforms need to be preserved

---

### 2. Pattern Preview Swatch (Medium Priority)

**Symptom:** Layer list swatches sometimes show multiple polygons instead of one clean shape.

**User Requirement:** Show pattern applied to a simple rectangle, with better default settings for visibility.

**Current Code:** `src/components/tabs/FillTab.tsx:1776` - `getLayerPreview` returns cached banner SVG.

**Fix:**
1. Ensure banner requests always use a clean rectangular test shape
2. Tune default banner settings for swatch visibility:
   - Appropriate `width` and `height` for the swatch size
   - `spacing` that shows the pattern clearly at swatch scale
   - `cells: 1` to ensure single shape output
3. Check if the returned SVG has multiple `<path>` or `<polygon>` elements and merge if needed

**Files to Modify:**
- `src/components/tabs/FillTab.tsx` - banner request parameters in `useEffect` around line 1750
- Possibly the banner cache key generation

---

### 3. Banner ENOENT Error (High Priority)

**Symptom:** Console error: `Failed to read banner output: ENOENT: no such file or directory`

**Root Cause:** Race condition - code tries to read temp file before rat-king finishes writing it. The `close` event fires but the file isn't flushed yet.

**Good News:** User confirmed rat-king now supports stdout mode (`-o -`).

**Fix:** Switch from temp files to stdout in the `pattern-banner` IPC handler.

**Current Code:** `electron/main.ts:388-463`
```javascript
// Current approach - temp file (broken)
const tmpOutput = path.join(os.tmpdir(), `rat-king-banner-...`)
cliArgs = [..., '-o', tmpOutput]
// Later: fs.readFileSync(tmpOutput) - fails with ENOENT
```

**New Code Pattern:**
```javascript
const cliArgs = [
  'banner',
  '--only', pattern,
  '-w', width.toString(),
  '--height', height.toString(),
  '-n', cells.toString(),
  '-s', spacing.toString(),
  '--seed', seed.toString(),
  '-o', '-',  // stdout mode
]

let stdout = ''
proc.stdout.on('data', (data) => {
  stdout += data.toString()
})

proc.on('close', (code) => {
  if (code === 0) {
    resolve(stdout)  // SVG content directly from stdout
  } else {
    reject(...)
  }
})
```

**Files to Modify:**
- `electron/main.ts` - `pattern-banner` IPC handler (lines 388-463)

---

## Implementation Order

1. **Banner ENOENT fix** - Quick win, unblocks testing of swatch improvements
2. **Swatch default settings** - Tune after banner works correctly
3. **Fill offset fix** - Requires more investigation, bigger change

## Verification

After fixes, verify with the "DAILY" SVG shown in the screenshot:
- [ ] Fill lines align with stroke outlines
- [ ] Layer list shows clean pattern swatches
- [ ] No console errors for banner generation
