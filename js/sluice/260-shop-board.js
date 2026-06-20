  // ====================================================================
  //  TRADE BOARD — a frontier-town commodity exchange.
  // ====================================================================
  // Placeholder catalog of tradeable goods. Static prices for now (the
  // economy lands later). Mix of mundane + mysterious so the world feels
  // bigger than the mine. `iconKind` selects the procedural icon below.
  // buy = the price the post sells AT; sell = what it pays you (15-25%
  // lower spread). flavor = one-line description shown in the detail panel.
  // Ordered cheap -> precious so the market scroll runs staples to exotica.
  // `iconKind` selects the 32x32 sprite baked in commoditySprites (255).
  // Existing keys (ironIngot/quartz/coalBrick/...) are preserved so any saved
  // tradeGoods inventory still resolves. Static prices for now (economy later).
  var NS_BOARD_GOODS = [
    { key: 'saltblock',  name: 'ROCK SALT',          iconKind: 'saltblock',   buy: 18,   sell: 13,
      flavor: 'Cut from the flats in white bricks. Keeps the meat, keeps the men.' },
    { key: 'railspike',  name: 'RAIL SPIKE',         iconKind: 'railspike',   buy: 22,   sell: 16,
      flavor: 'A fistful of iron the whole line is built on. Sold by the keg.' },
    { key: 'coalBrick',  name: 'COAL BRICKS',        iconKind: 'brick',       buy: 26,   sell: 20,
      flavor: 'Pressed black fuel. Cheap, heavy, and the boiler is never full.' },
    { key: 'niter',      name: 'SALTPETER',          iconKind: 'niter',       buy: 30,   sell: 23,
      flavor: 'Scraped white off the cave walls. Half of every charge that drops a roof.' },
    { key: 'rope',       name: 'COIL OF ROPE',       iconKind: 'rope',        buy: 33,   sell: 25,
      flavor: 'Good hemp, forty feet of it. The difference between a fall and a climb.' },
    { key: 'sulfur',     name: 'BRIMSTONE',          iconKind: 'sulfur',      buy: 34,   sell: 26,
      flavor: 'Yellow as a fever and twice as bitter. The powder mill always wants more.' },
    { key: 'horseshoe',  name: 'LUCKY HORSESHOE',    iconKind: 'horseshoe',   buy: 36,   sell: 27,
      flavor: 'Worn thin over a hundred miles. Hung points up, just in case.' },
    { key: 'leadpig',    name: 'LEAD PIG',           iconKind: 'leadpig',     buy: 38,   sell: 29,
      flavor: 'Dull, soft, and heavy. For shot, for pipe, for sinking things quietly.' },
    { key: 'tobacco',    name: 'TWIST OF TOBACCO',   iconKind: 'tobacco',     buy: 39,   sell: 30,
      flavor: 'Dark, oily, sweet. The one luxury a man carries down the hole.' },
    { key: 'lampoil',    name: 'LAMP OIL',           iconKind: 'lampoil',     buy: 40,   sell: 31,
      flavor: 'A tin of clear burning oil. The dark down there is patient.' },
    { key: 'nailkeg',    name: 'KEG OF NAILS',       iconKind: 'nailkeg',     buy: 44,   sell: 34,
      flavor: 'Square-cut and bright, loud in the box. Every wall in town needs them.' },
    { key: 'calico',     name: 'BOLT OF CALICO',     iconKind: 'calico',      buy: 48,   sell: 37,
      flavor: 'Printed cotton off the eastern looms. Brightens a sod house quick.' },
    { key: 'ironIngot',  name: 'REFINED IRON INGOT', iconKind: 'ingot',       buy: 50,   sell: 40,
      flavor: 'A clean grey bar, stamped with the foundry mark. Always in demand.' },
    { key: 'coffeesack', name: 'SACK OF COFFEE',     iconKind: 'coffeesack',  buy: 52,   sell: 40,
      flavor: 'Green beans in burlap. Worth its weight the hour before a night shift.' },
    { key: 'pickaxe',    name: 'PICKAXE',            iconKind: 'pickhead',    buy: 58,   sell: 45,
      flavor: 'Forged heavy, hung on a hickory haft. The mine eats two a season.' },
    { key: 'whiskey',    name: 'BOTTLE OF WHISKEY',  iconKind: 'whiskey',     buy: 60,   sell: 46,
      flavor: 'Amber and unrepentant. Currency in nine camps out of ten.' },
    { key: 'pelt',       name: 'BEAVER PELT',        iconKind: 'pelt',        buy: 70,   sell: 55,
      flavor: 'Brushed and supple. The fur road still runs, quieter than the rail.' },
    { key: 'silverore',  name: 'RAW SILVER ORE',     iconKind: 'silverore',   buy: 72,   sell: 56,
      flavor: 'Grey rock with a bright vein. Worth more once the assayer is done.' },
    { key: 'quartz',     name: 'POLISHED QUARTZ',    iconKind: 'crystal',     buy: 76,   sell: 60,
      flavor: 'Cut glass-clear. The telegraph offices buy these by the crate.' },
    { key: 'copperWire', name: 'COPPER WIRE SPOOL',  iconKind: 'spool',       buy: 95,   sell: 76,
      flavor: 'Hand-wound on a pine bobbin. The line west needs miles of it.' },
    { key: 'dynamite',   name: 'STICK OF DYNAMITE',  iconKind: 'dynamite',    buy: 98,   sell: 74,
      flavor: 'Red paper and a waxed fuse. New, costly, and far too eager.' },
    { key: 'powderkeg',  name: 'POWDER KEG',         iconKind: 'powderkeg',   buy: 130,  sell: 100,
      flavor: 'Black grains in a banded barrel. Handle it like it hates you.' },
    { key: 'turquoise',  name: 'TURQUOISE',          iconKind: 'turquoise',   buy: 140,  sell: 110,
      flavor: 'Sky-blue, veined with black. The old people here prized it over silver.' },
    { key: 'lantern',    name: "MINER'S LANTERN",    iconKind: 'lantern',     buy: 150,  sell: 118,
      flavor: 'A brass cage of flame. Keep it lit. Always keep it lit.' },
    { key: 'silverbar',  name: 'SILVER BAR',         iconKind: 'silverbar',   buy: 165,  sell: 132,
      flavor: 'Stamped, weighed, and cold. The bank counts these ones twice.' },
    { key: 'compass',    name: "SURVEYOR'S COMPASS", iconKind: 'compass',     buy: 185,  sell: 146,
      flavor: 'The needle will not lie, even when the map does.' },
    { key: 'crowfeather',name: 'BLACK CROW FEATHER', iconKind: 'crowfeather', buy: 200,  sell: 156,
      flavor: 'The surveyor followed the crows. This is all that came back of either.' },
    { key: 'fossil',     name: 'STRANGE FOSSIL',     iconKind: 'fossil',      buy: 210,  sell: 162,
      flavor: 'A coiled thing in stone. The university man pays well, asks little.' },
    { key: 'pocketwatch',name: 'BRASS POCKET WATCH', iconKind: 'pocketwatch', buy: 220,  sell: 172,
      flavor: 'Still keeps good time, though its owner does not. It ticks in your palm.' },
    { key: 'golddust',   name: 'GOLD DUST',          iconKind: 'golddust',    buy: 240,  sell: 190,
      flavor: 'A pinch in a twist of paper. Men have died for less of it.' },
    { key: 'telegraphkey',name: 'TELEGRAPH KEY',     iconKind: 'telegraphkey',buy: 260,  sell: 205,
      flavor: "Brass and bakelite. The whole frontier's gossip passed under this thumb." },
    { key: 'quicksilver',name: 'FLASK OF QUICKSILVER',iconKind: 'quicksilver',buy: 310,  sell: 245,
      flavor: 'It rolls and never wets. The assayer swears by it and at it.' },
    { key: 'cog',        name: 'ANTIQUE COG',        iconKind: 'cog',         buy: 340,  sell: 270,
      flavor: 'Brass teeth worn smooth. Older than the town. Older than the rail.' },
    { key: 'glowmilk',   name: 'JAR OF GLOWMILK',    iconKind: 'glowmilk',    buy: 420,  sell: 330,
      flavor: 'Cold blue light in a sealed jar. It came up out of the singing caverns.' },
    { key: 'opal',       name: 'FIRE OPAL',          iconKind: 'opal',        buy: 480,  sell: 375,
      flavor: 'It holds a coal that never cools. Turn it and the fire moves.' },
    { key: 'meteorite',  name: 'FALLEN-STAR IRON',   iconKind: 'meteorite',   buy: 560,  sell: 440,
      flavor: 'Came down burning near Marker 9. Pocked like the moon, warm yet, some swear.' },
    { key: 'brassfinger',name: 'AUTOMATON FINGER',   iconKind: 'brassfinger', buy: 640,  sell: 500,
      flavor: 'A jointed brass digit, too fine for any smith here. It twitched once. Once.' },
    { key: 'goldbar',    name: 'GOLD BAR',           iconKind: 'goldbar',      buy: 720,  sell: 560,
      flavor: 'Heavy enough to bend a saddlebag. Heavy enough to bend a man.' },
    { key: 'geode',      name: 'SINGING GEODE',      iconKind: 'geode',       buy: 780,  sell: 610,
      flavor: 'Hold it to your ear at the new moon. Do not answer what answers.' },
    { key: 'lightning',  name: 'BOTTLED LIGHTNING',  iconKind: 'bottle',      buy: 880,  sell: 680,
      flavor: 'It hums against the glass. Nobody will say where it was caught.' },
    { key: 'diamond',    name: 'DIAMOND',            iconKind: 'diamond',     buy: 950,  sell: 740,
      flavor: 'Greasy and grey in the rough, but the assayer\'s loupe gives it away.' },
    { key: 'saltidol',   name: 'SALT-FLAT IDOL',     iconKind: 'saltidol',    buy: 1100, sell: 860,
      flavor: 'Carved white and faceless, found facing east. The diggers reburied three. You kept this.' },
    { key: 'letter',     name: 'SEALED LETTER',      iconKind: 'letter',      buy: 1500, sell: 1180,
      flavor: 'Wax seal unbroken. Addressed to no man. Carried, never opened.' }
  ];
  // Hand-picked bulletin notices. 2-3 are pinned per shop-open (rotated).
  var NS_BOARD_NOTICES = [
    { head: 'WANTED', body: 'Surveyor lost beyond the salt flats. Last seen following the crows. Reward in copper.' },
    { head: 'NOTICE', body: 'The Rail Company will not honor claims east of Marker 9. Travel the gorge at your own peril.' },
    { head: 'RUMOR',  body: 'They say the deep mine sings at the new moon. They say do not answer it.' },
    { head: 'TRADE',  body: 'Quartz prices up in Drywell. A wagon leaves Thursday. Seats and crates negotiable.' },
    { head: 'WARNING',body: 'No-man\'s-land patrols suspended. Carry your own water. Carry your own iron.' },
    { head: 'BOUNTY', body: 'Cog-thief works the northern posts. Brass fingers, quiet boots. Do not trade after dark.' },
    { head: 'NEWS',   body: 'Telegraph reaches Hollow Pass by spring. Until then, the Board is the only wire.' },
    { head: 'POSTED', body: 'Found: a sealed letter. Owner may claim at the assayer. Bring proof. Bring patience.' }
  ];
  // Telegraph-tape ticker - real quotes pulled off the wire from the four towns.
  // Each line is an actual standing: how a good sits versus its standard price in
  // that town right now (UP = dear there, a place to sell; DOWN = cheap there, a
  // place to buy). This is the player's window into towns they are not standing
  // in, so it is real market data, not flavor. The biggest movers are sampled so
  // the wire reads fresh between visits.
  var nsTickerText = '';
  function nsBuildTicker() {
    var st = nsMarketEnsure();
    var rows = [];
    if (st) {
      for (var t = 0; t < MARKET.TOWNS.length; t++) {
        for (var i = 0; i < NS_BOARD_GOODS.length; i++) {
          var pct = marketModel.pctDelta(st, t, NS_BOARD_GOODS[i]);
          if (pct === 0) continue;
          rows.push({ town: MARKET.TOWNS[t], name: NS_BOARD_GOODS[i].name, pct: pct });
        }
      }
      rows.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    }
    var pool = rows.slice(0, Math.min(20, rows.length));
    for (var s = pool.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1)), tmp = pool[s]; pool[s] = pool[j]; pool[j] = tmp;
    }
    var parts = [];
    for (var k = 0; k < pool.length && k < 9; k++) {
      var r = pool[k];
      parts.push(r.town + ': ' + r.name + ' ' + (r.pct >= 0 ? 'UP' : 'DOWN') + ' ' + Math.abs(r.pct) + '%');
    }
    // lead with any telegraphed shocks (the speculation hook)
    if (st && marketModel.eventTelegraph) {
      var evs = marketModel.eventTelegraph(st), alerts = [];
      for (var ei = 0; ei < evs.length; ei++) {
        var ev = evs[ei];
        var word = ev.kind > 0 ? (ev.soon ? 'SCARCE SOON' : 'SCARCE NOW') : (ev.soon ? 'GLUT SOON' : 'GLUT NOW');
        alerts.push('** ' + MARKET.TOWNS[ev.town] + ': ' + ev.cat + ' ' + word + ' **');
      }
      parts = alerts.concat(parts);
    }
    if (!parts.length) parts.push('TELEGRAPH QUIET   *   NO QUOTES ON THE WIRE');
    nsTickerText = parts.join('   *   ') + '   *   ';
  }
  function nsBoardRollPrices() {
    // Catch the market up to elapsed game time (prices drift while you are away
    // mining) and flash the movers, then pick notices + rebuild the ticker.
    // Called on board entry.
    nsBoardPriceCheck();
    var stm = nsMarketEnsure();
    if (stm) stm.day = (stm.day || 0) + 1;   // a fresh trading day each market visit
    nsBoardNoticeIdx = [];
    var pool = [];
    for (var i = 0; i < NS_BOARD_NOTICES.length; i++) pool.push(i);
    var n = 2 + Math.floor(Math.random() * 2);
    for (var k = 0; k < n && pool.length; k++) {
      var pick = Math.floor(Math.random() * pool.length);
      nsBoardNoticeIdx.push(pool[pick]);
      pool.splice(pick, 1);
    }
    nsBuildTicker();
    nsBoardTickT = 0;
    nsBoardPriceTickT = 5;
  }
  // Advance the market and flash the goods whose local (current-town) sell price
  // changed this step. Capped to the few biggest movers so the board breathes
  // rather than strobing all 43 rows. Used on board entry and the ~5s tick.
  function nsBoardPriceCheck() {
    var st = nsMarketEnsure();
    if (!st) return;
    var t = nsMarketTown();
    var prev = {}, i, g;
    for (i = 0; i < NS_BOARD_GOODS.length; i++) {
      g = NS_BOARD_GOODS[i];
      prev[g.key] = marketModel.sellPrice(st, t, g);
    }
    var beforeT = st.t;
    nsMarketAdvance();
    if (st.t === beforeT) return;  // no whole tick of game time has elapsed yet
    var movers = [];
    for (i = 0; i < NS_BOARD_GOODS.length; i++) {
      g = NS_BOARD_GOODS[i];
      var d = Math.abs(marketModel.sellPrice(st, t, g) - prev[g.key]);
      if (d > 0) movers.push({ key: g.key, d: d });
    }
    movers.sort(function (a, b) { return b.d - a.d; });
    for (i = 0; i < movers.length && i < 4; i++) nsBoardRollFx[movers[i].key] = 0.6;
  }
  function nsTradeCount(key) {
    if (!player || !player.tradeGoods) return 0;
    return player.tradeGoods[key] || 0;
  }

  // ---- Commodity icons: baked 32x32 sprites (commoditySprites, fragment 255).
  //  One crisp nearest-neighbor blit; replaces the old per-kind procedural switch.
  function nsDrawGoodIcon(kind, cx, cy, size) {
    var bmp = (typeof commoditySprites !== 'undefined') ? commoditySprites.bitmap(kind) : null;
    if (!bmp) return;
    var d = Math.round(size);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, 0, 0, commoditySprites.SIZE, commoditySprites.SIZE,
                  Math.round(cx - d / 2), Math.round(cy - d / 2), d, d);
    ctx.restore();
  }

  // ---- Board transactions ----------------------------------------------
  function nsBoardTradeQty(good, selling) {
    var q = nsBoardQty;
    if (q === 'MAX') {
      if (selling) return nsTradeCount(good.key);
      var afford = devMode ? 9999 : Math.floor(money / nsBuyPrice(good));
      return Math.max(0, afford);
    }
    return q;
  }
  function nsBoardDoTrade(good, rowRect, selling) {
    var qty = nsBoardTradeQty(good, selling);
    if (qty <= 0) return;
    var cx = rowRect.x + rowRect.w * 0.18;
    var cy = rowRect.y + rowRect.h * 0.5;
    if (selling) {
      var have = nsTradeCount(good.key);
      if (have <= 0) { nsSpawnCoins(cx, cy, 3, true); sfxPlay('ui-denied'); return; }
      var sellQ = Math.min(qty, have);
      var unitSell = nsSellPrice(good);
      player.tradeGoods[good.key] = have - sellQ;
      var gain = sellQ * unitSell;
      money += gain;
      nsMarketApplyTrade(good, sellQ, true);
      nsSpawnCoins(cx, cy, 9);
      nsSpawnFloater('+$' + gain.toLocaleString(), cx, cy - 8, '#7be08a', 12);
      nsBoardShredsBurst(rowRect);
      nsBoardStamps.push({ key: good.key, t: 1.0 });
      sfxPlay('ui-confirm');   // the one confirm tink (§2.11 — no bespoke trade bell)
    } else {
      var unitBuy = nsBuyPrice(good);
      var cost = qty * unitBuy;
      if (!devMode && money < cost) {
        // afford only some
        var can = Math.floor(money / unitBuy);
        if (can <= 0) { nsSpawnCoins(cx, cy, 3, true); sfxPlay('ui-denied'); return; }
        qty = can; cost = qty * unitBuy;
      }
      if (!devMode) money -= cost;
      player.tradeGoods[good.key] = nsTradeCount(good.key) + qty;
      nsMarketApplyTrade(good, qty, false);
      nsSpawnCoins(cx, cy, 9, true);
      nsSpawnFloater('-$' + cost.toLocaleString(), cx, cy - 8, '#ffd06a', 12);
      nsBoardShredsBurst(rowRect);
      nsBoardStamps.push({ key: good.key, t: 1.0 });
      sfxPlay('ui-confirm');   // same tink for buy (§2.11 — no coin-drop variant)
    }
  }
  function nsBoardShredsBurst(rowRect) {
    var n = 14;
    for (var i = 0; i < n; i++) {
      if (nsBoardShreds.length >= 60) break;
      nsBoardShreds.push({
        x: rowRect.x + rowRect.w * (0.3 + Math.random() * 0.4),
        y: rowRect.y + rowRect.h * 0.5,
        vx: (Math.random() - 0.5) * 6,
        vy: -2 - Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        t: 0.7 + Math.random() * 0.4,
        ttl: 1.1
      });
    }
  }

  // ---- Board layout (responsive) ---------------------------------------
  function nsBoardLayout(M) {
    var us = M.us;
    var areaTop = M.headerBottom + Math.round(4 * us);
    var tickerH = Math.round(24 * us);
    var areaBottom = M.bottom - M.pad - tickerH - Math.round(6 * us);
    var areaH = areaBottom - areaTop;
    var gap = Math.round(10 * us);
    var market, notices;
    if (M.portrait) {
      // Stacked: market on top, notices below. The notices panel gets a
      // fixed share sized to fit ~2 notices comfortably; market takes the
      // rest. Clamped so the market never collapses on a very short phone.
      var nH = Math.round(areaH * 0.40);
      var nMin = Math.round(150 * us), nMax = Math.round(260 * us);
      if (nH < nMin) nH = nMin;
      if (nH > nMax) nH = nMax;
      if (nH > areaH - Math.round(160 * us)) nH = Math.max(Math.round(96 * us), areaH - Math.round(160 * us));
      var mH = areaH - nH - gap;
      market  = { x: M.cx, y: areaTop, w: M.cw, h: mH };
      notices = { x: M.cx, y: areaTop + mH + gap, w: M.cw, h: nH };
    } else {
      // Side-by-side: market ~62%, notices ~38%.
      var mW = Math.round(M.cw * 0.62);
      market  = { x: M.cx, y: areaTop, w: mW, h: areaH };
      notices = { x: M.cx + mW + gap, y: areaTop, w: M.cw - mW - gap, h: areaH };
    }
    return {
      market: market, notices: notices,
      ticker: { x: M.cx, y: areaBottom + Math.round(6 * us), w: M.cw, h: tickerH },
      portrait: M.portrait
    };
  }

  function newShopDrawBoard(M) {
    var us = M.us;
    var dt = 1 / 60;
    // Backdrop
    ctx.fillStyle = '#100b07';
    ctx.fillRect(0, 0, viewW, M.bottom);
    var bgGrad = ctx.createRadialGradient(viewW / 2, M.bottom * 0.4, 30, viewW / 2, M.bottom * 0.5, viewW * 0.7);
    bgGrad.addColorStop(0, 'rgba(48,36,22,0.5)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, viewW, M.bottom);

    // Entrance: whole page slides up + fades.
    var ent = nsEaseOut(nsBoardEnterT);
    ctx.save();
    ctx.globalAlpha = ent;
    ctx.translate(0, (1 - ent) * 22 * us);

    nsBanner(M, 'TRADE BOARD', '#6a4a1c');

    var lay = nsBoardLayout(M);
    // advance ticker + price-tick clock
    nsBoardTickT += dt * 38 * us;
    nsBoardPriceTickT -= dt;
    if (nsBoardPriceTickT <= 0) {
      nsBoardPriceTickT = 5;
      // Advance the real market by any elapsed ticks, then flash the goods whose
      // local price actually moved (the biggest few movers in this town).
      nsBoardPriceCheck();
    }
    for (var rk in nsBoardRollFx) {
      if (nsBoardRollFx[rk] > 0) nsBoardRollFx[rk] -= dt;
    }

    nsDrawBoardMarket(lay.market, M);
    nsDrawBoardNotices(lay.notices, M);
    nsDrawBoardTicker(lay.ticker, M);

    // paper shreds + particles on top
    nsDrawBoardShreds();
    nsDrawParticles();
    ctx.restore();

    // money chip + back arrow ride above the entrance transform
    nsDrawMoneyChip(M.cx + M.cw, M.bannerBottom + Math.round(4 * us), us, 'right');
    nsDrawBackArrow(M);
  }

  function nsDrawBoardShreds() {
    for (var i = 0; i < nsBoardShreds.length; i++) {
      var sh = nsBoardShreds[i];
      var a = Math.min(1, sh.t / sh.ttl * 1.5);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = 'rgba(231,214,164,' + a.toFixed(3) + ')';
      ctx.fillRect(-2, -3, 4, 6);
      ctx.fillStyle = 'rgba(180,154,99,' + a.toFixed(3) + ')';
      ctx.fillRect(-2, 1, 4, 2);
      ctx.restore();
    }
  }

  // ---- Board market — the commodity list + detail panel ----------------
  function nsDrawBoardMarket(rect, M) {
    var us = M.us;
    // Weathered-wood backboard
    nsWoodBacking(rect.x, rect.y, rect.w, rect.h, NS_STATION_INFO.board);
    // Header strip — chalkboard with "COMMODITY MARKET"
    var hdrH = Math.round(28 * us);
    var inX = rect.x + Math.round(8 * us);
    var inW = rect.w - Math.round(16 * us);
    var hdrY = rect.y + Math.round(8 * us);
    nsChalkboard(inX, hdrY, inW, hdrH);
    nsChalkText('COMMODITY  MARKET', inX + inW / 2, hdrY + hdrH / 2 - Math.round(6 * us),
                Math.round(11 * us), 'center');
    // "DAY N" framing (SHOP_PSYCHOLOGY: today's prices, urgency from time passing,
    // never fake scarcity). N counts market visits.
    var stHdr = nsMarketEnsure();
    var hdrSubY = hdrY + hdrH - Math.round(9 * us);
    nsText(MARKET.TOWNS[nsMarketTown()], inX + Math.round(5 * us), hdrSubY,
           Math.round(7 * us), 'rgba(207,224,232,0.85)', 'left');
    nsText('DAY ' + (stHdr ? (stHdr.day || 1) : 1), inX + inW - Math.round(5 * us), hdrSubY,
           Math.round(7 * us), 'rgba(206,160,80,0.85)', 'right');
    // column hint
    var listY = hdrY + hdrH + Math.round(6 * us);
    var listH = rect.y + rect.h - listY - Math.round(8 * us);
    // clip the scrollable list
    ctx.save();
    ctx.beginPath();
    ctx.rect(inX, listY, inW, listH);
    ctx.clip();
    var rowH = Math.round(40 * us);
    var selRowH = Math.round(40 * us) + Math.round(134 * us);  // expanded detail (+ cross-town quotes)
    var y = listY - nsBoardScroll;
    var contentH = 0;
    for (var i = 0; i < NS_BOARD_GOODS.length; i++) {
      var g = NS_BOARD_GOODS[i];
      var expanded = (nsBoardSel === g.key);
      var thisH = expanded ? selRowH : rowH;
      // only draw + register rows intersecting the viewport
      if (y + thisH > listY - 4 && y < listY + listH + 4) {
        nsDrawBoardRow(g, inX, y, inW, rowH, thisH, expanded, M);
      } else if (expanded) {
        // still register the row hit even off-screen-ish (rare)
        NS_HIT.push({ kind: 'boardrow', id: g.key, x: inX, y: y, w: inW, h: rowH });
      }
      y += thisH + Math.round(5 * us);
      contentH += thisH + Math.round(5 * us);
    }
    ctx.restore();
    nsBoardScrollMax = Math.max(0, contentH - listH);
    if (nsBoardScroll > nsBoardScrollMax) nsBoardScroll = nsBoardScrollMax;
    // scrollbar
    if (nsBoardScrollMax > 1) {
      var trH = listH;
      var thumbH = Math.max(20, trH * (listH / (contentH)));
      var thumbY = listY + (trH - thumbH) * (nsBoardScroll / nsBoardScrollMax);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(rect.x + rect.w - Math.round(6 * us), listY, 3, trH);
      ctx.fillStyle = 'rgba(212,168,90,0.7)';
      ctx.fillRect(rect.x + rect.w - Math.round(6 * us), thumbY, 3, thumbH);
    }
    // top/bottom fade so rows clip cleanly
    var fg = ctx.createLinearGradient(0, listY, 0, listY + 12);
    fg.addColorStop(0, 'rgba(34,24,14,0.9)');
    fg.addColorStop(1, 'rgba(34,24,14,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(inX, listY, inW, 12);
  }

  // A small slate chalkboard surface.
  function nsChalkboard(x, y, w, h) {
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#1c2622';
    ctx.fillRect(x, y, w, h);
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // chalk dust streaks
    ctx.fillStyle = 'rgba(200,210,205,0.05)';
    ctx.fillRect(x + 4, y + h - 4, w - 8, 2);
  }
  function nsChalkText(str, x, y, px, align) {
    nsText(str, x, y, px, 'rgba(225,232,224,0.92)', align);
  }

  // ---- A single commodity row (collapsed or expanded with detail) ------
  function nsDrawBoardRow(g, x, y, w, rowH, fullH, expanded, M) {
    var us = M.us;
    var hovered = (nsBoardHover === g.key);
    var owned = nsTradeCount(g.key);
    // paper-creak idle wobble when hovered
    var creak = hovered ? Math.sin(nsRoomT * 9) * 0.6 : 0;
    // Row paper card
    ctx.save();
    ctx.translate(0, creak);
    // pinned-paper card (slightly rotated for character)
    var seed = 0; for (var si = 0; si < g.key.length; si++) seed += g.key.charCodeAt(si);
    nsPaper(x, y, w, fullH, seed);
    if (hovered || expanded) {
      ctx.fillStyle = expanded ? 'rgba(212,168,90,0.16)' : 'rgba(255,225,150,0.1)';
      ctx.fillRect(x + 1, y + 1, w - 2, fullH - 3);
    }
    // selected → chalked outline glow
    if (expanded) {
      ctx.strokeStyle = 'rgba(235,225,200,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x + 2.5, y + 2.5, w - 5, fullH - 6);
      ctx.setLineDash([]);
    }
    // single nail pinning the paper at top-centre (clear of icon + price)
    nsNail(x + w / 2, y + Math.round(6 * us));
    // --- collapsed header content (always shown) ---
    var iconBox = rowH - Math.round(8 * us);
    var iconCX = x + Math.round(8 * us) + iconBox / 2;
    var iconCY = y + rowH / 2;
    // icon plate
    ctx.fillStyle = 'rgba(40,28,16,0.5)';
    ctx.fillRect(iconCX - iconBox / 2, iconCY - iconBox / 2, iconBox, iconBox);
    nsDrawGoodIcon(g.iconKind, iconCX, iconCY, iconBox * 0.92);
    // name (left of centre, vertically near the top)
    var nameX = iconCX + iconBox / 2 + Math.round(8 * us);
    var npx = Math.round(9.5 * us);
    nsText(g.name, nameX, y + Math.round(9 * us), npx, '#2a1c0c');
    // owned count
    var ownStr = 'OWNED  x' + owned;
    nsText(ownStr, nameX, y + Math.round(9 * us) + npx + Math.round(5 * us),
           Math.round(7.5 * us), owned > 0 ? '#3a6a30' : '#8a7048');
    // prices on the right — buy (gold) over sell (dim). Inset from the
    // edge so they clear the corner nail + the scrollbar gutter.
    var rollA = nsBoardRollFx[g.key] && nsBoardRollFx[g.key] > 0;
    var priceX = x + w - Math.round(14 * us);
    var ppx = Math.round(9 * us);
    var buyStr = '$' + nsBuyPrice(g).toLocaleString();
    var sellStr = '$' + nsSellPrice(g).toLocaleString();
    var rollJit = rollA ? Math.round((Math.random() - 0.5) * 2) : 0;
    nsText('BUY ' + buyStr, priceX, y + Math.round(9 * us) + rollJit, ppx,
           rollA ? '#fff0b0' : '#7a4e1a', 'right');
    nsText('SELL ' + sellStr, priceX, y + Math.round(9 * us) + ppx + Math.round(5 * us),
           Math.round(7.5 * us), '#8a6a3a', 'right');
    // honest market delta: where this town's price sits vs the good's standard
    // price. Up = dear here (a place to sell), down = cheap here (a place to
    // buy). Colour matches the matching action (amber sell, green buy).
    var mpct = nsMarketPct(g);
    if (mpct !== 0) {
      var dCol = mpct > 0 ? '#caa050' : '#5fb070';
      var dpx = Math.round(7 * us);
      var dYn = y + Math.round(9 * us) + ppx + Math.round(5 * us) + Math.round(7.5 * us) + Math.round(2 * us);
      var dStr = (mpct > 0 ? '+' : '') + mpct + '%';
      var dWid = nsTextW(dStr, dpx);
      var triS = Math.round(2.5 * us);
      var triX = priceX - dWid - Math.round(6 * us);
      var triCY = dYn + dpx / 2;
      ctx.fillStyle = dCol;
      ctx.beginPath();
      if (mpct > 0) { ctx.moveTo(triX, triCY + triS); ctx.lineTo(triX + triS, triCY - triS); ctx.lineTo(triX + 2 * triS, triCY + triS); }
      else { ctx.moveTo(triX, triCY - triS); ctx.lineTo(triX + triS, triCY + triS); ctx.lineTo(triX + 2 * triS, triCY - triS); }
      ctx.closePath();
      ctx.fill();
      nsText(dStr, priceX, dYn, dpx, dCol, 'right');
    }

    // "TRADED" stamp fading over the row
    for (var st = 0; st < nsBoardStamps.length; st++) {
      if (nsBoardStamps[st].key !== g.key) continue;
      var sa = nsBoardStamps[st].t;
      var sAlpha = Math.min(1, sa * 2);
      var sScale = 1 + (1 - sa) * 0.3;
      ctx.save();
      ctx.globalAlpha = sAlpha * 0.85;
      ctx.translate(x + w * 0.5, y + rowH * 0.5);
      ctx.rotate(-0.22);
      ctx.scale(sScale, sScale);
      var stpx = Math.round(15 * us);
      var stw = nsTextW('TRADED', stpx);
      ctx.strokeStyle = '#9a2018';
      ctx.lineWidth = 2;
      ctx.strokeRect(-stw / 2 - 6, -stpx / 2 - 4, stw + 12, stpx + 8);
      nsText('TRADED', -stw / 2, -stpx / 2, stpx, '#9a2018');
      ctx.restore();
    }

    // register the row click target (collapsed header height)
    NS_HIT.push({ kind: 'boardrow', id: g.key, x: x, y: y, w: w, h: rowH });

    // --- expanded detail panel ---
    if (expanded) {
      var dY = y + rowH + Math.round(4 * us);
      var dH = fullH - rowH - Math.round(8 * us);
      var dX = x + Math.round(8 * us), dW = w - Math.round(16 * us);
      // inset parchment shadow
      ctx.fillStyle = 'rgba(120,90,46,0.25)';
      ctx.fillRect(dX, dY, dW, dH);
      // flavor text (word-wrapped)
      var fpx = Math.round(7.5 * us);
      nsWrapText(g.flavor, dX + Math.round(4 * us), dY + Math.round(4 * us),
                 dW - Math.round(8 * us), fpx + Math.round(3 * us), fpx, '#4a3420', 2);
      // cross-town telegraph quotes (the spatial information layer)
      nsDrawCrossTownQuotes(g, dX + Math.round(4 * us), dY + Math.round(30 * us), dW - Math.round(8 * us), M);
      // quantity selector + buy/sell — laid out responsively
      var ctrlY = dY + dH - Math.round(48 * us);
      nsDrawBoardControls(g, dX, ctrlY, dW, Math.round(46 * us), M);
    }
    ctx.restore();
  }

  // Telegraph: the selected good's SELL price in every town (the wire brings
  // quotes from afar). Marks the town you are in and the best place to sell,
  // plus the best route. The information layer of the spatial trade loop: you
  // see where a good is dear before you can haul it there.
  function nsDrawCrossTownQuotes(g, x, y, w, M) {
    var us = M.us;
    var st = nsMarketEnsure();
    if (!st) return;
    var cur = nsMarketTown();
    var hpx = Math.round(6.5 * us);
    nsText('ON THE WIRE  -  SELLS FOR, BY TOWN', x, y, hpx, 'rgba(150,170,160,0.7)', 'left');
    var sells = [], bestT = 0, bestV = -1;
    for (var t = 0; t < MARKET.TOWNS.length; t++) {
      var sv = marketModel.sellPrice(st, t, g);
      sells.push(sv);
      if (sv > bestV) { bestV = sv; bestT = t; }
    }
    var gridY = y + hpx + Math.round(5 * us);
    var cellW = w / 2;
    var cellH = Math.round(10 * us);
    var qpx = Math.round(7 * us);
    for (var i = 0; i < MARKET.TOWNS.length; i++) {
      var cx0 = x + (i % 2) * cellW;
      var cy0 = gridY + Math.floor(i / 2) * cellH;
      var c2 = (i === bestT) ? '#caa050' : ((i === cur) ? '#cfe0e8' : '#8a9a92');
      nsText((i === cur ? '> ' : '') + MARKET.TOWNS[i].split(' ')[0] + ' $' + sells[i], cx0, cy0, qpx, c2, 'left');
    }
    var hintY = gridY + 2 * cellH + Math.round(3 * us);
    nsText('best sold at ' + MARKET.TOWNS[bestT].split(' ')[0], x, hintY, hpx, 'rgba(202,160,80,0.75)', 'left');
  }

  // Quantity chips (1/10/100/MAX) + BUY / SELL buttons.
  function nsDrawBoardControls(g, x, y, w, h, M) {
    var us = M.us;
    var owned = nsTradeCount(g.key);
    // Row 1: quantity chips
    var qtys = [1, 10, 100, 'MAX'];
    var chipGap = Math.round(4 * us);
    var chipW = (w - chipGap * 3) / 4;
    var chipH = Math.round(18 * us);
    for (var i = 0; i < 4; i++) {
      var cx0 = x + i * (chipW + chipGap);
      var sel = (nsBoardQty === qtys[i]);
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(cx0 - 1, y - 1, chipW + 2, chipH + 2);
      ctx.fillStyle = sel ? '#d4a838' : '#3a2c1c';
      ctx.fillRect(cx0, y, chipW, chipH);
      if (sel) {
        ctx.fillStyle = '#ffe79a';
        ctx.fillRect(cx0, y, chipW, 2);
      }
      var qlbl = '' + qtys[i];
      nsText(qlbl, cx0 + chipW / 2, y + (chipH - Math.round(7.5 * us)) / 2,
             Math.round(7.5 * us), sel ? '#241608' : '#b89868', 'center');
      NS_HIT.push({ kind: 'boardbtn', id: 'qty:' + qtys[i], x: cx0, y: y, w: chipW, h: chipH });
    }
    // Row 2: BUY / SELL big buttons
    var btnY = y + chipH + Math.round(5 * us);
    var btnH = h - chipH - Math.round(5 * us);
    var btnGap = Math.round(6 * us);
    var btnW = (w - btnGap) / 2;
    // BUY
    var buyQ = nsBoardTradeQty(g, false);
    var unitBuy = nsBuyPrice(g);
    var buyCost = buyQ * unitBuy;
    var canBuy = devMode || (money >= unitBuy && buyQ > 0);
    nsDrawBoardActionBtn(x, btnY, btnW, btnH, 'BUY', canBuy ? '$' + buyCost.toLocaleString() : 'NO FUNDS',
                         canBuy, '#3f7a4a', '#5fb070', us);
    NS_HIT.push({ kind: 'boardbtn', id: 'buy:' + g.key, x: x, y: btnY, w: btnW, h: btnH });
    // SELL
    var sellQ = nsBoardTradeQty(g, true);
    var canSell = owned > 0;
    var sellGain = Math.min(sellQ, owned) * nsSellPrice(g);
    nsDrawBoardActionBtn(x + btnW + btnGap, btnY, btnW, btnH, 'SELL',
                         canSell ? '+$' + sellGain.toLocaleString() : 'NONE',
                         canSell, '#9a6a2a', '#caa050', us);
    NS_HIT.push({ kind: 'boardbtn', id: 'sell:' + g.key, x: x + btnW + btnGap, y: btnY, w: btnW, h: btnH });
  }
  function nsDrawBoardActionBtn(x, y, w, h, label, sub, enabled, base, hi, us) {
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = enabled ? base : '#3a352f';
    ctx.fillRect(x, y, w, h);
    if (enabled) {
      ctx.fillStyle = hi;
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + h - 3, w, 3);
    }
    var lpx = Math.round(10 * us);
    var col = enabled ? '#fff4d8' : '#7d756a';
    nsText(label, x + w / 2, y + Math.round(4 * us), lpx, col, 'center');
    nsText(sub, x + w / 2, y + Math.round(4 * us) + lpx + Math.round(2 * us),
           Math.round(7 * us), enabled ? 'rgba(255,255,255,0.7)' : '#6a635a', 'center');
  }

  // Word-wrap helper for flavor / notice body text.
  function nsWrapText(str, x, y, maxW, lineH, px, color, maxLines) {
    var words = ('' + str).split(' ');
    var line = '';
    var ly = y;
    var lines = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (nsTextW(test, px) > maxW && line) {
        nsText(line, x, ly, px, color);
        line = words[i];
        ly += lineH;
        lines++;
        if (maxLines && lines >= maxLines) { line = ''; break; }
      } else {
        line = test;
      }
    }
    if (line) { nsText(line, x, ly, px, color); ly += lineH; }
    return ly;
  }

  // ---- Board notices panel ---------------------------------------------
  function nsDrawBoardNotices(rect, M) {
    var us = M.us;
    nsWoodBacking(rect.x, rect.y, rect.w, rect.h, NS_STATION_INFO.board);
    var hdrH = Math.round(24 * us);
    var inX = rect.x + Math.round(8 * us), inW = rect.w - Math.round(16 * us);
    nsChalkboard(inX, rect.y + Math.round(8 * us), inW, hdrH);
    nsChalkText('TOWN  NOTICES', inX + inW / 2, rect.y + Math.round(8 * us) + hdrH / 2 - Math.round(5 * us),
                Math.round(9.5 * us), 'center');
    var nY = rect.y + Math.round(8 * us) + hdrH + Math.round(8 * us);
    var avail = rect.y + rect.h - nY - Math.round(8 * us);
    var noticeGap = Math.round(8 * us);
    var bpx = Math.round(7 * us);
    var lineH = bpx + Math.round(3 * us);
    var hpx = Math.round(8.5 * us);
    // A notice needs: top pad + header tab + 2 body lines + bottom pad.
    var minNoticeH = Math.round(10 * us) + hpx + Math.round(8 * us) + lineH * 2 + Math.round(6 * us);
    // Show as many of the picked notices as actually fit (2-3 → maybe 2).
    var fit = Math.max(1, Math.floor((avail + noticeGap) / (minNoticeH + noticeGap)));
    var show = Math.min(nsBoardNoticeIdx.length, fit);
    var noticeH = (avail - noticeGap * (show - 1)) / show;
    for (var i = 0; i < show; i++) {
      var nt = NS_BOARD_NOTICES[nsBoardNoticeIdx[i]];
      var ny = nY + i * (noticeH + noticeGap);
      // gentle flutter
      var flut = Math.sin(nsRoomT * 1.3 + i * 1.7) * 1.4 * us;
      ctx.save();
      ctx.translate(0, flut);
      nsPaper(inX, ny, inW, noticeH, 20 + i * 7);
      nsNail(inX + inW / 2, ny + Math.round(6 * us));
      // clip so nothing bleeds past this paper card
      ctx.beginPath();
      ctx.rect(inX, ny, inW, noticeH);
      ctx.clip();
      // header tab
      ctx.fillStyle = '#9a2018';
      var htw = nsTextW(nt.head, hpx) + Math.round(8 * us);
      ctx.fillRect(inX + Math.round(6 * us), ny + Math.round(10 * us), htw, hpx + Math.round(4 * us));
      nsText(nt.head, inX + Math.round(10 * us), ny + Math.round(12 * us), hpx, '#f4e2c0');
      // body — clamp lines to what fits in this card
      var bodyTop = ny + Math.round(10 * us) + hpx + Math.round(8 * us);
      var bodyMax = Math.max(1, Math.floor((ny + noticeH - Math.round(6 * us) - bodyTop) / lineH));
      nsWrapText(nt.body, inX + Math.round(7 * us), bodyTop,
                 inW - Math.round(14 * us), lineH, bpx, '#4a3622', bodyMax);
      ctx.restore();
    }
  }

  // ---- Telegraph-tape ticker -------------------------------------------
  function nsDrawBoardTicker(rect, M) {
    var us = M.us;
    // brass tray
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
    ctx.fillStyle = '#3a2c1a';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    // paper tape inset
    var tapeY = rect.y + Math.round(3 * us), tapeH = rect.h - Math.round(6 * us);
    ctx.fillStyle = '#e7d6a4';
    ctx.fillRect(rect.x + Math.round(3 * us), tapeY, rect.w - Math.round(6 * us), tapeH);
    ctx.fillStyle = 'rgba(120,90,46,0.2)';
    ctx.fillRect(rect.x + Math.round(3 * us), tapeY, rect.w - Math.round(6 * us), 1);
    ctx.fillRect(rect.x + Math.round(3 * us), tapeY + tapeH - 1, rect.w - Math.round(6 * us), 1);
    // scrolling text, clipped
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x + Math.round(4 * us), tapeY, rect.w - Math.round(8 * us), tapeH);
    ctx.clip();
    var tpx = Math.round(8 * us);
    var fullW = nsTextW(nsTickerText, tpx);
    if (fullW < 1) fullW = 1;
    var off = nsBoardTickT % fullW;
    var tx = rect.x + Math.round(6 * us) - off;
    var ty = tapeY + (tapeH - tpx) / 2;
    // draw twice for seamless wrap
    nsText(nsTickerText, tx, ty, tpx, '#5a4220');
    nsText(nsTickerText, tx + fullW, ty, tpx, '#5a4220');
    ctx.restore();
    // "TELEGRAPH" tag at the left
    var tagW = Math.round(56 * us);
    ctx.fillStyle = '#9a2018';
    ctx.fillRect(rect.x, rect.y, tagW, rect.h);
    ctx.fillStyle = '#7a1610';
    ctx.fillRect(rect.x, rect.y + rect.h - 2, tagW, 2);
    nsText('WIRE', rect.x + tagW / 2, rect.y + (rect.h - Math.round(8 * us)) / 2,
           Math.round(8 * us), '#f4e2c0', 'center');
  }

  // ---- Board pointer ----------------------------------------------------
  function nsBoardPointerDown(x, y, hit, id) {
    // begin a drag (for the market list) — only inside the market rect
    var M = nsMetrics();
    var lay = nsBoardLayout(M);
    var mk = lay.market;
    if (x >= mk.x && x <= mk.x + mk.w && y >= mk.y && y <= mk.y + mk.h) {
      nsDrag.active = true;
      nsDrag.id = (id === undefined) ? 'mouse' : id;
      nsDrag.startY = y;
      nsDrag.startScroll = nsBoardScroll;
      nsDrag.moved = 0;
    }
    if (!hit) { nsDrag.pendingRow = null; return true; }
    if (hit.kind === 'boardrow') {
      // Defer the expand-toggle to pointer-up so a scroll-drag that
      // begins on a row doesn't accidentally collapse/expand it.
      nsDrag.pendingRow = hit.id;
      return true;
    }
    nsDrag.pendingRow = null;
    if (hit.kind === 'boardbtn') {
      var parts = hit.id.split(':');
      if (parts[0] === 'qty') {
        nsBoardQty = (parts[1] === 'MAX') ? 'MAX' : parseInt(parts[1], 10);
        return true;
      }
      var good = null;
      for (var i = 0; i < NS_BOARD_GOODS.length; i++) {
        if (NS_BOARD_GOODS[i].key === parts[1]) { good = NS_BOARD_GOODS[i]; break; }
      }
      if (good) {
        nsBoardDoTrade(good, { x: hit.x, y: hit.y - hit.h, w: hit.w, h: hit.h }, parts[0] === 'sell');
      }
      return true;
    }
    return true;
  }
  // touch drag-start needs to set the touch id, so override via newShopPointerDown
  // path: nsBoardPointerDown is called with hit from any pointer; the drag id
  // is recorded as 'mouse' by default and fixed up for touch in the dispatcher.

