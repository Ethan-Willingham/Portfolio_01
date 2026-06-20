# SFX_PROMPT_SYSTEM.md

The sound-effects prompt-generation system for Sluice. Reads from `SFX_BIBLE.md` (the design doctrine) plus the SFX research pass, and produces complete, ready-to-paste prompts for every sound in the roster. Sister doc to `MUSIC_PROMPT_SYSTEM.md` (the music side).

**Direction (v1.1, 2026-05-29):** SFX is layered, clean, material-aware, restrained, and built to carry the long musical silences (`SFX_BIBLE.md`). Primary generator is **ElevenLabs Sound Effects** (text-to-SFX) for one-shots and short loops; **Stable Audio** for the long ambience beds (licensed data, commercial-safe); **CC0 libraries** (Sonniss GDC, Freesound CC0, Kenney) for raw transient/body/debris layers; **Reaper** to layer, shape, add sub, and render mono `.m4a`. You almost never ship a generated sound raw, you **layer 2 to 4 sources into one effect** (`SFX_BIBLE.md` §4). v1.1 hardened every prompt against the two generators' real, verified behavior (see §2 and the §13 session log).

**Input weighting (deliberate):**
- SFX research + craft (`SFX_BIBLE.md`): HEAVY.
- Generator prompt engineering (verified against ElevenLabs + Stable Audio docs): HEAVY.
- Owner input: LIGHT. A sound name (or "the drill break on crystal", "the big bomb") plus maybe a modifier. The system fills the rest.

Use this doc by either (a) copy-pasting the per-sound entries in §5 into ElevenLabs/Stable Audio, or (b) telling me "make me the [sound]" and I run the algorithm in §9.

---

## §1. The minimal-input contract

What the owner provides to trigger a prompt:
- **Required:** a sound name from the roster (`SFX_BIBLE.md` §10), e.g. `drill-break-crystal`, `bomb-large`, `ui-open`, `amb-deep`. Or a plain pointer: "the drill on ice", "the big explosion", "the shop-open sound".
- **Optional:** a modifier (`heavier`, `softer`, `brighter`, `darker`, `dryer`, `wetter`, `shorter`, `bigger space`). See §6.
- **Optional:** a target tool (default chosen by §7: ElevenLabs for one-shots/short loops, Stable Audio for 60s+ beds, hand-build for the tonal ones).

What the system fills automatically: the prompt text, the Duration, the Looping toggle, the Prompt Influence value, how many variants to generate (the pool size), which layers to stack, and the post-process notes.

---

## §2. The generator-syntax invariants (verified, every prompt)

These are the load-bearing rules. v1.1 verified them against the ElevenLabs and Stable Audio documentation, because two generators behave **oppositely** on negative prompts and looping, and getting it wrong wastes generations.

### §2.1. ElevenLabs Sound Effects (the primary tool)
- **Length: ~8 to 40 words.** Specific but not contradictory. Balance descriptive detail against brevity (over-stuffing confuses the model).
- **Order: material, action, environment, perspective, qualities.** "A drill grinding into solid rock, close-up, a gritty mid-range grinding churn, steady, dry."
- **Duration: 0.5 s minimum, 30 s maximum.** This is a hard floor. **Set the field a little LONGER than the final asset and trim in Reaper (§8)**, never below 0.5. For a sub-0.5 s target (UI ticks, coin ticks, pops) generate at 0.5 s and trim hard. The per-sound entries give the generation value plus a "trim to ~X" where the asset should be tighter.
- **Looping: there is a dedicated Looping toggle.** Turn it **ON** only for genuinely continuous sounds (drill grind, jetpack thrust, fall-wind, lava, fuse, ambience). It does **not** work for sounds with a distinct start/end (a footstep, a break, a pop) — those are one-shots, Loop OFF. For loops, write the body as **steady-state** (`steady, continuous, constant, no start or stop`) so the toggle has a flat texture to wrap.
- **Prompt Influence: default 30%.** Use **~50%** for precise foley (most one-shots) and **~35%** for sounds that want organic spread across a batch (footsteps, debris, ambience one-shots). **70 to 100% sticks literally to the text but can sound unnatural; use high sparingly** and only with a clean prompt.
- **Onomatopoeia helps** (documented). Add it alongside the description for percussive/UI sounds: a sharp "crack", a dull "clank", a deep "whoomph", a crisp "tink", a wet "squelch". Skip it on grinds and ambience.
- **Temporal / sequence phrasing helps** (documented). For evolving sounds, describe the arc: "starts quietly and builds", "a sharp crack then a deep boom then settling debris", "a rush of inflation then a soft release".

### §2.2. Stable Audio (the ambience beds)
- Best for the 60 s+ Zone beds (`SFX_BIBLE.md` §7); generate at least 60 s so the loop is not audibly short.
- **Write it as a session brief:** source/place + events + mood + perspective/space, plus **Key** for any drone tuned to the score (Stable Audio aligns harmonic content to a stated key; the depth-bed drones are keyed to **D minor**, the music home, `MUSIC_BIBLE.md` §6.3).
- **Stable Audio DOES support a negative prompt** (unlike ElevenLabs) and the docs recommend one. Every bed entry has a **Negative prompt** line; keep it short and focused (`no music, no melody, no drums, no distortion, no hiss`).
- **Richer beds, the documented trick:** generate 2 to 3 takes of the same prompt and layer them in Reaper with **offset start times** for a fuller, less-obviously-looping texture than any single take.

