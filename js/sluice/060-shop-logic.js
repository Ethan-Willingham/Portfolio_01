  /* ---- Shop ---- */
  var shopItems = [];
  function buildShopItems() {
    // Build descriptions that show the concrete current → next-level delta
    // so players know exactly what they're buying. Maxed items show what
    // they currently provide (no arrow).
    var dl = upgrades.drillLevel;
    var fl = upgrades.fuelLevel;
    var hl = upgrades.hullLevel;
    var cl = upgrades.cargoLevel;
    var pl = upgrades.pumpLevel || 0;
    var bl = upgrades.boosterLevel || 1;
    var maxLvl = shop.drill.length - 1;     // shared length across the four numeric upgrades

    // Numeric helpers — fuel mirrors getMaxFuel(); hull and cargo stay linear.
    var fuelAt  = function (lv) {
      // v11.35 — match getMaxFuel() table.
      var caps = [0, 30, 55, 85, 120, 165, 220];
      if (lv >= caps.length) return caps[caps.length - 1];
      if (lv < 1) return caps[1];
      return caps[lv];
    };
    var hullAt  = function (lv) { return BASE_HULL + (lv - 1) * 60; };
    var cargoAt = function (lv) { return 5 + (lv - 1) * 4; };
    // Booster: scales the UNDERGROUND vertical climb only (above-ground flight is
    // fixed). Shown as a % of the climb-thrust anchor (tier 3 = 100%).
    var boosterAt = function (lv) {
      var m = [0, 70, 85, 100, 125, 155];
      if (lv >= m.length) return m[m.length - 1];
      if (lv < 1) return m[1];
      return m[lv];
    };

    function deltaDesc(lv, label, fn) {
      if (lv >= maxLvl) return label + ': ' + fn(lv) + ' (max)';
      return label + ': ' + fn(lv) + ' → ' + fn(lv + 1) + '  (+' + (fn(lv + 1) - fn(lv)) + ')';
    }

    // Drill: power level both speeds up mining AND unlocks tougher ores.
    // Unlock thresholds (from ORES.reqDrill): Lv3 → uranium/tanzanite,
    // Lv4 → diamond, Lv5 → painite, Lv6 → unobtanium. Lv1→2 is just speed.
    var drillUnlocks = {
      2: null,
      3: 'uranium & tanzanite',
      4: 'diamond',
      5: 'painite',
      6: 'unobtanium'
    };
    var drillDesc;
    if (dl >= maxLvl) {
      drillDesc = drillTierName(dl) + ' · Power ' + dl + ' (max) · breaks anything';
    } else {
      var unlock = drillUnlocks[dl + 1];
      drillDesc = drillTierName(dl + 1) + ' · Power ' + dl + ' → ' + (dl + 1);
      if (unlock) drillDesc += ' · unlocks ' + unlock;
      else drillDesc += ' · faster mining';
    }

    var fuelDesc = deltaDesc(fl, 'Capacity', fuelAt);
    var boosterDesc = (bl >= shop.booster.length)
      ? 'Underground climb: ' + boosterAt(bl) + '% (max)'
      : 'Underground climb: ' + boosterAt(bl) + '% → ' + boosterAt(bl + 1) + '%';

    var pumpDesc;
    if (pl <= 0) {
      pumpDesc = 'Sucks underground oil into a sellable tank';
    } else if (pl >= shop.pump.length) {
      pumpDesc = 'Tank ' + getOilTankCapacity() + ' gal · wide suction · max';
    } else {
      var curTank = getOilTankCapacity();
      var nextTank = [0, 24, 58, 120][pl + 1];
      pumpDesc = 'Tank ' + curTank + ' → ' + nextTank + ' gal · stronger suction';
    }

    shopItems = [
      { key: 'drill',  title: 'Drill',         desc: drillDesc,                              level: dl, costs: shop.drill },
      { key: 'fuel',   title: 'Fuel Tank',     desc: fuelDesc,                               level: fl, costs: shop.fuel },
      { key: 'hull',   title: 'Hull Plating',  desc: deltaDesc(hl, 'Hull',     hullAt),      level: hl, costs: shop.hull },
      { key: 'cargo',  title: 'Cargo Bay',     desc: deltaDesc(cl, 'Slots',    cargoAt),     level: cl, costs: shop.cargo },
      { key: 'booster',title: 'Booster',       desc: boosterDesc,                            level: bl, costs: shop.booster },
      { key: 'heat',   title: 'Heated Drill',  desc: 'Required to break permafrost (35m+)',  level: upgrades.heatLevel,   costs: shop.heat,   special: true },
      { key: 'shield', title: 'Heat Shield',   desc: upgrades.shieldLevel === 0
                                                       ? 'Mk 1: halves magma damage (110m+)'
                                                       : (upgrades.shieldLevel === 1
                                                          ? 'Mk 2: full magma immunity'
                                                          : 'Mk 2 · full magma immunity'),
                                                                                              level: upgrades.shieldLevel, costs: shop.shield, special: true },
      { key: 'vert',   title: 'Vertical Drill',desc: 'Hold Up against a ceiling to drill upward', level: upgrades.vertLevel, costs: shop.vert, special: true },
      { key: 'pump',   title: 'Oil Pump',      desc: pumpDesc,                                level: pl, costs: shop.pump, special: true },
      // Consumable with a hard cap (maxCount): emergency fuel tanks that
      // auto-deploy the instant the main tank runs dry. Cheap; hold up to 4.
      { key: 'reserveFuel', title: 'Reserve Fuel',
        desc: 'Auto-deploys at empty · +' + RESERVE_FUEL_REFILL + ' fuel · hold up to ' + RESERVE_FUEL_MAX,
        level: reserveFuel, costs: [shop.reserveFuel], consumable: true, maxCount: RESERVE_FUEL_MAX },
      // Consumable: stack as many as you can afford. Each charge instantly
      // warps you back to the station. Press [T] (or tap the chip on the HUD).
      { key: 'teleporter', title: 'Teleporter',
        desc: (isMobile ? 'Tap chip in HUD to use' : 'Press [T] to use') + ' · returns rig to nearest station',
        level: teleporters, costs: [shop.teleporter], consumable: true },
      // Consumable: deploy giant rover-style airbag balloons and free-fall
      // straight down, bouncing harmlessly off the bottom. Great for getting
      // deep fast.
      { key: 'balloon', title: 'Rover Balloons',
        desc: (isMobile ? 'Tap chip in HUD to use' : 'Press [B] to use') + ' · invincible deep drop',
        level: balloons, costs: [shop.balloon], consumable: true },
      // Consumable: small explosive — clears one tile at the rig's feet.
      // Cheapest way through the reinforced barrier band at 65m.
      { key: 'bombSmall', title: 'Small Charge',
        desc: (isMobile ? 'Tap chip in HUD to use' : 'Press [1] to use') + ' · single-tile blast',
        level: bombsSmall, costs: [shop.bombSmall], consumable: true },
      // Consumable: large explosive — clears a 3×3 area. Useful for
      // punching a wider hole through the barrier or carving a fast
      // path through dense terrain below it.
      { key: 'bombLarge', title: 'Large Charge',
        desc: (isMobile ? 'Tap chip in HUD to use' : 'Press [2] to use') + ' · 3×3 blast',
        level: bombsLarge, costs: [shop.bombLarge], consumable: true },
    ];
  }

  function buyUpgrade(item) {
    // Consumables (teleporters, balloons, bombs) — never max out, just
    // deduct cost and add a charge. In dev mode, the cost is waived.
    if (item.consumable) {
      // Reserve fuel is the one consumable with a hard cap.
      // All shop lines share radio key 'buy' (058): rapid-fire purchases
      // coalesce into one live line instead of a queued backlog, and the
      // KOMENDATURA tag marks the quartermaster as the speaker.
      if (item.key === 'reserveFuel' && reserveFuel >= RESERVE_FUEL_MAX) {
        showMsg('Reserve tanks full (' + RESERVE_FUEL_MAX + ')', false, SHOP_MSG);
        sfxPlay('ui-denied');
        return;
      }
      var price = item.costs[0];
      if (!devMode && money < price) { showMsg('Need $' + price.toLocaleString(), false, SHOP_MSG); sfxPlay('ui-denied'); return; }
      if (!devMode) money -= price;
      sfxPlay('ui-confirm');   // the ONE confirm tink — covers legacy + workshop + shelf (§2.11)
      if (item.key === 'teleporter') {
        teleporters++;
        showMsg('Teleporter purchased! (' + teleporters + ')', false, SHOP_MSG);
      } else if (item.key === 'balloon') {
        balloons++;
        showMsg('Rover balloons stocked! (' + balloons + ')', false, SHOP_MSG);
      } else if (item.key === 'bombSmall') {
        bombsSmall++;
        showMsg('Small charge stocked! (' + bombsSmall + ')', false, SHOP_MSG);
      } else if (item.key === 'bombLarge') {
        bombsLarge++;
        showMsg('Large charge stocked! (' + bombsLarge + ')', false, SHOP_MSG);
      } else if (item.key === 'reserveFuel') {
        reserveFuel++;
        showMsg('Reserve tank stocked! (' + reserveFuel + '/' + RESERVE_FUEL_MAX + ')', false, SHOP_MSG);
      }
      track('shop_purchase', { item: item.key, cost: price, depth: depthRecord, dev: !!devMode });
      return;
    }
    var lvl = upgrades[item.key + 'Level'];
    if (lvl >= item.costs.length) { showMsg('Max level!', false, SHOP_MSG); sfxPlay('ui-denied'); return; }
    var cost = item.costs[lvl];
    if (!devMode && money < cost) { showMsg('Need $' + cost.toLocaleString(), false, SHOP_MSG); sfxPlay('ui-denied'); return; }
    if (!devMode) money -= cost;
    sfxPlay('ui-confirm');
    upgrades[item.key + 'Level']++;
    track('shop_purchase', { item: item.key, level: upgrades[item.key + 'Level'], cost: cost, depth: depthRecord, dev: !!devMode });
    maxFuel = getMaxFuel();
    maxCargo = getMaxCargo();
    player.fuel = maxFuel;
    player.hull = getMaxHull();
    var label = item.title;
    if (item.key === 'heat') label = 'Heated Drill installed!';
    else if (item.key === 'shield') label = 'Heat Shield Mk ' + upgrades.shieldLevel + ' installed!';
    else if (item.key === 'vert') label = 'Vertical Drill installed!';
    else if (item.key === 'pump') label = 'Oil Pump Mk ' + upgrades.pumpLevel + ' installed!';
    else if (item.key === 'drill') label = drillTierName(upgrades.drillLevel) + ' installed!';
    else label = label + ' upgraded!';
    showMsg(label, false, SHOP_MSG);
  }
  // Shared radio-channel opts for every shop line (058): one live 'buy'
  // line, spoken by the quartermaster.
  var SHOP_MSG = { tag: 'KOMENDATURA', key: 'buy' };

  // ---- Shop input handlers (down / move / up) ----
  // The shop now scrolls, so a single "click" doesn't cut it. Pointer-down
  // remembers the entry point (so we can decide later whether the gesture
  // was a tap or a drag), pointer-move drives drag scrolling, and
  // pointer-up either commits a buy/close or finalizes the drag with a
  // little inertial fling.
  function handleShopPointerDown(x, y, id) {
    buildShopItems();
    computeShopLayout();
    var L = SHOP_LAYOUT;

    // Click outside the shop box -> close (tap-out-to-close behavior)
    if (x < L.boxX || x > L.boxX + L.boxW || y < L.boxY || y > L.boxY + L.boxH) {
      // Defer the close to pointer-up so a slight wobble during a tap
      // doesn't immediately dismiss; we record the intent here.
      shopDrag = { id: id, mode: 'closeIntent', startY: y, startX: x };
      return;
    }

    // Scrollbar thumb drag — if the user grabs the scrollbar directly,
    // pointer-move maps Y to scroll position 1:1 with the track.
    if (L._sbW > 0 &&
        x >= L._sbX - 6 && x <= L._sbX + L._sbW + 6 &&
        y >= L._sbY && y <= L._sbY + L._sbH) {
      shopDrag = {
        id: id,
        mode: 'scrollbar',
        startY: y,
        startScroll: shopScroll,
        anchorY: y,
      };
      return;
    }

    // Sell button — tap, not drag
    if (y >= L.sellY && y < L.sellY + L._actionH &&
        x >= L._actionX1 && x < L._actionX1 + L._actionW) {
      shopDrag = { id: id, mode: 'tap', startY: y, startX: x, target: 'sell' };
      return;
    }

    // Inside the items viewport — could be a tap (buy) or a drag (scroll).
    // Decide on pointer-up based on how far we moved.
    var inViewport =
      y >= L.itemsStartY &&
      y < L.itemsStartY + L.itemsViewportH &&
      x >= L.boxX + 8 && x <= L.boxX + L.boxW - 8;
    if (inViewport) {
      shopDrag = {
        id: id,
        mode: 'maybeItem',
        startY: y,
        startX: x,
        startScroll: shopScroll,
        lastY: y,
        lastT: performance.now(),
        vy: 0,
      };
      return;
    }

    // Tap landed in the header / footer area — no-op.
    shopDrag = { id: id, mode: 'tap', startY: y, startX: x, target: null };
  }

  function handleShopPointerMove(x, y, id) {
    if (!shopDrag || shopDrag.id !== id) return;
    var L = SHOP_LAYOUT;

    if (shopDrag.mode === 'scrollbar') {
      // Map current y position on the track to a scroll position. The thumb
      // can travel from sbY to sbY + (sbH - thumbH); the scroll fraction is
      // the position within that range.
      var travel = L._sbH - L._sbThumbH;
      if (travel <= 0) return;
      var rel = (y - L._sbY - L._sbThumbH / 2) / travel;
      if (rel < 0) rel = 0;
      if (rel > 1) rel = 1;
      shopScroll = rel * L.scrollMax;
      return;
    }

    if (shopDrag.mode === 'maybeItem') {
      var dy = y - shopDrag.startY;
      // If we've moved far enough vertically, promote to a drag-scroll
      // gesture so the user can scroll with the same finger motion they
      // used to grab the list.
      if (Math.abs(dy) > 6 || shopDrag.mode === 'drag') {
        shopDrag.mode = 'drag';
        var newScroll = shopDrag.startScroll - dy;
        if (newScroll < 0) newScroll = 0;
        if (newScroll > L.scrollMax) newScroll = L.scrollMax;
        // Track instantaneous velocity for fling on release
        var now = performance.now();
        var dt = (now - shopDrag.lastT) / 1000;
        if (dt > 0) shopDrag.vy = (y - shopDrag.lastY) / dt;
        shopDrag.lastY = y;
        shopDrag.lastT = now;
        shopScroll = newScroll;
      }
      return;
    }

    // For 'tap' / 'closeIntent', a big move cancels the action.
    if (shopDrag.mode === 'tap' || shopDrag.mode === 'closeIntent') {
      var dx = x - shopDrag.startX;
      var dy2 = y - shopDrag.startY;
      if (Math.sqrt(dx * dx + dy2 * dy2) > 14) {
        shopDrag.mode = 'cancelled';
      }
    }
  }

  function handleShopPointerUp(id) {
    if (!shopDrag || shopDrag.id !== id) return;
    var L = SHOP_LAYOUT;
    var d = shopDrag;
    shopDrag = null;

    if (d.mode === 'closeIntent') {
      shopOpen = false;
      return;
    }

    if (d.mode === 'tap' && d.target === 'sell') {
      if (cargo.length > 0) sellCargo();
      return;
    }

    if (d.mode === 'maybeItem') {
      // Tap landed on whatever item is under (startX, startY) accounting
      // for the current scroll offset.
      var localY = (d.startY - L.itemsStartY) + shopScroll;
      var idx = Math.floor(localY / L.itemH);
      if (idx >= 0 && idx < shopItems.length) {
        // Verify the tap is within the card body (not the gap between cards)
        var inCard = (localY - idx * L.itemH) < (L.itemH - 6);
        var inXRange = d.startX >= L.boxX + 16 && d.startX <= L.boxX + L.boxW - 16;
        if (inCard && inXRange) {
          buyUpgrade(shopItems[idx]);
        }
      }
      return;
    }

    if (d.mode === 'drag') {
      // Inertial fling: kick scroll along with the last measured velocity,
      // decaying smoothly. We don't have a per-frame tick on shopScroll,
      // so simulate inertia by stepping it down here over a short window
      // via a setTimeout-based animation. Cheap and effective.
      var v = d.vy * -0.018;        // tune
      if (Math.abs(v) < 0.3) return;
      var step = function () {
        if (shopDrag) return;       // user grabbed again — abort the fling
        shopScroll += v;
        if (shopScroll < 0) shopScroll = 0;
        if (shopScroll > SHOP_LAYOUT.scrollMax) shopScroll = SHOP_LAYOUT.scrollMax;
        v *= 0.92;
        if (Math.abs(v) > 0.05 &&
            shopScroll > 0 && shopScroll < SHOP_LAYOUT.scrollMax) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
      return;
    }
  }

  // Wheel-to-scroll the shop (desktop). Adds a passive listener directly
  // on the canvas — only consumes the scroll when the shop is open so
  // page scrolling outside the canvas behaves normally.
  function handleShopWheel(e) {
    // v14.1 — new shop interior consumes the wheel for its scrollable lists.
    if (UI_NEW && USE_NEW_SHOP_UI && shopState !== 'closed') {
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= 100;
      if (newShopWheel(d)) e.preventDefault();
      return;
    }
    if (!shopOpen) return;
    e.preventDefault();
    // deltaMode 0 = pixels, 1 = lines, 2 = pages. Normalize lines/pages
    // by approximating 16px per line so wheel feel is consistent across
    // platforms.
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= 100;
    shopScroll += delta;
    var L = SHOP_LAYOUT;
    if (shopScroll < 0) shopScroll = 0;
    if (shopScroll > L.scrollMax) shopScroll = L.scrollMax;
  }

  // ----- Dev test harness: load a fat, varied haul + a roomy cargo bay -----
  // So the pump-pad auto-sell reveal can be felt/tuned without grinding for it.
  // Called from init() when dev mode is on, and on demand via the 'Y' hotkey
  // (350-gameloop-boot.js). The spread spans every payout tier so the reveal
  // drips low -> mid -> high and the richest stack (unobtanium) lands last as
  // the finale; the oil beat exercises the Crude Oil placard too.
  function devLoadTestHaul() {
    upgrades.cargoLevel = 12;       // bigger bay: getMaxCargo() = 5 + 11*4 = 49
    maxCargo = getMaxCargo();
    cargo = [];
    var haul = [
      ['coal', 8], ['copper', 6], ['iron', 5], ['silver', 4],
      ['gold', 5], ['emerald', 3], ['diamond', 2], ['painite', 1],
      ['unobtanium', 1]
    ];
    for (var hi = 0; hi < haul.length; hi++) {
      for (var hj = 0; hj < haul[hi][1]; hj++) cargo.push({ type: haul[hi][0], shiny: false });
    }
    // A few shiny units so the dev test haul (Y) exercises the shiny premium placards.
    cargo.push({ type: 'gold', shiny: true });
    cargo.push({ type: 'gold', shiny: true });
    cargo.push({ type: 'diamond', shiny: true });
    oilGallons = 60;                // adds a Crude Oil beat (~$1,080)
  }

  function sellCargo(auto) {
    // The pump-pad dock sale is a REVEAL: the haul sells one ore type at a time
    // (ascending, richest last) while the brass balance window counts up. The
    // shop "sell" button stays instant — that's a menu action, not a dock moment.
    if (auto) { startSellReveal(); return; }
    var total = 0;
    for (var i = 0; i < cargo.length; i++) {
      total += cargoUnitValue(cargo[i]);
    }
    if (oilGallons > 0) {
      total += Math.floor(oilGallons * LIQUID_OIL_VALUE);
    }
    if (total === 0) return;
    money += total;
    cargo = [];
    oilGallons = 0;
    showMsg('+$' + total, false, { tag: 'KOMENDATURA', key: 'sell' });
  }
  var autoSellFlash = null;   // legacy single-flash hook — no longer set; its render guards on it

  // ----- Auto-sell reveal (pump-pad dock) -----
  // The dock sale is the approved "Impactful but classy" reveal, ported from the
  // chooser the owner signed off on (autosell-lab.html, floaters style). As the
  // rig refuels, the haul sells one ore type at a time: a riveted steel placard
  // pops above the rig (ore swatch + count + gold payout, easeOutBack overshoot,
  // then a slow upward drift + fade), coin/ore chips spill off the rig and land
  // on the deck, and the brass balance window counts up to a finale. Ascending
  // order means the richest stack lands last. No vignette + no screen shake in
  // game; the finale is the cash-window punch (the lab's split-flap board was a
  // lab-only flourish). Tuning levers all live in SR_L below.
  //
  // displayMoney is the balance the brass window actually shows: it eases UP
  // toward `money` (odometer climb) and snaps on any drop (purchases, restart).
  // cashPunch brightens the readout per beat, full warm-white on the finale.
  // Both are advanced in update() (080); the renderer is drawSellReveal() (220).
  var displayMoney = 0;
  var cashPunch = 0;
  var sellReveal = null;   // active beat sequence: { beats, n, startNow }
  var srFloats = [];        // live payout placards (world-anchored: wax/way)
  var srParts = [];         // live coin/ore chips spilling onto the deck (world-anchored)
  var srNow = 0;            // master clock (ms); advances whenever anything animates
  // World-anchoring is PER ENTITY, in TRUE world space. Each placard + chip stamps the
  // rig's feet in WORLD coords (wax/way) the instant its beat fires; drawSellReveal +
  // srDrawChips (220) re-project that with the LIVE cam + worldScale via srWorldToScreen
  // every frame. So every payout pops where the rig was at that moment and pins there in
  // the world: the player can roam between beats and nothing snaps to the rig, each pop
  // stays put and scrolls away with the world. Chip motion lives in a local out-px frame
  // (lx/ly) scaled at draw by the live srUiScale(). NOTE: the grand-total finale board is
  // the exception, it sits STATIONARY on screen (srDrawFinale), not world-pinned.

  // Approved "impactful" preset (verbatim from the lab).
  var SR_L = {
    gapStart: 1300, gapAccel: 0.80, gapFloor: 950,   // accelerating cadence between pops (slowed for readability 2026-06-07)
    popIn: 310, overshoot: 1.11,                     // card entrance (easeOutBack)
    finaleHold: 615, finalePunch: 1.25,              // breath + slam before the richest stack
    particles: 40,                                   // base chip count, scaled by tier
    floatRise: 120, floatLife: 1850, floatFade: 520, // card drift + hold + fade (slower = readable)
    finaleExtra: 500,                                // the hero card lingers a touch longer
    shinyExtra: 700,                                 // a SHINY stack lingers longer still
    // Grand-total board: after the richest stack pops, a beat of closure, then the
    // split-flap "TOTAL FROM LOAD" board locks in, holds to be read, then fades.
    finaleDelay: 480, finaleIn: 360,                 // closure pause, then board lock-in time
    finaleBoardHold: 1200, finaleBoardFade: 480      // board read-hold + fade-out
  };
  var SR_INTRO = 260;                                 // delay before the first pop
  var SR_TIER_PMUL = [0.55, 1.0, 1.7, 2.6];           // chip-count multiplier per tier
  var SR_OIL_COLOR = '#5b4a2a';                       // crude-oil swatch (oil isn't an ORE)

  function srClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function srRand(a, b) { return a + Math.random() * (b - a); }
  function srEaseBack(p, ov) {                         // overshoot ease, peak ~= ov
    var s = Math.max(0.05, 17.0 * (ov - 1));
    var t = p - 1;
    return 1 + (s + 1) * t * t * t + s * t * t;
  }
  function srTierOf(total) {                           // payout weight -> chip/type tier
    if (total >= 6000) return 3;
    if (total >= 1500) return 2;
    if (total >= 150) return 1;
    return 0;
  }

  // The pop anchors to the rig's actual on-screen position so payouts read as
  // coming off the player. Converts the player's world position to CSS px via the
  // render transform (ws = dpr * worldScale; CSS px = (world - cam) * worldScale).
  function srRigAnchor() {
    var sc = (typeof worldScale === 'number' && worldScale > 0) ? worldScale : 2;
    var cx = (player.x + PLAYER_W / 2 - cam.x) * sc;
    var gy = (player.y + PLAYER_H - cam.y) * sc;       // the rig's feet / deck line
    var mx = Math.min(120, viewW * 0.25);              // keep the pop fully on-screen
    cx = srClamp(cx, mx, viewW - mx);
    gy = srClamp(gy, viewH * 0.32, viewH * 0.80);
    return { cx: cx, gy: gy };
  }

  // Project a WORLD-space point to current CSS-pixel (HUD) space using the LIVE
  // camera + zoom. A card/chip stamps its world anchor (the rig's feet at the
  // instant its beat fired) and calls this every frame, so the pop pins to that
  // exact spot on the dock: it does NOT follow the rig as the player roams, it
  // simply scrolls with the world, and a mid-reveal zoom re-projects it correctly
  // (cam + worldScale both change together, so no corner-snap). No clamp here —
  // world-pinned pops are allowed to scroll off-screen.
  function srWorldToScreen(wx, wy) {
    var sc = (typeof worldScale === 'number' && worldScale > 0) ? worldScale : 2;
    return { x: (wx - cam.x) * sc, y: (wy - cam.y) * sc };
  }

  // The pop-ups live in CSS-pixel (HUD) space, but the OWNER wants them to read as
  // part of the world: bigger when zoomed in, smaller when zoomed out, tracking the
  // rig's on-screen size. uiScale = worldScale / (worldScale the 'out' preset would
  // pick for THIS viewport), so it pins to exactly 1.0 at 'out' zoom (current tuning
  // preserved) and grows toward ~2.1 at 'in'. Baked per-entity as `us0` at spawn (so a
  // card keeps its size while the player roams + re-zooms), read live for pre-spawn FX.
  // SR_ZOOM_GAIN damps/exaggerates the response around the neutral 1.0 pivot.
  var SR_ZOOM_GAIN = 1.0;
  function srUiScale() {
    var ws = (typeof worldScale === 'number' && worldScale > 0) ? worldScale : 2;
    var ref = viewW / (ZOOM_TILES.out * TILE);          // worldScale the 'out' preset yields here
    if (typeof isMobile !== 'undefined' && isMobile) ref *= 0.9;
    ref = Math.max(1.2, Math.min(ref, 4.5));            // mirror computeTargetWorldScale's clamp
    if (ref <= 0) return 1;
    var raw = ws / ref;                                 // 1.0 at 'out', ~2.1 at 'in'
    return srClamp(1 + (raw - 1) * SR_ZOOM_GAIN, 0.65, 2.6);
  }

  function startSellReveal() {
    if (sellReveal) return;            // one reveal at a time; fresh cargo waits its turn
    var groups = {};                   // group the loose ore array into per-type stacks
    for (var i = 0; i < cargo.length; i++) {                 // shiny units form their own stack
      var u = cargo[i];
      var gky = cargoType(u) + (cargoShiny(u) ? '#s' : '');
      if (!groups[gky]) groups[gky] = { type: cargoType(u), shiny: cargoShiny(u), count: 0 };
      groups[gky].count++;
    }
    var items = [];
    for (var k in groups) {
      if (!groups.hasOwnProperty(k)) continue;
      var g = groups[k];
      var def = ORES[g.type];
      var tot = g.count * cargoUnitValue({ type: g.type, shiny: g.shiny });
      items.push({ label: (g.shiny ? 'Shiny ' : '') + ((def && def.label) || g.type),
                   color: g.shiny ? '#ffe6a0' : ((def && def.color) || '#cdd6e0'),
                   count: g.count, oil: false, total: tot, tier: srTierOf(tot), shiny: g.shiny });
    }
    if (oilGallons > 0) {
      var otot = Math.floor(oilGallons * LIQUID_OIL_VALUE);
      items.push({ label: 'Crude Oil', color: SR_OIL_COLOR, count: oilGallons,
                   oil: true, total: otot, tier: srTierOf(otot) });
    }
    if (!items.length) return;
    items.sort(function (a, b) { return a.total - b.total; }); // ascending: richest lands last
    cargo = [];                        // bank the haul out of the hold now;
    oilGallons = 0;                    // money is credited beat-by-beat as cards pop
    // Dev mode pins the wallet at 999999, which would freeze the count-up. Snap
    // the bank + odometer to 0 here so the cash window ramps from $0 through the
    // haul like real early-game play (350 leaves money alone while a reveal is
    // animating, then restores the dev wallet once the cards finish fading).
    if (devMode) { money = 0; displayMoney = 0; }
    // Build the beat timeline: an intro, then an accelerating gap between pops,
    // a breath before the finale, and a 170ms telegraph glow on big/last stacks.
    var beats = [];
    var t = SR_INTRO;
    for (var bi = 0; bi < items.length; bi++) {
      var last = (bi === items.length - 1);
      if (bi > 0) t += Math.max(SR_L.gapFloor, SR_L.gapStart * Math.pow(SR_L.gapAccel, bi - 1));
      if (last) t += SR_L.finaleHold;
      var tele = (items[bi].tier >= 2 || last) ? 170 : 0;
      beats.push({ item: items[bi], at: t, tele: tele, fired: false });
    }
    var grandTot = 0;
    for (var gi = 0; gi < items.length; gi++) grandTot += items[gi].total;
    sellReveal = { beats: beats, n: items.length, startNow: srNow, grand: grandTot, finaleAt: -1, finaleSfx: false, fwx: 0, fwy: 0 };
  }

  // Fire one beat: pop the placard, credit the bank, flash the readout, and
  // burst the coin/ore chips off the rig.
  function srFireBeat(b, idx, n) {
    var it = b.item;
    var last = (idx === n - 1);
    // WORLD-pin: stamp the rig's feet IN WORLD COORDS at the instant this beat fires.
    // The card + its chips anchor to this spot and stay put as the player roams to
    // the next beat (220 re-projects via srWorldToScreen every frame). Card lift and
    // chip physics live in a LOCAL frame measured in 'out'-zoom px (the size every
    // tuned constant was authored at); 220 multiplies that local offset by the LIVE
    // srUiScale(), so a local-px arc becomes worldScale/outScale px on screen, i.e.
    // the exact same projection a true world distance gets. That makes the pop both
    // world-pinned AND zoom-proportional with one anchor, no baked snapshot.
    var wax = player.x + PLAYER_W / 2;     // rig centre (world x)
    var way = player.y + PLAYER_H;         // rig feet / deck line (world y)
    srFloats.push({ it: it, wax: wax, way: way, born: srNow,
                    slam: last ? SR_L.finalePunch : (it.shiny ? 1.16 : 1.0), slamAt: srNow, last: last,
                    life: SR_L.floatLife + (last ? SR_L.finaleExtra : 0) + (it.shiny ? SR_L.shinyExtra : 0) });
    // The count-up coin tick (project_autosell_reveal): pitch climbs beat by
    // beat, richer stacks tick a touch louder, the hero stack lands hardest.
    sfxPlay('sell-tick', { rate: 1 + 0.05 * idx, gain: (0.65 + 0.35 * (it.tier / 3)) * (last ? 1.2 : 1) });
    var cnt = Math.round(SR_L.particles * SR_TIER_PMUL[it.tier]);
    for (var c = 0; c < cnt; c++) {
      var gold = Math.random() < 0.62;
      var sp = srRand(40, 150) * (1 + it.tier * 0.22);   // LOCAL out-px/s (scaled to screen at draw)
      var ang = srRand(-Math.PI, 0); // upward fan
      srParts.push({
        wax: wax, way: way,                // shared world anchor (rig feet at this beat)
        lx: srRand(-6, 6), ly: -90,        // local offset from anchor: spawn at the card (~90px up)
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - srRand(30, 90),
        g: srRand(700, 1000), sz: gold ? srRand(2, 4) : srRand(2, 3),
        col: gold ? '#ffd24a' : it.color, gold: gold,
        landed: false, restLY: 2 + srRand(-1, 4),   // rest on the deck just below the feet line
        landT: 0, restLife: srRand(0.55, 1.25), bounces: gold ? 1 : 0
      });
    }
    money += it.total;                 // the balance window climbs to here (eased in update())
    var flash = last ? 1 : (0.45 + 0.55 * (it.tier / 3)); // bigger stacks flash harder
    if (flash > cashPunch) cashPunch = flash;
    // The richest stack is the climax: let it fully pop in, hold a closure beat,
    // then commit the grand-total board (drawn in 220). Cards clear off first.
    // Stamp the hero's WORLD spot so 220 can world-pin the board there (it stays put
    // on the dock when the player flies away, like the cards/chips do).
    if (last && sellReveal) {
      sellReveal.finaleAt = srNow + SR_L.popIn + SR_L.finaleDelay;
      sellReveal.fwx = wax; sellReveal.fwy = way;
    }
  }

  function tickSellReveal(dt) {
    // Nothing to do until a reveal is queued or chips/cards are still settling.
    if (!sellReveal && !srFloats.length && !srParts.length) return;
    var ms = dt * 1000;
    srNow += ms;

    if (sellReveal) {
      var sr = sellReveal;
      // Leaving the pad mid-sale PAUSES the beat sequencer: hold `rel` where it is
      // (advance startNow in lockstep with the clock) so no new placards pop while
      // the rig is away. The already-spawned cards + chips keep animating below and
      // clear off, so the reveal "comes to an end" on screen; stepping back onto the
      // pad lets rel grow again and the remaining beats pick back up. Money is
      // credited per beat, and the only way back to play is refueling here, so the
      // pending total is simply credited as those beats resume — nothing is stranded.
      var srOnPad = (typeof playerOnPumpPad === 'function') ? playerOnPumpPad() : true;
      if (!srOnPad) sr.startNow += ms;
      var rel = srNow - sr.startNow;
      var allFired = true;
      for (var i = 0; i < sr.beats.length; i++) {
        var b = sr.beats[i];
        if (!b.fired) {
          if (rel >= b.at) { b.fired = true; srFireBeat(b, i, sr.n); }
          else allFired = false;
        }
      }
      // The grand-total payoff flourish fires once, the instant the board
      // commits (the same srNow edge drawSellReveal keys its lock-in from).
      if (sr.finaleAt >= 0 && !sr.finaleSfx && srNow >= sr.finaleAt) {
        sr.finaleSfx = true;
        sfxPlay('sell-total');
      }
      // Once every beat has fired, the reveal stays alive only long enough for the
      // grand-total board to commit, hold, and fade (finaleAt is scheduled on the
      // last beat, in the future). Placards + chips finish their own fade below.
      if (allFired && sr.finaleAt >= 0 &&
          srNow - sr.finaleAt > SR_L.finaleIn + SR_L.finaleBoardHold + SR_L.finaleBoardFade) {
        sellReveal = null;
      }
    }

    // Chip physics: arc up -> land on the deck -> rest a beat -> fade out.
    for (var p = srParts.length - 1; p >= 0; p--) {
      var pt = srParts[p];
      if (pt.landed) {
        pt.landT += dt;
        if (pt.landT >= pt.restLife) srParts.splice(p, 1);
        continue;
      }
      pt.vy += pt.g * dt;
      pt.lx += pt.vx * dt;             // integrate in the LOCAL (world-anchored) frame
      pt.ly += pt.vy * dt;
      if (pt.ly >= pt.restLY) {
        pt.ly = pt.restLY;             // land on the deck (relative to the rig's feet at spawn)
        if (pt.bounces > 0 && pt.vy > 90) {
          pt.bounces--;                // one small metallic bounce for coins (vy is zoom-independent)
          pt.vy = -pt.vy * 0.34;
          pt.vx *= 0.55;
        } else {
          pt.landed = true; pt.landT = 0; pt.vx = 0; pt.vy = 0;
        }
      }
    }
    // Retire placards once they have fully drifted up + faded.
    for (var fi = srFloats.length - 1; fi >= 0; fi--) {
      if ((srNow - srFloats[fi].born) > srFloats[fi].life + SR_L.floatFade) srFloats.splice(fi, 1);
    }
  }

  // Floating mining text effects ("+$X Item") that drift up and fade
  var floaters = [];
  function spawnFloater(wx, wy, text, color, show) {
    floaters.push({
      x: wx,
      y: wy,
      text: text,
      color: color || '#FFD700',
      vy: -22,             // initial upward speed in world px/sec
      t: 1.4,              // total lifetime in seconds
      maxT: 1.4,
      show: !!show,        // true = render even under UI_NEW (ore pickups)
    });
  }

  function showMsg(t, alert, opts) {
    msgText = t;
    // Alerts (red, important warnings — cargo full, hull damage) hold for
    // a longer period so the player has time to react. Routine confirmations
    // ("Small charge stocked!") fade quickly so they don't pile up
    // on the screen — particularly while the shop is open and the player
    // is rapid-firing purchases.
    msgTimer = alert ? 2.5 : 1.0;
    msgAlert = !!alert;
    // v24.134: route to the RADIO MESSAGES channel (058), the one surface
    // that renders under UI_NEW. msgText/msgTimer above stay for the
    // legacy !UI_NEW pill renderer in 140. opts: {tag, key, dur}, see 058.
    if (typeof radioMsgPush === 'function') radioMsgPush(t, alert, opts);
  }
  var msgAlert = false;

  // Consume a teleporter charge: snap player to the deck near the station,
  // refund nothing, but trigger a brief visual flash so the warp feels real.
  function activateTeleporter() {
    if (gameOver || gameWon || shopOpen) return;
    if (teleporters <= 0) {
      showMsg('No teleporters! Buy one in the shop.');
      return;
    }
    // If the player is already at the surface, don't waste the charge.
    if (player.y < SKY_ROWS * TILE) {
      showMsg('Already at the surface');
      return;
    }

    teleporters--;
    var srcX = player.x + PLAYER_W / 2;
    var srcY = player.y + PLAYER_H / 2;
    var destX = (DECK_CENTER_COL + 1) * TILE + TILE / 2 - PLAYER_W / 2;
    var destY = DECK_ROW * TILE - PLAYER_H;
    player.x = destX;
    player.y = destY;
    player.vx = 0;
    player.vy = 0;
    player.slideTargetX = null;
    drilling = null;
    teleportFx = { srcX: srcX, srcY: srcY, destX: player.x + PLAYER_W / 2, destY: player.y + PLAYER_H / 2, t: 0.8, maxT: 0.8 };
    sfxPlay('teleport');
    showMsg('Teleported to surface');
  }

  // ============================================================
  //  ROVER BALLOON DROP
  // ============================================================
  // Inspired by the airbag landing system NASA used for the Spirit and
  // Opportunity rovers. Inflate giant cushioning balloons, free-fall
  // straight down, bounce off the bottom, deflate. Player is invincible
  // for the entire mode. Falling fast enough triggers reentry-style flames.
  //
  // State machine (roverMode.phase):
  //   inflate  → balloons puff out over ~0.4s, then transition to falling
  //   falling  → augmented gravity, no controls, drilling cancelled. The
  //              moment we hit a tile from above, transition to bouncing.
  //   bouncing → like falling but each tile-collision flips vy upward with
  //              decay. When peak bounce height drops below a threshold, we
  //              transition to deflating.
  //   deflate  → balloons pop one by one, ~0.6s, then mode ends and the
  //              player resumes normal control where they landed.
  function activateRoverDrop() {
    if (gameOver || shopOpen) return;
    if (roverMode) {
      showMsg('Balloons already deployed!');
      return;
    }
    if (balloons <= 0) {
      showMsg('No rover balloons! Buy in the shop.');
      return;
    }
    balloons--;
    drilling = null;
    player.slideTargetX = null;
    // Cancel current vertical motion so the inflate animation reads cleanly
    player.vy = 0;
    player.vx = 0;
    // Six balloons in a hex arrangement around the rig — each carries a tiny
    // amount of independent jiggle phase so the cluster looks alive.
    var balloonObjs = [];
    var positions = [
      { ox: -10, oy: -6,  r: 9 },
      { ox:   0, oy: -10, r: 10 },
      { ox:  12, oy: -6,  r: 9 },
      { ox: -12, oy:  6,  r: 9 },
      { ox:   0, oy: 12,  r: 10 },
      { ox:  14, oy:  6,  r: 9 },
    ];
    for (var bi = 0; bi < positions.length; bi++) {
      var p = positions[bi];
      balloonObjs.push({
        ox: p.ox, oy: p.oy,
        targetR: p.r,
        r: 0.5,                    // start tiny, grow during inflate
        phase: Math.random() * Math.PI * 2,
        popped: false,
        popT: 0,                   // time since pop began
      });
    }
    roverMode = {
      phase: 'inflate',
      phaseT: 0,
      inflateDur: 0.4,
      balloons: balloonObjs,
      bounceCount: 0,
      maxFallSpeed: 0,             // peak speed reached, used for HUD/effects
      lastBounceVy: 0,             // |vy| at moment of last bounce, used for decay
      sparks: [],                  // little debris kicked up at bounce points
      reentryHistory: [],          // recent positions for the reentry flame trail
      deflateOrder: shuffleIndices(positions.length),
    };
    sfxPlay('rover-deploy');
    showMsg('Balloons deployed!');
  }

  // ============================================================
  //  EXPLOSIVES
  // ============================================================
  // Two consumables: small (single-tile blast) and large (3×3 blast). Both
  // are dropped at the player's feet — they detonate immediately. Either
  // size can break the reinforced barrier band; the large one also clears
  // a wider area through ordinary terrain.
  //
  // Two-phase activation: pressing the key DROPS the bomb (creates a
  // liveBombs entry with a burning fuse) so the player has time to back
  // away. The actual blast (detonateBomb) runs when the fuse expires —
  // and now CAN damage the player's hull if they're standing too close.
  function activateBomb(size) {
    if (gameOver || shopOpen || roverMode) return;
    var isLarge = size === 'large';
    var have = isLarge ? bombsLarge : bombsSmall;
    if (have <= 0) {
      showMsg(isLarge ? 'No large bombs! Buy in the shop.'
                      : 'No small bombs! Buy in the shop.');
      return;
    }
    if (isLarge) bombsLarge--; else bombsSmall--;

    // Release a live PHYSICS charge (065-bombs.js): it inherits the rig's
    // velocity, tumbles, bounces off terrain, and detonates where it ends
    // up. bombSpawn also plays the throw sfx.
    bombSpawn(size);

    showMsg(isLarge ? 'Large charge dropped — back away!' : 'Charge dropped — back away!', true);
  }

  // updateLiveBombs (fuse tick + projectile physics) and drawLiveBombs now
  // live in 065-bombs.js. detonateBomb below is still the blast they call
  // into when a fuse runs out (or a large charge lands hard enough).

  // Shared detonation — runs the actual blast for a live bomb that has
  // finished fuse-burning. Extracted from the old activateBomb so the
  // dropped-bomb flow can reuse it.
  function detonateBomb(b) {
    var isLarge = b.size === 'large';
    var centerR = b.r;
    var centerC = b.c;

    // Blast footprint: small = 1 tile, large = 3×3 tiles centered.
    var radius = isLarge ? 1 : 0;
    var blastCells = [];
    for (var dr = -radius; dr <= radius; dr++) {
      for (var dc = -radius; dc <= radius; dc++) {
        var br = centerR + dr;
        var bc = centerC + dc;
        // Skip cells entirely out of bounds.
        if (br < SKY_ROWS || br >= TOTAL_ROWS) continue;
        if (bc < 0 || bc >= COLS) continue;
        blastCells.push({ r: br, c: bc });
      }
    }

    for (var bi = 0; bi < blastCells.length; bi++) {
      var cell = blastCells[bi];
      var arr = world, idx = cell.r;
      var tile = arr[idx] ? arr[idx][cell.c] : null;
      if (!tile) continue;
      // Untouchable tiles even by explosives:
      //  - station foundation
      //  - Earth bedrock floor
      if (tile.type === 'foundation') continue;
      if (tile.type === 'bedrock') continue;
      if (tile.type === 'voidrock') continue;
      // Jello is immune to bomb destruction — a direct hit instead wakes the
      // cluster into a live soft body; jelloBombShove() below applies the
      // blast impulse to whatever blobs are in range.
      if (tile.type === 'jello') { activateJelloCluster(cell.r, cell.c); continue; }

      var oreType = tile.type;
      var oreDef = ORES[oreType];
      if (oreDef && oreDef.value > 0 && oreType !== 'barrier') {
        if (cargo.length < maxCargo) {
          var _sh = !!(tile && tile.shiny);
          cargo.push({ type: oreType, shiny: _sh });
          var fwx = cell.c * TILE + TILE / 2;
          var fwy = cell.r * TILE + TILE / 2;
          spawnFloater(fwx, fwy,
            (_sh ? 'Shiny ' : '') + oreDef.label + ' +$' + cargoUnitValue({ type: oreType, shiny: _sh }),
            _sh ? '#ffe6a0' : floaterColorFor(oreType), true);
          if (cargo.length === maxCargo) { showMsg('Cargo full!', true); sfxPlay('cargo-full'); }
        }
      }
      arr[idx][cell.c] = null;
      markTerrainCleared(cell.r, cell.c, tile);
      // Physical debris: reuse the mine-break chips/grit/dust per cleared
      // cell, so the blast throws colored rubble that bounces and settles.
      try { spawnMineBreak(cell.r, cell.c, tile); } catch (e) {}
    }

    // Visual effect — volumetric billows, impact glow, dust streaks.
    var cx = centerC * TILE + TILE / 2;
    var cy = centerR * TILE + TILE / 2;
    var blastR = isLarge ? TILE * 2.4 : TILE * 1.2;
    // The blast lands on the same frame as the visual (SFX_BIBLE §2.10);
    // bomb-large carries the biggest sub in the game, mixed at the asset.
    sfxPlay(isLarge ? 'bomb-large' : 'bomb-small', { pan: sfxPanAt(cx) });
    // Shove any live jello blobs caught in the blast (they never break).
    jelloBombShove(cx, cy, blastR * 1.7, isLarge ? 17 : 9);

    // Billows — overlapping circles that expand outward with drift,
    // each with its own color temperature and top-lit shading.
    var billows = [];
    var billowCount = isLarge ? 14 : 8;
    for (var bi = 0; bi < billowCount; bi++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = Math.random() * blastR * 0.3;
      var drift = 20 + Math.random() * (isLarge ? 60 : 35);
      billows.push({
        x: cx + Math.cos(ang) * dist,
        y: cy + Math.sin(ang) * dist,
        vx: Math.cos(ang) * drift,
        vy: Math.sin(ang) * drift - 15 - Math.random() * 25,
        r: 4 + Math.random() * (isLarge ? 8 : 5),
        maxR: (isLarge ? 22 : 14) + Math.random() * (isLarge ? 16 : 10),
        delay: Math.random() * 0.12,
        heat: Math.random(),
      });
    }

    // Dust streaks — fast radial lines that fade quickly
    var streaks = [];
    var streakCount = isLarge ? 16 : 10;
    for (var si = 0; si < streakCount; si++) {
      var sa = Math.random() * Math.PI * 2;
      streaks.push({
        ang: sa,
        len: (isLarge ? 28 : 16) + Math.random() * (isLarge ? 24 : 14),
        speed: 120 + Math.random() * (isLarge ? 200 : 120),
        dist: 0,
        width: 1 + Math.random() * 1.5,
        bright: 0.4 + Math.random() * 0.6,
      });
    }

    explosions.push({
      cx: cx, cy: cy,
      r: blastR,
      t: 0,
      life: 0.7,
      billows: billows,
      streaks: streaks,
      large: isLarge,
    });


    // ---- Player damage if standing too close ----
    // Damage radius is slightly larger than the visual fireball: small bomb
    // = ~1.4 tiles, large = ~2.8 tiles. Damage falls off linearly with
    // distance, so a hit at the very edge stings but a bullseye really hurts.
    var px = player.x + PLAYER_W / 2;
    var py = player.y + PLAYER_H / 2;
    var dx = px - cx, dy = py - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dangerR = isLarge ? TILE * 2.8 : TILE * 1.4;
    if (dist < dangerR) {
      var prox = 1 - (dist / dangerR);          // 0 (edge) → 1 (epicenter)
      var dmg = (isLarge ? 50 : 25) * prox;
      player.hull -= dmg;
      sfxPlay('hull-hit');   // the receive, layered under the blast itself
      // Brief outward kick away from the blast (knockback)
      var kickAng = Math.atan2(dy || -1, dx || 0);
      var kickStrength = (isLarge ? 280 : 180) * prox;
      player.vx += Math.cos(kickAng) * kickStrength;
      player.vy += Math.sin(kickAng) * kickStrength - 60 * prox;
      // Trigger the red-screen damage flash. Brighter for closer hits.
      damageFlashT = Math.max(damageFlashT, 0.4 + prox * 0.6);
      if (player.hull <= 0) { player.hull = 0; endGame({ type: 'bomb' }); return; }
      showMsg(isLarge ? 'CAUGHT IN THE BLAST!' : 'Singed!', true);
    }
    // No radio line for a clean miss: the blast is its own feedback
    // (the old 'Boom!' echo was pure chatter, dropped in v24.134).
  }

  // Per-frame physics for active explosion effects: expand billows,
  // advance dust streaks, and prune entries that have fully faded.
  function updateExplosions(dt) {
    if (!explosions.length) return;
    for (var ei = explosions.length - 1; ei >= 0; ei--) {
      var ex = explosions[ei];
      ex.t += dt;
      // Tick billows — expand, drift upward, slow down
      for (var bi = 0; bi < ex.billows.length; bi++) {
        var b = ex.billows[bi];
        if (ex.t < b.delay) continue;
        var age = ex.t - b.delay;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= Math.pow(0.3, dt);
        b.vy *= Math.pow(0.35, dt);
        b.r = b.r + (b.maxR - b.r) * (1 - Math.pow(0.05, dt));
      }
      // Tick streaks — advance outward
      for (var si = 0; si < ex.streaks.length; si++) {
        var s = ex.streaks[si];
        s.dist += s.speed * dt;
        s.speed *= Math.pow(0.15, dt);
      }
      if (ex.t > ex.life + 0.4) {
        explosions.splice(ei, 1);
      }
    }
  }

  // Draw all active explosions. Called from render() in world space.
  function drawExplosions() {
    if (!explosions.length) return;
    for (var ei = 0; ei < explosions.length; ei++) {
      var ex = explosions[ei];
      var p = Math.min(ex.t / ex.life, 1);
      var fadeOut = ex.t > ex.life ? 1 - ((ex.t - ex.life) / 0.4) : 1;
      if (fadeOut <= 0) continue;

      // ----- Hot impact glow (ground flash) -----
      if (p < 0.7) {
        var glowA = (1 - p / 0.7) * 0.9 * fadeOut;
        var glowR = ex.r * (0.6 + p * 0.6);
        var gg = ctx.createRadialGradient(ex.cx, ex.cy, 0, ex.cx, ex.cy, glowR);
        gg.addColorStop(0, 'rgba(255,250,220,' + (glowA).toFixed(3) + ')');
        gg.addColorStop(0.3, 'rgba(255,180,60,' + (glowA * 0.7).toFixed(3) + ')');
        gg.addColorStop(0.7, 'rgba(200,60,10,' + (glowA * 0.3).toFixed(3) + ')');
        gg.addColorStop(1, 'rgba(100,20,5,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(ex.cx, ex.cy, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----- Dust streaks (fast radial lines) -----
      for (var si = 0; si < ex.streaks.length; si++) {
        var s = ex.streaks[si];
        var sa = (1 - p * 0.8) * fadeOut * s.bright;
        if (sa <= 0) continue;
        var cos = Math.cos(s.ang), sin = Math.sin(s.ang);
        var x0 = ex.cx + cos * s.dist;
        var y0 = ex.cy + sin * s.dist;
        var x1 = ex.cx + cos * (s.dist + s.len * (1 - p * 0.5));
        var y1 = ex.cy + sin * (s.dist + s.len * (1 - p * 0.5));
        ctx.strokeStyle = 'rgba(255,200,140,' + sa.toFixed(3) + ')';
        ctx.lineWidth = s.width * (1 - p * 0.6);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // ----- Volumetric billows with top-light + shadow -----
      for (var bi = 0; bi < ex.billows.length; bi++) {
        var b = ex.billows[bi];
        if (ex.t < b.delay) continue;
        var age = ex.t - b.delay;
        var bAlpha = Math.min(age / 0.08, 1) * fadeOut;
        // Fade individual billows as they age
        var ageFade = Math.max(0, 1 - (age / (ex.life + 0.3)));
        bAlpha *= ageFade;
        if (bAlpha <= 0.01) continue;

        // Color based on heat — hot billows are bright orange/yellow,
        // cool ones are dark grey-brown smoke
        var r, g, bv;
        if (b.heat > 0.6) {
          // Hot: white-yellow core fading to orange
          var heatP = (b.heat - 0.6) / 0.4;
          r = 255;
          g = 180 + heatP * 70;
          bv = 80 + heatP * 100;
        } else if (b.heat > 0.3) {
          // Warm: orange to dark red
          r = 200 + (b.heat - 0.3) / 0.3 * 55;
          g = 80 + (b.heat - 0.3) / 0.3 * 100;
          bv = 20 + (b.heat - 0.3) / 0.3 * 60;
        } else {
          // Cool: dark brown smoke
          r = 80 + b.heat / 0.3 * 120;
          g = 50 + b.heat / 0.3 * 30;
          bv = 30;
        }

        // Top-lit highlight — lighter on top, darker on bottom
        var topY = b.y - b.r * 0.4;
        var bg = ctx.createRadialGradient(
          b.x, topY, b.r * 0.15,
          b.x, b.y, b.r
        );
        // Top highlight (lit from above)
        bg.addColorStop(0, 'rgba(' + Math.min(255, r + 40) + ',' +
          Math.min(255, g + 30) + ',' + Math.min(255, bv + 20) + ',' +
          (bAlpha * 0.85).toFixed(3) + ')');
        // Mid body
        bg.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + bv + ',' +
          (bAlpha * 0.7).toFixed(3) + ')');
        // Bottom shadow
        bg.addColorStop(1, 'rgba(' + Math.max(0, r - 60) + ',' +
          Math.max(0, g - 40) + ',' + Math.max(0, bv - 20) + ',' +
          (bAlpha * 0.15).toFixed(3) + ')');

        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----- Bright core flash (first few frames) -----
      if (p < 0.2) {
        var coreA = (1 - p / 0.2) * fadeOut;
        var coreR = ex.r * 0.35 * (1 - p * 2);
        var cg = ctx.createRadialGradient(ex.cx, ex.cy, 0, ex.cx, ex.cy, Math.max(1, coreR));
        cg.addColorStop(0, 'rgba(255,255,240,' + coreA.toFixed(3) + ')');
        cg.addColorStop(0.5, 'rgba(255,220,150,' + (coreA * 0.6).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(ex.cx, ex.cy, Math.max(1, coreR), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Tiny Fisher-Yates so balloons pop in a random but distinct order
  function shuffleIndices(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    return arr;
  }

  // Pick a legible floater color for an ore. Most ores look fine drawn in
  // their native color, but a few (obsidian, coal) are nearly black and
  // disappear against the underground background. Override those with a
  // brighter, themed accent so the "+$X" pickup text actually reads.
  var FLOATER_COLOR_OVERRIDE = {
    obsidian: '#b48cd6',   // pale violet — matches obsidian's purple sheen
    coal:     '#9ca0a8',   // light grey
  };
  function floaterColorFor(oreType) {
    return FLOATER_COLOR_OVERRIDE[oreType] || ORES[oreType].color;
  }

  // Returns reason string if the tile cannot be drilled, or null if OK.
  function drillBlockReason(tile, row) {
    if (!tile) return 'empty';
    // Station structural tiles are permanent
    if (tile.type === 'foundation') return 'Foundation — solid cement';
    // Reinforced barrier rock — only explosives clear this band.
    if (tile.type === 'barrier') return 'Reinforced rock — use explosives';
    // Jello — the drill bounces off. Mine around it and shove it loose.
    if (tile.type === 'jello') return 'Too squishy to drill — dig around it';
    // Earth bedrock floor: the very bottom of the world. No drill gets through.
    if (tile.type === 'bedrock') return 'Impenetrable bedrock';
    // No Man's Zone substrate: fully impassable, no drill or bomb gets through.
    if (tile.type === 'voidrock') return 'Impenetrable void rock';
    var depth = row - SKY_ROWS;
    var layer = getLayerForRegion(depth, playerTownIndex());
    var ore = ORES[tile.type];
    // Permafrost layer requires Heated Drill — applies to ALL tiles in that layer
    if (layer.requiresHeat && upgrades.heatLevel < 1) {
      return 'Need Heated Drill';
    }
    // Specific ore needs heated drill (e.g. methane ice)
    if (ore && ore.reqHeat && upgrades.heatLevel < 1) {
      return 'Need Heated Drill';
    }
    // Specific ore needs minimum drill level
    if (ore && ore.reqDrill && upgrades.drillLevel < ore.reqDrill) {
      return 'Drill Lv ' + ore.reqDrill + ' required';
    }
    // Cargo full: refuse to start a dig on a *valuable* tile so we don't
    // waste it. Dirt and stone still drill normally — they're rubble, not
    // collected, so the player can keep tunneling to get home.
    if (cargo.length >= maxCargo && tile.type !== 'dirt' && tile.type !== 'stone') {
      return 'CARGO FULL';
    }
    return null;
  }

