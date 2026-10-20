# Widewake desktop

This builds the Bracken Reach campaign into an offline application. It has the
approved title, full screen and Quit. Voyages last for the current application
session; quitting starts fresh next time. Saving and file actions are disabled. The isolated
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

## Sessions and transitions

The owner disabled saving in v0.25.6. New voyage starts at Tern Yard; pause,
returning to the title and returning from endgame combat retain the live voyage
in memory. Quit and relaunch start fresh. There are no native import/export
pickers or save-on-close handshake. Existing local save slots are untouched.

The stable `widewake://game` origin and the `Widewake` application-data directory
still hold audio and accessibility preferences. Only one instance owns a profile.
Full-screen, show and restore transitions resynchronize the activity scheduler
with the native window and retain a deliberate game pause. F11 and the native
full-screen button use the application's window.

Native checks cover the sandbox, a worker-plotted route, minimize/pause, endgame
combat and a fresh voyage after quit/relaunch. The current region checks are in
`../docs/WIDEWAKE_REACH.md`. Physical controllers and Steam Input still need
target-device tests.

## Runtime boundary

The [local secure protocol](https://www.electronjs.org/docs/latest/api/protocol)
serves only the staged manifest. There is no development HTTP server or remote
game download in the package. The renderer is sandboxed, with Node disabled,
context isolation enabled and an explicit content policy. Remote requests,
embedded web views and arbitrary downloads are rejected. Only the two authored
credit/site links may open in the system browser. The preload exposes full screen and Quit, without IPC or filesystem access. These choices follow Electron's
[security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Remaining distribution work

Read `ASSETS.md` before distributing binaries. The local Mac application is
unsigned and unnotarized. The Windows executable has not run on Windows hardware.
Linux, Steam Deck, physical controllers, Steam Input, Steamworks achievements,
cloud saves and store/depot integration are unverified or absent. Steam Cloud
should use a deliberate save-file adapter, not synchronize the entire Chromium
profile. Signing, installers, crash reporting and supported-device QA remain
release work. No binary has been uploaded publicly by these scripts.