### §2.3. Describe positively. Do NOT negative-prompt ElevenLabs.
ElevenLabs has **no negative-prompt field**, and tacking `no music` / `no voices` onto the prompt is unreliable (a generative model with no negative channel can latch onto the very word you are trying to exclude). So:
- **ElevenLabs prompts describe only what you DO want.** No `no X` phrases.
- For sounds at risk of drifting melodic (the affect/UI tones, the pickup/discovery shimmers), use **positive atonal framing**: `a single atonal tone`, `unpitched`, `a pure sound-effect`, `a single sustained swell` (singular framing implies no tune). Never `no melody`.
- **Stable Audio is the exception:** put exclusions in its dedicated **Negative prompt** field (§2.2), where they are documented to improve clarity.

### §2.4. Keep Effect sounds dry; let Zone beds have space
The runtime adds the depth low-pass and per-Zone reverb (`SFX_BIBLE.md` §4, §11). So **Effect one-shots and loops are generated dry** (`dry`, `close-up`, `tight`) and placed by the engine. **Zone beds** may bake their space (`distant`, `reverberant`, `large cavern`) because they are the room.

### §2.5. Mono out
The tool may return stereo. Collapse to **mono** in Reaper (`SFX_BIBLE.md` §2.12); the engine pans at runtime. Only the two surface ambience beds may stay stereo.

### §2.6. Generate a batch, then pool or pick
Generate **5 to 8** takes per sound. For one-of sounds, pick the best. For pooled sounds (§5 marks them, e.g. "pool 4"), keep the best N as round-robin variants (`SFX_BIBLE.md` §5). Never ship a single sample for the drill, footsteps, debris, ore-pickup, or the sell-tick.

### §2.7. Layer, do not ship raw. Generate the layers separately.
The confirmed pro workflow: for any complex or precisely-timed sound, **generate the transient, body, sub, and tail as separate sources** (each its own ElevenLabs gen or a CC0 clip), then align and balance them in Reaper (`SFX_BIBLE.md` §4). Two payoffs: tight control over the transient timing (shifting a layer by milliseconds changes the punch), and **swapping a single layer makes an instant new variant** (same transient + sub, new body = a new material; same body, new transient = a softer/harder hit). The prompt usually targets the **body**; the per-sound entries note the other layers to stack.

---

## §3. The vocabulary table (the SFX analog of the music substitution table)

When the owner names a material, perspective, or feel, the system substitutes the generator-steering words. This is the lever that makes prompts hit.

**Material to timbre (with onomatopoeia option, §2.1):**
| Owner says | System substitutes (body words) |
|---|---|
| dirt / soil | `dull, granular, muffled, soft thud, short` |
| stone / rock | `gritty, mid-range scrape, a sharp "crack"` |
| ice / permafrost | `glassy, brittle, bright, a tinkling shatter, fast decay` |
| crystal / gem | `resonant, ringing, a "chime"-like shimmer` |
| metal / ore | `metallic, a "clang", dense, heavy` |
| obsidian / hard | `hard, dense, a sharp "snap", high-resistance` |
| water | `wet, a "splash", bubbles, a "plink" drip` |
| lava | `bubbling, sizzling, hot, faint hiss, low` |
| jelly / soft body | `a wet "squelch", bouncy, squishy, playful` |
| metal hull / rig | `a dull metallic "crunch", low thud` |

**Perspective and space:**
| Owner says | System substitutes |
|---|---|
| close / immediate | `close-up, dry, present, tight` |
| distant / far | `distant, muffled, faint, reverberant tail` |
| big room / cavern | `large cavern, long reverb tail, spacious` |
| tight / no echo | `dry, no reverb` |

**Envelope and weight:**
| Owner says | System substitutes |
|---|---|
| punchy / impact | `sharp transient, tight, punchy` |
| heavy / weighty | `a deep "whoomph", low-frequency punch, low thump` (+ a sub layer, §2.7) |
| soft / gentle | `dull, muffled, gentle, soft` |
| bright / crisp | `crisp, bright, high transient` |

**Mood (Affect/Interface), framed positively (§2.3):**
| Owner says | System substitutes |
|---|---|
| ominous / threat | `a low atonal swell, dissonant, ominous` |
| urgent / alarm | `a tense electronic double-beep, clear` |
| safe / warm | `a soft warm hum, comforting` |
| clean confirm | `a crisp bright "tink", clean` |
| soft negative | `a muted low "buzz" double-tone, gentle` |

---

## §4. The prompt formula (recipe to fill)

**ElevenLabs (one-shot or short loop) — positive only, §2.3:**
```
A [size/material] [source object] [action verb], [perspective],
[a/an] [envelope] [body description, with an onomatopoeia where percussive],
[temporal arc if it evolves], [weight/brightness qualities], dry
```
Set: Duration = target seconds rounded up to >= 0.5 (trim in Reaper), Looping = ON for steady-state continuous / OFF for one-shots, Prompt Influence = ~50 (foley) or ~35 (organic).

**Stable Audio (Zone bed) — brief + negative field, §2.2:**
```
Prompt:   [Place/depth] ambience, [diegetic events: drips/wind/rumble/hum],
          [emotional quality], [perspective/space], [Key if a tuned drone]
Negative: no music, no melody, no drums, no distortion, no hiss
```
Set: Duration = 60 to 90 s; generate 2 to 3, layer offset (§2.2); trim + equal-power crossfade to a clean loop in Reaper.

---

## §5. The per-sound catalog (paste-ready)

Organized by IEZA (`SFX_BIBLE.md` §3). Each entry: the prompt, the settings, and the layer/pool note. Defaults: ElevenLabs, Prompt Influence 50, mono out, **positive description only (no `no X`), Duration >= 0.5 s then trim**. "Layers" lists what to stack in Reaper beyond the body the prompt makes.

### EFFECT (diegetic actions)

