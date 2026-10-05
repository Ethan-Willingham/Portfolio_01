#!/usr/bin/env node
'use strict';
// Rebuild only the measured-star binary and provenance manifest. No dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PIN = 'c7f7f883fe678cc7680169a50ccd7dcc49b060ce';
const SOURCE_URL = `https://raw.githubusercontent.com/astronexus/HYG-Database/${PIN}/hyg/CURRENT/hygdata_v41.csv`;
const SOURCE_SHA256 = 'd9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd';
const ROOT = path.resolve(__dirname, '..');
const MAGNITUDE_LIMIT = 6, HEADER_BYTES = 32, RECORD_BYTES = 24;
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

function* csvRows(text) {
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || !field) quoted = !quoted;
      else throw new Error('Unexpected CSV quote');
    } else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.length > 1 || row[0]) yield row;
      row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length) { row.push(field); yield row; }
}

function finite(value, name) {
  if (value === '' || !Number.isFinite(Number(value))) throw new Error(`Invalid source ${name}`);
  return Number(value);
}
function int16(value, name) {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < -32768 || rounded > 32766)
    throw new Error(`Out-of-range ${name}`);
  return rounded;
}
function gaussian(wavelength, center, left, right) {
  const t = (wavelength - center) * (wavelength < center ? left : right);
  return Math.exp(-0.5 * t * t);
}
function colorBytes(bv) {
  if (bv === null) return [255, 255, 255];
  // Ballesteros (2012), equation 14. Preserve the raw catalog B-V separately.
  const ci = Math.min(2, Math.max(-0.4, bv));
  const temperature = 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62));
  const xyz = [0, 0, 0];
  for (let nm = 380; nm <= 780; nm += 5) {
    // Planck's second radiation constant in nm K; common prefactor cancels.
    const power = 1 / (Math.pow(nm, 5) * Math.expm1(14387768.77 / (nm * temperature)));
    // Wyman, Sloan and Shirley (2013), equation 4 and table 1, CIE 1931 fit.
    xyz[0] += power * (0.362 * gaussian(nm, 442, 0.0624, 0.0374) +
      1.056 * gaussian(nm, 599.8, 0.0264, 0.0323) - 0.065 * gaussian(nm, 501.1, 0.0490, 0.0382));
    xyz[1] += power * (0.821 * gaussian(nm, 568.8, 0.0213, 0.0247) +
      0.286 * gaussian(nm, 530.9, 0.0613, 0.0322));
    xyz[2] += power * (1.217 * gaussian(nm, 437, 0.0845, 0.0278) +
      0.681 * gaussian(nm, 459, 0.0385, 0.0725));
  }
  const [x, y, z] = xyz;
  const rgb = [3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.2040 * y + 1.0570 * z];
  const peak = Math.max(...rgb);
  return rgb.map(channel => {
    const linear = Math.min(1, Math.max(0, channel / peak));
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  });
}

