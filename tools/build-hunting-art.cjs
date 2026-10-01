// Normalize the generated source art to the game's pixel grid.
// NODE_PATH=/path/to/node_modules node tools/build-hunting-art.cjs
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../assets/hunting');
async function sprite(name, width, height, version = 2) {
  const source = path.join(root, 'source-v' + version, name + '.png');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] >= 128) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (left > right || top > bottom) throw new Error(name + ' has no opaque pixels.');
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const scaled = await sharp(source).extract(crop).resize(width, height, { kernel: 'nearest', fit: width && height ? 'fill' : 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // A visible pixel and a hittable pixel use the same binary opacity edge.
  for (let i = 3; i < scaled.data.length; i += 4) scaled.data[i] = scaled.data[i] >= 128 ? 255 : 0;
  const output = path.join(root, name + '-v' + version + '.png');
  await sharp(scaled.data, { raw: scaled.info }).png({ palette: true, colours: 48, dither: 0 }).toFile(output);
  console.log(name + ': ' + scaled.info.width + ' by ' + scaled.info.height);
}
(async () => {
  await sharp(path.join(root, 'source-v2/clearing.png')).resize(640, 360, { kernel: 'nearest', fit: 'fill' }).png({ palette: true, colours: 128, dither: 0 }).toFile(path.join(root, 'clearing-v2.png'));
  console.log('clearing: 640 by 360');
  await sprite('deer', 64, 48);
  await sprite('hunter', null, 64);
  for (const name of ['marsh', 'trail']) {
    await sharp(path.join(root, 'source-v3', name + '.png')).resize(640, 360, { kernel: 'nearest', fit: 'fill' }).png({ palette: true, colours: 128, dither: 0 }).toFile(path.join(root, name + '-v3.png'));
    console.log(name + ': 640 by 360');
  }
  await sprite('boar', 64, 42, 3);
  await sprite('dog', 40, null, 3);
})().catch(error => { console.error(error); process.exitCode = 1; });
