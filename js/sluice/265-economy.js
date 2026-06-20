  // ====================================================================
  //  ECONOMY - dynamic per-town prices for the Trade Board (fragment 260).
  // ====================================================================
  // See ECONOMY_BIBLE.md. The whole market is one multiplier per (town, good),
  // centered near 1.0, scaling the catalog buy/sell. The baseline is the town's
  // specialization for the good's category; the multiplier drifts (a mean-
  // reverting random walk, the variable-ratio "check the board" hook) and sags
  // when you sell into a town (saturation), recovering as reversion pulls it
  // home. Ore selling (the automatic refuel-pad payout) is a SEPARATE loop and
  // is untouched here.
  //
  // marketModel below is PURE (only Math + MARKET) and stateless (the price
  // state is passed in), so it can be driven from the console for verification
  // and it mirrors the block in economy-lab.html. The ns* glue under it is the
  // only part that touches the live game (current town, NS_BOARD_GOODS,
  // player.market).
  //
  // Tunable knobs (gm 'market' group, stage 8). MARKET_* magnitudes start from
  // the lab (economy-lab.html) and get their final values in the balance pass.

  var MARKET = {
    SECONDS_PER_TICK: 30,   // game seconds between drift steps
    REVERSION: 0.06,        // pull back to baseline per tick (0..1)
    VOLATILITY: 0.04,       // wander amplitude per tick
    M_MIN: 0.45,            // global multiplier clamp, low
    M_MAX: 2.20,            // global multiplier clamp, high
    IMPACT: 0.5,            // how hard one unit traded moves the multiplier
    DEPTH: { STAPLE: 420, METAL: 300, MINING: 240, ASSAY: 180, INSTRUMENT: 140, EXOTIC: 110 },
    // Rumors and shocks (ECONOMY_BIBLE.md section 7): occasional telegraphed
    // spikes / crashes a player can speculate on (buy ahead of a spike, sell
    // into it). Magnitudes are multiplier-space bias added to the target.
    EVENT_CHANCE: 0.08,   // chance per tick to schedule a new shock (if room)
    EVENT_MAX: 3,         // max concurrent shocks
    EVENT_MAG_MIN: 0.25,  // smallest shock
    EVENT_MAG_MAX: 0.55,  // biggest shock
    EVENT_LEAD: 4,        // ticks of telegraph before the peak (the react window)
    EVENT_HOLD: 4,        // ticks from peak back to neutral
    EVENT_CATS: ['STAPLE', 'METAL', 'MINING', 'ASSAY', 'INSTRUMENT', 'EXOTIC'],
    TOWNS: ['DRYWELL', 'IRONHEAD', 'COLD SPRING', 'HOLLOW DEEP'],
    // One-line identity per town (parallel to TOWNS), for the board banner.
    TOWN_DESC: ['salt-flats frontier', 'rail and forge town', 'silver and assay camp', 'the deep strange town'],
    // Specialization baseline multipliers, spec[townIndex][category]. Below 1.0
    // means the town floods that category (cheap, buy here); above 1.0 means it
    // is scarce there (dear, sell here). townIndex 0 = Town 1 (start, surface),
    // 3 = Town 4 (deepest). See ECONOMY_BIBLE.md section 5.
    SPEC: [
      { STAPLE: 0.70, METAL: 1.00, MINING: 1.20, ASSAY: 1.30, INSTRUMENT: 1.25, EXOTIC: 1.45 },
      { STAPLE: 1.05, METAL: 0.70, MINING: 0.72, ASSAY: 1.05, INSTRUMENT: 1.00, EXOTIC: 1.25 },
      { STAPLE: 1.10, METAL: 0.95, MINING: 0.85, ASSAY: 0.70, INSTRUMENT: 1.05, EXOTIC: 1.20 },
      { STAPLE: 1.45, METAL: 1.10, MINING: 1.05, ASSAY: 1.00, INSTRUMENT: 0.72, EXOTIC: 0.72 }
    ],
    // good key -> category. Every NS_BOARD_GOODS key is mapped; unmapped keys
    // fall back to STAPLE in catOf.
    CAT: {
      saltblock: 'STAPLE', coalBrick: 'STAPLE', rope: 'STAPLE', tobacco: 'STAPLE', lampoil: 'STAPLE',
      calico: 'STAPLE', coffeesack: 'STAPLE', whiskey: 'STAPLE', pelt: 'STAPLE',
      railspike: 'METAL', leadpig: 'METAL', nailkeg: 'METAL', ironIngot: 'METAL', copperWire: 'METAL', horseshoe: 'METAL',
      niter: 'MINING', sulfur: 'MINING', pickaxe: 'MINING', dynamite: 'MINING', powderkeg: 'MINING', lantern: 'MINING',
      silverore: 'ASSAY', quartz: 'ASSAY', turquoise: 'ASSAY', silverbar: 'ASSAY', golddust: 'ASSAY', quicksilver: 'ASSAY', goldbar: 'ASSAY',
      compass: 'INSTRUMENT', pocketwatch: 'INSTRUMENT', telegraphkey: 'INSTRUMENT', cog: 'INSTRUMENT',
      crowfeather: 'EXOTIC', fossil: 'EXOTIC', glowmilk: 'EXOTIC', opal: 'EXOTIC', meteorite: 'EXOTIC',
      brassfinger: 'EXOTIC', geode: 'EXOTIC', lightning: 'EXOTIC', diamond: 'EXOTIC', saltidol: 'EXOTIC', letter: 'EXOTIC'
    }
  };

  // Pure, stateless price model. state shape: { m: { townIdx: { key: mult } },
  // t: tickCount, anchor: realMs }. Mirrors economy-lab.html exactly.
  var marketModel = (function () {
    function catOf(key) { return MARKET.CAT[key] || 'STAPLE'; }
    function baseFor(t, key) { var row = MARKET.SPEC[t]; return (row && row[catOf(key)]) || 1; }
    function clampM(m) { return Math.max(MARKET.M_MIN, Math.min(MARKET.M_MAX, m)); }
    function noise() { return (Math.random() + Math.random() + Math.random() - 1.5) * 0.6667; }
    function ensure(state, goods) {
      if (!state.m) state.m = {};
      for (var t = 0; t < MARKET.SPEC.length; t++) {
        if (!state.m[t]) state.m[t] = {};
        for (var i = 0; i < goods.length; i++) {
          var k = goods[i].key;
          if (typeof state.m[t][k] !== 'number') state.m[t][k] = baseFor(t, k);
        }
      }
      if (typeof state.t !== 'number') state.t = 0;
      if (!state.events) state.events = [];
      return state;
    }
    // Active shocks bias the TARGET a multiplier chases (reversion then chases
    // the shifted target up on a spike, down on a crash, and home again as the
    // shock decays). Ramp: 0 at announce (t0), 1 at peak (t1), back to 0 at end
    // (t2). Sum over events matching this town + category.
    function eventBias(state, t, cat) {
      if (!state.events || !state.events.length) return 0;
      var b = 0;
      for (var e = 0; e < state.events.length; e++) {
        var ev = state.events[e];
        if (ev.town !== t || ev.cat !== cat) continue;
        var ramp = 0;
        if (state.t > ev.t0 && state.t < ev.t1) ramp = (state.t - ev.t0) / (ev.t1 - ev.t0);
        else if (state.t >= ev.t1 && state.t < ev.t2) ramp = 1 - (state.t - ev.t1) / (ev.t2 - ev.t1);
        b += ev.kind * ev.mag * ramp;
      }
      return b;
    }
    function spawnEvent(state) {
      var t = Math.floor(Math.random() * MARKET.SPEC.length);
      var cat = MARKET.EVENT_CATS[Math.floor(Math.random() * MARKET.EVENT_CATS.length)];
      var kind = (Math.random() < 0.5) ? 1 : -1;     // +1 spike (scarce), -1 crash (glut)
      var mag = MARKET.EVENT_MAG_MIN + Math.random() * (MARKET.EVENT_MAG_MAX - MARKET.EVENT_MAG_MIN);
      state.events.push({
        town: t, cat: cat, kind: kind, mag: mag,
        t0: state.t, t1: state.t + MARKET.EVENT_LEAD, t2: state.t + MARKET.EVENT_LEAD + MARKET.EVENT_HOLD
      });
    }
    // Active/upcoming shocks for the telegraph (ticker / notices). soon = still
    // before the peak, so the player has time to act.
    function eventTelegraph(state) {
      var out = [];
      if (!state.events) return out;
      for (var e = 0; e < state.events.length; e++) {
        var ev = state.events[e];
        if (state.t >= ev.t2) continue;
        out.push({ town: ev.town, cat: ev.cat, kind: ev.kind, soon: (state.t < ev.t1) });
      }
      return out;
    }
    function step(state, goods) {
      if (!state.events) state.events = [];
      var live = [];
      for (var e = 0; e < state.events.length; e++) if (state.t <= state.events[e].t2) live.push(state.events[e]);
      state.events = live;
      if (state.events.length < MARKET.EVENT_MAX && Math.random() < MARKET.EVENT_CHANCE) spawnEvent(state);
      for (var t = 0; t < MARKET.SPEC.length; t++) {
        var row = state.m[t];
        for (var i = 0; i < goods.length; i++) {
          var k = goods[i].key, base = baseFor(t, k), m = row[k];
          m += MARKET.REVERSION * (base - m) + MARKET.VOLATILITY * base * noise();
          row[k] = clampM(m);
        }
      }
      state.t++;
    }
    function advance(state, goods, ticks) { for (var n = 0; n < ticks; n++) step(state, goods); }
    // The drifting baseline multiplier (what step() walks; what trades move).
    function rawM(state, t, key) {
      var v = state.m && state.m[t] && state.m[t][key];
      return (typeof v === 'number') ? v : baseFor(t, key);
    }
    // Effective multiplier = drift plus any active shock offset. The shock is a
    // direct, ramped offset (base * bias) on top of drift, so a telegraphed
    // spike moves the price right away instead of being chased slowly. Trades
    // and drift act on rawM; the shock floats on top and decays out on its own.
    function mult(state, t, key) {
      return clampM(rawM(state, t, key) + baseFor(t, key) * eventBias(state, t, catOf(key)));
    }
    function sellPrice(state, t, good) { return Math.round(good.sell * mult(state, t, good.key)); }
    function buyPrice(state, t, good) { return Math.round(good.buy * mult(state, t, good.key)); }
    function applySell(state, t, good, qty) {
      var d = MARKET.IMPACT * qty / (MARKET.DEPTH[catOf(good.key)] || 300);
      state.m[t][good.key] = clampM(rawM(state, t, good.key) - d);
    }
    function applyBuy(state, t, good, qty) {
      var d = MARKET.IMPACT * qty / (MARKET.DEPTH[catOf(good.key)] || 300);
      state.m[t][good.key] = clampM(rawM(state, t, good.key) + d);
    }
    function pctDelta(state, t, good) { return Math.round((mult(state, t, good.key) - 1) * 100); }
    // The category a town floods (cheapest baseline, its export) and the one it
    // starves for (dearest, its import). Pure function of SPEC, for UI hints.
    function townTrades(t) {
      var row = MARKET.SPEC[t];
      if (!row) return { cheap: null, dear: null };
      var cheap = null, dear = null, lo = Infinity, hi = -Infinity;
      for (var c in row) {
        if (row[c] < lo) { lo = row[c]; cheap = c; }
        if (row[c] > hi) { hi = row[c]; dear = c; }
      }
      return { cheap: cheap, dear: dear };
    }
    return {
      ensure: ensure, step: step, advance: advance,
      sellPrice: sellPrice, buyPrice: buyPrice,
      applySell: applySell, applyBuy: applyBuy,
      pctDelta: pctDelta, catOf: catOf, baseFor: baseFor, mult: mult,
      townTrades: townTrades,
      eventTelegraph: eventTelegraph, spawnEvent: spawnEvent, eventBias: eventBias
    };
  })();

  // ---- Game glue (the only part that touches game globals) -------------
  // Persistent state lives on player.market, seeded lazily to baseline. We do
  // NOT tick from the main loop (low coupling): the Board catches the model up
  // on entry and on its existing 5s tick (wired in stage 5), so prices also
  // move while you are away mining (real-time catch-up, capped).
  var MARKET_MAX_CATCHUP = 240;  // cap ticks advanced in one catch-up
  function nsMarketNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function nsMarketEnsure() {
    if (typeof player === 'undefined' || !player) return null;
    if (!player.market || typeof player.market !== 'object') player.market = {};
    var st = player.market;
    marketModel.ensure(st, NS_BOARD_GOODS);
    if (typeof st.anchor !== 'number') st.anchor = nsMarketNow();
    return st;
  }
  // Advance the model by however many whole ticks of game time have elapsed
  // since the last advance (capped). Called explicitly (board entry + 5s tick),
  // never from a price read, so prices never shift mid-frame.
  function nsMarketAdvance() {
    var st = nsMarketEnsure();
    if (!st) return null;
    var sptMs = MARKET.SECONDS_PER_TICK * 1000;
    if (sptMs <= 0) return st;
    var now = nsMarketNow();
    var elapsed = now - st.anchor;
    if (elapsed >= sptMs) {
      var ticks = Math.floor(elapsed / sptMs);
      if (ticks > MARKET_MAX_CATCHUP) ticks = MARKET_MAX_CATCHUP;
      marketModel.advance(st, NS_BOARD_GOODS, ticks);
      st.anchor = now - (elapsed - ticks * sptMs);  // carry the sub-tick remainder
    }
    return st;
  }
  // The town whose market the player is standing in (0..3). Off-town (a zone or
  // ocean, townIndex -1) falls back to the start town so the Board always has a
  // quote. Stage 10 gives each town its own station; until then the single
  // station sits in Town 1, so this resolves to Town 1 in practice.
  function nsMarketTown() {
    var ti = (typeof playerTownIndex === 'function') ? playerTownIndex() : 0;
    if (ti == null || ti < 0 || ti >= MARKET.SPEC.length) ti = 0;
    return ti;
  }
  // Price reads: lazy-seed only (no time advance), so they are cheap to call
  // many times per frame. nsBoardDoTrade and the row render use these.
  function nsBuyPrice(good) {
    var st = nsMarketEnsure();
    return st ? marketModel.buyPrice(st, nsMarketTown(), good) : good.buy;
  }
  function nsSellPrice(good) {
    var st = nsMarketEnsure();
    return st ? marketModel.sellPrice(st, nsMarketTown(), good) : good.sell;
  }
  // Percent of the current multiplier vs neutral (catalog) price, for the honest
  // up/down delta shown on each row (stage 7). Positive = dear here, sell;
  // negative = cheap here, buy.
  function nsMarketPct(good) {
    var st = nsMarketEnsure();
    return st ? marketModel.pctDelta(st, nsMarketTown(), good) : 0;
  }
  // A trade's price impact in the current town. Called from nsBoardDoTrade after
  // a successful buy/sell so the local price sags (sell) or lifts (buy).
  function nsMarketApplyTrade(good, qty, selling) {
    var st = nsMarketEnsure();
    if (!st || qty <= 0) return;
    if (selling) marketModel.applySell(st, nsMarketTown(), good, qty);
    else marketModel.applyBuy(st, nsMarketTown(), good, qty);
  }
