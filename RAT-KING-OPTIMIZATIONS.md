# Rat-King Optimization Recommendations

This document outlines functions currently in JavaScript (svg-grouper) that should be migrated to Rust (rat-king) for performance and code consolidation.

## Current Architecture

```
svg-grouper (Electron/React)
├── FillTab.tsx
│   ├── window.electron.generateFillsRatKing() → IPC → rat-king CLI ✅
│   └── generateFillsLocally() → fillPatterns.ts (JS fallback) ❌ DEPRECATED
├── geometry.ts (2,015 lines)
│   ├── Pattern generation functions → DUPLICATE of rat-king ❌
│   ├── Line chaining/optimization → Should move to rat-king
│   └── SVG parsing utilities → Keep in JS (DOM access)
└── fillPatterns.ts (2,185 lines)
    └── 20+ pattern generators → DUPLICATE of rat-king ❌
```

## Phase 1: Line Optimization (High Priority)

### 1.1 `linesToOptimizedCompoundPath` - Chain Connected Lines

**Current Location:** `geometry.ts:1183-1280`

**What it does:**
- Takes array of disconnected line segments (HatchLine[])
- Finds lines that share endpoints within tolerance
- Chains them into continuous polylines
- Reduces SVG path commands by 60-80%

**Why move to Rust:**
- Called on every fill generation result
- O(n²) algorithm for n lines
- For 100k lines, JS takes ~500ms, Rust would take ~5ms

**Proposed rat-king interface:**
```rust
// Add to rat-king fill output
pub struct FillOutput {
    pub svg: String,
    pub lines: Vec<Line>,           // Raw lines (existing)
    pub chains: Vec<Vec<Point>>,    // NEW: Pre-chained polylines
    pub stats: FillStats,
}

// Or add as post-processing command
rat-king chain-lines <input.svg> --tolerance 0.1
```

**Current JS implementation to port:**
```typescript
// geometry.ts:1183-1280
export function linesToOptimizedCompoundPath(
  lines: HatchLine[],
  tolerance: number = 0.1,
  precision: number = 2
): string {
  // Build chains of connected lines using endpoint matching
  // See full implementation in geometry.ts
}
```

### 1.2 `optimizePathOrder` - Nearest Neighbor TSP

**Current Location:** `geometry.ts:1781-1834`

**What it does:**
- Reorders paths to minimize pen travel distance
- Uses greedy nearest-neighbor algorithm
- Can reverse paths if end-to-start is closer

**Why move to Rust:**
- O(n²) comparisons for n paths
- Critical for plotter performance (reduces travel by 40-70%)
- Already have similar logic in `optimizeLineOrderMultiPass` in fillPatterns.ts

**Proposed rat-king interface:**
```rust
// Add flag to existing fill command
rat-king fill input.svg --pattern lines --optimize-order

// Or standalone command for post-processing
rat-king optimize <input.svg> --algorithm nearest-neighbor
```

### 1.3 `joinConnectingPaths` - Merge Adjacent Paths

**Current Location:** `geometry.ts:1840-1978`

**What it does:**
- Finds path elements with shared endpoints
- Merges them into single continuous paths
- Reduces total path count (fewer pen lifts)

**Why move to Rust:**
- Same O(n²) complexity as chain optimization
- Works on SVG path elements directly
- Would benefit from Rust's SVG parsing (already in rat-king)

**Proposed rat-king interface:**
```rust
// Add to optimize command
rat-king optimize <input.svg> --join-paths --tolerance 0.5
```

## Phase 2: SVG Parsing (Medium Priority)

### 2.1 Polygon Extraction from SVG Elements

**Current Location:** `geometry.ts:540-645`

**What it does:**
- Extracts polygon vertices from various SVG elements (path, rect, circle, polygon)
- Handles compound paths with holes (evenodd fill rule)
- Identifies outer boundaries vs holes by winding direction

**Why move to Rust:**
- rat-king already parses SVG paths internally
- Currently JS extracts polygons, sends to rat-king, rat-king re-parses
- Eliminating double-parse would reduce IPC payload size

**Current flow (inefficient):**
```
JS: Parse SVG → Extract polygons → Serialize to JSON
IPC: Send polygon JSON (large!)
Rust: Deserialize → Generate fills
```

**Proposed flow:**
```
JS: Send SVG string only
IPC: Send SVG (small)
Rust: Parse SVG → Extract polygons → Generate fills
```

**Note:** rat-king already has `usvg` for SVG parsing. This is more about API design than new code.

### 2.2 Subpath Mode Handling

**Current Location:** `geometry.ts:557-644`

**What it does:**
- Controls how compound paths are split:
  - `default`: Split disconnected regions, preserve holes within each
  - `connected`: Keep all subpaths as one polygon
  - `separate`: Each subpath is independent (no hole detection)

**This logic exists in rat-king** but the modes may differ. Ensure parity.

## Phase 3: Fill Rule Support (High Priority for Correctness)

### 3.1 EvenOdd Clipping

**Current Location:** `geometry.ts:955-1075`

**The problem (from user screenshot):**
Fill patterns are appearing INSIDE letterforms instead of outside. This is a winding direction / evenodd issue.

**What needs to happen in rat-king:**
1. Detect `fill-rule` attribute from input SVG (`evenodd` vs `nonzero`)
2. When clipping fill lines to polygon:
   - For `evenodd`: Point is inside if it crosses odd number of boundaries
   - For `nonzero`: Point is inside based on winding sum

**Current JS implementation:**
```typescript
// geometry.ts:955-966
export function isPointInsideEvenOdd(point: Point, polygons: Point[][]): boolean {
  let crossings = 0
  for (const polygon of polygons) {
    if (pointInPolygon(point, polygon)) {
      crossings++
    }
  }
  return crossings % 2 === 1
}
```

