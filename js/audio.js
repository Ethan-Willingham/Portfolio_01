/* ============================================================================
   Sluice audio engine  —  SluiceAudio
   ----------------------------------------------------------------------------
   A standalone Web Audio subsystem, sibling to liquid-wgpu.js: its own file,
   its own global, loaded by sluice.html, and called into by the game. It is
   NOT part of the sluice.js IIFE bundle (kept separate so it never collides
   with the heavily-edited game bundle, same as the WebGPU solvers).

   Implements MUSIC_BIBLE.md §5:
     - bus graph + ducking
     - a Minecraft-cadence pool player (towns + travel)
     - a layer mixer (underground depth, combat, day/night)
     - depth + fast-fall lowpass filters
     - a small one-shot / SFX player

   Implements SFX_BIBLE.md §3/§5/§6/§8 + SFX_PROMPT_SYSTEM.md (the SFX pass):
     - IEZA buses: four gain groups under one sfxMaster — Effect + Zone
       (diegetic, routed through the depth lowpass) and Interface + Affect
       (non-diegetic, dry, NEVER depth-muffled)
     - SFX_MANIFEST: the full roster, kebab key -> assets/sfx/ file(s); pools
       are 'key_1.m4a'..'key_N.m4a'. A missing file skips silently, so dropping
       assets into assets/sfx/ lights them up with no code change.
     - playSfx(name, opts): pool one-shot player — round-robin-random (never
       the same variant twice in a row), ±3% pitch jitter (per-sound override)
       + ±2 dB volume jitter, ~24-voice cap with oldest-quietest stealing,
       optional runtime pan. opts = { bus, gain, rate, jitter, pan }.
     - createLoopVoice(name, busId): a parameter-driven continuous loop (the
       engine-RPM model, SFX_BIBLE §2.6) — handle.start(fadeS) / stop(fadeMs) /
       setPitch(rate, ramp) / setFilter(hz, ramp) / setGain(g, ramp), all
       zipper-free via setTargetAtTime. Drill grind, jetpack, fall-wind,
       lava-sizzle, the ambience beds.
     - sfxLoop(name, opts): the keyed per-frame loop drive over the above —
       the game calls it every frame the loop should sound (gain/pitch/filter
       in opts) and just stops calling otherwise; a shared watchdog fades +
       frees abandoned loops (the flight-pack contract for asset loops).
       rig-hum, rig-drive, jet-spin, bomb-fuse, lava-sizzle, fuel-fill.
     - flight(state): the synthesized FLIGHT pack (no assets); wind bed,
       engine under load, stall horn, vario, ignition / sonic boom /
       touchdown events. Built lazily from oscillators + one shared noise
       loop on the first per-frame call from the flight integrator, then
       only gains/frequencies move; a watchdog silences it when the calls
       stop (shop open, tab hidden). Lives under sfxEffect, so the SFX
       slider / mute / depth lowpass gate it like any other Effect.
     - IEZA ducking (SFX_BIBLE §8): an Interface one-shot ducks Effect
       (-4 dB, 150 ms recover); an Affect one-shot ducks Effect AND the music
       (-6 dB, 400 ms recover). Gain envelopes on the buses, no sidechain.
     - sfxMaster is the future SFX slider (setSfxVolume); setVolume stays the
       master, so the existing pause-screen slider keeps working unchanged.

   Game-facing one-liners (the convenience API):
     SluiceAudio.playSfx('ui-confirm')              // any rostered one-shot
     SluiceAudio.playSfx('hull-hit', { pan: 0.4 })  // panned by screen X
     SluiceAudio.sfx.drill.start('stone')           // spin-up + material grind
     SluiceAudio.sfx.drill.setSpeed(0.7)            // grind pitch/filter by tier
     SluiceAudio.sfx.drill.setProgress(0.9)         // pitch rise near the break
     SluiceAudio.sfx.drill.breakHit('crystal')      // the juice moment + debris
     SluiceAudio.sfx.drill.bounce()                 // cannot penetrate
     SluiceAudio.sfx.drill.stop()                   // release = ear-rest reward
     SluiceAudio.sfx.ambience.setZone('deep')       // crossfade the Zone bed
     SluiceAudio.sfxLoop('rig-hum', { gain: 1 })    // per-frame loop drive (watchdogged)
     SluiceAudio.flight(state)                      // per-frame synthesized flight pack
     SluiceAudio.setSfxVolume(0.8)                  // the SFX slider gate

   Design (MUSIC_BIBLE / MUSIC_PROMPT_SYSTEM Architecture v2):
     towns      = the active town's theme loops (warmest, most present cue)
     travel     = a 6-cue pool cycles with long silences (no immediate repeat)
     underground= depth picks ONE bed track (l1 shallow / l2 mid / l3 deep),
                  crossfading as you cross biome bands; l4 = danger override;
                  depth also muffles the bed via a lowpass
     combat     = a tense layer fades in over the current bed, releases on end
     death      = hard duck + the solo-piano lament one-shot
     events     = short one-shots, tuned pickups

   SHIPS SILENT. There are no audio assets in the repo yet. The engine loads
   from assets/music/ and silently skips any file that 404s, so every API is
   safe to call and the game stays silent until the .webm files land. Nothing
   here throws if Web Audio is unavailable, so it is harmless to wire up early.

   Code style mirrors the game: var (not let/const), single IIFE, no deps.
   ========================================================================= */
