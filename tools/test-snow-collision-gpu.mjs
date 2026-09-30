#!/usr/bin/env node
// Focused GPU regression for the snow-only guest skin dead-band correction.
// BEFORE=/path/to/old-liquid-wgpu.js DUMP=/tmp/snow-collision \
//   node tools/test-snow-collision-gpu.mjs
// BEFORE defaults to pinned git cf8865e; AFTER defaults to js/liquid-wgpu.js.
// COOPERATIVE=1 compares a parallel fallback against pinned cf8865e plus snow slop.
// LOCAL_SLOP=1 also permits legal sole-guest overlap and enables cooperative checks.
// COMPACT=1 compares compact fallback with pinned v28.126 (c92d501), exact output words.
// DRY_RUN=1 validates sources/fixtures only.
// Uses production buffer, terrain, uniform, pipeline and dispatch functions.
// It does not run the rest of the game or claim full-frame performance results.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { runGrainDifferential } from './snow-grain-gpu-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8295), debugPort = port + 1000;
const out = process.env.DUMP || '/tmp/sluice-snow-collision-gpu';
const timeoutMs = Number(process.env.TIMEOUT_MS || 180000);
const compactMode = process.env.COMPACT === '1';
const benchmark = process.env.BENCH === '1';
const exitProbe = process.env.EXIT_PROBE === '1';
const beforeRef = compactMode ? 'c92d501' : 'cf8865e';
const grainMode=process.env.GRAINS==='1';
const localSlopMode = compactMode || process.env.LOCAL_SLOP === '1';
const cooperativeMode = process.env.COOPERATIVE === '1' || localSlopMode;
const paths = {
  before: process.env.BEFORE || null,
  after: process.env.AFTER || path.join(root, 'js/liquid-wgpu.js')
};
const sources = {}, metadata = {};
for (const [name, filename] of Object.entries(paths)) {
  let source = filename ? fs.readFileSync(filename, 'utf8') :
    execFileSync('git', ['show', beforeRef + ':js/liquid-wgpu.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const baseSHA256 = createHash('sha256').update(source).digest('hex');
  const transformation = !filename && cooperativeMode && !compactMode ? (localSlopMode ?
    'snow response and sole-guest legal overlap thresholds use radius * .1' : 'snow-only guest deadband1.5 to radius*.1') : null;
  if (transformation) {
    const needle = "WGSL_COLLIDE.indexOf('  // World-bounds clamp')) + /* wgsl */ `\n  p=vec2f";
    assert.equal(source.split(needle).length, 2, 'pinned snow union insertion anchor');
    source = source.replace(needle, "WGSL_COLLIDE.indexOf('  // World-bounds clamp'))\n  .replace('if (gdep > 1.5) {', 'if (gdep > r * 0.1) {') + /* wgsl */ `\n  p=vec2f");
    if (localSlopMode) {
      const responseNeedle = ".replace('if (gdep > 1.5) {', 'if (gdep > r * 0.1) {') + /* wgsl */ `\n  p=vec2f";
      assert.equal(source.split(responseNeedle).length, 2, 'pinned snow local-slop insertion anchor');
      const gate = "  // Snow may retain legal shallow overlap only on a union exterior face.\n  // A grain can belong to one ring while that ring's nearest face is hidden\n  // inside a neighboring ring, so count alone cannot certify the surface.\n  WGSL_SNOW_COLLIDE = WGSL_SNOW_COLLIDE\n    .replaceAll('  var gD2 : f32 = 1e9;', '  var gD2 : f32 = 1e9;\\n  var gOwner : i32 = -1;')\n    .replaceAll('      gD2 = ringD2;', '      gD2 = ringD2;\\n      gOwner = gi;')\n    .replaceAll('  if (guestInsideCount > 0) {', `\n  var guestLegalSlop = guestInsideCount == 1 && sqrt(gD2) <= r * 0.1;\n  if (guestLegalSlop) {\n    for (var other : i32 = 0; other < ${GS_MAX_GUESTS}; other = other + 1) {\n      if (other != gOwner && guestContainsPoint(other, gPX, gPY)) {\n        guestLegalSlop = false;\n        break;\n      }\n    }\n  }\n  if (guestInsideCount > 0 && !guestLegalSlop) {`);\n\n";
      const insertion = '  /* ---- WGSL \u2014 min-separation';
      assert.equal(source.split(insertion).length, 2, 'snow gate insertion anchor');
      source = source.replace(insertion, gate + insertion);
    }
  }
  const marker = '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  assert.equal(source.split(marker).length, 2, `${name}: unique private export anchor`);
  sources[name] = source.replace(marker, `${marker}\n  window.__snowCollisionAPIs.${name} = {
    buildBuffers: buildBuffers, buildCollidePipelines: buildCollidePipelines,
    uploadTerrainMask: uploadTerrainMask, writeGameParams: writeGameParams,
    writeSimParams: writeSimParams, runCollide: runCollide,
    grainShader: WGSL_SNOW_GRAINS, readbackBuffer: readbackBuffer,
    exitShader: WGSL_GAME_PARAMS+WGSL_COLLIDE_PRELUDE+WGSL_GUEST_GEOMETRY+WGSL_SIM_PARAMS+simBind(6)+WGSL_SNOW_COLLIDE
  };`);
  new vm.Script(sources[name], { filename: filename || beforeRef + ':js/liquid-wgpu.js' });
  metadata[name] = { path: filename ? path.resolve(filename) : null, ref: filename ? null : beforeRef,
    commit: filename ? null : execFileSync('git', ['rev-parse', beforeRef + '^{commit}'], { cwd: root, encoding: 'utf8' }).trim(),
    baseSHA256, transformation, sha256: createHash('sha256').update(source).digest('hex') };
}

function makeFixtures() {
  const snowFlag = 65 | 16 | (37 << 8) | (91 << 24) | 8;
  const grain = (x, y, options = {}) => ({
    pos: [x, y, options.vx ?? 0, options.vy ?? 0],
    aux: [3.2, 0, options.px ?? x, options.py ?? y],
    flag: (options.flag ?? snowFlag) >>> 0, unchanged: !!options.unchanged
  });
  const box = (left, top, right, bottom) => ({
    x: (left + right) / 2, y: (top + bottom) / 2,
    hw: (right - left) / 2, hh: (bottom - top) / 2, mvx: 0, mvy: 0,
    pts: [left, top, 0, 0, right, top, 0, 0, right, bottom, 0, 0, left, bottom, 0, 0]
  });
  const controls = () => [
    grain(40, 40, { flag: snowFlag | 32, unchanged: true }),
    grain(-20, 40, { unchanged: true }),
    grain(42, 40, { flag: 0, unchanged: true })
  ];
  const scenes = [];
  const add = (name, particles, opts = {}) => scenes.push({
    name, activeCount: particles.length, particles: particles.concat(controls()),
    guests: [], terrain: 'empty', region: [0, -128, 256, 256],
    modes: ['standalone'], snowOnly: true, ...opts
  });
  add('shallow-snow', [
    grain(119.7, 88),
    grain(119.7, 94, { vy: 17 }),
    grain(119.7, 100, { vx: 8, vy: 17 }),
    grain(119.7, 106, { vx: -12, vy: 17 }),
    grain(119.98, 112),
    grain(119.92, 116)
  ], { guests: [box(80, 80, 120, 120)], modes: ['standalone', 'shared-encoder'],
    expectExit: [0, 1, 2, 3, 5], expectTolerance: [4], expectRepair: true,
    expectSecondNoop: true, expectedVelocity: [[0, 0], [0, 17], [8, 17], [0, 17], [0, 0], [0, 0]] });
  // The closest downward/rightward exit is blocked. The unchanged union
  // search must find a terrain-clear alternative, never tunnel through it.
  add('floor-pinch', [grain(110, 127.1)], {
    terrain: 'floor', guests: [box(80, 100, 120, 127.4)], expectExit: [0], safeFloor: true
  });
  add('wall-pinch', [grain(127.1, 110)], {
    terrain: 'wall', guests: [box(100, 80, 127.4, 120)], expectExit: [0], safeWall: true
  });
  for (const dir of [-1, 1]) add('miner-' + (dir < 0 ? 'left' : 'right'), [
    grain(99, 94), grain(99, 101, { vx: -10, vy: 25 })
  ], { player: { active: true, x: 88, y: 78, dir, vx: 0, vy: 0 }, safeMiner: true, expectSame: true });
  const overlaps = [box(80, 80, 110, 120), box(100, 80.2, 130, 120)];
  add('overlap-guests', [grain(105, 80.3), grain(109.7, 100)], {
    guests: overlaps, expectExit: [0, 1], expectSecondNoop: true
  });
  add('overlap-guests-reversed', [grain(105, 80.3), grain(109.7, 100)], {
    guests: overlaps.slice().reverse(), expectExit: [0, 1], expectSecondNoop: true
  });
  add('bowl-and-guest', [grain(100, 112.3), grain(100, 132, { vy: 25 })], {
    bowls: [60, 140, 100, 32], guests: [box(85, 112, 115, 124)],
    expectExit: [0, 1], safeBowl: true
  });
  // Exact terrain broadphase cases use real post-contact pos/aux seeds.
  // The rounding pair's original endpoint differs by one f32 ULP from pos.x.
  add('terrain-clear-air-tile', [grain(49.3, 49.2, { px: 48.1, py: 48.7, vx: 7, vy: 13 })], { exactWords: true });
  add('terrain-clear-single-sample', [grain(48.2, 49.2, { px: 48.1, py: 49.1, vx: 7, vy: 13 })], { exactWords: true });
  add('terrain-clear-air-boundary', [grain(65.2, 65.1, { px: 62.7, py: 62.8, vx: 7, vy: 13 })], { exactWords: true });
  // First-sample division also differs from delta * rounded reciprocal.
  add('terrain-clear-rounded-first', [grain(60.751808166503906, 40, { px: 30.14286994934082, vx: 7 })], { exactWords: true });
  add('terrain-clear-rounded-last', [
    grain(63.30122756958008, 40, { px: 44.42342758178711, vx: 7 }),
    grain(63.30122756958008, 44, { px: 82.21781921386719, vx: -7 }),
    grain(40, 63.30122756958008, { py: 44.42342758178711, vy: 13 })
  ], { exactWords: true });
  add('terrain-clear-rounded-solid-endpoint', [grain(63.30122756958008, 40, { px: 44.42342758178711, vx: 7 })], {
    terrain: 'column-two', exactWords: true
  });
  add('terrain-clear-nearby-solid', [grain(63.4, 63.4, { px: 63.1, vx: 7 })], {
    terrain: 'corner-two', exactWords: true
  });
  add('terrain-clear-blocked-sweep', [grain(68, 40, { px: 60, vx: 7 })], {
    terrain: 'column-two', exactWords: true
  });
  add('terrain-clear-long-path', [grain(150, 40, { px: 20, vx: 7 })], { exactWords: true });
  // Dispatch the real ordinary-liquid pipeline, not just its snow skip.
  // Both shallow water and deeper projected water must remain bit-identical.
  add('water-unchanged', [grain(119.7, 94, { flag: 0 }), grain(117, 106, { flag: 0, vx: -12, vy: 17 })], {
    guests: [box(80, 80, 120, 120)], snowOnly: false, expectSame: true, waterMustMove: true
  });
  return scenes;
}

function makeCooperativeFixtures(physical, legalSlop = false) {
  const keep = new Set(['shallow-snow', 'floor-pinch', 'wall-pinch', 'bowl-and-guest', 'water-unchanged']);
  const scenes = physical.filter(f => keep.has(f.name) || f.name.startsWith('terrain-clear-'));
  for (const fixture of scenes) if (['floor-pinch', 'wall-pinch'].includes(fixture.name)) fixture.requireFallback = true;
  const flag = 65 | 16 | (29 << 8) | (71 << 24);
  const grain = (x, y, vx = 0, vy = 0) => ({ pos: [x, y, vx, vy], aux: [3.2, 0, x, y], flag });
  const polygon = (xy, velocity = () => [0, 0]) => {
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]), pts = [];
    for (let i = 0; i < xy.length; i++) pts.push(...xy[i], ...velocity(xy[i], i));
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2,
      hw: (Math.max(...xs) - Math.min(...xs)) / 2, hh: (Math.max(...ys) - Math.min(...ys)) / 2, pts };
  };
  const box = (l, t, r, b) => polygon([[l, t], [r, t], [r, b], [l, b]]);
  const add = (name, particles, options = {}) => scenes.push({ name, particles: particles.concat([
    { ...grain(40, 40), flag: flag | 32, unchanged: true },
    { ...grain(-20, 40), unchanged: true },
    { ...grain(42, 40), flag: 0, unchanged: true }
  ]), activeCount: particles.length, guests: [], terrain: 'empty', region: [0, -128, 256, 256],
    modes: ['standalone'], snowOnly: true, ...options });
  add('multiple-fallback-grains', Array.from({ length: 259 }, (_, i) => grain(100 + i % 12, 127.1, i % 13 - 6, 20)), {
    guests: [box(80, 100, 120, 127.4)], terrain: 'floor', requireFallback: true,
    minimumFallback: 259, modes: ['standalone', 'shared-encoder']
  });
  add('empty-after-fallback', [grain(220, 40)], { requireNoFallback: true });
  const circle = polygon(Array.from({length:20}, (_, i) => {
    const a = i * Math.PI * 2 / 20;
    return [100 + 32 * Math.cos(a), 107 + 21 * Math.sin(a)];
  }));
  for (const count of [1, 2, 24]) add('circle-floor-pinch-' + count,
    Array.from({length:count}, (_, i) => grain(98 + i % 5, 127.1)),
    {guests:[circle], terrain:'floor', requireFallback:true});
  for (const dir of [-1, 1]) {
    const right = dir < 0 ? 89 : 90;
    add('rig-pinch-' + (dir < 0 ? 'left' : 'right'), [grain(right - .3, 90)], {
      guests: [box(right - 10, 70, right, 110)], player: { active: true, x: 88, y: 78, dir, vx: 0, vy: 0 }, requireFallback: true
    });
  }
  const concave = [
    polygon([[80, 80], [120, 80], [120, 92], [96, 92], [96, 120], [80, 120]]),
    polygon([[90, 84], [130, 84], [130, 120], [114, 120], [114, 100], [90, 100]])
  ];
  const concaveGrains = [[94, 91], [94, 94], [83, 110], [110, 85], [95.95, 91.95]].map(p => grain(...p));
  add('concave-overlap', concaveGrains, { guests: concave, requireFallback: true });
  add('concave-overlap-reversed', concaveGrains, { guests: concave.slice().reverse(), requireFallback: true });
  add('no-clear-exit', [grain(112, 112, 30, -17)], {
    guests: [box(92, 92, 132, 132)], terrain: 'cavity', requireFallback: true, expectNoPositionMove: true
  });
  add('zero-depth-boundary', [grain(80, 100)], { guests: [box(80, 80, 120, 120)], requireFallback: true });
  add('terrain-blocked-slop', [grain(97, 127.3)], {
    guests: [box(80, 100, 160, 127.35)], terrain: 'floor-step', requireFallback: true
  });
  // All closest edge points are blocked. Only the top-edge midpoint has a
  // diagonal route that passes the roof corner before rising through it.
  add('midpoint-only-exit', [grain(97, 127.3)], {
    guests: [box(64, 64, 288, 128)], terrain: 'midpoint-pocket', requireFallback: true,
    expectPosition: [176.3902, 63.6873]
  });
  // Squared distances differ by less than1e-4. Ordered fuzzy comparison
  // selects the lower-x bottom exit, although the right exit is nearer.
  add('ordered-distance-tie', [grain(2, 1.999999)], {
    guests: [box(0, 0, 4, 4)], terrain: 'corner-roof', requireFallback: true,
    expectPosition: [2, 4.5]
  });
  const moving = polygon([[80, 80], [120, 80], [120, 120], [80, 120]], p => [8 + (p[1] - 80) * .6, -12]);
  add('moving-face-slots', [grain(119.1, 100, -30, 37), grain(119.3, 118, -10, 18)], {
    guests: [moving], slots: [0, 2, 4], modes: ['shared-encoder']
  });
  if (legalSlop) {
    for (const fixture of scenes) if (['zero-depth-boundary', 'terrain-blocked-slop'].includes(fixture.name)) {
      fixture.requireFallback = false;
      fixture.requireNoFallback = true;
      fixture.expectLegalSlop = true;
    }
    add('multi-guest-shallow-interior', [grain(109.95, 100)], {
      guests: [box(80, 80, 110, 120), box(100, 80, 130, 120)],
      requireFallback: true, expectOutsideUnion: true, expectPositionMove: true
    });
    add('single-containing-internal-face', [grain(159.98, 120)], {
      guests: [box(80, 80, 160, 160), box(159.99, 80, 240, 160)],
      requireFallback: true, expectOutsideUnion: true, expectPositionMove: true
    });
    add('sole-deep-overlap', [grain(110, 100, -12, 17)], {
      guests: [box(80, 80, 120, 120)], requireNoFallback: true,
      expectOutsideUnion: true, expectPositionMove: true
    });
  }
  add('zero-count', [], { particles: [], activeCount: 0 });
  return scenes;
}

