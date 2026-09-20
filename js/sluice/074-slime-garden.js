  /* ---- Slime garden: purchased surface baths and mineral pearls ---- */
  // This is the public surface loop, independent of the optional indoor banya.
  // Each lot owns real collision tiles. Its water is the same particle liquid
  // the player carries from lakes and deposits, never a painted fill meter.
  var SLIME_GARDEN_RECIPES = [
    { name: 'STONE BATH', pearl: 'River pearl', price: 180, materials: [],
      liquids: [0], liquidText: 'WATER', seconds: 40, value: 260, dose: 1800,
      source: 'Water: lake east of town.' },
    { name: 'COPPER BATH', pearl: 'Salt pearl', price: 650, materials: [['copper', 3]],
      liquids: [0, 2], liquidText: 'WATER + BRINE', seconds: 48, value: 900, dose: 1800,
      source: 'Brine: 42-168 m underground.' },
    { name: 'IRON BATH', pearl: 'Honey pearl', price: 1800, materials: [['iron', 3], ['amber', 1]],
      liquids: [0, 3], liquidText: 'WATER + NECTAR', seconds: 56, value: 2600, dose: 1800,
      source: 'Nectar: 216-244 m. Heated drill required.' },
    { name: 'CRYSTAL BATH', pearl: 'Aurora pearl', price: 4800, materials: [['amethyst', 2], ['gold', 1]],
      liquids: [2, 3, 4], liquidText: 'BRINE + NECTAR + LUMEN', seconds: 65, value: 6000, dose: 1800,
      source: 'Lumen: 292 m and deeper. Bring heat shielding.' }
  ];
  var SLIME_GARDEN_MIN_FILL = 6200;
  var SLIME_GARDEN_CAPACITY = 11 * 2 * 655;
  var slimeGardenLots = [];
  var slimeGardenClock = 0;
  var slimeGardenSampleT = 0;
  var slimeGardenHinted = false;

  function slimeGardenReset() {
    slimeGardenLots.length = 0;
    slimeGardenClock = 0;
    slimeGardenSampleT = 0;
    slimeGardenHinted = false;
    for (var i = 0; i < 4; i++) {
      var cL = DECK_LEFT_COL - 16 - i * 15;
      slimeGardenLots.push({ index: i, cL: cL, cR: cL + 10,
        x0: cL * TILE, x1: (cL + 11) * TILE,
        y0: SKY_ROWS * TILE, y1: (SKY_ROWS + 2) * TILE,
        owned: false, progress: 0, ready: false, harvests: 0,
        sample: [0, 0, 0, 0, 0], resident: null, valid: false, status: 'FOR SALE',
        constructionT: 0, pearlPulse: 0 });
    }
  }

  function slimeGardenReservedCol(c) {
    return c >= DECK_LEFT_COL - 63 && c <= DECK_LEFT_COL - 4;
  }

  function slimeGardenCarve(lot) {
    for (var r = SKY_ROWS; r <= SKY_ROWS + 2; r++) {
      if (!world[r]) continue;
      for (var c = lot.cL - 1; c <= lot.cR + 1; c++) {
        if (c < 0 || c >= COLS) continue;
        var shell = r === SKY_ROWS + 2 || c === lot.cL - 1 || c === lot.cR + 1;
        world[r][c] = shell ? { type: 'foundation', hp: 999999 } : null;
        if (!shell) terrainClearedKinds[r + ':' + c] = 'stone';
        if (typeof invalidateTerrainAround === 'function') invalidateTerrainAround(r, c);
      }
    }
    // The light field must see the new open cut on an in-run purchase.
    if (typeof lightingOnClear === 'function') {
      for (var lr = SKY_ROWS; lr < SKY_ROWS + 2; lr++) {
        for (var lc = lot.cL; lc <= lot.cR; lc++) lightingOnClear(lr, lc);
      }
    }
  }

  function slimeGardenPrepareWorld(restoring) {
    if (!slimeGardenLots.length) slimeGardenReset();
    // An older save may have generated a lake across newly designated land.
    // Retire its refill metadata before any bowl can be purchased; leave the
    // saved excavation itself intact until that particular lot is built.
    if (typeof surfacePonds !== 'undefined') {
      for (var pi = surfacePonds.length - 1; pi >= 0; pi--) {
        if (surfacePonds[pi].cR >= DECK_LEFT_COL - 63 && surfacePonds[pi].cL <= DECK_LEFT_COL - 4) {
          surfacePonds.splice(pi, 1);
        }
      }
    }
    for (var i = 0; i < slimeGardenLots.length; i++) {
      var lot = slimeGardenLots[i];
      if (lot.owned) { slimeGardenCarve(lot); continue; }
      if (restoring) continue;
      // Undeveloped lots remain walkable. Only construction opens the bowl.
      for (var r = SKY_ROWS; r <= SKY_ROWS + 2; r++) {
        if (!world[r]) continue;
        for (var c = lot.cL - 1; c <= lot.cR + 1; c++) {
          if (c >= 0 && c < COLS) world[r][c] = { type: 'dirt', hp: ORES.dirt.hp };
        }
      }
    }
  }

  function slimeGardenAt(x, y) {
    for (var i = 0; i < slimeGardenLots.length; i++) {
      var lot = slimeGardenLots[i];
      if (lot.owned && x >= lot.x0 && x <= lot.x1 && y >= lot.y0 - 12 && y < lot.y1 + 6) return lot;
    }
    return null;
  }

  function slimeGardenNearest() {
    if (!player || !isFinite(player.x) || !isFinite(player.y)) return null;
    var px = player.x + PLAYER_W * 0.5;
    var py = player.y + PLAYER_H * 0.5;
    var closest = null, best = Infinity;
    for (var i = 0; i < slimeGardenLots.length; i++) {
      var lot = slimeGardenLots[i];
      if (py < lot.y0 - 150 || py > lot.y1 + 40) continue;
      if (px < lot.x0 - 2 * TILE || px > lot.x1 + 2 * TILE) continue;
      var dist = Math.abs(px - (lot.x0 + lot.x1) * 0.5);
      if (dist < best) { best = dist; closest = lot; }
    }
    return closest;
  }

  function skySlimeLandingX() {
    if (!slimeGardenLots.length) slimeGardenReset();
    var near = slimeGardenNearest();
    var lot = near || slimeGardenLots[0];
    // A stone shoulder gives the first arrivals their full bounce sequence.
    // The player moves their chosen creature into the bath with the nozzle.
    return lot.x1 + TILE * 0.5;
  }

  function slimeGardenMaterialCount(type) {
    var n = 0;
    for (var i = 0; i < cargo.length; i++) if (cargo[i].type === type) n++;
    return n;
  }

  function slimeGardenMaterialsText(recipe, count) {
    if (!recipe.materials.length) return 'STONE PROVIDED';
    return recipe.materials.map(function (m) {
      return (count ? slimeGardenMaterialCount(m[0]) + '/' : '') + m[1] + ' ' + ORES[m[0]].label.toUpperCase();
    }).join(' + ');
  }

  function slimeGardenSourceHint(index) {
    var recipe = SLIME_GARDEN_RECIPES[index];
    var hint = index ? recipe.source : '';
    if (recipe.liquids.indexOf(0) === -1) return hint;
    var best = null, distance = Infinity;
    var px = player.x + PLAYER_W * 0.5;
    for (var i = 0; i < surfacePonds.length; i++) {
      var pond = surfacePonds[i], center = (pond.cL + pond.cR + 1) * TILE * 0.5;
      if (Math.abs(center - px) < distance) { best = center; distance = Math.abs(center - px); }
    }
    var water = best === null ? 'Water: shallow pockets at 12-26 m.' :
      ('Water: surface lake ' + Math.max(1, Math.round(distance / TILE)) + ' m ' + (best < px ? 'west' : 'east') + '.');
    return water + (hint ? ' ' + hint : '');
  }

  function slimeGardenBuy(index) {
    var lot = slimeGardenLots[index];
    if (!lot || lot.owned) return false;
    var recipe = SLIME_GARDEN_RECIPES[index];
    if (!devMode && money < recipe.price) {
      showMsg('Lot ' + (index + 1) + ' costs $' + recipe.price + '. Mine and sell a haul first.', true,
        { key: 'garden', tag: 'BATH LOTS' });
      return false;
    }
    if (!devMode) {
      for (var i = 0; i < recipe.materials.length; i++) {
        var need = recipe.materials[i];
        if (slimeGardenMaterialCount(need[0]) < need[1]) {
          showMsg('Bring ' + slimeGardenMaterialsText(recipe, false).toLowerCase() + ' in your cargo to build this bath.', true,
            { key: 'garden', tag: 'BATH LOTS' });
          return false;
        }
      }
      money -= recipe.price;
      for (var mi = 0; mi < recipe.materials.length; mi++) {
        var mat = recipe.materials[mi], remaining = mat[1];
        // Spend ordinary specimens first, preserving shiny cargo if possible.
        for (var shinyPass = 0; shinyPass < 2 && remaining; shinyPass++) {
          for (var ci = cargo.length - 1; ci >= 0 && remaining; ci--) {
            if (cargo[ci].type === mat[0] && (!!cargo[ci].shiny) === !!shinyPass) {
              cargo.splice(ci, 1); remaining--;
            }
          }
        }
      }
    }
    lot.owned = true;
    lot.constructionT = 1;
    lot.status = 'FILL THE BATH';
    slimeGardenCarve(lot);
    slimeGardenSampleT = 0;
    showMsg('Bath built. ' + (isMobile ? 'Tap SCOOP, then drive over liquid. POUR empties below the rig.' : 'F toggles the scoop. Drive over liquid; right mouse pours below.') +
      ' Bring ' + recipe.liquidText.toLowerCase() + ' and one settled sky slime.', false,
      { key: 'garden', tag: 'BATH LOTS' });
    if (typeof sfxPlay === 'function') sfxPlay('ui-confirm');
    if (typeof saveNow === 'function') saveNow('bath-built');
    return true;
  }

  function slimeGardenCollect(index) {
    var lot = slimeGardenLots[index];
    if (!lot || !lot.ready) return false;
    var recipe = SLIME_GARDEN_RECIPES[index];
    money += recipe.value;
    lot.ready = false;
    lot.progress = 0;
    lot.harvests++;
    lot.pearlPulse = 1;
    slimeGardenSampleT = 0;
    showMsg(recipe.pearl + ' sold for $' + recipe.value + '. Top up the bath to keep it growing.', false,
      { key: 'garden', tag: 'PEARL SALE' });
    if (typeof sfxPlay === 'function') sfxPlay('sell-total');
    if (typeof saveNow === 'function') saveNow('pearl-collected');
    return true;
  }

  function slimeGardenInteract() {
    var lot = slimeGardenNearest();
    if (!lot) return false;
    if (!lot.owned) slimeGardenBuy(lot.index);
    else if (lot.ready) slimeGardenCollect(lot.index);
    else {
      var recipe = SLIME_GARDEN_RECIPES[lot.index];
      showMsg(lot.status + '. ' + slimeGardenSourceHint(lot.index) +
        (isMobile ? ' Tap this sign when the pearl is ready.' : ' E collects the finished pearl.'), false,
        { key: 'garden', tag: 'BATH ' + (lot.index + 1) });
    }
    return true;
  }

  function slimeGardenSignRect(lot) {
    return { x: (lot.x0 + lot.x1) * 0.5 - 86, y: lot.y0 - 92, w: 172, h: 72 };
  }

  function slimeGardenPointer(sx, sy) {
    var wx = sx / worldScale + cam.x;
    var wy = sy / worldScale + cam.y;
    for (var i = 0; i < slimeGardenLots.length; i++) {
      var lot = slimeGardenLots[i], box = slimeGardenSignRect(lot);
      if (wx < box.x || wx > box.x + box.w || wy < box.y || wy > box.y + box.h) continue;
      if (slimeGardenNearest() !== lot) {
        showMsg('Move closer to this bath sign.', false, { key: 'garden', tag: 'BATH LOTS' });
        return true;
      }
      return slimeGardenInteract();
    }
    return false;
  }

  function slimeGardenRecipeStatus(lot) {
    var recipe = SLIME_GARDEN_RECIPES[lot.index];
    var total = 0;
    for (var i = 0; i < lot.sample.length; i++) total += lot.sample[i] || 0;
    if (total < SLIME_GARDEN_MIN_FILL) return 'FILL TO THE BRASS MARK';
    for (var ri = 0; ri < recipe.liquids.length; ri++) {
      var type = recipe.liquids[ri];
      var threshold = recipe.liquids.length === 1 ? 5200 : 1000;
      if ((lot.sample[type] || 0) < threshold) {
        return 'ADD ' + ['WATER', 'OIL', 'BRINE', 'NECTAR', 'LUMEN'][type];
      }
    }
    if (!lot.resident) return 'ADD ONE SKY SLIME';
    return '';
  }

  function slimeGardenComplete(lot) {
    var recipe = SLIME_GARDEN_RECIPES[lot.index];
    if (typeof liquidExtractRect !== 'function') return false;
    // Re-sample at the transaction boundary: the nozzle may have drained the
    // bath since its half-second status refresh.
    if (typeof liquidToolSync === 'function') liquidToolSync();
    lot.sample = liquidSampleRect(lot.x0, lot.y0, lot.x1, lot.y1);
    if (slimeGardenRecipeStatus(lot)) return false;
    // A pearl incorporates a real dose of its recipe. One waiting pearl per
    // bath and finite liquid prevent an unattended, unbounded money engine.
    var each = Math.floor(recipe.dose / recipe.liquids.length);
    for (var check = 0; check < recipe.liquids.length; check++) {
      if ((lot.sample[recipe.liquids[check]] || 0) < each) return false;
    }
    for (var i = 0; i < recipe.liquids.length; i++) {
      var type = recipe.liquids[i];
      var used = liquidExtractRect(lot.x0, lot.y0, lot.x1, lot.y1, type, each);
      lot.sample[type] = Math.max(0, lot.sample[type] - used);
      // Sampling and extraction read the same mirror. A transient backend
      // handoff can remove less; it must never create a pearl for no material.
      if (used < each) { lot.progress = Math.max(0, recipe.seconds - 1); return false; }
    }
    lot.ready = true;
    lot.progress = recipe.seconds;
    lot.pearlPulse = 1;
    if (slimeGardenNearest() === lot) showMsg(recipe.pearl + ' ready. Use the bath sign to collect $' + recipe.value + '.', false,
      { key: 'garden', tag: 'PEARL READY' });
    return true;
  }

  function slimeGardenTick(dt) {
    if (!slimeGardenLots.length) return;
    slimeGardenClock += dt;
    slimeGardenSampleT -= dt;
    var sampleNow = slimeGardenSampleT <= 0;
    if (sampleNow) slimeGardenSampleT = 0.5;
    var slimes = typeof skySlimes !== 'undefined' ? skySlimes : [];
    for (var si = 0; si < slimes.length; si++) {
      slimes[si].gardenLot = -1;
      slimes[si].pearlProgress = 0;
    }
    for (var i = 0; i < slimeGardenLots.length; i++) {
      var lot = slimeGardenLots[i], recipe = SLIME_GARDEN_RECIPES[i];
      lot.constructionT = Math.max(0, lot.constructionT - dt);
      lot.pearlPulse = Math.max(0, lot.pearlPulse - dt * 0.6);
      if (!lot.owned) continue;
      if (sampleNow && typeof liquidSampleRect === 'function') {
        lot.sample = liquidSampleRect(lot.x0, lot.y0, lot.x1, lot.y1);
      }
      lot.resident = null;
      for (var s = 0; s < slimes.length; s++) {
        var slime = slimes[s];
        if (slime.captured || slime.x - slime.r < lot.x0 || slime.x + slime.r > lot.x1) continue;
        if (slime.y + slime.r < lot.y0 + TILE * 0.55 || slime.y - slime.r > lot.y1) continue;
        if (Math.abs(slime.vy || 0) > 95 || Math.abs(slime.vx || 0) > 70) continue;
        lot.resident = slime;
        slime.gardenLot = i;
        slime.pearlProgress = Math.min(1, lot.progress / recipe.seconds);
        break;
      }
      if (lot.ready) { lot.status = 'PEARL READY'; lot.valid = false; continue; }
      var missing = slimeGardenRecipeStatus(lot);
      lot.valid = !missing;
      lot.status = missing || ('GROWING ' + Math.floor(lot.progress / recipe.seconds * 100) + '%');
      if (!lot.valid) continue;
      lot.progress = Math.min(recipe.seconds, lot.progress + dt);
      if (lot.progress >= recipe.seconds) slimeGardenComplete(lot);
    }
    if (!slimeGardenHinted && slimeGardenNearest()) {
      slimeGardenHinted = true;
      showMsg('Baths turn sky slimes and mineral liquids into pearls. ' +
        (isMobile ? 'Tap a sign to build. Tap SCOOP to collect liquid and a settled slime as you move.' : 'E or tap a sign to build. F toggles the liquid and slime scoop.'), false,
        { key: 'garden', tag: 'BATH LOTS' });
    }
  }

  function slimeGardenDrawMasonry(x, y, w, h, index) {
    drawStoneFoundation(x, y, w, h);
    if (index === 0) {
      // Hand-laid large slate blocks, a soft worn cap, crisp mortar below.
      ctx.fillStyle = BLD.stoneLight; ctx.fillRect(x + 1, y + 1, w - 2, 3);
      ctx.fillStyle = BLD.stonePale;
      for (var p = 11; p < w - 7; p += 43) ctx.fillRect(x + p, y + 1, 9, 1);
    } else {
      var base = index === 1 ? BLD.woodMid : (index === 2 ? BLD.metalBase : BLD.metalLight);
      var light = index === 1 ? BLD.woodPale : (index === 2 ? BLD.metalPale : BLD.waterFoam);
      var dark = index === 1 ? BLD.woodDark : BLD.metalDark;
      ctx.fillStyle = base; ctx.fillRect(x + 2, y + 2, w - 4, h - 5);
      ctx.fillStyle = light; ctx.fillRect(x + 2, y + 2, w - 4, 2);
      ctx.fillStyle = dark; ctx.fillRect(x + 2, y + h - 5, w - 4, 2);
      for (var s = 18; s < w - 8; s += 34) {
        ctx.fillStyle = dark; ctx.fillRect(x + s, y + 5, 1, h - 12);
        ctx.fillStyle = light; ctx.fillRect(x + s + 3, y + 6, 2, 2);
        ctx.fillRect(x + s + 3, y + h - 10, 2, 2);
      }
      if (index === 3) {
        for (var g = 24; g < w - 12; g += 48) {
          ctx.fillStyle = BLD.waterBase;
          ctx.beginPath(); ctx.moveTo(x + g, y + 7); ctx.lineTo(x + g + 8, y + 14);
          ctx.lineTo(x + g, y + 23); ctx.lineTo(x + g - 7, y + 14); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = BLD.outline; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = BLD.waterFoam; ctx.fillRect(x + g - 2, y + 11, 3, 2);
        }
      }
    }
    strokeRect1(x, y, w, h, BLD.outline);
  }

  function slimeGardenDrawPearl(x, y, index, scale) {
    var tint = [BLD.cream, BLD.goldPale, BLD.woodPale, BLD.waterFoam][index];
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = BLD.outline; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(0, -0.3, 6.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BLD.goldDark; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.ellipse(2.1, 3, 4.4, 2.2, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = BLD.waterFoam;
    ctx.fillRect(-3, -4, 3, 2); ctx.fillRect(-4, -2, 1, 1);
    ctx.restore();
  }

  function slimeGardenDrawLadder(x, y, h) {
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x, y, 3, h); ctx.fillRect(x + 10, y, 3, h);
    ctx.fillStyle = BLD.metalLight;
    ctx.fillRect(x + 1, y + 1, 1, h - 2); ctx.fillRect(x + 11, y + 1, 1, h - 2);
    for (var r = 5; r < h - 3; r += 10) {
      ctx.fillStyle = BLD.outline; ctx.fillRect(x + 2, y + r, 9, 3);
      ctx.fillStyle = BLD.metalPale; ctx.fillRect(x + 2, y + r, 9, 1);
    }
  }

  function slimeGardenDrawSign(lot, near) {
    var box = slimeGardenSignRect(lot), recipe = SLIME_GARDEN_RECIPES[lot.index];
    var x = box.x, y = box.y, w = box.w, h = box.h;
    // Reused prospecting board: slate footings, old planks, a bolted metal
    // recipe plate and a small static star preserve the town's materials.
    for (var side = 0; side < 2; side++) {
      var postX = x + (side ? w - 16 : 11);
      drawStoneFoundation(postX - 3, lot.y0 - 5, 11, 5);
      ctx.fillStyle = BLD.woodDark; ctx.fillRect(postX, y + h - 3, 5, lot.y0 - y - h + 3);
      strokeRect1(postX, y + h - 3, 5, lot.y0 - y - h + 3, BLD.outline);
    }
    drawWoodPlanking(x, y, w, h, 8);
    strokeRect1(x, y, w, h, BLD.outline);
    drawRivetedPlate(x + 4, y + 18, w - 8, h - 22);
    drawSignBoard(x + 4, y + 3, w - 8, 14, '');
    drawRedStar(x + w - 13, y + 10, 3, 0.1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 9.5px ' + UI_FONT;
    ctx.fillStyle = BLD.woodDeep; ctx.fillText('0' + (lot.index + 1) + '  ' + recipe.name, x + 10, y + 5);
    ctx.font = '9px ' + UI_FONT;
    ctx.fillStyle = BLD.metalPale;
    if (!lot.owned) {
      ctx.fillText(slimeGardenMaterialsText(recipe, !!near), x + 10, y + 23);
      ctx.fillStyle = BLD.cream; ctx.fillText(recipe.liquidText, x + 10, y + 37);
      ctx.fillStyle = BLD.goldPale;
      ctx.font = 'bold 10px ' + UI_FONT;
      ctx.fillText((near ? (isMobile ? 'TAP: BUILD ' : 'E: BUILD ') : 'LOT + BATH ') + '$' + recipe.price, x + 10, y + 55);
    } else {
      ctx.fillText(recipe.liquidText, x + 10, y + 23);
      ctx.fillStyle = lot.ready ? BLD.goldPale : BLD.cream;
      ctx.fillText(lot.ready ? recipe.pearl.toUpperCase() : lot.status, x + 10, y + 37);
      var progress = Math.min(1, lot.progress / recipe.seconds);
      ctx.fillStyle = BLD.outline; ctx.fillRect(x + 10, y + 50, w - 38, 3);
      ctx.fillStyle = lot.ready ? BLD.goldPale : BLD.goldBase;
      ctx.fillRect(x + 10, y + 50, Math.floor((w - 38) * progress), 3);
      ctx.fillStyle = lot.ready ? BLD.goldPale : BLD.metalPale;
      ctx.font = '9px ' + UI_FONT;
      var footer = lot.ready ? ((isMobile ? 'TAP: ' : 'E: ') + 'COLLECT $' + recipe.value) :
        (Math.ceil(Math.max(0, recipe.seconds - lot.progress)) + 's / $' + recipe.value + ' PER PEARL');
      ctx.fillText(footer, x + 10, y + 58);
      if (lot.ready) slimeGardenDrawPearl(x + w - 17, y + 57, lot.index, 0.8);
    }
    if (near) strokeRect1(x - 2, y - 2, w + 4, h + 4, BLD.goldBase);
  }

  function slimeGardenDraw() {
    var near = slimeGardenNearest();
    ctx.save();
    for (var i = 0; i < slimeGardenLots.length; i++) {
      var lot = slimeGardenLots[i];
      if (lot.x1 + TILE < cam.x || lot.x0 - TILE > cam.x + screenW || lot.y1 + TILE < cam.y || lot.y0 - 135 > cam.y + screenH) continue;
      var left = lot.x0 - TILE, outerW = 13 * TILE;
      if (lot.owned) {
        slimeGardenDrawMasonry(left, lot.y1, outerW, TILE, i);
        slimeGardenDrawMasonry(left, lot.y0, TILE, 2 * TILE, i);
        slimeGardenDrawMasonry(lot.x1, lot.y0, TILE, 2 * TILE, i);
        // The minimum fill mark is a physical brass inlay inside the wall.
        var markY = lot.y1 - 2 * TILE * SLIME_GARDEN_MIN_FILL / SLIME_GARDEN_CAPACITY;
        ctx.fillStyle = BLD.goldPale;
        ctx.fillRect(lot.x0 - 7, Math.round(markY), 7, 3);
        ctx.fillRect(lot.x1, Math.round(markY), 7, 3);
        // Small ruled depth marks make poured volume readable at a glance.
        ctx.fillStyle = BLD.stonePale;
        for (var t = 1; t < 5; t++) {
          ctx.fillRect(lot.x0 - 4, lot.y1 - t * 12, 4, 1);
          ctx.fillRect(lot.x1, lot.y1 - t * 12, 4, 1);
        }
        slimeGardenDrawLadder(lot.x1 - 14, lot.y0 - 4, 2 * TILE + 3);
        if (lot.ready) {
          var px = lot.x0 + 36, py = lot.y0 - 9;
          drawCrate(px - 13, py, 26, 11);
          slimeGardenDrawPearl(px, py - 5, i, 1.15);
        }
      } else {
        // Survey stakes and a low dashed line designate land before payment.
        ctx.fillStyle = BLD.woodDark;
        ctx.fillRect(left + 9, lot.y0 - 18, 4, 20);
        ctx.fillRect(left + outerW - 13, lot.y0 - 18, 4, 20);
        ctx.fillStyle = BLD.cream;
        ctx.fillRect(left + 9, lot.y0 - 17, 4, 3);
        ctx.fillRect(left + outerW - 13, lot.y0 - 17, 4, 3);
        ctx.fillStyle = BLD.goldDark;
        for (var dash = left + 21; dash < left + outerW - 20; dash += 18) ctx.fillRect(dash, lot.y0 - 2, 8, 1);
      }
      slimeGardenDrawSign(lot, near === lot);
    }
    ctx.restore();
  }

  function slimeGardenHUD() {
    // The nearby physical sign carries status and the action. No second panel.
  }

  function slimeGardenSave() {
    return { version: 1, hinted: slimeGardenHinted, lots: slimeGardenLots.map(function (lot) {
      return { owned: lot.owned, progress: lot.progress, ready: lot.ready, harvests: lot.harvests };
    }) };
  }

  function slimeGardenRestore(saved) {
    slimeGardenReset();
    if (!saved || !Array.isArray(saved.lots)) { slimeGardenPrepareWorld(true); return; }
    slimeGardenHinted = !!saved.hinted;
    for (var i = 0; i < Math.min(4, saved.lots.length); i++) {
      var input = saved.lots[i], lot = slimeGardenLots[i];
      if (!input || !input.owned) continue;
      lot.owned = true;
      lot.progress = Math.max(0, Math.min(SLIME_GARDEN_RECIPES[i].seconds, Number(input.progress) || 0));
      lot.ready = !!input.ready;
      lot.harvests = Math.max(0, Math.floor(Number(input.harvests) || 0));
      lot.status = lot.ready ? 'PEARL READY' : 'CHECKING BATH';
    }
    // Old envelopes have no garden field and remain untouched. Owned bowls
    // restore their collision shell; water restore belongs to the liquid save.
    slimeGardenPrepareWorld(true);
  }
