# MUSIC_PROMPT_SYSTEM.md

The Suno (and Stable Audio) prompt-generation system for Sluice. Reads from `MUSIC_BIBLE.md` (the design doctrine) plus the Suno prompt-engineering research pass, and produces complete, ready-to-paste prompts for every piece in the Architecture v2 soundtrack.

**Direction (v2, 2026-05-28):** the score is one warm late-night jazz trio (piano, upright bass, brushed drums), clean and hi-fi (no crackle, no lo-fi grit), sparse in the Minecraft sense (music is off more than it is on), with one main theme refracted across four towns and everything else. This **supersedes** the earlier frontier-Soviet folk direction, which is dead. Derived from a 27-song reference list the owner supplied (Miles Davis, Bill Evans, Hiroshi Suzuki, Coltrane, Khruangbin, Azymuth, Cymande, Count Basie, and more); see MUSIC_BIBLE.md §6.

**Input weighting (deliberate):**
- Game music research (MUSIC_BIBLE.md): HEAVY.
- Suno prompt engineering: HEAVY.
- Owner input: LIGHT. A context word (town, travel, underground, combat) plus maybe a lead instrument or mood. The system fills the rest.

Use this doc by either (a) copy-pasting the per-piece templates in §5 into Suno Custom mode, or (b) telling me "make me a [piece]" and I run the algorithm in §9.

---

## §1. The minimal-input contract

What the owner provides to trigger a prompt:
- **Required**: a context, one of {`town` (+ which lead: piano / trombone / violin / guitar) | `travel` | `underground` (+ which layer) | `combat` | `death` | `event`} OR a vibe pointer (a song or artist from the §4 table).
- **Optional**: a modifier (`darker`, `sparser`, `warmer`, `tenser`, `more melodic`, `swing harder`).
- **Optional**: a target model (`v4.5` default for jazz fidelity, `v5.5` for cleaner piano, `Stable Audio` for the abstract deep textures).
- **Optional**: a length (default ~2 to 3 min for a cue or town theme, 4 to 6s for a sting).

What the system fills automatically: the Style of Music field, the Lyrics field, the Exclude Styles field, the slider settings, the model recommendation, and the post-process notes.

---

## §2. The Suno-syntax invariants (every prompt, always)

### §2.1. Custom mode, never Simple mode
Custom mode gives independent control of Style, Lyrics, Title, Exclude Styles. Title is cosmetic; ignore it.

### §2.2. The triple-layer instrumental mantra
Reliability 90% vs 40%. Always all three:
1. **Lyrics**: `[Instrumental]` (or the shot-list in §2.7), nothing sung.
2. **Style opening or body**: `instrumental only no vocals`.
3. **Exclude**: the vocal block (see the base list in §2.6).

### §2.3. Clean and hi-fi, never lo-fi (the v2 rule)
The owner's jazz records are clean, warm, audiophile recordings, not dusty beats. So:
- **Always put in Style**: `clean warm studio recording, natural room reverb, hi-fi and present`.
- **Always exclude**: `vinyl crackle, tape hiss, lo-fi, distortion, fuzz`.
This is the single biggest change from the old palette. Do not add crackle or tape-grit anywhere.

### §2.4. Style of Music field formatting
- **5 to 8 comma-separated tags**, space after each comma.
- First 2 to 3 tags carry the most weight: lead with genre + the lead instrument, never with mood.
- ~200 chars is the effective sweet spot (1000 hard limit on v4.5+).
- **No artist names** (blocked by filters). Use the §4 substitution table.

### §2.5. The Power-User Style template (recipe to fill)
```
[late-night jazz + feel], [mood], instrumental only no vocals,
[lead instrument + character], [comping instrument], [bass], [drums],
clean warm studio recording, natural room reverb, hi-fi and present,
seamless loop no buildup no drop, [BPM], [key]
```

