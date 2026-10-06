import { toolLock } from './core.mjs';
// Read-only full-chain gate. No public stage can pass before its verifier is built.
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, hash, deadline, fixtures, isolation, validate, physics } from './core.mjs';
import { verifyCausality } from './causality.mjs';
import { verifyMaterials } from './materials.mjs';
import { measureLimits } from './limits.mjs';
import { verifyKit } from './kit.mjs';
import {recordStage,verifyStage} from './record.mjs';
const release=await toolLock();
const clear=deadline(1800000);
try {
  if(process.argv[2]==='--record'){if(process.argv.length<4)throw Error('Pass changed stage file paths');for(const path of process.argv.slice(3))await recordStage(resolve(path));process.exitCode=0;}else if(process.argv[2]!=='--full')throw Error('Use --full or --record <changed stage paths>');
  if(process.argv[2]==='--record'){}else{
  const provenance=JSON.parse(await readFile(resolve(ROOT,'js/vendor/rapier2d-0.21.0/provenance.json')));
  if(hash(await readFile(resolve(ROOT,'js/vendor/rapier2d-0.21.0/rapier.mjs')))!==provenance.moduleSha256) throw Error('Vendored engine hash differs');
  let stages=[];
  try {stages=(await readdir(resolve(ROOT,'assets/chain-reaction/stages'))).filter(x=>x.endsWith('.json'));}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  const stageResults=[];for(const file of stages.sort()){if(!/^\d{5}\.json$/.test(file))throw Error('Stage file must use five digits');stageResults.push(await verifyStage(resolve(ROOT,'assets/chain-reaction/stages',file)));}
  for(let i=0;i<stageResults.length;i++)if(stageResults[i].stageNumber!==i+1)throw Error('Broken stage sequence');
  const stored=JSON.parse(await readFile(resolve(ROOT,'tools/chain-reaction/fixtures/hashes.json'),'utf8'));
  let count=0;
  for(const original of await fixtures())for(const mirrored of [false,true]){
    const fixture=mirrored?physics.mirror(original):original, result=await isolation(fixture), name=fixture.name+(mirrored?' mirrored':'');
    if(result.hash!==stored[name])throw Error('Isolation hash changed: '+name);
    if(validate(fixture,result).length)throw Error('Isolation invariants failed: '+name);
    if(fixture.causality){await verifyCausality(fixture);console.log('Contact causality and disconnected controls PASS: '+name);}
    count++;
  }
  const materials=await verifyMaterials(),limits=await measureLimits(),kit=await verifyKit();
  console.log('Material recipes: '+materials.recipes.length+' PASS; '+materials.massModelsChecked+' dimensional mass checks; stored masses unchanged');
  console.log('Limits: '+limits.railCornersPassed+' rail samples PASS; CCD, motion threshold and camera samples PASS; no stage robustness claimed');
  console.log('Isolation: '+count+' stored hashes and invariants PASS');
  console.log('Kit: '+kit.report.length+' fresh-contact fixtures, exact compound mass, geometry, semantic transfers and '+kit.disconnectedControls+' disconnected controls PASS; '+kit.mutationsRejected+' mutations rejected');
  console.log('verify --full PASS '+stageResults.length+'/'+stageResults.length+' public stages; vendor hash, canonical orientations, recorded variation, causal controls and camera PASS.');
  }
} finally {clear();await release();}