async function runGPU() {
  const capacity = window.__snowCooperativeMode ? 320 : 64;
  const fixtures = window.__snowMakeFixtures();
  if (!navigator.gpu) throw new Error('WebGPU unavailable');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  if (window.__snowBenchmark && !adapter.features.has('timestamp-query')) throw new Error('Timestamp query unavailable');
  const device = await adapter.requestDevice({requiredFeatures:window.__snowBenchmark?['timestamp-query']:[],requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const gpuErrors = [];
  device.addEventListener('uncapturederror', event => gpuErrors.push(event.error.message));
  let destroying = false;
  device.lost.then(info => { if (!destroying) gpuErrors.push('device lost: ' + info.message); });
  const adapterInfo = adapter.info ? {
    vendor: adapter.info.vendor, architecture: adapter.info.architecture,
    device: adapter.info.device, description: adapter.info.description
  } : null;
  const all = {};
  const bytesToWords = ab => Array.from(new Uint32Array(ab));
  const sourceLabels = ['before', 'after'];
  let instance;
  function release() {
    if (!instance) return;
    for (const buffer of Object.values(instance.buf || {})) buffer.destroy();
    instance.paramsBuf?.destroy(); instance.simParamsBuf?.destroy();
    for (const buffer of instance.gameParamsBufs || []) buffer.destroy();
    instance = null;
  }
  try {
    for (const label of sourceLabels) {
      window.__snowProgress = { source: label, stage: 'pipelines' };
      const api = window.__snowCollisionAPIs[label];
      let current;
      // These are the same instance fields consumed by the production builders.
      // Direct seeds represent pos/aux/flag immediately after G2P.
      instance = {
        device, queue: device.queue, maxParticles: capacity, g2pReady: true,
        stepDt: 1 / 120, frameEncoder: null, terrainMaskWords: 0,
        liquid: {
          getGameState: () => ({ player: current.player, guests: current.guests }),
          fillTerrainSolid(col, row, w, h, target) {
            target.fill(0);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              const c = x + col, r = y + row;
              target[y * w + x] = current.terrain === 'floor' ? +(r >= 4) :
                current.terrain === 'wall' ? +(c >= 4) :
                current.terrain === 'column-two' ? +(c === 2) :
                current.terrain === 'corner-two' ? +(c === 2 && r === 2) :
                current.terrain === 'floor-step' ? +(c === 3 && r >= 4) :
                current.terrain === 'cavity' ? +(c !== 3 || r !== 3) :
                current.terrain === 'midpoint-pocket' ? +(r >= 4 || c === 1 || c === 9 || c === 3 && r === 2) :
                current.terrain === 'corner-roof' ? +(c < 0 || r < 0) : 0;
            }
          }
        }
      };
      device.pushErrorScope('validation');
      api.buildBuffers(instance);
      api.buildCollidePipelines(instance);
      const pipelineError = await device.popErrorScope();
      if (pipelineError) throw new Error(label + ' pipeline: ' + pipelineError.message);
      if (!instance.collideReady) throw new Error(label + ': collision pipeline unavailable');
      let probePipe, probeInput, probeOutput;
      const rays = [];
      if (window.__snowExitProbe) {
        // Fixed edge/corner rays plus seeded finite rays across terrain and rig.
        for (const y of [127.29,127.3001,127.3012,127.9,128,128.7,63.3,64,64.7])
          for (const x of [63.3,64,64.7,95.3,96,96.7,127.3,128,128.7])
            for (const [dx,dy] of [[0,-70],[0,70],[70,0],[-70,0],[55,-55],[-55,55],[.01,-.01]])
              rays.push(x,y,x+dx,y+dy);
        let seed=619;
        const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
        for(let i=0;i<2048;i++) {
          const x=-100+random()*500,y=-150+random()*550;
          rays.push(x,y,x+(random()-.5)*250,y+(random()-.5)*250);
        }
        const module=device.createShaderModule({code:api.exitShader+`
@group(0) @binding(13) var<storage,read> testRays:array<vec4<f32>>;
@group(0) @binding(14) var<storage,read_write> testClear:array<u32>;
@compute @workgroup_size(32)
fn probeEscape(@builtin(global_invocation_id) gid:vec3<u32>) {
  if(gid.x>=arrayLength(&testRays)){return;}
  let p=testRays[gid.x];
  testClear[gid.x]=select(0u,1u,guestExitClear(p.x,p.y,p.z,p.w,2.5/sqrt(3.2)*0.5));
}`});
        probePipe=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'probeEscape'}});
        probeInput=device.createBuffer({size:rays.length*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
        probeOutput=device.createBuffer({size:rays.length,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
        device.queue.writeBuffer(probeInput,0,new Float32Array(rays));
      }
      all[label] = [];
      // Reuse the real production buffers and pipelines across the focused cases.
      for (const fixture of fixtures) for (const mode of fixture.modes) {
        for (const selectedSlot of fixture.slots || [0]) {
          current = fixture;
          const name = `${fixture.name}/${mode}/slot${selectedSlot}`;
          window.__snowProgress = { source: label, stage: name };
          const pos = new Float32Array(capacity * 4), aux = new Float32Array(capacity * 4), flag = new Uint32Array(capacity);
          for (let i = 0; i < capacity; i++) {
            // A writable snow tail catches dispatches that ignore gp.count.
            pos.set([96, 98, 17, 29], i * 4); aux.set([4.125, 0.375, 96, 98], i * 4); flag[i] = 65 | 16 | (29 << 8);
          }
          fixture.particles.forEach((p, i) => { pos.set(p.pos, i * 4); aux.set(p.aux, i * 4); flag[i] = p.flag; });
          const input = { pos: bytesToWords(pos.buffer), aux: bytesToWords(aux.buffer), flag: Array.from(flag) };
          instance.uploadedCount = fixture.particles.length;
          instance.queue.writeBuffer(instance.buf.pos, 0, pos);
          instance.queue.writeBuffer(instance.buf.aux, 0, aux);
          instance.queue.writeBuffer(instance.buf.flag, 0, flag);
          instance.terrain = { originCol: -2, originRow: -4, w: 12, h: 16, tiles: 192 };
          instance.bathBowls = new Float32Array(20);
          if (fixture.bowls) instance.bathBowls.set(fixture.bowls);
          const u = instance.paramsHost, f = instance.paramsHostF;
          u.fill(0); u[0] = instance.uploadedCount; u[1] = 64; u[2] = 64; u[5] = 4096;
          f[6] = instance.stepDt; f[7] = 0.25; f[8] = 8; f[9] = 32; f[10] = 8;
          u[12] = -2; u[13] = -4; u[14] = 12; u[15] = 16; f.set(fixture.region, 16);
          instance.queue.writeBuffer(instance.paramsBuf, 0, u);
          api.uploadTerrainMask(instance);
          api.writeGameParams(instance, fixture.slots ? 5 : 1);
          api.writeSimParams(instance);
          async function collisionAndReadback() {
            device.pushErrorScope('validation');
            if (mode === 'standalone') {
              api.runCollide(instance, selectedSlot, fixture.snowOnly);
            } else {
              const encoder = device.createCommandEncoder({ label: 'snow-test.shared' });
              instance.frameEncoder = encoder;
              try {
                if (api.runCollide.length >= 4 && !window.__snowCooperativeMode) {
                  const pass = encoder.beginComputePass({ label: 'snow-test.shared' });
                  try { api.runCollide(instance, selectedSlot, fixture.snowOnly, pass); }
                  finally { pass.end(); }
                } else {
                  // Stock cf8865e owns its compute pass. Supplying an open
                  // fourth-argument pass would nest passes on this encoder.
                  api.runCollide(instance, selectedSlot, fixture.snowOnly);
                }
              } finally { instance.frameEncoder = null; }
              instance.queue.submit([encoder.finish()]);
            }
            const outputs = await Promise.all(['pos', 'aux', 'flag'].map(key =>
              api.readbackBuffer(instance, instance.buf[key], capacity * (key === 'flag' ? 4 : 16))));
            const error = await device.popErrorScope();
            if (error) throw new Error(label + '/' + name + ': ' + error.message);
            const snapshot = { pos: bytesToWords(outputs[0]), aux: bytesToWords(outputs[1]), flag: bytesToWords(outputs[2]) };
            if (instance.buf.snowFallbackCount) {
              const counters = new Uint32Array(await api.readbackBuffer(instance, instance.buf.snowFallbackCount, 16));
              snapshot.fallbackCount = counters[0];
              snapshot.fallbackDispatchArgs = instance.snowPrimaryBGs ?
                Array.from(new Uint32Array(await api.readbackBuffer(instance, instance.buf.snowFallbackDispatch, 12))) :
                Array.from(counters.slice(1, 4));
            }
            return snapshot;
          }
          const first = await collisionAndReadback();
          // No integration or reseed between these calls: this specifically
          // detects a repeated repair of the same stationary contact.
          const second = await collisionAndReadback();
          const result = { name, fixture: fixture.name, mode, count: instance.uploadedCount,
            input, unchanged: fixture.particles.map((p, i) => p.unchanged ? i : -1).filter(i => i >= 0),
            ...first, second };
          if (window.__snowExitProbe && mode==='standalone' && selectedSlot===0) {
            const probeBG=device.createBindGroup({layout:probePipe.getBindGroupLayout(0),entries:[
              {binding:0,resource:{buffer:instance.paramsBuf}},
              {binding:4,resource:{buffer:instance.buf.terrainMask}},
              {binding:5,resource:{buffer:instance.gameParamsBufs[selectedSlot]}},
              {binding:13,resource:{buffer:probeInput}},
              {binding:14,resource:{buffer:probeOutput}}
            ]});
            const enc=device.createCommandEncoder(),pass=enc.beginComputePass();
            pass.setPipeline(probePipe);pass.setBindGroup(0,probeBG);pass.dispatchWorkgroups(Math.ceil(rays.length/4/32));pass.end();
            device.queue.submit([enc.finish()]);
            result.exitWords=bytesToWords(await api.readbackBuffer(instance,probeOutput,rays.length));
          }
          if(window.__snowBenchmark && mode==='standalone' &&
             (/circle-floor|floor-pinch|midpoint-only|no-clear-exit|multiple-fallback/.test(fixture.name))) {
            const query=device.createQuerySet({type:'timestamp',count:16});
            const resolve=device.createBuffer({size:256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
            const read=device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
            const samples=[];
            try {
              for(let n=0;n<35;n++) {
                for(const [key,data] of Object.entries({pos,aux,flag}))device.queue.writeBuffer(instance.buf[key],0,data);
                const enc=device.createCommandEncoder(),begin=enc.beginComputePass.bind(enc);let index=0;
                enc.beginComputePass=d=>begin({...d,timestampWrites:{querySet:query,beginningOfPassWriteIndex:index++,endOfPassWriteIndex:index++}});
                instance.frameEncoder=enc;
                try{api.runCollide(instance,selectedSlot,fixture.snowOnly);}finally{instance.frameEncoder=null;}
                enc.resolveQuerySet(query,0,index,resolve,0);enc.copyBufferToBuffer(resolve,0,read,0,index*8);device.queue.submit([enc.finish()]);
                await read.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(read.getMappedRange());let ms=0;
                for(let k=0;k<index;k+=2)ms+=Number(t[k+1]-t[k])/1e6;
                read.unmap();if(n>=5)samples.push(ms);
              }
              result.benchmark={samples,medianMs:samples.slice().sort((a,b)=>a-b)[samples.length>>1]};
            }finally{query.destroy();resolve.destroy();read.destroy();}
          }
          all[label].push(result);
        }
      }
      await device.queue.onSubmittedWorkDone();
      probeInput?.destroy();probeOutput?.destroy();
      release();
    }
    window.__snowProgress = { stage: 'complete' };
    const grainComparison=window.__snowGrainMode?await window.__snowGrainDifferential(device,window.__snowCollisionAPIs):null;
    if(grainComparison&&!grainComparison.pass)throw new Error('Grain search mismatch: '+JSON.stringify(grainComparison));
    return { adapterInfo, capacity, gpuErrors, outputs: all, grainComparison,
      limitation: 'Direct post-G2P collision stage with static guest/rig geometry; no full-game performance claim. Active nonfinite snow is not a supported shader input and is not tested.' };
  } finally {
    release(); destroying = true; device.destroy();
  }
}

const browserProgram = `window.__snowBenchmark=${benchmark};window.__snowExitProbe=${exitProbe};window.__snowGrainMode=${grainMode};window.__snowGrainDifferential=(${runGrainDifferential.toString()});window.__snowCooperativeMode=${cooperativeMode};window.__snowLocalSlopMode=${localSlopMode};window.__snowMakePhysicalFixtures=(${makeFixtures.toString()});window.__snowMakeCooperativeFixtures=(${makeCooperativeFixtures.toString()});window.__snowMakeFixtures=()=>window.__snowCooperativeMode?__snowMakeCooperativeFixtures(__snowMakePhysicalFixtures(),window.__snowLocalSlopMode):__snowMakePhysicalFixtures();window.__snowRunGPU=(${runGPU.toString()});`;
new vm.Script(browserProgram);
const fixtureSummary = (cooperativeMode ? makeCooperativeFixtures(makeFixtures(), localSlopMode) : makeFixtures()).map(f => ({ name: f.name, count: f.particles.length, modes: f.modes, snowOnly: f.snowOnly, collisionCalls: 2 }));
assert.ok(fixtureSummary.every(f => f.count <= (cooperativeMode ? 320 : 64)));
if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify({ dryRun: true, mode: compactMode ? "compact" : localSlopMode ? "local-slop" : cooperativeMode ? "cooperative" : "physical", port, sources: metadata, fixtures: fixtureSummary, browserLaunched: false }, null, 2));
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-snow-collision-'));
const html = '<!doctype html><meta charset="utf-8"><title>Snow collision GPU differential</title><script>window.__snowCollisionAPIs={}</script><script src="/before.js"></script><script src="/after.js"></script><script src="/test.js"></script>';
const server = createServer((req, res) => {
  const files = { '/': ['text/html', html], '/before.js': ['text/javascript', sources.before],
    '/after.js': ['text/javascript', sources.after], '/test.js': ['text/javascript', browserProgram] };
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file[0] }).end(file[1]);
});
let chrome, socket, sequence = 0, stopping = false;
const pending = new Map(), browserErrors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup() {
  if (stopping) return;
  stopping = true;
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser cleanup')); }
  pending.clear();
  try { socket?.close(); } catch {}
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), sleep(1500)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
process.once('SIGINT', () => { cleanup().finally(() => process.exit(130)); });
process.once('SIGTERM', () => { cleanup().finally(() => process.exit(143)); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
function compareCooperative(result) {
  const fixtures = new Map(makeCooperativeFixtures(makeFixtures(), localSlopMode).map(f => [f.name, f]));
  const cases = [], failures = [];
  const asFloat = word => new Float32Array(new Uint32Array([word]).buffer)[0];
  const radius = 2.5 / Math.sqrt(3.2) * .5;
  function contains(guest, x, y) {
    let inside = false; const pts = guest.pts;
    for (let i = 0, j = pts.length - 4; i < pts.length; j = i, i += 4)
      if ((pts[i + 1] > y) !== (pts[j + 1] > y) &&
          x < (pts[j] - pts[i]) * (y - pts[i + 1]) / (pts[j + 1] - pts[i + 1]) + pts[i]) inside = !inside;
    return inside;
  }
  function nearestDepth(guest, x, y) {
    let best = Infinity; const pts = guest.pts;
    for (let i = 0, j = pts.length - 4; i < pts.length; j = i, i += 4) {
      const ex = pts[j] - pts[i], ey = pts[j + 1] - pts[i + 1];
      const t = Math.max(0, Math.min(1, ((x - pts[i]) * ex + (y - pts[i + 1]) * ey) / Math.max(ex * ex + ey * ey, 1e-6)));
      best = Math.min(best, Math.hypot(x - (pts[i] + ex * t), y - (pts[i + 1] + ey * t)));
    }
    return best;
  }
  assert.equal(result.outputs.before.length, result.outputs.after.length);
  let totalFallbacks = 0, observedFallbackCases = 0;
  for (let row = 0; row < result.outputs.before.length; row++) {
    const before = result.outputs.before[row], after = result.outputs.after[row];
    assert.equal(before.name, after.name);
    const fixture = fixtures.get(after.fixture), checks = [];
    const check = (name, pass, observed) => {
      checks.push({ name, pass, ...(observed === undefined ? {} : { observed }) });
      if (!pass) failures.push({ case: after.name, name, observed });
    };
    let maxDifference = 0, bitDifferences = 0, flagsEqual = true, protectedUnchanged = true, finite = true;
    for (const [a, b] of [[before, after], [before.second, after.second]]) {
      for (const field of ['pos', 'aux', 'flag']) for (let lane = 0; lane < a[field].length; lane++) {
        if (a[field][lane] !== b[field][lane]) bitDifferences++;
        if (field === 'flag') flagsEqual &&= a[field][lane] === b[field][lane];
        else {
          const av = asFloat(a[field][lane]), bv = asFloat(b[field][lane]);
          finite &&= Number.isFinite(av) && Number.isFinite(bv);
          maxDifference = Math.max(maxDifference, Math.abs(av - bv));
        }
      }
    }
    for (const state of [after, after.second]) for (const field of ['pos', 'aux', 'flag']) {
      const stride = field === 'flag' ? 1 : 4;
      for (const i of after.unchanged.concat(Array.from({ length: result.capacity - after.count }, (_, k) => after.count + k)))
        for (let axis = 0; axis < stride; axis++) protectedUnchanged &&= state[field][i * stride + axis] === after.input[field][i * stride + axis];
    }
    if (exitProbe && after.exitWords) check('escape clearance matches original sample march', JSON.stringify(before.exitWords) === JSON.stringify(after.exitWords), {rays:after.exitWords.length});
    if (after.benchmark) checks.push({name:'matched collision GPU timing',pass:true,observed:{beforeMs:before.benchmark.medianMs,afterMs:after.benchmark.medianMs}});
    check('scalar fallback result preserved', finite && flagsEqual && ((compactMode || fixture.exactWords) ? bitDifferences === 0 : maxDifference <= .002), { maxDifference, flagsEqual, bitDifferences });
    check('frozen, off-region and unused tail unchanged', protectedUnchanged);
    if (!fixture.snowOnly) check('ordinary water remains bit-exact', bitDifferences === 0);
    const count = after.fallbackCount;
    if (typeof count === 'number') {
      totalFallbacks += count; observedFallbackCases++;
      if (fixture.snowOnly && after.count > 0) {
        const expectedArgs = compactMode ? [Math.ceil(count / 32), 1, 1] : [Math.min(count, 256), Math.ceil(count / 256), 1];
        check('indirect dispatch covers queued grains', JSON.stringify(after.fallbackDispatchArgs) === JSON.stringify(expectedArgs), after.fallbackDispatchArgs);
      }
    }
    if (fixture.requireFallback) check(compactMode ? 'compact fallback actually dispatched' : 'cooperative fallback actually dispatched', typeof count === 'number' && count >= (fixture.minimumFallback || 1), count ?? null);
    if (fixture.requireNoFallback) check('unnecessary full fallback avoided', count === 0, count ?? null);
    if (fixture.expectLegalSlop) {
      const x = asFloat(after.pos[0]), y = asFloat(after.pos[1]);
      const depth = Math.min(...fixture.guests.map(g => nearestDepth(g, x, y)));
      check('sole-guest contact stays inside legal slop', fixture.guests.length === 1 && depth <= radius * .1 + .00001, { depth, allowed: radius * .1 });
      check('legal slop avoids remote position or velocity repair', after.pos.slice(0, 4).every((v, i) => v === after.input.pos[i]), after.pos.slice(0, 4).map(asFloat));
      check('repeated legal contact is unchanged', ['pos', 'aux', 'flag'].every(field => after[field].every((v, i) => v === after.second[field][i])));
      if (fixture.name === 'terrain-blocked-slop') check('legal particle still clears the floor', y + radius < 128, { bottom: y + radius });
    }
    if (fixture.expectOutsideUnion) check('required contact resolves complete union', [after, after.second].every(state => {
      const x = asFloat(state.pos[0]), y = asFloat(state.pos[1]);
      return !fixture.guests.some(g => contains(g, x, y));
    }), after.pos.slice(0, 2).map(asFloat));
    if (fixture.expectPositionMove) check('deep or multi-guest interior actually corrected',
      after.pos[0] !== after.input.pos[0] || after.pos[1] !== after.input.pos[1]);
    if (fixture.expectNoPositionMove) check('no-clear-exit keeps safe position',
      after.pos[0] === after.input.pos[0] && after.pos[1] === after.input.pos[1]);
    if (fixture.expectPosition) check('designated escape path exercised',
      Math.abs(asFloat(after.pos[0]) - fixture.expectPosition[0]) < .004 && Math.abs(asFloat(after.pos[1]) - fixture.expectPosition[1]) < .004,
      after.pos.slice(0, 2).map(asFloat));
    cases.push({ name: after.name, count: after.count, fallbackCount: count ?? null, maxDifference, bitDifferences, checks, pass: checks.every(c => c.pass) });
  }
  if (!totalFallbacks) failures.push({ name: compactMode ? 'No compact fallback work observed' : 'No cooperative fallback work observed' });
  return { pass: !failures.length && !result.gpuErrors.length && !browserErrors.length,
    comparison: compactMode ? 'Compact fallback against pinned v28.126 c92d501; exact position, aux and flag words including protected tails and ordinary water.' : localSlopMode ? 'Cooperative fallback against cf8865e with scaled response and sole-guest legal slop; .002f32 tolerance, exact flags/protected tails/water.' : 'Cooperative fallback against original cf8865e with only scaled snow slop; .002f32 tolerance, exact flags/protected tails/water.',
    cases, totalFallbacks, observedFallbackCases, failures, gpuErrors: result.gpuErrors, browserErrors,
    adapterInfo: result.adapterInfo, sources: metadata,
    limitation: 'Direct post-G2P collision-stage regression, not a full-game performance measurement.' };
}

function compare(result) {
  const fixtures = new Map(makeFixtures().map(f => [f.name, f]));
  const rows = [], failures = [];
  const radius = 2.5 / Math.sqrt(3.2) * 0.5, epsilon = 0.002;
  const asFloat = word => new Float32Array(new Uint32Array([word]).buffer)[0];
  const point = (state, i) => state.pos.slice(i * 4, i * 4 + 4).map(asFloat);
  const equalState = (a, b) => ['pos', 'aux', 'flag'].every(field => a[field].every((v, i) => v === b[field][i]));
  function contains(guest, x, y) {
    const pts = guest.pts; let inside = false;
    for (let i = 0, j = pts.length - 4; i < pts.length; j = i, i += 4) {
      if ((pts[i + 1] > y) !== (pts[j + 1] > y) &&
          x < (pts[j] - pts[i]) * (y - pts[i + 1]) / (pts[j + 1] - pts[i + 1]) + pts[i]) inside = !inside;
    }
    return inside;
  }
  function inMiner(player, x, y) {
    const rects = [[3, 6, 20, 20], [1.5, 18, 20.5, 25]];
    return rects.some(([left, top, right, bottom]) => {
      if (player.dir < 0) [left, right] = [22 - right, 22 - left];
      return x >= player.x + left - radius && x <= player.x + right + radius &&
        y >= player.y + top - radius && y <= player.y + bottom + radius;
    });
  }
  assert.equal(result.outputs.before.length, result.outputs.after.length);
  for (let row = 0; row < result.outputs.before.length; row++) {
    const before = result.outputs.before[row], after = result.outputs.after[row];
    assert.equal(before.name, after.name);
    const fixture = fixtures.get(after.fixture), checks = [];
    const check = (name, pass, observed) => {
      checks.push({ name, pass, ...(observed === undefined ? {} : { observed }) });
      if (!pass) failures.push({ case: after.name, name, observed });
    };
    let differentLanes = 0;
    for (const field of ['pos', 'aux', 'flag']) for (let i = 0; i < before[field].length; i++)
      if (before[field][i] !== after[field][i]) differentLanes++;
    let guardsUnchanged = true, finite = true, materialSame = true, noEnergyAdded = true;
    for (const version of [before, after]) for (const state of [version, version.second]) {
      const protectedIndices = version.unchanged.concat(Array.from({ length: result.capacity - version.count }, (_, i) => version.count + i));
      for (const field of ['pos', 'aux', 'flag']) {
        const stride = field === 'flag' ? 1 : 4;
        for (const i of protectedIndices) for (let axis = 0; axis < stride; axis++) {
          const lane = i * stride + axis;
          if (state[field][lane] !== version.input[field][lane]) guardsUnchanged = false;
        }
      }
    }
    for (let i = 0; i < fixture.activeCount; i++) {
      const initial = point(after.input, i);
      for (const state of [after, after.second]) {
        const p = point(state, i);
        finite &&= p.every(Number.isFinite);
        materialSame &&= (state.flag[i] & 67) === (after.input.flag[i] & 67);
        noEnergyAdded &&= p[2] * p[2] + p[3] * p[3] <= initial[2] * initial[2] + initial[3] * initial[3] + epsilon;
        if (fixture.safeFloor) check('floor clearance ' + i, p[1] + radius <= 128 + epsilon, p);
        if (fixture.safeWall) check('wall clearance ' + i, p[0] + radius <= 128 + epsilon, p);
        if (fixture.safeMiner) check('outside rig ' + i, !inMiner(fixture.player, p[0], p[1]), p);
        if (fixture.safeBowl) {
          const [left, right, top, depth] = fixture.bowls;
          const t = Math.max(-1, Math.min(1, (p[0] - left) / (right - left) * 2 - 1));
          const surface = top + depth * (1 - (Math.cosh(2 * t) - 1) / (Math.cosh(2) - 1));
          const slope = -depth * 4 * Math.sinh(2 * t) / ((right - left) * (Math.cosh(2) - 1));
          check('bowl clearance ' + i, (p[1] - surface) / Math.sqrt(1 + slope * slope) + radius + 3 <= epsilon, p);
        }
      }
    }
    check('frozen, off-region and unused tail unchanged', guardsUnchanged);
    check('finite output and material identity', finite && materialSame);
    check('static contact adds no kinetic energy', noEnergyAdded);
    for (const i of fixture.expectExit || []) {
      const p = point(after, i);
      check('outside complete guest union ' + i, !fixture.guests.some(g => contains(g, p[0], p[1])), p);
    }
    for (const i of fixture.expectTolerance || []) {
      const p = point(after, i), initial = point(after.input, i);
      check('sub-tolerance position retained ' + i, p[0] === initial[0] && p[1] === initial[1], p);
    }
    if (fixture.expectedVelocity) fixture.expectedVelocity.forEach((velocity, i) => {
      const p = point(after, i);
      check('normal-only velocity constraint ' + i, Math.abs(p[2] - velocity[0]) <= epsilon && Math.abs(p[3] - velocity[1]) <= epsilon, p.slice(2));
    });
    if (fixture.expectSecondNoop) check('second collision is bit-identical', equalState(after, after.second));
    if (fixture.expectRepair) {
      check('baseline reproduces persistent shallow overlap', fixture.expectExit.every(i =>
        before.pos[i * 4] === before.input.pos[i * 4] && before.pos[i * 4 + 1] === before.input.pos[i * 4 + 1]));
      check('candidate repairs shallow positions', fixture.expectExit.every(i =>
        after.pos[i * 4] !== after.input.pos[i * 4] || after.pos[i * 4 + 1] !== after.input.pos[i * 4 + 1]));
    }
    if (fixture.expectSame) check('unchanged baseline behavior', equalState(before, after) && equalState(before.second, after.second));
    if (fixture.waterMustMove) check('ordinary water pipeline exercised', before.pos[4] !== before.input.pos[4] || before.pos[5] !== before.input.pos[5]);
    rows.push({ name: after.name, count: after.count, differentLanes, checks, pass: checks.every(c => c.pass) });
  }
  const union = result.outputs.after.find(row => row.fixture === 'overlap-guests');
  const reversed = result.outputs.after.find(row => row.fixture === 'overlap-guests-reversed');
  const orderIndependent = equalState(union, reversed) && equalState(union.second, reversed.second);
  if (!orderIndependent) failures.push({ name: 'guest order independence' });
  return { pass: !failures.length && !result.gpuErrors.length && !browserErrors.length,
    comparison: 'Physical shallow snow correction; raw differences are expected. Water and rig-only cases remain bit-exact against baseline.',
    snowRadius: radius, snowDeadband: radius * 0.1, cases: rows, orderIndependent, failures,
    gpuErrors: result.gpuErrors, browserErrors, adapterInfo: result.adapterInfo, limitation: result.limitation, sources: metadata };
}

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const args = ['--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank'];
  chrome = spawn('/Users/ethan/.local/bin/agent-chrome-for-testing', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeLog = '';
  chrome.stderr.on('data', data => { chromeLog = (chromeLog + data.toString()).slice(-30000); });
  chrome.on('error', error => browserErrors.push(error.message));
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (endpoint) break;
    if (chrome.exitCode !== null) throw new Error('Chrome exited: ' + chromeLog);
    await sleep(100);
  }
  assert.ok(endpoint, 'Owned Chrome for Testing CDP endpoint');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onclose = event => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CDP socket closed: ' + event.code));
    }
    pending.clear();
  };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer); pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(JSON.stringify(message.params.exceptionDetails));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready = await evaluate('typeof __snowRunGPU === "function" && !!__snowCollisionAPIs.after');
    if (ready) break;
    await sleep(50);
  }
  assert.ok(ready, 'Both exact source snapshots and private test hook loaded');
  const started = performance.now();
  // Keep the full typed-buffer report in the page. A single CDP response
  // containing both versions of every case can exceed transport limits.
  const result = await evaluate(`(async () => {
    const r = window.__snowResult = await __snowRunGPU();
    return { adapterInfo: r.adapterInfo, capacity: r.capacity, gpuErrors: r.gpuErrors,
      grainComparison:r.grainComparison, limitation: r.limitation, rowCounts: { before: r.outputs.before.length, after: r.outputs.after.length } };
  })()`);
  result.outputs = { before: [], after: [] };
  for (const label of ['before', 'after']) {
    for (let row = 0; row < result.rowCounts[label]; row++) {
      const value = await evaluate(`window.__snowResult.outputs.${label}[${row}]`);
      assert.ok(value && value.pos && value.aux && value.flag && value.input, `${label} case ${row} transferred`);
      result.outputs[label].push(value);
    }
  }
  delete result.rowCounts;
  await evaluate('delete window.__snowResult');
  const report = cooperativeMode ? compareCooperative(result) : compare(result);
  report.grainComparison=result.grainComparison;
  report.elapsedMs = performance.now() - started;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.pass || process.env.SAVE_RAW === '1') fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(result) + '\n');
  fs.writeFileSync(path.join(out, 'chrome.log'), chromeLog);
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, checks: report.cases.reduce((n, row) => n + row.checks.length, 0),
    failedCases: report.cases.filter(row => !row.pass), failures: report.failures.slice(0, 5), report: path.join(out, 'report.json') }, null, 2));
  assert.ok(report.pass, 'Snow contact correction, protected geometry and ordinary water regression checks must pass');
} catch (error) {
  let progress;
  try { if (socket?.readyState === 1) progress = await evaluate('window.__snowProgress'); } catch {}
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ message: error.message, progress, browserErrors, sources: metadata }, null, 2) + '\n');
  throw error;
} finally { await cleanup(); }
