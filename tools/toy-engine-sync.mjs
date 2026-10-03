#!/usr/bin/env node
/* toy-engine-sync.mjs — keeps the physics toy's embedded engine copies
 * byte-identical to the game sources, so any engine change made on either
 * page ports to the other instead of silently drifting.
 *
 * The toy (water-smoke-slime.html + js/water-smoke-slime.js) uses the
 * game's three engines:
 *   - water: js/liquid-wgpu.js — the SAME FILE both pages load. Never
 *     copied, so never drifts. This script only checks that the toy
 *     page's cache-bust stamp (?v=) matches GAME_VERSION, because the
 *     game's build re-stamps its own tags and the toy tag is manual.
 *   - smoke: the SmokeFluid closure, embedded verbatim from
 *     js/sluice/190-smoke-webgl.js between ENGINE SYNC sentinels.
 *   - slime: js/sluice/340-jello.js, embedded verbatim between
 *     ENGINE SYNC sentinels (toy behavior lives in later same-named
 *     function declarations that shadow the copies, never in edits).
 *   - resident elastic material, skin contacts, finite grip and rendering:
 *     the soft-* blocks and material skin functions below, also verbatim.
 *     The host installs passive material state and no-op motor/eye hooks.
 *     The creature controller and locomotion fragments are not loaded.
 *
 * Usage:
 *   node tools/toy-engine-sync.mjs --check   # diff, exit 1 on drift (pre-commit runs this)
 *   node tools/toy-engine-sync.mjs --write   # re-splice the toy blocks FROM the game sources
 *
 * The correct direction is game -> toy: make the physics change in the
 * game fragment (bump GAME_VERSION, ./build-sluice.sh, verify the game),
 * then run --write here. If you changed the toy block first, --check's
 * diff IS the patch to apply to the game fragment; apply it there, then
 * --write to converge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const mode = process.argv.includes('--write') ? 'write'
           : process.argv.includes('--check') ? 'check' : 'check';

const root = execSync('git rev-parse --show-toplevel').toString().trim();
const TOY = `${root}/js/water-smoke-slime.js`;
const TOY_HTML = `${root}/archive/water-smoke-slime/water-smoke-slime.html`;
const SMOKE_SRC = `${root}/js/sluice/190-smoke-webgl.js`;
const JELLO_SRC = `${root}/js/sluice/340-jello.js`;
const HEAD_SRC = `${root}/js/sluice/000-head.js`;

// Git may check files out with CRLF on Windows. Compare engine content in
// repository form, including the sentinel and closure-anchor lines.
const readText = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\n+$/, '\n');
let failed = false;
const say = (m) => console.log(m);

// ---- expected blocks from the game sources ---------------------------
function smokeBlock() {
  const text = readText(SMOKE_SRC);
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === '  var SmokeFluid = (function () {');
  if (start < 0) throw new Error('smoke anchor not found in 190-smoke-webgl.js');
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '  })();') { end = i; break; }
  }
  if (end < 0) throw new Error('smoke closure end not found in 190-smoke-webgl.js');
  return lines.slice(start, end + 1).join('\n') + '\n';
}

const expected = {
  'smoke-engine': smokeBlock(),
  'jello-engine': readText(JELLO_SRC),
  'soft-contact': readText(`${root}/js/sluice/342-soft-contact.js`),
  'soft-handling': readText(`${root}/js/sluice/344-soft-handling.js`),
  'soft-terrain': readText(`${root}/js/sluice/344-soft-terrain.js`),
  'soft-material': readText(`${root}/js/sluice/344-soft-material.js`),
  'soft-pairs': readText(`${root}/js/sluice/345-soft-pairs.js`),
  'soft-intent': passiveSkinContacts(),
  'soft-presentation': passivePresentation(),
  'slime-skin': skinBlock(),
};

function passiveSkinContacts() {
  const text = readText(`${root}/js/sluice/346-soft-intent.js`);
  const start = text.indexOf('  // Resolve moving-edge contact');
  if (start < 0) throw new Error('passive skin contact anchor missing');
  return text.slice(start);
}

function passivePresentation() {
  const text = readText(`${root}/js/sluice/346-soft-presentation.js`);
  function between(startName, endName) {
    const start = text.indexOf(`  function ${startName}(`);
    const end = text.indexOf(`  function ${endName}(`, start);
    if (start < 0 || end < 0) throw new Error('passive material presentation anchor missing');
    return text.slice(start, end);
  }
  return between('softPresentationInit', 'softPresentationEyeMatrix') +
    between('softPresentationDrawInterior', 'softPresentationContact');
}

// These functions observe and draw material. Creature brains and eye animation
// stay in the game. The demo supplies inert material state and a no-op eye hook.
function skinBlock() {
  const text = readText(`${root}/js/sluice/347-surface-slimes.js`);
  const start = text.indexOf('  function surfaceSlimeSnapshot(');
  const end = text.indexOf('  // Bath departure animation', start);
  if (start < 0 || end < 0) throw new Error('resident skin anchors missing');
  return text.slice(start, end);
}

// ---- the toy's sentinel-delimited blocks -----------------------------
const toy = readText(TOY);
const parts = {};
let rebuilt = toy;
for (const name of Object.keys(expected)) {
  const begin = new RegExp(`^.*>>> ENGINE SYNC: BEGIN ${name}.*$`, 'm');
  const end = new RegExp(`^.*>>> ENGINE SYNC: END ${name}.*$`, 'm');
  const b = toy.match(begin);
  const e = toy.match(end);
  if (!b || !e) {
    say(`FAIL  ${name}: sentinel comments missing from js/water-smoke-slime.js`);
    failed = true;
    continue;
  }
  const from = toy.indexOf(b[0]) + b[0].length + 1;   // after BEGIN line
  const to = toy.indexOf(e[0]);                        // start of END line
  parts[name] = toy.slice(from, to);
  if (norm(parts[name]) !== norm(expected[name])) {
    failed = true;
    if (mode === 'check') {
      say(`FAIL  ${name}: the toy's embedded copy differs from the game source.`);
      say(`      If the GAME changed: node tools/toy-engine-sync.mjs --write`);
      say(`      If you edited the TOY block: apply this diff to the game source, then --write:`);
      const a = norm(expected[name]).split('\n');
      const bb = norm(parts[name]).split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(a.length, bb.length) && shown < 12; i++) {
        if (a[i] !== bb[i]) {
          say(`        line ${i + 1}:`);
          say(`          game: ${a[i] === undefined ? '<absent>' : a[i].slice(0, 150)}`);
          say(`          toy:  ${bb[i] === undefined ? '<absent>' : bb[i].slice(0, 150)}`);
          shown++;
        }
      }
    } else {
      const before = rebuilt.slice(0, rebuilt.indexOf(b[0]) + b[0].length + 1);
      const after = rebuilt.slice(rebuilt.indexOf(e[0]));
      rebuilt = before + norm(expected[name]) + after;
      say(`WROTE ${name}: re-spliced from the game source.`);
    }
  } else {
    say(`ok    ${name}: byte-identical to the game source.`);
  }
}

// ---- liquid-wgpu stamp parity ----------------------------------------
const gameVersion = (readFileSync(HEAD_SRC, 'utf8').match(/GAME_VERSION\s*=\s*'([^']+)'/) || [])[1];
const toyHtml = readFileSync(TOY_HTML, 'utf8');
const toyStamp = (toyHtml.match(/js\/liquid-wgpu\.js\?v=([^"']+)/) || [])[1];
if (!gameVersion) {
  say('FAIL  liquid-wgpu: GAME_VERSION not found in js/sluice/000-head.js');
  failed = true;
} else if (toyStamp !== gameVersion) {
  if (mode === 'write' && toyStamp) {
    writeFileSync(TOY_HTML, toyHtml.replace(/js\/liquid-wgpu\.js\?v=[^"']+/, `js/liquid-wgpu.js?v=${gameVersion}`));
    say(`WROTE liquid-wgpu stamp: ?v=${toyStamp} -> ?v=${gameVersion} in water-smoke-slime.html`);
  } else {
    say(`FAIL  liquid-wgpu: toy page stamp ?v=${toyStamp || '<none>'} != GAME_VERSION ${gameVersion}`);
    say('      (shared engine changed under the toy; --write updates the stamp)');
    failed = true;
  }
} else {
  say(`ok    liquid-wgpu: shared file, toy stamp matches GAME_VERSION ${gameVersion}.`);
}

if (mode === 'write') {
  if (rebuilt !== toy) {
    writeFileSync(TOY, rebuilt);
    say('Re-spliced js/water-smoke-slime.js. Now: node --check js/water-smoke-slime.js and boot the toy.');
  } else {
    say('Nothing to write for the embedded blocks.');
  }
  process.exit(0);
}
process.exit(failed ? 1 : 0);
