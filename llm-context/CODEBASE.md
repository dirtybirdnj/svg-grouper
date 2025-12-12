# SVG Grouper - Codebase Overview

## Project Summary

**SVG Grouper** is a cross-platform desktop application for preparing SVG files for pen plotters (AxiDraw, etc.). It provides layer management, fill pattern hatching, path optimization, and export tools.

- **Platform:** Electron + React + TypeScript
- **Lines of Code:** ~26,500 TypeScript/TSX
- **License:** GPL-3.0
- **Author:** Mat Gilbert (with Claude assistance)

## Key Features

### 1. Layer Management (SortTab)
- Drag & drop SVG import with progressive parsing
- Hierarchical layer tree with multi-select (Shift/Cmd)
- Visibility toggles and color preview swatches
- Group/ungroup, flatten hierarchy
- Node isolation (show only selected)

### 2. Fill Pattern Hatching (FillTab)
- 20+ patterns via rat-king Rust CLI
- Patterns: lines, cross-hatch, wiggle, spiral, Hilbert curve, Fermat spiral, honeycomb, concentric
- Adjustable spacing, angle, density, pen width
- Proper hole support (donuts, letters with counters)
- Optional polygon union before fill

### 3. Boolean Operations (MergeTab)
- Union, intersection, difference, XOR
- Powered by polygon-clipping library
- Visual preview of operations

### 4. Path Optimization (OrderTab)
- TSP nearest-neighbor approximation
- Multi-pass chunked optimization for large files (10K+ lines)
- Travel distance reduction visualization
- Color grouping for pen changes

### 5. Export (ExportTab)
- Paper size templates (A4, Letter, custom)
- Margin and inset controls with preview
- Playback simulation
- Crop tool with aspect ratio presets
- Multi-file export by color

## Directory Structure

```
svg-grouper/
├── electron/                    # Main process
│   ├── main.ts                  # Window, menu, IPC setup
│   ├── preload.ts               # Context bridge API
│   └── fillGenerator.ts         # rat-king CLI integration
│
├── src/
│   ├── App.tsx                  # Main orchestrator (1023 lines)
│   ├── main.tsx                 # React entry
│   │
│   ├── components/
│   │   ├── tabs/
│   │   │   ├── SortTab/         # Layer editor (3032 lines)
│   │   │   ├── FillTab/         # Pattern generation (2363 lines)
│   │   │   ├── MergeTab/        # Boolean ops (1377 lines)
│   │   │   ├── OrderTab/        # Line optimization (838 lines)
│   │   │   └── ExportTab/       # Export tools (1487 lines)
│   │   │
│   │   ├── shared/              # Reusable components
│   │   │   ├── UnifiedLayerList/
│   │   │   ├── ColorSwatch.tsx
│   │   │   ├── Rulers.tsx
│   │   │   ├── ScaleControls.tsx
│   │   │   └── StatSection.tsx
│   │   │
│   │   ├── LayerTree/           # Tree display
│   │   └── PatternTest/         # Stress test harness
│   │
│   ├── context/                 # State management (6 contexts)
│   │   ├── AppProvider.tsx
│   │   ├── SVGContext.tsx
│   │   ├── LayerContext.tsx
│   │   ├── CanvasContext.tsx
│   │   ├── ToolContext.tsx
│   │   ├── UIContext.tsx
│   │   └── FillContext.tsx
│   │
│   ├── hooks/                   # Custom hooks
│   │   ├── useArrangeTools.ts
│   │   ├── usePanZoom.ts
│   │   ├── useLayerSelection.ts
│   │   └── useFlattenAll.ts
│   │
│   ├── utils/                   # Utility libraries
│   │   ├── geometry/            # Path & polygon math
│   │   ├── svgDimensions/       # ViewBox & units
│   │   ├── colorDistance/       # K-means clustering
│   │   ├── cropSVG/             # SVG cropping
│   │   ├── fillPatterns/        # Hatch generation
│   │   ├── pathAnalysis/        # Subpath parsing
│   │   ├── svgParser/           # Progressive parsing
│   │   └── nodeUtils.ts         # Tree navigation
│   │
│   └── types/
│       └── svg.ts               # SVGNode, etc.
│
├── scripts/                     # Helper scripts
│   ├── normalize_svg.py
│   └── validate-svg.js
│
└── package.json
```

## Tech Stack

### Core
- **Electron 39.2.1** - Desktop app framework
- **React 19.2.0** - UI with hooks
- **TypeScript 5.9.3** - Type safety

### Build
- **Vite 7.2.2** - Fast bundler with HMR
- **vite-plugin-electron** - Electron integration

### Libraries
- **polygon-clipping 0.15.7** - Boolean operations
- **simplify-js 1.2.4** - Path simplification (RDP algorithm)
- **nanoid 5.1.6** - Unique IDs

### External Tools
- **rat-king** - Rust CLI for fill patterns (~200x faster than JS)
  - Must be in PATH: `~/.cargo/bin/rat-king`

## Development Commands

```bash
# Development
npm run dev              # Start with HMR (http://localhost:5173)
npm run build            # Production build
npm run preview          # Preview production build

# Validation
npm run validate-svg     # SVG validation script

# Packaging
npm run package          # macOS (DMG + ZIP)
npm run package:win      # Windows (NSIS + portable)
npm run package:linux    # Linux (AppImage + deb)
npm run package:all      # All platforms
```

## Setup Requirements

```bash
# Node dependencies
npm install

# rat-king CLI (required for fill patterns)
cd ~/Code/rat-king/crates
cargo build --release
cp target/release/rat-king ~/.cargo/bin/
```

## Key Constants

From `src/constants.ts`:
```typescript
DPI = 96
MM_TO_PX = 3.78
OPTIMIZATION.CONNECT_THRESHOLD = 0.5
OPTIMIZATION.MAX_LINES_FOR_FULL = 5000
FILL_DEFAULTS.LINE_SPACING = 5
FILL_DEFAULTS.ANGLE = 45
```

## Entry Points

- **App entry:** `src/main.tsx` → `App.tsx`
- **Electron main:** `electron/main.ts`
- **IPC bridge:** `electron/preload.ts`
- **Fill generation:** `electron/fillGenerator.ts`
