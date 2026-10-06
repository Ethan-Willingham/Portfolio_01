import { toolLock } from './core.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, fixtures, deadline } from './core.mjs';
const release=await toolLock();
const clear=deadline(300000),failures=[];
try {
  const paths=['js/chain-reaction-physics.js','docs/CHAIN_REACTION.md'];
  for(const file of await readdir(resolve(ROOT,'tools/chain-reaction')))if(file.endsWith('.mjs'))paths.push('tools/chain-reaction/'+file);
  for(const file of await readdir(resolve(ROOT,'tools/chain-reaction/fixtures')))if(file.endsWith('.json'))paths.push('tools/chain-reaction/fixtures/'+file);
  for(const path of paths){const text=await readFile(resolve(ROOT,path),'utf8');if(/\u2014|\p{Extended_Pictographic}/u.test(text))failures.push(path+': forbidden content character');}
  for(const f of await fixtures()){
    for(const p of f.parts)if(p.fixed&&!p.mount)failures.push(f.name+': unmounted '+p.id);
  }
  // Frame/material/prop gates need the renderer and scale table, and remain unavailable.
  if(failures.length)throw Error(failures.join('\n'));
  console.log('lint PASS: foundation text and fixed-part declarations. Visual stage lint not implemented; no stages may ship.');
} finally {clear();await release();}
