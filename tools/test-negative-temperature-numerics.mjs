import assert from 'node:assert/strict';
import { CONFIG, fft2, initialField, cpuStep, measure, detectVortices, organization, potential } from '../js/negative-temperature-model.js';
const result = {};
assert.throws(() => measure(new Float64Array([NaN, 0]), CONFIG), /Nonfinite/);
const p = { ...CONFIG, grid: 32, side: 16, wallHeight: 0, paddleAmplitude: 0, dt: 0.02 };
const wave = (n, side, mx = 2, my = -1, amplitude = 0.8) => {
  const a = new Float64Array(2 * n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const theta = 2 * Math.PI * (mx * i + my * j) / n, k = 2 * (j * n + i); a[k] = amplitude * Math.cos(theta); a[k + 1] = amplitude * Math.sin(theta); } return a;
};
const rms = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
const input = wave(32, 16), round = fft2(fft2(input.slice(), 32), 32, true);
result.fftRoundTripRMS = rms(input, round); assert.ok(result.fftRoundTripRMS < 1e-12);
const evolved = cpuStep(input.slice(), p), energy = 0.5 * (2 * Math.PI / 16) ** 2 * 5 + p.g * 0.8 ** 2;
const exact = input.map((v, k) => k % 2 ? input[k - 1] * -Math.sin(energy * p.dt) + v * Math.cos(energy * p.dt) : v * Math.cos(energy * p.dt) + input[k + 1] * Math.sin(energy * p.dt));
result.planeWaveRMS = rms(evolved, exact); assert.ok(result.planeWaveRMS < 1e-12);
const smooth = input.slice(); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const k = 2 * (j * 32 + i), mod = 1 + 0.16 * Math.cos(2 * Math.PI * i / 32) * Math.cos(4 * Math.PI * j / 32); smooth[k] *= mod; smooth[k + 1] *= mod; }
const initial = measure(smooth, p);
const run = dt => { const a = smooth.slice(), q = { ...p, dt }; for (let s = 0; s < Math.round(2 / dt); s++) cpuStep(a, q, s * dt); return { a, d: measure(a, q, 2) }; };
const coarse = run(.04), fine = run(.02), finer = run(.01);
result.normRelativeDrift = fine.d.norm / initial.norm - 1; assert.ok(Math.abs(result.normRelativeDrift) < 1e-11);
result.energyErrors = [coarse, fine, finer].map(r => Math.abs(r.d.energy / initial.energy - 1));
assert.ok(result.energyErrors[0] / result.energyErrors[1] > 3.8 && result.energyErrors[1] / result.energyErrors[2] > 3.8);
result.dtHalvingFieldRatio = rms(coarse.a, fine.a) / rms(fine.a, finer.a); assert.ok(result.dtHalvingFieldRatio > 3.8);
const vp = { ...CONFIG, grid: 128, side: 64, radiusX: 25, radiusY: 25 };
const imprinted = initialField(vp, '1234', [{ x: -7.1, y: 0.1, sign: 1 }, { x: 7.1, y: -0.1, sign: -1 }]);
const detected = detectVortices(imprinted, vp); assert.deepEqual(detected.map(v => v.sign), [-1, 1]); assert.equal(detected.length, 2);
result.windingSigns = detected;
const resolved = { ...CONFIG, grid: 256, side: 64, g: 2, chemicalPotential: 2, radiusX: 24, radiusY: 17 };
const zeros = [{ x: -7.125, y: 0.125, sign: 1 }, { x: 7.125, y: -0.125, sign: -1 }];
assert.equal(detectVortices(initialField(resolved, '1234', zeros), resolved).length, 2);
result.resolvedCoreDensityGate = 'Both singular cores at plaquette centers detected';
const org = organization([{x:-10,y:0,sign:1},{x:-9,y:2,sign:1},{x:-8,y:0,sign:1},{x:-7,y:2,sign:1},{x:10,y:0,sign:-1},{x:9,y:2,sign:-1},{x:8,y:0,sign:-1},{x:7,y:2,sign:-1}], CONFIG);
assert.equal(org.c2, 1); assert.equal(org.largestCluster, 4); result.organizationFixture = org;
const damp = { ...p, damping: .04 }, damped = input.slice(); for (let s = 0; s < 100; s++) cpuStep(damped, damp, s * damp.dt);
result.dampingNormError = Math.abs(measure(damped, damp).norm / measure(input, p).norm - Math.exp(-2 * damp.damping * 2)); assert.ok(result.dampingNormError < 1e-11);
// Forcing work: midpoint quadrature of integral rho dV/dt, isolated from damping.
const fp = { ...p, radiusX: 100, radiusY: 100, paddleAmplitude: 1, paddleX: 3, paddleSigmaX: 1.3, paddleSigmaY: 1.5, paddleStartY: 3, stirStart: 0, sweepDuration: 5, withdrawalDuration: 2, dt: .002 };
const forced = input.slice(); const e0 = measure(forced, fp).energy; let work = 0;
for (let s = 0; s < 500; s++) { const t = s * fp.dt, prior = forced.slice(); cpuStep(forced, fp, t); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const k = 2 * (j * 32 + i), rho = (prior[k] ** 2 + prior[k+1] ** 2 + forced[k] ** 2 + forced[k+1] ** 2) / 2; work += rho * (potential((i-16)*.5,(j-16)*.5,t+fp.dt,fp)-potential((i-16)*.5,(j-16)*.5,t,fp)) * .25; } }
result.paddleWork = { change: measure(forced, fp, 1).energy - e0, work }; result.paddleWork.residual = result.paddleWork.change - work; assert.ok(Math.abs(result.paddleWork.residual) < .0001);
console.log(JSON.stringify(result, null, 2));
