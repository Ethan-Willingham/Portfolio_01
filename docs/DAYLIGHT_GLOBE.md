# Daylight Globe

The page combines a recent daily satellite mosaic with calculated current sunlight, historical city lights and NOAA's short-term aurora forecast. These datasets have separate clocks, shown on the page. It remains a static GitHub Pages application with locally vendored Three.js r128 and no new runtime library.

## Imagery and gaps

NASA GIBS WMS `best` supplies separate NOAA-21 and NOAA-20 VIIRS corrected-reflectance true-color PNGs. Requests use an explicit UTC day, `EPSG:4326`, WMS 1.3.0 latitude-first bounds `-90,-180,90,180`, and a two-to-one image. The previous completed UTC day is tried first, with at most three earlier days on failure. There is no instantaneous whole-Earth satellite photograph.

The PNGs have opaque black fill, even with transparency requested. Stacking their WMS layers hides lower imagery. The browser instead selects NOAA-21's non-black pixel, then NOAA-20's pixel for the same date. Where both are exact black, the reference map appears muted and hatched. This is a conservative display heuristic, not a science-quality instrument mask. It can exclude real exact-black pixels. No older clouds are used to fill another day's photo. Maps below 15 percent valid display coverage are rejected.

Completed-day PNG responses use Cache Storage, with at most 16 entries across dates, instruments and resolutions. Failed storage is harmless. Invalid images are evicted. Cache-only reads make no network requests offline. Network requests time out, and the local globe continues while data load. Photos use 4096 by 2048 on desktop and 2048 by 1024 on phones, capped by WebGL maxTextureSize. Textures use no mipmaps and obsolete GPU textures are disposed.

Night lights are the static NASA Black Marble annual 2016 composite, fetched from `VIIRS_Black_Marble` for `2016-01-01`. The asset's `.source.json` records the exact request and credits. It does not show current lights. NASA's VIIRS imagery combines successive orbital swaths, so the photograph represents different acquisition times across the globe.

Sources: [GIBS API](https://nasa-gibs.github.io/gibs-api-docs/), [time dimensions](https://nasa-gibs.github.io/gibs-api-docs/access-basics/), [latency](https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/), [VIIRS processing tutorial](https://directreadout.sci.gsfc.nasa.gov/publications_documents/VIIRS_True_Color_Tutorial_v1.0.pdf), [Black Marble](https://www.nasa.gov/image-article/black-marble-our-planet-brilliant-darkness/).

## Aurora and Kp

OVATION provides a one-degree grid, 360 longitudes and 181 latitudes, with separate Observation Time and Forecast Time. The parser validates complete coverage, uniqueness, finite coordinates, probabilities and timestamp order. Longitude wraps and sampling is bilinear. The renderer samples node coordinates at texture pixel centers, including both polar rows, so the glow and pin sampler use the same geographic footprint. Its percentage is modeled probability overhead, not a person's probability of seeing aurora through clouds or local lights.

The glow is an illustration on elevated spherical shells. It preserves the probability footprint, suppresses daytime light and does not invent high-resolution meteorological structure. An unlisted noindex lab compares four treatments with the same grid. The default is restrained layered glow.

The application accepts observations at most three hours old or five minutes ahead, and forecasts at most 90 minutes old or two hours ahead. These conservative freshness limits are application decisions. Stale glow disappears and the text says unavailable. Explore hides the current forecast rather than placing it over an unrelated time. The Kp readout retains its own UTC interval and is not used to generate the oval.

NOAA says bright aurora can sometimes be seen about 600 miles away. The pin reports nearby modeled cells above a 10 percent display threshold as a distance, independently of overhead probability. This threshold is a presentation decision, not a NOAA viewing guarantee. Daylight and twilight messages qualify visibility. The authentic October 4 fixture has Kp 5.67 and maximum modeled probability 41 percent. No storm grade is inferred from the rounded Kp value.

Sources: [NOAA aurora product](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast), [viewing guidance](https://www.swpc.noaa.gov/content/tips-viewing-aurora), [planetary Kp](https://www.swpc.noaa.gov/products/planetary-k-index).

## Astronomy and clocks

[Math notes](DAYLIGHT_GLOBE_MATH.md) document the NOAA Meeus solar equations, minus 0.833 degree sunrise horizon, polar transitions, Schlyter lunar orbit with perturbations, and independent reference fixtures. Current Earth uses its date-specific obliquity. Explicit alternate tilts are hypothetical and use the reference map. At 45 degrees the Moon is hidden. Lunar direction and illumination follow the actual instant. Orbital distance is compressed; the actual solar light is transported into the compressed display frame to preserve the physical phase from the camera position. Surface libration is omitted.

The reader's clock and Explore use the browser's civil zone and Intl, including daylight saving. Arbitrary geographic pins use explicitly labeled local apparent solar time. Exact civil boundary data evaluated during research was about 12 MB compressed, while compact approximate lookup admits materially wrong offsets. Solar time includes longitude and the equation of time; it is not civil time. Sunrise and sunset use the same stated clock basis as the pin.

## Controls and accessibility

Live is the default and keeps advancing. Opening Explore preserves Live. Changing the date, hour or tilt leaves Live; Return to live restores the current instant and physical tilt. Dragging, zooming, pinning and fullscreen preserve the astronomical state. The pin has four semantic facts: solar time, daylight, sunrise/sunset, aurora. A polite text summary updates after mode, source or pin changes rather than every animation frame.

With the globe focused, arrows rotate, plus/minus zoom, Enter pins the center and Escape leaves fullscreen before clearing a pin. The controls have explicit labels and 44-pixel targets. Native fullscreen has a CSS fallback. Rendering stops in a hidden or offscreen tab, resumes on return, and animation remains enabled for every reader by owner instruction.

## Verification

Run:

```sh
node --check js/globe.js
node tools/test-globe-math.cjs
node tools/test-globe-data.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-globe-browser.cjs
NODE_PATH=/path/to/playwright/node_modules REAL_DATA=1 node tools/test-globe-browser.cjs
```

The browser harness owns `/Users/ethan/.local/bin/agent-chrome-for-testing`, passes `--disable-gpu-vsync --disable-frame-rate-limit`, and closes that exact browser in `finally`. It does not touch personal Chrome. Browser offline mode, a cached offline shell, a fresh blocked external network, and damaged PNG decoding are separate checks. Cached offline reload assumes the HTML and local assets remain available; this static page has no service worker for cold offline navigation. Its private state hooks are injected by the local test server and never shipped. `DUMP` selects an absolute evidence folder. The default run uses deterministic imagery and the authentic dated NOAA storm fixture; `REAL_DATA=1` fetches live upstream imagery and NOAA data. Both exercise 375, 768 and 1440 widths, Explore, pinning, polar night, return to Live, fullscreen, freshness and offline behavior. Math tests use 33 independent NOAA cases, 25 published USNO Moon phases and 24 independent lunar ephemerides. Maximum observed differences in those fixtures are 0.114 seconds for solar horizon events, 9.26 minutes for lunar phase instants and 0.0705 degrees for the Moon direction. These are agreement with the stated reference calculations, not observational atmospheric guarantees.

The local research folder holds source responses, baseline, design decisions, six or more panel reviews, polish logs and completion audit evidence. It is ignored by Git and does not ship with the site.