### §2.6. The base Exclude list (start here every time)
```
vocals, humming, choir, scat, vinyl crackle, tape hiss, lo-fi, distortion, fuzz, distorted guitar, rock, EDM, synth lead, modern pop production, crescendo, drop, fanfare, soaring
```
Per-piece additions are written as **"base + X"** below. When a piece needs a horn lead, write **"base (allow trumpet)"** so the horn is not excluded. For pure piano or violin leads, add `trumpet, saxophone, brass` so a horn does not sneak in (trombone is brass, so for the trombone town exclude only `trumpet, saxophone`).

### §2.7. Lyrics as a shot-list (for hero pieces)
For the town themes and the death sting, script the arrangement in the Lyrics field. Suno honors parameterized meta tags:
```
[Instrumental Intro: solo piano, sparse, four bars, low register]
[Main: piano states a slow modal melody, lyrical right hand, sparse left hand]
[Bridge: stripped to solo piano, very quiet, rubato]
[Outro: piano alone, last chord hangs unresolved, soft reverb tail]
[Minimal Variation] [Sustained]
```
For travel cues and underground layers, `[Instrumental] [Sustained] [Minimal Variation]` is enough.

### §2.8. Loop-killer language
Strip every word implying a peak: `epic, drop, climax, finale, buildup, crescendo, swell, fanfare, triumphant, soaring, dramatic, intro, ending`. Add loop language: `seamless loop, no buildup, no drop, consistent energy, sustained throughout`.

### §2.9. Sliders
Weirdness 30, Style Influence 75 for most pieces. Drop Weirdness to 25 for the sparsest underground layers (less surprise). Audio Influence only if uploading a reference, 75 if so.

### §2.10. Generate 4 to 6, pick the most boring
Background music wants the least event-dense take. The exception is the **town themes**, which can be the most present/melodic, so for those pick the one with the strongest hummable head.

---

## §3. The Sluice-design invariants (every prompt encodes these)

From MUSIC_BIBLE.md, baked in automatically:
1. **One trio jazz identity.** Piano (or Rhodes) + upright (or round) bass + brushed drums. Lock the chosen Town 1 take as a Suno Persona and generate everything else from it for album cohesion.
2. **Sparse, Minecraft-style.** Music is the grace note over an ambient bed. Pieces are written to drift in and out, not to wall-to-wall score.
3. **One theme refracted.** The Town 1 piano melody is the source motif; town themes quote it with a different lead and key; the death sting plays it halftime.
4. **Loops end unresolved** (on the IV, vi, or a suspended chord).
5. **Depth is a mood gradient.** Underground warmth fades and lonely sparseness fades in with depth, expressed as layer gains, not a genre switch. Clean all the way down.
6. **Context sets presence.** Towns fullest and warmest; travel a cycling pool; underground sparse layers; combat a tense layer that fires then releases.
7. **Clean always** (§2.3).
8. **Tempo and key.** Slow to medium, ~70 to 105 BPM, gently swung. D minor is home (Town 1); the other towns shift key with their lead.
9. **No vocals, ever** (§2.2).

---

## §4. The reference-to-descriptor substitution table (Suno-safe)

When the owner names a song or artist from their list, the system substitutes the description. Artist names are blocked.

