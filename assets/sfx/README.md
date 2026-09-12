# Sluice sound bank

162 original procedural sounds across all 84 keys in `js/audio.js`.
Built from filtered noise, modal resonances, motor harmonics, granular debris,
and shaped pitch envelopes. No source recordings or external sound libraries.
The source recipe is `tools/audio/build-sfx.py`; the complete file inventory,
durations, levels and source trail are in `bank.json`.

The live game uses six drill materials, ground machinery, the existing flight
synth, impacts, bombs, slime, selling, UI, alerts, discovery, and nine
ambience beds. The visible jet has a smooth exhaust voice with a
faint motor body, soft start, fast release, and no ignition thump. Releasing
thrust cuts the flame and voice together, even while steering or coasting.
Residual smoke dissipates silently. The jet stays silent
while drilling and moving through a freshly mined block. Its volume
does not increase with airspeed or climb rate. Free fall,
coasting, and water contact are silent; solid landings have one short, damped
impact cue. The old `air-pulse` slot is retired. Drilling uses steady cutting
friction and small fractures without bass sweeps. A full cargo hold makes a
quiet click when it blocks a dig, limited by the existing message cooldown. Reserved footsteps, retired flight slots, and flag-gated
combat
sounds are supplied for completeness. Their presence does not enable those
features or add new gameplay events.

Slime uses wet compression, suction grains, and small bubble closures. Five
churn variants respond to actual jet contact; six slap variants respond to
body and terrain impacts. The old three wobble cues now use the same wet
material. Strength, body size, screen position, and distance shape playback.
Per-body and shared cooldowns keep piles from flooding the mix. Resting,
offscreen, and paused bodies are silent. The optional observers in the shared
physics engine leave the standalone playground unchanged.

## Rebuild

From the repository root on macOS (Python, NumPy, and the system `afconvert`):

```sh
python3 tools/audio/build-sfx.py --preview /tmp/sluice-sfx-preview.wav
python3 tools/audio/build-sfx.py --keys jello-wobble jello-churn jello-slap
```

The seed for each sound and variant is stable. Change a recipe once to rebake
all its variants. The optional preview sequences the drill materials and a
selection of actions with short gaps. It is a dry audition, before game mixing.

One-shots are mono AAC at 64 kbps. Loops are 24 kHz, 16-bit mono WAV, four seconds
for machinery and sixteen seconds for ambience. Circular noise and periodic
modulation preserve loop boundaries without codec padding. The sparse ambience
emitter adds separate events, so beds do not bake in a repeating drip or bird.
The bank is about 10.7 MB; the files are decoded once, after a player gesture.

## Tuning and replacement

Adjust material spectra, envelopes, and levels in the generator. Repeated
impacts have independent variants; playback adds pitch and level variation.
Master starts at 60%, Music at 65%, and SFX at 100%. Saved settings win,
including a saved master mute. The SFX path fades on pause; music retains the
existing pause behavior. A master compressor and soft ceiling catch stacked peaks. The drill and
frame-driven action loops fade if a modal stops the game from updating them.

The per-key manifest `g` multiplies event gain. Continuous drill and ambience
have their own facade gains; tune their rendered level in the generator.
To replace one sound, keep its filename and format. For an AAC replacement of
a WAV loop, remove that key's `ext: 'wav'` override. Bump `SFX_BANK_VERSION` in
`js/audio.js` when changing assets to invalidate cached sound files. Bump the
game version and run `./build-sluice.sh` for deployment, as usual.

## Verification

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/audio/test-sfx.mjs
```

The harness serves its own local site and owns a Chrome for Testing child,
closed in `finally`. It decodes every file, checks channels, signal levels,
transient onset and loop edges, then checks variant repetition, voice limits,
mutes, pause/resume, ambience transitions, and game boot. Its game-state bridge
is injected only by the test server, never shipped in the bundle.
