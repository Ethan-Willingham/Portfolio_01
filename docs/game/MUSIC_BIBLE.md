# MUSIC_BIBLE.md

The canonical music + audio design reference for Sluice. Sister doc to `BUILDING_STYLE.md`, `BACKGROUND_STYLE.md`, `UI_STYLE.md`, `MINERALS_BIBLE.md`. Read this before composing, prompting, hiring, or implementing anything music-related. The prompt-generation companion is `MUSIC_PROMPT_SYSTEM.md`. Update the session log at the bottom as decisions land.

**Direction (Architecture v2, 2026-05-28):** the score is one warm late-night **jazz trio**, clean and hi-fi, sparse in the Minecraft sense, refracted across a hub-and-spoke world of towns. This **supersedes** the original frontier-Soviet folk direction, which the owner rejected after hearing it. The new direction was derived from a 27-song reference list the owner supplied; see §6. The game-music principles in §2 are genre-agnostic and survived the pivot intact; only the palette (§6) and the soundtrack architecture (§3) were rewritten.

---

## §1. Mission

Sluice is a hub-and-spoke mining game: the player spends most of their time underground (mining the zones below each town), in the shop, or flying across a large no-man's-land between towns, with combat along the journey. There is a day/night cycle. The world has several towns, each with its own underground zones (none of the zones are finalized yet). Web-first, going to a paid Steam release eventually. The owner is a solo developer using AI tools heavily, with no formal music training and limited time.

The audio target:
- **One warm late-night jazz trio**, clean and hi-fi (no crackle, no lo-fi grit). Piano, upright bass, brushed drums, with a rotating melodic lead.
- **Sparse, Minecraft-style.** Music is off more than it is on. The drill, the wind, the engine, the town murmur are the constant bed; composed music is the grace note.
- **Atmospheric, loopable, never insistent.** Background, not soundtrack.
- **Implementable in vanilla Web Audio + Howler.js** in the existing single-IIFE JS code style.
- **Legally clean for paid Steam release** (Steam AI disclosure, minimal Suno/UMG-lawsuit exposure).

Aspirational target: the Sluice OST is a cohesive late-night jazz record people would put on at home (a real Bandcamp release, the Hades model). Minimum bar: the music does not feel generic and does not fatigue after 10 hours of mining.

---

## §2. The eleven principles

These emerged independently from at least three of the eight research agents in the original game-music research pass. They are genre-agnostic and load-bearing.

### §2.1. Silence is the default. Music is the punctuation.
Dark Souls and Elden Ring spend hours unscored. Shadow of the Colossus is mostly wind. Minecraft's tracks fire at 10 to 20 minute intervals. For Sluice: compose around silence, not against it. In a mostly-quiet game the dependable moments for music to play are entering a town or shop, combat, death, and big events. Underground and the long flight are mostly ambient with a jazz cue that drifts in occasionally.

### §2.2. Density of music is inverse to depth.
Subnautica is the canonical case: shallow water has melody, the deep lava zone is near-silent. For Sluice: towns and the surface get warmth and melody; the deeper underground gets sparser, lonelier, more abstract. Expressed as layer gains, not a genre switch (see §3 and §6).

### §2.3. One main theme, refracted across every cue.
Undertale (one melody in 10+ tracks), Hollow Knight (the Hallownest motif morphs), Outer Wilds (the campfire banjo). For Sluice: write one main theme (the Town 1 piano melody). Refract it across the four towns by changing the lead instrument and key, hint it in the underground warmth layer, and play it solo and halftime at death. Jazz is the ideal idiom for this, because reinterpreting a head is what jazz does. This is the single biggest replay-tolerance lever.

### §2.4. End loops unresolved.
C418's "Sweden" ends on the IV, not the tonic. For Sluice: every loop ends on a non-tonic chord (IV, vi, or suspended). Jazz extended harmony makes this native.

