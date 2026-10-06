import { toolLock } from './core.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {validateStage} from './schema.mjs';
import { ROOT, fixtures, deadline } from './core.mjs';
const release=await toolLock();
const clear=deadline(300000),failures=[];
try {
  const paths=['js/chain-reaction-physics.js','js/chain-reaction-causality.js','js/chain-reaction-events.js','js/chain-reaction-mass.js','js/chain-reaction-materials.json','js/chain-reaction-thresholds.json','docs/CHAIN_REACTION.md','chain-reaction.html','chain-reaction.css','js/chain-reaction.js','js/chain-reaction-renderer.js','js/chain-reaction-materials.js','js/chain-reaction-sound.js'];
  for(const file of await readdir(resolve(ROOT,'tools/chain-reaction')))if(file.endsWith('.mjs'))paths.push('tools/chain-reaction/'+file);
  for(const file of await readdir(resolve(ROOT,'tools/chain-reaction/fixtures')))if(file.endsWith('.json'))paths.push('tools/chain-reaction/fixtures/'+file);
  for(const path of paths){const text=await readFile(resolve(ROOT,path),'utf8');if(/\u2014|\p{Extended_Pictographic}/u.test(text))failures.push(path+': forbidden content character');}
  for(const f of await fixtures()){
    for(const p of f.parts)if(p.fixed&&!p.mount)failures.push(f.name+': unmounted '+p.id);
  }
  for(const file of await readdir(resolve(ROOT,'assets/chain-reaction/stages'))){if(!file.endsWith('.json'))continue;const stage=JSON.parse(await readFile(resolve(ROOT,'assets/chain-reaction/stages',file)));validateStage(stage,{recorded:true});for(const prop of stage.dressing){if(!['bench','panel','pencil','clamp'].includes(prop.type))failures.push(file+': unknown dressing');if(['pencil','clamp'].includes(prop.type)&&!(prop.z>.8))failures.push(file+': dressing may enter a moving depth layer');}const payoff=stage.beats.find(b=>b.kind==='payoff').time/stage.verified.duration;if(payoff<.6||payoff>.8)failures.push(file+': payoff outside beat window');}
  if(failures.length)throw Error(failures.join('\n'));
  console.log('lint PASS: text, stage schemas, fixed mounts, finish coverage, dressing depth clearance and payoff beats. Look approval remains with the owner.');
} finally {clear();await release();}
