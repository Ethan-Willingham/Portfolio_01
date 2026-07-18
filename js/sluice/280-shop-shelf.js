  // ====================================================================
  //  SHELF -- consumables as catalog items for the UI kit (245).
  // ====================================================================
  var NS_SHELF_ITEMS = [
    { key: 'teleporter', name: 'TELEPORTER',   hotkey: 'T' },
    { key: 'balloon',    name: 'ROVER BALLOON',hotkey: 'B' },
    { key: 'bombSmall',  name: 'SMALL CHARGE', hotkey: '1' },
    { key: 'bombLarge',  name: 'LARGE CHARGE', hotkey: '2' },
    { key: 'reserveFuel',name: 'RESERVE FUEL', hotkey: null, maxCount: 4 }
  ];
  function nsShelfCount(key) {
    if (key === 'teleporter') return teleporters;
    if (key === 'balloon') return balloons;
    if (key === 'bombSmall') return bombsSmall;
    if (key === 'bombLarge') return bombsLarge;
    if (key === 'reserveFuel') return reserveFuel;
    return 0;
  }
  function nsShelfCost(key) { return shop[key]; }

  // What it does + how to fire it. Usage phrasing follows the platform,
  // same as buildShopItems() does for the legacy descriptions.
  function nsShelfDesc(def) {
    var use = def.hotkey
      ? (isMobile ? 'Tap its chip in the HUD to use it.' : 'Press ' + def.hotkey + ' to use it.')
      : '';
    var k = def.key;
    if (k === 'teleporter') return 'A one-way warp back to the station. ' + use;
    if (k === 'balloon') return 'Giant airbags. Drop from any height and bounce off the bottom unhurt. ' + use;
    if (k === 'bombSmall') return 'A single charge. Blasts one tile under the rig. ' + use;
    if (k === 'bombLarge') return 'A full bundle. Blasts a 3x3 hole. ' + use;
    if (k === 'reserveFuel') return 'Auto-deploys the instant the main tank runs dry. Hold up to 4.';
    return '';
  }

  function nsShelfTabItems() {
    var items = [];
    for (var i = 0; i < NS_SHELF_ITEMS.length; i++) {
      items.push(nsShelfItem(NS_SHELF_ITEMS[i]));
    }
    return items;
  }
  function nsShelfItem(def) {
    var count = nsShelfCount(def.key);
    var cost = nsShelfCost(def.key);
    var atCap = !!def.maxCount && count >= def.maxCount;
    var afford = !atCap && (devMode || money >= cost);

    var sub = def.maxCount
      ? ('In hold x' + count + ' / ' + def.maxCount)
      : ('In hold x' + count);
    var priceLabel, priceTier, act;
    if (atCap) {
      priceLabel = 'FULL';
      priceTier = 'dim';
      act = { label: 'FULL', enabled: false, reason: 'HOLD FULL' };
    } else {
      priceLabel = '$' + cost.toLocaleString();
      priceTier = afford ? 'gold' : 'red';
      act = afford
        ? { label: 'BUY  ' + priceLabel, enabled: true }
        : { label: priceLabel, enabled: false,
            reason: 'SHORT $' + (cost - money).toLocaleString(), reasonKind: 'short' };
    }

    return {
      key: def.key,
      name: def.name,
      sub: sub,
      state: def.hotkey ? (isMobile ? 'HUD CHIP' : 'HOTKEY  ' + def.hotkey) : 'AUTOMATIC',
      badge: count > 0 ? 'x' + count : null,
      icon: function (cx, cy, px) { drawConsumableIconBig(def.key, cx, cy, px); },
      stat: null,
      desc: nsShelfDesc(def),
      priceLabel: priceLabel,
      priceTier: priceTier,
      act: act,
      onAct: function () {
        var before = money;
        var beforeCount = nsShelfCount(def.key);
        buildShopItems();
        var si = null;
        for (var s = 0; s < shopItems.length; s++) {
          if (shopItems[s].key === def.key) { si = shopItems[s]; break; }
        }
        if (si) buyUpgrade(si);
        var ok = nsShelfCount(def.key) > beforeCount || (!devMode && money < before);
        if (!ok) return { ok: false };
        return { ok: true, float: '+1 ' + def.name };
      }
    };
  }

  // ########################################################################
  // ##  NEW SHOP -- end of new shop module                                ##
  // ########################################################################

