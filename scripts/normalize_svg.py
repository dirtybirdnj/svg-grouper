#!/opt/homebrew/bin/python3
"""
SVG Normalization Script
- Transforms coordinates so viewBox starts at (0, 0)
- Flattens all groups, extracting leaf elements
- BAKES all transforms into coordinates (removes transform attributes)
- Adjusts stroke-width when transforms include scaling

This is essential for fill pattern generation to align with stroke outlines.
"""

import sys
import re
import math
import xml.etree.ElementTree as ET


# =============================================================================
# MATRIX MATH
# =============================================================================

def identity_matrix():
    """Return identity matrix [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0]"""
    return [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]


def multiply_matrices(m1, m2):
    """
    Multiply two transformation matrices.
    Matrix format: [a, b, c, d, e, f] representing:
    | a  c  e |
    | b  d  f |
    | 0  0  1 |

    Result = m1 × m2 (m2 applied first, then m1)
    """
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2

    return [
        a1*a2 + c1*b2,           # a
        b1*a2 + d1*b2,           # b
        a1*c2 + c1*d2,           # c
        b1*c2 + d1*d2,           # d
        a1*e2 + c1*f2 + e1,      # e
        b1*e2 + d1*f2 + f1       # f
    ]


def transform_point(x, y, matrix):
    """Transform a point (x, y) by the matrix."""
    a, b, c, d, e, f = matrix
    return (
        a*x + c*y + e,
        b*x + d*y + f
    )


def get_matrix_scale(matrix):
    """
    Extract approximate scale factors from a matrix.
    Returns (scale_x, scale_y) - useful for adjusting stroke-width.
    """
    a, b, c, d, e, f = matrix
    scale_x = math.sqrt(a*a + b*b)
    scale_y = math.sqrt(c*c + d*d)
    return scale_x, scale_y


# =============================================================================
# TRANSFORM PARSING
# =============================================================================

def parse_transform_string(transform_str):
    """
    Parse an SVG transform attribute string into a single composed matrix.
    Handles: translate, scale, rotate, skewX, skewY, matrix

    Returns [a, b, c, d, e, f] matrix.
    """
    if not transform_str:
        return identity_matrix()

    result = identity_matrix()

    # Match transform functions: name(params)
    pattern = r'(translate|scale|rotate|skewX|skewY|matrix)\s*\(([^)]+)\)'
    matches = re.findall(pattern, transform_str, re.IGNORECASE)

    for func_name, params_str in matches:
        # Parse numeric parameters
        nums = re.findall(r'-?[\d.]+(?:e[+-]?\d+)?', params_str, re.IGNORECASE)
        nums = [float(n) for n in nums]

        func_name = func_name.lower()

        if func_name == 'translate':
            tx = nums[0] if len(nums) > 0 else 0
            ty = nums[1] if len(nums) > 1 else 0
            m = [1, 0, 0, 1, tx, ty]

        elif func_name == 'scale':
            sx = nums[0] if len(nums) > 0 else 1
            sy = nums[1] if len(nums) > 1 else sx
            m = [sx, 0, 0, sy, 0, 0]

        elif func_name == 'rotate':
            angle_deg = nums[0] if len(nums) > 0 else 0
            angle_rad = math.radians(angle_deg)
            cos_a = math.cos(angle_rad)
            sin_a = math.sin(angle_rad)

            if len(nums) >= 3:
                # rotate(angle, cx, cy) - rotation around a point
                cx, cy = nums[1], nums[2]
                # Equivalent to: translate(cx, cy) rotate(angle) translate(-cx, -cy)
                m = [cos_a, sin_a, -sin_a, cos_a,
                     cx - cos_a*cx + sin_a*cy,
                     cy - sin_a*cx - cos_a*cy]
            else:
                # rotate(angle) - rotation around origin
                m = [cos_a, sin_a, -sin_a, cos_a, 0, 0]

        elif func_name == 'skewx':
            angle_deg = nums[0] if len(nums) > 0 else 0
            angle_rad = math.radians(angle_deg)
            m = [1, 0, math.tan(angle_rad), 1, 0, 0]

        elif func_name == 'skewy':
            angle_deg = nums[0] if len(nums) > 0 else 0
            angle_rad = math.radians(angle_deg)
            m = [1, math.tan(angle_rad), 0, 1, 0, 0]

        elif func_name == 'matrix':
            if len(nums) >= 6:
                m = nums[:6]
            else:
                m = identity_matrix()

        else:
            continue

        # Compose: result = result × m (apply m after previous transforms)
        result = multiply_matrices(result, m)

    return result


