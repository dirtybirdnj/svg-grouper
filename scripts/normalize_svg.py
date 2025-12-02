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


def analyze_svg_structure(root, ns):
    """Analyze and report SVG structure for debugging."""
    element_counts = {}
    group_depths = []

    def count_elements(elem, depth=0):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        element_counts[tag] = element_counts.get(tag, 0) + 1

        if tag == 'g':
            group_depths.append(depth)
            fill = elem.get('fill')
            stroke = elem.get('stroke')
            elem_id = elem.get('id', 'no-id')
            child_count = len(list(elem))
            if depth < 2:
                print(f"[normalize_svg] Group '{elem_id}' depth={depth}: {child_count} children, fill={fill}, stroke={stroke}", file=sys.stderr)

        for child in elem:
            count_elements(child, depth + 1)

    for child in root:
        count_elements(child)

    print(f"[normalize_svg] Element counts: {element_counts}", file=sys.stderr)
    if group_depths:
        print(f"[normalize_svg] Max group depth: {max(group_depths)}, total groups: {len(group_depths)}", file=sys.stderr)


LEAF_TAGS = {'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use'}


def parse_css_styles(root, ns):
    """
    Parse <style> blocks and build a mapping of class/id -> styles.
    Returns dict like {'class-name': {'fill': '#ff0000', 'stroke': '#000'}, ...}
    """
    style_map = {}
    svg_ns = 'http://www.w3.org/2000/svg'

    # Find all <style> elements
    for style_elem in root.iter():
        tag = style_elem.tag.split('}')[-1] if '}' in style_elem.tag else style_elem.tag
        if tag == 'style' and style_elem.text:
            css_text = style_elem.text

            # Simple CSS parser for class rules: .classname { property: value; }
            # Matches patterns like: .water { fill: #d9e9ff; stroke: none; }
            import re
            rules = re.findall(r'\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}', css_text)

            for class_name, properties in rules:
                props = {}
                # Parse properties
                for prop in properties.split(';'):
                    prop = prop.strip()
                    if ':' in prop:
                        key, value = prop.split(':', 1)
                        key = key.strip().lower()
                        value = value.strip()
                        if key in ('fill', 'stroke', 'stroke-width', 'opacity'):
                            props[key] = value

                if props:
                    style_map[class_name] = props

    return style_map


def get_color_from_css(elem, style_map):
    """Get fill/stroke from CSS class if element has class attribute."""
    class_attr = elem.get('class')
    if not class_attr:
        return None, None

    # Element can have multiple classes
    classes = class_attr.split()
    fill = None
    stroke = None

    for cls in classes:
        if cls in style_map:
            styles = style_map[cls]
            if 'fill' in styles and styles['fill'] != 'none':
                fill = styles['fill']
            if 'stroke' in styles and styles['stroke'] != 'none':
                stroke = styles['stroke']

    return fill, stroke


def flatten_groups(root, ns, style_map=None):
    """
    Flatten all groups by extracting leaf elements and applying inherited styles.
    Removes all <g> elements, keeping only drawable elements.
    """
    if style_map is None:
        style_map = {}

    svg_ns = 'http://www.w3.org/2000/svg'
    leaf_elements = []

    def get_effective_color(elem, attr_name, inherited_value):
        """Get effective color considering CSS classes, attributes, and inheritance."""
        # First check CSS class
        css_fill, css_stroke = get_color_from_css(elem, style_map)
        css_value = css_fill if attr_name == 'fill' else css_stroke

        # Get attribute value
        attr_value = elem.get(attr_name)

        # Priority: CSS class > attribute (if not 'none') > inherited
        if css_value:
            return css_value
        if attr_value and attr_value != 'none':
            return attr_value
        if inherited_value and inherited_value != 'none':
            return inherited_value
        return None

    def extract_leaves(elem, inherited_fill=None, inherited_stroke=None, inherited_transform=None):
        """Recursively extract leaf elements, inheriting styles from parent groups."""
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

        # Get this element's effective styles (considering CSS, attrs, inheritance)
        fill = get_effective_color(elem, 'fill', inherited_fill)
        stroke = get_effective_color(elem, 'stroke', inherited_stroke)
        transform = elem.get('transform')

        # Compose transforms
        if inherited_transform and transform:
            composed_transform = f"{inherited_transform} {transform}"
        else:
            composed_transform = inherited_transform or transform

        if tag == 'g':
            # Recurse into group children
            for child in list(elem):
                extract_leaves(child, fill, stroke, composed_transform)
        elif tag in LEAF_TAGS:
            # Apply composed transform
            if composed_transform:
                elem.set('transform', composed_transform)

            # Apply effective colors (overwrite 'none' values)
            if fill:
                elem.set('fill', fill)
            if stroke:
                elem.set('stroke', stroke)

            # Remove class attribute since we've resolved the styles
            if elem.get('class'):
                del elem.attrib['class']

            leaf_elements.append(elem)

    # Extract all leaves from root children
    for child in list(root):
        extract_leaves(child)
        root.remove(child)

    # Add all leaf elements directly to root
    for leaf in leaf_elements:
        root.append(leaf)

    print(f"[normalize_svg] Flattened to {len(leaf_elements)} leaf elements", file=sys.stderr)

    # Debug: count colors
    color_counts = {}
    for elem in leaf_elements[:1000]:
        color = elem.get('fill') or elem.get('stroke') or 'no-color'
        color_counts[color] = color_counts.get(color, 0) + 1
    print(f"[normalize_svg] Color distribution (first 1000): {color_counts}", file=sys.stderr)

    return len(leaf_elements)


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

    # Parse CSS styles from <style> blocks
    style_map = parse_css_styles(root, namespaces)
    if style_map:
        print(f"[normalize_svg] Found {len(style_map)} CSS class rules", file=sys.stderr)
        for cls, styles in list(style_map.items())[:10]:  # Show first 10
            print(f"[normalize_svg]   .{cls}: {styles}", file=sys.stderr)
        if len(style_map) > 10:
            print(f"[normalize_svg]   ... and {len(style_map) - 10} more", file=sys.stderr)
    else:
        print(f"[normalize_svg] No CSS class rules found", file=sys.stderr)

    # Analyze structure for debugging
    print(f"[normalize_svg] === SVG Structure Analysis ===", file=sys.stderr)
    analyze_svg_structure(root, namespaces)
    print(f"[normalize_svg] === End Structure Analysis ===", file=sys.stderr)

    # Get viewBox
    viewbox_str = root.get('viewBox')
    viewbox = parse_viewbox(viewbox_str)

    if not viewbox:
        print(f"[normalize_svg] No valid viewBox found, outputting unchanged", file=sys.stderr)
        print(svg_input, end='')
        return

    print(f"[normalize_svg] Original viewBox: {viewbox_str}", file=sys.stderr)

    # Check if coordinate normalization is needed
    needs_coord_normalization = viewbox['minX'] != 0 or viewbox['minY'] != 0

    if needs_coord_normalization:
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
        print(f"[normalize_svg] New viewBox: {new_viewbox}", file=sys.stderr)
    else:
        print(f"[normalize_svg] ViewBox already at origin, skipping coordinate normalization", file=sys.stderr)

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

    # Flatten all groups - extract leaf elements and apply inherited styles
    print(f"[normalize_svg] Flattening groups...", file=sys.stderr)
    leaf_count = flatten_groups(root, namespaces, style_map)
    print(f"[normalize_svg] Flattening complete: {leaf_count} elements", file=sys.stderr)

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