#### `drill-spinup` (one-shot, the dig starts)
**Prompt:** `A small electric mining drill motor spinning up to speed, close-up, a quick mechanical whirr that rises in pitch then settles into a steady hum, tight and dry`
**Settings:** Duration 0.5 s (trim to ~0.3 s), Loop OFF, Influence 55. **Layers:** add a tiny transient click at the very start. One-of.

#### `drill-grind-{material}` (LOOP, parameter-driven, §6 of the bible)
One seamless loop per material. **Duration 3 s, Loop ON, Influence 55.** Write them as steady-state (no start/stop) so the Looping toggle wraps cleanly. The engine drives `playbackRate` + low-pass by drill speed.
- **dirt:** `A handheld drill boring into soft soil, close-up, a dull granular grinding churn, low and muffled, steady and continuous, constant, dry`
- **stone:** `A drill grinding into solid rock, close-up, a gritty mid-range scraping churn, steady and continuous, constant, dry`
- **ice:** `A drill cutting through hard ice and permafrost, close-up, a bright brittle glassy grinding churn with fine cracking, steady and continuous, dry`
- **crystal:** `A drill grinding into hard crystal and gemstone, close-up, a resonant ringing grinding churn with a faint shimmer, steady and continuous, dry`
- **metal:** `A drill biting into solid metal ore, close-up, a harsh clanking metallic grinding churn, dense and resistant, steady and continuous, dry`
- **obsidian:** `A drill straining against dense black obsidian, close-up, a hard high-resistance grinding churn with a low strain, steady and continuous, dry`
**Layers:** none baked; keep dry so the engine modulates. **Low-fatigue check (`SFX_BIBLE.md` §13):** if any grind is buzzy in the 2 to 5 kHz band, re-roll or notch it in Reaper.

#### `drill-break-{material}` (one-shot, the juice moment, pool 3 each)
**Settings:** Duration 0.5 to 0.8 s (trim tight), Loop OFF, Influence 50. **Layers:** sharp transient on front; **sub** (40 to 80 Hz blip) on stone/metal/obsidian only; debris tail (`debris`, below) layered or fired separately. **Variant trick (§2.7):** keep the transient+sub, swap the body gen for cheap variation.
- **dirt:** `A clump of dirt breaking and crumbling apart, close-up, a short muffled soft crumble with small falling debris, punchy, dry` (0.5 s)
- **stone:** `A rock breaking with a sharp "crack" then a short gritty shatter and small falling stone debris, close-up, punchy, dry` (0.7 s)
- **ice:** `A block of ice shattering, close-up, a bright tinkling glassy shatter with small ice shards falling, crisp transient, dry` (0.7 s)
- **crystal:** `A crystal shattering with a bright ringing "chime", close-up, resonant shards, pretty and sharp, dry` (0.8 s)
- **metal:** `A chunk of metal ore breaking free with a heavy metallic "clang" and a low thud, close-up, weighty, dry` (0.7 s)
- **obsidian:** `A slab of obsidian breaking with a hard sharp "snap" and a dense crack, close-up, heavy transient, dry` (0.7 s)

#### `drill-bounce` (one-shot, cannot penetrate, pool 3)
**Prompt:** `A drill bit bouncing off an impenetrable hard surface, close-up, a dull metallic "clank" with no break, short and blunt, dry`
**Settings:** Duration 0.5 s (trim to ~0.3 s), Loop OFF, Influence 55. **Layers:** none. Telegraphs "need a better drill or a bomb."

#### `debris` (one-shot, post-break rubble, pool 4)
**Prompt:** `Small pebbles and rock debris scattering and settling on the ground, close-up, a short dry clatter`
**Settings:** Duration 0.7 s, Loop OFF, Influence 35 (organic spread).

#### `footstep-{surface}` (one-shot, pool 4 each)
**Settings:** Duration 0.5 s (trim to ~0.25 s), Loop OFF, Influence 35.
- **dirt:** `A single footstep on soft dirt, close-up, a soft dull thud with faint grit, dry`
- **grass:** `A single footstep on grass, close-up, a soft crunchy rustle, dry`
- **metal:** `A single footstep on a metal deck, close-up, a light metallic "tap" with a faint ring, dry`

#### Jetpack (`jetpack-ignite` / `jetpack-loop` / `jetpack-cutoff`)
- **ignite (one-shot):** `A small rocket jetpack igniting, close-up, a quick whoosh that ignites and swells into a steady jet, dry` (Duration 0.6 s, Loop OFF, Influence 55)
- **loop:** `A small rocket jetpack thrusting, close-up, a continuous airy jet roar, smooth, steady and constant, dry` (Duration 3 s, Loop ON) — engine drives pitch by throttle
- **cutoff (one-shot):** `A small rocket jetpack cutting out, close-up, a quick decaying whoosh as the jet dies, dry` (Duration 0.5 s, Loop OFF)
**Note:** the booster-tier feature (`project_flight_booster`) wants per-tier exhaust; generate brighter/bigger loop variants per tier when that ships.

#### Landings (`land-soft` / `land-hard` / `land-damage`, pool 2 each)
**Settings:** Loop OFF, Influence 50. **Layers:** `land-damage` gets a sub blip.
- **soft:** `A light landing on the ground, close-up, a soft dull thud, dry` (0.5 s, trim to ~0.3 s)
- **hard:** `A heavy landing on the ground, close-up, a solid thud with a short low thump, weighty, dry` (0.6 s)
- **damage:** `A hard crashing landing, close-up, a heavy crunching thud with a deep low "boom", painful and weighty, dry` (0.8 s)

