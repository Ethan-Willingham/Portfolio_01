# SFX_BIBLE.md

The canonical sound-effects design reference for Sluice. Sister doc to `MUSIC_BIBLE.md`, `BUILDING_STYLE.md`, `BACKGROUND_STYLE.md`, `UI_STYLE.md`, `MINERALS_BIBLE.md`. Read this before designing, prompting, sourcing, or implementing any sound effect. The prompt-generation companion is `SFX_PROMPT_SYSTEM.md` (the paste-ready catalog). The music side is `MUSIC_BIBLE.md` + `MUSIC_PROMPT_SYSTEM.md`; the shared Web Audio engine is `js/audio.js`.

**Direction (v1, 2026-05-29):** SFX is **layered, clean, material-aware, and restrained**, built to sit under a sparse jazz score (`MUSIC_BIBLE.md`). Because the music is off more than it is on (Minecraft cadence), the **constant ambience bed and the drill are the real voice of the game**, not the music. This doc is derived from a deep, wide research pass (13 parallel agents) across SFX theory, craft, continuous-loop design, procedural synthesis, Web Audio, game feel, mixing, ambience, AAA case studies, 2D/mining teardowns, sourcing/AI/licensing, solo-dev economics, and psychoacoustics/accessibility.

---

## §1. Mission

Sluice is a hub-and-spoke mining game: the player spends most of their time underground (drilling the zones below each town), in the shop, or flying across a no-man's-land between towns, with combat along the journey. There is a day/night cycle. Web-first, going to a paid Steam release eventually. The owner is a solo developer using AI tools heavily, with no formal audio training and limited time.

The audio target for SFX:
- **Layered and material-aware.** Every important sound is built from layers (§4); drilling dirt and drilling crystal share an envelope and differ only in the body layer.
- **Clean and low-fatigue.** No fuzz, no harsh 2 to 5 kHz ear-pain. The drill runs for hours; it must never tire the ear.
- **Carry the silence.** The ambience bed (§7) and the drill (§6) are the constant sonic identity during the long musical gaps. They get the most attention.
- **Restrained.** Two UI sounds, not twenty (§3, the Elden Ring rule from `MUSIC_BIBLE.md` §5.12). Silence is a tool.
- **Implementable in vanilla Web Audio** in the existing `js/audio.js` engine, mono assets panned at runtime (§11).
- **Legally clean for paid Steam** (AI disclosure, CC0 / licensed sources, transform anything AI-generated; §12).

Minimum bar: the game feels juicy and weighty, the drill is satisfying after ten hours, and nothing is a jump-scare. Aspirational: the SFX are good enough that the game reads as hand-crafted, not asset-flipped.

---

## §2. The twelve principles

These recurred independently across the research agents. They are genre-agnostic and load-bearing.

### §2.1. Layer every important sound. Identity lives in the body.
A real-feeling effect is assembled from up to four slots: a **transient** (the click/attack, makes it instant and punchy), a **body** (says what material/object it is), a **sub** (low weight you feel more than hear), and a **tail** (decay/space). The expensive-sounding trick: hold the transient and sub constant for an action, swap only the **body** by material. This maps perfectly onto a tile game with many materials. See §4.

### §2.2. Repetition is the enemy. Defeat it with pools plus jitter.
The drill is the most-triggered sound in the game by a wide margin; footsteps and ore-pickup are next. The universal fix is **round-robin sample pools** (3 to 6 variants per action) plus **per-trigger randomization** of pitch (±2 to 3 semitones) and volume (±2 to 3 dB). Without this the ear locks onto a repeated sample within seconds and the game feels cheap. This is non-negotiable for the drill, footsteps, ore-pickup, debris, and any UI tick. The engine already does ±6% pitch jitter (`MUSIC_BIBLE.md` §5.4); pools are the asset-side half.

### §2.3. The transient carries the punch.
The first ~20 ms is where "weak" vs "powerful" is decided, even though it is a sliver of the sound. If an effect feels limp, the fix is almost always a **sharper or louder transient**, not more body. Generate or layer transients separately so they can be tuned.

### §2.4. Sub-bass is felt, not heard. Reserve it for hero hits.
A 40 to 80 Hz sine blip under an impact is what separates "toy" from "weighty." But sub eats headroom fast and muddies a mix if everywhere. Only the biggest events get sub: large bomb, hard fall-damage landing, the deepest-layer rumble, a legendary-ore strike. Most sounds have none.

