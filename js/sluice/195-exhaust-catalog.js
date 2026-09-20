  // Rig exhausts are cosmetic, owned for the lifetime of this save. The six
  // imported recipes retain the owner's demo export settings. Only Velvet
  // rope's color changes: crimson replaces the original pale rose.
  var RIG_EXHAUST_CATALOG = [{
    id: 'stock', name: 'Stock exhaust', price: 0,
    description: "The rig's original gold exhaust.",
    colors: ['#ffd119', '#ad6e0d'], recipe: null,
    physics: { HEAT: 0, COOLING: 1, BUOYANCY: 0, WEIGHT: 0, VISCOSITY: 0, EDGE_SPIN: 0 },
    scale: { id: 'default', values: { rad: 1, dye: 1, lift: 1, curl: 0 } },
    tuning: { mass: 1, motion: 1, size: 1 }
  }];

  function rigExhaustAddExport(recipe, scale, tuning, physics, price) {
    RIG_EXHAUST_CATALOG.push({
      id: recipe.id, name: recipe.name, price: price,
      description: recipe.description, colors: recipe.colors,
      recipe: recipe, scale: scale, tuning: tuning,
      physics: physics || { HEAT: 0, COOLING: 1, BUOYANCY: 0, WEIGHT: 0, VISCOSITY: 0, EDGE_SPIN: 0 }
    });
  }

  rigExhaustAddExport({
    "id": "copperhead",
    "name": "Copperhead",
    "family": "Foundry",
    "description": "Dense copper folds roll outward from a narrow gold seam.",
    "colors": ["#e49b38","#8f482d"],
    "fluid": {"CURL": 24,"DENSITY_DISSIPATION": 0.4,"VELOCITY_DISSIPATION": 0.4,"wind_x": 0,"wind_above_y": 0},
    "source": {"radius": 2.7,"density": 1.35,"lift": 0.65,"sway": 0.65,"spread": 2,"frequency": 1,"pulse": 0,"pulseHz": 1,"sharpness": 2,"split": 0,"fan": 0,"colorRate": 0,"colorOffset": 0.55,"core": 0.18,"idleHold": 20},
    "palette": [[0.8941176470588236,0.6078431372549019,0.2196078431372549],[0.5607843137254902,0.2823529411764706,0.17647058823529413]],
    "samplerVersion": 1
  }, {"id": "tower","values": {"rad": 2.6,"dye": 0.75,"lift": 1.8,"curl": 4}},
    {"mass": 0.25,"motion": 0.65,"size": 0.65},
    null, 750);

  rigExhaustAddExport({
    "id": "dragon",
    "name": "Jade dragon",
    "family": "Living",
    "description": "Two jade jets lash apart and fold back around a gold center.",
    "colors": ["#d4bc38","#179b75"],
    "fluid": {"CURL": 32,"DENSITY_DISSIPATION": 0.48,"VELOCITY_DISSIPATION": 0.08,"wind_x": 0,"wind_above_y": 0},
    "source": {"radius": 1.15,"density": 1.3,"lift": 2.1,"sway": 1,"spread": 2,"frequency": 1.6,"pulse": 0,"pulseHz": 1,"sharpness": 2,"split": 8,"fan": 20,"colorRate": 0,"colorOffset": 1,"core": 0.28,"idleHold": 20},
    "palette": [[0.8313725490196079,0.7372549019607844,0.2196078431372549],[0.09019607843137255,0.6078431372549019,0.4588235294117647]],
    "samplerVersion": 1
  }, {"id": "tower","values": {"rad": 2.6,"dye": 0.75,"lift": 1.8,"curl": 4}},
    {"mass": 0.4,"motion": 0.25,"size": 0.6},
    null, 1500);

  rigExhaustAddExport({
    "id": "velvet-rope",
    "name": "Velvet rope",
    "family": "Fluid experiments",
    "description": "A slow, thick crimson plume stretches into smooth folds. Strong internal friction keeps the flow together.",
    "colors": ["#b51238","#6e0927"],
    "samplerVersion": 3,
    "physics": {"HEAT": 1.3,"COOLING": 0.22,"BUOYANCY": 40,"WEIGHT": 18,"VISCOSITY": 28,"EDGE_SPIN": 0},
    "fluid": {"OPTICAL_DENSITY": 1,"OPTICAL_BRIGHTNESS": 0.64,"OPTICAL_ABSORPTION": 3.2,"CURL": 2,"DENSITY_DISSIPATION": 0.2,"VELOCITY_DISSIPATION": 0.45,"wind_x": 0,"wind_above_y": 0},
    "source": {"mode": "jet","density": 0.2,"radius": 2.7,"width": 2,"lift": 0.4,"fan": 0,"pulse": 0,"period": 2.6,"duty": 0.32,"colorRate": 0,"idleHold": 24},
    "palette": [[0.7098039215686275,0.07058823529411765,0.2196078431372549],[0.43137254901960786,0.03529411764705882,0.15294117647058825]]
  }, {"id": "default","values": {"rad": 1,"dye": 1,"lift": 1,"curl": 0}},
    {"mass": 1.05,"motion": 1.1,"size": 0.55},
    {"HEAT": 1.3,"COOLING": 0.22,"BUOYANCY": 40,"WEIGHT": 18,"VISCOSITY": 28,"EDGE_SPIN": 0}, 2500);

  rigExhaustAddExport({
    "id": "countercurrent",
    "name": "Countercurrent",
    "family": "Fluid experiments",
    "description": "A pale central jet tears through slower teal edges. Opposing streams curl into a ragged, interlocking wake.",
    "colors": ["#acd7cb","#638cbd"],
    "samplerVersion": 3,
    "physics": {"HEAT": 1.6,"COOLING": 0.35,"BUOYANCY": 50,"WEIGHT": 25,"VISCOSITY": 1,"EDGE_SPIN": 0},
    "fluid": {"OPTICAL_DENSITY": 1,"CURL": 26,"DENSITY_DISSIPATION": 0.3,"VELOCITY_DISSIPATION": 0.12,"wind_x": 0,"wind_above_y": 0},
    "source": {"mode": "shear","density": 0.16,"radius": 2.2,"width": 15,"lift": 1.3,"fan": 0,"pulse": 0,"period": 2.6,"duty": 0.32,"colorRate": 0,"idleHold": 24},
    "palette": [[0.6745098039215687,0.8431372549019608,0.796078431372549],[0.38823529411764707,0.5490196078431373,0.7411764705882353]]
  }, {"id": "default","values": {"rad": 1,"dye": 1,"lift": 1,"curl": 0}},
    {"mass": 1,"motion": 0.75,"size": 1.2},
    {"HEAT": 1.6,"COOLING": 0.35,"BUOYANCY": 50,"WEIGHT": 25,"VISCOSITY": 1,"EDGE_SPIN": 0}, 4500);

  rigExhaustAddExport({
    "id": "witchfire",
    "name": "Witchfire",
    "family": "Fluid experiments",
    "description": "Thin green smoke accelerates as it rises, pulling into sharp tongues and shedding restless green wisps.",
    "colors": ["#b4e869","#52bca3"],
    "samplerVersion": 3,
    "physics": {"HEAT": 4,"COOLING": 1.15,"BUOYANCY": 240,"WEIGHT": 3,"VISCOSITY": 0.5,"EDGE_SPIN": 0},
    "fluid": {"OPTICAL_DENSITY": 1,"CURL": 34,"DENSITY_DISSIPATION": 0.52,"VELOCITY_DISSIPATION": 0.07,"wind_x": 0,"wind_above_y": 0},
    "source": {"mode": "jet","density": 0.15,"radius": 2.5,"width": 3,"lift": 0.5,"fan": 0,"pulse": 0,"period": 2.6,"duty": 0.32,"colorRate": 0.12,"idleHold": 24},
    "palette": [[0.7058823529411765,0.9098039215686274,0.4117647058823529],[0.3215686274509804,0.7372549019607844,0.6392156862745098]]
  }, {"id": "default","values": {"rad": 1,"dye": 1,"lift": 1,"curl": 0}},
    {"mass": 1,"motion": 1,"size": 1},
    {"HEAT": 4,"COOLING": 1.15,"BUOYANCY": 240,"WEIGHT": 3,"VISCOSITY": 0.5,"EDGE_SPIN": 0}, 7500);

  rigExhaustAddExport({
    "id": "spiral-kiln",
    "name": "Spiral kiln",
    "family": "Fluid experiments",
    "description": "The smoke stirs along its own edges, winding gold and red layers into living coils.",
    "colors": ["#e3ae61","#b36176"],
    "samplerVersion": 3,
    "physics": {"HEAT": 2,"COOLING": 0.45,"BUOYANCY": 65,"WEIGHT": 28,"VISCOSITY": 4,"EDGE_SPIN": 230},
    "fluid": {"OPTICAL_DENSITY": 1,"CURL": 8,"DENSITY_DISSIPATION": 0.24,"VELOCITY_DISSIPATION": 0.12,"wind_x": 0,"wind_above_y": 0},
    "source": {"mode": "jet","density": 0.17,"radius": 3.8,"width": 10,"lift": 0.25,"fan": 0,"pulse": 0,"period": 2.6,"duty": 0.32,"colorRate": 0,"idleHold": 24},
    "palette": [[0.8901960784313725,0.6823529411764706,0.3803921568627451],[0.7019607843137254,0.3803921568627451,0.4627450980392157]]
  }, {"id": "default","values": {"rad": 1,"dye": 1,"lift": 1,"curl": 0}},
    {"mass": 1,"motion": 1,"size": 1},
    {"HEAT": 2,"COOLING": 0.45,"BUOYANCY": 65,"WEIGHT": 28,"VISCOSITY": 4,"EDGE_SPIN": 230}, 12000);

  // The rainbow edition shares the demo sampler, so exported experiments
  // and the purchased plume follow the same source/color path.
  var rigExhaustRainbow = window.SmokePresets && window.SmokePresets.byId.prismatic;
  if (rigExhaustRainbow) rigExhaustAddExport(
    JSON.parse(JSON.stringify(rigExhaustRainbow)),
    { id: 'default', values: { rad: 1, dye: 1, lift: 1, curl: 0 } },
    { mass: 1, motion: 1, size: 1 },
    Object.assign({}, rigExhaustRainbow.physics), 25000
  );

  var rigExhaustState = { owned: { stock: true }, equipped: 'stock', settings: {} };
  var rigExhaustSaveTimer = 0;
  var RIG_EXHAUST_LIMITS = {
    tuning: { mass: [0.1, 2] },
    appearance: { sharpness: [0, 1], lifetime: [0.5, 3] }
  };

  function rigExhaustCleanSettings(data) {
    var result = {};
    if (!data || typeof data !== 'object') return result;
    Object.keys(RIG_EXHAUST_LIMITS).forEach(function (group) {
      var values = data[group];
      if (!values || typeof values !== 'object') return;
      Object.keys(RIG_EXHAUST_LIMITS[group]).forEach(function (key) {
        var value = values[key], limits = RIG_EXHAUST_LIMITS[group][key];
        if (typeof value !== 'number' || !isFinite(value)) return;
        if (!result[group]) result[group] = {};
        result[group][key] = Math.max(limits[0], Math.min(limits[1], value));
      });
    });
    return result;
  }

  // Copies in recipe units: UI values stay stable across zoom/resolution,
  // and edits never mutate a catalog entry or another exhaust's settings.
  function rigExhaustSettings() {
    var def = rigExhaustGet(), saved = rigExhaustState.settings[def.id] || {};
    return { id: def.id, name: def.name, description: def.description, custom: !!def.recipe,
      tuning: Object.assign({}, def.tuning, saved.tuning),
      appearance: Object.assign({ sharpness: 0, lifetime: 1 }, saved.appearance),
      physics: Object.assign({}, def.physics) };
  }

  function rigExhaustFlushSettings() {
    if (!rigExhaustSaveTimer) return;
    clearTimeout(rigExhaustSaveTimer);
    rigExhaustSaveTimer = 0;
    saveNow('exhaust-settings');
  }

  function rigExhaustSetSetting(group, key, value) {
    var def = rigExhaustGet();
    if (!def.recipe || !Object.prototype.hasOwnProperty.call(RIG_EXHAUST_LIMITS, group) ||
        !Object.prototype.hasOwnProperty.call(RIG_EXHAUST_LIMITS[group], key) ||
        typeof value !== 'number' || !isFinite(value)) return false;
    var limits = RIG_EXHAUST_LIMITS[group][key];
    var saved = rigExhaustState.settings[def.id] || (rigExhaustState.settings[def.id] = {});
    if (!saved[group]) saved[group] = {};
    saved[group][key] = Math.max(limits[0], Math.min(limits[1], value));
    rigExhaustApply();
    // A dragged range can send dozens of events. Apply each one live, but
    // serialize the world only after the gesture or a short idle interval.
    if (rigExhaustSaveTimer) clearTimeout(rigExhaustSaveTimer);
    rigExhaustSaveTimer = setTimeout(rigExhaustFlushSettings, 180);
    return true;
  }

  function rigExhaustRestoreSettings() {
    var def = rigExhaustGet();
    if (!def.recipe) return false;
    delete rigExhaustState.settings[def.id];
    if (rigExhaustSaveTimer) clearTimeout(rigExhaustSaveTimer);
    rigExhaustSaveTimer = 0;
    rigExhaustApply();
    saveNow('exhaust-restore');
    return true;
  }

  function rigExhaustGet(id) {
    if (id == null) id = rigExhaustState.equipped;
    for (var i = 0; i < RIG_EXHAUST_CATALOG.length; i++) {
      if (RIG_EXHAUST_CATALOG[i].id === id) return RIG_EXHAUST_CATALOG[i];
    }
    return null;
  }

  function rigExhaustIsOwned(id) {
    return !!rigExhaustGet(id) && rigExhaustState.owned[id] === true;
  }

  function rigExhaustSelect(id) {
    if (!rigExhaustIsOwned(id)) return false;
    if (id !== 'stock' && typeof rigExhaustAvailable === 'function' && !rigExhaustAvailable()) return false;
    if (rigExhaustState.equipped === id) return true;
    rigExhaustState.equipped = id;
    if (typeof rigExhaustApply === 'function') rigExhaustApply();
    saveNow('exhaust-equip');
    return true;
  }

  function rigExhaustPurchase(id) {
    var item = rigExhaustGet(id);
    if (!item) return { ok: false, reason: 'Unknown exhaust' };
    if (id !== 'stock' && typeof rigExhaustAvailable === 'function' && !rigExhaustAvailable()) {
      return { ok: false, reason: 'Smoke effects unavailable' };
    }
    // Validate against live state. A stale shop action or double tap cannot
    // charge twice, and an owned look is always free to equip again.
    if (rigExhaustIsOwned(id)) return { ok: rigExhaustSelect(id) };
    if (!devMode && (!isFinite(money) || money < item.price)) {
      return { ok: false, reason: 'Need $' + item.price.toLocaleString() };
    }
    if (!devMode) money -= item.price;
    rigExhaustState.owned[id] = true;
    rigExhaustState.equipped = id;
    if (typeof rigExhaustApply === 'function') rigExhaustApply();
    saveNow('exhaust-purchase');
    if (typeof track === 'function') track('shop_purchase', {
      item: 'exhaust:' + id, cost: item.price, depth: depthRecord, dev: !!devMode
    });
    return { ok: true };
  }

  function rigExhaustReset() {
    if (rigExhaustSaveTimer) clearTimeout(rigExhaustSaveTimer);
    rigExhaustSaveTimer = 0;
    rigExhaustState = { owned: { stock: true }, equipped: 'stock', settings: {} };
    if (typeof rigExhaustApply === 'function') rigExhaustApply();
  }

  function rigExhaustSave() {
    return {
      owned: RIG_EXHAUST_CATALOG.filter(function (item) {
        return rigExhaustIsOwned(item.id);
      }).map(function (item) { return item.id; }),
      equipped: rigExhaustState.equipped,
      settings: JSON.parse(JSON.stringify(rigExhaustState.settings))
    };
  }

  function rigExhaustLoad(data) {
    // Additive save field: legacy saves keep stock, unknown IDs are ignored,
    // and a damaged save cannot equip an exhaust the player does not own.
    var owned = { stock: true };
    if (data && Array.isArray(data.owned)) {
      for (var i = 0; i < data.owned.length; i++) {
        var id = data.owned[i];
        if (typeof id === 'string' && rigExhaustGet(id)) owned[id] = true;
      }
    }
    var equipped = data && typeof data.equipped === 'string' &&
      owned[data.equipped] === true && rigExhaustGet(data.equipped) ? data.equipped : 'stock';
    var settings = {};
    RIG_EXHAUST_CATALOG.forEach(function (def) {
      if (!def.recipe || !owned[def.id] || !data || !data.settings) return;
      var clean = rigExhaustCleanSettings(data.settings[def.id]);
      if (Object.keys(clean).length) settings[def.id] = clean;
    });
    if (rigExhaustSaveTimer) clearTimeout(rigExhaustSaveTimer);
    rigExhaustSaveTimer = 0;
    rigExhaustState = { owned: owned, equipped: equipped, settings: settings };
    if (typeof rigExhaustApply === 'function') rigExhaustApply();
  }
