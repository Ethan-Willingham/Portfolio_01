# Daylight Globe NOAA fixtures

These JSON files contain authentic NOAA service responses fetched on October 4, 2026. Only whitespace was removed when copying them into the repository.

- [OVATION source](https://services.swpc.noaa.gov/json/ovation_aurora_latest.json), fetched at 23:51:04 UTC. Observation 23:38 UTC, forecast October 5 at 00:27 UTC. The full grid contains 65,160 points and a maximum modeled probability of 41 percent.
- [Kp source](https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json), fetched in the same session. The last interval begins October 4 at 18:00 UTC and has Kp 5.67.

Raw responses and HTTP headers are retained in the main checkout's ignored `research/daylight-live/fixtures/` folder. Run `node tools/test-globe-data.cjs` to test the parsers against these files and to check timeout, failure, cache and imagery-date behavior.
