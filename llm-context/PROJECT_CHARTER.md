# SVG Grouper Project Charter

## Core Mission

SVG Grouper is a tool for **preparing vector artwork for pen plotter output**. The primary workflow is:

1. Import complex SVGs (often from image-to-SVG conversion tools)
2. Clean up, organize, and optimize the vector data
3. Export clean SVGs optimized for pen plotter hardware

**The end goal is always pen plotter output.** Every feature should be evaluated through this lens.

## Target Users

- Artists and makers who use pen plotters (AxiDraw, HP plotters, etc.)
- Users who convert raster images to SVGs and need to clean up the results
- Anyone preparing vector files for physical drawing machines

## What Matters

### Simplicity Over Complexity
- Coordinates should start at (0, 0) when possible
- ViewBox metadata is tolerated but not valued - it's composition metadata, not vector data
- Prefer explicit width/height attributes over implicit sizing
- Flatten unnecessary nesting

### Vector Integrity
- Preserve stroke paths exactly - these become plotter movements
- Fill shapes can be converted to hatch patterns for plotting
- Path order matters for plotter efficiency (minimize travel moves)
- Closed vs open paths have different meanings

### Practical Output
- Output files should work directly with plotter software
- Common targets: Inkscape (for vpype), AxiDraw software, custom scripts
- Dimensions should be in real-world units (inches, mm) at standard DPI (96)

## What Doesn't Matter

### Design Metadata
- Original artboard/canvas size from design tools
- Layer names from Illustrator/Figma/etc.
- Non-zero viewBox origins (artifact of composition, not useful)
- Embedded fonts (we work with paths only)

### Visual Fidelity
- We're not rendering for screens
- Color is used for organizing/sorting, not final output
- Gradients, filters, effects are irrelevant

### Backwards Compatibility
- The app is for personal/maker use, not enterprise
- Breaking changes are acceptable if they improve the workflow
- Simple is better than featureful

## Decision Framework

When making implementation choices, ask:

1. **Does this help get clean vectors to the plotter?**
   - If yes, do it
   - If no, question whether it's needed

2. **Does this add complexity users need to understand?**
   - If yes, is it worth the cognitive load?
   - If no, proceed

3. **What's the simplest solution that works?**
   - Start there, only add complexity if genuinely needed

## Core Features

### Import
- Handle SVGs from any source (Illustrator, Inkscape, online converters)
- Normalize coordinates to (0, 0) origin
- Convert units to pixels at 96 DPI
- Parse and flatten nested groups

### Organization (SortTab)
- Flatten all groups to single level
- Group paths by color (for multi-pen plotting)
- Sort by size (for ordering drawing sequence)
- Delete unwanted elements
- Merge/weld paths

### Fill Generation (FillTab)
- Convert filled regions to hatch patterns
- Control line density and angle
- Multiple pattern types for artistic effects

### Path Ordering (OrderTab)
- Optimize path sequence to minimize plotter travel
- TSP-style optimization for efficiency

### Export
- Clean SVG output
- Multiple format options for different plotter software
- Size/dimension controls

## Technical Principles

### SVG Handling
- Treat SVG as a data format, not a visual format
- Paths are the primary data structure
- Everything else (groups, transforms, styling) is organizational
- Normalize early in the pipeline

### Coordinate Systems
- All internal operations use normalized coordinates
- Origin at (0, 0), no negative coordinates preferred
- Width/height match viewBox when present
- Transforms should be baked into path coordinates

### Performance
- Handle large files (100k+ paths) without freezing
- Progressive parsing with progress feedback
- Background processing for heavy operations

## Anti-Patterns to Avoid

1. **Over-engineering for hypothetical use cases**
   - Build what's needed now, not what might be needed

2. **Preserving metadata "just in case"**
   - If it's not useful for plotting, it's noise

3. **Complex configuration options**
   - Good defaults beat configurable complexity

4. **Fighting the SVG spec**
   - Accept what SVG is, transform it to what we need

5. **Visual-first thinking**
   - We're preparing machine instructions, not artwork for screens