| Owner says | System substitutes |
|---|---|
| Miles Davis / "Blue in Green" / muted trumpet | `muted trumpet, breathy and vocal, slow modal ballad, impressionistic piano underneath, spacious` |
| Bill Evans / Brubeck / jazz piano | `lyrical acoustic piano, lush rootless extended voicings, rubato, introspective, trio` |
| Hiroshi Suzuki / "Cat" / trombone | `mellow trombone lead, Fender Rhodes, sauntering jazz-funk, warm 1970s studio, loose swing` |
| Khruangbin / "Right" | `clean reverbed electric guitar, round electric bass, spacious dub-tinged soul groove, gliding` |
| Azymuth / "Manha" | `electric samba jazz-funk, Fender Rhodes lead, samba-brushed drums, sunlit, breezy` |
| Cymande / "Dove" | `slow one-chord modal groove, round bass, flute, congas, meditative, spacious` |
| Coltrane / "Equinox" | `minor-blues modal vamp, quartal piano comping, churning brushed swing, brooding` |
| Count Basie / "Li'l Darlin'" | `very slow big band at a whisper, muted brass, plush sax-section pads (use sparingly)` |
| Stephane Grappelli / jazz violin / Briscoe | `warm singing jazz violin, lyrical and melancholic, intimate, acoustic piano comping` |
| Yussef Dayes | `live swung drum-led modern jazz, modal vamp, Rhodes, breathy sax color` |
| Lee Morgan / hard-bop ballad | `muted trumpet ballad, warm piano, soft sax-section cushion, late-night romance` |
| Big Iron / lonesome western | `wide cinematic spacious jazz, vibraphone or clean guitar, deep reverb, yearning (no country instruments, no fiddle)` |
| Nujabes / lo-fi (if ever requested) | `jazzy chords, mellow Rhodes, soft melody (NOTE: our direction is clean, so skip the dusty drums and vinyl)` |

---

## §5. The per-piece templates (Architecture v2)

Every template is ready to paste. Sliders are Weirdness 30 / Style Influence 75 unless noted. Model is Suno v4.5 unless noted (v5.5 is a fine alternative; jazz and lo-fi are a Suno strength). Exclude uses the base list from §2.6.

### TOWNS (4 unique themes, the warmest and most present cue)

#### Town 1 — Piano (main theme, title screen, source motif)
**Style:**
```
late-night jazz piano trio, warm and unhurried, instrumental only no vocals, lyrical acoustic grand piano melody, impressionistic extended chords, upright bass walking quietly, soft brushed drums, clean warm 1960s studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 80 BPM, D minor
```
**Lyrics:**
```
[Instrumental Intro: solo acoustic piano, sparse, four bars, low register]
[Main: piano states a slow modal melody, lyrical right hand, sparse left hand, upright bass and brushed drums underneath]
[Bridge: stripped to solo piano, very quiet, rubato]
[Outro: piano alone, last chord hangs unresolved, soft reverb tail]
[Minimal Variation] [Sustained]
```
**Exclude:** base + `trumpet, saxophone, brass`
**Notes:** The spine of the whole score. This is the take you A/B'd and kept. Lock the winner as a Suno Persona, then generate everything else from it. Doubles as the title/menu theme.

#### Town 2 — Trombone (the Hiroshi Suzuki "Cat" color)
**Style:**
```
late-night jazz, warm and sauntering, instrumental only no vocals, mellow trombone melody, Fender Rhodes comping, upright bass, soft brushed drums with light ride cymbal, clean warm 1970s studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 86 BPM, F minor
```
**Lyrics:**
```
[Instrumental Intro: Fender Rhodes vamp, four bars]
[Main: mellow trombone states the melody, sauntering, over Rhodes with upright bass and brushes]
[Bridge: Rhodes and bass only, quiet]
[Outro: trombone holds a long note, last chord unresolved, soft reverb tail]
[Minimal Variation] [Sustained]
```
**Exclude:** base + `trumpet, saxophone` (allow trombone)
**Notes:** Quotes the Town 1 motif in F minor. The sauntering jazz-funk warmth of "Cat."

#### Town 3 — Violin (intimate jazz violin)
**Style:**
```
late-night jazz, warm and lyrical, instrumental only no vocals, singing solo jazz violin melody, warm acoustic piano comping, upright bass walking quietly, soft brushed drums, clean warm studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 76 BPM, A minor
```
**Lyrics:**
```
[Instrumental Intro: solo piano, sparse, four bars]
[Main: jazz violin states the melody, warm and singing, over piano with upright bass and brushes]
[Bridge: violin and piano only, very quiet]
[Outro: violin sustains, last chord hangs unresolved, soft reverb tail]
[Minimal Variation] [Sustained]
```
**Exclude:** base + `trumpet, saxophone, brass, orchestral, classical, string section`
**Notes:** Grappelli / Briscoe color, intimate not orchestral (that is why the string-section excludes matter). Quotes the motif in A minor. If it reads classical, add `swung, behind the beat` to Style.

