# rat-king Integration Complete

## Status: DONE

svg-grouper now uses rat-king (Rust) for ALL pattern generation.

### What Changed

1. **Main fill handler** (`generate-fills`) now calls rat-king via stdin/stdout JSON
   - No temp files needed
   - Uses `--grouped` for per-shape line tracking
   - Colors preserved per-shape

2. **rat-king button** in Fill tab for quick full-SVG fills

3. **Patterns available** (17 total):
   - lines, crosshatch, zigzag, wiggle, spiral, fermat
   - concentric, radial, honeycomb, crossspiral, hilbert
   - gyroid, scribble, guilloche, lissajous, rose, phyllotaxis

### Performance

- ~200x faster than TypeScript implementation
- Essex.svg (314 polygons): ~159ms vs 32 seconds

### Commands

```bash
# Rebuild rat-king if needed
cd ~/Code/rat-king/crates
~/.cargo/bin/cargo build --release
cp target/release/rat-king ~/.cargo/bin/

# Run svg-grouper
cd ~/Code/svg-grouper
npm run dev
```

### Architecture

```
svg-grouper (Electron)
    │
    ├── FillTab.tsx (UI)
    │       │
    │       ▼
    ├── fillGenerator.ts (IPC handler)
    │       │
    │       ▼ stdin/stdout JSON
    └── rat-king (Rust binary)
            │
            └── Returns: { shapes: [{ id, lines: [{x1,y1,x2,y2}...] }] }
```

### Notes

- TypeScript fill patterns still exist in codebase but are unused
- Worker thread code (`fillWorker.ts`) still exists but main handler bypasses it
- Could clean up unused TS code in future session
