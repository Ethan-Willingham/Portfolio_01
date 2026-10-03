// Pure numerical reference and the single configuration used by both hosts.
export const CONFIG = Object.freeze({
  grid: 256, side: 64, g: 2, bulkDensity: 1, chemicalPotential: 2,
  radiusX: 24, radiusY: 17, wallWidth: 0.8, wallHeight: 12,
  dt: 0.01, preparationDt: 0.04, preparationSteps: 1600,
  paddleAmplitude: 10, paddleSigmaX: 7.5, paddleSigmaY: 0.55,
  paddleX: 24, paddleStartY: 22, paddleSpeed: 0.5,
  stirStart: 12, sweepDuration: 44, withdrawalDuration: 16,
  phraseDuration: 540, solverUnitsPerSecond: 0.75,
  damping: 0, detectionRadius: 0.89, detectionDensity: 0.08,
  clusterLink: 7, clusterMinimum: 4, clusterCorrelation: 0.55,
});
export const DEFAULT_SEED = '180106951';
export const healingLength = p => 1 / Math.sqrt(2 * p.g * p.bulkDensity);
export function trap(x, y, p) {
  const r = Math.hypot(x / p.radiusX, y / p.radiusY);
  return p.wallHeight * (1 + Math.tanh((r - 1) * p.radiusY / p.wallWidth)) / 2;
}
export function protocol(t, p = CONFIG) {
  const u = t % p.phraseDuration;
  if (u < p.stirStart) return { amplitude: 0, y: p.paddleStartY, phase: 'Quiet field' };
  const s = u - p.stirStart;
  const fade = Math.min(1, s / 4) * Math.max(0, Math.min(1, (p.sweepDuration + p.withdrawalDuration - s) / p.withdrawalDuration));
  return {
    amplitude: p.paddleAmplitude * fade,
    y: p.paddleStartY - p.paddleSpeed * Math.min(s, p.sweepDuration),
    phase: s < p.sweepDuration ? 'Stirring' : s < p.sweepDuration + p.withdrawalDuration ? 'Withdrawing' : u < 180 ? 'Turbulent relaxation' : 'Free evolution',
  };
}
export function potential(x, y, t, p) {
  const f = protocol(t, p), yy = (y - f.y) / p.paddleSigmaY;
  return trap(x, y, p) + f.amplitude * (
    Math.exp(-0.5 * (((x - p.paddleX) / p.paddleSigmaX) ** 2 + yy * yy)) +
    Math.exp(-0.5 * (((x + p.paddleX) / p.paddleSigmaX) ** 2 + yy * yy)));
}
export function seeded(seed) {
  let a = 2166136261;
  for (const c of seed) a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  return () => { a += 0x6d2b79f5; let v = Math.imul(a ^ a >>> 15, 1 | a); v ^= v + Math.imul(v ^ v >>> 7, 61 | v); return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}
export function initialField(p = CONFIG, seed = DEFAULT_SEED, vortices = []) {
  const n = p.grid, dx = p.side / n, out = new Float32Array(n * n * 2);
  const random = seeded(seed), phaseOffset = random() * 2 * Math.PI;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i - n / 2) * dx, y = (j - n / 2) * dx;
    let amp = Math.sqrt(Math.max(0, (p.chemicalPotential - trap(x, y, p)) / p.g)), phase = phaseOffset;
    for (const v of vortices) {
      const r = Math.hypot(x - v.x, y - v.y);
      amp *= r / Math.sqrt(r * r + 2 * healingLength(p) ** 2);
      phase += v.sign * Math.atan2(y - v.y, x - v.x);
    }
    const k = 2 * (j * n + i); out[k] = amp * Math.cos(phase); out[k + 1] = amp * Math.sin(phase);
  }
  return out;
}
// Forward: exp(-2 pi i jk/n). Inverse: exp(+2 pi i jk/n)/n per axis.
export function fft1(a, inverse = false) {
  const n = a.length / 2;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) for (let c = 0; c < 2; c++) { const v = a[2 * i + c]; a[2 * i + c] = a[2 * j + c]; a[2 * j + c] = v; }
  }
  for (let m = 2; m <= n; m *= 2) for (let start = 0; start < n; start += m) for (let j = 0; j < m / 2; j++) {
    const angle = (inverse ? 2 : -2) * Math.PI * j / m, c = Math.cos(angle), s = Math.sin(angle);
    const u = 2 * (start + j), v = 2 * (start + j + m / 2);
    const re = a[v] * c - a[v + 1] * s, im = a[v] * s + a[v + 1] * c;
    a[v] = a[u] - re; a[v + 1] = a[u + 1] - im; a[u] += re; a[u + 1] += im;
  }
  if (inverse) for (let i = 0; i < a.length; i++) a[i] /= n;
  return a;
}
export function fft2(a, n, inverse = false) {
  const line = new Float64Array(2 * n);
  for (let axis = 0; axis < 2; axis++) for (let row = 0; row < n; row++) {
    for (let j = 0; j < n; j++) { const k = 2 * (axis ? j * n + row : row * n + j); line[2 * j] = a[k]; line[2 * j + 1] = a[k + 1]; }
    fft1(line, inverse);
    for (let j = 0; j < n; j++) { const k = 2 * (axis ? j * n + row : row * n + j); a[k] = line[2 * j]; a[k + 1] = line[2 * j + 1]; }
  }
  return a;
}
export function cpuStep(a, p, time = 0, imaginary = false) {
  const n = p.grid, dx = p.side / n, dt = imaginary ? p.preparationDt : p.dt;
  const half = () => {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = 2 * (j * n + i), re = a[k], im = a[k + 1];
      const v = (imaginary ? trap((i - n / 2) * dx, (j - n / 2) * dx, p) : potential((i - n / 2) * dx, (j - n / 2) * dx, time + dt / 2, p)) + p.g * (re * re + im * im);
      const angle = -v * dt / 2, decay = imaginary ? Math.exp(-(v - p.chemicalPotential) * dt / 2) : Math.exp(-p.damping * dt / 2);
      a[k] = decay * (imaginary ? re : re * Math.cos(angle) - im * Math.sin(angle));
      a[k + 1] = decay * (imaginary ? im : re * Math.sin(angle) + im * Math.cos(angle));
    }
  };
  half(); fft2(a, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k2 = (2 * Math.PI / p.side) ** 2 * ((i < n / 2 ? i : i - n) ** 2 + (j < n / 2 ? j : j - n) ** 2);
    const k = 2 * (j * n + i), re = a[k], im = a[k + 1], angle = -k2 * dt / 2;
    a[k] = imaginary ? re * Math.exp(angle) : re * Math.cos(angle) - im * Math.sin(angle);
    a[k + 1] = imaginary ? im * Math.exp(angle) : re * Math.sin(angle) + im * Math.cos(angle);
  }
  fft2(a, n, true); half(); return a;
}
export const wrapped = a => Math.atan2(Math.sin(a), Math.cos(a));
export function detectVortices(a, p) {
  const n = p.grid, dx = p.side / n, phase = new Float64Array(n * n), rho = new Float64Array(n * n), candidates = [];
  const ring = Math.max(2, Math.ceil(2 * healingLength(p) / dx));
  for (let k = 0; k < phase.length; k++) { phase[k] = Math.atan2(a[2 * k + 1], a[2 * k]); rho[k] = a[2 * k] ** 2 + a[2 * k + 1] ** 2; }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const x = (i + 0.5 - n / 2) * dx, y = (j + 0.5 - n / 2) * dx;
    if (Math.hypot(x / p.radiusX, y / p.radiusY) > p.detectionRadius) continue;
    const ids = [j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i];
    let w = 0; for (let c = 0; c < 4; c++) w += wrapped(phase[ids[(c + 1) % 4]] - phase[ids[c]]);
    if (Math.abs(w) > 1.5 * Math.PI) {
      // Density vanishes inside a resolved core. Gate on its surrounding fluid.
      let surrounding = 0;
      for (const [ox, oy] of [[ring,0],[-ring,0],[0,ring],[0,-ring],[ring,ring],[-ring,ring],[ring,-ring],[-ring,-ring]]) {
        surrounding += rho[Math.max(0, Math.min(n - 1, j + oy)) * n + Math.max(0, Math.min(n - 1, i + ox))];
      }
      if (surrounding / 8 >= p.detectionDensity) candidates.push({ x, y, sign: Math.sign(w) });
    }
  }
  // Merge only immediately adjacent detections with the same circulation.
  const out = [];
  for (const c of candidates) { const old = out.find(v => v.sign === c.sign && Math.hypot(c.x - v.x, c.y - v.y) < 1.1 * dx); if (!old) out.push(c); }
  return out;
}
export function organization(v, p) {
  let correlation = 0; const links = v.map(() => []);
  const nearestOpposite = v.map(a => Math.min(Infinity, ...v.filter(b => b.sign !== a.sign).map(b => Math.hypot(b.x - a.x, b.y - a.y))));
  for (let i = 0; i < v.length; i++) {
    const nn = v.map((w, j) => ({ j, d: Math.hypot(w.x - v[i].x, w.y - v[i].y) })).filter(w => w.j !== i).sort((a, b) => a.d - b.d);
    for (const w of nn.slice(0, 2)) correlation += v[i].sign * v[w.j].sign;
    for (const w of nn) if (v[i].sign === v[w.j].sign && w.d < p.clusterLink && w.d < Math.min(nearestOpposite[i], nearestOpposite[w.j])) links[i].push(w.j);
  }
  const seen = new Set(), sizes = [];
  for (let i = 0; i < v.length; i++) if (!seen.has(i)) { const stack = [i]; let count = 0; while (stack.length) { const k = stack.pop(); if (seen.has(k)) continue; seen.add(k); count++; stack.push(...links[k]); } sizes.push(count); }
  const c2 = v.length > 2 ? correlation / (2 * v.length) : null;
  return { c2, componentSizes: sizes.sort((a, b) => b - a), largestCluster: Math.max(0, ...sizes), clustered: Math.max(0, ...sizes) >= p.clusterMinimum && c2 >= p.clusterCorrelation };
}
export function measure(a, p, time = 0) {
  for (const value of a) if (!Number.isFinite(value)) throw new Error('Nonfinite condensate field; numerical diagnostics are invalid.');
  const n = p.grid, dx2 = (p.side / n) ** 2; let norm = 0, interaction = 0, external = 0, edgeNorm = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = 2 * (j * n + i), rho = a[k] ** 2 + a[k + 1] ** 2;
    norm += rho; interaction += 0.5 * p.g * rho * rho;
    external += potential((i - n / 2) * p.side / n, (j - n / 2) * p.side / n, time, p) * rho;
    if (i < 4 || j < 4 || i >= n - 4 || j >= n - 4) edgeNorm += rho;
  }
  const ft = fft2(Float64Array.from(a), n); let kinetic = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = 2 * (j * n + i), k2 = (2 * Math.PI / p.side) ** 2 * ((i < n / 2 ? i : i - n) ** 2 + (j < n / 2 ? j : j - n) ** 2); kinetic += 0.5 * k2 * (ft[k] ** 2 + ft[k + 1] ** 2) / (n * n); }
  const vortices = detectVortices(a, p), org = organization(vortices, p);
  return { norm: norm * dx2, energy: (kinetic + interaction + external) * dx2,
    kinetic: kinetic * dx2, interaction: interaction * dx2, potential: external * dx2,
    edgeNormFraction: edgeNorm / norm, positive: vortices.filter(v => v.sign > 0).length,
    negative: vortices.filter(v => v.sign < 0).length, circulation: vortices.reduce((s, v) => s + v.sign, 0),
    circulationUnits: 'quanta of 2 pi in the detected region',
    vortices, ...org };
}
export function suspectedAnnihilations(before, after, maxDistance = 3) {
  const gone = before.filter(v => !after.some(w => w.sign === v.sign && Math.hypot(v.x - w.x, v.y - w.y) < maxDistance));
  const used = new Set(); let pairs = 0;
  for (let i = 0; i < gone.length; i++) if (!used.has(i)) { const j = gone.findIndex((w, j) => j > i && !used.has(j) && w.sign !== gone[i].sign && Math.hypot(w.x - gone[i].x, w.y - gone[i].y) < maxDistance); if (j >= 0) { used.add(i); used.add(j); pairs++; } }
  return pairs;
}
