  function computeShopLayout() {
    var L = SHOP_LAYOUT;
    L.boxW = Math.min(440, viewW - 32);
    L.boxX = (viewW - L.boxW) / 2;
    var itemsCount = (typeof shopItems !== 'undefined' && shopItems.length) ? shopItems.length : 7;
    var headerH = 90;
    var actionsH = 62;          // sell button (38) + pump-pad hint (24)
    var footerH = 30;
    // Box height is capped at the viewport (less a small margin) — the
    // items area inside becomes a clipped, scrollable viewport. We pick a
    // comfortable per-item height (compact on mobile / tight viewports)
    // and then derive the visible viewport region from whatever's left.
    var maxBoxH = viewH - 24;
    L.itemH = isMobile ? 54 : 58;
    L.boxH = Math.min(maxBoxH,
                      headerH + actionsH + itemsCount * L.itemH + footerH);
    L.boxY = (viewH - L.boxH) / 2;
    if (L.boxY < 12) L.boxY = 12;

    // Items viewport — the rectangle inside the panel that the scrollable
    // item list occupies. Set after we draw the title/sell area, but the
    // height we can solve for here.
    L.itemsViewportH = L.boxH - headerH - actionsH - footerH;
    L.itemsContentH = itemsCount * L.itemH;
    L.scrollMax = Math.max(0, L.itemsContentH - L.itemsViewportH);
    // Clamp existing scroll position into the new range (e.g. after items
    // were added/removed via a purchase).
    if (shopScroll < 0) shopScroll = 0;
    if (shopScroll > L.scrollMax) shopScroll = L.scrollMax;
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
    for (var ci = 0; ci < cargo.length; ci++) sellVal += cargoUnitValue(cargo[ci]);
    var oilSellVal = Math.floor(oilGallons * LIQUID_OIL_VALUE);
    sellVal += oilSellVal;
    var canSell = sellVal > 0;
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

    // ---- Upgrade items (scrollable viewport) ----
    L.itemsStartY = cy;
    var iconColors = {
      drill:  '#cccccc',
      fuel:   '#56c876',
      hull:   '#5aa3ff',
      cargo:  '#FFD27A',
      heat:   '#ff7a3a',
      shield: '#a87bff',
      vert:   '#9bdcff',
      pump:   '#d9b46a',
      teleporter: '#c8a4ff',
      balloon: '#ff9090',
      bombSmall: '#e84a3a',
      bombLarge: '#ff8a2a',
      reserveFuel: '#e0a838'
    };
    var compactMode = L.itemH < 56;
    var iconSize = compactMode ? 26 : 34;
    var cardInner = L.itemH - 10;

    // Viewport rect — items are clipped to this region and drawn with the
    // scroll offset applied. Scroll is in CSS pixels; positive = scrolled
    // down (later items become visible).
    var viewportY = L.itemsStartY;
    var viewportH = L.itemsViewportH;
    // Side padding for the items so cards don't touch the scrollbar gutter.
    var contentLeftPad = 16;
    var contentRightPad = (L.scrollMax > 0) ? 22 : 16;     // leave room for scrollbar when needed

    ctx.save();
    // Clip to the items viewport so cards that scroll out of view get
    // cropped cleanly at the panel edge instead of bleeding into the
    // header/footer.
    ctx.beginPath();
    ctx.rect(L.boxX, viewportY, L.boxW, viewportH);
    ctx.clip();

    for (var i = 0; i < shopItems.length; i++) {
      var item = shopItems[i];
      var lvl = item.level;
      // Consumables never max out — always purchasable while you can pay.
      var maxed = item.consumable ? (!!item.maxCount && lvl >= item.maxCount) : lvl >= item.costs.length;
      var cost = item.consumable ? item.costs[0] : (maxed ? 0 : item.costs[lvl]);
      var canBuy = !maxed && (devMode || money >= cost);

      // Apply scroll offset
      var iy = viewportY + i * L.itemH - shopScroll;

      // Skip cards entirely outside the viewport — they're clipped anyway,
      // but skipping spares us a bunch of canvas state changes per frame.
      if (iy + cardInner < viewportY - 4) continue;
      if (iy > viewportY + viewportH + 4) break;

      // Item card
      var cardLeft = L.boxX + contentLeftPad;
      var cardWidth = L.boxW - contentLeftPad - contentRightPad;
      var cardGrad = ctx.createLinearGradient(0, iy, 0, iy + cardInner);
      cardGrad.addColorStop(0, canBuy ? '#2c2620' : '#1f1c18');
      cardGrad.addColorStop(1, canBuy ? '#221d18' : '#181612');
      ctx.fillStyle = cardGrad;
      roundRect(ctx, cardLeft, iy, cardWidth, cardInner, 6, true);
      ctx.strokeStyle = canBuy ? 'rgba(255,210,120,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      roundRect(ctx, cardLeft, iy, cardWidth, cardInner, 6, false, true);

      // Icon block — colored backing tile + custom-drawn icon on top
      var iconX = cardLeft + 8;
      var iconY = iy + (cardInner - iconSize) / 2;
      ctx.fillStyle = iconColors[item.key] || '#888';
      roundRect(ctx, iconX, iconY, iconSize, iconSize, 4, true);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(iconX, iconY + iconSize - 3, iconSize, 3);
      // Custom icon — distinct silhouettes for each item, especially the
      // two bomb types (the original both-circle glyphs were identical).
      drawShopItemIcon(item.key, iconX, iconY, iconSize);

      // Item title — for special binary items like heat, show "Owned" instead of Lv
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
      } else if (item.key === 'pump') {
        titleSuffix = upgrades.pumpLevel > 0 ? ' · Mk ' + upgrades.pumpLevel : '';
      } else if (item.consumable) {
        var consumableCount;
        if (item.key === 'balloon') consumableCount = balloons;
        else if (item.key === 'bombSmall') consumableCount = bombsSmall;
        else if (item.key === 'bombLarge') consumableCount = bombsLarge;
        else if (item.key === 'reserveFuel') consumableCount = reserveFuel;
        else consumableCount = teleporters;
        titleSuffix = consumableCount > 0 ? ' · ×' + consumableCount : '';
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
      var pillX = cardLeft + cardWidth - 8;
      var pillY = iy + (cardInner - 22) / 2;
      var pillText, pillBg, pillFg;
      if (maxed) {
        pillText = (item.key === 'heat' || item.key === 'vert') ? 'INSTALLED' : 'MAX';
        pillBg = 'rgba(120,200,140,0.18)';
        pillFg = '#9be6b1';
      } else if (canBuy) {
        pillText = devMode ? 'FREE' : '$' + cost.toLocaleString();
        pillBg = devMode ? 'rgba(120,200,255,0.18)' : 'rgba(255,215,0,0.16)';
        pillFg = devMode ? '#9bdcff' : '#FFD700';
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
    }
    ctx.restore();    // end clip

    // ---- Soft top/bottom fade-out gradients inside the viewport ----
    // Visual cue that there's more content above/below when the list is
    // scrolled. Drawn after the clipped items so they overlay the cards.
    if (L.scrollMax > 0) {
      if (shopScroll > 1) {
        var topFade = ctx.createLinearGradient(0, viewportY, 0, viewportY + 16);
        topFade.addColorStop(0, 'rgba(21,16,11,0.95)');
        topFade.addColorStop(1, 'rgba(21,16,11,0)');
        ctx.fillStyle = topFade;
        ctx.fillRect(L.boxX + 1, viewportY, L.boxW - 2, 16);
      }
      if (shopScroll < L.scrollMax - 1) {
        var botFade = ctx.createLinearGradient(0, viewportY + viewportH - 16, 0, viewportY + viewportH);
        botFade.addColorStop(0, 'rgba(21,16,11,0)');
        botFade.addColorStop(1, 'rgba(21,16,11,0.95)');
        ctx.fillStyle = botFade;
        ctx.fillRect(L.boxX + 1, viewportY + viewportH - 16, L.boxW - 2, 16);
      }
    }

    // ---- Scrollbar (right gutter) ----
    // Drawn only when the content overflows. Track is a thin vertical pill,
    // thumb height is proportional to the visible fraction of the content.
    if (L.scrollMax > 0) {
      var sbX = L.boxX + L.boxW - 12;
      var sbW = 5;
      var sbY = viewportY + 4;
      var sbH = viewportH - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, sbX, sbY, sbW, sbH, sbW / 2, true);
      var thumbH = Math.max(28, sbH * (viewportH / L.itemsContentH));
      var scrollFrac = shopScroll / L.scrollMax;
      var thumbY = sbY + (sbH - thumbH) * scrollFrac;
      ctx.fillStyle = 'rgba(255,210,120,0.55)';
      roundRect(ctx, sbX, thumbY, sbW, thumbH, sbW / 2, true);
      // Stash for hit-testing
      L._sbX = sbX; L._sbY = sbY; L._sbW = sbW; L._sbH = sbH;
      L._sbThumbY = thumbY; L._sbThumbH = thumbH;
    } else {
      L._sbW = 0;
    }

    // Footer hint
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6a604c';
    ctx.font = '11px ' + UI_FONT;
    ctx.fillText(isMobile ? 'Tap outside to close' : 'Click outside or press [E] / [Esc] to close',
                 viewW / 2, L.boxY + L.boxH - 14);
    ctx.textAlign = 'left';
  }

  // Draw a small in-card icon for a shop item. Each icon is drawn with
  // canvas primitives (no bitmap fonts) so they stay crisp at any DPR and
  // — importantly — the two bomb types look obviously different. The
  // backing color tile is already drawn by the caller; we draw on top.
  function drawShopItemIcon(key, x, y, size) {
    var cx = x + size / 2;
    var cy = y + size / 2;
    var s = size;          // shorthand
    var ink = '#1a1208';   // dark "engraved" line color used by all icons

    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (key === 'drill') {
      // Drill bit — chevron + shaft
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.32);
      ctx.lineTo(cx - s * 0.18, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.18, cy - s * 0.18);
      ctx.lineTo(cx + s * 0.18, cy - s * 0.18);
      ctx.lineTo(cx + s * 0.18, cy + s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - s * 0.06, cy - s * 0.36, s * 0.12, s * 0.18);
    } else if (key === 'fuel') {
      // Fuel can with handle
      var canX = cx - s * 0.22, canY = cy - s * 0.24;
      var canW = s * 0.36, canH = s * 0.48;
      ctx.fillRect(canX, canY + s * 0.04, canW, canH - s * 0.04);
      // Spout
      ctx.fillRect(canX + canW - s * 0.02, canY - s * 0.04, s * 0.18, s * 0.10);
      // Handle
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.arc(canX + canW * 0.5, canY, s * 0.10, Math.PI, 2 * Math.PI);
      ctx.stroke();
    } else if (key === 'reserveFuel') {
      // Fuel can + a plus — a spare, stockable canister.
      var rcX = cx - s * 0.36, rcY = cy - s * 0.18;
      var rcW = s * 0.32, rcH = s * 0.42;
      ctx.fillRect(rcX, rcY + s * 0.04, rcW, rcH - s * 0.04);
      ctx.fillRect(rcX + rcW - s * 0.02, rcY, s * 0.13, s * 0.085);
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.arc(rcX + rcW * 0.5, rcY + s * 0.04, s * 0.08, Math.PI, 2 * Math.PI);
      ctx.stroke();
      var pcx = cx + s * 0.22, pcy = cy + s * 0.06;
      var pa = s * 0.14, pt = s * 0.09;
      ctx.fillRect(pcx - pa, pcy - pt / 2, pa * 2, pt);
      ctx.fillRect(pcx - pt / 2, pcy - pa, pt, pa * 2);
    } else if (key === 'hull') {
      // Shield-like crest
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.32);
      ctx.lineTo(cx + s * 0.28, cy - s * 0.18);
      ctx.lineTo(cx + s * 0.22, cy + s * 0.16);
      ctx.lineTo(cx, cy + s * 0.32);
      ctx.lineTo(cx - s * 0.22, cy + s * 0.16);
      ctx.lineTo(cx - s * 0.28, cy - s * 0.18);
      ctx.closePath();
      ctx.fill();
    } else if (key === 'cargo') {
      // Crate with strap
      var crX = cx - s * 0.28, crY = cy - s * 0.24;
      ctx.fillRect(crX, crY, s * 0.56, s * 0.48);
      // Cut a thin "strap" gap by overpainting in the backing color
      // (we don't know the backing color here, so use a transparent
      // multiply: pick a dimmed ink instead — looks like an inset line)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(crX, cy - s * 0.04, s * 0.56, s * 0.08);
      ctx.fillRect(cx - s * 0.04, crY, s * 0.08, s * 0.48);
    } else if (key === 'heat') {
      // Three rising heat waves
      ctx.lineWidth = s * 0.08;
      for (var hi = 0; hi < 3; hi++) {
        var hy = cy + s * 0.18 - hi * s * 0.16;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.24, hy);
        ctx.quadraticCurveTo(cx - s * 0.06, hy - s * 0.10, cx, hy);
        ctx.quadraticCurveTo(cx + s * 0.06, hy + s * 0.10, cx + s * 0.24, hy);
        ctx.stroke();
      }
    } else if (key === 'shield') {
      // Shield outline + cross-band
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.30);
      ctx.lineTo(cx + s * 0.26, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.20, cy + s * 0.20);
      ctx.lineTo(cx, cy + s * 0.30);
      ctx.lineTo(cx - s * 0.20, cy + s * 0.20);
      ctx.lineTo(cx - s * 0.26, cy - s * 0.16);
      ctx.closePath();
      ctx.stroke();
      ctx.fillRect(cx - s * 0.20, cy - s * 0.04, s * 0.40, s * 0.08);
    } else if (key === 'vert') {
      // Up-arrow (vertical drill)
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.30);
      ctx.lineTo(cx + s * 0.22, cy);
      ctx.lineTo(cx + s * 0.10, cy);
      ctx.lineTo(cx + s * 0.10, cy + s * 0.28);
      ctx.lineTo(cx - s * 0.10, cy + s * 0.28);
      ctx.lineTo(cx - s * 0.10, cy);
      ctx.lineTo(cx - s * 0.22, cy);
      ctx.closePath();
      ctx.fill();
    } else if (key === 'pump') {
      // Pump intake: hose curl + droplet
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(cx - s * 0.08, cy, s * 0.20, Math.PI * 0.15, Math.PI * 1.65);
      ctx.lineTo(cx + s * 0.22, cy - s * 0.12);
      ctx.stroke();
      ctx.fillRect(cx + s * 0.18, cy - s * 0.20, s * 0.14, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.02, cy + s * 0.06);
      ctx.quadraticCurveTo(cx + s * 0.18, cy + s * 0.20, cx + s * 0.03, cy + s * 0.34);
      ctx.quadraticCurveTo(cx - s * 0.12, cy + s * 0.20, cx + s * 0.02, cy + s * 0.06);
      ctx.fill();
    } else if (key === 'teleporter') {
      // Concentric portal rings + center dot
      ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'balloon') {
      // Three balloons
      ctx.beginPath(); ctx.arc(cx - s * 0.14, cy - s * 0.06, s * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.14, cy - s * 0.06, s * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx,             cy + s * 0.10, s * 0.13, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'bombSmall') {
      // STICK OF DYNAMITE — vertical red rectangle look (stays dark on the
      // backing tile since we draw with `ink`, but the silhouette reads
      // unmistakably as TNT thanks to the tall rectangle + fuse + spark).
      var dynW = s * 0.28;
      var dynH = s * 0.48;
      var dynX = cx - dynW / 2;
      var dynY = cy - dynH / 2 + s * 0.06;
      // Body
      ctx.fillRect(dynX, dynY, dynW, dynH);
      // Caps (lighter band top + bottom for the "TNT" label area)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(dynX, dynY + dynH * 0.32, dynW, dynH * 0.18);
      ctx.fillStyle = ink;
      // Fuse — short curved line out the top
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx, dynY);
      ctx.quadraticCurveTo(cx + s * 0.08, dynY - s * 0.12, cx + s * 0.14, dynY - s * 0.18);
      ctx.stroke();
      // Spark at fuse tip
      ctx.fillStyle = '#FFE08A';
      ctx.beginPath();
      ctx.arc(cx + s * 0.14, dynY - s * 0.18, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
    } else if (key === 'bombLarge') {
      // CLASSIC ROUND BOMB with X-marker (3×3 blast hint) — circular body,
      // fuse, spark. Visually distinct from the dynamite stick.
      var br = s * 0.28;
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.04, br, 0, Math.PI * 2);
      ctx.fill();
      // X-marker (the "3×3" blast hint) — drawn in the backing tile
      // color via a translucent overlay so it reads against the dark body.
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.10, cy - s * 0.04);
      ctx.lineTo(cx + s * 0.10, cy + s * 0.12);
      ctx.moveTo(cx + s * 0.10, cy - s * 0.04);
      ctx.lineTo(cx - s * 0.10, cy + s * 0.12);
      ctx.stroke();
      // Fuse + spark
      ctx.strokeStyle = ink;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.10, cy - br + s * 0.06);
      ctx.quadraticCurveTo(cx + s * 0.20, cy - br - s * 0.06, cx + s * 0.26, cy - br - s * 0.12);
      ctx.stroke();
      ctx.fillStyle = '#FFE08A';
      ctx.beginPath();
      ctx.arc(cx + s * 0.26, cy - br - s * 0.12, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Fallback dot
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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

