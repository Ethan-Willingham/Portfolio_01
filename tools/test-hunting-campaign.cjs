const assert = require('node:assert/strict');
const { Campaign, DEER_LEVELS, animalArt, animalName, period } = require('../js/hunting-campaign.js');
function check(name, run) { run(); console.log('PASS ' + name); }
check('the clock runs in real time, supports fast wait and rolls into tomorrow', () => {
  const c = new Campaign(); c.advance(60); assert.equal(c.time, '05:31');
  c.advance(600, 0); assert.equal(c.time, '05:31'); c.advance(10, 300); assert.equal(c.time, '06:21');
  assert.equal(c.waitUntil('06:00'), true); assert.equal(c.day, 2); assert.equal(c.time, '06:00');
  const at = c.state.minute; assert.equal(c.waitUntil('25:99'), false); assert.equal(c.state.minute, at);
  c.waitUntil('22:00'); assert.equal(period(c.state.minute), 'Night'); assert.equal(c.begin(), null);
  c.waitUntil('19:55'); assert.equal(c.begin(), null); c.waitUntil('06:00'); assert.ok(c.begin());
});
check('sales, trophies and purchases cannot charge or pay twice', () => {
  const c = new Campaign(), animal = c.animal('deer', 12);
  const r = c.recover(animal); const value = c.value(r); assert.equal(c.sell(r.id), value);
  assert.equal(c.sell(r.id), 0); assert.equal(c.state.credits, 160 + value); assert.equal(c.state.records.length, 1);
  const trophy = c.recover(c.animal('deer', 50)); assert.equal(c.mount(trophy.id), true);
  assert.equal(c.sell(trophy.id), 0); assert.equal(c.mount(trophy.id), false);
  c.state.credits = 1000; assert.equal(c.buy('rifle'), true); assert.equal(c.buy('rifle'), false);
  assert.equal(c.state.credits, 600); assert.equal(c.buy('dog'), true); assert.equal(c.buy('kit'), true);
  assert.equal(c.buy('missing'), false); assert.equal(c.state.credits, 200);
  assert.equal(c.begin().windScale, .6); assert.equal(c.begin().dog, true);
});
check('the new area needs recoveries and credits, then stays unlocked', () => {
  const c = new Campaign(); c.state.credits = 1000; assert.equal(c.unlock('cypress'), false);
  c.recover(c.animal('deer', 1)); c.recover(c.animal('deer', 2)); assert.equal(c.unlock('cypress'), true);
  assert.equal(c.state.credits, 650); assert.equal(c.unlock('cypress'), false); assert.equal(c.begin().region, 'cypress');
});
check('old trails have lower odds and dogs shorten and improve a search', () => {
  const c = new Campaign(), t = c.addTrack(c.animal('deer', 28)); const fresh = c.trackChance(t);
  c.state.minute += 240; assert.ok(c.trackChance(t) < fresh);
  const alone = c.trackChance(t); c.state.owned.push('dog'); assert.ok(c.trackChance(t) > alone);
  const dogResult = c.search(t.id); assert.equal(dogResult.minutes, 12); assert.equal(c.search(t.id), null);
  const other = new Campaign(), another = other.addTrack(other.animal('deer', 28));
  assert.equal(other.search(another.id).minutes, 20);
});
check('delayed recovery loses value, the kit slows loss, and searches have real failure', () => {
  let recovered = false, failed = false;
  for (let seed = 1; seed < 100 && !(recovered && failed); seed++) {
    const fresh = new Campaign(), old = new Campaign(), dressed = new Campaign();
    for (const c of [fresh, old, dressed]) c.addTrack(c.animal('deer', seed));
    old.state.minute += 360; dressed.state.minute += 360; dressed.state.owned.push('kit');
    const a = fresh.search(1), b = old.search(1), d = dressed.search(1);
    if (a.found && b.found && d.found) { assert.ok(old.value(b.record) < fresh.value(a.record)); assert.ok(dressed.value(d.record) > old.value(b.record)); recovered = true; }
    if (!a.found) { assert.equal(fresh.packed.length, 0); failed = true; }
  }
  assert.ok(recovered && failed);
});
check('saved records, equipment, credits and trails survive reload', () => {
  const c = new Campaign(); c.state.credits = 1000; c.buy('dog'); c.buy('kit'); c.buy('rifle');
  c.recover(c.animal('boar', 8), 'tracked', .6, 'cypress'); c.addTrack(c.animal('deer', 7)); c.state.minute += 40;
  const loaded = new Campaign(JSON.parse(c.export())); assert.deepEqual(loaded.state, c.state);
  assert.equal(loaded.packed.length, 1); assert.equal(loaded.pending.length, 1);
  assert.equal(loaded.value(loaded.packed[0]), c.value(c.packed[0]));
  const malformed = new Campaign({ version: 1, credits: -10, owned: ['made-up'], regions: ['made-up'], records: [{ species: '<script>' }] });
  assert.equal(malformed.state.credits, 0); assert.equal(malformed.state.records.length, 0); assert.deepEqual(malformed.state.regions, ['birch']);
});
check('five deer levels unlock on deer recoveries and keep the selected outing level', () => {
  const c = new Campaign();
  assert.equal(c.selectDeerLevel(2), false); assert.equal(c.selectDeerLevel(0), false);
  for (let i = 0; i < 14; i++) {
    const before = c.maxDeerLevel;
    c.recover(c.animal('deer', 100 + i));
    const unlocked = DEER_LEVELS.filter(d => d.required <= i + 1).at(-1).level;
    assert.equal(c.maxDeerLevel, unlocked);
    if (unlocked > before) assert.equal(c.state.deerLevel, unlocked);
  }
  assert.equal(c.maxDeerLevel, 5); assert.equal(c.begin().deerLevel, 5);
  const next = c.animal('deer', 4), record = c.recover(next);
  assert.equal(next.level, 5); assert.equal(animalArt(record), 'deer-5'); assert.equal(animalName(record), 'Crowned stag');
  assert.equal(c.selectDeerLevel(2), true); assert.equal(c.begin().deerLevel, 2);
  assert.equal(c.animal('deer', 4, 5).level, 5);
  assert.equal(new Campaign(JSON.parse(c.export())).state.deerLevel, 2);
  const boars = new Campaign(); for (let i = 0; i < 15; i++) boars.recover(boars.animal('boar', i));
  assert.equal(boars.maxDeerLevel, 1);
});
check('deer levels survive trophies and tracking, and old saves migrate without losing progress', () => {
  const c = new Campaign();
  for (let i = 0; i < 14; i++) c.recover(c.animal('deer', i));
  const trophy = c.recover(c.animal('deer', 4)); c.mount(trophy.id); c.sellAll();
  const trail = c.addTrack(c.animal('deer', 7));
  const loaded = new Campaign(JSON.parse(c.export()));
  assert.equal(loaded.state.records.at(-1).level, 5); assert.equal(loaded.pending[0].level, 5);
  assert.equal(loaded.maxDeerLevel, 5);
  const result = loaded.search(trail.id);
  if (result.found) assert.equal(result.record.level, 5);
  const legacy = JSON.parse(c.export()); delete legacy.deerLevel;
  legacy.records.forEach(r => delete r.level); legacy.tracks.forEach(t => delete t.level);
  const migrated = new Campaign(legacy);
  assert.equal(migrated.state.deerLevel, 5); assert.equal(migrated.state.records.at(-1).level, 1);
  assert.equal(migrated.pending[0].level, 1); assert.equal(migrated.state.credits, c.state.credits);
  legacy.deerLevel = 99; assert.equal(new Campaign(legacy).state.deerLevel, 1);
});