### §2.5. Material is the body layer.
Drill, footstep, and impact all change meaning by material, and the change lives in the **body**, not the envelope. Dirt is dull and short; stone is mid and gritty; ice is glassy and bright; crystal/gem rings; metal/ore clanks; obsidian is hard and sharp. Author one envelope per action, then a body per material (§4, §6).

### §2.6. Continuous sounds are one modulated loop, not a played sample.
A held drill or a flying jetpack is sustained, and naive looping clicks and fatigues. The professional pattern is a **seamless base loop whose pitch and filter cutoff are driven live by a game parameter** (drill speed, jetpack throttle, fall speed), with **start and stop one-shots** bolted on the ends (spin-up, wind-down). Think engine-RPM modeling. In Web Audio: a looping `BufferSource` whose `playbackRate` and a `BiquadFilter.frequency` you nudge with `setTargetAtTime`. See §6.

### §2.7. The ambience bed carries the game. It is the highest-leverage investment.
Because the music is intentionally absent most of the time, the **Zone bed is the game's sonic identity during silence.** A layered ambience (a low room-tone drone plus sparse randomized one-shots: drips, settling, distant rumbles, station hum) makes an empty cave feel alive and deep far more cheaply than more music would. Drive it by depth. This is where a few days of effort pay the biggest dividend. See §7.

### §2.8. Organize the whole soundscape with IEZA. It is the bus model.
Four quadrants: **Effect** (diegetic actions: drill, footstep, impact), **Zone** (diegetic ambience: drips, wind, hum), **Interface** (non-diegetic UI: open, confirm), **Affect** (non-diegetic emotion: danger sting, alerts). This is not academic; it is the mixer layout, four duckable groups extending the existing `js/audio.js` bus graph. See §3.

### §2.9. You cannot play everything at once.
A busy scene (30 debris bits landing while the drill grinds and a bomb goes off) needs **HDR-lite**: each sound carries a priority/importance; loud important sounds duck or cull quiet unimportant ones; each asset is normalized with deliberate headroom; the drill, music, and ambience live in **different frequency homes** so they do not mask each other. A voice cap (~24) with oldest/quietest stealing prevents crackle and CPU spikes. See §8.

### §2.10. Sound is the cheapest juice. Fire it on the same frame as the visual.
Players rate identical visuals as better when the audio has punch. Land the SFX on the **same frame** as the mine-break FX, particles, and screen feedback; the combined hit is more than the sum. Use **anticipation plus payoff** (a tiny drill-bite pre-sound before the big break makes the break land harder). Positive actions (ore-pickup) should be subtly musical and escalate on a combo. See §10.

### §2.11. Restraint scales impact.
Silence is part of the palette (the music is sparse by design). Do not fill every gap or the important sounds stop reading as important. **Two UI sounds total** is the doctrine (the Elden Ring rule, `MUSIC_BIBLE.md` §5.12): a low thunk (shop open/close) and a sharp tink (confirm). The few additions this doc allows (a soft negative for "denied," the auto-sell count-up) are diegetic-adjacent and earn their place; everything else stays silent. No hover/scroll/focus sounds.

### §2.12. Mono assets, runtime spatialization. Accessibility is a floor.
Export every SFX **mono**; pan and attenuate at runtime by screen position (`StereoPannerNode` + distance gain, §11). Never bake stereo into the asset. And the accessibility floor is not optional (§13): split SFX and Music sliders, never gate critical information on audio alone (every important cue has a visual twin), a low-fatigue drill, a mono toggle, and loudness consistency so nothing is a jump-scare.

---

## §3. The IEZA taxonomy = the bus model

IEZA splits sound by two axes (diegetic vs non-diegetic, activity vs setting) into four quadrants. We use it as the SFX mixer layout, four groups hanging off the existing `sfxBus` in `js/audio.js`, each independently duckable and (where it makes sense) depth-filtered.

