// Serial owned-browser capacity runs. Never combine with other GPU/CPU benchmarks.
// MATRIX=/absolute/path/matrix.json DUMP=/tmp/capacity node tools/perf/capacity-sweep.mjs
// Matrix rows contain {name, slimes, snow, layout}; each run reboots the ordinary game.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
assert(process.env.MATRIX,'Explicit matrix file required');
const matrix=JSON.parse(fs.readFileSync(process.env.MATRIX,'utf8'));
const out=path.resolve(process.env.DUMP||'/tmp/sluice-capacity-sweep');
assert(Array.isArray(matrix)&&matrix.length>0&&matrix.length<=64,'Bounded matrix');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/matrix.json',JSON.stringify(matrix,null,2));
const results=[];
let activeChild=null,stopSignal=null;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopSignal=signal;if(activeChild&&activeChild.exitCode===null&&!activeChild.signalCode)activeChild.kill(signal);});
for(const row of matrix){
 assert(!stopSignal,'Capacity sweep interrupted by '+stopSignal);
 assert(/^[a-z0-9-]+$/.test(row.name),'Safe unique artifact name');
 assert(!results.some(r=>r.name===row.name),'Unique matrix names');
 const dump=out+'/'+row.name;
 assert(!fs.existsSync(dump),'Never overwrite capacity evidence');
 const scene=row.slimes&&row.snow?'both':row.slimes?'slimes':row.snow?'snow':'neither';
 const env={...process.env,FRAME_MODE:process.env.FRAME_MODE||'timer120',CAPACITY_SCENE:scene,SNOW:'0',
  WATER:process.env.WATER||'1',SLIME_COUNT:String(row.slimes),SNOW_COUNT:String(row.snow),
  LAYOUT:row.layout||'clustered',VIEW_WIDTH:process.env.VIEW_WIDTH||'1512',
  VIEW_HEIGHT:process.env.VIEW_HEIGHT||'982',FULLSCREEN:'1',
  COMPLETION:process.env.COMPLETION||'1',COUNT_QUANTA:process.env.COUNT_QUANTA||'1',
  WARMUP_MS:process.env.WARMUP_MS||'5000',DURATION_MS:process.env.DURATION_MS||'20000',DUMP:dump};
 if(row.bundleSource)env.BUNDLE_SOURCE=row.bundleSource;
 if(row.liquidSource)env.LIQUID_SOURCE=row.liquidSource;
 console.log(JSON.stringify({starting:row,at:new Date().toISOString()}));
 let child;
 const code=await new Promise((resolve,reject)=>{
  child=spawn(process.execPath,[here+'/test-ordinary-game.mjs'],{env,stdio:['ignore','pipe','pipe']});
  activeChild=child;
  const log=fs.createWriteStream(out+'/'+row.name+'.log');
  child.stdout.on('data',data=>{log.write(data);process.stdout.write(data);});
  child.stderr.on('data',data=>{log.write(data);process.stderr.write(data);});
  child.on('error',reject);child.on('exit',(code,signal)=>{activeChild=null;log.end();resolve(signal?130:code);});
 });
 results.push({...row,exitCode:code,out:dump});
 fs.writeFileSync(out+'/progress.json',JSON.stringify(results,null,2));
 assert.equal(code,0,'Capacity run failed; inspect retained evidence before continuing');
}
console.log(JSON.stringify({complete:true,out,runs:results.length}));
