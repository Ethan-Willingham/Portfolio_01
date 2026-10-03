#!/usr/bin/env python3
"""Extract colored tunnel overview paths from the June 2025 BCWMC GeoPDF.

This is an interpretation of a published engineering overview, not a surveyed
utility location. It copies no aerial pixels, labels, or other PDF artwork.
Requires pypdf, pdfplumber, numpy, and the PROJ cs2cs command.
Usage: extract-bassett-plan.py source.pdf --output scratch/bassett-plan.json
"""
import argparse
import base64
import hashlib
import json
import shutil
import subprocess
from html import escape
from pathlib import Path

import numpy as np
import pdfplumber
from pypdf import PdfReader

SOURCE = 'https://www.bassettcreekwmo.org/download_file/view/720550e9-eb72-46aa-865d-0aec666002f7/167'
PHASES = {
    (0.22, 0.659, 0.0): (1, 'I-94 and Second Street tunnels'),
    (1.0, 1.0, 0.0): (2, 'Third Avenue tunnel'),
    (1.0, 0.667, 0.0): (3, 'Double Box Culvert'),
}


def line_is_duplicate(points, existing):
    """Discard a straight overlay already represented by a source polyline."""
    if len(points) != 2:
        return False
    a, b = np.array(points)
    vector = b - a
    length = np.linalg.norm(vector)
    if not length:
        return True
    for previous in existing:
        if len(previous) < 3:
            continue
        q = np.array(previous)
        same_ends = np.linalg.norm(q[0]-a) < .01 and np.linalg.norm(q[-1]-b) < .01
        if same_ends and max(abs(vector[0]*(point-a)[1]-vector[1]*(point-a)[0])/length for point in q) < .1:
            return True
    return False


def audit_svg(result, source_png, output):
    """Pair the source figure with geographic paths, for internal source review."""
    image = base64.b64encode(source_png.read_bytes()).decode()
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1100" viewBox="0 0 1500 1100">',
             '<rect width="1500" height="1100" fill="white"/>',
             '<style>text { font-family: sans-serif; fill: #222; } .small { font-size: 14px; } .label { font-size: 18px; font-weight: bold; }</style>',
             '<text x="30" y="35" font-size="24">Bassett Creek: engineering overview route audit</text>',
             '<text x="30" y="60" class="small">Left: source Figure 1, June 2025. Right: transformed vector paths with phase labels.</text>',
             f'<image x="15" y="80" width="700" height="910" href="data:image/png;base64,{image}"/>']
    bounds = [-93.30, 44.975, -93.25, 44.995]
    left, top, width, height = 765, 120, 680, 600
    def xy(p):
        return (left+(p[0]-bounds[0])/(bounds[2]-bounds[0])*width,
                top+(bounds[3]-p[1])/(bounds[3]-bounds[1])*height)
    for lon in [-93.30, -93.29, -93.28, -93.27, -93.26, -93.25]:
        x, _ = xy([lon, bounds[1]])
        parts.extend([f'<path d="M{x},{top}V{top+height}" stroke="#ddd"/>',
                      f'<text x="{x}" y="{top+height+25}" text-anchor="middle" class="small">{lon:.2f}</text>'])
    for lat in [44.975, 44.980, 44.985, 44.990, 44.995]:
        _, y = xy([bounds[0], lat])
        parts.extend([f'<path d="M{left},{y}H{left+width}" stroke="#ddd"/>',
                      f'<text x="{left-8}" y="{y+5}" text-anchor="end" class="small">{lat:.3f}</text>'])
    colors = ['#387d2c', '#867600', '#c86b00']
    for feature, color in zip(result['features'], colors):
        for line in feature['geometry']['coordinates']:
            path = ' '.join(f'{x:.1f},{y:.1f}' for x, y in map(xy, line))
            parts.append(f'<polyline points="{path}" fill="none" stroke="{color}" stroke-width="3"/>')
        phase = feature['properties']['phase']
        parts.append(f'<text x="790" y="{800+(phase-1)*42}" class="label" style="fill:{color}">Phase {phase}: {escape(feature["properties"]["name"])}</text>')
    for name, point in [('Inlet', [-93.2939,44.9773]), ('River outlet', [-93.255384,44.979939]),
                        ('Third Avenue connection', [-93.270516,44.984813])]:
        x, y = xy(point)
        parts.extend([f'<circle cx="{x}" cy="{y}" r="5" fill="white" stroke="#222"/>',
                      f'<text x="{x-8}" y="{y-12}" text-anchor="end" class="small">{name}</text>'])
    residual = max(result['provenance']['cornerFitResidualFeet'])
    parts.extend([f'<text x="790" y="950" class="small">Embedded control-corner fit residual: {residual:.2f} feet.</text>',
                  '<text x="790" y="975" class="small">Residual describes transformation fit, not route accuracy.</text>',
                  '<text x="30" y="1035" class="small">Internal audit only. Source aerial imagery is NearMap, September 11, 2024; do not publish this source-image panel.</text>',
                  '<text x="30" y="1060" class="small">Vector routes represent an approximate engineering overview. Elevation is not encoded. Parallel source paths retained.</text>', '</svg>'])
    output.write_text('\n'.join(parts)+'\n')


