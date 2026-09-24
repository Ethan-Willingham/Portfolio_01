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
      hearthFireGPU = window.FireWGPU.create({ device: water.device, width: isMobile ? 144 : 224, worldWidth: HEARTH_WIDTH, headroom: -HEARTH_TOP });
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
      b.r += (b.baseR * Math.sqrt(0.20 + b.fuel * 0.80) - b.r) * (1 - Math.exp(-h * 1.5));
      hearthMass(b);
    }
  }
  function hearthFireTick(dt) {
    var bed = hearthBeds.boiler;
    if (!hearthFireOwns(bed)) return;
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
    for (var i=0;i<bed.chunks.length;i++) hearthWorldHull(bed.chunks[i]);
    hearthFireGPU.ashLoad = bed.ashLoad;
    hearthFireGPU.step(dt, bed.chunks, { air: bed.air, damper: hearthFireDamper });
  }
  function hearthFireDraw(c, bed, x, y, w, h) {
    if (!hearthFireOwns(bed) || !bathMode || gamePaused || bathFading || !c.canvas || c.canvas !== canvas && c.canvas !== uiTopCanvas) return false;
    var t=c.getTransform(), r=canvas.getBoundingClientRect(), parent=canvas.parentNode, pr=parent.getBoundingClientRect();
    var sx=r.width/canvas.width, sy=r.height/canvas.height;
    hearthFireGPU.draw({ x:r.left-pr.left+(t.a*x+t.c*y+t.e)*sx,
      y:r.top-pr.top+(t.b*x+t.d*y+t.f)*sy, w:Math.abs(t.a*w)*sx, h:Math.abs(t.d*h)*sy },parent);
    return true;
  }
