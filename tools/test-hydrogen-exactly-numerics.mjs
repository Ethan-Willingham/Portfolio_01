import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as M from '../js/hydrogen-exactly-math.js';
const records = [];
const close = (actual, expected, tolerance, label) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`); };
function integrate(f, max, steps = 24000) {
  const h = max / steps; let sum = f(0) + f(max);
  for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
  return sum * h / 3;
}
function check(name, work) { const value = work(); records.push({ name, ...value }); console.log('PASS', name, JSON.stringify(value || {})); }
check('Known radial and angular values, real and imaginary conventions', () => {
  close(M.radial(1, 0, 0), 2, 1e-14, 'R10(0)');
  close(M.radial(1, 0, 1), 2 / Math.E, 1e-14, 'R10(1)');
  close(M.radial(2, 0, 2), 0, 1e-14, 'R20 node');
  close(M.radial(2, 1, 1), Math.exp(-0.5) / (2 * Math.sqrt(6)), 1e-14, 'R21');
  const y = M.angular(1, 1, Math.PI / 2, Math.PI / 2);
  close(y[0], 0, 1e-14, 'Y11 real'); close(y[1], -Math.sqrt(3 / (8 * Math.PI)), 1e-14, 'Y11 imaginary');
  const neg = M.angular(1, -1, Math.PI / 2, Math.PI / 2);
  close(neg[1], y[1], 1e-14, 'Y1,-1 conjugation');
  for (const s of M.REVIVAL) {
    const r = 900, theta = 1.2, phi = 0.73;
    const c = M.eigenstate(s, r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta));
    const radial = M.radial(s.n, s.l, r), angular = M.angular(s.l, s.m, theta, phi);
    close(c[0], radial * angular[0], 3e-18, 'circular real'); close(c[1], radial * angular[1], 3e-18, 'circular imaginary');
  }
  return { tolerance: 1e-14, circularAbsoluteTolerance: 3e-18 };
});
check('All 17 radial and angular basis norms', () => {
  let radialError = 0, angularError = 0;
  for (const s of [...M.REVIVAL, ...M.SPECTRAL]) {
    const rn = integrate(r => M.radial(s.n, s.l, r) ** 2 * r * r, s.n > 20 ? 2800 : 180);
    const yn = 2 * Math.PI * integrate(theta => { const [re, im] = M.angular(s.l, s.m, theta, 0.8); return (re * re + im * im) * Math.sin(theta); }, Math.PI, 4096);
    radialError = Math.max(radialError, Math.abs(rn - 1)); angularError = Math.max(angularError, Math.abs(yn - 1));
    close(rn, 1, 2e-9, 'radial norm'); close(yn, 1, 2e-9, 'angular norm');
  }
  return { radialError, angularError, tolerance: 2e-9 };
});
check('Basis orthogonality in radius and azimuth', () => {
  let maxError = 0;
  for (const [a, b] of [[2, 3], [3, 4], [3, 5], [4, 5]]) {
    const overlap = integrate(r => M.radial(a, 0, r) * M.radial(b, 0, r) * r * r, 180);
    close(overlap, 0, 2e-9, 'radial overlap'); maxError = Math.max(maxError, Math.abs(overlap));
  }
  for (let difference = 1; difference < M.REVIVAL.length; difference++) {
    let re = 0, im = 0;
    for (let j = 0; j < 128; j++) { const phi = difference * M.TAU * j / 128; re += Math.cos(phi) / 128; im += Math.sin(phi) / 128; }
    close(re, 0, 1e-14, 'azimuth overlap real'); close(im, 0, 1e-14, 'azimuth overlap imaginary');
  }
  return { maxError, tolerance: 2e-9 };
});
check('Initial and evolved orthonormal-basis norm', () => {
  const presets = JSON.parse(fs.readFileSync(new URL('../assets/visualizer/hydrogen-exactly/presets.json', import.meta.url)));
  M.REVIVAL.forEach((s,i) => close(s.c_real, presets.rydberg_packet[i].c_real, 1e-15, 'bundled coefficient'));
  let error = 0;
  for (const mode of ['revival', 'spectral']) for (const seconds of [0, 10, 50, 200, 798.1, 4500, 1e7]) {
    const cc = M.phases(M.statesFor(mode), M.solverTime(seconds, mode));
    const norm = cc.reduce((s, c) => s + c[0] ** 2 + c[1] ** 2, 0); error = Math.max(error, Math.abs(norm - 1)); close(norm, 1, 2e-14, 'evolved norm');
  }
  return { maxError: error, tolerance: 2e-14 };
});
check('Single-state stationary density and same-n degeneracy', () => {
  const single = [{ n: 3, l: 1, m: 1, c_real: 1, c_imag: 0 }];
  const same = [{ n: 3, l: 0, m: 0, c_real: Math.SQRT1_2, c_imag: 0 }, { n: 3, l: 1, m: 1, c_real: 0, c_imag: Math.SQRT1_2 }];
  for (const s of [single, same]) for (const t of [0, 15, 20000, 1e9]) {
    const a = M.wavefunction(s, 2, 3, 4, 0), b = M.wavefunction(s, 2, 3, 4, t);
    close(a.rho, b.rho, 1e-18, 'stationary');
  }
  return { absoluteTolerance: 1e-18 };
});
check('SI frequency-to-wavelength conversion and CIE source checksum', () => {
  const reference = JSON.parse(fs.readFileSync(new URL('../assets/visualizer/hydrogen-exactly/hydrogen-reference.json', import.meta.url)));
  for (const line of reference.ideal_model_lines) close(M.wavelength(line.lower_n, line.upper_n), line.vacuum_wavelength_nm, 3e-9, 'vacuum wavelength');
  const buffer = fs.readFileSync(new URL('../assets/visualizer/hydrogen-exactly/CIE_xyz_1931_2deg.csv', import.meta.url));
  const hash = crypto.createHash('sha256').update(buffer).digest('hex'); assert.equal(hash, 'fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1');
  const vendor = JSON.parse(fs.readFileSync(new URL('../assets/visualizer/hydrogen-exactly/drand-provenance.json', import.meta.url)));
  const vendorBytes = fs.readFileSync(new URL('../assets/visualizer/hydrogen-exactly/drand-client-1.4.2.mjs', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(vendorBytes).digest('hex'), vendor.bundledESMSHA256);
  const cie = M.parseCIE(buffer.toString());
  const red = M.wavelengthRGB(M.wavelength(2, 3), cie), blue = M.wavelengthRGB(M.wavelength(2, 5), cie);
  assert.ok(red[0] === 1 && blue[2] === 1); assert.equal(M.wavelengthRGB(M.wavelength(29, 30), cie), null);
  return { wavelengthAbsoluteToleranceNm: 3e-9, cieSHA256: hash };
});
check('Spatial packet events use the full spectrum', () => {
  const events = [0, 30, 50, 66.6667, 198.4, 750, 798.1].map(seconds => ({ seconds, initialOverlap: M.autocorrelation(M.REVIVAL, M.solverTime(seconds)), ...M.shapeFidelity(M.REVIVAL, M.solverTime(seconds)), equatorialPeaks: M.ringProfile(seconds).peaks.length }));
  assert.equal(events[0].equatorialPeaks, 1); assert.equal(events[2].equatorialPeaks, 2); assert.equal(events[3].equatorialPeaks, 3);
  assert.ok(events[4].fidelity > 0.73 && events[6].fidelity > 0.81); assert.ok(events[5].fidelity < 0.5);
  assert.ok(M.autocorrelation(M.REVIVAL, M.solverTime(100)) < .001 && M.shapeFidelity(M.REVIVAL, M.solverTime(100)).fidelity > .7);
  fs.writeFileSync(new URL('../assets/visualizer/hydrogen-exactly/events.json', import.meta.url), JSON.stringify({ provenance: 'Computed with full ideal E_n spectrum; grid scan of rotation, 720-angle r=900 a0 spatial cut', events }, null, 2) + '\n');
  return { events };
});
check('2D equatorial-section convergence, separate from 3D norm', () => {
  const sums = [128, 256, 512].map(grid => {
    const side = 1700, dx = 2 * side / grid; let sum = 0;
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) sum += M.wavefunction(M.REVIVAL, -side + (x + .5) * dx, -side + (y + .5) * dx, 0, 0).rho * dx * dx;
    return { grid, sectionIntegralPerA0: sum };
  });
  const relativeChange = Math.abs(sums[2].sectionIntegralPerA0 / sums[1].sectionIntegralPerA0 - 1); assert.ok(relativeChange < 1e-7);
  return { sums, relativeChange, tolerance: 1e-7 };
});
check('f16 display-density rounding before storage choice', () => {
  // Independent half precision nearest-even quantizer. No f16 phase or basis storage.
  function quantize(v) { if (v < 2 ** -14) return Math.round(v / 2 ** -24) * 2 ** -24; const step = 2 ** (Math.floor(Math.log2(v)) - 10); return Math.round(v / step) * step; }
  let total = 0, rounded = 0, maximumRelativeError = 0;
  for (const mode of ['revival', 'spectral']) for (let i = 1; i <= 10000; i++) {
    const side = M.domainFor(mode), x = side * (2 * ((i * .61803398875) % 1) - 1), y = side * (2 * ((i * .41421356237) % 1) - 1), z = side * (2 * ((i * .73205080757) % 1) - 1);
    const v = M.wavefunction(M.statesFor(mode), x, y, z, M.solverTime(50, mode)).rho * side ** 3;
    assert.ok(v < 65504); const q = quantize(v); total += v; rounded += q;
    if (v > 1e-4) maximumRelativeError = Math.max(maximumRelativeError, Math.abs(q / v - 1));
  }
  const aggregateRelativeError = Math.abs(rounded / total - 1); assert.ok(maximumRelativeError < .001 && aggregateRelativeError < .0001);
  return { samples: 20000, maximumRelativeErrorAbove1eMinus4: maximumRelativeError, aggregateRelativeError, tolerance: .001 };
});
// Honest offline still: direct CPU equatorial section, same density/exposure mapping.
function crc32(buffer) { let c = 0xffffffff; for (const b of buffer) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([length, t, data, checksum]); }
const n = 512, pixels = Buffer.alloc((n * 4 + 1) * n), tint = [.6584, .552, .3515];
const srgb = v => (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055);
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  const rho = M.wavefunction(M.REVIVAL, (2 * (x + .5) / n - 1) * 1.45 * 1700, (1 - 2 * (y + .5) / n) * 1.45 * 1700, 0, 0).rho * 1700 ** 3;
  const offset = y * (n * 4 + 1) + 1 + x * 4;
  for (let k = 0; k < 3; k++) { const v = tint[k] * (1 - Math.exp(-rho * .075)) * 1.4 + [.013, .017, .014][k]; pixels[offset + k] = Math.round(255 * srgb(v / (1 + v))); }
  pixels[offset + 3] = 255;
}
const header = Buffer.alloc(13); header.writeUInt32BE(n, 0); header.writeUInt32BE(n, 4); header[8] = 8; header[9] = 6;
fs.writeFileSync(new URL('../assets/visualizer/hydrogen-exactly/initial-section.png', import.meta.url), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
fs.mkdirSync(new URL('../research/visualizer/hydrogen-exactly-results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../research/visualizer/hydrogen-exactly-results/numerics.json', import.meta.url), JSON.stringify(records, null, 2) + '\n');
console.log('Generated CPU still and numerical evidence.');