| Quadrant | Diegetic? | What it is | Sluice examples | Bus behavior |
|---|---|---|---|---|
| **Effect** | Yes (activity) | Player and world actions | drill, footsteps, jetpack, ore-pickup, bombs, impacts, liquids, jello | depth low-pass (`MUSIC_BIBLE.md` §5.6), fall-filter dip (§5.15), pooled voices |
| **Zone** | Yes (setting) | Ambient soundscape | cave drips, settling, wind, station hum, lava bubble, surface day/night | the depth-driven bed (§7), lowest in the mix, almost never ducked |
| **Interface** | No (activity) | UI feedback | shop open/close, purchase confirm/denied, upgrade, auto-sell count-up | dry, not depth-filtered, ducks Effect briefly under itself |
| **Affect** | No (setting) | Emotional/non-physical cues | danger sting, low-fuel/hull alert, depth-record, discovery shimmer | ducks both music and Effect under it (it is the most important thing when it fires) |

The two split player-facing volume sliders (§12) map to: **Music slider** = `musicBus`; **SFX slider** = the four groups above as one `sfxBus`. (Optionally expose Ambience separately later; ship with two.)

This taxonomy also tells you **what to build first**: Zone (the bed) and Effect (the drill) are the constant voice and get the most craft; Interface and Affect are tiny and restrained.

---

## §4. The anatomy of one sound effect

Every important effect is assembled from up to four layers. You rarely use any source recording raw; you stack 2 to 4 into one effect (this is also what transforms AI/CC0 sources into something ownable, §12).

| Layer | Duration | Role | How to get it |
|---|---|---|---|
| **Transient** | 1 to 20 ms | The attack/click. 80% of perceived punch (§2.3). | A sharp short gen, a CC0 click, or a synthesized impulse. Tune level + sharpness separately. |
| **Body** | 50 to 400 ms | Material/object identity (§2.5). The layer that swaps per material. | The main ElevenLabs/CC0 source. This is what the prompt catalog mostly targets. |
| **Sub** | 40 to 200 ms | Low-frequency weight, felt not heard (§2.4). Hero hits only. | A 40 to 80 Hz sine blip with a fast decay in Reaper. |
| **Tail** | 100 ms to 2 s | Decay / space / debris settle. Places the sound. | Convolution/algorithmic reverb at runtime per Zone, or a baked debris-scatter for big breaks. |

**Envelope is identity.** Fast attack + short decay reads hard/metallic; slow attack reads soft/heavy. You can re-skin one body into several materials just by reshaping its ADSR. **Pitch encodes size:** lower = bigger/heavier; a small upward pitch bend sells energy; slight detune fights digital sterility.

**Keep one-shots fairly dry.** The runtime adds depth low-pass and per-Zone reverb, so bake only the tail you cannot reproduce live. A bone-dry body plus a runtime tail places the same drill correctly in a shallow cave and a deep cavern.

---

## §5. The anti-repetition system

The single thing that most separates "feels handmade" from "feels asset-flipped."

1. **Round-robin pools.** 3 to 6 body variants per repeated action (drill grind ticks, footsteps, ore-pickup, debris, the confirm tink). Generate them as a batch (the prompt catalog notes how many per sound).
2. **Per-trigger pitch jitter** ±2 to 3 semitones (the engine does ±6% via `playbackRate`, `MUSIC_BIBLE.md` §5.4).
3. **Per-trigger volume jitter** ±2 to 3 dB.
4. **Never repeat the same variant twice in a row** (the pool picker already enforces this for music cues, §5.13 there; reuse the helper).
5. **For the drill specifically**, also vary by progress (a subtle pitch rise as a block nears breaking) so even a single continuous dig is not static. See §6.
6. **Mint variants cheaply by layer-swapping.** Keep the transient and sub, swap only the body layer (§4), and you have a fresh round-robin take (or a new material) with no new design work. This is why the layers are generated separately (`SFX_PROMPT_SYSTEM.md` §2.7).

A handful of samples plus jitter beats a huge static library. Budget your variant count where repetition is highest: drill and footsteps first.

---

## §6. The drill (the flagship sound)

The drill is the most-heard sound in Sluice. It is also the hardest, because it is a continuous, material-aware, progress-aware loop. Treat it as a small system, not one sample.

