'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../js/globe-data.js');
const fixtureRoot = path.join(__dirname, 'fixtures/daylight');
const storm = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'ovation-2026-10-04-storm.json')));
const stormKp = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'kp-2026-10-04-storm.json')));
let checks = 0;

function check(name, fn) {
  return Promise.resolve().then(fn).then(() => { checks++; console.log('PASS ' + name); });
}

function pngResponse(width = 16) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, width / 2);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
}

function mockStorage(entries = []) {
  const values = new Map(entries);
  const cache = {
    async match(url) { const response = values.get(url); return response && response.clone(); },
    async put(url, response) { values.set(url, response.clone()); },
    async delete(key) { return values.delete(typeof key === 'string' ? key : key.url); },
    async keys() { return [...values.keys()].map(url => ({ url })); }
  };
  return { values, cache, async open(name) { assert.equal(name, D.PHOTO_CACHE); return cache; } };
}

(async () => {
  await check('authentic October 4 storm grid and both upstream timestamps', () => {
    const result = D.parseAurora(storm);
    assert.equal(result.grid.length, 65160);
    assert.equal(result.observation.toISOString(), '2026-10-04T23:38:00.000Z');
    assert.equal(result.forecast.toISOString(), '2026-10-05T00:27:00.000Z');
    assert.equal(Math.max(...result.grid), 41);
    assert.equal(D.auroraAt(result, -76, 0), 41);
  });
  await check('longitude wraps, latitude rows include both poles, interpolation is bilinear', () => {
    const grid = new Float32Array(65160);
    grid[90 * 360 + 359] = 10; grid[90 * 360] = 20;
    grid[91 * 360 + 359] = 30; grid[91 * 360] = 40;
    assert.equal(D.auroraAt(grid, 0.5, -0.5), 25);
    assert.equal(D.auroraAt(grid, 0.5, 359.5), 25);
    grid[180 * 360] = 88; grid[0] = 77;
    assert.equal(D.auroraAt(grid, 90, 0), 88);
    assert.equal(D.auroraAt(grid, -90, 360), 77);
    assert.throws(() => D.auroraAt(grid, 91, 0), /Invalid/);
  });
  await check('incomplete, duplicate, invalid and out-of-range grid cells are rejected', () => {
    assert.throws(() => D.parseAurora({ ...storm, coordinates: storm.coordinates.slice(1) }), /Incomplete/);
    const coordinates = storm.coordinates.slice(); coordinates[1] = coordinates[0];
    assert.throws(() => D.parseAurora({ ...storm, coordinates }), /Duplicate/);
    coordinates[1] = [0, -89, 101];
    assert.throws(() => D.parseAurora({ ...storm, coordinates }), /range/);
    coordinates[1] = [0.5, -89, 5];
    assert.throws(() => D.parseAurora({ ...storm, coordinates }), /range/);
    coordinates[1] = [0, -89, NaN];
    assert.throws(() => D.parseAurora({ ...storm, coordinates }), /Invalid/);
    assert.throws(() => D.parseAurora({ ...storm, 'Forecast Time': 'bad' }), /timestamp/);
    assert.throws(() => D.parseAurora({ ...storm, 'Forecast Time': '2026-10-04T23:00:00Z' }), /precedes/);
  });
  await check('forecast freshness rejects old and implausibly future data', () => {
    const parsed = D.parseAurora(storm);
    assert.equal(D.auroraFreshness(parsed, '2026-10-04T23:51:00Z').fresh, true);
    assert.equal(D.auroraFreshness(parsed, '2026-10-05T02:00:00Z').fresh, false);
    assert.equal(D.auroraFreshness(parsed, '2026-10-04T20:00:00Z').fresh, false);
    const futureObservation = { ...parsed, observation: new Date('2026-10-04T23:58:00Z') };
    assert.equal(D.auroraFreshness(futureObservation, '2026-10-04T23:51:00Z').fresh, false);
  });
  await check('nearby oval is a horizon distance, separate from overhead probability', () => {
    const grid = new Float32Array(65160);
    grid[150 * 360] = 30;
    const nearby = D.auroraVisibility(grid, 55, 0, -12);
    assert.equal(nearby.overheadProbability, 0);
    assert.equal(nearby.nearbyProbability, 30);
    assert.ok(nearby.nearestOvalMiles > 340 && nearby.nearestOvalMiles < 350);
    assert.match(nearby.visibility, /horizon/);
    assert.equal(D.auroraVisibility(grid, 55, 0, 5).visibility, 'Hidden by daylight');
    assert.equal(D.auroraVisibility(grid, 55, 0, -2).darkness, 'twilight');
    assert.equal(D.auroraVisibility(grid, 40, 0, -12).nearestOvalMiles, null);
    assert.ok(Math.abs(D.greatCircleMiles(0, 179, 0, -179) - 138.1868) < 0.01);
  });
  await check('Kp object storm fixture yields latest UTC interval and 5.67', () => {
    const result = D.parseKp(stormKp);
    assert.equal(result.kp, 5.67);
    assert.equal(result.time.toISOString(), '2026-10-04T18:00:00.000Z');
    assert.equal(result.stationCount, 8);
  });
  await check('Kp header tables work and invalid rows do not replace valid observations', () => {
    const result = D.parseKp([['time_tag', 'kp_index'], ['2026-10-04T18:00:00', '5.67'],
      ['2026-10-04T21:00:00', '10'], ['bad', '4'], ['2026-10-04T21:00:00', '']]);
    assert.equal(result.kp, 5.67);
    assert.throws(() => D.parseKp([{ time_tag: 'bad', Kp: 5 }]), /No valid/);
  });
  await check('completed-day selection uses UTC at year and leap-day boundaries', () => {
    assert.equal(D.previousCompletedDay('2027-01-01T01:00:00Z'), '2026-12-31');
    assert.equal(D.previousCompletedDay('2028-03-01T03:00:00Z'), '2028-02-29');
    assert.equal(D.previousCompletedDay('2026-10-04T23:59:59Z'), '2026-10-03');
    assert.throws(() => D.photoURL('2026-02-30', 16, D.PHOTO_LAYERS[0]), /Invalid/);
  });
  await check('WMS uses latitude-longitude box, explicit date, PNG and NOAA-21', () => {
    const url = new URL(D.photoURL('2026-10-03', 4096, D.PHOTO_LAYERS[0]));
    assert.equal(url.searchParams.get('BBOX'), '-90,-180,90,180');
    assert.equal(url.searchParams.get('HEIGHT'), '2048');
    assert.equal(url.searchParams.get('TIME'), '2026-10-03');
    assert.equal(url.searchParams.get('FORMAT'), 'image/png');
    assert.match(url.searchParams.get('LAYERS'), /NOAA21/);
  });
  await check('exact-black compositing preserves valid dark pixels and primary provenance', () => {
    const a = Uint8ClampedArray.from([12, 22, 32, 255, 0, 0, 0, 255, 0, 0, 0, 255, 1, 0, 0, 255]);
    const b = Uint8ClampedArray.from([99, 99, 99, 255, 42, 52, 62, 255, 0, 0, 0, 255, 88, 88, 88, 255]);
    const result = D.compositeRGBA([a, b]);
    assert.deepEqual([...result.pixels], [12, 22, 32, 255, 42, 52, 62, 255, 0, 0, 0, 0, 1, 0, 0, 255]);
    assert.deepEqual([...result.mask], [255, 255, 0, 255]);
    assert.equal(result.coverage, 0.75);
    assert.throws(() => D.compositeRGBA([a, b.slice(4)]), /differ/);
  });
  await check('JSON fetch accepts JSON and rejects HTTP, malformed or HTML responses', async () => {
    assert.deepEqual(await D.fetchJSON('https://example.test', { fetch: async () =>
      new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }) }), { ok: true });
    await assert.rejects(D.fetchJSON('x', { fetch: async () => new Response('{}', { status: 503 }) }), /HTTP/);
    await assert.rejects(D.fetchJSON('x', { fetch: async () => new Response('<html>offline</html>') }), /content type/);
    await assert.rejects(D.fetchJSON('x', { fetch: async () =>
      new Response('bad', { headers: { 'Content-Type': 'application/json' } }) }), /JSON/);
  });
  await check('timeouts and external abort settle even if a mock ignores the signal', async () => {
    const pending = async () => new Promise(() => {});
    await assert.rejects(D.fetchJSON('x', { fetch: pending, timeout: 8 }), { name: 'TimeoutError' });
    const controller = new AbortController();
    const promise = D.fetchJSON('x', { fetch: pending, timeout: 1000, signal: controller.signal });
    controller.abort();
    await assert.rejects(promise, { name: 'AbortError' });
  });
  await check('PNG MIME, signature and dimensions are checked before use', async () => {
    const options = { fetch: async () => pngResponse(), cacheStorage: null };
    assert.equal((await D.fetchPhotoDay('2026-10-03', 16, options)).blobs.length, 2);
    await assert.rejects(D.fetchPhotoDay('2026-10-03', 16, { ...options, fetch: async () =>
      new Response('<html>bad</html>', { headers: { 'Content-Type': 'image/png' } }) }), /PNG/);
    await assert.rejects(D.fetchPhotoDay('2026-10-03', 16, { ...options, fetch: async () => pngResponse(32) }), /dimensions/);
    await assert.rejects(D.fetchPhotoDay('2026-10-03', 16, { ...options, fetch: async () =>
      new Response('{}', { headers: { 'Content-Type': 'application/json' } }) }), /content type/);
  });
  await check('a primary instrument failure still gives the same-day companion', async () => {
    const result = await D.fetchPhotoDay('2026-10-03', 16, { cacheStorage: null, fetch: async url => {
      if (url.includes('NOAA21')) throw new Error('Offline');
      return pngResponse();
    } });
    assert.equal(result.date, '2026-10-03'); assert.equal(result.blobs.length, 1);
    assert.match(result.layers[0], /NOAA20/);
  });
  await check('latestPhoto walks back on network failure and decoded blank-image rejection', async () => {
    const result = await D.latestPhoto({ now: '2026-10-04T20:00:00Z', width: 16,
      cacheStorage: null, fetch: async url => {
        if (new URL(url).searchParams.get('TIME') === '2026-10-03') throw new Error('Missing day');
        return pngResponse();
      }, validate: async photo => photo.date !== '2026-10-02' });
    assert.equal(result.date, '2026-10-01');
  });
  await check('latestPhoto never requests the future and bounds fallback to three earlier days', async () => {
    const dates = [];
    await assert.rejects(D.latestPhoto({ date: '2027-12-31', now: '2026-10-04T20:00:00Z',
      width: 16, cacheStorage: null, fetch: async url => {
        dates.push(new URL(url).searchParams.get('TIME')); throw new Error('Offline');
      } }), /Offline/);
    assert.deepEqual([...new Set(dates)], ['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30']);
  });
  await check('completed-day reload uses the cache and current-day requests bypass it', async () => {
    const storage = mockStorage(); let fetches = 0;
    const options = { now: '2026-10-04T20:00:00Z', cacheStorage: storage, fetch: async () => {
      fetches++; return pngResponse();
    } };
    await D.fetchPhotoDay('2026-10-03', 16, options);
    await D.fetchPhotoDay('2026-10-03', 16, options);
    assert.equal(fetches, 2); assert.equal(storage.values.size, 2);
    await D.fetchPhotoDay('2026-10-04', 16, options);
    await D.fetchPhotoDay('2026-10-04', 16, options);
    assert.equal(fetches, 6); assert.equal(storage.values.size, 2);
  });
  await check('cache entry count stays bounded and quota/open failures are silent', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => [D.photoURL('2026-09-' +
      String(i + 1).padStart(2, '0'), 16, D.PHOTO_LAYERS[0]), pngResponse()]);
    const storage = mockStorage(entries);
    await D.fetchPhotoDay('2026-10-03', 16, { now: '2026-10-04', cacheStorage: storage,
      fetch: async () => pngResponse() });
    assert.equal(storage.values.size, 16);
    assert.ok([...storage.values.keys()].every(url => new URL(url).searchParams.get('TIME') >= '2026-09-07'));
    const unavailable = { async open() { throw new Error('Storage blocked'); } };
    assert.equal((await D.fetchPhotoDay('2026-10-03', 16, { cacheStorage: unavailable,
      fetch: async () => pngResponse() })).blobs.length, 2);
    const quota = mockStorage(); quota.cache.put = async () => { throw new Error('Quota exceeded'); };
    assert.equal((await D.fetchPhotoDay('2026-10-03', 16, { cacheStorage: quota,
      fetch: async () => pngResponse() })).blobs.length, 2);
  });
  await check('corrupted cached responses are deleted and refetched', async () => {
    const url = D.photoURL('2026-10-03', 16, D.PHOTO_LAYERS[0]);
    const storage = mockStorage([[url, new Response('bad', { headers: { 'Content-Type': 'image/png' } })]]);
    let fetches = 0;
    await D.fetchPhotoDay('2026-10-03', 16, { cacheStorage: storage, fetch: async () => { fetches++; return pngResponse(); } });
    assert.equal(fetches, 2); assert.equal(storage.values.size, 2);
  });
  await check('decoded empty imagery is evicted so newly arriving data can be discovered', async () => {
    const storage = mockStorage(); let fetches = 0;
    const options = { now: '2026-10-04T20:00:00Z', width: 16, cacheStorage: storage,
      fetch: async () => { fetches++; return pngResponse(); } };
    const result = await D.latestPhoto({ ...options, validate: async photo => photo.date !== '2026-10-03' });
    assert.equal(result.date, '2026-10-02');
    assert.equal(storage.values.size, 2);
    const recovered = await D.latestPhoto({ ...options, validate: async () => true });
    assert.equal(recovered.date, '2026-10-03'); assert.equal(fetches, 6);
  });
  await check('offline mode reads cached imagery without making any network request', async () => {
    const storage = mockStorage(); let fetches = 0;
    const options = { now: '2026-10-04T20:00:00Z', width: 16, cacheStorage: storage,
      fetch: async () => { fetches++; return pngResponse(); } };
    await D.fetchPhotoDay('2026-10-03', 16, options);
    const cached = await D.cachedPhotoDay('2026-10-03', 16, options);
    assert.equal(cached.blobs.length, 2); assert.equal(fetches, 2);
    await assert.rejects(D.cachedPhotoDay('2026-10-02', 16, options), { name: 'CacheMissError' });
    assert.equal(fetches, 2);
    await D.discardPhotoDay('2026-10-03', 16, options);
    await assert.rejects(D.cachedPhotoDay('2026-10-03', 16, options), { name: 'CacheMissError' });
    assert.equal(storage.values.size, 0); assert.equal(fetches, 2);
  });
  console.log('Globe data: ' + checks + ' checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
