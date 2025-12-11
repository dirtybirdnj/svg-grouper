# Rat-King Improvements for SVG-Grouper

Suggestions for rat-king CLI improvements that would simplify svg-grouper integration.

## High Priority

### 1. Banner: Add stdout support (`-o -`)
**Current behavior:** `rat-king banner` only writes to files
**Desired:** Support `-o -` to write SVG to stdout like `fill` does
**Impact:** Eliminates temp file handling in `electron/main.ts` pattern-banner IPC

```bash
# Currently requires temp file:
rat-king banner --only lines -o /tmp/banner.svg && cat /tmp/banner.svg

# Would prefer:
rat-king banner --only lines -o -
```

### 2. Banner: Single-pattern shorthand
**Current:** `--only lines` requires the `--only` flag
**Suggestion:** Add `-p <pattern>` as shorthand for single-pattern mode
**Rationale:** Mirrors `fill -p <pattern>` syntax for consistency

```bash
# Current
rat-king banner --only crosshatch -o banner.svg

# Suggested shorthand
rat-king banner -p crosshatch -o banner.svg
```

## Medium Priority

### 3. Fill: Suppress stderr info messages with `--quiet`
**Issue:** Fill outputs info to stderr even on success:
```
Reading SVG from stdin...
Loaded 1 polygons (0 with holes, 0 total holes)
Generated 63 lines -> 63 chains (0% reduction) in 49µs
```
**Impact:** Have to filter/ignore stderr in IPC handlers
**Suggestion:** Add `--quiet` or `-q` flag to suppress info messages

### 4. Banner: Control output color
**Current:** Banner uses random colors from a palette
**Suggestion:** Add `--stroke <color>` option to set line color
**Use case:** svg-grouper replaces colors anyway, but could skip post-processing

### 5. List patterns programmatically
**Current:** `rat-king patterns` outputs human-readable list
**Suggestion:** Add `--json` flag for machine-readable output
```bash
rat-king patterns --json
# Output: ["lines", "crosshatch", "zigzag", ...]
```
**Impact:** Could auto-populate pattern dropdowns without hardcoding

## Low Priority

### 6. Version flag
**Suggestion:** Add `--version` or `-V` flag
**Use case:** svg-grouper could verify minimum rat-king version for feature compatibility

### 7. Banner: Aspect ratio mode
**Current:** Must specify both `-w` and `--height`
**Suggestion:** Add `--aspect <ratio>` with auto-calculated height
```bash
rat-king banner -w 4 --aspect 8:1 -o banner.svg  # height = 0.5
```

## Implemented Features (Thanks!)

- [x] `banner` subcommand for pattern previews
- [x] `--only` pattern filtering in banner
- [x] `--seed` for reproducible output
- [x] JSON output format for fill (`-f json`)
- [x] Stdin support for fill (`fill -`)
- [x] `harness` command for testing patterns
