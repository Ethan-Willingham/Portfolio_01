// Production moving-miner geometry, upload and collision regression.
// Run: node tools/test-rig-hull-gpu.mjs
// Owns a Chrome for Testing child and closes that exact process in finally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.DUMP || '/tmp/sluice-rig-hull-gpu';
const port = Number(process.env.PORT || 0), debugPort = Number(process.env.DEBUG_PORT || 0);
assert(Number.isInteger(port) && port >= 0 && port <= 65535, 'PORT is a valid port');
assert(Number.isInteger(debugPort) && debugPort >= 0 && debugPort <= 65535, 'DEBUG_PORT is a valid port');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-rig-hull-gpu-'));
const hullSource = fs.readFileSync(path.join(root, 'js/sluice/069-rig-hull.js'), 'utf8');
const liquidSource = fs.readFileSync(path.join(root, 'js/liquid-wgpu.js'), 'utf8');
const marker = '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
assert.equal(liquidSource.split(marker).length, 2, 'unique private export anchor');
const servedSource = liquidSource.replace(marker, marker + `
  window.__rigGPU = { buildBuffers:buildBuffers, buildCollidePipelines:buildCollidePipelines,
    uploadTerrainMask:uploadTerrainMask, writeGameParams:writeGameParams,
    writeSimParams:writeSimParams, runCollide:runCollide, readbackBuffer:readbackBuffer,
    shader:WGSL_GAME_PARAMS, base:GS_RIG_BASE, lanes:GS_PARAM_LANES,
    slots:GS_FRAME_SLOTS, fallback:DEFAULT_RIG_HULL,
    waterRadius:LIQUID_COLLIDE_RADIUS, snowRadius:LIQUID_CELL_DEFAULT/Math.sqrt(LIQUID_SNOW_DENSITY)*0.5,
    buildGridPipelines:buildGridPipelines, buildGrid:buildGrid,
    prepareSnowGrains:prepareSnowGrains, runSnowGrains:runSnowGrains,
    denseGrid:function(){LIQUID_SPARSE=0;} };
`);
new vm.Script(servedSource);