# =============================================================================
# COORDINATE TRANSFORMATION
# =============================================================================

def transform_path_d(d, matrix):
    """
    Transform path d attribute by applying matrix to all coordinates.
    Handles absolute and relative commands correctly.
    """
    if not d:
        return d

    a, b, c, d_m, e, f = matrix

    result = []
    # Match commands and their parameters
    commands = re.findall(r'([MLHVCSQTAZ])([^MLHVCSQTAZ]*)', d, re.IGNORECASE)

    # Track current point for relative commands
    current_x, current_y = 0.0, 0.0

    for cmd, params in commands:
        cmd_upper = cmd.upper()
        is_relative = cmd.islower() and cmd_upper != 'Z'

        params_str = params.strip()
        if not params_str or cmd_upper == 'Z':
            result.append(cmd_upper if not is_relative else cmd)
            if cmd_upper == 'Z':
                # Z doesn't change current point tracking for our purposes
                pass
            continue

        # Parse numbers
        nums = re.findall(r'-?[\d.]+(?:e[+-]?\d+)?', params_str, re.IGNORECASE)
        nums = [float(n) for n in nums]

        transformed = []

        if cmd_upper in ('M', 'L', 'T'):
            # x,y pairs
            for i in range(0, len(nums) - 1, 2):
                x, y = nums[i], nums[i+1]
                if is_relative:
                    x += current_x
                    y += current_y

                new_x, new_y = transform_point(x, y, matrix)
                transformed.extend([new_x, new_y])
                current_x, current_y = x, y

            # After transform, all commands become absolute
            result.append(cmd_upper + ' '.join(f'{n:.6f}' for n in transformed))

        elif cmd_upper == 'H':
            # Horizontal line - x only, but we need to transform as point
            for x in nums:
                if is_relative:
                    x += current_x
                y = current_y
                new_x, new_y = transform_point(x, y, matrix)
                # H becomes L after non-trivial transform (rotation/skew makes it diagonal)
                transformed.extend([new_x, new_y])
                current_x = x

            result.append('L' + ' '.join(f'{n:.6f}' for n in transformed))

        elif cmd_upper == 'V':
            # Vertical line - y only
            for y in nums:
                if is_relative:
                    y += current_y
                x = current_x
                new_x, new_y = transform_point(x, y, matrix)
                transformed.extend([new_x, new_y])
                current_y = y

            result.append('L' + ' '.join(f'{n:.6f}' for n in transformed))

        elif cmd_upper == 'C':
            # Cubic bezier: x1,y1,x2,y2,x,y
            for i in range(0, len(nums) - 5, 6):
                x1, y1 = nums[i], nums[i+1]
                x2, y2 = nums[i+2], nums[i+3]
                x, y = nums[i+4], nums[i+5]

                if is_relative:
                    x1 += current_x; y1 += current_y
                    x2 += current_x; y2 += current_y
                    x += current_x; y += current_y

                nx1, ny1 = transform_point(x1, y1, matrix)
                nx2, ny2 = transform_point(x2, y2, matrix)
                nx, ny = transform_point(x, y, matrix)
                transformed.extend([nx1, ny1, nx2, ny2, nx, ny])
                current_x, current_y = x, y

            result.append('C' + ' '.join(f'{n:.6f}' for n in transformed))

        elif cmd_upper == 'S':
            # Smooth cubic: x2,y2,x,y
            for i in range(0, len(nums) - 3, 4):
                x2, y2 = nums[i], nums[i+1]
                x, y = nums[i+2], nums[i+3]

                if is_relative:
                    x2 += current_x; y2 += current_y
                    x += current_x; y += current_y

                nx2, ny2 = transform_point(x2, y2, matrix)
                nx, ny = transform_point(x, y, matrix)
                transformed.extend([nx2, ny2, nx, ny])
                current_x, current_y = x, y

            result.append('S' + ' '.join(f'{n:.6f}' for n in transformed))

        elif cmd_upper == 'Q':
            # Quadratic bezier: x1,y1,x,y
            for i in range(0, len(nums) - 3, 4):
                x1, y1 = nums[i], nums[i+1]
                x, y = nums[i+2], nums[i+3]

                if is_relative:
                    x1 += current_x; y1 += current_y
                    x += current_x; y += current_y

                nx1, ny1 = transform_point(x1, y1, matrix)
                nx, ny = transform_point(x, y, matrix)
                transformed.extend([nx1, ny1, nx, ny])
                current_x, current_y = x, y

            result.append('Q' + ' '.join(f'{n:.6f}' for n in transformed))

        elif cmd_upper == 'A':
            # Arc: rx,ry,rotation,large-arc,sweep,x,y
            # Arcs are complex - rx/ry scale, rotation changes, endpoint transforms
            for i in range(0, len(nums) - 6, 7):
                rx, ry = nums[i], nums[i+1]
                rotation = nums[i+2]
                large_arc = nums[i+3]
                sweep = nums[i+4]
                x, y = nums[i+5], nums[i+6]

                if is_relative:
                    x += current_x
                    y += current_y

                # Transform endpoint
                nx, ny = transform_point(x, y, matrix)

                # Scale radii by matrix scale factors
                scale_x, scale_y = get_matrix_scale(matrix)
                new_rx = rx * scale_x
                new_ry = ry * scale_y

                # Adjust rotation by matrix rotation
                # Extract rotation angle from matrix
                matrix_rotation = math.degrees(math.atan2(b, a))
                new_rotation = rotation + matrix_rotation

                # If matrix has negative determinant (flip), reverse sweep
                det = a * d_m - b * c
                new_sweep = sweep if det >= 0 else (1 - sweep)

                transformed.extend([new_rx, new_ry, new_rotation, large_arc, new_sweep, nx, ny])
                current_x, current_y = x, y

            result.append('A' + ' '.join(f'{n:.6f}' for n in transformed))

        else:
            # Unknown command, keep as-is
            result.append(cmd + params)

    return ' '.join(result)


