#!/usr/bin/env node
// Deterministic behavior checks for the surface garden, no browser or packages.
// Run from any directory: node tools/slime-garden-economy.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/sluice/074-slime-garden.js', import.meta.url), 'utf8');
function fixture() {
  const baths = new Map();
  const state = {
    TILE: 32, SKY_ROWS: 4, DECK_LEFT_COL: 155, COLS: 320,
    PLAYER_W: 24, PLAYER_H: 24,
    world: Array.from({ length: 16 }, () => Array.from({ length: 320 }, () => ({ type: 'dirt', hp: 1 }))),
    terrainClearedKinds: {}, surfacePonds: [], cargo: [], money: 0, devMode: false, isMobile: false,
    player: { x: 0, y: 110 }, skySlimes: [], worldScale: 2, cam: { x: 0, y: 0 },
    ORES: { dirt: { hp: 1 }, copper: { label: 'Copper' }, iron: { label: 'Iron' },
      amber: { label: 'Amber' }, amethyst: { label: 'Amethyst' }, gold: { label: 'Gold' } },
    messages: [], saves: [],
    showMsg(message) { state.messages.push(message); },
    saveNow(reason) { state.saves.push(reason); },
    sfxPlay() {},
    liquidSampleRect(x0) { return (baths.get(x0) || [0, 0, 0, 0, 0]).slice(); },
    liquidExtractRect(x0, y0, x1, y1, type, count) {
      const fluid = baths.get(x0);
      if (!fluid) return 0;
      const used = Math.min(count, fluid[type]);
      fluid[type] -= used;
      return used;
    },
  };
  vm.createContext(state);
  vm.runInContext(source, state, { filename: '074-slime-garden.js' });
  state.slimeGardenReset();
  state.slimeGardenPrepareWorld();
  return {
    state,
    fill(index, counts) { baths.set(state.slimeGardenLots[index].x0, counts.slice()); },
    fluid(index) { return baths.get(state.slimeGardenLots[index].x0); },
    guest(index) {
      const lot = state.slimeGardenLots[index];
      state.skySlimes.push({ id: index + 1, x: lot.x0 + 120, y: lot.y1 - 25, r: 25, vx: 0, vy: 0 });
    },
    advance(seconds) { for (let i = 0; i < seconds * 10; i++) state.slimeGardenTick(0.1); },
  };
}

{
  const f = fixture(), s = f.state, first = s.slimeGardenLots[0];
  assert.equal(s.slimeGardenLots.length, 4);
  assert.equal(first.cR - first.cL + 1, 11);
  assert.equal(s.world[4][first.cL].type, 'dirt');
  assert.equal(s.slimeGardenBuy(0), false, 'insufficient cash denies construction');
  s.money = 180;
  assert.equal(s.slimeGardenBuy(0), true);
  assert.equal(s.money, 0);
  assert.equal(s.world[4][first.cL], null);
  assert.equal(s.world[5][first.cR], null);
  assert.equal(s.world[6][first.cR].type, 'foundation');
  assert.equal(s.world[4][first.cL - 1].type, 'foundation');
  assert.equal(s.world[5][first.cR + 1].type, 'foundation');
  assert.equal(f.fluid(0), undefined, 'building never supplies liquid');
  assert.equal(s.slimeGardenBuy(0), false, 'same lot cannot be purchased twice');
}

{
  const f = fixture(), s = f.state;
  s.money = 700;
  s.cargo = [{ type: 'copper', shiny: false }, { type: 'copper', shiny: false }];
  assert.equal(s.slimeGardenBuy(1), false);
  assert.equal(s.money, 700, 'missing materials do not charge cash');
  assert.equal(s.cargo.length, 2, 'missing materials do not spend a partial batch');
  s.cargo.push({ type: 'copper', shiny: true }, { type: 'copper', shiny: false });
  assert.equal(s.slimeGardenBuy(1), true);
  assert.equal(s.money, 50);
  assert.equal(s.cargo.length, 1);
  assert.equal(s.cargo[0].shiny, true, 'ordinary ore is spent before shiny specimens');
}

