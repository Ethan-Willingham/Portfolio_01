'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
if (!globalThis.crypto || !globalThis.crypto.subtle) globalThis.crypto = crypto.webcrypto;
const D = require('../js/globe-data.js');
const HOUR = 3600000;
const MINUTE = 60000;
const START = '2026-10-01T00:00:00Z';
const END = '2026-10-05T00:00:00Z';
let checks = 0;
const failures = [];

async function check(name, fn) {
  try { await fn(); checks++; console.log('PASS ' + name); }
  catch (error) { failures.push({ name, error }); console.error('FAIL ' + name + ': ' + error.message); }
}

function catalog(intervals = [[START, END, 'PT3H'], [START, END, 'PT3H']], prefix = '') {
  return '<WMS_Capabilities><Capability><Layer>' + D.CLOUD_LAYERS.map((name, i) =>
    '<Layer><' + prefix + 'Name>' + name + '</' + prefix + 'Name>' +
    '<' + prefix + 'Dimension name="time" units="ISO8601">' + intervals[i].join('/') +
    '</' + prefix + 'Dimension></Layer>').join('') + '</Layer></Capability></WMS_Capabilities>';
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width = 16) {
  const height = width / 2;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const offset = row * (1 + width * 4) + 1 + col * 4;
    rows.set([21, 43, 65, col % 3 ? 127 : 0], offset);
  }
  function chunk(type, data) {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const name = Buffer.from(type); const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

function pngResponse(width = 16) {
  return new Response(png(width), { headers: { 'Content-Type': 'image/png' } });
}

function storage(entries = []) {
  const values = new Map(entries);
  const cache = {
    async match(url) { const hit = values.get(url); return hit && hit.clone(); },
    async put(url, response) { values.set(url, response.clone()); },
    async keys() { return [...values.keys()].map(url => ({ url })); },
    async delete(key) { return values.delete(typeof key === 'string' ? key : key.url); }
  };
  return { values, cache, async open(name) { assert.equal(name, D.CLOUD_CACHE); return cache; } };
}

function archived(overrides = {}) {
  return { version: 1, observation: '2026-10-05T02:00:00Z', forecast: '2026-10-05T02:50:00Z',
    runs: [[0, [0.125]], [359, [12.5, 42.75]], [65159, [100]]], ...overrides };
}

function compressed(value = archived()) {
  const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(value)), { level: 9, mtime: 0 });
  const frame = { file: '20261005T020000Z-20261005T025000Z-test.json.gz',
    observation: new Date(value.observation), forecast: new Date(value.forecast),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  return { bytes, frame };
}

function manifest(frames = [compressed().frame]) {
  return { version: 1, source: D.AURORA_URL, updatedAt: '2026-10-05T02:08:00Z', frames };
}

function fetchArchive(bytes, frame = compressed().frame, options = {}) {
  return D.fetchAuroraArchive(frame, 'https://example.test/archive/', {
    fetch: async () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }), ...options
  });
}

