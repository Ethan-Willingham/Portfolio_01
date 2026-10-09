#!/usr/bin/env node
// Real GPU full-frame differential against a saved pre-change engine.
// BEFORE=/absolute/reference.js DUMP=/absolute/output node tools/test-water-pressure-feature-off-gpu.mjs
// Owns the exact dedicated Chrome child. No personal browser or save is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert(process.env.BEFORE,'BEFORE identifies the saved engine');
const output=path.resolve(process.env.DUMP || '/tmp/water-pressure-feature-off');
const files={before:path.resolve(process.env.BEFORE),after:path.resolve(process.env.AFTER || path.join(root,'js/liquid-wgpu.js'))};
const sources=Object.fromEntries(Object.entries(files).map(([label,file])=>[label,fs.readFileSync(file,'utf8')]));
const hashes=Object.fromEntries(Object.entries(sources).map(([label,source])=>[label,createHash('sha256').update(source).digest('hex')]));
const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
for(const label of Object.keys(sources)) {
  assert.equal(sources[label].split(marker).length,2,'Unique factory marker '+label);
  sources[label]=sources[label].replace(marker,marker+`\n  window.__offFactories.${label}=window.LiquidWGPU;`);
}
function observeGPU() {
  const observation=window.__offObservation={buffers:[],passes:[],pipelines:[],requests:0};
  const devices=new WeakMap(),encoders=new WeakMap();
  const owner=device=>{if(!devices.has(device))devices.set(device,window.__offOwner || 'default');return devices.get(device);};
  const createBuffer=GPUDevice.prototype.createBuffer;
  GPUDevice.prototype.createBuffer=function(options){
    observation.buffers.push({owner:owner(this),label:options.label || '',size:options.size});
    return createBuffer.call(this,options);
  };
  const createPipeline=GPUDevice.prototype.createComputePipeline;
  GPUDevice.prototype.createComputePipeline=function(options){
    observation.pipelines.push({owner:owner(this),label:options.label || ''});
    return createPipeline.call(this,options);
  };
  const createEncoder=GPUDevice.prototype.createCommandEncoder;
  GPUDevice.prototype.createCommandEncoder=function(options){const encoder=createEncoder.call(this,options);encoders.set(encoder,owner(this));return encoder;};
  const begin=GPUCommandEncoder.prototype.beginComputePass;
  GPUCommandEncoder.prototype.beginComputePass=function(options){
    observation.passes.push({owner:encoders.get(this) || 'default',label:options?.label || ''});
    return begin.call(this,options);
  };
}
async function fullFrameDifferential() {
  const checks=[],captures=[],renderCaptures=[],bootLogs=[];
  function check(value,name,detail){checks.push({name,pass:!!value,...(value?{}:{detail})});if(!value)throw Error(name+': '+JSON.stringify(detail));}
  const keys=['x','y','vx','vy','g00','g01','g10','g11','density','aeration','type','origin','sleeping','frozen','restFrames'];
  const hashes=words=>{
    let h=2166136261;
    for(const word of words) {h=Math.imul(h^(word&255),16777619)>>>0;h=Math.imul(h^((word>>>8)&255),16777619)>>>0;
      h=Math.imul(h^((word>>>16)&255),16777619)>>>0;h=Math.imul(h^(word>>>24),16777619)>>>0;}
    return h.toString(16).padStart(8,'0');
  };
  async function read(instance) {
    const count=instance.uploadedCount,sizes={pos:count*16,affine:count*16,aux:count*16,flag:count*4};
    const buffers=[],encoder=instance.device.createCommandEncoder({label:'feature-off.capture'});
    try {
      for(const [key,size] of Object.entries(sizes)) {
        const buffer=instance.device.createBuffer({label:'feature-off.'+key,size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        buffers.push({key,buffer,size});encoder.copyBufferToBuffer(instance.buf[key],0,buffer,0,size);
      }
      instance.queue.submit([encoder.finish()]);
      await Promise.all(buffers.map(({buffer})=>buffer.mapAsync(GPUMapMode.READ)));
      return Object.fromEntries(buffers.map(({key,buffer})=>[key,Uint32Array.from(new Uint32Array(buffer.getMappedRange()))]));
    } finally {for(const {buffer} of buffers){try{buffer.unmap();}catch{}buffer.destroy();}}
  }
  async function create(label,seed,sparse) {
    let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const count=1024,arrays=Object.fromEntries(keys.map(key=>[key,new Float32Array(count)]));
    for(let i=0;i<count;i++) {
      arrays.x[i]=100+(i%32)*1.25+(random()-.5)*.12;
      arrays.y[i]=200+Math.floor(i/32)*1.25+(random()-.5)*.12;
      arrays.vx[i]=(random()-.5)*5;arrays.vy[i]=(random()-.5)*5;
      arrays.density[i]=4;arrays.aeration[i]=(i%17)*.001;
    }
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;document.body.appendChild(canvas);
    const ring=[];for(let i=0;i<20;i++){const angle=i/20*Math.PI*2;ring.push(124+Math.cos(angle)*10,250+Math.sin(angle)*8,0,0);}
    window.__offOwner=label;
    const instance=window.__offFactories[label].create({mainCanvas:canvas,liquid:{
      maxParticles:count,arrays,getCount:()=>count,getMutationSeq:()=>1,takeOps:()=>[],peekOps:()=>[],
      world:{COLS:64,TILE:8,TOTAL_ROWS:64},
      getView:()=>({camX:0,camY:0,dpr:1,worldScale:1,canvasW:512,canvasH:512,viewW:512,viewH:512,
        regionMinX:0,regionMinY:0,regionMaxX:512,regionMaxY:512}),
      fillTerrainSolid(col,row,w,h,out){for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+x]=row+y>=45 || col+x<=2 || col+x>=61 ? 1:0;},
      getGameState:()=>({player:null,rocket:{active:false},explosions:[],guests:[{x:124,y:250,hw:12,hh:10,pts:ring}]})
    }});
    await instance.readyPromise;
    check(instance.simActive&&instance.renderActive,label+' ordinary solver boots',{sim:instance.simActive,render:instance.renderActive});
    check(!instance.pressureModel,label+' omits pressure model');
    instance.setSimParam('SPARSE',sparse?1:0);instance.setSimParam('SPARSE_MIN_CELLS',0);
    instance.setSimParam('FIXED_STEP',1);instance.setSimParam('TIMESCALE',1);
    // Mirrors are not inputs to this fixed-buffer comparison; hold the exact
    // authored bounds and count while resident particles execute full frames.
    instance.readbackReady=false;instance.readbackPending=false;
    bootLogs.push({label,seed,sparse,simActive:instance.simActive,defaultModel:!!instance.pressureModel});
    return {instance,canvas};
  }
  try {
    for(const sparse of [false,true])for(const seed of [37,137,991]) {
      const before=await create('before',seed,sparse),after=await create('after',seed,sparse);
      try {
        for(let frame=1;frame<=20;frame++) {
          for(const [label,holder] of [['before',before],['after',after]]) {
            window.__offOwner=label;holder.instance.update(1/60);await holder.instance.queue.onSubmittedWorkDone();
            check(holder.instance.simActive,label+' solver remains active at frame '+frame);
          }
          if(![1,10,20].includes(frame))continue;
          window.__offOwner='before';const a=await read(before.instance);
          window.__offOwner='after';const b=await read(after.instance);
          const row={sparse,seed,frame,count:after.instance.uploadedCount,buffers:{}};
          for(const key of Object.keys(a)) {
            let differences=0;const examples=[];
            for(let i=0;i<a[key].length;i++)if(a[key][i]!==b[key][i]){differences++;if(examples.length<4)examples.push({index:i,before:a[key][i],after:b[key][i]});}
            row.buffers[key]={words:a[key].length,differences,beforeHash:hashes(a[key]),afterHash:hashes(b[key])};
            check(differences===0,'Exact '+key+' words '+JSON.stringify({sparse,seed,frame}),{differences,examples});
          }
          const positions=new Float32Array(b.pos.buffer);
          check(Array.from(positions).every(Number.isFinite),'Finite resident positions and velocities');
          check(after.instance.uploadedCount===1024,'Particle count conserved in fixed fixture');
          captures.push(row);
        }
        const rendered={};
        for(const [label,holder] of [['before',before],['after',after]]) {
          window.__offOwner=label;
          const instance=holder.instance,canvas=instance.renderCanvas;
          // Copy the actual render target before yielding to presentation.
          // A presented WebGPU canvas may be cleared before a 2D readback.
          instance.renderCtx.configure({device:instance.device,format:instance.renderFormat,
            alphaMode:'premultiplied',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
          check(instance.draw()===1024,label+' draws every fixture particle');
          check(instance.renderParamsHost[7]===0,label+' volume rendering is off by default');
          const bytesPerRow=Math.ceil(canvas.width*4/256)*256;
          const pixels=instance.device.createBuffer({label:'feature-off.render-pixels',
            size:bytesPerRow*canvas.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
          try {
            const encoder=instance.device.createCommandEncoder({label:'feature-off.render-capture'});
            encoder.copyTextureToBuffer({texture:instance.renderCtx.getCurrentTexture()},
              {buffer:pixels,bytesPerRow},{width:canvas.width,height:canvas.height});
            instance.queue.submit([encoder.finish()]);await pixels.mapAsync(GPUMapMode.READ);
            const mapped=new Uint8Array(pixels.getMappedRange()),rgba=new Uint8Array(canvas.width*canvas.height*4);
            for(let row=0;row<canvas.height;row++)rgba.set(mapped.subarray(row*bytesPerRow,row*bytesPerRow+canvas.width*4),row*canvas.width*4);
            rendered[label]=rgba;
          } finally {pixels.unmap();pixels.destroy();}
        }
        let differences=0,visible=0;
        for(let i=0;i<rendered.before.length;i++) {
          if(rendered.before[i]!==rendered.after[i])differences++;
          if(i%4===3&&rendered.before[i]>0)visible++;
        }
        check(visible>0,'Feature-off rendering contains visible water');
        check(differences===0,'Exact feature-off RGBA pixels '+JSON.stringify({sparse,seed}),{differences});
        renderCaptures.push({sparse,seed,pixels:rendered.before.length/4,visible,differences,
          beforeHash:hashes(new Uint32Array(rendered.before.buffer)),afterHash:hashes(new Uint32Array(rendered.after.buffer))});
      } finally {before.instance.dispose();after.instance.dispose();before.canvas.remove();after.canvas.remove();}
    }
    const observation=window.__offObservation;
    for(const name of ['buffers','passes','pipelines']) {
      const rows=label=>observation[name].filter(r=>r.owner===label).map(({owner,...r})=>r);
      check(JSON.stringify(rows('before'))===JSON.stringify(rows('after')),'Identical GPU '+name+' labels/counts/sizes');
      check(observation[name].filter(r=>/liquid\.air\.|afterAir/.test(r.label)).length===0,'No air '+name);
    }
    return {pass:true,seeds:[37,137,991],fixtures:6,captures,renderCaptures,checks,bootLogs,
      observation:{buffers:observation.buffers.length,passes:observation.passes.length,pipelines:observation.pipelines.length,
        airBuffers:0,airPasses:0,airPipelines:0},
      limitation:'Fixed authored mirror bounds and 20 full resident frames per fixture. Covers dense/sparse water and a guest boundary, not every game population.'};
  } catch(error) {window.__offFailure={message:error.message,checks,captures,bootLogs,observation:window.__offObservation};throw error;}
}
fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-feature-off-browser-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try {
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/feature-off.html') {
      response.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><script>window.__offFactories={}</script><script src="/before.js"></script><script src="/after.js"></script>');return;
    }
    if(pathname==='/before.js'||pathname==='/after.js') {
      response.writeHead(200,{'Content-Type':'text/javascript'}).end(sources[pathname==='/before.js'?'before':'after']);return;
    }
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    let data=fs.readFileSync(file);
    if(pathname==='/js/sluice.js') {const text=data.toString(),end=text.lastIndexOf('})();');data=Buffer.from(text.slice(0,end)+'window.__offGame=function(source){return eval(source);};\n'+text.slice(end));}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
  } catch {response.writeHead(404).end();}
});
let chrome,socket,sequence=0;
const pending=new Map(),errors=[],logs=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},180000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function cleanup(){try{socket?.close();}catch{}server.close();
  if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');
    await Promise.race([stopped,sleep(2000)]);if(chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await stopped;}}
  for(const p of pending.values())clearTimeout(p.timer);fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.once('SIGINT',()=>cleanup().finally(()=>process.exit(130)));process.once('SIGTERM',()=>cleanup().finally(()=>process.exit(143)));
const report={schema:'water-pressure-feature-off-gpu-v1',startedUTC:new Date().toISOString(),sources:files,sha256:hashes,errors,logs};
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu',
    '--use-angle=metal','--disable-gpu-sandbox','--disable-gpu-vsync','--disable-frame-rate-limit','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let launchError;chrome.once('error',error=>{launchError=error;});const active=path.join(profile,'DevToolsActivePort');
  for(let n=0;!fs.existsSync(active)&&n<200;n++){if(launchError)throw launchError;assert.equal(chrome.exitCode,null);await sleep(100);}
  assert(fs.existsSync(active),'Owned browser endpoint');const debug=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
  let pageTarget;
  for(let n=0;n<100&&!pageTarget;n++){
    assert.equal(chrome.exitCode,null,'Owned browser remains alive during target creation');
    const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
    pageTarget=pages.find(p=>p.type==='page'&&p.webSocketDebuggerUrl);
    if(!pageTarget)await sleep(100);
  }
  assert(pageTarget,'Owned browser creates a page target');
  socket=new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    else if(m.method==='Runtime.consoleAPICalled') {const message=m.params.args.map(a=>a.value||a.description).join(' ');logs.push(message);if(m.params.type==='error'||/LiquidWGPU.*FAIL/.test(message))errors.push(message);}
  });
  await send('Runtime.enable');await send('Page.enable');report.browser=await send('Browser.getVersion');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${observeGPU.toString()})();`});
  const base=`http://127.0.0.1:${server.address().port}`;
  await send('Page.navigate',{url:base+'/feature-off.html'});
  for(let n=0;n<100&&!await evaluate('!!window.__offFactories?.after');n++)await sleep(100);
  try {report.differential=await evaluate(`(${fullFrameDifferential.toString()})()`);}
  catch(error){report.failure=await evaluate('window.__offFailure || null');throw error;}
  report.defaultBoots=[];
  for(const kind of ['toy','game']) {
    await send('Page.navigate',{url:base+(kind==='toy'?'/archive/water-smoke-slime/water-smoke-slime.html':'/grand-motherload.html?dev=1&nosave=1&nopause=1')});
    let ready=false;
    for(let n=0;n<600;n++) {ready=await evaluate(kind==='toy'?'!!window.__toy && __toy.stats().waterState!=="booting"':'!!window.__offGame && __offGame("introPhase===\'done\'")');if(ready)break;await sleep(100);}
    assert(ready,kind+' boot settles');await sleep(2000);
    const state=await evaluate(kind==='toy'?`({version:__toy.version,water:__toy.stats().waterState,air:__toy.airStats(),model:!!__toy.liquid().pressureModel})`:
      `__offGame('({version:GAME_VERSION,water:liquidWGPU.simActive,model:!!liquidWGPU.pressureModel})')`);
    const observation=await evaluate('({buffers:__offObservation.buffers.filter(r=>/liquid\\.air\\./.test(r.label)),passes:__offObservation.passes.filter(r=>/liquid\\.air\\.|afterAir/.test(r.label)),pipelines:__offObservation.pipelines.filter(r=>/liquid\\.air\\./.test(r.label))})');
    assert.equal(state.model,false,kind+' model omitted');assert(kind==='toy'?state.water==='on':state.water,kind+' hardware water active');
    assert.equal(observation.buffers.length+observation.passes.length+observation.pipelines.length,0,kind+' creates/encodes no air resources');
    if(kind==='toy')assert.equal(state.air.enabled,false);
    report.defaultBoots.push({kind,state,airBuffers:0,airPasses:0,airPipelines:0});
  }
  report.finishedUTC=new Date().toISOString();report.pass=errors.length===0&&report.differential.pass;
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,fixtures:report.differential.fixtures,captures:report.differential.captures.length,
    air:report.differential.observation,defaultBoots:report.defaultBoots,errors,report:path.join(output,'report.json')}));
  assert(report.pass,'Whole-frame feature-off GPU proof');
} catch(error) {report.pass=false;report.failureMessage=error.message;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');throw error;}
finally {await cleanup();}
