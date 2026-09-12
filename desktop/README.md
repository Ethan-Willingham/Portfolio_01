# Sluice desktop prototype

This packages the same game as the website with Electron 44.3.0. It includes the
game, fonts, art, music, and sound effects for offline play. The portfolio page and
analytics are removed during staging. The renderer has no Node access; it loads
only the bundled game through a local secure protocol.

Install Node 22.12 or newer, then run these commands from `desktop`:

```text
npm ci
npm run install-runtime
npm start
```

To create the portable Windows folder:

```text
npm run package
```

Open `dist/Sluice-win32-x64/Sluice.exe`. Keep the other files beside it. F11 toggles
the desktop window's fullscreen mode; the in-game fullscreen button also works.
Saves and options persist under `%APPDATA%/Sluice`, separately from the browser.
The generated `stage` and `dist` directories are replaced on each build.

This is a runtime comparison build, not a finished Steam release. It has no
Steamworks integration, installer, signing, achievements, cloud saves, or
Steam Deck compatibility result yet. Windows Steam distribution does not require
Proton. Proton is the compatibility layer that can run this Windows build on
SteamOS; that needs a separate test on the target hardware.

Development measurements can run `tools/perf/audit-sluice.mjs` with `ELECTRON=1`.
The audit uses its own profile and local server. Packaged builds reject the audit
server option. See the performance report in `docs/game` for measured results.
