  /* ---- Reacting fire: shared-device lifecycle and authoritative thermal state ---- */
  var hearthFireGPU = null, hearthFireReady = Promise.resolve(false), hearthFireBed = null;
  var hearthFireDamper = 1, hearthFireIdle = 0, hearthFireGeneration = 0, hearthFireSleeping = false;
  function hearthFireCancel() {
    hearthFireGeneration++;
    if (hearthFireGPU) hearthFireGPU.dispose();
    hearthFireGPU = null; hearthFireBed = null;
  }
  function hearthFirePrepare() {
    hearthFireCancel();
    hearthFireReady = Promise.resolve(false);
    var generation = hearthFireGeneration;
    var water = liquidWGPU;
    if (!water || !window.FireWGPU || /[?&]cpufire=1/.test(location.search)) return Promise.resolve(false);
    hearthFireReady = Promise.resolve(water.readyPromise).then(function () {
      if (generation !== hearthFireGeneration || water !== liquidWGPU || !water.available || !water.device) return false;
      // Redistribute the existing cell budget across the complete chamber,
      // including its upper wings. Fuel coordinates and physical scale stay put.
      var oldWidth = isMobile ? 240 : 368;
      var cells = oldWidth * Math.round(oldWidth * HEARTH_HEIGHT / HEARTH_WIDTH);
      var width = Math.floor(Math.sqrt(cells * HEARTH_FIRE_BOUNDS.w / HEARTH_FIRE_BOUNDS.h));
      hearthFireGPU = window.FireWGPU.create({ device: water.device, width: width,
        bounds: HEARTH_FIRE_BOUNDS, chamber: hearthChamberOutline });
      window.__fire = hearthFireGPU;
      return hearthFireGPU.readyPromise;
    }).catch(function (e) { console.warn('Boiler fire uses CPU fallback:', e); return false; });
    return hearthFireReady;
  }
  function hearthFireOwns(bed) {
    return bed === hearthBeds.boiler && hearthFireGPU && hearthFireGPU.available && !hearthFireGPU.failed;
  }
  function hearthFireIgnite(bed, b) { if (hearthFireOwns(bed)) hearthFireGPU.ignite(b); }
  function hearthFireSyncBodies(bed, h) {
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      b.thermalSolidKJ = b.thermalGasKJ = null;
      b.r += ((hearthMaterial(b.material).role === 'additive' ? b.baseR : b.baseR * Math.sqrt(0.20 + b.fuel * 0.80)) - b.r) * (1 - Math.exp(-h * 1.5));
      hearthMass(b);
    }
  }
  function hearthFireTick(dt) {
    var bed = hearthBeds.boiler;
    if (!hearthFireOwns(bed)) return;
    hearthFireGPU.setChamber(hearthChamberOutline);
    if (hearthFireBed !== bed) { hearthFireGPU.reset(); hearthFireBed = bed; hearthFireIdle = 0; hearthFireSleeping = false; }
    // Empty and cold furnaces use no simulation submissions. A cooling plume
    // gets time to vent after the last fuel body has been raked out.
    var active = bed.chunks.some(function (b) { return b.lit || b.heat > 0.015; });
    hearthFireIdle = active ? 0 : hearthFireIdle + dt;
    if (hearthFireIdle > 5) {
      if (!hearthFireSleeping) { hearthFireGPU.reset(); hearthFireSleeping = true; }
      return;
    }
    hearthFireSleeping = false;
    for (var i=0;i<bed.chunks.length;i++) {
      var body=bed.chunks[i];
      // A save can occur after a hand spark but before the GPU command is
      // acknowledged. Replay that finite command once after restore.
      if(body.restoreIgnition){hearthFireGPU.ignite(body);body.restoreIgnition=false;}
      hearthWorldHull(body);
    }
    hearthFireGPU.ashLoad = bed.ashLoad;
    hearthFireGPU.step(dt, bed.chunks, { air: bed.air, damper: hearthFireDamper });
  }
  function hearthFireDraw(c, bed, x, y, w, h) {
    if (!hearthFireOwns(bed) || !bathMode || gamePaused || bathFading || !c.canvas || c.canvas !== canvas && c.canvas !== uiTopCanvas) return false;
    hearthFireGPU.setChamber(hearthChamberOutline);
    var bounds=hearthFireGPU.bounds, scaleX=w/HEARTH_WIDTH, scaleY=h/HEARTH_HEIGHT;
    x+=bounds.x*scaleX;y+=(bounds.y-HEARTH_TOP)*scaleY;w=bounds.w*scaleX;h=bounds.h*scaleY;
    var t=c.getTransform(), r=canvas.getBoundingClientRect(), parent=canvas.parentNode, pr=parent.getBoundingClientRect();
    var sx=r.width/canvas.width, sy=r.height/canvas.height;
    hearthFireGPU.draw({ x:r.left-pr.left+(t.a*x+t.c*y+t.e)*sx,
      y:r.top-pr.top+(t.b*x+t.d*y+t.f)*sy, w:Math.abs(t.a*w)*sx, h:Math.abs(t.d*h)*sy },parent);
    return true;
  }
