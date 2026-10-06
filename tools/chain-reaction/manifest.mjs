import {readFile,readdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {ROOT,hash} from './core.mjs';import {validateStage} from './schema.mjs';
const folder=resolve(ROOT,'assets/chain-reaction/stages'),stages=[];
for(const file of (await readdir(folder)).filter(f=>/^\d{5}\.json$/.test(f)).sort()){const bytes=await readFile(resolve(folder,file)),d=JSON.parse(bytes);validateStage(d,{recorded:true});stages.push({file,hash:hash(bytes),number:d.stageNumber,title:d.title,duration:d.verified.duration,steps:d.steps.length});}
await writeFile(resolve(ROOT,'assets/chain-reaction/index.json'),JSON.stringify({version:1,world:'Woodshop',lookApproved:false,soundApproved:false,stages},null,2)+'\n');console.log('Manifest: '+stages.length+' stages');