### §2.5. Vertical layering is the workhorse. Horizontal jumps at boundaries.
The dominant adaptive-music pattern: all stems start together at the same key and tempo, the engine rides the gains. For Sluice: vertical layering for underground depth, danger, combat, and the day/night treatment. Horizontal jumps (with a brief crossfade) reserved for context changes: entering a town, starting the journey, death.

### §2.6. The "return to safety" cue is the most powerful music in the game.
Resident Evil's save room, Dark Souls' Firelink, Outer Wilds' campfire. For Sluice: the **town** is the only place a full, warm, present melodic cue lives. Everything else is sparser. The contrast does the emotional work.

### §2.7. ~12 to 30 unique tracks is the indie sweet spot. Sluice v2 lands around a dozen pieces plus one layered bed.
Hades 30, Bastion 22, Celeste 21. For Sluice's hub-and-spoke world (§3): 4 town themes, a 6-cue travel pool, a 4-layer underground bed, a combat layer, a death sting, and a few event stingers. Lean and Minecraft-appropriate.

### §2.8. Folk and ambient instrumentation are dramatically more loop-tolerant than rock or pop.
Bell-like tines, sustained pads, sparse acoustic plucks, and brushed jazz drums survive thousands of repetitions; sharp backbeats expose loops. The warm jazz palette (§6) is exactly the loop-tolerant palette: brushed drums, walking bass, Rhodes, piano, modal vamps.

### §2.9. Custom timbre over commercial presets. One live human element.
The "AI slop" tell is genericness. For Sluice: one live recorded instrument over the AI bed (a Fiverr session player, §4) gives a recognizable timbre and is the cheapest way to break the AI fingerprint. This matters MORE in the clean direction, because clean AI jazz is the easiest kind to clock as AI (§4.3).

### §2.10. Generative layers from prime-numbered loops produce effectively infinite variation.
Eno's Music for Airports: loops of different lengths never re-align identically. For Sluice: the underground bed's layers loop at different prime lengths (23s, 29s, 37s, 41s), so a few minutes of source sounds infinite.

### §2.11. Match music to controls (Kondo's rule).
The Mario theme works because its rhythm matches the run cycle. For Sluice: tie the brushed-drum feel to the drill rhythm so the drummer "plays along" while you dig; the travel cues glide at flight pace; the town music is still because the player is still. Fast falling is handled as sound design (§5.15), not scored, because it happens constantly.

---

## §3. The Sluice soundtrack architecture (v2)

The score is one trio (§6) refracted across the world's contexts. Music is sparse (§2.1): the ambient bed is constant, these pieces drift in and out.

### §3.1. By context

**Towns (4 unique themes).** The warmest, fullest, most present cue, the "return home" sound (§2.6). Each town is the same trio with a different player in the chair, the "one theme refracted" principle made into geography:
- Town 1: piano trio. The main theme, the title screen, and the source motif everything else quotes.
- Town 2: trombone lead (the Hiroshi Suzuki "Cat" color).
- Town 3: jazz violin lead (intimate, not orchestral).
- Town 4: clean reverbed guitar (the Khruangbin color).
The town theme loops gently while the player is in town, fading as they leave.

**Above-ground travel (a cycling pool of 6, town-agnostic).** The lonesome-road cues, played across the whole no-man's-land regardless of destination. One plays, then silence for several minutes, then another at random (Minecraft cadence, §5.13). Day/night is a treatment (§5.14), not separate versions. The "Big Iron / Khruangbin / Azymuth" wide, spacious, gliding flavor.

**Underground (one shared 4-layer bed, depth-driven).** Because the zones are undecided, underground is a single flexible layered bed that follows depth as a mood gradient (§2.2), not per-zone tracks:
- L1 Pocket (always on): soft upright bass + brushed drums.
- L2 Warmth (present shallow, fades out with depth): Rhodes/piano comping.
- L3 Deep (fades in with depth, crossfading against L2): sparse piano clusters + bowed bass + reverb wash.
- L4 Danger (gated by low fuel/hull, any depth): a tense reharmonized cluster on top.
Shallow = L1+L2 (warm), deep = L1+L3 (lonely), danger = +L4. That is "music thins with depth" done in jazz. Optional later: tint each town's underground in that town's lead instrument.

