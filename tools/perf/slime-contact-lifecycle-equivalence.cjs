// Exact contact-cache lifetime regression, including dense fallback and changing topology.
// Run from any directory; the reference is pinned to v28.171. No timing or browser.
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const file = 'js/sluice/340-jello.js';
const ref = process.env.BASE_REF || '4219c6f6c5e2bf86316d5e14ac156720f0184598';

function engine(source, stats) {
  const overflowCount = stats
    ? 'jelloContactCandidates.reduce(function (a, c) { return a + (c && c.overflow ? 1 : 0); }, 0)'
    : '0';
  return new Function('window', 'TILE', 'GRAVITY', source + `
    return {
      solve: jelloContactSolve,
      configure: function (self, iters) {
        JELLO_CONTACT_SELF = self; JELLO_CONTACT_ITERS = iters;
      },
      stats: function () { return ${overflowCount}; }
    };
  `)({ location: { search: '' } }, 32, 600);
}
const old = engine(cp.execFileSync('git', ['show', ref + ':' + file], {
  cwd: root, encoding: 'utf8'
}), false);
const now = engine(fs.readFileSync(path.join(root, file), 'utf8'), true);

function bodies(count, n, collapsed) {
  return Array.from({ length: count }, (_, k) => {
    const b = { n, cr: 2.5, selfMin2: 100, _cHits: 0, sleeping: false, _solve: true };
    for (const key of ['px', 'py', 'ox', 'oy', 'rx', 'ry']) b[key] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      b.rx[i] = (i % 17) * 5; b.ry[i] = Math.floor(i / 17) * 5;
      b.px[i] = b.ox[i] = collapsed ? 3 + (i % 17) * .023 + k * .031 : (i % 17) * 4 + k * 5;
      b.py[i] = b.oy[i] = collapsed ? 3 + Math.floor(i / 17) * .027 + k * .01 : Math.floor(i / 17) * 4;
    }
    return b;
  });
}

let comparisons = 0, overflow = 0;
for (const [count, n, collapsed] of [[3, 128, true], [3, 289, false], [4, 289, false], [2, 24, false]]) {
  const a = bodies(count, n, collapsed), b = structuredClone(a);
  for (let step = 0; step < 24; step++) {
    for (const set of [a, b]) {
      if (step === 2) set.reverse();
      if (step === 3) set[set.length - 1].n = 1;
      if (step === 4) set[set.length - 1].n = n;
      if (step === 5) set[0]._phaseMate = set[1];
      if (step === 6) set[0]._phaseMate = null;
      if (step === 7) {
        set[0].rx = set[0].rx.slice(); set[0].ry = set[0].ry.slice();
        set[0].px = set[0].px.slice();
      }
      if (step === 8 || step === 9) {
        set[0]._restDirty = true; set[0].rx[0] += 51; set[0].ry[1] -= 30;
      }
      if (step === 10) {
        set[0]._restDirty = false;
        set[0]._contactRestVersion = (set[0]._contactRestVersion || 0) + 1;
      }
      if (step === 11) set[0].selfMin2 = 1;
      if (step === 12) set[0].selfMin2 = 1e8;
      if (step === 14) set[0].n = 0;
      if (step === 15) set[0].n = n;
      for (let k = 0; k < set.length; k++) {
        set[k].cr = 1.5 + (step + k) % 5;
        if (step % 3 === 0) for (let i = 0; i < set[k].n; i++) {
          set[k].px[i] += .71; set[k].ox[i] += .71;
        }
      }
    }
    const self = step % 3 !== 1, iters = 1 + step % 3, cell = [5, 7.5, 11, 32][step % 4];
    old.configure(self, iters); now.configure(self, iters);
    assert.equal(now.solve(b, b.length, cell), old.solve(a, a.length, cell), 'contacts ' + [count, n, step]);
    for (let k = 0; k < a.length; k++) {
      for (const key of ['px', 'py', 'ox', 'oy']) {
        assert.deepEqual(new Uint8Array(a[k][key].buffer), new Uint8Array(b[k][key].buffer),
          key + ' ' + [count, n, step, k]);
      }
      for (const key of ['_cHits', 'sleeping', '_solve', '_plyMs']) assert.equal(a[k][key], b[k][key]);
    }
    overflow = Math.max(overflow, now.stats()); comparisons++;
    if (step === 16) {
      assert.equal(old.solve([], 0, cell), now.solve([], 0, cell)); comparisons++;
    }
  }
}
assert(overflow > 0, 'Exercise actual bounded overflow fallback');
console.log('PASS', comparisons, 'lifecycle solves; max overflow entries', overflow,
  '; exact buffers/contact state through sparse/dense, rest dirty/version/replacement, order/count, phase, self, radius and cell-size changes.');
