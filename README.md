# SVG Grouper

A desktop application for preparing SVG files for pen plotters like the AxiDraw. Manage layers, convert fills to stroke patterns, optimize drawing paths, and export production-ready files.

## Features

### Layer Management
- **Drag & drop** SVG import
- **Layer tree** with visibility toggles and color previews
- **Group/ungroup** elements by color
- **Flatten** to reorganize complex layer structures

### Fill Pattern Hatching
Convert solid fills to plotter-friendly stroke patterns:
- **Lines** - Parallel hatching with adjustable angle and spacing
- **Cross-hatch** - Dual-direction line patterns
- **Wiggle** - Wavy parallel lines
- **Concentric** - Spiral inward from edges
- **Honeycomb** - Hexagonal grid pattern
- **Spiral** - Archimedean spiral from center
- **Gyroid** - Organic minimal surface pattern

All patterns properly handle **paths with holes** (like the letter 'O').

### Path Optimization
- **TSP-based** path ordering to minimize pen travel
- **Multi-pass optimization** across multiple shapes
- **Visual preview** with drawing order gradient

### Export Tools
- **Page setup** with paper sizes (Letter, A4, custom)
- **Margin controls** for print positioning
- **Playback simulation** to preview pen plotter drawing
- **Crop tool** with aspect ratio presets

## Installation

```bash
# Clone the repository
git clone https://github.com/dirtybirdnj/svg-grouper.git
cd svg-grouper

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package as desktop app
npm run package        # macOS
npm run package:win    # Windows
npm run package:linux  # Linux
```

## Tech Stack

- **Electron** - Cross-platform desktop app
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast builds and HMR
- **rat-king** - Rust-based fill pattern engine (~200x faster than JS)

### rat-king Integration

All fill pattern generation is powered by [rat-king](https://github.com/dirtybirdnj/rat-king), a Rust CLI tool. This provides:
- 17+ fill patterns (lines, crosshatch, spiral, honeycomb, hilbert, etc.)
- Proper hole detection for compound paths (letters, donuts)
- Line chaining optimization for efficient plotter output
- ~200x performance improvement over JavaScript implementation

To install rat-king:
```bash
cd ~/Code/rat-king/crates
cargo build --release
cp target/release/rat-king ~/.cargo/bin/
```

## Usage

1. **Import** - Drag an SVG file onto the app or use File > Open
2. **Organize** - Reorder layers, adjust visibility, group by color
3. **Fill** - Select layers with fills and convert to stroke patterns
4. **Optimize** - Order paths to minimize pen travel
5. **Export** - Set page size and margins, preview, then export

## License

GPL-3.0 - This software is free and open source. Any derivative works must also be open source.

## Contributing

Issues and pull requests welcome! This is a passion project built for the pen plotter community.

## Credits

Built by Mat Gilbert with assistance from Claude (Anthropic).

---

*Made with love for the pen plotter community*
