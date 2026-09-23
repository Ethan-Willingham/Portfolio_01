  /* ---- Fire room: bounded coal bodies and local heat, independent of the UI ---- */
  var HEARTH_STEP = 1 / 120, HEARTH_CAP = 18;
  var hearthBeds = { boiler: hearthMakeBed(false), forge: hearthMakeBed(true) };

  function hearthMakeBed(pilot) {
    return { chunks: [], sparks: [], ash: [], pilot: !!pilot, nextId: 1, time: 0,
      heat: 0, power: 0, fuelSeconds: 0, air: 0, impact: 0, bank: 0, sparkId: 0, burnClock: 0, ashLoad: 0, contacts: {} };
  }
  function hearthNumber(value, fallback, lo, hi) {
    return typeof value === 'number' && isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
  }
  function hearthSeed(id) {
    var n = Math.sin(id * 127.1 + 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function hearthAddChunk(kind, x, y, material) {
    var bed = hearthBeds[kind];
    if (!bed || bed.chunks.length >= HEARTH_CAP) return null;
    var id = bed.nextId++, seed = hearthSeed(id + (bed.pilot ? 193 : 0));
    var r = 29 + seed * 10;
    var b = { id: id, x: hearthNumber(x, 160, r, 320 - r),
      y: hearthNumber(y, 12, -80, 210 - r), vx: 0, vy: 0, r: r, baseR: r,
      angle: seed * Math.PI * 2, spin: 0, seed: seed,
      life: 90 + seed * 30, fuel: 1, heat: 0, lit: false, ash: false, held: false, material: material === 'wood' ? 'wood' : 'coal' };
    hearthFuelState(b); hearthMass(b); hearthWorldHull(b);
    b.dryKg = 0.018*Math.pow(b.baseR/34,2); b.fuelShare = 1; b.generation = 0; b.damage = 0;
    bed.chunks.push(b); hearthMeasure(bed);
    return b;
  }
  function hearthRemoveChunk(kind, id) {
    var bed = hearthBeds[kind];
    if (!bed) return null;
    for (var i = 0; i < bed.chunks.length; i++) {
      if (bed.chunks[i].id !== id) continue;
      var b = bed.chunks.splice(i, 1)[0];
      b.held = false; hearthMeasure(bed); return b;
    }
    return null;
  }
  function hearthSparks(bed, x, y, count, strength) {
    for (var i = 0; i < count && bed.sparks.length < 64; i++) {
      var seed = hearthSeed(++bed.sparkId + 911);
      bed.sparks.push({ x: x, y: y, vx: (seed - 0.5) * 120 * strength,
        vy: -(45 + hearthSeed(bed.sparkId + 77) * 115) * strength,
        t: 0, life: 0.35 + seed * 0.7, r: 0.7 + seed * 1.1, heat: 1, seed: seed });
    }
  }
  function hearthLightChunk(bed, b) {
    if (b.ash || b.fuel <= 0 || b.held || b.lit) return false;
    hearthFuelState(b);
    b.lit = true; b.heat = Math.max(b.heat, 0.72); b.core = Math.max(b.core, 0.32);
    if (typeof hearthFireIgnite === 'function') hearthFireIgnite(bed, b);
    hearthSparks(bed, b.x, b.y - b.r * 0.6, 9, 1);
    return true;
  }
  function hearthIgnite(kind) {
    var bed = hearthBeds[kind], target = null;
    if (!bed) return false;
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      if (b.held || b.ash || b.lit || b.fuel <= 0) continue;
      if (!target || b.y > target.y) target = b;
    }
    return target ? hearthLightChunk(bed, target) : false;
  }
  function hearthPump(kind) {
    var bed = hearthBeds[kind];
    if (!bed) return false;
    bed.air = Math.min(1, bed.air + 0.48);
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      if (b.lit && !b.held) hearthSparks(bed, b.x, b.y - b.r, 3, 1.2);
    }
    return true;
  }
  function hearthMeasure(bed) {
    var fuel = 0, output = 0;
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i];
      fuel += b.fuel * b.life * (b.fuelShare || 1);
      if (b.lit && !b.held) output += b.reaction * Math.min(1, b.fuel * 16) * (b.fuelShare || 1);
    }
    bed.fuelSeconds = fuel;
    // The forge concentrates one piece under the work. The wide boiler grate
    // needs three pieces for full output, or fewer with steady bellows work.
    bed.power = typeof hearthFireOwns === 'function' && hearthFireOwns(bed) ? Math.min(1, Math.max(0, hearthFireGPU.outputKW / 2.0)) :
      Math.min(1, output * (bed.pilot ? 0.80 + bed.air * 0.35 : 0.39 + bed.air * 0.19));
  }
  function hearthStepBed(bed) {
    var h = HEARTH_STEP, bodies = bed.chunks, i, b;
    bed.sweep = Math.max(0,(bed.sweep||0)-h);
    bed.time += h; bed.air *= Math.exp(-h / 2.7); bed.impact *= Math.exp(-h * 7);
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.held) continue;
      b.vx = hearthNumber(b.vx, 0, -600, 600) * 0.9998;
      b.vy = hearthNumber(b.vy, 0, -600, 600) + 520 * h;
      b.spin = hearthNumber(b.spin, 0, -18, 18) * 0.9995;
      b.x += b.vx * h; b.y += b.vy * h; b.angle += b.spin * h;
    }
    if (bodies.length) hearthSolve(bed);
    // Chemistry runs at 30 Hz, on the same fixed clock as the 120 Hz contacts.
    bed.burnClock++;
    if (bed.burnClock >= 4) {
      if (typeof hearthFireOwns === 'function' && hearthFireOwns(bed)) hearthFireSyncBodies(bed, h * 4);
      else hearthBurnStep(bed, h * 4);
      hearthFractureStep(bed,h*4);
      bed.burnClock = 0;
    }
    hearthAshStep(bed,h);
    hearthMeasure(bed);
    bed.heat += (bed.power - bed.heat) * (1 - Math.exp(-h / (bed.power > bed.heat ? 2.6 : 9)));
    for (i = bed.sparks.length - 1; i >= 0; i--) {
      var s = bed.sparks[i];
      s.t += h;
      if (s.t >= s.life) { bed.sparks.splice(i, 1); continue; }
      s.vx *= 0.993; s.vy -= 12 * h;
      s.x += s.vx * h; s.y += s.vy * h; s.heat = 1 - s.t / s.life;
    }
  }
  function hearthTick(dt) {
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) return;
    // A suspended tab never retroactively burns its fuel or tunnels through a wall.
    dt = Math.min(dt, 0.25);
    var kinds = ['boiler', 'forge'];
    for (var k = 0; k < kinds.length; k++) {
      var bed = hearthBeds[kinds[k]];
      bed.bank = Math.min(0.25, bed.bank + dt);
      while (bed.bank + 1e-10 >= HEARTH_STEP) {
        hearthStepBed(bed); bed.bank = Math.max(0, bed.bank - HEARTH_STEP);
      }
    }
  }
  function hearthSave() {
    var result = { version: 4 }, kinds = ['boiler', 'forge'];
    for (var k = 0; k < kinds.length; k++) {
      var bed = hearthBeds[kinds[k]], chunks = [];
      for (var i = 0; i < bed.chunks.length; i++) {
        var b = bed.chunks[i];
        chunks.push({ id: b.id, x: b.x, y: b.y, vx: b.held ? 0 : b.vx, vy: b.held ? 0 : b.vy,
          r: b.r, baseR: b.baseR, angle: b.angle, spin: b.held ? 0 : b.spin, seed: b.seed,
          shape: b.shape || null, massRef: b.massRef, dryKg: b.dryKg, fuelShare: b.fuelShare,
          generation: b.generation || 0, damage: b.damage || 0, fractureWait: b.fractureWait || 0,
          life: b.life, fuel: b.fuel, heat: b.heat, lit: b.lit, ash: b.ash, material: b.material || 'coal',
          surfaceKelvin: b.surfaceKelvin || 300 + b.heat * 1200, coreKelvin: b.coreKelvin || 300 + b.core * 1200, volatile: b.volatile, carbon: b.carbon, moisture: b.moisture, core: b.core, oxygen: b.oxygen,
          flame: b.flame, smoke: b.smoke, steam: b.steam, reaction: b.reaction, coating: b.coating, stage: b.stage, devSupplied: b.devSupplied === true });
      }
      result[kinds[k]] = { chunks: chunks, nextId: bed.nextId, time: bed.time,
        heat: bed.heat, air: bed.air, burnClock: bed.burnClock, ashLoad: bed.ashLoad,
        ash: bed.ash.map(function(g){return Object.assign({},g);}) };
    }
    return result;
  }
  function hearthRestore(data) {
    hearthReset();
    if (!data || typeof data !== 'object') return false;
    var kinds = ['boiler', 'forge'], restored = false;
    for (var k = 0; k < kinds.length; k++) {
      var src = data[kinds[k]], bed = hearthBeds[kinds[k]];
      if (!src || typeof src !== 'object' || !Array.isArray(src.chunks)) continue;
      restored = true;
      bed.time = hearthNumber(src.time, 0, 0, 1e9);
      bed.heat = hearthNumber(src.heat, 0, 0, 1); bed.air = hearthNumber(src.air, 0, 0, 1);
      bed.burnClock = Math.floor(hearthNumber(src.burnClock, 0, 0, 3));
      bed.ashLoad = hearthNumber(src.ashLoad, 0, 0, 0.92);
      var used = {};
      for (var i = 0; i < Math.min(data.version>=4 ? HEARTH_FRAGMENT_CAP : HEARTH_CAP, src.chunks.length); i++) {
        var raw = src.chunks[i];
        if (!raw || typeof raw !== 'object') continue;
        // Restore fragment capacity without opening additional fresh-fuel slots.
        var parked = bed.chunks; if(parked.length>=HEARTH_CAP)bed.chunks=[];
        var b = hearthAddChunk(kinds[k], raw.x, raw.y, raw.material);
        if(bed.chunks!==parked){bed.chunks=parked;bed.chunks.push(b);}
        var id = Math.floor(hearthNumber(raw.id, b.id, 1, 1e9));
        while (used[id]) id++;
        used[id] = true; b.id = id; bed.nextId = Math.max(bed.nextId, id + 1);
        b.seed = hearthNumber(raw.seed, b.seed, 0, 1);
        // Keep old paid fuel/lifetime and existing positions. Older small lumps
        // retain their size; newly mined coal uses the larger hulls.
        b.baseR = hearthNumber(raw.baseR, hearthNumber(raw.r, b.r, 13, 39), data.version>=4?3:13, data.version>=4?80:39);
        b.r = hearthNumber(raw.r, b.baseR, b.baseR * 0.4, b.baseR);
        b.x = hearthNumber(raw.x, 160, -40, 360);
        b.y = hearthNumber(raw.y, 12, -320, 250);
        b.vx = hearthNumber(raw.vx, 0, -600, 600); b.vy = hearthNumber(raw.vy, 0, -600, 600);
        b.angle = hearthNumber(raw.angle, 0, -1e6, 1e6); b.spin = hearthNumber(raw.spin, 0, -18, 18);
        b.life = hearthNumber(raw.life, 90 + b.seed * 30, 48, 120);
        b.fuel = hearthNumber(raw.fuel, 1, 0, 1); b.heat = hearthNumber(raw.heat, 0, 0, 1);
        b.ash = raw.ash === true || b.fuel <= 0;
        if (b.ash) b.fuel = 0;
        b.lit = raw.lit === true && !b.ash;
        b.held = false; b.devSupplied = raw.devSupplied === true;
        b.dryKg = hearthNumber(raw.dryKg,0.018*Math.pow(b.baseR/34,2),0.000001,0.1);
        b.fuelShare = hearthNumber(raw.fuelShare,1,0.00001,1);
        b.generation = Math.floor(hearthNumber(raw.generation,0,0,2)); b.damage = hearthNumber(raw.damage,0,0,1);
        b.fractureWait = hearthNumber(raw.fractureWait,0,0,2);
        if(data.version>=4 && Array.isArray(raw.shape) && raw.shape.length>=3 && raw.shape.length<=16 &&
          raw.shape.every(function(p){return Array.isArray(p)&&p.length===2&&p.every(function(v){return typeof v==='number'&&isFinite(v)&&Math.abs(v)<=1.01;});})) {
          var poly=hearthPolygon(raw.shape),convex=poly.area>0.01;
          for(var v=0;v<raw.shape.length;v++){var a=raw.shape[v],q=raw.shape[(v+1)%raw.shape.length],c=raw.shape[(v+2)%raw.shape.length];if(Math.hypot(q[0]-a[0],q[1]-a[1])<1e-5 || (q[0]-a[0])*(c[1]-q[1])-(q[1]-a[1])*(c[0]-q[0]) < -1e-8)convex=false;}
          if(convex)b.shape=raw.shape.map(function(p){return p.slice();});
        }
        b.massRef = hearthNumber(raw.massRef,0,0,10);
        b.volatile = null; hearthFuelState(b);
        if (data.version >= 2) {
          b.volatile = hearthNumber(raw.volatile, b.volatile, 0, Math.min(b.material === 'wood' ? 0.76 : 0.28, b.fuel));
          b.carbon = hearthNumber(raw.carbon, b.fuel - b.volatile, 0, 1);
          if (Math.abs(b.carbon + b.volatile - b.fuel) > 1e-10) b.carbon = b.fuel - b.volatile;
          b.moisture = hearthNumber(raw.moisture, b.moisture, 0, 0.1);
          b.core = hearthNumber(raw.core, b.core, 0, 1);
          if (data.version >= 3) {
            b.surfaceKelvin = hearthNumber(raw.surfaceKelvin, 300 + b.heat * 1200, 300, 6000);
            b.coreKelvin = hearthNumber(raw.coreKelvin, 300 + b.core * 1200, 300, 6000);
            b.moisture = hearthNumber(raw.moisture, b.moisture, 0, 64);
          }
          b.oxygen = hearthNumber(raw.oxygen, 1, 0, 1.25);
          b.flame = hearthNumber(raw.flame, 0, 0, 1); b.smoke = hearthNumber(raw.smoke, 0, 0, 1);
          b.steam = hearthNumber(raw.steam, 0, 0, 1); b.reaction = hearthNumber(raw.reaction, 0, 0, 1.5);
          b.coating = hearthNumber(raw.coating, b.coating, 0, 1);
          var stages = ['cold', 'kindling', 'drying', 'warming', 'smoldering', 'flaming', 'coke', 'embers', 'cooling ash', 'ash'];
          if (stages.indexOf(raw.stage) >= 0) b.stage = raw.stage;
        }
        hearthHullCache.delete(b); hearthMass(b); hearthWorldHull(b);
      }
      if(data.version>=4 && Array.isArray(src.ash)) for(var a=0;a<Math.min(HEARTH_ASH_CAP,src.ash.length);a++){
        var g=src.ash[a];if(!g || typeof g!=='object')continue;
        bed.ash.push({x:hearthNumber(g.x,160,0,320),y:hearthNumber(g.y,208,-320,210),vx:hearthNumber(g.vx,0,-600,600),vy:hearthNumber(g.vy,0,-600,600),kg:hearthNumber(g.kg,0.0001,0.000001,0.5),heat:hearthNumber(g.heat,0,0,1),seed:hearthNumber(g.seed,0,0,1)});
      }
      var nextId = bed.chunks.reduce(function(n,b){return Math.max(n,b.id+1);},1);
      bed.nextId = Math.max(nextId, Math.floor(hearthNumber(src.nextId, nextId, 1, 1e9)));
      hearthMeasure(bed);
    }
    return restored;
  }
  function hearthReset() {
    if (typeof hearthFireGPU !== 'undefined' && hearthFireGPU && hearthFireGPU.available) hearthFireGPU.reset();
    hearthBeds.boiler = hearthMakeBed(false); hearthBeds.forge = hearthMakeBed(true);
    if (typeof hearthFireBed !== 'undefined') hearthFireBed = hearthBeds.boiler;
  }
