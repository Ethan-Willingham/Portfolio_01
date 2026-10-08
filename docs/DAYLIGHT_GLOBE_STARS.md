# Earth Now: measured stars

The sky contains 5,070 actual catalog stars with apparent visual magnitude 6.0 or brighter. It has no added stars or simulated Milky Way band. The uneven distribution comes from the catalog, including real groupings along the Galactic plane. Points are drawn at a readable size; their disk sizes are display choices, not angular diameters.

## Catalog and reproducibility

The input is [HYG Database 4.1 by David Nash / Astronexus](https://github.com/astronexus/HYG-Database), a compilation of Hipparcos, Yale Bright Star and Gliese data. Its [field documentation](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/README.md) identifies the epoch/equinox as J2000.0, `mag` as apparent visual magnitude and `ci` as B-V. The database's [CC BY-SA 4.0 license](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/LICENSE) covers the adapted binary and source manifest. Keep their attribution and license when redistributing the data. The site credits link to the catalog and license and identify the bright-star selection and display conversion.

The builder pins commit `c7f7f883fe678cc7680169a50ccd7dcc49b060ce` and checks the full CSV's SHA-256 before parsing it. It excludes HYG id 0, which represents the Sun, and keeps every remaining row at magnitude 6.0 or brighter. It sorts by magnitude and HYG id. It does not fill gaps or invent coordinates. The generated `assets/data/stars-hyg-v41.bin` is 121,712 bytes, and `stars-hyg-v41.source.json` records the original URL, checksum, selected count, record layout and unquantized source samples.

```sh
node tools/build-globe-stars.cjs
node tools/build-globe-stars.cjs --check
# An already-downloaded copy can be used with the same mandatory hash check:
node tools/build-globe-stars.cjs --source /path/to/hygdata_v41.csv --check
```

The full upstream CSV stays outside the deployed assets. The builder fetches the pinned file into memory by default. It has no external package dependencies. Stars are neither thinned to a uniform distribution nor augmented by random particles.

Each 24-byte little-endian record retains HYG id, J2000 right ascension/declination in Float32 radians, two proper motions in whole milliarcseconds per year, visual magnitude and B-V in thousandths, three display sRGB bytes and a missing-colour flag. The 32-byte header holds magic, version, stride, count, epoch and magnitude limit. The coordinate quantization is smaller than 0.06 arcsecond. The source's higher-precision `rarad`/`decrad` fields are used rather than its shortened decimal hour/degree strings.

## Brightness and colour

The runtime preserves the measured visual magnitudes. `flux(V) = 10^(-0.4 V)` returns relative visual flux, with a magnitude 0 star as 1. A five-magnitude difference is exactly a factor of 100 in catalog flux. The screen rendering deliberately compresses this range: point opacity uses the fourth root of magnitude-derived flux, and point size follows a separate magnitude-based curve. The brightest point opacities are capped. Consequently, neither peak pixel values nor integrated point brightness reproduce those physical flux ratios; these are visibility choices for a finite screen, not calibrated stellar photometry.

B-V informs the colour instead of an assigned random tint. The builder converts the measured index to an approximate blackbody temperature using [Ballesteros (2012), equation 14](https://arxiv.org/html/1201.1809v2). It integrates a Planck spectrum from 380 to 780 nm in 5 nm steps using the [Wyman, Sloan and Shirley CIE 1931 fits, equation 4 and table 1](https://jcgt.org/published/0002/02/01/paper.pdf), then converts XYZ to sRGB. The B-V input for temperature is capped to -0.4 through 2.0; the original B-V is retained unchanged to thousandths. This gives a plausible colour, not a measured full spectrum: reddening, absorption lines, variability, display gamut and visual adaptation are simplified.

The 23 records without B-V keep a missing flag and NaN colour index. Their display colour is neutral. The runtime decodes the stored sRGB bytes to linear RGB and normalizes each to visual luminance 1, so magnitude can control intensity separately. Some linear RGB components consequently exceed 1. The globe renderer bounds those colours by their peak channel and applies an approximate 2.2 gamma for its custom display shader. This preserves the B-V-derived warm/cool relationships while further adjusting their screen brightness.

Stars within roughly four degrees of the Sun are locally dimmed by an illustrative glare curve, strongest within roughly half a degree. Its strength follows the visible, limb-weighted solar flux, so Earth or Moon occlusion reduces the glare. The opaque Sun disk also writes depth and hides stars directly behind it. Glare is a display effect, not a measured camera exposure or a prediction of naked-eye stellar visibility.

## Coordinate transform

`js/globe-stars.js` exposes `window.GlobeStars` and CommonJS, without Three.js or a DOM dependency. Its equatorial input convention is right handed: +X at J2000 RA 0, +Y at RA 6 hours and +Z at the north celestial pole. Hipparcos-derived ICRS directions are treated as mean J2000 directions at this display scale; the small ICRS/FK5 frame bias is omitted.

For the selected UTC instant:

1. Proper motion displaces each J2000 unit vector in its RA and declination tangent directions. HYG `pmra` is the tangential quantity `mu_alpha * cos(delta)`, so it is applied along `[-sin(RA), cos(RA), 0]`. This avoids artificial amplification at the poles. The displaced vector is normalized. Radial perspective acceleration and annual parallax are omitted.
2. The Lieske IAU 1976 precession matrix carries the J2000 mean equator/equinox into the mean equator/equinox of date. Its angles use centuries from JD 2451545.0. The implementation is checked against [ERFA's SOFA-derived `pmat76` reference](https://github.com/liberfa/erfa/blob/master/src/t_erfa_c.c). This low-precision treatment is appropriate over the picker range, 1900 to 2100.
3. Greenwich mean sidereal time uses the IAU 2006 expression in [USNO Circular 179, equations 2.11 and 2.12](https://aa.usno.navy.mil/downloads/Circular_179.pdf). UTC substitutes for UT1 and TT, and nutation and annual aberration are omitted. The small difference between the IAU 1976 precession and IAU 2006 sidereal conventions is accepted at this scale.
4. An equatorial direction of date has geographic longitude `RA(date) - GMST` and latitude equal to declination. Its world direction is `x = cos(dec) cos(lon)`, `y = sin(dec)`, `z = -cos(dec) sin(lon)`. Greenwich is +X, north +Y and east longitude -Z, matching the existing Earth texture.

[USNO defines sidereal time](https://aa.usno.navy.mil/data/siderealtime) as the right ascension crossing a meridian. Thus RA equal to GMST must lie on Greenwich's meridian, and RA six hours larger must lie 90 degrees east. The tests independently enforce those two signs, north-pole alignment, the approximately 0.986-degree westward advance in one solar day and preserved constellation separations. Changing a camera view changes which stars are visible; changing the selected UTC instant changes their orientation against Earth.

The sky sphere should follow the camera's position, retaining its Earth-oriented directions, to approximate stars at infinity. A finite sphere centered on Earth would introduce false stellar parallax when the user orbits or zooms. The catalog is geocentric; it does not model surface refraction or supply telescope pointing coordinates.

## Renderer API

```js
const catalog = await GlobeStars.load('assets/data/stars-hyg-v41.bin', { signal });
// Float32Array of XYZ, scaled to radius; use the selected actual UTC date.
const positions = GlobeStars.worldPositions(catalog, selectedDate, skyRadius);
// Reuse the geometry buffer when the selected date changes:
GlobeStars.worldPositions(catalog, selectedDate, skyRadius, positions);
```

`catalog` exposes `count`, `ids`, `ra`, `dec`, `pmRa`, `pmDec`, `magnitudes`, `colorIndices`, `missingColor` and `colors`. `colors` is linear RGB, three components per star. Data is already sorted brightest first. `earthFrame(date)` returns a row-major 3 by 3 J2000-to-world rotation matrix, useful when the renderer manages a rotating celestial group. `precessionMatrix(date)`, `gmstRadians(date)` and `julianDate(date)` are available for verification. `decode(ArrayBufferOrView)` validates the binary locally; `load()` rejects missing or malformed data rather than replacing it with illustrative stars.

```sh
node --check js/globe-stars.js
node --check tools/build-globe-stars.cjs
node tools/test-globe-stars.cjs
```

The tests use literal upstream HYG values for Sirius, Vega, Betelgeuse and Polaris, independently published ERFA GMST and all nine precession matrix values, frame orientation and rotation cases, proper motion near the pole, whole-catalog sphere invariants, magnitude/colour properties, inclusion rules, corrupt-file rejection and a mocked loader. `stars-erfa-LICENSE.txt` preserves attribution and terms for the reproduced numerical ERFA fixtures. A separate `--check` rebuild proves byte-for-byte catalog reproducibility from the pinned source.
