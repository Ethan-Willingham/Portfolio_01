  // ====================================================================
  //  WORKSHOP -- rig upgrades as catalog items for the UI kit (245).
  // ====================================================================
  // The data + number helpers survive from the old page; the rendering
  // is gone. nsWorkshopTabItems() builds the item descriptors the kit
  // renders in the store modal (see 250 for the spec, 245 for the kit).

  // Number helpers -- concrete current -> next values for the stat block.
  function nsUpgFuelAt(lv) {
    var caps = [0, 30, 55, 85, 120, 165, 220];
    if (lv >= caps.length) return caps[caps.length - 1];
    if (lv < 1) return caps[1];
    return caps[lv];
  }
  function nsUpgInfo(it) {
    // Returns { lvl, maxed, nextCost, cur, next, unit, statLabel, pipsCur, pipsMax }
    var lvl = upgrades[it.levelKey] || 0;
    var o = { lvl: lvl };
    if (it.isSpecial) {
      var maxLvl = it.costs.length;
      o.maxed = lvl >= maxLvl;
      o.nextCost = o.maxed ? 0 : it.costs[lvl];
      o.pipsCur = lvl; o.pipsMax = maxLvl;
      o.statLabel = '';
      if (it.key === 'heat') { o.cur = lvl >= 1 ? 'INSTALLED' : 'NOT FITTED'; o.next = 'INSTALLED'; }
      else if (it.key === 'vert') { o.cur = lvl >= 1 ? 'INSTALLED' : 'NOT FITTED'; o.next = 'INSTALLED'; }
      else if (it.key === 'shield') { o.cur = lvl === 0 ? 'NONE' : (lvl === 1 ? 'MK 1' : 'MK 2'); o.next = lvl === 0 ? 'MK 1' : 'MK 2'; o.statLabel = 'SHIELD'; }
      else if (it.key === 'pump') {
        var tanks = [0, 24, 58, 120];
        o.cur = lvl === 0 ? 'NONE' : tanks[lvl] + ' GAL';
        o.next = lvl < 3 ? tanks[lvl + 1] + ' GAL' : tanks[3] + ' GAL';
        o.statLabel = 'TANK';
      }
    } else {
      o.maxed = lvl >= it.costs.length;
      o.nextCost = o.maxed ? 0 : it.costs[lvl];
      o.pipsCur = lvl; o.pipsMax = it.costs.length;
      if (it.key === 'drill') {
        o.statLabel = 'POWER';
        o.cur = 'LV ' + lvl; o.next = 'LV ' + (lvl + 1);
      } else if (it.key === 'fuel') {
        o.statLabel = 'CAPACITY';
        o.cur = nsUpgFuelAt(lvl); o.next = nsUpgFuelAt(lvl + 1);
      } else if (it.key === 'hull') {
        o.statLabel = 'HULL';
        o.cur = BASE_HULL + (lvl - 1) * 60; o.next = BASE_HULL + lvl * 60;
      } else if (it.key === 'cargo') {
        o.statLabel = 'SLOTS';
        o.cur = 5 + (lvl - 1) * 4; o.next = 5 + lvl * 4;
      } else if (it.key === 'booster') {
        o.statLabel = 'CLIMB';
        var bm = [0, 100, 115, 135, 160, 190];
        var bcur = (lvl >= bm.length) ? bm[bm.length - 1] : (lvl < 1 ? bm[1] : bm[lvl]);
        var bnxt = ((lvl + 1) >= bm.length) ? bm[bm.length - 1] : bm[lvl + 1];
        o.cur = bcur + '%'; o.next = bnxt + '%';
      }
    }
    return o;
  }

  var NS_WORKSHOP_ITEMS = [
    { key: 'drill',  name: 'DRILL',          levelKey: 'drillLevel',  costs: shop.drill,  isSpecial: false, section: 0 },
    { key: 'fuel',   name: 'FUEL TANK',      levelKey: 'fuelLevel',   costs: shop.fuel,   isSpecial: false, section: 0 },
    { key: 'hull',   name: 'HULL PLATING',   levelKey: 'hullLevel',   costs: shop.hull,   isSpecial: false, section: 0 },
    { key: 'cargo',  name: 'CARGO BAY',      levelKey: 'cargoLevel',  costs: shop.cargo,  isSpecial: false, section: 0 },
    { key: 'booster',name: 'BOOSTER',        levelKey: 'boosterLevel',costs: shop.booster,isSpecial: false, section: 0 },
    { key: 'heat',   name: 'HEATED DRILL',   levelKey: 'heatLevel',   costs: shop.heat,   isSpecial: true,  section: 1 },
    { key: 'shield', name: 'HEAT SHIELD',    levelKey: 'shieldLevel', costs: shop.shield, isSpecial: true,  section: 1 },
    { key: 'vert',   name: 'VERTICAL DRILL', levelKey: 'vertLevel',   costs: shop.vert,   isSpecial: true,  section: 1 },
    { key: 'pump',   name: 'OIL PUMP',       levelKey: 'pumpLevel',   costs: shop.pump,   isSpecial: true,  section: 1 }
  ];
  // Oil is disabled in the free-forever sandbox, so the OIL PUMP buys nothing.
  // Hide it from the workshop (one flag away from coming back).
  if (!ENABLE_OIL) NS_WORKSHOP_ITEMS = NS_WORKSHOP_ITEMS.filter(function (it) { return it.key !== 'pump'; });

  // One plain sentence per part: what it does, not its numbers (the stat
  // block above the button carries the numbers).
  function nsWorkshopDesc(def, info) {
    var k = def.key;
    if (k === 'drill') {
      if (info.maxed) return 'Nothing in the ground can stop it.';
      var unlocks = { 3: 'uranium and tanzanite', 4: 'diamond', 5: 'painite', 6: 'unobtanium' };
      var u = unlocks[info.lvl + 1];
      return u ? 'Cuts faster and unlocks ' + u + '.' : 'Cuts through rock faster.';
    }
    if (k === 'fuel') return 'A bigger tank. Longer dives before the gauge forces you home.';
    if (k === 'hull') return 'Thicker plating. Shrugs off harder landings and hotter rock.';
    if (k === 'cargo') return 'More slots in the hold. Haul more ore per trip.';
    if (k === 'booster') return 'Stronger climb thrust underground. Get back up faster.';
    if (k === 'heat') return 'A heating coil for the drill. Required to break permafrost below 200 m.';
    if (k === 'shield') return info.lvl === 0
      ? 'Ablative plating. Halves magma damage below 270 m.'
      : 'A second ablative layer. Full magma immunity.';
    if (k === 'vert') return 'A swivel mount. Hold Up against a ceiling to drill straight up.';
    if (k === 'pump') return 'Sucks underground oil into a sellable tank.';
    return '';
  }

  function nsWorkshopTabItems() {
    var items = [];
    for (var i = 0; i < NS_WORKSHOP_ITEMS.length; i++) {
      items.push(nsWorkshopItem(NS_WORKSHOP_ITEMS[i]));
    }
    return items;
  }
  function nsWorkshopItem(def) {
    var info = nsUpgInfo(def);
    var afford = !info.maxed && (devMode || money >= info.nextCost);
    var ownedBinary = def.isSpecial && (def.key === 'heat' || def.key === 'vert');

    // The drill sells its NEXT tier by name; everything else keeps its name.
    var iconLevel = info.lvl;
    var name = def.name;
    if (def.key === 'drill') {
      iconLevel = info.maxed ? info.lvl : info.lvl + 1;
      name = drillTierShortName(iconLevel);
    }

    // List sub-line + detail state line.
    var sub, state = null;
    if (ownedBinary) {
      sub = info.lvl >= 1 ? 'Installed' : 'Not fitted';
      state = info.lvl >= 1 ? 'INSTALLED' : 'NOT FITTED';
    } else {
      sub = 'LV ' + info.lvl + ' / ' + info.pipsMax;
      if (info.maxed) state = 'FULLY UPGRADED';
    }

    // Stat block: current -> next, with a +delta when both are numbers.
    var stat = null;
    if (info.statLabel) {
      stat = { label: info.statLabel, cur: '' + info.cur, next: info.maxed ? null : '' + info.next };
      if (!info.maxed && typeof info.cur === 'number' && typeof info.next === 'number') {
        stat.delta = '+' + (info.next - info.cur);
      }
      if (info.maxed) stat.cur = info.cur + '  (MAX)';
    }

    var priceLabel, priceTier, act;
    if (info.maxed) {
      priceLabel = ownedBinary ? 'OWNED' : 'MAX';
      priceTier = 'dim';
      act = { label: 'MAX', enabled: false, reason: ownedBinary ? 'INSTALLED' : 'MAX LEVEL' };
    } else {
      priceLabel = '$' + info.nextCost.toLocaleString();
      priceTier = afford ? 'gold' : 'red';
      act = afford
        ? { label: 'BUY  ' + priceLabel, enabled: true }
        : { label: priceLabel, enabled: false,
            reason: 'SHORT $' + (info.nextCost - money).toLocaleString(), reasonKind: 'short' };
    }

    return {
      key: def.key,
      name: name,
      sub: sub,
      state: state,
      icon: function (cx, cy, px) { drawUpgradeIconBig(def.key, cx, cy, px, iconLevel); },
      pips: { cur: info.pipsCur, max: info.pipsMax },
      stat: stat,
      desc: nsWorkshopDesc(def, info),
      priceLabel: priceLabel,
      priceTier: priceTier,
      act: act,
      onAct: function () {
        var before = money;
        buildShopItems();
        var si = null;
        for (var s = 0; s < shopItems.length; s++) {
          if (shopItems[s].key === def.key) { si = shopItems[s]; break; }
        }
        if (si) buyUpgrade(si);
        var ok = devMode || money < before;
        if (!ok) return { ok: false };
        return { ok: true, float: '+ ' + name };
      }
    };
  }