def transform_points(points_str, matrix):
    """Transform points attribute for polygon/polyline."""
    if not points_str:
        return points_str

    nums = re.findall(r'-?[\d.]+', points_str)
    nums = [float(n) for n in nums]

    transformed = []
    for i in range(0, len(nums) - 1, 2):
        x, y = nums[i], nums[i+1]
        new_x, new_y = transform_point(x, y, matrix)
        transformed.append(f'{new_x:.6f},{new_y:.6f}')

    return ' '.join(transformed)


def apply_matrix_to_element(elem, matrix):
    """
    Apply transformation matrix to element coordinates.
    Modifies element in place and removes transform attribute.
    Also adjusts stroke-width if scaling is involved.
    """
    tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

    # Check if matrix is identity (no-op)
    if matrix == [1, 0, 0, 1, 0, 0]:
        if elem.get('transform'):
            del elem.attrib['transform']
        return

    # Adjust stroke-width for scaling
    stroke_width = elem.get('stroke-width')
    if stroke_width:
        try:
            sw = float(stroke_width)
            scale_x, scale_y = get_matrix_scale(matrix)
            # Use average scale for stroke (or could use max for safety)
            avg_scale = (scale_x + scale_y) / 2
            elem.set('stroke-width', f'{sw * avg_scale:.6f}')
        except ValueError:
            pass  # Keep original if parsing fails

    if tag == 'path':
        d = elem.get('d')
        if d:
            elem.set('d', transform_path_d(d, matrix))

    elif tag in ('polygon', 'polyline'):
        points = elem.get('points')
        if points:
            elem.set('points', transform_points(points, matrix))

    elif tag == 'rect':
        # Transform all four corners and compute new bounding box
        x = float(elem.get('x', '0'))
        y = float(elem.get('y', '0'))
        w = float(elem.get('width', '0'))
        h = float(elem.get('height', '0'))

        # Get corner points
        corners = [
            (x, y),
            (x + w, y),
            (x + w, y + h),
            (x, y + h)
        ]

        # Transform corners
        transformed = [transform_point(px, py, matrix) for px, py in corners]

        # Compute new axis-aligned bounding box
        xs = [p[0] for p in transformed]
        ys = [p[1] for p in transformed]
        new_x = min(xs)
        new_y = min(ys)
        new_w = max(xs) - new_x
        new_h = max(ys) - new_y

        elem.set('x', f'{new_x:.6f}')
        elem.set('y', f'{new_y:.6f}')
        elem.set('width', f'{new_w:.6f}')
        elem.set('height', f'{new_h:.6f}')

        # Note: if rotation is involved, rect becomes a different shape
        # For accuracy, should convert to path. For now, we use bounding box.

    elif tag == 'circle':
        cx = float(elem.get('cx', '0'))
        cy = float(elem.get('cy', '0'))
        r = float(elem.get('r', '0'))

        # Transform center
        new_cx, new_cy = transform_point(cx, cy, matrix)
        elem.set('cx', f'{new_cx:.6f}')
        elem.set('cy', f'{new_cy:.6f}')

        # Scale radius (use average scale - circle may become ellipse)
        scale_x, scale_y = get_matrix_scale(matrix)
        avg_scale = (scale_x + scale_y) / 2
        elem.set('r', f'{r * avg_scale:.6f}')

    elif tag == 'ellipse':
        cx = float(elem.get('cx', '0'))
        cy = float(elem.get('cy', '0'))
        rx = float(elem.get('rx', '0'))
        ry = float(elem.get('ry', '0'))

        # Transform center
        new_cx, new_cy = transform_point(cx, cy, matrix)
        elem.set('cx', f'{new_cx:.6f}')
        elem.set('cy', f'{new_cy:.6f}')

        # Scale radii
        scale_x, scale_y = get_matrix_scale(matrix)
        elem.set('rx', f'{rx * scale_x:.6f}')
        elem.set('ry', f'{ry * scale_y:.6f}')

    elif tag == 'line':
        x1 = float(elem.get('x1', '0'))
        y1 = float(elem.get('y1', '0'))
        x2 = float(elem.get('x2', '0'))
        y2 = float(elem.get('y2', '0'))

        new_x1, new_y1 = transform_point(x1, y1, matrix)
        new_x2, new_y2 = transform_point(x2, y2, matrix)

        elem.set('x1', f'{new_x1:.6f}')
        elem.set('y1', f'{new_y1:.6f}')
        elem.set('x2', f'{new_x2:.6f}')
        elem.set('y2', f'{new_y2:.6f}')

    elif tag == 'use':
        x = elem.get('x')
        y = elem.get('y')
        if x and y:
            new_x, new_y = transform_point(float(x), float(y), matrix)
            elem.set('x', f'{new_x:.6f}')
            elem.set('y', f'{new_y:.6f}')

    elif tag == 'text':
        x = elem.get('x')
        y = elem.get('y')
        if x and y:
            new_x, new_y = transform_point(float(x), float(y), matrix)
            elem.set('x', f'{new_x:.6f}')
            elem.set('y', f'{new_y:.6f}')

    # Remove transform attribute - it's now baked into coordinates
    if elem.get('transform'):
        del elem.attrib['transform']