**Combat (one reactive layer).** Noir / crime-jazz tension that layers over the travel cue when combat starts and releases when it ends. Built as an approach now (combat is undeveloped); the system needs only a combat on/off hook.

**Stings and events.** A death sting (solo piano, the main theme halftime, unresolved) and 2 to 3 short event stingers (a vibraphone chord tuned to the tonic for a big strike, a soft cadence for town arrival, a single piano note for UI confirm).

### §3.2. The production list

| Piece | Count | Type |
|---|---|---|
| Town themes | 4 | standalone loops, refracted lead |
| Above-ground travel cues | 6 | standalone, cycle + silence |
| Underground bed | 1 set of 4 layers | vertical stems, same key/tempo, prime loops |
| Combat layer | 1 | reactive layer |
| Death sting | 1 | one-shot |
| Event stingers | 2 to 3 | one-shots |

Roughly a dozen standalone pieces plus the 4-layer underground set. The full ready-to-paste prompt for each lives in `MUSIC_PROMPT_SYSTEM.md` §5 and is mirrored in `audio-lab.html`.

### §3.3. Cross-cutting modifiers (treatments, not extra tracks)
- **Day/night** (above ground only): day warmer and fuller, night thinner and cooler. A filter + a gain layer (§5.14). Underground is timeless.
- **Fast falling:** a wind-rush whoosh + a dynamic low-pass dip on whatever is playing (§5.15). Never scored.
- **Depth low-pass** (underground): the deeper, the more muffled (§5.6).
- **Tuned pickups:** ore/upgrade sounds tuned to the trio's current chord (§5.9).

### §3.4. Track-to-source allocation
- **Suno v4.5**: town themes, travel cues, combat, underground L1/L2.
- **Stable Audio (Suno fallback)**: the abstract underground L3/L4 (Suno fights true sparseness).
- **Suno v5.5 or by hand**: the death sting (clean solo piano).
- **By hand in Reaper**: the event stingers (1 to 3 seconds is overkill for AI).
- **One live human element on top** of at least the four town themes (§2.9, §4.3).

---

## §4. The production pipeline

### §4.1. Recommended path (cleanest legal posture)
1. **One Suno Pro month** ($10, monthly not annual) while the v4.5 window is open. Generate the towns, travel pool, combat, underground L1/L2. Download WAVs, cancel.
2. **One Stable Audio Creator month** ($15 to 30) for the abstract underground L3/L4. Licensed training data, commercial use covered, license persists after cancellation. Download, cancel.
3. **Reaper** ($60 one-time) for loop trimming, layering, the clean master, the eventual mixing/ducking.
4. **One Fiverr session musician** ($50 to 100) for one live pass over the town themes (muted trumpet, trombone, violin, guitar). Both the transformative-use legal lever AND the anti-sterile production lever.
5. **Pixabay Music + Incompetech (CC-BY)** for fillers if needed.
6. **Check the Steam AI disclosure box** at store-page setup (mandatory since January 2026).

Total realistic budget: **$60 to $150**. See §7.

### §4.2. Tooling notes
Jazz and lo-fi are a Suno strength (unlike true dark ambient), so the clean jazz direction plays to Suno's strengths. v4.5 is the niche-genre high-water mark and is still in the Pro model picker, but deprecates when the licensed-only relaunch ships (roughly H2 2026). Stay on Pro ($10 monthly), download every take to disk immediately, keep generation logs for the ownership trail. Treat outputs as sketches and run them through the §4.3 transformation before shipping.

