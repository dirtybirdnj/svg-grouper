# rat-king Integration Refactor Plan

## Overview

This document outlines the plan to refactor svg-grouper's pattern test interface and fill generation to fully leverage the modernized rat-king Rust engine. The rat-king project has been significantly improved with 30 patterns, a built-in harness command, sketchy effects, and better CLI options.

## Current State

### svg-grouper Pattern Test (`PatternTest.tsx`)
- Tests 14 patterns via IPC to `electron/fillGenerator.ts`
- Has custom Grid Test, Stress Test, and Torture Test modes
- Uses 15-second timeout with DNF tracking
- Stores results in `patternStats.json`
- Custom zoom/pan, SVG rendering, performance timing

### rat-king Current Capabilities (v0.1+)
- **30 patterns** (up from 14 in svg-grouper):
  - Original: lines, crosshatch, zigzag, wiggle, spiral, fermat, concentric, radial, honeycomb, crossspiral, hilbert, scribble, gyroid
  - New: guilloche, lissajous, rose, phyllotaxis, pentagon15, pentagon14, grid, brick, truchet, stipple, peano, sierpinski, diagonal, herringbone, stripe, tessellation, harmonograph
- **Built-in harness command**: `rat-king harness input.svg --analyze --json`
- **Sketchy effect**: RoughJS-style hand-drawn look (`--sketchy --roughness --bowing`)
- **Stroke inclusion**: `--strokes` flag to include polygon outlines
- **TUI**: Interactive pattern preview with real-time adjustment
- **Performance**: 200x faster than Python/Shapely

### IPC Architecture
```
React (PatternTest.tsx / FillTab.tsx)
    ↓ window.electron.generateFills()
preload.ts (contextBridge)
    ↓ ipcRenderer.invoke('generate-fills')
fillGenerator.ts
    ↓ spawn rat-king with JSON I/O
rat-king binary
```

## Problems to Solve

1. **Pattern Gap**: svg-grouper only exposes 14 of 30 patterns
2. **Duplicate Logic**: Custom harness in JS vs rat-king's native harness
3. **Stale Path**: Hardcoded rat-king binary path in `main.ts` (line 305)
4. **Missing Features**: No access to sketchy effect, stroke inclusion, or ordering options
5. **Parameter Mismatch**: Many JS parameters (wiggleAmplitude, inset, crop) aren't passed to rat-king
6. **Redundant Code**: `fillPatterns.ts` (14 JS pattern implementations) duplicates rat-king

## Refactor Plan

### Phase 1: Update Pattern List (Low Risk)

**Goal**: Expose all 30 rat-king patterns in the UI

**Files to modify**:
- `src/utils/fillPatterns.ts` - Add new pattern types to `FillPatternType`
- `src/components/PatternTest.tsx` - Update `ALL_PATTERNS` array
- `src/components/tabs/FillTab.tsx` - Update pattern dropdown

**Changes**:
```typescript
// fillPatterns.ts
export type FillPatternType =
  | 'lines' | 'crosshatch' | 'zigzag' | 'wiggle' | 'spiral'
  | 'fermat' | 'concentric' | 'radial' | 'honeycomb' | 'crossspiral'
  | 'hilbert' | 'scribble' | 'gyroid'
  // New patterns from rat-king
  | 'guilloche' | 'lissajous' | 'rose' | 'phyllotaxis'
  | 'pentagon15' | 'pentagon14' | 'grid' | 'brick' | 'truchet'
  | 'stipple' | 'peano' | 'sierpinski' | 'diagonal'
  | 'herringbone' | 'stripe' | 'tessellation' | 'harmonograph'
```

### Phase 2: Fix Binary Path Resolution (Critical)

**Goal**: Replace hardcoded path with dynamic resolution

**Files to modify**:
- `electron/main.ts` - Remove hardcoded `RAT_KING_CLI` constant, import finder
- `electron/fillGenerator.ts` - Expand `findRatKingBinary()` search paths

