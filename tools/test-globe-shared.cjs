'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const sharp=require('sharp'),C=require('../js/globe-clouds.js'),A=require('../js/globe-archive.js'),runner=require('./archive-globe-clouds.cjs');
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
const now='2026-10-05T19:20:00.000Z',products=C.GROUPS.map(g=>({source:g.source,layer:g.layers[0],periods:[{start:'2026-10-04T00:00:00Z',end:'2026-10-05T18:00:00Z',step:600000}]}));
const catalog=C.validate({version:1,checkedAt:now,products});
check('a missing visible feed is allowed only in deep night, while every infrared feed is required',()=>{const blobs=C.GROUPS.map(()=>true);blobs[4]=null;assert(runner.usableSources(blobs,new Date('2026-10-05T00:00:00Z')));assert(!runner.usableSources(blobs,new Date('2026-10-05T12:00:00Z')));blobs[9]=null;assert(!runner.usableSources(blobs,new Date('2026-10-05T00:00:00Z')));});
check('transient publication errors retry with delays and the same exact branch lease',()=>{const old='a'.repeat(40),next='b'.repeat(40),delays=[],pushes=[];let failures=2;
 const result=runner.pushSnapshot(next,old,{wait:ms=>delays.push(ms),git:args=>{if(args[0]==='ls-remote')return Buffer.from(old+'\t'+runner.REF);pushes.push(args);if(failures-->0)throw new Error('Internal Server Error');return Buffer.alloc(0);}});
 assert.equal(result,next);assert.deepEqual(delays,[5000,15000]);assert.equal(pushes.length,3);assert(pushes.every(p=>p[1]==='--force-with-lease='+runner.REF+':'+old));});
check('a server error after accepting publication recovers without replacing another snapshot',()=>{const old='a'.repeat(40),next='b'.repeat(40);let pushes=0;const invoke=current=>args=>{if(args[0]==='ls-remote')return Buffer.from(current+'\t'+runner.REF);pushes++;throw new Error('Internal Server Error');};
 assert.equal(runner.pushSnapshot(next,old,{git:invoke(next),wait:()=>assert.fail('Already published')}),next);assert.equal(pushes,1);
 assert.throws(()=>runner.pushSnapshot(next,old,{git:invoke('c'.repeat(40)),wait:()=>assert.fail('Concurrent snapshot')}),/Server/);assert.equal(pushes,2);});