{
  const f = fixture(), s = f.state, lot = s.slimeGardenLots[0];
  s.money = 180;
  s.slimeGardenBuy(0);
  f.guest(0);
  f.fill(0, [6000, 0, 0, 0, 0]);
  f.advance(5);
  assert.equal(lot.progress, 0, 'a low fill does not grow pearls');
  f.fill(0, [10000, 0, 0, 0, 0]);
  f.advance(41);
  assert.equal(lot.ready, true);
  assert.equal(f.fluid(0)[0], 8200, 'completion incorporates a real water dose');
  f.advance(100);
  assert.equal(f.fluid(0)[0], 8200, 'a waiting pearl does not consume further batches');
  assert.equal(s.money, 0, 'waiting pearls never generate passive cash');
  f.fill(0, [0, 0, 0, 0, 0]);
  s.skySlimes.length = 0;
  assert.equal(s.slimeGardenCollect(0), true, 'finished pearl survives draining or moving its guest');
  assert.equal(s.money, 260);
  assert.equal(s.slimeGardenCollect(0), false);
  assert.equal(s.money, 260, 'a pearl pays once');
  assert.equal(lot.harvests, 1);
}

{
  const f = fixture(), s = f.state;
  s.devMode = true;
  s.slimeGardenBuy(1);
  s.devMode = false;
  f.guest(1);
  const lot = s.slimeGardenLots[1];
  f.fill(1, [11000, 0, 0, 0, 0]);
  f.advance(5);
  assert.equal(lot.progress, 0);
  assert.equal(lot.status, 'ADD BRINE');
  f.fill(1, [8000, 0, 4000, 0, 0]);
  f.advance(10);
  const progress = lot.progress;
  s.skySlimes.length = 0;
  f.advance(4);
  assert.equal(lot.progress, progress, 'missing guest pauses without erasing effort');
  f.guest(1);
  f.advance(39);
  assert.equal(lot.ready, true);
  assert.equal(f.fluid(1)[0], 7100);
  assert.equal(f.fluid(1)[2], 3100, 'mixed recipe consumes both ingredients');
  const saved = JSON.parse(JSON.stringify(s.slimeGardenSave()));
  s.slimeGardenRestore(saved);
  assert.equal(s.slimeGardenLots[1].ready, true);
  assert.equal(s.slimeGardenLots[0].owned, false);
  assert.equal(s.world[6][s.slimeGardenLots[1].cL].type, 'foundation');
  s.slimeGardenRestore(null);
  assert.equal(s.slimeGardenLots[1].owned, false, 'old saves begin with undeveloped lots');
}

{
  const f = fixture(), s = f.state;
  s.surfacePonds = [{ cL: 100, cR: 105, filled: false }, { cL: 200, cR: 206, filled: false }];
  s.world[4][100] = null;
  s.slimeGardenRestore(null);
  assert.equal(s.surfacePonds.length, 1);
  assert.equal(s.surfacePonds[0].cL, 200, 'unrelated lakes survive migration');
  assert.equal(s.world[4][100], null, 'old excavations are not flattened');
  assert.match(s.slimeGardenSourceHint(0), /east/, 'water directions use the surviving lake');
  s.player.x = 7500;
  assert.match(s.slimeGardenSourceHint(0), /west/, 'water direction follows player position');
  s.money = 180;
  s.slimeGardenBuy(0);
  assert.equal(s.surfacePonds.length, 1, 'retired overlapping pond cannot auto-fill new construction');
}