**Structure (the engine-RPM model, §2.6):**
1. **Spin-up** one-shot when a dig starts (motor catching, ~150 to 300 ms).
2. **Grind loop** while drilling: a seamless base loop whose **pitch and low-pass cutoff are driven by drill speed** (the `DRILL_SPEED` tier), and whose **body layer is chosen by the tile material** (§2.5). After ~3 s of continuous drilling, sweep the loop low-pass 6 kHz to 3 kHz and after ~10 s pull -3 dB so it becomes texture, not nag (`MUSIC_BIBLE.md` §5.8). Snap back bright/loud on release (the release is an ear-rest reward).
3. **Progress pitch rise** within a single block: nudge `playbackRate` up slightly as tile HP approaches zero, so the break feels earned (anticipation, §2.10).
4. **Break payoff** one-shot when the block clears: the juice moment, **per material** (dirt crumble, stone crack, ice shatter, crystal chime-shatter, metal clang-break, obsidian sharp snap). Fire it on the same frame as the mine-break FX. This is where the sub-bass and the sharpest transient go.
5. **Bounce** one-shot when the drill cannot penetrate (`reqDrill`/`reqHeat` too low, barrier, bedrock): a dull metallic clank with no break, telegraphing "you need a better drill / a bomb."
6. **Debris** scatter tail after a break: 2 to 4 small pitch-jittered pebble/rubble bits.

**The grind must be low-fatigue (§13).** Keep its energy out of the harsh 2 to 5 kHz band; warm and mechanical, not buzzy or whiny. This is the sound that can ruin a long session.

**Per-material matrix** (the body layer; same spin-up/transient envelope across all):

| Material | Grind body | Break payoff | Notes |
|---|---|---|---|
| dirt / soil | soft, dull, granular | muffled crumble | shortest, least sub |
| stone / rock | mid, gritty, scraping | sharp crack + small sub | the default |
| ice / permafrost | glassy, bright, brittle | tinkling shatter | bright top, fast decay |
| crystal / gem | ringing, resonant | chime-shatter, tuned-ish | the "pretty" break |
| metal / ore | clanking, metallic | clang-break + sub | hardest grind |
| obsidian / hard | dense, high-resistance | hard sharp snap | most sub on break |

The catalog (`SFX_PROMPT_SYSTEM.md`) has a prompt per cell. Most ship as 3-variant pools.

---

## §7. The ambience bed (highest leverage)

The bed is the constant voice during musical silence (§2.7). It is a **Zone layer set driven by depth**, mirroring the music's 4-layer underground bed (`MUSIC_BIBLE.md` §3) but made of foley, not jazz. The two interleave: when the music is off (most of the time), the bed is what the player hears.

**Construction:** a continuous **room-tone drone** (very low, almost subliminal, depth-tinted) plus a **procedural sparse one-shot emitter** (every 8 to 15 s, a faint distant drip / settle / creak / rockfall at -30 dB, random pan ±0.4, from a 5 to 10 sample pool), exactly the Half-Life-soundscape pattern already specced in `MUSIC_BIBLE.md` §5.7. Tune the drone's pitch/filter to the music key (D minor) so it never clashes when a cue drifts in. Pro trick (verified against the generator docs): build each bed from 2 to 3 takes of the same prompt layered with offset start times, for a fuller, less-obviously-looping texture than any single take (`SFX_PROMPT_SYSTEM.md` §2.2).