**Recommended rat-king implementation:**
```rust
pub enum FillRule {
    NonZero,
    EvenOdd,
}

pub fn clip_line_to_polygons(
    line: &Line,
    polygons: &[Polygon],
    fill_rule: FillRule,
) -> Vec<Line> {
    // Implementation differs based on fill_rule
}
```

## Phase 4: Output Optimization (Low Priority)

### 4.1 Path Simplification

**Current:** Uses `simplify-js` library in JS after rat-king output

**Recommendation:** Add Ramer-Douglas-Peucker simplification to rat-king:
```rust
rat-king fill input.svg --simplify 0.5  // tolerance in SVG units
```

### 4.2 Coordinate Precision

**Current:** JS rounds coordinates to 2-3 decimal places

**Recommendation:** Add precision flag to rat-king:
```rust
rat-king fill input.svg --precision 2  // decimal places
```

## Implementation Priority

| Feature | Impact | Effort | Priority | Status |
|---------|--------|--------|----------|--------|
| EvenOdd fill rule fix | Critical | Medium | **P0** | ✅ DONE |
| Line chaining | High | Low | **P1** | ✅ DONE |
| Path order optimization | High | Medium | **P1** | ✅ DONE |
| Path joining | Medium | Medium | **P2** | Pending |
| Full SVG parsing | Medium | High | **P3** | Pending |
| Simplification | Low | Low | **P4** | Pending |

### Completed (Dec 2024)

- **P0 (EvenOdd/Hole Detection)**: rat-king now uses winding direction analysis to detect holes
- **P1 (Line Chaining)**: rat-king returns pre-chained polylines via `chains` output field
- **P1 (Path Ordering)**: rat-king includes nearest-neighbor optimization
- **JS Cleanup**: Removed 2,660 lines of duplicate JavaScript code

## Data Flow Changes

### Current (Inefficient)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   svg-grouper   │     │      IPC        │     │    rat-king     │
│                 │     │                 │     │                 │
│ 1. Parse SVG    │────▶│ Polygon JSON    │────▶│ 3. Generate     │
│ 2. Extract poly │     │ (100KB+)        │     │    fill lines   │
│                 │◀────│ Lines JSON      │◀────│                 │
│ 4. Chain lines  │     │ (500KB+)        │     │                 │
│ 5. Optimize     │     │                 │     │                 │
│ 6. To SVG path  │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Proposed (Efficient)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   svg-grouper   │     │      IPC        │     │    rat-king     │
│                 │     │                 │     │                 │
│ 1. Send SVG     │────▶│ SVG string      │────▶│ 2. Parse SVG    │
│                 │     │ (10KB)          │     │ 3. Extract poly │
│                 │◀────│ SVG string      │◀────│ 4. Generate fill│
│ 5. Insert into  │     │ (20KB)          │     │ 5. Chain lines  │
│    document     │     │                 │     │ 6. Optimize     │
│                 │     │                 │     │ 7. To SVG path  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Benefits:**
- IPC payload reduced from ~600KB to ~30KB
- JS thread freed during heavy computation
- Single source of truth for all algorithms

## Code Removed from svg-grouper ✅ DONE (Dec 2024)

The following code has been removed now that rat-king handles these features:

### fillWorker.ts - DELETED (406 lines)
- Entire file removed

### fillPatterns.ts (2,185 → 593 lines, -1,592 lines)
- ~~All `generate*Lines` functions (20+)~~ REMOVED
- Kept: `FillPatternType`, `TileShapeType`, `TILE_SHAPES` types
- Kept: `optimizeLineOrderMultiPass` (post-processing)

### geometry.ts (2,015 → 1,402 lines, -613 lines)
- ~~`pointInPolygon`~~ REMOVED
- ~~`lineSegmentIntersection`~~ REMOVED
- ~~`linePolygonIntersections`~~ REMOVED
- ~~`generateGlobalHatchLines`~~ REMOVED
- ~~`clipLinesToPolygon`~~ REMOVED
- ~~`clipLinesToPolygonsEvenOdd`~~ REMOVED
- ~~`clipSegmentAroundHoles`~~ REMOVED
- ~~`isPointInsideEvenOdd`~~ REMOVED
- ~~`polygonSignedArea`~~ REMOVED
- ~~`offsetPolygonInward`~~ REMOVED
- ~~`offsetPolygon`~~ REMOVED
- ~~`linesToOptimizedCompoundPath`~~ REMOVED
- Kept: `linesToCompoundPath` (still used by UI)

### FillTab.tsx (~250 lines removed)
- ~~`generateFillsLocally` function~~ REMOVED
- ~~Pattern generator imports~~ REMOVED

**Total reduction: ~2,660 lines of JavaScript**

## Testing Strategy

1. Create test SVGs with known expected outputs
2. Run same SVG through both JS and Rust implementations
3. Compare output visually and numerically
4. Focus on edge cases:
   - Compound paths with holes (letters like O, B, 8)
   - Paths with mixed winding directions
   - Very dense patterns (100k+ lines)
   - Self-intersecting polygons

## References

- Current rat-king CLI: `/Users/mgilbert/Code/rat-king/target/release/rat-king`
- Harness results: `/Users/mgilbert/Code/rat-king/harness-results.json`
- IPC handler: `/Users/mgilbert/Code/svg-grouper/electron/main.ts:304-360`
- JS geometry utils: `/Users/mgilbert/Code/svg-grouper/src/utils/geometry.ts`
- JS fill patterns: `/Users/mgilbert/Code/svg-grouper/src/utils/fillPatterns.ts`