# =============================================================================
# VIEWBOX NORMALIZATION (offset only, no matrix)
# =============================================================================

def apply_offset_to_element(elem, offset_x, offset_y):
    """Apply simple translation offset to element (for viewBox normalization)."""
    matrix = [1, 0, 0, 1, offset_x, offset_y]
    apply_matrix_to_element(elem, matrix)


def normalize_viewbox_offset(root, viewbox, ns):
    """
    Apply viewBox offset to all elements so coordinates are in 0,0 based space.
    This is separate from transform baking - it handles the viewBox min-x/min-y.
    """
    if viewbox['minX'] == 0 and viewbox['minY'] == 0:
        return False

    offset_x = -viewbox['minX']
    offset_y = -viewbox['minY']

    print(f"[normalize_svg] Applying viewBox offset: ({offset_x}, {offset_y})", file=sys.stderr)

    def apply_to_subtree(elem):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag in LEAF_TAGS:
            apply_offset_to_element(elem, offset_x, offset_y)
        for child in elem:
            apply_to_subtree(child)

    for child in root:
        apply_to_subtree(child)

    # Update viewBox
    new_viewbox = f"0 0 {viewbox['width']} {viewbox['height']}"
    root.set('viewBox', new_viewbox)

    return True


# =============================================================================
# CSS AND STYLE HANDLING
# =============================================================================

