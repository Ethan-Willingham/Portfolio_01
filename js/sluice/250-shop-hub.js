  // ====================================================================
  //  HUB — three stations, each with a unique identity + idle animation.
  // ====================================================================
  // Returns the three station rects + the leave rect, laid out responsively:
  // a row on landscape/desktop, a column on a portrait phone.
  function nsHubLayout(M) {
    var us = M.us;
    var areaTop = M.headerBottom + Math.round(10 * us);
    var areaH = M.bottom - areaTop - M.pad;
    var gap = Math.round(14 * us);
    // Trade Board hidden, but the cards keep the ORIGINAL 3-slot size so dropping it
    // never stretches Workshop + Shelf (a stretch spreads their gradients and reads
    // as a colour shift). Workshop + Shelf stay byte-identical to the original; the
    // Board slot just goes empty.
    var stations;
    if (M.portrait) {
      // Column: stacked station cards filling the content area.
      var colTop = areaTop;
      var colH = (areaH - gap * 2) / 3;
      var colW = M.cw;
      stations = [
        { id: 'workshop', x: M.cx, y: colTop, w: colW, h: colH },
        { id: 'shelf',    x: M.cx, y: colTop + (colH + gap), w: colW, h: colH }
      ];
      if (ENABLE_TRADE_BOARD) stations.push({ id: 'board', x: M.cx, y: colTop + (colH + gap) * 2, w: colW, h: colH });
      return { stations: stations };
    }
    // Landscape / desktop: side-by-side cards filling the content area.
    var rowH = areaH;
    var sw = (M.cw - gap * 2) / 3;
    stations = [
      { id: 'workshop', x: M.cx, y: areaTop, w: sw, h: rowH },
      { id: 'shelf',    x: M.cx + (sw + gap), y: areaTop, w: sw, h: rowH }
    ];
    if (ENABLE_TRADE_BOARD) stations.push({ id: 'board', x: M.cx + (sw + gap) * 2, y: areaTop, w: sw, h: rowH });
    return { stations: stations };
  }

  function newShopDrawHub(M) {
    var us = M.us;
    // Backdrop — warm dim interior with a soft vignette + lamp flicker.
    var flick = 0.92 + 0.08 * Math.sin(nsRoomT * 7.3) * Math.sin(nsRoomT * 2.1);
    var bgGrad = ctx.createRadialGradient(viewW / 2, M.bottom * 0.36, 40,
                                          viewW / 2, M.bottom * 0.5, Math.max(viewW, M.bottom) * 0.75);
    bgGrad.addColorStop(0, 'rgba(58,44,30,' + (0.96).toFixed(2) + ')');
    bgGrad.addColorStop(1, '#140f0a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, viewW, M.bottom);
    // Floor band
    ctx.fillStyle = '#241a12';
    ctx.fillRect(0, M.bottom - Math.round(40 * us), viewW, Math.round(40 * us));
    ctx.fillStyle = 'rgba(255,200,110,' + (0.05 * flick).toFixed(3) + ')';
    ctx.fillRect(0, M.bottom - Math.round(40 * us), viewW, 2);

    // Title banner + subtitle
    var ban = nsBanner(M, 'TRADING POST', '#7a2620');
    nsText('CHOOSE A COUNTER', viewW / 2, ban.bottom + Math.round(8 * us),
           Math.round(8 * us), '#9a8358', 'center');

    var lay = nsHubLayout(M);
    // Hover lift eases (drive off the actual station list, not a fixed 3)
    for (var e = 0; e < lay.stations.length; e++) {
      var ek = lay.stations[e].id;
      var tgt = (nsHubHover === ek) ? 1 : 0;
      nsHubLiftT[ek] = nsApproach(nsHubLiftT[ek], tgt, (1 / 60) / 0.13);
    }
    var hubEase = nsEaseOut(nsHubEnterT);
    for (var i = 0; i < lay.stations.length; i++) {
      var st = lay.stations[i];
      // Staggered entrance: each card drops in slightly after the last.
      var localT = Math.max(0, Math.min(1, (nsHubEnterT - i * 0.06) / 0.7));
      var le = nsEaseOut(localT);
      var slide = (1 - le) * 26 * us;
      ctx.save();
      ctx.globalAlpha = le;
      ctx.translate(0, slide);
      nsDrawStationCard(st, M, le);
      ctx.restore();
      NS_HIT.push({ kind: 'station', id: st.id, x: st.x, y: st.y, w: st.w, h: st.h });
    }
    // Hub hover particles + the money chip ride on top. The chip sits
    // top-right in the reserved header band, below the banner.
    nsDrawHubParticles();
    nsDrawMoneyChip(M.cx + M.cw, M.bannerBottom + Math.round(4 * us), us, 'right');
    // Persistent corner control — reads EXIT on the hub (leaves the shop).
    nsDrawBackArrow(M);
  }

  function nsDrawHubParticles() {
    for (var i = 0; i < nsHubParticles.length; i++) {
      var p = nsHubParticles[i];
      var a = Math.min(1, p.t / p.ttl * 1.6);
      if (p.kind === 'paper') {
        ctx.fillStyle = 'rgba(231,214,164,' + a.toFixed(3) + ')';
        ctx.fillRect(p.x, p.y, 3, 4);
      } else if (p.kind === 'spark') {
        ctx.fillStyle = 'rgba(255,' + (180 + Math.floor(60 * a)) + ',90,' + a.toFixed(3) + ')';
        ctx.fillRect(p.x, p.y, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(255,232,150,' + a.toFixed(3) + ')';
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.fillStyle = 'rgba(255,255,230,' + (a * 0.8).toFixed(3) + ')';
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }
  }

  // ---- Station card — distinct identity + idle anim + hover event ------
  var NS_STATION_INFO = {
    workshop: { title: 'WORKSHOP', tag: 'Upgrade your rig',  accent: '#c87a32', plate: '#3a2d20' },
    shelf:    { title: 'SUPPLIES', tag: 'Stock consumables', accent: '#3f8a55', plate: '#23332a' },
    board:    { title: 'TRADE BOARD', tag: 'Buy & sell goods', accent: '#b8923a', plate: '#34291a' }
  };
  function nsDrawStationCard(st, M, ease) {
    var us = M.us;
    var info = NS_STATION_INFO[st.id];
    var lift = nsHubLiftT[st.id] || 0;
    var hov = lift > 0.02;
    var liftPx = lift * 7 * us;
    var x = st.x, y = st.y - liftPx, w = st.w, h = st.h;

    // Hover glow halo behind the card
    if (lift > 0.01) {
      var hg = ctx.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, w * 0.72);
      hg.addColorStop(0, 'rgba(255,210,120,' + (0.3 * lift).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(x - 20, y - 20, w + 40, h + 40);
    }
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 4, y + 6 + liftPx, w, h);
    // Card body — riveted plate with the station's plate tint
    nsPanel(x, y, w, h, info.plate, '#544638', '#1c1611');
    // Inner warm rim light
    var rim = ctx.createLinearGradient(x, y, x, y + h);
    rim.addColorStop(0, 'rgba(255,205,120,' + (0.12 + 0.1 * lift).toFixed(3) + ')');
    rim.addColorStop(0.4, 'rgba(255,205,120,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    // Corner brass brackets
    drawBrassCornerL(x + 3, y + 3, false, false);
    drawBrassCornerL(x + w - 15, y + 3, true, false);
    drawBrassCornerL(x + 3, y + h - 15, false, true);
    drawBrassCornerL(x + w - 15, y + h - 15, true, true);

    // Identity stage — the upper ~58% of the card holds the signature art.
    var stageH = Math.round(h * 0.58);
    var stageCX = x + w / 2;
    var stageCY = y + Math.round(h * 0.30);
    // dark inset niche for the art
    var niX = x + Math.round(12 * us), niY = y + Math.round(10 * us);
    var niW = w - Math.round(24 * us), niH = stageH - Math.round(14 * us);
    ctx.fillStyle = '#120d09';
    ctx.fillRect(niX, niY, niW, niH);
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(niX + 2, niY + 2, niW - 4, niH - 4);
    // niche glow on hover
    if (lift > 0.01) {
      var ng = ctx.createRadialGradient(niX + niW / 2, niY + niH / 2, 6, niX + niW / 2, niY + niH / 2, niW * 0.62);
      ng.addColorStop(0, 'rgba(255,210,130,' + (0.26 * lift).toFixed(3) + ')');
      ng.addColorStop(1, 'rgba(255,210,130,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(niX + 2, niY + 2, niW - 4, niH - 4);
    }
    // Per-station signature scene
    var artCX = niX + niW / 2, artCY = niY + niH / 2;
    if (st.id === 'workshop') nsDrawWorkshopIdentity(artCX, artCY, niW, niH, us, lift);
    else if (st.id === 'shelf') nsDrawShelfIdentity(artCX, artCY, niW, niH, us, lift);
    else nsDrawBoardIdentity(artCX, artCY, niW, niH, us, lift);

    // Nameplate (brass) — the station title
    var npH = Math.round(26 * us);
    var npY = niY + niH + Math.round(8 * us);
    var npX = niX, npW = niW;
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(npX - 1, npY - 1, npW + 2, npH + 2);
    ctx.fillStyle = '#4a3618';
    ctx.fillRect(npX, npY, npW, npH);
    ctx.fillStyle = hov ? '#a07c40' : '#7a5a2c';
    ctx.fillRect(npX + 2, npY + 2, npW - 4, npH - 4);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(npX + 2, npY + 2, npW - 4, 2);
    var tpx = Math.round(13 * us);
    nsText(info.title, npX + npW / 2, npY + (npH - tpx) / 2, tpx, '#231507', 'center');

    // Tagline
    nsText(info.tag, x + w / 2, npY + npH + Math.round(7 * us), Math.round(7.5 * us),
           hov ? '#d8b878' : '#8c7850', 'center');

    // Hover "ENTER" chevron — pulses
    if (lift > 0.3) {
      var pa = 0.5 + 0.5 * Math.sin(nsRoomT * 6);
      var cy2 = y + h - Math.round(13 * us);
      ctx.globalAlpha = lift * (0.55 + 0.45 * pa);
      nsText('ENTER >', x + w / 2, cy2, Math.round(7 * us), info.accent, 'center');
      ctx.globalAlpha = 1;
    }
  }

  // ---- Station identity scenes -----------------------------------------
  // WORKSHOP: tools floating + bobbing above an anvil, with a steam wisp.
  function nsDrawWorkshopIdentity(cx, cy, w, h, us, lift) {
    var scl = Math.min(w, h) / 130;
    // Anvil silhouette at the base
    var anW = 56 * scl, anH = 30 * scl;
    var anX = cx - anW / 2, anY = cy + h * 0.16;
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(anX - 2, anY - 2, anW + 4, anH + 4);
    ctx.fillStyle = '#3b3530';
    ctx.fillRect(anX, anY + anH * 0.42, anW, anH * 0.34);          // body
    ctx.fillRect(anX + anW * 0.30, anY + anH * 0.74, anW * 0.4, anH * 0.26); // foot
    ctx.beginPath();                                                // horn
    ctx.moveTo(anX, anY + anH * 0.42);
    ctx.lineTo(anX - anW * 0.22, anY + anH * 0.5);
    ctx.lineTo(anX, anY + anH * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#55504a';
    ctx.fillRect(anX, anY + anH * 0.42, anW, 3 * scl);             // top face
    // Steam wisp rising — sine-wobbled column
    var stp = (nsRoomT * 0.6) % 1;
    for (var s = 0; s < 5; s++) {
      var sp = (stp + s / 5) % 1;
      var sy = anY - sp * h * 0.5;
      var sx = cx + Math.sin(sp * 6 + nsRoomT * 2) * 7 * scl;
      var sa = (1 - sp) * 0.32;
      ctx.fillStyle = 'rgba(220,210,200,' + sa.toFixed(3) + ')';
      var sr = (2 + sp * 5) * scl;
      ctx.fillRect(sx - sr / 2, sy - sr / 2, sr, sr);
    }
    // Three tools bob above the anvil, each at its own phase.
    var bob = function (i) { return Math.sin(nsRoomT * 1.7 + i * 2.1) * 4 * scl; };
    // Tool 1: wrench (left)
    var t1x = cx - 30 * scl, t1y = cy - h * 0.16 + bob(0);
    nsToolWrench(t1x, t1y, 22 * scl);
    // Tool 2: drill bit (center, slightly higher)
    var t2x = cx, t2y = cy - h * 0.24 + bob(1);
    drawDrillUpgradeSprite(t2x, t2y, 30 * scl, 3);
    // Tool 3: hammer (right)
    var t3x = cx + 30 * scl, t3y = cy - h * 0.16 + bob(2);
    nsToolHammer(t3x, t3y, 24 * scl);
    // Soft sparks drifting off the anvil when hovered
    if (lift > 0.5 && Math.random() < 0.3) {
      nsHubParticles.push({
        x: anX + anW * (0.2 + Math.random() * 0.6), y: anY + anH * 0.4,
        vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random(),
        t: 0.5, ttl: 0.5, kind: 'spark'
      });
    }
  }
  function nsToolWrench(cx, cy, sz) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.5);
    var sw = sz * 0.16;
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(-sw / 2 - 1, -sz / 2 - 1, sw + 2, sz + 2);
    ctx.fillStyle = '#8a8a82';
    ctx.fillRect(-sw / 2, -sz / 2, sw, sz);                 // shaft
    ctx.fillStyle = '#b6b6ac';
    ctx.fillRect(-sw / 2, -sz / 2, 1.5, sz);
    // open-end head
    ctx.fillStyle = '#0a0806';
    ctx.beginPath(); ctx.arc(0, -sz / 2, sz * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8a82';
    ctx.beginPath(); ctx.arc(0, -sz / 2, sz * 0.20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#120d09';
    ctx.fillRect(-sz * 0.1, -sz / 2 - sz * 0.24, sz * 0.2, sz * 0.16);
    // ring head
    ctx.fillStyle = '#0a0806';
    ctx.beginPath(); ctx.arc(0, sz / 2, sz * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8a82';
    ctx.beginPath(); ctx.arc(0, sz / 2, sz * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#120d09';
    ctx.beginPath(); ctx.arc(0, sz / 2, sz * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function nsToolHammer(cx, cy, sz) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.45);
    var hw = sz * 0.14;
    // handle (wood)
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(-hw / 2 - 1, -sz * 0.1, hw + 2, sz * 0.62);
    ctx.fillStyle = '#7a4e26';
    ctx.fillRect(-hw / 2, -sz * 0.1, hw, sz * 0.6);
    ctx.fillStyle = '#9a6838';
    ctx.fillRect(-hw / 2, -sz * 0.1, 1.5, sz * 0.6);
    // steel head
    var headW = sz * 0.5, headH = sz * 0.24;
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(-headW / 2 - 1, -sz * 0.34 - 1, headW + 2, headH + 2);
    ctx.fillStyle = '#6e6e66';
    ctx.fillRect(-headW / 2, -sz * 0.34, headW, headH);
    ctx.fillStyle = '#9a9a90';
    ctx.fillRect(-headW / 2, -sz * 0.34, headW, 2);
    ctx.fillStyle = '#4a4a44';
    ctx.fillRect(-headW / 2, -sz * 0.34 + headH - 2, headW, 2);
    ctx.restore();
  }
  // SHELF: three product silhouettes glowing on stepped shelves.
  function nsDrawShelfIdentity(cx, cy, w, h, us, lift) {
    var scl = Math.min(w, h) / 130;
    // Two wooden shelf boards
    var bW = w * 0.82, bX = cx - bW / 2;
    var sh1 = cy - h * 0.02, sh2 = cy + h * 0.24;
    for (var b = 0; b < 2; b++) {
      var by = b === 0 ? sh1 : sh2;
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(bX - 2, by - 2, bW + 4, 8 * scl + 2);
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(bX, by, bW, 8 * scl);
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(bX, by, bW, 2);
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(bX, by + 8 * scl - 2, bW, 2);
    }
    // Products: glowing silhouettes sitting on the shelves.
    var glow = 0.4 + 0.6 * lift;
    var pulse = 0.6 + 0.4 * Math.sin(nsRoomT * 2.4);
    function prod(px, py, kind, ci) {
      // glow halo
      var gr = ctx.createRadialGradient(px, py, 2, px, py, 16 * scl);
      gr.addColorStop(0, 'rgba(' + ci + ',' + (0.3 * glow * pulse).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(' + ci + ',0)');
      ctx.fillStyle = gr;
      ctx.fillRect(px - 18 * scl, py - 18 * scl, 36 * scl, 36 * scl);
      drawConsumableIconBig(kind, px, py - 4 * scl, 26 * scl);
    }
    prod(cx - w * 0.26, sh1 - 2 * scl, 'teleporter', '200,160,255');
    prod(cx + w * 0.04, sh1 - 2 * scl, 'bombLarge',  '255,120,70');
    prod(cx + w * 0.04, sh2 - 2 * scl, 'balloon',    '255,210,90');
    prod(cx - w * 0.26, sh2 - 2 * scl, 'reserveFuel','255,200,80');
  }
  // BOARD: a mini bulletin board with paper notices that flutter.
  function nsDrawBoardIdentity(cx, cy, w, h, us, lift) {
    var scl = Math.min(w, h) / 130;
    // mini wood backboard
    var bw = w * 0.72, bh = h * 0.66;
    nsWoodBacking(cx - bw / 2, cy - bh / 2, bw, bh, NS_STATION_INFO.board);
    // three small papers, each fluttering on its own phase
    for (var i = 0; i < 3; i++) {
      var ph = nsRoomT * 1.6 + i * 2.0;
      var flut = Math.sin(ph) * 2.4 * scl;
      var pw = bw * 0.26, phh = bh * 0.42;
      var px = cx - bw * 0.28 + i * (bw * 0.28);
      var py = cy - bh * 0.12 + (i % 2) * (bh * 0.06) + flut;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.sin(ph) * 0.06 + (i - 1) * 0.05);
      nsPaper(-pw / 2, -phh / 2, pw, phh, i + 3);
      // ink lines
      ctx.fillStyle = 'rgba(60,42,24,0.5)';
      for (var ln = 0; ln < 3; ln++) ctx.fillRect(-pw / 2 + 4 * scl, -phh / 2 + (5 + ln * 5) * scl, pw - 8 * scl, 1.4 * scl);
      ctx.restore();
      nsNail(px, py - phh / 2 + 3 * scl);
      // a corner curling up when hovered → rustle particles
      if (lift > 0.5 && Math.random() < 0.12) {
        nsHubParticles.push({
          x: px + (Math.random() - 0.5) * pw, y: py,
          vx: (Math.random() - 0.5) * 1.2, vy: -0.4 - Math.random() * 0.6,
          t: 0.7, ttl: 0.7, kind: 'paper'
        });
      }
    }
  }

  // ---- Pointer dispatch -------------------------------------------------
  function nsHitAt(x, y) {
    // Topmost-last: NS_HIT is pushed in draw order, so iterate backwards.
    for (var i = NS_HIT.length - 1; i >= 0; i--) {
      var r = NS_HIT[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }
  function newShopPointerDown(x, y, id) {
    if (id === undefined) id = 'mouse';
    // Corner button is live on every screen: BACK on a sub-page (pop to hub),
    // EXIT on the hub (leave the shop). Press it twice from a sub-page to go out.
    var ba = nsBackArrowRect(nsMetrics());
    if (x >= ba.x && x <= ba.x + ba.w && y >= ba.y && y <= ba.y + ba.h) {
      nsBackOrExit();
      return true;
    }
    var hit = nsHitAt(x, y);
    if (shopState === 'floor') {
      if (hit && hit.kind === 'station') { nsEnterStation(hit.id); return true; }
      return true;   // floor eats the click
    }
    // Sub-pages
    if (shopState === 'workshop') return nsWorkshopPointerDown(x, y, hit);
    if (shopState === 'shelf') return nsShelfPointerDown(x, y, hit);
    if (shopState === 'board') return nsBoardPointerDown(x, y, hit, id);
    return true;
  }
  function newShopPointerMove(x, y) {
    var hit = nsHitAt(x, y);
    nsHubHover = null;
    nsBoardHover = null;
    var ba = nsBackArrowRect(nsMetrics());
    if (x >= ba.x && x <= ba.x + ba.w && y >= ba.y && y <= ba.y + ba.h) nsHubHover = 'nsback';
    if (!hit) return;
    if (hit.kind === 'station') nsHubHover = hit.id;
    else if (hit.kind === 'wsitem') nsHubHover = 'ws:' + hit.id;
    else if (hit.kind === 'shitem') nsHubHover = 'sh:' + hit.id;
    else if (hit.kind === 'boardrow') nsBoardHover = hit.id;
    else if (hit.kind === 'boardbtn') nsHubHover = 'bb:' + hit.id;
  }
  function newShopPointerDrag(x, y, id) {
    // Board market list drag-to-scroll.
    if (shopState === 'board' && nsDrag.active && nsDrag.id === id) {
      var dy = y - nsDrag.startY;
      nsDrag.moved = Math.max(nsDrag.moved, Math.abs(dy));
      nsBoardScroll = nsDrag.startScroll - dy;
      if (nsBoardScroll < 0) nsBoardScroll = 0;
      if (nsBoardScroll > nsBoardScrollMax) nsBoardScroll = nsBoardScrollMax;
    }
  }
  function newShopPointerUp(id) {
    var di = (id === undefined) ? 'mouse' : id;
    if (nsDrag.active && nsDrag.id === di) {
      nsDrag.active = false;
      // Commit a pending row toggle only if this was a tap, not a drag.
      if (shopState === 'board' && nsDrag.pendingRow && nsDrag.moved < 6) {
        nsBoardSel = (nsBoardSel === nsDrag.pendingRow) ? null : nsDrag.pendingRow;
        nsBoardQty = 1;
      }
      nsDrag.pendingRow = null;
    }
  }
  function newShopWheel(d) {
    if (shopState === 'board') {
      nsBoardScroll += d;
      if (nsBoardScroll < 0) nsBoardScroll = 0;
      if (nsBoardScroll > nsBoardScrollMax) nsBoardScroll = nsBoardScrollMax;
      return true;
    }
    return false;
  }

