#!/usr/bin/env python3
"""Extract dated utility linework from a public PDF, without connecting gaps.

Requires PyMuPDF, numpy, pyproj and shapely. The original PDF stays with its
publisher; only factual line geometry and provenance are exported here.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

import numpy as np
import pymupdf
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, box, mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'archive/under-the-street/assets/map'
URL = 'https://www.stpaul.gov/sites/default/files/archive/ustarenaeaw062023.pdf'
SYSTEMS = {
    'water': ('Water', 'watermain', ['V-WATR']),
    'sanitary': ('Sanitary sewer', 'sanitary', ['V-SSWR']),
    'storm': ('Storm sewer', 'stormsewer', ['V-STRM']),
    'gas': ('Natural gas', 'gas', ['V-NGAS-PIPE-PLAN']),
    'electric': ('Electric', 'undergroundpower', ['V-ELEC-PIPE-PLAN']),
    'telecom': ('Telecom', 'telecomdrawing', ['V-TELE-UNDR', 'V-FIBR-PIPE-PLAN']),
}


def pieces(items, rotation):
    """Open straight subpaths only. Do not turn symbols into pipe routes."""
    paths, current = [], []
    for item in items:
        if item[0] != 'l':
            if current:
                paths.append(current)
            current = []
            continue
        a, b = tuple(item[1] * rotation), tuple(item[2] * rotation)
        if a == b:
            continue
        if current and current[-1] != a:
            paths.append(current)
            current = []
        if not current:
            current = [a]
        current.append(b)
    if current:
        paths.append(current)
    return [LineString(p) for p in paths if len(p) > 1 and p[0] != p[-1]]


def build(pdf):
    controls = json.loads((ROOT / 'tools/under-street/drawing-controls.json').read_text())
    assert hashlib.sha256(pdf.read_bytes()).hexdigest() == controls['pdfSha256'], 'PDF changed; review the source before extracting it'
    doc = pymupdf.open(pdf)
    page = doc[55]
    assert len(doc) == 148 and page.rotation == 270
    metric = Transformer.from_crs(4326, 26915, always_xy=True)
    geographic = Transformer.from_crs(26915, 4326, always_xy=True)
    anchors = controls['registrationControls']
    matrix = np.array([[*a['pdfPoint'], 1] for a in anchors])
    targets = np.array([metric.transform(*a['coordinate']) for a in anchors])
    coefficients = np.linalg.lstsq(matrix, targets, rcond=None)[0]
    errors = [float(np.linalg.norm(np.array([*a['pdfPoint'], 1]) @ coefficients - metric.transform(*a['coordinate']))) for a in controls['checkPoints']]
    assert max(errors) < 3, 'Independent building corners do not register within 3 metres'

    def project(x, y, z=None):
        x, y = np.asarray(x), np.asarray(y)
        return (coefficients[0, 0] * x + coefficients[1, 0] * y + coefficients[2, 0],
                coefficients[0, 1] * x + coefficients[1, 1] * y + coefficients[2, 1])

    plot = box(*controls['mapFrame'])
    city = shape(json.loads((DEST / 'cities.json').read_text())['features'][0]['geometry'])
    manifest = json.loads((DEST / 'datasets.json').read_text())
    manifest['datasets'] = [d for d in manifest['datasets'] if not d['id'].startswith('drawing-ust-')]
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for system, (label, kind, suffixes) in SYSTEMS.items():
        features = []
        for drawing in page.get_drawings():
            layer = drawing.get('layer', '')
            # VBASE is the source survey. Exclude design, demolition, labels,
            # structure symbols, legend examples and proposed alternatives.
            if layer not in ['701480 VBASE|' + s for s in suffixes] or drawing['type'] != 's':
                continue
            lines = []
            for line in pieces(drawing['items'], page.rotation_matrix):
                clipped = line.intersection(plot)
                parts = list(clipped.geoms) if clipped.geom_type == 'MultiLineString' else [clipped]
                for part in parts:
                    if part.geom_type != 'LineString' or part.is_empty:
                        continue
                    meters = transform(project, part)
                    # Very short arrowheads/ticks share some CAD pipe layers.
                    # Omit them and short fragments; do not bridge their gaps.
                    if meters.length < 2:
                        continue
                    result = transform(geographic.transform, meters).intersection(city)
                    if result.geom_type == 'LineString' and not result.is_empty:
                        lines.append(result)
                    elif result.geom_type == 'MultiLineString':
                        lines.extend(result.geoms)
            if not lines:
                continue
            geom = lines[0] if len(lines) == 1 else MultiLineString(lines)
            anchor = geom.interpolate(.5, normalized=True)
            identity = 'ust-2023-p56-' + str(drawing['seqno'])
            features.append({'type': 'Feature', 'id': identity, 'properties': {
                'fragment': identity, 'drawingDate': '2023-05-10', 'pdfPage': 56,
                'system': label, 'type': kind, 'cadLayer': layer,
                'subtype': 'Fiber-optic route, burial unverified' if layer.endswith('V-FIBR-PIPE-PLAN') else 'Underground telephone route' if system == 'telecom' else label,
                'currentStatus': 'Not verified',
            }, 'geometry': mapping(geom), 'displayAnchor': [anchor.x, anchor.y]})
        relative = 'data/drawing-ust-' + system + '.json'
        raw = json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')).encode()
        (DEST / relative).write_bytes(raw)
        bounds = [shape(f['geometry']).bounds for f in features]
        manifest['datasets'].append({
            'id': 'drawing-ust-' + system, 'title': 'St. Thomas ' + label.lower() + ' drawing, May 2023',
            'file': relative, 'format': 'GeoJSON', 'geometry': sorted({f['geometry']['type'] for f in features}),
            'featureCount': len(features), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'bounds': [min(b[0] for b in bounds), min(b[1] for b in bounds), max(b[2] for b in bounds), max(b[3] for b in bounds)],
            'properties': {'fragment': 'Drawing fragment identifier', 'drawingDate': 'Drawing date', 'pdfPage': 'PDF page', 'cadLayer': 'Original CAD layer', 'currentStatus': 'Present status'},
            'scope': {'city': 'Saint Paul', 'boundaryFile': 'cities.json', 'operation': 'intersection', 'originalFeatureCount': len(features)},
            'source': {'url': URL + '#page=56', 'sourceDate': '2023-05-10', 'retrievedAt': now,
                'attribution': 'Ryan Companies, existing conditions plan in the City of Saint Paul UST arena environmental review. Registration controls: OpenStreetMap contributors.',
                'license': 'Publicly posted plan; no explicit reuse license supplied. Registration footprint controls are OpenStreetMap data, ODbL.',
                'coverage': 'Saint Paul, St. Thomas south-campus drawing frame only. Exact city-boundary intersection.',
                'caveats': ['Drawing excerpt from May 10, 2023. Present alignment and operation are unverified; later construction is not reflected.',
                    'Approximate PDF registration, not survey coordinates. These are drawing fragments, not unique installed pipes or an asset inventory.',
                    'Open straight vectors in selected existing-survey CAD layers only. Proposed, demolition, label and structure layers are excluded. Curves, closed shapes and fragments shorter than 2 metres are omitted. Gaps are not connected.',
                    'No pipe diameters, depths, ownership or installation dates are inferred from nearby labels.'],
                'reproduce': 'python tools/under-street/build-drawing-lines.py --input /path/to/ustarenaeaw062023.pdf',
                'pdfSha256': controls['pdfSha256'], 'registrationFile': 'tools/under-street/drawing-controls.json',
                'registrationCheckErrorsMeters': errors,
            },
        })
        print(system, len(features))
    manifest['updatedAt'] = now
    (DEST / 'datasets.json').write_text(json.dumps(manifest, separators=(',', ':')))
    scope = json.loads((DEST / 'saint-paul-scope.json').read_text())
    scope['datasets'] = len(manifest['datasets'])
    (DEST / 'saint-paul-scope.json').write_text(json.dumps(scope, separators=(',', ':')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    build(parser.parse_args().input)
