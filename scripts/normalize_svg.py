#!/opt/homebrew/bin/python3
"""
SVG Normalization Script
Transforms coordinates so viewBox starts at (0, 0).
This is essential for cropping to work correctly when the original SVG
has non-zero viewBox origin (common in GIS/GeoPDF exports).
"""

import sys
import re
import xml.etree.ElementTree as ET


def parse_viewbox(viewbox_str):
    """Parse viewBox attribute into components."""
    if not viewbox_str:
        return None
    parts = viewbox_str.strip().split()
    if len(parts) != 4:
        # Try comma-separated
        parts = viewbox_str.replace(',', ' ').split()
    if len(parts) != 4:
        return None
    try:
        return {
            'minX': float(parts[0]),
            'minY': float(parts[1]),
            'width': float(parts[2]),
            'height': float(parts[3])
        }
    except ValueError:
        return None


def transform_path_d(d, offset_x, offset_y):
    """Transform path d attribute by applying offset to coordinates."""
    if not d:
        return d

    result = []
    # Match commands and their parameters
    commands = re.findall(r'([MLHVCSQTAZ])([^MLHVCSQTAZ]*)', d, re.IGNORECASE)

    for cmd, params in commands:
        cmd_upper = cmd.upper()
        is_relative = cmd == cmd.lower() and cmd_upper != 'Z'

        # For relative commands (except first M), don't transform
        if is_relative and cmd_upper != 'M':
            result.append(cmd + params)
            continue

        params_str = params.strip()
        if not params_str or cmd_upper == 'Z':
            result.append(cmd + params)
            continue

        # Parse numbers (handles negative numbers, decimals, scientific notation)
        nums = re.findall(r'-?[\d.]+(?:e[+-]?\d+)?', params_str, re.IGNORECASE)
        nums = [float(n) for n in nums]

        transformed = []

        if cmd_upper in ('M', 'L', 'T'):  # x,y pairs
            for i in range(0, len(nums), 2):
                if i + 1 < len(nums):
                    transformed.extend([nums[i] + offset_x, nums[i+1] + offset_y])
        elif cmd_upper == 'H':  # x only
            transformed = [n + offset_x for n in nums]
        elif cmd_upper == 'V':  # y only
            transformed = [n + offset_y for n in nums]
        elif cmd_upper == 'C':  # x1,y1,x2,y2,x,y
            for i in range(0, len(nums), 6):
                if i + 5 < len(nums):
                    transformed.extend([
                        nums[i] + offset_x, nums[i+1] + offset_y,
                        nums[i+2] + offset_x, nums[i+3] + offset_y,
                        nums[i+4] + offset_x, nums[i+5] + offset_y
                    ])
        elif cmd_upper in ('S', 'Q'):  # x1,y1,x,y or x2,y2,x,y
            for i in range(0, len(nums), 4):
                if i + 3 < len(nums):
                    transformed.extend([
                        nums[i] + offset_x, nums[i+1] + offset_y,
                        nums[i+2] + offset_x, nums[i+3] + offset_y
                    ])
        elif cmd_upper == 'A':  # rx,ry,rotation,large-arc,sweep,x,y
            for i in range(0, len(nums), 7):
                if i + 6 < len(nums):
                    transformed.extend([
                        nums[i], nums[i+1], nums[i+2], nums[i+3], nums[i+4],
                        nums[i+5] + offset_x, nums[i+6] + offset_y
                    ])
        else:
            # Unknown command, keep as-is
            result.append(cmd + params)
            continue

        if transformed:
            result.append(cmd + ' '.join(f'{n:.6f}' for n in transformed))
        else:
            result.append(cmd + params)

    return ' '.join(result)


def transform_points(points_str, offset_x, offset_y):
    """Transform points attribute for polygon/polyline."""
    if not points_str:
        return points_str

    nums = re.findall(r'-?[\d.]+', points_str)
    nums = [float(n) for n in nums]

    transformed = []
    for i in range(0, len(nums), 2):
        if i + 1 < len(nums):
            transformed.append(f'{nums[i] + offset_x:.6f},{nums[i+1] + offset_y:.6f}')

    return ' '.join(transformed)


