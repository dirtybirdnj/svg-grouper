#!/usr/bin/env python3
"""
SVG Shape Flattening Script
Merges touching shapes of the same color using boolean union operations
"""

import sys
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import re

def parse_path_to_polygon(path_d):
    """Convert SVG path data to shapely Polygon (simplified - handles basic paths)"""
    # This is a simplified parser - for production you'd want svg.path or similar
    coords = []

    # Remove path commands and extract coordinate pairs
    # This handles M, L commands - expand as needed
    parts = re.findall(r'[MLZ]?\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', path_d)

    for x, y in parts:
        coords.append((float(x), float(y)))

    if len(coords) < 3:
        return None

    try:
        return Polygon(coords)
    except:
        return None

def polygon_to_path(polygon):
    """Convert shapely Polygon to SVG path data"""
    coords = list(polygon.exterior.coords)
    if not coords:
        return ""

    path_parts = [f"M {coords[0][0]} {coords[0][1]}"]
    for x, y in coords[1:]:
        path_parts.append(f"L {x} {y}")
    path_parts.append("Z")

    return " ".join(path_parts)

def main():
    if len(sys.argv) != 2:
        print("Usage: flatten_shapes.py <color>", file=sys.stderr)
        sys.exit(1)

    color = sys.argv[1]

    # Read SVG from stdin
    svg_input = sys.stdin.read()

    print(f"Python: Received SVG of size {len(svg_input)} bytes", file=sys.stderr)
    print(f"Python: Flattening shapes with color: {color}", file=sys.stderr)

    try:
        # Parse SVG
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        root = ET.fromstring(svg_input)

        # Collect all path elements with matching fill color
        polygons = []
        paths_to_remove = []
        parent_group = None

        for group in root.iter():
            if group.tag.endswith('g'):
                for path in group.findall('.//{http://www.w3.org/2000/svg}path'):
                    fill = path.get('fill', '')
                    style = path.get('style', '')

                    # Check fill in attribute or style
                    path_color = fill
                    if 'fill:' in style:
                        match = re.search(r'fill:\s*([^;]+)', style)
                        if match:
                            path_color = match.group(1).strip()

                    if path_color == color:
                        path_d = path.get('d', '')
                        poly = parse_path_to_polygon(path_d)
                        if poly:
                            polygons.append(poly)
                            paths_to_remove.append((group, path))
                            if parent_group is None:
                                parent_group = group

        if not polygons:
            print("Python: No shapes found to flatten", file=sys.stderr)
            print(svg_input, end='')
            return

        print(f"Python: Found {len(polygons)} shapes to merge", file=sys.stderr)

        # Perform union operation
        merged = unary_union(polygons)
        print(f"Python: Merged into {len(merged.geoms) if isinstance(merged, MultiPolygon) else 1} shape(s)", file=sys.stderr)

        # Remove old paths
        for group, path in paths_to_remove:
            group.remove(path)

        # Add new merged paths
        if isinstance(merged, MultiPolygon):
            for poly in merged.geoms:
                new_path = ET.SubElement(parent_group, '{http://www.w3.org/2000/svg}path')
                new_path.set('d', polygon_to_path(poly))
                new_path.set('fill', color)
                new_path.set('stroke', 'none')
        else:
            new_path = ET.SubElement(parent_group, '{http://www.w3.org/2000/svg}path')
            new_path.set('d', polygon_to_path(merged))
            new_path.set('fill', color)
            new_path.set('stroke', 'none')

        # Output modified SVG
        output = ET.tostring(root, encoding='unicode')
        print(f"Python: Output size: {len(output)} bytes", file=sys.stderr)
        print(output, end='')

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
