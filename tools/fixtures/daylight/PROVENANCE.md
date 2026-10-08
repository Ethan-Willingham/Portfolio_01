# Daylight Globe NOAA fixtures

These JSON files contain authentic NOAA service responses fetched on October 4, 2026. Only whitespace was removed when copying them into the repository.

- [OVATION source](https://services.swpc.noaa.gov/json/ovation_aurora_latest.json), fetched at 23:51:04 UTC. Observation 23:38 UTC, forecast October 5 at 00:27 UTC. The full grid contains 65,160 points and a maximum modeled probability of 41 percent.
- [Kp source](https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json), fetched in the same session. The last interval begins October 4 at 18:00 UTC and has Kp 5.67.

Raw responses and HTTP headers are retained in the main checkout's ignored `research/daylight-live/fixtures/` folder. Run `node tools/test-globe-data.cjs` to test the parsers against these files and to check timeout, failure, cache and imagery-date behavior.

`thermal-cold-grey-codes.png` is a lossless 256 by 128 crop of NASA GIBS's Himawari AHI Band 13 GetMap response for October 5, 2026 at 23:40 UTC, fetched on October 6. The original map is 2048 by 1024, with EPSG:4326 extent -180, -90, 180, 90. The crop begins at pixel 1780, 390. Its cold storm core contains grey palette codes also used for warmer temperatures. The regression checks those actual pixels and preserves missing-data alpha. This is a decoding fixture, not a site texture.

The `cloud-cutoff-visible.png` and `cloud-cutoff-infrared.png` fixtures are unmodified 256 by 128 crops of lossless NASA Himawari GetMap responses fetched on October 8, 2026. The visible observation is 03:20 UTC and infrared is 03:30 UTC. Request details and crop coordinates are in `cloud-cutoff.source.json`. They reproduce the reported western Pacific cutoff, including visible warm clouds lost by infrared-only rendering and native black ocean incorrectly treated as missing in JPEG. These are regression fixtures, not site textures.