### §4.3. The clean transformation recipe (Reaper)
The old recipe leaned on vinyl crackle and heavy tape saturation to mask the AI fingerprint. We are clean now (the owner wants it clear), so:
1. Chop to a clean 4 or 8-bar phrase, rearrange if needed, drop weak sections.
2. Gentle high-shelf above 12 kHz, +1 to +2 dB, for air. Do NOT roll off the top.
3. Light bus-glue compression only, no pumping. Keep it dynamic.
4. Optional very subtle micro-pitch drift (±5 cents) to break machine-perfect tuning.
5. **The live human-element overlay matters MORE in the clean direction.** Clean AI jazz has no crackle to hide behind, so it is the easiest to clock as AI. One real recorded pass over the town beds is the defense, plus it is the copyrightability lever (US Copyright Office: human creative input transforms unprotectable AI output into a registrable derivative).
6. Trim to prime-number-second loop points (§2.10), crossfade the seam 50 to 100ms.
7. **No vinyl crackle, no tape hiss, no bitcrush.** If a take sounds dusty, re-roll it.

Export to `.webm` (Opus 96 kbps) for the web build, `.wav` for archive. Mono for the underground layer stems (half the browser memory).

---

## §5. Web Audio implementation patterns

### §5.1. The bus architecture
```
ctx.destination
  └─ master (Gain, -6 dB headroom)
      ├─ musicBus (Gain) ─── musicDuck (Gain) ────┐
      │   ├─ stem1Gain ── stem1Source            │
      │   ├─ stem2Gain ── stem2Source            │  (musicDuck rides for ducking, §5.5)
      │   └─ ...                                 │
      └─ sfxBus (Gain) ─── sfxFilter (Biquad LP, §5.6) ─── master
          ├─ drillVoice
          ├─ impactVoice (pooled)
          ├─ bombVoice
          ├─ uiVoice
          └─ ambientProcVoice (Half-Life soundscape, §5.7)
```
One `AudioContext` per game, created lazily on first user gesture. iOS unlock via silent buffer on `pointerdown`/`touchstart`/`keydown`.

### §5.2. Vertical layering for music (the underground bed, combat, day/night)
```js
function startStems(buffers /* AudioBuffers, same length and key */) {
  var startAt = ctx.currentTime + 0.1; // schedule slightly ahead
  var stems = buffers.map(function (b) {
    var s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
    var g = ctx.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(musicBus);
    s.start(startAt);
    return { src: s, gain: g };
  });
  stems[0].gain.gain.setValueAtTime(1, startAt); // base layer audible
  return stems;
}

function setStemLevel(stem, target, fadeS) {
  var t = ctx.currentTime;
  stem.gain.gain.cancelScheduledValues(t);
  stem.gain.gain.setValueAtTime(stem.gain.gain.value, t);
  stem.gain.gain.linearRampToValueAtTime(target, t + (fadeS || 0.5));
}
```
All stems start together at the same key/tempo. Game state changes only the per-stem gains. Equal-power crossfade (`cos((1-x) * Math.PI / 2)`) is more perceptually flat than linear. For the underground bed, ride L2 down and L3 up as a function of depth; add L4 on low fuel/hull.

### §5.3. Horizontal jump at a context boundary
Wait for the next bar, fade the current cue out over 0.5 to 1s, start the new one at offset 0. Used when entering or leaving a town, starting the journey, or dying.

### §5.4. Voice pool for repeated SFX
```js
var voices = {};
function play(name, opts) {
  opts = opts || {};
  var maxVoices = opts.maxVoices || 4;
  var pool = voices[name] || (voices[name] = []);
  var now = ctx.currentTime;
  for (var i = pool.length - 1; i >= 0; i--) if (pool[i].ends <= now) pool.splice(i, 1);
  if (pool.length >= maxVoices) {
    try { pool.shift().src.stop(); } catch (e) {}
  }
  var src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = opts.rate || (0.94 + Math.random() * 0.12); // ±6% jitter
  var g = ctx.createGain(); g.gain.value = opts.gain != null ? opts.gain : 1;
  src.connect(g); g.connect(opts.bus || sfxBus);
  src.start(0);
  pool.push({ src: src, ends: now + src.buffer.duration / src.playbackRate.value });
  return src;
}
```
Always pitch-jitter repeated SFX. Random selection from a 3 to 4 variant pool eliminates fatigue.

