// Build the freestanding numeric accelerator, verify it, and optionally embed it.
// The default writes generated files under /tmp and leaves source JS unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = { clang:process.env.CLANG || '/opt/homebrew/opt/llvm/bin/clang', linker:process.env.WASM_LD, check:false };
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (name === '--check') options.check = true;
  else if (['--clang', '--linker', '--output', '--embed'].includes(name)) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error('Missing value for ' + name);
    options[name.slice(2)] = args[++i];
  } else throw Error('Unknown option: ' + name);
}
if (!options.linker) {
  const candidate = '/opt/homebrew/opt/lld/bin/wasm-ld';
  if (fs.existsSync(candidate)) options.linker = candidate;
}
if (!options.linker) throw Error('Provide --linker /path/to/wasm-ld or set WASM_LD. No toolchain is installed by this helper.');
const output = options.output ? path.resolve(options.output) : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'air-pressure-kernel-')), 'air-pressure-kernel.wasm');
fs.mkdirSync(path.dirname(output), { recursive:true });
const functions = ['apply', 'smooth', 'restrictResidual', 'prolong', 'norm', 'dot', 'updateXR', 'updateP', 'residual', 'scale'];
function run(command, args) {
  const result = spawnSync(command, args, { encoding:'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || result.stdout || command + ' failed.');
}
// Invoke the linker directly: this clang's WASM driver ignores --ld-path.
run(options.clang, [
  '--target=wasm32', '-O3', '-std=c11', '-nostdlib', '-ffp-contract=off', '-fno-builtin',
  '-c', path.join(root, 'tools/air-pressure-kernel.c'), '-o', output + '.o'
]);
run(path.resolve(options.linker), [
  '--no-entry', '--export-memory', '--export=__heap_base',
  '--initial-memory=16777216', '--max-memory=16777216', '-z', 'stack-size=65536',
  ...functions.map(name => '--export=' + name), output + '.o', '-o', output
]);
const bytes = fs.readFileSync(output), module = new WebAssembly.Module(bytes);
assert.deepEqual(WebAssembly.Module.imports(module), [], 'The kernel has no imports.');
const instance = new WebAssembly.Instance(module), kernel = instance.exports;
for (const name of functions) assert.equal(typeof kernel[name], 'function', name + ' is exported.');
assert.equal(kernel.memory.buffer.byteLength, 16 * 1024 * 1024);
assert.ok(kernel.__heap_base.value >= 65536);

function verifyKernels() {
  let cursor = kernel.__heap_base.value;
  function allocate(values) {
    cursor = Math.ceil(cursor / 8) * 8;
    const pointer = cursor; cursor += values.length * 8;
    assert.ok(cursor <= kernel.memory.buffer.byteLength);
    const view = new Float64Array(kernel.memory.buffer, pointer, values.length); view.set(values);
    return { pointer, view };
  }
  function equal(actual, expected, label) {
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assert.ok(Object.is(actual[i], expected[i]) || actual[i] === expected[i], label + ' differs at ' + i + ': ' + actual[i] + ' versus ' + expected[i]);
    }
  }
  for (const [w, h] of [[1,1], [1,7], [8,1], [7,5], [16,12], [33,17]]) {
    const n = w * h, nw = Math.ceil(w / 2), nh = Math.ceil(h / 2);
    const r = new Float64Array(n), t = new Float64Array(n), l = new Float64Array(n), b = new Float64Array(n), d = new Float64Array(n);
    const x = new Float64Array(n), rhs = new Float64Array(n);
    for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) {
      const i = y * w + k;
      r[i] = k + 1 < w ? (i % 7 + 1) * .125 : 2;
      t[i] = y + 1 < h ? (i % 5 + 1) * .375 : 2;
      l[i] = k ? r[i - 1] : 2; b[i] = y ? t[i - w] : 2;
      d[i] = r[i] + t[i] + l[i] + b[i];
      x[i] = Math.sin(i * .37) * 3; rhs[i] = Math.cos(i * .19) * 11;
    }
    // Include an inactive row while retaining the exact supplied operator.
    if (n > 3) d[2] = 0;
    const arrays = [r,t,l,b,d,x,rhs].map(allocate), pointers = arrays.map(a => a.pointer);
    const applied = allocate(new Float64Array(n)), expected = new Float64Array(n);
    for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) {
      const i = y * w + k;
      expected[i] = d[i] * x[i] - (k + 1 < w ? r[i] * x[i + 1] : 0) - (y + 1 < h ? t[i] * x[i + w] : 0) - (k ? l[i] * x[i - 1] : 0) - (y ? b[i] * x[i - w] : 0);
    }
    kernel.apply(w,h,...pointers.slice(0,6),applied.pointer); equal(applied.view,expected,'apply');
    for (const reverse of [0,1]) {
      const smoothX = x.slice(); arrays[5].view.set(x);
      for (let phase = 0; phase < 2; phase++) for (let y = 0; y < h; y++) for (let k = ((reverse ? 1 - phase : phase) + y) % 2; k < w; k += 2) {
        const i = y * w + k;
        smoothX[i] = d[i] > 0 ? (rhs[i] + (k + 1 < w ? r[i] * smoothX[i + 1] : 0) + (y + 1 < h ? t[i] * smoothX[i + w] : 0) + (k ? l[i] * smoothX[i - 1] : 0) + (y ? b[i] * smoothX[i - w] : 0)) / d[i] : 0;
      }
      kernel.smooth(w,h,...pointers,reverse); equal(arrays[5].view,smoothX,'smooth');
    }
    const coarseRhs = allocate(new Float64Array(nw * nh)), expectedCoarse = new Float64Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let k = 0; k < nw; k++) {
      let sum = 0;
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) if (k * 2 + xx < w && y * 2 + yy < h) {
        const i = (y * 2 + yy) * w + k * 2 + xx; sum += rhs[i] - expected[i];
      }
      expectedCoarse[y * nw + k] = sum * .25;
    }
    kernel.restrictResidual(w,h,nw,nh,pointers[6],applied.pointer,coarseRhs.pointer); equal(coarseRhs.view,expectedCoarse,'restrictResidual');
    const expectedProlong = x.slice(); arrays[5].view.set(x);
    for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) {
      const i = y * w + k; if (d[i] > 0) expectedProlong[i] += expectedCoarse[Math.floor(y / 2) * nw + Math.floor(k / 2)];
    }
    kernel.prolong(w,h,nw,pointers[5],coarseRhs.pointer,pointers[4]); equal(arrays[5].view,expectedProlong,'prolong');
    arrays[5].view.set(x);
    assert.equal(kernel.norm(n,pointers[5]),x.reduce((maximum,value) => Math.max(maximum,Math.abs(value)),0));
    assert.equal(kernel.dot(n,pointers[5],pointers[6]),x.reduce((sum,value,i) => sum + value * rhs[i],0));
    const pressure = allocate(x), residual = allocate(rhs), direction = allocate(expectedCoarse.length === n ? expectedCoarse : x);
    const alpha = .037, updatedX = x.slice(), updatedR = rhs.slice();
    for (let i = 0; i < n; i++) { updatedX[i] += alpha * direction.view[i]; updatedR[i] -= alpha * expected[i]; }
    kernel.updateXR(n,pressure.pointer,residual.pointer,direction.pointer,applied.pointer,alpha);
    equal(pressure.view,updatedX,'updateXR pressure'); equal(residual.view,updatedR,'updateXR residual');
    const beta = -.19, updatedP = x.map((value,i) => rhs[i] + beta * value); pressure.view.set(x);
    kernel.updateP(n,pressure.pointer,pointers[6],beta); equal(pressure.view,updatedP,'updateP');
    kernel.residual(n,pointers[6],applied.pointer,residual.pointer); equal(residual.view,rhs.map((value,i) => value - expected[i]),'residual');
    pressure.view.set(x); kernel.scale(n,pressure.pointer,.37); equal(pressure.view,x.map(value => value * .37),'scale');
  }
  const edge = allocate(new Float64Array([-0, -Infinity, Infinity])); assert.equal(kernel.norm(3,edge.pointer), Infinity);
  edge.view[1] = NaN; assert.ok(Number.isNaN(kernel.norm(3,edge.pointer)));
  console.log('Verified all ten kernels against identical float64 JavaScript operations, including odd grids, inactive rows and nonfinite norm values.');
}
if (options.check) verifyKernels();
const marker = "const AIR_PRESSURE_WASM='" + bytes.toString('base64') + "';";
const markerPath = output + '.marker.js'; fs.writeFileSync(markerPath, marker + '\n');
if (options.embed) {
  const target = path.resolve(options.embed), source = fs.readFileSync(target, 'utf8');
  const expression = /\bconst\s+AIR_PRESSURE_WASM\s*=\s*'[^']*'\s*;/g;
  assert.equal([...source.matchAll(expression)].length, 1, 'Embed target must contain exactly one AIR_PRESSURE_WASM marker.');
  fs.writeFileSync(target, source.replace(expression, marker));
  console.log('Embedded ' + bytes.length + ' bytes in ' + target);
}
console.log('Built ' + output + ' (' + bytes.length + ' bytes, float64, no imports, 16 MiB memory).');
console.log('Marker ' + markerPath);
