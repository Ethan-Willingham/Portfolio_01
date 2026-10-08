// Portable implementation of build-sluice.sh, also runnable directly on Windows.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'js/sluice');
const fragments = fs.readdirSync(source).filter(name => /^[0-9]{3}-.*\.js$/.test(name)).sort();
if (!fragments.length) throw new Error('build-sluice: no fragments found in js/sluice/');
const bundle = Buffer.concat(fragments.map(name => fs.readFileSync(path.join(source, name))));
const version = fs.readFileSync(path.join(source, '000-head.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/);
if (!version) throw new Error('build-sluice: GAME_VERSION missing');
const pagePath = path.join(root, 'grand-motherload.html');
const page = fs.readFileSync(pagePath, 'utf8')
  .replace(/src="js\/(sluice|sluice-performance-gpu|liquid-wgpu|smoke-wgpu|fire-wgpu|jello-wgpu|audio|smoke-presets)\.js(?:\?v=[^"]*)?"/g,
    (_, name) => `src="js/${name}.js?v=${version[1]}"`)
  .replace(/href="sluice-menu\.css(?:\?v=[^"]*)?"/g, `href="sluice-menu.css?v=${version[1]}"`);
fs.writeFileSync(path.join(root, 'js/sluice.js'), bundle);
fs.writeFileSync(pagePath, page);
console.log(`build-sluice: wrote js/sluice.js from ${fragments.length} fragments (${bundle.length} bytes)`);
console.log(`build-sluice: stamped grand-motherload.html game assets with ?v=${version[1]}`);
