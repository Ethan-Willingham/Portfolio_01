  /* ---- Bulk earth and the level-one sluice economy ---- */
  // A scoop is one cleared dirt/stone tile. The rig bin is separate from ore
  // cargo; a full bin discards new rubble without ever blocking the drill.
  // A material's rolls advance only when its stored scoops enter the hopper.
  // The saved seed, counters and pending pan make closing or reloading neutral.
  var PAYDIRT_ROLL_SCALE = 10000;
  var PAYDIRT_DEPTHS = [0, 60, 130, 200, 270, 340, 400];
  var PAYDIRT_TYPES = [];
  var paydirt = null;
  var paydirtFullNotified = false;

  function paydirtDefine(id, name, kind, band, ore, better, rareName, rareValue, exceptionalName, exceptionalValue, description) {
    var min = PAYDIRT_DEPTHS[band], max = PAYDIRT_DEPTHS[band + 1];
    var oreWeight = Math.round(600 / ((band + 1) * (band + 1)));
    var baseValue = [1, 2, 4, 6, 10, 14][band];
    var type = { id: id, name: name, label: name, kind: kind, minDepth: min, maxDepth: max,
      depth: min + '-' + (max - 1) + ' m', color: ORES[ore].color,
      description: description, loot: [
        { id: id + '-fines', name: 'Fine concentrate', rarity: 'common', value: baseValue, weight: 7000 },
        { id: id + '-' + ore, name: ORES[ore].label, ore: ore, rarity: 'uncommon', value: ORES[ore].value, weight: oreWeight },
        { id: id + '-' + better, name: ORES[better].label, ore: better, rarity: 'uncommon', value: ORES[better].value, weight: 40 },
        { id: id + '-rare', name: rareName, rarity: 'rare', value: rareValue, weight: 10 },
        { id: id + '-exceptional', name: exceptionalName, rarity: 'exceptional', value: exceptionalValue, weight: 2 }
      ] };
    for (var i = 0; i < type.loot.length; i++) {
      type.loot[i].label = type.loot[i].name;
      type.loot[i].chance = type.loot[i].weight / PAYDIRT_ROLL_SCALE;
      type.loot[i].ore = type.loot[i].ore || null;
    }
    PAYDIRT_TYPES.push(type);
  }

  paydirtDefine('topsoil', 'Topsoil', 'dirt', 0, 'coal', 'malachite', 'Amber bee', 450, 'Sunwheel nugget', 1250,
    'Loose surface earth. Small dark grains wash away to reveal copper minerals and ancient amber.');
  paydirtDefine('river-gravel', 'River gravel', 'stone', 0, 'copper', 'gold', 'River pearl', 500, 'Kingfisher sapphire', 1600,
    'Rounded shallow stone. The screen breaks it into gravel before the water reaches the riffles.');
  paydirtDefine('red-clay', 'Red clay', 'dirt', 1, 'bauxite', 'amethyst', 'Red geode', 700, 'Copper rose', 2100,
    'Iron-stained clay from below the roots, with occasional crystals caught in its seams.');
  paydirtDefine('shale', 'Shale', 'stone', 1, 'iron', 'magnetite', 'Fern impression', 800, 'Silver feather', 2400,
    'Thin stone layers break apart under the screen. Fossil impressions sometimes survive the wash.');
  paydirtDefine('ochre-silt', 'Ochre silt', 'dirt', 2, 'silver', 'amber', 'Amber dragonfly', 1300, 'Honeycomb gold', 3600,
    'Dense golden silt from the old buried riverbeds. Silver and amber settle beneath the lighter earth.');
  paydirtDefine('quartz-gravel', 'Quartz gravel', 'stone', 2, 'cinnabar', 'jade', 'Twin quartz heart', 1500, 'Velvet amethyst', 4200,
    'Crushed quartz carries red and green mineral grains, with rare intact crystal clusters.');
  paydirtDefine('glacial-silt', 'Glacial silt', 'dirt', 3, 'cobalt', 'fossil', 'Icebound seed', 1800, 'Blue star sapphire', 5000,
    'Fine earth held in the frozen layer. The wash releases blue minerals and traces of an older world.');
  paydirtDefine('froststone', 'Froststone grit', 'stone', 3, 'lapis', 'turquoise', 'Frost rose', 2000, 'Sleeping trilobite', 5600,
    'Pale fractured stone from the permafrost, carrying blue mineral grains and frozen fossil pockets.');
  paydirtDefine('volcanic-ash', 'Volcanic ash', 'dirt', 4, 'obsidian', 'emerald', 'Glass tear', 2400, 'Fire opal sun', 7000,
    'Dark earth beneath the hot crust. Most is ash; bright stones hide among its heavy grains.');
  paydirtDefine('basalt', 'Basalt grit', 'stone', 4, 'sulfur', 'peridot', 'Olivine cluster', 2600, 'Ember ruby', 7600,
    'Dense volcanic stone is screened into dark grit. Green crystals and sulfur remain in the riffles.');
  paydirtDefine('mantle-dust', 'Mantle dust', 'dirt', 5, 'opal', 'painite', 'Prismatic seed', 3000, 'Heartfire opal', 9000,
    'The deepest pockets of loose earth hold opal grains and the occasional impossible-looking crystal.');
  paydirtDefine('crystal-grit', 'Crystal grit', 'stone', 5, 'platinum', 'diamond', 'Star diamond', 3600, 'Crown of the deep', 12000,
    'Hard glittering stone near the bottom of the mine. Platinum, diamonds and rare crystal crowns settle here.');

  function paydirtType(id) {
    for (var i = 0; i < PAYDIRT_TYPES.length; i++) if (PAYDIRT_TYPES[i].id === id) return PAYDIRT_TYPES[i];
    return null;
  }
  function paydirtLoot(id) {
    for (var i = 0; i < PAYDIRT_TYPES.length; i++) {
      var pool = PAYDIRT_TYPES[i].loot;
      for (var j = 0; j < pool.length; j++) if (pool[j].id === id) return pool[j];
    }
    return null;
  }
  function paydirtReset() {
    paydirt = { held: {}, stored: {}, discovered: {}, washed: {}, finds: {},
      seed: (Math.floor(Math.random() * 4294967296) >>> 0) || 1729,
      rollCounts: {}, pending: null, revision: 0 };
    paydirtFullNotified = false;
  }
  function paydirtCount(map) {
    var total = 0;
    for (var i = 0; i < PAYDIRT_TYPES.length; i++) total += map[PAYDIRT_TYPES[i].id] || 0;
    return total;
  }
  function paydirtUsed() { return paydirt ? paydirtCount(paydirt.held) : 0; }
  function paydirtStored() { return paydirt ? paydirtCount(paydirt.stored) : 0; }
  function paydirtCapacity() {
    var level = typeof upgrades !== 'undefined' ? Number(upgrades.cargoLevel) || 1 : 1;
    return 600 + Math.max(0, Math.min(20, Math.floor(level) - 1)) * 200;
  }
  function paydirtForTile(kind, r, c) {
    if (kind !== 'dirt' && kind !== 'stone') return null;
    var depth = Math.max(0, Math.floor(r) - SKY_ROWS), band = 0;
    for (var i = 1; i < PAYDIRT_DEPTHS.length - 1; i++) if (depth >= PAYDIRT_DEPTHS[i]) band = i;
    return PAYDIRT_TYPES[band * 2 + (kind === 'stone' ? 1 : 0)];
  }
  function paydirtCollect(kind, r, c) {
    var type = paydirtForTile(kind, r, c);
    if (!type || !paydirt) return 0;
    if (paydirtUsed() >= paydirtCapacity()) {
      if (!paydirtFullNotified) {
        paydirtFullNotified = true;
        showMsg('Earth bin full. Digging continues; new dirt and stone are left behind.', true);
      }
      return 0;
    }
    paydirtFullNotified = false;
    paydirt.held[type.id] = (paydirt.held[type.id] || 0) + 1;
    paydirt.revision++;
    if (!paydirt.discovered[type.id]) {
      paydirt.discovered[type.id] = true;
      showMsg(type.name + ' collected. Wash it at the surface sluice.');
    }
    if (paydirtUsed() >= paydirtCapacity()) {
      paydirtFullNotified = true;
      showMsg('Earth bin full. Digging continues; new dirt and stone are left behind.', true);
    }
    return 1;
  }
  function paydirtDeposit() {
    if (!paydirt) return 0;
    var moved = paydirtUsed();
    if (!moved) return 0;
    for (var i = 0; i < PAYDIRT_TYPES.length; i++) {
      var id = PAYDIRT_TYPES[i].id;
      paydirt.stored[id] = (paydirt.stored[id] || 0) + (paydirt.held[id] || 0);
    }
    paydirt.held = {};
    paydirtFullNotified = false;
    paydirt.revision++;
    showMsg(moved.toLocaleString() + ' scoops stored at the sluice.');
    saveNow('sluice-deposit');
    return moved;
  }
  function paydirtLoseHeld() {
    if (!paydirt || !paydirtUsed()) return;
    paydirt.held = {};
    paydirtFullNotified = false;
    paydirt.revision++;
  }
  // Stateless integer mixing gives each material its own permanent sequence.
  // Splitting a haul into different batch sizes consumes the same sequence.
  function paydirtRoll(type, index) {
    var h = paydirt.seed >>> 0;
    for (var i = 0; i < type.id.length; i++) h = Math.imul(h ^ type.id.charCodeAt(i), 16777619) >>> 0;
    h = (h + Math.imul((index + 1) >>> 0, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    var roll = h / 4294967296 * PAYDIRT_ROLL_SCALE, total = 0;
    for (var j = 0; j < type.loot.length; j++) {
      total += type.loot[j].weight;
      if (roll < total) return type.loot[j];
    }
    return null;
  }
  function paydirtStart(id, count) {
    var type = paydirtType(id);
    if (!type || !paydirt || paydirt.pending) return null;
    var available = paydirt.stored[id] || 0;
    count = count == null ? available : Math.floor(Number(count));
    if (!Number.isFinite(count) || count <= 0 || !available) return null;
    count = Math.min(count, available);
    var results = [], byId = {}, value = 0, rare = false;
    var firstRoll = paydirt.rollCounts[id] || 0;
    for (var i = 0; i < count; i++) {
      var loot = paydirtRoll(type, firstRoll + i);
      if (!loot) continue;
      var row = byId[loot.id];
      if (!row) {
        row = { id: loot.id, name: loot.name, label: loot.name, ore: loot.ore,
          rarity: loot.rarity, value: loot.value, count: 0 };
        byId[loot.id] = row;
        results.push(row);
      }
      row.count++;
      value += loot.value;
      if (loot.rarity === 'rare' || loot.rarity === 'exceptional') rare = true;
    }
    results.sort(function (a, b) {
      var rank = { common: 0, uncommon: 1, rare: 2, exceptional: 3 };
      return rank[b.rarity] - rank[a.rarity] || b.value - a.value;
    });
    paydirt.stored[id] -= count;
    paydirt.rollCounts[id] = firstRoll + count;
    paydirt.pending = { typeId: id, count: count, results: results, value: value, rare: rare,
      status: 'washing', elapsed: 0, duration: 6 + Math.min(12, count / 50), progress: 0 };
    paydirt.revision++;
    saveNow('sluice-start');
    return paydirt.pending;
  }
  function paydirtAdvance(dt) {
    var pending = paydirt && paydirt.pending;
    if (!pending || pending.status !== 'washing' || !Number.isFinite(dt) || dt <= 0) return false;
    pending.elapsed = Math.min(pending.duration, pending.elapsed + Math.min(dt, 0.1));
    pending.progress = pending.elapsed / pending.duration;
    if (pending.elapsed < pending.duration) return false;
    pending.status = 'ready';
    paydirt.revision++;
    showMsg('Sluice wash finished. Your concentrate is safe in the pan.');
    saveNow('sluice-ready');
    return true;
  }
  function paydirtClaim() {
    var pending = paydirt && paydirt.pending;
    if (!pending || pending.status !== 'ready') return null;
    // Clear ownership before invoking other systems, so repeated input cannot
    // credit a second payout while the first claim is being presented.
    paydirt.pending = null;
    money += pending.value;
    paydirt.washed[pending.typeId] = (paydirt.washed[pending.typeId] || 0) + pending.count;
    for (var i = 0; i < pending.results.length; i++) {
      var result = pending.results[i];
      if (result.ore) {
        for (var j = 0; j < result.count; j++) ledgerRecordOre(result.ore, false);
      }
      if (result.rarity === 'rare' || result.rarity === 'exceptional') {
        var record = paydirt.finds[result.id];
        if (!record) record = paydirt.finds[result.id] = { count: 0, firstMaterial: pending.typeId };
        record.count += result.count;
      }
    }
    paydirt.revision++;
    saveNow('sluice-claim');
    return pending;
  }
  function paydirtSave() {
    return paydirt ? JSON.parse(JSON.stringify(paydirt)) : null;
  }
  function paydirtSafeCount(value, max) {
    return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
  }
  function paydirtRestore(saved) {
    paydirtReset();
    if (!saved || typeof saved !== 'object') return;
    if (Number.isFinite(saved.seed)) paydirt.seed = saved.seed >>> 0;
    var maps = ['held', 'stored', 'washed', 'rollCounts'];
    for (var i = 0; i < PAYDIRT_TYPES.length; i++) {
      var id = PAYDIRT_TYPES[i].id;
      for (var j = 0; j < maps.length; j++) {
        var key = maps[j];
        paydirt[key][id] = paydirtSafeCount(saved[key] && saved[key][id], 100000000);
      }
      if ((saved.discovered && saved.discovered[id]) || paydirt.held[id] || paydirt.stored[id] || paydirt.washed[id]) {
        paydirt.discovered[id] = true;
      }
      var pool = PAYDIRT_TYPES[i].loot;
      for (var k = 0; k < pool.length; k++) {
        var item = pool[k], found = saved.finds && saved.finds[item.id];
        if (item.rarity !== 'rare' && item.rarity !== 'exceptional') continue;
        var n = paydirtSafeCount(found && found.count, 100000000);
        if (n) paydirt.finds[item.id] = { count: n, firstMaterial: id };
      }
    }
    // Existing bin contents are never deleted by a later capacity adjustment.
    // An overfull migrated bin simply cannot collect until it is deposited.
    var p = saved.pending, type = p && paydirtType(p.typeId);
    if (type && paydirtSafeCount(p.count, 100000000) > 0 && Array.isArray(p.results)) {
      var count = paydirtSafeCount(p.count, 100000000), results = [], value = 0, rare = false, remaining = count;
      for (var a = 0; a < type.loot.length; a++) {
        var def = type.loot[a], quantity = 0;
        for (var b = 0; b < p.results.length; b++) {
          if (p.results[b] && p.results[b].id === def.id) quantity += paydirtSafeCount(p.results[b].count, count);
        }
        quantity = Math.min(remaining, quantity);
        if (!quantity) continue;
        remaining -= quantity;
        results.push({ id: def.id, name: def.name, label: def.name, ore: def.ore,
          rarity: def.rarity, value: def.value, count: quantity });
        value += quantity * def.value;
        if (def.rarity === 'rare' || def.rarity === 'exceptional') rare = true;
      }
      results.sort(function (a, b) {
        var rank = { common: 0, uncommon: 1, rare: 2, exceptional: 3 };
        return rank[b.rarity] - rank[a.rarity] || b.value - a.value;
      });
      var duration = 6 + Math.min(12, count / 50);
      var elapsed = Number.isFinite(p.elapsed) ? Math.max(0, Math.min(duration, p.elapsed)) : 0;
      if (p.status === 'ready') elapsed = duration;
      paydirt.pending = { typeId: type.id, count: count, results: results, value: value, rare: rare,
        status: elapsed >= duration ? 'ready' : 'washing', duration: duration, elapsed: elapsed, progress: elapsed / duration };
      paydirt.discovered[type.id] = true;
    }
    paydirt.revision = 0;
  }