def parse_css_styles(root, ns):
    """
    Parse <style> blocks and build a mapping of class -> styles.
    Returns dict like {'class-name': {'fill': '#ff0000', 'stroke': '#000'}, ...}
    """
    style_map = {}

    for style_elem in root.iter():
        tag = style_elem.tag.split('}')[-1] if '}' in style_elem.tag else style_elem.tag
        if tag == 'style' and style_elem.text:
            css_text = style_elem.text

            # Match class rules: .classname { property: value; }
            rules = re.findall(r'\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}', css_text)

            for class_name, properties in rules:
                props = {}
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
        return None, None, None

    classes = class_attr.split()
    fill = None
    stroke = None
    stroke_width = None

    for cls in classes:
        if cls in style_map:
            styles = style_map[cls]
            if 'fill' in styles and styles['fill'] != 'none':
                fill = styles['fill']
            if 'stroke' in styles and styles['stroke'] != 'none':
                stroke = styles['stroke']
            if 'stroke-width' in styles:
                stroke_width = styles['stroke-width']

    return fill, stroke, stroke_width


# =============================================================================
# GROUP FLATTENING WITH TRANSFORM BAKING
# =============================================================================

LEAF_TAGS = {'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use'}


def flatten_groups(root, ns, style_map=None):
    """
    Flatten all groups by extracting leaf elements, applying inherited styles,
    and BAKING transforms into coordinates.
    """
    if style_map is None:
        style_map = {}

    leaf_elements = []
    transform_stats = {'with_transform': 0, 'without_transform': 0}

    def get_effective_style(elem, attr_name, inherited_value):
        """Get effective style value considering CSS, attributes, and inheritance."""
        css_fill, css_stroke, css_stroke_width = get_color_from_css(elem, style_map)

        if attr_name == 'fill':
            css_value = css_fill
        elif attr_name == 'stroke':
            css_value = css_stroke
        elif attr_name == 'stroke-width':
            css_value = css_stroke_width
        else:
            css_value = None

        attr_value = elem.get(attr_name)

        # Priority: CSS class > attribute > inherited
        if css_value:
            return css_value
        if attr_value and attr_value != 'none':
            return attr_value
        if inherited_value and inherited_value != 'none':
            return inherited_value
        return None

    def extract_leaves(elem, inherited_fill=None, inherited_stroke=None,
                       inherited_stroke_width=None, inherited_matrix=None):
        """Recursively extract leaf elements with inherited styles and composed transforms."""
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

        # Get effective styles
        fill = get_effective_style(elem, 'fill', inherited_fill)
        stroke = get_effective_style(elem, 'stroke', inherited_stroke)
        stroke_width = get_effective_style(elem, 'stroke-width', inherited_stroke_width)

        # Parse this element's transform
        elem_transform = elem.get('transform')
        elem_matrix = parse_transform_string(elem_transform) if elem_transform else identity_matrix()

        # Compose with inherited matrix: inherited × element (element applied first locally)
        if inherited_matrix:
            composed_matrix = multiply_matrices(inherited_matrix, elem_matrix)
        else:
            composed_matrix = elem_matrix

        if tag == 'g':
            # Recurse into group children
            for child in list(elem):
                extract_leaves(child, fill, stroke, stroke_width, composed_matrix)

        elif tag in LEAF_TAGS:
            # Apply composed transform to coordinates (bake it in)
            if composed_matrix != identity_matrix():
                transform_stats['with_transform'] += 1
                apply_matrix_to_element(elem, composed_matrix)
            else:
                transform_stats['without_transform'] += 1
                # Still remove any transform attribute
                if elem.get('transform'):
                    del elem.attrib['transform']

            # Apply effective styles
            if fill:
                elem.set('fill', fill)
            if stroke:
                elem.set('stroke', stroke)
            if stroke_width:
                elem.set('stroke-width', stroke_width)

            # Remove class attribute since we've resolved styles
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
    print(f"[normalize_svg] Transform stats: {transform_stats['with_transform']} with transforms baked, "
          f"{transform_stats['without_transform']} without", file=sys.stderr)

    # Debug: count colors
    color_counts = {}
    for elem in leaf_elements[:1000]:
        color = elem.get('fill') or elem.get('stroke') or 'no-color'
        color_counts[color] = color_counts.get(color, 0) + 1
    print(f"[normalize_svg] Color distribution (first 1000): {color_counts}", file=sys.stderr)

    return len(leaf_elements)


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def parse_viewbox(viewbox_str):
    """Parse viewBox attribute into components."""
    if not viewbox_str:
        return None
    parts = viewbox_str.strip().split()
    if len(parts) != 4:
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