### §5.5. Ducking music under important SFX
```js
function duckMusic(amount, attackS, releaseS) {
  var t = ctx.currentTime;
  musicDuck.gain.cancelScheduledValues(t);
  musicDuck.gain.setValueAtTime(musicDuck.gain.value, t);
  musicDuck.gain.linearRampToValueAtTime(amount, t + (attackS || 0.05));
  musicDuck.gain.linearRampToValueAtTime(1.0, t + (attackS || 0.05) + (releaseS || 0.4));
}
function playBomb() { play('bomb'); duckMusic(0.35, 0.04, 0.6); }
```
Standard duck (event): target -9 dB (~0.35), attack 50 to 100ms, release 500 to 1000ms. Hard duck (death, context jump): ~0.12, 50ms, 1500ms. Gentle duck: ~0.7, 100ms, 800ms.

### §5.6. Depth-driven lowpass on the SFX (and optionally music) bus
```js
var sfxFilter = ctx.createBiquadFilter();
sfxFilter.type = 'lowpass'; sfxFilter.frequency.value = 20000;
sfxBus.disconnect(); sfxBus.connect(sfxFilter); sfxFilter.connect(master);

function updateDepthFilter(depthRows) {
  var freq = Math.max(5000, 20000 - depthRows * 100);
  sfxFilter.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 0.2);
}
```
Surface: 20 kHz, bright. Deep: 5 kHz, muffled. Free atmosphere tied to depth.

### §5.7. Procedural ambience (Half-Life soundscape)
Every 8 to 15 seconds (randomly), emit a faint distant rumble / drip / creak at -30 dB with random pan ±0.4. Fills the silence between music cues. A small pool of 5 to 10 short ambient samples, rotated.

### §5.8. The drill loop problem
After 3 seconds of continuous drilling, sweep the drill voice lowpass from 6 kHz to 3 kHz; after 10 seconds, also pull -3 dB. Snap back bright/loud on release. The drilling becomes texture, the release becomes ear-rest reward.

### §5.9. Tonal pickup sounds (the Mario coin trick)
Tune the ore-pickup sound's fundamental to the trio's current tonic (climbing for rare ore: tonic, fifth, octave). Pitch-shift via `playbackRate` based on what is playing. Players feel the chord-progression escalation without consciously hearing it. This makes gameplay sounds part of the music.