def normalize_element(elem, offset_x, offset_y, ns):
    """Recursively normalize coordinates in an element and its children."""
    tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

    # Transform path elements
    if tag == 'path':
        d = elem.get('d')
        if d:
            elem.set('d', transform_path_d(d, offset_x, offset_y))

    # Transform polygon/polyline
    elif tag in ('polygon', 'polyline'):
        points = elem.get('points')
        if points:
            elem.set('points', transform_points(points, offset_x, offset_y))

    # Transform rect
    elif tag == 'rect':
        x = float(elem.get('x', '0'))
        y = float(elem.get('y', '0'))
        elem.set('x', str(x + offset_x))
        elem.set('y', str(y + offset_y))

    # Transform circle
    elif tag == 'circle':
        cx = float(elem.get('cx', '0'))
        cy = float(elem.get('cy', '0'))
        elem.set('cx', str(cx + offset_x))
        elem.set('cy', str(cy + offset_y))

    # Transform ellipse
    elif tag == 'ellipse':
        cx = float(elem.get('cx', '0'))
        cy = float(elem.get('cy', '0'))
        elem.set('cx', str(cx + offset_x))
        elem.set('cy', str(cy + offset_y))

    # Transform line
    elif tag == 'line':
        x1 = float(elem.get('x1', '0'))
        y1 = float(elem.get('y1', '0'))
        x2 = float(elem.get('x2', '0'))
        y2 = float(elem.get('y2', '0'))
        elem.set('x1', str(x1 + offset_x))
        elem.set('y1', str(y1 + offset_y))
        elem.set('x2', str(x2 + offset_x))
        elem.set('y2', str(y2 + offset_y))

    # Transform use elements (xlink:href position)
    elif tag == 'use':
        x = elem.get('x')
        y = elem.get('y')
        if x:
            elem.set('x', str(float(x) + offset_x))
        if y:
            elem.set('y', str(float(y) + offset_y))

    # Transform text
    elif tag == 'text':
        x = elem.get('x')
        y = elem.get('y')
        if x:
            elem.set('x', str(float(x) + offset_x))
        if y:
            elem.set('y', str(float(y) + offset_y))

    # Recurse into children
    for child in elem:
        normalize_element(child, offset_x, offset_y, ns)


def main():
    # Read SVG from stdin
    svg_input = sys.stdin.read()

    print(f"[normalize_svg] Input size: {len(svg_input)} bytes", file=sys.stderr)

    # Register namespaces
    namespaces = {
        '': 'http://www.w3.org/2000/svg',
        'xlink': 'http://www.w3.org/1999/xlink',
        'sodipodi': 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
        'inkscape': 'http://www.inkscape.org/namespaces/inkscape'
    }
    for prefix, uri in namespaces.items():
        if prefix:
            ET.register_namespace(prefix, uri)
        else:
            ET.register_namespace('', uri)

    # Parse SVG
    root = ET.fromstring(svg_input)

    # Get viewBox
    viewbox_str = root.get('viewBox')
    viewbox = parse_viewbox(viewbox_str)

    if not viewbox:
        print(f"[normalize_svg] No valid viewBox found, outputting unchanged", file=sys.stderr)
        print(svg_input, end='')
        return

    print(f"[normalize_svg] Original viewBox: {viewbox_str}", file=sys.stderr)

    # Check if normalization is needed
    if viewbox['minX'] == 0 and viewbox['minY'] == 0:
        print(f"[normalize_svg] ViewBox already at origin, outputting unchanged", file=sys.stderr)
        print(svg_input, end='')
        return

    # Calculate offset (negative of viewBox origin)
    offset_x = -viewbox['minX']
    offset_y = -viewbox['minY']

    print(f"[normalize_svg] Applying offset: ({offset_x}, {offset_y})", file=sys.stderr)

    # Count elements
    path_count = len(root.findall('.//{http://www.w3.org/2000/svg}path'))
    print(f"[normalize_svg] Processing {path_count} paths", file=sys.stderr)

    # Transform all elements
    normalize_element(root, offset_x, offset_y, namespaces)

    # Update viewBox to start at (0, 0)
    new_viewbox = f"0 0 {viewbox['width']} {viewbox['height']}"
    root.set('viewBox', new_viewbox)

    # Get original width/height for debug
    orig_width = root.get('width', 'not set')
    orig_height = root.get('height', 'not set')
    print(f"[normalize_svg] Original width attr: {orig_width}", file=sys.stderr)
    print(f"[normalize_svg] Original height attr: {orig_height}", file=sys.stderr)

    # Set width/height to match viewBox dimensions (unitless = pixels)
    new_width = str(viewbox['width'])
    new_height = str(viewbox['height'])
    print(f"[normalize_svg] Setting width to: {new_width}", file=sys.stderr)
    print(f"[normalize_svg] Setting height to: {new_height}", file=sys.stderr)

    root.set('width', new_width)
    root.set('height', new_height)

    print(f"[normalize_svg] New viewBox: {new_viewbox}", file=sys.stderr)

    # Verify attributes were set correctly
    final_width = root.get('width')
    final_height = root.get('height')
    final_viewbox = root.get('viewBox')
    print(f"[normalize_svg] Final check - width: {final_width}, height: {final_height}, viewBox: {final_viewbox}", file=sys.stderr)

    # Output normalized SVG
    output = '<?xml version="1.0" encoding="utf-8"?>\n'
    output += ET.tostring(root, encoding='unicode')

    print(f"[normalize_svg] Output size: {len(output)} bytes", file=sys.stderr)
    print(output, end='')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"[normalize_svg] ERROR: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
