'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const versionIndex = process.argv.indexOf('--version');
const root = path.resolve(__dirname, '..'), version = versionIndex < 0 ? 13 : Number(process.argv[versionIndex + 1]);
assert.ok([9, 13].includes(version), 'Supported detail version');
const sources = 'assets/hunting/source-v' + version;
const layout = JSON.parse(fs.readFileSync(path.join(root, sources, 'layout.json')));
const checkOnly = process.argv.includes('--check');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
// Only registration, resampling and feathered compositing happen here. Fine painted content comes from imagegen.
function feather(width, height) {
  const alpha = Buffer.alloc(width * height * 4, 255);
  const fx = width * 32 / 450, fy = height * 18 / 253;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    alpha[(y * width + x) * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, x / fx, (width - 1 - x) / fx, y / fy, (height - 1 - y) / fy)));
  return sharp(alpha, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
(async () => {
  const repairs = [];
  for (const repair of layout.repairs || []) {
    const meta = await sharp(path.join(root, repair.master)).metadata();
    const [w, h] = repair.density_input_size;
    assert.ok(meta.width / w >= 3.5 && meta.height / h >= 3.5, repair.id + ': native repair density');
    assert.ok(meta.hasAlpha && Math.abs(meta.width / meta.height - 16 / 9) < .003, repair.id + ': registered alpha crop');
    repairs.push({ ...repair, input_sha256: hash(repair.input), source_sha256: hash(repair.master) });
  }
  const tiles = [];
  for (const t of layout.tiles) {
    const meta = await sharp(path.join(root, t.master)).metadata();
    const input = await sharp(path.join(root, t.input)).metadata();
    assert.ok(meta.width / input.width >= 3.5 && meta.height / input.height >= 3.5, t.id + ': native detail density');
    assert.ok(Math.abs(meta.width / meta.height - 16 / 9) < .003, t.id + ': preserve crop aspect');
    const width = Math.floor(meta.width / 16) * 16, height = width * 9 / 16;
    const file = t.file || 'assets/hunting/detail-v' + version + '/' + t.id + '.webp';
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    if (!checkOnly && !t.file) {
      let resized = await sharp(path.join(root, t.master)).resize(width, height).png().toBuffer();
      for (const id of t.repairs || []) {
        const repair = repairs.find(r => r.id === id);
        assert.ok(repair, t.id + ': declared repair exists');
        const [x, y, w, h] = t.rect, [rx, ry, rw, rh] = repair.rect;
        const x0 = Math.round((rx - x) / w * width), y0 = Math.round((ry - y) / h * height);
        const x1 = Math.round((rx + rw - x) / w * width), y1 = Math.round((ry + rh - y) / h * height);
        const left = Math.max(0, x0), top = Math.max(0, y0);
        const clip = { left: left - x0, top: top - y0,
          width: Math.min(width, x1) - left, height: Math.min(height, y1) - top };
        assert.ok(clip.width > 0 && clip.height > 0, t.id + ': repair intersects tile');
        const coverage = await feather(x1 - x0, y1 - y0);
        const mask = await sharp(coverage).extract(clip).png().toBuffer();
        const replacement = await sharp(path.join(root, repair.master)).resize(x1 - x0, y1 - y0)
          .composite([{ input: coverage, blend: 'dest-in' }]).png().toBuffer();
        const patch = await sharp(replacement).extract(clip).png().toBuffer();
        // Replace old paint, including newly opened sky gaps, then feather the
        // tile normally. The repair is flattened offline, adding no draw work.
        resized = await sharp(resized).composite([{ input: mask, left, top, blend: 'dest-out' },
          { input: patch, left, top }]).png().toBuffer();
      }
      await sharp(resized).composite([{ input: await feather(width, height), blend: 'dest-in' }])
        .webp({ quality: 95, alphaQuality: 100, effort: 6 }).toFile(path.join(root, file));
    }
    const output = await sharp(path.join(root, file)).metadata();
    assert.equal(output.width, width); assert.equal(output.height, height); assert.ok(output.hasAlpha);
    tiles.push({ id: t.id, row: t.row, col: t.col, rect: t.rect, file,
      width, height, bytes: fs.statSync(path.join(root, file)).size,
      input_sha256: hash(t.input), source_sha256: hash(t.master), sha256: hash(file),
      ...(t.repairs ? { repairs: t.repairs } : {}) });
    console.log('PASS ' + t.id + ': ' + width + 'x' + height + ' local painted detail');
  }
  const overview = 'assets/hunting/birch-terrain-v' + version + '.webp';
  if (!checkOnly) {
    const width = 2048, height = 1152, parts = [];
    for (const t of tiles) {
      const x0 = Math.round(t.rect[0] * width), y0 = Math.round(t.rect[1] * height);
      const x1 = Math.round((t.rect[0] + t.rect[2]) * width), y1 = Math.round((t.rect[1] + t.rect[3]) * height);
      const w = x1 - x0, h = y1 - y0;
      const left = Math.max(0, x0), top = Math.max(0, y0);
      const clipped = await sharp(path.join(root, t.file)).resize(w, h)
        .extract({ left: left - x0, top: top - y0, width: Math.min(width, x1) - left, height: Math.min(height, y1) - top }).png().toBuffer();
      parts.push({ input: clipped, left, top });
    }
    await sharp(path.join(root, layout.source)).resize(width, height).composite(parts)
      .webp({ quality: 95, alphaQuality: 100, effort: 6 }).toFile(path.join(root, overview));
  }
  const meta = await sharp(path.join(root, overview)).metadata();
  assert.equal(meta.width, 2048); assert.equal(meta.height, 1152); assert.ok(meta.hasAlpha);
  const result = { version, horizon: .444, overview, underpaint: 'assets/hunting/birch-terrain-v8.webp',
    overview_sha256: hash(overview), source: layout.source, source_sha256: hash(layout.source),
    effective_width: Math.round(Math.min(...tiles.map(t => t.width / t.rect[2]))),
    effective_height: Math.round(Math.min(...tiles.map(t => t.height / t.rect[3]))), tiles,
    ...(repairs.length ? { repairs } : {}) };
  const destination = path.join(root, 'assets/hunting/birch-detail-v' + version + '.json');
  if (checkOnly) assert.deepEqual(JSON.parse(fs.readFileSync(destination)), result);
  else fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
  console.log('PASS detailed terrain: ' + result.effective_width + 'x' + result.effective_height + ' native density, ' + tiles.length + ' tiles');
})().catch(e => { console.error(e); process.exitCode = 1; });
