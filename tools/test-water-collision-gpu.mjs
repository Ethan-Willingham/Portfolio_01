#!/usr/bin/env node
// Actual GPU differential for ordinary liquid collision and queued fallback.
// BEFORE=/path/to/reference.js AFTER=/path/to/candidate.js DUMP=/tmp/water-collision node tools/test-water-collision-gpu.mjs
// DRY_RUN=1 validates snapshots and fixtures without launching a browser.
// Test-only counters prove branch coverage; production source files are never edited.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8296), debugPort = port + 1000;
const out = process.env.DUMP || '/tmp/sluice-water-collision-gpu';
const timeoutMs = Number(process.env.TIMEOUT_MS || 180000);
const benchMode = process.env.BENCH === '1';
const beforeRef = '5344bd8';
const paths = { before: process.env.BEFORE || null, after: process.env.AFTER || path.join(root,'js/liquid-wgpu.js') };
const sources = {}, metadata = {};
for (const [name, filename] of Object.entries(paths)) {
  const source = filename ? fs.readFileSync(filename, 'utf8') : execFileSync('git',['show',beforeRef+':js/liquid-wgpu.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const marker = '  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  const queued = source.includes('var WGSL_LIQUID_COOPERATIVE') || source.includes('var WGSL_LIQUID_FALLBACK_QUEUE');
  const compact = source.includes('fn liquidCompactFallback(');
  const pipeline = 'WGSL_SIM_PARAMS + simBind(6) + WGSL_COLLIDE';
  assert.equal(source.split(marker).length, 2, name + ' export anchor');
  if (!queued) assert.equal(source.split(pipeline).length, 2, name + ' ordinary pipeline anchor');
  sources[name] = source.replace(pipeline, benchMode || queued ? pipeline : 'WGSL_SIM_PARAMS + simBind(6) + waterTestCounters(WGSL_COLLIDE)').replace(marker, marker + String.raw`
  function waterTestCounters(shader) {
    var counters = '@group(0) @binding(7) var<storage, read_write> waterTestCount : array<atomic<u32>>;\n';
    shader = counters + shader;
    shader = shader.replace('  if (guestInsideCount > 0) {', '  if (guestInsideCount > 0) {\n    atomicAdd(&waterTestCount[0], 1u);');
    var searchNo = 0;
    shader = shader.replaceAll('    if (!canProject) {', function (match) {
      searchNo++; return match + '\n      atomicAdd(&waterTestCount[' + searchNo + '], 1u);';
    });
    shader = shader.replace(/(fn guestExitClear\([^]*?\) -> bool \{)/, '$1\n  atomicAdd(&waterTestCount[3], 1u);');
    if (searchNo !== 2) throw new Error('Ordinary fallback anchors changed');
    return shader;
  }
  window.__waterCollisionAPIs.${name} = {
    waterQueued: ${queued}, waterCompact: ${compact}, buildBuffers: buildBuffers, buildCollidePipelines: buildCollidePipelines,
    uploadTerrainMask: uploadTerrainMask, writeGameParams: writeGameParams,
    writeSimParams: writeSimParams, runCollide: runCollide, snowShader: WGSL_SNOW_COLLIDE, waterShader: typeof WGSL_LIQUID_COLLIDE === 'undefined' ? WGSL_COLLIDE : WGSL_LIQUID_COLLIDE, readbackBuffer: readbackBuffer
  };`);
  new vm.Script(sources[name], { filename:filename||beforeRef+':js/liquid-wgpu.js' });
  metadata[name] = { path:filename?path.resolve(filename):null,ref:filename?null:beforeRef, sha256: createHash('sha256').update(source).digest('hex'),
    queued, compact, instrumentation:benchMode?'None; timestamps wrap production compute passes.':queued?'Production queue count, no shader instrumentation.':'Ordinary collision branch/ray counters only, existing spare storage binding7.' };
}

const shaderContext=vm.createContext({window:{__waterCollisionAPIs:{}}});
for(const name of ['before','after']) vm.runInContext(sources[name],shaderContext,{filename:paths[name]||beforeRef});
assert.equal(shaderContext.window.__waterCollisionAPIs.before.snowShader,
  shaderContext.window.__waterCollisionAPIs.after.snowShader,'Assembled snow collision WGSL remains byte-identical');
const snowShaderSHA256=createHash('sha256').update(shaderContext.window.__waterCollisionAPIs.before.snowShader).digest('hex');
for(const name of ['before','after']) metadata[name].waterShaderSHA256=createHash('sha256').update(shaderContext.window.__waterCollisionAPIs[name].waterShader).digest('hex');

function makeFixtures() {
  const materialFlag = type => (type & 3) | ((type & 4) << 4) | 8 | (29 << 8) | (71 << 24);
  const particle = (x, y, options = {}) => ({
    pos: [x, y, options.vx ?? 0, options.vy ?? 0],
    aux: [options.density ?? 3.2, options.pressure ?? .2, options.px ?? x, options.py ?? y],
    flag: (options.flag ?? materialFlag(options.type ?? 0)) >>> 0, unchanged: !!options.unchanged
  });
  const polygon = (xy, velocity = () => [0, 0]) => {
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2,
      hw: (Math.max(...xs) - Math.min(...xs)) / 2, hh: (Math.max(...ys) - Math.min(...ys)) / 2,
      pts: xy.flatMap((p, i) => [...p, ...velocity(p, i)]) };
  };
  const box = (l,t,r,b) => polygon([[l,t],[r,t],[r,b],[l,b]]);
  const controls = () => [particle(100,100,{flag:materialFlag(0)|32,unchanged:true}),
    particle(40,40,{flag:materialFlag(0)|16,unchanged:true}), particle(-20,40,{unchanged:true}),
    particle(100,100,{type:5,unchanged:true})];
  const scenes = [];
  const add = (name, particles, options = {}) => scenes.push({ name, particles: particles.concat(controls()),
    activeCount: particles.length, guests: [], terrain: 'empty', region: [0,-128,256,256],
    modes: ['standalone','shared-encoder'], snowOnly: false, ...options });
  add('shallow-deadband', [particle(119.7,94,{vx:-12,vy:17}),particle(119.98,100),particle(118.6,106)],
    {guests:[box(80,80,120,120)],keepPosition:[0,1,2]});
  add('deep-water-oil-minerals', [0,1,2,3].map((type,i)=>particle(114,88+i*7,{type,vx:-1700,vy:1300})),
    {guests:[box(80,80,120,120)],mustMove:true});
  add('floor-pinch',[particle(110,127.1)],{terrain:'floor',guests:[box(80,100,120,127.4)],requireEdge:true});
  add('terrain-hit-plus-guest-aeration',[particle(110,127.1,{px:110,py:126.8,vx:30,vy:20,pressure:.2})],
    {terrain:'floor',guests:[box(80,100,120,127.4)],requireEdge:true,expectPressure:.44});
  add('wall-pinch',[particle(127.1,110)],{terrain:'wall',guests:[box(100,80,127.4,120)],requireEdge:true});
  for (const dir of [-1,1]) {
    const right = dir < 0 ? 89 : 90;
    add('rig-pinch-'+dir,[particle(right-.3,90)],{guests:[box(right-10,70,right,110)],
      player:{active:true,x:88,y:78,dir,vx:0,vy:0},requireEdge:true});
  }
  const overlap=[box(80,80,110,120),box(100,80.2,130,120)];
  for (const reverse of [false,true]) add('overlap-'+reverse,[particle(105,100),particle(109.98,100),particle(102,80.3)],
    {guests:reverse?overlap.slice().reverse():overlap,requireEdge:true,mustMove:true});
  const concave=[polygon([[80,80],[120,80],[120,92],[96,92],[96,120],[80,120]]),
    polygon([[90,84],[130,84],[130,120],[114,120],[114,100],[90,100]])];
  add('concave-union',[[94,91],[94,94],[83,110],[110,85],[95.95,91.95]].map(p=>particle(...p)),
    {guests:concave,requireEdge:true});
  add('no-clear-exit',[particle(112,112,{vx:30,vy:-17})],
    {guests:[box(92,92,132,132)],terrain:'cavity',requireMidpoint:true});
  add('midpoint-only-exit',[particle(97,127.3)],
    {guests:[box(64,64,288,128)],terrain:'midpoint-pocket',requireMidpoint:true,mustMove:true});
  add('ordered-distance-tie',[particle(2,1.999999)],
    {guests:[box(0,0,4,4)],terrain:'corner-roof',requireEdge:true,expectPosition:[2,4.5]});
  add('zero-depth-boundary',[particle(80,100)],{guests:[box(80,80,120,120)],requireEdge:true});
  const moving=polygon([[80,80],[120,80],[120,120],[80,120]],p=>[8+(p[1]-80)*.6,-12]);
  add('moving-face-slots',[particle(117,100,{vx:-30,vy:37}),particle(117,118,{vx:-10,vy:18})],
    {guests:[moving],slots:[0,2,4],mustMove:true});
  add('bowl-and-guest',[particle(100,112.3),particle(100,132,{vy:25})],
    {bowls:[60,140,100,32],guests:[box(85,112,115,124)]});
  add('terrain-swept-motion',[particle(100,140,{px:100,py:110,vx:0,vy:900})],{terrain:'floor'});
  add('large-active-and-tail',Array.from({length:259},(_,i)=>particle(100+i%12,127.1,{vx:i%13-6,vy:20})),
    {guests:[box(80,100,120,127.4)],terrain:'floor',requireEdge:true});
  add('shared-water-snow-water',[],{particles:[particle(110,127.1),
    particle(111,127.1,{flag:65|16|(29<<8)}),particle(100,100,{flag:materialFlag(0)|32,unchanged:true})],
    activeCount:2,guests:[box(80,100,120,127.4)],terrain:'floor',modes:['shared-encoder'],sequence:[false,true,false]});
  add('zero-count',[],{particles:[],activeCount:0});
  add('snow-path-unchanged',[particle(119.7,94,{type:5,flag:65|16|(29<<8)}),particle(110,127.1,{type:5,flag:65|16|(29<<8)})],
    {particles:[particle(119.7,94,{type:5,flag:65|16|(29<<8)}),particle(110,127.1,{type:5,flag:65|16|(29<<8)})],
      snowOnly:true,guests:[box(80,100,120,127.4)],terrain:'floor',exact:true});
  return scenes;
}
async function runGPU() {
  const capacity = 320;
  const fixtures = window.__waterMakeFixtures();
  if (window.__waterCollisionAPIs.before.snowShader !== window.__waterCollisionAPIs.after.snowShader) throw new Error("Snow collision shader changed");
  if (!navigator.gpu) throw new Error('WebGPU unavailable');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const gpuErrors = [];
  device.addEventListener('uncapturederror', event => gpuErrors.push(event.error.message));
  let destroying = false;
  device.lost.then(info => { if (!destroying) gpuErrors.push('device lost: ' + info.message); });
  const adapterInfo = adapter.info ? {
    vendor: adapter.info.vendor, architecture: adapter.info.architecture,
    device: adapter.info.device, description: adapter.info.description
  } : null;
  const all = {};
  const bytesToWords = ab => Array.from(new Uint32Array(ab));
  const sourceLabels = ['before', 'after'];
  let instance;
  function release() {
    if (!instance) return;
    for (const buffer of Object.values(instance.buf || {})) buffer.destroy();
    instance.paramsBuf?.destroy(); instance.simParamsBuf?.destroy();
    for (const buffer of instance.gameParamsBufs || []) buffer.destroy();
    instance = null;
  }
  try {
    for (const label of sourceLabels) {
      window.__waterProgress = { source: label, stage: 'pipelines' };
      const api = window.__waterCollisionAPIs[label];
      let current;
      // These are the same instance fields consumed by the production builders.
      // Direct seeds represent pos/aux/flag immediately after G2P.
      instance = {
        device, queue: device.queue, maxParticles: capacity, g2pReady: true,
        stepDt: 1 / 120, frameEncoder: null, terrainMaskWords: 0,
        liquid: {
          getGameState: () => ({ player: current.player, guests: current.guests }),
          fillTerrainSolid(col, row, w, h, target) {
            target.fill(0);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              const c = x + col, r = y + row;
              target[y * w + x] = current.terrain === 'floor' ? +(r >= 4) :
                current.terrain === 'wall' ? +(c >= 4) :
                current.terrain === 'floor-step' ? +(c === 3 && r >= 4) :
                current.terrain === 'cavity' ? +(c !== 3 || r !== 3) :
                current.terrain === 'midpoint-pocket' ? +(r >= 4 || c === 1 || c === 9 || c === 3 && r === 2) :
                current.terrain === 'corner-roof' ? +(c < 0 || r < 0) : 0;
            }
          }
        }
      };
      device.pushErrorScope('validation');
      api.buildBuffers(instance);
      api.buildCollidePipelines(instance);
      const pipelineError = await device.popErrorScope();
      if (pipelineError) throw new Error(label + ' pipeline: ' + pipelineError.message);
      if (!instance.collideReady) throw new Error(label + ': collision pipeline unavailable');
      all[label] = [];
      // Reuse the real production buffers and pipelines across the focused cases.
      for (const fixture of fixtures) for (const mode of fixture.modes) {
        for (const selectedSlot of fixture.slots || [0]) {
          current = fixture;
          const name = `${fixture.name}/${mode}/slot${selectedSlot}`;
          window.__waterProgress = { source: label, stage: name };
          const pos = new Float32Array(capacity * 4), aux = new Float32Array(capacity * 4), flag = new Uint32Array(capacity);
          for (let i = 0; i < capacity; i++) {
            // Active matching-material tails catch dispatches that ignore gp.count.
            pos.set([96, 98, 17, 29], i * 4); aux.set([4.125, 0.375, 96, 98], i * 4); flag[i] = fixture.snowOnly ? 65 | 16 | (29 << 8) : 8 | (29 << 8);
          }
          fixture.particles.forEach((p, i) => { pos.set(p.pos, i * 4); aux.set(p.aux, i * 4); flag[i] = p.flag; });
          const input = { pos: bytesToWords(pos.buffer), aux: bytesToWords(aux.buffer), flag: Array.from(flag) };
          instance.uploadedCount = fixture.particles.length;
          instance.queue.writeBuffer(instance.buf.pos, 0, pos);
          instance.queue.writeBuffer(instance.buf.aux, 0, aux);
          instance.queue.writeBuffer(instance.buf.flag, 0, flag);
          instance.terrain = { originCol: -2, originRow: -4, w: 12, h: 16, tiles: 192 };
          instance.bathBowls = new Float32Array(20);
          if (fixture.bowls) instance.bathBowls.set(fixture.bowls);
          const u = instance.paramsHost, f = instance.paramsHostF;
          u.fill(0); u[0] = instance.uploadedCount; u[1] = 64; u[2] = 64; u[5] = 4096;
          f[6] = instance.stepDt; f[7] = 0.25; f[8] = 8; f[9] = 32; f[10] = 8;
          u[12] = -2; u[13] = -4; u[14] = 12; u[15] = 16; f.set(fixture.region, 16);
          instance.queue.writeBuffer(instance.paramsBuf, 0, u);
          api.uploadTerrainMask(instance);
          api.writeGameParams(instance, fixture.slots ? 5 : 1);
          api.writeSimParams(instance);
          async function collisionAndReadback() {
            device.pushErrorScope('validation');
            if (!fixture.snowOnly) instance.queue.writeBuffer(instance.buf.snowFallbackCount, 0, new Uint32Array(4));
            if (mode === 'standalone') {
              api.runCollide(instance, selectedSlot, fixture.snowOnly);
            } else {
              const encoder = device.createCommandEncoder({ label: 'snow-test.shared' });
              instance.frameEncoder = encoder;
              try {
                for (const snowOnly of fixture.sequence || [fixture.snowOnly]) api.runCollide(instance, selectedSlot, snowOnly);
              } finally { instance.frameEncoder = null; }
              instance.queue.submit([encoder.finish()]);
            }
            const outputs = await Promise.all(['pos', 'aux', 'flag'].map(key =>
              api.readbackBuffer(instance, instance.buf[key], capacity * (key === 'flag' ? 4 : 16))));
            const error = await device.popErrorScope();
            if (error) throw new Error(label + '/' + name + ': ' + error.message);
            const snapshot = { pos: bytesToWords(outputs[0]), aux: bytesToWords(outputs[1]), flag: bytesToWords(outputs[2]) };
            if (!fixture.snowOnly) {
              snapshot.branches = Array.from(new Uint32Array(await api.readbackBuffer(instance,instance.buf.snowFallbackCount,16)));
              snapshot.queued = api.waterQueued; snapshot.compact = api.waterCompact;
              if (api.waterQueued) snapshot.dispatchArgs=Array.from(new Uint32Array(await api.readbackBuffer(instance,instance.buf.snowFallbackDispatch,12)));
            }
            return snapshot;
          }
          const first = await collisionAndReadback();
          // No integration or reseed between these calls: this specifically
          // detects a repeated repair of the same stationary contact.
          const second = await collisionAndReadback();
          const result = { name, fixture: fixture.name, mode, count: instance.uploadedCount,
            input, unchanged: fixture.particles.map((p, i) => p.unchanged ? i : -1).filter(i => i >= 0),
            ...first, second };
          all[label].push(result);
        }
      }
      await device.queue.onSubmittedWorkDone();
      release();
    }
    window.__waterProgress = { stage: 'complete' };
    return { adapterInfo, capacity, gpuErrors, outputs: all,
      limitation: 'Direct post-G2P collision stage with static guest/rig geometry; no full-game performance claim. Active nonfinite snow is not a supported shader input and is not tested.' };
  } finally {
    release(); destroying = true; device.destroy();
  }
}

