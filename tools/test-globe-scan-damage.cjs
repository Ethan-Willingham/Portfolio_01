/* The actual white GeoColor scans must never enter the infrared cloud field, even from an older browser cache. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp'),{chromium,webkit}=require('playwright');
const C=require('../js/globe-clouds.js'),root=path.resolve(__dirname,'..'),folder=path.join(__dirname,'fixtures/daylight/cloud-scan-damage'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'source.json'))),files=new Map();
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end('<script src="/js/globe-math.js"></script><script src="/js/globe-data.js"></script><script src="/js/globe-clouds.js"></script>');return;}if(url.pathname.startsWith('/frame/')){const file=url.pathname.slice(7);res.writeHead(200,{'Content-Type':file.endsWith('.jpg')?'image/jpeg':'image/png'}).end(files.get(file));return;}const file=path.resolve(root,'.'+url.pathname);assert(file.startsWith(root+path.sep));res.writeHead(200,{'Content-Type':'text/javascript'}).end(fs.readFileSync(file));}catch(e){res.writeHead(404).end(e.message);}});
(async()=>{let browser;try{
 for(const frame of manifest.frames){const bytes=fs.readFileSync(path.join(folder,frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);files.set(frame.file,bytes);}
 files.set('other.png',await sharp({create:{width:2048,height:1024,channels:4,background:{r:100,g:100,b:100,alpha:1}}}).png().toBuffer());
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const mobile=process.env.SAFARI_MOBILE==='1';browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.GlobeClouds);
 const result=await page.evaluate(async frames=>{
  const C=GlobeClouds,time='2026-10-08T21:30:00.000Z',products=C.GROUPS.map(g=>({source:g.source,layer:g.layers[0],periods:[{start:'2026-10-08T21:00:00.000Z',end:time,step:600000}]})),catalog=C.validate({version:1,products,checkedAt:'2026-10-09T03:00:00.000Z'}),requests=[],cache=await caches.open(C.CACHE);
  // Simulate an existing user's cache containing both intact and white-damaged
  // imagery from the old colour pipeline, then make a fresh and an offline load.
  for(const frame of frames)await cache.put(frame.source,await fetch('/frame/'+frame.file));
  const first=await C.fetchFrame(time,2048,{catalog,fetch:async url=>{requests.push(new URL(url).searchParams.get('layers'));return fetch('/frame/other.png');}}),offline=await C.fetchFrame(time,2048,{catalog,cacheOnly:true,fetch:()=>{throw new Error('Cached infrared made a network request');}});
  const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
  return {times:first.sourceTimes,natural:first.natural,visible:first.blobs.slice(0,5),requests,hashes:await Promise.all(first.blobs.slice(5).map(hash)),offlineHashes:await Promise.all(offline.blobs.slice(5).map(hash)),offlineVisible:offline.blobs.slice(0,5)};
 },manifest.frames);
 assert.equal(result.natural,false);assert(result.visible.every(v=>v===null));assert(result.offlineVisible.every(v=>v===null));assert(result.times.slice(0,5).every(v=>v===null));assert(result.times.slice(5).every(t=>t==='2026-10-08T21:30:00.000Z'));assert.equal(result.requests.length,5);assert(result.requests.every(layer=>C.GROUPS.slice(5).some(g=>g.layers.includes(layer))));assert.deepEqual(result.hashes,result.offlineHashes);assert.deepEqual(errors,[]);
 console.log('PASS '+(mobile?'mobile WebKit':'Chrome')+' actual white GeoColor scans stay excluded on fresh and cached loads, with exact infrared clocks and identical measured inputs');
 }finally{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
