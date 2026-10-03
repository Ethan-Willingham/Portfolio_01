#!/usr/bin/env python3
"""Check published map assets without modifying them or contacting services.

Pass --assets to inspect another map snapshot and --output to save a report.
Geographic checks establish internal consistency, not survey accuracy.
"""
import argparse
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path


def coordinates(value):
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
            yield value[:2]
        else:
            for child in value:
                yield from coordinates(child)


def distance(a, b):
    """Local equirectangular distance, metres, adequate for matching-radius audit."""
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])),
                      (a[1] - b[1]) * 110574)


def audit(root):
    manifest = json.loads((root / 'datasets.json').read_text())
    media = json.loads((root / 'media.json').read_text())
    errors, warnings, datasets, facility_points = [], [], [], []
    ids = collections.Counter(d['id'] for d in manifest['datasets'])
    if any(n != 1 for n in ids.values()):
        errors.append('Duplicate dataset IDs')
    for record in manifest['datasets']:
        path = root / record['file']
        content = path.read_bytes()
        decoded=gzip.decompress(content) if record.get('contentEncoding')=='gzip' else content
        data = json.loads(decoded)
        if record.get('contentEncoding')=='gzip':
            if len(decoded)!=record.get('uncompressedBytes') or hashlib.sha256(decoded).hexdigest()!=record.get('uncompressedSha256'):
                errors.append(f"{record['id']}: decoded gzip content mismatch")
        if record.get('bytes') != len(content):
            errors.append(f"{record['id']}: byte length mismatch")
        if record.get('sha256') != hashlib.sha256(content).hexdigest():
            errors.append(f"{record['id']}: SHA256 mismatch")
        features = data.get('features', data.get('records', []))
        if record.get('format') == 'DepthRaster':
            features = data.get('values', [])
            count = len(features)
            width = data.get('width', data.get('cols'))
            height = data.get('height', data.get('rows'))
            if width and height and count != width * height:
                errors.append(f"{record['id']}: raster dimensions mismatch")
            valid = [v for v in features if v is not None]
            if count != record['featureCount']:
                errors.append(f"{record['id']}: raster cell count mismatch")
            if len(valid) != record.get('validCellCount', len(valid)):
                errors.append(f"{record['id']}: valid raster cell count mismatch")
            if any(not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in valid):
                errors.append(f"{record['id']}: invalid modeled depth")
            if valid and record.get('rangeFeet') != [min(valid), max(valid)]:
                errors.append(f"{record['id']}: modeled depth range mismatch")
            datasets.append({'id': record['id'], 'count': count, 'null': features.count(None),
                             'valid': len(valid), 'zero': features.count(0), 'rangeFeet': [min(valid), max(valid)]})
            continue
        if len(features) != record['featureCount']:
            errors.append(f"{record['id']}: feature count mismatch")
        statuses, types = collections.Counter(), collections.Counter()
        points, null_geometry, outside = [], 0, 0
        for feature in features:
            if not record.get('format','').startswith('GeoJSON'):
                continue
            props = feature.get('properties') or {}
            status = props.get('s', props.get('status'))
            if status is not None:
                statuses[str(status)] += 1
            if props.get('type') is not None:
                types[str(props['type'])] += 1
            geometry = feature.get('geometry')
            if geometry is None:
                null_geometry += 1
                continue
            for lon, lat in coordinates(geometry.get('coordinates', [])):
                if not math.isfinite(lon) or not math.isfinite(lat) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    errors.append(f"{record['id']}: invalid longitude/latitude")
                points.append((lon, lat))
            if geometry['type'] == 'Point':
                lon, lat = geometry['coordinates'][:2]
                bbox = manifest['bbox']
                if not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]):
                    outside += 1
                if any(word in record['id'] for word in ['plants', 'waterworks', 'towers', 'dams', 'centers', 'exchanges']):
                    facility_points.append((record['id'], feature))
        actual_bounds = ([min(p[0] for p in points), min(p[1] for p in points),
                          max(p[0] for p in points), max(p[1] for p in points)] if points else None)
        bounds = record.get('bounds')
        if bounds and actual_bounds and any(abs(a - b) > 0.00002 for a, b in zip(bounds, actual_bounds)):
            warnings.append(f"{record['id']}: manifest bounds differ from coordinates")
        if null_geometry:
            warnings.append(f"{record['id']}: {null_geometry} records have null geometry")
        if outside:
            warnings.append(f"{record['id']}: {outside} point records outside acquisition box")
        datasets.append({'id': record['id'], 'count': len(features), 'nullGeometry': null_geometry,
                         'bounds': actual_bounds, 'status': dict(statuses), 'types': dict(types)})
    photos = []
    for photo in media['photos']:
        match = photo.get('match', {})
        anchor = match.get('near')
        if photo.get('illustrative') and (anchor or match.get('names')):
            errors.append(f"{photo['id']}: illustrative photo can match a place")
        for field in ['creator', 'license', 'licenseUrl', 'sourceUrl', 'edits', 'alt', 'caption']:
            if not photo.get(field):
                errors.append(f"{photo['id']}: missing {field}")
        for field in ['src', 'webp']:
            if not (root.parent.parent / photo[field]).exists():
                errors.append(f"{photo['id']}: missing {field} file")
        if not anchor:
            continue
        names = {n.casefold() for n in match.get('names', [])}
        nearby = []
        for dataset_id, feature in facility_points:
            gap = distance(anchor, feature['geometry']['coordinates'])
            props = feature.get('properties') or {}
            name = props.get('name', props.get('n', ''))
            if gap <= 500 or name.casefold() in names:
                nearby.append({'dataset': dataset_id, 'name': name, 'distanceM': round(gap, 1),
                               'exactAlias': name.casefold() in names,
                               'withinRadius': gap <= match.get('radiusM', 0),
                               'status': props.get('s', props.get('status'))})
        photos.append({'id': photo['id'], 'anchor': anchor,
                       'nearbyFacilities': sorted(nearby, key=lambda f: f['distanceM'])})
    return {'errors': errors, 'warnings': warnings, 'datasets': datasets, 'photos': photos,
            'photoCount': len(media['photos']), 'placePhotoCount': len(photos),
            'limits': ['No check here establishes current operations or survey precision.',
                       'Facility proximity is a review aid, never an automatic identity join.',
                       'Source licenses and photo subject references require manual review.']}


def main():
    default = Path(__file__).resolve().parents[2] / 'archive/under-the-street/assets/map'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, default=default)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit(args.assets)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'datasets': len(report['datasets']), 'photos': report['photoCount'], 'placePhotos': report['placePhotoCount'],
                      'errors': report['errors'], 'warnings': report['warnings']}, indent=2))
    raise SystemExit(bool(report['errors']))


if __name__ == '__main__':
    main()
