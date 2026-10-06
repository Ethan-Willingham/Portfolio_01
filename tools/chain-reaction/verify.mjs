import { toolLock } from './core.mjs';
// Read-only full-chain gate. No public stage can pass before its verifier is built.
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, hash, deadline, fixtures, isolation, validate, physics } from './core.mjs';
const release=await toolLock();
const clear=deadline(1800000);
try {
  if(process.argv[2]!=='--full') throw Error('Only --full is supported during foundations; --record is unavailable');
  const provenance=JSON.parse(await readFile(resolve(ROOT,'js/vendor/rapier2d-0.21.0/provenance.json')));
  if(hash(await readFile(resolve(ROOT,'js/vendor/rapier2d-0.21.0/rapier.mjs')))!==provenance.moduleSha256) throw Error('Vendored engine hash differs');
  let stages=[];
  try {stages=(await readdir(resolve(ROOT,'assets/chain-reaction/stages'))).filter(x=>x.endsWith('.json'));}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  if(stages.length) throw Error('Stage recording, robustness and full-chain verification are not implemented. Shipping stages is blocked.');
  const stored=JSON.parse(await readFile(resolve(ROOT,'tools/chain-reaction/fixtures/hashes.json'),'utf8'));
  let count=0;
  for(const original of await fixtures())for(const mirrored of [false,true]){
    const fixture=mirrored?physics.mirror(original):original, result=await isolation(fixture), name=fixture.name+(mirrored?' mirrored':'');
    if(result.hash!==stored[name])throw Error('Isolation hash changed: '+name);
    if(validate(fixture,result).length)throw Error('Isolation invariants failed: '+name);
    count++;
  }
  console.log('Isolation: '+count+' stored hashes and invariants PASS');
  console.log('verify --full PASS 0/0 public stages; vendor hash PASS. Stage gates unavailable, Phase 0 only.');
} finally {clear();await release();}
