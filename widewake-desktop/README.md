# Widewake desktop

This builds the Bracken Reach campaign into an offline application. It has the
approved title, native import/export dialogs, full screen, Quit, and a separate
saved fleet. New voyage and Continue use the new ocean directly. The isolated
navigation and battle pages remain packaged test harnesses, outside the normal
menu. This is a local release-development build, not a Steam release.
`desktop/` belongs to Sluice and is independent of this directory.

Use Node 22.12 or newer. From `widewake-desktop`:

```sh
npm ci
npm start
npm test
npm run package
```

The package command builds the host platform and architecture. Explicit targets:

```sh
npm run package -- darwin arm64
npm run package -- win32 x64
npm run package -- linux x64
```

Outputs are in `dist/Widewake-<platform>-<arch>/`. Open `Widewake.app` on macOS,
`Widewake.exe` on Windows, or `Widewake` on Linux. Keep the folder's supporting
files together. The build replaces its generated `stage/` and target output;
it does not modify a player profile. Dependencies and the Electron runtime are
pinned in the lockfile. Packaging uses [Electron Packager](https://github.com/electron/packager).
Earlier Mac and Windows packages were built. The v0.22 staging runtime has been
tested on Mac; distributables must be rebuilt to include this campaign.

The packaged Mac executable can run through the same checks:

```sh
WIDEWAKE_DESKTOP_EXECUTABLE="$PWD/dist/Widewake-darwin-arm64/Widewake.app/Contents/MacOS/Widewake" npm test
```

The harness owns and closes its exact application process and uses a temporary
profile. `WIDEWAKE_TEST_OUTPUT` chooses a screenshot/evidence directory. Physical
controller checks and Windows execution remain separate from this Mac result.

## Persistence and transitions

The stable `widewake://game` origin uses Chromium's local storage under the
application-data directory named `Widewake`. Defaults are
`~/Library/Application Support/Widewake` on macOS, `%APPDATA%/Widewake` on Windows,
and the system's application configuration directory on Linux. This is separate
from the website's fleet. Export JSON from either edition and import it into the
other. Version 0.22 uses the `widewake-reach-v1` save namespace and retains old
Earth-world slots for export without loading them as new-region positions.
Version updates retain the same origin
and profile location. Only one instance can own a profile.

Full-screen, show and restore transitions resynchronize the activity scheduler
with the native window. They retain a deliberate game pause.

Portable Bracken Reach saves include movement, cargo, routes, active work,
enemies and projectiles. The shared file limit is 2,000,000 bytes. Native tests
cover export, a rejected old/invalid save, confirmed import, a worker-plotted
route, minimize/pause and quit/relaunch continuation. The current region browser
and core tests are listed in `../docs/WIDEWAKE_REACH.md`.

The OS close button, application Quit and in-game Quit ask the game to save its
current snapshot before closing and flush browser storage. A failed write keeps
the game open by default so the captain can export. If the renderer is unresponsive,
the close request times out into an explicit keep-open/quit choice. Force-killing
the process cannot run this handshake; the last completed automatic save remains
the recovery point. Native pickers report success, cancellation and errors.

F11 and the native full-screen button use the application's window. Minimize,
blur and returning retain the game's activity/pause rules. The standard controller
can reach native import/export and full screen without a browser activation gate.
Its physical hardware and Steam Input behavior still need target-device tests.

## Runtime boundary

The [local secure protocol](https://www.electronjs.org/docs/latest/api/protocol)
serves only the staged manifest. There is no development HTTP server or remote
game download in the package. The renderer is sandboxed, with Node disabled,
context isolation enabled and an explicit content policy. Remote requests,
embedded web views and arbitrary downloads are rejected. Only the two authored
credit/site links may open in the system browser. The preload exposes four
specific actions, not IPC or filesystem access. These choices follow Electron's
[security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Remaining distribution work

Read `ASSETS.md` before distributing binaries. The local Mac application is
unsigned and unnotarized. The Windows executable has not run on Windows hardware.
Linux, Steam Deck, physical controllers, Steam Input, Steamworks achievements,
cloud saves and store/depot integration are unverified or absent. Steam Cloud
should use a deliberate save-file adapter, not synchronize the entire Chromium
profile. Signing, installers, crash reporting and supported-device QA remain
release work. No binary has been uploaded publicly by these scripts.