**Depth zones** (cross-fade by depth, the bed analog of the music's L1 to L4):
- **Surface (day):** open air, soft wind, faint distant nature, room for the station hum near spawn.
- **Surface (night):** cooler, thinner, crickets/insects, a lonelier wind (the day/night treatment, `MUSIC_BIBLE.md` §5.14).
- **Shallow underground:** intimate cave, occasional water drips, small settling ticks, faint warmth.
- **Mid:** deeper drips with longer tails, distant low rumbles, the first sense of pressure.
- **Deep:** pressure groans, distant rockfall, a low drone wash, very sparse.
- **Deepest / magma:** heat shimmer, lava bubble/pop, a low fire crackle, an ominous rumble floor (this is where the sub of the bed lives).
- **Station / shop interior:** a comforting machinery hum, the diegetic "return to safety" Zone under the town music.

Build the bed early. It is the cheapest way to make the world feel deep, and it is what plays when nothing else does.

---

## §8. Mixing a busy scene

You cannot play everything at full volume (§2.9). The toolkit:

- **HDR-lite / loudness window.** Give each sound a priority. When the scene is loud, important sounds (bomb, break, alert) temporarily duck or cull quiet unimportant ones (a far debris pebble). Even priority + voice-stealing (no full HDR) cleans up chaos enormously.
- **Per-asset headroom.** Normalize each sound and leave deliberate headroom (-6 dB typical, bombs to -3 dBFS peak) so the master compressor is not constantly slamming. Mix quiet, master loud (`MUSIC_BIBLE.md` §5.11): if everything is squashed flat, the loud moments stop feeling big.
- **Frequency carving.** Give each constant element a frequency home so they do not mask: drill grind in the mids, music in the mids/highs, ambience in the lows plus air, sub reserved for hero hits. Carve a small dip in the music/ambience where the drill lives if it fights.
- **Ducking via gain ramps** (no native sidechain in Web Audio). Interface ducks Effect briefly; Affect ducks both music and Effect (`MUSIC_BIBLE.md` §5.5 has the helper). Standard duck -9 dB / 50 ms attack / 500 ms release.
- **Voice cap ~24** with oldest/quietest stealing (extends the pool in `MUSIC_BIBLE.md` §5.4). Debris and drill ticks are the usual overflow source.
- **Loudness target** -18 to -20 LUFS integrated, -1 dBTP ceiling (same as music, one consistent master).

---

## §9. Procedural vs sampled

- **Modal synthesis** (a sum of 3 to 6 decaying sine "modes") is the cheap, material-aware way to make impact/mining sounds in code. Different mode frequencies + decay rates = different materials (glassy crystal vs dull dirt vs ringing metal) from one tiny synth, no asset load. Genuinely viable in Web Audio and a strong fit for a tile game; a candidate for the drill break layer and the ore-pickup tone if asset count balloons.
- **Hybrid is the solo-dev sweet spot.** Sampled bodies for character (the catalog), synthesized/procedural for the high-variation and tonal stuff (UI blips, the parameter-driven loops, pitch-jittered debris, the tuned pickup). Pure-procedural everything is a research rabbit hole; pure-sampled everything balloons the asset count and download size.
- **Tonal pickups belong to the music system**, not here: the ore-pickup fundamental is tuned to the trio's current tonic (the Mario-coin trick, `MUSIC_BIBLE.md` §5.9). SFX provides the noise/transient layer of the pickup; music provides the pitched layer.

---

## §10. The full SFX roster (production list)

Organized by IEZA (§3). Logical names follow the `js/audio.js` convention (lowercase, hyphenated) and become MANIFEST keys. "Pool" = ship N round-robin variants (§5). The ready-to-paste prompt for each lives in `SFX_PROMPT_SYSTEM.md`.

### Effect (diegetic actions)
| Name | Type | Pool | Notes |
|---|---|---|---|
| `drill-spinup` | one-shot | 1 | motor catch |
| `drill-grind-{dirt,stone,ice,crystal,metal,obsidian}` | loop | 1 each | parameter-driven, §6 |
| `drill-break-{dirt,stone,ice,crystal,metal,obsidian}` | one-shot | 3 each | the juice moment |
| `drill-bounce` | one-shot | 3 | cannot penetrate |
| `debris` | one-shot | 4 | post-break rubble |
| `footstep-{dirt,grass,metal}` | one-shot | 4 each | surface walking |
| `jetpack-ignite` / `jetpack-loop` / `jetpack-cutoff` | one-shot / loop / one-shot | 1 each | throttle-driven loop |
| `land-soft` / `land-hard` / `land-damage` | one-shot | 2 each | fall-damage gets sub |
| `fall-wind` | loop | 1 | the plunge whoosh, fades by fall speed (`MUSIC_BIBLE.md` §5.15) |
| `ore-pickup` (noise layer) | one-shot | 4 | pitched layer is music-side (§9) |
| `cargo-full` | one-shot | 1 | soft "can't" |
| `bomb-throw` / `bomb-fuse` / `bomb-small` / `bomb-large` | one-shot / loop / one-shot / one-shot | 2 each one-shot | large gets the most sub |
| `rover-deploy` / `rover-pop` | one-shot | 2 each | balloon inflate / burst |
| `hull-hit` | one-shot | 3 | taking damage |
| `teleport` | one-shot | 1 | surface warp |
| `liquid-enter` / `liquid-exit` / `lava-sizzle` | one-shot / one-shot / loop | 2 / 2 / 1 | water + lava + oil |
| `jello-wobble` | one-shot | 3 | squish/bounce |
| `rig-hum` | loop | the player rig engine idle hum (deep, not whiny; §6 rule) |
| `rig-drive` | loop | 1 | WIRED (350 audioUpdate: ground roll, pitch by speed); the player movement voice (the rig is a vehicle, not feet); 3 lab directions, tracked is the rec |
| `jet-spin` | loop | 1 | WIRED (080 flight bridge); rotation layer over the synth flight pack, pitch mapped to angular velocity |
| `air-pulse` | one-shot | 6 | WIRED (080 movement: underground edge-taps); the horizontal thruster puff, survives rapid tapping |
| `turret-fire` / `enemy-hit` | one-shot | 3 each | WIRED (085: fireBullet = every gun; friendly-hit loops), panned by screen X; auto-fire restraint: small, low-fatigue, never a movie boom |
| `drone-down` / `stinger-hit` | one-shot | 2 each | WIRED (085: every kill* + savage fn; stinger pecks throttled ~90ms); swarm hits stay light, the heavy receive is `hull-hit` |
| `missile-launch` / `missile-hit` | one-shot | 2 each | WIRED (085: spawnMissile / both detonation paths); the launch doubles as the danger telegraph |
| `flak-burst` / `obstacle-hit` / `ring-collect` | one-shot | 3 / 2 / 2 | WIRED (085 flakAirburst + obstacleImpact; 087 courseHitFeedback + ring collect); crashes pair with `hull-hit` same-frame; the ring is atonal |

The `footstep-*` rows stay rostered for a possible on-foot/NPC future; the player's own movement voice is `rig-drive`.

### Zone (ambience bed, §7)
| Name | Type | Notes |
|---|---|---|
| `amb-surface-day` / `amb-surface-night` | loop | 60s+ beds, day/night treatment |
| `amb-shallow` / `amb-mid` / `amb-deep` / `amb-magma` | loop | depth cross-fade beds |
| `amb-station` | loop | comforting machinery hum |
| `amb-rain` / `amb-storm` | loop | surface weather beds (WIRED: the 350 zone picker consults the 155 mood machine — storm always takes the bed, rain only when precip falls as rain; snowfall stays hush-quiet on the day/night beds) |
| `thunder` | one-shot pool (3) | storm cracks, distant to close, over `amb-storm` |
| `amb-bird` | one-shot pool (5) | daytime surface birdsong emitter |
| `amb-oneshot-{drip,settle,creak,rockfall,groan,...}` | one-shot pool | the sparse emitter (5 to 10); `groan` is the eerie-depths one |

### Interface (UI, restrained, §2.11)
| Name | Type | Notes |
|---|---|---|
| `ui-open` | one-shot | low thunk (shop/menu open + close) |
| `ui-confirm` | one-shot | sharp tink (purchase/upgrade confirm) |
| `ui-denied` | one-shot | soft negative (insufficient funds) |
| `sell-tick` | one-shot pool (4) | the auto-sell count-up coin tick (`project_autosell_reveal`) |
| `fuel-fill` | loop | the auto-sell tank-fill (runs while the haul sells) |
| `sell-total` | one-shot | the auto-sell final payoff flourish |

### Affect (emotional cues, §2.11)
| Name | Type | Notes |
|---|---|---|
| `alert-fuel` / `alert-hull` | one-shot | warning, always with a visual twin (§13) |
| `danger-sting` | one-shot | combat approach / low health |
| `depth-record` | one-shot | new depth milestone (subtle) |
| `discovery` | one-shot | rare-ore reveal (noise layer; tonal layer is music-side) |

Death is a music piece (`death.m4a`, solo piano, `MUSIC_PROMPT_SYSTEM.md`); the SFX side is only the impact/crunch that precedes it (use `hull-hit` + `land-damage`).

---

## §11. Web Audio implementation

Extends the existing `js/audio.js` engine and the `MUSIC_BIBLE.md` §5 patterns; do not rebuild what is there.

- **One shared `AudioContext`** (already done), lazy on first gesture, iOS unlock on `pointerdown`/`touchstart`/`keydown` (already done).
- **Four IEZA SFX groups** (§3) hung off `sfxBus`: `sfxEffect`, `sfxZone`, `sfxInterface`, `sfxAffect`, each a `GainNode` for independent ducking. The depth low-pass (`MUSIC_BIBLE.md` §5.6) sits on `sfxEffect` (and optionally `sfxZone`), not Interface/Affect.
- **Mono assets, runtime pan.** Each Effect voice routes through a `StereoPannerNode` set from the source's screen X relative to the player, plus a distance gain. Never bake stereo (§2.12).
- **Continuous loops** (drill, jetpack, fall-wind, lava, ambience) are looping `BufferSource`s with a live `playbackRate` + `BiquadFilter.frequency` driven by `setTargetAtTime` (zipper-free, §2.6). Spin-up/cutoff one-shots bracket them.
- **Voice pool + cap** (extend `MUSIC_BIBLE.md` §5.4): per-name `maxVoices`, global cap ~24, steal oldest/quietest. Always pitch-jitter (±6%) and volume-jitter repeated SFX (§5).
- **Pre-decode** the common Effect + UI sounds at boot; lazy-load the rarer ones. Ambience beds can stream.
- **Ship `.m4a` (AAC)**, same as the music (no ffmpeg on the box, `afconvert` WAV to AAC; `decodeAudioData` handles m4a everywhere). Mono for everything except possibly the two surface ambience beds.
- **Graceful missing-asset loading** (already done): a missing file is skipped, the game stays silent for it, never throws. Ship silent, fill in over time.

---

## §12. Sourcing, economics, licensing

- **Layered sourcing strategy.** You rarely use a source raw; you layer 2 to 4 into one effect (§4). Sources, cheapest first:
  1. **CC0 libraries:** the annual **Sonniss GDC bundle** (huge, royalty-free, $0), **Freesound** (filter to CC0), **Kenney** game assets ($0). Raw material for bodies, transients, debris, ambience one-shots.
  2. **AI generation:** **ElevenLabs Sound Effects** (the primary text-to-SFX tool, see `SFX_PROMPT_SYSTEM.md`) for specific one-shots and short loops; **Stable Audio** (licensed data, commercial-safe) for the longer ambience beds. Targeted, not bulk.
  3. **DIY foley:** a cheap mic for unique hits (the owner can record the actual drill-on-material textures if desired).
  4. **Reaper** ($60 one-time, already in the music pipeline) to layer, shape envelopes, pitch, add sub, render mono `.m4a`.
- **Budget: ~$90 to $150 all-in.** Reaper (~$60, shared with music) + Sonniss/Freesound/Kenney ($0) + a paid month of ElevenLabs and/or Stable Audio for targeted generation (~$10 to $30) + optional cheap mic. No middleware (Wwise/FMOD) needed for a web game; `js/audio.js` is the right call.
- **AI is fair game, but transform it.** Layer and process any AI/CC0 source so it is not shipped raw (also strengthens ownership, same logic as the music's live-overlay lever). 
- **Steam AI disclosure** (mandatory since Jan 2026): AI-generated SFX go in the Pre-Generated category, same checkbox as the AI music. Cost of disclosing: zero.
- **License hygiene:** keep a sources log (asset, source, license) so CC-BY attributions and the AI-generation trail are ready at ship. CC0 needs no attribution; CC-BY does.

---

## §13. Accessibility and psychoacoustics (the floor, not optional)

- **Split SFX and Music sliders** (the current engine has one master; split it). Optionally a third Ambience slider later. Persist to `localStorage`.
- **Never gate critical information on audio alone.** Every important cue (low fuel, low hull, danger, cave-in, cargo full) must have a **visual twin**. Audio is reinforcement, never the only channel.
- **Low-fatigue drill (§6).** Keep the grind out of the harsh 2 to 5 kHz "ear-pain" band; it runs for hours. The most common reason a mining game is exhausting is a buzzy drill.
- **Loudness consistency.** Normalize all SFX to a target; nothing is a jump-scare. The loudest sound (large bomb) is still inside the loudness window (§8).
- **Mono toggle** for single-sided-hearing players (sums the StereoPanner output).
- **A "reduce loud sounds" option** (a gentle compressor/limiter the player can enable) is a cheap, high-value accessibility win.

---

## §14. References (qualities to invoke, see `SFX_PROMPT_SYSTEM.md` §3 for the vocabulary)

- **Minecraft:** the closest model to the stated direction. Deliberately minimal SFX set, heavy pitch-randomization, long silences. Proves sparse + jittered beats dense + static.
- **Terraria / Dome Keeper / SteamWorld Dig / Motherload-likes:** the genre bar is "characterful and varied," not "huge library." Strong material differentiation on the dig sound, a satisfying ore-pickup blip, a depth ambience bed.
- **AAA impact lineage (Doom / God of War):** borrow the **layering discipline** (transient/body/sub/tail, sub on hero hits), not the density.
- **Half-Life soundscapes:** the procedural sparse-emitter ambience model (§7).

---

## §15. Open questions (update as decided)

- **Drill grind variants per material vs one modulated body.** Start with one body per material + parameter modulation (§6); add variants only if it reads repetitive.
- **Procedural break layer** (modal synthesis, §9) vs sampled: prototype both for the stone break, keep whichever feels better and is cheaper.
- **Ambience separate slider:** ship two sliders (Music + SFX); decide later whether ambience deserves its own.
- **Combat SFX**: combat SHIPPED (`085-combat.js` + the NMZ course `087-nmz-course.js`); the v1 combat/course set is rostered in §10, prompted in `SFX_PROMPT_SYSTEM.md` §5, and WIRED (manifest keys + call sites, 2026-06-10). Open: whether the auto-turret needs a 4th variant at real fire rates.
- **Auto-sell count-up** (`sell-tick`): WIRED into the shipped sell-reveal sequencer (srFireBeat per stack, pitch climbing; `sell-total` on the grand-total board commit; `fuel-fill` rides the dock refuel).

---

## §16. Session log

- **2026-05-29 (v1)**: Initial SFX bible from a 13-agent deep/wide sound-effects research pass (theory, discrete + continuous craft, procedural, Web Audio, game feel, mixing, ambience, AAA + 2D/mining case studies, sourcing/AI/licensing, solo-dev economics, psychoacoustics/accessibility). Established the twelve principles, the IEZA bus model, the four-layer anatomy, the anti-repetition system, the drill as a flagship system, the depth-driven ambience bed, the mixing toolkit, procedural-vs-sampled guidance, the full roster, the Web Audio extension plan over `js/audio.js`, sourcing/economics (~$90 to $150), and the accessibility floor. Companion paste-ready prompts authored in `SFX_PROMPT_SYSTEM.md`. Folded in two generator-verified techniques during the §13/`SFX_PROMPT_SYSTEM.md` v1.1 hardening pass: the cheap layer-swap variant (§5.6) and the offset-layered ambience bed (§7).
- **2026-06-10**: Readiness-audit pass (engine + full game sweep). The `js/audio.js` SFX platform is production-ready (IEZA buses with ducking, pool player with jitter + voice cap, loop voices, drill facade, ambience zones + sparse emitter, flight synth pack, graceful missing-asset contract) and `assets/sfx/` is empty, so asset generation is the bottleneck, not code. Rostered the rig-movement set (`rig-drive`, `jet-spin`, `air-pulse`; the player is a vehicle, footsteps reserved for a possible on-foot future) and the first combat + No Man's Zone course set (9 sounds), all keys TBA pending the wiring session. Noted the weather-to-zone hookup gap (155 mood machine live, zone picker unaware). The lab `sfx-prompts.html` now carries per-card save-as filenames matched to `SFX_MANIFEST` naming, the combat group, and key-TBA badges.
- **2026-06-10 (wiring session)**: The game now CALLS the platform everywhere. New `SFX_MANIFEST` keys for the rig-movement set (`rig-drive`, `jet-spin`, `air-pulse`) and the nine combat/course sounds; a generic `SluiceAudio.sfxLoop(name, opts)` keyed per-frame loop drive with a shared watchdog (the flight-pack stop-calling-equals-silence contract, so pause/shop/tab-hide can never leak a loop). Call sites landed across 050/060/070/080/085/087/240/260/270/280/295/340/350: bombs (throw/fuse/blast), rover deploy/pops, teleport, cargo-full, landings (`land-hard`/`land-damage`, inside the `FALL_IMPACT_FX` gate), depth-record (deepest-ever layer crossing only), discovery (first-of-type ledger entry + the seam plate), liquid enter/exit (cushion-coverage poll with hysteresis), lava-sizzle (magma heat damage), jello-wobble (throttled), the auto-sell reveal beats (`sell-tick`/`sell-total`/`fuel-fill`), the restrained UI set on the live shop paths (ui-open on enter/exit ±pitch, ui-confirm/ui-denied centralized in buyUpgrade + the board/workshop/shelf stubs resolved to it, no bespoke UI sounds), low-fuel/low-hull Affect stings (edge-fired with hysteresis), the death impact pair before the lament, rig-hum/rig-drive ground voice, jet-spin rotation layer, air-pulse taps, and the full combat/course set panned by screen X. Weather-to-zone gap CLOSED (storm bed always; rain bed only on actual rain, snowfall stays quiet). Everything remains silent-safe until assets land.
