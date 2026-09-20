  // ====================================================================
  //  EXHAUST -- permanent smoke cosmetics on the shared catalog kit (245).
  // ====================================================================
  // The swatch is a static color specimen. Equipping changes the rig's
  // real smoke field; the store does not run a second smoke simulation.
  var NS_EXHAUST_SWATCH_ROWS = [
    [11, 9], [8, 15], [6, 19], [5, 21], [5, 21], [6, 19],
    [8, 15], [10, 11], [8, 14], [6, 18], [5, 20], [5, 20],
    [6, 18], [8, 15], [11, 11], [13, 8], [14, 6], [13, 6],
    [12, 7], [12, 6], [13, 5], [14, 4]
  ];

  function nsDrawExhaustSwatch(def, cx, cy, px) {
    var colors = def.colors && def.colors.length ? def.colors : [UIT_BODY, UIT_DIM];
    var unit = Math.max(0.5, px / 32);
    var x = Math.round(cx - unit * 16), y = Math.round(cy - unit * 16);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(unit, unit);
    // Stepped color bands follow the illustrated plume. Palette colors
    // describe the product, while all surrounding chrome uses UI tokens.
    for (var r = 0; r < NS_EXHAUST_SWATCH_ROWS.length; r++) {
      var row = NS_EXHAUST_SWATCH_ROWS[r];
      var colorIndex = Math.min(colors.length - 1, Math.floor(r * colors.length / NS_EXHAUST_SWATCH_ROWS.length));
      ctx.fillStyle = colors[colorIndex];
      ctx.fillRect(row[0], r + 3, row[1], 1);
    }
    // Negative-space folds keep the small specimen legible as smoke.
    ctx.fillStyle = UIT_INSET_DK;
    ctx.fillRect(11, 8, 8, 1);
    ctx.fillRect(10, 9, 4, 1);
    ctx.fillRect(10, 10, 2, 1);
    ctx.fillRect(13, 14, 9, 1);
    ctx.fillRect(19, 15, 3, 1);
    ctx.fillRect(19, 16, 2, 1);
    ctx.fillRect(13, 20, 2, 1);
    // A short steel exhaust outlet anchors every specimen to the rig.
    ctx.fillStyle = UIT_EDGE;
    ctx.fillRect(10, 24, 12, 7);
    ctx.fillStyle = UIMAT_PLATE_BASE;
    ctx.fillRect(11, 25, 10, 5);
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(11, 25, 10, 1);
    ctx.fillStyle = UIMAT_PLATE_SHADOW;
    ctx.fillRect(11, 29, 10, 1);
    ctx.fillStyle = UIT_INSET_DK;
    ctx.fillRect(13, 24, 6, 2);
    ctx.restore();
  }

  function nsExhaustDescription(def) {
    var descriptions = {
      stock: 'The rig\'s original exhaust.',
      copperhead: 'Dense copper folds around a narrow gold seam.',
      dragon: 'Jade jets fold around a gold center.',
      'velvet-rope': 'Thick crimson smoke pulls into slow, smooth folds.',
      countercurrent: 'Pale and teal streams curl into a ragged wake.',
      witchfire: 'Restless green wisps climb in sharp tongues.',
      'spiral-kiln': 'Gold and red smoke twists into living coils.',
      prismatic: 'Rolling coils cycle through the full rainbow.'
    };
    return descriptions[def.id] || def.description;
  }

  function nsExhaustTabItems() {
    return RIG_EXHAUST_CATALOG.map(nsExhaustItem);
  }

  function nsExhaustItem(def) {
    var equipped = rigExhaustState.equipped === def.id;
    var owned = rigExhaustIsOwned(def.id);
    var available = def.id === 'stock' || rigExhaustAvailable();
    var afford = devMode || money >= def.price;
    var price = '$' + def.price.toLocaleString();
    var act;
    if (equipped) {
      act = { label: 'EQUIPPED', enabled: false };
    } else if (!available) {
      act = { label: 'UNAVAILABLE', enabled: false, reason: 'SMOKE EFFECTS UNAVAILABLE' };
    } else if (owned) {
      act = { label: 'EQUIP', enabled: true };
    } else {
      act = afford
        ? { label: 'BUY + EQUIP  ' + price, enabled: true }
        : { label: 'BUY + EQUIP  ' + price, enabled: false,
            reason: 'SHORT $' + Math.max(0, def.price - money).toLocaleString(), reasonKind: 'short' };
    }
    return {
      key: 'exhaust:' + def.id,
      name: def.name.toUpperCase(),
      sub: 'Cosmetic',
      state: equipped ? 'EQUIPPED' : (owned ? 'OWNED / SWITCH FREE' : 'PERMANENT EXHAUST'),
      icon: function (cx, cy, px) { nsDrawExhaustSwatch(def, cx, cy, px); },
      desc: nsExhaustDescription(def),
      priceLabel: equipped ? 'EQUIPPED' : (owned ? 'OWNED' : price),
      priceTier: owned || !available ? 'dim' : (afford ? 'gold' : 'red'),
      act: act,
      onAct: function () {
        // Re-read ownership at click time. A previously built BUY button
        // must become a free switch after the player already owns it.
        if (!rigExhaustGet(def.id)) return { ok: false };
        if (def.id !== 'stock' && !rigExhaustAvailable()) return { ok: false, reason: 'SMOKE EFFECTS UNAVAILABLE' };
        if (rigExhaustIsOwned(def.id)) {
          return { ok: rigExhaustSelect(def.id), float: 'EQUIPPED' };
        }
        var result = rigExhaustPurchase(def.id);
        return result.ok ? { ok: true, float: 'EQUIPPED' } : result;
      }
    };
  }
