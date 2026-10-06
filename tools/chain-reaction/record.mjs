import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,basename} from 'node:path';
import {validateStage,sourceHash} from './schema.mjs';
import {physics} from './core.mjs';
import {measureStage} from './stage.mjs';
import {robustness,interruptionControls,reserveControls} from './robust.mjs';
import {bakeCamera} from './camera.mjs';
export async function recordStage(path){
 const changed=execFileSync('git',['-C',dirname(path),'status','--porcelain','--',basename(path)],{encoding:'utf8'}).trim();assert(changed,'--record accepts only changed stage files');
 const d=JSON.parse(await readFile(path,'utf8'));validateStage(d);
 const orientations=[];for(const mirrored of [false,true]){const r=await measureStage(d,mirrored,true,true);assert(r.pass,'Canonical stage failed: '+JSON.stringify(r.failures));orientations.push({mirrored,...r});}
 const reuse=d.verified?.sourceHash===sourceHash(d)&&d.verified.physicsVersion===physics.VERSION&&d.verified.orientations.every((r,i)=>r.snapshotHash===orientations[i].snapshotHash);if(reuse)validateStage(d,{recorded:true});const runs=reuse?d.verified.robustness:await robustness(d);assert(runs.every(r=>r.pass),'Robustness failed');const interrupted=reuse?d.verified.interruptionControls:await interruptionControls(d),reserve=reuse?d.verified.reserveControls:await reserveControls(d),forward=orientations[0];
 d.verified={version:1,engine:physics.ENGINE,physicsVersion:physics.VERSION,sourceHash:sourceHash(d),kitVersions:[...new Set([...d.parts,...d.joints].map(p=>p.kit.id+'@'+p.kit.version))],canonicalEntry:d.parts.find(p=>p.id===d.entryId)||null,canonicalExit:forward.exit,armed:forward.armed,spent:forward.spent,duration:forward.exit.time,steps:forward.events.events,camera:bakeCamera(d,forward),stateHash:forward.snapshotHash,orientations:orientations.map(r=>({mirrored:r.mirrored,pass:r.pass,exit:r.exit,snapshotHash:r.snapshotHash,events:r.events,maxSurface:r.maxSurface,longestIdle:r.longestIdle,maxRope:r.maxRope})),robustness:runs,interruptionControls:interrupted,reserveControls:reserve};
 validateStage(d,{recorded:true});if(process.env.CHAIN_REACTION_RESEARCH){const folder=process.env.CHAIN_REACTION_RESEARCH+'/evidence/records';await mkdir(folder,{recursive:true});await writeFile(folder+'/'+String(d.stageNumber).padStart(5,'0')+'.json',JSON.stringify({sourceHash:d.verified.sourceHash,orientations},null,2)+'\n');}await writeFile(path,JSON.stringify(d)+'\n');console.log('Recorded stage '+d.stageNumber+': '+d.verified.duration.toFixed(3)+' s, '+d.steps.length+' physical transfers');return d;
}
export async function verifyStage(path){const d=JSON.parse(await readFile(path,'utf8'));validateStage(d,{recorded:true});for(const stored of d.verified.orientations){const r=await measureStage(d,stored.mirrored,true,true);assert(r.pass&&r.snapshotHash===stored.snapshotHash,'Stored canonical hash differs: '+path);if(!stored.mirrored)assert(JSON.stringify(bakeCamera(d,r))===JSON.stringify(d.verified.camera),'Baked camera differs: '+path);}assert(d.verified.interruptionControls.every(r=>r.pass),'Missing interrupted chain evidence');assert(d.verified.reserveControls.every(r=>r.pass),'Missing trigger reserve stress evidence');return d;}
