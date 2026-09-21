  /* ---- Boiler supplies: saved stock, stone flint, and cargo transfer ---- */
  // These are bathhouse tools and fuel, independent of the parked ore refinery.
  // Reserve limits apply only to automatic deliveries, never to returned fuel.
  // Keep legacy iron stock, but new iron cargo sells normally.
  var FORGE_RESERVE = { coal: 24, iron: 0 };
  var FORGE_FLINT_MAX = 3, FORGE_FLINT_CHANCE = 0.12, FORGE_FLINT_GUARANTEE = 12;
  var forgeStock = { coal: 0, iron: 0, flint: 0, steel: 1 };
  var forgeStoneSinceFlint = 0;

  function forgeResourcesReset() {
    forgeStock = { coal: 0, iron: 0, flint: 0, steel: 1 };
    forgeStoneSinceFlint = 0;
  }
  function forgeResourceKnown(type) {
    return type === 'coal' || type === 'iron' || type === 'flint' || type === 'steel';
  }
  function forgeCargoMatches(unit, type) {
    return (type === 'coal' || type === 'iron') && cargoType(unit) === type && !cargoShiny(unit);
  }
  function hearthDevSupplies() {
    return typeof devMode !== 'undefined' && devMode;
  }
  function hearthHasTool(type) {
    return (type === 'flint' || type === 'steel') && (hearthDevSupplies() || forgeCount(type) > 0);
  }
  function forgeCount(type) {
    if (!forgeResourceKnown(type)) return 0;
    // Virtual dev supplies never enter saved stock. The boiler includes one
    // real, reusable steel striker in every new and restored game.
    if (hearthDevSupplies() && type !== 'steel') return 999999;
    var n = forgeStock[type];
    for (var i = 0; i < cargo.length; i++) if (forgeCargoMatches(cargo[i], type)) n++;
    return n;
  }
  function forgeTake(type, n) {
    if (!forgeResourceKnown(type) || !isFinite(n) || n < 0 || Math.floor(n) !== n) return false;
    if (hearthDevSupplies()) return true;
    if (forgeCount(type) < n) return false;
    var stored = Math.min(forgeStock[type], n);
    forgeStock[type] -= stored;
    n -= stored;
    for (var i = cargo.length - 1; i >= 0 && n > 0; i--) {
      if (!forgeCargoMatches(cargo[i], type)) continue;
      cargo.splice(i, 1); n--;
    }
    return true;
  }
  function forgeGive(type, n) {
    if (!forgeResourceKnown(type) || !isFinite(n) || n < 0 || Math.floor(n) !== n) return false;
    forgeStock[type] += n;
    return true;
  }
  function forgeStockCargo() {
    if (!ENABLE_BATH) return false;
    var added = { coal: 0, iron: 0 };
    for (var i = cargo.length - 1; i >= 0; i--) {
      var type = cargoType(cargo[i]);
      if (!forgeCargoMatches(cargo[i], type) || forgeStock[type] >= FORGE_RESERVE[type]) continue;
      forgeStock[type]++; added[type]++; cargo.splice(i, 1);
    }
    if (!added.coal && !added.iron) return false;
    var parts = [];
    if (added.coal) parts.push(added.coal + ' coal');
    if (added.iron) parts.push(added.iron + ' iron');
    showMsg('Stored ' + parts.join(' + ') + ' for the boiler.', false, { key: 'forge-stock', tag: 'BANYA' });
    saveNow('forge-stock');
    return true;
  }
  function forgeStoneDrop(type) {
    if (!ENABLE_BATH || type !== 'stone' || forgeStock.flint >= FORGE_FLINT_MAX) return false;
    forgeStoneSinceFlint++;
    if (forgeStoneSinceFlint < FORGE_FLINT_GUARANTEE && Math.random() >= FORGE_FLINT_CHANCE) return false;
    forgeStoneSinceFlint = 0;
    forgeStock.flint++;
    showMsg('Flint found. Use the boiler striker to light coal. Both tools last.', false, { key: 'forge-flint', tag: 'BANYA' });
    sfxPlay('ore-pickup');
    saveNow('forge-flint');
    return true;
  }
  function forgeResourcesSave() {
    return { stock: { coal: forgeStock.coal, iron: forgeStock.iron, flint: forgeStock.flint, steel: forgeStock.steel },
      stoneSinceFlint: forgeStoneSinceFlint };
  }
  function forgeResourcesRestore(data) {
    forgeResourcesReset();
    if (!data || !data.stock) return;
    Object.keys(forgeStock).forEach(function (type) {
      var n = Number(data.stock[type]);
      forgeStock[type] = isFinite(n) && n > 0 ? Math.floor(n) : 0;
    });
    forgeStock.steel = Math.max(1, forgeStock.steel);
    var stone = Number(data.stoneSinceFlint);
    forgeStoneSinceFlint = isFinite(stone) ? Math.max(0, Math.min(FORGE_FLINT_GUARANTEE - 1, Math.floor(stone))) : 0;
  }
