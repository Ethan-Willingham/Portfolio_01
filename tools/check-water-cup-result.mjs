#!/usr/bin/env node
// Independent inventories from an integrated run's copied native buffers.
// node tools/check-water-cup-result.mjs /absolute/test-output
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

assert(process.argv[2], 'Supply the output directory from test-water-machines.mjs');
const folder = path.resolve(process.argv[2]);
const report = JSON.parse(fs.readFileSync(path.join(folder, 'report.json')));
assert(report.recordingComplete && report.ownedBrowserClosed, 'The owned run must finish first');
assert.deepEqual(report.errors, [], 'No browser or GPU errors');
const require = createRequire(import.meta.url);
const Builder = require(path.join(folder, 'source/water-machines-builder.js'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];

for (const run of report.runs) {
  assert.equal(run.machine, 'cup');
  assert(run.resident && run.nativePassage, 'Resident buffers and native passage observer required');
  const {w, h, tile} = run.initial.world;
  assert.deepEqual({w, h, tile}, {w:1120, h:664, tile:8}, 'Check the released apparatus size');
  const definition = run.initial.definition, measure = definition.measure;
  const ids = run.initial.sourceOrigin.bulkIds;
  const pipe = new Set(run.initial.sourceOrigin.pipeInteriorTiles);
  const read = file => {
    const bytes = fs.readFileSync(path.join(folder, file));
    assert.equal(bytes.length % 16, 0, 'Four Float32 lanes per native particle');
    return Array.from({length:bytes.length / 16}, (_, i) =>
      Array.from({length:4}, (_, lane) => bytes.readFloatLE(i * 16 + lane * 4)));
  };
  const initial = read(run.id + '-initial-pos.bin');
  const final = read(run.resident.buffers.pos.file);
  assert.equal(final.length, initial.length, 'Native particle count conserved');
  assert(run.summary.countConserved, 'Counts stay constant throughout the run');
  assert(final.every(p => p.every(Number.isFinite)), 'Finite native position and velocity');
  assert.equal(run.actions.length, 1, 'Exactly one primary slime drop');
  assert.equal(run.actions[0].action.type, 'primary');
  assert.equal(run.actions[0].action.at, 15);
  const held = read(run.actions[0].beforeResident.buffers.pos.file);
  const region = p => {
    const [x, y] = p;
    if (pipe.has(Math.floor(x / tile) + ',' + Math.floor(y / tile))) return 'pipe';
    for (const [name, r] of [['cup', measure.source], ['receiver', measure.receiver]])
      if (x >= r.x + tile && x < r.x + r.width - tile && y >= r.y && y < r.y + r.height - tile) return name;
    return 'other';
  };
  const low = Math.floor((Math.ceil(measure.bore / tile) - 1) / 2);
  const intakeRoof = (Math.floor(measure.intake.y / tile) - low) * tile;
  const drainable = ids.filter(id => initial[id][1] < intakeRoof).length;
  assert(drainable > 0);
  const inventory = {cup:0, pipe:0, receiver:0, other:0};
  for (const id of ids) inventory[region(final[id])]++;
  const outside = points => ids.filter(id => !['cup', 'pipe'].includes(region(points[id]))).length;
  const holdLossPercent = (outside(held) - outside(initial)) / ids.length * 100;
  assert(holdLossPercent < 1, 'Cup holds before the drop');
  assert.equal(run.nativePassage.finalBulkInReceiver, inventory.receiver, 'GPU observer agrees with copied positions');
  // Older observers recorded passage and rim flags separately. Subtracting
  // every rim spill in the receiver is a conservative exclusion, even if
  // some already failed the passage criterion. New observers exclude exactly.
  const conservativeRimExclusion=run.nativePassage.excludesRimSpills ? 0 : run.nativePassage.finalSpilledInReceiver;
  assert(Number.isInteger(conservativeRimExclusion) && conservativeRimExclusion>=0);

  const cols = Math.ceil(w / tile), gridRows = Math.ceil(h / tile);
  const walls = new Uint8Array(cols * gridRows);
  for (let y = 0; y < gridRows; y++) for (let x = 0; x < cols; x++)
    if (!x || !y || x === cols - 1 || y === gridRows - 1) walls[y * cols + x] = 1;
  const builder = Builder.create({width:cols, height:gridRows, tile, walls});
  builder.begin('Captured geometry');
  for (const vessel of definition.vessels) builder.vessel(vessel.rect, vessel.sealed);
  for (const tube of definition.pipes) builder.strokePipe(tube.points, tube.bore);
  for (const rect of definition.solids || []) builder.vent(rect, false);
  builder.commit();
  let insideWallCount = 0;
  for (const [x, y] of final) {
    assert(x >= 0 && x < w && y >= 0 && y < h, 'Particle stays inside the physical world');
    if (walls[Math.floor(y / tile) * cols + Math.floor(x / tile)]) insideWallCount++;
  }
  assert.equal(insideWallCount, 0, 'No final particle centers inside walls');
  const reportedPassageCount=run.nativePassage.finalBulkInReceiverAfterPassage;
  const delivered=reportedPassageCount-conservativeRimExclusion;
  assert(delivered>=0 && delivered<=inventory.receiver, 'Delivery excludes every recorded rim spill');
  const deliveryPercent = delivered / drainable * 100;
  if (run.case === 'canonical') {
    assert.deepEqual(run.options, {}, 'Stock cup settings');
    assert(run.finalSimulationSeconds >= 180 && run.finalSimulationSeconds < 181);
  } else {
    assert(['lower-fill', 'raised-bend'].includes(run.case));
    assert(run.finalSimulationSeconds >= 70 && run.finalSimulationSeconds < 71);
    if (run.case === 'lower-fill') assert.equal(run.options.level, 288);
    else {assert.equal(run.options.crest, 84); assert.equal(run.options.level, 192);}
    assert.equal(delivered, 0, 'The control does not drain after the same drop');
  }
  rows.push({run:run.id, case:run.case, seed:run.seed, simulationSeconds:run.finalSimulationSeconds,
    initialParticles:initial.length, initialBulkParticles:ids.length, initiallyDrainable:drainable,
    delivered, deliveryPercent, holdLossPercent, inventory, insideWallCount,
    rimSpills:run.nativePassage.spilledOverRim, rimSpillsInReceiver:run.nativePassage.finalSpilledInReceiver,
    reportedPassageCount, conservativeRimExclusion, deliveryCountIsLowerBound:conservativeRimExclusion>0,
    countConserved:true, allResidentFinite:true,
    deliveryTargetMet:run.case === 'canonical' ? deliveryPercent >= 95 : null,
    maximumObservedParticleMove:run.nativePassage.maximumBulkDisplacementBetweenObservations});
}
for (const name of ['canonical', 'lower-fill', 'raised-bend'])
  assert.deepEqual(rows.filter(r => r.case === name).map(r => r.seed).sort((a,b) => a-b), [17,42,913]);
const deliveryTargetMet = rows.filter(r => r.case === 'canonical').every(r => r.deliveryTargetMet);
const result = {pass:deliveryTargetMet, invariantsPassed:true, deliveryTargetMet,
  scope:'Greedy cup delivery, hold controls, containment and particle inventory. Pressure calibration and contact smoothness are not certified.',
  sourceSHA256:report.sourceSHA256, reportSHA256:hash(fs.readFileSync(path.join(folder, 'report.json'))), rows};
fs.writeFileSync(path.join(folder, 'cup-acceptance.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({pass:result.pass, invariantsPassed:true, deliveryTargetMet,
  runs:rows.length, deliveryPercent:rows.filter(r => r.case === 'canonical').map(r => r.deliveryPercent)}));
if (!deliveryTargetMet) process.exitCode = 1;