async function runGPU() {
  let checks = 0;
  function check(value, message) { checks++; if (!value) throw new Error(message); }
  const near = (a, b, message, tolerance = 0.0002) => check(Math.abs(a - b) <= tolerance, message + ': ' + a + ' versus ' + b);
  const api = window.__rigGPU;
  check(api.fallback.length === RIG_HULL_LOCAL.length, 'standalone fallback vertex count');
  api.fallback.forEach((v, i) => near(v, RIG_HULL_LOCAL[i], 'standalone fallback matches shared local hull', 1e-12));
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  check(adapter, 'WebGPU adapter available');
  const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage } });
  const errors = [];
  let destroying = false, current, floorActive = false;
  device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  device.lost.then(info => { if (!destroying) errors.push(info.message); });
  const capacity = 64;
  const instance = { device, queue: device.queue, maxParticles: capacity, g2pReady: true,
    stepDt: 1 / 120, frameEncoder: null, terrainMaskWords: 0,
    liquid: { getGameState: () => ({ player: current, guests: [] }),
      fillTerrainSolid(col, row, w, h, target) {
        target.fill(0);
        if (floorActive) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) target[y * w + x] = +(row + y >= 4);
      } } };
  let queryInput, queryOutput;
  try {
    device.pushErrorScope('validation');
    api.buildBuffers(instance); api.buildCollidePipelines(instance);
    check(instance.collideReady, 'production water and snow collision pipelines built');
    const queryCode = api.shader + `
@group(0) @binding(0) var<uniform> gameP : GameParams;
@group(0) @binding(1) var<storage, read> probes : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> results : array<vec4f>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i=gid.x; if (i>=arrayLength(&probes)) { return; }
  let p=probes[i]; let q=minerContact(p.xy);
  results[i*2u]=vec4f(q.point,q.normal);
  results[i*2u+1u]=vec4f(q.distance,select(0.0,1.0,pointInMiner(p.x,p.y)),
    select(0.0,1.0,minerContains(p.xy,p.z)),0.0);
}`;
    const queryPipeline = device.createComputePipeline({ layout: 'auto',
      compute: { module: device.createShaderModule({ code: queryCode }), entryPoint: 'main' } });
    queryInput = device.createBuffer({ size: capacity * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    queryOutput = device.createBuffer({ size: capacity * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const pipelineError = await device.popErrorScope();
    check(!pipelineError, 'pipeline validation: ' + pipelineError?.message);
    instance.terrain = { originCol: -2, originRow: -4, w: 12, h: 16, tiles: 192 };
    instance.bathBowls = new Float32Array(20);
    const u = instance.paramsHost, f = instance.paramsHostF;
    u.fill(0); u[1] = 64; u[2] = 64; u[5] = 4096;
    f[6] = instance.stepDt; f[7] = 0.25; f[8] = 8; f[9] = 32; f[10] = 8;
    u[12] = -2; u[13] = -4; u[14] = 12; u[15] = 16; f.set([0, -128, 256, 256], 16);
    api.uploadTerrainMask(instance); api.writeSimParams(instance);
    const copyHull = h => ({ n: h.n, x: Array.from(h.x), y: Array.from(h.y), nx: Array.from(h.nx),
      ny: Array.from(h.ny), l: h.l, t: h.t, r: h.r, b: h.b });
    function pose(dir, sx, sy, tilt, dip) {
      player = { x: 88, y: 78, dir, bodyTiltRender: tilt };
      window.__rigScale = { x: sx, y: sy }; window.__rigDip = dip;
      return copyHull(rigContactHull());
    }
    function shifted(h, dx, dy) { return { ...h, x: h.x.map(x => x + dx), y: h.y.map(y => y + dy),
      l: h.l + dx, t: h.t + dy, r: h.r + dx, b: h.b + dy }; }
    function face(h, i, inset) {
      const j = (i + 1) % h.n;
      return [(h.x[i] + h.x[j]) / 2 - h.nx[i] * inset, (h.y[i] + h.y[j]) / 2 - h.ny[i] * inset];
    }
    function probes(h) {
      const result = [];
      for (let i = 0; i < h.n; i++) for (const inset of [-2, 0.4]) result.push([...face(h, i, inset), 0.9, 0]);
      // Beyond each crown corner, the normal follows the rounded particle
      // contact arc continuously between the two adjacent face normals.
      for (let i = 2; i <= 8; i++) for (const blend of [0.1, 0.5, 0.9]) {
        const prev = (i + h.n - 1) % h.n;
        let nx = h.nx[prev] * (1 - blend) + h.nx[i] * blend;
        let ny = h.ny[prev] * (1 - blend) + h.ny[i] * blend;
        const len = Math.hypot(nx, ny); nx /= len; ny /= len;
        result.push([h.x[i] + nx * 2, h.y[i] + ny * 2, 0.9, 0]);
      }
      result.push([h.x.reduce((a, x) => a + x, 0) / h.n, h.y.reduce((a, y) => a + y, 0) / h.n, 0.9, 0]);
      return result;
    }
    let queryPoses = 0, querySamples = 0;
    for (const dir of [-1, 1]) for (const [sx, sy, tilt, dip] of [[1, 1, 0, 0], [1.15, 0.82, 0.3, 1.35], [0.945, 1.099, -0.3, 0.5]]) {
      const hull = pose(dir, sx, sy, tilt, dip);
      for (const fallback of [false, true]) {
        if (fallback && (sx !== 1 || sy !== 1 || tilt || dip)) continue;
        current = { active: true, x: player.x, y: player.y, dir, vx: 120, vy: -65, hull: fallback ? null : hull };
        api.writeGameParams(instance, 5);
        for (const slot of [0, 2, 4]) {
          const back = (4 - slot) * instance.stepDt, h = shifted(hull, -current.vx * back, -current.vy * back);
          const p = probes(h), data = new Float32Array(capacity * 4);
          p.forEach((v, i) => data.set(v, i * 4));
          instance.queue.writeBuffer(queryInput, 0, data);
          const bg = device.createBindGroup({ layout: queryPipeline.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: instance.gameParamsBufs[slot] } },
            { binding: 1, resource: { buffer: queryInput } }, { binding: 2, resource: { buffer: queryOutput } }] });
          const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
          pass.setPipeline(queryPipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(1); pass.end();
          instance.queue.submit([encoder.finish()]);
          const gpu = new Float32Array(await api.readbackBuffer(instance, queryOutput, capacity * 32));
          const host = instance.gameParamsHost.subarray(slot * api.lanes, (slot + 1) * api.lanes);
          check(host[api.base] === h.n, 'uniform vertex count');
          for (let i = 0; i < h.n; i++) {
            const base = api.base + 8 + i * 4;
            near(host[base], h.x[i], 'rewound uniform x'); near(host[base + 1], h.y[i], 'rewound uniform y');
            near(host[base + 2], h.nx[i], 'uniform normal x'); near(host[base + 3], h.ny[i], 'uniform normal y');
          }
          for (let i = 0; i < p.length; i++) {
            const q = rigHullQuery(h, data[i * 4], data[i * 4 + 1]), base = i * 8;
            near(gpu[base], q.x, 'GPU nearest x'); near(gpu[base + 1], q.y, 'GPU nearest y');
            near(gpu[base + 2], q.nx, 'GPU normal x'); near(gpu[base + 3], q.ny, 'GPU normal y');
            near(gpu[base + 4], q.distance, 'GPU signed distance');
            check(gpu[base + 5] === +(q.distance <= 0), 'GPU point containment');
            check(gpu[base + 6] === +(q.distance <= 1.05), 'GPU radius containment');
            querySamples++;
          }
          queryPoses++;
        }
      }
    }
    let collisionCases = 0, particlesChecked = 0;
    const rows = [];
    for (const dir of [-1, 1]) for (const transformed of [false, true]) for (const material of [0, 1, 5]) {
      const h = transformed ? pose(dir, 1.15, 0.82, 0.3, 1.35) : pose(dir, 1, 1, 0, 0);
      current = { active: true, x: player.x, y: player.y, dir, vx: 0, vy: 0, hull: h };
      const seeds = [], add = (kind, x, y, normal) => seeds.push({ kind, x, y, normal });
      if (!transformed) for (const [x, y] of [[3.2, 6.5], [19.3, 6.5], [1.7, 18.0], [20.0, 18.2]]) {
        add('old-empty-corner', player.x + (dir < 0 ? 22 - x : x), player.y + y);
      }
      add('deep', h.x.reduce((a, x) => a + x, 0) / h.n, h.y.reduce((a, y) => a + y, 0) / h.n);
      for (const i of [2, 3, 7, 8, 10]) {
        const p = face(h, i, 0.4); add(i === 10 ? 'flat-base' : 'curved-crown', ...p, [h.nx[i], h.ny[i]]);
      }
      const center = [h.x.reduce((a, x) => a + x, 0) / h.n, h.y.reduce((a, y) => a + y, 0) / h.n];
      add('material-skip', ...center); seeds.at(-1).flag = material === 5 ? 8 | (29 << 8) : 65 | 16 | (29 << 8);
      add('frozen-skip', ...center); seeds.at(-1).flag = (material === 5 ? 65 | 16 : material | 8) | 32 | (29 << 8);
      const pos = new Float32Array(capacity * 4), aux = new Float32Array(capacity * 4), flag = new Uint32Array(capacity);
      seeds.forEach((p, i) => {
        const v = p.normal ? p.normal.map(n => -40 * n) : [0, 0];
        pos.set([p.x, p.y, ...v], i * 4); aux.set([3.2, 0, p.x, p.y], i * 4);
        flag[i] = p.flag ?? (material === 5 ? 65 | 16 | (29 << 8) : material | 8 | (29 << 8));
      });
      instance.uploadedCount = seeds.length; u[0] = seeds.length;
      instance.queue.writeBuffer(instance.paramsBuf, 0, u);
      instance.queue.writeBuffer(instance.buf.pos, 0, pos); instance.queue.writeBuffer(instance.buf.aux, 0, aux);
      instance.queue.writeBuffer(instance.buf.flag, 0, flag); api.writeGameParams(instance, 1);
      device.pushErrorScope('validation');
      api.runCollide(instance, 0, material === 5);
      const output = new Float32Array(await api.readbackBuffer(instance, instance.buf.pos, capacity * 16));
      const outputFlags = new Uint32Array(await api.readbackBuffer(instance, instance.buf.flag, capacity * 4));
      const collisionError = await device.popErrorScope();
      check(!collisionError, 'collider validation: ' + collisionError?.message);
      for (let i = 0; i < seeds.length; i++) {
        const p = seeds[i], x = output[i * 4], y = output[i * 4 + 1], vx = output[i * 4 + 2], vy = output[i * 4 + 3];
        check([x, y, vx, vy].every(Number.isFinite), 'finite collider output');
        if (p.kind === 'material-skip' || p.kind === 'frozen-skip') {
          check(x === pos[i * 4] && y === pos[i * 4 + 1] && vx === pos[i * 4 + 2] && vy === pos[i * 4 + 3], 'skipped particle state remains unchanged');
          check(outputFlags[i] === flag[i], 'skipped particle flags remain unchanged');
        } else if (p.kind === 'old-empty-corner') {
          check(x === pos[i * 4] && y === pos[i * 4 + 1], 'empty former AABB corner remains unchanged');
        } else {
          const q = rigHullQuery(h, x, y);
          const radius = material === 5 ? api.snowRadius : api.waterRadius;
          check(q.distance > radius + 0.15, 'actual collider clears padded shared hull for material ' + material + ', ' + p.kind + ': ' + q.distance);
          if (p.normal) {
            const dx = x - pos[i * 4], dy = y - pos[i * 4 + 1], len = Math.hypot(dx, dy);
            check(len > 1 && (dx * p.normal[0] + dy * p.normal[1]) / len > 0.9999, 'face projection follows curved or flat normal');
            check(vx * p.normal[0] + vy * p.normal[1] >= -0.001, 'no inward normal velocity remains');
            check(Math.abs(vx * p.normal[1] - vy * p.normal[0]) < 0.001, 'normal contact adds no tangential impulse');
            if (p.kind === 'flat-base' && !transformed) near(x, pos[i * 4], 'flat base keeps horizontal contact');
          }
        }
        particlesChecked++;
      }
      rows.push({ dir, transformed, material, particles: seeds.length }); collisionCases++;
    }
    // A real settled shallow bed, using production snow prediction, neighbor
    // indexing, grain contact and terrain/rig projection on every tick.
    // Both shapes receive identical seeds, floor, drive speed and tick order.
    const oldLocal = [4.2,18.5,5.5,10.5,6.948000000000001,8.924000000000003,8.492,7.716,10.132,6.876,
      11.868,6.404,13.7,6.3,15.388888888888891,7.311111111111112,16.72222222222222,8.744444444444444,
      17.7,10.6,17.2,24.4,4.2,24.4];
    function worldHull(local, x, y, dir) {
      const h = { n: local.length / 2, x: [], y: [], nx: [], ny: [] };
      for (let i = 0; i < h.n; i++) { h.x.push(x + (dir < 0 ? 22 - local[i * 2] : local[i * 2])); h.y.push(y + local[i * 2 + 1]); }
      for (let i = 0; i < h.n; i++) {
        const j = (i + 1) % h.n, ex = h.x[j] - h.x[i], ey = h.y[j] - h.y[i], len = Math.hypot(ex, ey);
        h.nx.push(ey / len * dir); h.ny.push(-ex / len * dir);
      }
      h.l = Math.min(...h.x); h.r = Math.max(...h.x); h.t = Math.min(...h.y); h.b = Math.max(...h.y); return h;
    }
    floorActive = true; api.uploadTerrainMask(instance);
    instance.cellSize = 2.5; instance.grid = { w: 64, h: 64, cells: 4096 };
    instance.liquid.getSnowAir = () => ({ active: false, wind: -12 * Math.sin(127 * 0.006), clock: 0 });
    api.denseGrid(); api.buildGridPipelines(instance);
    const grainDt = 1 / 480, diameter = api.snowRadius * 2, rampRows = [];
    u[1] = u[2] = 64; u[3] = u[4] = 0; u[5] = 4096; f[7] = 0.4;
    for (const dir of [-1, 1]) for (const label of ['near-vertical', 'rising-wedge']) {
      const local = label === 'near-vertical' ? oldLocal : RIG_HULL_LOCAL;
      const pos = new Float32Array(capacity * 4), aux = new Float32Array(capacity * 4), affine = new Float32Array(capacity * 4), flag = new Uint32Array(capacity);
      let count = 0;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 18; col++) {
        const x = 99 + dir * (12 + col * diameter), y = 128 - api.snowRadius - row * diameter;
        pos.set([x, y, 0, 0], count * 4); aux.set([3.2, 0, x, y], count * 4);
        affine.set([0, 0, 0, 0.6], count * 4); flag[count] = 65 | (29 << 8); count++;
      }
      instance.uploadedCount = count; u[0] = count; instance.queue.writeBuffer(instance.paramsBuf, 0, u);
      for (const [key, data] of Object.entries({ pos, aux, affine, flag })) instance.queue.writeBuffer(instance.buf[key], 0, data);
      current = { active: false }; api.writeGameParams(instance, 1); api.prepareSnowGrains(instance, grainDt);
      async function tick() {
        const encoder = device.createCommandEncoder({ label: 'rig-ramp.grain-tick' }); instance.frameEncoder = encoder;
        try {
          api.runSnowGrains(instance, 'predict', 0, false, true);
          api.buildGrid(instance, true, true);
          api.runSnowGrains(instance, 'contacts', 0, true, true);
          api.runSnowGrains(instance, 'shield', 0, false, false);
          instance.queue.submit([encoder.finish()]);
        } finally { instance.frameEncoder = null; }
      }
      device.pushErrorScope('validation');
      for (let frame = 0; frame < 240; frame++) await tick();
      const settled = new Float32Array(await api.readbackBuffer(instance, instance.buf.pos, count * 16));
      let settledMaxSpeed = 0;
      for (let i = 0; i < count; i++) settledMaxSpeed = Math.max(settledMaxSpeed, Math.hypot(settled[i * 4 + 2], settled[i * 4 + 3]));
      check(settledMaxSpeed < 8, 'shallow bed settles before drive: ' + settledMaxSpeed);
      let peakMeanRise = 0, peakRise = 0, minVY = 0, upwardContacts = 0, maxHullOverlap = 0;
      for (let frame = 1; frame <= 240; frame++) {
        current = { active: true, x: 88 + dir * 150 * frame * grainDt, y: 102, dir, vx: dir * 150, vy: 0 };
        current.hull = worldHull(local, current.x, current.y, dir); api.writeGameParams(instance, 1);
        await tick();
        const state = new Float32Array(await api.readbackBuffer(instance, instance.buf.pos, count * 16));
        let sumRise = 0;
        for (let i = 0; i < count; i++) {
          const x = state[i * 4], y = state[i * 4 + 1], vx = state[i * 4 + 2], vy = state[i * 4 + 3];
          check([x, y, vx, vy].every(Number.isFinite), 'finite rising snow');
          check(y + api.snowRadius <= 128.0001, 'snow does not cross the real terrain floor');
          const q = rigHullQuery(current.hull, x, y);
          maxHullOverlap = Math.max(maxHullOverlap, -q.distance);
          check(q.distance >= api.snowRadius + 0.15 - 0.0001, 'snow grain disks stay outside the actual rig hull');
          if (q.distance < api.snowRadius + 0.35 && q.ny < -0.05 && vy < -5) upwardContacts++;
          const rise = Math.max(0, settled[i * 4 + 1] - y);
          sumRise += rise; peakRise = Math.max(peakRise, rise); minVY = Math.min(minVY, vy);
        }
        peakMeanRise = Math.max(peakMeanRise, sumRise / count);
      }
      const rampError = await device.popErrorScope(); check(!rampError, 'ramp dispatch validation: ' + rampError?.message);
      rampRows.push({ dir, shape: label, count, settledMaxSpeed, peakMeanRise, peakRise, minVY, upwardContacts, maxHullOverlap });
    }
    for (const dir of [-1, 1]) {
      const baseline = rampRows.find(r => r.dir === dir && r.shape === 'near-vertical');
      const wedge = rampRows.find(r => r.dir === dir && r.shape === 'rising-wedge');
      check(wedge.upwardContacts > 20 && wedge.minVY < -10, 'driving ' + dir + ' imparts upward normal velocity');
      check(wedge.peakRise > 2 && wedge.peakMeanRise > baseline.peakMeanRise + 0.25,
        'driving ' + dir + ' raises shallow snow more than the previous skirt: ' + JSON.stringify({ baseline, wedge }));
    }
    await device.queue.onSubmittedWorkDone();
    check(!errors.length, 'no GPU errors: ' + errors.join('; '));
    return { pass: true, checks, queryPoses, querySamples, collisionCases, particlesChecked, rows, gpuErrors: errors,
      adapter: adapter.info?.description || null, rampRows,
      limitation: 'Direct production contact dispatch plus settled shallow snow prediction/grid/grain contacts and rigid driving against a real terrain floor; no full-game presentation or weather claim.' };
  } finally {
    for (const b of Object.values(instance.buf || {})) b.destroy();
    instance.paramsBuf?.destroy(); instance.simParamsBuf?.destroy();
    instance.snowGrainParams?.destroy(); instance.snowAirTexture?.destroy(); instance.snowProjectedAir?.destroy();
    for (const b of instance.gameParamsBufs || []) b.destroy();
    queryInput?.destroy(); queryOutput?.destroy(); destroying = true; device.destroy();
  }
}

