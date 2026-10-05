# Daylight Globe

The globe combines dated EUMETSAT satellite imagery, calculated sunlight, historical city lights and NOAA's short-term aurora forecasts. Each source keeps its own clock. The time controls select actual dated images and saved forecast grids where available. The site remains static, with locally vendored Three.js r128 and no new runtime library.

## Satellite clouds and their history

EUMETView WMS provides the multimission `mumi:wideareacoverage_rgb_natural` and `mumi:worldcloudmap_ir108` products. Both have three-hour UTC frames. Their advertised common archive begins June 6, 2021. GetCapabilities supplies the available start, end and cadence; the browser validates their shared timestamp phase and requests a common frame at or before the chosen time. It never requests future imagery. Source availability can have gaps despite an advertised time interval.

Requests use WMS 1.3.0, `EPSG:4326`, latitude-first bounds `-90,-180,90,180`, exact ISO timestamps including milliseconds and a two-to-one PNG. Unlike the earlier opaque-black NASA images, these products provide meaningful alpha for missing coverage. Transparent polar caps and gaps show the reference map with restrained hatching. No clouds are invented to cover the poles. A decoded image must have at least 15 percent fully opaque coverage; damaged or empty responses are evicted.

Natural-colour RGB contains enhanced multispectral colours, including cyan ice clouds. It is not an ordinary true-colour photograph. The shader uses the Sun at the source frame's time to select its illuminated portion; infrared supplies the remaining observed image. It then applies sunlight for the reader's selected instant. Infrared measures thermal brightness, including cold ground, rather than a precise cloud fraction. Its nighttime image is faintly visible beneath the aurora, with the separate 2016 city lights. The image timestamp is a composite frame time, not a claim that every satellite pixel was acquired simultaneously or at the current second.

Live checks metadata every ten minutes and requests a newly published frame. Cloud images update every three hours at the source, with processing latency. An image more than five hours behind the real clock is not accepted as the primary Live source. Phones request 1024 by 512; desktop requests 2048 by 1024. Higher source resolution was tested, but a 4096 by 2048 natural-colour PNG was about 10.8 MB and one request exceeded 45 seconds. The chosen sizes make repeated time changes practical and remain below the device's WebGL texture limit. There is no fabricated movement between frames.

Cache Storage retains at most 32 exact cloud responses across source, time and resolution. Reloading or returning to a frame reuses its bytes. The last valid catalog is stored locally for cache-only offline use. Storage errors are harmless. Requests have deadlines and abort signals; a generation check prevents late imagery from overwriting a later slider selection. The controls update sunlight immediately and fetch dated weather after a short input debounce.

If the primary source fails, NASA GIBS supplies separately dated NOAA-21 and NOAA-20 VIIRS corrected-reflectance images. Live tries the previous completed UTC day and at most three earlier days; Explore requests its selected day. The label explicitly identifies this daily fallback. The PNGs contain opaque black fill, so the conservative display mask selects a non-black NOAA-21 pixel, then NOAA-20 for the same date. Exact-black pixels are treated as missing; this heuristic is not an instrument quality mask. No older cloud image fills another day's gaps. Completed-day responses have a separate bounded 16-entry cache. The local reference globe remains available when both services fail.

