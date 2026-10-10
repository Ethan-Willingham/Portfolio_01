#!/usr/bin/env python3
"""Verify and unpack the lossless Water Machines evidence containers."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def decode(index, archive=None):
    cache = {}
    for expected, row in index['blobs'].items():
        if row['encoding'] in ('gzip/base64', 'gzip+base64'):
            raw = gzip.decompress(base64.b64decode(row['data'], validate=True))
        elif row['encoding'] == 'zip-entry':
            assert archive is not None, 'This index requires its ZIP recording container'
            assert row['entry'] == 'blobs/' + expected + '.bin'
            raw = archive.read(row['entry'])
            stride = row.get('byteShuffle', 1)
            assert isinstance(stride, int) and 1 <= stride <= 64
            assert len(raw) % stride == 0
            if stride > 1:
                count = len(raw) // stride
                restored = bytearray(len(raw))
                for lane in range(stride):
                    restored[lane::stride] = raw[lane * count:(lane + 1) * count]
                raw = bytes(restored)
        else:
            raise ValueError('Unsupported blob encoding: ' + row['encoding'])
        assert len(raw) == row['bytes'] and digest(raw) == expected, expected
        cache[expected] = raw

    files = {}
    for row in index['archives']:
        relative = PurePosixPath(row['path'])
        assert not relative.is_absolute() and '..' not in relative.parts and relative.parts
        assert row['path'] not in files, 'Duplicate archive path'
        raw = b''.join(cache[key] for key in row['parts']) if 'parts' in row else cache[row['SHA256']]
        assert digest(raw) == row['SHA256'], row['path']
        if 'bytes' in row:
            assert len(raw) == row['bytes'], row['path']
        files[row['path']] = raw
    return files, cache


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--zip', type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--output', type=Path, help='A new directory for the verified original files')
    mode.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    index = json.loads(args.index.read_bytes())
    if 'blobArchive' in index:
        assert args.zip is not None, 'Pass the ZIP named by blobArchive'
        raw = args.zip.read_bytes()
        assert len(raw) == index['blobArchive']['bytes']
        assert digest(raw) == index['blobArchive']['SHA256']
    if args.zip:
        with zipfile.ZipFile(args.zip) as archive:
            files, blobs = decode(index, archive)
    else:
        files, blobs = decode(index)
    if args.output:
        assert not args.output.exists(), 'Output must be a new directory'
        args.output.mkdir(parents=True)
        for name, raw in files.items():
            target = args.output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
    print(json.dumps({'pass': True, 'archives': len(files), 'blobs': len(blobs), 'originalBytes': sum(map(len, files.values()))}))


if __name__ == '__main__':
    main()