(async()=>{
 const bytes=await sharp({create:{width:2048,height:1024,channels:4,background:{r:180,g:180,b:180,alpha:.8}}}).webp({quality:90,alphaQuality:100}).toBuffer(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 function render(time){const frame={time:time.toISOString(),natural:true},files=new Map();for(const kind of ['visible','infrared']){const file=frame.time.replace(/[-:]/g,'').slice(0,13)+'-'+kind+'-'+hash.slice(0,16)+'.webp';frame[kind]={file,sha256:hash,bytes:bytes.length};files.set(file,bytes);}return {frame,files};}
 const snapshot=await runner.collect(null,{now,catalog,render});
 check('the independent recorder builds a bounded, hourly history across midnight',()=>{assert.equal(snapshot.manifest.frames.length,26);assert.equal(snapshot.manifest.frames.at(-1).time,'2026-10-05T18:00:00.000Z');assert.equal(snapshot.manifest.frames[0].time,'2026-10-04T17:00:00.000Z');assert(A.validate(snapshot.manifest));});
 check('timestamps, ordering, dimensions and path traversal are rejected',()=>{let bad=structuredClone(snapshot.manifest);bad.frames.reverse();assert.throws(()=>A.validate(bad));bad=structuredClone(snapshot.manifest);bad.frames[0].visible.file='../main';assert.throws(()=>A.validate(bad));bad=structuredClone(snapshot.manifest);bad.frames[0].time='2026-10-04T17:15:00.000Z';assert.throws(()=>A.validate(bad));bad=structuredClone(snapshot.manifest);bad.width=4096;assert.throws(()=>A.validate(bad));});
 check('WebP dimensions and truncation are checked from the encoded file',()=>{assert.deepEqual(A.dimensions(bytes),[2048,1024]);assert.throws(()=>A.dimensions(bytes.subarray(0,bytes.length-1)));});
 const asset=snapshot.manifest.frames[0].visible;
 assert.equal((await A.imageBlob(new Response(bytes),asset,2048)).type,'image/webp');await assert.rejects(A.imageBlob(new Response(bytes),{...asset,sha256:'0'.repeat(64)},2048),/checksum/);await assert.rejects(A.imageBlob(new Response(bytes),asset,1024),/dimensions/);checks++;console.log('PASS archived downloads require the exact size, dimensions and SHA-256');
 const unchanged=await runner.collect(snapshot,{now,catalog,render:()=>{throw new Error('Cached frames must not be fetched again');}});
 check('repeat captures preserve the same assets without redownloading them',()=>{assert(!unchanged.changed);assert.equal(unchanged.errors.length,0);});
 const nextProducts=structuredClone(products);nextProducts.forEach(p=>p.periods[0].end='2026-10-05T19:00:00Z');const nextCatalog=C.validate({version:1,checkedAt:now,products:nextProducts});
 const failed=await runner.collect(snapshot,{now,catalog:nextCatalog,render:()=>{throw new Error('Provider unavailable');}});
 check('an unavailable new hour preserves every previously valid image',()=>{assert.equal(failed.errors.length,1);assert.deepEqual(failed.manifest.frames,snapshot.manifest.frames);assert.equal(failed.files.size,snapshot.files.size);});
 const stalled=await runner.collect(snapshot,{now,catalog:nextCatalog,frameTimeout:5,render:()=>new Promise(()=>{})});check('a stalled new hour has a deadline and cannot block publication of valid history',()=>{assert.equal(stalled.errors.length,1);assert.match(stalled.errors[0].error,/timed out/);assert.deepEqual(stalled.manifest.frames,snapshot.manifest.frames);});
 await assert.rejects(runner.collect(null,{now,catalog,render:()=>{throw new Error('Unavailable');}}),/preserved/);checks++;console.log('PASS an entirely failed first capture cannot publish an empty archive');
 const broken={manifest:snapshot.manifest,files:new Map(snapshot.files)};broken.files.set(asset.file,Buffer.alloc(bytes.length));await assert.rejects(runner.collect(broken,{now,catalog,render}),/Corrupt/);checks++;console.log('PASS corrupt retained pixels stop publication');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'globe-branch-test-')),cwd=process.cwd();
 function git(args,options={}){return execFileSync('git',args,{stdio:['pipe','pipe','pipe'],...options}).toString().trim();}
 try{
  const remote=path.join(directory,'remote.git'),work=path.join(directory,'work');fs.mkdirSync(work);git(['init','--bare',remote]);process.chdir(work);git(['init','-b','main']);git(['config','user.name','test']);git(['config','user.email','test@example.com']);fs.writeFileSync('owner.txt','Owner content\n');git(['add','owner.txt']);git(['commit','-m','Initial owner content']);git(['remote','add','origin',remote]);git(['push','origin','main']);const main=git(['rev-parse','HEAD']);
  const published=runner.publish(snapshot,'');
  check('publishing changes only the generated branch and creates one parentless snapshot',()=>{assert.equal(git(['ls-remote','origin','refs/heads/main']).split(/\s/)[0],main);assert.equal(git(['rev-list','--count',published]),'1');assert(!git(['ls-tree','--name-only',published]).includes('owner.txt'));assert.equal(git(['status','--porcelain']),'');});
  const previous=runner.readPrevious();assert.equal(previous.old,published);assert.deepEqual(previous.previous.manifest.frames,snapshot.manifest.frames);checks++;console.log('PASS a fresh recorder recovers shared history from the remote branch');
  const updated=runner.publish(failed,published);assert.notEqual(updated,published);assert.throws(()=>runner.publish(snapshot,published));check('concurrent publication is protected by the old branch SHA',()=>{assert.equal(git(['ls-remote','origin',runner.REF]).split(/\s/)[0],updated);});
 }finally{process.chdir(cwd);fs.rmSync(directory,{recursive:true,force:true});}
 console.log(checks+' shared cloud checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