Sources: [EUMETView](https://view.eumetsat.int/), [EUMETView API resources](https://user.eumetsat.int/data-access/eumetview/resources), [June 2024 EUMETSAT data policy](https://www-cdn.eumetsat.int/files/2024-07/45173%20-%20Data%20Policy%281419774%20V1%29.pdf), [GIBS API](https://nasa-gibs.github.io/gibs-api-docs/). EUMETSAT Advanced Image Products permit CC BY 4.0 reuse; the page credits modified EUMETSAT data and the NOAA/JMA contributions to the multimission imagery.

Night lights are the static NASA Black Marble annual 2016 composite, fetched from `VIIRS_Black_Marble` for `2016-01-01`. Its asset sidecar records the request and credits. It does not show current lights. [Black Marble source](https://www.nasa.gov/image-article/black-marble-our-planet-brilliant-darkness/).

## Aurora, replay and visibility

OVATION provides 65,160 geographic values: a one-degree grid with 360 longitudes and 181 latitudes, plus Observation Time and Forecast Time. The parser validates every cell, uniqueness, finite coordinates, probability range and valid UTC times. Pin sampling is bilinear with longitude wrapping. The GPU texture has two padded seam columns and ClampToEdge, so its 362 by 181 non-power-of-two dimensions work in WebGL1 as well as WebGL2. Geographic node centres, both polar rows and the duplicate seam are independently tested against raw source coordinates.

The glow illustrates the stronger forecast above a 10 percent display threshold. Raw values below that threshold remain available in the pin. This global threshold suppresses weak equatorial and singular-pole traces present in actual NOAA responses; no geographic latitude cutoff is imposed. Narrow elevated shells, a linear probability scale and restrained curtain modulation replace the earlier broad haze and boosted low probabilities. Curtain detail and motion are illustrative, not a high-resolution observation of individual auroral rays. An unlisted noindex lab retains the four visual alternatives, with narrow curtains selected provisionally.

Live fetches NOAA every minute. It accepts observations at most three hours old or five minutes ahead, and forecasts at most 90 minutes old or two hours ahead. These are application freshness limits. Stale glow disappears and is labeled unavailable. Kp retains its own three-hour interval and is not used to manufacture the oval. Hypothetical tilts hide weather and use the reference map.

NOAA's public geographic JSON provides the latest forecast only. Its rolling image animation is not a historic numeric grid API. `tools/archive-globe-aurora.cjs` therefore preserves genuine fetched grids as compact, lossless, gzip JSON, retaining 30 days. The manifest records both source timestamps and SHA-256 of each saved file. Initial history contains authentic snapshots collected during development, beginning with observations on October 4, 2026 at 23:38 UTC; coverage initially has gaps.

A narrowly scoped GitHub Actions workflow captures a fresh grid at minutes 17 and 47 each hour. It validates freshness, avoids duplicate writes and commits only the data subtree, with bounded rebase retries. Actual schedule delivery can be delayed. Browser history reads raw files on the repository's main branch, independent of Pages rebuilds; GitHub's five-minute cache can add latency. The static deployed files provide a fallback copy. Each saved frame is about 4 to 6 KB compressed in sampled conditions. Retention deletes current files, while old Git objects remain in repository history.

Explore chooses the saved forecast target closest to the selected instant, within 90 minutes, excluding measurements later than that instant. It labels both the actual forecast target and its input observation time. It does not interpolate forecasts, reuse the current grid for arbitrary dates, or invent history before recording began. Missing history stays unavailable. Native gzip decompression is required for replay; if it is unavailable the rest of the globe continues.

The percentage is NOAA's modeled probability overhead, not a personal chance of seeing it through clouds or city lights. A forecast is also different from a confirmed sighting. NOAA says bright aurora can sometimes be visible roughly 600 miles from its overhead location. Pins separately report distance to nearby cells above 10 percent, with daylight/twilight qualifiers. Clear dark skies, an unobstructed horizon and low light pollution matter; Moonlight can reduce apparent brightness. There is no local cloud fraction or guaranteed naked-eye visibility calculation. The authentic storm fixture has Kp 5.67; no storm grade is inferred by rounding it.

Sources: [NOAA aurora product and model](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast), [ground viewing guidance](https://www.swpc.noaa.gov/content/tips-viewing-aurora), [planetary Kp](https://www.swpc.noaa.gov/products/planetary-k-index), [NOAA's plotting implementation](https://github.com/NOAA-SWPC/OVATION-legacy).

## Astronomy and clocks

[Math notes](DAYLIGHT_GLOBE_MATH.md) document the NOAA Meeus Sun calculation, minus 0.833 degree sunrise horizon, polar transitions, Schlyter lunar orbit with perturbations and independent reference fixtures. The Sun disk follows the same calculated direction that lights Earth, with approximately 0.535 degrees angular diameter. Its distance is compressed. It appears only when the camera faces that direction, and Earth can occult it. On the day-facing opening view, the Sun lies behind the viewer, outside the frame. The background stars are decorative, with readable pixel sizes rather than a star catalog.

Current Earth uses date-specific obliquity. Alternate tilts are hypothetical; the Moon is hidden at 45 degrees. Lunar direction and illumination follow the selected instant. Orbital distance is compressed, with actual solar light transported into the display frame to retain the physical phase from the camera position. Surface libration is omitted.

The reader's clock and Explore use the browser's civil zone and Intl, including daylight saving. Geographic pins use explicitly labeled local apparent solar time, incorporating longitude and the equation of time. Exact civil boundary data evaluated during research was about 12 MB compressed; a compact approximate lookup admitted wrong offsets. Sunrise and sunset use the same stated clock basis as the pin.

## Controls and accessibility

Live is the default and keeps advancing. Explore stays behind one button. Date, time or tilt changes leave Live; Return to live restores the current instant and actual tilt. Dragging, zooming, pinning and fullscreen preserve the astronomical state. The pin has four semantic facts: solar time, daylight, sunrise/sunset and aurora. Its text summary updates after mode, source or pin changes rather than every animation frame.

With the globe focused, arrows rotate, plus/minus zoom, Enter pins the centre and Escape leaves fullscreen before clearing a pin. Controls have explicit labels and 44-pixel targets. Native fullscreen has a CSS fallback. Rendering stops in hidden or offscreen tabs and resumes on return. Animation remains enabled for every reader by owner instruction.

## Verification

```sh
node --check js/globe.js
node --check js/globe-data.js
node tools/test-globe-math.cjs
node tools/test-globe-data.cjs
node tools/test-globe-weather.cjs
node tools/test-globe-archive.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-globe-browser.cjs
NODE_PATH=/path/to/playwright/node_modules node tools/test-globe-timeline.cjs
NODE_PATH=/path/to/playwright/node_modules REAL_DATA=1 node tools/test-globe-timeline.cjs
```

Browser harnesses own `/Users/ethan/.local/bin/agent-chrome-for-testing`, use `--disable-gpu-vsync --disable-frame-rate-limit` and close that exact process in `finally`. Private state hooks are injected only by local test servers. Evidence distinguishes mocked controls/races from actual provider imagery and geographic GPU samples. Tests cover source time selection, genuine historical grids, corrupted or empty data, bounded caches, offline and blocked networking, renderer budgets, projected Sun and star pixels, WebGL1 seams, and 375/768/1440 layouts with enlarged text and fullscreen. Cold offline navigation still needs the local page/assets to be available; no service worker is installed.

Math tests retain 33 independent NOAA solar cases, 25 published USNO lunar phases and 24 lunar ephemerides. Maximum observed fixture differences are 0.114 seconds for solar horizon events, 9.26 minutes for phase instants and 0.0705 degrees for lunar direction. Those are agreement with the stated calculations, not atmospheric or ground-viewing guarantees. Source responses, visual reviews and release evidence are in the ignored `research/daylight-live/cloud-timeline` folder.
