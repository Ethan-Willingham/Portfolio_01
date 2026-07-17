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
const TOY_HTML = `${root}/water-smoke-slime.html`;
const SMOKE_SRC = `${root}/js/sluice/190-smoke-webgl.js`;
const JELLO_SRC = `${root}/js/sluice/340-jello.js`;
const HEAD_SRC = `${root}/js/sluice/000-head.js`;

const norm = (s) => s.replace(/\n+$/, '\n');
let failed = false;
const say = (m) => console.log(m);

// ---- expected blocks from the game sources ---------------------------
function smokeBlock() {
  const text = readFileSync(SMOKE_SRC, 'utf8');
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
  'jello-engine': readFileSync(JELLO_SRC, 'utf8'),
};

// ---- the toy's sentinel-delimited blocks -----------------------------
const toy = readFileSync(TOY, 'utf8');
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
