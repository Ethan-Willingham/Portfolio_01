#!/usr/bin/env node
// Crop the sourced painting without changing its color or adding overlays.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let sharp;
try { sharp = require('sharp'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
}
const root = path.resolve(__dirname, '../..');
const source = path.join(__dirname, 'source/the-love-letter.jpg');
const output = path.join(root, 'assets/thumbs/let-me-llm-that-for-you-vermeer.jpg');
(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await sharp(source).extract({ left: 1000, top: 1400, width: 2550, height: 1700 })
    .resize(600, 400).jpeg({ quality: 92, mozjpeg: true }).toFile(output);
  execFileSync('cwebp', ['-quiet', '-q', '82', output, '-o', output.replace('.jpg', '.webp')]);
  console.log('Built the sourced 600x400 JPG/WebP thumbnail.');
})().catch(error => { console.error(error); process.exitCode = 1; });