const bootstrap = 'var player, __rigScale={x:1,y:1}, __rigDip=0; var PLAYER_W=22, PLAYER_H=26; function playerBodyScale(){return __rigScale;} function playerFxLandOffset(){return __rigDip;}';
const program = `window.__runRigGPU=(${runGPU.toString()});`;
const html = '<!doctype html><meta charset="utf-8"><title>Rig hull GPU checks</title><script src="/hull.js"></script><script src="/liquid.js"></script><script src="/test.js"></script>';
const server = createServer((req, res) => {
  const routes = { '/': ['text/html', html], '/hull.js': ['text/javascript', bootstrap + hullSource],
    '/liquid.js': ['text/javascript', servedSource], '/test.js': ['text/javascript', program] };
  const file = routes[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file[0] }).end(file[1]);
});
let chrome, socket, sequence = 0, cleaning = false, chromeLog = '';
const pending = new Map(), browserErrors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup() {
  if (cleaning) return; cleaning = true;
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('browser cleanup')); }
  pending.clear(); try { socket?.close(); } catch {}
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM'); await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(1500)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  server.close(); fs.rmSync(profile, { recursive: true, force: true });
}
process.once('SIGINT', () => { cleanup().finally(() => process.exit(130)); });
process.once('SIGTERM', () => { cleanup().finally(() => process.exit(143)); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 120000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
fs.mkdirSync(out, { recursive: true });
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn('/Users/ethan/.local/bin/agent-chrome-for-testing', ['--headless=new', '--enable-unsafe-webgpu',
    '--use-angle=metal', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', d => { chromeLog = (chromeLog + d).slice(-30000); });
  chrome.on('error', e => browserErrors.push(e.message));
  const portFile = path.join(profile, 'DevToolsActivePort');
  let endpoint;
  for (let attempt = 0; !endpoint && attempt < 150; attempt++) {
    if (chrome.exitCode !== null) throw new Error('Chrome exited: ' + chromeLog);
    const debug = debugPort || (fs.existsSync(portFile) ? Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]) : 0);
    if (debug) try {
      const tabs = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
      endpoint = tabs.find(t => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!endpoint) await delay(100);
  }
  assert(endpoint, 'owned testing browser started');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const m = JSON.parse(event.data), p = pending.get(m.id);
    if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') browserErrors.push(m.params.exceptionDetails);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { ready = await evaluate('typeof __runRigGPU === "function" && !!window.__rigGPU'); if (!ready) await delay(50); }
  assert(ready, 'test sources loaded');
  const result = await evaluate('__runRigGPU()');
  result.browserErrors = browserErrors; result.sources = { hull: createHash('sha256').update(hullSource).digest('hex'), liquid: createHash('sha256').update(liquidSource).digest('hex') };
  assert.equal(browserErrors.length, 0, 'no browser errors');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ pass: result.pass, checks: result.checks, queryPoses: result.queryPoses,
    querySamples: result.querySamples, collisionCases: result.collisionCases, particlesChecked: result.particlesChecked,
    report: path.join(out, 'report.json') }, null, 2));
} catch (e) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ message: e.message, browserErrors, chromeLog }, null, 2) + '\n');
  throw e;
} finally { await cleanup(); }
