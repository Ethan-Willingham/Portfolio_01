#!/usr/bin/env node
// build-undermap-data.mjs
// Turns the private staged pulls in research/under-street/staged/ into the
// slim, quantized assets/map/*.json the canvas renderer loads. Points are
// processed in-node (slim props + round coords); lines/polygons go through
// mapshaper for simplification. Idempotent; safe to re-run.
//
//   node tools/build-undermap-data.mjs [layer ...]   (default: all)
//
// Staged data is gitignored, so this only runs on a checkout that has it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = ROOT + 'research/under-street/staged/';
const OUT = ROOT + 'assets/map/';
const only = process.argv.slice(2);
const want = name => only.length === 0 || only.includes(name);

if (!existsSync(SRC + 'hydrants.geojson')) {
  console.error('No staged data at', SRC, '- this build needs research/under-street/staged/ (gitignored).');
  process.exit(1);
}

const rd = f => JSON.parse(readFileSync(SRC + f));
const q = (n, d = 5) => Math.round(n * 10 ** d) / 10 ** d;
const qpt = c => [q(c[0]), q(c[1])];
function writeFC(name, feats) {
  writeFileSync(OUT + name, '{"type":"FeatureCollection","features":[\n' +
    feats.map(f => JSON.stringify(f)).join(',\n') + '\n]}');
  const kb = (Buffer.byteLength(feats.map(f => JSON.stringify(f)).join(',')) / 1024).toFixed(0);
  console.log('  ->', name, feats.length, 'features,', kb + 'KB');
}
// point layer: map each feature's props, round coords, drop off-geometry
function points(inFile, outFile, mapProps, filter) {
  const gj = rd(inFile);
  const out = [];
  for (const f of gj.features) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    if (filter && !filter(f.properties || {})) continue;
    out.push({ type: 'Feature', properties: mapProps(f.properties || {}), geometry: { type: 'Point', coordinates: qpt(f.geometry.coordinates) } });
  }
  writeFC(outFile, out);
}
// vector layer via mapshaper: simplify + set precision, then re-slim props in node
function vector(inFile, outFile, { simplify = 15, precision = 0.00001, mapProps = () => ({}), filter, allowLines = true } = {}) {
  const tmp = OUT + '.tmp-' + outFile;
  const s = simplify ? `-simplify ${simplify}% keep-shapes ` : '';
  execSync(`npx --yes mapshaper "${SRC + inFile}" ${s}-o "${tmp}" format=geojson precision=${precision}`, { stdio: ['ignore', 'ignore', 'inherit'] });
  const gj = JSON.parse(readFileSync(tmp));
  execSync(`rm -f "${tmp}"`);
  const out = [];
  for (const f of gj.features) {
    if (!f.geometry) continue;
    if (filter && !filter(f.properties || {})) continue;
    out.push({ type: 'Feature', properties: mapProps(f.properties || {}), geometry: f.geometry });
  }
  writeFC(outFile, out);
}

// ---------------- POINTS ----------------
// hydrants: location is the payload (BuryDepth null everywhere); keep install yr
if (want('hydrants')) { console.log('hydrants'); points('hydrants.geojson', 'hydrants.json',
  p => (p.yr ? { yr: p.yr } : {})); }

// water towers: named where OSM has it
if (want('watertowers')) { console.log('watertowers'); points('watertowers.geojson', 'watertowers.json',
  p => (p.name ? { name: p.name } : {})); }

// dams + locks: keep names; the river locks come tagged only "Mississippi
// River", which reads wrong on a marker, so relabel those.
if (want('damslocks')) { console.log('damslocks'); points('damslocks.geojson', 'damslocks.json',
  p => {
    var nm = p.name || (p.lock === 'yes' ? 'Lock' : 'Dam');
    if (nm === 'Mississippi River') nm = p.lock === 'yes' ? 'Lock and dam (Mississippi)' : 'Dam on the Mississippi';
    return { name: nm, lock: p.lock === 'yes' ? 1 : 0 };
  }); }

// telephone exchanges
if (want('exchanges')) { console.log('exchanges'); points('exchanges.geojson', 'exchanges.json',
  p => ({ name: p.name || 'Telephone exchange', addr: [p['addr:housenumber'], p['addr:street']].filter(Boolean).join(' ') || undefined })); }

// MCES flow meters on the interceptors
if (want('meters')) { console.log('meters'); points('mces-meters.geojson', 'meters.json',
  p => ({ i: p.Intercepto || undefined, s: (p.FeatureSta || '').toLowerCase() === 'active' ? 1 : 0 })); }

// depth-to-bedrock grid (median ft per ~300m cell)
if (want('bedrockdepth')) { console.log('bedrockdepth'); points('bedrock-depth-grid.geojson', 'bedrockdepth.json',
  p => ({ ft: p.ft }), p => p.ft != null); }

// decimated well sample (drill depth + aquifer)
if (want('wells')) { console.log('wells'); points('wells-sample.geojson', 'wells.json',
  p => ({ d: p.depth || undefined, a: p.aq || undefined })); }

// pipeline gate/valve stations
if (want('pipestations')) { console.log('pipestations'); points('pipeline-stations.geojson', 'pipestations.json',
  p => ({ name: p.name || undefined, op: p.operator || undefined })); }

// ---------------- LINES / POLYGONS ----------------
// pipelines: bucket substance -> g (gas), s (steam), o (other named); drop the
// 289 no-substance/no-operator unknowns as map noise (kept in staged/raw).
if (want('pipelines')) {
  console.log('pipelines');
  const gj = rd('pipelines.geojson');
  const out = [];
  for (const f of gj.features) {
    const p = f.properties || {};
    const sub = (p.substance || '').toLowerCase();
    let code = null;
    if (/gas/.test(sub)) code = 'g';
    else if (sub === 'steam') code = 's';
    else if (sub) code = 'o';
    else continue; // unknown + no substance -> skip
    const g = f.geometry;
    if (!g) continue;
    const coords = g.type === 'LineString' ? g.coordinates.map(qpt) : g.coordinates.map(l => l.map(qpt));
    out.push({ type: 'Feature', properties: { k: code, op: p.operator || undefined }, geometry: { type: g.type, coordinates: coords } });
  }
  writeFC('pipelines.json', out);
}

// buried streams: DNR watercourses typed underground; keep name + type
if (want('streamsug')) { console.log('streamsug'); vector('streams-underground.geojson', 'streamsug.json',
  { simplify: 30, mapProps: p => ({ name: p.name || undefined, t: p.t }) }); }

// pavement condition: only the PCI-scored segments (the rest just duplicate
// roads.json); simplify hard. Cuts ~12k segs to the ~3.5k that carry a score.
if (want('pavement')) { console.log('pavement'); vector('pavement.geojson', 'pavement.json',
  { simplify: 12, filter: p => p.pci != null, mapProps: p => ({ pci: p.pci }) }); }

// bedrock geology polygons: simplify HARD (8MB source). MAPLABEL = unit code
// (e.g. "Osp" St. Peter, "Op" Platteville); DESCRIPTN = the plain description.
if (want('bedrock')) { console.log('bedrock'); vector('bedrock-paleozoic.geojson', 'bedrock.json',
  { simplify: 4, mapProps: p => ({ u: p.MAPLABEL || undefined, d: p.DESCRIPTN || undefined }) }); }

// bedrock faults
if (want('bedrockfaults')) { console.log('bedrockfaults'); vector('bedrock-faults.geojson', 'bedrockfaults.json',
  { simplify: 20, mapProps: () => ({}) }); }

console.log('done.');
