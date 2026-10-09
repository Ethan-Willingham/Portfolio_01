"""Read satellite measurements, never invert a display colour palette.

GOES: NOAA ABI L2 CMI NetCDF, DQF=0 (good quality), native geostationary grid.
Himawari: JMA HSD band 13, calibrated and navigated by Satpy's HSD reader.
Meteosat: EUMETView's monotonic greyscale IR products, with their own clocks.
The renderer receives only dated, projected thermal fields and missing-data alpha.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import h5py
import numpy as np
from PIL import Image
from pyproj import CRS, Transformer
from scipy.ndimage import map_coordinates

UTC = timezone.utc
WIDTH = 2048
MAX_AGE = timedelta(minutes=90)
EUM = 'https://view.eumetsat.int/geoserver/wms'
IDS = ['goes18', 'goes19', 'himawari9', 'meteosat-iodc', 'meteosat-mtg']


class SourceDeadline(BaseException):
    pass


def deadline(_signum, _frame):
    raise SourceDeadline('Satellite preparation exceeded 50 seconds')


def iso(value):
    return value.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def date(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)


def download(url, cache, suffix='', max_age=None, timeout=30, retries=3, stale_metadata=False):
    target = cache / (hashlib.sha256(url.encode()).hexdigest() + suffix)
    if target.exists() and (max_age is None or time.time() - target.stat().st_mtime < max_age):
        return target
    error = None
    for _ in range(retries):
        temporary = None
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'EarthNow/53 (satellite archive)'})
            with urllib.request.urlopen(request, timeout=timeout) as response, tempfile.NamedTemporaryFile(dir=cache, delete=False) as output:
                temporary = Path(output.name)
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            if not temporary.stat().st_size:
                raise ValueError('Empty satellite response')
            temporary.replace(target)
            return target
        except Exception as failure:
            error = failure
            if temporary:
                temporary.unlink(missing_ok=True)
    if stale_metadata and target.exists():
        return target
    raise error


def listing(bucket, prefix, cache):
    url = f'https://{bucket}.s3.amazonaws.com/?' + urllib.parse.urlencode({'list-type': '2', 'prefix': prefix})
    entries = []
    while True:
        root = ET.parse(download(url, cache, '.xml', max_age=60, timeout=8, retries=2, stale_metadata=True)).getroot()
        entries.extend(x.text for x in root.findall('.//{*}Key'))
        token = root.find('{*}NextContinuationToken')
        if token is None:
            return entries
        url += '&continuation-token=' + urllib.parse.quote(token.text)


def abi_clock(value):
    # GOES filename clock is YYYY + day-of-year + HHMMSS + tenths.
    return datetime.strptime(value[:13], '%Y%j%H%M%S').replace(tzinfo=UTC) + timedelta(milliseconds=int(value[13:]) * 100)


def goes_candidates(satellite, instant, cache):
    bucket = 'noaa-' + satellite
    found = []
    for offset in range(3):
        hour = instant - timedelta(hours=offset)
        prefix = hour.strftime('ABI-L2-CMIPF/%Y/%j/%H/')
        for key in listing(bucket, prefix, cache):
            match = re.search(r'M6C13_G\d+_s(\d+)_e(\d+)_c\d+\.nc$', key)
            if not match:
                continue
            start, end = map(abi_clock, match.groups())
            if end <= instant and timedelta(0) <= instant - start <= MAX_AGE:
                found.append((start, end, key))
        if found:
            break
    return [(f'https://{bucket}.s3.amazonaws.com/{key}', start, end) for start, end, key in sorted(found, reverse=True)]


def sample_grid(values, valid, crs, x0, y0, dx, dy, width=WIDTH):
    """Bilinear resampling in temperature space; invalid neighbors stay missing."""
    lon, lat = np.meshgrid((np.arange(width) + .5) * 360 / width - 180,
                          90 - (np.arange(width // 2) + .5) * 360 / width)
    x, y = Transformer.from_crs(CRS.from_epsg(4326), crs, always_xy=True).transform(lon, lat)
    finite = np.isfinite(x) & np.isfinite(y)
    cols = np.where(finite, (x - x0) / dx, -1)
    rows = np.where(finite, (y - y0) / dy, -1)
    coordinates = np.array([rows, cols])
    quality = map_coordinates(valid.astype(np.float32), coordinates, order=1, mode='constant', cval=0, prefilter=False)
    measured = map_coordinates(np.where(valid, values, 0).astype(np.float32), coordinates, order=1, mode='constant', cval=0, prefilter=False)
    return measured, finite & (quality > .999)


def thermal_rgba(kelvin, valid):
    grey = np.rint(np.clip((303.15 - kelvin) / 110, 0, 1) * 255).astype(np.uint8)
    rgba = np.zeros((*grey.shape, 4), dtype=np.uint8)
    rgba[..., :3] = grey[..., None]
    rgba[..., 3] = np.where(valid, 255, 0)
    rgba[~valid] = 0
    return rgba


def scaled(dataset):
    return dataset[...].astype(np.float32) * dataset.attrs.get('scale_factor', 1) + dataset.attrs.get('add_offset', 0)


def text_attr(value):
    return value.decode() if isinstance(value, bytes) else str(value)


def decode_goes(filename):
    with h5py.File(filename) as record:
        start = date(text_attr(record.attrs['time_coverage_start']))
        end = date(text_attr(record.attrs['time_coverage_end']))
        band = int(np.asarray(record['band_id'][...]).item())
        if band != 13:
            raise ValueError('Wrong ABI band')
        values = scaled(record['CMI'])
        valid = (record['DQF'][...] == 0) & (record['CMI'][...] != record['CMI'].attrs['_FillValue'])
        valid &= np.isfinite(values) & (values > 150) & (values < 350)
        projection = record['goes_imager_projection'].attrs
        height = float(projection['perspective_point_height'].item())
        crs = CRS.from_proj4(f"+proj=geos +h={height} +lon_0={float(projection['longitude_of_projection_origin'].item())} +a={float(projection['semi_major_axis'].item())} +b={float(projection['semi_minor_axis'].item())} +sweep={text_attr(projection['sweep_angle_axis'])}")
        x, y = scaled(record['x']) * height, scaled(record['y']) * height
        field, coverage = sample_grid(values, valid, crs, x[0], y[0], float(x[1] - x[0]), float(y[1] - y[0]))
    return thermal_rgba(field, coverage), start, end


def goes(satellite, instant, cache):
    errors = []
    for url, start, end in goes_candidates(satellite, instant, cache)[:3]:
        key = hashlib.sha256(url.encode()).hexdigest()
        image = cache / (key + '-numeric-v1.png')
        try:
            if not image.exists():
                source = download(url, cache, '.nc', timeout=12, retries=2)
                rgba, actual_start, actual_end = decode_goes(source)
                if abs(actual_start - start) > timedelta(seconds=1) or abs(actual_end - end) > timedelta(seconds=1):
                    raise ValueError('ABI observation clock mismatch')
                save_image(image, rgba)
                source.unlink(missing_ok=True)
            return image, {'id': satellite, 'method': 'ABI-L2-CMI-C13', 'start': iso(start), 'end': iso(end), 'url': url}
        except Exception as error:
            errors.append(str(error))
    raise ValueError(satellite + ': ' + '; '.join(errors or ['No completed recent scan']))


def save_image(filename, rgba):
    temporary = filename.with_name(filename.name + f'.{os.getpid()}.tmp')
    Image.fromarray(rgba).save(temporary, format='PNG')
    temporary.replace(filename)


def himawari(instant, cache):
    # A full disk takes ten minutes. Require all ten named segments before decoding.
    from satpy import Scene
    errors = []
    first = instant.replace(second=0, microsecond=0, minute=(instant.minute // 10) * 10) - timedelta(minutes=10)
    for offset in range(9):
        start = first - timedelta(minutes=10 * offset)
        if instant - start > MAX_AGE:
            break
        prefix = start.strftime('AHI-L1b-FLDK/%Y/%m/%d/%H%M/')
        image = cache / (start.strftime('himawari9-%Y%m%d%H%M') + '-numeric-v1.png')
        end = start + timedelta(minutes=10)
        observation = {'id': 'himawari9', 'method': 'AHI-HSD-B13', 'start': iso(start), 'end': iso(end), 'url': 'https://noaa-himawari9.s3.amazonaws.com/' + prefix}
        if image.exists():
            return image, observation
        try:
            names = [f'HS_H09_{start:%Y%m%d_%H%M}_B13_FLDK_R20_S{segment:02d}10.DAT.bz2' for segment in range(1, 11)]
            keys = listing('noaa-himawari9', prefix, cache)
            if not all(prefix + name in keys for name in names):
                continue
            with tempfile.TemporaryDirectory(dir=cache) as directory:
                def get(name):
                    source = download(observation['url'] + name, cache, '.bz2', timeout=12, retries=2)
                    target = Path(directory) / name
                    source.replace(target)
                    return str(target)
                with ThreadPoolExecutor(max_workers=5) as pool:
                    files = list(pool.map(get, names))
                scene = Scene(reader='ahi_hsd', filenames=files, reader_kwargs={'mask_space': True})
                scene.load(['B13'], calibration='brightness_temperature')
                band = scene['B13']
                area = band.attrs['area']
                values = band.data.compute(scheduler='single-threaded')
                actual_start = band.attrs['start_time'].replace(tzinfo=UTC)
                actual_end = band.attrs['end_time'].replace(tzinfo=UTC)
                if abs(actual_start - start) > timedelta(minutes=1) or actual_end > end + timedelta(seconds=1):
                    raise ValueError('HSD observation clock mismatch')
                left, bottom, right, top = area.area_extent
                dx, dy = (right - left) / area.width, (bottom - top) / area.height
                valid = np.isfinite(values) & (values > 150) & (values < 350)
                field, coverage = sample_grid(values, valid, area.crs, left + dx / 2, top + dy / 2, dx, dy)
                save_image(image, thermal_rgba(field, coverage))
            return image, observation
        except Exception as error:
            errors.append(str(error))
    raise ValueError('himawari9: ' + '; '.join(errors or ['No complete recent disk']))


def eum(satellite, instant, cache):
    layer = 'msg_iodc:ir108' if satellite == 'meteosat-iodc' else 'mtg_fd:ir105_hrfi'
    xml = download(EUM + '?service=WMS&version=1.3.0&request=GetCapabilities', cache, '.xml', max_age=120, timeout=8, retries=2, stale_metadata=True)
    root = ET.parse(xml).getroot()
    matching = [node for node in root.findall('.//{*}Layer') if node.find('{*}Name') is not None and node.find('{*}Name').text == layer]
    if not matching:
        raise ValueError('Missing EUMETSAT layer')
    periods = next(node.text for node in matching[0].findall('{*}Dimension') if node.attrib.get('name') == 'time')
    candidates = []
    for period in periods.split(','):
        first, last, step = period.strip().split('/')
        first, last = date(first), date(last)
        cadence = timedelta(minutes=int(re.fullmatch(r'PT(\d+)M', step).group(1)))
        candidate = first + ((min(instant, last) - first) // cadence) * cadence
        if candidate >= first and instant - candidate <= MAX_AGE:
            candidates.append(candidate)
    if not candidates:
        raise ValueError('No recent EUMETSAT observation')
    errors = []
    cadence = timedelta(minutes=15 if satellite == 'meteosat-iodc' else 10)
    # EUMETView labels the scan. Require its full acquisition interval to fit
    # before the selected time, and try earlier real scans on a missing map.
    latest = min(max(candidates), instant - cadence)
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    latest = epoch + ((latest - epoch) // cadence) * cadence
    for offset in range(3):
        observed = latest - offset * cadence
        if instant - observed > MAX_AGE:
            break
        query = {'service': 'WMS', 'request': 'GetMap', 'version': '1.3.0', 'layers': layer, 'styles': '', 'format': 'image/png', 'crs': 'EPSG:4326', 'bbox': '-90,-180,90,180', 'width': WIDTH, 'height': WIDTH // 2, 'transparent': 'true', 'time': iso(observed)}
        url = EUM + '?' + urllib.parse.urlencode(query)
        try:
            source = download(url, cache, '.png', timeout=8, retries=1)
            with Image.open(source) as image:
                if image.size != (WIDTH, WIDTH // 2):
                    raise ValueError('Wrong EUMETSAT dimensions')
                rgba = np.asarray(image.convert('RGBA')).copy()
            # These products are monotonic greyscale, with alpha for missing data.
            if np.max(np.abs(rgba[..., 0].astype(int) - rgba[..., 1])) > 1 or np.max(np.abs(rgba[..., 1].astype(int) - rgba[..., 2])) > 1:
                raise ValueError('EUMETSAT infrared is no longer greyscale')
            if (rgba[..., 3] > 200).mean() < .05:
                raise ValueError('Empty EUMETSAT scan')
            return source, {'id': satellite, 'method': layer, 'start': iso(observed), 'end': iso(observed + cadence), 'url': url}
        except Exception as error:
            errors.append(str(error))
    raise ValueError(satellite + ': ' + '; '.join(errors))


def prepare(instant, cache, output):
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    layers, observations, errors = [None] * 10, [None] * 10, []
    # The slower display service must not hold up fresh numerical satellites.
    previous_handler = signal.signal(signal.SIGALRM, deadline)
    pool = ThreadPoolExecutor(max_workers=2)
    pending = {satellite: pool.submit(eum, satellite, instant, cache) for satellite in IDS[3:]}
    # Native arrays can exceed 100 MB each; decode one full disk at a time.
    for index, satellite in enumerate(IDS, 5):
        signal.setitimer(signal.ITIMER_REAL, 50)
        try:
            filename, observation = (goes(satellite, instant, cache) if satellite.startswith('goes') else himawari(instant, cache) if satellite == 'himawari9' else pending[satellite].result())
            if date(observation['end']) > instant or instant - date(observation['start']) > MAX_AGE:
                raise ValueError('Observation outside allowed time window')
            with Image.open(filename) as image:
                if image.size != (WIDTH, WIDTH // 2):
                    raise ValueError('Wrong projected satellite dimensions')
                alpha = image.convert('RGBA').getchannel('A').histogram()
                if sum(alpha[201:]) < WIDTH * (WIDTH // 2) * .05:
                    raise ValueError('Satellite has no usable measured footprint')
            target = output / f'{index}.png'
            target.write_bytes(filename.read_bytes())
            layers[index], observations[index] = str(target), observation
        except (Exception, SourceDeadline) as error:
            errors.append({'id': satellite, 'error': str(error)})
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
    pool.shutdown(wait=True)
    signal.signal(signal.SIGALRM, previous_handler)
    if sum(layer is not None for layer in layers) < 3:
        raise ValueError('Too few measured satellite fields: ' + json.dumps(errors))
    result = {'time': iso(instant), 'layers': layers, 'observations': observations, 'sourceTimes': [x['start'] if x else None for x in observations], 'errors': errors}
    (output / 'sources.json').write_text(json.dumps(result))
    # Bounded local cache, never an accumulating copy of the native satellite archive.
    for entry in cache.iterdir():
        if entry.is_file() and time.time() - entry.stat().st_mtime > 30 * 3600:
            entry.unlink(missing_ok=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--time', required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(date(args.time), args.cache, args.output)))
