  /* ---- A small furnace model, in game time rather than laboratory units. ---- */
  // Moisture, volatile fuel and fixed carbon are separate reservoirs. The hot
  // skin conducts into a slower core; exposed faces and underfire air determine
  // oxidation. Only actual reactions contribute to boiler/forge output.
  function hearthFuelState(b) {
    if (b.volatile != null) return;
    var volatileFraction = b.material === 'wood' ? 0.76 : 0.28;
    b.volatile = Math.min(volatileFraction, Math.max(0, b.fuel - (1 - volatileFraction)));
    b.carbon = Math.max(0, b.fuel - b.volatile);
    b.moisture = b.lit || b.fuel < 0.99 ? 0 : 0.055 + b.seed * 0.045;
    b.core = b.lit ? b.heat * 0.65 : 0;
    b.oxygen = 1; b.flame = 0; b.smoke = 0; b.steam = 0; b.reaction = 0;
    b.coating = b.ash ? 1 : (1 - b.fuel) * 0.65;
    b.stage = b.ash ? 'ash' : b.lit ? 'kindling' : 'cold';
  }
  function hearthSurfaceAir(bed, b) {
    var vertices = b.vertices, open = 0, perimeter = 0;
    for (var i = 0; i < vertices.length; i++) {
      var a = vertices[i], v = vertices[(i + 1) % vertices.length];
      var dx = v[0] - a[0], dy = v[1] - a[1], length = Math.hypot(dx, dy);
      var nx = dy / length, ny = -dx / length, x = (a[0] + v[0]) * 0.5, y = (a[1] + v[1]) * 0.5;
      var exposed = 1;
      for (var j = 0; j < bed.chunks.length; j++) {
        var other = bed.chunks[j];
        if (other === b || other.held || Math.hypot(other.x - x, other.y - y) > other.r + 14) continue;
        if (hearthInside(other, x + nx * 8, y + ny * 8, 2)) exposed *= other.ash ? 0.08 : 0.18;
      }
      if (x + nx * 8 < 0 || x + nx * 8 > 320) exposed *= 0.1;
      // The grate admits primary air from underneath. Spent ash blocks the
      // inlet; removing ash restores it even while the upper bed still burns.
      if (y + ny * 8 >= HEARTH_FLOOR) exposed *= Math.max(0.12, 1 - bed.ashLoad * 0.8);
      open += exposed * length; perimeter += length;
    }
    return Math.max(0.12, Math.min(1.25, (0.16 + open / perimeter * 0.84) * (0.88 + bed.air * 0.8) * (1 - bed.ashLoad * 0.3)));
  }
  function hearthBurnStep(bed, h) {
    var bodies = bed.chunks, targets = [], i, j, b;
    bed.ashLoad = Math.min(0.92,hearthAshMass(bed)/0.025);
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i]; hearthFuelState(b); hearthWorldHull(b);
      if (b.ash && !b.held) bed.ashLoad += b.baseR * 1.3 / 320;
    }
    bed.ashLoad = Math.min(0.92, bed.ashLoad);
    // Gather before applying: heat cannot cascade through the array in one tick.
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      var neighbor = 0, oxygen = b.held ? 0 : hearthSurfaceAir(bed, b);
      if (!b.held) {
        for (j = 0; j < bodies.length; j++) {
          var other = bodies[j];
          if (other === b || other.held || other.heat < 0.2 || Math.hypot(b.x - other.x, b.y - other.y) > b.r + other.r + 22) continue;
          var gap = Math.max(hearthFaceSeparation(b.vertices, other.vertices).gap, hearthFaceSeparation(other.vertices, b.vertices).gap);
          if (gap < 20) neighbor = Math.max(neighbor, other.heat * (1 - Math.max(0, gap) / 45));
        }
        var bottom = 0;
        for (j = 0; j < b.vertices.length; j++) bottom = Math.max(bottom, b.vertices[j][1]);
        if (bed.pilot && bottom > 195) neighbor = Math.max(neighbor, 0.86);
      }
      targets.push({ neighbor: neighbor, oxygen: oxygen });
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i]; var target = targets[i];
      b.oxygen += (target.oxygen - b.oxygen) * (1 - Math.exp(-h * 3));
      b.steam = 0; b.flame = 0; b.smoke = 0; b.reaction = 0;
      if (b.held) {
        b.heat *= Math.exp(-h * 0.15); b.core += (b.heat - b.core) * h * 0.1; b.surfaceKelvin = 300 + b.heat * 1200; b.coreKelvin = 300 + b.core * 1200; continue;
      }
      var dry = Math.min(b.moisture, Math.max(0, b.heat - 0.12) * h * 0.10);
      b.moisture -= dry; b.steam = dry / h * 12;
      var warmth = Math.max(0, Math.min(1, (b.heat - 0.34) / 0.4));
      var gas = !b.ash ? Math.min(b.volatile, h / b.life * 1.75 * warmth * (1 - Math.min(0.85, b.moisture * 9))) : 0;
      // Hot coal can distill smoky gas without a flame. A live ignition source
      // is still required for a cold boiler; the forge alone has a banked ember.
      if (!b.ash && !b.lit && b.heat > 0.61 && (target.neighbor > 0.62 || b.core > 0.64)) hearthLightChunk(bed, b);
      var gasEfficiency = b.lit ? Math.min(1, b.oxygen * 1.5) : 0;
      var charHeat = Math.max(0, Math.min(1, (b.core - 0.36) / 0.36));
      var char = b.lit ? Math.min(b.carbon, h / b.life * charHeat * (0.45 + b.oxygen * 0.9) * (1 - b.coating * 0.38)) : 0;
      b.volatile -= gas; b.carbon -= char; b.fuel = Math.max(0, b.volatile + b.carbon);
      b.flame = Math.min(1, gas / h * b.life * gasEfficiency * 0.72);
      b.smoke = Math.min(1, gas / h * b.life * (1 - gasEfficiency * 0.87) * 0.8 + (b.lit ? (1 - Math.min(1, b.oxygen)) * 0.16 : 0));
      b.reaction = Math.min(1.5, (gas * gasEfficiency * 0.7 + char * 1.15) / h * b.life);
      var own = b.lit ? 0.58 + Math.min(1, b.reaction) * 0.38 + Math.min(1, b.oxygen) * 0.04 : 0;
      if (b.ash) own = 0;
      var hot = Math.max(target.neighbor * 0.96, own);
      b.heat += (hot - b.heat) * (1 - Math.exp(-h * (hot > b.heat ? 0.72 : 0.22)));
      b.heat = Math.max(0, Math.min(1, b.heat - dry * 1.4));
      b.core += (b.heat - b.core) * (1 - Math.exp(-h * 0.24 * 32 / b.baseR));
      b.surfaceKelvin = 300 + b.heat * 1200; b.coreKelvin = 300 + b.core * 1200;
      b.coating = Math.min(1, b.coating + char * 0.9);
      if (b.fuel < 0.00001) {
        b.fuel = 0; b.volatile = 0; b.carbon = 0; b.lit = false; b.ash = true; b.coating = 1;
        b.flame = 0; b.smoke = 0; b.reaction = 0;
      }
      b.stage = b.ash ? (b.heat > 0.18 ? 'cooling ash' : 'ash') : b.moisture > 0.008 && b.heat > 0.15 ? 'drying' :
        !b.lit ? (b.heat > 0.15 ? 'warming' : 'cold') : b.oxygen < 0.4 ? 'smoldering' :
        b.volatile > 0 || b.flame > 0 ? 'flaming' : b.fuel > 0.12 ? 'coke' : 'embers';
      // The same hull contracts for rendering, picking and contacts. A spent
      // piece retains a brittle mineral skeleton, then cools in the ash pan.
      var size = b.baseR * Math.sqrt(0.20 + b.fuel * 0.80);
      b.r += (size - b.r) * (1 - Math.exp(-h * 1.5));
      hearthMass(b);
    }
  }
  function hearthBurnSummary(bed) {
    if (!bed.chunks.length) return bed.ash.length ? 'Spent ash: sweep the grate' : 'Load coal, then strike flint';
    var counts = {}, live = 0, fuel = 0, fuelWeight = 0, oxygen = 0, dominant = 'cold', best = 0;
    for (var i = 0; i < bed.chunks.length; i++) {
      var b = bed.chunks[i]; if (b.held) continue;
      if (!b.ash) { live++; fuel += b.fuel*(b.fuelShare||1); fuelWeight += b.fuelShare||1; oxygen += b.oxygen; }
      counts[b.stage] = (counts[b.stage] || 0) + (b.lit ? 20 : 1);
      if (counts[b.stage] > best) { best = counts[b.stage]; dominant = b.stage; }
    }
    if (!live) return 'Spent ash: sweep the grate';
    var state = dominant === 'coke' ? 'Glowing coke' : dominant.charAt(0).toUpperCase() + dominant.slice(1);
    return state + '  /  Fuel ' + Math.round(fuel / fuelWeight * 100) + '%' +
      (bed.ashLoad > 0.3 ? '  /  Sweep ash for air' : oxygen / live < 0.45 ? '  /  Open the pile' : '  /  Air ' + Math.round(oxygen / live * 100) + '%');
  }