#### Town 4 — Clean guitar (the Khruangbin color)
**Style:**
```
late-night jazz, warm and gliding, instrumental only no vocals, clean reverbed electric guitar melody, Fender Rhodes comping, round electric bass, soft brushed drums, spacious natural reverb, clean warm studio recording, hi-fi and present, seamless loop no buildup no drop, 84 BPM, E minor
```
**Lyrics:**
```
[Instrumental Intro: Rhodes and round bass groove, four bars]
[Main: clean reverbed electric guitar states the melody, gliding, over Rhodes with round bass and brushes]
[Bridge: bass and guitar only, spacious]
[Outro: guitar note rings out, last chord unresolved, reverb tail]
[Minimal Variation] [Sustained]
```
**Exclude:** base + `trumpet, saxophone, brass, orchestral`
**Notes:** Khruangbin glide; round electric bass and dub-tinged space rather than upright. Motif in E minor.

### ABOVE-GROUND TRAVEL (a cycling pool of 6, town-agnostic)

These play across the whole no-man's-land regardless of town: one plays, then silence for several minutes, then another at random (Minecraft cadence). Day/night is a treatment the engine applies (night = a low-pass plus thinning), so there are no separate day/night versions; the **day/night lean** noted below just guides which cue the engine biases toward.

#### Travel 1 — Lonesome glide (guitar) [day or night]
**Style:**
```
spacious lonesome jazz, wide open and gliding, instrumental only no vocals, clean reverbed electric guitar melody drifting, Fender Rhodes pads, round electric bass, soft brushed drums, deep natural reverb, clean warm studio recording, hi-fi and present, seamless loop no buildup no drop, 88 BPM, E dorian
```
**Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
**Exclude:** base + `orchestral`
**Notes:** The flagship open-road cue (Khruangbin).

#### Travel 2 — Walking drive (piano trio) [day]
**Style:**
```
mid-tempo jazz trio, forward motion and easy swing, instrumental only no vocals, acoustic piano comping with sparse melodic phrases, walking upright bass, brushed drums with light ride, clean warm 1960s studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 98 BPM, D minor
```
**Lyrics:** `[Instrumental] [Sustained]`
**Exclude:** base + `trumpet, saxophone, brass`
**Notes:** The trio with momentum, walking bass driving the journey.

#### Travel 3 — Sunlit sway (Brazilian, the Azymuth color) [day]
**Style:**
```
gentle jazz-funk sway, sunlit and breezy, instrumental only no vocals, Fender Rhodes melody, warm electric bass, soft samba-tinged brushed drums, light hand percussion, clean warm 1970s studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 104 BPM, F major
```
**Lyrics:** `[Instrumental] [Sustained]`
**Exclude:** base + `trumpet, saxophone, brass, aggressive`
**Notes:** The brightest cue ("Manha" daytime sway). Bias to daytime travel.

#### Travel 4 — Cinematic lonesome (vibraphone, the Big Iron color) [dusk or night]
**Style:**
```
wide cinematic lonesome jazz, spacious and yearning, instrumental only no vocals, vibraphone melody ringing slowly, warm acoustic piano, upright bass, soft brushed drums, deep spacious reverb, clean warm studio recording, hi-fi and present, seamless loop no buildup no drop, 74 BPM, A minor
```
**Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
**Exclude:** base + `trumpet, saxophone, brass, orchestral, string section`
**Notes:** The wide-desert loneliness of "Big Iron" without going country; vibraphone for the open ring.

#### Travel 5 — Cool noir cruise (muted trumpet) [night]
**Style:**
```
cool noir jazz, nocturnal and smooth, instrumental only no vocals, muted trumpet melody, warm acoustic piano comping, walking upright bass, brushed drums, clean warm 1960s studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 92 BPM, C minor
```
**Lyrics:** `[Instrumental] [Sustained]`
**Exclude:** base (allow trumpet)
**Notes:** The night drive, Miles muted-trumpet cool.

