  // Recovery screen: one summary and one native Return to town action.
  // Snapshot before a save can clear cargo or charge the existing 10% fee.
  var DEATH_INPUT_DELAY_S = 0.35;
  var deathManifest = null;
  var deathOverlay = document.getElementById('game-death');
  var deathReturnButton = document.getElementById('gm-death-return');
  var deathFocusPending = false;

  // A self-contained death beat. Only its clock and cosmetic fragments move;
  // the ordinary world loop and all fluid, weather and actor ticks stay stopped.
  var deathSequence = null;
  var deathSceneCapture = false;
  var DEATH_BURST_S = 0.95;

  function deathHash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function beginDeathSequence() {
    var quiet = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    deathSequence = {
      duration: quiet ? 0.60 : DEATH_BURST_S, quiet: quiet,
      lowFlash: !!(window.SluiceOptions && (SluiceOptions.lowFlash || !SluiceOptions.damageFlash)),
      x: player.renderX + PLAYER_W / 2, y: player.renderY + PLAYER_H / 2,
      camX: cam.x, camY: cam.y, scale: worldScale, pixelRatio: dpr,
      ready: false, sound: false, physicsT: 0, pieces: [], frame: null, sprite: null
    };
    if (deathOverlay) deathOverlay.hidden = true;
    if (deathReturnButton) deathReturnButton.disabled = true;
  }

  // Voronoi cuts around the roof, body, track beds and drill retain the
  // actual mounted rig art, including facing, bank, suspension and upgrades.
  function deathFractureSprite(s) {
    var tilt = player.bodyTiltRender || 0, co = Math.cos(tilt), si = Math.sin(tilt);
    var dir = player.dir < 0 ? -1 : 1;
    var local = [[-7,-9],[6,-8],[-6,1],[5,2],[-8,11],[5,12],[16,9]];
    var sites = local.map(function (p) { return { x: p[0]*dir*co-p[1]*si, y:p[0]*dir*si+p[1]*co }; });
    for (var i = 0; i < sites.length; i++) {
      var site = sites[i], poly = [[-48,-48],[48,-48],[48,48],[-48,48]];
      for (var j = 0; j < sites.length; j++) {
        if (i === j) continue;
        var other = sites[j], nx = other.x-site.x, ny = other.y-site.y;
        var limit = (other.x*other.x+other.y*other.y-site.x*site.x-site.y*site.y)*0.5;
        var next = [];
        for (var k = 0; k < poly.length; k++) {
          var a = poly[k], b = poly[(k+1)%poly.length];
          var da = a[0]*nx+a[1]*ny-limit, db = b[0]*nx+b[1]*ny-limit;
          if (da <= 0) next.push(a);
          if ((da <= 0) !== (db <= 0)) {
            var u = da/(da-db);
            next.push([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]);
          }
        }
        poly = next;
      }
      var length = Math.max(1, Math.hypot(site.x,site.y));
      var speed = 55+deathHash(i+3)*65;
      s.pieces.push({ polygon:poly, ox:site.x, oy:site.y, x:site.x, y:site.y,
        vx:site.x/length*speed, vy:site.y/length*speed-72,
        angle:0, spin:(deathHash(i+17)-0.5)*15, bounced:false });
    }
  }

  function captureDeathScene(s) {
    // Draw one clean destination frame without the miner. Render-only capture
    // performs no simulation step, and never submits a new death/menu frame.
    deathSceneCapture = true;
    try { render(); } finally { deathSceneCapture = false; }
    var frame = document.createElement('canvas');
    frame.width = canvas.width; frame.height = canvas.height;
    var fc = frame.getContext('2d');
    fc.drawImage(canvas,0,0);
    // One cross-context copy at death, not a per-frame GPU readback. Preserve
    // the real water and exhaust, in the compositor's existing order. The
    // instrument strip gives the rupture the playfield until recovery.
    var layers = [liquidGLCanvas, liquidWGPU && liquidWGPU.renderCanvas,
      smokeFluidCanvas, rigExhaustCanvas].filter(function (c) { return c && c.width && c.height; });
    layers.sort(function(a,b) { return (parseInt(a.style.zIndex,10)||0)-(parseInt(b.style.zIndex,10)||0); });
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer.style.display === 'none') continue;
      var inset = (layer.style.clipPath || '').match(/^inset\(0px 0px ([\d.]+)px 0px\)$/);
      fc.save();
      if (inset) { fc.beginPath(); fc.rect(0,0,frame.width,Math.max(0,frame.height-Number(inset[1])*dpr)); fc.clip(); }
      fc.drawImage(layer,0,0,frame.width,frame.height);
      fc.restore();
    }
    s.frame = frame;
    var sprite = document.createElement('canvas');
    sprite.width = sprite.height = 288;
    var previous = ctx;
    try {
      ctx = sprite.getContext('2d');
      ctx.setTransform(3,0,0,3,(48-s.x)*3,(48-s.y)*3);
      drawPlayer();
    } finally { ctx = previous; }
    s.sprite = sprite;
    deathFractureSprite(s);
    s.ready = true;
    syncDomEffectLayerVisibility();
  }

  function deathFragmentSolid(x,y) {
    var tile = tileAt(Math.floor(y/TILE),Math.floor(x/TILE));
    return !!(tile && tile.type !== 'water' && tile.type !== 'oil');
  }
  function updateDeathFragments(s) {
    var target = Math.max(0,deathPhaseT-0.075);
    while (s.physicsT+1/120 <= target && s.physicsT < s.duration) {
      s.physicsT += 1/120;
      for (var i = 0; i < s.pieces.length; i++) {
        var p = s.pieces[i], dt = 1/120;
        p.vy += 270*dt;
        var x = p.x+p.vx*dt, y = p.y+p.vy*dt;
        if (!deathFragmentSolid(s.x+x,s.y+p.y)) p.x=x;
        else { p.vx *= -0.3; p.spin *= -0.5; }
        if (!deathFragmentSolid(s.x+p.x,s.y+y)) p.y=y;
        else {
          if (p.vy>12 && !p.bounced) { p.vy *= -0.28; p.bounced=true; }
          else p.vy=0;
          p.vx *= 0.92; p.spin *= 0.9;
        }
        p.angle += p.spin*dt;
      }
    }
  }

  // Small stepped discs keep the fire and soot in the foreground's pixel
  // grammar. Offset highlight lobes give each puff volume without a ring.
  function deathPixelDisc(x,y,r,color) {
    ctx.fillStyle=color;
    var radius=Math.max(1,Math.ceil(r));
    for (var y0=-radius;y0<=radius;y0+=2) {
      var span=Math.floor(Math.sqrt(Math.max(0,radius*radius-y0*y0)));
      ctx.fillRect(Math.round(x)-span,Math.round(y)+y0,span*2+1,2);
    }
  }

  function drawRigDeathBurst(s,t) {
    var blast=Math.max(0,t-0.075), quiet=s.quiet;
    // A short intact beat precedes the rupture; no camera or world shake.
    if (t<0.075) {
      ctx.drawImage(s.sprite,-48,-48,96,96);
      if (!quiet && !s.lowFlash) {
        ctx.globalAlpha=Math.sin(t/0.075*Math.PI)*0.7;
        deathPixelDisc(1,1,3,'#ffe6a0');
        ctx.globalAlpha=1;
      }
      return;
    }
    // Smoke spreads after the flame, with a lit upper-left rim and a cooler
    // underside. It finishes before the recovery panel covers the scene.
    for (var i=0;i<9;i++) {
      var age=blast-0.10-i*0.013;
      if (age<0) continue;
      var angle=deathHash(i+51)*Math.PI*2;
      var reach=(quiet?5:11)+age*(quiet?4:12);
      var x=Math.cos(angle)*reach, y=Math.sin(angle)*reach-age*24;
      var r=(quiet?4:7)+age*9;
      ctx.globalAlpha=Math.min(1,age/0.06)*Math.max(0,1-age/(quiet?0.42:0.68))*0.7;
      deathPixelDisc(x,y,r,'#252320');
      deathPixelDisc(x-1,y-2,r*0.8,'#3e3830');
      deathPixelDisc(x-2,y-3,r*0.52,'#5a5248');
    }
    ctx.globalAlpha=1;
    var fade=Math.max(0,Math.min(1,(s.duration-t)/0.23));
    for (var pi=0;pi<s.pieces.length;pi++) {
      var p=s.pieces[pi];
      ctx.save();
      ctx.globalAlpha=fade;
      ctx.translate(quiet?p.ox+(p.x-p.ox)*0.12:p.x,quiet?p.oy+(p.y-p.oy)*0.12:p.y);
      ctx.rotate(quiet?0:p.angle);
      ctx.beginPath();
      for (var vi=0;vi<p.polygon.length;vi++) {
        var v=p.polygon[vi];
        if (!vi) ctx.moveTo(v[0]-p.ox,v[1]-p.oy); else ctx.lineTo(v[0]-p.ox,v[1]-p.oy);
      }
      ctx.closePath();ctx.clip();
      ctx.drawImage(s.sprite,-48-p.ox,-48-p.oy,96,96);
      ctx.restore();
    }
    // A compact asymmetric fireball, moving from cream to orange to rust.
    // Low-flash mode removes the bright ignition core; it never washes the screen.
    if (blast<0.34) {
      var fire=Math.max(0,1-blast/0.34);
      ctx.globalAlpha=fire;
      for (var fi=0;fi<7;fi++) {
        var a=fi*2.399, distance=(quiet?3:8)*(1-Math.exp(-blast*25));
        var fx=Math.cos(a)*distance, fy=Math.sin(a)*distance-blast*16;
        var fr=(quiet?6:11)*Math.sin(Math.min(1,blast/0.11)*Math.PI*0.5)*fire+2;
        deathPixelDisc(fx,fy,fr,'#a8281e');
        deathPixelDisc(fx-1,fy-1,fr*0.72,'#ff8030');
        deathPixelDisc(fx-1,fy-2,fr*0.4,'#ffd060');
      }
      if (!quiet && !s.lowFlash && blast<0.07) {
        ctx.globalAlpha=(1-blast/0.07)*0.9;
        deathPixelDisc(0,-1,8*(1-blast/0.07)+2,'#ffe6a0');
      }
    }
    // Separate hot rivets and fine spark trails cool and fall independently.
    var sparks=quiet?8:26;
    for (var si=0;si<sparks;si++) {
      var life=0.3+deathHash(si+73)*0.4;
      if (blast>=life) continue;
      var ang=deathHash(si+81)*Math.PI*2;
      var speed=(quiet?16:65)+deathHash(si+97)*(quiet?14:120);
      var vx=Math.cos(ang)*speed, vy=Math.sin(ang)*speed-35;
      var px=vx*blast, py=vy*blast+135*blast*blast;
      ctx.globalAlpha=Math.min(1,(life-blast)/0.13);
      ctx.fillStyle=blast<life*0.45?'#ffd060':'#ff8030';
      if (!quiet) {
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-vx*0.018,py-(vy+270*blast)*0.018);
        ctx.lineWidth=1;ctx.strokeStyle=ctx.fillStyle;ctx.stroke();
      }
      ctx.fillRect(Math.round(px),Math.round(py),si%5===0?2:1,2);
    }
    ctx.globalAlpha=1;
  }

  function drawDeathFrame() {
    if (!deathSequence) beginDeathSequence();
    var s=deathSequence;
    if (!s.ready) captureDeathScene(s);
    var previous=ctx;
    ctx=uiTopEnsure() || previous;
    // This canvas now owns the whole frozen frame. Discard any HUD clip or
    // blend state before replacing it, including after a pause or resize.
    if (ctx.reset) ctx.reset();
    ctx.save();
    try {
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
      ctx.fillStyle=UIT_INSET;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
      var fit=Math.min(ctx.canvas.width/s.frame.width,ctx.canvas.height/s.frame.height);
      var left=(ctx.canvas.width-s.frame.width*fit)*0.5, top=(ctx.canvas.height-s.frame.height*fit)*0.5;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(s.frame,left,top,s.frame.width*fit,s.frame.height*fit);
      if (deathPhaseT<s.duration) {
        var scale=s.pixelRatio*s.scale*fit;
        ctx.setTransform(scale,0,0,scale,left+(s.x-s.camX)*scale,top+(s.y-s.camY)*scale);
        drawRigDeathBurst(s,deathPhaseT);
      } else drawDeathScreen(0);
    } finally { ctx.restore();ctx=previous; }
  }

  function deathFrameTick(dt) {
    if (!deathSequence) beginDeathSequence();
    if (!deathSequence.ready) captureDeathScene(deathSequence);
    deathPhaseT+=Math.max(0,dt);
    updateDeathFragments(deathSequence);
    if (!deathSequence.sound && deathPhaseT>=0.075) {
      deathSequence.sound=true;
      sfxPlay('bomb-small',{gain:0.6,rate:0.9,pan:sfxPanAt(deathSequence.x)});
    }
    drawDeathFrame();
  }

  function clearDeathSequence() {
    if (deathSequence) {
      if (deathSequence.frame) deathSequence.frame.width=deathSequence.frame.height=0;
      if (deathSequence.sprite) deathSequence.sprite.width=deathSequence.sprite.height=0;
    }
    deathSequence=null;
  }

  function buildDeathManifest() {
    var fee, balance;
    if (applyDeathPenalty._done) {
      fee = applyDeathPenalty._fee || 0;
      balance = (money || 0) + fee;
    } else {
      balance = money || 0;
      fee = Math.floor(balance * 0.10);
    }
    var total = 0;
    for (var i = 0; i < cargo.length; i++) total += cargoUnitValue(cargo[i]);
    return {
      cause: deathInfo && deathInfo.type || 'hull',
      depth: Math.max(0, Math.floor(player.y / TILE - SKY_ROWS + 1)),
      count: cargo.length,
      total: total,
      fee: fee,
      remitted: balance - fee
    };
  }

  function deathCauseText(cause) {
    if (cause === 'fall') return 'Hard landing';
    if (cause === 'fuel') return 'Out of fuel';
    if (cause === 'magma' || cause === 'burned') return 'Overheated';
    if (cause === 'water' || cause === 'drowned') return 'Flooded';
    if (cause === 'bomb') return 'Caught in a blast';
    return 'Hull destroyed';
  }

  function deathRecover() {
    if (!gameOver || gamePaused || mobileLandscapeBlocked ||
        deathPhaseT < DEATH_INPUT_DELAY_S ||
        (deathSequence && deathPhaseT < deathSequence.duration) ||
        (window.SluiceLoading && window.SluiceLoading.active())) return;
    if (deathOverlay) deathOverlay.hidden = true;
    for (var k in keys) keys[k] = false;
    touch.active = false;
    dpad.left = dpad.right = dpad.up = dpad.down = false;
    gpReleaseAll();
    clearDeathSequence();
    respawnFromDeath();
    deathManifest = null;
    deathFocusPending = false;
    canvas.focus({ preventScroll: true });
  }

  // Own all gameplay keys while the report is up. Repeats cannot turn a
  // held thrust key into recovery. Escape still opens the normal pause menu.
  function deathKeyDown(e) {
    if (!UI_NEW || !gameOver || gamePaused || e.key === 'Escape' ||
        e.ctrlKey || e.metaKey || e.altKey) return false;
    e.preventDefault();
    if (e.key === 'Tab') {
      if (deathOverlay && !deathOverlay.hidden && deathReturnButton) deathReturnButton.focus({ preventScroll: true });
    } else if (!e.repeat && (e.key === 'Enter' || e.key === ' ' || e.key === 'r' || e.key === 'R')) {
      deathRecover();
    }
    return true;
  }

  if (deathReturnButton) deathReturnButton.addEventListener('click', deathRecover);

  // Keep the existing screenshot lever. The summary has no reveal sequence;
  // Old deathskip review URLs still work; the short rig burst always precedes
  // the panel, whose summary appears together with no printing animation.
  var DEATHSHOT = (function () {
    var match = location.search.match(/[?&]deathshot=([a-z]+)/);
    return match ? match[1] : null;
  })();
  function syncDeathScreen() {
    if (!UI_NEW) return;
    if (DEATHSHOT && !syncDeathScreen._shot && !gameOver && player) {
      syncDeathScreen._shot = true;
      if (!cargo.length) {
        var seed = [['gold', 2], ['silver', 3], ['iron', 5], ['coal', 8], ['amber', 1]];
        for (var i = 0; i < seed.length; i++) {
          for (var j = 0; j < seed[i][1]; j++) cargo.push({ type: seed[i][0], shiny: false });
        }
        cargo.push({ type: 'gold', shiny: true });
      }
      if (money <= 0) money = 8920;
      endGame({ type: DEATHSHOT, speed: 2150, heat: 2400 });
    }
    if (gameOver) return;
    if (deathOverlay) deathOverlay.hidden = true;
    clearDeathSequence();
    deathManifest = null;
    deathFocusPending = false;
    deathPhaseT = 0;
  }

  // Desaturating veil (q) and edge vignette (v) under the death plate.
  // Shared with the shader warm-up (046).
  function drawDeathVeil(q, v) {
    if (q > 0.01) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,' + (0.62 * q).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(30,38,48,' + (0.11 * q).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    if (v > 0.01) {
      var vignette = ctx.createRadialGradient(viewW / 2, viewH * 0.5, viewW * 0.2, viewW / 2, viewH * 0.5, viewW * 0.78);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,' + v.toFixed(3) + ')');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawDeathScreen(dt) {
    if (!UI_NEW || !gameOver || !deathOverlay || deathSceneCapture ||
        (deathSequence && deathPhaseT < deathSequence.duration)) return;
    if (!deathManifest) deathManifest = buildDeathManifest();
    var m = deathManifest;
    var opening = deathOverlay.hidden;
    if (opening) {
      document.getElementById('gm-death-cause').textContent = deathCauseText(m.cause) + ' at ' + m.depth + ' m.';
      document.getElementById('gm-death-cargo').textContent = m.count ? '$' + m.total.toLocaleString() : 'Empty hold';
      document.getElementById('gm-death-fee').textContent = '$' + m.fee.toLocaleString();
      document.getElementById('gm-death-balance').textContent = '$' + m.remitted.toLocaleString();
      deathOverlay.hidden = false;
      deathFocusPending = true;
    }
    deathReturnButton.disabled = deathPhaseT < DEATH_INPUT_DELAY_S;
    document.getElementById('gm-death-shortcut').textContent = gpConnected ? 'A to return' : isMobile ? '' : 'Enter or R';
    if (deathFocusPending && !deathReturnButton.disabled && !gamePaused && !mobileLandscapeBlocked) {
      deathReturnButton.focus({ preventScroll: true });
      deathFocusPending = false;
    }
    // Focus returns to the recovery action after closing the pause menu or
    // returning to landscape, without changing a deliberate manual pause.
    if (!gamePaused && !mobileLandscapeBlocked && !deathReturnButton.disabled && document.activeElement === canvas) {
      deathReturnButton.focus({ preventScroll: true });
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDeathVeil(0.45, 0);
    ctx.restore();
  }

  function drawShopFloor() {
    if (!UI_NEW || shopState === 'closed') return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (USE_NEW_SHOP_UI) {
      // v26.18 — the UI kit paints its own fizzed-world backdrop (blur +
      // dim + vignette over the playfield only, console untouched); the
      // old flat dim would double-darken it. The board page fills opaque.
      newShopDraw();
    } else {
      // Legacy walk-up shop: camera-push dim over the playfield, NOT the
      // console (v11.26: the toolbar must stay fully lit while shopping).
      var ch = consoleHeight();
      var roomBottom = viewH - ch;
      var dim = 0.62 * (shopEnterT < 1 ? shopEnterT : 1);
      ctx.fillStyle = 'rgba(0,0,0,' + dim.toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, roomBottom);
      if (shopState === 'floor') drawShopRoom();
      else drawShopSubPage();
    }
    ctx.restore();
  }

  // Pointer dispatch for shop interior. Floor: hit-test station rects; click
  // pushes shopState. Sub-page: hit-test back-arrow only; click pops to
  // 'floor'. Returns true if the shop consumed the input.
  function handleShopInteriorPointerDown(x, y, id) {
    if (USE_NEW_SHOP_UI) return newShopPointerDown(x, y, id);
    if (shopState === 'floor') {
      // LEAVE SHOP button — places the rig down on the deck between the
      // shop and the fireplace, clears all velocity so the player can
      // start fresh. Also closes the door immediately.
      var lb = shopLeaveBtnRect();
      if (x >= lb.x && x <= lb.x + lb.w && y >= lb.y && y <= lb.y + lb.h) {
        shopState = 'closed';
        shopDoorT = 0;
        if (typeof player !== 'undefined' && player) {
          // Spawn between shop and fireplace. Shop center = stationCenterCol
          // * TILE + TILE/2; fireplace is +150 from that. Halfway is +75.
          var stationCx = nearestTownStationCol() * TILE + TILE / 2;
          player.x = stationCx + 75 - PLAYER_W / 2;
          player.y = DECK_ROW * TILE - PLAYER_H;
          player.vx = 0; player.vy = 0;
          player.thrusting = false;
          if (typeof player.thrustSpool !== 'undefined') player.thrustSpool = 0;
          if (typeof player.dir !== 'undefined') player.dir = 1;
          if (typeof player.renderX !== 'undefined') { player.renderX = player.x; player.renderY = player.y; }
        }
        return true;
      }
      var rects = shopStationRects();
      var ids = ['workshop', 'shelf', 'board'];
      for (var i = 0; i < ids.length; i++) {
        var st = rects[ids[i]];
        if (x >= st.x && x <= st.x + st.w && y >= st.y && y <= st.y + st.h) {
          shopState = st.id;
          // Reset entrance animations so each push plays the intro
          if (st.id === 'shelf') shopShelfModalEnterT = 0;
          if (st.id === 'workshop') shopWorkshopModalEnterT = 0;
          return true;
        }
      }
      return true;   // click on shop floor, not on a station — eat it
    } else {
      var b = shopBackArrowRect();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        shopState = 'floor';
        return true;
      }
      // SHELF sub-page BUY levers
      if (shopState === 'shelf' && SHELF_BUY_RECTS && SHELF_BUY_RECTS.length) {
        for (var bi = 0; bi < SHELF_BUY_RECTS.length; bi++) {
          var br = SHELF_BUY_RECTS[bi];
          if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
            var moneyBefore = money;
            buildShopItems();
            var item = null;
            for (var si = 0; si < shopItems.length; si++) {
              if (shopItems[si].key === br.key) { item = shopItems[si]; break; }
            }
            if (item) buyUpgrade(item);
            var success = (money < moneyBefore) || (devMode && item);
            fireShelfBuyFx(br, success);
            return true;
          }
        }
      }
      // WORKSHOP sub-page BUY buttons
      if (shopState === 'workshop' && WORKSHOP_BUY_RECTS && WORKSHOP_BUY_RECTS.length) {
        for (var wbi = 0; wbi < WORKSHOP_BUY_RECTS.length; wbi++) {
          var wbr = WORKSHOP_BUY_RECTS[wbi];
          if (x >= wbr.x && x <= wbr.x + wbr.w && y >= wbr.y && y <= wbr.y + wbr.h) {
            if (!wbr.canBuy) {
              fireWorkshopBuyFx(wbr, false);
              return true;
            }
            var moneyBefore2 = money;
            buildShopItems();
            var item2 = null;
            for (var si2 = 0; si2 < shopItems.length; si2++) {
              if (shopItems[si2].key === wbr.key) { item2 = shopItems[si2]; break; }
            }
            if (item2) buyUpgrade(item2);
            var success2 = (money < moneyBefore2) || (devMode && item2);
            fireWorkshopBuyFx(wbr, success2);
            return true;
          }
        }
      }
      return true;   // sub-page eats clicks elsewhere too
    }
  }
  function updateShopHover(x, y) {
    if (USE_NEW_SHOP_UI) { newShopPointerMove(x, y); return; }
    if (shopState === 'floor') {
      shopHoverShelfItem = null;
      var ids = ['leave', 'workshop', 'shelf', 'board'];
      var newHover = null;
      for (var i = 0; i < ids.length; i++) {
        var hr = shopWorkAreaRect(ids[i]);
        if (x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) {
          newHover = ids[i]; break;
        }
      }
      shopHoverStation = newHover;
    } else if (shopState === 'shelf') {
      shopHoverStation = null;
      shopHoverWorkshopItem = null;
      var newHover2 = null;
      for (var j = 0; j < SHELF_BUY_RECTS.length; j++) {
        var br = SHELF_BUY_RECTS[j];
        if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
          newHover2 = br.key; break;
        }
      }
      shopHoverShelfItem = newHover2;
    } else if (shopState === 'workshop') {
      shopHoverStation = null;
      shopHoverShelfItem = null;
      var newHover3 = null;
      for (var k = 0; k < WORKSHOP_BUY_RECTS.length; k++) {
        var wbr2 = WORKSHOP_BUY_RECTS[k];
        if (x >= wbr2.x && x <= wbr2.x + wbr2.w && y >= wbr2.y && y <= wbr2.y + wbr2.h) {
          newHover3 = wbr2.key; break;
        }
      }
      shopHoverWorkshopItem = newHover3;
    } else {
      shopHoverStation = null;
      shopHoverShelfItem = null;
      shopHoverWorkshopItem = null;
    }
  }
