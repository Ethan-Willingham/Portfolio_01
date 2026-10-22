/* Full-speed swell encounters must remain readable in the actual hull response.
 * Run with --historical to replay the complete v0.31 source from Git. The default
 * uses its small spectrum fixture with today's sampler and hull solver so CI
 * needs no Git history, and future solver changes apply equally to both seas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/widewake-waves.js'), 'utf8');
// Captured from d7d97e88:js/widewake-waves.js, before the readable long swell.
const previousBands = [
  {length:72, amplitude:2.4, angle:-3.8, phase:.7, crestLength:137},
  {length:49, amplitude:1.5, angle:-.5, phase:2.4, crestLength:101},
  {length:33, amplitude:1.0, angle:-1.15, phase:4.1, crestLength:64},
  {length:22, amplitude:.45, angle:-2.9, phase:1.2, crestLength:48},
  {length:13, amplitude:.40, angle:-3.6, phase:3.5, crestLength:28},
  {length:8, amplitude:.22, angle:-.8, phase:5.3, crestLength:18}
];
const spectrumDeclaration = /const bands=Object\.freeze\(\[[\s\S]*?\]\.map/;
assert.ok(spectrumDeclaration.test(source), 'locate the spectrum for the historical fixture');
const baselineSource = process.argv.includes('--historical')
  ? require('node:child_process').execFileSync('git', ['show', 'd7d97e88:js/widewake-waves.js'], {cwd:root, encoding:'utf8'})
  : source.replace(spectrumDeclaration, `const bands=Object.freeze(${JSON.stringify(previousBands)}.map`);
function load(code) {
  const context = {module:{exports:{}}, Math};
  vm.runInNewContext(code, context);
  return context.module.exports;
}

const DT = 1 / 60, WARMUP = 10, DURATION = 90;
const seeds = [[100,2200,7.3], [-370,3481,23.7], [817,-923,51.9]];
const hulls = [
  {name:'launch', length:6, width:2.3, speed:36},
  {name:'patrol', length:38, width:12, speed:72}
];
// World headings are fixed for a fair comparison, including travel directly
// into, with and across the established main swell, plus two oblique routes.
const headings = [
  ['opposing', -3.8 + Math.PI], ['following', -3.8],
  ['cross', -3.8 + Math.PI / 2], ['east', 0], ['north', Math.PI / 2]
];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function percentile(values, p) {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.floor((sorted.length - 1) * p)];
}

// A crest counts only after a 70 cm rise and a 70 cm fall. This measures a
// visible boat-sized encounter instead of counting every decorative ripple.
// No temporal smoothing or minimum spacing can hide short-wave encounters.
function crests(values) {
  let low = values[0], high = values[0], peak = 0, rising = false;
  const result = [];
  for (let i = 1; i < values.length; i++) {
    if (!rising) {
      low = Math.min(low, values[i]);
      if (values[i] - low >= .7) {
        rising = true;
        high = values[i];
        peak = i;
      }
    } else {
      if (values[i] > high) { high = values[i]; peak = i; }
      if (high - values[i] >= .7) {
        result.push(peak * DT);
        rising = false;
        low = values[i];
      }
    }
  }
  return result;
}
function correlation(a, b, shift) {
  let x = 0, y = 0, xx = 0, yy = 0, xy = 0, count = 0;
  for (let i = Math.max(0, -shift); i < Math.min(a.length, b.length - shift); i++) {
    const p = a[i], q = b[i + shift];
    x += p; y += q; xx += p*p; yy += q*q; xy += p*q; count++;
  }
  return (xy - x*y/count) / Math.sqrt((xx - x*x/count) * (yy - y*y/count));
}
function responseMatch(target, response) {
  let best = {correlation:-1, lag:0};
  // Search both directions: an unrelated bob that leads the arriving wave
  // must not pass merely because a later periodic cycle happens to correlate.
  for (let shift = -12; shift <= 30; shift++) {
    const value = correlation(target, response, shift);
    if (value > best.correlation) best = {correlation:value, lag:shift*DT};
  }
  return {...best, simultaneous:correlation(target, response, 0)};
}
function accelerationRms(values) {
  let energy = 0;
  for (let i = 2; i < values.length; i++) {
    const acceleration = (values[i] - 2*values[i-1] + values[i-2]) / (DT*DT);
    energy += acceleration*acceleration;
  }
  return Math.sqrt(energy / (values.length - 2));
}
function crestMatch(target, response) {
  let matches = 0, j = 0;
  for (const crest of target) {
    while (j < response.length && response[j] < crest - .1) j++;
    if (j < response.length && response[j] <= crest + .45) { matches++; j++; }
  }
  return matches / target.length;
}
function voyage(W, hull, angle, seed) {
  const [x, y, time] = seed, sea = new W.Sea();
  const ship = {...hull, id:0, x, y, angle, vx:Math.cos(angle)*hull.speed,
    vy:Math.sin(angle)*hull.speed, hp:100, hold:32, cargo:0, turn:0};
  const target = [], heave = [], bowStern = [], sideSide = [], pitch = [], roll = [];
  for (let n = 0; n < (WARMUP + DURATION) / DT; n++) {
    // Prescribe the full-speed track so waves cannot slow the test to a pass.
    // The production solver still uses each probe's material surface velocity,
    // all buoyancy springs, damping and tilt limits. Only horizontal wave forces
    // are disabled; own wake is excluded by its normal owner filtering.
    ship.x = x + n*DT*ship.vx;
    ship.y = y + n*DT*ship.vy;
    sea.begin(time + n*DT);
    sea.stepShip(ship, DT, false);
    if (n < WARMUP / DT) continue;
    target.push(ship.sea.surface);
    heave.push(ship.sea.z);
    bowStern.push(sea.probes[1].height - sea.probes[2].height);
    sideSide.push(sea.probes[3].height - sea.probes[4].height);
    pitch.push(ship.sea.pitch);
    roll.push(ship.sea.roll);
  }
  const supportCrests = crests(target), hullCrests = crests(heave);
  const intervals = supportCrests.slice(1).map((time, i) => time - supportCrests[i]);
  return {
    intervals, crests:supportCrests.length, crestRatio:hullCrests.length/supportCrests.length,
    matched:crestMatch(supportCrests, hullCrests),
    heave:responseMatch(target, heave), pitch:responseMatch(bowStern, pitch),
    roll:responseMatch(sideSide, roll), range:Math.max(...heave)-Math.min(...heave),
    acceleration:accelerationRms(heave),
    angularAcceleration:Math.hypot(accelerationRms(pitch), accelerationRms(roll))
  };
}
function measure(W) {
  const rows = [];
  for (const hull of hulls) for (const [heading, angle] of headings) {
    rows.push({hull:hull.name, heading, runs:seeds.map(seed => voyage(W, hull, angle, seed))});
  }
  return rows;
}
const before = measure(load(baselineSource)), after = measure(load(source));
const results = [];
for (let i = 0; i < after.length; i++) {
  const row = after[i], old = before[i], label = `${row.hull} ${row.heading}`;
  for (let seed = 0; seed < seeds.length; seed++) {
    const run = row.runs[seed], previous = old.runs[seed], name = `${label}, seed ${seed}`;
    assert.ok(run.crests >= 5 && run.range > 3.5, `${name}: keep substantial visible wave motion`);
    assert.ok(Math.min(...run.intervals) >= 1, `${name}: significant waves must not arrive less than a second apart`);
    assert.ok(percentile(run.intervals, .1) > 1.15, `${name}: repeated encounters leave time to read the face`);
    assert.ok(run.matched >= .9 && run.crestRatio >= .88 && run.crestRatio <= 1.12,
      `${name}: each arriving crest should produce one recognizable hull rise`);
    assert.ok(run.heave.simultaneous > .7 && run.heave.correlation > .97,
      `${name}: actual heave must follow the water supporting the hull`);
    for (const axis of ['heave', 'pitch', 'roll']) {
      assert.ok(run[axis].lag >= -.025 && run[axis].lag <= .35,
        `${name}: ${axis} must respond to this wave, within 350 ms`);
      assert.ok(run[axis].correlation > .965, `${name}: ${axis} must retain the arriving wave's shape`);
    }
    assert.ok(run.acceleration < previous.acceleration*.65,
      `${name}: fewer rapid vertical jolts than the v0.31 spectrum`);
    assert.ok(run.angularAcceleration < previous.angularAcceleration*.55,
      `${name}: suppress short-wave tilt jitter without flattening the ride`);
  }
  const intervals = row.runs.flatMap(run => run.intervals);
  const oldIntervals = old.runs.flatMap(run => run.intervals);
  if (row.heading === 'opposing') {
    assert.ok(percentile(intervals, .5) > (row.hull === 'launch' ? 2.3 : 1.4),
      `${label}: full-speed head-on swell spacing remains readable`);
    assert.ok(percentile(intervals, .5) > percentile(oldIntervals, .5)*1.65,
      `${label}: materially improve encounter spacing over v0.31`);
  }
  results.push({
    hull:row.hull, heading:row.heading,
    oldMedian:percentile(oldIntervals, .5), median:percentile(intervals, .5),
    p10:percentile(intervals, .1), shortest:Math.min(...intervals),
    correlation:Math.min(...row.runs.map(run => run.heave.correlation)),
    lag:Math.max(...row.runs.map(run => run.heave.lag)),
    matched:Math.min(...row.runs.map(run => run.matched)),
    accelerationRatio:mean(row.runs.map(run => run.acceleration)) / mean(old.runs.map(run => run.acceleration))
  });
}
// The historical sea is a negative control: the test must expose the rapid
// patrol encounters that originally made the boat's response hard to read.
const oldPatrol = before.find(row => row.hull === 'patrol' && row.heading === 'opposing');
const oldIntervals = oldPatrol.runs.flatMap(run => run.intervals);
assert.ok(oldIntervals.filter(interval => interval < 1).length / oldIntervals.length > .5);

console.table(results.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
  [key, typeof value === 'number' ? Number(value.toFixed(3)) : value]))));
console.log('PASS 30 full-speed voyages: distinct swell encounters, matched heave/pitch/roll, bounded phase lag and reduced jolts against v0.31');