function buildCatalog(csv) {
  const iterator = csvRows(csv), header = iterator.next().value;
  if (!header) throw new Error('Missing source header');
  const required = ['id', 'hip', 'proper', 'rarad', 'decrad', 'pmra', 'pmdec', 'mag', 'ci'];
  for (const field of required) if (!header.includes(field)) throw new Error(`Missing source field ${field}`);
  let sourceCount = 0;
  const stars = [], ids = new Set();
  for (const fields of iterator) {
    sourceCount++;
    if (fields.length !== header.length) throw new Error('Source CSV field count mismatch');
    const row = Object.fromEntries(header.map((key, i) => [key, fields[i]]));
    if (row.id === '0' || row.mag === '') continue; // HYG's Sun is not a background star.
    const magnitude = finite(row.mag, 'magnitude');
    if (magnitude > MAGNITUDE_LIMIT) continue;
    const id = finite(row.id, 'id'), ra = finite(row.rarad, 'RA'), dec = finite(row.decrad, 'declination');
    if (!Number.isSafeInteger(id) || id < 1 || id > 0xffffffff || ids.has(id) ||
      ra < 0 || ra >= Math.PI * 2 || Math.abs(dec) > Math.PI / 2 || magnitude < -2)
      throw new Error('Invalid or duplicate source star');
    ids.add(id);
    stars.push({ id, hip: row.hip ? Number(row.hip) : null, name: row.proper || null, ra, dec,
      pmRa: row.pmra ? finite(row.pmra, 'proper motion RA') : 0,
      pmDec: row.pmdec ? finite(row.pmdec, 'proper motion declination') : 0,
      magnitude, bv: row.ci ? finite(row.ci, 'B-V') : null });
  }
  stars.sort((a, b) => a.magnitude - b.magnitude || a.id - b.id);
  const binary = Buffer.alloc(HEADER_BYTES + stars.length * RECORD_BYTES);
  binary.write('GLBSTAR1', 0, 'ascii'); binary.writeUInt32LE(stars.length, 8);
  binary.writeUInt16LE(RECORD_BYTES, 12); binary.writeUInt16LE(1, 14);
  binary.writeDoubleLE(2451545, 16); binary.writeFloatLE(MAGNITUDE_LIMIT, 24);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i], at = HEADER_BYTES + i * RECORD_BYTES, rgb = colorBytes(s.bv);
    binary.writeUInt32LE(s.id, at); binary.writeFloatLE(s.ra, at + 4); binary.writeFloatLE(s.dec, at + 8);
    binary.writeInt16LE(int16(s.pmRa, 'proper motion RA'), at + 12);
    binary.writeInt16LE(int16(s.pmDec, 'proper motion declination'), at + 14);
    binary.writeInt16LE(int16(s.magnitude * 1000, 'magnitude'), at + 16);
    binary.writeInt16LE(s.bv === null ? 32767 : int16(s.bv * 1000, 'B-V'), at + 18);
    for (let channel = 0; channel < 3; channel++) binary[at + 20 + channel] = rgb[channel];
    binary[at + 23] = s.bv === null ? 1 : 0;
  }
  const sampleNames = new Set(['Sirius', 'Canopus', 'Vega', 'Betelgeuse', 'Polaris']);
  const samples = stars.filter(s => sampleNames.has(s.name) || s.hip === 104214 || s.hip === 104217);
  const manifest = {
    schema: 1, title: 'HYG 4.1 bright-star subset for Daylight Globe',
    attribution: 'HYG Database v4.1, David Nash / Astronexus',
    license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source: { url: SOURCE_URL, repository: 'https://github.com/astronexus/HYG-Database',
      commit: PIN, sha256: SOURCE_SHA256, rows: sourceCount,
      documentation: `https://github.com/astronexus/HYG-Database/blob/${PIN}/hyg/README.md`,
      license: `https://github.com/astronexus/HYG-Database/blob/${PIN}/LICENSE` },
    derivation: 'Exclude HYG id 0 (Sun); retain every star with apparent visual magnitude <= 6.0; sort by magnitude then HYG id; quantize positions, photometry and proper motions; derive display RGB from measured B-V.',
    frame: 'Mean equatorial J2000.0, epoch and equinox 2000.0. Hipparcos-derived ICRS directions are treated as J2000 mean equatorial directions at this display scale.',
    fields: { id: 'HYG id', ra: 'rarad, radians', dec: 'decrad, radians',
      pmRa: 'pmra, mu_alpha*cos(delta), milliarcseconds/year', pmDec: 'pmdec, milliarcseconds/year',
      magnitude: 'mag, apparent visual magnitude', colorIndex: 'ci, measured B-V' },
    file: 'stars-hyg-v41.bin', sha256: sha256(binary), bytes: binary.length,
    count: stars.length, magnitudeLimit: MAGNITUDE_LIMIT,
    missingColorIndices: stars.filter(s => s.bv === null).length,
    records: { endian: 'little', headerBytes: HEADER_BYTES, recordBytes: RECORD_BYTES,
      layout: ['u32 HYG id', 'f32 RA radians', 'f32 declination radians', 'i16 pmRA mas/year',
        'i16 pmDec mas/year', 'i16 visual magnitude / 1000', 'i16 B-V / 1000 (32767 missing)',
        'u8 sRGB red', 'u8 sRGB green', 'u8 sRGB blue', 'u8 flags (bit 0 = missing B-V)'] },
    color: { method: 'Ballesteros B-V temperature; Planck spectrum integrated 380-780 nm at 5 nm with Wyman CIE 1931 fits; linear sRGB, peak-normalized, sRGB encoded to 8 bits. Missing B-V gives neutral white.',
      rawColorIndexRetained: true, temperatureInputRange: [-0.4, 2],
      references: ['https://arxiv.org/html/1201.1809v2', 'https://jcgt.org/published/0002/02/01/paper.pdf'] },
    rawSourceSamples: samples
  };
  return { binary, manifest, stars };
}

async function main(args) {
  let sourcePath = null, check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) sourcePath = args[++i];
    else if (args[i] === '--check') check = true;
    else throw new Error('Usage: node tools/build-globe-stars.cjs [--source hygdata_v41.csv] [--check]');
  }
  let source;
  if (sourcePath) source = fs.readFileSync(sourcePath);
  else {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HYG source HTTP ${response.status}`);
    source = Buffer.from(await response.arrayBuffer());
  }
  if (sha256(source) !== SOURCE_SHA256) throw new Error('Pinned HYG source SHA-256 mismatch');
  const result = buildCatalog(source.toString('utf8'));
  const outputs = { 'stars-hyg-v41.bin': result.binary,
    'stars-hyg-v41.source.json': Buffer.from(JSON.stringify(result.manifest, null, 2) + '\n') };
  const outputDir = path.join(ROOT, 'assets', 'data');
  for (const [name, bytes] of Object.entries(outputs)) {
    const destination = path.join(outputDir, name);
    if (check) {
      if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(bytes))
        throw new Error(`Rebuild differs: ${name}`);
    } else { fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(destination, bytes); }
  }
  console.log(`${check ? 'Verified' : 'Built'} ${result.manifest.count} measured stars, ${result.binary.length} bytes, ${result.manifest.missingColorIndices} missing B-V`);
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildCatalog, csvRows, colorBytes, sha256, SOURCE_URL, SOURCE_SHA256 };
