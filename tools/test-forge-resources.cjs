// Fire room stock survives sales; dev supplies never debit saved resources.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function fixture() {
  const math = Object.create(Math);
  math.random = () => 0.99;
  const notices = [], saves = [], cleared = [];
  const s = {
    Math: math, ENABLE_BATH: true, cargo: [], money: 0, oilGallons: 0, devMode: false,
    siphon: { tank: [0, 0, 0, 0, 0] }, bathMode: true, bathFading: false, gamePaused: false,
    bathRoomReady: true, bathFloorsOwned: [true, false, false, false, false],
    hearthRoomSave: () => ({ resources: s.forgeResourcesSave() }),
    ORES: { coal: { value: 5 }, iron: { value: 35 }, copper: { value: 12 }, stone: { value: 0 } },
    LIQUID_OIL_VALUE: 18,
    cargoType: u => (u && u.type) || u, cargoShiny: u => !!(u && u.shiny),
    cargoUnitValue(u) { return s.ORES[s.cargoType(u)].value * (s.cargoShiny(u) ? 3 : 1); },
    showMsg: text => notices.push(text), saveNow: why => saves.push(why), sfxPlay() {},
    TILE: 32, SKY_ROWS: 0, TOTAL_ROWS: 1, COLS: 1, world: [[{ type: 'stone' }]],
    player: { x: 1000, y: 1000 }, PLAYER_W: 22, PLAYER_H: 26,
    markTerrainCleared: (r, c) => cleared.push([r, c]),
    spawnMineBreak() {}, sfxPanAt: () => 0, jelloBombShove() {}, explosions: []
  };
  vm.createContext(s);
  for (const name of ['060-shop-logic', '074-bath-service', '079-forge-resources']) {
    vm.runInContext(fs.readFileSync('js/sluice/' + name + '.js', 'utf8'), s);
  }
  s.showMsg = text => notices.push(text);
  return { s, notices, saves, cleared };
}
const units = (type, n, shiny = false) => Array.from({ length: n }, () => ({ type, shiny }));
const plain = value => JSON.parse(JSON.stringify(value));

for (const sale of ['instant', 'auto', 'reveal']) {
  const { s, notices } = fixture();
  s.cargo = [...units('coal', 26), ...units('iron', 10), ...units('coal', 1, true), ...units('iron', 1, true), ...units('copper', 2)];
  if (sale === 'instant') s.sellCargo(false);
  else if (sale === 'auto') s.sellCargo(true);
  else s.startSellReveal();
  assert.deepEqual(plain(s.forgeStock), { coal: 24, iron: 0, flint: 0, steel: 1 });
  assert.equal(s.cargo.length, 0, 'excess and shiny stock remain saleable');
  const expected = 2 * 5 + 10 * 35 + 3 * 5 + 3 * 35 + 2 * 12;
  assert.equal(sale === 'instant' ? s.money : s.sellReveal.grand, expected);
  assert.equal(notices.filter(n => n.startsWith('Stored ')).length, 1, 'nested sale paths reserve once');
  console.log('PASS bounded stock and correct sale value through ' + sale);
}

{
  const { s } = fixture();
  s.forgeGive('coal', 23);
  s.cargo = [...units('coal', 2), ...units('iron', 1), ...units('iron', 1, true), 'iron'];
  assert.equal(s.forgeCount('iron'), 2, 'old string cargo is accepted, shiny cargo is protected');
  const before = JSON.stringify({ stock: s.forgeStock, cargo: s.cargo });
  assert.equal(s.forgeTake('iron', 3), false);
  assert.equal(JSON.stringify({ stock: s.forgeStock, cargo: s.cargo }), before, 'failed recipe spends nothing');
  assert.equal(s.forgeTake('iron', 2), true);
  assert.equal(s.forgeCount('iron'), 0);
  assert.equal(s.cargo.filter(s.cargoShiny).length, 1);
  assert.equal(s.forgeTake('coal', 25), true, 'stock and cargo form one atomic supply');
  assert.equal(s.forgeCount('coal'), 0);
  s.forgeGive('coal', 25);
  assert.equal(s.forgeCount('coal'), 25, 'returning physical fuel above the auto-reserve cap loses nothing');
  s.cargo.push(...units('coal', 2)); s.forgeStockCargo();
  assert.equal(s.forgeStock.coal, 25, 'automatic reservation stops above its cap');
  assert.equal(s.forgeCount('coal'), 27);
  for (const amount of [-1, 1.5, Infinity, NaN]) assert.equal(s.forgeTake('coal', amount), false);
  assert.equal(s.forgeGive('__proto__', 1), false);
  console.log('PASS atomic recipes, protected shiny ore, legacy cargo and lossless refunds');
}

