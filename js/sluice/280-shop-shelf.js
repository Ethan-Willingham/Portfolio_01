  // ====================================================================
  //  SHELF — consumables with stacked-stock art + last-unit flourish.
  // ====================================================================
  var NS_SHELF_ITEMS = [
    { key: 'teleporter', name: 'TELEPORTER',   hotkey: 'T' },
    { key: 'balloon',    name: 'ROVER BALLOON',hotkey: 'B' },
    { key: 'bombSmall',  name: 'SMALL CHARGE', hotkey: '1' },
    { key: 'bombLarge',  name: 'LARGE CHARGE', hotkey: '2' },
    { key: 'reserveFuel',name: 'RESERVE FUEL', hotkey: 'AUTO', maxCount: 4 }
  ];
  function nsShelfCount(key) {
    if (key === 'teleporter') return teleporters;
    if (key === 'balloon') return balloons;
    if (key === 'bombSmall') return bombsSmall;
    if (key === 'bombLarge') return bombsLarge;
    if (key === 'reserveFuel') return reserveFuel;
    return 0;
  }
  function nsShelfCost(key) { return shop[key]; }

  function newShopDrawShelf(M) {
    var us = M.us;
    ctx.fillStyle = '#0e130f';
    ctx.fillRect(0, 0, viewW, M.bottom);
    var bg = ctx.createRadialGradient(viewW / 2, M.bottom * 0.42, 30, viewW / 2, M.bottom * 0.5, viewW * 0.7);
    bg.addColorStop(0, 'rgba(34,56,40,0.5)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, M.bottom);

    var ent = nsEaseOut(nsShelfEnterT);
    ctx.save();
    ctx.globalAlpha = ent;
    ctx.translate(0, (1 - ent) * 22 * us);
    nsBanner(M, 'SUPPLY SHELF', '#2e6a44');

    var top = M.headerBottom + Math.round(6 * us);
    var areaH = M.bottom - top - M.pad;
    var cols = 5;
    if (viewW < 820) cols = 4;
    if (viewW < 620) cols = 3;
    if (viewW < 440 || M.portrait) cols = 2;
    var gap = Math.round(9 * us);
    var cellW = (M.cw - gap * (cols - 1)) / cols;
    var rows = Math.ceil(NS_SHELF_ITEMS.length / cols);
    // Fit the area exactly so the grid never spills into the console.
    var cellH = (areaH - gap * (rows - 1)) / rows;
    if (cellH > Math.round(176 * us)) cellH = Math.round(176 * us);
    for (var i = 0; i < NS_SHELF_ITEMS.length; i++) {
      var it = NS_SHELF_ITEMS[i];
      var col = i % cols, row = Math.floor(i / cols);
      var cx0 = M.cx + col * (cellW + gap);
      var cy0 = top + row * (cellH + gap);
      var lt = Math.max(0, Math.min(1, (nsShelfEnterT - i * 0.045) / 0.7));
      ctx.save();
      ctx.globalAlpha = ent * nsEaseOut(lt);
      ctx.translate(0, (1 - nsEaseOut(lt)) * 16 * us);
      nsDrawShelfCell(it, cx0, cy0, cellW, cellH, M);
      ctx.restore();
    }
    ctx.restore();
    nsDrawParticles();
    nsDrawMoneyChip(M.cx + M.cw, M.bannerBottom + Math.round(4 * us), us, 'right');
    nsDrawBackArrow(M);
  }

  function nsDrawShelfCell(it, x, y, w, h, M) {
    var us = M.us;
    var count = nsShelfCount(it.key);
    var cost = nsShelfCost(it.key);
    var atCap = !!it.maxCount && count >= it.maxCount;
    var canBuy = !atCap && (devMode || money >= cost);
    var hovered = (nsHubHover === 'sh:' + it.key);
    var buying = (nsShelfBuyFx.key === it.key && nsShelfBuyFx.t > 0);
    var buyP = buying ? nsShelfBuyFx.t / 0.5 : 0;
    var lastUnit = buying && nsShelfBuyFx.lastUnit;
    var bounce = buying ? -Math.sin(buyP * Math.PI) * (lastUnit ? 9 : 5) * us : 0;
    y += bounce;

    var glowAmt = canBuy ? (0.4 + (hovered ? 0.45 : 0)) : 0;
    if (glowAmt > 0.01) {
      // Banded halo (stepped alpha, no smooth gradient — pixel discipline).
      var gc = lastUnit ? '255,240,150' : '120,200,140';
      var ghx = x + w / 2, ghy = y + h / 2, ghr = w * 0.7;
      for (var ghb = 5; ghb >= 1; ghb--) {
        var ghf = ghb / 5;
        ctx.fillStyle = 'rgba(' + gc + ',' + (0.3 * glowAmt * (1 - ghf) * (1 - ghf)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(ghx, ghy, 8 + (ghr - 8) * ghf, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 3, y + 4, w, h);
    nsPanel(x, y, w, h, '#243026', '#3a4a3a', '#141a14');
    drawBrassCornerL(x + 3, y + 3, false, false);
    drawBrassCornerL(x + w - 15, y + 3, true, false);
    drawBrassCornerL(x + 3, y + h - 15, false, true);
    drawBrassCornerL(x + w - 15, y + h - 15, true, true);

    // Sizes scale down on short cells so the bottom block always fits.
    var pad = Math.max(4, Math.round(Math.min(8 * us, h * 0.06)));
    var btnH = Math.max(Math.round(18 * us), Math.round(Math.min(28 * us, h * 0.20)));
    var npH = Math.max(Math.round(11 * us), Math.round(Math.min(15 * us, h * 0.11)));
    var stkH = Math.max(Math.round(10 * us), Math.round(Math.min(13 * us, h * 0.10)));
    var bottomH = npH + Math.round(3 * us) + stkH + Math.round(4 * us) + btnH + pad;
    var niX = x + pad, niY = y + pad, niW = w - pad * 2;
    var niH = h - pad - bottomH;
    if (niH < Math.round(24 * us)) niH = Math.round(24 * us);
    ctx.fillStyle = '#0c1109';
    ctx.fillRect(niX, niY, niW, niH);
    ctx.fillStyle = '#070b06';
    ctx.fillRect(niX + 2, niY + 2, niW - 4, niH - 4);
    if (glowAmt > 0.01) {
      // Banded niche glow, clipped to the niche interior.
      ctx.save();
      ctx.beginPath(); ctx.rect(niX + 2, niY + 2, niW - 4, niH - 4); ctx.clip();
      var ngx = niX + niW / 2, ngy = niY + niH / 2, ngr = niW * 0.6;
      for (var ngb = 4; ngb >= 1; ngb--) {
        var ngf = ngb / 4;
        ctx.fillStyle = 'rgba(150,220,160,' + (0.22 * glowAmt * (1 - ngf) * (1 - ngf)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(ngx, ngy, 4 + (ngr - 4) * ngf, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Stacked-stock art: many owned → draw a small back-stack of icons.
    var stackN = Math.min(3, Math.max(0, count - 1));
    var baseSize = Math.min(niW - Math.round(16 * us), niH - Math.round(14 * us));
    var fl = Math.sin(nsRoomT * 1.9 + it.key.length) * 1.6 * us;
    for (var s = stackN; s >= 1; s--) {
      ctx.save();
      ctx.globalAlpha = 0.32 - s * 0.06;
      ctx.translate(s * 5 * us, s * 4 * us + fl);
      drawConsumableIconBig(it.key, niX + niW / 2, niY + niH / 2, baseSize * 0.86);
      ctx.restore();
    }
    drawConsumableIconBig(it.key, niX + niW / 2, niY + niH / 2 + fl, baseSize);
    // last-unit flourish star-burst
    if (lastUnit) {
      var fp = 1 - buyP;
      ctx.strokeStyle = 'rgba(255,240,160,' + (1 - fp).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (var r = 0; r < 6; r++) {
        var ra = r / 6 * Math.PI * 2 + nsRoomT;
        var r0 = baseSize * 0.4 * fp, r1 = baseSize * (0.5 + 0.3 * fp);
        ctx.beginPath();
        ctx.moveTo(niX + niW / 2 + Math.cos(ra) * r0, niY + niH / 2 + Math.sin(ra) * r0);
        ctx.lineTo(niX + niW / 2 + Math.cos(ra) * r1, niY + niH / 2 + Math.sin(ra) * r1);
        ctx.stroke();
      }
    }

    // Pinned paper price tag — the shelf's "price pinned beside the item".
    if (!atCap) {
      var tgPx = Math.round(8 * us);
      var tgStr = '$' + cost.toLocaleString();
      var tgW = nsTextW(tgStr, tgPx) + Math.round(10 * us);
      var tgH = tgPx + Math.round(7 * us);
      var tgX = niX + niW - tgW - Math.round(4 * us);
      var tgY = niY + Math.round(4 * us);
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(tgX + Math.round(tgW / 2) - 1, tgY - Math.round(3 * us), 2, Math.round(3 * us));
      ctx.fillStyle = '#0c0a07';
      ctx.fillRect(tgX - 1, tgY - 1, tgW + 2, tgH + 2);
      ctx.fillStyle = '#e8d098';
      ctx.fillRect(tgX, tgY, tgW, tgH);
      ctx.fillStyle = '#bfa46a';
      ctx.fillRect(tgX, tgY + tgH - 1, tgW, 1);
      nsText(tgStr, tgX + tgW / 2, tgY + (tgH - tgPx) / 2, tgPx, canBuy ? '#231507' : '#8a1e16', 'center');
    }

    // nameplate
    var npY = niY + niH + Math.round(3 * us);
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(niX - 1, npY - 1, niW + 2, npH + 2);
    ctx.fillStyle = '#4a3618';
    ctx.fillRect(niX, npY, niW, npH);
    ctx.fillStyle = hovered ? '#a07c40' : '#7a5a2c';
    ctx.fillRect(niX + 1, npY + 1, niW - 2, npH - 2);
    var nmpx = Math.round(8 * us);
    var nmw = nsTextW(it.name, nmpx);
    if (nmw > niW - 6) nmpx = nmpx * (niW - 6) / nmw;
    nsText(it.name, niX + niW / 2, npY + (npH - nmpx) / 2, nmpx, '#231507', 'center');

    // stock counter with tick-down ghost
    var stkY = npY + npH + Math.round(4 * us);
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(niX - 1, stkY - 1, niW + 2, stkH + 2);
    ctx.fillStyle = '#0e1810';
    ctx.fillRect(niX, stkY, niW, stkH);
    var stkStr = 'STOCK x' + count + '   [' + it.hotkey + ']';
    nsText(stkStr, niX + niW / 2, stkY + (stkH - Math.round(7 * us)) / 2, Math.round(7 * us),
           count > 0 ? '#5fc070' : '#6a7a68', 'center');

    // BUY button
    var btnY = stkY + stkH + Math.round(4 * us);
    var squish = buying ? Math.floor(buyP * 3) : 0;
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(niX - 1, btnY - 1 + squish, niW + 2, btnH + 2 - squish);
    var bodyCol;
    if (atCap) bodyCol = '#2f2a23';
    else if (canBuy) bodyCol = hovered ? '#ffe068' : '#d4a838';
    else bodyCol = '#4a4238';
    ctx.fillStyle = bodyCol;
    ctx.fillRect(niX, btnY + squish, niW, btnH - squish);
    if (canBuy && !atCap) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(niX, btnY + squish, niW, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(niX, btnY + btnH - 3, niW, 3);
    var blbl = atCap ? 'FULL' : 'BUY';
    var bcol = (canBuy && !atCap) ? '#241608' : (atCap ? '#7d756a' : '#cdbf9a');
    var blpx = Math.round(10 * us);
    nsText(blbl, niX + niW / 2, btnY + squish + (btnH - squish - blpx) / 2, blpx, bcol, 'center');

    NS_HIT.push({ kind: 'shitem', id: it.key, x: x, y: y - bounce, w: w, h: h });
  }

  function nsShelfPointerDown(x, y, hit) {
    if (!hit || hit.kind !== 'shitem') return true;
    var it = null;
    for (var i = 0; i < NS_SHELF_ITEMS.length; i++) {
      if (NS_SHELF_ITEMS[i].key === hit.id) { it = NS_SHELF_ITEMS[i]; break; }
    }
    if (!it) return true;
    var count = nsShelfCount(it.key);
    var cost = nsShelfCost(it.key);
    var atCap = !!it.maxCount && count >= it.maxCount;
    if (atCap || (!devMode && money < cost)) {
      nsSpawnCoins(hit.x + hit.w / 2, hit.y + hit.h * 0.7, 3, true);
      nsShelfBuyFx = { key: it.key, t: 0.2, lastUnit: false };
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
      // "last unit" = buying the final stockable reserve-fuel tank.
      var lastUnit = !!it.maxCount && nsShelfCount(it.key) >= it.maxCount;
      nsShelfBuyFx = { key: it.key, t: 0.5, lastUnit: lastUnit };
      var us = nsMetrics().us;
      nsSpawnCoins(hit.x + hit.w / 2, hit.y + hit.h * 0.7, lastUnit ? 16 : 9);
      nsSpawnFloater('+1  ' + it.name, hit.x + hit.w / 2, hit.y + Math.round(10 * us),
                     lastUnit ? '#fff0a0' : '#7be08a', lastUnit ? 13 : 11);
      // (audio: buyUpgrade fired the ui-confirm tink — §2.11, no bespoke
      // shelf-thunk; the last-unit flourish stays visual-only)
    }
    return true;
  }

  // ########################################################################
  // ##  NEW SHOP — end of new shop module                                 ##
  // ########################################################################