#### Travel 6 — Hazy drift (Rhodes and flute) [night]
**Style:**
```
dreamy hazy jazz, floating and gentle, instrumental only no vocals, Fender Rhodes melody, soft flute counter-melody, warm upright bass, very soft brushed drums, deep natural reverb, clean warm studio recording, hi-fi and present, seamless loop no buildup no drop, 82 BPM, G dorian
```
**Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
**Exclude:** base + `trumpet, saxophone, brass` (allow flute)
**Notes:** Dreamy floating drift; the flute is the "Dove" air.

### UNDERGROUND (one shared 4-layer bed, depth-driven)

All four at the same key (D minor) and feel so they stack and crossfade in-engine. Generate each as an isolated texture, then trim to the prime-number loop length in the lab or Reaper. Solo them in the lab to check each in isolation, then ride the gains. Sliders: Weirdness 25, Style Influence 80.

#### Underground L1 — Pocket (always on)
**Style:**
```
sparse jazz rhythm section bed, instrumental only no vocals, soft upright bass and gentle brushed drums only, low and slow, no melody, lots of space, clean warm studio recording, natural room reverb, seamless loop no buildup no drop, 68 BPM, D minor
```
**Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
**Exclude:** base + `trumpet, saxophone, brass, piano, lead instrument, melody`
**Loop target:** ~23s. **Notes:** the band breathing in the room. Always present underground.

#### Underground L2 — Warmth (present shallow, fades out with depth)
**Style:**
```
warm jazz pad layer, instrumental only no vocals, soft Fender Rhodes and acoustic piano comping, gentle extended chords, no melody, no drums, sustained and slow, clean warm studio recording, natural room reverb, seamless loop no buildup no drop, 68 BPM, D minor
```
**Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
**Exclude:** base + `trumpet, saxophone, brass, drums, bass, melody`
**Loop target:** ~29s. **Notes:** the comforting harmony near the surface; gain ramps to zero as you descend.

#### Underground L3 — Deep (fades in with depth, crossfades against L2)
**Style:**
```
lonely abstract jazz texture, instrumental only no vocals, sparse acoustic piano clusters with long pauses, bowed upright bass drone underneath, deep spacious reverb wash, almost no rhythm, clean warm studio recording, seamless loop no buildup no drop, free tempo, D minor
```
**Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
**Exclude:** base + `trumpet, saxophone, brass, drums, melody`
**Loop target:** ~37s. **Notes:** the lonely depths; replaces L2 as you go down.

#### Underground L4 — Danger (gated by low fuel or hull, any depth)
**Style:**
```
tense dark jazz texture, instrumental only no vocals, low dissonant piano cluster, slow bowed-bass swell, unsettling minor seconds, deep reverb, no rhythm, clean warm studio recording, seamless loop no buildup no drop, free tempo, D minor
```
**Lyrics:** `[Instrumental] [Sustained]`
**Exclude:** base + `drums, melody, bright`
**Loop target:** ~41s. **Notes:** rides on top when fuel or hull is low. Tense but still jazz, not horror.

### COMBAT (one reactive layer)

#### Combat — Noir tension
**Style:**
```
urgent noir jazz, driving and tense, instrumental only no vocals, fast walking upright bass, agitated ride cymbal and brushes, tense dissonant piano stabs, occasional muted trumpet stabs, clean warm studio recording, natural room reverb, seamless loop no buildup no drop, 124 BPM, D minor
```
**Lyrics:** `[Instrumental] [Sustained]`
**Exclude:** base (allow trumpet) + `fanfare, soaring`
**Notes:** fires over the travel cue when combat starts, releases when it ends. Same trio, agitated. Crime-jazz (Lee Morgan / Coltrane intensity).

### STINGS AND EVENTS (one-shots; turn the lab loop OFF)