**Current issues**:

1. `main.ts:305` has hardcoded path:
```typescript
const RAT_KING_CLI = '/Users/mgilbert/Code/rat-king/target/release/rat-king'
```

2. `fillGenerator.ts:608` finder is too limited:
```typescript
function findRatKingBinary(): string {
  const paths = [
    path.join(os.homedir(), '.cargo', 'bin', 'rat-king'),
    '/usr/local/bin/rat-king',
    'rat-king'  // Falls back to PATH
  ]
  // Missing: development paths, env override, crates/ structure
}
```

**Fix**: Expand the finder and export it:
```typescript
// fillGenerator.ts - improved finder
export function findRatKingBinary(): string {
  const searchPaths = [
    // Environment override
    process.env.RAT_KING_PATH,
    // Cargo install location
    path.join(os.homedir(), '.cargo', 'bin', 'rat-king'),
    // System paths
    '/usr/local/bin/rat-king',
    '/opt/homebrew/bin/rat-king',
    // Development paths (rat-king repo structure)
    path.join(os.homedir(), 'Code', 'rat-king', 'crates', 'target', 'release', 'rat-king'),
    path.join(os.homedir(), 'Code', 'rat-king', 'target', 'release', 'rat-king'),
    // Bundled with app
    path.join(__dirname, '..', 'bin', 'rat-king'),
    path.join(__dirname, 'rat-king'),
  ].filter(Boolean) as string[]

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      console.log(`[rat-king] Found binary at: ${p}`)
      return p
    }
  }

  console.warn('[rat-king] Binary not found, falling back to PATH')
  return 'rat-king'  // Let OS find it in PATH
}
```

**Then in main.ts**:
```typescript
import { findRatKingBinary } from './fillGenerator'

// Remove: const RAT_KING_CLI = '/Users/mgilbert/Code/...'
// Use: const ratKingBin = findRatKingBinary()
```

### Phase 3: Add Sketchy Effect Support (Medium Risk)

**Goal**: Expose rat-king's sketchy effect in UI

**Files to modify**:
- `electron/fillGenerator.ts` - Add sketchy parameters to IPC handler
- `electron/preload.ts` - Extend `FillGenerationParams` type
- `src/components/tabs/FillTab.tsx` - Add sketchy controls

**New parameters**:
```typescript
interface FillGenerationParams {
  // ... existing params ...
  sketchy?: boolean
  roughness?: number  // default 1.0
  bowing?: number     // default 1.0
  doubleStroke?: boolean  // default true
  seed?: number       // for reproducibility
  includeStrokes?: boolean  // --strokes flag
}
```

**rat-king CLI mapping**:
```bash
rat-king fill input.svg -p lines \
  --sketchy \
  --roughness 2.0 \
  --bowing 1.5 \
  --strokes \
  --seed 42
```

### Phase 4: Simplify PatternTest Using rat-king Harness (High Impact)

**Goal**: Replace custom JS harness with rat-king's native `harness` command

**Current PatternTest complexity**:
- Custom stress test loading (`essx-vt-stress-test.svg`)
- Custom torture test loop with pause/resume
- Custom performance timing and thresholds
- Custom PNG caching for background
- 1200+ lines of React code

**rat-king harness capabilities**:
```bash
# Run all patterns with JSON output
rat-king harness input.svg --json

# Run specific patterns with analysis
rat-king harness input.svg -p lines,crosshatch --analyze

# Visual mode with screenshots
rat-king harness input.svg --visual -o screenshots/
```

**New simplified architecture**:
```typescript
// PatternTest.tsx (simplified)
const runHarness = async () => {
  const result = await window.electron.runRatKingHarness({
    svgPath: testSvgPath,
    patterns: selectedPatterns, // or 'all'
    outputJson: true,
    analyze: true,
  })
  // result contains timing, line counts, coverage analysis
  setHarnessResults(result)
}
```

