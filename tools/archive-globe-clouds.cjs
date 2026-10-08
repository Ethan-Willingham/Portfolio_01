/* Publish a bounded cloud snapshot on its own generated branch, never main. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const data=require('../js/globe-data.js'),clouds=require('../js/globe-clouds.js'),archive=require('../js/globe-archive.js');
const BRANCH='globe-clouds',REF='refs/heads/'+BRANCH,WIDTH=2048,HOUR=3600000,STEP=clouds.STEP;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function usableSources(blobs){return blobs.length===clouds.GROUPS.length&&blobs.every((blob,i)=>blob||clouds.GROUPS[i].kind==='visible');}
function needsRepair(frame,catalog){const times=clouds.sourceTimes(catalog,frame.time);return frame.sourceTimes.slice(0,5).some((t,i)=>!t&&times[i]);}
function improvesSources(next,old){return next.sourceTimes.every((t,i)=>!old.sourceTimes[i]||t)&&next.sourceTimes.filter(Boolean).length>old.sourceTimes.filter(Boolean).length;}
function git(args,options={}){return execFileSync('git',args,{maxBuffer:32000000,...options});}
async function renderFrame(time,options={}){
 const sharp=options.sharp||require('sharp'),result=await clouds.fetchFrame(time,WIDTH,{timeout:25000,retries:2,cacheStorage:null,fetch:options.fetch,signal:options.signal,catalog:options.catalog});
 // Infrared clocks determine complete weather coverage. A slower visible
 // channel falls back to the same dated infrared over reference terrain.
 if(!usableSources(result.blobs,time))throw new Error('Incomplete satellite hour');
 const pixels=[];
 for(let i=0;i<result.blobs.length;i++){
  if(!result.blobs[i]){pixels.push(null);continue;}
  const raw=await sharp(Buffer.from(await result.blobs[i].arrayBuffer())).timeout({seconds:10}).ensureAlpha().raw().toBuffer();
  if(result.blobs[i].type==='image/jpeg')for(let p=0;p<raw.length;p+=4)if(Math.max(raw[p],raw[p+1],raw[p+2])<8)raw[p+3]=0;
  pixels.push(raw);
 }
 clouds.maskScanArtifacts(pixels,WIDTH);
 for(let i=0;i<pixels.length;i++)if(pixels[i]){if(clouds.GROUPS[i].source===clouds.NASA&&clouds.GROUPS[i].kind==='infrared')clouds.normalizeThermal(pixels[i],WIDTH);pixels[i]=data.featherCoverage(pixels[i],WIDTH);}
 clouds.retainVisibleClouds(pixels,WIDTH);
 const frame={time:time.toISOString(),natural:result.blobs.slice(0,5).some(Boolean),sources:result.blobs.map(Boolean),sourceTimes:result.sourceTimes},files=new Map();
 for(const kind of ['visible','infrared']){
  const rgba=clouds.composite(pixels,WIDTH,kind);let covered=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>200)covered++;
  if(kind==='infrared'&&covered/(rgba.length/4)<.15)throw new Error('Insufficient satellite coverage');
  const bytes=await sharp(Buffer.from(rgba),{raw:{width:WIDTH,height:WIDTH/2,channels:4}}).timeout({seconds:10}).webp({quality:90,alphaQuality:100,effort:5}).toBuffer(),hash=digest(bytes);
  const file=frame.time.replace(/[-:]/g,'').slice(0,13)+'-'+kind+'-'+hash.slice(0,16)+'.webp';
  if(archive.dimensions(bytes).join('/')!==WIDTH+'/'+WIDTH/2)throw new Error('Invalid generated WebP');
  frame[kind]={file,sha256:hash,bytes:bytes.length};files.set(file,bytes);
 }
 return {frame,files};
}
async function collect(previous,options={}){
 if(previous&&previous.manifest.processing>clouds.PROCESSING)throw new Error('Recorder processing revision is older than the shared snapshot');
 const now=new Date(options.now===undefined?Date.now():options.now);let catalog=options.catalog;
 if(!catalog){
  // A metadata outage must not discard the newer index already captured by
  // the independent weather job. Its exact published clocks remain required.
  const candidates=[];if(options.fallbackCatalog)try{candidates.push(clouds.validate(options.fallbackCatalog));}catch(_){}
  if(previous)candidates.push(clouds.validate(previous.manifest.catalog));
  try{candidates.push(await clouds.fetchCatalog({timeout:30000,fetch:options.fetch}));}catch(error){if(!candidates.length)throw error;}
  candidates.sort((a,b)=>b.end-a.end);catalog=candidates[0];
 }
 clouds.validate(catalog);
 // Provider metadata replicas can lag behind already verified observations.
 // Keep those clocks and assets rather than rolling the archive backwards.
 if(previous){const known=clouds.validate(previous.manifest.catalog);if(known.end>catalog.end)catalog=known;}
 const frames=[],files=new Map(),errors=[],lower=Math.floor((+now-26*HOUR)/STEP)*STEP;
 if(previous&&previous.manifest.processing===clouds.PROCESSING){const parsed=archive.validate(previous.manifest);for(const frame of parsed.frames)if(frame.time>=lower&&frame.time<=now&&clouds.published(catalog,+frame.time)){
   const original=previous.manifest.frames.find(f=>f.time===frame.time.toISOString());for(const kind of ['visible','infrared']){const asset=original[kind],bytes=previous.files.get(asset.file);if(!bytes||bytes.length!==asset.bytes||digest(bytes)!==asset.sha256||archive.dimensions(bytes).join('/')!==WIDTH+'/'+WIDTH/2)throw new Error('Corrupt retained cloud asset');files.set(asset.file,bytes);}frames.push({...original,sourceTimes:frame.sourceTimes});
  }}
 const retained=new Map(frames.map(f=>[f.time,f])),existing=new Set(retained.keys()),queue=[];
 for(let t=Math.max(lower,+catalog.start);t<=catalog.end&&t<=now;t+=STEP)if(clouds.published(catalog,t)&&!existing.has(new Date(t).toISOString()))queue.push(new Date(t));
 queue.sort((a,b)=>b-a);
 // Capture new weather first. Retry a bounded set of incomplete colour pairs,
 // oldest attempt first, so a persistent failure cannot starve other repairs.
 const repairLimit=options.repairLimit===undefined?6:Math.max(0,Math.min(108,Math.floor(options.repairLimit)));
 const repairs=frames.filter(f=>needsRepair(f,catalog)&&(!f.repairCheckedAt||now-new Date(f.repairCheckedAt)>=15*60000));
 repairs.sort((a,b)=>(Date.parse(a.repairCheckedAt)||0)-(Date.parse(b.repairCheckedAt)||0)||Date.parse(b.time)-Date.parse(a.time));
 queue.push(...repairs.slice(0,repairLimit).map(f=>new Date(f.time)));
 async function worker(){while(queue.length){const time=queue.shift(),key=time.toISOString(),prior=retained.get(key),controller=new AbortController();let deadline;
  if(prior)prior.repairCheckedAt=now.toISOString();
  try{const result=await Promise.race([(options.render||renderFrame)(time,{...options,catalog,signal:controller.signal}),new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(new Error('Cloud frame preparation timed out'));},options.frameTimeout||45000);})]);
   // A repair must recover missing observations without losing any existing
   // channel. Failed or poorer attempts preserve the entire valid old pair.
   if(prior&&!improvesSources(result.frame,prior))continue;
   if(needsRepair(result.frame,catalog))result.frame.repairCheckedAt=now.toISOString();
   retained.set(key,result.frame);for(const [file,bytes]of result.files)files.set(file,bytes);
   if(options.progress)options.progress({time:key,repair:!!prior,bytes:[...result.files.values()].reduce((n,b)=>n+b.length,0)});
  }catch(error){errors.push({time:key,error:error.message});}finally{clearTimeout(deadline);}
 }}
 await Promise.all([worker(),worker(),worker()]);
 frames.splice(0,frames.length,...retained.values());
 frames.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 const referenced=new Set(frames.flatMap(f=>[f.visible.file,f.infrared.file]));for(const file of files.keys())if(!referenced.has(file))files.delete(file);
 if(!frames.length)throw new Error('No valid cloud frames; existing snapshot preserved');
 const manifest={version:2,processing:clouds.PROCESSING,width:WIDTH,generatedAt:now.toISOString(),catalog,frames};archive.validate(manifest);
 return {manifest,files,errors,changed:!previous||previous.manifest.version!==2||previous.manifest.processing!==clouds.PROCESSING||JSON.stringify(previous.manifest.frames)!==JSON.stringify(frames)||JSON.stringify(previous.manifest.catalog.products)!==JSON.stringify(catalog.products)};
}
function readPrevious(){
 const old=git(['ls-remote','origin',REF]).toString().trim().split(/\s/)[0];if(!old)return {old:'',previous:null};
 if(!/^[a-f0-9]{40}$/.test(old))throw new Error('Invalid archive branch identity');
 git(['fetch','--quiet','origin',old]);
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
 let fallbackCatalog;try{fallbackCatalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/data/globe-hourly-catalog.json'),'utf8'));}catch(_){}
 const {old,previous}=readPrevious(),progress=value=>console.log(JSON.stringify(value));
 let result=await collect(previous,{fallbackCatalog,repairLimit:0,progress});
 result.errors.forEach(error=>console.error(JSON.stringify(error)));
 let commit=result.changed?publish(result,old):old;
 console.log(JSON.stringify({phase:'new weather',frames:result.manifest.frames.length,last:result.manifest.frames.at(-1).time,changed:result.changed,commit}));
 const failed=result.errors.length;
 // Publish fresh clouds before slower repairs to older colour companions.
 result=await collect(result,{catalog:result.manifest.catalog,progress});
 result.errors.forEach(error=>console.error(JSON.stringify(error)));
 if(result.changed)commit=publish(result,commit);
 console.log(JSON.stringify({phase:'colour repairs',frames:result.manifest.frames.length,last:result.manifest.frames.at(-1).time,bytes:[...result.files.values()].reduce((n,b)=>n+b.length,0),changed:result.changed,commit}));
 if(failed||result.errors.length)process.exitCode=1;
}
module.exports={BRANCH,REF,usableSources,needsRepair,improvesSources,renderFrame,collect,readPrevious,pushSnapshot,publish};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
