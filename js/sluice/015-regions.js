  /* ---- Regions (EXPANSION_PLAN P0.2) ----
     Left-to-right horizontal layout layered on top of the depth model. The
     world is an ordered sequence of regions:
       ocean | TOWN 4 | NMZ3 | TOWN 3 | NMZ2 | TOWN 2 | NMZ1 | TOWN 1 (start) | ocean
     Progression runs right-to-left from the start town (Town 1, against the
     right ocean). Each town has its own ore/layer rules and its own (deeper)
     floor; each No Man's Zone is a virtual combat gauntlet (3 dirt rows then
     bomb-proof voidrock, computed in tileAt, stored in no array); oceans cap
     both far edges. See EXPANSION_PLAN.md sections 3 and 5.

     P0.2 (this fragment) defines the model + O(1) lookups ONLY. tileAt and
     generateWorld are wired to honor it in P0.3 / P0.4; until then nothing
     consumes WORLD_COLS, so the live world is unchanged. NMZ_WIDTH is a
     placeholder until the P0.1 flight-speed reading lands: it will be
     round(topFlightSpeed * 90 / TILE), and ~840 stands in for ~300 px/s. */

  // Per-town mineable floor depth in rows below the surface, indexed by townIndex.
  // Town 0 is the SINGLE_TOWN game's full arc (800 deep: surface metals down to a
  // magma/mantle core, balanced in BALANCE.md). Towns 1-3 only matter under
  // ?multitown=1 (the legacy wide world). WORLD_ROWS (>= max here) caps the grid.
  var TOWN_DEPTHS = [800, 700, 1050, 1400];
  var TOWN_WIDTH = 320;     // town footprint + safe apron, in columns (~2x today)
  var OCEAN_WIDTH = 24;     // ocean cap width at each far edge, in columns
  var NMZ_WIDTH = 620;      // No Man's Zone width, columns; ~63s of flight (315 px/s * 90s / TILE, then trimmed 30% for pacing 2026-05-28)

  var REGION_OCEAN = 0, REGION_TOWN = 1, REGION_NOMANS = 2;
  var REGION_KIND_NAMES = ['ocean', 'town', 'nomans'];

  // Ordered left-to-right; populated by buildRegions(). WORLD_COLS is the full
  // coordinate width (towns + zones + oceans), distinct from the stored town
  // arrays. colRegion[c] holds the index into REGIONS, so regionAt is O(1).
  var REGIONS = [];
  var WORLD_COLS = COLS;
  var colRegion = null;
  // Packed stored-array width: only town + ocean columns are stored (the
  // virtual No Man's Zones are not), so array-column is NOT world-column.
  // arrayColOf maps a world column to its stored array column, or -1 for a
  // zone column. ARRAY_COLS is the stored width (towns + oceans only).
  var ARRAY_COLS = COLS;
  var arrayColOf = null;

  function buildRegions() {
    REGIONS = [];
    var c = 0;
    function add(kind, width, townIndex) {
      REGIONS.push({
        kind: kind, c0: c, c1: c + width, width: width,
        townIndex: (townIndex == null ? -1 : townIndex)
      });
      c += width;
    }
    if (SINGLE_TOWN) {
      // Free-forever sandbox (2026-06-19): ONE coherent town, no oceans, no
      // zones, no extra towns. Town index 0 (the calm start town) is the whole
      // world. COLS = WORLD_COLS below resizes every world-width bound to it and
      // re-anchors the deck to this town, so the rig spawns on its deck and all
      // downstream systems (worldgen, camera, save grid, lighting) just follow.
      // The wide 4-town layout is one flag away (?multitown=1 or SINGLE_TOWN=false).
      add(REGION_TOWN, TOWN_WIDTH, 0);
    } else {
      add(REGION_OCEAN, OCEAN_WIDTH);
      add(REGION_TOWN, TOWN_WIDTH, 3);   // Town 4 (deepest, hardest)
      add(REGION_NOMANS, NMZ_WIDTH);     // No Man's Zone 3
      add(REGION_TOWN, TOWN_WIDTH, 2);   // Town 3
      add(REGION_NOMANS, NMZ_WIDTH);     // No Man's Zone 2
      add(REGION_TOWN, TOWN_WIDTH, 1);   // Town 2
      add(REGION_NOMANS, NMZ_WIDTH);     // No Man's Zone 1
      add(REGION_TOWN, TOWN_WIDTH, 0);   // Town 1 (start, against the right ocean)
      add(REGION_OCEAN, OCEAN_WIDTH);
    }
    WORLD_COLS = c;
    colRegion = new Int16Array(WORLD_COLS);
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var rg = REGIONS[ri];
      for (var cc = rg.c0; cc < rg.c1; cc++) colRegion[cc] = ri;
    }
    // Packed array-column mapping: town/ocean columns get sequential stored
    // indices; zone columns map to -1 (virtual, unstored). region.arrayCol0 is
    // the packed index of the region's left edge (-1 for a zone).
    arrayColOf = new Int32Array(WORLD_COLS);
    var ac = 0;
    for (var ri2 = 0; ri2 < REGIONS.length; ri2++) {
      var rg2 = REGIONS[ri2];
      if (rg2.kind === REGION_NOMANS) {
        rg2.arrayCol0 = -1;
        for (var zc = rg2.c0; zc < rg2.c1; zc++) arrayColOf[zc] = -1;
      } else {
        rg2.arrayCol0 = ac;
        for (var tc = rg2.c0; tc < rg2.c1; tc++) arrayColOf[tc] = ac++;
      }
    }
    ARRAY_COLS = ac;
  }

  // O(1) region lookup by world column. Returns null off the world edges.
  function regionAt(c) {
    if (c < 0 || c >= WORLD_COLS || !colRegion) return null;
    return REGIONS[colRegion[c]];
  }
  // townIndex of the column's region, or -1 if it is not a town.
  function townIndexAt(c) {
    var r = regionAt(c);
    return (r && r.kind === REGION_TOWN) ? r.townIndex : -1;
  }
  // Column index local to the region's left edge (0-based), or -1 off-world.
  function localColAt(c) {
    var r = regionAt(c);
    return r ? (c - r.c0) : -1;
  }

  // ---- Per-town layer stacks (WORLD_DESIGN §1) ----
  // Each town has its OWN vertical layer stack (depth bands), gaining more
  // layers + more drama with depth: Town 1 is a calm 3-layer intro, Town 4
  // ends in magma/mantle. getLayerForRegion(depth, townIndex) indexes these;
  // getLayerAt(r, c) resolves the town from the world column; getLayerForCam
  // uses the per-frame on-screen town (camTownIndex) for the render passes (a
  // row spans one town on screen almost always). Fields match the LAYERS
  // schema (name, minDepth, maxDepth, bg, tint, requiresHeat/Shield, dangerous).
  // Palettes reuse the existing BG discipline; per-town palette polish is a
  // follow-up (the functional win here is per-town counts/depths + hazards).
  var TOWN_LAYERS = [
    // Town 0 = the SINGLE_TOWN game's full arc (800 deep). Calm topsoil down
    // through a heat-gated permafrost band into a shield-gated magma/mantle core,
    // so Heated Drill + Heat Shield become real progression gates (see BALANCE.md).
    [ { name: 'topsoil',    minDepth: 0,   maxDepth: 120, bg: '#1a1008', tint: null },
      { name: 'subsoil',    minDepth: 120, maxDepth: 280, bg: '#161a1d', tint: null },
      { name: 'deepcrust',  minDepth: 280, maxDepth: 440, bg: '#13110e', tint: null },
      { name: 'permafrost', minDepth: 440, maxDepth: 580, bg: '#0c1a26', tint: '#d2eaff', requiresHeat: true },
      { name: 'magma',      minDepth: 580, maxDepth: 720, bg: '#220804', tint: '#ff5a1a', dangerous: true, requiresShield: true },
      { name: 'mantle',     minDepth: 720, maxDepth: 800, bg: '#1a0608', tint: '#ff2030', dangerous: true, requiresShield: true } ],
    // Town 2 (~600): adds a permafrost ice band (the first heat gate). 4 layers.
    [ { name: 'topsoil',    minDepth: 0,   maxDepth: 150, bg: '#1a1008', tint: null },
      { name: 'subsoil',    minDepth: 150, maxDepth: 330, bg: '#161a1d', tint: null },
      { name: 'permafrost', minDepth: 330, maxDepth: 500, bg: '#0c1a26', tint: '#d2eaff', requiresHeat: true },
      { name: 'shelf',      minDepth: 500, maxDepth: 600, bg: '#13110e', tint: null } ],
    // Town 3 (~1000): adds fossil + deepcrust. 5 layers.
    [ { name: 'topsoil',    minDepth: 0,    maxDepth: 180,  bg: '#1a1008', tint: null },
      { name: 'subsoil',    minDepth: 180,  maxDepth: 400,  bg: '#161a1d', tint: null },
      { name: 'permafrost', minDepth: 400,  maxDepth: 620,  bg: '#0c1a26', tint: '#d2eaff', requiresHeat: true },
      { name: 'fossil',     minDepth: 620,  maxDepth: 820,  bg: '#1a1612', tint: null },
      { name: 'deepcrust',  minDepth: 820,  maxDepth: 1000, bg: '#13110e', tint: null } ],
    // Town 4 (~1400, endgame): adds magma + mantle drama (heat shield). 6 layers.
    [ { name: 'topsoil',    minDepth: 0,    maxDepth: 200,  bg: '#1a1008', tint: null },
      { name: 'subsoil',    minDepth: 200,  maxDepth: 440,  bg: '#161a1d', tint: null },
      { name: 'permafrost', minDepth: 440,  maxDepth: 680,  bg: '#0c1a26', tint: '#d2eaff', requiresHeat: true },
      { name: 'fossil',     minDepth: 680,  maxDepth: 920,  bg: '#1a1612', tint: null },
      { name: 'magma',      minDepth: 920,  maxDepth: 1180, bg: '#220804', tint: '#ff5a1a', dangerous: true, requiresShield: true },
      { name: 'mantle',     minDepth: 1180, maxDepth: 1400, bg: '#1a0608', tint: '#ff2030', dangerous: true, requiresShield: true } ]
  ];
  // Layer for a depth within a town's stack. A non-town column (zone/ocean,
  // townIndex -1) falls back to Town 1's calm stack (zones render voidrock
  // over it, so it is rarely seen).
  function getLayerForRegion(depth, townIndex) {
    var stack = TOWN_LAYERS[(townIndex >= 0 && townIndex < TOWN_LAYERS.length) ? townIndex : 0];
    for (var i = 0; i < stack.length; i++) {
      if (depth >= stack[i].minDepth && depth < stack[i].maxDepth) return stack[i];
    }
    return stack[stack.length - 1];
  }
  // Layer at a world cell (row, col): resolves the town from the column.
  function getLayerAt(r, c) {
    return getLayerForRegion(r - SKY_ROWS, townIndexAt(c));
  }
  // On-screen layer lookups: the render passes resolve a layer per row, and on
  // screen a row sits in one town almost always, so the camera-centre column's
  // town drives the band fill + tints. Self-computed from cam.x (cheap), no
  // per-frame setup; a boundary frame briefly tints by the dominant town.
  function camTownIndexNow() {
    var col = Math.floor((cam.x + screenW * 0.5) / TILE);
    if (col < 0) col = 0; else if (col >= COLS) col = COLS - 1;
    return townIndexAt(col);
  }
  function getLayerForCam(depth) { return getLayerForRegion(depth, camTownIndexNow()); }
  function camLayerStack() {
    var ti = camTownIndexNow();
    return TOWN_LAYERS[(ti >= 0 && ti < TOWN_LAYERS.length) ? ti : 0];
  }
  // Player's town (for the hazard / banner / drill-gate layer checks).
  function playerTownIndex() {
    return townIndexAt(Math.floor((player.x + PLAYER_W * 0.5) / TILE));
  }
  // ---- Per-town station anchors (multi-town stores) ----
  // Generalize the single Town-1 deck/station to every town. townCenterCol
  // mirrors the DECK_CENTER_COL formula (015 boot) for any townIndex;
  // townStationCol applies the same -2 offset stationCenterCol() uses;
  // nearestTownStationCol resolves the town the player is standing in. The
  // whole world surface is flat at SKY_ROWS, so a station sits cleanly in any
  // town with no per-town deck worldgen needed.
  function townCenterCol(ti) {
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].kind === REGION_TOWN && REGIONS[i].townIndex === ti) {
        return REGIONS[i].c0 + Math.floor(TOWN_WIDTH / 2) - 1;
      }
    }
    return DECK_CENTER_COL;
  }
  function townStationCol(ti) { return townCenterCol(ti) - 2; }
  function nearestTownStationCol() {
    var ti = (typeof playerTownIndex === 'function') ? playerTownIndex() : 0;
    if (ti == null || ti < 0) ti = 0;
    return townStationCol(ti);
  }

  // ---- Per-town ore distribution (WORLD_DESIGN §3) ----
  // Which EXISTING ores spawn in which town, at what per-town depth band + spawn
  // chance. The ore's intrinsic props (value, hp, art, host, reqDrill, reqHeat)
  // stay in the ORES table; this only places them (depositOreVeins in 030 reads
  // it). Each town owns a value tier (cheap shallow, exotic deep), low tiers
  // retire one town later,
  // reqHeat ores sit in permafrost bands, gems live deep in T4's magma/mantle.
  // Town 1 is deliberately low-variety (3 regulars + 2 specials). All ore types
  // here exist in ORES; the planned magnetite/cobalt/jade/opal join after their
  // art lands. Depths are tunable; this is the first redistribution pass.
  //
  // Placement character (WORLD_DESIGN §0/§3), read by depositOreVeins in 030:
  //   vein:N    REGULAR: grows a connected seam of mean ~N tiles (follow it).
  //   scatter   SPECIAL: isolated single tiles (a detour decision, a reveal).
  // One character per ore TYPE across all towns (legible): base metals + coal +
  // ice + obsidian VEIN; gold + cinnabar + amber + fossil + uranium + the gems
  // SCATTER. `chance` is still the per-band density target (tiles = bandArea *
  // chance * EARTH_ORE_SPAWN_MULTIPLIER); vein size only sets clumping, not how
  // much ore there is. Ordered common-first (purely cosmetic now the roll moved).
  var TOWN_ORES = [
    // Town 0 = the SINGLE_TOWN game. Full ore arc, value rising with depth, gated
    // by reqDrill (intrinsic in ORES) + the permafrost heat gate + the magma shield
    // gate. Only renderer-proven ores (each already shipped in a live town) are
    // used, so nothing renders as a fallback. Tuned in BALANCE.md.
    [ // topsoil 0-120: cheap surface metals (the bootstrap)
      { type: 'coal',     minDepth: 4,   maxDepth: 150, chance: 0.105, vein: 7 },
      { type: 'copper',   minDepth: 30,  maxDepth: 240, chance: 0.075, vein: 6 },
      // subsoil 120-280: base metals
      { type: 'bauxite',  minDepth: 120, maxDepth: 320, chance: 0.05,  vein: 5 },
      { type: 'iron',     minDepth: 150, maxDepth: 380, chance: 0.05,  vein: 5 },
      { type: 'pyrite',   minDepth: 200, maxDepth: 420, chance: 0.03,  vein: 4 },
      // deepcrust 280-440: precious metals + first finds
      { type: 'silver',   minDepth: 280, maxDepth: 500, chance: 0.03,  vein: 4 },
      { type: 'cinnabar', minDepth: 300, maxDepth: 500, chance: 0.022, scatter: true },
      { type: 'gold',     minDepth: 320, maxDepth: 560, chance: 0.02,  scatter: true },
      { type: 'amber',    minDepth: 300, maxDepth: 520, chance: 0.02,  scatter: true },
      // permafrost 440-580 (heat-gated): methane ice + deep fossils
      { type: 'methaneice', minDepth: 440, maxDepth: 600, chance: 0.045, vein: 5 },
      { type: 'fossil',   minDepth: 420, maxDepth: 600, chance: 0.014, scatter: true },
      // magma 580-720 (shield-gated, drill-gated): volcanic exotics
      { type: 'obsidian', minDepth: 560, maxDepth: 740, chance: 0.03,  vein: 4 },
      { type: 'uranium',  minDepth: 600, maxDepth: 760, chance: 0.016, scatter: true },
      { type: 'ruby',     minDepth: 620, maxDepth: 760, chance: 0.012, scatter: true },
      { type: 'tanzanite',minDepth: 640, maxDepth: 760, chance: 0.009, scatter: true },
      // mantle 720-800: the legendary core
      { type: 'emerald',  minDepth: 700, maxDepth: 800, chance: 0.014, scatter: true },
      { type: 'diamond',  minDepth: 720, maxDepth: 800, chance: 0.009, scatter: true },
      { type: 'painite',  minDepth: 740, maxDepth: 800, chance: 0.005, scatter: true },
      { type: 'unobtanium', minDepth: 760, maxDepth: 800, chance: 0.003, scatter: true } ],
    // Town 2 (~600): subsoil metals + permafrost methane ice + cinnabar/gold.
    [ { type: 'copper',     minDepth: 0,   maxDepth: 160, chance: 0.06,  vein: 6 },
      { type: 'bauxite',    minDepth: 80,  maxDepth: 330, chance: 0.055, vein: 5 },
      { type: 'iron',       minDepth: 150, maxDepth: 420, chance: 0.05,  vein: 5 },
      { type: 'pyrite',     minDepth: 250, maxDepth: 520, chance: 0.03,  vein: 4 },
      { type: 'silver',     minDepth: 300, maxDepth: 560, chance: 0.03,  vein: 4 },
      { type: 'methaneice', minDepth: 330, maxDepth: 500, chance: 0.04,  vein: 5 },
      { type: 'cinnabar',   minDepth: 380, maxDepth: 600, chance: 0.024, scatter: true },
      { type: 'gold',       minDepth: 450, maxDepth: 600, chance: 0.022, scatter: true } ],
    // Town 3 (~1000): deeper metals + obsidian + uranium + emerald (deepcrust).
    [ { type: 'iron',       minDepth: 0,    maxDepth: 200,  chance: 0.04,  vein: 5 },
      { type: 'silver',     minDepth: 150,  maxDepth: 450,  chance: 0.03,  vein: 4 },
      { type: 'pyrite',     minDepth: 200,  maxDepth: 500,  chance: 0.025, vein: 4 },
      { type: 'methaneice', minDepth: 400,  maxDepth: 620,  chance: 0.04,  vein: 5 },
      { type: 'gold',       minDepth: 350,  maxDepth: 720,  chance: 0.022, scatter: true },
      { type: 'cinnabar',   minDepth: 400,  maxDepth: 740,  chance: 0.024, scatter: true },
      { type: 'obsidian',   minDepth: 600,  maxDepth: 900,  chance: 0.03,  vein: 4 },
      { type: 'fossil',     minDepth: 620,  maxDepth: 820,  chance: 0.013, scatter: true },
      { type: 'uranium',    minDepth: 640,  maxDepth: 900,  chance: 0.015, scatter: true },
      { type: 'emerald',    minDepth: 820,  maxDepth: 1000, chance: 0.015, scatter: true } ],
    // Town 4 (~1400, endgame): obsidian/uranium + the gems in magma/mantle.
    [ { type: 'gold',       minDepth: 0,    maxDepth: 300,  chance: 0.02,   scatter: true },
      { type: 'silver',     minDepth: 150,  maxDepth: 450,  chance: 0.025,  vein: 4 },
      { type: 'obsidian',   minDepth: 200,  maxDepth: 700,  chance: 0.03,   vein: 4 },
      { type: 'methaneice', minDepth: 440,  maxDepth: 680,  chance: 0.04,   vein: 5 },
      { type: 'uranium',    minDepth: 440,  maxDepth: 920,  chance: 0.015,  scatter: true },
      { type: 'emerald',    minDepth: 680,  maxDepth: 940,  chance: 0.015,  scatter: true },
      { type: 'ruby',       minDepth: 920,  maxDepth: 1180, chance: 0.012,  scatter: true },
      { type: 'tanzanite',  minDepth: 950,  maxDepth: 1180, chance: 0.009,  scatter: true },
      { type: 'diamond',    minDepth: 1000, maxDepth: 1400, chance: 0.0075, scatter: true },
      { type: 'painite',    minDepth: 1180, maxDepth: 1400, chance: 0.004,  scatter: true },
      { type: 'unobtanium', minDepth: 1280, maxDepth: 1400, chance: 0.002,  scatter: true } ]
  ];

  // Shared frozen tile prototypes for the virtual No Man's Zone underground
  // (returned by zoneTileAt; never mutated, so one instance serves every zone
  // cell at zero per-cell cost). DIRT_PROTO is the diggable 3-row skin;
  // SOLID_PROTO is the bomb-proof voidrock below it.
  var DIRT_PROTO = Object.freeze({ type: 'dirt', hp: ORES.dirt.hp });
  var STONE_PROTO = Object.freeze({ type: 'stone', hp: ORES.stone.hp });
  var SOLID_PROTO = Object.freeze({ type: 'voidrock', hp: 999999 });
  var BEDROCK_PROTO = Object.freeze({ type: 'bedrock', hp: 999999 });

  // Virtual tile for a No Man's Zone column (stored in no array): a 3-row dirt
  // skin then bomb-proof voidrock forever, open sky above the surface. Pure
  // function of the row, so it returns the shared frozen prototypes. (wc is
  // accepted for symmetry with tileAt; the result does not depend on it.)
  function zoneTileAt(r, wc) {
    var depth = r - SKY_ROWS;
    if (depth < 0) return null;
    if (depth < 3) return DIRT_PROTO;
    return SOLID_PROTO;
  }

  // Region-aware WRITE into the packed world array (world-col to array-col via
  // arrayColOf). A write to a virtual zone column is a no-op. Used by worldgen
  // + mining + bombs + jello once the wide world is live (P0.4); harmless until
  // then (nothing calls it yet).
  function worldSet(r, wc, tile) {
    if (wc < 0 || wc >= WORLD_COLS || !arrayColOf) return false;
    var ac3 = arrayColOf[wc];
    if (ac3 < 0 || !world[r]) return false;
    world[r][ac3] = tile;
    return true;
  }

  // Integrity check: regions must tile [0, WORLD_COLS) with no gaps or
  // overlaps, and every column must map back to a region that contains it.
  // Cheap (runs once at load); console.error makes a malformed table loud.
  function validateRegions() {
    var ok = true, why = [];
    var expect = 0;
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].c0 !== expect) { ok = false; why.push('gap/overlap at ' + i); }
      expect = REGIONS[i].c1;
    }
    if (expect !== WORLD_COLS) { ok = false; why.push('coverage ' + expect + ' != ' + WORLD_COLS); }
    if (!colRegion || colRegion.length !== WORLD_COLS) { ok = false; why.push('colRegion length'); }
    else {
      for (var c = 0; c < WORLD_COLS; c++) {
        var r = REGIONS[colRegion[c]];
        if (!r || c < r.c0 || c >= r.c1) { ok = false; why.push('col ' + c + ' maps wrong'); break; }
      }
    }
    if (!arrayColOf || arrayColOf.length !== WORLD_COLS) { ok = false; why.push('arrayColOf length'); }
    else {
      var eac = 0;
      for (var ac4 = 0; ac4 < WORLD_COLS; ac4++) {
        var isZone = REGIONS[colRegion[ac4]].kind === REGION_NOMANS;
        if (isZone) { if (arrayColOf[ac4] !== -1) { ok = false; why.push('zone col ' + ac4 + ' not -1'); break; } }
        else if (arrayColOf[ac4] !== eac++) { ok = false; why.push('packed mismatch at ' + ac4); break; }
      }
      if (ok && eac !== ARRAY_COLS) { ok = false; why.push('ARRAY_COLS ' + ARRAY_COLS + ' != packed ' + eac); }
    }
    if (!ok) { try { console.error('[regions] INVALID: ' + why.join('; ')); } catch (e) {} }
    return ok;
  }

  buildRegions();
  validateRegions();
  // Adopt the wide layout into the live world. COLS becomes the true column
  // count (the whole world, not the old single town), and the single station
  // deck moves to Town 1 (the start town). Every world-width bound and every
  // DECK_CENTER_COL-anchored element (station, spawn, decor, shop walk-up) then
  // targets the wide world / Town 1 with no other edits. Towns 2-4 get their
  // own stations in P1.
  COLS = WORLD_COLS;
  for (var _t1 = 0; _t1 < REGIONS.length; _t1++) {
    if (REGIONS[_t1].kind === REGION_TOWN && REGIONS[_t1].townIndex === 0) {
      DECK_CENTER_COL = REGIONS[_t1].c0 + Math.floor(TOWN_WIDTH / 2) - 1;
      break;
    }
  }
  DECK_LEFT_COL = DECK_CENTER_COL - DECK_HALF_LEFT;
  DECK_RIGHT_COL = DECK_CENTER_COL + DECK_HALF_RIGHT;
  // Dev/local only: one-line summary so the layout is verifiable at load
  // without exposing internals (the game runs inside one IIFE). Silent in prod.
  try {
    if (window.location && /[?&]dev=|localhost|127\.0\.0\.1|192\.168\./.test(window.location.href)) {
      var _townN = 0, _zoneN = 0;
      for (var _ri = 0; _ri < REGIONS.length; _ri++) {
        if (REGIONS[_ri].kind === REGION_TOWN) _townN++;
        else if (REGIONS[_ri].kind === REGION_NOMANS) _zoneN++;
      }
      console.info('[regions] WORLD_COLS ' + WORLD_COLS + ' (stored ' + ARRAY_COLS + '), ' + REGIONS.length +
                   ' regions (' + _townN + ' towns, ' + _zoneN + ' zones), NMZ_WIDTH ' + NMZ_WIDTH);
    }
  } catch (e) {}