{
  // Exercise the real pond-generation block independently of the unrelated
  // ore/cave passes. This guards the selectable wide/deep worlds on rebase.
  const worldSource = fs.readFileSync(new URL('../js/sluice/030-worldgen.js', import.meta.url), 'utf8');
  const head = worldSource.slice(0, worldSource.indexOf('  function generateWorld()'));
  const start = worldSource.indexOf('    surfacePonds.length = 0;');
  const end = worldSource.indexOf('    slimeGardenPrepareWorld();', start);
  assert(start > 0 && end > start, 'pond generator boundaries exist');
  const pondPass = worldSource.slice(start, end);
  for (const style of ['regular', 'wide', 'deep']) {
    for (let seed = 1; seed <= 24; seed++) {
      const rng = Object.create(Math);
      let randomState = seed;
      rng.random = () => ((randomState = (randomState * 1664525 + 1013904223) >>> 0) / 4294967296);
      const s = { Math: rng, TILE: 32, SKY_ROWS: 4, COLS: 320, SINGLE_TOWN: true,
        DECK_LEFT_COL: 155, DECK_RIGHT_COL: 170,
        window: { location: { search: '' }, SluiceOptions: { pondStyle: style } },
        world: Array.from({ length: 24 }, () => Array(320).fill({ type: 'dirt' })),
        ORES: { stone: { hp: 2 } }, seedLakeShoreSlimes() {} };
      vm.createContext(s);
      vm.runInContext(head + pondPass, s);
      const definition = s.POND_STYLES[style];
      assert(s.surfacePonds.some(p => p.cL > s.DECK_RIGHT_COL), `${style}: east water source exists`);
      for (const pond of s.surfacePonds) {
        const width = pond.cR - pond.cL + 1;
        assert(width >= definition.wMin && width < definition.wMin + definition.wSpan, `${style}: selected width survives`);
        assert(width * pond.d <= definition.maxTiles, `${style}: particle budget survives`);
        assert(pond.cR < s.DECK_LEFT_COL - 63 || pond.cL > s.DECK_RIGHT_COL + 8, `${style}: garden and town remain dry`);
        for (let r = s.SKY_ROWS; r < s.SKY_ROWS + pond.d; r++) {
          assert.equal(s.world[r][pond.cL], null, `${style}: lake interior matches its metadata`);
          assert.equal(s.world[r][pond.cR], null);
          assert.equal(s.world[r][pond.cL - 1].type, 'stone');
          assert.equal(s.world[r][pond.cR + 1].type, 'stone');
        }
        assert.equal(s.world[s.SKY_ROWS + pond.d][pond.cL].type, 'stone');
        if (style === 'deep') assert(pond.d >= 13, 'deep source keeps its selected depth');
      }
    }
  }
}

{
  const s = fixture().state;
  const warm = fs.readFileSync(new URL('../js/sluice/046-shader-warm.js', import.meta.url), 'utf8');
  Object.assign(s, { screenW: 600, screenH: 400, dpr: 1,
    ctx: { setTransform() {} }, skySlimeDust: [{ live: true }],
    siphon: { equipped: false, tank: [2, 0, 0, 0, 0] }, siphonButtons: [{ live: true }],
    siphonAvailable() { return false; },
    slimeGardenDraw() {}, skySlimeDraw() {}, siphonDraw() {},
    siphonHUD() { s.siphonButtons = [{ temporary: true }]; } });
  vm.runInContext(warm, s);
  const original = [s.slimeGardenLots, s.skySlimes, s.skySlimeDust, s.siphon, s.siphonButtons, s.siphonAvailable, s.player];
  const assertRestored = () => {
    const current = [s.slimeGardenLots, s.skySlimes, s.skySlimeDust, s.siphon, s.siphonButtons, s.siphonAvailable, s.player];
    current.forEach((value, i) => assert.equal(value, original[i], 'warm-up restores every borrowed live reference'));
  };
  s.shaderWarmGarden(1, 0, 0);
  assertRestored();
  s.skySlimeDraw = () => { throw new Error('warm-test'); };
  assert.throws(() => s.shaderWarmGarden(1, 0.3, 0.2), /warm-test/);
  assertRestored();
}

console.log('Slime garden checks passed: economy, persistence, pond-style compatibility (72 seeded worlds), and shader warm-up state restoration.');