def analyze_svg_structure(root, ns):
    """Analyze and report SVG structure for debugging."""
    element_counts = {}
    transform_counts = {'with': 0, 'without': 0}

    def count_elements(elem, depth=0):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        element_counts[tag] = element_counts.get(tag, 0) + 1

        if elem.get('transform'):
            transform_counts['with'] += 1
        else:
            transform_counts['without'] += 1

        for child in elem:
            count_elements(child, depth + 1)

    for child in root:
        count_elements(child)

    print(f"[normalize_svg] Element counts: {element_counts}", file=sys.stderr)
    print(f"[normalize_svg] Elements with transform attr: {transform_counts['with']}, "
          f"without: {transform_counts['without']}", file=sys.stderr)


# =============================================================================
# MAIN
# =============================================================================

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

    # Parse CSS styles
    style_map = parse_css_styles(root, namespaces)
    if style_map:
        print(f"[normalize_svg] Found {len(style_map)} CSS class rules", file=sys.stderr)

    # Analyze structure before processing
    print(f"[normalize_svg] === Before Processing ===", file=sys.stderr)
    analyze_svg_structure(root, namespaces)

    # Get viewBox
    viewbox_str = root.get('viewBox')
    viewbox = parse_viewbox(viewbox_str)

    if not viewbox:
        print(f"[normalize_svg] No valid viewBox found, processing transforms only", file=sys.stderr)
        # Still flatten and bake transforms even without viewBox
        viewbox = {'minX': 0, 'minY': 0, 'width': 100, 'height': 100}
    else:
        print(f"[normalize_svg] Original viewBox: {viewbox_str}", file=sys.stderr)

    # Set width/height to match viewBox dimensions
    root.set('width', str(viewbox['width']))
    root.set('height', str(viewbox['height']))

    # Flatten groups and BAKE all transforms into coordinates
    print(f"[normalize_svg] Flattening groups and baking transforms...", file=sys.stderr)
    leaf_count = flatten_groups(root, namespaces, style_map)

    # Now apply viewBox offset (after transforms are baked)
    if viewbox['minX'] != 0 or viewbox['minY'] != 0:
        print(f"[normalize_svg] Applying viewBox offset...", file=sys.stderr)
        normalize_viewbox_offset(root, viewbox, namespaces)

    # Final verification
    final_viewbox = root.get('viewBox')
    print(f"[normalize_svg] Final viewBox: {final_viewbox}", file=sys.stderr)
    print(f"[normalize_svg] Final element count: {leaf_count}", file=sys.stderr)

    # Verify no transform attributes remain
    remaining_transforms = 0
    for elem in root.iter():
        if elem.get('transform'):
            remaining_transforms += 1
    print(f"[normalize_svg] Remaining transform attributes: {remaining_transforms}", file=sys.stderr)

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
