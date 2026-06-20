  /* ============================================================
     THE SLUICE (refinement station) - economy Phase 1
     ------------------------------------------------------------
     A surface refinement station LEFT of the home KOMENDATURA: a tall
     riveted headworks TOWER carrying a BIG landing platform you fly up
     and set the rig down on (the "top of the slide"), a steep riffled
     wash channel with water running DOWN it, and a collection bin at
     the foot (the future base-camp HOARD). Frontier Soviet, drawn from
     the BLD helpers in 170 (hoisted) via drawCachedStructure (water
     animates at TOWN_ANIM_FPS; the whole thing culls on its AABB).

     v2 (2026-06-07): ART pass applying PIXEL_ART.md, verified by eye via
     sluice-lab.html (node build-sluice-lab.js -> screenshot). The tower is
     shaded as a ROUNDED CYLINDER (light|lit|base|shadow|reflected-rim) not
     flat slabs; steel uses BLD's hue-shifted metal ramp with directional
     light; rivets are highlight-TL/shadow-BR; the channel is real flowing
     water (scrolling down-slope bands + froth) in a beveled trough; max
     contrast is reserved for the focal star + sign. EVERY helper used here
     is grep-verified to exist.

     STATUS: STRUCTURE only. Owner vision: when the rig is CLOSE, refinable
     cargo ore arcs out of you onto the channel, washes down, refines 4:1,
     and drops into the base-camp HOARD. Those increments (proximity ore-arc,
     refine, hoard, hoard UI) build on this.

     Steel ramp (dark->light), all from BLD's already-cool metal family:
       core/AO = BLD.outline | shadow = metalDark | base = metalBase
       light = metalLight | highlight/spec = metalPale
     ============================================================ */

  // Tower-centre anchor: FAR left of the home station so the tall headworks + the
  // short bin sit far apart with a long, SHALLOW, girthy channel between them
  // (owner: less steep + wider + room for water/ore). Town 1 is 320 cols wide with
  // the station near centre, so ~13 tiles left is still well within town grass.
  function sluiceAnchorX() { return stationCenterCol() * TILE + TILE / 2 - 395; }

  function drawSluice() {
    var hx = sluiceAnchorX();
    var groundY = DECK_ROW * TILE;
    drawCachedStructure('sluice', 0, hx - 58, groundY - 198, 352, 202, '', drawSluiceContent);
  }

  // ----- Tall riveted tower, shaded as a CYLINDER (round, not a flat slab) -----
  function drawSluiceTower(cx, w, topY, groundY) {
    var x = Math.round(cx - w / 2), h = groundY - topY;
    ctx.fillStyle = BLD.outline; ctx.fillRect(x - 1, topY - 1, w + 2, h + 2);   // silhouette
    var lw = Math.max(2, Math.round(w * 0.20)), sw = Math.max(2, Math.round(w * 0.20));
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(x, topY, w, h);                // base
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x + 2, topY, lw, h);           // lit band
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(x, topY, 2, h);                // highlight edge
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(x + w - 2 - sw, topY, sw, h);  // shadow band
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x + w - 2, topY, 2, h);        // reflected rim (rounds it)
    // Bolted seam bands every 24 px: embossed recess + lit lip + two shaded bolts.
    for (var sy = topY + 20; sy < groundY - 12; sy += 24) {
      ctx.fillStyle = BLD.outline;    ctx.fillRect(x + 1, sy, w - 2, 1);
      ctx.fillStyle = BLD.metalLight; ctx.fillRect(x + 1, sy + 1, w - 2, 1);
      var b1 = x + 5, b2 = x + w - 7;
      ctx.fillStyle = BLD.metalDark;  ctx.fillRect(b1, sy - 3, 2, 2); ctx.fillRect(b2, sy - 3, 2, 2);
      ctx.fillStyle = BLD.metalPale;  ctx.fillRect(b1, sy - 3, 1, 1); ctx.fillRect(b2, sy - 3, 1, 1);
    }
    drawRustStreak(x + 5, topY + 24, groundY - 14, 0.30);                       // weathering
    drawRustStreak(x + w - 7, topY + 52, groundY - 16, 0.22);
    // Flared base plinth (grounds it) + top cap collar (the platform junction) -
    // bookends that break the long uniform shaft. Both beveled to the light.
    var pbW = w + 10, pbx = Math.round(cx - pbW / 2), pbH = 17;
    ctx.fillStyle = BLD.outline;    ctx.fillRect(pbx - 1, groundY - pbH - 1, pbW + 2, pbH + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(pbx, groundY - pbH, pbW, pbH);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(pbx, groundY - pbH, pbW, 1); ctx.fillRect(pbx, groundY - pbH, 1, pbH);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(pbx + pbW - 1, groundY - pbH, 1, pbH); ctx.fillRect(pbx, groundY - 1, pbW, 1);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(pbx + 1, groundY - pbH + 7, pbW - 2, 1);   // mid seam
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(pbx + 1, groundY - pbH + 8, pbW - 2, 1);
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(pbx + 3, groundY - pbH + 2, 1, 1); ctx.fillRect(pbx + pbW - 4, groundY - pbH + 2, 1, 1);
    var capW = w + 7, capx = Math.round(cx - capW / 2), capH = 9;
    ctx.fillStyle = BLD.outline;    ctx.fillRect(capx - 1, topY - 1, capW + 2, capH + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(capx, topY, capW, capH);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(capx, topY, capW, 1); ctx.fillRect(capx, topY, 1, capH);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(capx + capW - 1, topY, 1, capH); ctx.fillRect(capx, topY + capH - 1, capW, 1);
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(capx + 3, topY + 2, 1, 1); ctx.fillRect(capx + capW - 4, topY + 2, 1, 1);
  }

  // ----- The big landing platform: beveled iron underframe + wood deck + rail -----
  function drawSluicePlatform(x, topY, w, h) {
    ctx.fillStyle = BLD.outline; ctx.fillRect(x - 1, topY - 1, w + 2, h + 2);
    var fy = topY + h - 7;                                                      // iron underframe
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(x, fy, w, 7);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x, fy, w, 1);                  // top lit edge
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(x, fy + 6, w, 1);             // bottom shadow
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(x + 2, fy, 1, 1); ctx.fillRect(x + w - 3, fy, 1, 1);
    drawWoodPlanking(x, topY, w, h - 6, 7);                                     // wood deck (grained)
    ctx.fillStyle = BLD.woodPale;   ctx.fillRect(x + 1, topY, w - 2, 1);        // sun-bleached landing top
    strokeRect1(x, topY, w, h, BLD.outline);
    // Low iron edge rail along the LEFT (the right stays open for the rig + chute).
    var railY = topY - 9, railW = Math.floor(w * 0.42);
    ctx.fillStyle = BLD.outline;
    ctx.fillRect(x + 2, railY, 1, 9); ctx.fillRect(x + railW, railY, 1, 9);
    ctx.fillRect(x + 2, railY, railW - 1, 1);
    ctx.fillRect(x + 2 + Math.floor(railW / 2), railY + 2, 1, 7);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x + 3, railY, railW - 3, 1);   // rail highlight
    // Diagonal corner gussets (tower -> deck underside).
    ctx.fillStyle = BLD.outline;
    for (var g = 0; g < 8; g++) { ctx.fillRect(x + 7 + g, topY + h + g, 2, 1); ctx.fillRect(x + w - 9 - g, topY + h + g, 2, 1); }
  }

  // ----- Ore hopper: beveled riveted funnel, regime band, coal-dark ore heap -----
  function drawSluiceHopper(x, y, w, h) {
    ctx.fillStyle = BLD.outline;    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);   // top + left lit
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(x, y, 1, 1);                              // spec corner
    ctx.fillStyle = BLD.redDark;    ctx.fillRect(x, y + Math.floor(h * 0.45), w, 2);       // regime band
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(x + 2, y + Math.floor(h * 0.45), 1, 1); ctx.fillRect(x + w - 3, y + Math.floor(h * 0.45), 1, 1);
    var taper = Math.floor(w * 0.32);                                                      // taper to a chute
    ctx.fillStyle = BLD.outline;    ctx.fillRect(x, y + h - 5, taper, 5); ctx.fillRect(x + w - taper, y + h - 5, taper, 5);
    ctx.fillStyle = '#1c1c1c';      ctx.fillRect(x + 3, y + 1, w - 6, 4);                  // ore heap
    ctx.fillStyle = '#3a3a3a';      ctx.fillRect(x + 5, y + 1, 2, 1); ctx.fillRect(x + w - 8, y + 2, 2, 1);
  }

  // ----- Collection bin (the future hoard): beveled box, lid, stripe, refined heap -----
  function drawSluiceBin(x, y, w, h) {
    ctx.fillStyle = BLD.outline;    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(x + 1, y + 4, w - 2, 1);                  // lid seam
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(x + 1, y + 5, w - 2, 1);
    ctx.fillStyle = BLD.redDark;    ctx.fillRect(x + 3, y + Math.floor(h * 0.55), w - 6, 3);  // faded stripe
    ctx.fillStyle = BLD.redBase;    ctx.fillRect(x + 3, y + Math.floor(h * 0.55), w - 6, 1);
    drawRedStar(x + w - 8, y + Math.floor(h * 0.55) + 5, 4, 0);
    ctx.fillStyle = BLD.goldBase;   ctx.fillRect(x + 4, y - 3, w - 8, 5);                  // refined heap
    ctx.fillStyle = BLD.goldBright; ctx.fillRect(x + 6, y - 3, 3, 2); ctx.fillRect(x + w - 11, y - 2, 3, 2);
    ctx.fillStyle = BLD.goldPale;   ctx.fillRect(x + 7, y - 3, 1, 1); ctx.fillRect(x + w - 10, y - 2, 1, 1);
    ctx.fillStyle = BLD.outline;    ctx.fillRect(x + 4, y - 4, w - 8, 1);
  }

  function drawSluiceContent() {
    var hx = sluiceAnchorX();
    var groundY = DECK_ROW * TILE;
    var t = performance.now() / 1000;

    var towerW = 36;
    var platW = 96, platH = 20;
    var platX = hx - 48, platTopY = groundY - 177;
    var platBottomY = platTopY + platH;
    var hopW = 22, hopH = 18;
    var hopX = platX + platW - 15, hopY = platTopY - 14;   // over the channel head, feeds the chute
    var chLeft = platX + platW - 6;
    var chRun = 200, chRight = chLeft + chRun;        // long + SHALLOW (~28 deg)
    var chTopY = platBottomY - 2, chBottomY = groundY - 50;
    var chGirth = 20;                                 // girthy trough: room for water + ore
    var binW = 52, binH = 32;
    var binX = chRight - 12, binY = groundY - binH;
    var mp1 = chLeft + 64, mp2 = chLeft + 138;        // two legs under the long channel

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(hx - towerW / 2 - 4, groundY - 2, towerW + 8, 4);
    ctx.fillRect(binX - 3, groundY - 2, binW + 8, 4);

    drawStoneFoundation(hx - towerW / 2 - 3, groundY - 9, towerW + 6, 9);
    drawStoneFoundation(binX - 3, groundY - 8, binW + 7, 8);
    drawStoneFoundation(mp1 - 5, groundY - 7, 14, 7);
    drawStoneFoundation(mp2 - 5, groundY - 7, 14, 7);

    // Channel underside Y under a given x (surface + girth). The legs' TOPS follow
    // this slope so they seat FLUSH under the sloped flume (not flat-topped).
    function chFloorY(cx) { return chTopY + ((cx - chLeft) / chRun) * (chBottomY - chTopY) + chGirth; }
    function drawLeg(cx) {
      var w = 12, lx = Math.round(cx - w / 2);
      for (var i = 0; i < w; i++) {                              // body rises to the SLOPED underside
        var xx = lx + i, ty = Math.round(chFloorY(xx)) - 1;
        ctx.fillStyle = (i === 0 || i === w - 1) ? BLD.outline : (i === 1) ? BLD.metalLight : (i === w - 2) ? BLD.metalDark : BLD.metalBase;
        ctx.fillRect(xx, ty, 1, groundY - ty);
        ctx.fillStyle = BLD.outline; ctx.fillRect(xx, ty - 1, 1, 1);            // angled top edge
      }
      for (var by = Math.round(chFloorY(cx)) + 10; by < groundY - 8; by += 16) { // bolt pairs
        ctx.fillStyle = BLD.metalPale; ctx.fillRect(lx + 2, by, 1, 1); ctx.fillRect(lx + w - 3, by, 1, 1);
      }
      ctx.fillStyle = BLD.outline;    ctx.fillRect(lx - 2, groundY - 4, w + 4, 4);   // base flange
      ctx.fillStyle = BLD.metalBase;  ctx.fillRect(lx - 1, groundY - 3, w + 2, 3);
      ctx.fillStyle = BLD.metalLight; ctx.fillRect(lx - 1, groundY - 3, w + 2, 1);
    }
    drawLeg(mp1);
    drawLeg(mp2);

    drawSluiceTower(hx, towerW, platBottomY - 2, groundY);
    drawSluicePlatform(platX, platTopY, platW, platH);

    drawSignBoard(platX + 5, platTopY + 4, 40, 12, 'ШЛЮЗ');
    drawRedStar(platX + platW - 40, platTopY + 8, 5, 0.2);

    drawSluiceHopper(hopX, hopY, hopW, hopH);
    drawSluiceChannel(chLeft, chTopY, chRight, chBottomY, chGirth, t);

    // ----- TOP: the flume sockets into an iron spout housing bolted under the -----
    // platform, so the head END is fully COVERED + flush (not a square edge hanging
    // in the air). The hopper chute feeds the housing; water boils out into the flume.
    var hoX = chLeft - 6, hoY = chTopY - 4, hoW = 15, hoH = chGirth + 7;
    ctx.fillStyle = BLD.outline;    ctx.fillRect(hoX - 1, hoY - 1, hoW + 2, hoH + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(hoX, hoY, hoW, hoH);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(hoX, hoY, hoW, 1); ctx.fillRect(hoX, hoY, 1, hoH);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(hoX, hoY + hoH - 1, hoW, 1); ctx.fillRect(hoX + hoW - 1, hoY, 1, hoH);
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(hoX + 2, hoY + 2, 1, 1); ctx.fillRect(hoX + 2, hoY + hoH - 3, 1, 1);
    var hmx = hopX + Math.floor(hopW / 2), hmy = hopY + hopH;                          // chute from the hopper
    ctx.fillStyle = BLD.outline;    ctx.fillRect(hmx - 3, hmy, 8, hoY - hmy + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(hmx - 2, hmy, 6, hoY - hmy + 2);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(hmx - 2, hmy, 1, hoY - hmy + 2);
    ctx.fillStyle = BLD.waterFoam;  ctx.fillRect(hoX + hoW - 3, chTopY + 1, 6, 4);     // water boils out the mouth
    ctx.fillStyle = BLD.waterLight; ctx.fillRect(hoX + hoW - 2, chTopY + 5, 5, 2);

    drawSluiceBin(binX, binY, binW, binH);

    // ----- BOTTOM: an iron receiving spout caps the flume foot + sits on the bin, so -----
    // the foot END is covered + flush; water cascades out of it down into the bin.
    var boX = chRight - 5, boTop = chBottomY - 4, boW = 14, boH = chGirth + 7;
    ctx.fillStyle = BLD.outline;    ctx.fillRect(boX - 1, boTop - 1, boW + 2, boH + 2);
    ctx.fillStyle = BLD.metalBase;  ctx.fillRect(boX, boTop, boW, boH);
    ctx.fillStyle = BLD.metalLight; ctx.fillRect(boX, boTop, boW, 1); ctx.fillRect(boX, boTop, 1, boH);
    ctx.fillStyle = BLD.metalDark;  ctx.fillRect(boX, boTop + boH - 1, boW, 1); ctx.fillRect(boX + boW - 1, boTop, 1, boH);
    ctx.fillStyle = BLD.metalPale;  ctx.fillRect(boX + 2, boTop + 2, 1, 1); ctx.fillRect(boX + boW - 3, boTop + 2, 1, 1);
    var spoutY = boTop + boH;                                                          // water out the spout into the bin
    ctx.fillStyle = BLD.waterFoam;  ctx.fillRect(boX + 3, spoutY - 1, boW - 6, 3);
    ctx.fillStyle = BLD.waterBase;  ctx.fillRect(boX + 4, spoutY, boW - 8, binY - spoutY + 4);
    ctx.fillStyle = BLD.waterLight; ctx.fillRect(boX + 5, spoutY + 1, 2, binY - spoutY + 2);
    ctx.fillStyle = BLD.waterFoam;  ctx.fillRect(boX + 1, binY, boW - 2, 3);           // splash in the bin
  }

  // An OPEN flume from (x0,y0) head down to (x1,y1) foot. Clean iron trough (a lit
  // top rail + a shadowed floor) FULL of water that is unmistakably FLOWING: two
  // interleaved bands of bright foam dashes scroll DOWN-slope (no static vertical
  // bars - those read as a conveyor). The head/foot connections are drawn by the
  // caller so the slide visibly links the hopper above + the bin below.
  function drawSluiceChannel(x0, y0, x1, y1, girth, t) {
    var run = x1 - x0; if (run <= 0) return;
    var scroll = Math.floor((t * 34) % 14);
    var waterD = Math.max(6, girth - 9);          // water sits in the OPEN TOP of the trough
    var midD = Math.floor(waterD * 0.6);
    var faceH = girth - waterD - 5;               // the thick front-WALL face below the water = 3D depth
    for (var x = x0; x <= x1; x++) {
      var topY = Math.round(y0 + ((x - x0) / run) * (y1 - y0));
      ctx.fillStyle = BLD.outline;     ctx.fillRect(x, topY - 1, 1, 1);           // far (back) rim
      ctx.fillStyle = BLD.waterBase;   ctx.fillRect(x, topY, 1, waterD);          // water in the open top
      ctx.fillStyle = BLD.waterFoam;   ctx.fillRect(x, topY, 1, 1);               // surface crest
      ctx.fillStyle = BLD.waterLight;  ctx.fillRect(x, topY + 1, 1, 1);
      if (((x - scroll) % 14) < 3)     { ctx.fillStyle = BLD.waterFoam;  ctx.fillRect(x, topY + 2, 1, 2); }
      if (((x - scroll + 7) % 14) < 3) { ctx.fillStyle = BLD.waterLight; ctx.fillRect(x, topY + midD, 1, 2); }
      var wy = topY + waterD;                                                      // the FRONT WALL (3D thickness)
      ctx.fillStyle = BLD.metalPale;   ctx.fillRect(x, wy, 1, 1);                 // bright front lip (we look over it)
      ctx.fillStyle = BLD.metalLight;  ctx.fillRect(x, wy + 1, 1, 1);
      ctx.fillStyle = BLD.metalBase;   ctx.fillRect(x, wy + 2, 1, faceH);         // wall face
      ctx.fillStyle = BLD.metalDark;   ctx.fillRect(x, wy + 2 + faceH, 1, 2);     // wall underside shadow
      ctx.fillStyle = BLD.outline;     ctx.fillRect(x, wy + 4 + faceH, 1, 1);     // wall bottom (silhouette)
    }
  }
