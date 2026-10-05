#!/usr/bin/env node
'use strict';

// Capture genuine NOAA grids, not a reconstruction from the rendered aurora map.
// Positional paths import previously saved, complete NOAA responses. With no paths,
// fetch the latest response and apply the same freshness limits as the live globe.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const SOURCE = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const DIRECTORY = path.resolve(__dirname, '../assets/data/aurora');
const WIDTH = 360;
const HEIGHT = 181;
const SIZE = WIDTH * HEIGHT;
const MINUTE = 60000;
const RETENTION = 30 * 86400000;
const FILE_PATTERN = /^\d{8}T\d{6}Z-\d{8}T\d{6}Z-[a-f0-9]{16}\.json\.gz$/;

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error('Invalid UTC timestamp');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error('Invalid UTC timestamp');
  }
  return date.toISOString();
}

function parseNOAA(data) {
  if (!data || !Array.isArray(data.coordinates) || data.coordinates.length !== SIZE) {
    throw new Error('Incomplete NOAA aurora grid');
  }
  const observation = timestamp(data['Observation Time']);
  const forecast = timestamp(data['Forecast Time']);
  if (forecast < observation) throw new Error('Forecast precedes observation');
  // Ordinary numbers preserve fractional source probabilities through JSON, while
  // an integer or Float32 buffer would quantize values before they reach the archive.
  const grid = new Array(SIZE).fill(0);
  const seen = new Uint8Array(SIZE);
  for (const point of data.coordinates) {
    if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
      throw new Error('Invalid NOAA aurora coordinate');
    }
    const [longitude, latitude, probability] = point;
    if (!Number.isInteger(longitude) || longitude < -180 || longitude > 360 ||
        !Number.isInteger(latitude) || latitude < -90 || latitude > 90 ||
        probability < 0 || probability > 100) {
      throw new Error('NOAA aurora coordinate out of range');
    }
    const lon = ((longitude % WIDTH) + WIDTH) % WIDTH;
    const index = (latitude + 90) * WIDTH + lon;
    if (seen[index]) throw new Error('Duplicate NOAA aurora grid point');
    seen[index] = 1;
    grid[index] = probability;
  }
  return { observation, forecast, grid };
}

function assertFresh(frame, now) {
  const observationAge = now - Date.parse(frame.observation);
  const forecastAge = now - Date.parse(frame.forecast);
  if (observationAge < -5 * MINUTE || observationAge > 180 * MINUTE ||
      forecastAge < -120 * MINUTE || forecastAge > 90 * MINUTE) {
    throw new Error('Latest NOAA aurora response is stale or implausibly future dated');
  }
}

function encodeFrame(frame) {
  const runs = [];
  for (let index = 0; index < SIZE;) {
    if (!frame.grid[index]) { index++; continue; }
    const start = index;
    const probabilities = [];
    while (index < SIZE && frame.grid[index] !== 0) probabilities.push(frame.grid[index++]);
    runs.push([start, probabilities]);
  }
  return { version: 1, observation: frame.observation, forecast: frame.forecast, runs };
}

