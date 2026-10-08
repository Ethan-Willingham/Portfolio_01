/* Palette codes must stay lossless and be decoded before image reduction.
   Own the testing browser and close it in finally. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),sharp=require('sharp'),{chromium,webkit}=require('playwright');
const C=require('../js/globe-clouds.js'),runner=require('./archive-globe-clouds.cjs'),root=path.resolve(__dirname,'..');
(async()=>{
 const fixture=path.join(__dirname,'fixtures/daylight'),jpeg=await sharp(path.join(fixture,'thermal-jpeg-codes.png')).ensureAlpha().raw().toBuffer(),lossless=await sharp(path.join(fixture,'thermal-lossless-codes.png')).ensureAlpha().raw().toBuffer();C.normalizeThermal(jpeg);C.normalizeThermal(lossless);
 let falseHot=0;for(let i=0;i<jpeg.length;i+=4)if(jpeg[i]>225&&lossless[i]<150)falseHot++;
 assert.equal(falseHot,554,'The real same-time source pair reproduces the white-dot regression');
 assert.equal(new URL(C.urls('2026-10-06T01:30:00Z',2048)[7]).searchParams.get('format'),'image/png');console.log('PASS real JPEG palette corruption reproduces 554 false bright pixels; requests use its clean lossless counterpart');
 const coldGrey=await sharp(path.join(fixture,'thermal-cold-grey-codes.png')).ensureAlpha().raw().toBuffer(),naive=Buffer.from(coldGrey),resolved=Buffer.from(coldGrey);C.normalizeThermal(naive);C.normalizeThermal(resolved,256);
 const points=[[104,27],[104,28],[104,29]];for(const [x,y]of points){const at=(y*256+x)*4;assert(naive[at]<30,'The real cold-grey fixture reproduces a dark hole');assert(resolved[at]>230,'Nearby unambiguous cold codes resolve the cold-grey island');assert.equal(resolved[at+3],coldGrey[at+3]);}
 for(let at=0;at<coldGrey.length;at+=4)if(coldGrey[at+3]===0)assert.equal(resolved[at+3],0);
 const warm=Buffer.alloc(64*32*4);for(let at=0;at<warm.length;at+=4)warm.set([54,54,54,255],at);C.normalizeThermal(warm,64);assert(warm.every((v,i)=>i%4===3?v===255:v===0),'Unsupported warm greys remain warm instead of becoming clouds');console.log('PASS actual cold-grey holes resolve without painting warm terrain or missing data');
 const storm=await sharp(path.join(fixture,'thermal-storm-core-codes.png')).ensureAlpha().raw().toBuffer(),wrong=Buffer.from(storm),fixed=Buffer.from(storm);C.normalizeThermal(wrong);C.normalizeThermal(fixed,4096);
 const stormPoints=[[875,70],[873,72],[877,72],[909,80],[879,68],[871,81],[939,109],[842,123]];
 for(const [x,y]of stormPoints){const at=(y*4096+x)*4;assert(wrong[at]<115,'The October 7 storm fixture reproduces a false dark core');assert(fixed[at]>230,'A bounded cold core takes the cold palette branch');assert.equal(fixed[at+3],storm[at+3]);}
 assert(new Set(stormPoints.map(([x,y])=>fixed[(y*4096+x)*4])).size>1,'The correction retains the observed grey-code variation');
 console.log('PASS actual larger storm cores retain cloud texture instead of becoming dark holes');
 for(const mode of ['long','open','unsupported']){
  const w=128,h=64,pixels=Buffer.alloc(w*h*4);for(let at=0;at<pixels.length;at+=4)pixels.set([255,0,0,255],at);
  const end=mode==='long'?50:23;for(let y=20;y<23;y++)for(let x=20;x<end;x++)pixels.set([54,54,54,255],(y*w+x)*4);
  if(mode==='open')pixels.set([0,0,0,0],(20*w+19)*4);
  if(mode==='unsupported')for(let y=19;y<24;y++)for(let x=19;x<24;x++)if(x<20||x>=23||y<20||y>=23)pixels.set([0,0,115,255],(y*w+x)*4);
  C.normalizeThermal(pixels,w);assert(pixels[(21*w+21)*4]<115,'Long, uncovered and insufficiently cold patches retain their warm interpretation');
  if(mode==='open')assert.equal(pixels[(20*w+19)*4+3],0,'Missing alpha remains missing');
 }
 console.log('PASS long bands, open coverage and unsupported grey regions are preserved');
 const validBlack=await sharp({create:{width:2048,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer(),render=await runner.renderFrame(new Date('2026-10-05T12:00:00Z'),{fetch:async()=>new Response(validBlack,{headers:{'content-type':'image/png'}})}),ir=await sharp(render.files.get(render.frame.infrared.file)).ensureAlpha().raw().toBuffer();assert(ir[(512*2048+1024)*4+3]>200,'Native valid PNG black remains covered');console.log('PASS recorder preserves lossless missing-data alpha without masking valid black codes');
 const pixels=Buffer.alloc(256*128*4);for(let i=0;i<pixels.length;i+=4)pixels.set((i/4)%256%2?[255,0,0,255]:[100,100,100,255],i);const checker=await sharp(pixels,{raw:{width:256,height:128,channels:4}}).png().toBuffer();
 const server=http.createServer((req,res)=>{const name=req.url.split('?')[0];if(name==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<script src="/js/globe-data.js"></script><script src="/js/globe-clouds.js"></script><script src="/js/globe-replay.js"></script>');if(name==='/checker.png')return res.writeHead(200,{'Content-Type':'image/png'}).end(checker);try{res.writeHead(200,{'Content-Type':'text/javascript'}).end(fs.readFileSync(path.join(root,name)));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{for(const mobile of(process.env.SKIP_WEBKIT==='1'?[false]:[false,true])){let browser;try{
  browser=mobile?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Users/ethan/.local/bin/agent-chrome-for-testing':chromium.executablePath()),headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const result=await page.evaluate(async()=>{const blob=await(await fetch('/checker.png')).blob(),blobs=Array(10).fill(null);for(const i of[5,6,7])blobs[i]=blob;const fallback=await GlobeReplay.prepare(blobs,64,false,256),worker=GlobeReplay.preparer('/js/globe-replay.js');
   const fullPixels=image=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const out=ctx.getImageData(0,0,256,128).data;if(image.close)image.close();else image.width=image.height=1;canvas.width=canvas.height=1;return out;};
   try{const packed=await worker.prepare(blobs,64,false,0,'fixture',256),index=(16*64+57)*4;
    const direct=await GlobeReplay.prepareFull(blobs,256,false,false),queued=await worker.prepareFull(blobs,256,false,false,0,'full'),a=direct.images.map(fullPixels),b=queued.images.map(fullPixels);
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const source=ctx.getImageData(0,0,256,128).data;canvas.width=canvas.height=1;
    const expected=Array(10).fill(null);for(const i of[5,6,7])expected[i]=source.slice();GlobeClouds.maskScanArtifacts(expected,256);for(const i of[5,6,7])expected[i]=GlobeData.featherCoverage(GlobeClouds.normalizeThermal(expected[i],256),256);
    const original=GlobeClouds.composite(expected,256,'infrared'),originalCanvas=document.createElement('canvas');originalCanvas.width=256;originalCanvas.height=128;const originalContext=originalCanvas.getContext('2d');originalContext.putImageData(new ImageData(original,256,128),0,0);const originalPixels=originalContext.getImageData(0,0,256,128).data;originalCanvas.width=originalCanvas.height=1;
    let difference=0,fullEqual=true;for(let map=0;map<2;map++)for(let at=0;at<a[map].length;at++){if(a[map][at]!==b[map][at])fullEqual=false;if(map===1)difference=Math.max(difference,Math.abs(a[map][at]-originalPixels[at]));}
    return {fallback:[...fallback.pixels.slice(index,index+4)],worker:[...packed.pixels.slice(index,index+4)],stats:worker.stats(),equal:packed.pixels.every((v,i)=>v===fallback.pixels[i]),fullEqual,fullDifference:difference,fullCoverage:direct.coverage,queuedCoverage:queued.coverage};
   }finally{worker.close();}});
  const expected=Math.round(require('../js/globe-replay.js').pack(new Uint8Array(4),new Uint8Array([117,117,117,255]),false,new Uint8Array(4))[2]);assert(Math.abs(result.fallback[2]-expected)<=3,'Temperature decoding precedes palette interpolation and retains the documented display curve');assert(result.fallback[3]>200);assert(result.equal,'Worker and main-thread fallback produce identical reduced cloud maps');assert(result.fullEqual,'Full-size worker and fallback pixels match');assert(result.fullDifference<=1,'Full-size maps preserve the original thermal compositor');assert.equal(result.fullCoverage,result.queuedCoverage);assert.equal(errors.length,0);console.log('PASS '+(mobile?'WebKit':'Chrome')+' compact and full maps preserve the same decoded temperatures in worker and fallback: '+JSON.stringify(result));
 }finally{if(browser)await browser.close();}}}finally{await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