#### `fall-wind` (LOOP, the plunge whoosh)
**Prompt:** `Fast wind rushing past while falling quickly, close-up, a continuous airy whoosh, steady and constant, dry`
**Settings:** Duration 4 s, Loop ON, Influence 50. Engine fades it in by fall speed and dips the music/ambience low-pass (`MUSIC_BIBLE.md` §5.15).

#### `ore-pickup` (one-shot, NOISE layer only, pool 4)
**Prompt:** `A small bright pickup tick, close-up, a short clean sparkle with a tiny atonal shimmer, crisp`
**Settings:** Duration 0.5 s (trim to ~0.2 s), Loop OFF, Influence 50. **Note:** the pitched layer (tuned to the trio tonic, climbing on combo) is **music-side** (`MUSIC_BIBLE.md` §5.9). This is just the noise/transient (framed atonal so it does not fight the music pitch, §2.3).

#### `cargo-full` (one-shot)
**Prompt:** `A soft negative blip, close-up, a short muted low "buzz" double-tick, gentle, dry`
**Settings:** Duration 0.5 s (trim to ~0.3 s), Loop OFF, Influence 55.

#### Bombs (`bomb-throw` / `bomb-fuse` / `bomb-small` / `bomb-large`)
- **throw (one-shot, pool 2):** `Throwing a small heavy bomb through the air, close-up, a quick whoosh of a tossed object, dry` (0.5 s, Loop OFF)
- **fuse (LOOP):** `A bomb fuse hissing and sparking, close-up, a steady crackling sizzle, continuous and constant, dry` (2 s, Loop ON)
- **small (one-shot, pool 2):** `A small explosion, close-up, a sharp punchy blast with a short debris scatter, tight low end, dry` (0.9 s, Loop OFF) — sub blip
- **large (one-shot, pool 2):** `A large powerful explosion, close-up, a sharp crack then a deep booming "whoomph" with a heavy low-frequency punch, then a rumbling tail and falling debris, cinematic, dry` (1.8 s, Loop OFF) — **the biggest sub in the game**; a hero hit, generate the layers separately (transient + body + deep sub + debris tail) and combine (`SFX_BIBLE.md` §4, §2.7).

#### Rover balloons (`rover-deploy` / `rover-pop`, pool 2 each)
- **deploy:** `Balloons inflating, close-up, a quick rush of inflation then a soft mechanical release, dry` (0.7 s, Loop OFF)
- **pop:** `A balloon popping, close-up, a short sharp "pop" burst, dry` (0.5 s, trim to ~0.2 s, Loop OFF)

#### `hull-hit` (one-shot, taking damage, pool 3)
**Prompt:** `A metal hull taking a hard impact, close-up, a dull metallic "crunch" with a low thud, dry`
**Settings:** Duration 0.5 s, Loop OFF, Influence 50.

#### `teleport` (one-shot)
**Prompt:** `A quick teleport warp, close-up, a rising airy shimmer with a soft electric whoosh that rises then dissolves, clean, dry`
**Settings:** Duration 0.8 s, Loop OFF, Influence 50.

#### Liquids (`liquid-enter` / `liquid-exit` / `lava-sizzle`)
- **enter (one-shot, pool 2):** `A body entering water with a "splash", close-up, a quick wet splash with bubbles, dry` (0.6 s, Loop OFF)
- **exit (one-shot, pool 2):** `Emerging from water, close-up, a wet drip and splash with draining water, dry` (0.6 s, Loop OFF)
- **lava-sizzle (LOOP):** `Molten lava bubbling and sizzling, close-up, a thick continuous bubbling with a faint hot hiss, steady and constant, low, dry` (4 s, Loop ON)

#### `jello-wobble` (one-shot, pool 3)
**Prompt:** `A soft jelly blob wobbling, close-up, a short wet bouncy "squelch", playful, dry`
**Settings:** Duration 0.5 s (trim to ~0.3 s), Loop OFF, Influence 35.

#### `rig-hum` (LOOP, the player rig idle)
**Prompt:** `A heavy mining rig engine idling, close-up, a low steady mechanical hum with a faint deep rumble, smooth and constant, dry`
**Settings:** Duration 3 s, Loop ON, Influence 50. **Note:** the constant low idle of the player's machine, sits under everything. Engine can fade it by state/throttle. Keep it deep, not whiny (the same "no electric-shaver" rule as the drill, §6 of the bible). The lab carries 3 A/B/C directions for this (transformer hum is the current rec after an airy take was rejected by ear).

#### Rig movement (the lab Priority set; A/B/C directions live in `sfx-prompts.html`)
The player is the rig, a vehicle, so its movement voice is machinery, not footsteps (the `footstep-*` entries stay rostered for a possible on-foot/NPC future). The lab carries 3 generate-and-compare directions for each most-heard sound (including `drill-grind-dirt`/`drill-grind-stone`, `rig-hum`, and `jetpack-loop`); below are the three NEW sounds with their (rec) defaults. Their keys + call sites are LIVE (wired 2026-06-10); each `.m4a` lights up the moment it lands in `assets/sfx/`.

- **`rig-drive`** (LOOP, key live, save the winner as `rig-drive.m4a`): `A heavy tracked mining rig crawling across the ground, close-up, a deep diesel rumble with rhythmic metal track clank and a hydraulic groan, weighty and mechanical, steady and continuous, dry` (Duration 3 s, Loop ON, Influence 50). Alternates in the lab: wheels-on-gravel, hover-repulsor.
- **`jet-spin`** (LOOP, key live): `A jet engine whooshing past while spinning, close-up, an airy turbine roar whose pitch sweeps up then down like a flyby, dynamic, continuous, dry` (Duration 3 s, Loop ON, Influence 50). A rotation layer over `jetpack-loop`: map pitch to angular velocity. Alternates: vector sweep, gyro whine.
- **`air-pulse`** (one-shot, key live, pool 6): `A clean pulse-thruster vent, close-up, a quick rounded "whoomph" with a soft airy body and a tuned low pop, dry` (Duration 0.5 s, Loop OFF, Influence 50). The underground horizontal thruster puff; survives rapid tapping, vary pitch +/-10% across the pool. Alternates: compressed-air "ksh" burst, pneumatic piston.

