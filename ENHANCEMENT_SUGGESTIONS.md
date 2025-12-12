# Enhancement Suggestions for SVG Grouper

Active enhancement backlog with implementation guidance for agents.
Last updated: 2024-12-11

---

## Status Legend

- **DONE** - Implemented and working
- **PENDING** - Not started, ready for implementation
- **PARTIAL** - Partially implemented, needs completion

---

## 1. Export Coordinate Precision Control

**Status:** PENDING
**Priority:** Medium
**Effort:** 2-3 hours

### Problem
SVG coordinates can have excessive decimal places (e.g., `123.456789012`). While `pathSimplify.ts` has a `precision` parameter, it's not exposed in the Export UI.

### Current State
- `src/utils/pathSimplify.ts:55-98` has `pointsToOptimizedPathData(points, closed, precision)`
- Precision defaults to 2 decimal places
- NOT exposed in ExportTab UI

### Implementation

**Files to modify:**
- `src/components/tabs/ExportTab/ExportTab.tsx`

**Add UI control:**
```tsx
// Add state
const [coordinatePrecision, setCoordinatePrecision] = useState(2)

// Add slider in "Plotter Optimizations" section (~line 800)
<div className="control-group">
  <label>Coordinate Precision: {coordinatePrecision} decimals</label>
  <div className="control-row">
    <input
      type="range"
      min="0"
      max="6"
      step="1"
      value={coordinatePrecision}
      onChange={(e) => setCoordinatePrecision(Number(e.target.value))}
    />
    <span className="range-value">{coordinatePrecision}</span>
  </div>
  <div className="control-help">Lower = smaller file, 2 is typical for plotters</div>
</div>
```

**Wire to export:**
- Pass `coordinatePrecision` to the SVG serialization/rebuild function
- Apply rounding during `rebuildSvgFromLayers()` or export

---

## 2. Debounce Slider Changes

**Status:** PENDING
**Priority:** High (Quick Win)
**Effort:** 1 hour

### Problem
Sliders trigger expensive recalculations on every change event. Found 6+ range inputs that update state directly without debouncing.

### Current State
- Sliders in ExportTab, SortTab, FillTab call `setState` directly on `onChange`
- No debounce utility exists in codebase
- Only `useFillGeneration.ts` has any debounce logic

### Implementation

**Create utility:**
```typescript
// src/hooks/useDebounce.ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>()

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => callback(...args), delay)
  }, [callback, delay]) as T
}
```

**Apply to sliders:**
- FillTab: spacing, angle, wiggle amplitude/frequency sliders
- ExportTab: margin, inset, stroke width sliders
- SortTab: crop size slider

**Recommended delay:** 100-150ms

---

## 3. Virtual Scrolling for Layer Trees

**Status:** PENDING
**Priority:** Medium
**Effort:** 4-6 hours

### Problem
Layer trees with 1000+ items cause performance issues. All items render even when not visible.

### Current State
- `UnifiedLayerList.tsx` (340 lines) renders all items
- `LayerTree.tsx` (114 lines) + `LayerNode.tsx` (273 lines) also render all
- No virtualization library installed

### Implementation

**Install dependency:**
```bash
npm install @tanstack/react-virtual
# or
npm install react-window
```

**Modify UnifiedLayerList:**
```typescript
// Using @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual'

function UnifiedLayerList({ items, ... }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const flatItems = useMemo(() => flattenItems(items), [items])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // row height in px
    overscan: 5, // render 5 extra items above/below viewport
  })

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: virtualRow.size,
            }}
          >
            {renderItem(flatItems[virtualRow.index])}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Challenges:**
- Tree expand/collapse changes list length dynamically
- Drag-drop needs adjustment for virtual items
- Keyboard navigation (arrow keys) must scroll to focused item

---

## 4. Undo/Redo Support

**Status:** PENDING
**Priority:** High
**Effort:** 6-8 hours

### Problem
No way to undo changes like fill application, layer deletion, or color changes.

### Current State
- No history/undo system exists
- State is in multiple contexts: SVGContext, LayerContext, FillContext
- Main state to track: `layerNodes` tree and `svgContent`

### Implementation Options

**Option A: Simple snapshot stack**
```typescript
// src/hooks/useHistory.ts
interface HistoryState {
  layerNodes: SVGNode[]
  svgContent: string
  timestamp: number
}

