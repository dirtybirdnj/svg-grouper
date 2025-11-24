#!/opt/homebrew/bin/python3
"""
SVG Cropping Script using vpype
Converts fills to strokes, crops, leaves as strokes
"""

import sys
import subprocess
import xml.etree.ElementTree as ET

def main():
    if len(sys.argv) < 5:
        print("Usage: crop_svg.py <x> <y> <width> <height>", file=sys.stderr)
        sys.exit(1)

    # Get crop bounds from arguments
    x = float(sys.argv[1])
    y = float(sys.argv[2])
    width = float(sys.argv[3])
    height = float(sys.argv[4])

    # Read SVG from stdin
    svg_input = sys.stdin.read()

    print(f"Python: Received SVG of size {len(svg_input)} bytes", file=sys.stderr)
    print(f"Python: Crop bounds: ({x}, {y}) to ({x + width}, {y + height})", file=sys.stderr)

    # Parse SVG
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    root = ET.fromstring(svg_input)

    # Get SVG dimensions
    svg_width = float(root.get('width', 0))
    svg_height = float(root.get('height', 0))
    print(f"Python: SVG dimensions: {svg_width} x {svg_height}", file=sys.stderr)

    # CRITICAL: Convert all fills to strokes so vpype can read them
    print(f"Python: Converting fills to 2px strokes...", file=sys.stderr)
    fill_count = 0

    for elem in root.iter():
        if elem.tag.endswith(('path', 'polygon', 'rect', 'circle', 'ellipse', 'line', 'polyline')):
            fill_attr = elem.get('fill', '')
            stroke_attr = elem.get('stroke', '')

            # If element has fill but no stroke (or stroke="none"), convert fill to stroke
            if fill_attr and fill_attr != 'none' and (not stroke_attr or stroke_attr == 'none'):
                elem.set('stroke', fill_attr)
                elem.set('stroke-width', '2')  # 2px stroke width
                elem.set('fill', 'none')
                fill_count += 1

    print(f"Python: Converted {fill_count} fills to strokes", file=sys.stderr)

    # Convert to string
    svg_with_strokes = ET.tostring(root, encoding='unicode')

    # Run vpype crop
    print(f"Python: Running vpype crop...", file=sys.stderr)
    vpype_cmd = [
        'vpype',
        'read', '-',
        'crop', str(x), str(y), str(x + width), str(y + height),
        'write', '--format', 'svg', '-'
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

    print(f"Python: Cropped SVG size: {len(result.stdout)} bytes", file=sys.stderr)
    print(result.stdout, end='')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"Python: ERROR - {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