#### Combat + the No Man's Zone course (live systems, `085-combat.js` / `087-nmz-course.js`; all keys + call sites live, panned by screen X)
Combat shipped after v1.1, so these are new in v1.2. Restraint rules: the auto-turret repeats constantly (small and low-fatigue, like the drill); receiving damage stays `hull-hit`; `danger-sting` (Affect) already covers the approach cue; the melodic tension is the music combat layer. All ElevenLabs, Loop OFF, dry.

- **`turret-fire`** (pool 3): `An automatic defense turret firing a single shot, close-up, a short punchy mechanical "thunk" with a quick muzzle crack, tight and restrained, dry` (0.5 s, trim ~0.25 s, Influence 50)
- **`enemy-hit`** (pool 3): `A bullet striking a small metal machine, close-up, a sharp metallic "thwack" with a tiny spark fizz, short, dry` (0.5 s, trim ~0.25 s, Influence 50)
- **`drone-down`** (pool 2): `A small hostile drone bursting apart, close-up, a crunchy mechanical "pop" with a brief electrical fizzle and falling parts, dry` (0.7 s, Influence 50)
- **`stinger-hit`** (pool 2): `A fast insect-like machine glancing off a metal hull, close-up, a quick sharp scraping "tick" with a light thud, small and mean, dry` (0.5 s, trim ~0.25 s, Influence 50)
- **`missile-launch`** (pool 2): `A small missile launching with a sharp ignition hiss then a rising rocket whoosh trailing away, mid distance, dry` (1.2 s, Influence 50). Doubles as the danger telegraph: audible before the hit ever lands.
- **`missile-hit`** (pool 2): `A missile striking with a hard concussive blast, close-up, a sharp "crack" then a deep punchy "whoomph" with brief falling debris, weighty, dry` (1 s, Influence 50). Sub blip; sized between `bomb-small` and `bomb-large`.
- **`flak-burst`** (pool 3): `An anti-aircraft flak shell bursting in open air, mid distance, a deep hollow "whump" with a short smoky tail, dry` (0.8 s, Influence 50). Vary close to far across the pool.
- **`obstacle-hit`** (pool 2): `A heavy vehicle slamming into a steel gate, close-up, a deep resonant metal "clang" with a groaning scrape and a low thud, weighty, dry` (0.8 s, Influence 50). The world side of a course crash; the rig side fires `hull-hit` the same frame.
- **`ring-collect`** (pool 2): `Flying fast through a hoop of rushing air, close-up, a quick airy "whoosh" with a single bright atonal sparkle rising, clean and satisfying, dry` (0.6 s, Influence 50). Atonal framing (§2.3) so it never fights the music key.

### ZONE (the ambience bed, `SFX_BIBLE.md` §7) — Stable Audio for the beds

Every bed: positive prompt + a **Negative prompt** line (§2.2). The depth-bed drones state **Key D minor** so they align with the score. Generate 2 to 3 takes, layer offset (§2.2).

#### Surface beds (these two may stay stereo)
- **`amb-surface-day`** — Prompt: `Calm open-air outdoor ambience on a quiet surface, gentle steady wind, faint distant nature, very sparse, seamless` · Negative: `no music, no melody, no drums, no distortion, no hiss` (Stable Audio, 60 to 90 s)
- **`amb-surface-night`** — Prompt: `Quiet cool night-time outdoor ambience, soft low wind, faint crickets and insects, lonely and sparse, seamless` · Negative: `no music, no melody, no drums, no distortion, no hiss` (60 to 90 s)

#### Surface weather (needs a weather trigger in-game; rostered ahead, like combat)
- **`amb-rain`** — Prompt: `Steady rain falling outdoors, even and gentle, soft patter on the ground, calm, seamless` · Negative: `no music, no melody, no drums, no distortion` (Stable Audio, 60 to 90 s)
- **`amb-storm`** — Prompt: `A heavy thunderstorm outdoors, driving rain and gusting wind with distant rolling thunder, dramatic and powerful, seamless` · Negative: `no music, no melody, no drums, no distortion` (Stable Audio, 60 to 90 s)
- **`thunder`** (ElevenLabs one-shot, pool 3) — Prompt: `A clap of thunder, a distant rolling rumble building to a sharp crack, deep and powerful, dry` · Duration 2 to 3 s, Loop OFF, Influence 40. Fired over the storm bed; vary close to far across the pool.
- **`amb-bird`** (ElevenLabs one-shot, pool 5, daytime emitter) — Prompt: `A few birds chirping outdoors, close to mid distance, light natural birdsong, short` · Duration 1 to 2 s, Loop OFF, Influence 35. The daytime surface counterpart to the cave one-shots below.

