  /* ---- Bathhouse visitors: sky arrival, an order, a soak, and payment ---- */
  // Individual guest recipes are intentionally undecided. These are shared
  // operating resources, never a per-guest water or coal charge.
  var BATH_VISIT = { seconds: 18, pay: 75 };
  var BATH_LEGACY_FIRE_SECONDS = 240;
  var BATH_MIN_WATER = 4000, BATH_MAX_WATER = 15000;
  var bathFire = 0, bathHeat = 0, bathWater = 0, bathPour = 0;
  var bathDrainT = 0, bathLostWater = 0, bathWetFloor = [];
  var bathServiceButtons = [];
  var bathGuests = [];
  var bathGuestCap = 2;
  var bathGuestColliders = [];
  var bathFloats = [];
  var bathServed = 0;
  var bathNotice = '', bathNoticeT = 0;
  var bathSupplies = [0, 0, 0, 0, 0]; // liquid recovered when retiring old garden lots
  var bathIntroSeen = false;

  function bathServiceReset() {
    bathScalePop(); bathSteamPop();
    hearthRoomReset();
    bathGuests.length = 0; bathGuestColliders.length = 0; bathFloats.length = 0;
    bathTransitionSerial++;
    bathMode = false; bathRoomReady = false; bathFading = false;
    bathFloorsOwned = [true, false, false, false, false];
    bathFire = 0; bathHeat = 0; bathWater = 0; bathPour = 0;
    bathLostWater = 0; bathDrainT = 0; bathWetFloor = []; bathServiceButtons = [];
    bathServed = 0; bathNotice = ''; bathNoticeT = 0; bathIntroSeen = false;
    bathSupplies = [0, 0, 0, 0, 0];
    banyaX = -1; bathFoundationReady = false; bathHotTub = null; bathDoorT = 0;
    bathCamPin(); bathCamY = -1;
    if (bathFadeEl) bathFadeEl.style.opacity = '0';
  }

  function bathCoalCount() {
    return forgeCount('coal');
  }
  function bathWaterCount() { return siphon.tank[0] + bathSupplies[0]; }
  function bathCanServe() { return bathWater >= BATH_MIN_WATER && bathHeat >= 0.35; }
  function bathSetNotice(s) { bathNotice = s; bathNoticeT = 5; }

  function bathBasinCount() {
    var F = BATH_FLOORS[0], tb = F.tubs[0];
    return liquidSampleRect(tb[0] * TILE, (F.fr - F.lip - 1) * TILE,
      (tb[1] + 1) * TILE, (F.fr + F.sink + 1) * TILE)[0];
  }
  function bathWaterline() {
    var curve = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]);
    // Invert the actual vessel cross-section at the liquid rest spacing.
    // This also gives parked/offscreen guests the same buoyancy level.
    var low = curve.y0, high = curve.y0 + curve.D;
    for (var n = 0; n < 10; n++) {
      var line = (low + high) * 0.5, volume = 0;
      for (var x = curve.x0 + 4; x < curve.x1; x += 8) volume += Math.max(0, curve.y0 + curve.depthAt(x) - line) * 8 / 1.5625;
      if (volume > bathWater) low = line; else high = line;
    }
    return (low + high) * 0.5;
  }
  function bathLightStove() {
    if (!bathMode || bathFading || gamePaused) return false;
    return hearthStrike();
  }
  function bathAddWater() {
    if (!bathMode || bathFading || gamePaused || !bathRoomReady) return false;
    bathWater = bathBasinCount();
    var count = Math.floor(Math.min(bathWaterCount(), BATH_MAX_WATER - bathWater - bathPour));
    if (count <= 0) {
      bathSetNotice(bathWaterCount() ? 'The tub is full.' : 'Scoop water from a lake, then bring it back in your tank.');
      return false;
    }
    var stored = Math.min(bathSupplies[0], count);
    bathSupplies[0] -= stored; siphon.tank[0] -= count - stored;
    bathPour += count;
    saveNow('bath-water');
    return true;
  }
  function bathFloorAt(x, y) {
    if (x < 27 * TILE || x > 46 * TILE || y < BATH_TOP_ROW * TILE || y > (BATH_BOT_ROW + 2) * TILE) return 0;
    for (var f = 0; f < BATH_FLOORS.length; f++) {
      var F = BATH_FLOORS[f];
      if (x < F.c0 * TILE || x > (F.c1 + 1) * TILE || y < F.fr * TILE - 5 || y > (F.fr + 5) * TILE) continue;
      var inTub = false;
      for (var t = 0; t < F.tubs.length; t++) {
        var tb = F.tubs[t];
        if (x >= tb[0] * TILE - 2 && x <= (tb[1] + 1) * TILE + 2) { inTub = true; break; }
      }
      if (!inTub) return F.fr * TILE;
    }
    return 0;
  }
  function bathFloorLoss(x, y) {
    bathLostWater++;
    if (bathMode && bathWetFloor.length < 28 && bathLostWater % 8 === 0) bathWetFloor.push({ x: x, y: bathFloorAt(x, y), t: 0 });
  }
  function bathDrainFloor() {
    // Remove spilled particles through the shared CPU/GPU mutation journal.
    // Scan parked water too, so leaving or saving cannot recover a floor spill.
    liquidToolSync();
    for (var i = liquidCount - 1; i >= 0; i--) {
      if (bathFloorAt(liquidX[i], liquidY[i])) {
        bathFloorLoss(liquidX[i], liquidY[i]); removeLiquidParticle(i);
      }
    }
    Object.keys(mineralLiquidParked).forEach(function (key) {
      var data = mineralLiquidParked[key];
      for (var i = data.length - 3; i >= 0; i -= 3) {
        if (!bathFloorAt(data[i + 1], data[i + 2])) continue;
        bathFloorLoss(data[i + 1], data[i + 2]);
        var last = data.length - 3;
        data[i] = data[last]; data[i + 1] = data[last + 1]; data[i + 2] = data[last + 2]; data.length -= 3;
      }
      if (!data.length) delete mineralLiquidParked[key];
    });
  }
  function bathSplashWater(g, count) {
    var F = BATH_FLOORS[0], tb = F.tubs[0];
    var used = liquidExtractRect(tb[0] * TILE, (F.fr - F.lip - 1) * TILE,
      (tb[1] + 1) * TILE, (F.fr + F.sink + 1) * TILE, 0, count);
    var dir = g.slot ? 1 : -1;
    var x = (dir > 0 ? tb[1] + 1 : tb[0]) * TILE + dir * 44;
    for (var n = 0; n < used; n++) {
      var px = x + dir * (n % 8) * 1.5, py = F.fr * TILE - 60 - Math.floor(n / 8) * 1.5;
      if (bathMode && addLiquidParticle(0, px, py, dir * (25 + n % 13), -60 - n % 20, 0) >= 0) continue;
      // Offscreen simulation has no live liquid solver. The same water is
      // parked on the floor, where the drain consumes it on the next tick.
      mineralLiquidPark(0, px, F.fr * TILE - 2);
    }
    bathWater = Math.max(0, bathWater - used);
  }
  function bathOperationsTick(dt) {
    hearthRoomTick(dt);
    var boiler = hearthBeds.boiler;
    bathFire = boiler.power > 0.01 ? boiler.fuelSeconds : 0;
    var target = bathWater > 0 ? boiler.power : 0;
    var heatRate = target ? 0.09 * Math.min(2, 8000 / Math.max(2000, bathWater)) : 0.012;
    bathHeat += (target - bathHeat) * (1 - Math.exp(-dt * heatRate));
    bathDrainT -= dt;
    if (bathDrainT <= 0) {
      bathDrainT = 0.15;
      if (bathRoomReady || bathWater > 0) bathDrainFloor();
      bathWater = bathBasinCount();
      bathArmHeat();
    }
    if (bathMode && bathRoomReady && bathPour > 0) {
      var F = BATH_FLOORS[0], tb = F.tubs[0];
      var before = bathWater;
      var count = liquidToolEmit(0, Math.min(bathPour, Math.ceil(2400 * dt)),
        (tb[0] + 4) * TILE, (F.fr - 4) * TILE, 0, 100);
      bathPour -= count;
      if (count > 0) { bathHeat *= before / (before + count); bathWater += count; }
    }
    for (var i = bathWetFloor.length - 1; i >= 0; i--) {
      bathWetFloor[i].t += dt;
      if (bathWetFloor[i].t >= 1.3) bathWetFloor.splice(i, 1);
    }
  }

  function bathBeginHop(g, x, y, duration, height, next) {
    g.hop = { x: g.s.x, y: g.s.y, tx: x, ty: y, duration: duration, height: height, t: 0, next: next };
    g.st = 'hop'; g.s.settled = false; g.s._ground = false;
    g.s.squashV = -1.8;
  }
  function bathGuestAccept(s) {
    if (!ENABLE_BATH || bathGuests.length >= bathGuestCap || s.visit === 'depart') return false;
    if (bathGuests.some(function (g) { return g.s.id === s.id; })) return false;
    var slot = bathGuests.some(function (g) { return g.slot === 0; }) ? 1 : 0;
    var F = BATH_FLOORS[0];
    s.x = 28.5 * TILE; s.y = F.fr * TILE - s.r;
    s.vx = 0; s.vy = 0; s.entry = 0; s.wet = 0; s._trail = [];
    s.visit = 'inside';
    var g = { s: s, slot: slot, st: 'arrive', t: 0, paid: false, served: false, soak: 0 };
    bathGuests.push(g);
    bathBeginHop(g, (slot ? 30.25 : 28.25) * TILE, F.fr * TILE - s.r, 0.7, 22, 'wait');
    if (!bathIntroSeen) {
      bathIntroSeen = true;
      showMsg('A sky slime is waiting. Bring water and coal to the banya. Its forge makes a steel striker from two iron; stone sometimes drops flint.', false,
        { key: 'bath-arrival', tag: 'BATHHOUSE' });
    }
    return true;
  }
  // The developer helper creates a real surface visitor, never a paying phantom.
  function bathSpawnGuest() {
    if (!bathPickSite()) return null;
    return skySlimeSpawn((banyaDoorX0 + banyaDoorX1) / 2 - TILE * 3, SKY_ROWS * TILE - 360);
  }
  function bathServe(id) {
    if (!ENABLE_BATH || !bathMode || bathFading || gamePaused) return false;
    var g = bathGuests.find(function (guest) { return guest.s.id === id && guest.st === 'wait'; });
    if (!g) return false;
    if (!bathCanServe()) {
      bathSetNotice(bathWater < BATH_MIN_WATER ? 'Fill the tub from your water tank.' : 'Load coal in the boiler, strike flint and steel, and let the water warm.');
      return false;
    }
    // Admission uses the shared warm bath. No guest recipe is charged.
    g.served = true;
    bathBeginHop(g, (BATH_FLOORS[0].tubs[0][0] - 0.1) * TILE,
      (BATH_FLOORS[0].fr - 1) * TILE - g.s.r, 0.85, 52, 'plunge');
    bathNoticeT = 0;
    sfxPlay('ui-confirm');
    saveNow('bath-order');
    return true;
  }
  function bathFinishGuest(g) {
    if (g.paid) return;
    g.paid = true;
    bathSplashWater(g, 65);
    bathServed++;
    money += BATH_VISIT.pay;
    bathFloats.push({ x: g.s.x, y: g.s.y - 38, t: 0, s: '+$' + BATH_VISIT.pay });
    if (bathMode) sfxPlay('sell-total');
    bathBeginHop(g, 30.1 * TILE, BATH_FLOORS[0].fr * TILE - g.s.r, 1.1, 112, 'leave');
    saveNow('bath-payment');
  }
  function bathReleaseGuest(g) {
    if (!bathPickSite()) return false;
    var s = g.s;
    s.x = (banyaDoorX0 + banyaDoorX1) / 2;
    s.y = SKY_ROWS * TILE - s.r - 2;
    s.vx = 60; s.vy = -130; s.wet = 0; s._wetTarget = 0;
    s.visit = 'depart'; s.visitT = 0; s.hopIn = 0.7;
    s.departX = s.x; s.departDir = s.x < COLS * TILE * 0.7 ? 1 : -1;
    s._ground = false; s.settled = false; s._trail = [];
    skySlimes.push(s); // same identity leaves the building, then wanders away
    return true;
  }
  function bathGuestTick(dt) {
    if (!ENABLE_BATH || !(dt > 0) || gameOver || gameWon) return;
    dt = Math.min(dt, 0.1);
    bathOperationsTick(dt);
    bathNoticeT = Math.max(0, bathNoticeT - dt);
    bathGuestColliders.length = 0;
    for (var f = bathFloats.length - 1; f >= 0; f--) {
      bathFloats[f].t += dt;
      if (bathFloats[f].t > 2) bathFloats.splice(f, 1);
    }
    for (var i = bathGuests.length - 1; i >= 0; i--) {
      var g = bathGuests[i], s = g.s, oldX = s.x, oldY = s.y;
      g.t += dt; s.age += dt;
      if (g.st === 'hop') {
        var h = g.hop;
        h.t = Math.min(h.duration, h.t + dt);
        var k = h.t / h.duration;
        s.x = h.x + (h.tx - h.x) * k;
        s.y = h.y + (h.ty - h.y) * k - Math.sin(k * Math.PI) * h.height;
        if (k >= 1) {
          g.st = h.next; g.t = 0; g.hop = null; s.squashV = 2;
          s._ground = g.st === 'wait' || g.st === 'leave';
          if (g.st === 'soak') {
            s.wet = 0.6;
            bathSplashWater(g, 45);
            if (bathMode) bathSplashPoof(s.x, bathWaterline(), 0.6);
          }
        }
      } else if (g.st === 'plunge') {
        var curve = bathTubCurve(BATH_FLOORS[0], BATH_FLOORS[0].tubs[0]);
        bathBeginHop(g, (g.slot ? 38 : 35.5) * TILE, bathWaterline() + 6, 0.95, 74, 'soak');
      } else if (g.st === 'soak') {
        if (bathCanServe()) g.soak = Math.min(BATH_VISIT.seconds, g.soak + dt);
        g.splash = (g.splash || 0) + dt;
        if (g.splash >= 1.4) { g.splash = 0; bathSplashWater(g, 12); }
        var waterline = bathWaterline();
        s.x = (g.slot ? 38 : 35.5) * TILE + Math.sin(g.t * 0.65 + s.seed * 6) * 13;
        s.y = waterline + 6 + Math.sin(g.t * 1.7 + s.seed * 8) * 3.5;
        s.wet = 0.6;
        if (g.soak >= BATH_VISIT.seconds) bathFinishGuest(g);
      } else if (g.st === 'leave') {
        s.wet = 0;
        bathBeginHop(g, 28.5 * TILE, BATH_FLOORS[0].fr * TILE - s.r, 0.85, 32, 'exit');
      } else if (g.st === 'exit') {
        if (bathReleaseGuest(g)) bathGuests.splice(i, 1);
        continue;
      }
      s.vx = (s.x - oldX) / dt; s.vy = (s.y - oldY) / dt;
      s.settled = g.st === 'wait' || g.st === 'soak';
      skySlimeExpression(s, Math.min(dt, 1 / 60));
      if (g.st === 'soak') s.eye = 0.2 + Math.sin(g.t * 0.8) * 0.035;
      if (bathMode) bathGuestColliders.push({ x: s.x, y: s.y, hw: s.r, hh: s.r,
        vx: s.vx, vy: s.vy, pts: null });
    }
  }

  function bathOrderRect(g) {
    var scale = Math.max(1, 0.85 / Math.max(0.1, worldScale));
    var x = g.slot ? 976 : 804;
    if (scale > 1) x = cam.x + (g.slot ? canvas.width / dpr / 2 + 8 : 14) / worldScale;
    return { x: x, y: BATH_FLOORS[0].fr * TILE - 164 * scale, w: 160 * scale, h: 96 * scale, scale: scale };
  }
  function bathOrderPointer(x, y) {
    for (var i = 0; i < bathGuests.length; i++) {
      var g = bathGuests[i];
      if (g.st !== 'wait') continue;
      var r = bathOrderRect(g);
      if ((x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ||
          Math.hypot(x - g.s.x, y - g.s.y) < g.s.r + 10) { bathServe(g.s.id); return true; }
    }
    return false;
  }
  function bathDrawOrder(g) {
    var r = bathOrderRect(g), ready = bathCanServe();
    ctx.save();
    ctx.fillStyle = BLD.cream; ctx.strokeStyle = BLD.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 - 6, r.y + r.h - 1);
    ctx.lineTo(g.s.x, g.s.y - g.s.r - 5); ctx.lineTo(r.x + r.w / 2 + 6, r.y + r.h - 1);
    ctx.fill(); ctx.stroke();
    ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.translate(r.x, r.y); ctx.scale(r.scale, r.scale);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = BLD.outline; ctx.font = 'bold 13px ' + UI_FONT;
    ctx.fillText('WARM BATH', 10, 15);
    ctx.font = '12px ' + UI_FONT;
    ctx.fillText(bathWater >= BATH_MIN_WATER ? 'Water ready' : 'Needs water', 10, 36);
    ctx.fillText(bathHeat >= 0.35 ? 'Warm enough' : 'Waiting for heat', 10, 54);
    ctx.fillStyle = ready ? BLD.goldDark : BLD.woodDark;
    ctx.fillRect(6, 68, 148, 22);
    ctx.fillStyle = BLD.cream; ctx.font = 'bold 11px ' + UI_FONT;
    ctx.textAlign = 'center'; ctx.fillText(ready ? 'SERVE  /  $75' : 'WAITING', 80, 79);
    ctx.restore();
  }
  function bathDrawGuests() {
    ctx.save();
    for (var w = 0; w < bathWetFloor.length; w++) {
      var wet = bathWetFloor[w];
      ctx.globalAlpha = (1 - wet.t / 1.3) * 0.6; ctx.fillStyle = BLD.metalPale;
      ctx.fillRect(wet.x - 5 - wet.t * 5, wet.y - 2, 10 + wet.t * 10, 2);
    }
    ctx.restore();
    for (var i = 0; i < bathGuests.length; i++) {
      var g = bathGuests[i];
      skySlimeDrawBody(g.s);
      if (g.st === 'soak') {
        ctx.fillStyle = BLD.woodDeep; ctx.fillRect(g.s.x - 22, g.s.y - g.s.r - 16, 44, 5);
        ctx.fillStyle = BLD.goldPale; ctx.fillRect(g.s.x - 21, g.s.y - g.s.r - 15, 42 * g.soak / BATH_VISIT.seconds, 3);
      }
    }
    for (var b = 0; b < bathGuests.length; b++) if (bathGuests[b].st === 'wait') bathDrawOrder(bathGuests[b]);
    for (var f = 0; f < bathFloats.length; f++) {
      var p = bathFloats[f];
      ctx.save(); ctx.globalAlpha = 1 - p.t / 2;
      ctx.font = 'bold 22px ' + UI_FONT; ctx.textAlign = 'center'; ctx.fillStyle = BLD.goldPale;
      ctx.fillText(p.s, p.x, p.y - p.t * 22); ctx.restore();
    }
  }
  function bathDrawServiceHUD() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hearthDrawNav(ctx, 'bath');
    ctx.fillStyle = UIT_PANEL; ctx.fillRect(0, h - 105, w, 105);
    hearthText(ctx, 'BATH ' + Math.floor(bathWater / 100) + ' L  /  ' + Math.round(20 + bathHeat * 28) + ' C', 18, h - 85, 12);
    hearthText(ctx, '$' + bathFmtMoney(money), w - 18, h - 85, 12, BLD.goldPale, 'right');
    bathServiceButtons = [
      { x: 16, y: h - 67, w: Math.min(200, (w - 44) / 2), h: 44, action: 'water' },
      { x: w - 16 - Math.min(200, (w - 44) / 2), y: h - 67, w: Math.min(200, (w - 44) / 2), h: 44, action: 'boiler' }
    ];
    hearthButton(ctx, bathServiceButtons[0], bathPour > 0 ? 'POURING...' : 'ADD WATER [W]', 'water', bathWaterCount() > 0);
    hearthButton(ctx, bathServiceButtons[1], 'TEND THE FIRE', 'boiler', true);
    if (bathNoticeT) hearthWrap(ctx, bathNotice, 18, h - 132, w - 36, BLD.goldPale, 2);
    else hearthText(ctx, 'Warm water brings paying guests.', w / 2, h - 10, 11, UIT_DIM, 'center');
  }
  function bathServicePointer(x, y) {
    for (var i = 0; i < bathServiceButtons.length; i++) {
      var b = bathServiceButtons[i];
      if (hearthContains(b, x, y)) {
        if (b.action === 'boiler') hearthSetView('boiler'); else bathAddWater();
        return true;
      }
    }
    return false;
  }
  function bathServiceSave() {
    return { version: 3, workshop: hearthRoomSave(), fire: bathFire, heat: bathHeat, pour: bathPour, lost: bathLostWater, served: bathServed, introSeen: bathIntroSeen,
      floors: bathFloorsOwned.slice(), ready: bathRoomReady, supplies: bathSupplies.slice(),
      guests: bathGuests.map(function (g) {
        return { s: skySlimeRecord(g.s), slot: g.slot, st: g.st, t: g.t, paid: g.paid,
          served: g.served, soak: g.soak, hop: g.hop ? Object.assign({}, g.hop) : null };
      }) };
  }
  function bathServiceRestore(data) {
    bathGuests.length = 0; bathGuestColliders.length = 0; bathFloats.length = 0;
    bathRoomReady = false; banyaX = -1; bathFoundationReady = false; bathDrainT = 0;
    bathFloorsOwned = [true, false, false, false, false];
    bathSupplies = [0, 0, 0, 0, 0];
    bathFire = 0; bathHeat = 0; bathPour = 0; bathWater = 0; bathLostWater = 0;
    hearthRoomRestore(data && data.workshop, data && Number(data.fire) || 0);
    bathServed = 0; bathIntroSeen = false; bathNotice = ''; bathNoticeT = 0;
    if (!data) return;
    bathFire = data.workshop ? (hearthBeds.boiler.power > 0.01 ? hearthBeds.boiler.fuelSeconds : 0) :
      skySlimeClamp(Number(data.fire) || 0, 0, BATH_LEGACY_FIRE_SECONDS);
    bathHeat = skySlimeClamp(Number(data.heat) || 0, 0, 1);
    bathPour = skySlimeClamp(Number(data.pour) || 0, 0, BATH_MAX_WATER);
    bathLostWater = Math.max(0, Number(data.lost) || 0);
    bathServed = Math.max(0, Number(data.served) || 0);
    bathIntroSeen = !!data.introSeen;
    for (var f = 0; f < 5; f++) {
      bathFloorsOwned[f] = f === 0 || !!(data.floors && data.floors[f]);
      bathSupplies[f] = Math.max(0, Math.floor(Number(data.supplies && data.supplies[f]) || 0));
    }
    // The carved grid and real water are already in the world/liquid save.
    // Re-arm the heater on next entry without filling the bath a second time.
    bathRoomReady = !!data.ready;
    var list = Array.isArray(data.guests) ? data.guests : [];
    for (var i = 0; i < Math.min(bathGuestCap, list.length); i++) {
      var src = list[i], s = skySlimeHydrate(src.s);
      if (!s || bathGuests.some(function (g) { return g.s.id === s.id; })) continue;
      var st = ['hop', 'wait', 'plunge', 'soak', 'leave', 'exit'].indexOf(src.st) >= 0 ? src.st : 'wait';
      var hop = src.hop;
      if (st === 'hop' && (!hop || !isFinite(hop.x + hop.y + hop.tx + hop.ty + hop.duration + hop.height + hop.t) || hop.duration <= 0)) st = 'wait';
      var slot = src.slot === 1 ? 1 : 0;
      if (bathGuests.some(function (guest) { return guest.slot === slot; })) slot = 1 - slot;
      var g = { s: s, slot: slot, st: st, t: Number(src.t) || 0, paid: !!src.paid,
        served: !!src.served, soak: skySlimeClamp(Number(src.soak) || 0, 0, BATH_VISIT.seconds),
        hop: st === 'hop' ? Object.assign({}, hop) : null };
      if (!g.served && st !== 'wait' && !(st === 'hop' && hop.next === 'wait')) g.st = 'wait';
      if (g.paid && g.st === 'soak') g.st = 'leave';
      s.visit = 'inside'; bathGuests.push(g);
      // Save migrations and interrupted transitions cannot duplicate a visitor.
      for (var j = skySlimes.length - 1; j >= 0; j--) if (skySlimes[j].id === s.id) skySlimes.splice(j, 1);
    }
  }

  function bathRetireGarden(saved) {
    if (!saved || !Array.isArray(saved.lots)) return;
    var prices = [180, 650, 1800, 4800], rewards = [260, 900, 2600, 6000];
    var materials = [[], [['copper', 3]], [['iron', 3], ['amber', 1]], [['amethyst', 2], ['gold', 1]]];
    for (var i = 0; i < Math.min(4, saved.lots.length); i++) {
      var lot = saved.lots[i];
      if (!lot || !lot.owned) continue;
      money += prices[i] + (lot.ready ? rewards[i] : 0);
      materials[i].forEach(function (m) { money += (ORES[m[0]].value || 0) * m[1]; });
      var cL = DECK_LEFT_COL - 16 - i * 15, x0 = (cL - 1) * TILE, x1 = (cL + 12) * TILE;
      var y0 = SKY_ROWS * TILE, y1 = (SKY_ROWS + 3) * TILE;
      for (var t = 0; t < 5; t++) bathSupplies[t] += liquidExtractRect(x0, y0, x1, y1, t, 200000);
      for (var r = SKY_ROWS; r <= SKY_ROWS + 2; r++) for (var c = cL - 1; c <= cL + 11; c++) {
        if (!world[r] || c < 0 || c >= COLS) continue;
        if (!world[r][c] || world[r][c].type === 'foundation') world[r][c] = { type: 'dirt', hp: ORES.dirt.hp };
        delete terrainClearedKinds[r + ':' + c];
      }
      for (var s = 0; s < skySlimes.length; s++) {
        var guest = skySlimes[s];
        if (guest.x >= x0 - guest.r && guest.x <= x1 + guest.r && guest.y > y0 - guest.r && guest.y < y1) {
          guest.y = y0 - guest.r - 2; guest.vx = 0; guest.vy = 0;
        }
      }
      if (player.x + PLAYER_W > x0 && player.x < x1 && player.y + PLAYER_H > y0 && player.y < y1) {
        player.y = y0 - PLAYER_H - 2; player.renderY = player.y;
      }
    }
  }