{
  const { s } = fixture();
  s.forgeGive('coal', 3); s.forgeGive('iron', 2);
  s.cargo = [...units('coal', 2), ...units('iron', 2), ...units('coal', 1, true)];
  const before = JSON.stringify({ resources: s.forgeResourcesSave(), cargo: s.cargo });
  assert.equal(s.hearthHasTool('flint'), false);
  assert.equal(s.hearthHasTool('steel'), true, 'the boiler includes a reusable steel striker');
  s.devMode = true;
  assert.equal(s.hearthDevSupplies(), true);
  for (const type of ['coal', 'iron', 'flint']) {
    assert(s.forgeCount(type) > 100);
    assert(Number.isFinite(s.forgeCount(type)), 'virtual stock is finite');
    for (let i = 0; i < 100; i++) assert.equal(s.forgeTake(type, 10), true);
  }
  assert.equal(s.forgeCount('steel'), 1, 'dev mode keeps the real built-in striker in saved stock');
  assert.equal(s.hearthHasTool('flint'), true);
  assert.equal(s.hearthHasTool('steel'), true);
  assert.equal(s.hearthHasTool('coal'), false);
  assert.equal(s.forgeTake('steel', 1), true, 'dev tools do not require stored steel');
  for (const amount of [-1, 1.5, Infinity, NaN, '1']) assert.equal(s.forgeTake('coal', amount), false);
  assert.equal(s.forgeTake('__proto__', 1), false);
  assert.equal(JSON.stringify({ resources: s.forgeResourcesSave(), cargo: s.cargo }), before,
    'dev consumption leaves real stock, cargo, and save payload unchanged');
  s.forgeResourcesRestore(plain(s.forgeResourcesSave()));
  s.devMode = false;
  assert.equal(s.forgeCount('coal'), 5);
  assert.equal(s.forgeCount('iron'), 4);
  assert.equal(s.hearthHasTool('flint'), false);
  assert.equal(s.hearthHasTool('steel'), true);
  s.forgeGive('steel', 1);
  assert.equal(s.hearthHasTool('steel'), true, 'legacy crafted tools remain available in normal play');
  console.log('PASS unlimited dev fuel and tools without consuming or serializing virtual inventory');
}

{
  const { s } = fixture();
  s.bathSupplies[0] = 100; s.siphon.tank[0] = 120;
  assert.equal(s.bathWaterCount(), 220);
  const before = JSON.stringify({ supplies: s.bathSupplies, tank: s.siphon.tank });
  assert.equal(s.bathTakeWater(221), false);
  for (const amount of [-1, 1.5, Infinity, NaN, '1']) assert.equal(s.bathTakeWater(amount), false);
  assert.equal(JSON.stringify({ supplies: s.bathSupplies, tank: s.siphon.tank }), before,
    'insufficient or invalid water withdrawals spend nothing');
  assert.equal(s.bathTakeWater(200), true);
  assert.equal(s.bathSupplies[0], 0, 'recovered water is consumed first');
  assert.equal(s.siphon.tank[0], 20, 'the tank covers only the remainder');
  s.bathBasinCount = () => 0;
  assert.equal(s.bathAddWater(), true);
  assert.equal(s.bathPour, 20, 'the bath queues only available water');
  assert.equal(s.bathWaterCount(), 0);
  assert.equal(s.bathAddWater(), false);
  console.log('PASS normal water conservation and atomic bath transfers');
}

