#!/usr/bin/env python3
"""
SVG Shape Flattening Script
Merges touching shapes of the same color using boolean union operations
"""

import sys
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection
from shapely.ops import unary_union
from shapely.validation import make_valid
import re


def extract_polygons(geom):
    """Extract all polygon geometries from a geometry (handles GeometryCollection from make_valid)"""
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    if isinstance(geom, GeometryCollection):
        result = []
        for g in geom.geoms:
            result.extend(extract_polygons(g))
        return result
    return []

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

        # Build parent map to track actual parents
        parent_map = {c: p for p in root.iter() for c in p}

        for path in root.iter():
            if not path.tag.endswith('path'):
                continue

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
                    # Make the polygon valid to handle self-intersections
                    if not poly.is_valid:
                        valid_geom = make_valid(poly)
                        # Extract any polygons from the result (could be GeometryCollection)
                        valid_polys = extract_polygons(valid_geom)
                        polygons.extend(valid_polys)
                    elif not poly.is_empty:
                        polygons.append(poly)
                    actual_parent = parent_map.get(path)
                    if actual_parent is not None:
                        paths_to_remove.append((actual_parent, path))
                        if parent_group is None:
                            parent_group = actual_parent

        if not polygons:
            print("Python: No shapes found to flatten", file=sys.stderr)
            print(svg_input, end='')
            return

        print(f"Python: Found {len(polygons)} shapes to merge", file=sys.stderr)

        # Perform union operation with fallback for topology errors
        try:
            merged = unary_union(polygons)
        except Exception as union_error:
            print(f"Python: Initial union failed, trying buffer(0) cleanup: {union_error}", file=sys.stderr)
            # Apply buffer(0) to clean up each geometry - this often fixes topology issues
            cleaned_polygons = []
            for p in polygons:
                try:
                    cleaned = p.buffer(0)
                    cleaned_polygons.extend(extract_polygons(cleaned))
                except:
                    pass  # Skip problematic geometries
            if not cleaned_polygons:
                print("Python: No valid shapes after cleanup", file=sys.stderr)
                print(svg_input, end='')
                return
            merged = unary_union(cleaned_polygons)

        print(f"Python: Merged into {len(merged.geoms) if isinstance(merged, MultiPolygon) else 1} shape(s)", file=sys.stderr)

        # Remove old paths
        for group, path in paths_to_remove:
            group.remove(path)

        # Extract all polygons from the merged result
        merged_polygons = extract_polygons(merged)

        if not merged_polygons:
            print("Python: No polygons in merged result", file=sys.stderr)
            print(svg_input, end='')
            return

        # Create a group to contain the merged paths
        merged_group = ET.SubElement(parent_group, '{http://www.w3.org/2000/svg}g')
        merged_group.set('id', f'flattened-{color.replace("#", "")}')

        # Add new merged paths to the group
        for i, poly in enumerate(merged_polygons):
            path_d = polygon_to_path(poly)
            if path_d:  # Only add if we got valid path data
                new_path = ET.SubElement(merged_group, '{http://www.w3.org/2000/svg}path')
                new_path.set('id', f'flattened-{color.replace("#", "")}-{i}')
                new_path.set('d', path_d)
                new_path.set('fill', color)
                new_path.set('stroke', 'none')

        print(f"Python: Created group with {len(merged_polygons)} paths", file=sys.stderr)

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
