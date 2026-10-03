#!/usr/bin/env python3
"""Losslessly package municipal snapshots as deterministic gzip.

Defaults to the published map catalog. Use --assets /path/to/reviewed
--manifest municipal-manifest.json to package an existing reviewed acquisition.
Recorded hashes are checked before any files change. Repeat runs validate both
compressed and decoded bytes and leave the catalog and files unchanged.
"""
import argparse
import copy
import gzip
import hashlib
import io
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
MAP = ROOT / 'archive/under-the-street/assets/map'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic_write(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(raw)
    temporary.replace(path)


def gzip_bytes(raw):
    buffer = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, compresslevel=9, mtime=0) as writer:
        writer.write(raw)
    packed = buffer.getvalue()
    if gzip.decompress(packed) != raw:
        raise ValueError('Gzip round trip changed source bytes')
    return packed


def asset_path(base, relative):
    base = base.resolve()
    path = (base / relative).resolve()
    if not path.is_relative_to(base) or path == base:
        raise ValueError('Asset path escapes its snapshot directory')
    return path


def checked_bytes(entry, base):
    path = asset_path(base, entry['file'])
    raw = path.read_bytes()
    if len(raw) != entry['bytes'] or digest(raw) != entry['sha256']:
        raise ValueError(entry['id'] + ': recorded source bytes or SHA256 differ')
    if entry.get('contentEncoding') == 'gzip':
        if not entry['file'].endswith('.json.gz') or entry['format'] != 'GeoJSON (gzip)':
            raise ValueError(entry['id'] + ': compressed format/path mismatch')
        if raw[:3] != b'\x1f\x8b\x08' or raw[4:8] != b'\0' * 4 or raw[3] & 8:
            raise ValueError(entry['id'] + ': gzip timestamp or filename is not deterministic')
        decoded = gzip.decompress(raw)
        if len(decoded) != entry['uncompressedBytes'] or digest(decoded) != entry['uncompressedSha256']:
            raise ValueError(entry['id'] + ': decoded source bytes or SHA256 differ')
        return decoded
    if entry.get('contentEncoding') or not entry['file'].endswith('.json') or entry['format'] != 'GeoJSON':
        raise ValueError(entry['id'] + ': unsupported municipal encoding')
    return raw


def package_entry(entry, base):
    """Write a verified compressed export; let the caller publish its metadata."""
    relative = pathlib.PurePosixPath(entry['file'])
    if relative.parent != pathlib.PurePosixPath('data/municipal') or not entry.get('conduitRole'):
        raise ValueError(entry['id'] + ': only municipal source exports may be packaged')
    decoded = checked_bytes(entry, base)
    if entry.get('contentEncoding') == 'gzip':
        return copy.deepcopy(entry)
    packed = gzip_bytes(decoded)
    updated = copy.deepcopy(entry)
    updated.update(file=entry['file'] + '.gz', format='GeoJSON (gzip)', contentEncoding='gzip',
                   bytes=len(packed), sha256=digest(packed),
                   uncompressedBytes=len(decoded), uncompressedSha256=digest(decoded))
    atomic_write(asset_path(base, updated['file']), packed)
    return updated


def remove_plain(entry, base):
    """Delete only a redundant plain export whose complete hash still matches."""
    if entry.get('contentEncoding') != 'gzip':
        return
    plain = asset_path(base, entry['file'].removesuffix('.gz'))
    if plain.exists():
        raw = plain.read_bytes()
        if len(raw) != entry['uncompressedBytes'] or digest(raw) != entry['uncompressedSha256']:
            raise ValueError(entry['id'] + ': refuse to remove changed plain export')
        plain.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=pathlib.Path, default=MAP)
    parser.add_argument('--manifest', default='datasets.json')
    args = parser.parse_args()
    manifest_path = asset_path(args.assets, args.manifest)
    document = json.loads(manifest_path.read_text())
    entries = document if isinstance(document, list) else document['datasets']
    municipal = [entry for entry in entries if entry.get('conduitRole')]
    if not municipal:
        raise ValueError('No municipal snapshots in catalog')
    # Preflight all recorded hashes before packaging any of the source files.
    for entry in municipal:
        checked_bytes(entry, args.assets)
    updated = {entry['id']: package_entry(entry, args.assets) for entry in municipal}
    replacements = [updated.get(entry['id'], entry) for entry in entries]
    if replacements != entries:
        if isinstance(document, list):
            document = replacements
        else:
            document['datasets'] = replacements
        atomic_write(manifest_path, (json.dumps(document, indent=2, ensure_ascii=False) + '\n').encode())
    for entry in updated.values():
        remove_plain(entry, args.assets)
    plain_bytes = sum(entry['uncompressedBytes'] for entry in updated.values())
    compressed_bytes = sum(entry['bytes'] for entry in updated.values())
    print(f'{len(municipal)} municipal snapshots: {plain_bytes:,} decoded bytes, {compressed_bytes:,} gzip bytes, {plain_bytes-compressed_bytes:,} bytes saved')


if __name__ == '__main__':
    main()
