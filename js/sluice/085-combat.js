  // ====== COMBAT ======
  // First combat slice (EXPANSION_PLAN P3 + a slice of P4): enemy ground
  // turrets that sit in the No Man's Zones, plus a DEFAULT auto-turret mounted
  // on the miner rig that auto-targets + fires at them as you fly past. Bullets
  // carry ownership: the rig's bullets hurt enemy turrets, the enemies' bullets
  // hurt player.hull. Reuses the existing primitives the plan calls for —
  // explosions[] (turret-death blast), damageFlashT + hitPauseT (player hit),
  // endGame() (death), spawnFloater() (kill popup).
  //
  // Combat is confined to the zones by construction: enemy turrets only exist
  // in REGION_NOMANS columns, and the rig turret only fires when an enemy is in
  // range, so it stays silent while mining a town. Static turrets are cheap
  // (a handful of distance checks/frame); the rig only engages on-screen ones
  // (ENEMY_RANGE ~ in-view), so there is no off-screen sniping.

  // ----- Tunables -----
  var ENEMY_TURRET_HP = 3;          // player-bullet hits to destroy one
  // (per-zone turret COUNTS live in NMZ_SCALE.turrets below; the old fixed
  // ENEMY_TURRET_SPACING is gone; placement is now count-based + even-spread)
  var ENEMY_TURRET_JITTER = 3;      // +/- tiles of placement jitter
  var ENEMY_TURRET_APRON = 5;       // tiles left clear at each zone edge (safe approach)
  var ENEMY_RANGE = 380;            // px — engage the rig within this (~ on screen)
  var ENEMY_FIRE_CD = 1.5;          // seconds between enemy shots (randomized +/-20%)
  var ENEMY_CHARGE = 0.26;          // telegraph: muzzle glow charges this long before a shot
  var ENEMY_BULLET_SPEED = 300;     // px/s — slow + dodgeable
  var ENEMY_BULLET_DMG = 5;         // hull damage per enemy hit (gentle first pass)
  var ENEMY_TURN_RATE = 2.4;        // rad/s the barrel can swing
  var ENEMY_AIM_TOL = 0.45;         // rad — must be aimed this close to fire
  var ENEMY_LEAD_FRAC = 0.75;       // turrets lead the moving rig 75% — threatening but still juke-able

  var PLAYER_RANGE = 430;           // px — rig turret target acquisition range
  var PLAYER_FIRE_CD = 0.32;        // seconds between rig shots
  var PLAYER_BULLET_SPEED = 560;    // px/s
  var PLAYER_BULLET_DMG = 1;        // 3 hits kills a turret (ENEMY_TURRET_HP)
  var PLAYER_TURN_RATE = 8.0;       // rad/s — snappy auto-aim
  var PLAYER_AIM_TOL = 0.40;        // rad — fire when aim is within this
  var RIG_LEAD_FRAC = 1.0;          // rig leads a moving target fully (auto-defense should connect)

  var BULLET_LIFE = 1.7;            // seconds before a bullet expires
  var BULLETS_MAX = 220;            // hard cap on live bullets
  var TURRET_HIT_R = 15;            // px — friendly-bullet hit radius vs a turret pivot
  var TURRET_BARREL_LEN = 15;       // px — enemy barrel length (muzzle offset)
  var RIG_BARREL_LEN = 6;           // px — rig turret barrel length (tiny; it pops out only while firing)

  // Flying chaser drones — the moving threat. Pure Reynolds steering (seek +
  // separation), semi-implicit Euler, capped force AND speed, so they bank and
  // overshoot with weight instead of teleporting. MAX_SPEED sits well under the
  // rig's flight top speed (~315 px/s sustained), so a moving rig outruns them:
  // the danger is when you SLOW to let the auto-turret work the ground turrets,
  // which is the intended tension. They leash to their spawn anchor so combat
  // stays inside the zone (they never chase into a town).
  var CHASER_HP = 2;                // rig-bullet hits to kill (fragile vs the turret's 3)
  // (per-zone chaser COUNTS live in NMZ_SCALE.chasers below)
  var CHASER_MAX_SPEED = 145;       // px/s cruise cap (< rig top flight, so outrunnable)
  var CHASER_MAX_FORCE = 340;       // px/s² steering accel cap (sets the turn radius)
  var CHASER_AGGRO = 460;           // px — pursue the rig within this
  var CHASER_LEASH = 520;           // px from anchor — beyond this, break off + return
  var CHASER_ARRIVE_R = 70;         // px — arrival slowdown radius when returning to anchor
  var CHASER_SEP_R = 42;            // px — separation neighbourhood (don't stack)
  var CHASER_SEP_FORCE = 220;       // separation push strength
  var CHASER_CONTACT_R = 18;        // px center-to-center — ram contact with the rig
  var CHASER_CONTACT_DMG = 6;       // hull per ram
  var CHASER_CONTACT_CD = 0.6;      // s between rams from one drone
  var CHASER_KNOCKBACK = 230;       // px/s impulse imparted to the rig on a ram
  var CHASER_HIT_R = 13;            // px — friendly-bullet hit radius vs a drone
  var CHASER_BOB = 9;               // px idle bob amplitude at the anchor
  // Dash attack: pure seek orbits a stationary target (radius ~ v²/force) and
  // never connects, so a drone that's only seek would never ram a hovering rig.
  // Instead it approaches at cruise, then WINDS UP (a readable telegraph) and
  // LUNGES in a locked straight line — committed, so a juking rig dodges it.
  var CHASER_LUNGE_RANGE = 122;     // px — start a windup when this close
  var CHASER_WINDUP = 0.28;         // s — telegraph (drone brakes + eye flares) before the dash
  var CHASER_LUNGE_SPEED = 405;     // px/s — dash burst speed (well above cruise)
  var CHASER_LUNGE_DUR = 0.32;      // s — dash duration (can't steer during it)
  var CHASER_LUNGE_CD = 1.1;        // s — recover/cooldown before it can wind up again

  // Homing missiles — a slice of turrets are elite launchers that fire one
  // instead of shells. Capped-turn-rate pursuit (NOT instant homing): the
  // missile flies at a fixed speed and may only TURN at MISSILE_TURN rad/s, so
  // its turn radius is speed/turn (~68px). A rig that jukes inside that radius
  // forces an overshoot — the dodge IS the turn cap. Everything carries a
  // maxLife so a slipped missile fizzles instead of orbiting forever.
  var MISSILE_TURRET_FRAC = 0.2;    // share of zone turrets that launch missiles
  var MISSILE_SPEED = 178;          // px/s constant flight speed
  var MISSILE_TURN = 2.6;           // rad/s turn-rate cap (the dodge knob)
  var MISSILE_LIFE = 3.6;           // s before it fizzles
  var MISSILE_ARM = 0.15;           // s of straight flight after launch before homing engages
  var MISSILE_DMG = 12;             // hull per hit (hurts more than a shell)
  var MISSILE_R = 12;               // px contact radius vs the rig
  var MISSILE_CD = 3.2;             // s between launches from one missile turret
  var MISSILE_CHARGE = 0.5;         // s telegraph before launch (longer than a shell)
  var MISSILES_MAX = 40;            // hard cap on live missiles

  // Stingers — a feral flying swarm, the THIRD faction. Wild predators native
  // to the No Man's Zones, hostile to EVERYONE: they swarm the rig AND tear into
  // the turrets + drones. Movement is true Boids (separation + alignment +
  // cohesion) plus a seek toward whatever is nearest — a different flocking feel
  // from the chaser's lone pure-seek dash. They dive-strike the nearest of
  // {rig, turret, drone}; striking an emplacement can destroy it (NO rig kill
  // credit — the wildlife did it), so a flock visibly thins a turret cluster.
  // The rig auto-turret + friendly bullets pop them (HP 2). Venom-green so the
  // faction reads at a glance against the red machines / cyan rig.
  // (per-zone stinger flock SIZES live in NMZ_SCALE.stingers below)
  var STINGER_HP = 2;
  var STINGER_MAX_SPEED = 168;      // px/s cruise cap (agile; a touch above a drone)
  var STINGER_MAX_FORCE = 430;      // px/s² steering accel cap
  var STINGER_SENSE = 430;          // px target-acquisition radius
  var STINGER_NEIGHBOR = 92;        // px Boids perception radius (flockmates within this)
  var STINGER_SEP_W = 2.4;          // Boids separation weight (strong: they spread AROUND a target, not pile on it)
  var STINGER_ALIGN_W = 0.55;       // Boids alignment weight
  var STINGER_COH_W = 0.28;         // Boids cohesion weight (low: an attacking swarm, not a tight ball)
  var STINGER_SEEK_W = 1.05;        // seek-target weight
  var STINGER_STRIKE_R = 16;        // px dive-strike contact radius
  var STINGER_DMG_PLAYER = 4;       // hull per strike on the rig (light, but they swarm)
  var STINGER_DMG_ENEMY = 1;        // hp per strike on a turret/drone
  var STINGER_STRIKE_CD = 0.55;     // s between strikes from one stinger
  var STINGER_KNOCKBACK = 95;       // px/s impulse to the rig on a strike
  var STINGER_RETARGET = 0.35;      // s between target re-evaluations (cheap + no jitter)
  var STINGER_LEASH = 640;          // px from roost anchor before it peels back home
  var STINGER_HIT_R = 13;           // px friendly-bullet hit radius vs a stinger

  // Fly-through obstacles — solid wreckage/spires the rig must weave around in
  // the No Man's Zones. They mostly just BLOCK (slide-along AABB collision), so
  // threading them slows you into the enemies' fire; the ENEMIES do the killing.
  // Placed in clusters with open STRAIGHTAWAYS between, and NEVER over a pond
  // (lakes stay clear fast lanes). Static + indestructible for now.
  var OBSTACLE_APRON = 8;            // tiles left clear at each zone edge
  var OBSTACLE_GAP_MIN = 26;         // min tiles of open straightaway between clusters
  var OBSTACLE_GAP_MAX = 54;         // max — wide, so there's real open air to build speed
  var OBSTACLE_POND_MARGIN = 3;      // tiles of clearance kept around a pond (open lake lane)
  var OBSTACLE_HARD_HIT = 300;       // px/s into-face speed that reads as a "slam" (sparks + shake)
  var OBSTACLE_IMPACT_DMG = 0;       // hull per slam (0 = pure blocker; tune up if you want a sting)

  // ----- FLAK: the anti-air ceiling -----
  // Quad-barrel surface batteries that make HIGH flight over a No Man's Zone a
  // priced choice instead of a free escape. They only engage targets ABOVE the
  // flak deck (deckY = surface - FLAK_DECK_PX) and inside their own zone's
  // columns, so low weaving through the turret/chaser/stinger gauntlet stays
  // the flak-free lane. Each shot is a lead-predicted AIRBURST: the shell flies
  // a straight tracer to a pre-computed burst point while a caution-gold
  // telegraph ring ticks down at that point for the whole flight, so the dodge
  // is always readable. Bursts also chip any chaser/stinger caught in them
  // (friendly-fire chaos is intended). Batteries are destructible like ground
  // turrets (rig bullets; bombs do not currently hurt ANY combat emplacement).
  // Zone numbering counts from the start town: NMZ1 (nearest Town 1, the
  // rightmost zone) is sparsest, NMZ3 (deepest, leftmost) is densest + meanest.
  //
  // Live-tunable levers sit on flakTune (registered as the 'flak' gm group at
  // combatInit time, AFTER 360-gm-facade has built GM_LEVERS):
  //   FLAK_DECK_PX     280   px above the surface where the flak deck starts
  //   FLAK_RATE        2.2   s between shots per battery (zone 3 fires at
  //                          FLAK_RATE * FLAK_RATE_Z3_MULT = 1.8s by default)
  //   FLAK_DMG         8     hull damage inside a zone-1 burst (zone 2 = 10,
  //                          zone 3 = 12 via FLAK_DMG_PER_ZONE)
  //   FLAK_BURST_R     64    px airburst AOE radius
  //   SHEAR_SPEED_MULT 0.65  flight speed multiplier above the deck in a zone
  //   SHEAR_FUEL_MULT  2.0   fuel burn multiplier above the deck in a zone
  var flakTune = {
    FLAK_DECK_PX: 280,
    FLAK_RATE: 2.2,
    FLAK_DMG: 8,
    FLAK_BURST_R: 64,
    SHEAR_SPEED_MULT: 0.65,
    SHEAR_FUEL_MULT: 2.0,
  };
  var FLAK_HP = 4;                  // rig-bullet hits to destroy a battery
  var FLAK_RANGE = 900;             // px horizontal engage range from the battery
  var FLAK_SHELL_SPEED = 430;       // px/s shell travel speed to the burst point
  var FLAK_SPACING = [56, 36, 24];  // tiles between batteries for zones 1/2/3
  var FLAK_JITTER = 3;              // +/- tiles of placement jitter
  var FLAK_APRON = 5;               // tiles left clear at each zone edge
  var FLAK_RATE_Z3_MULT = 1.8 / 2.2;// zone 3 fire-rate scale (1.8s at the default lever)
  var FLAK_DMG_PER_ZONE = 2;        // +hull dmg per zone past zone 1 (8 / 10 / 12)
  var FLAK_LEAD_FRAC = 0.8;         // burst-point lead fraction (under-lead = juke room)
  var FLAK_FF_DMG = 1;              // hp chipped off a chaser/stinger caught in a burst
  var FLAK_HIT_R = 16;              // px friendly-bullet hit radius vs a battery
  var FLAK_SHELLS_MAX = 60;         // hard cap on live shells
  var SHEAR_BAND_PX = 60;           // px ramp band rising off the deck line (storm shear)

  // ----- NMZ SCALING: zone 1 teaches, zone 2 pressures, zone 3 demands mastery -----
  // Per-zone roster counts + the enemy bullet damage multiplier, indexed by
  // nmzZoneNumber - 1 (NMZ1 = nearest the start town, NMZ3 = the deepest).
  // Applied in combatInit via the spawn functions; the dmg multiplier is baked
  // into each enemy BULLET at fire time (missiles + flak keep their own
  // scaling). Zone 3's dmg entry is shadowed by the live nmzTune.SCALE_DMG_Z3
  // lever (see nmzDmgMult).
  var NMZ_SCALE = {
    turrets:  [5, 7, 9],            // ground turrets per zone
    chasers:  [5, 7, 9],            // chaser drones per zone
    stingers: [5, 8, 12],           // feral stinger flock size per zone
    snipers:  [0, 3, 5],            // sniper emplacements (zone 2+ only)
    bruisers: [0, 2, 4],            // armored bruiser drones (zone 2+ only)
    dmgMult:  [1.0, 1.15, 1.3],     // enemy bullet damage multiplier per zone
  };

  // Live-tunable NMZ levers (registered as the 'nmz' gm group at combatInit
  // time, mirroring flakTune/flakGmRegister):
  //   SNIPER_DMG        12   hull damage of a sniper shell (pre zone-mult)
  //   BOSS_HP_BASE      60   gatekeeper HP at zone 1 (x1.5 / x2 in zones 2/3;
  //                          baked at spawn, so it applies on the next init)
  //   INTERCEPTOR_SPEED 400  interceptor max speed (matches the rig's top end)
  //   SCALE_DMG_Z3      1.3  zone-3 enemy bullet damage multiplier
  var nmzTune = {
    SNIPER_DMG: 12,
    BOSS_HP_BASE: 60,
    INTERCEPTOR_SPEED: 400,
    SCALE_DMG_Z3: 1.3,
  };

  // Sniper turrets (zone 2+): the ground that SNIPES. Long-barreled
  // emplacements with a huge any-altitude range: a 0.9s laser telegraph tracks
  // the rig's CURRENT position (brightening as it locks), then the shell goes
  // to where the rig was AT FIRE TIME, so moving during the telegraph dodges,
  // hovering eats 12. Slow cycle, fragile mount: dive it like a turret.
  var SNIPER_HP = 3;                // rig-bullet hits to destroy one
  var SNIPER_RANGE = 760;           // px engage range, ANY altitude (no deck gate)
  var SNIPER_AIM_TIME = 0.9;        // s of visible laser telegraph before the shot
  var SNIPER_SHELL_SPEED = 540;     // px/s, fast; the dodge happens DURING the aim
  var SNIPER_CD = 3.2;              // s between cycles
  var SNIPER_HIT_R = 15;            // px friendly-bullet hit radius
  var SNIPER_BARREL_LEN = 26;       // px, the long-barrel silhouette tell
  var SNIPER_SALVAGE = 150;         // $ paid on a rig kill

  // Bruiser drones (zone 2+): slow flying armor. A chunky riveted hover slab
  // that ambles toward the rig and hoses 3-round bursts of standard enemy
  // bullets; it never lunges. The threat is attrition: it soaks 12 hits, so
  // ignoring it means flying through its bursts all zone long.
  var BRUISER_HP = 12;              // rig-bullet hits to kill (armored)
  var BRUISER_MAX_SPEED = 90;       // px/s, slow; the rig walks away from it
  var BRUISER_MAX_FORCE = 160;      // px/s² steering accel cap (ponderous)
  var BRUISER_AGGRO = 420;          // px, pursue + burst inside this
  var BRUISER_LEASH = 560;          // px from anchor; beyond, break off + return
  var BRUISER_BURST_CD = 2.8;       // s between bursts
  var BRUISER_BURST_N = 3;          // rounds per burst
  var BRUISER_BURST_GAP = 0.12;     // s between rounds inside a burst
  var BRUISER_SEP_R = 52;           // px separation neighbourhood vs other bruisers
  var BRUISER_HIT_R = 16;           // px friendly-bullet hit radius (big slab)
  var BRUISER_BOB = 6;              // px idle bob amplitude at the anchor
  var BRUISER_SALVAGE = 250;        // $ paid on a rig kill

  // Interceptor pairs: the high-altitude answer. Loiter above the flak deck
  // inside a zone too long (INTERCEPTOR_TRIGGER_T continuous seconds; zone 3
  // scrambles faster) and a PAIR spawns at screen-edge altitude near the rig:
  // fast dart chasers that match the rig's top speed, so the sky stops being
  // the free lane. Max one pair alive per zone. Drop below the deck and STAY
  // there (INTERCEPTOR_RELAX_T) and they break off + fly away upward.
  var INTERCEPTOR_HP = 3;           // rig-bullet hits to kill one
  var INTERCEPTOR_FORCE = 700;      // px/s² steering accel cap (agile)
  var INTERCEPTOR_CONTACT_R = 16;   // px center-to-center ram contact
  var INTERCEPTOR_CONTACT_DMG = 8;  // hull per ram
  var INTERCEPTOR_CONTACT_CD = 0.7; // s between rams from one interceptor
  var INTERCEPTOR_KNOCKBACK = 240;  // px/s impulse to the rig on a ram
  var INTERCEPTOR_SEP_R = 46;       // px separation between the pair
  var INTERCEPTOR_HIT_R = 12;       // px friendly-bullet hit radius (slim dart)
  var INTERCEPTOR_TRIGGER_T = 1.5;  // s continuously above the deck before a scramble
  var INTERCEPTOR_TRIGGER_T_Z3 = 1.0; // zone 3 scrambles at this threshold instead
  var INTERCEPTOR_RELAX_T = 4.0;    // s below the deck before the pair flies away

  // Gatekeeper boss: one per zone, parked on the surface at the zone's EXIT
  // edge (the side toward the NEXT town away from the start; progress runs
  // right-to-left, so the exit is every zone's LEFT edge). A grounded armored
  // walker ~3x turret scale: a slow-tracking twin-cannon volleys 3 shells
  // every 2s inside 520px, plus a homing missile every 6s. It does NOT block
  // passage; it makes the exit hot. Killing it pays a fat salvage and it
  // stays dead for this boot (bossKilledZones survives combatInit).
  var BOSS_HP_MULT = [1, 1.5, 2];   // x BOSS_HP_BASE -> 60 / 90 / 120 by zone
  var BOSS_RANGE = 520;             // px engage range (volleys + missiles)
  var BOSS_TURN_RATE = 1.4;         // rad/s, slow tracking; flank it
  var BOSS_VOLLEY_CD = 2.0;         // s between volleys
  var BOSS_VOLLEY_N = 3;            // bullets per volley (alternating barrels)
  var BOSS_VOLLEY_GAP = 0.09;       // s between bullets inside a volley
  var BOSS_BULLET_DMG = 6;          // hull per boss shell (pre zone-mult)
  var BOSS_MISSILE_CD = 6.0;        // s between missile launches
  var BOSS_HIT_R = 34;              // px friendly-bullet hit radius (huge hull)
  var BOSS_EXIT_COLS = 12;          // boss parks within this many cols of the exit edge
  var BOSS_SALVAGE = [2000, 3500, 5000];  // $ paid per zone on the kill

  // World Y of the flak deck line (the anti-air ceiling). Exported: the flight
  // integrator + HUD read it from other fragments.
  function flakDeckY() {
    return SKY_ROWS * TILE - flakTune.FLAK_DECK_PX;
  }

  // Storm-shear factor at a world point. Exported for the flight integrator
  // (085 does NO physics itself): {speed, fuel} multipliers, 1.0/1.0 outside
  // No Man's Zone columns or below the deck line, smoothstep-ramping over a
  // SHEAR_BAND_PX band rising off the deck to SHEAR_SPEED_MULT / SHEAR_FUEL_MULT
  // fully above it inside a zone.
  function nmzShearFactor(x, y) {
    if (!ENABLE_COMBAT) return { speed: 1, fuel: 1 };   // no zone shear tax when combat is off
    var deckY = flakDeckY();
    if (y >= deckY) return { speed: 1, fuel: 1 };
    var rg = (typeof regionAt === 'function') ? regionAt(Math.floor(x / TILE)) : null;
    if (!rg || rg.kind !== REGION_NOMANS) return { speed: 1, fuel: 1 };
    var t = (deckY - y) / SHEAR_BAND_PX;
    if (t > 1) t = 1;
    t = t * t * (3 - 2 * t);          // smoothstep, so the handoff has no kink
    return {
      speed: 1 + (flakTune.SHEAR_SPEED_MULT - 1) * t,
      fuel: 1 + (flakTune.SHEAR_FUEL_MULT - 1) * t,
    };
  }

  // Register the 'flak' gm group. Writes straight into GM_LEVERS (declared in
  // 360-gm-facade.js; same IIFE scope, hoisted var) with the exact entry shape
  // gmRegisterObject produces, because the facade's helpers are defined inside
  // its own try block and this fragment loads first. Called from combatInit(),
  // which runs at boot AFTER the facade has built the registry; one-shot
  // guarded so restarts do not re-register.
  var flakGmDone = false;
  function flakGmRegister() {
    if (flakGmDone) return;
    try {
      if (typeof GM_LEVERS === 'undefined' || !GM_LEVERS) return;
      var ranges = {
        FLAK_DECK_PX:     { min: 80,   max: 800, step: 10 },
        FLAK_RATE:        { min: 0.5,  max: 6,   step: 0.1 },
        FLAK_DMG:         { min: 0,    max: 40,  step: 1 },
        FLAK_BURST_R:     { min: 16,   max: 200, step: 2 },
        SHEAR_SPEED_MULT: { min: 0.2,  max: 1,   step: 0.01 },
        SHEAR_FUEL_MULT:  { min: 1,    max: 5,   step: 0.05 },
      };
      Object.keys(ranges).forEach(function (key) {
        GM_LEVERS['flak.' + key] = {
          group: 'flak',
          label: key,
          get: function () { return flakTune[key]; },
          set: function (v) { flakTune[key] = v; },
          min: ranges[key].min,
          max: ranges[key].max,
          step: ranges[key].step,
          def: flakTune[key],
          live: true,
        };
      });
      flakGmDone = true;
    } catch (e) {}
  }

  // Register the 'nmz' gm group, same pattern + caveats as flakGmRegister
  // (writes straight into GM_LEVERS, called from combatInit, one-shot guarded).
  var nmzGmDone = false;
  function nmzGmRegister() {
    if (nmzGmDone) return;
    try {
      if (typeof GM_LEVERS === 'undefined' || !GM_LEVERS) return;
      var ranges = {
        SNIPER_DMG:        { min: 0,   max: 40,  step: 1 },
        BOSS_HP_BASE:      { min: 10,  max: 300, step: 5 },
        INTERCEPTOR_SPEED: { min: 100, max: 700, step: 10 },
        SCALE_DMG_Z3:      { min: 1,   max: 3,   step: 0.05 },
      };
      Object.keys(ranges).forEach(function (key) {
        GM_LEVERS['nmz.' + key] = {
          group: 'nmz',
          label: key,
          get: function () { return nmzTune[key]; },
          set: function (v) { nmzTune[key] = v; },
          min: ranges[key].min,
          max: ranges[key].max,
          step: ranges[key].step,
          def: nmzTune[key],
          live: true,
        };
      });
      nmzGmDone = true;
    } catch (e) {}
  }

  // Combat juice — trauma-based screenshake (Vlambeer "Art of Screenshake"),
  // kept SUBTLE per the owner's restraint: trauma in [0,1] decays each frame and
  // the offset is trauma²·MAX, so light hits barely register and only the big
  // beats (a ram, a kill) shake. World-space ONLY (the HUD + the pinned
  // celestials stay rock-steady), and fully gated by prefers-reduced-motion.
  var COMBAT_SHAKE_MAX = 7;         // px — peak world-space offset at trauma 1
  var COMBAT_SHAKE_DECAY = 0.42;    // s — time for one unit of trauma to bleed off
  var combatTrauma = 0;
  var combatReduceMotion = false;
  try { combatReduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  function addTrauma(amount) {
    if (combatReduceMotion) return;
    combatTrauma = Math.min(1, combatTrauma + amount);
  }
  // World-space shake offset for this frame (read by render()'s world transform).
  function combatShakeOffset() {
    if (combatTrauma <= 0 || combatReduceMotion) return { x: 0, y: 0 };
    var amt = combatTrauma * combatTrauma * COMBAT_SHAKE_MAX;   // squared = subtle until it's a real hit
    // Player options (052-options.js): the pause-screen shake slider scales
    // every combat shake; 1 when options are absent or untouched.
    if (typeof window !== 'undefined' && window.SluiceOptions && typeof window.SluiceOptions.shakeScale === 'number') {
      amt *= window.SluiceOptions.shakeScale;
    }
    return { x: Math.sin(combatClock * 47.0) * amt, y: Math.cos(combatClock * 53.0) * amt };
  }

  // ----- State -----
  var stingerSfxLastMs = 0;         // stinger-hit throttle (a diving swarm pecks fast)
  var enemyTurrets = [];            // { x, y(base), ang, hp, maxHp, cool, charge, muzzleT, hitT, seed }
  var bullets = [];                 // { x, y, vx, vy, life, dmg, friendly, seed }
  var combatSparks = [];            // { x, y, vx, vy, life, maxLife, col, size }
  var chasers = [];                 // { x, y, vx, vy, ax, ay (anchor), hp, maxHp, hitT, contactCd, face, seed }
  var missiles = [];                // { x, y, vx, vy, life, armT, seed } — homing, capped-turn pursuit
  var stingers = [];                // { x, y, vx, vy, ax, ay (roost), hp, maxHp, hitT, strikeCd, retargetT, target, face, flap, seed } — Boids swarm
  var obstacles = [];               // { kind:'spire'|'block', x, y, w, h, seed } — solid fly-through wreckage in the zones
  var flakBatteries = [];           // { x, y(base), zone, x0, x1, ang, hp, maxHp, cool, muzzleT, hitT, seed } anti-air ceiling
  var flakShells = [];              // { x, y, sx, sy, tx, ty, vx, vy, t, flight, zone, seed } in-flight airburst shells
  var snipers = [];                 // { x, y(base), zone, ang, hp, maxHp, cool, aimT, muzzleT, hitT, seed } long-range laser-telegraph emplacements
  var bruisers = [];                // { x, y, vx, vy, ax, ay (anchor), zone, hp, maxHp, hitT, cool, burstN, burstT, gunAng, face, seed } slow armored burst drones
  var interceptors = [];            // { x, y, vx, vy, zone, hp, maxHp, hitT, contactCd, state:'hunt'|'leave', face, seed } high-altitude dart pair
  var bosses = [];                  // { x, y(base), zone, ang, hp, maxHp, cool, volleyN, volleyT, missileCd, muzzleT, hitT, seed } gatekeeper at each zone exit
  var bossKilledZones = {};         // zone -> true once its gatekeeper dies; NOT reset by combatInit (dead for this boot)
  var nmzAboveT = {};               // zone -> s the rig has been CONTINUOUSLY above the flak deck inside that zone
  var nmzBelowT = {};               // zone -> s the rig has stayed off that zone's high band (below deck / elsewhere)
  // The rig's mounted turret. Its swivel angle persists frame-to-frame so the
  // barrel sweeps smoothly toward whatever it is tracking.
  var rigTurret = { ang: -Math.PI / 2, cool: 0, muzzleT: 0, target: null, deploy: 0 };
  var combatKills = 0;              // session kills (turret + chaser; first-kill analytics ping)
  var combatClock = 0;              // seconds accumulator (drone bob, blinks) — not the slow timeOfDay

  // Reset + (re)populate combat for a fresh run. Called from init() alongside
  // the other array resets. Safe to call before player exists (touches no
  // player state); placement only reads the REGIONS table (built at load).
  function combatInit() {
    if (!ENABLE_COMBAT) return;   // combat disabled: place no enemies/turrets/bosses (free-forever sandbox)
    enemyTurrets = [];
    chasers = [];
    missiles = [];
    stingers = [];
    obstacles = [];
    flakBatteries = [];
    flakShells = [];
    snipers = [];
    bruisers = [];
    interceptors = [];
    bosses = [];
    nmzAboveT = {};
    nmzBelowT = {};
    // bossKilledZones is deliberately NOT reset: a downed gatekeeper stays dead for this boot.
    bullets = [];
    combatSparks = [];
    rigTurret = { ang: -Math.PI / 2, cool: 0, muzzleT: 0, target: null, deploy: 0 };
    combatKills = 0;
    combatClock = 0;
    placeZoneTurrets();
    spawnZoneChasers();
    spawnZoneStingers();
    spawnZoneObstacles();
    spawnZoneFlak();
    spawnZoneSnipers();
    spawnZoneBruisers();
    spawnZoneBosses();
    flakGmRegister();   // safe here: init() runs at boot AFTER 360 built GM_LEVERS
    nmzGmRegister();
  }

  // Zone number counted from the start town: NMZ1 = the No Man's Zone nearest
  // Town 1 (the rightmost zone; layout is ocean|T4|NMZ3|T3|NMZ2|T2|NMZ1|T1|ocean,
  // progression right-to-left), NMZ3 = the leftmost. Computed positionally so
  // it stays correct if the REGIONS table grows: 1 + the count of No Man's
  // Zones to this region's RIGHT.
  function nmzZoneNumber(rg) {
    var n = 1;
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].kind === REGION_NOMANS && REGIONS[i].c0 > rg.c0) n++;
    }
    return n;
  }

  // Zone-scaled flak numbers (live levers + per-zone escalation).
  function flakZoneRate(zone) {
    return flakTune.FLAK_RATE * (zone >= 3 ? FLAK_RATE_Z3_MULT : 1);
  }
  function flakZoneDmg(zone) {
    return flakTune.FLAK_DMG + FLAK_DMG_PER_ZONE * (zone - 1);
  }

  // NMZ_SCALE row lookup, clamped so a hypothetical zone 4 reuses the zone-3
  // numbers instead of reading off the end of the table.
  function nmzScaleVal(arr, zone) {
    var z = zone < 1 ? 1 : zone;
    if (z > arr.length) z = arr.length;
    return arr[z - 1];
  }

  // Enemy BULLET damage multiplier per zone. Zone 3 reads the live
  // nmzTune.SCALE_DMG_Z3 lever (the table's 1.3 is its boot default); baked
  // into each bullet at fire time. Missiles + flak keep their own scaling.
  function nmzDmgMult(zone) {
    if (zone >= 3) return nmzTune.SCALE_DMG_Z3;
    return nmzScaleVal(NMZ_SCALE.dmgMult, zone);
  }

  // How many No Man's Zones exist (REGIONS is fixed at load; trivial count).
  function nmzZoneCount() {
    var n = 0;
    if (!REGIONS || !REGIONS.length) return 0;
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].kind === REGION_NOMANS) n++;
    return n;
  }

  // Evenly spread placement column k of `count` across a zone (same frac +
  // jitter scheme spawnZoneChasers uses), clamped inside the apron.
  function nmzSpreadCol(rg, k, count, jitter) {
    var lo = rg.c0 + ENEMY_TURRET_APRON, hi = rg.c1 - ENEMY_TURRET_APRON;
    var c = Math.round(lo + ((k + 0.5) / count) * (hi - lo) + (Math.random() * 2 - 1) * jitter);
    if (c < lo) c = lo;
    if (c >= hi) c = hi - 1;
    return c;
  }

  // Line flak batteries across each No Man's Zone, denser the further the zone
  // is from the start town (FLAK_SPACING by zone number). Mirrors
  // placeZoneTurrets: apron at each edge, jitter, never over a pond, staggered
  // initial cooldowns so a zone never fires one synchronized wall.
  function spawnZoneFlak() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var zone = nmzZoneNumber(rg);
      var spacing = FLAK_SPACING[Math.min(FLAK_SPACING.length, zone) - 1];
      var startC = rg.c0 + FLAK_APRON;
      var endC = rg.c1 - FLAK_APRON;
      for (var c = startC; c < endC; c += spacing) {
        var jc = c + Math.round((Math.random() * 2 - 1) * FLAK_JITTER);
        if (jc < startC || jc >= endC) jc = c;
        if (colOverPond(jc, 1)) continue;     // keep the lakes clear
        flakBatteries.push({
          x: (jc + 0.5) * TILE,
          y: groundY,                          // base sits ON the surface
          zone: zone,
          x0: rg.c0 * TILE,                    // engage only while the rig is in
          x1: rg.c1 * TILE,                    // this zone's columns
          ang: -Math.PI / 2,                   // idle: barrels straight up
          hp: FLAK_HP,
          maxHp: FLAK_HP,
          cool: Math.random() * flakZoneRate(zone),   // stagger the opening volley
          muzzleT: 0,
          hitT: 0,
          seed: Math.random() * 1000,
        });
      }
    }
  }

  // Spread sniper emplacements across zone 2+ (NMZ_SCALE.snipers: 0/3/5).
  // Same placement scheme as the turrets: even spread + jitter, never on a
  // pond, base parked ON the surface.
  function spawnZoneSnipers() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var zone = nmzZoneNumber(rg);
      var count = nmzScaleVal(NMZ_SCALE.snipers, zone);
      for (var k = 0; k < count; k++) {
        var jc = nmzSpreadCol(rg, k, count, ENEMY_TURRET_JITTER);
        if (colOverPond(jc, 1)) continue;
        snipers.push({
          x: (jc + 0.5) * TILE,
          y: groundY,                       // base sits ON the surface
          zone: zone,
          ang: -Math.PI / 2,                // idle: barrel up
          hp: SNIPER_HP,
          maxHp: SNIPER_HP,
          cool: Math.random() * SNIPER_CD,  // desync the first locks
          aimT: 0,                          // laser telegraph progress (0..SNIPER_AIM_TIME)
          muzzleT: 0,
          hitT: 0,
          seed: Math.random() * 1000,
        });
      }
    }
  }

  // Scatter bruiser drones through zone 2+ (NMZ_SCALE.bruisers: 0/2/4),
  // anchored in the hover band like chasers but lower + slower.
  function spawnZoneBruisers() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var zone = nmzZoneNumber(rg);
      var count = nmzScaleVal(NMZ_SCALE.bruisers, zone);
      for (var k = 0; k < count; k++) {
        var col = nmzSpreadCol(rg, k, count, 8);
        var x = (col + 0.5) * TILE;
        var y = groundY - (70 + Math.random() * 90);
        bruisers.push({
          x: x, y: y, vx: 0, vy: 0,
          ax: x, ay: y,                     // anchor (patrol home + leash centre)
          zone: zone,
          hp: BRUISER_HP, maxHp: BRUISER_HP,
          hitT: 0,
          cool: Math.random() * BRUISER_BURST_CD,   // desync the bursts
          burstN: 0, burstT: 0,             // live burst sequencer
          gunAng: 0,                        // last aim (drawn as the gun nub)
          face: Math.random() < 0.5 ? 0 : Math.PI,
          seed: Math.random() * 1000,
        });
      }
    }
  }

  // Park one gatekeeper boss at each zone's EXIT edge: the side toward the
  // NEXT town away from the start. Progress runs right-to-left (T1 is the
  // rightmost town), so the exit is every zone's LEFT edge; the boss sits in
  // the last ~BOSS_EXIT_COLS columns the rig crosses. Skips zones whose
  // gatekeeper already died this boot, and slides right off a pond edge.
  function spawnZoneBosses() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var zone = nmzZoneNumber(rg);
      if (bossKilledZones[zone]) continue;          // stays dead for this boot
      var c = rg.c0 + Math.floor(BOSS_EXIT_COLS / 2);
      var lim = rg.c0 + BOSS_EXIT_COLS * 2;
      while (colOverPond(c, 2) && c < lim) c += 2;  // nudge off a pond, stay near the exit
      bosses.push({
        x: (c + 0.5) * TILE,
        y: groundY,                                 // parked ON the surface
        zone: zone,
        ang: -Math.PI / 2,                          // idle: cannons up
        hp: Math.round(nmzTune.BOSS_HP_BASE * nmzScaleVal(BOSS_HP_MULT, zone)),
        maxHp: Math.round(nmzTune.BOSS_HP_BASE * nmzScaleVal(BOSS_HP_MULT, zone)),
        cool: 1 + Math.random(),                    // a beat of grace on approach
        volleyN: 0, volleyT: 0,                     // live volley sequencer
        missileCd: BOSS_MISSILE_CD * (0.5 + Math.random() * 0.5),
        muzzleT: 0,
        hitT: 0,
        seed: Math.random() * 1000,
      });
    }
  }

  // Walk every No Man's Zone region and line ground turrets across it,
  // NMZ_SCALE.turrets per zone, evenly spread with jitter, leaving an apron
  // clear at each edge so the entrance reads as a calm beat before the gauntlet.
  // True if world column c sits over (or within `margin` tiles of) a surface
  // pond, so turrets + obstacles leave the lakes as open fast lanes. surfacePonds
  // (030-worldgen) is { cL, cR } column spans, populated before combatInit.
  function colOverPond(c, margin) {
    if (typeof surfacePonds === 'undefined' || !surfacePonds || !surfacePonds.length) return false;
    var m = margin || 0;
    for (var i = 0; i < surfacePonds.length; i++) {
      var p = surfacePonds[i];
      if (c >= p.cL - m && c <= p.cR + m) return true;
    }
    return false;
  }

  // Lay fly-through obstacle clusters across each No Man's Zone: walk left->right
  // alternating open straightaways and chokepoint clusters, skipping any cluster
  // that would sit over a pond (lakes stay open). Each cluster forces a weave.
  function spawnZoneObstacles() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var endC = rg.c1 - OBSTACLE_APRON;
      // Open the zone mouth with a straightaway, then alternate cluster/gap.
      var c = rg.c0 + OBSTACLE_APRON + OBSTACLE_GAP_MIN + Math.floor(Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN));
      while (c < endC) {
        if (colOverPond(c, OBSTACLE_POND_MARGIN)) {
          c += 6 + Math.floor(Math.random() * 8);   // skim past the lake, keep it open
          continue;
        }
        placeObstacleCluster(c * TILE, groundY);
        c += OBSTACLE_GAP_MIN + Math.floor(Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN));
      }
    }
  }

  // One chokepoint formation at world x `cx` (ground at `groundY`).
  function placeObstacleCluster(cx, groundY) {
    var roll = Math.random();
    var w = 22 + Math.random() * 20;
    if (roll < 0.45) {
      // Tall ground spire — fly over it or weave around.
      var h = 110 + Math.random() * 150;
      obstacles.push({ kind: 'spire', x: cx - w / 2, y: groundY - h, w: w, h: h, seed: Math.random() * 1000 });
    } else if (roll < 0.78) {
      // Gate: a ground stub + a floating mass above, leaving a slot to thread.
      var stubH = 38 + Math.random() * 64;
      var slot = 48 + Math.random() * 30;                  // navigable gap height
      obstacles.push({ kind: 'spire', x: cx - w / 2, y: groundY - stubH, w: w, h: stubH, seed: Math.random() * 1000 });
      var capH = 70 + Math.random() * 90;
      obstacles.push({ kind: 'block', x: cx - w / 2 - 4, y: groundY - stubH - slot - capH, w: w + 8, h: capH, seed: Math.random() * 1000 });
    } else {
      // Floating boulder at the cruise band — go around (up or down).
      var bw = 30 + Math.random() * 34, bh = 22 + Math.random() * 30;
      obstacles.push({ kind: 'block', x: cx - bw / 2, y: groundY - (70 + Math.random() * 150), w: bw, h: bh, seed: Math.random() * 1000 });
    }
  }

  function placeZoneTurrets() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;   // top of the zone dirt skin = the surface
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var zone = nmzZoneNumber(rg);
      var count = nmzScaleVal(NMZ_SCALE.turrets, zone);   // 5 / 7 / 9 by zone
      for (var k = 0; k < count; k++) {
        var jc = nmzSpreadCol(rg, k, count, ENEMY_TURRET_JITTER);
        if (colOverPond(jc, 1)) continue;   // don't sit a turret on the water
        enemyTurrets.push({
          x: (jc + 0.5) * TILE,
          y: groundY,                       // base sits ON the surface
          zone: zone,                       // bullet dmg scales by zone (nmzDmgMult)
          ang: -Math.PI / 2,                // idle: pointing straight up
          hp: ENEMY_TURRET_HP,
          maxHp: ENEMY_TURRET_HP,
          cool: Math.random() * ENEMY_FIRE_CD,   // desync the volley
          charge: 0,
          muzzleT: 0,
          hitT: 0,
          missile: (Math.random() < MISSILE_TURRET_FRAC),   // elite launcher?
          seed: Math.random() * 1000,
        });
      }
    }
  }

  // Scatter flying chaser drones through each No Man's Zone, hovering in the
  // open air above the surface. Each one anchors to its spawn point and patrols
  // there until the rig comes within aggro range. Spread along the zone so a
  // crossing meets them a few at a time, not in one wall.
  function spawnZoneChasers() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      var lo = rg.c0 + ENEMY_TURRET_APRON, hi = rg.c1 - ENEMY_TURRET_APRON;
      var nChasers = nmzScaleVal(NMZ_SCALE.chasers, nmzZoneNumber(rg));   // 5 / 7 / 9
      for (var k = 0; k < nChasers; k++) {
        // Even spacing across the zone + jitter, varied air height.
        var frac = (k + 0.5) / nChasers;
        var col = lo + frac * (hi - lo) + (Math.random() * 2 - 1) * 6;
        var x = col * TILE;
        var y = groundY - (60 + Math.random() * 110);   // hover band above the surface
        chasers.push({
          x: x, y: y, vx: 0, vy: 0,
          ax: x, ay: y,                       // anchor (patrol home + leash centre)
          hp: CHASER_HP, maxHp: CHASER_HP,
          hitT: 0, contactCd: 0,
          state: 'patrol', stateT: 0,     // dash FSM: patrol | pursue | windup | lunge | recover
          face: Math.random() < 0.5 ? 0 : Math.PI,
          seed: Math.random() * 1000,
        });
      }
    }
  }

  // Seed a feral stinger flock per No Man's Zone, hovering at a shared roost in
  // the open air. Each anchors to that roost (a loose leash) and flocks there
  // until a target (rig / turret / drone) wanders into sense range.
  function spawnZoneStingers() {
    if (!REGIONS || !REGIONS.length) return;
    var groundY = SKY_ROWS * TILE;
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      if (rg.kind !== REGION_NOMANS) continue;
      // One roost per zone so the flock actually flocks together.
      var rc = (rg.c0 + rg.c1) * 0.5 + (Math.random() * 2 - 1) * (rg.width * 0.18);
      var rx = rc * TILE;
      var ry = groundY - (90 + Math.random() * 70);
      var nStingers = nmzScaleVal(NMZ_SCALE.stingers, nmzZoneNumber(rg));   // 5 / 8 / 12
      for (var k = 0; k < nStingers; k++) {
        stingers.push({
          x: rx + (Math.random() * 2 - 1) * 50,
          y: ry + (Math.random() * 2 - 1) * 40,
          vx: (Math.random() * 2 - 1) * 40, vy: (Math.random() * 2 - 1) * 40,
          ax: rx, ay: ry,
          hp: STINGER_HP, maxHp: STINGER_HP,
          hitT: 0, strikeCd: Math.random() * STINGER_STRIKE_CD,
          retargetT: Math.random() * STINGER_RETARGET,
          target: null,
          face: Math.random() < 0.5 ? 0 : Math.PI,
          flap: Math.random() * Math.PI * 2,
          seed: Math.random() * 1000,
        });
      }
    }
  }

  // Smallest signed angle delta a -> b, wrapped to [-PI, PI].
  function angDelta(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Quadratic intercept aim: the firing angle from (sx,sy) so a projectile of
  // speed `projSpeed` meets a target at (tx,ty) moving at (tvx,tvy). Solves
  // |D + Vt·τ| = projSpeed·τ for the earliest positive τ, then aims at the
  // predicted point P + Vt·τ·leadFrac. leadFrac < 1 deliberately under-leads so
  // a juking target can still slip the shot (fairness knob). Degrades cleanly:
  // a still target (Vt=0) gives τ=|D|/speed and a direct aim; if the target
  // outruns the projectile (no positive root) it falls back to aiming at the
  // target's current position. Pure function — used by the node harness too.
  function interceptAim(sx, sy, tx, ty, tvx, tvy, projSpeed, leadFrac) {
    var dx = tx - sx, dy = ty - sy;
    var a = tvx * tvx + tvy * tvy - projSpeed * projSpeed;
    var b = 2 * (dx * tvx + dy * tvy);
    var c = dx * dx + dy * dy;
    var tau = -1;
    if (Math.abs(a) < 1e-4) {
      if (Math.abs(b) > 1e-6) tau = -c / b;            // target speed ≈ projectile speed
    } else {
      var disc = b * b - 4 * a * c;
      if (disc >= 0) {
        var sq = Math.sqrt(disc);
        var t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
        var lo = (t1 > 0) ? t1 : Infinity, hi = (t2 > 0) ? t2 : Infinity;
        tau = Math.min(lo, hi);
        if (!isFinite(tau)) tau = -1;
      }
    }
    if (tau > 0) {
      var lf = (leadFrac == null) ? 1 : leadFrac;
      return Math.atan2((ty + tvy * tau * lf) - sy, (tx + tvx * tau * lf) - sx);
    }
    return Math.atan2(dy, dx);                          // unreachable: aim at current pos
  }

  function spawnCombatSpark(x, y, baseAng, spread, n, col, speed) {
    for (var i = 0; i < n; i++) {
      var a = baseAng + (Math.random() * 2 - 1) * spread;
      var sp = speed * (0.4 + Math.random() * 0.8);
      combatSparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.18 + Math.random() * 0.22,
        maxLife: 0.4,
        col: col,
        size: 1 + Math.random() * 1.4,
      });
    }
  }

  // Small turret-death blast — same shape drawExplosions/updateExplosions
  // expect (billows + streaks), just sized down a touch from a small bomb.
  function combatExplosion(cx, cy) {
    var blastR = TILE * 1.05;
    var billows = [];
    for (var bi = 0; bi < 7; bi++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = Math.random() * blastR * 0.3;
      var drift = 18 + Math.random() * 32;
      billows.push({
        x: cx + Math.cos(ang) * dist,
        y: cy + Math.sin(ang) * dist,
        vx: Math.cos(ang) * drift,
        vy: Math.sin(ang) * drift - 14 - Math.random() * 22,
        r: 3 + Math.random() * 4,
        maxR: 11 + Math.random() * 9,
        delay: Math.random() * 0.1,
        heat: Math.random(),
      });
    }
    var streaks = [];
    for (var si = 0; si < 9; si++) {
      streaks.push({
        ang: Math.random() * Math.PI * 2,
        len: 14 + Math.random() * 13,
        speed: 120 + Math.random() * 120,
        dist: 0,
        width: 1 + Math.random() * 1.4,
        bright: 0.4 + Math.random() * 0.6,
      });
    }
    explosions.push({ cx: cx, cy: cy, r: blastR, t: 0, life: 0.55, billows: billows, streaks: streaks, large: false });
  }

  function fireBullet(x, y, ang, speed, dmg, friendly) {
    if (bullets.length >= BULLETS_MAX) return;
    // Every gun in the zone routes through here: ONE small restrained shot
    // (SFX_BIBLE §10 turret-fire — auto-fire must stay low-fatigue), panned
    // by screen X. Pool of 3 + jitter carries the variety at real fire rates.
    sfxPlay('turret-fire', { pan: sfxPanAt(x), gain: friendly ? 0.85 : 1 });
    bullets.push({
      x: x, y: y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: BULLET_LIFE,
      dmg: dmg,
      friendly: friendly,
      seed: Math.random() * 1000,
    });
  }

  function killTurret(t, idx) {
    combatExplosion(t.x, t.y - 13);
    spawnCombatSpark(t.x, t.y - 13, -Math.PI / 2, Math.PI, 10, '#ff8a3a', 200);
    spawnFloater(t.x, t.y - 30, 'TURRET DOWN', '#ff6a3a', true); sfxPlay('drone-down', { pan: sfxPanAt(t.x) });
    hitPauseT = Math.max(hitPauseT, 0.05);
    addTrauma(0.45);
    t._dead = true;
    enemyTurrets.splice(idx, 1);
    combatKills++;
    if (combatKills === 1) track('first_turret_kill', { depth: depthRecord });
    track('turret_killed', { kills: combatKills });
  }

  function killChaser(c, idx) {
    combatExplosion(c.x, c.y);
    spawnCombatSpark(c.x, c.y, 0, Math.PI, 10, '#ff8a3a', 220);
    spawnFloater(c.x, c.y - 18, 'DRONE DOWN', '#ff8a4a', true); sfxPlay('drone-down', { pan: sfxPanAt(c.x) });
    hitPauseT = Math.max(hitPauseT, 0.04);
    addTrauma(0.35);
    c._dead = true;
    chasers.splice(idx, 1);
    combatKills++;
    track('chaser_killed', { kills: combatKills });
  }

  function killFlak(f, idx) {
    combatExplosion(f.x, f.y - 14);
    spawnCombatSpark(f.x, f.y - 14, -Math.PI / 2, Math.PI, 12, '#ffc24a', 210);
    spawnFloater(f.x, f.y - 34, 'FLAK DOWN', '#ffc24a', true); sfxPlay('drone-down', { pan: sfxPanAt(f.x) });
    hitPauseT = Math.max(hitPauseT, 0.05);
    addTrauma(0.45);
    f._dead = true;
    flakBatteries.splice(idx, 1);
    combatKills++;
    track('flak_killed', { kills: combatKills });
  }

  function killSniper(t, idx) {
    combatExplosion(t.x, t.y - 13);
    spawnCombatSpark(t.x, t.y - 13, -Math.PI / 2, Math.PI, 10, '#ff8a3a', 200);
    spawnFloater(t.x, t.y - 30, 'SNIPER DOWN', '#ff6a3a', true); sfxPlay('drone-down', { pan: sfxPanAt(t.x) });
    money += SNIPER_SALVAGE;
    spawnFloater(t.x, t.y - 44, '+$' + SNIPER_SALVAGE, '#FFD700', true);
    hitPauseT = Math.max(hitPauseT, 0.05);
    addTrauma(0.45);
    t._dead = true;
    snipers.splice(idx, 1);
    combatKills++;
    track('sniper_killed', { kills: combatKills });
  }

  function killBruiser(c, idx) {
    combatExplosion(c.x, c.y);
    spawnCombatSpark(c.x, c.y, 0, Math.PI, 12, '#ff8a3a', 220);
    spawnFloater(c.x, c.y - 20, 'BRUISER DOWN', '#ff8a4a', true); sfxPlay('drone-down', { pan: sfxPanAt(c.x) });
    money += BRUISER_SALVAGE;
    spawnFloater(c.x, c.y - 34, '+$' + BRUISER_SALVAGE, '#FFD700', true);
    hitPauseT = Math.max(hitPauseT, 0.05);
    addTrauma(0.45);
    c._dead = true;
    bruisers.splice(idx, 1);
    combatKills++;
    track('bruiser_killed', { kills: combatKills });
  }

  function killInterceptor(c, idx) {
    combatExplosion(c.x, c.y);
    spawnCombatSpark(c.x, c.y, 0, Math.PI, 10, '#ff8a3a', 240);
    spawnFloater(c.x, c.y - 18, 'INTERCEPTOR DOWN', '#ff8a4a', true); sfxPlay('drone-down', { pan: sfxPanAt(c.x) });
    hitPauseT = Math.max(hitPauseT, 0.04);
    addTrauma(0.4);
    c._dead = true;
    interceptors.splice(idx, 1);
    combatKills++;
    track('interceptor_killed', { kills: combatKills });
  }

  // The gatekeeper goes down BIG: a staggered explosion chain across the hull,
  // a fat salvage payout, and the zone stays boss-free for this boot.
  function killBoss(b, idx) {
    combatExplosion(b.x - 18, b.y - 38);
    combatExplosion(b.x + 16, b.y - 22);
    combatExplosion(b.x, b.y - 50);
    combatExplosion(b.x + 22, b.y - 44);
    combatExplosion(b.x - 12, b.y - 12);
    spawnCombatSpark(b.x, b.y - 34, -Math.PI / 2, Math.PI, 22, '#ff8a3a', 260);
    spawnCombatSpark(b.x, b.y - 34, -Math.PI / 2, Math.PI, 14, '#ffc24a', 200);
    var pay = nmzScaleVal(BOSS_SALVAGE, b.zone);
    money += pay;
    spawnFloater(b.x, b.y - 80, 'GATEKEEPER DOWN', '#ff6a3a', true); sfxPlay('drone-down', { pan: sfxPanAt(b.x), gain: 1.25 });
    spawnFloater(b.x, b.y - 64, '+$' + pay.toLocaleString(), '#FFD700', true);
    hitPauseT = Math.max(hitPauseT, 0.12);
    addTrauma(1.0);
    bossKilledZones[b.zone] = true;                 // dead for this boot
    b._dead = true;
    bosses.splice(idx, 1);
    combatKills++;
    track('boss_killed', { zone: b.zone, kills: combatKills });
  }

  function spawnMissile(x, y, ang) {
    if (missiles.length >= MISSILES_MAX) return;
    // The launch IS the danger telegraph (SFX_PROMPT_SYSTEM §5): audible
    // before the hit can ever land, panned at the rail.
    sfxPlay('missile-launch', { pan: sfxPanAt(x) });
    missiles.push({
      x: x, y: y,
      vx: Math.cos(ang) * MISSILE_SPEED,
      vy: Math.sin(ang) * MISSILE_SPEED,
      life: MISSILE_LIFE,
      armT: MISSILE_ARM,
      seed: Math.random() * 1000,
    });
  }

  // Homing-missile update: capped-turn-rate pursuit. After a short arming window
  // (straight flight off the rail) the heading turns toward the rig at most
  // MISSILE_TURN rad/s while speed stays fixed — so the turn RADIUS
  // (speed/turn) is what makes it dodgeable. Detonates on contact or ground;
  // fizzles at maxLife (a clean miss is survivable).
  function updateMissiles(dt) {
    if (!missiles.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    var groundY = SKY_ROWS * TILE;
    for (var i = missiles.length - 1; i >= 0; i--) {
      var m = missiles[i];
      m.life -= dt;
      if (m.armT > 0) m.armT -= dt;
      if (m.armT <= 0 && playerAlive) {
        var head = Math.atan2(m.vy, m.vx);
        var want = Math.atan2(pcy - m.y, pcx - m.x);
        var dA = angDelta(head, want);
        var step = MISSILE_TURN * dt;
        head += (Math.abs(dA) < step) ? dA : (dA > 0 ? step : -step);
        m.vx = Math.cos(head) * MISSILE_SPEED;
        m.vy = Math.sin(head) * MISSILE_SPEED;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      var dead = false;
      if (m.life <= 0) { spawnCombatSpark(m.x, m.y, 0, Math.PI, 5, '#ffcaa0', 90); dead = true; }   // fizzle
      else if (m.y >= groundY || m.y < -200 || m.x < 0 || m.x > COLS * TILE) {
        combatExplosion(m.x, Math.min(m.y, groundY - 2));
        sfxPlay('missile-hit', { pan: sfxPanAt(m.x) });
        addTrauma(0.4);
        dead = true;
      } else if (playerAlive) {
        var mdx = pcx - m.x, mdy = pcy - m.y;
        if (mdx * mdx + mdy * mdy < MISSILE_R * MISSILE_R) {
          player.hull -= MISSILE_DMG;
          combatExplosion(m.x, m.y);
          sfxPlay('missile-hit');          // on the rig: dead-centre, no pan
          sfxPlay('hull-hit');             // the receive layers under the blast
          var ka = Math.atan2(m.vy, m.vx);
          player.vx += Math.cos(ka) * 200;          // missiles hit hard
          player.vy += Math.sin(ka) * 200 - 30;
          damageFlashT = Math.max(damageFlashT, 0.45);
          hitPauseT = Math.max(hitPauseT, 0.07);
          addTrauma(0.7);
          dead = true;
          if (player.hull <= 0) { player.hull = 0; endGame({ type: 'combat' }); }
        }
      }
      if (dead) missiles.splice(i, 1);
    }
  }

  // Flying chaser AI — a dash predator. Cruises toward the rig with Reynolds
  // seek + separation (semi-implicit Euler, force AND speed capped); when it
  // closes in it WINDS UP (brakes, a readable tell) then LUNGES in a locked
  // straight line. The lunge is committed — no mid-dash steering — so a juking
  // rig dodges it while a hovering rig gets rammed. Leashes to its spawn anchor
  // so combat stays inside the zone.
  function updateChasers(dt) {
    if (!chasers.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    var ceilY = SKY_ROWS * TILE - 8;        // hover just above the surface line
    for (var i = 0; i < chasers.length; i++) {
      var c = chasers[i];
      if (c.hitT > 0) c.hitT -= dt;
      if (c.contactCd > 0) c.contactCd -= dt;
      c.stateT -= dt;

      var toPx = pcx - c.x, toPy = pcy - c.y;
      var distP = Math.sqrt(toPx * toPx + toPy * toPy) || 0.0001;
      var fax = c.x - c.ax, fay = c.y - c.ay;
      var leashed = (fax * fax + fay * fay) > CHASER_LEASH * CHASER_LEASH;
      var pursuing = playerAlive && distP < CHASER_AGGRO && !leashed;

      // ---- Dash FSM transitions ----
      if (!pursuing) {
        c.state = 'patrol';
      } else {
        if (c.state === 'patrol') c.state = 'pursue';
        if (c.state === 'recover' && c.stateT <= 0) c.state = 'pursue';
      }

      var maxSpd = CHASER_MAX_SPEED;
      if (c.state === 'windup') {
        // Brake toward a stop while tracking, then fire a locked-direction dash.
        var bx = -c.vx, by = -c.vy;
        var bm = Math.sqrt(bx * bx + by * by);
        if (bm > CHASER_MAX_FORCE) { bx = bx / bm * CHASER_MAX_FORCE; by = by / bm * CHASER_MAX_FORCE; }
        c.vx += bx * dt; c.vy += by * dt;
        if (c.stateT <= 0) {
          c.vx = (toPx / distP) * CHASER_LUNGE_SPEED;
          c.vy = (toPy / distP) * CHASER_LUNGE_SPEED;
          c.state = 'lunge'; c.stateT = CHASER_LUNGE_DUR;
        }
      } else if (c.state === 'lunge') {
        // Committed dash: hold velocity, no steering, no separation.
        maxSpd = CHASER_LUNGE_SPEED;
        if (c.stateT <= 0) { c.state = 'recover'; c.stateT = CHASER_LUNGE_CD; }
      } else {
        // patrol / pursue / recover -> Reynolds seek (+ separation).
        var tx, ty, arrive = false;
        if (c.state === 'patrol') {
          tx = c.ax; ty = c.ay + Math.sin(combatClock * 1.7 + c.seed) * CHASER_BOB; arrive = true;
        } else {
          tx = pcx; ty = pcy;             // pursue + recover re-approach the rig
        }
        var dx = tx - c.x, dy = ty - c.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var desiredSpeed = arrive ? CHASER_MAX_SPEED * Math.min(1, d / CHASER_ARRIVE_R) : CHASER_MAX_SPEED;
        var steerX = (dx / d) * desiredSpeed - c.vx;
        var steerY = (dy / d) * desiredSpeed - c.vy;
        for (var j = 0; j < chasers.length; j++) {
          if (j === i) continue;
          var o = chasers[j];
          var sx = c.x - o.x, sy = c.y - o.y;
          var sd2 = sx * sx + sy * sy;
          if (sd2 > 0.01 && sd2 < CHASER_SEP_R * CHASER_SEP_R) {
            var sd = Math.sqrt(sd2);
            var w = (1 - sd / CHASER_SEP_R) * CHASER_SEP_FORCE;
            steerX += (sx / sd) * w; steerY += (sy / sd) * w;
          }
        }
        var sm = Math.sqrt(steerX * steerX + steerY * steerY);
        if (sm > CHASER_MAX_FORCE) { steerX = steerX / sm * CHASER_MAX_FORCE; steerY = steerY / sm * CHASER_MAX_FORCE; }
        c.vx += steerX * dt; c.vy += steerY * dt;
        // Commit to a dash once closed in (only from pursue = off cooldown).
        if (c.state === 'pursue' && distP < CHASER_LUNGE_RANGE) { c.state = 'windup'; c.stateT = CHASER_WINDUP; }
      }

      // Integrate (semi-implicit), clamp to the state's speed cap.
      var spd = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      if (spd > maxSpd) { c.vx = c.vx / spd * maxSpd; c.vy = c.vy / spd * maxSpd; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y > ceilY) { c.y = ceilY; if (c.vy > 0) c.vy *= -0.3; }
      if (c.y < 4) { c.y = 4; if (c.vy < 0) c.vy *= -0.3; }
      if (spd > 6) c.face = Math.atan2(c.vy, c.vx);

      // Ram contact with the rig (any state): damage + mutual knockback impulse.
      if (playerAlive && c.contactCd <= 0 && distP < CHASER_CONTACT_R) {
        player.hull -= CHASER_CONTACT_DMG; sfxPlay('hull-hit');
        var ka = Math.atan2(pcy - c.y, pcx - c.x);
        player.vx += Math.cos(ka) * CHASER_KNOCKBACK;
        player.vy += Math.sin(ka) * CHASER_KNOCKBACK - 40;
        c.vx -= Math.cos(ka) * CHASER_KNOCKBACK * 0.6;   // drone bounces off the hull
        c.vy -= Math.sin(ka) * CHASER_KNOCKBACK * 0.6;
        damageFlashT = Math.max(damageFlashT, 0.3 + CHASER_CONTACT_DMG / 60);
        hitPauseT = Math.max(hitPauseT, 0.05);
        spawnCombatSpark(c.x, c.y, ka, 1.2, 6, '#ff7a4a', 180);
        addTrauma(0.5);
        c.contactCd = CHASER_CONTACT_CD;
        if (c.state === 'lunge') { c.state = 'recover'; c.stateT = CHASER_LUNGE_CD; }  // a connecting dash ends it
        if (player.hull <= 0) { player.hull = 0; endGame({ type: 'combat' }); }
      }
    }
  }

  // ----- Stinger flock (third faction): Boids + seek + dive-strike -----
  function removeStinger(idx, byPlayer) {
    var s = stingers[idx];
    if (!s) return;
    combatExplosion(s.x, s.y);
    spawnCombatSpark(s.x, s.y, 0, Math.PI, 9, '#aee04a', 200);
    spawnFloater(s.x, s.y - 16, 'STINGER DOWN', '#bfe04a', true); sfxPlay('drone-down', { pan: sfxPanAt(s.x), gain: 0.7 });
    s._dead = true;
    stingers.splice(idx, 1);
    addTrauma(0.3);
    if (byPlayer) {
      combatKills++;
      hitPauseT = Math.max(hitPauseT, 0.04);
      track('stinger_killed', { kills: combatKills });
    }
  }

  // A stinger destroys an emplacement it was savaging — FX only, NO rig credit
  // (the wildlife did it). Finds the live index from the ref.
  function stingerSavageTurret(t) {
    var idx = enemyTurrets.indexOf(t);
    if (idx < 0) return;
    combatExplosion(t.x, t.y - 13);
    spawnCombatSpark(t.x, t.y - 13, -Math.PI / 2, Math.PI, 8, '#aee04a', 180);
    spawnFloater(t.x, t.y - 30, 'SAVAGED', '#bfe04a', true); sfxPlay('drone-down', { pan: sfxPanAt(t.x), gain: 0.8 });
    t._dead = true;
    enemyTurrets.splice(idx, 1);
    addTrauma(0.25);
  }
  function stingerSavageChaser(c) {
    var idx = chasers.indexOf(c);
    if (idx < 0) return;
    combatExplosion(c.x, c.y);
    spawnCombatSpark(c.x, c.y, 0, Math.PI, 8, '#aee04a', 180);
    spawnFloater(c.x, c.y - 16, 'SAVAGED', '#bfe04a', true); sfxPlay('drone-down', { pan: sfxPanAt(c.x), gain: 0.8 });
    c._dead = true;
    chasers.splice(idx, 1);
    addTrauma(0.25);
  }

  // Nearest hostile-to-stingers target (rig / turret / drone) within sense
  // range. Returns { kind, ref } or null. Only called on the retarget tick.
  function pickStingerTarget(s, pcx, pcy, playerAlive) {
    var bestKind = null, bestRef = null, bestD2 = STINGER_SENSE * STINGER_SENSE;
    if (playerAlive) {
      var pd = (pcx - s.x) * (pcx - s.x) + (pcy - s.y) * (pcy - s.y);
      if (pd < bestD2) { bestD2 = pd; bestKind = 'player'; bestRef = null; }
    }
    for (var i = 0; i < enemyTurrets.length; i++) {
      var t = enemyTurrets[i];
      var dx = t.x - s.x, dy = (t.y - 13) - s.y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestKind = 'turret'; bestRef = t; }
    }
    for (var j = 0; j < chasers.length; j++) {
      var c = chasers[j];
      var cx = c.x - s.x, cy = c.y - s.y, cd2 = cx * cx + cy * cy;
      if (cd2 < bestD2) { bestD2 = cd2; bestKind = 'chaser'; bestRef = c; }
    }
    if (!bestKind) return null;
    return { kind: bestKind, ref: bestRef };
  }

  // Stinger AI — Boids (separation + alignment + cohesion within a perception
  // radius) + a seek toward the chosen target, in the canonical Reynolds form
  // (each behavior is desired_velocity - current_velocity, then weighted).
  // Semi-implicit Euler, force AND speed capped. Dive-strikes on contact: chips
  // the rig's hull (with knockback) or an emplacement's hp (destroying it, no
  // rig credit). Leashes to the roost so the flock stays in its zone.
  function updateStingers(dt) {
    if (!stingers.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    var ceilY = SKY_ROWS * TILE - 6;
    for (var i = 0; i < stingers.length; i++) {
      var s = stingers[i];
      if (s.hitT > 0) s.hitT -= dt;
      if (s.strikeCd > 0) s.strikeCd -= dt;
      s.retargetT -= dt;
      s.flap += dt * 26;

      // Target validation + (timed) re-acquisition.
      if (s.target) {
        if (s.target.kind === 'player') { if (!playerAlive) s.target = null; }
        else if (!s.target.ref || s.target.ref._dead) s.target = null;
      }
      if (s.retargetT <= 0 || !s.target) {
        s.target = pickStingerTarget(s, pcx, pcy, playerAlive);
        s.retargetT = STINGER_RETARGET;
      }

      // Target position (or the roost when nothing's in range / leashed home).
      var tx, ty, hasTarget = !!s.target;
      if (s.target) {
        if (s.target.kind === 'player') { tx = pcx; ty = pcy; }
        else if (s.target.kind === 'turret') { tx = s.target.ref.x; ty = s.target.ref.y - 13; }
        else { tx = s.target.ref.x; ty = s.target.ref.y; }
      } else {
        tx = s.ax; ty = s.ay + Math.sin(combatClock * 1.3 + s.seed) * 8;
      }
      var rdx = s.x - s.ax, rdy = s.y - s.ay;
      if (rdx * rdx + rdy * rdy > STINGER_LEASH * STINGER_LEASH) { tx = s.ax; ty = s.ay; hasTarget = false; }

      // Boids neighbour sums (within the perception radius).
      var sepX = 0, sepY = 0, alX = 0, alY = 0, cenX = 0, cenY = 0, n = 0;
      for (var j2 = 0; j2 < stingers.length; j2++) {
        if (j2 === i) continue;
        var o = stingers[j2];
        var ox = s.x - o.x, oy = s.y - o.y, od2 = ox * ox + oy * oy;
        if (od2 > 0.01 && od2 < STINGER_NEIGHBOR * STINGER_NEIGHBOR) {
          var od = Math.sqrt(od2);
          sepX += (ox / od) * (1 - od / STINGER_NEIGHBOR);   // push away, closer = stronger
          sepY += (oy / od) * (1 - od / STINGER_NEIGHBOR);
          alX += o.vx; alY += o.vy;
          cenX += o.x; cenY += o.y;
          n++;
        }
      }

      // Seek (or roost): desired velocity toward the target, minus current.
      var dx = tx - s.x, dy = ty - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var steerX = ((dx / d) * STINGER_MAX_SPEED - s.vx) * STINGER_SEEK_W;
      var steerY = ((dy / d) * STINGER_MAX_SPEED - s.vy) * STINGER_SEEK_W;
      if (n > 0) {
        var sl = Math.sqrt(sepX * sepX + sepY * sepY);
        if (sl > 1e-4) { steerX += ((sepX / sl) * STINGER_MAX_SPEED - s.vx) * STINGER_SEP_W; steerY += ((sepY / sl) * STINGER_MAX_SPEED - s.vy) * STINGER_SEP_W; }
        alX /= n; alY /= n; var al = Math.sqrt(alX * alX + alY * alY);
        if (al > 1e-4) { steerX += ((alX / al) * STINGER_MAX_SPEED - s.vx) * STINGER_ALIGN_W; steerY += ((alY / al) * STINGER_MAX_SPEED - s.vy) * STINGER_ALIGN_W; }
        cenX = cenX / n - s.x; cenY = cenY / n - s.y; var cl = Math.sqrt(cenX * cenX + cenY * cenY);
        if (cl > 1e-4) { steerX += ((cenX / cl) * STINGER_MAX_SPEED - s.vx) * STINGER_COH_W; steerY += ((cenY / cl) * STINGER_MAX_SPEED - s.vy) * STINGER_COH_W; }
      }

      // Clamp force, integrate (semi-implicit), clamp speed, stay in open air.
      var sm = Math.sqrt(steerX * steerX + steerY * steerY);
      if (sm > STINGER_MAX_FORCE) { steerX = steerX / sm * STINGER_MAX_FORCE; steerY = steerY / sm * STINGER_MAX_FORCE; }
      s.vx += steerX * dt; s.vy += steerY * dt;
      var spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (spd > STINGER_MAX_SPEED) { s.vx = s.vx / spd * STINGER_MAX_SPEED; s.vy = s.vy / spd * STINGER_MAX_SPEED; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > ceilY) { s.y = ceilY; if (s.vy > 0) s.vy *= -0.3; }
      if (s.y < 4) { s.y = 4; if (s.vy < 0) s.vy *= -0.3; }
      if (spd > 6) s.face = Math.atan2(s.vy, s.vx);

      // Dive-strike the current target on contact.
      if (hasTarget && s.strikeCd <= 0) {
        var hdx = tx - s.x, hdy = ty - s.y;
        if (hdx * hdx + hdy * hdy < STINGER_STRIKE_R * STINGER_STRIKE_R) {
          s.strikeCd = STINGER_STRIKE_CD;
          var awy = Math.atan2(s.y - ty, s.x - tx);          // away from the target
          s.vx += Math.cos(awy) * 120; s.vy += Math.sin(awy) * 120;   // peck recoil
          spawnCombatSpark(tx, ty, awy + Math.PI, 0.9, 4, '#cdf06a', 150);
          if (s.target.kind === 'player') {
            player.hull -= STINGER_DMG_PLAYER;
            // The light glance-off-the-hull tick (SFX_BIBLE: swarm hits stay
            // small); throttled so a 6-stinger dive doesn't machine-gun it.
            if (performance.now() - stingerSfxLastMs > 90) {
              stingerSfxLastMs = performance.now();
              sfxPlay('stinger-hit');
            }
            player.vx += Math.cos(awy + Math.PI) * STINGER_KNOCKBACK;   // shove rig away from the stinger
            player.vy += Math.sin(awy + Math.PI) * STINGER_KNOCKBACK - 20;
            damageFlashT = Math.max(damageFlashT, 0.2 + STINGER_DMG_PLAYER / 70);
            hitPauseT = Math.max(hitPauseT, 0.03);
            addTrauma(0.28);
            if (player.hull <= 0) { player.hull = 0; endGame({ type: 'combat' }); }
          } else if (s.target.kind === 'turret') {
            var t2 = s.target.ref;
            t2.hp -= STINGER_DMG_ENEMY; t2.hitT = 0.1;
            if (t2.hp <= 0) { stingerSavageTurret(t2); s.target = null; }
          } else {
            var c2 = s.target.ref;
            c2.hp -= STINGER_DMG_ENEMY; c2.hitT = 0.1;
            if (c2.hp <= 0) { stingerSavageChaser(c2); s.target = null; }
          }
        }
      }
    }
  }

  // ----- Flak batteries: lead-predict, telegraph, shell flight, airburst -----
  // Predicted intercept POINT (interceptAim's quadratic, but returning the
  // point + flight time instead of just the angle): earliest positive tau with
  // |D + Vt·tau| = projSpeed·tau, burst at P + Vt·tau·leadFrac. No positive
  // root (target outrunning the shell) degrades to bursting at the target's
  // current position.
  function flakPredict(sx, sy, tx, ty, tvx, tvy, projSpeed, leadFrac) {
    var dx = tx - sx, dy = ty - sy;
    var a = tvx * tvx + tvy * tvy - projSpeed * projSpeed;
    var b = 2 * (dx * tvx + dy * tvy);
    var c = dx * dx + dy * dy;
    var tau = -1;
    if (Math.abs(a) < 1e-4) {
      if (Math.abs(b) > 1e-6) tau = -c / b;
    } else {
      var disc = b * b - 4 * a * c;
      if (disc >= 0) {
        var sq = Math.sqrt(disc);
        var t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
        var lo = (t1 > 0) ? t1 : Infinity, hi = (t2 > 0) ? t2 : Infinity;
        tau = Math.min(lo, hi);
        if (!isFinite(tau)) tau = -1;
      }
    }
    if (tau <= 0) return { x: tx, y: ty };
    var lf = (leadFrac == null) ? 1 : leadFrac;
    return { x: tx + tvx * tau * lf, y: ty + tvy * tau * lf };
  }

  // Airburst FX: a DARK smoke puff (low-heat billows read as grey-brown smoke
  // in drawExplosions) with a small hot core + a ring of sparks. Same explosion
  // entry shape combatExplosion uses, scaled to the burst radius.
  function flakAirburst(cx, cy) {
    sfxPlay('flak-burst', { pan: sfxPanAt(cx) });   // hollow whump at the burst point
    var burstR = flakTune.FLAK_BURST_R;
    var billows = [];
    for (var bi = 0; bi < 8; bi++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = Math.random() * burstR * 0.25;
      var drift = 14 + Math.random() * 26;
      billows.push({
        x: cx + Math.cos(ang) * dist,
        y: cy + Math.sin(ang) * dist,
        vx: Math.cos(ang) * drift,
        vy: Math.sin(ang) * drift - 8 - Math.random() * 14,
        r: 3 + Math.random() * 4,
        maxR: burstR * (0.18 + Math.random() * 0.14),
        delay: Math.random() * 0.08,
        heat: (bi === 0) ? 0.8 : Math.random() * 0.3,   // one hot flash, the rest dark smoke
      });
    }
    var streaks = [];
    for (var si = 0; si < 7; si++) {
      streaks.push({
        ang: Math.random() * Math.PI * 2,
        len: 10 + Math.random() * 12,
        speed: 130 + Math.random() * 130,
        dist: 0,
        width: 0.8 + Math.random() * 1.2,
        bright: 0.35 + Math.random() * 0.5,
      });
    }
    explosions.push({ cx: cx, cy: cy, r: burstR * 0.55, t: 0, life: 0.5, billows: billows, streaks: streaks, large: false });
    spawnCombatSpark(cx, cy, Math.random() * Math.PI * 2, Math.PI, 8, '#ffc24a', 190);
  }

  // One battery shot: compute the burst point, spawn the shell toward it. The
  // telegraph ring lives ON the shell (drawn at tx,ty for its whole flight).
  function flakFire(f, pcx, pcy) {
    if (flakShells.length >= FLAK_SHELLS_MAX) return;
    var bp = flakPredict(f.x, f.y - 16, pcx, pcy, player.vx, player.vy, FLAK_SHELL_SPEED, FLAK_LEAD_FRAC);
    // Never burst below the deck: the ceiling is the threat, the low lane stays honest.
    var deckY = flakDeckY();
    if (bp.y > deckY) bp.y = deckY;
    var sx = f.x, sy = f.y - 16;                  // muzzle cluster height
    var dx = bp.x - sx, dy = bp.y - sy;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    flakShells.push({
      x: sx, y: sy, sx: sx, sy: sy,
      tx: bp.x, ty: bp.y,
      vx: (dx / d) * FLAK_SHELL_SPEED,
      vy: (dy / d) * FLAK_SHELL_SPEED,
      t: 0,
      flight: d / FLAK_SHELL_SPEED,
      zone: f.zone,
      seed: Math.random() * 1000,
    });
    f.muzzleT = 0.12;
    f.cool = flakZoneRate(f.zone) * (0.9 + Math.random() * 0.2);
  }

  function updateFlak(dt) {
    if (!flakBatteries.length && !flakShells.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    var deckY = flakDeckY();

    // ---- Batteries: engage only above the deck, inside their own zone ----
    for (var i = 0; i < flakBatteries.length; i++) {
      var f = flakBatteries[i];
      if (f.muzzleT > 0) f.muzzleT -= dt;
      if (f.hitT > 0) f.hitT -= dt;
      if (f.cool > 0) f.cool -= dt;
      var engaged = playerAlive &&
                    pcy < deckY &&
                    pcx >= f.x0 && pcx < f.x1 &&
                    Math.abs(pcx - f.x) < FLAK_RANGE;
      if (engaged) {
        // Track the predicted point with the barrel cluster (visual only; the
        // shell is aimed fresh at fire time). Clamp to the upward hemisphere.
        var bp = flakPredict(f.x, f.y - 16, pcx, pcy, player.vx, player.vy, FLAK_SHELL_SPEED, FLAK_LEAD_FRAC);
        var wantA = Math.atan2(bp.y - (f.y - 16), bp.x - f.x);
        if (wantA > 0) wantA = (wantA > Math.PI / 2) ? -Math.PI + 0.001 : -0.001;
        f.ang += angDelta(f.ang, wantA) * Math.min(1, dt * 5);
        if (f.cool <= 0) flakFire(f, pcx, pcy);
      } else {
        f.ang += angDelta(f.ang, -Math.PI / 2) * Math.min(1, dt * 3);
      }
    }

    // ---- Shells: straight flight to the burst point, then airburst AOE ----
    for (var si = flakShells.length - 1; si >= 0; si--) {
      var sh = flakShells[si];
      sh.t += dt;
      if (sh.t < sh.flight) {
        sh.x = sh.sx + sh.vx * sh.t;
        sh.y = sh.sy + sh.vy * sh.t;
        continue;
      }
      // Arrived: airburst at the telegraphed point.
      flakAirburst(sh.tx, sh.ty);
      addTrauma(0.15);
      var r2 = flakTune.FLAK_BURST_R * flakTune.FLAK_BURST_R;
      if (playerAlive) {
        var pdx = pcx - sh.tx, pdy = pcy - sh.ty;
        if (pdx * pdx + pdy * pdy < r2) {
          player.hull -= flakZoneDmg(sh.zone); sfxPlay('hull-hit');
          var ka = Math.atan2(pdy, pdx);              // shove AWAY from the burst centre
          player.vx += Math.cos(ka) * 160;
          player.vy += Math.sin(ka) * 160 - 25;
          damageFlashT = Math.max(damageFlashT, 0.3 + flakZoneDmg(sh.zone) / 60);
          hitPauseT = Math.max(hitPauseT, 0.05);
          addTrauma(0.5);
          if (player.hull <= 0) { player.hull = 0; endGame({ type: 'combat' }); }
        }
      }
      // Friendly fire: chip any chaser/stinger caught in the burst.
      for (var ci = chasers.length - 1; ci >= 0; ci--) {
        var cc = chasers[ci];
        var cdx = cc.x - sh.tx, cdy = cc.y - sh.ty;
        if (cdx * cdx + cdy * cdy < r2) {
          cc.hp -= FLAK_FF_DMG; cc.hitT = 0.12;
          if (cc.hp <= 0) killChaser(cc, ci);
        }
      }
      for (var sgi = stingers.length - 1; sgi >= 0; sgi--) {
        var sg = stingers[sgi];
        var sdx = sg.x - sh.tx, sdy = sg.y - sh.ty;
        if (sdx * sdx + sdy * sdy < r2) {
          sg.hp -= FLAK_FF_DMG; sg.hitT = 0.12;
          if (sg.hp <= 0) removeStinger(sgi, false);
        }
      }
      flakShells.splice(si, 1);
    }
  }

  // ----- Sniper turrets: long laser telegraph, then a fast direct shell -----
  // The laser tracks the rig's CURRENT position the whole 0.9s lock, but the
  // shell fires at the position AT FIRE TIME with NO lead, so the counterplay
  // is simply to keep moving through the telegraph. Any altitude, 760px.
  function updateSnipers(dt) {
    if (!snipers.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    for (var i = 0; i < snipers.length; i++) {
      var t = snipers[i];
      if (t.muzzleT > 0) t.muzzleT -= dt;
      if (t.hitT > 0) t.hitT -= dt;
      if (t.cool > 0) t.cool -= dt;
      var px = t.x, py = t.y - 13;            // barrel pivot in the housing
      var dx = pcx - px, dy = pcy - py;
      var engaged = playerAlive && (dx * dx + dy * dy < SNIPER_RANGE * SNIPER_RANGE);
      if (engaged) {
        // The barrel + laser stay glued to the rig (no turn-rate cap: the
        // telegraph IS the fairness, not slow tracking).
        var wantA = Math.atan2(dy, dx);
        if (wantA > 0) wantA = (wantA > Math.PI / 2) ? -Math.PI + 0.001 : -0.001;  // never into the ground
        t.ang = wantA;
        if (t.cool <= 0) {
          t.aimT += dt;
          if (t.aimT >= SNIPER_AIM_TIME) {
            // Fire at the rig's position AT FIRE TIME (direct aim, no lead).
            var fa = Math.atan2(dy, dx);
            var tipx = px + Math.cos(fa) * SNIPER_BARREL_LEN;
            var tipy = py + Math.sin(fa) * SNIPER_BARREL_LEN;
            fireBullet(tipx, tipy, fa, SNIPER_SHELL_SPEED, nmzTune.SNIPER_DMG * nmzDmgMult(t.zone), false);
            spawnCombatSpark(tipx, tipy, fa, 0.4, 4, '#ff6a4a', 170);
            t.muzzleT = 0.12;
            t.cool = SNIPER_CD;
            t.aimT = 0;
          }
        }
      } else {
        t.aimT = Math.max(0, t.aimT - dt * 3);   // lock bleeds off fast out of range
        t.ang += angDelta(t.ang, -Math.PI / 2) * Math.min(1, dt * 3);
      }
    }
  }

  // ----- Bruiser drones: slow armored hover + 3-round bullet bursts -----
  // Reynolds seek toward the rig inside aggro (no lunge, ever), leashed to the
  // anchor like a chaser. The burst sequencer fires BRUISER_BURST_N standard
  // enemy bullets BRUISER_BURST_GAP apart, lead-aimed like a ground turret.
  function updateBruisers(dt) {
    if (!bruisers.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    var ceilY = SKY_ROWS * TILE - 10;
    for (var i = 0; i < bruisers.length; i++) {
      var c = bruisers[i];
      if (c.hitT > 0) c.hitT -= dt;
      if (c.cool > 0) c.cool -= dt;

      var toPx = pcx - c.x, toPy = pcy - c.y;
      var distP = Math.sqrt(toPx * toPx + toPy * toPy) || 0.0001;
      var fax = c.x - c.ax, fay = c.y - c.ay;
      var leashed = (fax * fax + fay * fay) > BRUISER_LEASH * BRUISER_LEASH;
      var pursuing = playerAlive && distP < BRUISER_AGGRO && !leashed;

      // Steering: amble toward the rig (or bob at the anchor) + separation.
      var tx, ty;
      if (pursuing) { tx = pcx; ty = pcy; }
      else { tx = c.ax; ty = c.ay + Math.sin(combatClock * 1.1 + c.seed) * BRUISER_BOB; }
      var dx = tx - c.x, dy = ty - c.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var steerX = (dx / d) * BRUISER_MAX_SPEED - c.vx;
      var steerY = (dy / d) * BRUISER_MAX_SPEED - c.vy;
      for (var j = 0; j < bruisers.length; j++) {
        if (j === i) continue;
        var o = bruisers[j];
        var sx = c.x - o.x, sy = c.y - o.y;
        var sd2 = sx * sx + sy * sy;
        if (sd2 > 0.01 && sd2 < BRUISER_SEP_R * BRUISER_SEP_R) {
          var sd = Math.sqrt(sd2);
          var w = (1 - sd / BRUISER_SEP_R) * BRUISER_MAX_FORCE;
          steerX += (sx / sd) * w; steerY += (sy / sd) * w;
        }
      }
      var sm = Math.sqrt(steerX * steerX + steerY * steerY);
      if (sm > BRUISER_MAX_FORCE) { steerX = steerX / sm * BRUISER_MAX_FORCE; steerY = steerY / sm * BRUISER_MAX_FORCE; }
      c.vx += steerX * dt; c.vy += steerY * dt;
      var spd = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      if (spd > BRUISER_MAX_SPEED) { c.vx = c.vx / spd * BRUISER_MAX_SPEED; c.vy = c.vy / spd * BRUISER_MAX_SPEED; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y > ceilY) { c.y = ceilY; if (c.vy > 0) c.vy *= -0.3; }
      if (c.y < 4) { c.y = 4; if (c.vy < 0) c.vy *= -0.3; }
      if (spd > 4) c.face = Math.atan2(c.vy, c.vx);

      // Burst gun: start a burst off cooldown inside range; then walk the
      // sequencer regardless of pursuit (a started burst finishes).
      if (pursuing) c.gunAng = Math.atan2(toPy, toPx);
      if (pursuing && c.cool <= 0 && c.burstN <= 0) {
        c.burstN = BRUISER_BURST_N;
        c.burstT = 0;                                // first round leaves now
        c.cool = BRUISER_BURST_CD;
      }
      if (c.burstN > 0 && playerAlive) {
        c.burstT -= dt;
        if (c.burstT <= 0) {
          var fa = interceptAim(c.x, c.y, pcx, pcy, player.vx, player.vy, ENEMY_BULLET_SPEED, ENEMY_LEAD_FRAC) + (Math.random() * 2 - 1) * 0.07;
          c.gunAng = fa;
          var gx = c.x + Math.cos(fa) * 12, gy = c.y + Math.sin(fa) * 12;
          fireBullet(gx, gy, fa, ENEMY_BULLET_SPEED, ENEMY_BULLET_DMG * nmzDmgMult(c.zone), false);
          spawnCombatSpark(gx, gy, fa, 0.5, 2, '#ffb060', 140);
          c.burstN--;
          c.burstT = BRUISER_BURST_GAP;
        }
      }
    }
  }

  // ----- Interceptor pairs: the high-altitude answer -----
  // Per-zone dwell timers decide the scramble: nmzAboveT[z] accumulates only
  // while the rig is above the flak deck INSIDE zone z (anything else resets
  // it); nmzBelowT[z] is the complement, and 4s of it sends a live pair away.
  // Spawn: a pair at screen-edge altitude flanking the rig, max one pair per
  // zone alive (hunting OR leaving). Shot-down pairs can re-scramble; the
  // dwell clock restarts from the spawn.
  function updateInterceptors(dt) {
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    var deckY = flakDeckY();

    // ---- Dwell bookkeeping ----
    var rg = (typeof regionAt === 'function') ? regionAt(Math.floor(pcx / TILE)) : null;
    var curZone = (playerAlive && rg && rg.kind === REGION_NOMANS && pcy < deckY) ? nmzZoneNumber(rg) : 0;
    var zoneCount = nmzZoneCount();
    for (var z = 1; z <= zoneCount; z++) {
      if (z === curZone) {
        nmzAboveT[z] = (nmzAboveT[z] || 0) + dt;
        nmzBelowT[z] = 0;
      } else {
        nmzAboveT[z] = 0;
        nmzBelowT[z] = (nmzBelowT[z] || 0) + dt;
      }
    }

    // ---- Scramble a pair? ----
    if (curZone > 0) {
      var trigger = (curZone >= 3) ? INTERCEPTOR_TRIGGER_T_Z3 : INTERCEPTOR_TRIGGER_T;
      var pairAlive = false;
      for (var li = 0; li < interceptors.length; li++) {
        if (interceptors[li].zone === curZone) { pairAlive = true; break; }
      }
      if (!pairAlive && nmzAboveT[curZone] >= trigger) {
        for (var side = 0; side < 2; side++) {
          var sx = pcx + (side === 0 ? -1 : 1) * (screenW * 0.5 + 60);
          var sy = Math.max(30, pcy - 50 + (Math.random() * 2 - 1) * 40);
          interceptors.push({
            x: sx, y: sy,
            vx: (side === 0 ? 1 : -1) * nmzTune.INTERCEPTOR_SPEED * 0.7, vy: 0,
            zone: curZone,
            hp: INTERCEPTOR_HP, maxHp: INTERCEPTOR_HP,
            hitT: 0, contactCd: 0,
            state: 'hunt',
            face: side === 0 ? 0 : Math.PI,
            seed: Math.random() * 1000,
          });
        }
        nmzAboveT[curZone] = 0;        // re-arm the dwell clock
      }
    }

    if (!interceptors.length) return;
    var ceilY = SKY_ROWS * TILE - 8;
    for (var i = interceptors.length - 1; i >= 0; i--) {
      var c = interceptors[i];
      if (c.hitT > 0) c.hitT -= dt;
      if (c.contactCd > 0) c.contactCd -= dt;

      // 4s of the rig staying off this zone's high band -> break off upward.
      if (c.state === 'hunt' && (!playerAlive || (nmzBelowT[c.zone] || 0) >= INTERCEPTOR_RELAX_T)) {
        c.state = 'leave';
      }

      var maxSpd = nmzTune.INTERCEPTOR_SPEED;
      var tx, ty;
      if (c.state === 'leave') { tx = c.x; ty = -500; }    // climb out of the world
      else { tx = pcx; ty = pcy; }
      var dx = tx - c.x, dy = ty - c.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var steerX = (dx / d) * maxSpd - c.vx;
      var steerY = (dy / d) * maxSpd - c.vy;
      // Separation between the pair so they bracket instead of stacking.
      for (var j = 0; j < interceptors.length; j++) {
        if (j === i) continue;
        var o = interceptors[j];
        var sx2 = c.x - o.x, sy2 = c.y - o.y;
        var sd2 = sx2 * sx2 + sy2 * sy2;
        if (sd2 > 0.01 && sd2 < INTERCEPTOR_SEP_R * INTERCEPTOR_SEP_R) {
          var sd = Math.sqrt(sd2);
          var w = (1 - sd / INTERCEPTOR_SEP_R) * INTERCEPTOR_FORCE * 0.6;
          steerX += (sx2 / sd) * w; steerY += (sy2 / sd) * w;
        }
      }
      var sm2 = Math.sqrt(steerX * steerX + steerY * steerY);
      if (sm2 > INTERCEPTOR_FORCE) { steerX = steerX / sm2 * INTERCEPTOR_FORCE; steerY = steerY / sm2 * INTERCEPTOR_FORCE; }
      c.vx += steerX * dt; c.vy += steerY * dt;
      var spd = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      if (spd > maxSpd) { c.vx = c.vx / spd * maxSpd; c.vy = c.vy / spd * maxSpd; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y > ceilY) { c.y = ceilY; if (c.vy > 0) c.vy *= -0.3; }
      if (spd > 6) c.face = Math.atan2(c.vy, c.vx);

      // Departed: gone for good once it clears the top of the world.
      if (c.state === 'leave' && c.y < -260) { interceptors.splice(i, 1); continue; }

      // Ram contact (hunting only): damage + mutual knockback, like a chaser.
      if (c.state === 'hunt' && playerAlive && c.contactCd <= 0) {
        var pdx = pcx - c.x, pdy = pcy - c.y;
        if (pdx * pdx + pdy * pdy < INTERCEPTOR_CONTACT_R * INTERCEPTOR_CONTACT_R) {
          player.hull -= INTERCEPTOR_CONTACT_DMG; sfxPlay('hull-hit');
          var ka = Math.atan2(pdy, pdx);
          player.vx += Math.cos(ka) * INTERCEPTOR_KNOCKBACK;
          player.vy += Math.sin(ka) * INTERCEPTOR_KNOCKBACK - 40;
          c.vx -= Math.cos(ka) * INTERCEPTOR_KNOCKBACK * 0.5;
          c.vy -= Math.sin(ka) * INTERCEPTOR_KNOCKBACK * 0.5;
          damageFlashT = Math.max(damageFlashT, 0.3 + INTERCEPTOR_CONTACT_DMG / 60);
          hitPauseT = Math.max(hitPauseT, 0.05);
          spawnCombatSpark(c.x, c.y, ka, 1.2, 7, '#ff7a4a', 200);
          addTrauma(0.55);
          c.contactCd = INTERCEPTOR_CONTACT_CD;
          if (player.hull <= 0) { player.hull = 0; endGame({ type: 'combat' }); }
        }
      }
    }
  }

  // ----- Gatekeeper bosses: slow twin-cannon volleys + a missile every 6s -----
  function updateBosses(dt) {
    if (!bosses.length) return;
    var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;
    for (var i = 0; i < bosses.length; i++) {
      var b = bosses[i];
      if (b.muzzleT > 0) b.muzzleT -= dt;
      if (b.hitT > 0) b.hitT -= dt;
      if (b.cool > 0) b.cool -= dt;
      if (b.missileCd > 0) b.missileCd -= dt;
      var px = b.x, py = b.y - 40;            // twin-cannon pivot, high on the hull
      var dx = pcx - px, dy = pcy - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var engaged = playerAlive && dist < BOSS_RANGE;
      if (engaged) {
        // Slow tracking; flanking fast beats its swing.
        var wantA = Math.atan2(dy, dx);
        if (wantA > 0) wantA = (wantA > Math.PI / 2) ? -Math.PI + 0.001 : -0.001;
        var da = angDelta(b.ang, wantA);
        var step = BOSS_TURN_RATE * dt;
        b.ang += Math.abs(da) < step ? da : (da > 0 ? step : -step);
        // Volley sequencer: 3 shells, alternating barrels, slight spread.
        if (b.volleyN > 0) {
          b.volleyT -= dt;
          if (b.volleyT <= 0) {
            var off = (b.volleyN % 2 === 0) ? 4 : -4;     // alternate the twin barrels
            var fa = interceptAim(px, py, pcx, pcy, player.vx, player.vy, ENEMY_BULLET_SPEED, ENEMY_LEAD_FRAC) + (Math.random() * 2 - 1) * 0.06;
            var bx = px + Math.cos(fa) * 24 - Math.sin(fa) * off;
            var by = py + Math.sin(fa) * 24 + Math.cos(fa) * off;
            fireBullet(bx, by, fa, ENEMY_BULLET_SPEED, BOSS_BULLET_DMG * nmzDmgMult(b.zone), false);
            spawnCombatSpark(bx, by, fa, 0.5, 3, '#ffb060', 160);
            b.muzzleT = 0.1;
            b.volleyN--;
            b.volleyT = BOSS_VOLLEY_GAP;
          }
        } else if (b.cool <= 0) {
          b.volleyN = BOSS_VOLLEY_N;
          b.volleyT = 0;                                  // first shell leaves now
          b.cool = BOSS_VOLLEY_CD;
        }
        // Missile rack: one homing missile every BOSS_MISSILE_CD while engaged.
        if (b.missileCd <= 0) {
          var ma = Math.atan2(dy, dx);
          spawnMissile(px + Math.cos(ma) * 16, py - 10, ma);
          spawnCombatSpark(px, py - 10, ma, 0.5, 5, '#ffe080', 130);
          b.missileCd = BOSS_MISSILE_CD;
        }
      } else {
        b.ang += angDelta(b.ang, -Math.PI / 2) * Math.min(1, dt * 2);
        b.volleyN = 0;
      }
    }
  }

  // ----- Obstacle collision: solid AABB, slide-along (min-translation-vector) -----
  // Runs after the rig's own movement (update() ran first this frame): push the
  // rig out of any overlapped obstacle along the least-penetration axis and kill
  // the velocity INTO that face, so it slides along the surface instead of
  // stopping dead. A hard slam adds sparks + a little shake (dmg is opt-in).
  function updateObstacleCollision() {
    if (!obstacles.length || !player) return;
    var pw = PLAYER_W, ph = PLAYER_H;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var px = player.x, py = player.y;
      if (o.x > px + pw + 24 || o.x + o.w < px - 24) continue;
      if (o.y > py + ph + 24 || o.y + o.h < py - 24) continue;
      if (px + pw <= o.x || px >= o.x + o.w || py + ph <= o.y || py >= o.y + o.h) continue;
      var penL = (px + pw) - o.x, penR = (o.x + o.w) - px;
      var penU = (py + ph) - o.y, penD = (o.y + o.h) - py;
      var minX = penL < penR ? penL : penR;
      var minY = penU < penD ? penU : penD;
      if (minX <= minY) {
        var intoX = 0;
        if (penL < penR) { player.x -= penL; if (player.vx > 0) { intoX = player.vx; player.vx = 0; } }
        else { player.x += penR; if (player.vx < 0) { intoX = -player.vx; player.vx = 0; } }
        obstacleImpact(intoX, (penL < penR) ? o.x : o.x + o.w, py + ph * 0.5);
      } else {
        var intoY = 0;
        if (penU < penD) { player.y -= penU; if (player.vy > 0) { intoY = player.vy; player.vy = 0; } }
        else { player.y += penD; if (player.vy < 0) { intoY = -player.vy; player.vy = 0; } }
        obstacleImpact(intoY, px + pw * 0.5, (penU < penD) ? o.y : o.y + o.h);
      }
    }
  }
  function obstacleImpact(speed, hx, hy) {
    if (speed < OBSTACLE_HARD_HIT) return;
    spawnCombatSpark(hx, hy, Math.random() * Math.PI * 2, Math.PI, 5, '#cdb38c', 110);
    // World clang at the impact point on any hard hit; the rig-side crunch
    // (hull-hit, below) only when damage actually lands. Same frame (§2.10).
    sfxPlay('obstacle-hit', { pan: sfxPanAt(hx), gain: Math.min(1, 0.5 + speed / 700) });
    addTrauma(Math.min(0.4, 0.1 + speed / 1500));
    hitPauseT = Math.max(hitPauseT, 0.03);
    if (OBSTACLE_IMPACT_DMG > 0 && player.hull != null && player.hull > 0) {
      player.hull -= OBSTACLE_IMPACT_DMG;
      sfxPlay('hull-hit');
      damageFlashT = Math.max(damageFlashT, 0.2);
      if (player.hull <= 0) { player.hull = 0; endGame({ type: 'crash' }); }
    }
  }

  // ----- Update -----
  function updateCombat(dt) {
    if (!ENABLE_COMBAT) return;   // combat disabled: inert no-op
    // Freeze with the rest of the world (mirror update()'s own guards).
    if (gameOver || gameWon || shopOpen) return;
    if (UI_NEW && typeof shopState !== 'undefined' && shopState !== 'closed') return;
    if (hitPauseT > 0) return;
    if (!player || player.hull == null) return;
    if (dt > 0.05) dt = 0.05;
    combatClock += dt;
    if (combatTrauma > 0) combatTrauma = Math.max(0, combatTrauma - dt / COMBAT_SHAKE_DECAY);

    // Resolve the rig against any zone obstacles first (it moved this frame in update()).
    updateObstacleCollision();

    var groundY = SKY_ROWS * TILE;
    var pcx = player.x + PLAYER_W / 2;
    var pcy = player.y + PLAYER_H / 2;
    var playerAlive = player.hull > 0;

    // ---- Rig auto-turret: acquire nearest enemy in range, swivel, fire ----
    var mx = pcx, my = pcy - 7;              // mount just above the rig's middle
    var best = null, bestD2 = PLAYER_RANGE * PLAYER_RANGE, bestCX = 0, bestCY = 0, bestVX = 0, bestVY = 0;
    for (var ei = 0; ei < enemyTurrets.length; ei++) {
      var et = enemyTurrets[ei];
      var ecx = et.x, ecy = et.y - 13;
      var ddx = ecx - mx, ddy = ecy - my;
      var d2 = ddx * ddx + ddy * ddy;
      if (d2 < bestD2) { bestD2 = d2; best = et; bestCX = ecx; bestCY = ecy; bestVX = 0; bestVY = 0; }
    }
    for (var ci2 = 0; ci2 < chasers.length; ci2++) {
      var ctg = chasers[ci2];
      var cdx0 = ctg.x - mx, cdy0 = ctg.y - my;
      var cd0 = cdx0 * cdx0 + cdy0 * cdy0;
      if (cd0 < bestD2) { bestD2 = cd0; best = ctg; bestCX = ctg.x; bestCY = ctg.y; bestVX = ctg.vx; bestVY = ctg.vy; }
    }
    for (var si2 = 0; si2 < stingers.length; si2++) {
      var stg = stingers[si2];
      var sdx0 = stg.x - mx, sdy0 = stg.y - my;
      var sd0 = sdx0 * sdx0 + sdy0 * sdy0;
      if (sd0 < bestD2) { bestD2 = sd0; best = stg; bestCX = stg.x; bestCY = stg.y; bestVX = stg.vx; bestVY = stg.vy; }
    }
    for (var fi2 = 0; fi2 < flakBatteries.length; fi2++) {
      var ftg = flakBatteries[fi2];
      var fcx = ftg.x, fcy = ftg.y - 14;
      var fdx0 = fcx - mx, fdy0 = fcy - my;
      var fd0 = fdx0 * fdx0 + fdy0 * fdy0;
      if (fd0 < bestD2) { bestD2 = fd0; best = ftg; bestCX = fcx; bestCY = fcy; bestVX = 0; bestVY = 0; }
    }
    for (var ni2 = 0; ni2 < snipers.length; ni2++) {
      var ntg = snipers[ni2];
      var ncx = ntg.x, ncy = ntg.y - 13;
      var ndx0 = ncx - mx, ndy0 = ncy - my;
      var nd0 = ndx0 * ndx0 + ndy0 * ndy0;
      if (nd0 < bestD2) { bestD2 = nd0; best = ntg; bestCX = ncx; bestCY = ncy; bestVX = 0; bestVY = 0; }
    }
    for (var bi2 = 0; bi2 < bruisers.length; bi2++) {
      var btg = bruisers[bi2];
      var bdx0 = btg.x - mx, bdy0 = btg.y - my;
      var bd0 = bdx0 * bdx0 + bdy0 * bdy0;
      if (bd0 < bestD2) { bestD2 = bd0; best = btg; bestCX = btg.x; bestCY = btg.y; bestVX = btg.vx; bestVY = btg.vy; }
    }
    for (var ii2 = 0; ii2 < interceptors.length; ii2++) {
      var itg = interceptors[ii2];
      var idx0 = itg.x - mx, idy0 = itg.y - my;
      var id0 = idx0 * idx0 + idy0 * idy0;
      if (id0 < bestD2) { bestD2 = id0; best = itg; bestCX = itg.x; bestCY = itg.y; bestVX = itg.vx; bestVY = itg.vy; }
    }
    for (var gi2 = 0; gi2 < bosses.length; gi2++) {
      var gtg = bosses[gi2];
      var gcx = gtg.x, gcy = gtg.y - 34;     // hull centre, not the base
      var gdx0 = gcx - mx, gdy0 = gcy - my;
      var gd0 = gdx0 * gdx0 + gdy0 * gdy0;
      if (gd0 < bestD2) { bestD2 = gd0; best = gtg; bestCX = gcx; bestCY = gcy; bestVX = 0; bestVY = 0; }
    }
    rigTurret.target = best;
    if (rigTurret.cool > 0) rigTurret.cool -= dt;
    if (rigTurret.muzzleT > 0) rigTurret.muzzleT -= dt;
    if (best && playerAlive) {
      rigTurret.deploy = Math.min(1, rigTurret.deploy + dt / 0.12);   // pop the turret out of the hull
      // Lead a moving target (a drone); a static turret has v=0, so this is a
      // direct aim. The barrel tracks the predicted point, and the shot fires
      // along it (below), so the auto-turret connects on movers.
      var want = interceptAim(mx, my, bestCX, bestCY, bestVX, bestVY, PLAYER_BULLET_SPEED, RIG_LEAD_FRAC);
      var dA = angDelta(rigTurret.ang, want);
      var maxStep = PLAYER_TURN_RATE * dt;
      rigTurret.ang += Math.abs(dA) < maxStep ? dA : (dA > 0 ? maxStep : -maxStep);
      if (rigTurret.cool <= 0 && Math.abs(dA) < PLAYER_AIM_TOL) {
        // Fire TRUE at the target along `want` (the barrel visual may still be
        // swinging into line). An auto-turret that only fired when the barrel
        // was exactly aligned would miss a small target at range — the whole
        // point is that it tags turrets as you fly past.
        var rtx = mx + Math.cos(want) * RIG_BARREL_LEN;
        var rty = my + Math.sin(want) * RIG_BARREL_LEN;
        fireBullet(rtx, rty, want, PLAYER_BULLET_SPEED, PLAYER_BULLET_DMG, true);
        spawnCombatSpark(rtx, rty, want, 0.4, 2, '#bdfaff', 120);
        rigTurret.cool = PLAYER_FIRE_CD;
        rigTurret.muzzleT = 0.08;
      }
    } else {
      rigTurret.deploy = Math.max(0, rigTurret.deploy - dt / 0.22);   // retract back into the hull when idle
      // Idle: ease the barrel toward "forward + slightly up" in the facing dir.
      var idle = player.dir < 0 ? -Math.PI * 0.75 : -Math.PI * 0.25;
      rigTurret.ang += angDelta(rigTurret.ang, idle) * Math.min(1, dt * 4);
    }

    // ---- Enemy turrets: detect -> swivel -> charge -> fire ----
    for (var ti = 0; ti < enemyTurrets.length; ti++) {
      var t = enemyTurrets[ti];
      if (t.muzzleT > 0) t.muzzleT -= dt;
      if (t.hitT > 0) t.hitT -= dt;
      var px = t.x, py = t.y - 13;          // barrel pivot in the housing
      var dx = pcx - px, dy = pcy - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var engaged = playerAlive && dist < ENEMY_RANGE;
      if (engaged) {
        var wantA = Math.atan2(dy, dx);
        if (wantA > 0) wantA = (wantA > Math.PI / 2) ? -Math.PI + 0.001 : -0.001;  // never aim into the ground
        var da = angDelta(t.ang, wantA);
        var step = ENEMY_TURN_RATE * dt;
        t.ang += Math.abs(da) < step ? da : (da > 0 ? step : -step);
        var aimed = Math.abs(da) < ENEMY_AIM_TOL;
        if (t.cool > 0) { t.cool -= dt; t.charge = 0; }
        else if (aimed) {
          t.charge += dt;
          var chargeNeed = t.missile ? MISSILE_CHARGE : ENEMY_CHARGE;
          if (t.charge >= chargeNeed) {
            if (t.missile) {
              // Launch a homing missile straight off the barrel; pursuit takes
              // over after the arming window (a slow, scary, readable tell).
              var ma = Math.atan2(dy, dx);
              var mtx = px + Math.cos(ma) * TURRET_BARREL_LEN;
              var mty = py + Math.sin(ma) * TURRET_BARREL_LEN;
              spawnMissile(mtx, mty, ma);
              spawnCombatSpark(mtx, mty, ma, 0.5, 5, '#ffe080', 130);
              t.muzzleT = 0.18;
              t.cool = MISSILE_CD * (0.85 + Math.random() * 0.3);
            } else {
              // Lead the moving rig (quadratic intercept, partially) + a little
              // spread, so the slow shell arrives where the rig is GOING, not
              // where it was — threatening but still dodgeable by juking.
              var fa = interceptAim(px, py, pcx, pcy, player.vx, player.vy, ENEMY_BULLET_SPEED, ENEMY_LEAD_FRAC) + (Math.random() * 2 - 1) * 0.09;
              var tipx = px + Math.cos(fa) * TURRET_BARREL_LEN;
              var tipy = py + Math.sin(fa) * TURRET_BARREL_LEN;
              fireBullet(tipx, tipy, fa, ENEMY_BULLET_SPEED, ENEMY_BULLET_DMG * nmzDmgMult(t.zone || 1), false);
              spawnCombatSpark(tipx, tipy, fa, 0.5, 3, '#ffb060', 150);
              t.muzzleT = 0.1;
              t.cool = ENEMY_FIRE_CD * (0.8 + Math.random() * 0.4);
            }
            t.charge = 0;
          }
        } else {
          t.charge = 0;
        }
      } else {
        // Out of range: relax the barrel back toward vertical.
        t.ang += angDelta(t.ang, -Math.PI / 2) * Math.min(1, dt * 3);
        t.charge = 0;
        if (t.cool > 0) t.cool -= dt;
      }
    }

    // ---- Flying chaser drones (steering + ram) ----
    updateChasers(dt);

    // ---- Homing missiles (capped-turn pursuit) ----
    updateMissiles(dt);

    // ---- Feral stinger flock (Boids + dive-strike; attacks everyone) ----
    updateStingers(dt);

    // ---- Flak batteries + airburst shells (the anti-air ceiling) ----
    updateFlak(dt);

    // ---- Sniper emplacements (laser telegraph, any-altitude shot) ----
    updateSnipers(dt);

    // ---- Bruiser drones (slow armor, 3-round bursts) ----
    updateBruisers(dt);

    // ---- Interceptor pairs (the high-altitude answer; spawns dynamically) ----
    updateInterceptors(dt);

    // ---- Gatekeeper bosses (twin-cannon volleys + missiles at each exit) ----
    updateBosses(dt);

    // ---- Bullets: integrate, then resolve hits ----
    for (var bi = bullets.length - 1; bi >= 0; bi--) {
      var b = bullets[bi];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      var dead = false;
      if (b.life <= 0) dead = true;
      // Hit the ground plane (turrets + the rig both live above it).
      else if (b.y >= groundY) {
        spawnCombatSpark(b.x, groundY, -Math.PI / 2, 1.0, 3, b.friendly ? '#bdfaff' : '#ffb060', 90);
        dead = true;
      } else if (b.x < 0 || b.x > COLS * TILE || b.y < -400) {
        dead = true;
      } else if (b.friendly) {
        for (var ki = 0; ki < enemyTurrets.length; ki++) {
          var ek = enemyTurrets[ki];
          var ex = ek.x, ey = ek.y - 13;
          var hdx = b.x - ex, hdy = b.y - ey;
          if (hdx * hdx + hdy * hdy < TURRET_HIT_R * TURRET_HIT_R) {
            ek.hp -= b.dmg;
            ek.hitT = 0.12;
            spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#fff2c0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
            if (ek.hp <= 0) killTurret(ek, ki);
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (var kc = 0; kc < chasers.length; kc++) {
            var ec = chasers[kc];
            var cdx1 = b.x - ec.x, cdy1 = b.y - ec.y;
            if (cdx1 * cdx1 + cdy1 * cdy1 < CHASER_HIT_R * CHASER_HIT_R) {
              ec.hp -= b.dmg;
              ec.hitT = 0.12;
              // Bullet impulse shoves the drone (physics feedback you can read).
              var bsp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
              ec.vx += (b.vx / bsp) * 70;
              ec.vy += (b.vy / bsp) * 70;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#fff2c0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (ec.hp <= 0) killChaser(ec, kc);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (var kf = 0; kf < flakBatteries.length; kf++) {
            var ef = flakBatteries[kf];
            var fdx1 = b.x - ef.x, fdy1 = b.y - (ef.y - 14);
            if (fdx1 * fdx1 + fdy1 * fdy1 < FLAK_HIT_R * FLAK_HIT_R) {
              ef.hp -= b.dmg;
              ef.hitT = 0.12;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#ffe9b0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (ef.hp <= 0) killFlak(ef, kf);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (var ks = 0; ks < stingers.length; ks++) {
            var es = stingers[ks];
            var sdx1 = b.x - es.x, sdy1 = b.y - es.y;
            if (sdx1 * sdx1 + sdy1 * sdy1 < STINGER_HIT_R * STINGER_HIT_R) {
              es.hp -= b.dmg;
              es.hitT = 0.12;
              var bsp2 = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
              es.vx += (b.vx / bsp2) * 80;
              es.vy += (b.vy / bsp2) * 80;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#e8ffb0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (es.hp <= 0) removeStinger(ks, true);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (var kn = 0; kn < snipers.length; kn++) {
            var en = snipers[kn];
            var ndx1 = b.x - en.x, ndy1 = b.y - (en.y - 13);
            if (ndx1 * ndx1 + ndy1 * ndy1 < SNIPER_HIT_R * SNIPER_HIT_R) {
              en.hp -= b.dmg;
              en.hitT = 0.12;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#fff2c0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (en.hp <= 0) killSniper(en, kn);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (var kb = 0; kb < bruisers.length; kb++) {
            var eb = bruisers[kb];
            var bdx1 = b.x - eb.x, bdy1 = b.y - eb.y;
            if (bdx1 * bdx1 + bdy1 * bdy1 < BRUISER_HIT_R * BRUISER_HIT_R) {
              eb.hp -= b.dmg;
              eb.hitT = 0.12;
              // Heavy slab: a token shove, far less than a chaser takes.
              var bsp3 = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
              eb.vx += (b.vx / bsp3) * 20;
              eb.vy += (b.vy / bsp3) * 20;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#fff2c0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (eb.hp <= 0) killBruiser(eb, kb);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (var kp = 0; kp < interceptors.length; kp++) {
            var ep = interceptors[kp];
            var pdx1 = b.x - ep.x, pdy1 = b.y - ep.y;
            if (pdx1 * pdx1 + pdy1 * pdy1 < INTERCEPTOR_HIT_R * INTERCEPTOR_HIT_R) {
              ep.hp -= b.dmg;
              ep.hitT = 0.12;
              var bsp4 = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
              ep.vx += (b.vx / bsp4) * 70;
              ep.vy += (b.vy / bsp4) * 70;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#fff2c0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (ep.hp <= 0) killInterceptor(ep, kp);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (var kg = 0; kg < bosses.length; kg++) {
            var eg = bosses[kg];
            var gdx1 = b.x - eg.x, gdy1 = b.y - (eg.y - 34);
            if (gdx1 * gdx1 + gdy1 * gdy1 < BOSS_HIT_R * BOSS_HIT_R) {
              eg.hp -= b.dmg;
              eg.hitT = 0.12;
              spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.0, 4, '#fff2c0', 160); sfxPlay('enemy-hit', { pan: sfxPanAt(b.x) });
              if (eg.hp <= 0) killBoss(eg, kg);
              dead = true;
              break;
            }
          }
        }
      } else {
        // Enemy bullet vs the rig AABB.
        if (playerAlive &&
            b.x > player.x && b.x < player.x + PLAYER_W &&
            b.y > player.y && b.y < player.y + PLAYER_H) {
          player.hull -= b.dmg; sfxPlay('hull-hit');
          spawnCombatSpark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.2, 5, '#ff7a4a', 150);
          damageFlashT = Math.max(damageFlashT, 0.22 + b.dmg / 60);
          hitPauseT = Math.max(hitPauseT, 0.03);
          addTrauma(0.3);
          // Gentle directional impulse along the bullet's travel — nudges the
          // rig without fighting precise flight (the ram knocks harder).
          var bs2 = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
          var kb = 55 + b.dmg * 6;
          player.vx += (b.vx / bs2) * kb;
          player.vy += (b.vy / bs2) * kb - 18;
          dead = true;
          if (player.hull <= 0) { player.hull = 0; endGame({ type: 'combat' }); }
        }
      }
      if (dead) bullets.splice(bi, 1);
    }

    // ---- Sparks ----
    for (var si = combatSparks.length - 1; si >= 0; si--) {
      var s = combatSparks[si];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 240 * dt;          // light gravity
      s.vx *= 0.92;
      s.life -= dt;
      if (s.life <= 0) combatSparks.splice(si, 1);
    }
  }

  // ----- Render -----
  // Called from render() AFTER drawPlayer(), inside the world-space transform
  // (so we draw at raw world coords). Turrets are culled to the view; the rig
  // turret + bullets + sparks always draw (cheap, and always on screen-ish).
  function drawCombat() {
    if (!ENABLE_COMBAT) return;   // combat disabled: draw nothing
    if (!enemyTurrets.length && !chasers.length && !stingers.length && !missiles.length && !obstacles.length && !bullets.length && !combatSparks.length && !flakBatteries.length && !flakShells.length && !snipers.length && !bruisers.length && !interceptors.length && !bosses.length) return;
    var viewL = cam.x - 60, viewR = cam.x + screenW + 60;

    // ---- Fly-through obstacles (solid wreckage; drawn first = enemies/bullets pass in front) ----
    for (var oi = 0; oi < obstacles.length; oi++) {
      var ob = obstacles[oi];
      if (ob.x + ob.w < viewL || ob.x > viewR) continue;
      drawObstacle(ob);
    }

    // ---- Enemy ground turrets ----
    for (var ti = 0; ti < enemyTurrets.length; ti++) {
      var t = enemyTurrets[ti];
      if (t.x < viewL || t.x > viewR) continue;
      drawEnemyTurret(t);
    }

    // ---- Flak batteries (anti-air ceiling emplacements) ----
    for (var fbi = 0; fbi < flakBatteries.length; fbi++) {
      var fb = flakBatteries[fbi];
      if (fb.x < viewL || fb.x > viewR) continue;
      drawFlakBattery(fb);
    }

    // ---- Sniper emplacements (wide cull: the laser reaches 760px, so the
    // telegraph must draw even while the mount is just off-screen) ----
    for (var sni = 0; sni < snipers.length; sni++) {
      var sn = snipers[sni];
      if (sn.x < viewL - SNIPER_RANGE || sn.x > viewR + SNIPER_RANGE) continue;
      drawSniper(sn);
    }

    // ---- Gatekeeper bosses (big silhouette; cull with extra margin) ----
    for (var gbi = 0; gbi < bosses.length; gbi++) {
      var gb = bosses[gbi];
      if (gb.x < viewL - 60 || gb.x > viewR + 60) continue;
      drawBoss(gb);
    }

    // ---- Bruiser drones (slow armor) ----
    for (var bri = 0; bri < bruisers.length; bri++) {
      var br = bruisers[bri];
      if (br.x < viewL || br.x > viewR) continue;
      drawBruiser(br);
    }

    // ---- Interceptor pair (high-altitude darts) ----
    for (var ipi = 0; ipi < interceptors.length; ipi++) {
      var ip = interceptors[ipi];
      if (ip.x < viewL || ip.x > viewR) continue;
      drawInterceptor(ip);
    }

    // ---- Flying chaser drones ----
    for (var di = 0; di < chasers.length; di++) {
      var cd = chasers[di];
      if (cd.x < viewL || cd.x > viewR) continue;
      drawChaser(cd);
    }

    // ---- Feral stinger swarm (third faction) ----
    for (var sdi = 0; sdi < stingers.length; sdi++) {
      var sd = stingers[sdi];
      if (sd.x < viewL || sd.x > viewR) continue;
      drawStinger(sd);
    }

    // ---- Rig auto-turret (mounted on the miner) ----
    if (player && player.hull > 0) drawRigTurret();

    // ---- Bullets ----
    for (var bi = 0; bi < bullets.length; bi++) drawBullet(bullets[bi]);

    // ---- Homing missiles (in front, they're the headline threat) ----
    for (var mi = 0; mi < missiles.length; mi++) {
      var mm = missiles[mi];
      if (mm.x < viewL || mm.x > viewR) continue;
      drawMissile(mm);
    }

    // ---- Flak shells + their burst-point telegraph rings ----
    for (var fsi = 0; fsi < flakShells.length; fsi++) {
      var fs = flakShells[fsi];
      // Cull on the tracer AND the telegraph separately: the ring must stay
      // visible (it is the dodge cue) even when the shell is still off-screen.
      if (fs.x >= viewL && fs.x <= viewR) drawFlakShell(fs);
      if (fs.tx >= viewL && fs.tx <= viewR) drawFlakTelegraph(fs);
    }

    // ---- Sparks ----
    if (combatSparks.length) {
      for (var si = 0; si < combatSparks.length; si++) {
        var s = combatSparks[si];
        var a = Math.max(0, s.life / s.maxLife);
        ctx.fillStyle = s.col;
        ctx.globalAlpha = a;
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemyTurret(t) {
    var baseY = t.y;                 // surface
    var pivX = t.x, pivY = t.y - 13; // housing centre
    var outline = '#1a0a05';

    // Barrel (drawn first so the housing overlaps its root).
    ctx.save();
    ctx.translate(pivX, pivY);
    ctx.rotate(t.ang);
    ctx.fillStyle = outline;
    ctx.fillRect(-1, -4, TURRET_BARREL_LEN + 3, 8);   // outline pass
    ctx.fillStyle = '#4a443c';
    ctx.fillRect(0, -2.5, TURRET_BARREL_LEN, 5);
    ctx.fillStyle = '#6b6258';
    ctx.fillRect(0, -2.5, TURRET_BARREL_LEN, 1.4);     // top highlight
    // Muzzle charge/flash glow at the tip (amber + longer for a missile turret).
    var chargeDenom = t.missile ? MISSILE_CHARGE : ENEMY_CHARGE;
    var glow = Math.max(t.muzzleT > 0 ? 1 : 0, t.charge > 0 ? t.charge / chargeDenom : 0);
    if (glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, glow);
      var gr = ctx.createRadialGradient(TURRET_BARREL_LEN + 1, 0, 0, TURRET_BARREL_LEN + 1, 0, 7);
      if (t.missile) { gr.addColorStop(0, '#fff0b0'); gr.addColorStop(0.5, 'rgba(255,200,40,0.7)'); gr.addColorStop(1, 'rgba(255,150,20,0)'); }
      else { gr.addColorStop(0, '#ffd9a0'); gr.addColorStop(0.5, 'rgba(255,120,40,0.7)'); gr.addColorStop(1, 'rgba(255,80,20,0)'); }
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(TURRET_BARREL_LEN + 1, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // Base — riveted iron trapezoid sitting on the ground.
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(pivX - 11, baseY);
    ctx.lineTo(pivX + 11, baseY);
    ctx.lineTo(pivX + 8, baseY - 9);
    ctx.lineTo(pivX - 8, baseY - 9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#37322c';
    ctx.beginPath();
    ctx.moveTo(pivX - 9.5, baseY - 0.5);
    ctx.lineTo(pivX + 9.5, baseY - 0.5);
    ctx.lineTo(pivX + 6.8, baseY - 8);
    ctx.lineTo(pivX - 6.8, baseY - 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4c453d';
    ctx.fillRect(pivX - 7, baseY - 8, 14, 1.5);        // top edge highlight
    ctx.fillStyle = '#211712';
    ctx.fillRect(pivX - 5, baseY - 5, 1.5, 1.5);        // rivets
    ctx.fillRect(pivX + 3.5, baseY - 5, 1.5, 1.5);

    // Housing — round-ish iron dome with the enemy red accent.
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(pivX, pivY, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f3933';
    ctx.beginPath(); ctx.arc(pivX, pivY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#534b42';
    ctx.beginPath(); ctx.arc(pivX - 1.5, pivY - 1.8, 3, 0, Math.PI * 2); ctx.fill();  // top sheen
    // Red threat band + a blinking eye LED.
    ctx.fillStyle = '#b53420';
    ctx.fillRect(pivX - 6.5, pivY + 2.2, 13, 2.2);
    var blink = 0.55 + 0.45 * Math.sin((timeOfDay * 30 + t.seed) * 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * blink;
    ctx.fillStyle = '#ff4a2a';
    ctx.beginPath(); ctx.arc(pivX, pivY - 0.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Missile launchers wear an amber pod marker so the elite threat reads.
    if (t.missile) {
      ctx.fillStyle = outline;
      ctx.fillRect(pivX - 5, pivY - 11, 10, 5);
      ctx.fillStyle = '#caa23a';
      ctx.fillRect(pivX - 4, pivY - 10, 8, 3);
      ctx.fillStyle = outline;
      ctx.fillRect(pivX - 3, pivY - 9.5, 1.4, 1.4);
      ctx.fillRect(pivX + 1.6, pivY - 9.5, 1.4, 1.4);
    }

    // Damage tint as it loses HP, plus a white flash on the hit frame.
    if (t.hp < t.maxHp) {
      ctx.globalAlpha = (1 - t.hp / t.maxHp) * 0.35;
      ctx.fillStyle = '#120904';
      ctx.beginPath(); ctx.arc(pivX, pivY, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (t.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, t.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pivX, pivY, 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Flak battery: a quad-barrel anti-air mount angled upward. Frontier-Soviet
  // like drawEnemyTurret (riveted dark steel, hard outline) but visually
  // distinct: wider stepped base, FOUR parallel barrels off one cradle, and
  // caution-gold accents (chevron band + blinking lamp) instead of the ground
  // turret's red. Roughly 34px tall, well under the 40px ceiling.
  function drawFlakBattery(f) {
    var baseY = f.y;                  // surface
    var pivX = f.x, pivY = f.y - 16;  // cradle pivot
    var outline = '#1a0a05';

    // Barrel cluster (drawn first so the cradle overlaps the roots): four
    // tubes splayed off the pivot, all along the aim angle.
    var bl = 16;                      // barrel length
    ctx.save();
    ctx.translate(pivX, pivY);
    ctx.rotate(f.ang);
    var offs = [-5.4, -1.8, 1.8, 5.4];
    ctx.fillStyle = outline;          // outline pass
    for (var oi = 0; oi < 4; oi++) ctx.fillRect(-1, offs[oi] - 1.7, bl + 2, 3.4);
    ctx.fillStyle = '#4a443c';        // steel tubes
    for (var bi2 = 0; bi2 < 4; bi2++) ctx.fillRect(0, offs[bi2] - 1, bl, 2);
    ctx.fillStyle = '#6b6258';        // top highlight on each tube
    for (var hi2 = 0; hi2 < 4; hi2++) ctx.fillRect(0, offs[hi2] - 1, bl, 0.7);
    ctx.fillStyle = '#caa23a';        // caution-gold muzzle collars
    for (var mi2 = 0; mi2 < 4; mi2++) ctx.fillRect(bl - 2.5, offs[mi2] - 1.3, 1.6, 2.6);
    // Muzzle flash across the cluster when a shell leaves.
    if (f.muzzleT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, f.muzzleT / 0.12);
      var gr = ctx.createRadialGradient(bl + 1, 0, 0, bl + 1, 0, 9);
      gr.addColorStop(0, '#fff4c8'); gr.addColorStop(0.5, 'rgba(255,200,70,0.7)'); gr.addColorStop(1, 'rgba(255,150,30,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(bl + 1, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // Base: wide riveted iron plinth, two steps (reads heavier than a turret).
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(pivX - 15, baseY);
    ctx.lineTo(pivX + 15, baseY);
    ctx.lineTo(pivX + 11, baseY - 11);
    ctx.lineTo(pivX - 11, baseY - 11);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#37322c';
    ctx.beginPath();
    ctx.moveTo(pivX - 13.5, baseY - 0.5);
    ctx.lineTo(pivX + 13.5, baseY - 0.5);
    ctx.lineTo(pivX + 9.8, baseY - 10);
    ctx.lineTo(pivX - 9.8, baseY - 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4c453d';
    ctx.fillRect(pivX - 10, baseY - 10, 20, 1.5);       // top edge highlight
    // Caution-gold chevron band across the plinth (the anti-air warning livery).
    ctx.fillStyle = '#caa23a';
    ctx.fillRect(pivX - 9, baseY - 5.5, 4.5, 2.2);
    ctx.fillRect(pivX - 2.2, baseY - 5.5, 4.5, 2.2);
    ctx.fillRect(pivX + 4.6, baseY - 5.5, 4.5, 2.2);
    ctx.fillStyle = '#211712';
    ctx.fillRect(pivX - 7.5, baseY - 8.5, 1.5, 1.5);    // rivets
    ctx.fillRect(pivX + 6, baseY - 8.5, 1.5, 1.5);

    // Cradle: boxy mount the barrels swivel on (squarer than the turret dome).
    ctx.fillStyle = outline;
    ctx.fillRect(pivX - 8, pivY - 6.5, 16, 13);
    ctx.fillStyle = '#3f3933';
    ctx.fillRect(pivX - 6.8, pivY - 5.2, 13.6, 10.4);
    ctx.fillStyle = '#534b42';
    ctx.fillRect(pivX - 6.8, pivY - 5.2, 13.6, 2);      // top sheen
    // Blinking caution-gold ranging lamp.
    var blink = 0.55 + 0.45 * Math.sin((timeOfDay * 30 + f.seed) * 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * blink;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(pivX, pivY - 0.5, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Damage tint as it loses HP, plus a white flash on the hit frame.
    if (f.hp < f.maxHp) {
      ctx.globalAlpha = (1 - f.hp / f.maxHp) * 0.35;
      ctx.fillStyle = '#120904';
      ctx.fillRect(pivX - 6.8, pivY - 5.2, 13.6, 10.4);
      ctx.globalAlpha = 1;
    }
    if (f.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, f.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.fillRect(pivX - 8, pivY - 6.5, 16, 13);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // In-flight flak shell: a thin caution-amber tracer (smaller + warmer than a
  // bullet so it reads as ordnance climbing, not gunfire).
  function drawFlakShell(sh) {
    var ux = sh.vx / FLAK_SHELL_SPEED, uy = sh.vy / FLAK_SHELL_SPEED;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,190,70,0.8)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sh.x - ux * 12, sh.y - uy * 12); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    ctx.strokeStyle = '#fff0c8';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sh.x - ux * 5, sh.y - uy * 5); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    ctx.fillStyle = '#fff0c8';
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
  }

  // Burst-point telegraph: a thin caution-gold ring at the airburst point,
  // blinking faster as the shell closes, with an inner ring SHRINKING from the
  // full AOE down to zero over the flight (a readable countdown). Painted at
  // fire time by construction: the ring exists exactly while its shell flies.
  function drawFlakTelegraph(sh) {
    var prog = sh.flight > 0 ? Math.min(1, sh.t / sh.flight) : 1;
    var R = flakTune.FLAK_BURST_R;
    var blink = 0.5 + 0.5 * Math.sin(combatClock * (10 + prog * 18) + sh.seed);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Outer ring: the AOE edge (what to be outside of).
    ctx.globalAlpha = 0.22 + 0.3 * blink;
    ctx.strokeStyle = '#ffc24a';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(sh.tx, sh.ty, R, 0, Math.PI * 2); ctx.stroke();
    // Inner countdown ring shrinks to the centre as the shell arrives.
    ctx.globalAlpha = 0.3 + 0.35 * blink;
    ctx.beginPath(); ctx.arc(sh.tx, sh.ty, Math.max(1.5, R * (1 - prog)), 0, Math.PI * 2); ctx.stroke();
    // Centre tick.
    ctx.globalAlpha = 0.5 + 0.4 * blink;
    ctx.fillStyle = '#ffc24a';
    ctx.fillRect(sh.tx - 1, sh.ty - 1, 2, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Sniper emplacement: same riveted-iron family as drawEnemyTurret but a
  // DISTINCT silhouette: a low wide base, a narrow tall housing, and one
  // LONG thin barrel with a muzzle brake + scope nub. The aim telegraph is a
  // thin red laser from the muzzle to the rig's CURRENT position, brightening
  // over the 0.9s lock (the dodge cue: it follows you; the shot won't).
  function drawSniper(t) {
    var baseY = t.y;
    var pivX = t.x, pivY = t.y - 13;
    var outline = '#1a0a05';

    // Laser telegraph (drawn first, under the hardware).
    if (t.aimT > 0 && player && player.hull > 0) {
      var lockT = Math.min(1, t.aimT / SNIPER_AIM_TIME);
      var lpx = player.x + PLAYER_W / 2, lpy = player.y + PLAYER_H / 2;
      var mzx = pivX + Math.cos(t.ang) * SNIPER_BARREL_LEN;
      var mzy = pivY + Math.sin(t.ang) * SNIPER_BARREL_LEN;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + 0.55 * lockT;            // brightens toward the shot
      ctx.strokeStyle = '#ff3a2a';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mzx, mzy); ctx.lineTo(lpx, lpy); ctx.stroke();
      // Hot core near full lock + a dot on the rig.
      if (lockT > 0.6) {
        ctx.globalAlpha = (lockT - 0.6) * 1.8;
        ctx.strokeStyle = '#ffd0c0';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(mzx, mzy); ctx.lineTo(lpx, lpy); ctx.stroke();
        ctx.fillStyle = '#ff5a3a';
        ctx.beginPath(); ctx.arc(lpx, lpy, 1.6 + lockT, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Long barrel (drawn before the housing so the root is overlapped).
    ctx.save();
    ctx.translate(pivX, pivY);
    ctx.rotate(t.ang);
    ctx.fillStyle = outline;
    ctx.fillRect(-1, -2.6, SNIPER_BARREL_LEN + 3, 5.2);   // outline pass
    ctx.fillStyle = '#4a443c';
    ctx.fillRect(0, -1.5, SNIPER_BARREL_LEN, 3);
    ctx.fillStyle = '#6b6258';
    ctx.fillRect(0, -1.5, SNIPER_BARREL_LEN, 1);          // top highlight
    ctx.fillStyle = outline;                              // muzzle brake notches
    ctx.fillRect(SNIPER_BARREL_LEN - 4, -2.6, 1.6, 5.2);
    ctx.fillRect(SNIPER_BARREL_LEN - 7, -2.6, 1.6, 5.2);
    if (t.muzzleT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, t.muzzleT / 0.12);
      var gr = ctx.createRadialGradient(SNIPER_BARREL_LEN + 1, 0, 0, SNIPER_BARREL_LEN + 1, 0, 8);
      gr.addColorStop(0, '#ffd9c0'); gr.addColorStop(0.5, 'rgba(255,90,40,0.7)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(SNIPER_BARREL_LEN + 1, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // Base: LOW and WIDE (flatter than a turret's trapezoid, dug in).
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(pivX - 13, baseY);
    ctx.lineTo(pivX + 13, baseY);
    ctx.lineTo(pivX + 10, baseY - 6);
    ctx.lineTo(pivX - 10, baseY - 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#37322c';
    ctx.beginPath();
    ctx.moveTo(pivX - 11.5, baseY - 0.5);
    ctx.lineTo(pivX + 11.5, baseY - 0.5);
    ctx.lineTo(pivX + 8.8, baseY - 5);
    ctx.lineTo(pivX - 8.8, baseY - 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#211712';
    ctx.fillRect(pivX - 6, baseY - 3.5, 1.5, 1.5);        // rivets
    ctx.fillRect(pivX + 4.5, baseY - 3.5, 1.5, 1.5);

    // Housing: a NARROW upright box (taller + slimmer than the turret dome).
    ctx.fillStyle = outline;
    ctx.fillRect(pivX - 5, pivY - 7, 10, 14);
    ctx.fillStyle = '#3f3933';
    ctx.fillRect(pivX - 3.8, pivY - 5.8, 7.6, 11.6);
    ctx.fillStyle = '#534b42';
    ctx.fillRect(pivX - 3.8, pivY - 5.8, 7.6, 1.8);       // top sheen
    // Scope nub riding the housing top + the red optic glow.
    ctx.fillStyle = outline;
    ctx.fillRect(pivX - 2, pivY - 10, 4, 4);
    var lk = Math.min(1, t.aimT / SNIPER_AIM_TIME);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + 0.6 * lk;
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath(); ctx.arc(pivX, pivY - 8, 1.3 + lk, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // Red threat band, same family marker as the ground turret.
    ctx.fillStyle = '#b53420';
    ctx.fillRect(pivX - 3.8, pivY + 3.2, 7.6, 2);

    // Damage tint + white hit flash.
    if (t.hp < t.maxHp) {
      ctx.globalAlpha = (1 - t.hp / t.maxHp) * 0.35;
      ctx.fillStyle = '#120904';
      ctx.fillRect(pivX - 3.8, pivY - 5.8, 7.6, 11.6);
      ctx.globalAlpha = 1;
    }
    if (t.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, t.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.fillRect(pivX - 5, pivY - 7, 10, 14);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Bruiser: a chunky riveted hover SLAB, visibly armored where the chaser is
  // sleek. Boxy plated hull, twin under-thrusters, a stubby gun nub tracking
  // the rig, and the red threat band across the bow.
  function drawBruiser(c) {
    var dir = Math.cos(c.face) >= 0 ? 1 : -1;
    var outline = '#160a06';
    ctx.save();
    ctx.translate(c.x, c.y);

    // Twin thruster underglow (additive), slow flicker; it labors, not zips.
    var fl = 0.5 + 0.5 * Math.sin(combatClock * 9 + c.seed);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 + 0.18 * fl;
    var ug = ctx.createRadialGradient(-6, 8, 0, -6, 8, 7);
    ug.addColorStop(0, 'rgba(255,140,60,0.8)'); ug.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = ug;
    ctx.beginPath(); ctx.arc(-6, 8, 7, 0, Math.PI * 2); ctx.fill();
    var ug2 = ctx.createRadialGradient(6, 8, 0, 6, 8, 7);
    ug2.addColorStop(0, 'rgba(255,140,60,0.8)'); ug2.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = ug2;
    ctx.beginPath(); ctx.arc(6, 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Gun nub tracking the rig (under the hull plate).
    ctx.save();
    ctx.rotate(c.gunAng);
    ctx.fillStyle = outline;
    ctx.fillRect(-1, -2, 13, 4);
    ctx.fillStyle = '#4a443c';
    ctx.fillRect(0, -1.2, 11, 2.4);
    ctx.restore();

    // Hull: outlined armored slab with plate seams + rivets.
    ctx.fillStyle = outline;
    ctx.fillRect(-11.5, -7.5, 23, 15);
    ctx.fillStyle = '#37322c';
    ctx.fillRect(-10, -6, 20, 12);
    ctx.fillStyle = '#4c453d';
    ctx.fillRect(-10, -6, 20, 2.4);                       // top sheen
    ctx.fillStyle = '#211712';
    ctx.fillRect(-3, -6, 1.4, 12);                        // plate seam
    ctx.fillRect(4.5, -6, 1.4, 12);
    ctx.fillRect(-8, -4, 1.5, 1.5);                       // rivets
    ctx.fillRect(-8, 2.5, 1.5, 1.5);
    ctx.fillRect(7, -4, 1.5, 1.5);
    ctx.fillRect(7, 2.5, 1.5, 1.5);
    // Red threat band across the bow (mirrors with facing).
    ctx.fillStyle = '#b53420';
    ctx.fillRect(dir > 0 ? 6.5 : -10, -1.2, 3.5, 2.4);
    // Slow red sensor lamp.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * (0.55 + 0.45 * Math.sin(combatClock * 4 + c.seed));
    ctx.fillStyle = '#ff4a2a';
    ctx.beginPath(); ctx.arc(dir > 0 ? 8.2 : -8.2, 0, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Damage tint + white hit flash.
    if (c.hp < c.maxHp) {
      ctx.globalAlpha = (1 - c.hp / c.maxHp) * 0.4;
      ctx.fillStyle = '#100704';
      ctx.fillRect(-10, -6, 20, 12);
      ctx.globalAlpha = 1;
    }
    if (c.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, c.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-11.5, -7.5, 23, 15);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // Interceptor: a sleek DART. Long thin outlined fuselage, swept fins, and a
  // hard afterburner flame (it reads fast even in a still). Noses along its
  // velocity, so the pair visibly slashes at the rig.
  function drawInterceptor(c) {
    var head = c.face;
    var outline = '#160a06';
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(head);

    // Afterburner flame behind the tail (additive, flickering, long).
    var fl = 0.6 + 0.4 * Math.sin(combatClock * 34 + c.seed);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    var fg = ctx.createRadialGradient(-10, 0, 0, -10, 0, 9 + fl * 4);
    fg.addColorStop(0, '#fff4d0'); fg.addColorStop(0.35, 'rgba(255,170,50,0.85)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(-10, 0, 9 + fl * 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Swept fins (drawn first so the fuselage overlaps the roots).
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(-10, -6.5); ctx.lineTo(-6.5, -0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, 1); ctx.lineTo(-10, 6.5); ctx.lineTo(-6.5, 0.5); ctx.closePath(); ctx.fill();

    // Fuselage: long thin dart, outlined, steel core, red nose tip.
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-9, -3.2); ctx.lineTo(-9, 3.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a342e';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7.5, -2.2); ctx.lineTo(-7.5, 2.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#534b42';
    ctx.beginPath(); ctx.moveTo(8, -0.3); ctx.lineTo(-7, -1.9); ctx.lineTo(-7, -0.6); ctx.closePath(); ctx.fill();  // top sheen
    ctx.fillStyle = '#c43a22';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(5.5, -1.7); ctx.lineTo(5.5, 1.7); ctx.closePath(); ctx.fill();

    // Red sensor glow at the nose.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(combatClock * 8 + c.seed);
    ctx.fillStyle = '#ff4a2a';
    ctx.beginPath(); ctx.arc(8, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Damage tint + white hit flash.
    if (c.hp < c.maxHp) {
      ctx.globalAlpha = (1 - c.hp / c.maxHp) * 0.4;
      ctx.fillStyle = '#100704';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7.5, -2.2); ctx.lineTo(-7.5, 2.2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (c.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, c.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-9, -3.2); ctx.lineTo(-9, 3.2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // Gatekeeper boss: a grounded armored gunship/walker ~3x turret scale.
  // Frontier-Soviet: riveted hull plates, red star emblem, caution chevrons,
  // twin barrels on a slow cradle, idle smokestack puffs (simple animated
  // rectangles). It parks at the zone exit and never moves.
  function drawBoss(b) {
    var baseY = b.y;
    var cx = b.x;
    var pivX = b.x, pivY = b.y - 40;     // twin-cannon cradle pivot
    var outline = '#1a0a05';

    // Idle smokestack puffs FIRST (behind the hull): three grey rectangles
    // cycling up from the stack, fading as they rise.
    var stX = cx - 22, stTop = baseY - 58;
    for (var pk = 0; pk < 3; pk++) {
      var pt = ((combatClock * 0.45 + pk / 3 + b.seed * 0.01) % 1);
      ctx.globalAlpha = (1 - pt) * 0.3;
      ctx.fillStyle = '#6b6258';
      var ps = 3 + pt * 4;
      ctx.fillRect(stX - ps / 2 + Math.sin((combatClock + pk) * 1.3) * 2, stTop - 6 - pt * 20, ps, ps * 0.8);
    }
    ctx.globalAlpha = 1;

    // Walker legs: two angled armored skids planted on the surface.
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(cx - 32, baseY); ctx.lineTo(cx - 16, baseY); ctx.lineTo(cx - 12, baseY - 14); ctx.lineTo(cx - 24, baseY - 14);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 16, baseY); ctx.lineTo(cx + 32, baseY); ctx.lineTo(cx + 24, baseY - 14); ctx.lineTo(cx + 12, baseY - 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#37322c';
    ctx.beginPath();
    ctx.moveTo(cx - 30, baseY - 0.5); ctx.lineTo(cx - 17.5, baseY - 0.5); ctx.lineTo(cx - 14, baseY - 12.5); ctx.lineTo(cx - 22.5, baseY - 12.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 17.5, baseY - 0.5); ctx.lineTo(cx + 30, baseY - 0.5); ctx.lineTo(cx + 22.5, baseY - 12.5); ctx.lineTo(cx + 14, baseY - 12.5);
    ctx.closePath(); ctx.fill();

    // Main hull: a big outlined armored block with stepped plating.
    ctx.fillStyle = outline;
    ctx.fillRect(cx - 28, baseY - 36, 56, 24);
    ctx.fillStyle = '#37322c';
    ctx.fillRect(cx - 26, baseY - 34, 52, 20);
    ctx.fillStyle = '#4c453d';
    ctx.fillRect(cx - 26, baseY - 34, 52, 3);            // top edge highlight
    ctx.fillStyle = '#211712';                            // plate seams + rivets
    ctx.fillRect(cx - 10, baseY - 34, 1.8, 20);
    ctx.fillRect(cx + 8, baseY - 34, 1.8, 20);
    ctx.fillRect(cx - 22, baseY - 30, 1.8, 1.8);
    ctx.fillRect(cx - 22, baseY - 19, 1.8, 1.8);
    ctx.fillRect(cx + 20, baseY - 30, 1.8, 1.8);
    ctx.fillRect(cx + 20, baseY - 19, 1.8, 1.8);
    // Caution chevrons along the hull skirt.
    ctx.fillStyle = '#caa23a';
    ctx.fillRect(cx - 24, baseY - 17.5, 6, 2.6);
    ctx.fillRect(cx - 14, baseY - 17.5, 6, 2.6);
    ctx.fillRect(cx - 4, baseY - 17.5, 6, 2.6);
    ctx.fillRect(cx + 6, baseY - 17.5, 6, 2.6);
    ctx.fillRect(cx + 16, baseY - 17.5, 6, 2.6);
    // Red star emblem, centred on the hull.
    ctx.fillStyle = '#b53420';
    ctx.save();
    ctx.translate(cx, baseY - 26);
    ctx.beginPath();
    for (var st = 0; st < 5; st++) {
      var oa = -Math.PI / 2 + st * (Math.PI * 2 / 5);
      var ia = oa + Math.PI / 5;
      if (st === 0) ctx.moveTo(Math.cos(oa) * 5.5, Math.sin(oa) * 5.5);
      else ctx.lineTo(Math.cos(oa) * 5.5, Math.sin(oa) * 5.5);
      ctx.lineTo(Math.cos(ia) * 2.3, Math.sin(ia) * 2.3);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // Smokestack (rear, feeds the idle puffs above).
    ctx.fillStyle = outline;
    ctx.fillRect(stX - 4, stTop, 8, 24);
    ctx.fillStyle = '#3f3933';
    ctx.fillRect(stX - 2.8, stTop + 1, 5.6, 22);
    ctx.fillStyle = '#211712';
    ctx.fillRect(stX - 2.8, stTop + 4, 5.6, 1.6);        // stack band

    // Upper casemate the cannons swivel on.
    ctx.fillStyle = outline;
    ctx.fillRect(cx - 14, baseY - 50, 28, 16);
    ctx.fillStyle = '#3f3933';
    ctx.fillRect(cx - 12.5, baseY - 48.5, 25, 13);
    ctx.fillStyle = '#534b42';
    ctx.fillRect(cx - 12.5, baseY - 48.5, 25, 2.6);      // top sheen
    // Ranging lamp, slow red blink.
    var blink = 0.55 + 0.45 * Math.sin((timeOfDay * 30 + b.seed) * 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * blink;
    ctx.fillStyle = '#ff4a2a';
    ctx.beginPath(); ctx.arc(cx, baseY - 46, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Twin barrels off the cradle pivot (over the casemate).
    ctx.save();
    ctx.translate(pivX, pivY);
    ctx.rotate(b.ang);
    var offs = [-4, 4];
    ctx.fillStyle = outline;
    for (var ob2 = 0; ob2 < 2; ob2++) ctx.fillRect(-1, offs[ob2] - 2.4, 27, 4.8);
    ctx.fillStyle = '#4a443c';
    for (var sb2 = 0; sb2 < 2; sb2++) ctx.fillRect(0, offs[sb2] - 1.4, 25, 2.8);
    ctx.fillStyle = '#6b6258';
    for (var hb2 = 0; hb2 < 2; hb2++) ctx.fillRect(0, offs[hb2] - 1.4, 25, 1);
    if (b.muzzleT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, b.muzzleT / 0.1);
      var gr2 = ctx.createRadialGradient(26, 0, 0, 26, 0, 11);
      gr2.addColorStop(0, '#fff0c8'); gr2.addColorStop(0.5, 'rgba(255,160,50,0.7)'); gr2.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = gr2;
      ctx.beginPath(); ctx.arc(26, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // Damage tint deepens as it loses HP, plus the white hit flash.
    if (b.hp < b.maxHp) {
      ctx.globalAlpha = (1 - b.hp / b.maxHp) * 0.35;
      ctx.fillStyle = '#120904';
      ctx.fillRect(cx - 26, baseY - 48.5, 52, 34.5);
      ctx.globalAlpha = 1;
    }
    if (b.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, b.hitT / 0.12) * 0.8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 28, baseY - 50, 56, 38);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawChaser(c) {
    var dir = Math.cos(c.face) >= 0 ? 1 : -1;
    // Bank with vertical velocity so it noses up climbing / down diving.
    var bank = Math.max(-0.4, Math.min(0.4, c.vy / 300)) * dir;
    var outline = '#160a06';
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(bank);
    ctx.scale(dir, 1);                 // mirror to face travel direction

    // Thruster underglow (additive), flickering.
    var fl = 0.5 + 0.5 * Math.sin(combatClock * 22 + c.seed);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32 + 0.24 * fl;
    var ug = ctx.createRadialGradient(0, 6, 0, 0, 6, 9);
    ug.addColorStop(0, 'rgba(255,140,60,0.8)'); ug.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = ug;
    ctx.beginPath(); ctx.arc(0, 6, 9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Side fins (drawn first so the hull overlaps their roots).
    ctx.fillStyle = outline;
    ctx.fillRect(-2.2, -8, 1.7, 5);
    ctx.fillRect(0.6, -8, 1.7, 5);

    // Hull — outlined dark lozenge with a top sheen.
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a342e';
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c453d';
    ctx.beginPath(); ctx.ellipse(-1.5, -1.4, 3.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();

    // Red sensor eye at the nose; flares + swells as it winds up to dash (the tell).
    var eyeX = 5.6;
    var tell = (c.state === 'windup') ? (1 - Math.max(0, c.stateT) / CHASER_WINDUP)
             : (c.state === 'lunge') ? 1 : 0;
    var pulse = 0.6 + 0.4 * Math.sin(combatClock * 6 + c.seed);
    var eyeR = 4 + tell * 3.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.7 + 0.3 * pulse) * (0.85 + 0.45 * tell);
    var eg = ctx.createRadialGradient(eyeX, 0, 0, eyeX, 0, eyeR);
    eg.addColorStop(0, '#fff0e0'); eg.addColorStop(0.4, 'rgba(255,60,30,0.9)'); eg.addColorStop(1, 'rgba(255,40,20,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(eyeX, 0, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Damage tint + white hit flash.
    if (c.hp < c.maxHp) {
      ctx.globalAlpha = (1 - c.hp / c.maxHp) * 0.4;
      ctx.fillStyle = '#100704';
      ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (c.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, c.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  function drawStinger(s) {
    var dir = Math.cos(s.face) >= 0 ? 1 : -1;
    var bank = Math.max(-0.5, Math.min(0.5, s.vy / 280)) * dir;
    var outline = '#0e1a06';
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(bank);
    ctx.scale(dir, 1);

    // Wings — two pairs, fast flap (vertical squash via sin), translucent.
    var fl = Math.sin(s.flap);
    var span = 7 + 2 * Math.abs(fl), wy = 1.5 * fl;
    ctx.fillStyle = '#cdf06a';
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(-2, -wy - 2, 5, span * 0.7, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-2, wy + 2, 5, span * 0.7, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.62;
    ctx.beginPath(); ctx.ellipse(1, -wy - 2.5, 6, span, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1, wy + 2.5, 6, span, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Body — segmented chitin abdomen + thorax, outlined, with venom stripes.
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.ellipse(-1, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c3a14';
    ctx.beginPath(); ctx.ellipse(-1, 0, 6.6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9ec53a';
    ctx.fillRect(-5, -2.6, 1.6, 5.2);
    ctx.fillRect(-1.6, -2.8, 1.6, 5.6);
    // Stinger tail (rear) + head (front).
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.moveTo(-8, -1.5); ctx.lineTo(-12, 0); ctx.lineTo(-8, 1.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(6, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a4a18';
    ctx.beginPath(); ctx.arc(6, 0, 2, 0, Math.PI * 2); ctx.fill();
    // Eye glow (venom green), pulsing.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(combatClock * 7 + s.seed);
    ctx.fillStyle = '#d6ff5a';
    ctx.beginPath(); ctx.arc(6.4, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Damage tint + white hit flash.
    if (s.hp < s.maxHp) {
      ctx.globalAlpha = (1 - s.hp / s.maxHp) * 0.4;
      ctx.fillStyle = '#0a0f04';
      ctx.beginPath(); ctx.ellipse(-1, 0, 6.6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (s.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, s.hitT / 0.12);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-1, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  function drawObstacle(o) {
    var outline = '#140d08';
    if (o.kind === 'spire') {
      var cx = o.x + o.w / 2, topW = o.w * 0.5;
      ctx.fillStyle = outline;                       // tapered silhouette
      ctx.beginPath();
      ctx.moveTo(o.x - 1, o.y + o.h); ctx.lineTo(o.x + o.w + 1, o.y + o.h);
      ctx.lineTo(cx + topW / 2 + 1, o.y - 1); ctx.lineTo(cx - topW / 2 - 1, o.y - 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a322a';                     // body
      ctx.beginPath();
      ctx.moveTo(o.x + 1, o.y + o.h); ctx.lineTo(o.x + o.w - 1, o.y + o.h);
      ctx.lineTo(cx + topW / 2, o.y + 1); ctx.lineTo(cx - topW / 2, o.y + 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4f463a';                     // left-lit edge
      ctx.beginPath();
      ctx.moveTo(o.x + 2, o.y + o.h); ctx.lineTo(o.x + 5.5, o.y + o.h);
      ctx.lineTo(cx - topW / 2 + 3, o.y + 2); ctx.lineTo(cx - topW / 2, o.y + 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#231a13';                     // riveted bands across the taper
      var bands = Math.max(2, Math.floor(o.h / 48));
      for (var b = 1; b <= bands; b++) {
        var f = b / (bands + 1), by = o.y + o.h * f, hw = (topW + (o.w - topW) * f) / 2;
        ctx.fillRect(cx - hw, by, hw * 2, 2.5);
      }
    } else {
      ctx.fillStyle = outline;                       // floating chunk
      ctx.fillRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
      ctx.fillStyle = '#3a322a';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#4f463a';                     // top sheen
      ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h * 0.32);
      ctx.fillStyle = '#231a13';                     // underside shadow + a crack
      ctx.fillRect(o.x + 2, o.y + o.h - 4, o.w - 4, 2.5);
      ctx.fillRect(o.x + o.w * 0.42, o.y + 3, 1.5, o.h - 6);
    }
  }

  function drawRigTurret() {
    var d = rigTurret.deploy || 0;
    if (d <= 0.02) return;                       // stowed inside the hull when not firing

    // Mount the turret in the rig BODY frame: replicate drawPlayer's transform
    // (renderX/Y + bodyTiltRender rotated around its pivot) so it rides the
    // banking chassis instead of floating at a fixed screen offset. Top-centre
    // mount is mirror-invariant, so facing direction needs no special-casing.
    var rx = (player.renderX != null ? player.renderX : player.x);
    var ry = (player.renderY != null ? player.renderY : player.y);
    var bt = player.bodyTiltRender || 0;
    var pvx = PLAYER_W * 0.5, pvy = PLAYER_H * 0.56;   // drawPlayer's rotate pivot
    var localX = PLAYER_W * 0.5;                       // rig spine, centred
    var localY = 2 - d * 6;                            // pops up out of the hull as it deploys
    var ox = localX - pvx, oy = localY - pvy;
    var cos = Math.cos(bt), sin = Math.sin(bt);
    var mx = rx + pvx + (ox * cos - oy * sin);
    var my = ry + pvy + (ox * sin + oy * cos);

    var sc = 0.5 + 0.5 * d;                            // grows in as it pops out (and stays tiny)
    var bl = RIG_BARREL_LEN * sc;
    var outline = '#0a1416';

    // Barrel — swivels to the world aim (rigTurret.ang), independent of the chassis.
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(rigTurret.ang);
    ctx.fillStyle = outline;
    ctx.fillRect(-0.6, -1.5, bl + 1.2, 3);
    ctx.fillStyle = '#3c5a60';
    ctx.fillRect(0, -0.9, bl, 1.8);
    ctx.fillStyle = '#8fdfe8';
    ctx.fillRect(0, -0.9, bl, 0.6);
    if (rigTurret.muzzleT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, rigTurret.muzzleT / 0.08);
      var gr = ctx.createRadialGradient(bl, 0, 0, bl, 0, 3.4);
      gr.addColorStop(0, '#eaffff'); gr.addColorStop(0.5, 'rgba(110,230,255,0.7)'); gr.addColorStop(1, 'rgba(60,180,220,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(bl, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // Housing — a tiny cyan nub that banks with the chassis (rotate by bodyTilt).
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(bt);
    var hr = 2.7 * sc;
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(0, 0, hr + 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c4348';
    ctx.beginPath(); ctx.arc(0, 0, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6fe6ff';
    ctx.beginPath(); ctx.arc(-0.5 * sc, -0.5 * sc, 0.9 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBullet(b) {
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    var ux = b.vx / sp, uy = b.vy / sp;
    var tailLen = 9;
    var hx = b.x, hy = b.y;                  // head
    var txp = b.x - ux * tailLen, typ = b.y - uy * tailLen;  // tail
    var core = b.friendly ? '#eaffff' : '#fff0d6';
    var glow = b.friendly ? 'rgba(110,230,255,0.85)' : 'rgba(255,110,40,0.85)';
    ctx.globalCompositeOperation = 'lighter';
    // Glow tracer.
    ctx.strokeStyle = glow;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(txp, typ); ctx.lineTo(hx, hy); ctx.stroke();
    // Bright core.
    ctx.strokeStyle = core;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.x - ux * 5, b.y - uy * 5); ctx.lineTo(hx, hy); ctx.stroke();
    // Head dot.
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(hx, hy, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
  }

  function drawMissile(m) {
    var head = Math.atan2(m.vy, m.vx);
    var outline = '#1a0a05';
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(head);
    // Exhaust flame behind the body (additive, flickering).
    var fl = 0.6 + 0.4 * Math.sin(combatClock * 40 + m.seed);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75;
    var fg = ctx.createRadialGradient(-7, 0, 0, -7, 0, 8 + fl * 3);
    fg.addColorStop(0, '#fff0c0'); fg.addColorStop(0.4, 'rgba(255,150,40,0.8)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(-7, 0, 8 + fl * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // Body — outlined dark capsule, red warhead nose, fins.
    ctx.fillStyle = outline;
    ctx.fillRect(-7, -3.2, 13, 6.4);
    ctx.fillStyle = '#3a342e';
    ctx.fillRect(-6.5, -2.4, 11, 4.8);
    ctx.fillStyle = '#c43a22';
    ctx.beginPath(); ctx.moveTo(4.5, -2.6); ctx.lineTo(8, 0); ctx.lineTo(4.5, 2.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = outline;
    ctx.fillRect(-6.6, -4.6, 2.6, 2.2);
    ctx.fillRect(-6.6, 2.4, 2.6, 2.2);
    // Warning glow pulse.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(combatClock * 9 + m.seed);
    ctx.fillStyle = '#ff5a30';
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // Dev/local-only combat inspector (mirrors the dev-gated regions log in 015).
  // Inert in normal play; lets a paused-preview session confirm placement and
  // screenshot the art in place (the RAF loop is throttled while the tab is
  // hidden, so updateCombat/drawCombat can't be driven live there).
  try {
    if (window.location && /[?&]dev=|localhost|127\.0\.0\.1|192\.168\./.test(window.location.href)) {
      window.__combat = {
        turrets: function () { return enemyTurrets; },
        chasers: function () { return chasers; },
        bullets: function () { return bullets; },
        rig: function () { return rigTurret; },
        trauma: function () { return combatTrauma; },
        shake: function () { return combatShakeOffset(); },
        missiles: function () { return missiles; },
        stingers: function () { return stingers; },
        obstacles: function () { return obstacles; },
        flak: function () { return flakBatteries; },
        flakShells: function () { return flakShells; },
        snipers: function () { return snipers; },
        bruisers: function () { return bruisers; },
        interceptors: function () { return interceptors; },
        bosses: function () { return bosses; },
        bossKilled: function () { return bossKilledZones; },
        deckY: function () { return flakDeckY(); },
        shear: function (x, y) { return nmzShearFactor(x, y); },
        // Force-fire the nearest battery at the rig's current spot (telegraph +
        // shell + airburst become drivable from a paused preview via tick()).
        fireTestFlak: function () {
          if (!player || !flakBatteries.length) return 0;
          var pcx = player.x + PLAYER_W / 2, pcy = player.y + PLAYER_H / 2;
          var best = flakBatteries[0], bd = Infinity;
          for (var i = 0; i < flakBatteries.length; i++) {
            var d = Math.abs(flakBatteries[i].x - pcx);
            if (d < bd) { bd = d; best = flakBatteries[i]; }
          }
          flakFire(best, pcx, pcy);
          return flakShells.length;
        },
        // Launch a test missile from 200px left of the rig, aimed forward so
        // homing engages and steers it back onto the rig.
        fireTestMissile: function () {
          if (!player) return 0;
          spawnMissile(player.x + PLAYER_W / 2 - 200, player.y + PLAYER_H / 2 - 10, 0);
          return missiles.length;
        },
        // Jump the camera to a world column and render one frame.
        renderAtCol: function (c) {
          cam.x = c * TILE - screenW / 2;
          cam.y = SKY_ROWS * TILE - screenH * 0.5;
          cam.snap = true;
          if (typeof render === 'function') render();
          return { camX: cam.x, camY: cam.y, turrets: enemyTurrets.length };
        },
        // Drive one combat step (the RAF loop is throttled while hidden, so
        // updateCombat can't run live in the preview). nearTurret teleports the
        // rig beside the first turret so the engage/aim/fire branches execute.
        tick: function (dt, nearTurret, nearChaser, nearStinger, nearObstacle) {
          if (nearTurret && enemyTurrets.length && player) {
            var t0 = enemyTurrets[0];
            player.x = t0.x - 120; player.y = SKY_ROWS * TILE - 120;
            if (player.hull == null || player.hull <= 0) player.hull = 100;
          } else if (nearChaser && chasers.length && player) {
            var c0 = chasers[0];
            player.x = c0.ax - 80; player.y = c0.ay;
            if (player.hull == null || player.hull <= 0) player.hull = 100;
          } else if (nearStinger && stingers.length && player) {
            var s0 = stingers[0];
            player.x = s0.ax - 60; player.y = s0.ay;
            if (player.hull == null || player.hull <= 0) player.hull = 100;
          } else if (nearObstacle && obstacles.length && player) {
            var ob0 = obstacles[0];                       // drop the rig dead-centre INTO it
            player.x = ob0.x + ob0.w / 2 - PLAYER_W / 2;
            player.y = ob0.y + ob0.h / 2 - PLAYER_H / 2;
            player.vx = 0; player.vy = 0;
            if (player.hull == null || player.hull <= 0) player.hull = 100;
          }
          // Mirror the real frame order: update() decays hitPauseT before
          // updateCombat runs. The harness skips update(), so do it here or
          // a single player hit would freeze combat permanently in the test.
          if (hitPauseT > 0) hitPauseT -= (dt || 1 / 60);
          updateCombat(dt || 1 / 60);
          var obOverlap = false;
          if (obstacles.length && player) {
            var oo = obstacles[0];
            obOverlap = !(player.x + PLAYER_W <= oo.x || player.x >= oo.x + oo.w || player.y + PLAYER_H <= oo.y || player.y >= oo.y + oo.h);
          }
          return {
            turrets: enemyTurrets.length, chasers: chasers.length, missiles: missiles.length,
            stingers: stingers.length, obstacles: obstacles.length, bullets: bullets.length, sparks: combatSparks.length,
            flak: flakBatteries.length, flakShells: flakShells.length,
            snipers: snipers.length, bruisers: bruisers.length, interceptors: interceptors.length, bosses: bosses.length,
            rigTarget: !!rigTurret.target, rigCool: Number(rigTurret.cool.toFixed(3)),
            rigDeploy: Number((rigTurret.deploy || 0).toFixed(3)), obOverlap: obOverlap,
            hull: player && player.hull, trauma: Number(combatTrauma.toFixed(3))
          };
        },
        // Pose the rig turret + drop a couple of tracers so a still shows the
        // bullet/muzzle art.
        poseFx: function () {
          rigTurret.ang = -Math.PI * 0.4; rigTurret.muzzleT = 0.08; rigTurret.deploy = 1;
          if (enemyTurrets.length) {
            var t0 = enemyTurrets[0];
            t0.charge = ENEMY_CHARGE * 0.7; t0.ang = -Math.PI * 0.6;
            fireBullet(t0.x, t0.y - 13, -Math.PI * 0.6, ENEMY_BULLET_SPEED, ENEMY_BULLET_DMG, false);
            fireBullet(t0.x + 30, t0.y - 40, -Math.PI * 0.4 + Math.PI, PLAYER_BULLET_SPEED, PLAYER_BULLET_DMG, true);
          }
        }
      };
    }
  } catch (e) {}
