# UI Enhancement Suggestions

This document captures suggestions for making SVG Grouper look more like a professional graphics tool (Adobe Illustrator, Figma, Affinity Designer) rather than a web application.

## 1. Dark Theme / Neutral Background

**Current:** `#f5f5f5` background, white sidebars - feels "web-appy"

**Suggested:**
- Darker canvas backgrounds: `#2d2d2d` or `#1e1e1e`
- Neutral gray sidebars: `#252525` - `#333333`
- High contrast for content: White/light gray text on dark
- Consider offering both light and dark themes

## 2. Minimize Chrome, Maximize Canvas

**Current measurements:**
- Header: 50px
- Tab navigation: 2px thick border + padding
- Status bar: ~40px
- Sidebar headers: 1rem padding

**Suggested:**
- Header: reduce to 36-40px
- Tab navigation: tighter, 1px border
- Status bar: ~24px
- Sidebar headers: 8-10px padding

## 3. Consistent Icon System

**Current:** Using emoji icons (📂, ✨, etc.)

**Suggested:**
- Monochrome SVG icon system (Lucide, Feather, or custom)
- Consistent 16-20px sizing
- Subtle gray default (`#888`), accent color on hover/active
- Icon libraries to consider:
  - [Lucide](https://lucide.dev/) - MIT license, React components
  - [Feather](https://feathericons.com/) - MIT license
  - [Phosphor](https://phosphoricons.com/) - MIT license

## 4. Button Styling

**Current issues:**
- Various border-radius values (3px, 4px, 8px)
- Inconsistent padding
- Mixed color schemes (blue, green, purple)
- Web-appy hover effects (`scale(0.95)`)

**Suggested:**
- One border-radius: 4px or 2px (square = more professional)
- Unified button heights: 24px for toolbar, 28px for actions
- Muted colors: grayscale with accent on hover, not colorful primaries
- Remove `transform: scale(0.95)` on active - feels web-appy
- Remove `filter: brightness(1.1)` hover effects

## 5. Typography Hierarchy

**Current:** Headers at 1.1rem, various font sizes

**Suggested:**
- Reduce font sizes overall
- UI text: 11-13px
- Headers: 13-14px, weight 600
- Monospace for numerical values only
- Tighter line-height (1.2-1.3)

## 6. Sidebar Design

**Current:** White backgrounds with light borders

**Suggested:**
- Flat design without visible panel borders
- Section dividers as thin 1px lines or just whitespace
- Collapsible sections with subtle chevrons
- Tighter vertical spacing (4-6px between controls)
- No background color differentiation between header and content

## 7. Toolbar Consistency

**Current:** Function buttons with different colors per action

**Suggested:**
- All toolbar buttons neutral gray by default
- Color only for primary action or selected state
- Icon-only buttons with tooltips preferred over text buttons
- Consistent 24x24 or 28x28 button sizing
- 4px gap between buttons, 8px between button groups

## 8. Canvas Area

**Current:** Light gray background (`#f9f9f9`)

**Suggested:**
- Subtle checkerboard pattern for transparency indication
- Rulers on top/left edges (optional but professional)
- Darker artboard background (`#1a1a1a` or `#2d2d2d`)
- Visible canvas bounds with subtle drop shadow
- Grid overlay option

## 9. Layer Tree

**Current:** Default row heights and styling

**Suggested:**
- Tighter row height (24-28px)
- Subtle hover background (`rgba(255,255,255,0.05)` in dark mode)
- Smaller expand/collapse triangles (10px)
- Thumbnail previews if possible
- Drag handle indicator on hover

## 10. Remove Web-isms

Specific CSS changes to make:

```css
/* REMOVE these web-appy effects */
.function-button:active {
  transform: scale(0.95); /* Remove */
}

.function-button:hover {
  filter: brightness(1.1); /* Remove */
}

/* CHANGE rounded corners */
border-radius: 8px; /* Too rounded, change to 2-4px */

/* CHANGE saturated accent colors */
#4a90e2 /* Too web-appy */
/* Use instead: #0078d4 or #3b82f6 or #6b7280 */
```

## Color Palette Suggestion

### Dark Theme
```css
--bg-primary: #1e1e1e;
--bg-secondary: #252525;
--bg-tertiary: #2d2d2d;
--bg-hover: #3a3a3a;
--border: #404040;
--text-primary: #e0e0e0;
--text-secondary: #a0a0a0;
--text-muted: #666666;
--accent: #0078d4;
--accent-hover: #1a8ae6;
--success: #2ea043;
--warning: #d29922;
--error: #cf6679;
```

### Light Theme (refined)
```css
--bg-primary: #f5f5f5;
--bg-secondary: #ffffff;
--bg-tertiary: #fafafa;
--bg-hover: #e8e8e8;
--border: #d0d0d0;
--text-primary: #1a1a1a;
--text-secondary: #555555;
--text-muted: #888888;
--accent: #0066cc;
--accent-hover: #0055aa;
```

## Priority Implementation Order

1. **Dark theme** - biggest visual impact, modernizes the app instantly
2. **Tighter spacing** - 30% reduction in padding/margins throughout
3. **Unified button styling** - neutral gray system with consistent sizing
4. **Replace emoji icons** - switch to Lucide or similar SVG icon set
5. **Canvas styling** - dark background, optional checkerboard pattern

## Reference Applications

Study these for inspiration:
- **Figma** - Modern, clean, excellent dark mode
- **Affinity Designer** - Professional vector tool UI
- **Adobe Illustrator** - Industry standard (heavier chrome)
- **Sketch** - Clean Mac-native feel
- **Inkscape** - Open source vector editor

## Notes

- Consider using CSS custom properties (variables) for easy theme switching
- Test all changes at various window sizes
- Maintain accessibility contrast ratios (WCAG AA minimum)
- Keep keyboard navigation working throughout changes
