'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const tool = require('./archive-globe-aurora.cjs');
const consumer = require('../js/globe-data.js');
const fixture = path.join(__dirname, 'fixtures/daylight/ovation-2026-10-04-storm.json');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'globe-aurora-test-'));
const now = Date.parse('2026-10-05T03:00:00Z');
const checks = [];
function test(name, callback) { callback(); checks.push(name); }
function source(observation = '2026-10-05T02:30:00Z', forecast = '2026-10-05T03:20:00Z') {
  const coordinates = [];
  for (let lat = -90; lat <= 90; lat++) for (let lon = 0; lon < 360; lon++) coordinates.push([lon, lat, 0]);
  for (const [i, probability] of [[0, 0.125], [359, 0.12345678901234568], [360, 42.75], [65159, 100]]) coordinates[i][2] = probability;
  return { 'Observation Time': observation, 'Forecast Time': forecast, coordinates };
}
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
try {
  const actual = JSON.parse(fs.readFileSync(fixture));
  test('Actual NOAA grid preserves every coordinate and exact probability after RLE', () => {
    const parsed = tool.parseNOAA(actual);
    const encoded = tool.encodeFrame(parsed);
    assert.deepEqual(tool.decodeFrame(JSON.parse(JSON.stringify(encoded))), parsed);
  });
  test('Fractional probabilities, row crossing and last polar node are exact', () => {
    const parsed = tool.parseNOAA(source()); const encoded = tool.encodeFrame(parsed);
    assert.deepEqual(encoded.runs, [[0, [0.125]], [359, [0.12345678901234568, 42.75]], [65159, [100]]]);
    assert.deepEqual(tool.decodeFrame(JSON.parse(JSON.stringify(encoded))).grid, parsed.grid);
  });
  test('Reversed coordinate order and negative longitude aliases give identical grids', () => {
    const input = source(); const altered = structuredClone(input);
    altered.coordinates.reverse(); altered.coordinates.forEach(p => { if (p[0] > 180) p[0] -= 360; });
    assert.deepEqual(tool.parseNOAA(altered), tool.parseNOAA(input));
  });
  for (const [name, corrupt] of [
    ['Missing coordinate', s => s.coordinates.pop()],
    ['Duplicate longitude alias', s => { s.coordinates[1] = [360, -90, 1]; }],
    ['Negative probability', s => { s.coordinates[2][2] = -1; }],
    ['Probability above 100', s => { s.coordinates[2][2] = 100.1; }],
    ['String probability', s => { s.coordinates[2][2] = '10'; }],
    ['Noninteger longitude', s => { s.coordinates[2][0] = 1.5; }],
    ['Noninteger latitude', s => { s.coordinates[2][1] = -89.5; }],
    ['Impossible calendar date', s => { s['Observation Time'] = '2026-02-30T02:30:00Z'; }],
    ['Missing UTC timezone', s => { s['Observation Time'] = '2026-10-05T02:30:00'; }],
    ['Forecast before observations', s => { s['Forecast Time'] = '2026-10-05T02:29:59Z'; }],
    ['Forecast lead 120 minutes plus one millisecond', s => { s['Forecast Time'] = '2026-10-05T04:30:00.001Z'; }],
    ['Audited 300-minute forecast lead', s => { s['Forecast Time'] = '2026-10-05T07:30:00Z'; }]
  ]) test(name + ' is rejected without archive mutation', () => {
    const input = source(); corrupt(input);
    assert.throws(() => tool.archiveFrames([input], { directory, now }));
    assert.deepEqual(fs.readdirSync(directory), []);
  });
  test('All zero quiet grid is valid and encodes as no runs', () => {
    const input = source(); input.coordinates.forEach(p => { p[2] = 0; });
    assert.deepEqual(tool.encodeFrame(tool.parseNOAA(input)).runs, []);
  });
  test('Exact 120-minute archive lead publishes a manifest and gzip frame accepted by the browser consumer', () => {
    const input = source('2026-10-05T02:30:00Z', '2026-10-05T04:30:00Z');
    const boundaryDirectory = path.join(directory, 'two-hour-boundary');
    const result = tool.archiveFrames([input], { directory: boundaryDirectory, now, requireFresh: true });
    assert.equal(result.added, 1);
    const manifest = JSON.parse(fs.readFileSync(path.join(boundaryDirectory, 'manifest.json')));
    const [entry] = consumer.parseAuroraManifest(manifest);
    assert.equal(entry.forecast - entry.observation, 120 * 60000);
    const bytes = fs.readFileSync(path.join(boundaryDirectory, entry.file));
    assert.equal(sha(bytes), entry.sha256);
    const frame = JSON.parse(zlib.gunzipSync(bytes));
    const decoded = consumer.parseAuroraArchive(frame);
    assert.equal(+decoded.observation, +entry.observation);
    assert.equal(+decoded.forecast, +entry.forecast);
    assert.equal(decoded.grid[0], 0.125);
  });
  test('Archive decoder and browser consumer both reject 120 minutes plus one millisecond and the 300-minute repro', () => {
    const frame = tool.encodeFrame(tool.parseNOAA(source()));
    const valid = { ...frame, forecast: '2026-10-05T04:30:00.000Z' };
    assert.equal(Date.parse(tool.decodeFrame(valid).forecast) - Date.parse(valid.observation), 120 * 60000);
    for (const forecast of ['2026-10-05T04:30:00.001Z', '2026-10-05T07:30:00Z']) {
      assert.throws(() => tool.decodeFrame({ ...frame, forecast }), /two-hour/);
      assert.throws(() => consumer.parseAuroraArchive({ ...frame, forecast }), /forecast/);
      assert.throws(() => consumer.parseAuroraManifest({ version: 1, frames: [{
        file: 'unsupported-lead.json.gz', sha256: 'a'.repeat(64), observation: frame.observation, forecast
      }] }), /entry time/);
    }
  });
  test('Full live freshness limits are inclusive and reject one millisecond beyond', () => {
    const iso = t => new Date(t).toISOString();
    tool.assertFresh({ observation: iso(now - 180 * 60000), forecast: iso(now - 90 * 60000) }, now);
    tool.assertFresh({ observation: iso(now + 5 * 60000), forecast: iso(now + 120 * 60000) }, now);
    for (const frame of [
      { observation: iso(now - 180 * 60000 - 1), forecast: iso(now) },
      { observation: iso(now + 5 * 60000 + 1), forecast: iso(now + 6 * 60000) },
      { observation: iso(now - 180 * 60000), forecast: iso(now - 90 * 60000 - 1) },
      { observation: iso(now), forecast: iso(now + 120 * 60000 + 1) }
    ]) assert.throws(() => tool.assertFresh(frame, now));
  });
  test('Duplicate imports are idempotent with unchanged manifest bytes and updatedAt', () => {
    const input = source();
    assert.equal(tool.archiveFrames([input, input], { directory, now }).added, 1);
    const bytes = fs.readFileSync(path.join(directory, 'manifest.json'));
    assert.equal(tool.archiveFrames([input], { directory, now: now + 60000 }).changed, false);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'manifest.json')), bytes);
    const manifest = JSON.parse(bytes); const frame = fs.readFileSync(path.join(directory, manifest.frames[0].file));
    assert.equal(sha(frame), manifest.frames[0].sha256);
    assert.equal(frame.readUInt32LE(4), 0);
    assert.deepEqual(tool.decodeFrame(JSON.parse(zlib.gunzipSync(frame))), tool.parseNOAA(input));
  });
  test('Stale default capture fails before retention or append mutations', () => {
    const before = fs.readFileSync(path.join(directory, 'manifest.json'));
    assert.throws(() => tool.archiveFrames([source('2026-10-04T23:59:59Z', '2026-10-05T00:40:00Z')],
      { directory, now, requireFresh: true }));
    assert.deepEqual(fs.readFileSync(path.join(directory, 'manifest.json')), before);
  });
  test('Distinct revised data with same timestamps creates immutable separate frames', () => {
    const input = source(); input.coordinates[65159][2] = 99.25;
    assert.equal(tool.archiveFrames([input], { directory, now }).added, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'))).frames.length, 2);
  });
  test('Retention keeps exact 30-day forecast boundary and deletes one millisecond older', () => {
    const cutoff = now - tool.RETENTION; const iso = t => new Date(t).toISOString();
    tool.archiveFrames([source(iso(cutoff - 60000), iso(cutoff - 1)), source(iso(cutoff - 60000), iso(cutoff))],
      { directory, now: now - 1 });
    const old = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'))).frames;
    const result = tool.archiveFrames([source()], { directory, now });
    assert.equal(result.removed, 1);
    const entries = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'))).frames;
    assert(entries.some(f => f.forecast === iso(cutoff)));
    const deleted = old.find(f => f.forecast === iso(cutoff - 1));
    assert(!fs.existsSync(path.join(directory, deleted.file)));
  });
  test('Entire multi-input import validates before writing valid earlier input', () => {
    const before = fs.readFileSync(path.join(directory, 'manifest.json')); const bad = source(); bad.coordinates.pop();
    assert.throws(() => tool.archiveFrames([source('2026-10-05T02:40:00Z', '2026-10-05T03:30:00Z'), bad], { directory, now }));
    assert.deepEqual(fs.readFileSync(path.join(directory, 'manifest.json')), before);
  });
  test('Overlapping, out of range and zero-containing archived runs are rejected', () => {
    const base = tool.encodeFrame(tool.parseNOAA(source()));
    for (const runs of [[[0, [1]], [0, [2]]], [[65160, [1]]], [[0, [0]]], [[0, []]], [[0, [NaN]]]]) {
      assert.throws(() => tool.decodeFrame({ ...base, runs }));
    }
  });
  test('An oversized existing manifest fails its 2000-frame limit before referenced-file I/O or mutation', () => {
    const oversizedDirectory = path.join(directory, 'oversized-count');
    fs.mkdirSync(oversizedDirectory);
    const entry = { file: '20261005T020000Z-20261005T025000Z-' + 'a'.repeat(16) + '.json.gz',
      sha256: 'a'.repeat(64), observation: '2026-10-05T02:00:00.000Z', forecast: '2026-10-05T02:50:00.000Z' };
    const bytes = Buffer.from(JSON.stringify({ version: 1, source: tool.SOURCE,
      updatedAt: '2026-10-05T03:00:00.000Z', frames: Array(2001).fill(entry) }));
    const file = path.join(oversizedDirectory, 'manifest.json');
    fs.writeFileSync(file, bytes);
    // No frame files exist. A file-I/O-first implementation would fail with ENOENT.
    assert.throws(() => tool.archiveFrames([], { directory: oversizedDirectory, now }), /2000-frame limit/);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.deepEqual(fs.readdirSync(oversizedDirectory), ['manifest.json']);
  });
  test('A valid 2000-frame consumer-compatible archive cannot publish one additional distinct source', () => {
    const fullDirectory = path.join(directory, 'full-count');
    fs.mkdirSync(fullDirectory);
    const frames = [];
    // Tiny valid RLE revisions avoid constructing 2000 complete raw NOAA grids.
    for (let i = 0; i < 2000; i++) {
      const frame = { version: 1, observation: '2026-10-05T02:00:00.000Z',
        forecast: '2026-10-05T02:50:00.000Z', runs: [[0, [(i + 1) / 20]]] };
      const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(frame) + '\n'), { level: 9, mtime: 0 });
      const sha256 = sha(bytes);
      const file = '20261005T020000Z-20261005T025000Z-' + sha256.slice(0, 16) + '.json.gz';
      fs.writeFileSync(path.join(fullDirectory, file), bytes);
      frames.push({ file, sha256, observation: frame.observation, forecast: frame.forecast });
    }
    const manifest = { version: 1, source: tool.SOURCE, updatedAt: '2026-10-05T03:00:00.000Z', frames };
    const manifestPath = path.join(fullDirectory, 'manifest.json');
    const before = Buffer.from(JSON.stringify(manifest));
    fs.writeFileSync(manifestPath, before);
    assert.equal(consumer.parseAuroraManifest(manifest).length, 2000);
    assert.throws(() => tool.archiveFrames([source()], { directory: fullDirectory, now }), /2000-frame limit/);
    assert.deepEqual(fs.readFileSync(manifestPath), before);
    assert.equal(fs.readdirSync(fullDirectory).length, 2001);
  });
  test('A damaged existing frame fails checksum without overwriting the index', () => {
    const before = fs.readFileSync(path.join(directory, 'manifest.json')); const entry = JSON.parse(before).frames[0];
    fs.appendFileSync(path.join(directory, entry.file), ' ');
    assert.throws(() => tool.archiveFrames([source()], { directory, now }), /checksum/);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'manifest.json')), before);
  });
  for (const name of checks) console.log('PASS ' + name);
  console.log('Globe archive: ' + checks.length + ' checks passed.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
