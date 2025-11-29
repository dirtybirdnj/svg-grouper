# Enhancement Suggestions for SVG Grouper

This document contains suggestions for improving performance, reducing file size, and enhancing the user experience of SVG Grouper.

## High Priority - File Size Reduction (Cricut Compatibility)

### 1. Path Simplification with simplify.js

**Problem:** Files are too large for Cricut systems due to excessive points in paths.

**Solution:** Integrate [simplify-js](https://mourner.github.io/simplify-js/) for path simplification using the Ramer-Douglas-Peucker algorithm.

**Implementation:**
- Add `simplify-js` as a dependency: `npm install simplify-js`
- Create a "Simplify Paths" button on the Sort tab
- Allow user-configurable tolerance (0.1 - 10 pixels)
- Apply to selected groups or individual paths
- Show before/after point counts for user feedback

**Code location:** `src/components/tabs/SortTab.tsx`

```typescript
// Example integration
import simplify from 'simplify-js';

function simplifyPath(points: Point[], tolerance: number): Point[] {
  return simplify(points, tolerance, true); // true = high quality
}
```

### 2. Decimal Precision Reduction

**Problem:** SVG coordinates often have excessive decimal places (e.g., `123.456789012`).

**Solution:** Round coordinates to 2-3 decimal places during export.

**Implementation:**
- Add option in Export tab: "Coordinate precision" (0-6 decimals)
- Apply rounding during `rebuildSvgFromLayers()`
- Could reduce file size by 20-40%

### 3. Path Command Optimization

**Problem:** Many paths use verbose L (lineto) commands where H/V could be used.

**Solution:** Optimize path data during export:
- Convert `L x,y` to `H x` when only X changes
- Convert `L x,y` to `V y` when only Y changes
- Use relative commands (l, h, v) when they're shorter

---

## Medium Priority - Code Efficiency

### 4. Reduce Duplicated Code in FillTab.tsx and geometry.ts

**Problem:** `FillTab.tsx` (1400+ lines) duplicates many functions from `geometry.ts` and `fillPatterns.ts`.

**Solution:** Refactor FillTab to import from utility modules:
- `parsePathIntoSubpaths` - duplicated
- `getPolygonPoints` - duplicated
- `identifyOuterAndHoles` - duplicated
- `clipLinesToPolygon` - duplicated

**Files affected:**
- `src/components/tabs/FillTab.tsx`
- `src/utils/geometry.ts`
- `src/utils/fillPatterns.ts`

### 5. Memoization of Expensive Calculations

**Problem:** Some calculations are repeated on every render.

**Solution:** Use `useMemo` more aggressively for:
- `collectAllColorsWithCounts()` in SortTab
- `getSelectedPathInfo()` / `getSelectedGroupInfo()` in SortTab
- Layer tree traversals

### 6. Virtual Scrolling for Large Layer Trees

**Problem:** Layer trees with 1000+ items cause performance issues.

**Solution:** Implement virtual scrolling using `react-window` or similar:
- Only render visible items
- Lazy load children on expand
- Add search/filter functionality

---

## Lower Priority - UX Improvements

### 7. Fix Crop Functionality

**Current Issue:** Crop overlay displays but doesn't actually crop the SVG.

**Required Implementation:**
- Calculate SVG viewBox based on crop region and current pan/zoom
- Add "Apply Crop" button that:
  1. Calculates the visible region in SVG coordinates
  2. Updates SVG viewBox attribute
  3. Optionally removes elements outside crop region
  4. Updates layer nodes to reflect changes

**Files affected:**
- `src/components/SVGCanvas.tsx`
- `src/components/tabs/SortTab.tsx` or new CropTab
- `src/App.tsx` (toolbar crop button)

### 8. Add Path/Point Statistics on Fill Tab

**Problem:** User can't see how many paths/points will be generated before applying fill.

**Solution:** Add live preview statistics:
- Total lines to be generated
- Estimated point count
- Travel distance (pen up time)
- Show these in the Fill tab sidebar

### 9. Undo/Redo Support

**Problem:** No way to undo changes like fill application or layer deletion.

**Solution:** Implement history stack:
- Store snapshots of `layerNodes` state
- Add keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
- Limit history depth (e.g., 20 states)

### 10. Progress Indicator for Long Operations

**Problem:** Fill generation on complex shapes can take several seconds with no feedback.

**Solution:**
- Add progress bar for fill pattern generation
- Use Web Workers for heavy computation
- Show "Processing..." indicator (partially implemented with `isProcessing` state)

---

## Performance Quick Wins

### 11. Debounce Slider Changes

**Problem:** Spacing, angle, and inset sliders trigger expensive recalculations on every change.

**Solution:** Debounce slider handlers by 100-200ms:
```typescript
const debouncedSetSpacing = useMemo(
  () => debounce(setSpacing, 150),
  []
);
```

### 12. Lazy Load Tabs

**Problem:** All tab components render even when not visible.

**Solution:** Only render active tab component:
```tsx
{activeTab === 'fill' && <FillTab />}
{activeTab === 'sort' && <SortTab />}
// etc.
```

### 13. Optimize Color Extraction

**Problem:** `extractColors()` in LayerTree is called for every node on every render.

**Solution:**
- Cache color extraction results on the node object
- Only recalculate when element attributes change

---

## Technical Debt

### 14. TypeScript Strictness

Some type safety improvements:
- Add explicit return types to all functions
- Remove `any` types where possible
- Enable `strictNullChecks` if not already

### 15. Test Coverage

Currently no tests. Consider adding:
- Unit tests for geometry utilities
- Unit tests for color extraction
- Integration tests for fill pattern generation

### 16. Error Boundaries

Add React error boundaries to prevent full app crashes:
- Wrap each tab in an error boundary
- Show user-friendly error messages
- Allow recovery without reload

---

## Summary by Impact

| Enhancement | File Size Impact | Performance | Complexity |
|-------------|------------------|-------------|------------|
| Path Simplification | High | N/A | Medium |
| Decimal Precision | Medium | N/A | Low |
| Code Deduplication | N/A | Low | Medium |
| Memoization | N/A | Medium | Low |
| Virtual Scrolling | N/A | High | High |
| Crop Fix | N/A | N/A | Medium |
| Undo/Redo | N/A | N/A | High |

---

*Last updated: November 28, 2024*
