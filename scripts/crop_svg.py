#!/opt/homebrew/bin/python3
"""
SVG Cropping Script using vpype
Optimized for pen plotter workflows with line-based content.

For best results with filled shapes, convert them to line fill patterns
before cropping using the Fill feature in SVG Grouper.
"""

import sys
import subprocess
import xml.etree.ElementTree as ET

def main():
    if len(sys.argv) < 5:
        print("Usage: crop_svg.py <x> <y> <width> <height>", file=sys.stderr)
        sys.exit(1)

    # Get crop bounds from arguments (x, y is top-left corner)
    x = float(sys.argv[1])
    y = float(sys.argv[2])
    width = float(sys.argv[3])
    height = float(sys.argv[4])

    # Read SVG from stdin
    svg_input = sys.stdin.read()

    print(f"Python: Received SVG of size {len(svg_input)} bytes", file=sys.stderr)
    print(f"Python: Crop region: x={x}, y={y}, width={width}, height={height}", file=sys.stderr)

    # Parse SVG to check for fills and get dimensions
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    root = ET.fromstring(svg_input)

    # Get SVG dimensions
    svg_width_str = root.get('width', '0')
    svg_height_str = root.get('height', '0')

    # Parse dimensions (handle units)
    def parse_dimension(val):
        val = str(val).strip()
        if val.endswith('px'):
            return float(val[:-2])
        elif val.endswith('pt'):
            return float(val[:-2]) * 1.333333
        elif val.endswith('in'):
            return float(val[:-2]) * 96
        elif val.endswith('mm'):
            return float(val[:-2]) * 3.7795275591
        elif val.endswith('cm'):
            return float(val[:-2]) * 37.795275591
        else:
            try:
                return float(val)
            except:
                return 0

    svg_width = parse_dimension(svg_width_str)
    svg_height = parse_dimension(svg_height_str)
    print(f"Python: SVG dimensions: {svg_width} x {svg_height}", file=sys.stderr)

    # Count different element types and convert fills
    stroke_count = 0
    fill_count = 0
    line_count = 0

    for elem in root.iter():
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

        if tag in ('path', 'polygon', 'rect', 'circle', 'ellipse', 'polyline'):
            fill_attr = elem.get('fill', '')
            stroke_attr = elem.get('stroke', '')
            style = elem.get('style', '')

            has_fill = False
            has_stroke = False

            if 'fill:' in style:
                fill_match = style.split('fill:')[1].split(';')[0].strip()
                has_fill = fill_match and fill_match != 'none'
            elif fill_attr and fill_attr != 'none':
                has_fill = True

            if 'stroke:' in style:
                stroke_match = style.split('stroke:')[1].split(';')[0].strip()
                has_stroke = stroke_match and stroke_match != 'none'
            elif stroke_attr and stroke_attr != 'none':
                has_stroke = True

            if has_fill and not has_stroke:
                fill_count += 1
                # Convert fill to stroke for vpype compatibility
                color = fill_attr if fill_attr and fill_attr != 'none' else '#000000'
                if 'fill:' in style:
                    color = style.split('fill:')[1].split(';')[0].strip()
                elem.set('stroke', color)
                elem.set('stroke-width', '1')
                elem.set('fill', 'none')
                if style:
                    new_style = ';'.join(
                        part for part in style.split(';')
                        if not part.strip().startswith('fill:')
                    )
                    elem.set('style', new_style)
            elif has_stroke:
                stroke_count += 1

        elif tag == 'line':
            line_count += 1

    print(f"Python: Found {line_count} lines, {stroke_count} stroked paths, {fill_count} filled shapes", file=sys.stderr)

    if fill_count > 0:
        print(f"Python: WARNING - {fill_count} filled shapes converted to strokes", file=sys.stderr)

    # Convert to string
    svg_with_strokes = ET.tostring(root, encoding='unicode')

    # Build vpype command:
    # 1. read with --attr stroke --attr stroke-width to preserve colors by layer
    # 2. crop to the specified region
    # 3. translate to move crop region to origin (0,0)
    # 4. write with --restore-attribs to preserve stroke attributes

    # Note: vpype crop uses x y width height format where x,y is top-left
    vpype_cmd = [
        'vpype',
        'read', '--attr', 'stroke', '--attr', 'stroke-width', '-',
        'crop', f'{x}', f'{y}', f'{width}', f'{height}',
        'translate', '--', f'{-x}', f'{-y}',  # Move to origin
        'write', '--page-size', f'{width}x{height}', '--restore-attribs', '--format', 'svg', '-'
    ]

    print(f"Python: Command: {' '.join(vpype_cmd)}", file=sys.stderr)

    result = subprocess.run(
        vpype_cmd,
        input=svg_with_strokes,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Python: ERROR - vpype failed:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    output_svg = result.stdout
    print(f"Python: Cropped SVG size: {len(output_svg)} bytes", file=sys.stderr)

    # Ensure proper XML declaration and dimensions
    try:
        out_root = ET.fromstring(output_svg)
        # Make sure width/height are set correctly
        out_root.set('width', f'{width}')
        out_root.set('height', f'{height}')
        out_root.set('viewBox', f'0 0 {width} {height}')
        output_svg = '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(out_root, encoding='unicode')
    except Exception as e:
        print(f"Python: Warning - could not update output dimensions: {e}", file=sys.stderr)

    print(output_svg, end='')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"Python: ERROR - {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
