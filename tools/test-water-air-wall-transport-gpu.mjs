// Exercise the actual transport declarations with water and air cell labels.
// BEFORE and AFTER select saved modules. The harness owns its Testing child.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.env.DUMP || '/tmp/water-air-wall-transport');
assert(!out.startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const sources={},hashes={};
for(const name of ['before','after']){
  const file=process.env[name.toUpperCase()] || path.join(root,'js/liquid-air-wgpu.js');
  const code=fs.readFileSync(file,'utf8'),marker='  function create(instance, options) {';
  assert.equal(code.split(marker).length,2);
  const context={window:{}};
  vm.runInNewContext(code.replace(marker,'  global.__transportSource=TRANSPORT_DECLARATIONS;\n'+marker),context);
  sources[name]=context.window.__transportSource;assert(sources[name].includes('fn transportVelocity'));
  hashes[name]=createHash('sha256').update(code).digest('hex');fs.writeFileSync(path.join(out,name+'.js'),code);
}

async function testGPU(sources){
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU unavailable');
  const device=await adapter.requestDevice(),errors=[],results=[];
  device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  try{
    for(const [name,source] of Object.entries(sources))for(const enabled of [false,true]){
      const code=source.replace('BOUNDARY_RECONSTRUCTION:bool=false','BOUNDARY_RECONSTRUCTION:bool='+enabled)+`
@group(0) @binding(0) var<storage,read> samples:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read_write> answers:array<vec4<f32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;if(i>=arrayLength(&samples)){return;}
  let p=samples[i].xy;
  let fallback=vec2<f32>(7.0,13.0)+vec2<f32>(8.0*(p.x-12.0)-3.0*(p.y-12.0),2.0*(p.x-12.0)+5.0*(p.y-12.0));
  answers[i*2u]=vec4<f32>(transportVelocity(p,fallback),0.0,0.0);
  answers[i*2u+1u]=transportAffine(p,fallback,vec4<f32>(8.0,-3.0,2.0,5.0)/120.0,1.0/120.0);
}`;
      const module=device.createShaderModule({code}),info=await module.getCompilationInfo();
      if(info.messages.some(x=>x.type==='error'))throw Error(JSON.stringify(info.messages));
      const pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});
      for(const kind of [1,2,3])for(const solid of [0,1])for(const mask of Array.from({length:16},(_,i)=>i))for(const wallCase of [0,1,2]){
        const owned=[],make=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
        try{
          const wallSpeeds=wallCase===0?[0,0,0,0]:wallCase===1?[5,5,5,5]:[-3,6,4,-2];
          const projected=[mask&1?wallSpeeds[0]:7,mask&2?wallSpeeds[1]:7,mask&4?wallSpeeds[2]:13,mask&8?wallSpeeds[3]:13];
          const data=new Float32Array(9*12);
          for(let c=0;c<9;c++){data.set(projected,c*12);data.set([kind,solid,mask,0],c*12+4);data.set([7,7,13,13],c*12+8);}
          const cfg=new ArrayBuffer(64);new Uint32Array(cfg).set([3,3,9,0]);new Float32Array(cfg)[4]=8;
          const points=[[8.000001,12],[15.999999,12],[12,8.000001],[12,15.999999],[12,12],[10,11],[14,13]];
          const requests=points.flatMap(([x,y])=>[[x,y],[x-.01,y],[x+.01,y],[x,y-.01],[x,y+.01]]).map(([x,y])=>[x,y,0,0]);
          const input=new Float32Array(requests.flat()),size=requests.length*32;
          const usage=GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST|GPUBufferUsage.STORAGE;
          const flow=make(data.byteLength,usage),config=make(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),sample=make(input.byteLength,usage),answer=make(size,usage),read=make(size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
          for(const [b,v] of [[flow,data],[config,cfg],[sample,input]])device.queue.writeBuffer(b,0,v);
          const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:sample}},{binding:1,resource:{buffer:answer}},{binding:10,resource:{buffer:flow}},{binding:11,resource:{buffer:config}}]});
          const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
          pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(answer,0,read,0,size);device.queue.submit([encoder.finish()]);
          await read.mapAsync(GPUMapMode.READ);const bytes=read.getMappedRange().slice(0),values=new Float32Array(bytes),words=new Uint32Array(bytes);read.unmap();
          let wallError=0,derivativeError=0,tangentError=0;
          // Five requests per point, each with two vec4 results.
          for(let k=0;k<points.length;k++){
            const offset=k*40,v=Array.from(values.slice(offset,offset+2)),affine=Array.from(values.slice(offset+4,offset+8));
            if(k<4&&(mask&(1<<k)))wallError=Math.max(wallError,Math.abs(v[k<2?0:1]-wallSpeeds[k]));
            if(k>=4){
              const d=[(values[offset+16]-values[offset+8])/.02/120,(values[offset+32]-values[offset+24])/.02/120,(values[offset+17]-values[offset+9])/.02/120,(values[offset+33]-values[offset+25])/.02/120];
              derivativeError=Math.max(derivativeError,...affine.map((a,i)=>Math.abs(a-d[i])));
            }
            const [x,y]=points[k],fallback=[7+8*(x-12)-3*(y-12),13+2*(x-12)+5*(y-12)];
            if(!(mask&3))tangentError=Math.max(tangentError,Math.abs(v[0]-fallback[0]));
            if(!(mask&12))tangentError=Math.max(tangentError,Math.abs(v[1]-fallback[1]));
          }
          results.push({name,enabled,kind,solid,mask,wallCase,wallError,derivativeError,tangentError,words:Array.from(words)});
        }finally{for(const b of owned)b.destroy();}
      }
    }
    await device.queue.onSubmittedWorkDone();return {results,errors};
  }finally{device.destroy();}
}

const server=createServer((req,res)=>res.end('<!doctype html><title>Air cell wall transport</title>'));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-air-wall-'));let child,socket,serial=0;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},120000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--disable-gpu-vsync','--disable-frame-rate-limit','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await sleep(100);}assert(port,'Owned browser starts');
  const page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
  const reply=await send('Runtime.evaluate',{expression:'('+testGPU.toString()+')('+JSON.stringify(sources)+')',awaitPromise:true,returnByValue:true});
  assert(!reply.exceptionDetails,JSON.stringify(reply.exceptionDetails));const report={...reply.result.value,sourceSHA256:hashes};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  const find=(name,r)=>report.results.find(a=>a.name===name&&a.enabled===r.enabled&&a.kind===r.kind&&a.solid===r.solid&&a.mask===r.mask&&a.wallCase===r.wallCase);
  let unchanged=0,repaired=0;
  for(const r of report.results.filter(x=>x.name==='after')){
    if(!r.enabled||r.kind!==2||r.solid||r.mask===0){assert.deepEqual(r.words,find('before',r).words,'Unchanged transport branch');unchanged++;}
    if(r.enabled&&r.kind===2&&!r.solid){assert(r.wallError<.0001,'Closed wall normal constraint '+r.mask);assert(r.derivativeError<.0001,'Consistent affine derivative '+r.mask);assert(r.tangentError<.0001,'Preserved tangential motion '+r.mask);if(r.mask){assert(find('before',r).wallError>1,'Baseline reproduces wall bypass');repaired++;}}
  }
  const result={pass:true,configurations:report.results.length,unchangedPairs:unchanged,repairedMasks:repaired,sourceSHA256:hashes,scope:'Actual shader declarations, stationary and moving closed walls, air/water/unsupported labels and feature-off paths. Does not certify gas retention or machine pressure.'};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
  for(const p of pending.values())clearTimeout(p.timer);socket?.close();server.close();
  if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(timer);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