(async () => {
  await check('saved cloud index preserves the provider interval without extrapolating future frames', () => {
    const snapshot={version:1,source:D.CLOUD_SERVICE,layers:D.CLOUD_LAYERS,start:START,end:END,step:3*HOUR,checkedAt:END};
    const parsed=D.parseCloudSnapshot(snapshot);assert.equal(parsed.end.toISOString(),new Date(END).toISOString());
    assert.equal(D.cloudFrameAt(parsed,'2026-10-05T02:00:00Z','2026-10-05T02:00:00Z').toISOString(),new Date(END).toISOString());
  });
  await check('saved cloud index rejects unrelated products, wrong cadence and impossible published times', () => {
    const snapshot={version:1,source:D.CLOUD_SERVICE,layers:D.CLOUD_LAYERS,start:START,end:END,step:3*HOUR,checkedAt:END};
    for(const changed of[{source:'https://other.example'},{layers:['unknown',D.CLOUD_LAYERS[1]]},{version:2},{step:HOUR},{start:END,end:START},{end:'2026-10-05T01:00:00Z'},{checkedAt:'2026-10-04T20:00:00Z'},{checkedAt:'2026-02-30T00:00:00Z'}])assert.throws(()=>D.parseCloudSnapshot({...snapshot,...changed}));
  });
  await check('cloud catalog selects only the two observed EUMETSAT layers and their common UTC span', () => {
    const xml = '<Layer><Name>unrelated</Name><Dimension name="time">bad</Dimension></Layer>' + catalog([
      ['2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z', 'PT3H'],
      ['2026-10-01T03:00:00Z', '2026-10-04T21:00:00Z', 'PT3H']]);
    const parsed = D.parseCloudCatalog(xml);
    assert.equal(parsed.start.toISOString(), '2026-10-01T03:00:00.000Z');
    assert.equal(parsed.end.toISOString(), '2026-10-04T21:00:00.000Z');
    assert.equal(parsed.step, 3 * HOUR);
  });
  await check('cloud layer name and time tags accept their WMS namespace prefix', () => {
    assert.equal(D.parseCloudCatalog(catalog(undefined, 'wms:')).start.toISOString(), '2026-10-01T00:00:00.000Z');
  });
  await check('namespaced layer boundaries cannot borrow a missing time dimension from the next source', () => {
    const xml = catalog(undefined, 'wms:').replaceAll('<Layer>', '<wms:Layer>').replaceAll('</Layer>', '</wms:Layer>');
    assert.equal(D.parseCloudCatalog(xml).start.toISOString(), '2026-10-01T00:00:00.000Z');
    const missing = xml.replace(/<wms:Dimension\b[^>]*>[^<]+<\/wms:Dimension>/, '');
    assert.throws(() => D.parseCloudCatalog(missing), /Missing cloud times/);
  });
  await check('cloud catalog rejects missing layers, missing times and unexpected cadence', () => {
    assert.throws(() => D.parseCloudCatalog(catalog().replace(D.CLOUD_LAYERS[1], 'other')), /Missing cloud layer/);
    assert.throws(() => D.parseCloudCatalog(catalog().replace('name="time"', 'name="elevation"')), /Missing cloud times/);
    assert.throws(() => D.parseCloudCatalog(catalog([[START, END, 'PT1H'], [START, END, 'PT3H']])), /cadence/);
    assert.throws(() => D.parseCloudCatalog(catalog([[START, END], [START, END, 'PT3H']])), /cadence/);
  });
  await check('cloud catalog rejects inverted, off-cadence and disjoint periods', () => {
    assert.throws(() => D.parseCloudCatalog(catalog([[END, START, 'PT3H'], [START, END, 'PT3H']])), /interval/);
    assert.throws(() => D.parseCloudCatalog(catalog([[START, '2026-10-05T01:00:00Z', 'PT3H'], [START, END, 'PT3H']])), /interval/);
    assert.throws(() => D.parseCloudCatalog(catalog([[START, '2026-10-02T00:00:00Z', 'PT3H'],
      ['2026-10-03T00:00:00Z', END, 'PT3H']])), /common time/);
  });
  await check('two three-hour layers with different phase offsets have no shared frame', () => {
    assert.throws(() => D.parseCloudCatalog(catalog([[START, END, 'PT3H'],
      ['2026-10-01T01:00:00Z', '2026-10-04T22:00:00Z', 'PT3H']])), /common|phase|cadence|interval|align/);
  });
  await check('cloud timestamps require UTC and reject impossible rolled dates', () => {
    for (const invalid of ['2026-10-01T00:00:00', '2026-10-01T00:00:00+01:00', '2026-02-30T00:00:00Z', 'bad']) {
      assert.throws(() => D.parseCloudCatalog(catalog([[invalid, END, 'PT3H'], [START, END, 'PT3H']])));
    }
  });
  await check('cloud catalog rejects oversized and non-text input', () => {
    assert.throws(() => D.parseCloudCatalog(' '.repeat(2000001)), /Invalid/);
    assert.throws(() => D.parseCloudCatalog({}), /Invalid/);
  });
  await check('catalog fetch uses WMS capabilities and propagates invalid source and HTTP failures', async () => {
    let url;
    const value = await D.fetchCloudCatalog({ fetch: async input => {
      url = new URL(input); return new Response(catalog(), { headers: { 'Content-Type': 'text/xml' } });
    } });
    assert.equal(url.origin, new URL(D.CLOUD_SERVICE).origin);
    assert.equal(url.searchParams.get('request'), 'GetCapabilities');
    assert.equal(url.searchParams.get('version'), '1.3.0');
    assert.equal(+value.end, Date.parse(END));
    await assert.rejects(D.fetchCloudCatalog({ fetch: async () => new Response('<html>offline</html>') }), /Missing/);
    await assert.rejects(D.fetchCloudCatalog({ fetch: async () => new Response('', { status: 503 }) }), /HTTP/);
  });
  await check('cloud frame floors to source three-hour nodes across UTC midnight and exact endpoints', () => {
    const c = D.parseCloudCatalog(catalog()); const now = '2026-10-05T02:00:00Z';
    for (const [target, expected] of [['2026-10-01T00:00:00Z', '2026-10-01T00:00:00.000Z'],
      ['2026-10-03T23:59:59.999Z', '2026-10-03T21:00:00.000Z'],
      ['2026-10-04T00:00:00Z', '2026-10-04T00:00:00.000Z'],
      ['2026-10-05T00:00:00Z', '2026-10-05T00:00:00.000Z']]) {
      assert.equal(D.cloudFrameAt(c, target, now).toISOString(), expected);
    }
    assert.equal(D.cloudFrameAt(c, '2026-09-30T23:59:59.999Z', now), null);
    assert.equal(D.cloudFrameAt(c, now, now).toISOString(), '2026-10-05T00:00:00.000Z');
  });
  await check('cloud frame handles an end exactly at the clock and rejects implausibly future targets or source end', () => {
    const c = D.parseCloudCatalog(catalog()); const clock = Date.parse(END);
    assert.equal(+D.cloudFrameAt(c, new Date(clock), clock), clock);
    assert.equal(+D.cloudFrameAt(c, new Date(clock + 5 * MINUTE), clock), clock);
    assert.equal(D.cloudFrameAt(c, new Date(clock + 5 * MINUTE + 1), clock), null);
    assert.equal(D.cloudFrameAt({ ...c, end: new Date(clock + 5 * MINUTE + 1) }, new Date(clock), clock), null);
  });
  await check('cloud WMS uses latitude-first EPSG:4326 axes, source layers, exact ISO clock and transparent PNG', () => {
    const instant = '2026-10-04T12:34:56.789Z';
    for (const layer of D.CLOUD_LAYERS) {
      const url = new URL(D.cloudURL(instant, 4096, layer));
      assert.equal(url.searchParams.get('bbox'), '-90,-180,90,180');
      assert.equal(url.searchParams.get('crs'), 'EPSG:4326');
      assert.equal(url.searchParams.get('time'), instant);
      assert.equal(url.searchParams.get('width'), '4096');
      assert.equal(url.searchParams.get('height'), '2048');
      assert.equal(url.searchParams.get('layers'), layer);
      assert.equal(url.searchParams.get('transparent'), 'true');
      assert.equal(url.searchParams.get('format'), 'image/png');
    }
    for (const width of [0, 1, 3, 4098, 16.5]) assert.throws(() => D.cloudURL(instant, width, D.CLOUD_LAYERS[0]), /Invalid/);
    assert.throws(() => D.cloudURL(instant, 16, 'unrelated'), /Invalid/);
  });
  await check('cloud image transport preserves the entire alpha-bearing PNG without pixel processing', async () => {
    const bytes = png(); const result = await D.fetchCloudFrame(END, 16, { cacheStorage: null,
      fetch: async () => new Response(bytes, { headers: { 'Content-Type': 'image/png; charset=binary' } }) });
    assert.deepEqual(Buffer.from(await result.natural.arrayBuffer()), bytes);
    assert.deepEqual(Buffer.from(await result.infrared.arrayBuffer()), bytes);
    assert.equal(result.time.toISOString(), '2026-10-05T00:00:00.000Z');
  });
  await check('natural-color cloud failure allows infrared, while missing infrared rejects the frame', async () => {
    const result = await D.fetchCloudFrame(END, 16, { cacheStorage: null, fetch: async url => {
      if (new URL(url).searchParams.get('layers') === D.CLOUD_LAYERS[0]) throw new Error('Natural missing');
      return pngResponse();
    } });
    assert.equal(result.natural, null); assert(result.infrared instanceof Blob);
    await assert.rejects(D.fetchCloudFrame(END, 16, { cacheStorage: null, fetch: async url => {
      if (new URL(url).searchParams.get('layers') === D.CLOUD_LAYERS[1]) throw new Error('Infrared missing');
      return pngResponse();
    } }), /Infrared missing/);
  });
  await check('cloud PNG MIME, signature and dimensions are validated before caching', async () => {
    for (const reply of [() => new Response(png(), { headers: { 'Content-Type': 'text/html' } }),
      () => new Response('bad', { headers: { 'Content-Type': 'image/png' } }), () => pngResponse(32)]) {
      const s = storage();
      await assert.rejects(D.fetchCloudFrame(END, 16, { cacheStorage: s, fetch: async () => reply() }));
      assert.equal(s.values.size, 0);
    }
  });
  await check('cloud cache reuses only the exact timestamp, dimensions and source URLs', async () => {
    const s = storage(); let fetches = 0; const options = { cacheStorage: s, fetch: async () => { fetches++; return pngResponse(); } };
    await D.fetchCloudFrame(END, 16, options); await D.fetchCloudFrame(END, 16, options);
    assert.equal(fetches, 2); assert.equal(s.values.size, 2);
    await D.fetchCloudFrame('2026-10-04T21:00:00Z', 16, options);
    assert.equal(fetches, 4); assert.equal(s.values.size, 4);
  });
  await check('cloud cache count stays bounded at 32 responses', async () => {
    const entries = Array.from({ length: 36 }, (_, i) => [D.cloudURL(new Date(Date.parse(START) + i * 3 * HOUR), 16,
      D.CLOUD_LAYERS[i % 2]), pngResponse()]);
    const s = storage(entries);
    await D.fetchCloudFrame(END, 16, { cacheStorage: s, fetch: async () => pngResponse() });
    assert(s.values.size <= 32);
    assert(!s.values.has(entries[0][0]));
  });
  await check('corrupt cloud cache entries are discarded and refetched', async () => {
    const urls = D.CLOUD_LAYERS.map(layer => D.cloudURL(END, 16, layer));
    const s = storage([[urls[0], pngResponse()], [urls[1], new Response('bad', { headers: { 'Content-Type': 'image/png' } })]]);
    let fetches = 0;
    const result = await D.fetchCloudFrame(END, 16, { cacheStorage: s, fetch: async () => { fetches++; return pngResponse(); } });
    assert(result.infrared instanceof Blob); assert.equal(fetches, 1); assert.equal(s.values.size, 2);
  });
  await check('blocked cloud cache open, read, deletion or quota do not prevent available network imagery', async () => {
    const blocked = { async open() { throw new Error('Blocked'); } };
    assert((await D.fetchCloudFrame(END, 16, { cacheStorage: blocked, fetch: async () => pngResponse() })).infrared instanceof Blob);
    const read = storage(); read.cache.match = async () => { throw new Error('Read blocked'); };
    assert((await D.fetchCloudFrame(END, 16, { cacheStorage: read, fetch: async () => pngResponse() })).infrared instanceof Blob);
    const corrupt = storage(D.CLOUD_LAYERS.map(layer => [D.cloudURL(END, 16, layer), new Response('bad')]));
    corrupt.cache.delete = async () => { throw new Error('Delete blocked'); };
    assert((await D.fetchCloudFrame(END, 16, { cacheStorage: corrupt, fetch: async () => pngResponse() })).infrared instanceof Blob);
    const quota = storage(); quota.cache.put = async () => { throw new Error('Quota'); };
    assert((await D.fetchCloudFrame(END, 16, { cacheStorage: quota, fetch: async () => pngResponse() })).infrared instanceof Blob);
  });
  await check('cloud cache-only and explicit decode-failure eviction make no hidden network request', async () => {
    const s = storage(); let fetches = 0; const options = { cacheStorage: s, fetch: async () => { fetches++; return pngResponse(); } };
    await D.fetchCloudFrame(END, 16, options);
    assert((await D.fetchCloudFrame(END, 16, { ...options, cacheOnly: true })).infrared instanceof Blob);
    assert.equal(fetches, 2);
    await D.discardCloudFrame(END, 16, options); assert.equal(s.values.size, 0);
    await assert.rejects(D.fetchCloudFrame(END, 16, { ...options, cacheOnly: true }), /Cached clouds/);
    assert.equal(fetches, 2);
  });
  await check('cloud requests settle on timeout, external abort and an already aborted cache hit', async () => {
    const pending = async () => new Promise(() => {});
    await assert.rejects(D.fetchCloudFrame(END, 16, { cacheStorage: null, fetch: pending, timeout: 8 }), { name: 'TimeoutError' });
    const controller = new AbortController();
    const request = D.fetchCloudFrame(END, 16, { cacheStorage: null, fetch: pending, signal: controller.signal });
    controller.abort(); await assert.rejects(request, { name: 'AbortError' });
    const s = storage(D.CLOUD_LAYERS.map(layer => [D.cloudURL(END, 16, layer), pngResponse()]));
    await assert.rejects(D.fetchCloudFrame(END, 16, { cacheStorage: s, signal: controller.signal, fetch: async () => {
      throw new Error('Aborted request reached network');
    } }), { name: 'AbortError' });
  });
  await check('aurora manifest sorts actual valid times and accepts fractional UTC milliseconds', () => {
    const a = compressed().frame; const b = { ...a, file: 'later.json.gz', observation: '2026-10-05T03:00:00.125Z', forecast: '2026-10-05T03:50:00.125Z' };
    const result = D.parseAuroraManifest(manifest([b, a]));
    assert.equal(result[0].file, a.file); assert.equal(result[1].forecast.toISOString(), b.forecast);
    assert.deepEqual(D.parseAuroraManifest(manifest([])), []);
  });
  await check('aurora manifest rejects path traversal, encoded paths, duplicate files, invalid hashes and excess entries', () => {
    const a = compressed().frame;
    for (const file of ['../frame.json.gz', 'folder/frame.json.gz', 'folder\\frame.json.gz', '%2e%2e%2fframe.json.gz',
      'https://other.test/frame.json.gz', 'frame.json.gz?x=1', 'frame.json']) {
      assert.throws(() => D.parseAuroraManifest(manifest([{ ...a, file }])), /entry/);
    }
    assert.throws(() => D.parseAuroraManifest(manifest([a, a])), /entry/);
    assert.throws(() => D.parseAuroraManifest(manifest([{ ...a, sha256: 'bad' }])), /entry/);
    assert.throws(() => D.parseAuroraManifest(manifest(Array(10001).fill(a))), /manifest/);
    assert.throws(() => D.parseAuroraManifest({ version: 2, frames: [] }), /manifest/);
  });
  await check('new aurora archive and manifest timestamps reject non-UTC and impossible dates', () => {
    for (const observation of ['2026-10-05T02:00:00', '2026-10-05T02:00:00+01:00', '2026-02-30T02:00:00Z', 'bad']) {
      assert.throws(() => D.parseAuroraArchive(archived({ observation })));
      assert.throws(() => D.parseAuroraManifest(manifest([{ ...compressed().frame, observation }])));
    }
  });
  await check('archive forecast must not precede observations or exceed the two-hour allowed lead', () => {
    for (const forecast of ['2026-10-05T01:59:59.999Z', '2026-10-05T04:00:00.001Z']) {
      assert.throws(() => D.parseAuroraArchive(archived({ forecast })), /forecast/);
      assert.throws(() => D.parseAuroraManifest(manifest([{ ...compressed().frame, forecast }])), /entry time/);
    }
    assert.equal(D.parseAuroraArchive(archived({ forecast: '2026-10-05T04:00:00Z' })).forecast.toISOString(), '2026-10-05T04:00:00.000Z');
  });
  await check('archive decoding preserves representable fractions and zero gaps across a row boundary and both poles', () => {
    const parsed = D.parseAuroraArchive(archived());
    assert.equal(parsed.grid.length, 65160); assert.equal(parsed.historical, true);
    assert.equal(parsed.grid[0], 0.125); assert.equal(parsed.grid[358], 0);
    assert.equal(parsed.grid[359], 12.5); assert.equal(parsed.grid[360], 42.75); assert.equal(parsed.grid[65159], 100);
    assert.equal(D.parseAuroraArchive(archived({ runs: [] })).grid.reduce((a, b) => a + b, 0), 0);
  });
  await check('archive decoding rejects run overlap, negative/noninteger starts, bounds and invalid probabilities', () => {
    for (const runs of [[[0, [1]], [0, [2]]], [[0, [1, 2]], [1, [3]]], [[-1, [1]]], [[0.5, [1]]],
      [[65159, [1, 2]]], [[65160, [1]]], [[0, []]], [[0, [0]]], [[0, [-0.1]]], [[0, [100.1]]],
      [[0, [NaN]]], [[0, [Infinity]]], [[0, ['10']]], [[0]]]) {
      assert.throws(() => D.parseAuroraArchive(archived({ runs })), /archive/);
    }
  });
  await check('historical aurora uses nearest forecast time with inclusive 90-minute distance and no arbitrary past fallback', () => {
    const frames = D.parseAuroraManifest(manifest([{ ...compressed().frame, observation: '2026-10-05T00:00:00Z', forecast: '2026-10-05T00:50:00Z' },
      { ...compressed().frame, file: 'second.json.gz' }]));
    assert.equal(D.auroraFrameAt(frames, '2026-10-05T00:50:00Z'), frames[0]);
    assert.equal(D.auroraFrameAt(frames, '2026-10-05T02:35:00Z'), frames[1]);
    const longLead = { ...frames[0], forecast: new Date('2026-10-05T02:00:00Z') };
    assert.equal(D.auroraFrameAt([longLead], '2026-10-05T00:30:00Z'), longLead);
    assert.equal(D.auroraFrameAt([longLead], '2026-10-05T00:29:59.999Z'), null);
    assert.equal(D.auroraFrameAt([frames[1]], '2026-10-05T04:20:00Z'), frames[1]);
    assert.equal(D.auroraFrameAt([frames[1]], '2026-10-05T04:20:00.001Z'), null);
    assert.equal(D.auroraFrameAt([], '2026-10-05T00:50:00Z'), null);
  });
  await check('historical selection cannot use observations from after the chosen instant', () => {
    const a = compressed().frame;
    const frames = D.parseAuroraManifest(manifest([
      { ...a, file: 'older.json.gz', observation: '2026-10-05T00:00:00Z', forecast: '2026-10-05T00:50:00Z' }, a
    ]));
    assert.equal(D.auroraFrameAt(frames, '2026-10-05T01:59:00Z'), frames[0]);
    assert.equal(D.auroraFrameAt([frames[1]], '2026-10-05T01:59:59.999Z'), null);
    assert.equal(D.auroraFrameAt(frames, '2026-10-05T02:00:00Z'), frames[1]);
  });
  await check('the earliest saved NOAA source is unavailable one millisecond before its measurements', () => {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/daylight/ovation-2026-10-04-storm.json')));
    const frames = D.parseAuroraManifest(manifest([{ ...compressed().frame, file: 'earliest-saved.json.gz',
      observation: source['Observation Time'], forecast: source['Forecast Time'] }]));
    const observed = +frames[0].observation;
    assert.equal(D.auroraFrameAt(frames, new Date(observed - 1)), null);
    assert.equal(D.auroraFrameAt(frames, new Date(observed)), frames[0]);
    assert.equal(frames[0].forecast - observed, 49 * MINUTE);
  });
  await check('verified gzip bytes decode to the exact frame and use the manifest-selected source URL', async () => {
    const { bytes, frame } = compressed(); let requested;
    const result = await fetchArchive(bytes, frame, { fetch: async url => { requested = url; return new Response(bytes); } });
    assert.equal(requested, 'https://example.test/archive/' + frame.file);
    assert.equal(result.grid[360], 42.75); assert.equal(+result.forecast, +frame.forecast);
    assert.equal(result.historical, true);
  });
  await check('archive hash rejects altered compressed bytes before accepting their grid', async () => {
    const { bytes, frame } = compressed(); const changed = Buffer.from(bytes); changed[20] ^= 1;
    await assert.rejects(fetchArchive(changed, frame), /hash mismatch/);
    await assert.rejects(fetchArchive(bytes, { ...frame, sha256: '0'.repeat(64) }), /hash mismatch/);
  });
  await check('matching hash does not bypass gzip format or CRC integrity', async () => {
    const { bytes, frame } = compressed(); const changed = Buffer.from(bytes); changed[changed.length - 8] ^= 1;
    const badCrc = { ...frame, sha256: crypto.createHash('sha256').update(changed).digest('hex') };
    await assert.rejects(fetchArchive(changed, badCrc));
    const plain = Buffer.from(JSON.stringify(archived()));
    await assert.rejects(fetchArchive(plain, { ...frame, sha256: crypto.createHash('sha256').update(plain).digest('hex') }));
  });
  await check('archive validates expanded JSON and agreement of both timestamps with the manifest', async () => {
    const { bytes, frame } = compressed();
    await assert.rejects(fetchArchive(bytes, { ...frame, forecast: new Date(+frame.forecast + 1) }), /timestamp mismatch/);
    await assert.rejects(fetchArchive(bytes, { ...frame, observation: new Date(+frame.observation + 1) }), /timestamp mismatch/);
    const bad = compressed(archived({ runs: [[65159, [1, 2]]] }));
    await assert.rejects(fetchArchive(bad.bytes, bad.frame), /archive/);
    const malformed = zlib.gzipSync(Buffer.from('not JSON'));
    await assert.rejects(fetchArchive(malformed, { ...frame, sha256: crypto.createHash('sha256').update(malformed).digest('hex') }), /JSON/);
  });
  await check('compressed and expanded archive size limits reject oversized data', async () => {
    await assert.rejects(fetchArchive(Buffer.alloc(600001)), /Oversized aurora archive/);
    const large = zlib.gzipSync(Buffer.from(' '.repeat(2500001))); const { frame } = compressed();
    await assert.rejects(fetchArchive(large, { ...frame, sha256: crypto.createHash('sha256').update(large).digest('hex') }), /Oversized expanded/);
  });
  await check('unavailable native decompression produces a clear archive failure', async () => {
    const saved = globalThis.DecompressionStream;
    try {
      globalThis.DecompressionStream = undefined;
      const { bytes, frame } = compressed();
      await assert.rejects(fetchArchive(bytes, frame), /decompression unavailable/);
    } finally { globalThis.DecompressionStream = saved; }
  });
  await check('archived forecast HTTP, timeout and abort failures settle without a replacement current forecast', async () => {
    const { frame } = compressed();
    await assert.rejects(fetchArchive(null, frame, { fetch: async () => new Response('', { status: 404 }) }), /HTTP/);
    await assert.rejects(fetchArchive(null, frame, { fetch: async () => new Promise(() => {}), timeout: 8 }), { name: 'TimeoutError' });
    const controller = new AbortController();
    const request = fetchArchive(null, frame, { fetch: async () => new Promise(() => {}), signal: controller.signal });
    controller.abort(); await assert.rejects(request, { name: 'AbortError' });
  });
  console.log('Globe weather: ' + checks + ' checks passed, ' + failures.length + ' failed.');
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