#### Depth beds (mono, depth cross-fade, drone keyed to D minor)
- **`amb-shallow`** — Prompt: `Intimate shallow cave ambience, occasional water drips, faint settling ticks, a low subtle room-tone drone in D minor, very sparse, seamless` · Negative: `no music, no melody, no drums, no distortion` (60 s)
- **`amb-mid`** — Prompt: `Deep cave ambience, slow water drips with long tails, distant low rumbles, a low pressure drone in D minor, sparse and tense, seamless` · Negative: `no music, no melody, no drums, no distortion` (60 s)
- **`amb-deep`** — Prompt: `Deep underground cavern ambience, low pressure groans, distant rockfalls, a sustained low drone wash in D minor, lonely and vast, seamless` · Negative: `no music, no melody, no drums, no distortion` (60 s)
- **`amb-magma`** — Prompt: `Deep magma cavern ambience, bubbling lava, a low fire crackle, heat shimmer, an ominous low rumble floor in D minor, hot and dangerous, seamless` · Negative: `no music, no melody, no drums, no distortion` (60 s) — the bed's sub lives here
- **`amb-station`** — Prompt: `A comforting mechanical station-interior hum, soft machinery, faint electrical buzz, warm and safe, seamless` · Negative: `no music, no melody, no drums, no distortion` (30 to 60 s)

#### `amb-oneshot-{event}` (the sparse emitter pool, 5 to 10, ElevenLabs, positive-only)
**Settings:** Duration 1 to 2 s, Loop OFF, Influence 35. Engine fires one every 8 to 15 s at -30 dB, random pan (`MUSIC_BIBLE.md` §5.7).
- **drip:** `A single water drop falling and echoing in a cave, mid distance, a wet "plink" with a faint reverberant tail`
- **settle:** `Small rocks and dirt settling in a cave, distant, a faint short trickle`
- **creak:** `A low structural creak deep in rock, distant, an ominous groan`
- **rockfall:** `A distant rockfall in a cavern, far away, a muffled tumbling rumble`
- **groan:** `A deep eerie groan echoing through deep rock, distant, a low moaning resonance, unsettling`
- **pebble:** `A single small pebble dropping and bouncing on cave stone, mid distance, a faint dry "tik" with a tiny echoing tail`
- **metal-tick:** `A faint metallic tick of cooling machinery deep underground, distant, a single soft "tink" with a short tail`
- **air-hiss:** `A faint breath of air hissing through a rock crevice, distant, a soft airy sigh that swells and fades`

### INTERFACE (UI, restrained — `SFX_BIBLE.md` §2.11)

#### `ui-open` (shop/menu open AND close)
**Prompt:** `A low mechanical "thunk" of a heavy panel opening, close-up, a single soft dull clunk, clean, dry`
**Settings:** Duration 0.5 s (trim to ~0.25 s), Loop OFF, Influence 55. One-of (reused, pitched down ~2 semitones, for close).

#### `ui-confirm` (purchase / upgrade confirm)
**Prompt:** `A sharp clean confirmation "tink", close-up, a short bright metallic tick, crisp, clean, dry`
**Settings:** Duration 0.5 s (trim to ~0.15 s), Loop OFF, Influence 55.

#### `ui-denied` (insufficient funds)
**Prompt:** `A soft negative error blip, close-up, a short muted low "buzz" double-tone, gentle, clean`
**Settings:** Duration 0.5 s (trim to ~0.25 s), Loop OFF, Influence 55.

#### `sell-tick` (the auto-sell count-up coin, pool 4 — `project_autosell_reveal`)
**Prompt:** `A small bright coin register "tick", close-up, a short clean metallic blip, satisfying, dry`
**Settings:** Duration 0.5 s (trim to ~0.12 s), Loop OFF, Influence 50. Fired rapidly as the haul sells one ore at a time; pitch-climbs slightly with the count.

#### `fuel-fill` (LOOP, the auto-sell tank fill — `project_autosell_reveal`)
**Prompt:** `Fuel pumping and filling a tank, close-up, a steady liquid flow with a soft pump hum, continuous and constant, dry`
**Settings:** Duration 3 s, Loop ON, Influence 50. Plays while the haul sells and the tank fills; stops on the final flourish.

#### `sell-total` (one-shot, the auto-sell payoff — `project_autosell_reveal`)
**Prompt:** `A satisfying register chime as a sale completes, close-up, a bright pleasant ding with a soft coin ring, clean, dry`
**Settings:** Duration 0.8 s, Loop OFF, Influence 50. The final flourish after the per-ore `sell-tick` count-up.

### AFFECT (emotional cues — always with a visual twin, `SFX_BIBLE.md` §13; framed atonal so they do not fight the music, §2.3)

#### `alert-fuel` / `alert-hull`
- **fuel:** `A calm low warning tone for low fuel, close-up, a short soft pulsing electronic beep, clear but not alarming, clean` (0.6 s, Loop OFF, Influence 55)
- **hull:** `An urgent warning tone for damage, close-up, a short tense electronic double-beep, clear, clean` (0.6 s, Loop OFF)

#### `danger-sting` (combat approach / low health)
**Prompt:** `A short tense danger sting, close-up, a low atonal swell with a sharp accent, dissonant and ominous, dry`
**Settings:** Duration 1 s, Loop OFF, Influence 50. **Note:** the melodic combat tension is the **music combat layer** (`MUSIC_PROMPT_SYSTEM.md`); this is the foley accent.

#### `depth-record` (new depth milestone)
**Prompt:** `A subtle low confirming hit marking a new depth, close-up, a soft deep resonant thump with a slow atonal decay, understated, dry`
**Settings:** Duration 1 s, Loop OFF, Influence 50.

#### `discovery` (rare-ore reveal, NOISE layer only)
**Prompt:** `A short reveal shimmer for discovering something rare, close-up, a soft sparkling atonal rise, clean`
**Settings:** Duration 0.8 s, Loop OFF, Influence 50. **Note:** the tonal reveal chord is the music `event-1` vibraphone (`MUSIC_PROMPT_SYSTEM.md`); this is the air/shimmer under it.

---

## §6. Variations dial (how to modify any entry)