function useHistory(maxHistory = 20) {
  const [past, setPast] = useState<HistoryState[]>([])
  const [future, setFuture] = useState<HistoryState[]>([])

  const pushState = useCallback((state: HistoryState) => {
    setPast(prev => [...prev.slice(-maxHistory + 1), state])
    setFuture([]) // clear redo stack on new action
  }, [maxHistory])

  const undo = useCallback(() => {
    if (past.length === 0) return null
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [currentState, ...f])
    return prev
  }, [past, currentState])

  const redo = useCallback(() => {
    if (future.length === 0) return null
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p, currentState])
    return next
  }, [future, currentState])

  return { pushState, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }
}
```

**Option B: Use Immer + patches for efficient diffs**
```bash
npm install immer use-immer
```

**Keyboard shortcuts to add:**
- `Cmd+Z` / `Ctrl+Z` - Undo
- `Cmd+Shift+Z` / `Ctrl+Y` - Redo

**Integration points:**
- Wrap state-changing operations with `pushState()` call
- Add undo/redo buttons to header
- Show undo stack count in status bar (optional)

---

## 5. Error Boundaries

**Status:** PENDING
**Priority:** Medium
**Effort:** 2 hours

### Problem
JavaScript errors crash the entire app. No graceful error handling.

### Current State
- No error boundaries exist
- No error boundary component

### Implementation

**Create component:**
```typescript
// src/components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary-fallback">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

**Wrap tabs in App.tsx:**
```tsx
<ErrorBoundary fallback={<div>Tab failed to load</div>}>
  <Suspense fallback={<div>Loading...</div>}>
    {activeTab === 'sort' && <SortTab />}
  </Suspense>
</ErrorBoundary>
```

---

## 6. Test Coverage

**Status:** PENDING
**Priority:** Low (but valuable)
**Effort:** 8+ hours initial setup

### Problem
No tests exist. No test framework installed.

### Current State
- No `__tests__` directory
- No test files (`*.test.ts`, `*.spec.ts`)
- No Jest/Vitest in devDependencies
- No test scripts in package.json

### Implementation

**Install Vitest (recommended for Vite projects):**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Add to package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

**Create vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

**Priority test targets:**
1. `src/utils/geometry/*.ts` - Pure functions, easy to test
2. `src/utils/pathSimplify.ts` - Critical for file size
3. `src/utils/colorDistance/*.ts` - Color clustering logic
4. Custom hooks - `useFillGeneration`, `useCropHandler`

**Example test:**
```typescript
// src/utils/geometry/__tests__/math.test.ts
import { describe, it, expect } from 'vitest'
import { distance, lerp } from '../math'

describe('geometry/math', () => {
  it('calculates distance between points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('lerps between values', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
    expect(lerp(0, 10, 0)).toBe(0)
    expect(lerp(0, 10, 1)).toBe(10)
  })
})
```

---

## Completed Enhancements (Reference)

### Path Simplification
**Status:** DONE
**Location:** `src/utils/pathSimplify.ts`

Fully implemented with:
- Ramer-Douglas-Peucker via simplify-js
- Presets: minimal (0.1), light (0.5), moderate (1.0), aggressive (2.0), extreme (5.0)
- H/V command optimization in `pointsToOptimizedPathData()`
- Group simplification via `simplifyGroup()`

### Path Command Optimization
**Status:** DONE
**Location:** `src/utils/pathSimplify.ts:55-98`

`pointsToOptimizedPathData()` already converts:
- `L x,y` to `H x` for horizontal lines
- `L x,y` to `V y` for vertical lines
- Removes redundant spaces

### Code Deduplication
**Status:** DONE (Dec 2024)

Removed ~2,660 lines per RAT-KING-REFACTOR.md:
- Deleted `fillWorker.ts` (406 lines)
- Gutted `fillPatterns.ts` (2,185 → 593 lines)
- Removed duplicate geometry functions

### Lazy Load Tabs
**Status:** DONE

React.lazy() implemented per NEXT_SESSION.md code splitting section.

### Crop Functionality
**Status:** DONE
**Location:** `src/components/tabs/SortTab/hooks/useCropHandler.ts`

### Memoization
**Status:** DONE (Good coverage)

125 useMemo/useCallback occurrences across 17 files.

---

## Summary by Priority

| Enhancement | Priority | Effort | Impact |
|-------------|----------|--------|--------|
| Debounce Sliders | High | 1 hr | Performance |
| Undo/Redo | High | 6-8 hr | UX |
| Coordinate Precision | Medium | 2-3 hr | File size |
| Error Boundaries | Medium | 2 hr | Stability |
| Virtual Scrolling | Medium | 4-6 hr | Performance |
| Test Coverage | Low | 8+ hr | Maintainability |

---

## Notes for Agents

1. **Read before writing** - Always read existing code in the target area first
2. **Check NEXT_SESSION.md** - Contains current architecture summary
3. **Check ARCHITECTURE.md** - Has component/context relationships
4. **Run build after changes** - `npm run build` catches TypeScript errors
5. **Test manually** - No automated tests exist yet