{
  const { s } = fixture();
  s.bathSupplies[0] = 17; s.siphon.tank[0] = 23;
  const before = JSON.stringify({ supplies: s.bathSupplies, tank: s.siphon.tank });
  s.devMode = true;
  assert.equal(s.bathWaterCount(), s.BATH_MAX_WATER);
  for (let i = 0; i < 100; i++) assert.equal(s.bathTakeWater(200), true);
  for (const amount of [-1, 1.5, Infinity, NaN, '1']) assert.equal(s.bathTakeWater(amount), false);
  s.bathBasinCount = () => 0;
  assert.equal(s.bathAddWater(), true);
  assert.equal(s.bathPour, s.BATH_MAX_WATER);
  assert.equal(s.bathAddWater(), false, 'unlimited supply still respects the tub and pending pour capacity');
  const saved = s.bathServiceSave();
  assert.equal(saved.pour, s.BATH_MAX_WATER);
  assert.equal(saved.supplies[0], 17, 'saved water records real inventory');
  assert.equal(JSON.stringify({ supplies: s.bathSupplies, tank: s.siphon.tank }), before);
  assert(!JSON.stringify(saved).includes('null'), 'save payload contains no non-finite virtual water');
  s.bathPour = 0;
  s.bathBasinCount = () => s.BATH_MAX_WATER - 123;
  assert.equal(s.bathAddWater(), true);
  assert.equal(s.bathPour, 123, 'dev filling accounts for existing basin water');
  s.devMode = false;
  assert.equal(s.bathWaterCount(), 40);
  assert.equal(s.bathTakeWater(200), false, 'normal costs resume immediately');
  console.log('PASS unlimited dev water, bounded pours, preserved tank and finite serialization');
}

{
  const { s } = fixture();
  assert.equal(s.forgeStoneDrop('dirt'), false);
  assert.equal(s.forgeStoneDrop('iron'), false);
  assert.equal(s.forgeStoneSinceFlint, 0);
  for (let i = 0; i < 11; i++) assert.equal(s.forgeStoneDrop('stone'), false);
  const pending = plain(s.forgeResourcesSave());
  s.forgeResourcesRestore(pending);
  assert.equal(s.forgeStoneDrop('stone'), true, 'first flint guaranteed after twelve real stone breaks across a reload');
  assert.equal(s.forgeStock.flint, 1);
  s.Math.random = () => 0;
  assert.equal(s.forgeStoneDrop('stone'), true, 'ordinary random drop works');
  assert.equal(s.forgeStoneDrop('stone'), true);
  assert.equal(s.forgeStoneDrop('stone'), false, 'durable flint inventory stays bounded');
  assert.equal(s.forgeStock.flint, 3);
  s.forgeGive('steel', 1); s.forgeGive('coal', 31);
  const saved = plain(s.forgeResourcesSave());
  s.forgeResourcesReset();
  assert.equal(s.forgeCount('steel'), 1);
  s.forgeResourcesRestore(saved);
  assert.deepEqual(plain(s.forgeResourcesSave()), saved);
  s.forgeResourcesRestore();
  assert.deepEqual(plain(s.forgeStock), { coal: 0, iron: 0, flint: 0, steel: 1 }, 'older saves receive the built-in striker');
  s.forgeResourcesRestore({ stock: { coal: 6, iron: 7, flint: 1, steel: 0 }, stoneSinceFlint: 8 });
  assert.deepEqual(plain(s.forgeStock), { coal: 6, iron: 7, flint: 1, steel: 1 }, 'migration preserves old stock and supplies the retired forge reward');
  const migrated = plain(s.forgeResourcesSave());
  s.forgeResourcesRestore(migrated);
  assert.deepEqual(plain(s.forgeResourcesSave()), migrated, 'repeated restores do not duplicate supplies');
  console.log('PASS bounded flint discovery, progress persistence and additive save defaults');
}

{
  const { s, cleared, saves } = fixture();
  s.forgeStoneSinceFlint = 11;
  s.detonateBomb({ size: 'small', r: 0, c: 0 });
  assert.equal(s.world[0][0], null);
  assert.equal(cleared.length, 1);
  assert.equal(s.forgeStock.flint, 1, 'the actual bomb destruction path collects stone flint');
  assert(saves.includes('forge-flint'));
  s.detonateBomb({ size: 'small', r: 0, c: 0 });
  assert.equal(s.forgeStock.flint, 1, 'already cleared terrain cannot grant a second drop');
  console.log('PASS actual bomb collection and no duplicate drops');
}

{
  const { s } = fixture();
  s.ENABLE_BATH = false;
  s.cargo = units('coal', 2);
  s.sellCargo(false);
  assert.equal(s.money, 10, 'disabled bath does not reserve mining income');
  assert.equal(s.forgeStock.coal, 0);
  s.forgeStoneSinceFlint = 11;
  assert.equal(s.forgeStoneDrop('stone'), false);
  assert.equal(s.forgeStock.flint, 0);
  console.log('PASS feature toggle preserves ordinary mining and sale behavior');
}
