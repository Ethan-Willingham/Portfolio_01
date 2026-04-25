/* ============================================================
   DEEP MINER – A Motherload-style mining game
   Canvas-based, touch + mouse, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  /* ---- Constants ---- */
  var TILE = 32;
  var COLS = 40;
  var SKY_ROWS = 4;
  var WORLD_ROWS = 200;
  var TOTAL_ROWS = SKY_ROWS + WORLD_ROWS;
  var PLAYER_W = 22;
  var PLAYER_H = 26;
  var GRAVITY = 600;
  var MOVE_SPEED = 160;
  var DRILL_TIME = 0.25;
  var FUEL_DRAIN = 0.8;
  var DRILL_FUEL = 1.5;
  var BASE_HULL = 100;
  var UI_FONT = '"SF Mono", "Cascadia Code", "Fira Code", Consolas, Monaco, monospace';

  /* ---- Station deck (elevated platform) ----
     The shop and pump pad sit on an unminable platform a couple tiles above
     the surface, so you can always land back at the base even if you've
     mined out the dirt directly below it. The deck spans a fixed range of
     columns; you drive off either side to start mining and jetpack back up
     to return. */
  var DECK_ROW = SKY_ROWS - 1;                 // tile row of the deck top surface
  var DECK_HALF_WIDTH = 5;                     // tiles to each side of station center
  var DECK_CENTER_COL = Math.floor(COLS / 2) - 1;
  var DECK_LEFT_COL = DECK_CENTER_COL - DECK_HALF_WIDTH;
  var DECK_RIGHT_COL = DECK_CENTER_COL + DECK_HALF_WIDTH;

  /* ---- Ore definitions ----
     Each ore has:
       - color, value, hp (drill hits)
       - minDepth / maxDepth: depth range where it can spawn (in tiles below surface)
       - chance: base spawn weight
       - layerOnly: optional layer key to restrict spawning
       - reqDrill: minimum drillLevel needed to mine (else: bounces)
       - reqHeat: requires Heated Drill upgrade
  */
  var ORES = {
    // Common rubble (both worthless, dirt is skipped from cargo)
    dirt:       { color: '#6B4226', value: 0,     minDepth: 0,   maxDepth: 999, chance: 0.45, hp: 1, label: 'Dirt' },
    stone:      { color: '#7A7A7A', value: 0,     minDepth: 0,   maxDepth: 999, chance: 0.22, hp: 2, label: 'Stone' },

    // Station deck plating — solid, unminable. Spawned at fixed positions only.
    platform:   { color: '#3a3f4a', value: 0,     minDepth: 0,   maxDepth: 0,   chance: 0,    hp: 999999, label: 'Platform' },

    // Shallow ores (0–35m)
    coal:       { color: '#1c1c1c', value: 5,     minDepth: 2,   maxDepth: 60,  chance: 0.10, hp: 2, label: 'Coal' },
    copper:     { color: '#D4883A', value: 12,    minDepth: 4,   maxDepth: 70,  chance: 0.08, hp: 2, label: 'Copper' },
    bauxite:    { color: '#B85a3a', value: 25,    minDepth: 10,  maxDepth: 80,  chance: 0.06, hp: 3, label: 'Bauxite' },
    iron:       { color: '#A0A0B8', value: 35,    minDepth: 15,  maxDepth: 110, chance: 0.05, hp: 3, label: 'Iron' },
    pyrite:     { color: '#D4B33A', value: 60,    minDepth: 22,  maxDepth: 100, chance: 0.025,hp: 3, label: 'Pyrite', tooltip: "Fool's Gold" },
    silver:     { color: '#D8D8E8', value: 90,    minDepth: 30,  maxDepth: 130, chance: 0.025,hp: 3, label: 'Silver' },

    // Permafrost layer ores (35–55m) — frozen in ice, need heated drill
    methaneice: { color: '#bfe6ff', value: 180,   minDepth: 38,  maxDepth: 56,  chance: 0.04, hp: 4, label: 'Methane Ice', reqHeat: true },

    // Fossil layer (55–80m)
    amber:      { color: '#e89a2a', value: 350,   minDepth: 56,  maxDepth: 95,  chance: 0.025,hp: 3, label: 'Amber', tooltip: 'Insect inside' },
    trilobite:  { color: '#7a5436', value: 600,   minDepth: 60,  maxDepth: 95,  chance: 0.012,hp: 4, label: 'Trilobite' },

    // Deep ores (60–110m)
    cinnabar:   { color: '#c12838', value: 140,   minDepth: 50,  maxDepth: 130, chance: 0.022,hp: 4, label: 'Cinnabar', tooltip: 'Mercury ore' },
    gold:       { color: '#FFD700', value: 200,   minDepth: 45,  maxDepth: 140, chance: 0.022,hp: 4, label: 'Gold' },
    uranium:    { color: '#5fff5a', value: 800,   minDepth: 80,  maxDepth: 160, chance: 0.012,hp: 5, label: 'Uranium', tooltip: 'Radioactive', reqDrill: 3 },

    // Magma layer (110–145m) — hostile, hull drains without heat shield
    obsidian:   { color: '#1a0a18', value: 280,   minDepth: 100, maxDepth: 200, chance: 0.03, hp: 4, label: 'Obsidian' },

    // Crystal caves (145–180m)
    emerald:    { color: '#50C878', value: 900,   minDepth: 70,  maxDepth: 180, chance: 0.014,hp: 5, label: 'Emerald' },
    ruby:       { color: '#E0115F', value: 1400,  minDepth: 90,  maxDepth: 190, chance: 0.011,hp: 5, label: 'Ruby' },
    tanzanite:  { color: '#7a5fff', value: 2000,  minDepth: 130, maxDepth: 200, chance: 0.008,hp: 5, label: 'Tanzanite', reqDrill: 3 },
    diamond:    { color: '#B9F2FF', value: 3000,  minDepth: 130, maxDepth: 200, chance: 0.007,hp: 6, label: 'Diamond', reqDrill: 4 },

    // Endgame
    painite:    { color: '#d36b8c', value: 6000,  minDepth: 165, maxDepth: 200, chance: 0.004,hp: 7, label: 'Painite', tooltip: 'Rarest gem on Earth', reqDrill: 5 },
    unobtanium: { color: '#FF00FF', value: 12000, minDepth: 180, maxDepth: 200, chance: 0.002,hp: 9, label: 'Unobtanium', reqDrill: 6 },
  };
  var ORE_KEYS = Object.keys(ORES);

  /* ---- Layers ---- */
  // Each layer is a depth range with its own background tint and special behavior.
  // Order matters: first match wins.
  var LAYERS = [
    { name: 'topsoil',    minDepth: 0,   maxDepth: 15,  bg: '#1a1008', tint: null },
    { name: 'bedrock',    minDepth: 15,  maxDepth: 35,  bg: '#161a1d', tint: null },
    { name: 'permafrost', minDepth: 35,  maxDepth: 55,  bg: '#0c1a26', tint: '#d2eaff', requiresHeat: true },
    { name: 'fossil',     minDepth: 55,  maxDepth: 80,  bg: '#1a1612', tint: null },
    { name: 'deepcrust',  minDepth: 80,  maxDepth: 110, bg: '#13110e', tint: null },
    { name: 'magma',      minDepth: 110, maxDepth: 145, bg: '#220804', tint: '#ff5a1a', dangerous: true, requiresShield: true },
    { name: 'crystal',    minDepth: 145, maxDepth: 180, bg: '#0e0a1c', tint: '#9fb3ff' },
    { name: 'mantle',     minDepth: 180, maxDepth: 999, bg: '#1a0608', tint: '#ff2030', dangerous: true, requiresShield: true },
  ];

  function getLayerForDepth(depth) {
    for (var i = 0; i < LAYERS.length; i++) {
      if (depth >= LAYERS[i].minDepth && depth < LAYERS[i].maxDepth) return LAYERS[i];
    }
    return LAYERS[LAYERS.length - 1];
  }

  /* ---- Game State ---- */
  var world = [];
  var cam = { x: 0, y: 0 };
  var player = {};
  var upgrades = {
    drillLevel: 1,
    fuelLevel: 1,
    hullLevel: 1,
    cargoLevel: 1,
    heatLevel: 0,    // 0 = no heated drill, 1 = owns it (binary upgrade)
    shieldLevel: 0,  // 0 = no heat shield, 1+ = tiers reduce magma damage
    vertLevel: 0,    // 0 = no upward drill, 1 = owns it (binary upgrade)
  };
  var shop = {
    drill:  [0, 200, 600, 1500, 4000, 10000, 25000],
    fuel:   [0, 150, 500, 1200, 3000, 8000, 20000],
    hull:   [0, 250, 700, 1800, 5000, 12000, 30000],
    cargo:  [0, 300, 800, 2000, 5500, 14000, 35000],
    heat:   [1500],          // single purchase: heated drill
    shield: [4000, 9000],    // shield tier 1 (reduce magma dmg), tier 2 (immune)
    vert:   [2500],          // single purchase: drill upward
  };
  var money = 0;
  var cargo = [];
  var maxCargo = 5;
  var maxFuel = 30;
  var drilling = null;
  var gameOver = false;
  var shopOpen = false;
  var msgTimer = 0;
  var msgText = '';
  var drillBlockMsgCool = 0;
  var magmaWarnTimer = 0;
  var lastLayer = null;
  var layerBanner = null;
  var screenW, screenH;
  var scale = 1;
  var keys = {};
  var touch = { active: false, x: 0, y: 0, startX: 0, startY: 0 };
  var dpad = { left: false, right: false, up: false, down: false };
  var lastTime = 0;
  var depthRecord = 0;
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var DPAD_SIZE, DPAD_CX, DPAD_CY, DPAD_BTN;

  /* ---- World Generation ---- */
  function generateWorld() {
    world = [];
    for (var r = 0; r < TOTAL_ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        if (r < SKY_ROWS) {
          row.push(null);
        } else {
          var depth = r - SKY_ROWS;
          var tile = pickOre(depth);
          row.push(tile);
        }
      }
      world.push(row);
    }
    // Lay down the unminable deck platform a tile above the surface.
    // The shop and pump pad sit on this deck so they can never be stranded
    // by mining out the dirt directly underneath.
    for (var pc = DECK_LEFT_COL; pc <= DECK_RIGHT_COL; pc++) {
      if (pc >= 0 && pc < COLS) {
        world[DECK_ROW][pc] = { type: 'platform', hp: 999999 };
      }
    }
  }

  function pickOre(depth) {
    var layer = getLayerForDepth(depth);

    // In permafrost: tile is "ice" (a recolored dirt-like block) plus methane ice deposits
    // We model permafrost by overriding dirt -> stone-with-ice color via the layer tint at draw time,
    // but ore spawning still uses the normal weighted roll restricted to ores valid at this depth.
    var candidates = [];
    for (var i = 0; i < ORE_KEYS.length; i++) {
      var k = ORE_KEYS[i];
      var o = ORES[k];
      if (depth >= o.minDepth && depth < (o.maxDepth || 999)) candidates.push(k);
    }
    var r = Math.random();
    // Walk from rarest (last) to most common; the rare-first ordering still works
    var cumul = 0;
    for (var j = candidates.length - 1; j >= 0; j--) {
      var ore = ORES[candidates[j]];
      // Slight depth weighting
      var depthBoost = 1 + Math.max(0, depth - ore.minDepth) * 0.002;
      var adjustedChance = ore.chance * depthBoost;
      cumul += adjustedChance;
      if (r < cumul / (cumul + 1)) {
        return { type: candidates[j], hp: ore.hp };
      }
    }
    // Air pocket — but never in magma/permafrost (those are denser layers)
    if (!layer.requiresShield && !layer.requiresHeat && Math.random() < 0.10) return null;
    return { type: 'dirt', hp: ORES.dirt.hp };
  }

  /* ---- Init ---- */
  function init() {
    generateWorld();
    money = 0;
    cargo = [];
    upgrades = { drillLevel: 1, fuelLevel: 1, hullLevel: 1, cargoLevel: 1, heatLevel: 0, shieldLevel: 0, vertLevel: 0 };
    maxCargo = getMaxCargo();
    maxFuel = getMaxFuel();
    player = {
      // Start standing on top of the deck, near the shop end
      x: (DECK_CENTER_COL - 2) * TILE + TILE / 2 - PLAYER_W / 2,
      y: DECK_ROW * TILE - PLAYER_H,
      vx: 0, vy: 0,
      fuel: maxFuel,
      hull: getMaxHull(),
      onGround: false,
      dir: 1,
      thrusting: false,
      refueling: false,
      squash: 0,
    };
    drilling = null;
    gameOver = false;
    shopOpen = false;
    depthRecord = 0;
    lastLayer = null;
    layerBanner = null;
    drillBlockMsgCool = 0;
    magmaWarnTimer = 0;
    floaters = [];
    autoSellFlash = null;
    msgText = isMobile ? 'Drive off the deck to start mining!' : 'Drive off the deck — Space to jet back up to refuel';
    msgTimer = 4;
  }

  function getMaxFuel() { return 30 + (upgrades.fuelLevel - 1) * 15; }
  function getMaxHull() { return BASE_HULL + (upgrades.hullLevel - 1) * 60; }
  function getMaxCargo() { return 5 + (upgrades.cargoLevel - 1) * 4; }
  function getDrillPower() { return upgrades.drillLevel; }

  // Estimate fuel needed to jetpack back up to the surface deck in a
  // straight line from the player's current y. Combines the activity drain
  // (FUEL_DRAIN/sec while moving) with the thrust drain (DRILL_FUEL*0.5/sec)
  // assuming roughly terminal upward velocity. Adds a buffer for the dip
  // into thrust ramp-up and so we don't strand the player on close calls.
  function getFuelToSurface() {
    var deckTopY = DECK_ROW * TILE;
    var pixelsToClimb = player.y - deckTopY;
    if (pixelsToClimb <= 0) return 0;
    var TERMINAL_UP = 240;       // px/sec sustained climb (a hair under hard cap)
    var seconds = pixelsToClimb / TERMINAL_UP;
    var fuelPerSec = FUEL_DRAIN + (DRILL_FUEL * 0.5);  // ≈ 1.55 / sec
    var raw = seconds * fuelPerSec;
    return raw * 1.25;           // safety buffer
  }

  /* ---- Resize ---- */
  // We render the canvas at native device pixels (sharp HUD + shop text).
  // The game world is drawn through a worldScale transform so tiles stay
  // an appropriate size on screen regardless of viewport width.
  var dpr = 1;
  var worldScale = 2;          // CSS-pixel scale for game-world rendering
  var viewW = 0, viewH = 0;    // canvas size in CSS pixels
  function resize() {
    var wrap = canvas.parentElement;
    viewW = wrap.clientWidth;
    viewH = wrap.clientHeight;
    dpr = Math.max(1, window.devicePixelRatio || 1);

    // Render at native device pixels for crispness
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';

    // World scale: how many CSS pixels a single TILE occupies on screen.
    // We aim for about 12 tiles visible across the viewport — bigger blocks,
    // bigger miner, bigger stations. The camera scrolls to follow the player
    // so the wider world doesn't have to fit on-screen.
    var TARGET_TILES_ACROSS = 12;
    var idealScale = (viewW / (TARGET_TILES_ACROSS * TILE));
    // Mobile gets slightly less zoom so the d-pads don't crowd the view
    if (isMobile) idealScale *= 0.9;
    // Hard floor / ceiling to keep things sane on extreme viewports
    worldScale = Math.max(1.4, Math.min(idealScale, 4.5));

    // screenW/H are the dimensions of the *visible game world* in world pixels
    screenW = viewW / worldScale;
    screenH = viewH / worldScale;

    // D-pad layout uses CSS-pixel coordinates so it stays a comfortable size
    DPAD_SIZE = Math.min(170, viewW * 0.26);
    DPAD_BTN = DPAD_SIZE * 0.38;
    DPAD_CX = DPAD_SIZE * 0.9;
    DPAD_CY = viewH - DPAD_SIZE * 0.9;
  }

  /* ---- Input ---- */
  function setupInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key) !== -1) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { keys[e.key] = false; });

    // Touch
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Mouse fallback for non-mobile
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
  }

  function canvasPos(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function handleTouchStart(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var p = canvasPos(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
      processPointerDown(p.x, p.y);
    }
  }
  function handleTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var p = canvasPos(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
      processPointerMove(p.x, p.y);
    }
  }
  function handleTouchEnd(e) {
    e.preventDefault();
    processPointerUp();
  }
  function handleMouseDown(e) {
    var p = canvasPos(e.clientX, e.clientY);
    processPointerDown(p.x, p.y);
  }
  function handleMouseMove(e) {
    if (!touch.active) return;
    var p = canvasPos(e.clientX, e.clientY);
    processPointerMove(p.x, p.y);
  }
  function handleMouseUp() { processPointerUp(); }

  function processPointerDown(x, y) {
    touch.active = true;
    touch.x = x;
    touch.y = y;
    touch.startX = x;
    touch.startY = y;

    if (shopOpen) {
      handleShopClick(x, y);
      return;
    }
    // Desktop and mobile: clicking/tapping the shop building (when nearby)
    // opens it. The shop is drawn in world space, so translate the click.
    if (playerNearShop() && !isInDpadZone(x, y)) {
      var wx = x / worldScale + cam.x;
      var wy = y / worldScale + cam.y;
      if (isPointOnShop(wx, wy)) {
        shopOpen = true;
        return;
      }
    }
    // On mobile, retain the legacy "tap anywhere outside d-pads while near
    // shop opens it" behavior so reaching the small building isn't fiddly.
    if (isMobile && playerNearShop() && !isInDpadZone(x, y)) {
      shopOpen = true;
      return;
    }

    updateDpad(x, y);
  }

  // Bounding box of the station building in world coords (matches drawStation)
  function isPointOnShop(wx, wy) {
    var cx = stationCenterCol() * TILE + TILE / 2;
    var groundY = DECK_ROW * TILE;
    var bx = cx - 36;
    var by = groundY - 56;
    return wx >= bx - 4 && wx <= bx + 76 && wy >= by - 6 && wy <= groundY;
  }

  function isInDpadZone(x, y) {
    var lDx = x - DPAD_CX, lDy = y - DPAD_CY;
    if (Math.sqrt(lDx * lDx + lDy * lDy) < DPAD_SIZE) return true;
    var RCX = viewW - DPAD_SIZE * 0.9;
    var RCY = viewH - DPAD_SIZE * 0.9;
    var rDx = x - RCX, rDy = y - RCY;
    if (Math.sqrt(rDx * rDx + rDy * rDy) < DPAD_SIZE) return true;
    return false;
  }
  function processPointerMove(x, y) {
    touch.x = x;
    touch.y = y;
    if (!shopOpen) updateDpad(x, y);
  }
  function processPointerUp() {
    touch.active = false;
    dpad.left = dpad.right = dpad.up = dpad.down = false;
  }

  function updateDpad(x, y) {
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    if (!isMobile) return;
    // Left side dpad
    var dx = x - DPAD_CX;
    var dy = y - DPAD_CY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DPAD_SIZE * 0.85) {
      var angle = Math.atan2(dy, dx);
      if (angle > -0.7 && angle < 0.7) dpad.right = true;
      if (angle > 2.4 || angle < -2.4) dpad.left = true;
      if (angle < -0.7 && angle > -2.4) dpad.up = true;
      if (angle > 0.7 && angle < 2.4) dpad.down = true;
    }
    // Right side: check for right-hand dpad too
    var RCX = viewW - DPAD_SIZE * 0.9;
    var RCY = viewH - DPAD_SIZE * 0.9;
    dx = x - RCX;
    dy = y - RCY;
    dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DPAD_SIZE * 0.85) {
      var a2 = Math.atan2(dy, dx);
      if (a2 > -0.7 && a2 < 0.7) dpad.right = true;
      if (a2 > 2.4 || a2 < -2.4) dpad.left = true;
      if (a2 < -0.7 && a2 > -2.4) dpad.up = true;
      if (a2 > 0.7 && a2 < 2.4) dpad.down = true;
    }
  }

  function playerNearSurface() {
    return player.y < SKY_ROWS * TILE + TILE * 2;
  }

  // The shop building sits on the deck to the left of center.
  // Player must be standing on the deck and roughly under/next to it.
  // Station center column is two tiles left of the deck center.
  function stationCenterCol() { return DECK_CENTER_COL - 2; }
  function playerNearShop() {
    // Must be on the deck (y just above DECK_ROW)
    var deckTopY = DECK_ROW * TILE;
    if (player.y + PLAYER_H < deckTopY - 2) return false;
    if (player.y + PLAYER_H > deckTopY + 4) return false;
    var stationCenterX = stationCenterCol() * TILE + TILE / 2;
    return Math.abs((player.x + PLAYER_W / 2) - stationCenterX) < TILE * 2.2;
  }

  // Drive-through pump pad: a strip of the deck to the right of the shop
  function pumpPadRect() {
    var startX = (DECK_CENTER_COL + 1) * TILE;
    return { x: startX, y: DECK_ROW * TILE - 6, w: TILE * 2, h: 6 };
  }
  function playerOnPumpPad() {
    var pad = pumpPadRect();
    var pcx = player.x + PLAYER_W / 2;
    return pcx >= pad.x && pcx <= pad.x + pad.w &&
           player.onGround &&
           player.y + PLAYER_H >= DECK_ROW * TILE - 2 &&
           player.y + PLAYER_H <= DECK_ROW * TILE + 2;
  }

  /* ---- Shop ---- */
  var shopItems = [];
  function buildShopItems() {
    shopItems = [
      { key: 'drill',  title: 'Drill',         desc: 'Mines faster & breaks harder rock', level: upgrades.drillLevel,  costs: shop.drill },
      { key: 'fuel',   title: 'Fuel Tank',     desc: 'Larger fuel capacity',              level: upgrades.fuelLevel,   costs: shop.fuel },
      { key: 'hull',   title: 'Hull Plating',  desc: 'Take more damage before failure',   level: upgrades.hullLevel,   costs: shop.hull },
      { key: 'cargo',  title: 'Cargo Bay',     desc: 'Carry more ore per trip',           level: upgrades.cargoLevel,  costs: shop.cargo },
      { key: 'heat',   title: 'Heated Drill',  desc: 'Required to break permafrost (35m+)', level: upgrades.heatLevel, costs: shop.heat,   special: true },
      { key: 'shield', title: 'Heat Shield',   desc: 'Survive magma layers (110m+)',      level: upgrades.shieldLevel, costs: shop.shield, special: true },
      { key: 'vert',   title: 'Vertical Drill',desc: 'Hold Up against a ceiling to drill upward', level: upgrades.vertLevel, costs: shop.vert, special: true },
    ];
  }

  function buyUpgrade(item) {
    var lvl = upgrades[item.key + 'Level'];
    if (lvl >= item.costs.length) { showMsg('Max level!'); return; }
    var cost = item.costs[lvl];
    if (money < cost) { showMsg('Need $' + cost.toLocaleString()); return; }
    money -= cost;
    upgrades[item.key + 'Level']++;
    maxFuel = getMaxFuel();
    maxCargo = getMaxCargo();
    player.fuel = maxFuel;
    player.hull = getMaxHull();
    var label = item.title;
    if (item.key === 'heat') label = 'Heated Drill installed!';
    else if (item.key === 'shield') label = 'Heat Shield Mk ' + upgrades.shieldLevel + ' installed!';
    else if (item.key === 'vert') label = 'Vertical Drill installed!';
    else label = label + ' upgraded!';
    showMsg(label);
  }

  function handleShopClick(x, y) {
    buildShopItems();
    computeShopLayout();
    var L = SHOP_LAYOUT;

    // Click outside the shop box -> close
    if (x < L.boxX || x > L.boxX + L.boxW || y < L.boxY || y > L.boxY + L.boxH) {
      shopOpen = false;
      return;
    }

    // Sell button
    if (y >= L.sellY && y < L.sellY + L._actionH) {
      if (x >= L._actionX1 && x < L._actionX1 + L._actionW) {
        if (cargo.length > 0) sellCargo();
        return;
      }
    }

    // Upgrade items
    for (var i = 0; i < shopItems.length; i++) {
      var iy = L.itemsStartY + i * L.itemH;
      if (y >= iy && y < iy + L.itemH - 6 &&
          x >= L.boxX + 16 && x <= L.boxX + L.boxW - 16) {
        buyUpgrade(shopItems[i]);
        return;
      }
    }
  }

  function sellCargo(auto) {
    var total = 0;
    for (var i = 0; i < cargo.length; i++) {
      total += ORES[cargo[i]].value;
    }
    if (total === 0) return;
    money += total;
    cargo = [];
    if (auto) {
      // Quietly flash the value above the player on the pump pad
      autoSellFlash = { value: total, t: 1.2 };
    } else {
      showMsg('+$' + total);
    }
  }
  var autoSellFlash = null;

  // Floating mining text effects ("+$X Item") that drift up and fade
  var floaters = [];
  function spawnFloater(wx, wy, text, color) {
    floaters.push({
      x: wx,
      y: wy,
      text: text,
      color: color || '#FFD700',
      vy: -22,             // initial upward speed in world px/sec
      t: 1.4,              // total lifetime in seconds
      maxT: 1.4,
    });
  }

  function showMsg(t) { msgText = t; msgTimer = 2.5; }

  // Returns reason string if the tile cannot be drilled, or null if OK.
  function drillBlockReason(tile, row) {
    if (!tile) return 'empty';
    // Station deck plating is permanent
    if (tile.type === 'platform') return 'Station deck — solid steel';
    var depth = row - SKY_ROWS;
    var layer = getLayerForDepth(depth);
    var ore = ORES[tile.type];
    // Permafrost layer requires Heated Drill — applies to ALL tiles in that layer
    if (layer.requiresHeat && upgrades.heatLevel < 1) {
      return 'Need Heated Drill (35m+)';
    }
    // Specific ore needs heated drill (e.g. methane ice)
    if (ore && ore.reqHeat && upgrades.heatLevel < 1) {
      return 'Need Heated Drill';
    }
    // Specific ore needs minimum drill level
    if (ore && ore.reqDrill && upgrades.drillLevel < ore.reqDrill) {
      return 'Drill Lv ' + ore.reqDrill + ' required';
    }
    return null;
  }

  /* ---- Collision ---- */
  function tileAt(r, c) {
    if (r < 0 || r >= TOTAL_ROWS || c < 0 || c >= COLS) return 'wall';
    return world[r][c];
  }

  function solidAt(px, py, w, h) {
    var c1 = Math.floor(px / TILE);
    var c2 = Math.floor((px + w - 1) / TILE);
    var r1 = Math.floor(py / TILE);
    var r2 = Math.floor((py + h - 1) / TILE);
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        var t = tileAt(r, c);
        if (t === 'wall' || t !== null) return true;
      }
    }
    return false;
  }

  /* ---- Update ---- */
  function update(dt) {
    if (gameOver || shopOpen) return;
    if (dt > 0.05) dt = 0.05;

    // Input
    var moveL = keys['ArrowLeft'] || keys['a'] || keys['A'] || dpad.left;
    var moveR = keys['ArrowRight'] || keys['d'] || keys['D'] || dpad.right;
    var moveU = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '] || keys['Space'] || keys['Spacebar'] || dpad.up;
    var moveD = keys['ArrowDown'] || keys['s'] || keys['S'] || dpad.down;

    // Pump pad: free refuel + auto-sell while standing on it
    if (playerOnPumpPad()) {
      if (cargo.length > 0) sellCargo(true);
      var maxF = getMaxFuel();
      var maxH = getMaxHull();
      if (player.fuel < maxF) {
        player.fuel = Math.min(maxF, player.fuel + maxF * 0.6 * dt);
        player.refueling = true;
      } else {
        player.refueling = false;
      }
      if (player.hull < maxH) {
        player.hull = Math.min(maxH, player.hull + maxH * 0.4 * dt);
      }
    } else {
      player.refueling = false;
    }

    // Fuel drain — only while actively exerting. Sitting still or just
    // falling (gravity does the work) shouldn't burn fuel.
    var horizontallyMoving = moveL || moveR || Math.abs(player.vx) > 5;
    var doingSomething = drilling ||
                         player.thrusting ||
                         horizontallyMoving;
    if (doingSomething) {
      player.fuel -= FUEL_DRAIN * dt;
    }
    if (player.fuel <= 0) {
      player.fuel = 0;
      if (player.y > SKY_ROWS * TILE) {
        player.hull -= 20 * dt;
        if (player.hull <= 0) { endGame(); return; }
      }
    }

    // Magma / mantle layer: hull drains without sufficient heat shield
    var depthNow = Math.max(0, Math.floor(player.y / TILE) - SKY_ROWS);
    var layerNow = getLayerForDepth(depthNow);
    if (layerNow.dangerous && layerNow.requiresShield) {
      // shield 0: full damage, 1: half, 2: immune
      var shieldFactor = upgrades.shieldLevel === 0 ? 1.0 : (upgrades.shieldLevel === 1 ? 0.4 : 0);
      if (shieldFactor > 0) {
        player.hull -= 8 * shieldFactor * dt;
        // Periodic warning
        magmaWarnTimer = (magmaWarnTimer || 0) - dt;
        if (magmaWarnTimer <= 0) {
          showMsg(upgrades.shieldLevel === 0 ? 'No heat shield — hull damage!' : 'Hull stressed by heat');
          magmaWarnTimer = 4;
        }
        if (player.hull <= 0) { endGame(); return; }
      }
    }

    // Drilling
    if (drilling) {
      // Cancel mid-drill if the player releases the direction key.
      // Partial damage to the tile persists so they can resume later.
      var stillHolding = false;
      if (drilling.dirVec === 'd') stillHolding = moveD;
      else if (drilling.dirVec === 'u') stillHolding = moveU;
      else if (drilling.dirVec === 'l') stillHolding = moveL;
      else if (drilling.dirVec === 'r') stillHolding = moveR;
      if (!stillHolding) {
        drilling = null;
      } else {
        drilling.timer -= dt;
        drilling.shake = (drilling.shake || 0) + dt * 30;
        if (drilling.timer <= 0) {
          var tile = world[drilling.r][drilling.c];
          if (tile) {
            tile.hp -= getDrillPower();
            if (tile.hp <= 0) {
              // Collect — but not dirt or stone (they're worthless rubble)
              var oreType = tile.type;
              var oreDef = ORES[oreType];
              if (oreType !== 'dirt' && oreType !== 'stone') {
                if (cargo.length < maxCargo) {
                  cargo.push(oreType);
                  // ----- Change 5: floating "+$X Item" text at the tile
                  var fwx = drilling.c * TILE + TILE / 2;
                  var fwy = drilling.r * TILE + TILE / 2;
                  spawnFloater(fwx, fwy,
                    oreDef.label + ' +$' + oreDef.value,
                    oreDef.color);
                } else {
                  showMsg('Cargo full!');
                }
              }
              world[drilling.r][drilling.c] = null;

              // ----- Changes 3 + 9: when finishing a downward drill, glide the
              // player horizontally onto the empty column so they always fall
              // into the gap instead of catching on the adjacent tile lip.
              // Use a smooth slide instead of an instant snap.
              if (drilling.dirVec === 'd') {
                var targetX = drilling.c * TILE + TILE / 2 - PLAYER_W / 2;
                // Only initiate slide if the destination row (player's body)
                // is itself clear of obstacles.
                if (!solidAt(targetX, player.y, PLAYER_W, PLAYER_H)) {
                  player.slideTargetX = targetX;
                }
              }
            } else {
              drilling.timer = DRILL_TIME;
              player.fuel -= DRILL_FUEL * dt;
              return;
            }
          }
          drilling = null;
        } else {
          player.fuel -= DRILL_FUEL * dt;
          return;
        }
      }
    }

    // ----- Horizontal movement: acceleration + friction -----
    // Ground gives stronger control; air is loose
    var ACC_GROUND = 1100;
    var ACC_AIR = 600;
    var FRICTION_GROUND = 1800;
    var FRICTION_AIR = 350;
    var acc = player.onGround ? ACC_GROUND : ACC_AIR;
    var fric = player.onGround ? FRICTION_GROUND : FRICTION_AIR;

    // ----- Change 9: smooth post-drill slide -----
    // After mining a tile out from under us, we set player.slideTargetX so we
    // glide into the gap rather than teleporting. The slide overrides normal
    // friction/input until we get there or the player actively grabs control.
    if (player.slideTargetX != null) {
      var dxTarget = player.slideTargetX - player.x;
      // Player took control? (pressing opposite direction or large input) → cancel
      if ((moveL && dxTarget > 0) || (moveR && dxTarget < 0) || Math.abs(dxTarget) < 0.6) {
        player.slideTargetX = null;
        if (Math.abs(dxTarget) < 0.6) player.x = player.x + dxTarget;
      } else {
        // Critically-damped pull: snappy but not jarring
        var pullSpeed = 320;          // px/sec target speed
        var dir = dxTarget > 0 ? 1 : -1;
        // Set vx directly; magnitude proportional to remaining distance, capped
        var desired = dir * Math.min(pullSpeed, Math.abs(dxTarget) * 8);
        player.vx = desired;
      }
    } else if (moveL) player.vx -= acc * dt;
    else if (moveR) player.vx += acc * dt;
    else {
      // Friction toward zero
      if (player.vx > 0) { player.vx -= fric * dt; if (player.vx < 0) player.vx = 0; }
      else if (player.vx < 0) { player.vx += fric * dt; if (player.vx > 0) player.vx = 0; }
    }
    // Clamp
    if (player.vx > MOVE_SPEED) player.vx = MOVE_SPEED;
    if (player.vx < -MOVE_SPEED) player.vx = -MOVE_SPEED;

    // Jetpack: smooth thrust with diminishing returns
    if (moveU && player.fuel > 0) {
      var thrust = 1500 * dt;
      // Diminishing returns: harder to gain speed at high upward velocity
      if (player.vy < -100) thrust *= 0.6;
      if (player.vy < -200) thrust *= 0.5;
      player.vy -= thrust;
      if (player.vy < -280) player.vy = -280;
      player.fuel -= DRILL_FUEL * 0.5 * dt;
      player.thrusting = true;
    } else {
      player.thrusting = false;
    }

    // Gravity
    player.vy += GRAVITY * dt;
    if (player.vy > 520) player.vy = 520;

    // Move X
    var nx = player.x + player.vx * dt;
    if (nx < 0) { nx = 0; player.vx = 0; }
    if (nx + PLAYER_W > COLS * TILE) { nx = COLS * TILE - PLAYER_W; player.vx = 0; }
    if (!solidAt(nx, player.y, PLAYER_W, PLAYER_H)) {
      player.x = nx;
    } else {
      player.vx = 0;
    }

    // Move Y
    var ny = player.y + player.vy * dt;
    var wasInAir = !player.onGround;
    player.onGround = false;
    player.onCeiling = false;
    if (ny < 0) { ny = 0; player.vy = 0; }
    if (!solidAt(player.x, ny, PLAYER_W, PLAYER_H)) {
      player.y = ny;
    } else {
      // ----- Change 8: Ceiling-corner slip -----
      // When jetpacking up and blocked by a ceiling, try a small horizontal
      // nudge to slip into adjacent open space (e.g., the player is brushing
      // the corner of a tile but a free column sits next to them).
      var slipped = false;
      if (player.vy < 0) {
        for (var nudge = 1; nudge <= 8; nudge++) {
          // Try right
          if (!solidAt(player.x + nudge, ny, PLAYER_W, PLAYER_H) &&
              !solidAt(player.x + nudge, player.y, PLAYER_W, PLAYER_H)) {
            player.x += nudge;
            player.y = ny;
            slipped = true;
            break;
          }
          // Try left
          if (!solidAt(player.x - nudge, ny, PLAYER_W, PLAYER_H) &&
              !solidAt(player.x - nudge, player.y, PLAYER_W, PLAYER_H)) {
            player.x -= nudge;
            player.y = ny;
            slipped = true;
            break;
          }
        }
      }
      if (!slipped) {
        if (player.vy > 280) {
          // Fall damage scales with velocity squared above threshold
          var excess = player.vy - 280;
          player.hull -= excess * 0.18;
          player.squash = Math.min(1, excess / 200);
          if (player.hull <= 0) { endGame(); return; }
        }
        if (player.vy > 0) player.onGround = true;
        else if (player.vy < 0) player.onCeiling = true;
        player.vy = 0;
      }
    }

    // Decay squash
    if (player.squash > 0) {
      player.squash -= dt * 4;
      if (player.squash < 0) player.squash = 0;
    }

    // Drilling trigger
    if (moveD && player.onGround && !drilling) {
      var pr = Math.floor((player.y + PLAYER_H + 2) / TILE);
      var pc = Math.floor((player.x + PLAYER_W / 2) / TILE);
      if (pr < TOTAL_ROWS && world[pr] && world[pr][pc]) {
        var blockReason = drillBlockReason(world[pr][pc], pr);
        if (blockReason) {
          if (drillBlockMsgCool <= 0) { showMsg(blockReason); drillBlockMsgCool = 1.5; }
        } else {
          drilling = { r: pr, c: pc, timer: DRILL_TIME, dirVec: 'd' };
        }
      }
    }
    if (moveL && player.onGround && !drilling) {
      var pr2 = Math.floor((player.y + PLAYER_H / 2) / TILE);
      var pc2 = Math.floor((player.x - 2) / TILE);
      if (pc2 >= 0 && pr2 < TOTAL_ROWS && world[pr2] && world[pr2][pc2]) {
        var blockReason2 = drillBlockReason(world[pr2][pc2], pr2);
        if (blockReason2) {
          if (drillBlockMsgCool <= 0) { showMsg(blockReason2); drillBlockMsgCool = 1.5; }
        } else {
          drilling = { r: pr2, c: pc2, timer: DRILL_TIME, dirVec: 'l' };
          player.dir = -1;
        }
      }
    }
    if (moveR && player.onGround && !drilling) {
      var pr3 = Math.floor((player.y + PLAYER_H / 2) / TILE);
      var pc3 = Math.floor((player.x + PLAYER_W + 2) / TILE);
      if (pc3 < COLS && pr3 < TOTAL_ROWS && world[pr3] && world[pr3][pc3]) {
        var blockReason3 = drillBlockReason(world[pr3][pc3], pr3);
        if (blockReason3) {
          if (drillBlockMsgCool <= 0) { showMsg(blockReason3); drillBlockMsgCool = 1.5; }
        } else {
          drilling = { r: pr3, c: pc3, timer: DRILL_TIME, dirVec: 'r' };
          player.dir = 1;
        }
      }
    }
    // ----- Change 6: Vertical drill (drill upward) -----
    // Requires the upgrade. Triggers when player holds Up while their head
    // is touching a solid tile above (ceiling contact).
    if (moveU && upgrades.vertLevel >= 1 && player.onCeiling && !drilling) {
      var pr4 = Math.floor((player.y - 2) / TILE);
      var pc4 = Math.floor((player.x + PLAYER_W / 2) / TILE);
      if (pr4 >= 0 && world[pr4] && world[pr4][pc4]) {
        var blockReason4 = drillBlockReason(world[pr4][pc4], pr4);
        if (blockReason4) {
          if (drillBlockMsgCool <= 0) { showMsg(blockReason4); drillBlockMsgCool = 1.5; }
        } else {
          drilling = { r: pr4, c: pc4, timer: DRILL_TIME, dirVec: 'u' };
        }
      }
    }
    if (drillBlockMsgCool > 0) drillBlockMsgCool -= dt;

    // Direction
    if (player.vx > 10) player.dir = 1;
    if (player.vx < -10) player.dir = -1;

    // Depth record
    var currentDepth = Math.max(0, Math.floor((player.y / TILE) - SKY_ROWS + 1));
    if (currentDepth > depthRecord) depthRecord = currentDepth;

    // Layer crossing banner
    var curLayer = currentDepth >= 0 ? getLayerForDepth(currentDepth) : null;
    if (curLayer && lastLayer && curLayer.name !== lastLayer.name) {
      layerBanner = { name: curLayer.name, t: 2.5 };
    }
    lastLayer = curLayer;
    if (layerBanner) {
      layerBanner.t -= dt;
      if (layerBanner.t <= 0) layerBanner = null;
    }

    // Message timer
    if (msgTimer > 0) msgTimer -= dt;
  }

  function endGame() {
    gameOver = true;
    showMsg('Hull destroyed! Depth: ' + depthRecord + 'm');
  }

  /* ---- Camera ---- */
  function updateCamera() {
    var targetX = player.x + PLAYER_W / 2 - screenW / 2;
    var targetY = player.y + PLAYER_H / 2 - screenH / 2;
    cam.x += (targetX - cam.x) * 0.12;
    cam.y += (targetY - cam.y) * 0.12;
    // Clamp
    if (cam.x < 0) cam.x = 0;
    if (cam.x > COLS * TILE - screenW) cam.x = COLS * TILE - screenW;
    if (cam.y < -50) cam.y = -50;
  }

  /* ---- Render ---- */
  function render() {
    // ---- Reset to native pixel space and clear ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ---- WORLD SPACE: scale by dpr * worldScale, translate by camera ----
    var ws = dpr * worldScale;
    ctx.setTransform(ws, 0, 0, ws, -cam.x * ws, -cam.y * ws);
    // imageSmoothingEnabled true keeps gradients smooth
    ctx.imageSmoothingEnabled = true;

    // Visible world rect in world coords
    var worldLeft = cam.x;
    var worldTop = cam.y;
    var worldRight = cam.x + screenW;
    var worldBottom = cam.y + screenH;

    // Sky gradient (drawn behind world, so over the visible window)
    var surfaceY = SKY_ROWS * TILE;
    if (worldTop < surfaceY) {
      var skyGrad = ctx.createLinearGradient(0, worldTop, 0, surfaceY);
      skyGrad.addColorStop(0, '#10101e');
      skyGrad.addColorStop(0.4, '#1f1638');
      skyGrad.addColorStop(0.85, '#3a1f3a');
      skyGrad.addColorStop(1, '#5a2c2a');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(worldLeft, worldTop, screenW, Math.min(surfaceY, worldBottom) - worldTop);

      // Stars
      drawStars(worldLeft, worldTop, worldRight, surfaceY);

      // Distant mountains silhouette near horizon
      if (worldBottom > surfaceY - TILE * 4) {
        ctx.fillStyle = 'rgba(20,12,30,0.85)';
        var mountainBase = surfaceY - 1;
        ctx.beginPath();
        ctx.moveTo(worldLeft, mountainBase);
        for (var mx = 0; mx <= COLS * TILE; mx += 24) {
          var mh = 18 + Math.sin(mx * 0.08) * 8 + Math.sin(mx * 0.21) * 6;
          ctx.lineTo(mx, mountainBase - mh);
        }
        ctx.lineTo(worldLeft + screenW, mountainBase);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Underground bg — drawn per-layer for visual variety
    if (worldBottom > surfaceY) {
      var ugTop = Math.max(worldTop, surfaceY);
      // Walk LAYERS and fill bands
      for (var li = 0; li < LAYERS.length; li++) {
        var L = LAYERS[li];
        var bandTopY = surfaceY + L.minDepth * TILE;
        var bandBotY = surfaceY + L.maxDepth * TILE;
        if (bandBotY < ugTop) continue;
        if (bandTopY > worldBottom) break;
        var visTop = Math.max(bandTopY, ugTop);
        var visBot = Math.min(bandBotY, worldBottom);
        ctx.fillStyle = L.bg;
        ctx.fillRect(worldLeft, visTop, screenW, visBot - visTop);
      }
    }

    // ---- Draw tiles ----
    var startCol = Math.max(0, Math.floor(cam.x / TILE));
    var endCol = Math.min(COLS - 1, Math.floor((cam.x + screenW) / TILE));
    var startRow = Math.max(0, Math.floor(cam.y / TILE));
    var endRow = Math.min(TOTAL_ROWS - 1, Math.floor((cam.y + screenH) / TILE));

    var tNow = performance.now() / 1000;

    for (var r = startRow; r <= endRow; r++) {
      var rowDepth = r - SKY_ROWS;
      var rowLayer = rowDepth >= 0 ? getLayerForDepth(rowDepth) : null;
      for (var c = startCol; c <= endCol; c++) {
        var tile = world[r] ? world[r][c] : null;
        if (tile) {
          var tx = c * TILE;
          var ty = r * TILE;

          // Station deck: metallic plating, not regular tile rendering
          if (tile.type === 'platform') {
            // Base plate gradient
            var plateGrad = ctx.createLinearGradient(0, ty, 0, ty + TILE);
            plateGrad.addColorStop(0, '#4a505c');
            plateGrad.addColorStop(0.5, '#363b46');
            plateGrad.addColorStop(1, '#22262e');
            ctx.fillStyle = plateGrad;
            ctx.fillRect(tx, ty, TILE, TILE);
            // Top trim — bright edge
            ctx.fillStyle = '#FFD27A';
            ctx.fillRect(tx, ty, TILE, 2);
            ctx.fillStyle = 'rgba(255,210,120,0.4)';
            ctx.fillRect(tx, ty + 2, TILE, 1);
            // Bolt heads in corners
            ctx.fillStyle = '#1a1d24';
            ctx.fillRect(tx + 3, ty + 7, 2, 2);
            ctx.fillRect(tx + TILE - 5, ty + 7, 2, 2);
            ctx.fillRect(tx + 3, ty + TILE - 8, 2, 2);
            ctx.fillRect(tx + TILE - 5, ty + TILE - 8, 2, 2);
            // Diagonal hatch detail across center
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            for (var hh = 0; hh < 3; hh++) {
              ctx.beginPath();
              ctx.moveTo(tx + 6 + hh * 8, ty + 12);
              ctx.lineTo(tx + 14 + hh * 8, ty + 22);
              ctx.stroke();
            }
            // Bottom shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(tx, ty + TILE - 2, TILE, 2);
            // Side seams
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(tx, ty + 3, 1, TILE - 5);
            ctx.fillRect(tx + TILE - 1, ty + 3, 1, TILE - 5);
            continue;
          }

          var ore = ORES[tile.type];
          ctx.fillStyle = ore.color;
          ctx.fillRect(tx, ty, TILE, TILE);

          // Top highlight + bottom/right shadow for depth
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(tx, ty, TILE, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(tx, ty + TILE - 2, TILE, 2);
          ctx.fillRect(tx + TILE - 2, ty, 2, TILE);

          // ===== Layer tints / special tile decorations =====
          if (rowLayer) {
            if (rowLayer.name === 'permafrost' && (tile.type === 'dirt' || tile.type === 'stone')) {
              // Frosty overlay on rubble inside permafrost
              ctx.fillStyle = 'rgba(180,220,255,0.45)';
              ctx.fillRect(tx, ty, TILE, TILE);
              // Ice crystals
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              ctx.fillRect(tx + 6, ty + 8, 2, 2);
              ctx.fillRect(tx + 18, ty + 14, 2, 2);
              ctx.fillRect(tx + 12, ty + 22, 1.5, 1.5);
              ctx.fillRect(tx + 24, ty + 5, 1.5, 1.5);
              // Faint blue gleam top
              ctx.fillStyle = 'rgba(190,230,255,0.35)';
              ctx.fillRect(tx, ty, TILE, 3);
            } else if (rowLayer.name === 'magma' || rowLayer.name === 'mantle') {
              if (tile.type === 'dirt' || tile.type === 'stone') {
                // Hot stone: glowing red veins
                var pulse = 0.5 + 0.5 * Math.sin(tNow * 2 + (r * 7 + c * 13));
                ctx.fillStyle = 'rgba(255,80,30,' + (0.18 + pulse * 0.18).toFixed(2) + ')';
                ctx.fillRect(tx, ty, TILE, TILE);
                // Crack pattern in red
                ctx.strokeStyle = 'rgba(255,140,40,' + (0.4 + pulse * 0.4).toFixed(2) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(tx + 4, ty + 8);
                ctx.lineTo(tx + 14, ty + 16);
                ctx.lineTo(tx + 22, ty + 12);
                ctx.lineTo(tx + 28, ty + 24);
                ctx.stroke();
              }
            } else if (rowLayer.name === 'crystal' && (tile.type === 'dirt' || tile.type === 'stone')) {
              // Sparkly crystal tint
              ctx.fillStyle = 'rgba(160,180,255,0.18)';
              ctx.fillRect(tx, ty, TILE, TILE);
              // Tiny sparkle
              if (((r * 31 + c * 17) % 5) === 0) {
                var sp = (Math.sin(tNow * 3 + r + c) + 1) * 0.5;
                ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + sp * 0.6).toFixed(2) + ')';
                ctx.fillRect(tx + 8 + (c % 3) * 5, ty + 6 + (r % 3) * 5, 1.5, 1.5);
              }
            }
          }

          // ===== Per-ore visual flourishes =====
          // Coal: tiny black flecks on dark grey base (already dark)
          if (tile.type === 'coal') {
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(tx + 5, ty + 6, 4, 4);
            ctx.fillRect(tx + 18, ty + 14, 5, 5);
            ctx.fillRect(tx + 10, ty + 22, 3, 3);
          }
          // Pyrite: golden cubes (recognizable as fool's gold)
          if (tile.type === 'pyrite') {
            ctx.fillStyle = 'rgba(255,230,140,0.6)';
            ctx.fillRect(tx + 6, ty + 6, 6, 6);
            ctx.fillRect(tx + 18, ty + 16, 5, 5);
            ctx.fillRect(tx + 8, ty + 20, 4, 4);
          }
          // Cinnabar: red crystal clusters
          if (tile.type === 'cinnabar') {
            ctx.fillStyle = 'rgba(255,90,90,0.7)';
            ctx.fillRect(tx + 8, ty + 6, 3, 8);
            ctx.fillRect(tx + 16, ty + 10, 3, 10);
            ctx.fillRect(tx + 22, ty + 6, 2, 6);
          }
          // Amber: trapped insect silhouette
          if (tile.type === 'amber') {
            ctx.fillStyle = 'rgba(255,210,120,0.6)';
            ctx.fillRect(tx + 4, ty + 4, TILE - 8, TILE - 8);
            ctx.fillStyle = '#3a1a08';
            // Tiny insect: 3 dots in a line (body) + 4 leg dots
            ctx.fillRect(tx + 14, ty + 14, 2, 2);
            ctx.fillRect(tx + 16, ty + 14, 2, 2);
            ctx.fillRect(tx + 18, ty + 14, 2, 2);
            ctx.fillRect(tx + 13, ty + 17, 1, 1);
            ctx.fillRect(tx + 17, ty + 17, 1, 1);
            ctx.fillRect(tx + 13, ty + 12, 1, 1);
            ctx.fillRect(tx + 17, ty + 12, 1, 1);
          }
          // Trilobite fossil: spine ridges
          if (tile.type === 'trilobite') {
            ctx.fillStyle = '#3a2818';
            ctx.fillRect(tx + 8, ty + 6, 16, 20);
            ctx.fillStyle = '#5c4028';
            for (var sg = 0; sg < 5; sg++) {
              ctx.fillRect(tx + 10, ty + 8 + sg * 4, 12, 1);
            }
            // Eyes
            ctx.fillStyle = '#0a0604';
            ctx.fillRect(tx + 11, ty + 9, 2, 2);
            ctx.fillRect(tx + 19, ty + 9, 2, 2);
          }
          // Uranium: glowing green halo
          if (tile.type === 'uranium') {
            var uPulse = 0.5 + 0.5 * Math.sin(tNow * 4 + r + c);
            ctx.fillStyle = 'rgba(120,255,120,' + (0.2 + uPulse * 0.35).toFixed(2) + ')';
            ctx.fillRect(tx, ty, TILE, TILE);
            ctx.fillStyle = 'rgba(180,255,180,0.85)';
            ctx.fillRect(tx + 12, ty + 12, 6, 6);
            ctx.fillRect(tx + 6, ty + 22, 3, 3);
            ctx.fillRect(tx + 22, ty + 6, 3, 3);
          }
          // Methane ice: bubbly translucent blue
          if (tile.type === 'methaneice') {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath(); ctx.arc(tx + 9, ty + 11, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(tx + 20, ty + 18, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(tx + 14, ty + 24, 1.5, 0, Math.PI * 2); ctx.fill();
          }
          // Obsidian: glassy sheen
          if (tile.type === 'obsidian') {
            ctx.fillStyle = 'rgba(120,80,150,0.35)';
            ctx.fillRect(tx + 4, ty + 4, 6, 24);
            ctx.fillRect(tx + 18, ty + 10, 4, 18);
          }
          // Tanzanite: blue-violet bicolor
          if (tile.type === 'tanzanite') {
            ctx.fillStyle = 'rgba(160,120,255,0.6)';
            ctx.fillRect(tx + 6, ty + 6, 8, 20);
            ctx.fillStyle = 'rgba(80,120,255,0.5)';
            ctx.fillRect(tx + 18, ty + 8, 6, 18);
          }
          // Painite: brownish-pink
          if (tile.type === 'painite') {
            ctx.fillStyle = 'rgba(255,160,200,0.55)';
            ctx.fillRect(tx + 8, ty + 6, 16, 5);
            ctx.fillRect(tx + 6, ty + 14, 20, 6);
            ctx.fillRect(tx + 10, ty + 22, 12, 4);
          }
          // Unobtanium: shimmering shifting hue
          if (tile.type === 'unobtanium') {
            var hueT = (tNow * 60) % 360;
            ctx.fillStyle = 'hsla(' + hueT + ', 90%, 65%, 0.55)';
            ctx.fillRect(tx + 4, ty + 4, TILE - 8, TILE - 8);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(tx + 14, ty + 14, 4, 4);
          }

          // Highlight for valuable ores (generic shine)
          if (ore.value >= 90 && ore.value < 800) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(tx + 3, ty + 3, 6, 6);
          }
          if (ore.value >= 800) {
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(tx + TILE - 10, ty + 4, 4, 4);
            ctx.fillRect(tx + 6, ty + TILE - 10, 5, 5);
          }

          // Damage cracks
          var maxHp = ORES[tile.type].hp;
          if (tile.hp < maxHp) {
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx + TILE * 0.3, ty + TILE * 0.2);
            ctx.lineTo(tx + TILE * 0.5, ty + TILE * 0.5);
            ctx.lineTo(tx + TILE * 0.4, ty + TILE * 0.8);
            ctx.stroke();
          }
        }
      }
    }

    // Surface grass line (drawn between sky and underground, above tiles' top edge)
    if (worldTop < surfaceY && worldBottom > surfaceY - 4) {
      ctx.fillStyle = '#5a8c3a';
      ctx.fillRect(worldLeft, surfaceY - 3, screenW, 3);
      // Grass tufts
      ctx.fillStyle = '#79b04a';
      for (var gx = Math.floor(worldLeft / 8) * 8; gx < worldRight; gx += 8) {
        ctx.fillRect(gx, surfaceY - 5, 2, 2);
      }
    }

    // ---- Surface station ----
    drawStation();

    // ---- Pump pad ----
    drawPumpPad();

    // ---- Player ----
    drawPlayer();

    // ---- Drilling sparks ----
    if (drilling) {
      var dxw = drilling.c * TILE + TILE / 2;
      var dyw = drilling.r * TILE + TILE / 2;
      ctx.fillStyle = '#FFD700';
      for (var si = 0; si < 5; si++) {
        var sx = dxw + (Math.random() - 0.5) * TILE * 0.9;
        var sy = dyw + (Math.random() - 0.5) * TILE * 0.9;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
      ctx.fillStyle = 'rgba(255,180,80,0.6)';
      ctx.beginPath();
      ctx.arc(dxw, dyw, 4 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Floating mining text ("+$X Item") ----
    // World-space; drift up and fade out. Lifecycle managed here so we don't
    // need a separate update step.
    if (floaters.length) {
      var dt60 = 1 / 60;             // approximate frame time
      for (var fi = floaters.length - 1; fi >= 0; fi--) {
        var f = floaters[fi];
        f.t -= dt60;
        if (f.t <= 0) { floaters.splice(fi, 1); continue; }
        f.y += f.vy * dt60;
        f.vy *= 0.985;               // slow down rise
        // Fade in fast, hold, fade out
        var lifeProg = 1 - (f.t / f.maxT);   // 0 → 1
        var alpha;
        if (lifeProg < 0.15) alpha = lifeProg / 0.15;
        else if (lifeProg > 0.6) alpha = Math.max(0, (1 - lifeProg) / 0.4);
        else alpha = 1;
        // Outline + fill for legibility against busy backgrounds
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 9px ' + UI_FONT;
        ctx.textAlign = 'center';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }

    // ---- "Press P / click" prompt above player when near shop ----
    if (!shopOpen && playerNearShop() && !isMobile) {
      drawPrompt(player.x + PLAYER_W / 2, player.y - 8, 'Press [P] or click shop');
    }
    if (!shopOpen && playerNearShop() && isMobile) {
      drawPrompt(player.x + PLAYER_W / 2, player.y - 8, 'Tap shop to enter');
    }

    // ---- Auto-sell flash above player ----
    if (autoSellFlash && autoSellFlash.t > 0) {
      autoSellFlash.t -= 1 / 60;
      var aOff = (1.2 - autoSellFlash.t) * 12;
      ctx.globalAlpha = Math.min(1, autoSellFlash.t / 0.6);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 10px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.fillText('+$' + autoSellFlash.value, player.x + PLAYER_W / 2, player.y - 10 - aOff);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      if (autoSellFlash.t <= 0) autoSellFlash = null;
    }

    // ============================================================
    //  UI SPACE: reset transform; draw in CSS-pixel coords scaled by dpr
    // ============================================================
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // D-pad (mobile)
    if (isMobile) {
      drawDpad(DPAD_CX, DPAD_CY);
      drawDpad(viewW - DPAD_SIZE * 0.9, viewH - DPAD_SIZE * 0.9);
    }

    // HUD
    drawHUD();

    // Layer-crossing banner
    if (layerBanner) drawLayerBanner();

    // Shop overlay
    if (shopOpen) drawShop();

    // Centered message
    if (msgTimer > 0) {
      var alpha = Math.min(1, msgTimer);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 18px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.fillText(msgText, viewW / 2, viewH / 2 - 30);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // Game over
    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.fillStyle = '#E0115F';
      ctx.font = 'bold 32px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.fillText('HULL DESTROYED', viewW / 2, viewH / 2 - 36);
      ctx.fillStyle = '#fff';
      ctx.font = '16px ' + UI_FONT;
      ctx.fillText('Max Depth: ' + depthRecord + 'm   Earned: $' + money, viewW / 2, viewH / 2);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px ' + UI_FONT;
      ctx.fillText(isMobile ? 'Tap to restart' : 'Press R to restart', viewW / 2, viewH / 2 + 36);
      ctx.textAlign = 'left';
    }
  }

  // ----- Helper: stars for night sky -----
  var STAR_SEED = [];
  function ensureStars() {
    if (STAR_SEED.length) return;
    for (var i = 0; i < 60; i++) {
      STAR_SEED.push({
        x: Math.random() * COLS * TILE,
        y: Math.random() * (SKY_ROWS * TILE * 0.85),
        s: Math.random() * 1.2 + 0.3,
        tw: Math.random() * Math.PI * 2
      });
    }
  }
  function drawStars(x0, y0, x1, y1) {
    ensureStars();
    var t = performance.now() / 1000;
    for (var i = 0; i < STAR_SEED.length; i++) {
      var st = STAR_SEED[i];
      if (st.x < x0 || st.x > x1 || st.y < y0 || st.y > y1) continue;
      var a = 0.4 + 0.6 * (Math.sin(t * 1.5 + st.tw) * 0.5 + 0.5);
      ctx.fillStyle = 'rgba(255,255,235,' + a.toFixed(2) + ')';
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
  }

  // ----- Speech-bubble style prompt -----
  function drawPrompt(wx, wy, text) {
    ctx.font = 'bold 8px ' + UI_FONT;
    var pad = 3;
    var tw = ctx.measureText(text).width;
    var bw = tw + pad * 2 + 2;
    var bh = 12;
    var bx = wx - bw / 2;
    var by = wy - bh - 4;
    // Bubble
    ctx.fillStyle = 'rgba(20,15,8,0.92)';
    roundRect(ctx, bx, by, bw, bh, 3, true);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 0.6;
    roundRect(ctx, bx, by, bw, bh, 3, false, true);
    // Pointer
    ctx.fillStyle = 'rgba(20,15,8,0.92)';
    ctx.beginPath();
    ctx.moveTo(wx - 3, by + bh - 0.5);
    ctx.lineTo(wx + 3, by + bh - 0.5);
    ctx.lineTo(wx, by + bh + 3);
    ctx.closePath();
    ctx.fill();
    // Text
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, wx, by + bh / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ----- The surface station (the "shop") -----
  function drawStation() {
    var cx = stationCenterCol() * TILE + TILE / 2;
    var groundY = DECK_ROW * TILE;  // station sits on top of the elevated deck
    // Visible window check
    if (cx + 60 < cam.x || cx - 60 > cam.x + screenW) return;
    if (cam.y > groundY + 5) return;

    var bx = cx - 36;
    var by = groundY - 56;
    // Building base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(bx - 2, groundY - 4, 76, 6);

    // Main building body
    var bodyGrad = ctx.createLinearGradient(0, by, 0, groundY);
    bodyGrad.addColorStop(0, '#3d2c1c');
    bodyGrad.addColorStop(1, '#5a4225');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(bx, by + 12, 72, 44);
    // Trim
    ctx.fillStyle = '#7a5a32';
    ctx.fillRect(bx, by + 12, 72, 2);
    ctx.fillRect(bx, groundY - 6, 72, 2);

    // Roof (sloped)
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + 14);
    ctx.lineTo(bx + 36, by - 4);
    ctx.lineTo(bx + 76, by + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.fillRect(bx - 4, by + 12, 80, 3);

    // Sign panel
    var signY = by + 18;
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, bx + 6, signY, 60, 12, 2, true);
    // Sign glow
    ctx.fillStyle = 'rgba(255,200,80,0.22)';
    ctx.fillRect(bx + 6, signY + 13, 60, 2);
    // Sign text "STATION"
    ctx.fillStyle = '#FFD27A';
    ctx.font = 'bold 8px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STATION', bx + 36, signY + 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Lit windows
    var wins = [
      [bx + 10, by + 36, 10, 8],
      [bx + 26, by + 36, 10, 8],
      [bx + 42, by + 36, 10, 8],
      [bx + 58, by + 36, 6, 8]
    ];
    var t = performance.now() / 1000;
    for (var i = 0; i < wins.length; i++) {
      var ww = wins[i];
      var pulse = 0.7 + 0.3 * Math.sin(t * 1.3 + i);
      ctx.fillStyle = 'rgba(255,210,120,' + (0.5 * pulse + 0.4).toFixed(2) + ')';
      ctx.fillRect(ww[0], ww[1], ww[2], ww[3]);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ww[0] + ww[2] / 2 - 0.5, ww[1], 1, ww[3]);
      ctx.fillRect(ww[0], ww[1] + ww[3] / 2 - 0.5, ww[2], 1);
    }

    // Door
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(bx + 28, groundY - 16, 14, 14);
    ctx.fillStyle = '#FFD27A';
    ctx.fillRect(bx + 39, groundY - 9, 1.5, 1.5);

    // Awning
    ctx.fillStyle = '#a44';
    ctx.fillRect(bx + 4, by + 32, 64, 3);
    ctx.fillStyle = '#822';
    for (var sw = 0; sw < 8; sw++) {
      ctx.fillRect(bx + 4 + sw * 8, by + 35, 4, 2);
    }
  }

  // ----- Drive-through pump pad -----
  function drawPumpPad() {
    var pad = pumpPadRect();
    var groundY = DECK_ROW * TILE;  // pump sits on top of the elevated deck
    if (pad.x + pad.w < cam.x || pad.x > cam.x + screenW) return;
    if (cam.y > groundY + 5) return;

    var t = performance.now() / 1000;

    // Pad: striped surface
    ctx.fillStyle = '#1f2429';
    ctx.fillRect(pad.x, groundY - 4, pad.w, 4);
    // Yellow stripes (moving when player on pad)
    var offset = playerOnPumpPad() ? (t * 18) % 6 : 0;
    ctx.fillStyle = '#FFD700';
    for (var sx = -6; sx < pad.w + 6; sx += 6) {
      ctx.fillRect(pad.x + sx + offset, groundY - 3, 3, 2);
    }
    // Glow when active
    if (playerOnPumpPad()) {
      var glowGrad = ctx.createLinearGradient(0, groundY - 14, 0, groundY);
      glowGrad.addColorStop(0, 'rgba(255,215,0,0)');
      glowGrad.addColorStop(1, 'rgba(255,215,0,0.35)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(pad.x, groundY - 14, pad.w, 14);
    }

    // Pump tower (left side)
    var px = pad.x + 2;
    var py = groundY - 22;
    ctx.fillStyle = '#c83a3a';
    roundRect(ctx, px, py, 8, 18, 1, true);
    ctx.fillStyle = '#a02020';
    ctx.fillRect(px, py + 14, 8, 4);
    // Pump screen
    ctx.fillStyle = '#0a1820';
    ctx.fillRect(px + 1, py + 2, 6, 4);
    ctx.fillStyle = playerOnPumpPad() ? '#5cffb0' : '#3a8060';
    ctx.font = 'bold 3px ' + UI_FONT;
    ctx.fillText('$', px + 2.5, py + 5.2);
    // Hose
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 8);
    ctx.quadraticCurveTo(px + 14, py + 12, px + 12, py + 18);
    ctx.stroke();

    // Sign above pad
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, pad.x + pad.w / 2 - 18, groundY - 36, 36, 10, 2, true);
    ctx.fillStyle = '#FFD27A';
    ctx.font = 'bold 6px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.fillText('REFUEL · DEPOSIT', pad.x + pad.w / 2, groundY - 29);
    ctx.textAlign = 'left';

    // Refuel particles
    if (player.refueling) {
      for (var pi = 0; pi < 3; pi++) {
        var pxp = player.x + PLAYER_W / 2 + (Math.random() - 0.5) * 8;
        var pyp = player.y + PLAYER_H * 0.5 + Math.random() * 6 - 4;
        ctx.fillStyle = 'rgba(120,255,180,' + (0.4 + Math.random() * 0.4).toFixed(2) + ')';
        ctx.fillRect(pxp, pyp, 1.5, 1.5);
      }
    }
  }

  // Reusable UI font (defined near constants at top)

  function drawPlayer() {
    ctx.save();

    var t = performance.now() / 1000;

    // Drill shake offset
    var shakeX = 0, shakeY = 0;
    if (drilling) {
      shakeX = (Math.random() - 0.5) * 0.6;
      shakeY = (Math.random() - 0.5) * 0.6;
    }

    // Translate to player world position
    ctx.translate(player.x + shakeX, player.y + shakeY);

    // Squash on landing impact
    var sq = player.squash || 0;
    if (sq > 0) {
      var sy = 1 - sq * 0.18;
      var sx = 1 + sq * 0.15;
      ctx.translate(PLAYER_W / 2, PLAYER_H);
      ctx.scale(sx, sy);
      ctx.translate(-PLAYER_W / 2, -PLAYER_H);
    }

    // Flip horizontally if facing left
    if (player.dir < 0) {
      ctx.translate(PLAYER_W, 0);
      ctx.scale(-1, 1);
    }

    // ----- Drop shadow -----
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(PLAYER_W / 2, PLAYER_H + 1, 11, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ----- Treads (under body) -----
    ctx.fillStyle = '#1c1c1f';
    roundRect(ctx, 1, 19, 20, 7, 2, true);
    ctx.fillStyle = '#3a3a3e';
    ctx.fillRect(2, 20, 18, 1);
    var roll = (player.x * 0.18) % 4;
    ctx.fillStyle = '#52525a';
    for (var w = 0; w < 5; w++) {
      var wx = 2 + w * 4 - roll;
      if (wx > 0 && wx < 19) ctx.fillRect(wx, 22, 2, 3);
    }
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(1, 19, 20, 1);
    ctx.fillRect(1, 25, 20, 1);

    // ----- Body (main hull) with vertical gradient -----
    var bodyGrad = ctx.createLinearGradient(0, 4, 0, 19);
    bodyGrad.addColorStop(0,   '#ffd166');
    bodyGrad.addColorStop(0.5, '#e8a735');
    bodyGrad.addColorStop(1,   '#a36f1a');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, 3, 5, 16, 14, 3, true);

    // Body shadow under cabin
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(3, 13, 16, 2);

    // Body bolts
    ctx.fillStyle = '#5c3d10';
    ctx.fillRect(4,  16, 1, 1);
    ctx.fillRect(17, 16, 1, 1);
    ctx.fillRect(4,  6,  1, 1);
    ctx.fillRect(17, 6,  1, 1);

    // ----- Cabin window -----
    var winGrad = ctx.createLinearGradient(0, 6, 0, 13);
    winGrad.addColorStop(0, '#9bdcff');
    winGrad.addColorStop(1, '#2a7fb8');
    ctx.fillStyle = winGrad;
    roundRect(ctx, 6, 6, 10, 7, 1.5, true);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(6, 6, 10, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(7, 6.5, 3, 1);
    ctx.fillRect(7, 8, 1, 2);

    // ----- Antenna -----
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15, 5);
    ctx.lineTo(16, 1);
    ctx.stroke();
    var blink = (Math.sin(t * 4) + 1) * 0.5;
    ctx.fillStyle = 'rgba(255,80,80,' + (0.5 + blink * 0.5) + ')';
    ctx.beginPath();
    ctx.arc(16, 1, 1.1, 0, Math.PI * 2);
    ctx.fill();

    // ----- Headlight -----
    ctx.fillStyle = '#ffe89c';
    ctx.fillRect(18, 9, 2, 3);
    var coneGrad = ctx.createLinearGradient(20, 10, 28, 10);
    coneGrad.addColorStop(0, 'rgba(255,232,156,0.35)');
    coneGrad.addColorStop(1, 'rgba(255,232,156,0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(20, 9);
    ctx.lineTo(28, 5);
    ctx.lineTo(28, 15);
    ctx.lineTo(20, 12);
    ctx.closePath();
    ctx.fill();

    // ----- Drill arm + bit -----
    ctx.fillStyle = '#3a3a3e';
    ctx.fillRect(15, 17, 4, 4);
    ctx.fillStyle = '#5a5a60';
    ctx.fillRect(15, 17, 4, 1);

    var drillRot = drilling ? (t * 18) % 1 : 0;
    ctx.save();
    ctx.translate(17, 21);
    var bitGrad = ctx.createLinearGradient(-3, 0, 3, 0);
    bitGrad.addColorStop(0, '#7a7a82');
    bitGrad.addColorStop(0.5, '#cccccc');
    bitGrad.addColorStop(1, '#5a5a62');
    ctx.fillStyle = bitGrad;
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(3, 0);
    ctx.lineTo(2, 5);
    ctx.lineTo(-2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(-2, 5);
    ctx.lineTo(2, 5);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.7;
    for (var b = 0; b < 3; b++) {
      var by = 1 + b * 1.6 + drillRot * 1.6;
      if (by > 0 && by < 5) {
        ctx.beginPath();
        ctx.moveTo(-3 + by * 0.15, by);
        ctx.lineTo(3 - by * 0.15, by + 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();

    // ----- Jetpack flame -----
    if (player.thrusting && player.fuel > 0) {
      var flick = 0.6 + Math.random() * 0.4;
      ctx.fillStyle = 'rgba(255,140,40,' + (flick * 0.55) + ')';
      ctx.beginPath();
      ctx.moveTo(5, PLAYER_H - 1);
      ctx.lineTo(11, PLAYER_H + 4 + Math.random() * 5);
      ctx.lineTo(17, PLAYER_H - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,120,' + flick + ')';
      ctx.beginPath();
      ctx.moveTo(8, PLAYER_H - 1);
      ctx.lineTo(11, PLAYER_H + 2 + Math.random() * 3);
      ctx.lineTo(14, PLAYER_H - 1);
      ctx.closePath();
      ctx.fill();
      if (Math.random() < 0.4) {
        ctx.fillStyle = 'rgba(180,180,180,0.25)';
        ctx.beginPath();
        ctx.arc(11 + (Math.random() - 0.5) * 4, PLAYER_H + 6 + Math.random() * 4, 2 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawDpad(cx, cy) {
    var R = DPAD_SIZE * 0.85;        // visible ring matches actual touch radius

    // Soft drop shadow under the ring
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, R + 2, 0, Math.PI * 2);
    ctx.fill();

    // Translucent dark base disc
    var baseGrad = ctx.createRadialGradient(cx, cy - R * 0.2, 0, cx, cy, R);
    baseGrad.addColorStop(0, 'rgba(40,32,22,0.55)');
    baseGrad.addColorStop(1, 'rgba(20,16,12,0.45)');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring (defines the touch area boundary)
    ctx.strokeStyle = 'rgba(255,210,120,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // Inner subtle ring (visual depth)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // ---- Four direction pads (rounded rect backgrounds + arrows) ----
    var pad = R * 0.36;            // pad extent
    var armOffset = R * 0.55;      // distance from center to pad center
    var dirs = [
      { name: 'up',    pressed: dpad.up,    x: cx,             y: cy - armOffset },
      { name: 'down',  pressed: dpad.down,  x: cx,             y: cy + armOffset },
      { name: 'left',  pressed: dpad.left,  x: cx - armOffset, y: cy             },
      { name: 'right', pressed: dpad.right, x: cx + armOffset, y: cy             }
    ];
    for (var di = 0; di < dirs.length; di++) {
      var d = dirs[di];
      // Pad backing
      var bgFill = d.pressed ? 'rgba(255,210,120,0.65)' : 'rgba(255,255,255,0.10)';
      var bgStroke = d.pressed ? 'rgba(255,255,210,0.95)' : 'rgba(255,255,255,0.22)';
      ctx.fillStyle = bgFill;
      roundRect(ctx, d.x - pad, d.y - pad, pad * 2, pad * 2, 5, true);
      ctx.strokeStyle = bgStroke;
      ctx.lineWidth = 1;
      roundRect(ctx, d.x - pad, d.y - pad, pad * 2, pad * 2, 5, false, true);

      // Arrow (white, dark when pressed for contrast against highlight)
      ctx.fillStyle = d.pressed ? '#1a1208' : 'rgba(255,255,255,0.9)';
      var ah = pad * 0.55;        // arrow size
      ctx.beginPath();
      if (d.name === 'up') {
        ctx.moveTo(d.x, d.y - ah);
        ctx.lineTo(d.x - ah, d.y + ah * 0.55);
        ctx.lineTo(d.x + ah, d.y + ah * 0.55);
      } else if (d.name === 'down') {
        ctx.moveTo(d.x, d.y + ah);
        ctx.lineTo(d.x - ah, d.y - ah * 0.55);
        ctx.lineTo(d.x + ah, d.y - ah * 0.55);
      } else if (d.name === 'left') {
        ctx.moveTo(d.x - ah, d.y);
        ctx.lineTo(d.x + ah * 0.55, d.y - ah);
        ctx.lineTo(d.x + ah * 0.55, d.y + ah);
      } else {
        ctx.moveTo(d.x + ah, d.y);
        ctx.lineTo(d.x - ah * 0.55, d.y - ah);
        ctx.lineTo(d.x - ah * 0.55, d.y + ah);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Center hub dot
    ctx.fillStyle = 'rgba(255,210,120,0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pretty layer name + dramatic subtitle
  var LAYER_DISPLAY = {
    topsoil:    { title: 'TOPSOIL',         sub: 'Loose earth and roots',                color: '#a0824a' },
    bedrock:    { title: 'BEDROCK',         sub: 'Common minerals begin',                color: '#a8a8a8' },
    permafrost: { title: 'PERMAFROST',      sub: 'Heated drill required',                color: '#bfe6ff' },
    fossil:     { title: 'FOSSIL LAYER',    sub: 'Ancient remains, ancient prices',      color: '#d8aa66' },
    deepcrust:  { title: 'DEEP CRUST',      sub: 'Watch for radioactive deposits',       color: '#9aff9a' },
    magma:      { title: 'MAGMA VEINS',     sub: 'Heat shield strongly recommended',     color: '#ff7a3a' },
    crystal:    { title: 'CRYSTAL CAVES',   sub: 'Rare gemstones glitter in the dark',   color: '#b0c4ff' },
    mantle:     { title: 'MANTLE EDGE',     sub: 'Where dragons dwell',                  color: '#ff3030' },
  };

  function drawLayerBanner() {
    var info = LAYER_DISPLAY[layerBanner.name];
    if (!info) return;
    // Lifecycle (total 2.5s): slide-in (2.5 → 2.0), hold (2.0 → 0.5),
    // slide-out (0.5 → 0). Fade matches the slide.
    var t = layerBanner.t;
    var fade, slideProg;
    if (t > 2.0) {
      // Slide in from above
      var p = (2.5 - t) / 0.5;       // 0 → 1
      fade = p;
      slideProg = p;
    } else if (t < 0.5) {
      // Slide out upward
      var p2 = t / 0.5;              // 1 → 0
      fade = p2;
      slideProg = 0.5 + (1 - p2) * 0.5;  // shifts back upward
      // Actually keep it in place, just fade. Cleaner.
      slideProg = 1;
      fade = p2;
    } else {
      fade = 1;
      slideProg = 1;
    }

    // Card dimensions — sized to content, centered horizontally,
    // pinned just below the HUD top bar.
    var hudH = 46;
    var cardW = Math.min(360, viewW - 40);
    var cardH = 64;
    var cardX = (viewW - cardW) / 2;
    var slideOffset = (1 - slideProg) * 22;
    var cardY = hudH + 14 - slideOffset;

    ctx.save();
    ctx.globalAlpha = fade;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, cardX + 2, cardY + 4, cardW, cardH, 8, true);

    // Card background — dark with a subtle vertical gradient
    var bgGrad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
    bgGrad.addColorStop(0, 'rgba(22,18,12,0.96)');
    bgGrad.addColorStop(1, 'rgba(12,10,8,0.96)');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, cardX, cardY, cardW, cardH, 8, true);

    // Layer-color side accent bar (left edge)
    ctx.fillStyle = info.color;
    roundRect(ctx, cardX, cardY, 4, cardH, 2, true);
    // Soft glow extending right from the accent
    var glowGrad = ctx.createLinearGradient(cardX + 4, 0, cardX + 60, 0);
    glowGrad.addColorStop(0, info.color);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = fade * 0.18;
    ctx.fillStyle = glowGrad;
    ctx.fillRect(cardX + 4, cardY, 60, cardH);
    ctx.globalAlpha = fade;

    // Outer border
    ctx.strokeStyle = 'rgba(255,210,120,0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, cardW, cardH, 8, false, true);

    // "ENTERING" eyebrow label
    ctx.font = 'bold 9px ' + UI_FONT;
    ctx.fillStyle = 'rgba(255,210,120,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('ENTERING', cardX + 18, cardY + 18);

    // Title
    ctx.font = 'bold 20px ' + UI_FONT;
    ctx.fillStyle = info.color;
    ctx.fillText(info.title, cardX + 18, cardY + 38);

    // Subtitle
    ctx.font = '11px ' + UI_FONT;
    ctx.fillStyle = '#a89e88';
    ctx.fillText(info.sub, cardX + 18, cardY + 53);

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHUD() {
    // Top bar
    var barH = 46;
    var grad = ctx.createLinearGradient(0, 0, 0, barH);
    grad.addColorStop(0, 'rgba(10,8,5,0.92)');
    grad.addColorStop(1, 'rgba(10,8,5,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, barH);
    ctx.fillStyle = 'rgba(255,200,80,0.35)';
    ctx.fillRect(0, barH - 1, viewW, 1);

    var px = 14;
    var py = 16;
    var labelFont = 'bold 10px ' + UI_FONT;
    var valueFont = 'bold 13px ' + UI_FONT;

    // Fuel
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('FUEL', px, 12);
    var fuelPct = player.fuel / getMaxFuel();
    var barW = 92;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, px, 16, barW, 10, 3, true);
    var fuelColor = fuelPct > 0.4 ? '#56c876' : fuelPct > 0.2 ? '#e8a735' : '#e44';
    ctx.fillStyle = fuelColor;
    roundRect(ctx, px, 16, Math.max(2, barW * fuelPct), 10, 3, true);

    // "Fuel needed to climb back to surface" indicator — drawn as a marker
    // on the fuel bar. If the marker sits to the right of the current fuel
    // level, you don't have enough fuel to make it back.
    var maxFuelNow = getMaxFuel();
    var fuelToSurface = getFuelToSurface();
    if (fuelToSurface > 0.5 && fuelToSurface <= maxFuelNow * 1.5) {
      var markerPct = Math.min(1, fuelToSurface / maxFuelNow);
      var markerX = px + barW * markerPct;
      var safe = player.fuel >= fuelToSurface;
      // Vertical line marker
      ctx.fillStyle = safe ? 'rgba(255,255,255,0.85)' : 'rgba(255,90,90,0.95)';
      ctx.fillRect(markerX - 1, 13, 2, 16);
      // Tiny upward arrow above it
      ctx.beginPath();
      ctx.moveTo(markerX, 10);
      ctx.lineTo(markerX - 3, 14);
      ctx.lineTo(markerX + 3, 14);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = valueFont;
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(player.fuel) + '/' + Math.ceil(getMaxFuel()), px, 38);
    // Tiny "↑X" callout next to the value showing fuel cost to surface
    if (fuelToSurface > 0.5) {
      var safeNow = player.fuel >= fuelToSurface;
      ctx.font = 'bold 10px ' + UI_FONT;
      ctx.fillStyle = safeNow ? 'rgba(180,200,180,0.85)' : '#ff7a7a';
      var valueW = ctx.measureText(Math.ceil(player.fuel) + '/' + Math.ceil(getMaxFuel())).width;
      ctx.fillText('↑' + Math.ceil(fuelToSurface), px + valueW + 6, 38);
    }

    // Hull
    px += barW + 22;
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('HULL', px, 12);
    var hullPct = player.hull / getMaxHull();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, px, 16, barW, 10, 3, true);
    var hullColor = hullPct > 0.5 ? '#5aa3ff' : hullPct > 0.25 ? '#e8a735' : '#e44';
    ctx.fillStyle = hullColor;
    roundRect(ctx, px, 16, Math.max(2, barW * hullPct), 10, 3, true);
    ctx.font = valueFont;
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(player.hull) + '/' + Math.ceil(getMaxHull()), px, 38);

    // Depth
    px += barW + 28;
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('DEPTH', px, 12);
    var depth = Math.max(0, Math.floor((player.y / TILE) - SKY_ROWS + 1));
    ctx.font = valueFont;
    ctx.fillStyle = '#e8e8d0';
    ctx.fillText(depth + 'm', px, 30);

    // Money
    px += 80;
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('CASH', px, 12);
    ctx.font = valueFont;
    ctx.fillStyle = '#FFD700';
    ctx.fillText('$' + money.toLocaleString(), px, 30);

    // Cargo
    px += 100;
    ctx.font = labelFont;
    ctx.fillStyle = '#9aa';
    ctx.fillText('CARGO', px, 12);
    ctx.font = valueFont;
    var cargoColor = cargo.length >= maxCargo ? '#e44' : (cargo.length >= maxCargo * 0.8 ? '#e8a735' : '#e8e8d0');
    ctx.fillStyle = cargoColor;
    ctx.fillText(cargo.length + '/' + maxCargo, px, 30);

    // Cargo dots — each piece of ore as a colored pip
    var dotsX = px + 70;
    if (dotsX + cargo.length * 7 < viewW - 10) {
      for (var ci = 0; ci < cargo.length; ci++) {
        var oc = ORES[cargo[ci]].color;
        ctx.fillStyle = oc;
        ctx.fillRect(dotsX + ci * 7, 12, 5, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(dotsX + ci * 7, 12, 5, 1);
      }
    }
  }

  // Shop layout constants (kept in sync with handleShopClick)
  var SHOP_LAYOUT = {
    boxW: 0, boxX: 0, boxY: 0, boxH: 0,
    sellY: 0, refuelY: 0, itemsStartY: 0, itemH: 0
  };

  function computeShopLayout() {
    var L = SHOP_LAYOUT;
    L.boxW = Math.min(440, viewW - 32);
    L.boxX = (viewW - L.boxW) / 2;
    var itemsCount = (typeof shopItems !== 'undefined' && shopItems.length) ? shopItems.length : 7;
    var headerH = 90;
    var actionsH = 62;          // sell button (38) + pump-pad hint (24)
    var footerH = 30;
    var maxBoxH = viewH - 24;
    // Solve for itemH that fits everything in maxBoxH
    var availableForItems = maxBoxH - headerH - actionsH - footerH;
    L.itemH = Math.max(46, Math.min(62, Math.floor(availableForItems / itemsCount)));
    L.boxH = headerH + actionsH + itemsCount * L.itemH + footerH;
    L.boxY = (viewH - L.boxH) / 2;
    if (L.boxY < 12) L.boxY = 12;
  }

  function drawShop() {
    buildShopItems();
    computeShopLayout();
    var L = SHOP_LAYOUT;

    // Dim backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);

    // Modal panel — dark with subtle gradient and gold trim
    var panelGrad = ctx.createLinearGradient(0, L.boxY, 0, L.boxY + L.boxH);
    panelGrad.addColorStop(0, '#1f1812');
    panelGrad.addColorStop(1, '#15100b');
    ctx.fillStyle = panelGrad;
    roundRect(ctx, L.boxX, L.boxY, L.boxW, L.boxH, 12, true);
    // Gold trim
    ctx.strokeStyle = 'rgba(255,210,120,0.45)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, L.boxX + 0.75, L.boxY + 0.75, L.boxW - 1.5, L.boxH - 1.5, 12, false, true);
    // Inner shadow at top
    var topShadow = ctx.createLinearGradient(0, L.boxY, 0, L.boxY + 12);
    topShadow.addColorStop(0, 'rgba(0,0,0,0.5)');
    topShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topShadow;
    roundRect(ctx, L.boxX, L.boxY, L.boxW, 12, 12, true);

    var cy = L.boxY + 28;

    // Title
    ctx.fillStyle = '#FFD27A';
    ctx.font = 'bold 22px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.fillText('STATION', viewW / 2, cy);
    cy += 20;

    // Balance pill
    var balText = '$' + money.toLocaleString();
    ctx.font = 'bold 13px ' + UI_FONT;
    var balW = ctx.measureText(balText).width + 24;
    ctx.fillStyle = 'rgba(255,215,0,0.12)';
    roundRect(ctx, viewW / 2 - balW / 2, cy - 11, balW, 20, 10, true);
    ctx.strokeStyle = 'rgba(255,215,0,0.4)';
    ctx.lineWidth = 1;
    roundRect(ctx, viewW / 2 - balW / 2, cy - 11, balW, 20, 10, false, true);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(balText, viewW / 2, cy + 3);
    cy += 24;

    // ---- Action row: SELL only (refuel/repair happens at the pump pad) ----
    var actionH = 38;
    var actionW = L.boxW - 32;       // full-width sell button
    var actionX1 = L.boxX + 16;
    L.sellY = cy;
    L._actionW = actionW;
    L._actionX1 = actionX1;
    L._actionH = actionH;

    // Sell button
    var sellVal = 0;
    for (var ci = 0; ci < cargo.length; ci++) sellVal += ORES[cargo[ci]].value;
    var canSell = cargo.length > 0 && sellVal > 0;
    var sellGrad = ctx.createLinearGradient(0, cy, 0, cy + actionH);
    sellGrad.addColorStop(0, canSell ? '#3aa05a' : '#2e2820');
    sellGrad.addColorStop(1, canSell ? '#226d3b' : '#1c1812');
    ctx.fillStyle = sellGrad;
    roundRect(ctx, actionX1, cy, actionW, actionH, 6, true);
    ctx.strokeStyle = canSell ? 'rgba(160,255,180,0.3)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    roundRect(ctx, actionX1, cy, actionW, actionH, 6, false, true);
    ctx.fillStyle = canSell ? '#fff' : '#666';
    ctx.font = 'bold 13px ' + UI_FONT;
    ctx.textAlign = 'center';
    ctx.fillText(canSell ? 'SELL CARGO  ·  +$' + sellVal.toLocaleString() : 'SELL CARGO', actionX1 + actionW / 2, cy + 24);

    cy += actionH + 6;

    // Pump-pad hint (replaces the old REFUEL & REPAIR shop button)
    ctx.font = '10px ' + UI_FONT;
    ctx.fillStyle = '#7e7460';
    ctx.fillText('Refuel & repair: drive onto the pump pad outside', viewW / 2, cy + 8);
    cy += 18;

    // ---- Upgrade items ----
    L.itemsStartY = cy;
    var iconColors = {
      drill:  '#cccccc',
      fuel:   '#56c876',
      hull:   '#5aa3ff',
      cargo:  '#FFD27A',
      heat:   '#ff7a3a',
      shield: '#a87bff',
      vert:   '#9bdcff'
    };
    var iconGlyphs = {
      drill:  '⛏',
      fuel:   '⛽',
      hull:   '◆',
      cargo:  '▤',
      heat:   '♨',
      shield: '◈',
      vert:   '↑'
    };
    var compactMode = L.itemH < 56;
    var iconSize = compactMode ? 26 : 34;
    var cardInner = L.itemH - 10;
    for (var i = 0; i < shopItems.length; i++) {
      var item = shopItems[i];
      var lvl = item.level;
      var maxed = lvl >= item.costs.length;
      var cost = maxed ? 0 : item.costs[lvl];
      var canBuy = !maxed && money >= cost;

      var iy = cy;
      // Item card
      var cardGrad = ctx.createLinearGradient(0, iy, 0, iy + cardInner);
      cardGrad.addColorStop(0, canBuy ? '#2c2620' : '#1f1c18');
      cardGrad.addColorStop(1, canBuy ? '#221d18' : '#181612');
      ctx.fillStyle = cardGrad;
      roundRect(ctx, L.boxX + 16, iy, L.boxW - 32, cardInner, 6, true);
      ctx.strokeStyle = canBuy ? 'rgba(255,210,120,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      roundRect(ctx, L.boxX + 16, iy, L.boxW - 32, cardInner, 6, false, true);

      // Icon block
      var iconX = L.boxX + 24;
      var iconY = iy + (cardInner - iconSize) / 2;
      ctx.fillStyle = iconColors[item.key] || '#888';
      roundRect(ctx, iconX, iconY, iconSize, iconSize, 4, true);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(iconX, iconY + iconSize - 3, iconSize, 3);
      // Icon glyph
      ctx.fillStyle = '#1a1208';
      ctx.font = 'bold ' + (compactMode ? 14 : 18) + 'px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconGlyphs[item.key] || '?', iconX + iconSize / 2, iconY + iconSize / 2 + 1);
      ctx.textBaseline = 'alphabetic';

      // Item title (use item.title) — for special binary items like heat, show "Owned" instead of Lv
      ctx.textAlign = 'left';
      ctx.fillStyle = canBuy ? '#fff' : (maxed ? '#7d6d4d' : '#bbb');
      ctx.font = 'bold ' + (compactMode ? 12 : 14) + 'px ' + UI_FONT;
      var titleSuffix;
      if (item.key === 'heat') {
        titleSuffix = upgrades.heatLevel >= 1 ? ' · Owned' : '';
      } else if (item.key === 'shield') {
        titleSuffix = upgrades.shieldLevel > 0 ? ' · Mk ' + upgrades.shieldLevel : '';
      } else if (item.key === 'vert') {
        titleSuffix = upgrades.vertLevel >= 1 ? ' · Owned' : '';
      } else {
        titleSuffix = ' · Lv ' + lvl;
      }
      var textX = iconX + iconSize + 10;
      ctx.fillText(item.title + titleSuffix, textX, iy + (compactMode ? 18 : 22));
      // Description
      ctx.fillStyle = '#9a907c';
      ctx.font = (compactMode ? 10 : 11) + 'px ' + UI_FONT;
      ctx.fillText(item.desc, textX, iy + (compactMode ? 32 : 38));

      // Cost / status pill on right
      ctx.textAlign = 'right';
      var pillX = L.boxX + L.boxW - 24;
      var pillY = iy + (cardInner - 22) / 2;
      var pillText, pillBg, pillFg;
      if (maxed) {
        pillText = (item.key === 'heat' || item.key === 'vert') ? 'INSTALLED' : 'MAX';
        pillBg = 'rgba(120,200,140,0.18)';
        pillFg = '#9be6b1';
      } else if (canBuy) {
        pillText = '$' + cost.toLocaleString();
        pillBg = 'rgba(255,215,0,0.16)';
        pillFg = '#FFD700';
      } else {
        pillText = '$' + cost.toLocaleString();
        pillBg = 'rgba(255,80,80,0.12)';
        pillFg = '#e88';
      }
      ctx.font = 'bold ' + (compactMode ? 11 : 12) + 'px ' + UI_FONT;
      var pw = ctx.measureText(pillText).width + 16;
      ctx.fillStyle = pillBg;
      roundRect(ctx, pillX - pw, pillY, pw, 22, 11, true);
      ctx.fillStyle = pillFg;
      ctx.fillText(pillText, pillX - 8, pillY + 15);

      ctx.textAlign = 'left';
      cy += L.itemH;
    }

    // Footer hint
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6a604c';
    ctx.font = '11px ' + UI_FONT;
    ctx.fillText(isMobile ? 'Tap outside to close' : 'Click outside or press [P] / [Esc] to close',
                 viewW / 2, L.boxY + L.boxH - 14);
    ctx.textAlign = 'left';
  }

  function roundRect(c, x, y, w, h, r, fill, stroke) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    if (fill) c.fill();
    if (stroke) c.stroke();
  }

  /* ---- Game Loop ---- */
  function loop(time) {
    var dt = (time - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = time;

    // Restart
    if (gameOver) {
      if (keys['r'] || keys['R'] || touch.active) {
        if (touch.active) touch.active = false;
        init();
      }
    }

    // Shop toggle via keyboard ('P' for shoP)
    if (keys['p'] || keys['P']) {
      keys['p'] = keys['P'] = false;
      if (shopOpen) shopOpen = false;
      else if (playerNearShop()) shopOpen = true;
    }
    // ESC closes shop
    if (keys['Escape'] && shopOpen) { keys['Escape'] = false; shopOpen = false; }

    update(dt);
    updateCamera();
    render();
    requestAnimationFrame(loop);
  }

  /* ---- Boot ---- */
  resize();
  window.addEventListener('resize', resize);
  setupInput();
  init();
  requestAnimationFrame(function (t) { lastTime = t; loop(t); });
})();