function decodeFrame(frame) {
  if (!frame || frame.version !== 1 || !Array.isArray(frame.runs)) throw new Error('Invalid archived frame');
  const observation = timestamp(frame.observation);
  const forecast = timestamp(frame.forecast);
  if (forecast < observation) throw new Error('Archived forecast precedes observation');
  const grid = new Array(SIZE).fill(0);
  let end = 0;
  for (const run of frame.runs) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[0]) ||
        run[0] < end || !Array.isArray(run[1]) || !run[1].length ||
        run[0] + run[1].length > SIZE ||
        !run[1].every(value => Number.isFinite(value) && value > 0 && value <= 100)) {
      throw new Error('Invalid archived probability run');
    }
    for (let offset = 0; offset < run[1].length; offset++) grid[run[0] + offset] = run[1][offset];
    end = run[0] + run[1].length;
  }
  return { observation, forecast, grid };
}

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function dateName(value) { return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function frameBytes(frame) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(encodeFrame(frame)) + '\n'), { level: 9, mtime: 0 });
}
function writeAtomic(file, bytes) {
  const temporary = file + '.tmp-' + process.pid;
  try { fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function readManifest(directory) {
  const manifestPath = path.join(directory, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { version: 1, source: SOURCE, updatedAt: null, frames: [] };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || manifest.version !== 1 || manifest.source !== SOURCE || !Array.isArray(manifest.frames)) {
    throw new Error('Invalid archive manifest');
  }
  timestamp(manifest.updatedAt);
  const files = new Set();
  for (const entry of manifest.frames) {
    if (!entry || typeof entry.file !== 'string' || !FILE_PATTERN.test(entry.file) ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) || files.has(entry.file)) {
      throw new Error('Invalid archive manifest entry');
    }
    files.add(entry.file);
    timestamp(entry.observation); timestamp(entry.forecast);
    const bytes = fs.readFileSync(path.join(directory, entry.file));
    if (digest(bytes) !== entry.sha256) throw new Error('Archived frame checksum mismatch');
    const decoded = zlib.gunzipSync(bytes, { maxOutputLength: 2 * 1024 * 1024 });
    const frame = decodeFrame(JSON.parse(decoded.toString('utf8')));
    if (frame.observation !== entry.observation || frame.forecast !== entry.forecast) {
      throw new Error('Archived frame timestamps disagree with manifest');
    }
  }
  return manifest;
}

function archiveFrames(inputs, options = {}) {
  const directory = options.directory || DIRECTORY;
  const now = options.now === undefined ? Date.now() : options.now;
  if (!Number.isFinite(now)) throw new Error('Invalid archive clock');
  // Validate every input and existing file before mutating the archive.
  const frames = inputs.map(parseNOAA);
  if (options.requireFresh) frames.forEach(frame => assertFresh(frame, now));
  const manifest = readManifest(directory);
  const cutoff = now - RETENTION;
  const removed = manifest.frames.filter(entry => Date.parse(entry.forecast) < cutoff);
  const entries = manifest.frames.filter(entry => Date.parse(entry.forecast) >= cutoff);
  const known = new Set(entries.map(entry => entry.file));
  const pending = [];
  let skipped = 0;
  for (const frame of frames) {
    if (Date.parse(frame.forecast) < cutoff) { skipped++; continue; }
    const bytes = frameBytes(frame);
    const sha256 = digest(bytes);
    const file = dateName(frame.observation) + '-' + dateName(frame.forecast) + '-' + sha256.slice(0, 16) + '.json.gz';
    if (known.has(file)) continue;
    known.add(file);
    entries.push({ file, observation: frame.observation, forecast: frame.forecast, sha256 });
    pending.push({ file, bytes });
  }
  entries.sort((a, b) => a.forecast.localeCompare(b.forecast) ||
    a.observation.localeCompare(b.observation) || a.file.localeCompare(b.file));
  if (!pending.length && !removed.length && fs.existsSync(path.join(directory, 'manifest.json'))) {
    return { added: 0, removed: 0, skipped, frames: entries.length, changed: false };
  }
  // Do not create a misleading empty history when every imported source is old.
  if (!entries.length && !manifest.frames.length) {
    return { added: 0, removed: 0, skipped, frames: 0, changed: false };
  }
  fs.mkdirSync(directory, { recursive: true });
  for (const item of pending) writeAtomic(path.join(directory, item.file), item.bytes);
  const result = { version: 1, source: SOURCE, updatedAt: new Date(now).toISOString(), frames: entries };
  writeAtomic(path.join(directory, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
  // Update the index first. Interrupted pruning can leave an unreferenced file, but
  // cannot leave a manifest pointing at a file this capture has just deleted.
  for (const entry of removed) fs.unlinkSync(path.join(directory, entry.file));
  return { added: pending.length, removed: removed.length, skipped, frames: entries.length, changed: true };
}

async function fetchLatest() {
  const response = await fetch(SOURCE, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json', 'User-Agent': 'DaylightGlobe NOAA archive' }
  });
  if (!response.ok) throw new Error('NOAA aurora request failed: HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024) throw new Error('NOAA aurora response exceeds size limit');
  return JSON.parse(bytes.toString('utf8'));
}

async function main(files = process.argv.slice(2)) {
  if (files.some(file => file.startsWith('-'))) throw new Error('Usage: node tools/archive-globe-aurora.cjs [saved-noaa.json ...]');
  const inputs = files.length ? files.map(file => JSON.parse(fs.readFileSync(file, 'utf8'))) : [await fetchLatest()];
  const result = archiveFrames(inputs, { requireFresh: !files.length });
  console.log(JSON.stringify(result));
  return result;
}

module.exports = { SOURCE, SIZE, RETENTION, parseNOAA, assertFresh, encodeFrame, decodeFrame, archiveFrames, fetchLatest, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
