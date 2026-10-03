// Exact byte-spin reference and deterministic authored preparation. No random source.
export const MODEL = 'Published two-layer Q2R, periodic four-neighbor lattice';
export const PRESET_VERSION = 2;
export const PRESETS = ['hourglass', 'rings', 'window'];
export function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width % 2 || height % 2 || width > 1024 || height > 1024) throw new RangeError('Q2R requires even dimensions from 2 to 1024.');
}
export function neighbors(i, width, height) {
  const col = i % width, row = Math.floor(i / width);
  return [row * width + (col + width - 1) % width, row * width + (col + 1) % width,
    ((row + height - 1) % height) * width + col, ((row + 1) % height) * width + col];
}
export function evolve(state, direction = 1) {
  const { width, height, x, y } = state, field = direction === 1 ? x : y, other = direction === 1 ? y : x;
  const next = new Int8Array(x.length);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const i = row * width + col;
    const sum = field[row * width + (col + width - 1) % width] + field[row * width + (col + 1) % width]
      + field[((row + height - 1) % height) * width + col] + field[((row + 1) % height) * width + col];
    next[i] = other[i] * (sum === 0 ? -1 : 1);
  }
  return direction === 1 ? { width, height, x: next, y: x } : { width, height, x: y, y: next };
}
export function energyTwice(state) {
  const { width, height, x, y } = state; let value = 0;
  for (let i = 0; i < x.length; i++) for (const j of neighbors(i, width, height)) value -= x[i] * y[j];
  return value;
}
export function pack(field, width, height) {
  const rowWords = Math.ceil(width / 32), packed = new Uint32Array(rowWords * height);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) if (field[row * width + col] === 1) packed[row * rowWords + (col >>> 5)] |= (1 << (col & 31));
  return packed;
}
export function unpack(packed, width, height) {
  const field = new Int8Array(width * height), rowWords = Math.ceil(width / 32);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) field[row * width + col] = ((packed[row * rowWords + (col >>> 5)] >>> (col & 31)) & 1) * 2 - 1;
  return field;
}
export function checksum(x, y) {
  let value = 2166136261;
  for (const field of [x, y]) for (const word of field) value = Math.imul(value ^ word, 16777619) >>> 0;
  return value.toString(16).padStart(8, '0');
}
export function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.x.length !== b.x.length || a.y.length !== b.y.length) return { exact: false, mismatches: null, comparedSpins: 0 };
  let mismatches = 0;
  for (const key of ['x', 'y']) for (let i = 0; i < a[key].length; i++) if (a[key][i] !== b[key][i]) mismatches++;
  return { exact: mismatches === 0, mismatches, comparedSpins: a.x.length + a.y.length };
}
export function motifAt(col, row, width, height, id = 'hourglass') {
  const u = (col + .5 - width / 2) / height, v = (row + .5) / height - .5;
  if (id === 'rings') return Math.abs(Math.hypot(u, v) - .25) < .047 || Math.hypot(u, v) < .075;
  if (id === 'window') return (Math.abs(u) < .25 && Math.abs(v) < .28) && (Math.abs(u) > .215 || Math.abs(v) > .245 || Math.abs(u) < .025 || Math.abs(v) < .025);
  const frame = Math.abs(u) < .245 && Math.abs(Math.abs(v) - .292) < .024;
  const glass = Math.abs(v) < .264 && Math.abs(Math.abs(u) - (.022 + .72 * Math.abs(v))) < .022;
  const sand = v > .1 && v < .245 && Math.abs(u) < (v - .09) * .7 || v < -.11 && v > -.23 && Math.abs(u) < (-v - .07) * .55;
  return frame || glass || sand || Math.abs(u) < .011 && Math.abs(v) < .12;
}
export function prepare(width = 256, height = width, id = 'hourglass') {
  dimensions(width, height); if (!PRESETS.includes(id)) throw new RangeError('Unknown authored configuration.');
  const n = width * height, base = new Int8Array(n), x = new Int8Array(n);
  const phase = PRESETS.indexOf(id) * 19;
  // A coordinate polynomial weave, explicitly constructed, not a PRNG or thermal draw.
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const i = row * width + col, weave = (col * col + 3 * row * row + 7 * col * row + 11 * col + 13 * row + phase) % 127;
    base[i] = motifAt(col, row, width, height, id) ? -1 : 1;
    x[i] = base[i] * (weave < 9 ? -1 : 1);
  }
  // Deterministic one-pass coordinate descent toward the reference energy.
  // Keep at least 75% of each 8x8 block faithful to the motif. Only preparation changes E.
  const target = Math.round(-Math.SQRT2 * n / 4) * 4, blockWidth = Math.ceil(width / 8), defects = new Uint16Array(blockWidth * Math.ceil(height / 8));
  for (let i = 0; i < n; i++) if (x[i] !== base[i]) defects[Math.floor(i / width / 8) * blockWidth + Math.floor(i % width / 8)]++;
  let energy = energyTwice({ width, height, x, y: x }) / 2;
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  let stride = width + 1; while (gcd(stride, n) !== 1) stride += 2;
  for (let k = 0; k < n; k++) {
    const i = (k * stride) % n;
    const block = Math.floor(i / width / 8) * blockWidth + Math.floor(i % width / 8), wasDefect = x[i] !== base[i];
    if (!wasDefect && defects[block] >= 16) continue;
    let sum = 0; for (const j of neighbors(i, width, height)) sum += x[j];
    const delta = 2 * x[i] * sum;
    if (Math.abs(energy + delta - target) < Math.abs(energy - target)) { x[i] *= -1; energy += delta; defects[block] += wasDefect ? -1 : 1; }
  }
  return { width, height, x, y: x.slice(), configurationId: `${id}-weave-v${PRESET_VERSION}-${width}x${height}` };
}
export function measure(state, block = 8) {
  const { width, height, x } = state, n = x.length;
  let m = 0, active = 0, boundaries = 0;
  for (let i = 0; i < n; i++) {
    m += x[i]; const ns = neighbors(i, width, height);
    if (ns.reduce((s, j) => s + x[j], 0) === 0) active++;
    if (x[i] !== x[ns[1]]) boundaries++;
    if (x[i] !== x[ns[3]]) boundaries++;
  }
  let entropy = 0, blocks = 0;
  for (let row = 0; row < height; row += block) for (let col = 0; col < width; col += block) {
    let ones = 0, count = 0;
    for (let dy = 0; dy < block && row + dy < height; dy++) for (let dx = 0; dx < block && col + dx < width; dx++) { ones += x[(row + dy) * width + col + dx] === 1; count++; }
    const p = ones / count; if (p > 0 && p < 1) entropy -= p * Math.log2(p) + (1 - p) * Math.log2(1 - p); blocks++;
  }
  const boundaryFraction = boundaries / (2 * n);
  const e2 = energyTwice(state);
  return { energyTwiceJ: e2, energyJ: e2 / 2, energyPerSite: e2 / (2 * n), magnetization: m / n, flippableFraction: active / n,
    nearestNeighborCorrelation: 1 - 2 * boundaryFraction, meanLineRunCells: boundaryFraction ? 1 / boundaryFraction : null, coarseEntropyEstimator: entropy / blocks, entropyBlockCells: block };
}
// Restore the microscopic fields of an exported replay record without a frame cache.
export function decodeReplay(record) {
  if (record.apiVersion !== 1 || record.id !== 'arrow-of-time' || ![1, PRESET_VERSION].includes(record.presetVersion)) throw new Error('Unsupported Arrow of time replay record.');
  const { width, height } = record; dimensions(width, height);
  const words = Math.ceil(width / 32) * height;
  for (const key of ['packedX', 'packedY']) if (!Array.isArray(record[key]) || record[key].length !== words || record[key].some(v => !Number.isInteger(v) || v < 0 || v > 0xffffffff)) throw new Error('Invalid packed replay field.');
  const x = Uint32Array.from(record.packedX), y = Uint32Array.from(record.packedY);
  if (record.checksum !== checksum(x, y)) throw new Error('Replay checksum differs from its fields.');
  return { width, height, x: unpack(x, width, height), y: unpack(y, width, height), direction: record.direction === -1 ? -1 : 1 };
}
