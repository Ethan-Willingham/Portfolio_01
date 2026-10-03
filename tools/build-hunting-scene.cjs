// Painterly full-frame layers keep source detail and soft alpha, unlike the animal pixel-art builder.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const masters = path.join(root, 'assets/hunting/source-v8');
const layers = [
  { name: 'terrain', output: 'birch-terrain-v8.webp', transparent: true },
  { name: 'sky', output: 'birch-sky-v8.webp', transparent: false },
  { name: 'stand', output: 'lookout-stand-v8.webp', transparent: true }
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function inspect(file, layer) {
  const im = sharp(file), meta = await im.metadata();
  assert.ok(meta.width >= 1600 && meta.height >= 900, layer.name + ': retain native painting detail');
  assert.ok(Math.abs(meta.width / meta.height - 16 / 9) < .003, layer.name + ': full-frame 16:9 registration');
  const { data, info } = await im.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  function coverage(x0, y0, x1, y1) {
    let opaque = 0, count = 0;
    for (let y = Math.floor(info.height * y0); y < info.height * y1; y += 3)
      for (let x = Math.floor(info.width * x0); x < info.width * x1; x += 3) {
        opaque += data[(y * info.width + x) * 4 + 3] > 128; count++;
      }
    return opaque / count;
  }
  if (layer.transparent) assert.ok(meta.hasAlpha, layer.name + ': genuine alpha required');
  if (layer.name === 'terrain') {
    assert.ok(coverage(.4, .2, .6, .35) < .01, 'terrain: leave clear sky for the live sun');
    assert.ok(coverage(.3, .5, .7, .95) > .99, 'terrain: continuous opaque animal ground');
  } else if (layer.name === 'stand') {
    assert.ok(coverage(.1, .05, .9, .79) < .01, 'stand: keep the viewing corridor clear above the low rail');
    assert.ok(coverage(.1, .92, .9, .99) > .99, 'stand: continuous close timber foreground');
  } else assert.ok(coverage(0, 0, 1, 1) > .999, 'sky: opaque paint across the canvas');
  return meta;
}
(async () => {
  const exports = [];
  for (const layer of layers) {
    const source = path.join(masters, layer.name + '.png');
    const meta = await inspect(source, layer);
    // A fractional aspect discrepancy in the generator output is normalized by less than one pixel.
    // Never crop the frame, upscale, quantize the palette or threshold the painting's alpha.
    const width = Math.floor(Math.min(2048, meta.width) / 16) * 16, height = width * 9 / 16;
    const destination = path.join(root, 'assets/hunting', layer.output);
    if (!process.argv.includes('--check')) await sharp(source).resize(width, height, { kernel: 'lanczos3' })
      .webp({ quality: 95, alphaQuality: 100, effort: 6 }).toFile(destination);
    const runtime = await inspect(destination, layer);
    assert.equal(runtime.width, width); assert.equal(runtime.height, height);
    const bytes = fs.readFileSync(destination);
    exports.push({ name: layer.name, source: 'assets/hunting/source-v8/' + layer.name + '.png',
      source_width: meta.width, source_height: meta.height, source_sha256: hash(fs.readFileSync(source)),
      runtime: 'assets/hunting/' + layer.output, width, height, bytes: bytes.length, sha256: hash(bytes) });
    console.log('PASS ' + layer.name + ': ' + width + 'x' + height + ', ' + Math.round(bytes.length / 1024) + ' KiB');
  }
  const manifest = path.join(masters, 'exports.json');
  if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(manifest, 'utf8')).layers, exports);
  else fs.writeFileSync(manifest, JSON.stringify({ version: 8, filtering: 'lanczos3 export; smooth canvas display',
    webp: { quality: 95, alphaQuality: 100, effort: 6 }, layers: exports }, null, 2) + '\n');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
