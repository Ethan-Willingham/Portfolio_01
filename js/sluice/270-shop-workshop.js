  // ====================================================================
  //  WORKSHOP — rig upgrades with "just out of reach" feedback.
  // ====================================================================
  // Number helpers — concrete current → next values for the tooltips.
  function nsUpgFuelAt(lv) {
    var caps = [0, 30, 55, 85, 120, 165, 220];
    if (lv >= caps.length) return caps[caps.length - 1];
    if (lv < 1) return caps[1];
    return caps[lv];
  }
  function nsUpgInfo(it) {
    // Returns { lvl, maxed, nextCost, cur, next, unit, statLabel, pipsCur, pipsMax }
    var lvl = upgrades[it.levelKey] || 0;
    var o = { lvl: lvl };
    if (it.isSpecial) {
      var maxLvl = it.costs.length;
      o.maxed = lvl >= maxLvl;
      o.nextCost = o.maxed ? 0 : it.costs[lvl];
      o.pipsCur = lvl; o.pipsMax = maxLvl;
      o.statLabel = '';
      if (it.key === 'heat') { o.cur = lvl >= 1 ? 'INSTALLED' : 'NOT FITTED'; o.next = 'INSTALLED'; }
      else if (it.key === 'vert') { o.cur = lvl >= 1 ? 'INSTALLED' : 'NOT FITTED'; o.next = 'INSTALLED'; }
      else if (it.key === 'shield') { o.cur = lvl === 0 ? 'NONE' : (lvl === 1 ? 'MK 1' : 'MK 2'); o.next = lvl === 0 ? 'MK 1' : 'MK 2'; }
      else if (it.key === 'pump') {
        var tanks = [0, 24, 58, 120];
        o.cur = lvl === 0 ? 'NONE' : tanks[lvl] + ' GAL';
        o.next = lvl < 3 ? tanks[lvl + 1] + ' GAL' : tanks[3] + ' GAL';
        o.statLabel = 'TANK';
      }
    } else {
      o.maxed = lvl >= it.costs.length;
      o.nextCost = o.maxed ? 0 : it.costs[lvl];
      o.pipsCur = lvl; o.pipsMax = it.costs.length;
      if (it.key === 'drill') {
        o.statLabel = 'POWER';
        o.cur = 'LV ' + lvl; o.next = 'LV ' + (lvl + 1);
      } else if (it.key === 'fuel') {
        o.statLabel = 'CAPACITY';
        o.cur = nsUpgFuelAt(lvl); o.next = nsUpgFuelAt(lvl + 1);
      } else if (it.key === 'hull') {
        o.statLabel = 'HULL';
        o.cur = BASE_HULL + (lvl - 1) * 60; o.next = BASE_HULL + lvl * 60;
      } else if (it.key === 'cargo') {
        o.statLabel = 'SLOTS';
        o.cur = 5 + (lvl - 1) * 4; o.next = 5 + lvl * 4;
      } else if (it.key === 'booster') {
        o.statLabel = 'UG CLIMB';
        var bm = [0, 70, 85, 100, 125, 155];
        var bcur = (lvl >= bm.length) ? bm[bm.length - 1] : (lvl < 1 ? bm[1] : bm[lvl]);
        var bnxt = ((lvl + 1) >= bm.length) ? bm[bm.length - 1] : bm[lvl + 1];
        o.cur = bcur + '%'; o.next = bnxt + '%';
      }
    }
    return o;
  }
  // Affordability tier: 'afford' | 'close' | 'far' | 'maxed' — drives glow.
  function nsAffordTier(cost, maxed) {
    if (maxed) return 'maxed';
    if (devMode || money >= cost) return 'afford';
    if (money >= cost * 0.6) return 'close';
    return 'far';
  }

  var NS_WORKSHOP_ITEMS = [
    { key: 'drill',  name: 'DRILL',          levelKey: 'drillLevel',  costs: shop.drill,  isSpecial: false, section: 0 },
    { key: 'fuel',   name: 'FUEL TANK',      levelKey: 'fuelLevel',   costs: shop.fuel,   isSpecial: false, section: 0 },
    { key: 'hull',   name: 'HULL PLATING',   levelKey: 'hullLevel',   costs: shop.hull,   isSpecial: false, section: 0 },
    { key: 'cargo',  name: 'CARGO BAY',      levelKey: 'cargoLevel',  costs: shop.cargo,  isSpecial: false, section: 0 },
    { key: 'booster',name: 'BOOSTER',        levelKey: 'boosterLevel',costs: shop.booster,isSpecial: false, section: 0 },
    { key: 'heat',   name: 'HEATED DRILL',   levelKey: 'heatLevel',   costs: shop.heat,   isSpecial: true,  section: 1 },
    { key: 'shield', name: 'HEAT SHIELD',    levelKey: 'shieldLevel', costs: shop.shield, isSpecial: true,  section: 1 },
    { key: 'vert',   name: 'VERTICAL DRILL', levelKey: 'vertLevel',   costs: shop.vert,   isSpecial: true,  section: 1 },
    { key: 'pump',   name: 'OIL PUMP',       levelKey: 'pumpLevel',   costs: shop.pump,   isSpecial: true,  section: 1 }
  ];
  // Oil is disabled in the free-forever sandbox, so the OIL PUMP buys nothing.
  // Hide it from the workshop (one flag away from coming back).
  if (!ENABLE_OIL) NS_WORKSHOP_ITEMS = NS_WORKSHOP_ITEMS.filter(function (it) { return it.key !== 'pump'; });

  function newShopDrawWorkshop(M) {
    var us = M.us;
    // Backdrop — workshop is warm orange-lit
    ctx.fillStyle = '#16100a';
    ctx.fillRect(0, 0, viewW, M.bottom);
    var bg = ctx.createRadialGradient(viewW / 2, M.bottom * 0.42, 30, viewW / 2, M.bottom * 0.5, viewW * 0.7);
    bg.addColorStop(0, 'rgba(70,46,22,0.55)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, M.bottom);

    var ent = nsEaseOut(nsWorkshopEnterT);
    ctx.save();
    ctx.globalAlpha = ent;
    ctx.translate(0, (1 - ent) * 22 * us);
    nsBanner(M, 'WORKSHOP', '#8a4a1c');

    // grid area — starts below the banner + money chip header band.
    var top = M.headerBottom + Math.round(6 * us);
    var areaH = M.bottom - top - M.pad;
    // Responsive columns: 4 on wide, 3 on medium, 2 on narrow/portrait.
    var cols = 4;
    if (viewW < 760) cols = 3;
    if (viewW < 540 || M.portrait) cols = 2;
    var gap = Math.round(9 * us);
    var cellW = (M.cw - gap * (cols - 1)) / cols;
    var rows = Math.ceil(NS_WORKSHOP_ITEMS.length / cols);
    // Cell height fits the area exactly — never clamped above areaH so the
    // grid can't overflow into the console. The cell internals scale to
    // whatever height results (see nsDrawWorkshopCell).
    var cellH = (areaH - gap * (rows - 1)) / rows;
    if (cellH > Math.round(168 * us)) cellH = Math.round(168 * us);
    for (var i = 0; i < NS_WORKSHOP_ITEMS.length; i++) {
      var it = NS_WORKSHOP_ITEMS[i];
      var col = i % cols, row = Math.floor(i / cols);
      var cx0 = M.cx + col * (cellW + gap);
      var cy0 = top + row * (cellH + gap);
      // staggered entrance
      var lt = Math.max(0, Math.min(1, (nsWorkshopEnterT - i * 0.035) / 0.7));
      ctx.save();
      ctx.globalAlpha = ent * nsEaseOut(lt);
      ctx.translate(0, (1 - nsEaseOut(lt)) * 16 * us);
      nsDrawWorkshopCell(it, cx0, cy0, cellW, cellH, M);
      ctx.restore();
    }
    ctx.restore();

    // Edge gold pulse on a successful buy — drawn over the page.
    if (nsEdgePulseT > 0) {
      var ep = nsEdgePulseT / 0.5;
      var ew = Math.round(70 * us) * ep;
      var lg = ctx.createLinearGradient(0, 0, ew, 0);
      lg.addColorStop(0, 'rgba(255,224,130,' + (0.5 * ep).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,224,130,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, ew, M.bottom);
      var rg = ctx.createLinearGradient(viewW, 0, viewW - ew, 0);
      rg.addColorStop(0, 'rgba(255,224,130,' + (0.5 * ep).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,224,130,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(viewW - ew, 0, ew, M.bottom);
    }

    nsDrawParticles();
    // tooltip for the hovered item
    nsDrawWorkshopTooltip(M);
    nsDrawMoneyChip(M.cx + M.cw, M.bannerBottom + Math.round(4 * us), us, 'right');
    nsDrawBackArrow(M);
  }

  function nsDrawWorkshopCell(it, x, y, w, h, M) {
    var us = M.us;
    var info = nsUpgInfo(it);
    var tier = nsAffordTier(info.nextCost, info.maxed);
    var hovered = (nsHubHover === 'ws:' + it.key);
    var buying = (nsWorkBuyFx.key === it.key && nsWorkBuyFx.t > 0);
    var buyP = buying ? nsWorkBuyFx.t / 0.4 : 0;
    // "just out of reach" — close items glow softly, far items dim down.
    var glowAmt = 0;
    if (tier === 'afford') glowAmt = 0.55 + (hovered ? 0.45 : 0);
    else if (tier === 'close') glowAmt = 0.35 + 0.15 * (0.5 + 0.5 * Math.sin(nsRoomT * 4));
    var dim = (tier === 'far') ? 0.6 : 1;

    // buy bounce
    var bounce = buying ? -Math.sin(buyP * Math.PI) * 5 * us : 0;
    y += bounce;

    // glow halo
    if (glowAmt > 0.01) {
      var hg = ctx.createRadialGradient(x + w / 2, y + h / 2, 8, x + w / 2, y + h / 2, w * 0.7);
      hg.addColorStop(0, 'rgba(255,205,110,' + (0.3 * glowAmt).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(255,205,110,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(x - 14, y - 14, w + 28, h + 28);
    }
    ctx.globalAlpha = dim;
    // body
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 3, y + 4, w, h);
    nsPanel(x, y, w, h, '#33271b', '#4e3f2d', '#1c140c');
    drawBrassCornerL(x + 3, y + 3, false, false);
    drawBrassCornerL(x + w - 15, y + 3, true, false);
    drawBrassCornerL(x + 3, y + h - 15, false, true);
    drawBrassCornerL(x + w - 15, y + h - 15, true, true);

    // layout: icon niche / nameplate / pips / buy button. Sizes scale
    // down on short cells so the bottom block always fits inside `h`.
    var pad = Math.max(4, Math.round(Math.min(8 * us, h * 0.07)));
    var btnH = Math.max(Math.round(18 * us), Math.round(Math.min(28 * us, h * 0.22)));
    var npH = Math.max(Math.round(11 * us), Math.round(Math.min(15 * us, h * 0.12)));
    var pipH = Math.round(7 * us);
    var bottomH = npH + Math.round(3 * us) + pipH + Math.round(4 * us) + btnH + pad;
    var niY = y + pad, niX = x + pad;
    var niW = w - pad * 2;
    var niH = h - pad - bottomH;
    if (niH < Math.round(24 * us)) niH = Math.round(24 * us);
    ctx.fillStyle = '#120d09';
    ctx.fillRect(niX, niY, niW, niH);
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(niX + 2, niY + 2, niW - 4, niH - 4);
    if (glowAmt > 0.01) {
      var ng = ctx.createRadialGradient(niX + niW / 2, niY + niH / 2, 4, niX + niW / 2, niY + niH / 2, niW * 0.6);
      ng.addColorStop(0, 'rgba(255,210,120,' + (0.26 * glowAmt).toFixed(3) + ')');
      ng.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(niX + 2, niY + 2, niW - 4, niH - 4);
    }
    // icon — drill levels show iconLevel+1 preview when not maxed
    var iconLevel = info.lvl;
    if (it.key === 'drill') iconLevel = info.maxed ? info.lvl : info.lvl + 1;
    var iconSize = Math.min(niW - Math.round(14 * us), niH - Math.round(12 * us));
    // gentle idle float on the icon
    var fl = Math.sin(nsRoomT * 1.8 + it.key.length) * 2 * us;
    drawUpgradeIconBig(it.key, niX + niW / 2, niY + niH / 2 + fl, iconSize, iconLevel);
    // owned-pip badge top-left of niche
    if (info.lvl > 0) {
      var bpx = Math.round(7 * us);
      var bstr = it.isSpecial && (it.key === 'heat' || it.key === 'vert') ? 'OWNED' : ('LV' + info.lvl);
      ctx.fillStyle = 'rgba(20,14,8,0.8)';
      ctx.fillRect(niX + 3, niY + 3, nsTextW(bstr, bpx) + 6, bpx + 5);
      nsText(bstr, niX + 6, niY + 5, bpx, '#d4b878');
    }

    // nameplate
    var npY = niY + niH + Math.round(3 * us);
    var npName = it.name;
    if (it.key === 'drill') npName = drillTierShortName(iconLevel);
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(niX - 1, npY - 1, niW + 2, npH + 2);
    ctx.fillStyle = '#4a3618';
    ctx.fillRect(niX, npY, niW, npH);
    ctx.fillStyle = hovered ? '#a07c40' : '#7a5a2c';
    ctx.fillRect(niX + 1, npY + 1, niW - 2, npH - 2);
    var nmpx = Math.round(8 * us);
    var nmw = nsTextW(npName, nmpx);
    if (nmw > niW - 6) nmpx = nmpx * (niW - 6) / nmw;
    nsText(npName, niX + niW / 2, npY + (npH - nmpx) / 2, nmpx, '#231507', 'center');

    // pip strip
    var pipY = npY + npH + Math.round(4 * us);
    nsDrawPips(niX, pipY, niW, pipH, info.pipsCur, info.pipsMax);

    // BUY button
    var btnY = pipY + pipH + Math.round(4 * us);
    var canBuy = (tier === 'afford');
    var squish = buying ? Math.floor(buyP * 3) : 0;
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(niX - 1, btnY - 1 + squish, niW + 2, btnH + 2 - squish);
    var bodyCol;
    if (info.maxed) bodyCol = '#2f2a23';
    else if (tier === 'afford') bodyCol = hovered ? '#ffe068' : '#d4a838';
    else if (tier === 'close') bodyCol = '#7a6a3a';
    else bodyCol = '#4a4238';
    ctx.fillStyle = bodyCol;
    ctx.fillRect(niX, btnY + squish, niW, btnH - squish);
    if (!info.maxed && tier === 'afford') {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(niX, btnY + squish, niW, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(niX, btnY + btnH - 3, niW, 3);
    var blbl, bcol;
    if (info.maxed) {
      blbl = (it.key === 'heat' || it.key === 'vert') ? 'OWNED' : 'MAX';
      bcol = '#7d756a';
    } else {
      blbl = '$' + info.nextCost.toLocaleString();
      bcol = (tier === 'afford') ? '#241608' : '#cdbf9a';
    }
    var blpx = Math.round(10 * us);
    nsText(blbl, niX + niW / 2, btnY + squish + (btnH - squish - blpx) / 2, blpx, bcol, 'center');

    NS_HIT.push({ kind: 'wsitem', id: it.key, x: x, y: y - bounce, w: w, h: h });
    ctx.globalAlpha = 1;
  }

  // Brass tier-pip strip — filled pips = current level.
  function nsDrawPips(x, y, w, h, cur, max) {
    if (max < 1) max = 1;
    var gap = 2;
    var pw = (w - gap * (max - 1)) / max;
    for (var i = 0; i < max; i++) {
      var px = x + i * (pw + gap);
      var on = i < cur;
      ctx.fillStyle = '#0c0a07';
      ctx.fillRect(px - 1, y - 1, pw + 2, h + 2);
      ctx.fillStyle = on ? '#e0b84a' : '#2c2620';
      ctx.fillRect(px, y, pw, h);
      if (on) {
        ctx.fillStyle = '#fff0b0';
        ctx.fillRect(px, y, pw, 1);
      }
    }
  }

  // Hover tooltip — concrete current → next numbers.
  function nsDrawWorkshopTooltip(M) {
    if (!nsHubHover || nsHubHover.indexOf('ws:') !== 0) return;
    var key = nsHubHover.slice(3);
    var it = null;
    for (var i = 0; i < NS_WORKSHOP_ITEMS.length; i++) {
      if (NS_WORKSHOP_ITEMS[i].key === key) { it = NS_WORKSHOP_ITEMS[i]; break; }
    }
    if (!it) return;
    var hr = null;
    for (var j = 0; j < NS_HIT.length; j++) {
      if (NS_HIT[j].kind === 'wsitem' && NS_HIT[j].id === key) { hr = NS_HIT[j]; break; }
    }
    if (!hr) return;
    var info = nsUpgInfo(it);
    var us = M.us;
    // Build the lines
    var line1 = info.statLabel ? info.statLabel + ':' : '';
    var line2 = info.maxed ? ('' + info.cur + '  (MAX)') : ('' + info.cur + '  >  ' + info.next);
    var tpx = Math.round(8 * us);
    var hpx = Math.round(8.5 * us);
    var w1 = line1 ? nsTextW(line1, hpx) : 0;
    var w2 = nsTextW(line2, tpx);
    var tw = Math.max(w1, w2) + Math.round(16 * us);
    var th = Math.round((line1 ? 32 : 22) * us);
    var tx = hr.x + hr.w / 2 - tw / 2;
    var ty = hr.y - th - Math.round(6 * us);
    if (tx < M.cx) tx = M.cx;
    if (tx + tw > M.cx + M.cw) tx = M.cx + M.cw - tw;
    if (ty < M.cy + Math.round(40 * us)) ty = hr.y + hr.h + Math.round(6 * us);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(tx + 2, ty + 3, tw, th);
    nsPanel(tx, ty, tw, th, '#241a10', '#3e3020', '#140d07');
    var lineY = ty + Math.round(5 * us);
    if (line1) {
      nsText(line1, tx + Math.round(8 * us), lineY, hpx, '#caa84a');
      lineY += Math.round(11 * us);
    }
    nsText(line2, tx + Math.round(8 * us), lineY, tpx, '#e8dcc0');
  }

  function nsWorkshopPointerDown(x, y, hit) {
    if (!hit || hit.kind !== 'wsitem') return true;
    var it = null;
    for (var i = 0; i < NS_WORKSHOP_ITEMS.length; i++) {
      if (NS_WORKSHOP_ITEMS[i].key === hit.id) { it = NS_WORKSHOP_ITEMS[i]; break; }
    }
    if (!it) return true;
    var info = nsUpgInfo(it);
    var tier = nsAffordTier(info.nextCost, info.maxed);
    if (tier !== 'afford') {
      // not affordable / maxed — fail feedback
      nsSpawnCoins(hit.x + hit.w / 2, hit.y + hit.h * 0.7, 3, true);
      nsWorkBuyFx = { key: it.key, t: 0.2 };
      sfxPlay('ui-denied');
      return true;
    }
    var before = money;
    buildShopItems();
    var shopItem = null;
    for (var s = 0; s < shopItems.length; s++) {
      if (shopItems[s].key === it.key) { shopItem = shopItems[s]; break; }
    }
    if (shopItem) buyUpgrade(shopItem);
    var success = (money < before) || devMode;
    if (success) {
      nsWorkBuyFx = { key: it.key, t: 0.4 };
      nsEdgePulseT = 0.5;
      nsSpawnCoins(hit.x + hit.w / 2, hit.y + hit.h * 0.7, 10);
      var fname = it.name;
      if (it.key === 'drill') {
        var ni = nsUpgInfo(it);
        fname = drillTierShortName(ni.maxed ? ni.lvl : ni.lvl);
      }
      nsSpawnFloater('+ ' + fname, hit.x + hit.w / 2, hit.y + Math.round(10 * nsMetrics().us), '#ffe79a', 12);
      // (audio: buyUpgrade fired the ui-confirm tink — §2.11, no bespoke tool-clink)
    }
    return true;
  }

