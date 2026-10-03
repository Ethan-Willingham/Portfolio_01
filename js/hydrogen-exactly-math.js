// Independent f64 reference. Length: a0. Time: hbar/Eh. Condon-Shortley Y_lm.
export const MODEL = 'Fixed-nucleus nonrelativistic Coulomb Hamiltonian, H = -laplacian/2 - 1/r';
export const A0 = 5.29177210544e-11;
export const EH = 4.3597447222059776e-18;
export const H = 6.62607015e-34;
export const C = 299792458;
export const ATOMIC_TIME = H / (2 * Math.PI * EH);
export const TCL = 2 * Math.PI * 30 ** 3;
export const TAU = 2 * Math.PI;
const logs = [0];
export function logFactorial(n) {
  for (let i = logs.length; i <= n; i++) logs[i] = logs[i - 1] + Math.log(i);
  return logs[n];
}
export function laguerre(k, alpha, x) {
  if (!k) return 1;
  let a = 1, b = 1 + alpha - x;
  for (let j = 2; j <= k; j++) [a, b] = [b, ((2 * j - 1 + alpha - x) * b - (j - 1 + alpha) * a) / j];
  return b;
}
export function radialLogNorm(n, l) {
  return 1.5 * Math.log(2 / n) + 0.5 * (logFactorial(n - l - 1) - Math.log(2 * n) - logFactorial(n + l));
}
export function radial(n, l, r) {
  if (r === 0 && l) return 0;
  const x = 2 * r / n;
  return Math.exp(radialLogNorm(n, l) - r / n + (l ? l * Math.log(x) : 0)) * laguerre(n - l - 1, 2 * l + 1, x);
}
export function angular(l, m, theta, phi) {
  const am = Math.abs(m), x = Math.cos(theta);
  let p = 1;
  for (let j = 1; j <= am; j++) p *= -(2 * j - 1) * Math.sin(theta);
  if (l > am) {
    let b = (2 * am + 1) * x * p;
    for (let j = am + 2; j <= l; j++) [p, b] = [b, ((2 * j - 1) * x * b - (j + am - 1) * p) / (j - am)];
    p = b;
  }
  const norm = Math.exp(0.5 * (Math.log((2 * l + 1) / (4 * Math.PI)) + logFactorial(l - am) - logFactorial(l + am)));
  const re = norm * p * Math.cos(am * phi), im = norm * p * Math.sin(am * phi);
  return m < 0 ? [(-1) ** am * re, -((-1) ** am) * im] : [re, im];
}
export function circularLogNorm(n) {
  const l = n - 1;
  return radialLogNorm(n, l) + 0.5 * (Math.log((2 * l + 1) / (4 * Math.PI)) + logFactorial(2 * l)) - l * Math.log(2) - logFactorial(l);
}
export function eigenstate({ n, l, m }, x, y, z) {
  const r = Math.hypot(x, y, z);
  if (l === n - 1 && m === l) {
    const s = Math.hypot(x, y);
    if (!s && l) return [0, 0];
    const a = (-1) ** l * Math.exp(circularLogNorm(n) - r / n + (l ? l * Math.log(2 * s / n) : 0));
    const phi = Math.atan2(y, x);
    return [a * Math.cos(m * phi), a * Math.sin(m * phi)];
  }
  const yy = angular(l, m, r ? Math.acos(Math.max(-1, Math.min(1, z / r))) : 0, Math.atan2(y, x));
  const rr = radial(n, l, r);
  return [rr * yy[0], rr * yy[1]];
}
export const energy = n => -1 / (2 * n * n);
export const solverTime = (seconds, mode = 'revival') => seconds * (mode === 'revival' ? TCL / 10 : 24);
export function normalize(states) {
  const n = Math.sqrt(states.reduce((s, j) => s + j.c_real ** 2 + j.c_imag ** 2, 0));
  return states.map(j => ({ ...j, c_real: j.c_real / n, c_imag: j.c_imag / n }));
}
export const REVIVAL = normalize(Array.from({ length: 13 }, (_, i) => ({ n: i + 24, l: i + 23, m: i + 23, c_real: Math.exp(-((i - 6) ** 2) / 9), c_imag: 0 })));
export const SPECTRAL = normalize([2, 3, 4, 5].map(n => ({ n, l: n === 2 ? 1 : 0, m: 0, c_real: 0.5, c_imag: 0 })));
export const statesFor = mode => mode === 'spectral' ? SPECTRAL : REVIVAL;
export const domainFor = mode => mode === 'spectral' ? 85 : 1700;
export const scaleFor = mode => mode === 'spectral' ? 25 * A0 : 900 * A0;
// Remove only the common global phase. Differences retain the full E_n spectrum.
export function phases(states, t) {
  const reference = energy(states[0].n);
  return states.map(j => {
    const p = (-(energy(j.n) - reference) * t) % TAU, a = Math.cos(p), b = Math.sin(p);
    return [j.c_real * a - j.c_imag * b, j.c_real * b + j.c_imag * a];
  });
}
export function wavefunction(states, x, y, z, t) {
  const cc = phases(states, t);
  let re = 0, im = 0;
  for (let i = 0; i < states.length; i++) {
    const [a, b] = eigenstate(states[i], x, y, z), [c, d] = cc[i];
    re += a * c - b * d; im += a * d + b * c;
  }
  return { re, im, rho: re * re + im * im };
}
export function autocorrelation(states, t, rotation = 0) {
  const reference = energy(states[0].n);
  let a = 0, b = 0;
  for (const j of states) {
    const phase = (-(energy(j.n) - reference) * t - j.m * rotation) % TAU;
    const p = j.c_real ** 2 + j.c_imag ** 2;
    a += p * Math.cos(phase); b += p * Math.sin(phase);
  }
  return a * a + b * b;
}
export function shapeFidelity(states, t, samples = 1024) {
  let fidelity = 0, rotation = 0;
  for (let i = 0; i < samples; i++) {
    const angle = TAU * i / samples, f = autocorrelation(states, t, angle);
    if (f > fidelity) { fidelity = f; rotation = angle; }
  }
  return { fidelity, rotation, angularResolutionRad: TAU / samples };
}
export function wavelength(a, b) {
  return H * C / (Math.abs(energy(a) - energy(b)) * EH) * 1e9;
}
export function parseCIE(csv) { return csv.trim().split(/\r?\n/).map(line => line.split(',').map(Number)); }
export function wavelengthRGB(nm, cie) {
  if (nm < 380 || nm > 780) return null;
  const i = Math.floor(nm) - cie[0][0], f = nm - Math.floor(nm);
  const xyz = [1, 2, 3].map(k => cie[i][k] * (1 - f) + cie[i + 1][k] * f);
  const [x, y, z] = xyz;
  const rgb = [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z].map(v => Math.max(0, v));
  const peak = Math.max(...rgb);
  return rgb.map(v => v / peak);
}
export function spectralPairs(states, cie) {
  const pairs = [];
  for (let a = 0; a < states.length; a++) for (let b = a + 1; b < states.length; b++) {
    const nm = wavelength(states[a].n, states[b].n);
    pairs.push({ a, b, wavelengthNm: nm, linearRGB: wavelengthRGB(nm, cie), band: nm < 380 ? 'ultraviolet' : nm > 780 ? 'infrared' : 'visible' });
  }
  return pairs;
}
// Diagnostic spatial cut, evaluated from psi rather than a decorative cloud count.
export function ringProfile(seconds, count = 720) {
  const r = 900, t = solverTime(seconds);
  const values = Array.from({ length: count }, (_, i) => wavefunction(REVIVAL, r * Math.cos(TAU * i / count), r * Math.sin(TAU * i / count), 0, t).rho);
  const maximum = Math.max(...values);
  const peaks = [];
  for (let i = 0; i < count; i++) if (values[i] > maximum * 0.22 && values[i] > values[(i + count - 1) % count] && values[i] >= values[(i + 1) % count]) peaks.push({ azimuthRad: TAU * i / count, relativeDensity: values[i] / maximum });
  return { values, peaks, radiusA0: r, threshold: 0.22 };
}