**New IPC handler** (`fillGenerator.ts`):
```typescript
ipcMain.handle('run-rat-king-harness', async (event, params) => {
  const ratKing = findRatKingBinary()
  const args = ['harness', params.svgPath, '--json']
  if (params.patterns) args.push('-p', params.patterns.join(','))
  if (params.analyze) args.push('--analyze')

  const result = spawnSync(ratKing, args)
  return JSON.parse(result.stdout)
})
```

### Phase 5: Deprecate JavaScript Fill Patterns (Long Term)

**Goal**: Remove redundant JS pattern implementations

**Files to deprecate**:
- `src/utils/fillPatterns.ts` - 2000+ lines of JS pattern code
- `electron/fillWorker.ts` - Worker thread fallback

**Migration path**:
1. Keep JS patterns as fallback for development without rat-king
2. Add `RAT_KING_REQUIRED=true` environment flag for production
3. Remove JS fallback in next major version

**Benefit**: Reduce bundle size by ~100KB, single source of truth for patterns

### Phase 6: UI Improvements (Optional)

**Add rat-king TUI launcher**:
```typescript
// Launch rat-king TUI for interactive preview
window.electron.launchRatKingTUI(svgPath)
```

**Pattern preview thumbnails**:
- Use rat-king's `--visual` output to generate preview images
- Cache in `~/.svg-grouper/pattern-previews/`

## Implementation Order

| Phase | Risk | Effort | Dependency |
|-------|------|--------|------------|
| 1. Update Pattern List | Low | 1 hour | None |
| 2. Fix Binary Path | Critical | 30 min | None |
| 3. Add Sketchy Effect | Medium | 2 hours | Phase 2 |
| 4. Use rat-king Harness | High | 4 hours | Phase 2 |
| 5. Deprecate JS Patterns | Long term | 2 hours | Phase 4 |
| 6. UI Improvements | Optional | 4 hours | Phase 4 |

## Testing Plan

### Unit Tests
- Verify all 30 patterns are recognized by type system
- Test binary path resolution on different platforms
- Test IPC parameter passing

### Integration Tests
- Run pattern generation for each of 30 patterns
- Verify sketchy effect output differs from normal
- Compare rat-king harness output with current PatternTest results

### Performance Tests
- Benchmark new harness vs old custom implementation
- Verify no regression in fill generation time

## Rollback Plan

Each phase is independent and can be reverted:
- Phase 1: Revert type changes, patterns still work with rat-king
- Phase 2: Keep hardcoded path as fallback
- Phase 3: Sketchy params are optional, defaults work
- Phase 4: Keep current PatternTest.tsx alongside new implementation
- Phase 5: JS patterns remain as fallback

## Files Summary

| File | Phase | Change Type |
|------|-------|-------------|
| `src/utils/fillPatterns.ts` | 1, 5 | Add types, deprecate implementations |
| `src/components/PatternTest.tsx` | 1, 4 | Update patterns, simplify with harness |
| `src/components/tabs/FillTab.tsx` | 1, 3 | Add patterns, add sketchy controls |
| `electron/main.ts` | 2 | Remove hardcoded path |
| `electron/fillGenerator.ts` | 2, 3, 4 | Fix path, add sketchy, add harness IPC |
| `electron/preload.ts` | 3, 4 | Extend types, add harness API |
| `electron/fillWorker.ts` | 5 | Deprecate |

## Success Metrics

- [ ] All 30 rat-king patterns available in UI
- [ ] Binary path works on fresh install
- [ ] Sketchy effect accessible from FillTab
- [ ] PatternTest uses rat-king harness command
- [ ] No regression in pattern generation performance
- [ ] Bundle size reduced (after Phase 5)

## Notes

- The `wave` pattern in svg-grouper maps to `wiggle` in rat-king
- Custom tile patterns are JS-only and should remain as fallback
- `concentric` pattern is hidden in UI but should be re-enabled with rat-king
- rat-king's `--grouped` flag is essential for per-shape color preservation