def project(points, source, target, command):
    body = ''.join(f'{x} {y}\n' for x, y in points)
    result = subprocess.run([command, '-f', '%.10f', *source, '+to', *target],
                            input=body, text=True, capture_output=True, check=True)
    values = [[float(v) for v in row.split()[:2]] for row in result.stdout.splitlines()]
    if len(values) != len(points) or not np.isfinite(values).all():
        raise ValueError('Coordinate transformation failed')
    return np.array(values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--cs2cs', default=shutil.which('cs2cs'))
    parser.add_argument('--audit-svg', type=Path, help='Internal comparison visual; requires --source-png')
    parser.add_argument('--source-png', type=Path, help='Rendered complete PDF page 9 for the audit visual')
    args = parser.parse_args()
    if not args.cs2cs:
        raise SystemExit('PROJ cs2cs is required')
    page_number = 8
    page = PdfReader(args.pdf).pages[page_number]
    viewport = page['/VP'][0]
    measure = viewport['/Measure']
    x0, y0, x1, y1 = map(float, viewport['/BBox'])
    lpts = list(map(float, measure['/LPTS']))
    gpts = list(map(float, measure['/GPTS']))
    source_wkt = str(measure['/GCS']['/WKT'])
    lonlat = [(gpts[i+1], gpts[i]) for i in range(0, len(gpts), 2)]
    corners = project(lonlat, ['+proj=longlat', '+datum=WGS84'], [source_wkt], args.cs2cs)
    pdf_xy = np.array([[x0+lpts[i]*(x1-x0), y0+lpts[i+1]*(y1-y0), 1]
                       for i in range(0, len(lpts), 2)])
    affine = np.linalg.lstsq(pdf_xy, corners, rcond=None)[0]
    residual_feet = np.linalg.norm(pdf_xy @ affine - corners, axis=1).tolist()
    paths = {color: [] for color in PHASES}
    source_paths = {color: [] for color in PHASES}
    duplicates = 0
    with pdfplumber.open(args.pdf) as pdf:
        drawing = pdf.pages[page_number]
        for obj in drawing.curves + drawing.lines:
            color = obj.get('stroking_color')
            if color not in PHASES or float(obj['top']) >= drawing.height-y0:
                continue  # Discard legend swatches below the geospatial viewport.
            pts = obj['pts']
            if len(pts) < 2:
                continue
            if any(not (x0 <= x <= x1 and y0 <= drawing.height-y <= y1) for x, y in pts):
                raise ValueError('Selected path leaves the geospatial viewport')
            if line_is_duplicate(pts, source_paths[color]):
                duplicates += 1
                continue
            source_paths[color].append(pts)
            local = np.array([[x, drawing.height-y, 1] for x, y in pts])
            projected = local @ affine
            geo = project(projected, [source_wkt], ['+proj=longlat', '+datum=WGS84'], args.cs2cs)
            paths[color].append([[round(float(x), 6), round(float(y), 6)] for x, y in geo])
    features = []
    for color, (phase, name) in PHASES.items():
        if not paths[color]:
            raise ValueError(f'No paths for phase {phase}')
        features.append({'type': 'Feature', 'properties': {
            'i': f'bassett-plan-2025-phase-{phase}', 'name': name, 'phase': phase,
            'sourceDate': '2025-06', 'interpretation': 'Published engineering overview; approximate route',
            'sourceUrl': SOURCE,
        }, 'geometry': {'type': 'MultiLineString', 'coordinates': paths[color]}})
    result = {'type': 'FeatureCollection', 'features': features, 'provenance': {
        'sourceUrl': SOURCE, 'sourceSha256': hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
        'sourcePage': 9, 'sourceFigure': 'Figure 1, System Overview',
        'method': 'Selected vector paths by published phase color, excluded legend, transformed using embedded GeoPDF control corners and StatePlane source CRS.',
        'cornerFitResidualFeet': residual_feet,
        'duplicateSourceOverlaysRemoved': duplicates,
        'caveats': ['This is a representation of the published overview, not a surveyed utility locate.',
                    'Parallel box-culvert paths remain separate in the source figure.',
                    'Source map line widths and geographic control rounding limit positional precision.',
                    'The I-94 branch and downstream Second Street route share phase 1.',
                    'Route elevation is not encoded in this geometry.'],
    }}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    if args.audit_svg:
        if not args.source_png:
            raise SystemExit('--audit-svg requires --source-png')
        audit_svg(result, args.source_png, args.audit_svg)
    print(json.dumps({'features': len(features), 'components': [len(f['geometry']['coordinates']) for f in features],
                      'cornerFitResidualFeet': residual_feet, 'output': str(args.output)}))


if __name__ == '__main__':
    main()