#### Death — Solo piano halftime
**Style:**
```
solo acoustic piano, lonely and final, instrumental only no vocals, single piano plays the main theme melody slowly in halftime minor, no left hand, clean warm studio recording, natural room reverb, no buildup no resolution, 50 BPM, D minor
```
**Lyrics:**
```
[Intro: one second of silence]
[Main: solo piano plays the main theme melody in slow halftime, sparse, no left hand]
[Outro: the last note hangs unresolved, soft reverb tail fades]
[Minimal Variation]
```
**Exclude:** base + `drums, bass, ensemble, full band, multiple instruments, trumpet, saxophone, brass`
**Model:** Suno v5.5 (cleaner solo piano) or build by hand. **Notes:** ~5s. The motif, one last time.

#### Event 1 — Big strike / ore record
**Style:**
```
single warm vibraphone chord, instrumental only no vocals, soft mallet hit on a D minor chord, gentle bloom and slow decay, clean warm studio recording, natural room reverb, no rhythm, 3 seconds
```
**Lyrics:** `[Instrumental]`
**Exclude:** base + `drums, melody`
**Notes:** tuned to the trio's tonic (the "coin tuned to the key" trick). Easiest built by hand in Reaper.

#### Event 2 — Town arrival / safe
**Style:**
```
short warm piano cadence, instrumental only no vocals, two soft chords resolving gently, clean warm studio recording, natural room reverb, no rhythm, 3 seconds, D minor
```
**Lyrics:** `[Instrumental]`
**Exclude:** base + `drums`
**Notes:** the small relief of arriving. One-shot.

#### Event 3 — Soft confirm (UI)
**Style:**
```
single soft piano note, instrumental only no vocals, clean warm studio recording, natural room reverb, no rhythm, 1 second, D
```
**Lyrics:** `[Instrumental]`
**Exclude:** base
**Notes:** one of only two UI sounds in the whole game (Elden Ring rule, MUSIC_BIBLE §5.12). Build by hand.

---

## §6. Variations dial (how to modify any template)

- **"Darker"**: pitch the key down one step, add `darker, more dissonant, lower register`, drop the lead, slow 5 to 10 BPM.
- **"Sparser"**: drop a layer/instrument, add `near silence, more pauses, very sparse`, add `[Sustained]`.
- **"Warmer"**: add `warm and intimate, room sound`, lead with Rhodes comping as the bed, pitch up a step.
- **"Tenser"**: add `dissonant minor seconds, suspended chords`, bring in the L4 danger color.
- **"More melodic"**: add a single-instrument melodic top with sparse phrases; name the lead (muted trumpet, violin, vibraphone).
- **"Swing harder"**: add `swung, behind the beat, loose ride cymbal`, specify BPM.

---

## §7. Model selector

| Piece | Best tool | Reason |
|---|---|---|
| Town themes (1 to 4) | Suno v4.5 | Jazz-trio fidelity; lock the winner as a Persona |
| Travel cues (1 to 6) | Suno v4.5 | Jazz and groove are a Suno strength |
| Underground L1 / L2 | Suno v4.5 | Warm jazz textures |
| Underground L3 / L4 | Stable Audio (Suno v4.5 fallback) | Sparse abstract textures; Suno fights true sparseness |
| Combat | Suno v4.5 | Driving jazz |
| Death sting | Suno v5.5 or by hand | Cleaner solo piano |
| Event stingers | Build by hand in Reaper | One to three seconds is overkill for AI |

**The Suno v4.5 window is closing** (deprecates when the licensed-only relaunch ships, roughly H2 2026). Plan: a $10 Suno Pro month, generate the towns, travel pool, combat, and underground L1/L2 in v4.5, download WAVs, cancel. Generate the abstract L3/L4 in a Stable Audio month. See MUSIC_BIBLE.md §7.

---

## §8. The post-process recipe (clean version)

The old recipe leaned on vinyl crackle and heavy tape saturation to mask the AI fingerprint. We are clean now, so the recipe changes:

1. **Loop trim**: crop to a clean musical phrase (4 or 8 bars), 50 to 100ms equal-power crossfade at the seam.
2. **Gentle high-shelf** above 12 kHz, +1 to +2 dB, for air (do NOT roll off the highs the way the old lo-fi recipe did; clean wants the top end present).
3. **Light bus glue compression** only, no obvious pumping. Keep it dynamic.
4. **Optional micro-pitch drift** (ReaPitch, slow LFO, ±5 cents) to break machine-perfect tuning, very subtle.
5. **The human-element overlay matters MORE now.** Clean AI jazz is the easiest kind to clock as AI, because there is no crackle to hide behind. For at least the four town themes, hire a Fiverr session player for one real pass (a muted trumpet line, a Rhodes comp, a violin phrase, a guitar melody) over the AI bed. This is both the copyrightability lever (US Copyright Office) and what keeps clean from sounding sterile.
6. **No vinyl crackle, no tape hiss, no bitcrush.** If a take sounds dusty, re-roll it.

**Export:** `.webm` (Opus 96 kbps) for the web build, mono for the underground layer stems (half the browser memory), `.wav` kept locally. Loudness -18 to -20 LUFS integrated, -1 dBTP ceiling.

---

## §9. The algorithm (what I do when you say "make me a [X]")

1. Identify the context from the input (town + lead / travel / underground + layer / combat / death / event). Match to §5.
2. Identify modifiers; apply §6.
3. Look up any named reference in the §4 table.
4. Encode the §3 invariants (one trio, clean, sparse, loop-unresolved, depth gradient, key/tempo).
5. Build the Style field with the §2.5 template, 5 to 8 tags, weighty first, space after comma.
6. Build the Lyrics field: `[Instrumental]` for beds, shot-list for towns and death.
7. Build the Exclude field: base list (§2.6) + per-piece additions.
8. Set sliders (§2.9) and recommend a model (§7).
9. Append post-process notes (§8).

---

## §10. Worked examples

**"Make me a night travel cue with a saxophone."**
Context travel, night lean, lead = sax. Result:
- **Style:** `cool nocturnal jazz, smooth and lonely, instrumental only no vocals, warm tenor saxophone melody, acoustic piano comping, walking upright bass, soft brushed drums, clean warm 1960s studio recording, natural room reverb, hi-fi and present, seamless loop no buildup no drop, 84 BPM, C minor`
- **Lyrics:** `[Instrumental] [Sustained]`
- **Exclude:** base (allow saxophone)
- **Model:** Suno v4.5.

**"Make the underground deep layer darker and sparser."**
Context underground L3, modifiers darker + sparser. Pitch down, strip, add pauses:
- **Style:** `near-silent abstract dark jazz, instrumental only no vocals, very sparse low piano clusters with long pauses, slow bowed-bass drone, deep spacious reverb, no rhythm, clean warm studio recording, seamless loop no buildup no drop, free tempo, C minor`
- **Lyrics:** `[Instrumental] [Sustained] [Minimal Variation]`
- **Exclude:** base + `drums, melody, bright`
- **Model:** Stable Audio.

---

## §11. Open questions

- **Town 1 take not yet locked.** A good Variant A exists (the owner found one). Lock it, then build the Persona.
- **Underground per-town tint** (optional): tinting each town's underground in that town's lead instrument is deferred; the shared 4-layer bed ships first.
- **Combat is undeveloped.** The prompt and the on/off hook are ready; revisit feel once combat exists.
- **Drill loop and SFX** are sample design, not Suno tracks; not covered here.

---

## §12. Session log

- **2026-05-28 (v1)**: Frontier-Soviet folk system. Retired.
- **2026-05-28 (v2)**: Full pivot to warm clean late-night jazz, hub-and-spoke architecture, after the owner rejected the Soviet direction and supplied a 27-song jazz reference list. Crackle and lo-fi grit removed (owner wants it clear). Complete prompt set authored for all v2 pieces: 4 town themes (piano / trombone / violin / guitar), 6 travel cues, 4 underground layers, 1 combat layer, 1 death sting, 3 event stingers. Mirrors `audio-lab.html` and MUSIC_BIBLE.md Architecture v2.