var SluiceAudio = (function () {
  'use strict';

  // ----- asset manifest: logical name -> file under assets/music/ -----------
  // Files are AAC .m4a (converted from the owner's WAVs with afconvert; no
  // ffmpeg on the box, so not Opus/webm yet, re-encode later if wanted). Any
  // file that is absent is skipped, and that cue is simply silent.
  // MUSIC lives in assets/music/; SFX lives in assets/sfx/ (SFX_MANIFEST below).
  var DIR = 'assets/music/';
  var MANIFEST = {
    // town themes (8 winners + town9 = town4 replacement; town id 0-7 -> townN, see TOWN_THEME)
    'town1': 'town1.m4a', 'town2': 'town2.m4a', 'town3': 'town3.m4a', 'town4': 'town4.m4a',
    'town5': 'town5.m4a', 'town6': 'town6.m4a', 'town7': 'town7.m4a', 'town8': 'town8.m4a',
    'town9': 'town9.m4a',
    // above-ground travel pool (1-6; 4 and 5 not provided yet, silent until added)
    'travel1': 'travel1.m4a', 'travel2': 'travel2.m4a', 'travel3': 'travel3.m4a',
    'travel4': 'travel4.m4a', 'travel5': 'travel5.m4a', 'travel6': 'travel6.m4a',
    // underground bed layers (ride gains by depth)
    'ug-l1': 'ug-l1.m4a', 'ug-l2': 'ug-l2.m4a', 'ug-l3': 'ug-l3.m4a', 'ug-l4': 'ug-l4.m4a',
    // combat layers
    'combat1': 'combat1.m4a', 'combat2': 'combat2.m4a',
    // one-shots (events not provided yet, silent until added)
    'death': 'death.m4a',
    'event-bigstrike': 'event-bigstrike.m4a',
    'event-arrival':   'event-arrival.m4a',
    'event-ui':        'event-ui.m4a'
  };

  // ----- SFX manifest: logical name -> file(s) under assets/sfx/ -------------
  // The full roster from SFX_BIBLE.md §10 / SFX_PROMPT_SYSTEM.md §5. Same
  // graceful contract as the music manifest: every file that is absent is
  // skipped and that sound is simply silent, so the catalog ships ahead of the
  // assets and each .m4a lights up the moment it lands in assets/sfx/.
  //   b    IEZA bus (SFX_BIBLE §3): 'e' Effect | 'z' Zone | 'i' Interface | 'a' Affect
  //   n    pool size (§5 anti-repetition): n 1 -> 'key.m4a'; n>1 -> 'key_1.m4a'..'key_N.m4a'
  //   loop true for continuous loops (played via createLoopVoice, §2.6)
  //   g    base gain (pre-jitter), default 1
  //   j    pitch-jitter override (fraction; default SFX_PITCH_JITTER = ±3%)
  var SFX_DIR = 'assets/sfx/';
  var SFX_MANIFEST = {
    // EFFECT — the drill flagship (SFX_BIBLE §6)
    'drill-spinup':         { b: 'e', n: 1 },
    'drill-grind-dirt':     { b: 'e', n: 1, loop: true },
    'drill-grind-stone':    { b: 'e', n: 1, loop: true },
    'drill-grind-ice':      { b: 'e', n: 1, loop: true },
    'drill-grind-crystal':  { b: 'e', n: 1, loop: true },
    'drill-grind-metal':    { b: 'e', n: 1, loop: true },
    'drill-grind-obsidian': { b: 'e', n: 1, loop: true },
    'drill-break-dirt':     { b: 'e', n: 3 },
    'drill-break-stone':    { b: 'e', n: 3 },
    'drill-break-ice':      { b: 'e', n: 3 },
    'drill-break-crystal':  { b: 'e', n: 3 },
    'drill-break-metal':    { b: 'e', n: 3 },
    'drill-break-obsidian': { b: 'e', n: 3 },
    'drill-bounce':         { b: 'e', n: 3 },
    'debris':               { b: 'e', n: 4, g: 0.8 },
    // EFFECT — movement
    'footstep-dirt':        { b: 'e', n: 4, g: 0.7 },
    'footstep-grass':       { b: 'e', n: 4, g: 0.7 },
    'footstep-metal':       { b: 'e', n: 4, g: 0.7 },
    'jetpack-ignite':       { b: 'e', n: 1 },
    'jetpack-loop':         { b: 'e', n: 1, loop: true },
    'jetpack-cutoff':       { b: 'e', n: 1 },
    'land-soft':            { b: 'e', n: 2, g: 0.8 },
    'land-hard':            { b: 'e', n: 2 },
    'land-damage':          { b: 'e', n: 2 },
    'fall-wind':            { b: 'e', n: 1, loop: true },
    'rig-hum':              { b: 'e', n: 1, loop: true, g: 0.5 },
    // EFFECT — pickups, cargo, damage, tools
    'ore-pickup':           { b: 'e', n: 4 },
    'cargo-full':           { b: 'e', n: 1 },
    'bomb-throw':           { b: 'e', n: 2 },
    'bomb-fuse':            { b: 'e', n: 1, loop: true },
    'bomb-small':           { b: 'e', n: 2 },
    'bomb-large':           { b: 'e', n: 2 },
    'rover-deploy':         { b: 'e', n: 2 },
    'rover-pop':            { b: 'e', n: 2 },
    'hull-hit':             { b: 'e', n: 3 },
    'teleport':             { b: 'e', n: 1 },
    'liquid-enter':         { b: 'e', n: 2 },
    'liquid-exit':          { b: 'e', n: 2 },
    'lava-sizzle':          { b: 'e', n: 1, loop: true },
    'jello-wobble':         { b: 'e', n: 3, g: 0.8 },
    // EFFECT — the rig movement voice (the player is a vehicle, not feet;
    // SFX_PROMPT_SYSTEM §5 Priority set — footstep-* stay reserved)
    'rig-drive':            { b: 'e', n: 1, loop: true, g: 0.7 },
    'jet-spin':             { b: 'e', n: 1, loop: true, g: 0.6 },
    'air-pulse':            { b: 'e', n: 6, g: 0.8 },
    // EFFECT — combat + the No Man's Zone course (085-combat.js /
    // 087-nmz-course.js). Auto-fire restraint: small, low-fatigue (§2.11);
    // the heavy receive stays 'hull-hit'.
    'turret-fire':          { b: 'e', n: 3, g: 0.7 },
    'enemy-hit':            { b: 'e', n: 3, g: 0.8 },
    'drone-down':           { b: 'e', n: 2 },
    'stinger-hit':          { b: 'e', n: 2, g: 0.8 },
    'missile-launch':       { b: 'e', n: 2 },
    'missile-hit':          { b: 'e', n: 2 },
    'flak-burst':           { b: 'e', n: 3, g: 0.9 },
    'obstacle-hit':         { b: 'e', n: 2 },
    'ring-collect':         { b: 'e', n: 2 },
    // ZONE — the ambience beds (SFX_BIBLE §7; depth crossfade, Stable Audio)
    'amb-surface-day':      { b: 'z', n: 1, loop: true },
    'amb-surface-night':    { b: 'z', n: 1, loop: true },
    'amb-rain':             { b: 'z', n: 1, loop: true },
    'amb-storm':            { b: 'z', n: 1, loop: true },
    'amb-shallow':          { b: 'z', n: 1, loop: true },
    'amb-mid':              { b: 'z', n: 1, loop: true },
    'amb-deep':             { b: 'z', n: 1, loop: true },
    'amb-magma':            { b: 'z', n: 1, loop: true },
    'amb-station':          { b: 'z', n: 1, loop: true },
    // ZONE — the sparse emitter pool + surface one-shots (fired by the engine)
    'thunder':              { b: 'z', n: 3 },
    'amb-bird':             { b: 'z', n: 5 },
    'amb-oneshot-drip':     { b: 'z', n: 1 },
    'amb-oneshot-settle':   { b: 'z', n: 1 },
    'amb-oneshot-creak':    { b: 'z', n: 1 },
    'amb-oneshot-rockfall': { b: 'z', n: 1 },
    'amb-oneshot-groan':    { b: 'z', n: 1 },
    'amb-oneshot-pebble':   { b: 'z', n: 1 },
    'amb-oneshot-metal-tick': { b: 'z', n: 1 },
    'amb-oneshot-air-hiss': { b: 'z', n: 1 },
    // INTERFACE — restrained (SFX_BIBLE §2.11); dry, never depth-filtered
    'ui-open':              { b: 'i', n: 1, j: 0.01 },
    'ui-confirm':           { b: 'i', n: 1, j: 0.01 },
    'ui-denied':            { b: 'i', n: 1, j: 0.01 },
    'sell-tick':            { b: 'i', n: 4 },
    'fuel-fill':            { b: 'i', n: 1, loop: true },
    'sell-total':           { b: 'i', n: 1, j: 0.01 },
    // AFFECT — emotional cues (always with a visual twin, SFX_BIBLE §13)
    'alert-fuel':           { b: 'a', n: 1, j: 0 },
    'alert-hull':           { b: 'a', n: 1, j: 0 },
    'danger-sting':         { b: 'a', n: 1, j: 0 },
    'depth-record':         { b: 'a', n: 1, j: 0 },
    'discovery':            { b: 'a', n: 1, j: 0 }
  };

  // town id -> which theme buffer it uses (8 winning town themes)
  var TOWN_THEME = { 0: 'town1', 1: 'town2', 2: 'town3', 3: 'town4', 4: 'town5', 5: 'town6', 6: 'town7', 7: 'town8' };
  // travel3 pulled from rotation (cringe opening riff); kept in MANIFEST so it still loads + re-enables in one edit.
  var TRAVEL_POOL = ['travel1', 'travel2', /* 'travel3' decringed */ 'travel4', 'travel5', 'travel6'];
  // 8 town themes. Until towns exist to fly to, these cycle above ground with
  // short gaps (mode 'towns') so all of them are heard; mode 'town' (single,
  // by id) is kept for when the towns + No Man's Zone expansion ships.
  // town4 + town6 pulled from rotation (cringe opening riffs); town9 = town4 replacement (organ keeper).
  // All three stay in MANIFEST so they load + re-enable in one edit.
  var TOWN_POOL = ['town1', 'town2', 'town3', /* 'town4' decringed */ 'town5', /* 'town6' decringed */ 'town7', 'town8', 'town9'];
  var TOWN_GAP_MIN_S = 12, TOWN_GAP_MAX_S = 30;   // above-ground: short pauses between cues

  // ----- tunables (MUSIC_BIBLE §5) ------------------------------------------
  var MASTER_HEADROOM = 0.6;      // ~ -6 dB
  var POOL_GAP_MIN_S  = 90;       // silence between travel cues (Minecraft cadence)
  var POOL_GAP_MAX_S  = 240;
  var DEPTH_LP_MIN_HZ = 5000;     // deepest = muffled
  var DEPTH_LP_MAX_HZ = 20000;    // surface = bright
  var FALL_LP_HZ      = 2500;     // muffled while plunging
  var DUCK_STD = { amt: 0.35, atk: 0.06, rel: 0.5 };
  var DUCK_HARD = { amt: 0.12, atk: 0.05, rel: 1.5 };
  // Underground: ONE track at a time (no stacking), chosen by DEPTH BAND. The
  // band track loops until you cross into another band, then crossfades to it.
  // L4 is the danger track (crossfades in on low fuel/hull, out when safe) and
  // overrides the band while active. Depth ALSO muffles via the lowpass filter
  // (setDepthFilter) on top of whichever band is playing.
  var UG_BANDS = ['ug-l1', 'ug-l2', 'ug-l3'];     // depth band index -> bed track
  // Band boundaries in rows below surface, aligned to biome gates (010-constants
  // LAYERS): l1 = surface..permafrost (<130, the bomb-gated barrier band),
  // l2 = fossil..deep crust (130..248), l3 = magma..mantle (248+, the heat zone).
  var UG_BAND_ROWS = [130, 248];
  var UG_BAND_HYST = 12;                          // rows of slack at each boundary so hovering doesn't flap
  var UG_DANGER = 'ug-l4';                         // danger override track
  var UG_CROSSFADE = 2.0;                         // seconds, track-to-track + entry
  var UG_GAP_MIN_S = 120, UG_GAP_MAX_S = 240;     // long Minecraft pauses between underground cues

  // ----- SFX tunables (SFX_BIBLE §5/§8) -------------------------------------
  var SFX_PITCH_JITTER  = 0.03;   // ±3% per-trigger playbackRate jitter (per-sound override via manifest j)
  var SFX_VOL_JITTER_DB = 2;      // ±2 dB per-trigger volume jitter
  var SFX_VOICE_CAP     = 24;     // one-shot voice cap; oldest-quietest stealing (§8)
  var SFX_LOAD_BATCH    = 6;      // concurrent fetch+decode jobs (batched, manifest order = priority)
  // IEZA ducking (§8): gain envelopes on the buses (no native sidechain).
  var DUCK_UI_FX  = { amt: 0.63, atk: 0.02, rel: 0.15 };  // Interface ducks Effect: -4 dB, 150 ms recover
  var DUCK_AFFECT = { amt: 0.50, atk: 0.03, rel: 0.40 };  // Affect ducks Effect + music: -6 dB, 400 ms recover
  // The sparse Zone emitter (§7): a faint one-shot every 8 to 15 s at -30 dB, pan ±0.4.
  var AMB_EMIT_MIN_S = 8, AMB_EMIT_MAX_S = 15, AMB_EMIT_GAIN = 0.032, AMB_EMIT_PAN = 0.4;
  var AMB_BED_GAIN = 0.8, AMB_CROSSFADE_S = 2.0;  // bed level + zone-to-zone crossfade

  // ----- state --------------------------------------------------------------
  var ctx = null, master, musicBus, musicDuck, depthFilter, fallFilter, nightLP, sfxBus, sfxFilter;
  var sfxMaster, sfxEffect, sfxZone, sfxInterface, sfxAffect;   // IEZA buses (built in ensure)
  var sfxVol = 1;                 // the SFX slider gate (sfxMaster), under the master volume
  var sfxBuffers = {};            // key -> [AudioBuffer, ...] (loaded pool variants only)
  var sfxLoadStarted = false;
  var sfxVoices = [];             // live one-shot voices, for the §8 voice cap
  var sfxLastPick = {};           // key -> last pool index (never the same twice in a row)
  var buffers = {};               // name -> AudioBuffer (present only once loaded)
  var disabled = false, loadStarted = false;
  var enabled = true, masterVol = MASTER_HEADROOM;

  var music = {
    mode: null,                   // 'town' | 'towns' | 'travel' | 'underground' | null
    townId: null,
    poolTimer: null, lastPool: -1, pool: null,
    current: null,                // current pool/town voice
    ug: null,                     // underground voice (one track at a time)
    ugBand: -1, ugDanger: false,  // current depth band (0/1/2; -1 = none) + danger override
    ugGap: false, ugTimer: null,  // underground: true during the silent gap; the play/gap timer
    combat: null,                 // combat layer voice
    oneShot: null,                // tracked music-bus one-shot (death sting / event cue) for the readout
    depthRows: 0,                 // last depth in rows below surface (drives the band)
    timeOfDay: 1                  // 0 night .. 1 day
  };

  // ===== availability / lazy init / iOS unlock ==============================
  function supported() {
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return ctx; }
    if (disabled || !supported()) { disabled = true; return null; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = enabled ? masterVol : 0; master.connect(ctx.destination);

      // SFX path (IEZA, SFX_BIBLE §3/§11): four buses under one sfxMaster.
      //   Effect + Zone (diegetic)        -> sfxFilter (depth lowpass) -> sfxMaster -> master
      //   Interface + Affect (non-diegetic, dry, never depth-muffled) -> sfxMaster -> master
      sfxMaster = ctx.createGain(); sfxMaster.gain.value = sfxVol; sfxMaster.connect(master);
      sfxFilter = mkLP(DEPTH_LP_MAX_HZ); sfxFilter.connect(sfxMaster);
      sfxEffect    = ctx.createGain(); sfxEffect.connect(sfxFilter);
      sfxZone      = ctx.createGain(); sfxZone.connect(sfxFilter);
      sfxInterface = ctx.createGain(); sfxInterface.connect(sfxMaster);
      sfxAffect    = ctx.createGain(); sfxAffect.connect(sfxMaster);
      sfxBus = sfxEffect;          // legacy alias: pre-IEZA one-shots route to Effect

      // Music path: musicBus -> musicDuck -> depthFilter -> fallFilter -> nightLP -> master
      depthFilter = mkLP(DEPTH_LP_MAX_HZ);
      fallFilter  = mkLP(DEPTH_LP_MAX_HZ);
      nightLP     = mkLP(DEPTH_LP_MAX_HZ);
      musicDuck = ctx.createGain(); musicDuck.gain.value = 1;
      musicBus  = ctx.createGain();
      musicBus.connect(musicDuck); musicDuck.connect(depthFilter);
      depthFilter.connect(fallFilter); fallFilter.connect(nightLP); nightLP.connect(master);

      loadAll();
      // re-establish whatever context was requested before the gesture
      if (music.mode) { var m = music.mode, id = music.townId; music.mode = null; setMusic(m, { townId: id }); }
    } catch (e) { disabled = true; ctx = null; }
    return ctx;
  }
  function mkLP(hz) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hz; f.Q.value = 0.7; return f; }

  function unlock() { ensure(); }
  if (typeof window !== 'undefined') {
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, unlock, { passive: true });
    });
  }

  // ===== asset loading (graceful: never throws, skips missing) ==============
  function loadAll() {
    if (loadStarted || !ctx || typeof fetch === 'undefined') return;
    loadStarted = true;
    Object.keys(MANIFEST).forEach(function (name) {
      fetch(DIR + MANIFEST[name]).then(function (r) {
        return r.ok ? r.arrayBuffer() : null;            // missing -> skip
      }).then(function (ab) {
        if (!ab) return;
        ctx.decodeAudioData(ab, function (buf) { buffers[name] = buf; }, function () {});
      }).catch(function () {});                          // swallow everything
    });
    loadAllSfx();
  }
  function has(name) { return !!buffers[name]; }

  // SFX loader: same graceful contract, but BATCHED (the roster is ~120 files;
  // SFX_LOAD_BATCH jobs in flight at a time, in manifest order, so the common
  // Effect + Interface sounds decode first and the Zone beds trail, §11).
  function sfxFiles(key) {
    var d = SFX_MANIFEST[key], out = [], i;
    if (!d) return out;
    if ((d.n || 1) <= 1) out.push(key + '.m4a');
    else for (i = 1; i <= d.n; i++) out.push(key + '_' + i + '.m4a');
    return out;
  }
  function loadAllSfx() {
    if (sfxLoadStarted || !ctx || typeof fetch === 'undefined') return;
    sfxLoadStarted = true;
    var queue = [], inFlight = 0;
    Object.keys(SFX_MANIFEST).forEach(function (key) {
      sfxFiles(key).forEach(function (f) { queue.push({ key: key, file: f }); });
    });
    function pump() {
      while (inFlight < SFX_LOAD_BATCH && queue.length) {
        (function (job) {
          inFlight++;
          function done() { inFlight--; pump(); }
          fetch(SFX_DIR + job.file).then(function (r) {
            return r.ok ? r.arrayBuffer() : null;        // missing -> skip
          }).then(function (ab) {
            if (!ab) { done(); return; }
            ctx.decodeAudioData(ab, function (buf) {
              (sfxBuffers[job.key] = sfxBuffers[job.key] || []).push(buf);
              done();
            }, done);
          }).catch(done);                                // swallow everything
        })(queue.shift());
      }
    }
    pump();
  }
  function sfxHas(name) { return !!(sfxBuffers[name] && sfxBuffers[name].length); }

  // ===== low-level helpers ==================================================
  function tnow() { return ctx ? ctx.currentTime : 0; }
  function ramp(param, v, t) {
    if (!param) return; var c = tnow();
    try {
      param.cancelScheduledValues(c);
      param.setValueAtTime(param.value, c);
      param.linearRampToValueAtTime(v, c + (t || 0.3));
    } catch (e) {}
  }
  function startLoop(name, gainVal) {
    if (!ctx || !has(name)) return null;
    var s = ctx.createBufferSource(); s.buffer = buffers[name]; s.loop = true;
    var g = ctx.createGain(); g.gain.value = (gainVal == null ? 1 : gainVal);
    s.connect(g); g.connect(musicBus);
    try { s.start(); } catch (e) {}
    return { src: s, gain: g, name: name, t0: tnow(), dur: buffers[name].duration, loop: true };
  }
  function stopVoice(v, fade) {
    if (!v || !ctx) return; fade = fade || 0.6;
    var g = v.gain.gain, c = tnow();
    try {
      g.cancelScheduledValues(c); g.setValueAtTime(g.value, c); g.linearRampToValueAtTime(0, c + fade);
      v.src.stop(c + fade + 0.05);
    } catch (e) {}
  }

  // ===== pool player (towns + travel) =======================================
  function stopPool() {
    if (music.poolTimer) { clearTimeout(music.poolTimer); music.poolTimer = null; }
    if (music.current) { stopVoice(music.current, 0.8); music.current = null; }
    music.pool = null;
  }
  function townLoop() {
    var name = TOWN_THEME[music.townId];
    if (!has(name)) return;                              // silent until loaded
    music.current = startLoop(name, 0);
    if (music.current) ramp(music.current.gain.gain, 1, 1.2);
  }
  // generic cycle pool: play one (no immediate repeat), silence for a gap, next.
  // Used by both the travel pool and the pre-expansion town-theme cycle.
  function poolStart(names, minGap, maxGap) { music.pool = { names: names, min: minGap, max: maxGap }; poolPlayOne(); }
  function poolPlayOne() {
    var cfg = music.pool; if (!cfg || !ctx) return;
    var avail = [], i;
    for (i = 0; i < cfg.names.length; i++) if (has(cfg.names[i])) avail.push(i);
    if (!avail.length) { music.poolTimer = setTimeout(poolPlayOne, 8000); return; } // recheck as files load
    var pick; do { pick = avail[Math.floor(Math.random() * avail.length)]; } while (avail.length > 1 && pick === music.lastPool);
    music.lastPool = pick;
    var s = ctx.createBufferSource(); s.buffer = buffers[cfg.names[pick]]; s.loop = false;
    var g = ctx.createGain(); g.gain.value = 1; s.connect(g); g.connect(musicBus);
    try { s.start(); } catch (e) {}
    music.current = { src: s, gain: g, name: cfg.names[pick], t0: tnow(), dur: (buffers[cfg.names[pick]] ? buffers[cfg.names[pick]].duration : 0), loop: false };
    s.onended = function () {
      if (music.pool !== cfg) return;                    // pool switched; stop this chain
      var gap = (cfg.min + Math.random() * (cfg.max - cfg.min)) * 1000;
      music.poolTimer = setTimeout(poolPlayOne, gap);
    };
  }

  // ===== underground: one track at a time, chosen by depth band =============
  // The bed track is picked by how deep you are (UG_BANDS / UG_BAND_ROWS): it
  // loops until you cross into another band, then crossfades to that band's
  // track. The danger track (UG_DANGER) overrides the band while fuel/hull is
  // low and crossfades back to the depth-correct band when safe. Depth also
  // muffles via setDepthFilter, independent of which band is playing.
  function ugStartVoice(name, loopIt, fadeIn) {
    if (!ctx || !has(name)) return null;
    var s = ctx.createBufferSource(); s.buffer = buffers[name]; s.loop = !!loopIt;
    var g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(musicBus);
    try { s.start(); } catch (e) {}
    var nv = { src: s, gain: g, name: name, t0: tnow(), dur: buffers[name].duration, loop: !!loopIt };
    ramp(nv.gain.gain, 1, fadeIn || UG_CROSSFADE);
    if (music.ug) stopVoice(music.ug, UG_CROSSFADE);      // crossfade the old one out
    music.ug = nv;
    return nv;
  }
  // depth (rows below surface) -> band index 0/1/2, with hysteresis so hovering
  // a boundary does not flap. Multi-band jumps (teleport/rover) resolve in one
  // call. ugBand < 0 means a fresh pick (entry, or after the danger track).
  function ugBandForRows(rows) {
    if (music.ugBand < 0) return rows >= UG_BAND_ROWS[1] ? 2 : (rows >= UG_BAND_ROWS[0] ? 1 : 0);
    var b = music.ugBand;
    while (b < UG_BAND_ROWS.length && rows >= UG_BAND_ROWS[b]) b++;            // descend past full boundaries
    while (b > 0 && rows < UG_BAND_ROWS[b - 1] - UG_BAND_HYST) b--;           // ascend past boundary + slack
    return b;
  }
  // the loaded track for a band, searching outward if that stem is missing so an
  // absent file never silences the bed (engine ethos: skip missing gracefully).
  function ugTrackForBand(b) {
    if (has(UG_BANDS[b])) return UG_BANDS[b];
    for (var d = 1; d < UG_BANDS.length; d++) {
      if (b - d >= 0 && has(UG_BANDS[b - d])) return UG_BANDS[b - d];
      if (b + d < UG_BANDS.length && has(UG_BANDS[b + d])) return UG_BANDS[b + d];
    }
    return null;
  }
  // Play the current depth band's cue ONCE, then a long Minecraft pause, then
  // play again (re-picking the band for wherever you are by then). Danger
  // overrides with a looped L4 (no pauses) until safe. The ambience bed carries
  // the silences; depth still muffles via setDepthFilter on top.
  function ugPlay(fadeIn) {
    if (music.mode !== 'underground' || !ctx) return;
    if (music.ugTimer) { clearTimeout(music.ugTimer); music.ugTimer = null; }
    music.ugGap = false;
    if (music.ugDanger) {                                  // danger: hold L4 looped, no gaps
      if (has(UG_DANGER) && !(music.ug && music.ug.name === UG_DANGER)) ugStartVoice(UG_DANGER, true, fadeIn || 1.0);
      return;
    }
    var b = ugBandForRows(music.depthRows || 0); music.ugBand = b;
    var name = ugTrackForBand(b);
    if (!name) { music.ugTimer = setTimeout(function () { ugPlay(fadeIn); }, 6000); return; } // retry as files load
    var nv = ugStartVoice(name, false, fadeIn || UG_CROSSFADE);   // play the cue ONCE (not looping)
    var dur = (nv && nv.dur) || 150;
    music.ugTimer = setTimeout(function () {               // at the cue's tail: fade, long gap, then replay
      if (music.ug) stopVoice(music.ug, 1.5);
      music.ugGap = true;
      var gap = (UG_GAP_MIN_S + Math.random() * (UG_GAP_MAX_S - UG_GAP_MIN_S)) * 1000;
      music.ugTimer = setTimeout(function () { ugPlay(UG_CROSSFADE); }, gap);
    }, Math.max(2000, (dur - 1.5) * 1000));
  }
  // called by setDepth: follow the depth band only while a cue is actually
  // PLAYING; during a silent gap or danger just remember the band for next time.
  function ugApplyBand(rows, fadeIn) {
    if (music.mode !== 'underground' || !ctx) return;
    music.ugBand = ugBandForRows(rows);
    if (music.ugDanger || music.ugGap) return;             // do not break the silence / danger
    var name = ugTrackForBand(music.ugBand);
    if (!name || (music.ug && music.ug.name === name)) return;
    ugPlay(fadeIn);                                        // band changed mid-cue: switch + restart the cycle
  }
  function startUnderground() { music.ugBand = -1; music.ugGap = false; ugPlay(2.0); }
  function stopUnderground() {
    if (music.ugTimer) { clearTimeout(music.ugTimer); music.ugTimer = null; }
    if (music.ug) { stopVoice(music.ug, 1.2); music.ug = null; }
    music.ugBand = -1; music.ugGap = false;
  }
  function rideDanger(on) {
    music.ugDanger = !!on;
    if (music.mode !== 'underground' || !ctx) return;
    ugPlay(1.0);                                           // on -> L4 looped; off -> resume the band/gap cycle
  }

  // ===== combat layer =======================================================
  function setCombat(on, which) {
    ensure();
    if (on) {
      if (music.combat) return;
      music.combat = startLoop(which === 2 ? 'combat2' : 'combat1', 0);
      if (music.combat) ramp(music.combat.gain.gain, 1, 0.6);
      duck(0.4, 0.1, 0.6);
    } else if (music.combat) {
      stopVoice(music.combat, 0.8); music.combat = null;
    }
  }

  // ===== ducking ============================================================
  function duck(amount, atk, rel) {
    if (!ctx) return; var c = tnow();
    try {
      musicDuck.gain.cancelScheduledValues(c);
      musicDuck.gain.setValueAtTime(musicDuck.gain.value, c);
      musicDuck.gain.linearRampToValueAtTime(amount, c + (atk || 0.06));
      musicDuck.gain.linearRampToValueAtTime(1.0, c + (atk || 0.06) + (rel || 0.5));
    } catch (e) {}
  }
  // generic bus duck (SFX_BIBLE §8): same envelope shape, any GainNode.
  function duckGain(node, amount, atk, rel) {
    if (!ctx || !node) return; var c = tnow();
    try {
      node.gain.cancelScheduledValues(c);
      node.gain.setValueAtTime(node.gain.value, c);
      node.gain.linearRampToValueAtTime(amount, c + (atk || 0.02));
      node.gain.linearRampToValueAtTime(1.0, c + (atk || 0.02) + (rel || 0.15));
    } catch (e) {}
  }

  // ===== one-shots ==========================================================
  function playOne(name, opts) {
    if (!ctx || !has(name)) return null; opts = opts || {};
    var buf = buffers[name];
    var s = ctx.createBufferSource(); s.buffer = buf; s.loop = false;
    var g = ctx.createGain(); g.gain.value = (opts.gain == null ? 1 : opts.gain);
    if (opts.rate) s.playbackRate.value = opts.rate;
    s.connect(g); g.connect(opts.bus || sfxBus);
    try { s.start(); } catch (e) {}
    // Track music-bus one-shots (death sting, event cues) so the now-playing
    // readout can report them. Rapid SFX one-shots (sfxBus) stay untracked.
    if (opts.track) {
      var v = { name: name, src: s, gain: g, dur: (buf && buf.duration) || 0, t0: tnow(), loop: false };
      music.oneShot = v;
      s.onended = function () { if (music.oneShot === v) music.oneShot = null; };
    }
    return s;
  }

  // ===== SFX: IEZA pool player (SFX_BIBLE §3/§5/§8) =========================
  function sfxBusFor(id) {
    if (!ctx) return null;
    var c = String(id || 'e').charAt(0);
    return c === 'z' ? sfxZone : c === 'i' ? sfxInterface : c === 'a' ? sfxAffect : sfxEffect;
  }
  // §8 voice cap: before starting a new one-shot, steal the quietest live voice
  // (oldest breaks near-ties) if the cap is hit. Loop voices are exempt — the
  // drill grind and the ambience bed must never be stolen mid-hold.
  function sfxSteal() {
    if (sfxVoices.length < SFX_VOICE_CAP) return;
    var best = 0, bestScore = Infinity, i, v, g, score;
    for (i = 0; i < sfxVoices.length; i++) {
      v = sfxVoices[i]; g = 1;
      try { g = v.gain.gain.value; } catch (e) {}
      score = g - (tnow() - v.t0) * 0.001;               // quietest first, oldest on ties
      if (score < bestScore) { bestScore = score; best = i; }
    }
    v = sfxVoices.splice(best, 1)[0];
    var c = tnow();
    try {
      v.gain.gain.cancelScheduledValues(c);
      v.gain.gain.setValueAtTime(v.gain.gain.value, c);
      v.gain.gain.linearRampToValueAtTime(0, c + 0.02);
      v.src.stop(c + 0.03);
    } catch (e) {}
  }
  // The pool one-shot player. Round-robin-random variant pick (never the same
  // twice in a row, §5), pitch + volume jitter, IEZA routing, optional pan,
  // and the §8 ducking side-effects (Interface ducks Effect; Affect ducks
  // Effect + music). opts = { bus, gain, rate, jitter, pan }.
  function playSfx(name, opts) {
    if (!ensure()) return null; opts = opts || {};
    var d = SFX_MANIFEST[name];
    if (!d) return playOne(name, opts);                  // legacy: music-manifest one-shots
    var pool = sfxBuffers[name];
    if (!pool || !pool.length) return null;              // not loaded (yet) -> silent skip
    var pick = 0;
    if (pool.length > 1) {
      do { pick = Math.floor(Math.random() * pool.length); } while (pick === sfxLastPick[name]);
    }
    sfxLastPick[name] = pick;
    sfxSteal();
    var s = ctx.createBufferSource(); s.buffer = pool[pick]; s.loop = false;
    var jit = (opts.jitter != null ? opts.jitter : (d.j != null ? d.j : SFX_PITCH_JITTER));
    try { s.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() * 2 - 1) * jit); } catch (e) {}
    var vol = (opts.gain != null ? opts.gain : (d.g != null ? d.g : 1));
    vol *= Math.pow(10, ((Math.random() * 2 - 1) * SFX_VOL_JITTER_DB) / 20);
    var g = ctx.createGain(); g.gain.value = vol;
    var out = g;
    if (opts.pan != null && ctx.createStereoPanner) {    // mono assets, runtime pan (§2.12)
      try {
        var p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        g.connect(p); out = p;
      } catch (e) {}
    }
    s.connect(g); out.connect(sfxBusFor(opts.bus || d.b) || master);
    try { s.start(); } catch (e) {}
    var v = { src: s, gain: g, name: name, t0: tnow() };
    sfxVoices.push(v);
    s.onended = function () { var i = sfxVoices.indexOf(v); if (i >= 0) sfxVoices.splice(i, 1); };
    var bc = String(opts.bus || d.b || 'e').charAt(0);   // §8 IEZA ducking
    if (bc === 'i') {
      duckGain(sfxEffect, DUCK_UI_FX.amt, DUCK_UI_FX.atk, DUCK_UI_FX.rel);
    } else if (bc === 'a') {
      duckGain(sfxEffect, DUCK_AFFECT.amt, DUCK_AFFECT.atk, DUCK_AFFECT.rel);
      duck(DUCK_AFFECT.amt, DUCK_AFFECT.atk, DUCK_AFFECT.rel);
    }
    return v;
  }

  // ===== SFX: looping voices (the engine-RPM model, SFX_BIBLE §2.6) =========
  // A continuous loop whose pitch, lowpass and gain the game drives live —
  // src -> lowpass -> gain -> IEZA bus, every param zipper-free via
  // setTargetAtTime. If the asset has not loaded yet, start() keeps retrying
  // quietly so a file landing mid-session lights up (graceful-skip ethos).
  function createLoopVoice(name, busId) {
    var src = null, filt = null, g = null;
    var want = false, retryT = null;
    var curRate = 1, curHz = DEPTH_LP_MAX_HZ, curGain = 1, startFade = 0.08;
    function tc(s) { return Math.max(0.005, (s || 0.05) / 3); }   // ramp seconds -> time constant
    function build() {
      if (src || !ctx || !sfxHas(name)) return !!src;
      var pool = sfxBuffers[name];
      src = ctx.createBufferSource();
      src.buffer = pool[Math.floor(Math.random() * pool.length)];
      src.loop = true;
      try { src.playbackRate.value = curRate; } catch (e) {}
      filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = curHz; filt.Q.value = 0.7;
      g = ctx.createGain(); g.gain.value = 0;
      src.connect(filt); filt.connect(g); g.connect(sfxBusFor(busId) || master);
      try { src.start(); } catch (e) {}
      try { g.gain.setTargetAtTime(curGain, tnow(), tc(startFade)); } catch (e) {}
      return true;
    }
    function scheduleRetry() {
      if (retryT) return;
      retryT = setTimeout(function () {
        retryT = null;
        if (want && !src && !build()) scheduleRetry();
      }, 2000);
    }
    var h = {
      name: name,
      start: function (fadeS) {
        want = true; startFade = (fadeS == null ? 0.08 : fadeS);
        if (ensure() && !build()) scheduleRetry();
        return h;
      },
      stop: function (fadeMs) {
        want = false;
        if (retryT) { clearTimeout(retryT); retryT = null; }
        if (src) {
          var f = (fadeMs == null ? 120 : fadeMs) / 1000, c = tnow();
          try {
            g.gain.cancelScheduledValues(c);
            g.gain.setValueAtTime(g.gain.value, c);
            g.gain.linearRampToValueAtTime(0, c + f);
            src.stop(c + f + 0.05);
          } catch (e) {}
          src = null; filt = null; g = null;
        }
        return h;
      },
      setPitch:  function (rate, rampS) { curRate = rate; if (src)  try { src.playbackRate.setTargetAtTime(rate, tnow(), tc(rampS)); } catch (e) {} return h; },
      setFilter: function (hz, rampS)   { curHz = hz;     if (filt) try { filt.frequency.setTargetAtTime(hz, tnow(), tc(rampS)); } catch (e) {}    return h; },
      setGain:   function (v, rampS)    { curGain = v;    if (g)    try { g.gain.setTargetAtTime(v, tnow(), tc(rampS)); } catch (e) {}            return h; },
      playing:   function () { return !!src; }
    };
    return h;
  }

  // ===== SFX: keyed per-frame loop drive (SluiceAudio.sfxLoop) ==============
  // The flight-pack contract, generalized for ASSET loops: the game calls
  // sfxLoop('rig-hum', { gain, pitch, filter }) every frame the sound should
  // be audible, and simply STOPS CALLING when it should not. A shared
  // watchdog fades any loop that misses its per-frame calls (pause, shop,
  // tab-hide, death — the whole stuck-loop class at once) and frees the
  // source after a grace, so a game call site can never leak a loop.
  // opts.gain MULTIPLIES the manifest base gain (g); pitch/filter pass through.
  var SFXLOOP_FADE_MS = 250;       // silence after this long without a call
  var SFXLOOP_FREE_MS = 4000;      // then release the source (restartable)
  var sfxLoopReg = {};             // key -> { h, lastMs }
  var sfxLoopWatchT = null;
  function sfxLoopWatchdog() {
    var now = nowMs(), live = false, k, L, idle;
    for (k in sfxLoopReg) {
      L = sfxLoopReg[k]; idle = now - L.lastMs;
      if (idle > SFXLOOP_FREE_MS) { L.h.stop(150); delete sfxLoopReg[k]; continue; }
      if (idle > SFXLOOP_FADE_MS && !L.faded) { L.faded = true; L.h.setGain(0, 0.1); }
      live = true;
    }
    if (!live && sfxLoopWatchT) { clearInterval(sfxLoopWatchT); sfxLoopWatchT = null; }
  }
  function sfxLoopDrive(name, opts) {
    if (!ensure()) return; opts = opts || {};
    var d = SFX_MANIFEST[name];
    if (!d || !d.loop) return;
    var L = sfxLoopReg[name];
    if (!L) {
      L = sfxLoopReg[name] = { h: createLoopVoice(name, d.b), lastMs: 0, faded: false };
      L.h.setGain(0, 0.01);        // enter silent; the drive below sets the real level
      L.h.start(0.1);
      if (!sfxLoopWatchT) sfxLoopWatchT = setInterval(sfxLoopWatchdog, 120);
    } else if (!L.h.playing()) {
      L.h.start(0.1);              // freed by the watchdog (or asset late-loaded): rebuild
    }
    L.lastMs = nowMs(); L.faded = false;
    var base = (d.g != null ? d.g : 1);
    L.h.setGain(base * (opts.gain != null ? opts.gain : 1), opts.ramp || 0.12);
    if (opts.pitch != null) L.h.setPitch(opts.pitch, opts.ramp || 0.12);
    if (opts.filter != null) L.h.setFilter(opts.filter, opts.ramp || 0.2);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {  // instant cut on tab-hide
      if (!document.hidden) return;
      for (var k in sfxLoopReg) { try { sfxLoopReg[k].faded = true; sfxLoopReg[k].h.setGain(0, 0.05); } catch (e) {} }
    });
  }

  // ===== SFX: the drill facade (SFX_BIBLE §6, the flagship) =================
  // Wraps the loop-voice plumbing so the game wires the whole drill system in
  // one-liners. Spin-up on dig start; a material grind loop whose pitch +
  // lowpass follow drill speed (setSpeed) and rise toward the break
  // (setProgress); §6.2 long-grind fatigue (filter 1x -> 0.5x over 3..10 s,
  // -3 dB after 10 s, snapping back on release); material swaps crossfade two
  // loop voices; breakHit/bounce one-shots; debris just after the break.
  var DRILL_MATS = {
    dirt: 'dirt', earth: 'dirt', soil: 'dirt', grass: 'dirt', clay: 'dirt', sand: 'dirt',
    stone: 'stone', rock: 'stone', coal: 'stone', granite: 'stone',
    ice: 'ice', permafrost: 'ice', methaneice: 'ice', snow: 'ice',
    crystal: 'crystal', quartz: 'crystal', gem: 'crystal', emerald: 'crystal', ruby: 'crystal',
    sapphire: 'crystal', amethyst: 'crystal', tanzanite: 'crystal', diamond: 'crystal',
    amber: 'crystal', painite: 'crystal', unobtanium: 'crystal',
    metal: 'metal', ore: 'metal', iron: 'metal', copper: 'metal', silver: 'metal',
    gold: 'metal', platinum: 'metal', titanium: 'metal',
    obsidian: 'obsidian', basalt: 'obsidian', bedrock: 'obsidian', barrier: 'obsidian'
  };
  function drillMat(m) { return DRILL_MATS[String(m || '').toLowerCase()] || 'stone'; }
  var drill = { voice: null, alt: null, mat: null, t0: 0, speed: 0.5, progress: 0 };
  function drillApply(rampS) {
    if (!drill.voice) return;
    var el = tnow() - drill.t0;
    var fat = el < 3 ? 1 : (el < 10 ? 1 - 0.5 * (el - 3) / 7 : 0.5);   // §6.2 fatigue filter sweep
    var gFat = el < 10 ? 1 : 0.71;                                     // §6.2 -3 dB into texture
    drill.voice.setPitch(0.9 + drill.speed * 0.35 + drill.progress * 0.08, rampS || 0.1);
    drill.voice.setFilter((2500 + drill.speed * 3500) * fat, rampS || 0.25);
    drill.voice.setGain(0.9 * gFat, rampS || 0.4);
  }
  var sfxDrill = {
    start: function (material) {
      var m = drillMat(material);
      if (drill.voice && drill.mat === m) return;        // same material: keep grinding (fatigue clock holds)
      if (drill.voice) {                                 // material swap mid-dig: crossfade the grind bodies
        if (drill.alt) drill.alt.stop(60);
        drill.alt = drill.voice; drill.alt.stop(150);
      } else {                                           // fresh dig: spin-up + reset the fatigue clock
        drill.t0 = tnow(); playSfx('drill-spinup');
      }
      drill.mat = m; drill.progress = 0;
      drill.voice = createLoopVoice('drill-grind-' + m, 'e').start(0.12);
      drillApply(0.05);
    },
    setSpeed:    function (s) { drill.speed = Math.max(0, Math.min(1, s || 0)); drillApply(); },
    setProgress: function (p) { drill.progress = Math.max(0, Math.min(1, p || 0)); drillApply(0.08); },
    breakHit: function (material) {
      drill.progress = 0;
      playSfx('drill-break-' + drillMat(material));      // the juice moment — same frame as the mine-break FX
      setTimeout(function () { playSfx('debris'); }, 60); // §6.6 rubble settles just after
    },
    bounce: function () { playSfx('drill-bounce'); },    // cannot penetrate (reqDrill/reqHeat/barrier)
    stop: function () {                                  // release = the ear-rest reward (snap-back is the next start)
      if (drill.alt) { drill.alt.stop(120); drill.alt = null; }
      if (drill.voice) { drill.voice.stop(140); drill.voice = null; }
      drill.mat = null; drill.progress = 0;
    }
  };

  // ===== SFX: the ambience facade (SFX_BIBLE §7, the Zone bed) ==============
  // setZone crossfades the depth/surface bed and runs the sparse one-shot
  // emitter for it (a faint drip/settle/creak every 8 to 15 s, panned).
  var AMB_EMIT = {
    'surface-day': ['amb-bird'],
    'storm':       ['thunder'],
    'shallow': ['amb-oneshot-drip', 'amb-oneshot-settle', 'amb-oneshot-pebble'],
    'mid':     ['amb-oneshot-drip', 'amb-oneshot-settle', 'amb-oneshot-creak', 'amb-oneshot-metal-tick'],
    'deep':    ['amb-oneshot-creak', 'amb-oneshot-rockfall', 'amb-oneshot-groan', 'amb-oneshot-air-hiss'],
    'magma':   ['amb-oneshot-rockfall', 'amb-oneshot-groan', 'amb-oneshot-air-hiss']
  };
  var amb = { zone: null, voice: null, emitT: null };
  function ambScheduleEmit() {
    if (amb.emitT) { clearTimeout(amb.emitT); amb.emitT = null; }
    var pool = AMB_EMIT[amb.zone]; if (!pool) return;
    amb.emitT = setTimeout(function () {
      amb.emitT = null;
      playSfx(pool[Math.floor(Math.random() * pool.length)], {
        gain: AMB_EMIT_GAIN, pan: (Math.random() * 2 - 1) * AMB_EMIT_PAN
      });
      ambScheduleEmit();
    }, (AMB_EMIT_MIN_S + Math.random() * (AMB_EMIT_MAX_S - AMB_EMIT_MIN_S)) * 1000);
  }
  var sfxAmbience = {
    // zone: 'surface-day' | 'surface-night' | 'rain' | 'storm' | 'shallow' |
    //       'mid' | 'deep' | 'magma' | 'station' | null (accepts 'amb-' prefixed too)
    setZone: function (zone) {
      ensure();
      var z = zone ? String(zone).replace(/^amb-/, '') : null;
      if (z === amb.zone) return;
      amb.zone = z;
      if (amb.emitT) { clearTimeout(amb.emitT); amb.emitT = null; }
      if (amb.voice) { amb.voice.stop(AMB_CROSSFADE_S * 1000); amb.voice = null; }
      if (!z || !SFX_MANIFEST['amb-' + z]) return;
      amb.voice = createLoopVoice('amb-' + z, 'z');
      amb.voice.setGain(AMB_BED_GAIN, 0.05);
      amb.voice.start(AMB_CROSSFADE_S);
      ambScheduleEmit();
    },
    zone: function () { return amb.zone; }
  };

  // ===== SFX: the flight pack (synthesized; SluiceAudio.flight) =============
  // The above-ground flight audio. EVERYTHING here is synthesized (oscillators
  // + one shared noise loop + filters + gain envelopes); there are no flight
  // assets, and the rostered 'fall-wind' loop stays dormant for the
  // underground plunge. The flight integrator calls flight(state) every
  // update frame (~60 Hz). The node graph is built ONCE on the first call,
  // hangs off one flight bus under sfxEffect (so the SFX slider, mute and the
  // depth lowpass Just Work), and after that every call only steers gains and
  // frequencies, zipper-free via setTargetAtTime (the engine-RPM model,
  // SFX_BIBLE §2.6). Continuous layers + counter-diffed one-shot events:
  //   wind bed    a low rumble (LP ~220 Hz) + an airy hiss (BP 1.2k..3k Hz),
  //               both riding speed01 = speed/cap; the hiss only matures past
  //               the cap (~1.3x) so dives audibly tear. Air only, ~120 ms
  //               fades. This is a bed (§8): quiet, under everything.
  //   engine      a low saw growl + band-passed thrust noise riding spool; a
  //               near-unison detuned LOAD saw beats against it when climbing
  //               under power, with a small pitch strain, so working sounds
  //               like work; shutting the throttle at speed opens a thin
  //               freewheel whistle instead (the spool terms are ~0 there).
  //   stall horn  a reedy band-passed square (~1.6 kHz), swells with the
  //               buffet telegraph, full-on in the stall. Classic aviation
  //               stall-warning UX, eased so it never clicks.
  //   vario       a very quiet rising warble beeper on an engine-off zoom
  //               climb (pitch 600..1100 Hz over climb 150..500 px/s);
  //               FLIGHT_VARIO_GAIN zeroes the whole layer in one edit.
  //   events      ignition bark (bigger from a cold spool), a tiny spool-down
  //               pop, the sonic boom (double saturated bass thump, broadband
  //               crack, ONE quieter mountain-echo slapback ~0.5 s later, and
  //               a short music duck like the other big events), a soft
  //               vapor-cone shoosh, and touchdown thunks graded greaser /
  //               medium / hard from fx.landVy + fx.landTilt.
  // WATCHDOG: update() stops while the shop is open or the tab is hidden, so
  // the per-frame calls just STOP; an interval ramps every flight gain to 0
  // after >250 ms without a call (plus an instant visibilitychange cut). No
  // stuck wind loops, ever. Mix discipline per §8: the bed stays modest,
  // events are readable, the whole pack sits well under the drill.
  var FLIGHT_VARIO_GAIN  = 0.12;  // vario beeper gain cap; zero it to kill the layer
  var FLIGHT_WIND_RUMBLE = 0.28;  // wind bed: low-rumble peak gain
  var FLIGHT_WIND_HISS   = 0.22;  // wind bed: airy-hiss peak gain
  var FLIGHT_ENGINE_GAIN = 0.3;   // thrust voice peak (the saw + noise scale under this)
  var FLIGHT_WATCHDOG_MS = 250;   // silence the pack after this long without a flight() call
  var fl = null;                  // the lazily built node bundle (null until the first call)
  var flightDead = false;         // construction threw once: stay silent, never retry

  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  // zipper-free param drive, the createLoopVoice tc pattern (ramp seconds -> time constant)
  function fset(param, v, rampS) {
    if (!param) return;
    try { param.setTargetAtTime(v, tnow(), Math.max(0.005, (rampS || 0.06) / 3)); } catch (e) {}
  }
  // one shared 2 s white-noise loop; every noise layer and burst slices it
  function flightNoiseBuffer() {
    var n = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0), i;
    for (i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // one-time node construction (first flight() call). Sources start once and
  // run forever at gain 0; the per-frame drive only moves gains/frequencies.
  function flightBuild(st) {
    if (fl || flightDead || !ctx) return fl;
    function flt(type, hz, q) { var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; return f; }
    function gn(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    try {
      var fx = (st && st.fx) || {};
      var bus = gn(1); bus.connect(sfxEffect);
      var noiseBuf = flightNoiseBuffer();
      var noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true;
      // wind bed: the one noise loop fans out into an LP rumble + a BP hiss
      var rumLP = flt('lowpass', 220, 0.7), rumG = gn(0);
      noise.connect(rumLP); rumLP.connect(rumG); rumG.connect(bus);
      var hisBP = flt('bandpass', 1200, 0.8), hisG = gn(0);
      noise.connect(hisBP); hisBP.connect(hisG); hisG.connect(bus);
      // engine: band-passed thrust noise + two saws (main + detuned LOAD)
      // sharing one lowpass body, + the high freewheel whistle off the noise
      var engBP = flt('bandpass', 380, 1.2), engNG = gn(0);
      noise.connect(engBP); engBP.connect(engNG); engNG.connect(bus);
      var engLP = flt('lowpass', 260, 0.7); engLP.connect(bus);
      var engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 55;
      var engOG = gn(0); engOsc.connect(engOG); engOG.connect(engLP);
      var loadOsc = ctx.createOscillator(); loadOsc.type = 'sawtooth'; loadOsc.frequency.value = 59;
      var loadG = gn(0); loadOsc.connect(loadG); loadG.connect(engLP);
      var whisBP = flt('bandpass', 2600, 14), whisG = gn(0);
      noise.connect(whisBP); whisBP.connect(whisG); whisG.connect(bus);
      // stall horn: a square picked reedy by a narrow bandpass (~1.6 kHz, the
      // square's third harmonic, inside the spec'd 1.5..1.8 kHz alarm zone)
      var hornOsc = ctx.createOscillator(); hornOsc.type = 'square'; hornOsc.frequency.value = 530;
      var hornBP = flt('bandpass', 1590, 4), hornG = gn(0);
      hornOsc.connect(hornBP); hornBP.connect(hornG); hornG.connect(bus);
      // vario: a triangle carrier amplitude-warbled by a sine LFO (the gate
      // gain sits at 0.5 and the LFO adds +-0.5 -> smooth 0..1 pulses, no
      // clicky square edges, per the no-zipper doctrine)
      var varioOsc = ctx.createOscillator(); varioOsc.type = 'triangle'; varioOsc.frequency.value = 800;
      var varioGate = gn(0.5), varioG = gn(0);
      varioOsc.connect(varioGate); varioGate.connect(varioG); varioG.connect(bus);
      var varioLFO = ctx.createOscillator(); varioLFO.type = 'sine'; varioLFO.frequency.value = 5;
      var varioLFOG = gn(0.5); varioLFO.connect(varioLFOG); varioLFOG.connect(varioGate.gain);
      // boom weight: the bass thumps route through a soft tanh saturator
      var satBus = gn(1);
      try {
        var shaper = ctx.createWaveShaper(), curve = new Float32Array(257), i, x;
        for (i = 0; i < 257; i++) { x = i / 128 - 1; curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5); }
        shaper.curve = curve;
        satBus.connect(shaper); shaper.connect(bus);
      } catch (e2) { satBus.connect(bus); }
      try { noise.start(); engOsc.start(); loadOsc.start(); hornOsc.start(); varioOsc.start(); varioLFO.start(); } catch (e3) {}
      fl = {
        bus: bus, noiseBuf: noiseBuf,
        rumG: rumG, hisBP: hisBP, hisG: hisG,
        engBP: engBP, engNG: engNG, engOsc: engOsc, engOG: engOG,
        loadOsc: loadOsc, loadG: loadG, whisBP: whisBP, whisG: whisG,
        hornG: hornG, varioOsc: varioOsc, varioLFO: varioLFO, varioG: varioG,
        satBus: satBus,
        muted: false, lastMs: nowMs(), prevSpool: clamp01((st && st.spool) || 0),
        // seed the last-seen counters from the FIRST state so a mid-flight
        // audio unlock does not replay a backlog of booms/landings
        seen: { ig: fx.igniteN | 0, boom: fx.boomN | 0, vap: fx.vaporN | 0, land: fx.landN | 0 },
        watchT: setInterval(flightWatchdog, 120)
      };
    } catch (e) { fl = null; flightDead = true; }
    return fl;
  }

  // a short decaying sine thump, the body of every flight impact; a slight
  // downward pitch sag sells the weight (SFX_BIBLE §4: pitch encodes size)
  function flightThump(at, hz, dur, peak, dest) {
    if (!fl) return;
    try {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(hz, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, hz * 0.72), at + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(dest || fl.bus);
      o.start(at); o.stop(at + dur + 0.05);
    } catch (e) {}
  }
  // a short noise burst (a random slice of the shared loop) through an
  // optional filter; atk defaults to a 4 ms snap (§2.3: the transient
  // carries the punch)
  function flightBurst(at, dur, peak, type, hz, q, atk) {
    if (!fl) return;
    try {
      var s = ctx.createBufferSource(); s.buffer = fl.noiseBuf;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + (atk || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      if (type) {
        var f = ctx.createBiquadFilter(); f.type = type;
        f.frequency.value = hz || 1000; f.Q.value = (q == null ? 0.7 : q);
        s.connect(f); f.connect(g);
      } else { s.connect(g); }
      g.connect(fl.bus);
      s.start(at, Math.random() * Math.max(0.1, fl.noiseBuf.duration - dur - 0.1));
      s.stop(at + dur + 0.05);
    } catch (e) {}
  }

  // ignition bark: a 30 ms noise bark + a 70 Hz thump, bigger from cold
  function flightIgnite(cold) {
    var t = tnow();
    flightBurst(t, 0.03, 0.3 + 0.22 * cold, 'bandpass', 950, 1.1);
    flightThump(t, 70, 0.09, 0.42 + 0.2 * cold);
  }
  // the sonic boom: a double bass thump (the N-wave, soft-saturated) + a
  // broadband crack, then ONE quieter, darker slapback ~0.5 s later as the
  // mountain echo. The music makes room briefly, like the other big events.
  function flightBoom() {
    var t = tnow();
    flightThump(t, 76, 0.16, 0.85, fl.satBus);
    flightThump(t + 0.07, 58, 0.2, 0.8, fl.satBus);
    flightBurst(t, 0.06, 0.5, 'highpass', 260, 0.7);
    flightThump(t + 0.5, 76, 0.16, 0.26, fl.satBus);
    flightThump(t + 0.57, 58, 0.2, 0.24, fl.satBus);
    flightBurst(t + 0.5, 0.06, 0.15, 'lowpass', 2200, 0.7);
    duck(DUCK_STD.amt, 0.03, 0.3);
  }
  // vapor cone: a soft transonic shoosh as the cone flashes, pre-boom
  function flightVapor() {
    flightBurst(tnow(), 0.22, 0.12, 'bandpass', 2400, 1.4, 0.03);
  }
  // touchdown, graded by the landing: a greaser earns a soft descending
  // triple-thunk; a slam gets one weighty 60 Hz thud + a noise transient;
  // anything between gets a single medium thunk.
  function flightLand(vy, tilt) {
    var t = tnow();
    if (vy < 240 && tilt < 0.25) {
      flightThump(t, 120, 0.07, 0.2);
      flightThump(t + 0.09, 96, 0.08, 0.16);
      flightThump(t + 0.18, 78, 0.1, 0.13);
    } else if (vy > 420 || tilt > 0.5) {
      flightThump(t, 60, 0.2, 0.78);
      flightBurst(t, 0.045, 0.38, 'lowpass', 3200, 0.7);
    } else {
      flightThump(t, 90, 0.13, 0.4);
      flightBurst(t, 0.03, 0.16, 'lowpass', 2600, 0.7);
    }
  }

  // the watchdog kill: every continuous layer to 0 AND the bus itself, so a
  // later resume cannot blare a stale mix before the next drive lands
  function flightSilence(s) {
    if (!fl) return;
    fset(fl.rumG.gain, 0, s); fset(fl.hisG.gain, 0, s);
    fset(fl.engNG.gain, 0, s); fset(fl.engOG.gain, 0, s); fset(fl.loadG.gain, 0, s);
    fset(fl.whisG.gain, 0, s); fset(fl.hornG.gain, 0, s); fset(fl.varioG.gain, 0, s);
    fset(fl.bus.gain, 0, s);
  }
  // WATCHDOG: flight() rides update(), which stops when the shop opens or the
  // tab hides; if no call lands for FLIGHT_WATCHDOG_MS the pack fades out in
  // ~100 ms. The next flight() call fades the bus back in and re-drives.
  function flightWatchdog() {
    if (!fl || fl.muted) return;
    if (nowMs() - fl.lastMs <= FLIGHT_WATCHDOG_MS) return;
    flightSilence(0.1); fl.muted = true;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {  // instant cut on tab-hide
      if (fl && !fl.muted && document.hidden) { flightSilence(0.08); fl.muted = true; }
    });
  }

  // The per-frame drive. Called ~60 Hz by the flight integrator with
  //   state = { air, rot, speed, cap, boomV, spool, climb, buffet, stall,
  //             over, ge, fx: { igniteN, boomN, vaporN, landN, landVy,
  //             landTilt }, dt }
  // Builds the pack on the first call with a live context, then only steers
  // it. Never constructs the AudioContext itself (the unlock listeners do
  // that on the first gesture, like the other per-frame drives).
  function flightUpdate(st) {
    if (!st || !ctx || disabled) return;
    if (!fl && !flightBuild(st)) return;
    var resumed = fl.muted;
    fl.lastMs = nowMs();
    if (resumed) { fl.muted = false; fset(fl.bus.gain, 1, 0.08); }

    var air = !!st.air;
    var s01 = Math.max(0, (st.speed || 0) / (st.cap || 400));
    var spool = clamp01(st.spool || 0);
    var climb = st.climb || 0;

    // wind bed: rumble rises speed01 0.25 -> 1.0; the hiss brightens with
    // speed and only matures at ~1.3 x cap so dives audibly tear. Air only.
    var rum = air ? FLIGHT_WIND_RUMBLE * Math.pow(clamp01((s01 - 0.25) / 0.75), 1.4) : 0;
    var hisT = air ? clamp01((s01 - 0.15) / 1.15) : 0;
    fset(fl.rumG.gain, rum, 0.12);
    fset(fl.hisG.gain, FLIGHT_WIND_HISS * hisT * hisT, 0.12);
    fset(fl.hisBP.frequency, 1200 + 1800 * hisT, 0.12);

    // engine under load: the growl + thrust noise ride spool; LOAD (spool *
    // climb) detunes the second saw into a beat and strains the pitch up
    var load = spool * clamp01(climb / 300);
    var engF = 55 + spool * 20 + load * 8;
    fset(fl.engOsc.frequency, engF, 0.08);
    fset(fl.loadOsc.frequency, engF + 4 + load * 5, 0.08);
    fset(fl.engOG.gain, FLIGHT_ENGINE_GAIN * 0.62 * spool, 0.09);
    fset(fl.engNG.gain, FLIGHT_ENGINE_GAIN * 0.55 * spool, 0.09);
    fset(fl.engBP.frequency, 380 + spool * 420 + load * 160, 0.12);
    fset(fl.loadG.gain, 0.22 * load, 0.12);
    // freewheel: throttle shut + fast = a thin high whistle instead
    var freeT = air ? clamp01((0.1 - spool) / 0.1) * clamp01((s01 - 0.8) / 0.4) : 0;
    fset(fl.whisG.gain, 0.12 * freeT, 0.15);
    fset(fl.whisBP.frequency, 2400 + s01 * 700, 0.2);

    // stall horn: swells with the buffet telegraph, full-on in the stall
    var horn = air ? (0.35 * clamp01(st.buffet || 0) + (st.stall ? 0.35 : 0)) : 0;
    fset(fl.hornG.gain, horn, 0.1);

    // vario: an engine-off zoom climb gets the quiet rising warble beeper
    var vT = clamp01((climb - 150) / 350);
    var vOn = air && spool < 0.15 && climb > 150;
    fset(fl.varioG.gain, vOn ? FLIGHT_VARIO_GAIN * (0.5 + 0.5 * vT) : 0, 0.15);
    if (vOn) {
      fset(fl.varioOsc.frequency, 600 + 500 * vT, 0.1);
      fset(fl.varioLFO.frequency, 4 + 3.5 * vT, 0.15);
    }

    // events: the fx counters only ever increment; diff with last-seen
    var fx = st.fx || {};
    if ((fx.igniteN | 0) > fl.seen.ig) {
      fl.seen.ig = fx.igniteN | 0;
      flightIgnite(1 - clamp01(fl.prevSpool / 0.3));     // cold spool = bigger bark
    }
    if ((fx.boomN | 0) > fl.seen.boom) { fl.seen.boom = fx.boomN | 0; flightBoom(); }
    if ((fx.vaporN | 0) > fl.seen.vap) { fl.seen.vap = fx.vaporN | 0; flightVapor(); }
    if ((fx.landN | 0) > fl.seen.land) { fl.seen.land = fx.landN | 0; flightLand(fx.landVy || 0, fx.landTilt || 0); }
    // tiny spool-down pop when the throttle falls through idle (skipped on a
    // watchdog resume, where prevSpool is stale from before the gap)
    if (!resumed && fl.prevSpool >= 0.08 && spool < 0.08) {
      flightBurst(tnow(), 0.015, 0.1, 'bandpass', 700, 1.2);
      flightThump(tnow(), 90, 0.05, 0.14);
    }
    fl.prevSpool = spool;
  }

  // ===== filters ============================================================
  function setDepthFilter(rows) {
    var hz = Math.max(DEPTH_LP_MIN_HZ, DEPTH_LP_MAX_HZ - rows * 100);
    ramp(depthFilter && depthFilter.frequency, hz, 0.25);
    ramp(sfxFilter && sfxFilter.frequency, hz, 0.25);
  }
  function setFall(on) { ramp(fallFilter && fallFilter.frequency, on ? FALL_LP_HZ : DEPTH_LP_MAX_HZ, on ? 0.15 : 0.25); }
  function setTimeOfDay(t01) {
    music.timeOfDay = Math.max(0, Math.min(1, t01));
    ramp(nightLP && nightLP.frequency, 8000 + music.timeOfDay * 12000, 2);      // night = darker
    if (musicBus && (music.mode === 'town' || music.mode === 'travel')) {
      ramp(musicBus.gain, 0.7 + music.timeOfDay * 0.3, 2);                       // night thins it
    }
  }

  // ===== music context switch ===============================================
  function setMusic(mode, opts) {
    ensure(); opts = opts || {};
    if (mode === music.mode && (mode !== 'town' || opts.townId === music.townId)) return;
    stopPool(); stopUnderground();
    if (musicBus) ramp(musicBus.gain, 1, 0.3);            // reset any night-thinning for non-above-ground
    music.mode = mode;
    if (mode === 'town') { music.townId = (opts.townId == null ? 0 : opts.townId); townLoop(); setTimeOfDay(music.timeOfDay); }
    else if (mode === 'towns') { poolStart(TOWN_POOL, TOWN_GAP_MIN_S, TOWN_GAP_MAX_S); setTimeOfDay(music.timeOfDay); }
    else if (mode === 'travel') { poolStart(TRAVEL_POOL, POOL_GAP_MIN_S, POOL_GAP_MAX_S); setTimeOfDay(music.timeOfDay); }
    else if (mode === 'underground') { startUnderground(); }
  }

  // ===== now-playing reporter (for the in-game readout) =====================
  // Returns every currently-audible music voice with its position + length, so
  // the game can show what is playing (and ALL of them when layered, e.g. the
  // underground stems or combat over a bed). Inaudible layers (gain ~0) and
  // finished one-shots (a travel/town cue mid-gap) are omitted.
  function reportVoice(v, out) {
    if (!v || !v.src) return;
    var dur = v.dur || 0, elapsed = tnow() - (v.t0 || 0);
    if (!v.loop && dur && elapsed >= dur) return;        // finished one-shot (silent gap)
    var g = 1; try { g = v.gain.gain.value; } catch (e) {}
    if (g <= 0.012) return;                              // inaudible (faded-out) layer
    var pos = dur ? (v.loop ? (elapsed % dur) : Math.min(elapsed, dur)) : elapsed;
    out.push({ name: v.name || '?', t: pos, dur: dur, loop: !!v.loop, gain: g });
  }
  function nowPlaying() {
    if (!ctx) return [];
    var out = [];
    reportVoice(music.current, out);
    reportVoice(music.ug, out);
    reportVoice(music.combat, out);
    reportVoice(music.oneShot, out);
    return out;
  }

  // ===== public API =========================================================
  return {
    unlock: unlock,
    isReady: function () { return !!ctx && !disabled; },
    isDisabled: function () { return disabled; },
    loadedCount: function () { return Object.keys(buffers).length; },

    setEnabled: function (on) { enabled = !!on; if (master) ramp(master.gain, enabled ? masterVol : 0, 0.3); },
    setVolume: function (v) { masterVol = Math.max(0, Math.min(1, v)); if (master && enabled) ramp(master.gain, masterVol, 0.2); },
    // the SFX slider (SFX_BIBLE §13): gates the four IEZA buses as one, under the master
    setSfxVolume: function (v) { sfxVol = Math.max(0, Math.min(1, v)); if (sfxMaster) ramp(sfxMaster.gain, sfxVol, 0.2); },

    // music context: 'town' (opts.townId), 'travel', 'underground', or null
    setMusic: setMusic,
    // depth in tile-rows below the surface: drives the lowpass + underground layer mix
    setDepth: function (rows) { rows = rows || 0; music.depthRows = rows; setDepthFilter(rows); if (music.mode === 'underground') ugApplyBand(rows); },
    setDanger: rideDanger,                                // low fuel/hull -> true
    combat: setCombat,                                    // (on, which=1|2)
    setTimeOfDay: setTimeOfDay,                           // 0 night .. 1 day (above ground)
    fall: setFall,                                        // true while plunging
    duck: duck,
    death: function () {
      stopPool(); stopUnderground();
      if (music.combat) { stopVoice(music.combat, 0.4); music.combat = null; }
      music.mode = null;
      duck(DUCK_HARD.amt, DUCK_HARD.atk, DUCK_HARD.rel);
      playOne('death', { bus: musicBus, track: true });
    },
    // Leaving the death scene (respawn / restart): cut the death lament. It is a
    // tracked one-shot on the MUSIC bus, so setMusic() only layers the resumed
    // world track ON TOP of it — without this it keeps playing to the end of the
    // ~full clip. Safe no-op if the sting already ended (music.oneShot is null).
    revive: function () {
      if (music.oneShot) { stopVoice(music.oneShot, 0.3); music.oneShot = null; }
    },
    event: function (name, opts) {
      var map = { bigStrike: 'event-bigstrike', arrival: 'event-arrival', ui: 'event-ui' };
      var s = playOne(map[name] || name, opts);
      if (name !== 'ui') duck(DUCK_STD.amt, DUCK_STD.atk, DUCK_STD.rel);
      return s;
    },
    // ----- SFX (SFX_BIBLE §3/§5/§6/§8; see the banner up top for one-liners) --
    playSfx: playSfx,                                     // pool one-shot: (name, {bus,gain,rate,jitter,pan})
    createLoopVoice: createLoopVoice,                     // (name, busId) -> {start,stop,setPitch,setFilter,setGain,playing}
    sfxLoop: sfxLoopDrive,                                // per-frame keyed loop drive: (name, {gain,pitch,filter}); stop calling = silence
    flight: flightUpdate,                                 // per-frame synthesized flight pack (see the flight banner)
    sfx: {
      drill: sfxDrill,                                    // {start(material), setSpeed, setProgress, breakHit(material), bounce, stop}
      ambience: sfxAmbience                               // {setZone(zoneName), zone()}
    },
    sfxLoadedCount: function () { var n = 0, k; for (k in sfxBuffers) n += sfxBuffers[k].length; return n; },
    nowPlaying: nowPlaying,                               // -> [{name,t,dur,loop,gain}] audible music
    musicMode: function () { return music.mode; },        // 'town'|'towns'|'travel'|'underground'|null
    DUCK_STD: DUCK_STD, DUCK_HARD: DUCK_HARD
  };
})();
