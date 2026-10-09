"""Regression against the native measurements behind the reported Gulf hole."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import h5py
import numpy as np

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('numeric', ROOT / 'globe-numeric-clouds.py')
numeric = importlib.util.module_from_spec(spec)
spec.loader.exec_module(numeric)
FIXTURE = ROOT / 'fixtures/daylight/cloud-numeric'


class NumericClouds(unittest.TestCase):
    def test_actual_cold_core_is_cloud_instead_of_black_hole(self):
        source = json.loads((FIXTURE / 'source.json').read_text())
        filename = FIXTURE / source['file']
        self.assertEqual(hashlib.sha256(filename.read_bytes()).hexdigest(), source['sha256'])
        rgba, start, end = numeric.decode_goes(filename)
        self.assertEqual(numeric.iso(start), '2026-10-09T12:10:21.400Z')
        self.assertEqual(numeric.iso(end), '2026-10-09T12:19:53.400Z')
        # In the old display-palette inversion these actual pixels decoded as 0.
        for lat, lon in [(28.037109375, -87.626953125), (27.685546875, -87.802734375), (27.158203125, -88.330078125)]:
            row, col = int((90 - lat) / 360 * 2048), int((lon + 180) / 360 * 2048)
            self.assertGreater(rgba[row, col, 0], 235)
            self.assertEqual(rgba[row, col, 3], 255)
        self.assertEqual(rgba[0, :, 3].max(), 0, 'No extrapolation into unobserved polar pixels')

    def test_quality_flags_and_fill_are_missing_not_white_cloud(self):
        source = json.loads((FIXTURE / 'source.json').read_text())
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'bad.nc'
            target.write_bytes((FIXTURE / source['file']).read_bytes())
            with h5py.File(target, 'r+') as record:
                record['DQF'][...] = 3
            rgba, _, _ = numeric.decode_goes(target)
            self.assertEqual(rgba[..., 3].max(), 0)
            with h5py.File(target, 'r+') as record:
                record['DQF'][...] = 0
                record['CMI'][...] = -1
            rgba, _, _ = numeric.decode_goes(target)
            self.assertEqual(rgba[..., 3].max(), 0)

    def test_temperature_has_no_wrap_or_palette_branch(self):
        kelvin = np.arange(180, 340, .125, dtype=np.float32)[None, :]
        grey = numeric.thermal_rgba(kelvin, np.ones_like(kelvin, dtype=bool))[0, :, 0].astype(int)
        self.assertTrue(np.all(np.diff(grey) <= 0))
        self.assertLessEqual(np.abs(np.diff(grey)).max(), 1)
        self.assertEqual(grey[0], 255)
        self.assertEqual(grey[-1], 0)

    def test_bilinear_resampling_does_not_mix_fill_into_measurements(self):
        values = np.full((10, 20), 250, dtype=np.float32)
        valid = np.ones_like(values, dtype=bool)
        valid[4:6, 9:11] = False
        values[~valid] = -9999
        field, coverage = numeric.sample_grid(values, valid, numeric.CRS.from_epsg(4326), -171, 81, 18, -18, width=40)
        self.assertTrue(np.allclose(field[coverage], 250))
        self.assertFalse(coverage[9:11, 19:21].any())

    def test_one_stalled_satellite_cannot_discard_other_regions(self):
        originals = numeric.goes, numeric.himawari, numeric.eum
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            image = root / 'field.png'
            numeric.Image.new('RGBA', (2048, 1024), (150, 150, 150, 255)).save(image)
            instant = numeric.date('2026-10-09T12:20Z')
            def available(satellite, *_):
                if satellite == 'goes18':
                    raise numeric.SourceDeadline('Fixture stalls GOES West')
                return image, {'id': satellite, 'start': '2026-10-09T12:10:00.000Z', 'end': numeric.iso(instant)}
            try:
                numeric.goes = numeric.eum = available
                numeric.himawari = lambda *args: available('himawari9')
                result = numeric.prepare(instant, root / 'cache', root / 'out')
                self.assertIsNone(result['layers'][5])
                self.assertEqual(sum(x is not None for x in result['layers']), 4)
                self.assertEqual(result['sourceTimes'][6], '2026-10-09T12:10:00.000Z')
                self.assertEqual(result['errors'][0]['id'], 'goes18')
            finally:
                numeric.goes, numeric.himawari, numeric.eum = originals

    def test_scan_discovery_never_looks_into_future_or_waits_for_other_satellites(self):
        original = numeric.listing
        numeric.listing = lambda *args: [
            'ABI-L2-CMIPF/2026/282/12/OR_ABI-L2-CMIPF-M6C13_G19_s20262821210214_e20262821219534_c20262821220000.nc',
            'ABI-L2-CMIPF/2026/282/12/OR_ABI-L2-CMIPF-M6C13_G19_s20262821220214_e20262821229534_c20262821230000.nc']
        try:
            available = numeric.goes_candidates('goes19', numeric.date('2026-10-09T12:20Z'), Path('/tmp'))
            self.assertEqual(len(available), 1)
            self.assertIn('_s20262821210', available[0][0])
            self.assertEqual(numeric.goes_candidates('goes19', numeric.date('2026-10-09T15:00Z'), Path('/tmp')), [])
        finally:
            numeric.listing = original


if __name__ == '__main__':
    unittest.main()