- **"Heavier" / "bigger":** add `a deep "whoomph", weighty, low-frequency punch`, lengthen the tail 10 to 30%, add or boost the sub layer (§2.7).
- **"Softer" / "gentler":** add `dull, muffled, gentle`, soften the attack, drop the transient level.
- **"Brighter" / "crisper":** add `crisp, bright, high transient`, raise Prompt Influence a little, high-shelf +2 dB in Reaper.
- **"Darker":** add `low, muffled, ominous`, pitch down a few semitones, roll off the top.
- **"Dryer":** add `dry, tight, close-up` (and trim the tail). Default for Effect.
- **"Wetter" / "bigger space":** add `large cavern, long reverb tail, distant`. For Zone beds, fine; for Effect, prefer adding it at runtime.
- **"Shorter":** lower the trimmed target (generation stays >= 0.5 s, §2.1); trim harder; punchier.
- **"More variation across the batch":** lower Prompt Influence to ~30 to 35 and generate more takes; or swap one layer (§2.7).

---

## §7. Tool / model selector

| Sound class | Best tool | Reason |
|---|---|---|
| Drill grind loops, jetpack, fall-wind, lava, fuse | ElevenLabs (Looping ON) | the toggle wraps steady-state textures; engine modulates pitch/filter |
| Drill breaks, impacts, bombs, foley one-shots | ElevenLabs (Looping OFF) | precise short foley; layer separately in Reaper (§2.7) |
| Footsteps, debris, ambience one-shots, sell-tick | ElevenLabs (Influence ~35) | organic spread across a batch for pools |
| Surface + depth ambience beds (60s+) | Stable Audio | long licensed-data textures, commercial-safe; key-locked drone + negative prompt |
| UI thunk / tink / denied | ElevenLabs or hand-build | tiny; a synthesized blip in Reaper is also fine |
| Ore-pickup tone, discovery chord, depth tonal | **Music system** (`MUSIC_PROMPT_SYSTEM.md`) | tuned to the trio key; SFX provides only the noise layer |
| Sub blips (40 to 80 Hz) | Reaper (synth) | a sine with a fast decay; never generated |

**Cost note:** ElevenLabs Sound Effects needs a paid tier for commercial downloads; Stable Audio Creator covers commercial use and the license persists post-cancel (`MUSIC_BIBLE.md` §7). One paid month of each, generate the whole roster in a batch, download, cancel. Budget ~$10 to $30 (`SFX_BIBLE.md` §12).

---

## §8. The post-process recipe (Reaper)

You almost never ship a generated sound raw (`SFX_BIBLE.md` §4, §2.7).

1. **Trim** to the tightest usable window; cut dead air before the transient. **This is where every sub-0.5 s asset is made** (generate at the 0.5 s floor, trim to target, §2.1).
2. **Layer** (`SFX_BIBLE.md` §4): body (the gen) + transient (sharp CC0 click or a separate short gen, front-aligned) + sub (40 to 80 Hz sine blip, hero hits only) + tail (baked debris for big breaks; otherwise leave dry for runtime reverb). For precise timing, the layers are **separately generated** (§2.7).
3. **Make variants cheaply:** keep the transient + sub, swap the body, for a new material or a fresh round-robin take (§2.7).
4. **Shape the envelope** to taste (faster attack = harder; slower = softer).
5. **Collapse to mono** (§2.5).
6. **De-fatigue the drill grind** (`SFX_BIBLE.md` §13): notch any harsh 2 to 5 kHz buzz.
7. **Loop prep** (loops + beds): equal-power crossfade the seam 20 to 100 ms; confirm it is seamless on repeat. For ambience, layer 2 to 3 takes with offset starts (§2.2).
8. **Normalize with headroom:** -6 dB peak typical, bombs to -3 dBFS, everything inside the loudness window (`SFX_BIBLE.md` §8).
9. **Render mono `.m4a`** (AAC, `afconvert` if rendering outside Reaper). Keep the `.wav` master local.
10. **Log the source** (asset, source, license) for the AI-disclosure + CC-BY trail (`SFX_BIBLE.md` §12).

---

## §9. The algorithm (what I do when you say "make me the [X]")

1. Resolve the input to a roster name (`SFX_BIBLE.md` §10) or the closest sound.
2. Apply any modifier via §6.
3. Look up materials/perspective/feel in the §3 vocabulary table.
4. Encode the invariants: positive-only for ElevenLabs (negative field for Stable Audio, §2.3), dry-for-Effect (§2.4), mono (§2.5), Duration >= 0.5 s then trim (§2.1), the layer stack (§2.7).
5. Build the prompt with the §4 formula; add onomatopoeia + a temporal arc where they help (§2.1).
6. Set Duration, Looping, and Prompt Influence per the §5 entry.
7. State the pool size (how many to generate/keep) and the layers to stack/swap.
8. Recommend the tool (§7) and append the post-process notes (§8).

---

## §10. Worked examples

**"Make me the drill break on stone, a bit heavier."**
- Roster: `drill-break-stone`, modifier "heavier."
- **Prompt:** `A rock breaking with a sharp "crack" then a deep "whoomph" and a short gritty shatter with small falling stone debris, close-up, weighty, dry`
- **Settings:** Duration 0.7 s, Loop OFF, Influence 50. **Pool 3.** **Layers (generate separately, §2.7):** front transient + 50 Hz sub blip + `debris` tail. **Tool:** ElevenLabs.

**"Make me the deep cave ambience."**
- Roster: `amb-deep`.
- **Prompt:** `Deep underground cavern ambience, low pressure groans, distant rockfalls, a sustained low drone wash in D minor, lonely and vast, seamless`
- **Negative:** `no music, no melody, no drums, no distortion`
- **Settings:** Stable Audio, 60 to 90 s, generate 2 to 3 and layer offset, trim + equal-power crossfade, mono. **Tool:** Stable Audio.

