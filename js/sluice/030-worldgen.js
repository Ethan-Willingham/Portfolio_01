  /* ---- World Generation ---- */
  // Surface ponds are STREAMED (v24.11): worldgen carves every pit into this
  // list, but updateSurfacePondStreaming() (070) only spawns water in the
  // pool(s) near the camera. Module-scope so the streamer + worldgen share it.
  var surfacePonds = [];
  function generateWorld() {
    world = [];
    // Live jello bodies never survive a world rebuild (New Game / dev restart): a body
    // from the previous grid would float as a ghost in the new one. generateJelloPatches
    // used to carry this reset, but the live path does not call it (see the surface-
    // features note below), so the rebuild resets directly. (340 hoists resetJello.)
    resetJello();
    var OCEAN_FLOOR = 8;   // ocean shelf depth; real water + horizon are a P0.6 follow-up
    for (var r = 0; r < TOTAL_ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        if (r < SKY_ROWS) { row.push(null); continue; }
        var depth = r - SKY_ROWS;
        var reg = regionAt(c);
        if (!reg || reg.kind === REGION_NOMANS) {
          // No Man's Zone underground: bomb-proof voidrock. The diggable 3-row
          // dirt skin is painted on AFTER the dirt/stone passes (which skip
          // voidrock), so CA / voids never corrupt the zone.
          row.push(SOLID_PROTO);
          continue;
        }
        var floorDepth = (reg.kind === REGION_TOWN) ? TOWN_DEPTHS[reg.townIndex] : OCEAN_FLOOR;
        if (depth >= floorDepth) { row.push(BEDROCK_PROTO); continue; }
        var tile;
        if (reg.kind === REGION_OCEAN) {
          // Plain dirt/stone shelf, no ore (the edge cap, not a mining town).
          tile = (tileHash01(r, c, 0xC10B) < 0.30)
            ? { type: 'stone', hp: ORES.stone.hp }
            : { type: 'dirt', hp: ORES.dirt.hp };
        } else {
          // Town column: base terrain only (rock + air-pocket seeds). Ore veins
          // are injected AFTER the cave CA by depositOreVeins(), so the ore set
          // never perturbs the organic stone/void shaping and each placed ore
          // still gets its host ring (lockOreHostRing runs after the deposit).
          var tlayer = getLayerForRegion(depth, reg.townIndex);
          if (depth >= 3 && !tlayer.requiresShield && !tlayer.requiresHeat && !tlayer.requiresBomb && Math.random() < EARTH_SINGLE_VOID_CHANCE) {
            tile = null;   // air-pocket seed; grown by growEarthVoidPockets()
          } else {
            // ~38% stone density seed; the CA pass below grows organic blobs.
            var stoneSeed = tileHash01(r, c, 0xC10B);
            tile = stoneSeed < 0.38
              ? { type: 'stone', hp: ORES.stone.hp }
              : { type: 'dirt', hp: ORES.dirt.hp };
          }
        }
        row.push(tile);
      }
      world.push(row);
    }
    // Cellular smoothing: grows organic stone blobs from the random seed.
    // Each pass: stone tiles with <4 stone neighbors revert to dirt (trims
    // thin protrusions); dirt tiles with >=5 stone neighbors become stone
    // (fills concave nooks). Four passes settle into smooth cave-like shapes.
    for (var pass = 0; pass < 4; pass++) {
      var isStone = [];
      for (var sr = 0; sr < TOTAL_ROWS; sr++) {
        var srow = [];
        var srRow = world[sr];
        for (var sc = 0; sc < COLS; sc++) {
          srow.push(!!(srRow && srRow[sc] && srRow[sc].type === 'stone'));
        }
        isStone.push(srow);
      }
      for (var cr = SKY_ROWS; cr < TOTAL_ROWS; cr++) {
        for (var cc = 0; cc < COLS; cc++) {
          var cell = world[cr][cc];
          if (!cell || (cell.type !== 'stone' && cell.type !== 'dirt')) continue;
          var stoneN = 0;
          for (var ddr = -1; ddr <= 1; ddr++) {
            for (var ddc = -1; ddc <= 1; ddc++) {
              if (ddr === 0 && ddc === 0) continue;
              var snr = isStone[cr + ddr];
              if (snr && snr[cc + ddc]) stoneN++;
            }
          }
          if (cell.type === 'stone' && stoneN < 4) {
            world[cr][cc] = { type: 'dirt', hp: ORES.dirt.hp };
          } else if (cell.type === 'dirt' && stoneN >= 5) {
            world[cr][cc] = { type: 'stone', hp: ORES.stone.hp };
          }
        }
      }
    }
    growEarthVoidPockets();
    depositOreVeins();

    // Post-pass: lock every ore to its host material (ORES[type].host).
    // The cellular pass above grows organic dirt/stone blobs; here we convert
    // the terrain ring around each ore to its host, so an ore is never found
    // in both materials. oreUnderlayKind() (the renderer's host probe) reads
    // cardinal neighbours and prefers stone, so a dirt-hosted ore is fragile:
    // a single stone cardinal flips its reading. We therefore sweep in order,
    // stone-hosted ores claim their ring first, dirt-hosted ores get the last
    // word, so dirt wins wherever a dirt- and a stone-hosted ore touch.
    var stoneHp = ORES.stone.hp;
    var dirtHp = ORES.dirt.hp;
    function lockOreHostRing(host) {
      var toType = host;                                  // 'dirt' | 'stone'
      var fromType = host === 'dirt' ? 'stone' : 'dirt';
      var toHp = host === 'dirt' ? dirtHp : stoneHp;
      for (var r = SKY_ROWS; r < TOTAL_ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var t = world[r][c];
          if (!t) continue;
          var def = ORES[t.type];
          if (!def || def.host !== host) continue;
          for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              var nrow = world[r + dr];
              var nt = nrow && nrow[c + dc];
              if (nt && nt.type === fromType) { nt.type = toType; nt.hp = toHp; }
            }
          }
        }
      }
    }
    lockOreHostRing('stone');   // stone-hosted ores claim their ring first
    lockOreHostRing('dirt');    // dirt-hosted ores get the last word
    // Lay down the unminable cement station foundation at world surface.
    // The shop and pump pad sit on this so the base can never be undermined.
    for (var pc = DECK_LEFT_COL; pc <= DECK_RIGHT_COL; pc++) {
      if (pc >= 0 && pc < COLS) {
        world[DECK_ROW][pc] = { type: 'foundation', hp: 999999 };
      }
    }
    // ----- No Man's Zone dirt skin -----
    // Paint the diggable 3-row dirt skin onto each zone column now that the
    // dirt/stone passes (which left the zones as inert voidrock) are done.
    for (var zc = 0; zc < COLS; zc++) {
      var zreg = regionAt(zc);
      if (!zreg || zreg.kind !== REGION_NOMANS) continue;
      for (var sd = 0; sd < 3; sd++) {
        var zr = SKY_ROWS + sd;
        if (world[zr]) world[zr][zc] = DIRT_PROTO;
      }
    }
    // ----- Flyweight intern -----
    // Collapse plain dirt/stone (the CA output) to shared frozen prototypes so
    // the wide world's filler tiles cost one shared object each instead of one
    // per cell. Ores, foundation, and pond-basin tiles stay unique; mining
    // copy-on-writes a fresh mutable tile before damaging a frozen one.
    var dHp = ORES.dirt.hp, sHp = ORES.stone.hp;
    for (var ir = SKY_ROWS; ir < TOTAL_ROWS; ir++) {
      var irow = world[ir];
      if (!irow) continue;
      for (var ic = 0; ic < COLS; ic++) {
        var it = irow[ic];
        if (!it || Object.isFrozen(it)) continue;
        if (it.type === 'dirt' && it.hp === dHp && !it.pondBasin) irow[ic] = DIRT_PROTO;
        else if (it.type === 'stone' && it.hp === sHp && !it.pondBasin) irow[ic] = STONE_PROTO;
      }
    }
    // ----- The Great Seam chamber -----
    // The legendary one-time find (see 295-collection-ledger.js). Carved
    // after the terrain passes so nothing regrows over it.
    carveGreatSeamChamber();
    // v25.59 — scatter the rare buried slimes (region-aware, one creature per
    // patch). Runs AFTER the ore deposit + host-ring lock so a slime overwrites
    // ore rather than being perturbed by it, and after the void carve so no
    // slime seeds into open cave. No-op when ENABLE_JELLO is off.
    if (ENABLE_JELLO) generateJelloPatches();
    // ----- P0.4 WIP deferrals -----
    // Surface ponds, oil pockets, and the reinforced barrier band assume a single
    // 160-col town or global positions; they return per-town in a follow-up. The
    // bedrock floor is now produced by each region's sub-floor fill above
    // (BEDROCK_PROTO below every town/ocean), so the old global bedrock pass is
    // gone. Intentionally NOT calling generateOilPockets, and not filling the
    // barrier band.
    // Surface LAKES (v24.148, was 1-deep "ponds" v24.11-147): DEEP NARROW
    // stone-lined pits, 9-14 wide x 5-8 deep. The owner's diagnosis, and
    // saharan's reference demo (the exact codebase our MLS-MPM solver is
    // ported from, ~31k particles in a DEEP tank, no sleep/brake machinery,
    // reads perfectly calm): a particle fluid needs BULK under its surface.
    // At 1 tile deep every surface particle is ALSO a floor-contact
    // particle, so boundary noise IS the visible surface, and any
    // disturbance rings floor<->surface with no bulk to absorb it. That
    // geometry is what the entire v24.112-146 rest-calm war was medicating.
    // 5-8 tiles of water puts the surface line on top of thousands of bulk
    // particles, like the reference tank; the v24.146 whole-body freeze
    // makes the bigger bodies free at rest (stepping is OFF when settled).
    //
    // Only the PITS are carved here; the WATER is STREAMED near the camera
    // (updateSurfacePondStreaming, 070) exactly as before — ~1 lake live at
    // a time, gap > the active region width. pond.d carries the depth
    // (saves without it mean an old 1-deep world: default 1 everywhere).
    surfacePonds.length = 0;
    var _pondLo = SINGLE_TOWN ? 4 : OCEAN_WIDTH + 4;            // single town has no ocean caps to skip
    var _pondHi = SINGLE_TOWN ? COLS - 4 : COLS - OCEAN_WIDTH - 4;
    var _pondDeckL = DECK_LEFT_COL - 8, _pondDeckR = DECK_RIGHT_COL + 8;  // keep clear of spawn/station
    var _px = _pondLo + ((Math.random() * 30) | 0);
    while (_px < _pondHi - 12) {
      // Small lakes, sized for LOW-END GPUs (Phase C, free-forever relaunch).
      // Density stays FULL (655/tile, owner-locked); we shrink the TILE COUNT so
      // the one streamed-live lake is light. Was 9-14 x 5-8 (up to ~65k particles);
      // now 6-9 x 3-4 capped at 24 tiles (~15.7k particles, ~4x lighter). See TUNING.md.
      var _pw = 6 + ((Math.random() * 4) | 0);     // 6..9 wide — still reads as a lake, not a strip
      var _pd = 3 + ((Math.random() * 2) | 0);     // 3..4 tiles of water depth
      if (_pw * _pd > 24) _pd = (24 / _pw) | 0;    // budget clamp: area x 655/tile <= ~15.7k particles
      var _pr = _px + _pw - 1;
      if (_pr < _pondHi && !(_pr >= _pondDeckL && _px <= _pondDeckR) &&
          world[SKY_ROWS] && world[SKY_ROWS + _pd]) {
        // carve the deep pit: stone walls down both sides, stone floor,
        // hollow the full water body.
        for (var _wr = SKY_ROWS; _wr < SKY_ROWS + _pd; _wr++) {
          if (!world[_wr]) continue;
          world[_wr][_px - 1] = { type: 'stone', hp: ORES.stone.hp };       // left wall
          world[_wr][_pr + 1] = { type: 'stone', hp: ORES.stone.hp };       // right wall
          for (var _cc = _px; _cc <= _pr; _cc++) world[_wr][_cc] = null;    // hollow the water body
        }
        for (var _fc = _px - 1; _fc <= _pr + 1; _fc++) world[SKY_ROWS + _pd][_fc] = { type: 'stone', hp: ORES.stone.hp }; // floor
        surfacePonds.push({ cL: _px, cR: _pr, d: _pd, filled: false });
        seedLakeShoreSlimes(_px, _pr);   // a few 1-tile slimes perch above ground on each bank (v25.68)
      }
      _px = _pr + 1 + 130 + ((Math.random() * 80) | 0);  // gap 130..210 — wider (fewer lakes for low-end), still > the ~81-tile active region so only one streams in at a time
    }
  }

  // ----- The Great Seam chamber (the "proper end that doesn't end the game") -----
  // A small hidden chamber at the floor of the DEEPEST town (Town 4, 1400):
  // about 9 wide x 5 tall of cleared cells sitting just above the bedrock
  // sub-floor near the town's center column, with a 5x2 block of 'greatseam'
  // tiles resting on the chamber floor. The seam is unbreakable by drill;
  // drilling it triggers the extraction sequence (seamExtract, 295). Follows
  // the jello-patch/pond pattern: per-cell guards so it can never overwrite
  // bedrock, foundation, voidrock or barrier.
  function carveGreatSeamChamber() {
    // Deepest town that ACTUALLY EXISTS in REGIONS (single-town = town 0). Scanning
    // raw TOWN_DEPTHS would pick town 3 (1400) even when it is not in the world, and
    // the chamber would try to carve in the bedrock fill below the real floor and
    // silently fail. So resolve the deepest town from the live region table.
    var ti = -1, _deepest = -1;
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].kind !== REGION_TOWN) continue;
      var _tti = REGIONS[i].townIndex;
      if (TOWN_DEPTHS[_tti] > _deepest) { _deepest = TOWN_DEPTHS[_tti]; ti = _tti; }
    }
    if (ti < 0) return;                        // no towns (defensive)
    var floorDepth = TOWN_DEPTHS[ti];          // 800 single-town, 1400 multitown
    var centerC = townCenterCol(ti);
    var chamberW = 9, chamberH = 5;
    var c0 = centerC - (chamberW >> 1);
    var dBot = floorDepth - 2;                 // one solid rock row above the bedrock fill
    var dTop = dBot - (chamberH - 1);
    function seamCellOk(r, c) {
      if (r < SKY_ROWS || r >= TOTAL_ROWS) return false;
      var reg = regionAt(c);
      if (!reg || reg.kind !== REGION_TOWN) return false;
      var t = world[r] && world[r][c];
      if (t && (t.type === 'bedrock' || t.type === 'foundation' ||
                t.type === 'voidrock' || t.type === 'barrier')) return false;
      return !!world[r];
    }
    // Carve the chamber air pocket.
    for (var d = dTop; d <= dBot; d++) {
      for (var c = c0; c < c0 + chamberW; c++) {
        var r = SKY_ROWS + d;
        if (seamCellOk(r, c)) world[r][c] = null;
      }
    }
    // Lay the 5x2 seam block on the chamber floor, centered.
    var seamHp = ORES.greatseam.hp;
    for (var sd = dBot - 1; sd <= dBot; sd++) {
      for (var sc = centerC - 2; sc <= centerC + 2; sc++) {
        var sr = SKY_ROWS + sd;
        if (seamCellOk(sr, sc)) world[sr][sc] = { type: 'greatseam', hp: seamHp };
      }
    }
  }

  function earthLayerAllowsVoid(depth) {
    var layer = getLayerForDepth(depth);
    return !!(layer && !layer.requiresShield && !layer.requiresHeat && !layer.requiresBomb);
  }

  function canCarveEarthVoid(r, c) {
    if (c < 0 || c >= COLS) return false;
    if (r < SKY_ROWS + 3 || r >= BEDROCK_ROW) return false;
    if (!earthLayerAllowsVoid(r - SKY_ROWS)) return false;
    var row = world[r];
    var t = row && row[c];
    return !!(t && (t.type === 'dirt' || t.type === 'stone'));
  }

  function earthVoidHasNeighbor(r, c) {
    for (var rr = -1; rr <= 1; rr++) {
      for (var cc = -1; cc <= 1; cc++) {
        if (rr === 0 && cc === 0) continue;
        var row = world[r + rr];
        if (row && row[c + cc] === null) return true;
      }
    }
    return false;
  }

  function growEarthVoidPockets() {
    var seeds = [];
    for (var r = SKY_ROWS + 3; r < BEDROCK_ROW; r++) {
      if (!earthLayerAllowsVoid(r - SKY_ROWS)) continue;
      for (var c = 0; c < COLS; c++) {
        if (world[r] && world[r][c] === null) seeds.push({ r: r, c: c });
      }
    }

    for (var si = 0; si < seeds.length; si++) {
      var sr = seeds[si].r;
      var sc = seeds[si].c;
      if (tileHash01(sr, sc, 0xA170) < 0.38) continue;
      var big = tileHash01(sr, sc, 0xA171) > 0.72;
      var rx = (big ? 2.05 : 1.35) + tileHash01(sr, sc, 0xA172) * (big ? 0.70 : 0.35);
      var ry = (big ? 1.65 : 1.10) + tileHash01(sr, sc, 0xA173) * (big ? 0.65 : 0.35);
      if (tileHash01(sr, sc, 0xA174) > 0.5) {
        var tmp = rx;
        rx = ry;
        ry = tmp;
      }
      var reach = big ? 3 : 2;
      for (var dr = -reach; dr <= reach; dr++) {
        for (var dc = -reach; dc <= reach; dc++) {
          var tr = sr + dr;
          var tc = sc + dc;
          if (!canCarveEarthVoid(tr, tc)) continue;
          var wobble = (tileHash01(tr, tc, 0xA175) - 0.5) * 0.22;
          var nx = dc / rx;
          var ny = dr / ry;
          if (nx * nx + ny * ny + wobble < 1.0) world[tr][tc] = null;
        }
      }
    }

    for (var pr = SKY_ROWS; pr < BEDROCK_ROW; pr++) {
      if (!earthLayerAllowsVoid(pr - SKY_ROWS)) continue;
      for (var pc = 0; pc < COLS; pc++) {
        if (!world[pr] || world[pr][pc] !== null) continue;
        if (!earthVoidHasNeighbor(pr, pc) && tileHash01(pr, pc, 0xA176) < 0.72) {
          world[pr][pc] = { type: 'dirt', hp: ORES.dirt.hp };
        }
      }
    }
  }

  function addLiquidParticle(type, x, y, vx, vy, origin) {
    if (liquidCount >= LIQUID_MAX_PARTICLES) return -1;
    var id = liquidCount++;
    liquidMutationSeq++;   // v14.2 — flag the WebGPU solver to re-seed
    liquidType[id] = type === 'oil' ? 1 : 0;
    liquidOrigin[id] = origin || 0;
    liquidX[id] = x;
    liquidY[id] = y;
    liquidVX[id] = vx || 0;
    liquidVY[id] = vy || 0;
    liquidG00[id] = 0;
    liquidG01[id] = 0;
    liquidG10[id] = 0;
    liquidG11[id] = 0;
    liquidDensity[id] = LIQUID_DENSITY;
    liquidAeration[id] = 0;
    liquidSleeping[id] = 0;
    liquidFrozen[id] = 0;
    liquidRestFrames[id] = 0;
    liquidOrphanDwell[id] = 0;   // v24.175 — fresh particle is not yet a stray
    // v24.109 — log the add for the GPU op replay (see liquidOps in 020).
    if (liquidOps.length < LIQUID_OPS_MAX) {
      liquidOps.push(1, x, y, vx || 0, vy || 0, liquidType[id], liquidOrigin[id]);
    } else liquidOpsOverflow = true;
    return id;
  }

  function liquidSurfaceOriginForType(fluidType) {
    return fluidType === 'oil' ? 2 : 1;
  }

  function liquidSurfaceTargetForType(fluidType) {
    return fluidType === 'oil' ? LIQUID_SURFACE_OIL_TARGET : LIQUID_SURFACE_WATER_TARGET;
  }

  function liquidSetSurfaceTarget(fluidType, target) {
    target = Math.max(0, Math.min(LIQUID_SURFACE_PARTICLE_MAX, Math.round(target)));
    if (fluidType === 'oil') LIQUID_SURFACE_OIL_TARGET = target;
    else LIQUID_SURFACE_WATER_TARGET = target;
    liquidSyncSurfacePool(fluidType);
  }

  function makePondBasinTile() {
    return { type: 'stone', hp: ORES.stone.hp, pondBasin: 1 };
  }

  function surfaceBasinFloorY(pool, x) {
    var x0 = pool.left * TILE;
    var x1 = (pool.right + 1) * TILE;
    var span = Math.max(1, x1 - x0);
    var t = Math.max(0, Math.min(1, (x - x0) / span));
    var e = t * 2 - 1;
    var ellipse = Math.sqrt(Math.max(0, 1 - e * e));
    var lipY = pool.top * TILE + TILE * (0.42 + (pool.lipJitter || 0));
    var deepY = (pool.top + pool.maxDepth) * TILE + TILE * (0.14 + (pool.deepJitter || 0));
    var edgeFade = Math.sin(t * Math.PI);
    var wobble =
      Math.sin(t * Math.PI * 2 + pool.phase) * 2.2 +
      Math.sin(t * Math.PI * 5.3 + pool.phaseB) * 1.1 +
      (tileHash01(pool.top + Math.floor(t * 19), pool.left, 0xBADA) - 0.5) * 1.4;
    return lipY + (deepY - lipY) * Math.pow(ellipse, 0.74) + wobble * edgeFade;
  }

  function surfaceBasinSupportAt(pool, x) {
    var col = Math.max(pool.left, Math.min(pool.right, Math.floor(x / TILE)));
    var idx = col - pool.left;
    var floorRow = pool.top + Math.max(1, pool.depths[idx] || pool.maxDepth || 1);
    var t = world[floorRow] && world[floorRow][col];
    return !!(t && t.pondBasin);
  }

  // v10.100 GOLD — per-column basin lookup table. Built lazily on
  // first call, invalidated when surfacePondBasins changes (caller
  // bumps surfaceBasinByColVer). The walk over surfacePondBasins
  // was hot — called once per liquidWorldSolidAt × 4 per
  // liquidSolidAt × per particle ≈ 120k+ calls/frame in a stirred
  // pool. With 3 ponds + bbox check that was ~12 ops × 120k = 1.4M
  // ops/frame just for the basin lookup. Now: one array index.
  var surfaceBasinByCol = null;
  var surfaceBasinByColVer = -1;
  function rebuildSurfaceBasinByCol() {
    var arr = new Array(COLS);
    for (var i = 0; i < surfacePondBasins.length; i++) {
      var pool = surfacePondBasins[i];
      if (!pool || !pool.curved) continue;
      var lo = pool.left, hi = pool.right;
      for (var c = lo; c <= hi; c++) arr[c] = pool;
    }
    surfaceBasinByCol = arr;
    surfaceBasinByColVer = surfacePondBasins.length;  // simple invalidation: count change
  }
  function surfaceBasinAtPoint(x, y) {
    if (surfaceBasinByCol === null || surfaceBasinByColVer !== surfacePondBasins.length) {
      rebuildSurfaceBasinByCol();
    }
    var col = Math.floor(x / TILE);
    if (col < 0 || col >= COLS) return null;
    var pool = surfaceBasinByCol[col];
    if (!pool) return null;
    if (y < pool.top * TILE - 4 || y > (pool.top + pool.maxDepth + 1) * TILE) return null;
    return pool;
  }

  // v21.27: wake resting liquid when terrain is mined out from under or
  // beside it, so a settled pond drains into the tunnel you dig instead of
  // floating on its old basin floor. Sleeping water only re-wakes from a
  // neighbour cell's velocity. A removed floor tile imparts none, and the
  // miner's own wake kicks just the narrow column it passes through (which
  // falls away down the shaft before it can laterally nudge the rest of the
  // sleeping pond), so we wake the dig neighbourhood (water chasing you down
  // a shaft) plus, when the dig sits in a surface pond's column span, the
  // whole pond, so it drains as one connected body. Flipping the sleep bit
  // and bumping liquidMutationSeq makes the WebGPU solver re-seed the woken
  // state; gravity and the wake cascade do the rest. Frozen (off-screen)
  // particles are skipped; the active-region pass wakes those on arrival.
  function liquidWakeForDig(r, c) {
    if (!liquidCount) return;
    var cx = (c + 0.5) * TILE;
    var cy = (r + 0.5) * TILE;
    var x0 = cx - TILE * 3, x1 = cx + TILE * 3;
    var y0 = cy - TILE * 4, y1 = cy + TILE * 2.5;
    if (surfaceBasinByCol === null || surfaceBasinByColVer !== surfacePondBasins.length) {
      rebuildSurfaceBasinByCol();
    }
    var pool = (surfaceBasinByCol && c >= 0 && c < COLS) ? surfaceBasinByCol[c] : null;
    if (pool && r >= pool.top) {
      if (pool.left * TILE < x0) x0 = pool.left * TILE;
      if ((pool.right + 1) * TILE > x1) x1 = (pool.right + 1) * TILE;
      if (pool.top * TILE - TILE < y0) y0 = pool.top * TILE - TILE;
    }
    // v24.148 — same expansion for the streamed surface LAKES: a dig at a
    // lake's rim or floor wakes the WHOLE body (a breach should start
    // draining at once, not wait for the wave front to out-shout the wake
    // threshold cell by cell). Depth-aware: pond.d (old saves default 1).
    for (var wp = 0; wp < surfacePonds.length; wp++) {
      var wpd = surfacePonds[wp];
      if (!wpd.filled) continue;
      var wd = wpd.d || 1;
      if (c < wpd.cL - 1 || c > wpd.cR + 1) continue;
      if (r < SKY_ROWS - 1 || r > SKY_ROWS + wd) continue;
      if (wpd.cL * TILE < x0) x0 = wpd.cL * TILE;
      if ((wpd.cR + 1) * TILE > x1) x1 = (wpd.cR + 1) * TILE;
      if ((SKY_ROWS - 1) * TILE < y0) y0 = (SKY_ROWS - 1) * TILE;
      if ((SKY_ROWS + wd + 1) * TILE > y1) y1 = (SKY_ROWS + wd + 1) * TILE;
      break;
    }
    var woke = 0;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidFrozen[i] || !liquidSleeping[i]) continue;
      var px = liquidX[i], py = liquidY[i];
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      liquidSleeping[i] = 0;
      liquidRestFrames[i] = 0;
      // v24.109 — log the wake for the GPU op replay (see liquidOps in 020).
      if (liquidOps.length < LIQUID_OPS_MAX) {
        liquidOps.push(4, i, liquidType[i], liquidOrigin[i]);
      } else liquidOpsOverflow = true;
      woke++;
    }
    if (woke) liquidMutationSeq++;
  }

  function liquidWorldSolidAt(x, y) {
    var row = Math.floor(y / TILE);
    var col = Math.floor(x / TILE);
    var t = tileAt(row, col);
    var basin = surfaceBasinAtPoint(x, y);
    if (basin && surfaceBasinSupportAt(basin, x)) {
      if (y >= surfaceBasinFloorY(basin, x)) return true;
      if (t && t !== 'wall' && t.pondBasin) return false;
    }
    return t === 'wall' || t !== null;
  }

  function liquidCountSurfaceParticles(fluidType) {
    var origin = liquidSurfaceOriginForType(fluidType);
    var count = 0;
    for (var i = 0; i < liquidCount; i++) {
      if (liquidOrigin[i] === origin) count++;
    }
    return count;
  }

  function liquidAddSurfaceParticle(fluidType, idx, target, poolOverride) {
    var pool = poolOverride || liquidSurfacePools[fluidType];
    if (!pool) return -1;
    var margin = LIQUID_CELL * LIQUID_PDELTA * 2;
    var x0;
    var x1;
    var y0;
    var y1;
    if (pool.curved) {
      x0 = pool.left * TILE + margin;
      x1 = (pool.right + 1) * TILE - margin;
      y0 = pool.top * TILE + margin;
      y1 = (pool.top + pool.maxDepth + 0.2) * TILE - margin;
      var cw = Math.max(1, x1 - x0);
      var ch = Math.max(1, y1 - y0);
      var ccols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, target) * cw / ch)));
      var crows = Math.max(1, Math.ceil(Math.max(1, target) / ccols));
      var ccol = idx % ccols;
      var crow = Math.floor(idx / ccols) % crows;
      var csalt = fluidType === 'oil' ? 0x0A17 : 0x0A18;
      var cjx = (tileHash01(crow, ccol, csalt) - 0.5) * 0.34;
      var cjy = (tileHash01(crow, ccol, csalt + 3) - 0.5) * 0.34;
      var cpx = x0 + (ccol + 0.5 + cjx) * (cw / ccols);
      // Clamp the deepest placement ABOVE the solid basin-floor tile. The basin
      // curve (surfaceBasinFloorY) was tuned for 2-deep ponds and dips ~0.14
      // tile INTO the floor tile, so without this it spawns particles inside the
      // solid floor: they eject (the land/shoot/repeat glitch), and a 1-deep
      // pond, whose whole column sits in that range, loses nearly all its water.
      var _fcol = Math.max(0, Math.min(pool.depths.length - 1, ((cpx / TILE) | 0) - pool.left));
      var _solidTopY = (pool.top + (pool.depths[_fcol] || pool.maxDepth)) * TILE - margin;
      var floorY = Math.min(surfaceBasinFloorY(pool, cpx) - margin, _solidTopY);
      var cy0 = y0;
      var cy1 = Math.max(cy0 + 1, floorY);
      var cpy = cy0 + (crow + 0.5 + cjy) * ((cy1 - cy0) / crows);
      cpx = Math.max(x0, Math.min(x1, cpx));
      cpy = Math.max(cy0, Math.min(cy1, cpy));
      return addLiquidParticle(fluidType, cpx, cpy, 0, 0, liquidSurfaceOriginForType(fluidType));
    } else if (pool.depths && pool.depths.length) {
      var totalCells = 0;
      for (var di = 0; di < pool.depths.length; di++) totalCells += pool.depths[di];
      if (totalCells <= 0) return -1;
      var cellPick = idx % totalCells;
      var colPick = 0;
      while (colPick < pool.depths.length && cellPick >= pool.depths[colPick]) {
        cellPick -= pool.depths[colPick];
        colPick++;
      }
      x0 = (pool.left + colPick) * TILE + margin;
      x1 = (pool.left + colPick + 1) * TILE - margin;
      y0 = (pool.top + cellPick) * TILE + margin;
      y1 = (pool.top + cellPick + 1) * TILE - margin;
    } else {
      x0 = pool.left * TILE + margin;
      x1 = (pool.right + 1) * TILE - margin;
      y0 = pool.top * TILE + margin;
      y1 = (pool.bottom + 1) * TILE - margin;
    }
    var w = Math.max(1, x1 - x0);
    var h = Math.max(1, y1 - y0);
    var cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, target) * w / h)));
    var rows = Math.max(1, Math.ceil(Math.max(1, target) / cols));
    var col = idx % cols;
    var row = Math.floor(idx / cols) % rows;
    var salt = fluidType === 'oil' ? 0x0A17 : 0x0A18;
    var jitterX = (tileHash01(row, col, salt) - 0.5) * 0.34;
    var jitterY = (tileHash01(row, col, salt + 3) - 0.5) * 0.34;
    var px = x0 + (col + 0.5 + jitterX) * (w / cols);
    var py = y0 + (row + 0.5 + jitterY) * (h / rows);
    px = Math.max(x0, Math.min(x1, px));
    py = Math.max(y0, Math.min(y1, py));
    return addLiquidParticle(fluidType, px, py, 0, 0, liquidSurfaceOriginForType(fluidType));
  }

  function liquidSyncSurfacePool(fluidType) {
    if (!liquidSurfacePools[fluidType]) return;
    var origin = liquidSurfaceOriginForType(fluidType);
    var target = liquidSurfaceTargetForType(fluidType);
    var current = liquidCountSurfaceParticles(fluidType);

    while (current > target) {
      var removed = false;
      for (var i = liquidCount - 1; i >= 0; i--) {
        if (liquidOrigin[i] !== origin) continue;
        removeLiquidParticle(i);
        current--;
        removed = true;
        break;
      }
      if (!removed) break;
    }

    while (current < target && liquidCount < LIQUID_MAX_PARTICLES) {
      if (liquidAddSurfaceParticle(fluidType, current, target) < 0) break;
      current++;
    }
  }

  function carveSurfacePool(left, right, fluidType, particleBudget, depthTiles) {
    var top = DECK_ROW;
    var width = right - left + 1;
    var depths = [];
    var maxDepth = 0;
    for (var di = 0; di < width; di++) {
      var d = depthTiles && depthTiles.length ? depthTiles[di] : depthTiles;
      d = Math.max(1, Math.round(d || 3));
      depths.push(d);
      if (d > maxDepth) maxDepth = d;
    }
    var bottom = DECK_ROW + maxDepth - 1;
    if (left < 2 || right >= COLS - 2) return;

    for (var c = left - 1; c <= right + 1; c++) {
      if (world[top - 1]) world[top - 1][c] = null;
    }
    for (var r = top; r <= bottom; r++) {
      if (!world[r]) continue;
      for (var cc = left; cc <= right; cc++) {
        var cd = depths[cc - left];
        world[r][cc] = (r < top + cd) ? null : makePondBasinTile();
      }
      world[r][left - 1] = makePondBasinTile();
      world[r][right + 1] = makePondBasinTile();
    }
    for (var bc = left; bc <= right; bc++) {
      var floorRow = top + depths[bc - left];
      if (world[floorRow]) world[floorRow][bc] = makePondBasinTile();
    }
    if (world[bottom + 1]) {
      world[bottom + 1][left - 1] = makePondBasinTile();
      world[bottom + 1][right + 1] = makePondBasinTile();
    }

    var pool = {
      left: left,
      right: right,
      top: top,
      bottom: bottom,
      depths: depths,
      maxDepth: maxDepth,
      curved: fluidType === 'water',
      phase: tileHash01(top, left, 0xC1B0) * Math.PI * 2,
      phaseB: tileHash01(top, right, 0xC1B1) * Math.PI * 2,
      lipJitter: (tileHash01(top, left, 0xC1B2) - 0.5) * 0.10,
      deepJitter: (tileHash01(top, right, 0xC1B3) - 0.5) * 0.08
    };
    if (pool.curved) surfacePondBasins.push(pool);
    liquidSurfacePools[fluidType] = pool;
    if (typeof particleBudget === 'number') {
      for (var pi = 0; pi < particleBudget && liquidCount < LIQUID_MAX_PARTICLES; pi++) {
        liquidAddSurfaceParticle(fluidType, pi, particleBudget, pool);
      }
    } else {
      liquidSyncSurfacePool(fluidType);
    }
  }

  // v10.103 — run the sim a bunch of steps right after carving the
  // ponds so they're already settled when the miner walks up. One-
  // time cost at world init (~300–500ms). Skips liquidUpdateActiveRegion
  // (cam not relevant here) so every particle processes every step.
  // Early-outs as soon as everything's asleep.
  function liquidPreSettle(maxSteps) {
    if (!liquidCount) return;
    // v24.10 — settle at the small SUBSTEP dt (equilibrium compression ∝ stepDt²)
    // so the pool is born at ~rest density and the live GPU sim has nothing to
    // relax on first frame (no spawn churn). maxSteps is in frame-equivalents;
    // scale the budget by the substep factor so the same sim-time elapses.
    var stepDt = LIQUID_SUBSTEP_DT;
    var subFactor = Math.max(1, Math.round((1 / 60) / stepDt));
    var steps = (maxSteps || 80) * subFactor;
    for (var s = 0; s < steps; s++) {
      liquidP2G(stepDt);
      liquidApplyGridPressure();
      liquidUpdateGrid(stepDt);
      liquidG2P(stepDt);
      for (var mi = liquidCount - 1; mi >= 0; mi--) {
        if (liquidSleeping[mi]) continue;
        if (!liquidMoveParticle(mi, stepDt)) removeLiquidParticle(mi);
      }
      if (s > 20 * subFactor && (s & 3) === 0) {
        var anyAwake = false;
        for (var i = 0; i < liquidCount; i++) {
          if (!liquidSleeping[i]) { anyAwake = true; break; }
        }
        if (!anyAwake) break;
      }
    }
  }

  function generateSurfacePonds() {
    function pondParticles(depths) {
      var cells = 0;
      for (var i = 0; i < depths.length; i++) cells += depths[i];
      return Math.round(cells * LIQUID_SURFACE_WATER_PARTICLES_PER_TILE);
    }
    // Single LEFT pool anchored at the map's left edge (col 2 is the leftmost
    // carveSurfacePool allows; col 1 becomes its containing wall), carved 1 tile deep.
    // WIDTH is capped at 44 so the 1-deep fill (width*1*400 = 17600 particles) stays
    // well UNDER the 40000-particle cap. (History: a 2-deep fill at the old ~50-wide
    // blew the cap and only the top tile filled, dropping the player through.)
    // Right edge (col 45) stays well clear of the spawn deck.
    var left = 2;
    var rightEdge = left + 43;      // width 44
    var depthPerCol = 1;            // 1 tile deep
    var width = rightEdge - left + 1;
    var depths = [];
    for (var d = 0; d < width; d++) {
      depths.push(depthPerCol);
    }
    carveSurfacePool(left, rightEdge, 'water', pondParticles(depths), depths);
    // v10.103 — settle the pools at world init so they're calm by
    // the time the player approaches. v10.107 — back to 80 steps
    // (small ponds settle faster).
    liquidPreSettle(80);
  }

  function oilPocketAllowedTile(r, c) {
    if (c < 2 || c >= COLS - 2) return false;
    if (r < SKY_ROWS + 10 || r >= BEDROCK_ROW - 4) return false;
    var layer = getLayerForDepth(r - SKY_ROWS);
    if (!layer || layer.requiresBomb || layer.requiresShield || layer.name === 'permafrost') return false;
    if (c >= DECK_LEFT_COL - 8 && c <= DECK_RIGHT_COL + 8 && r < SKY_ROWS + 24) return false;
    var t = world[r] && world[r][c];
    if (!t) return true;
    return t.type !== 'foundation' &&
           t.type !== 'barrier' &&
           t.type !== 'bedrock';
  }

  function generateOilPockets() {
    if (!ENABLE_OIL) return;   // oil disabled: place no oil seams (also not called in the live path)
    var made = 0;
    var attempts = 0;

    function carveOilPocket(centerR, centerC, rx, ry, budgetOverride) {
      var reachX = Math.ceil(rx + 1);
      var reachY = Math.ceil(ry + 1);
      var clearCells = [];
      for (var dr = -reachY; dr <= reachY; dr++) {
        for (var dc = -reachX; dc <= reachX; dc++) {
          var r = centerR + dr;
          var c = centerC + dc;
          if (!oilPocketAllowedTile(r, c)) continue;
          var nx = dc / rx;
          var ny = dr / ry;
          var wobble = (tileHash01(r, c, 0x0110) - 0.5) * 0.20;
          if (nx * nx + ny * ny + wobble < 1.0) clearCells.push({ r: r, c: c });
        }
      }
      if (clearCells.length < 8) return false;
      for (var i = 0; i < clearCells.length; i++) {
        var cell = clearCells[i];
        if (world[cell.r]) world[cell.r][cell.c] = null;
      }
      var particleBudget = budgetOverride || Math.min(3600, Math.max(1500, clearCells.length * 90));
      for (var pi = 0; pi < particleBudget; pi++) {
        var src = clearCells[Math.floor(Math.random() * clearCells.length)];
        var px = src.c * TILE + 4 + Math.random() * (TILE - 8);
        var py = src.r * TILE + TILE * 0.30 + Math.random() * (TILE * 0.62);
        addLiquidParticle('oil', px, py, (Math.random() - 0.5) * 10, -Math.random() * 8);
      }
      return true;
    }

    // One small early pocket near the station gives the pump a discoverable
    // first use without forcing players to roam the whole world for oil.
    if (carveOilPocket(SKY_ROWS + 26, DECK_RIGHT_COL + 12, 3.6, 2.0, 2400)) made++;

    while (made < 7 && attempts < 180) {
      attempts++;
      var depth = 18 + Math.floor(Math.random() * 46);
      var layer = getLayerForDepth(depth);
      if (!layer || layer.requiresBomb || layer.requiresShield || layer.name === 'permafrost') continue;
      var centerR = SKY_ROWS + depth;
      var centerC = 8 + Math.floor(Math.random() * (COLS - 16));
      var rx = 2.6 + Math.random() * 4.2;
      var ry = 1.5 + Math.random() * 2.5;
      if (carveOilPocket(centerR, centerC, rx, ry)) made++;
    }
  }

  // ----- Jello patches -----
  // Scatter single 'jello' tiles (squishy slimes) through the diggable rock.
  // v25.64 (owner): every buried slime is EXACTLY ONE tile. No more grown
  // clusters (they read as random 2..15-tile globs of different sizes); each
  // seed places one isolated tile, and a seed touching existing jello is
  // rejected so two slimes never share an edge (an edge touch would flood-fill
  // into one 2-tile body on activation, breaking the one-tile rule).
  // v25.59 — density of the scattered buried slimes, as a chance per diggable
  // tile. Each slime spans exactly one column, so a straight-down 1-tile shaft
  // meets about chance*150 of them per 150 m. Owner dialed the rareness down to
  // 0.0035, so roughly one buried slime every ~285 m of descent, down from the
  // ~1-per-150 m the old 0.0068 gave. Rare enough to read as a real find;
  // ?jello=0 removes them entirely; scale this to taste.
  var JELLO_PATCH_CHANCE = 0.0035;
  function generateJelloPatches() {
    resetJello();
    if (!ENABLE_JELLO) return;   // jello disabled: reset but place no patches
    function jelloCellOk(r, c) {
      if (c < 3 || c >= COLS - 3) return false;
      if (r < SKY_ROWS || r >= BEDROCK_ROW) return false;
      var row = world[r];
      if (!row) return false;
      var t = row[c];
      if (!t) return false;                  // don't seed jello into open caves
      if (t.type === 'foundation' || t.type === 'barrier' ||
          t.type === 'bedrock' || t.type === 'jello') return false;
      return true;
    }
    // Scatter single-tile slimes through every town, at JELLO_PATCH_CHANCE per
    // diggable tile. Region-aware (works for the single town and the wide
    // multitown world alike): each town gets its own floor + column span, and
    // slimes start a couple of metres under the surface so the station apron
    // never sits on gel. jelloCellOk rejects air / bedrock / foundation, so a
    // seed that misses is just retried.
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var reg = REGIONS[ri];
      if (reg.kind !== REGION_TOWN) continue;
      var ti = (reg.townIndex >= 0 && reg.townIndex < TOWN_DEPTHS.length) ? reg.townIndex : 0;
      var floor = TOWN_DEPTHS[ti];               // diggable depth in rows (= metres)
      var width = reg.c1 - reg.c0;
      var seeds = Math.round(width * floor * JELLO_PATCH_CHANCE);
      var placed = 0, tries = 0;
      while (placed < seeds && tries < seeds * 16) {
        tries++;
        var sr = SKY_ROWS + 3 + Math.floor(Math.random() * (floor - 3));
        var sc = reg.c0 + Math.floor(Math.random() * width);
        if (!jelloCellOk(sr, sc)) continue;
        // Every slime is EXACTLY ONE tile, no cluster growth. Reject a spot that
        // shares an edge with existing jello: an edge touch flood-fills into one
        // 2-tile body on activation, which is the "different sizes" the owner
        // called out. (4-neighbours only, a diagonal jello tile activates as its
        // own separate body, so a corner touch is fine.)
        if ((world[sr - 1] && world[sr - 1][sc] && world[sr - 1][sc].type === 'jello') ||
            (world[sr + 1] && world[sr + 1][sc] && world[sr + 1][sc].type === 'jello') ||
            (world[sr][sc - 1] && world[sr][sc - 1].type === 'jello') ||
            (world[sr][sc + 1] && world[sr][sc + 1].type === 'jello')) continue;
        // One jelly TYPE per slime (v24.154, owner: vary the underground ones in
        // colours like the test-pen set). JELLO_TYPES lives in 340 (hoisted var,
        // assigned before init() runs); the type rides on the tile (render hue +
        // activation), and the save palette carries it as 'jello#<type>' (047).
        var jType = (typeof JELLO_TYPE_KEYS !== 'undefined' && JELLO_TYPE_KEYS.length)
                    ? JELLO_TYPE_KEYS[Math.floor(Math.random() * JELLO_TYPE_KEYS.length)] : null;
        var jTile = { type: 'jello', hp: 999999 };
        if (jType) jTile.jellyType = jType;
        world[sr][sc] = jTile;
        placed++;
      }
    }
  }

  // ----- Lake-shore slimes (v25.68) -----
  // A few single 'jello' tiles perch ABOVE GROUND on the banks of every surface
  // lake (owner request: slimes by the water, mobile + desktop). Each is EXACTLY
  // ONE tile, the same one-tile rule as the buried slimes: it sits at row
  // SKY_ROWS-1 (the sky cell directly on top of the shore) resting on the solid
  // bank, so it reads as a little slime on the grass at the water's edge. Placed
  // AFTER the pit + walls are carved. They wake into live soft bodies the instant
  // the player digs the ground out from under one (or digs it directly), like the
  // buried slimes. Spaced >=2 cols apart so no two share an edge (an edge touch
  // would flood-fill into one 2-tile body, breaking the one-tile rule).
  // ENABLE_JELLO gated so ?jello=0 clears them too.
  function seedLakeShoreSlimes(cL, cR) {
    if (!ENABLE_JELLO) return;
    var aboveR = SKY_ROWS - 1;                 // the sky cell directly on top of the shore surface
    if (aboveR < 0) return;
    var above = world[aboveR], ground = world[aboveR + 1];   // ground = row SKY_ROWS, the shore surface
    if (!above || !ground) return;
    // Two perches per bank: snug against the wall, then one gap further out. Never
    // the wall (cL-1 / cR+1) or the water (cL..cR); the 2-col spacing keeps each
    // slime a separate one-tile creature.
    var cols = [cL - 2, cL - 4, cR + 2, cR + 4];
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (c < 3 || c >= COLS - 3) continue;
      if (c >= DECK_LEFT_COL - 1 && c <= DECK_RIGHT_COL + 1) continue;   // clear of the station apron
      if (above[c] != null) continue;                                   // the perch must be open sky
      var g = ground[c];
      if (!g || (g.type !== 'dirt' && g.type !== 'stone')) continue;     // rest on solid shore only
      // One-tile rule: never let a perch share an edge with existing jello.
      if ((above[c - 1] && above[c - 1].type === 'jello') ||
          (above[c + 1] && above[c + 1].type === 'jello')) continue;
      var jType = (typeof JELLO_TYPE_KEYS !== 'undefined' && JELLO_TYPE_KEYS.length)
                  ? JELLO_TYPE_KEYS[(Math.random() * JELLO_TYPE_KEYS.length) | 0] : null;
      var jTile = { type: 'jello', hp: 999999 };
      if (jType) jTile.jellyType = jType;
      above[c] = jTile;
    }
  }

  // ----- Ore vein deposit (WORLD_DESIGN §0/§3) -----
  // Inject the per-town ore set into settled rock AFTER the cave CA + void
  // carve, so the ore never perturbs terrain shaping and each placed ore still
  // gets its host ring (lockOreHostRing runs next). Regulars (TOWN_ORES vein:N)
  // grow as connected seams the player follows; specials (scatter) drop as
  // isolated single tiles. Only dirt/stone are overwritten (never air, an ore
  // already placed, foundation, bedrock, barrier or voidrock). Abundance is
  // preserved from the legacy per-tile roll: a band's target tile count is
  //   width * bandHeight * chance * EARTH_ORE_SPAWN_MULTIPLIER * meanDepthBoost,
  // where meanDepthBoost ~= the average of the old (1 + (depth-minDepth)*0.002)
  // ramp over the band; vein size only sets clumping, not how much ore exists.
  function depositOreVeins() {
    for (var ri = 0; ri < REGIONS.length; ri++) {
      var reg = REGIONS[ri];
      if (reg.kind !== REGION_TOWN) continue;
      var ti = (reg.townIndex >= 0 && reg.townIndex < TOWN_ORES.length) ? reg.townIndex : 0;
      var stack = TOWN_ORES[ti];
      var floor = TOWN_DEPTHS[ti];
      var width = reg.c1 - reg.c0;
      for (var ei = 0; ei < stack.length; ei++) {
        var e = stack[ei];
        var ore = ORES[e.type];
        if (!ore) continue;
        var bandTop = Math.max(e.minDepth, 0);
        var bandBot = Math.min(e.maxDepth, floor);
        if (bandBot <= bandTop) continue;
        var bandH = bandBot - bandTop;
        var meanBoost = 1 + bandH * 0.001;   // mean of the old per-tile depthBoost
        var target = width * bandH * e.chance * EARTH_ORE_SPAWN_MULTIPLIER * meanBoost;
        if (e.scatter) {
          // Special: isolated single tiles scattered through the band.
          var n = Math.round(target);
          for (var k = 0; k < n; k++) {
            var sc = reg.c0 + ((Math.random() * width) | 0);
            var sr = SKY_ROWS + bandTop + ((Math.random() * bandH) | 0);
            var srow = world[sr];
            var st = srow && srow[sc];
            if (st && (st.type === 'dirt' || st.type === 'stone')) srow[sc] = { type: e.type, hp: ore.hp, shiny: Math.random() < SHINY_ORE_CHANCE };
          }
        } else {
          // Regular: seed-and-grow connected veins.
          var vsize = e.vein || 4;
          var nVeins = Math.max(1, Math.round(target / vsize));
          for (var v = 0; v < nVeins; v++) {
            var oc = reg.c0 + ((Math.random() * width) | 0);
            var orow = SKY_ROWS + bandTop + ((Math.random() * bandH) | 0);
            growVein(e.type, ore.hp, orow, oc, vsize, reg.c0, reg.c1, bandTop, bandBot);
          }
        }
      }
    }
  }

  // Grow one connected vein from (r0,c0): a random walk over the current
  // frontier that converts dirt/stone to ore, of size ~[vsize/2 .. vsize*1.5],
  // staying inside [c0lim,c1lim) columns and [bandTop,bandBot) depth. Picking a
  // random frontier cell each step keeps the blob compact and isotropic (no
  // directional tendrils). Skips if the origin is not diggable rock.
  function growVein(type, hp, r0, c0, vsize, c0lim, c1lim, bandTop, bandBot) {
    var row0 = world[r0];
    var first = row0 && row0[c0];
    if (!first || (first.type !== 'dirt' && first.type !== 'stone')) return;
    var want = (vsize >> 1) + 1 + ((Math.random() * vsize) | 0);
    row0[c0] = { type: type, hp: hp, shiny: Math.random() < SHINY_ORE_CHANCE };
    var frontier = [r0 * 100000 + c0];
    var placed = 1, guard = 0, cap = want * 8;
    var DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];
    while (placed < want && frontier.length && guard++ < cap) {
      var key = frontier[(Math.random() * frontier.length) | 0];
      var cr = (key / 100000) | 0, cc = key - cr * 100000;
      var d = (Math.random() * 4) | 0;
      var nr = cr + DR[d], nc = cc + DC[d];
      var nd = nr - SKY_ROWS;
      if (nc < c0lim || nc >= c1lim || nd < bandTop || nd >= bandBot) continue;
      var nrow = world[nr];
      var nt = nrow && nrow[nc];
      if (nt && (nt.type === 'dirt' || nt.type === 'stone')) {
        nrow[nc] = { type: type, hp: hp, shiny: Math.random() < SHINY_ORE_CHANCE };
        frontier.push(nr * 100000 + nc);
        placed++;
      }
    }
  }