### §5.10. Library choice
Howler.js for SFX + codec fallback + iOS unlock (~7 KB). Raw Web Audio for the music stem mixer and bus filters (Howler's abstractions get in the way of the gain choreography). Skip Tone.js unless music goes procedural.

### §5.11. Loudness targets
Integrated -18 to -20 LUFS during typical play. True-peak ceiling -1 dBTP. Per-asset headroom -6 dB. Bombs hit -3 dBFS peak. Mix quiet, then master loud: if everything is squashed flat, the loud moments stop feeling big.

### §5.12. UI sounds: two total
The Elden Ring rule. No hover/scroll/focus sounds. Two for the whole game: a low thunk (shop open/close) and a sharp tink (purchase confirm). The player will appreciate the calm.

### §5.13. The cycle pool player (Minecraft cadence, for travel and towns)
The sparse-music model is a pool that plays one cue, then waits, then plays another. Not a continuous score.
```js
function makePool(buffers, opts) {
  opts = opts || {};
  var minGap = opts.minGap || 90, maxGap = opts.maxGap || 240; // seconds of silence between cues
  var last = -1, timer = null;
  function pick() { var i; do { i = Math.floor(Math.random() * buffers.length); } while (buffers.length > 1 && i === last); last = i; return buffers[i]; }
  function playOne() {
    var src = ctx.createBufferSource(); src.buffer = pick(); src.loop = false;
    var g = ctx.createGain(); g.gain.value = 1; src.connect(g); g.connect(musicBus);
    src.start();
    src.onended = function () { timer = setTimeout(playOne, (minGap + Math.random() * (maxGap - minGap)) * 1000); };
  }
  return { start: function () { playOne(); }, stop: function () { clearTimeout(timer); } };
}
```
Travel uses a 6-cue pool with long gaps. The town pool is per-town and loops more readily (the player lingers in town). Never repeat the same cue twice in a row.

### §5.14. Day/night treatment (above ground only)
Day/night is a treatment on whatever travel/town cue is playing, not separate recordings. At night, lower a "warmth" layer's gain and pull a gentle lowpass; bias the pool toward the night-leaning cues (Travel 4/5/6). At day, full and bright, bias toward Travel 2/3.
```js
function setTimeOfDay(t01) { // 0 = deep night, 1 = bright day
  nightLowpass.frequency.linearRampToValueAtTime(8000 + t01 * 12000, ctx.currentTime + 2);
  warmthLayer.gain.linearRampToValueAtTime(0.3 + t01 * 0.7, ctx.currentTime + 2);
}
```
Underground ignores this (it is timeless).

### §5.15. Fast-fall treatment (the vertical-hole plunge)
The player falls fast and often, so it is never scored. Instead, a wind-rush whoosh SFX plus a dynamic lowpass dip on the music/ambient bus while falling, opening back up on landing.
```js
function onFallStart() { fallFilter.frequency.linearRampToValueAtTime(2500, ctx.currentTime + 0.15); play('windRush'); }
function onLand()      { fallFilter.frequency.linearRampToValueAtTime(20000, ctx.currentTime + 0.25); }
```
The fall feels musical (the world goes muffled and rushes back) without a cue firing every time.

---

## §6. The warm-jazz palette (v2)

Derived from a 27-song reference list the owner supplied. The list converged tightly: warm, clean, analog jazz, slow to medium, swung, modal, late-night, with a single melodic voice over a soft trio. Songs included Miles Davis "Blue in Green", Bill Evans / Brubeck "Strange Meadow Lark", Coltrane "Equinox", Lee Morgan "Ill Wind", Count Basie "Li'l Darlin'", Hiroshi Suzuki "Cat", Jiro Inagaki "Gentle Wave", Azymuth "Manha", Cymande "Dove", Khruangbin "Right", Yussef Dayes, Joe Pass "Insensiblement", and Marty Robbins "Big Iron" (the one cinematic-western outlier). The palette is locked.

### §6.1. The trio (the constant core)
- **Acoustic grand piano**: lyrical, impressionistic, lush rootless extended voicings (the Bill Evans / Brubeck color).
- **Fender Rhodes**: warm electric-piano comping or lead (the Hiroshi Suzuki / Azymuth / lo-fi color).
- **Upright bass**: walking, warm, behind the beat. Or **round electric bass** for the Khruangbin cues.
- **Brushed drums**: soft, loose, behind the beat, light ride cymbal. Bowed bass and mallets for the deep underground textures.

### §6.2. The rotating leads (one per town, varied across cues)
- **Muted trumpet**: breathy, vocal, lonely (Miles, Lee Morgan). The cool night color.
- **Trombone**: mellow, sauntering (Hiroshi Suzuki "Cat"). Town 2.
- **Jazz violin**: warm, singing, lyrical, intimate not orchestral (Grappelli, Briscoe). Town 3.
- **Clean reverbed electric guitar**: gliding, spacious, dub-tinged (Khruangbin). Town 4.
- **Vibraphone**: the slow ringing lonesome tone (the cinematic travel cue).
- **Soft flute**: air and drift (Cymande "Dove").
- **Tenor / alto saxophone**: warm, breathy, used sparingly.

### §6.3. Harmony and feel
- **Modal vamps and one or two-chord grooves** (Coltrane minor blues, Cymande one chord) plus AABA standards over pedal points (Basie, Monk).
- **Extended rootless jazz voicings**, ii-V color, sevenths and ninths.
- **Loops end unresolved** (§2.4): native to this harmony.
- **Slow to medium, gently swung**, ~70 to 105 BPM, behind the beat.
- **Key:** D minor is home (Town 1, the main theme, the underground bed). The other towns shift key with their lead (F minor trombone, A minor violin, E minor guitar). The key center can lower with depth.

### §6.4. Production (clean, the v2 rule)
- **Clean, warm, hi-fi studio recording.** The sound of a 1960s Blue Note or Columbia jazz date, or a clean modern Khruangbin record.
- **Natural room reverb** (and warm plate), never spring-grit or cavernous horror reverb.
- **Present and clear.** Keep the top end; do not roll off the highs.
- **Mono-leaning is fine** (these records often are), but clean, not narrow-and-dull.
- **Forbidden:** vinyl crackle, tape hiss, lo-fi bitcrush, distortion, fuzz. The opposite of the old recipe. If a take sounds dusty, re-roll.

### §6.5. References to invoke (sonic qualities, NOT artist names in prompts)
Describe these qualities in prompts; the artist names are blocked by Suno filters (use `MUSIC_PROMPT_SYSTEM.md` §4):
- The muted-trumpet-over-impressionist-piano melancholy of "Blue in Green".
- The lyrical rubato piano trio of Bill Evans / Brubeck.
- The sauntering trombone jazz-funk of Hiroshi Suzuki's "Cat".
- The churning modal minor-blues of Coltrane's "Equinox".
- The slow big-band-at-a-whisper of Basie's "Li'l Darlin'" (use the muted-brass restraint, sparingly).
- The reverbed clean-guitar glide of Khruangbin.
- The sunlit samba jazz-funk of Azymuth's "Manha".
- The meditative one-chord groove of Cymande's "Dove".
- The warm singing jazz violin of Grappelli / Briscoe.
- The wide cinematic loneliness of "Big Iron" (without country instruments).

---

## §7. Tooling and economics

### §7.1. AI music landscape (May 2026)
| Tool | Monthly | Commercial use | Training data | Lawsuit exposure | Strength |
|---|---|---|---|---|---|
| **Stable Audio Creator** | $15-30 | Yes, persists post-cancel | Licensed | Lowest | Ambient, sparse textures, loops |
| **Suno Pro** | $10 monthly | Yes, no indemnity | Unlicensed (settled w/ Warner, suing UMG/Sony) | Medium-high | Jazz, lo-fi, songs, broad genres |
| **Udio** | N/A | Downloads disabled | N/A | N/A | Not usable for games |
| **ElevenLabs Music** | Varies | Yes, by tier | Licensed | Low | Improving, smaller catalog |
| **AIVA Pro** | EUR 49 | Yes, full copyright transfer | Mixed | Low | Orchestral / cinematic |

Recommendation: **Suno Pro primary for the jazz** (it is a Suno strength), **Stable Audio for the abstract deep underground textures**, skip Udio.

### §7.2. The Suno v4.5 window
v4.5 is still in the Pro model picker but deprecates when the licensed-only relaunch ships (roughly H2 2026). Plan: $10 Pro monthly, a heavy weekend generating the towns, travel pool, combat, and underground L1/L2, download every WAV, cancel. Permanent local library, ~$10.

### §7.3. Hiring a composer (reference, if AI does not work out)
Going rate 2026: $50 to $2,500 per finished minute; working indie composer with credits $200 to $1,000/min; non-exclusive license saves 40 to 70%. License, not work-for-hire. Realistic Sluice budget if going this route: $800 to $1,200 for 6 to 8 minutes non-exclusive.

### §7.4. Steam AI disclosure
Mandatory since January 17, 2026. Check the AI-content box at store-page setup. Cost of disclosing: zero. Cost of not disclosing: delisting + reputation. Just check the box.

### §7.5. OST distribution (post-launch)
The clean, cohesive jazz record is genuinely Bandcamp-able (the Hades crossover model), which the old ambient drone could never have been. Bandcamp is the highest revenue per fan and the indie OST home. DistroKid ($22.99/yr) for Spotify/Apple, accepts AI music with disclosure. CD Baby rejects fully-AI music. If Stable Audio outputs are used, read the TOS: the license usually covers in-game use, not standalone OST redistribution, so keep the Spotify release to the Suno + live-overlay tracks you have transformed.

---

## §8. Open questions (update as decided)

- **Town 1 take not yet locked.** A good piano-trio Variant A take exists (the owner found one). Lock it, build a Suno Persona from it, generate everything else from that for album cohesion.
- **Underground per-town tint** (optional): tinting each town's underground in that town's lead instrument is deferred; the shared 4-layer bed ships first.
- **Combat is undeveloped.** The prompt and the on/off hook are ready; revisit the feel once combat exists.
- **Vertical-layered Web Audio engine** should ship before any music is wired in. The §5 patterns (bus, layering, pool player, day/night, depth filter, fall filter, ducking) all drop into it.
- **Drill loop and SFX** are sample design, not AI tracks; not yet built.
- **Diegetic framing** (the music as the rig operator's own late-night record) is an optional flavor, not required.

---

## §9. Quick-reference cheat sheet

1. Silence first, music second.
2. Music thins with depth (layer gains, not a genre switch).
3. One main theme, refracted across the four towns and the death sting.
4. Loops end unresolved.
5. Vertical layers for underground/combat/day-night; horizontal jumps at context boundaries.
6. The town is the only full warm cue.
7. ~12 pieces plus the 4-layer underground bed.
8. One warm jazz trio: piano / Rhodes, upright or round bass, brushed drums, a rotating lead.
9. CLEAN and hi-fi, never crackle or lo-fi. One live human element on the town themes.
10. Prime-number loop stems underground for infinite combination.
11. Music matches controls (brushes to the drill; fast-fall is a filter dip, not a cue).

Contexts: 4 town themes, a 6-cue travel pool (Minecraft cadence), a 4-layer underground bed, a combat layer, a death sting, 2 to 3 event stingers. Mix: -18 LUFS, -1 dBTP, -6 dB headroom. Standard duck -9 dB / 50ms / 500ms. Depth lowpass on the bus. Pitch-jitter repeated SFX ±6%. Two UI sounds total. Tool: Suno Pro v4.5 for jazz + Stable Audio for deep textures + Reaper + one Fiverr session, ~$60 to $150.

---

## §10. Session log

- **2026-05-28 (v1)**: Initial bible from the 8-agent game-music research pass. Frontier-Soviet folk palette. Retired.
- **2026-05-28 (v2)**: Full pivot to a warm, clean, late-night jazz trio after the owner heard the Soviet direction and rejected it, then supplied a 27-song jazz reference list (researched in a 6-agent pass, same date). The genre-agnostic principles (§2), the Web Audio patterns (§5, plus new §5.13 pool player, §5.14 day/night, §5.15 fast-fall), the economics (§7), and the legal posture survived. Rewrote the architecture (§3) to a hub-and-spoke world (4 town themes refracted by lead, a 6-cue travel pool, a 4-layer underground bed, a combat layer, a death sting, event stingers), the palette (§6) to the warm jazz trio, and the transformation recipe (§4.3) to clean (crackle and lo-fi grit removed; the owner wants it clear). Companion prompts in `MUSIC_PROMPT_SYSTEM.md` and `audio-lab.html`.