**"Make me the shop-open sound."**
- Roster: `ui-open`.
- **Prompt:** `A low mechanical "thunk" of a heavy panel opening, close-up, a single soft dull clunk, clean, dry`
- **Settings:** Duration 0.5 s (trim to ~0.25 s), Loop OFF, Influence 55. One-of (pitch down ~2 semitones for the close variant). **Tool:** ElevenLabs or hand-build.

---

## §11. Open questions

- **Drill grind: one modulated body per material vs 3-variant pools.** Start with one body + engine modulation (`SFX_BIBLE.md` §6); add variants only if it reads repetitive.
- **Procedural break layer** (modal synthesis, `SFX_BIBLE.md` §9): prototype against the sampled stone break, keep the better/cheaper one.
- **Combat SFX**: combat is LIVE now (`085-combat.js` + the NMZ course `087-nmz-course.js`); the v1.2 set in §5 covers it. Open: whether the auto-turret wants a rare 4th "mechanical cycling" variant once heard at real fire rates.
- **Booster-tier jetpack** variants wait on `project_flight_booster`.
- **Lab integration: DONE** as `sfx-prompts.html` (copy buttons, per-card save-as filenames, key-TBA badges) + `sfx-test.html` (audition over the music beds, seamless-loop maker + WAV download). Keep the lab and §5 in sync; this doc is canonical.
- **Manifest keys: DONE** (wiring session 2026-06-10). `rig-drive`, `jet-spin`, `air-pulse` and the nine combat/course keys are in `SFX_MANIFEST` with live call sites; the whole catalog now fires in-game and lights up as assets land.

---

## §12. Quick-reference cheat sheet

1. **ElevenLabs = positive only** (no `no X`); **Stable Audio = use the negative-prompt field.**
2. **Duration floor 0.5 s.** For tighter assets, generate at 0.5 s and trim in Reaper.
3. **Looping toggle ON only for steady-state continuous sounds**; write them with no start/stop. One-shots OFF.
4. **Prompt Influence ~50 foley, ~35 organic**; 70 to 100 sticks literal but sounds unnatural, use sparingly.
5. **Onomatopoeia + temporal arc** on percussive/evolving sounds.
6. **Generate the layers separately, combine in Reaper**; swap one layer for instant variants.
7. **Mono out**, dry for Effect, baked space for Zone beds.
8. **Generate 5 to 8, pool the best N**; never one sample for the drill/footsteps/debris/pickup/tick.
9. **Tonal layers are music-side** (pickup chime, discovery chord), tuned to D minor; SFX gives the noise.
10. **Ambience drones keyed to D minor**; generate 2 to 3, layer offset.

---

## §13. Session log

- **2026-05-29 (v1)**: Initial SFX prompt system from the 13-agent SFX research pass and `SFX_BIBLE.md`. Established the minimal-input contract, tool conventions, the vocabulary table, the prompt formula, and the full paste-ready catalog.
- **2026-05-29 (v1.1)**: Best-practices hardening pass, verified against the ElevenLabs and Stable Audio documentation. Fixes: (1) every generation Duration raised to the ElevenLabs **0.5 s floor** with explicit trim-to targets (the v1 sub-0.5 s entries would not have generated). (2) **Removed all `no X` negative phrasing from ElevenLabs prompts** (no negative-prompt support; describe positively) and replaced melody-risk wording with positive **atonal framing**; moved exclusions to the **Stable Audio negative-prompt field** (which is documented and recommended). (3) Confirmed the ElevenLabs **Looping toggle** is the loop mechanism (continuous sounds only) and wrote loop bodies as steady-state. (4) Added **onomatopoeia** and **temporal/sequence phrasing** (both documented best practices) to percussive and evolving sounds. (5) Made the **generate-layers-separately, combine-in-DAW** workflow explicit, plus the **swap-one-layer-for-variants** trick. (6) Stable Audio beds rewritten as a **brief + negative line**, with the tuned depth-bed drones **key-locked to D minor** and the **generate-2-to-3-and-layer-offset** ambience trick. (7) Refined Prompt Influence guidance (default 30; ~50 foley, ~35 organic; high sparingly). Added §12 cheat sheet. Pairs with `SFX_BIBLE.md`; tonal layers cross-referenced to `MUSIC_PROMPT_SYSTEM.md`.
- **2026-06-10 (v1.2)**: Readiness-audit sync pass. Promoted the three sparse-emitter variants to real entries (pebble, metal-tick, air-hiss; they were a parenthetical). Backported the lab's Priority set into §5: the player is a vehicle, so its movement voice is `rig-drive` (tracked/wheeled/hover A/B/C, key TBA) with `footstep-*` reserved for a possible on-foot future, plus `jet-spin` (rotation layer over `jetpack-loop`) and `air-pulse` (horizontal thruster puff, pool 6). Authored the first combat + No Man's Zone course set (9 sounds: turret-fire, enemy-hit, drone-down, stinger-hit, missile-launch, missile-hit, flak-burst, obstacle-hit, ring-collect), since combat shipped after v1.1. Marked lab integration done (`sfx-prompts.html` mirrors §5 with save-as filenames matching the `SFX_MANIFEST` naming; `sfx-test.html` is the audition bench).
- **2026-06-10 (v1.3)**: Wiring-session sync. Every roster key now has a manifest entry AND a live game call site (combat/course panned by screen X; loops ride the new `SluiceAudio.sfxLoop` watchdogged per-frame drive). Removed the key-TBA caveats here and in the lab; generation order is now purely owner's choice — every saved file lights up on reload.