async function runBenchmark() {
  const count = 5000, capacity = 5120, warmup = 5, samples = 30;
  if (!navigator.gpu) throw new Error('WebGPU unavailable');
  const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if (!adapter || !adapter.features.has('timestamp-query')) throw new Error('Timestamp query unavailable');
  const device = await adapter.requestDevice({requiredFeatures:['timestamp-query'],
    requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const errors = [];let destroying=false;
  device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  device.lost.then(info=>{if(!destroying)errors.push('device lost: '+info.message);});
  const query=device.createQuerySet({type:'timestamp',count:64});
  const resolve=device.createBuffer({size:1024,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size:1024,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const instances={},results=[];
  const circle=(cx,cy)=>{
    const pts=[];
    for(let i=0;i<20;i++) {const a=i*Math.PI/10,x=cx+25*Math.cos(a),y=cy+24*Math.sin(a);pts.push(x,y,8+(y-cy)*.3,-12+(x-cx)*.2);}
    return {x:cx,y:cy,hw:25,hh:24,mvx:8,mvy:-12,pts};
  };
  const guests=[circle(110,111),circle(138,113)];
  const pos=new Float32Array(capacity*4),aux=new Float32Array(capacity*4),flag=new Uint32Array(capacity);
  // Contiguous mixed cloud: waves see both interior and exterior particles.
  for(let i=0;i<count;i++) {
    const x=78+(i%100)*.92,y=105+Math.floor(i/100)*.46;
    pos.set([x,y,(i%13)-6,17+(i%7)],i*4);aux.set([3.2,.2,x,y],i*4);
    flag[i]=(i%17===0?1:i%19===0?2:0)|8|(29<<8)|(71<<24);
  }
  const fixtures=[{name:'overlapping-20gon-floor',bowls:null,near:5000},
    {name:'overlapping-20gon-bowl',bowls:[64,192,96,32],near:5000},
    {name:'scattered-100-guest-contacts',bowls:null,near:100},
    {name:'scattered-500-guest-contacts',bowls:null,near:500},
    {name:'no-guests-overhead',bowls:null,near:0,noGuests:true}];
  try {
    for(const label of ['before','after']) {
      const api=window.__waterCollisionAPIs[label];
      const instance={device,queue:device.queue,maxParticles:capacity,g2pReady:true,stepDt:1/120,frameEncoder:null,terrainMaskWords:0,
        liquid:{getGameState:()=>({guests:instance.benchNoGuests?[]:guests}),fillTerrainSolid:(col,row,w,h,target)=>{
          for(let y=0;y<h;y++)for(let x=0;x<w;x++)target[y*w+x]=+(row+y>=4);
        }}};
      instances[label]=instance;api.buildBuffers(instance);api.buildCollidePipelines(instance);
      if(!instance.collideReady)throw new Error(label+' collision unavailable');
      instance.uploadedCount=count;instance.terrain={originCol:-2,originRow:-4,w:12,h:16,tiles:192};
      instance.bathBowls=new Float32Array(20);
      const u=instance.paramsHost,f=instance.paramsHostF;u.fill(0);u[0]=count;u[1]=64;u[2]=64;u[5]=4096;
      f[6]=instance.stepDt;f[7]=.25;f[8]=8;f[9]=32;f[10]=8;u[12]=-2;u[13]=-4;u[14]=12;u[15]=16;f.set([0,-128,256,256],16);
      instance.queue.writeBuffer(instance.paramsBuf,0,u);api.uploadTerrainMask(instance);api.writeGameParams(instance,1);api.writeSimParams(instance);
    }
    async function measure(label,fixture) {
      const instance=instances[label],api=window.__waterCollisionAPIs[label];
      instance.benchNoGuests=!!fixture.noGuests;
      instance.bathBowls.fill(0);if(fixture.bowls)instance.bathBowls.set(fixture.bowls);
      api.writeGameParams(instance,1);
      instance.queue.writeBuffer(instance.buf.pos,0,pos);instance.queue.writeBuffer(instance.buf.aux,0,aux);instance.queue.writeBuffer(instance.buf.flag,0,flag);
      const encoder=device.createCommandEncoder({label:'water-guest.benchmark'}),begin=encoder.beginComputePass.bind(encoder),names=[];
      encoder.beginComputePass=descriptor=>{
        const d=descriptor||{},index=names.length*2;if(index>=64)throw new Error('Too many benchmark passes');
        names.push(d.label||'compute');return begin({...d,timestampWrites:{querySet:query,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}});
      };
      instance.frameEncoder=encoder;
      try {api.runCollide(instance,0,false);}finally{instance.frameEncoder=null;}
      encoder.resolveQuerySet(query,0,names.length*2,resolve,0);encoder.copyBufferToBuffer(resolve,0,read,0,names.length*16);
      device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
      const times=new BigUint64Array(read.getMappedRange()),passes=names.map((name,i)=>({name,ms:Number(times[i*2+1]-times[i*2])/1e6}));
      read.unmap();return {ms:passes.reduce((n,p)=>n+p.ms,0),passes};
    }
    for(const fixture of fixtures) {
      for(let i=0;i<count;i++) {
        // Deterministic scattering across waves; inactive contacts occupy clear air.
        const rank=(i*73)%count,near=rank<fixture.near;
        const sample=(rank*73)%count;
        const x=near?(fixture.near===5000?78+(rank%100)*.92:118+(sample%100)*.13):20+(i%100)*2.1;
        const y=near?(fixture.near===5000?105+Math.floor(rank/100)*.46:108+Math.floor(sample/100)*.35):20+Math.floor(i/100)*.65;
        pos[i*4]=x;pos[i*4+1]=y;aux[i*4+2]=x;aux[i*4+3]=y;
      }
      const data={before:[],after:[]};
      for(let round=-warmup;round<samples;round++) {
        window.__waterProgress={stage:'benchmark',fixture:fixture.name,round};
        for(const label of round%2===0?['before','after']:['after','before']) {
          const result=await measure(label,fixture);if(round>=0)data[label].push(result);
        }
      }
      const summarize=rows=>{
        const values=rows.map(r=>r.ms).sort((a,b)=>a-b),perPass={};
        for(const row of rows)for(const p of row.passes)(perPass[p.name]||=([])).push(p.ms);
        return {medianMs:(values[14]+values[15])/2,p95Ms:values[Math.ceil(samples*.95)-1],minMs:values[0],maxMs:values.at(-1),
          perPass:Object.fromEntries(Object.entries(perPass).map(([name,v])=>[name,{meanMs:v.reduce((n,x)=>n+x,0)/v.length,count:v.length}])),samples:rows};
      };
      const before=summarize(data.before),after=summarize(data.after);
      results.push({fixture:fixture.name,contactCloudSeeds:fixture.near,before,after,medianSpeedup:before.medianMs/after.medianMs});
    }
    await device.queue.onSubmittedWorkDone();
    return {pass:!errors.length,benchmark:true,count,capacity,warmup,samples,results,gpuErrors:errors,
      adapterInfo:adapter.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description}:null,
      limitation:'Fixed post-G2P cloud reseeded before each collision. No test instrumentation; GPU compute pass time only, not game FPS or queue waiting.'};
  } finally {
    for(const instance of Object.values(instances)) {
      for(const buffer of Object.values(instance.buf||{}))buffer.destroy();instance.paramsBuf?.destroy();instance.simParamsBuf?.destroy();
      for(const buffer of instance.gameParamsBufs||[])buffer.destroy();
    }
    query.destroy();resolve.destroy();read.destroy();destroying=true;device.destroy();
  }
}

const browserProgram = `window.__waterRunBenchmark=(${runBenchmark.toString()});window.__waterMakeFixtures=(${makeFixtures.toString()});window.__waterRunGPU=${benchMode}?__waterRunBenchmark:(${runGPU.toString()});`;
new vm.Script(browserProgram);
const fixtureSummary=makeFixtures().map(f=>({name:f.name,count:f.particles.length,modes:f.modes,slots:f.slots||[0],snowOnly:f.snowOnly}));
assert(fixtureSummary.every(f=>f.count<=320));
if(process.env.DRY_RUN==='1') { console.log(JSON.stringify({dryRun:true,benchmark:benchMode,sources:metadata,snowShaderSHA256,fixtures:fixtureSummary,browserLaunched:false},null,2));process.exit(0); }
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-water-collision-'));
const html = '<!doctype html><meta charset="utf-8"><title>Water collision GPU differential</title><script>window.__waterCollisionAPIs={}</script><script src="/before.js"></script><script src="/after.js"></script><script src="/test.js"></script>';
const server = createServer((req, res) => {
  const files = { '/': ['text/html', html], '/before.js': ['text/javascript', sources.before],
    '/after.js': ['text/javascript', sources.after], '/test.js': ['text/javascript', browserProgram] };
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file[0] }).end(file[1]);
});
let chrome, socket, sequence = 0, stopping = false;
const pending = new Map(), browserErrors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup() {
  if (stopping) return;
  stopping = true;
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser cleanup')); }
  pending.clear();
  try { socket?.close(); } catch {}
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), sleep(1500)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
process.once('SIGINT', () => { cleanup().finally(() => process.exit(130)); });
process.once('SIGTERM', () => { cleanup().finally(() => process.exit(143)); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
function compare(result) {
  const fixtures=new Map(makeFixtures().map(f=>[f.name,f])),cases=[],failures=[];
  const float=word=>new Float32Array(new Uint32Array([word]).buffer)[0];
  let edges=0,midpoints=0,beforeRays=0,afterRays=0;
  assert.equal(result.outputs.before.length,result.outputs.after.length);
  for(let row=0;row<result.outputs.before.length;row++) {
    const before=result.outputs.before[row],after=result.outputs.after[row],fixture=fixtures.get(after.fixture),checks=[];
    const check=(name,pass,observed)=>{checks.push({name,pass,observed});if(!pass)failures.push({case:after.name,name,observed});};
    assert.equal(before.name,after.name);
    let differences=0,maxDifference=0,finite=true;
    for(const [a,b]of [[before,after],[before.second,after.second]])for(const field of ['pos','aux','flag'])for(let i=0;i<a[field].length;i++) {
      if(a[field][i]!==b[field][i])differences++;
      if(field!=='flag') {const av=float(a[field][i]),bv=float(b[field][i]);finite&&=Number.isFinite(av)&&Number.isFinite(bv);maxDifference=Math.max(maxDifference,Math.abs(av-bv));}
    }
    check('original float words, pressure, flags and repeated dispatch preserved',differences===0,{differences,maxDifference});
    check('finite output',finite);
    let guards=true;
    for(const state of [after,after.second])for(const field of ['pos','aux','flag']) {
      const stride=field==='flag'?1:4;
      const protectedIndices=after.unchanged.concat(Array.from({length:result.capacity-after.count},(_,i)=>after.count+i));
      for(const i of protectedIndices)for(let axis=0;axis<stride;axis++) guards&&=state[field][i*stride+axis]===after.input[field][i*stride+axis];
    }
    check('sleeping/frozen/off-region/snow and unused tail protected',guards);
    if(!fixture.snowOnly && !fixture.sequence) {
      const a=before.branches,b=after.branches;
      edges+=a[1];midpoints+=a[2];beforeRays+=a[3];if(!after.queued)afterRays+=b[3];
      if(after.queued) {
        check('every failed primary enters cooperative queue',b[0]===a[1],{originalFallbacks:a[1],queued:b[0]});
        if(after.count)check('indirect dispatch covers queue',JSON.stringify(after.dispatchArgs)===JSON.stringify(after.compact?[Math.ceil(b[0]/32),1,1]:[Math.min(b[0],256),Math.ceil(b[0]/256),1]),after.dispatchArgs);
      } else {
        check('inside/edge/midpoint branch counts preserved',a.slice(0,3).every((v,i)=>v===b[i]),{before:a,after:b});
        check('ray calls never increase',b[3]<=a[3],{before:a[3],after:b[3]});
      }
      if(fixture.requireEdge)check('serial edge search exercised',a[1]>0,a);
      if(fixture.requireMidpoint)check('midpoint retry exercised',a[2]>0,a);
    }
    if(fixture.expectPressure!==undefined)check('terrain and guest aeration both preserved',Math.abs(float(after.aux[1])-fixture.expectPressure)<.000001,float(after.aux[1]));
    if(fixture.mustMove)check('fixture causes real collision correction',after.pos[0]!==after.input.pos[0]||after.pos[1]!==after.input.pos[1]);
    for(const i of fixture.keepPosition||[])check('shallow water deadband retained '+i,[0,1].every(axis=>after.pos[i*4+axis]===after.input.pos[i*4+axis]));
    if(fixture.expectPosition)check('fuzzy tie chooses original exit',fixture.expectPosition.every((v,i)=>Math.abs(float(after.pos[i])-v)<.002),after.pos.slice(0,2).map(float));
    cases.push({name:after.name,checks,pass:checks.every(c=>c.pass)});
  }
  if(!edges||!midpoints)failures.push({name:'Both serial fallback branches must be covered',edges,midpoints});
  return {pass:!failures.length&&!result.gpuErrors.length&&!browserErrors.length,cases,failures,
    branchTotals:{edges,midpoints,beforeRays,afterRays:metadata.after.queued?null:afterRays},snowShaderSHA256,gpuErrors:result.gpuErrors,browserErrors,sources:metadata,adapterInfo:result.adapterInfo,
    limitation:'Direct post-G2P collision differential with static snapshots, not a full-frame FPS claim.'};
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const args = ['--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank'];
  chrome = spawn('/Users/ethan/.local/bin/agent-chrome-for-testing', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeLog = '';
  chrome.stderr.on('data', data => { chromeLog = (chromeLog + data.toString()).slice(-30000); });
  chrome.on('error', error => browserErrors.push(error.message));
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (endpoint) break;
    if (chrome.exitCode !== null) throw new Error('Chrome exited: ' + chromeLog);
    await sleep(100);
  }
  assert.ok(endpoint, 'Owned Chrome for Testing CDP endpoint');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onclose = event => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CDP socket closed: ' + event.code));
    }
    pending.clear();
  };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer); pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(JSON.stringify(message.params.exceptionDetails));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready = await evaluate('typeof __waterRunGPU === "function" && !!__waterCollisionAPIs.after');
    if (ready) break;
    await sleep(50);
  }
  assert.ok(ready, 'Both exact source snapshots and private test hook loaded');
  const started = performance.now();
  // Keep the full typed-buffer report in the page. A single CDP response
  // containing both versions of every case can exceed transport limits.
  if (benchMode) {
    const report=await evaluate('__waterRunGPU()');report.sources=metadata;report.snowShaderSHA256=snowShaderSHA256;
    report.elapsedMs=performance.now()-started;
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({pass:report.pass,benchmark:true,results:report.results.map(r=>({fixture:r.fixture,beforeMedianMs:r.before.medianMs,afterMedianMs:r.after.medianMs,medianSpeedup:r.medianSpeedup})),report:path.join(out,'report.json')},null,2));
    assert(report.pass,'Benchmark GPU errors');
  } else {
  const result = await evaluate(`(async () => {
    const r = window.__waterResult = await __waterRunGPU();
    return { adapterInfo: r.adapterInfo, capacity: r.capacity, gpuErrors: r.gpuErrors,
 limitation: r.limitation, rowCounts: { before: r.outputs.before.length, after: r.outputs.after.length } };
  })()`);
  result.outputs = { before: [], after: [] };
  for (const label of ['before', 'after']) {
    for (let row = 0; row < result.rowCounts[label]; row++) {
      const value = await evaluate(`window.__waterResult.outputs.${label}[${row}]`);
      assert.ok(value && value.pos && value.aux && value.flag && value.input, `${label} case ${row} transferred`);
      result.outputs[label].push(value);
    }
  }
  delete result.rowCounts;
  await evaluate('delete window.__waterResult');
  const report = compare(result);
  report.elapsedMs = performance.now() - started;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.pass || process.env.SAVE_RAW === '1') fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(result) + '\n');
  fs.writeFileSync(path.join(out, 'chrome.log'), chromeLog);
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, checks: report.cases.reduce((n, row) => n + row.checks.length, 0),
    failedCases: report.cases.filter(row => !row.pass), failures: report.failures.slice(0, 5), report: path.join(out, 'report.json') }, null, 2));
  assert.ok(report.pass, 'Ordinary-liquid collision output and fallback coverage must pass');
  }
} catch (error) {
  let progress;
  try { if (socket?.readyState === 1) progress = await evaluate('window.__waterProgress'); } catch {}
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ message: error.message, progress, browserErrors, sources: metadata }, null, 2) + '\n');
  throw error;
} finally { await cleanup(); }
