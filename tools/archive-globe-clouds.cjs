/* Publish a bounded cloud snapshot on its own generated branch, never main. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const data=require('../js/globe-data.js'),clouds=require('../js/globe-clouds.js'),archive=require('../js/globe-archive.js');
const BRANCH='globe-clouds',REF='refs/heads/'+BRANCH,WIDTH=2048,HOUR=3600000,STEP=clouds.STEP;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const runFile=promisify(execFile),NUMERIC_STEP=600000;
function usableSources(blobs){return blobs.length===10&&blobs.slice(0,5).every(b=>!b)&&blobs.slice(5).filter(Boolean).length>=3;}
function git(args,options={}){return execFileSync('git',args,{maxBuffer:32000000,...options});}
async function renderFrame(time,options={}){
 const sharp=options.sharp||require('sharp'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'globe-measurements-'));
 try{
  const python=options.python||process.env.GLOBE_PYTHON||'python3',cache=options.cache||process.env.GLOBE_SOURCE_CACHE||path.join(os.tmpdir(),'globe-numeric-cache');
  await runFile(python,[path.join(__dirname,'globe-numeric-clouds.py'),'--time',time.toISOString(),'--cache',cache,'--output',directory],{timeout:210000,maxBuffer:2000000,signal:options.signal});
  const result=JSON.parse(fs.readFileSync(path.join(directory,'sources.json'),'utf8'));
  if(!usableSources(result.layers))throw new Error('Insufficient measured satellite coverage');
  const pixels=[];
  for(const filename of result.layers){
   if(!filename){pixels.push(null);continue;}
   const raw=await sharp(filename).ensureAlpha().raw().toBuffer();
   if(raw.length!==WIDTH*WIDTH*2)throw new Error('Invalid measured field dimensions');
   pixels.push(data.featherCoverage(raw,WIDTH));
  }
  // Temperatures are already decoded in their native grid. No display palette,
  // cloud-shape repair, RGB enhancement or inferred scan mask belongs here.
  const frame={time:time.toISOString(),natural:false,sourceTimes:result.sourceTimes,observations:result.observations},files=new Map();
  for(const kind of ['visible','infrared']){
   const rgba=clouds.composite(pixels,WIDTH,kind);let covered=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>200)covered++;
   if(kind==='infrared'&&covered/(rgba.length/4)<.30)throw new Error('Insufficient measured global coverage');
   const bytes=await sharp(Buffer.from(rgba),{raw:{width:WIDTH,height:WIDTH/2,channels:4}}).webp({lossless:true,effort:4}).toBuffer(),hash=digest(bytes);
   const file=frame.time.replace(/[-:]/g,'').slice(0,13)+'-'+kind+'-'+hash.slice(0,16)+'.webp';
   frame[kind]={file,sha256:hash,bytes:bytes.length};files.set(file,bytes);
  }
  return {frame,files,errors:result.errors};
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
function snapshot(retained,files,now,errors){
 const frames=[...retained.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 if(!frames.length)throw new Error('No measured cloud frames; existing snapshot preserved');
 const referenced=new Set(frames.flatMap(f=>[f.visible.file,f.infrared.file]));for(const file of files.keys())if(!referenced.has(file))files.delete(file);
 const catalog={version:2,checkedAt:now.toISOString(),times:frames.map(f=>f.time)};
 const manifest={version:3,processing:clouds.PROCESSING,width:WIDTH,generatedAt:now.toISOString(),catalog,frames};archive.validate(manifest);
 return {manifest,files,errors,changed:true};
}
async function collect(previous,options={}){
 if(previous&&previous.manifest.processing>clouds.PROCESSING)throw new Error('Recorder processing revision is older than the shared snapshot');
 const now=new Date(options.now===undefined?Date.now():options.now),lower=Math.floor((+now-26*HOUR)/NUMERIC_STEP)*NUMERIC_STEP;
 const retained=new Map(),files=new Map(),errors=[];
 if(previous&&previous.manifest.version===3&&previous.manifest.processing===clouds.PROCESSING){
  const parsed=archive.validate(previous.manifest);
  for(const frame of parsed.frames)if(frame.time>=lower&&frame.time<=now){
   const original=previous.manifest.frames.find(f=>f.time===frame.time.toISOString());
   for(const kind of ['visible','infrared']){const asset=original[kind],bytes=previous.files.get(asset.file);if(!bytes||bytes.length!==asset.bytes||digest(bytes)!==asset.sha256||archive.dimensions(bytes).join('/')!==WIDTH+'/'+WIDTH/2)throw new Error('Corrupt retained cloud asset');files.set(asset.file,bytes);}
   retained.set(original.time,original);
  }
 }
 const queue=[];
 for(let t=Math.floor(+now/NUMERIC_STEP)*NUMERIC_STEP;t>=lower;t-=NUMERIC_STEP)if(!retained.has(new Date(t).toISOString()))queue.push(new Date(t));
 const limit=options.limit===undefined?7:options.limit;let completed=0;const started=Date.now();
 for(const time of queue.slice(0,limit)){
  if(completed&&Date.now()-started>(options.budgetMs||120000))break;
  const controller=new AbortController();let deadline;
  try{
   const result=await Promise.race([(options.render||renderFrame)(time,{...options,signal:controller.signal}),new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(new Error('Measured cloud frame timed out'));},options.frameTimeout||215000);})]);
   retained.set(result.frame.time,result.frame);for(const [file,bytes]of result.files)files.set(file,bytes);
   errors.push(...(result.errors||[]).map(e=>({...e,time:time.toISOString()})));
   completed++;
   if(options.progress)options.progress({time:time.toISOString(),observed:result.frame.sourceTimes.slice(5),bytes:[...result.files.values()].reduce((n,b)=>n+b.length,0)});
   // Publish live first, then each bounded backfill batch. History never holds
   // the newest observation hostage until a whole day's rebuild completes.
   if(options.checkpoint&&(completed===1||completed%3===0))await options.checkpoint(snapshot(retained,files,now,errors));
  }catch(error){errors.push({time:time.toISOString(),error:error.message});}finally{clearTimeout(deadline);}
 }
 const result=snapshot(retained,files,now,errors);
 result.changed=!previous||JSON.stringify(previous.manifest.frames)!==JSON.stringify(result.manifest.frames)||previous.manifest.processing!==clouds.PROCESSING;
 return result;
}
function readPrevious(){
 const old=git(['ls-remote','origin',REF]).toString().trim().split(/\s/)[0];if(!old)return {old:'',previous:null};
 if(!/^[a-f0-9]{40}$/.test(old))throw new Error('Invalid archive branch identity');
 git(['fetch','--quiet','origin','+'+old+':refs/remotes/origin/'+BRANCH]);
 const manifest=JSON.parse(git(['show',old+':manifest.json']).toString()),parsed=archive.validate(manifest),files=new Map();
 for(const f of parsed.frames)for(const kind of ['visible','infrared'])files.set(f[kind].file,git(['show',old+':'+f[kind].file]));
 return {old,previous:{manifest,files}};
}
function pushSnapshot(commit,old,options={}){
 const invoke=options.git||git,wait=options.wait||(ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms));
 for(let attempt=0;attempt<3;attempt++)try{invoke(['push','--force-with-lease='+REF+':'+old,'origin',commit+':'+REF]);return commit;}catch(error){
  // A server error can arrive after accepting the push. Recover that outcome
  // before retrying, and never replace a concurrent writer's new snapshot.
  const current=invoke(['ls-remote','origin',REF]).toString().trim().split(/\s/)[0];
  if(current===commit)return commit;if(current!==old||attempt===2)throw error;
  wait(attempt===0?5000:15000);
 }
}
function publish(snapshot,old){
  archive.validate(snapshot.manifest);
  for(const frame of snapshot.manifest.frames)for(const kind of ['visible','infrared']){const asset=frame[kind],bytes=snapshot.files.get(asset.file);if(!bytes||bytes.length!==asset.bytes||digest(bytes)!==asset.sha256||archive.dimensions(bytes).join('/')!==WIDTH+'/'+WIDTH/2)throw new Error('Invalid cloud publication asset');}
 // A parentless tree keeps the active branch to one bounded snapshot. Only this
 // generated branch is replaced, guarded against another writer by its old SHA.
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'globe-cloud-index-')),env={...process.env,GIT_INDEX_FILE:path.join(directory,'index')};
 try{
  git(['read-tree','--empty'],{env});const entries=[],payload=path.join(directory,'payload');
  for(const [file,bytes]of [...snapshot.files,['manifest.json',Buffer.from(JSON.stringify(snapshot.manifest)+'\n')]]){
   if(file!=='manifest.json'&&!snapshot.manifest.frames.some(f=>['visible','infrared'].some(k=>f[k].file===file)))continue;
   // A regular file avoids large synchronous stdin writes stalling in Git's
   // EOF read on macOS. No filters may alter the verified image bytes.
   fs.writeFileSync(payload,bytes);const hash=git(['hash-object','-w','--no-filters',payload]).toString().trim();entries.push('100644 '+hash+'\t'+file+'\n');
  }
  git(['update-index','--index-info'],{env,input:entries.join('')});const tree=git(['write-tree'],{env}).toString().trim();
  const author={...env,GIT_AUTHOR_NAME:'globe-weather',GIT_AUTHOR_EMAIL:'globe-weather@users.noreply.github.com',GIT_COMMITTER_NAME:'globe-weather',GIT_COMMITTER_EMAIL:'globe-weather@users.noreply.github.com'};
  const commit=git(['commit-tree',tree],{env:author,input:'Refresh rolling cloud snapshot\n'}).toString().trim();
  return pushSnapshot(commit,old);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
async function main(){
 let {old,previous}=readPrevious(),lastPublished=null;
 const checkpoint=async result=>{old=publish(result,old);lastPublished=JSON.stringify(result.manifest.frames);};
 const result=await collect(previous,{limit:Number(process.env.GLOBE_BACKFILL_LIMIT||7),progress:value=>console.log(JSON.stringify(value)),checkpoint});
 result.errors.forEach(error=>console.error(JSON.stringify(error)));
 if(result.changed&&lastPublished!==JSON.stringify(result.manifest.frames))await checkpoint(result);
 console.log(JSON.stringify({phase:'measured infrared weather',frames:result.manifest.frames.length,last:result.manifest.frames.at(-1).time,bytes:[...result.files.values()].reduce((n,b)=>n+b.length,0),changed:result.changed,commit:old}));
 // A failed regional source is already reflected in its clock or missing-data
 // alpha. Fail the run only when no fresh global frame could be prepared.
 if(Date.now()-Date.parse(result.manifest.frames.at(-1).time)>30*60000)process.exitCode=1;
}
module.exports={BRANCH,REF,usableSources,renderFrame,collect,readPrevious,pushSnapshot,publish};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
