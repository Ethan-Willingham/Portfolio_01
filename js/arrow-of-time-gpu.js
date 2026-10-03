import { dimensions, pack, unpack, checksum, evolve } from './arrow-of-time-model.js?v=4';

const triangle = `@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[i],0,1); }`;
export const fullscreenTriangleWGSL = triangle;
export async function checkedShader(device, code, label) {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(m => m.type === 'error');
  if (errors.length) throw new Error(`${label}: ${errors.map(m => `${m.lineNum}: ${m.message}`).join('\n')}`);
  return module;
}
export async function createQ2RGPU(device, initial) {
  if (!device || !device.createComputePipelineAsync) throw new Error('WebGPU initialization failed: a usable GPUDevice is required.');
  const { width, height } = initial; dimensions(width, height);
  const rowWords = Math.ceil(width / 32), words = rowWords * height, lastBits = (width - 1) % 32 + 1;
  const mask = lastBits === 32 ? 0xffffffff : (2 ** lastBits - 1) >>> 0;
  if (words * 4 > device.limits.maxStorageBufferBindingSize) throw new Error('WebGPU storage limit is too small for this lattice.');
  const owned = [], buffer = (size, usage, label) => { const b = device.createBuffer({ size, usage, label }); owned.push(b); return b; };
  try {
  const fields = Array.from({ length: 3 }, (_, i) => buffer(words * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, `Q2R field ${i}`));
  let x = 0, y = 1, scratch = 2, lastDirection = initial.direction === -1 ? -1 : 1, disposed = false;
  device.queue.writeBuffer(fields[x], 0, pack(initial.x, width, height)); device.queue.writeBuffer(fields[y], 0, pack(initial.y, width, height));
  const preceding = evolve(initial, -lastDirection);
  device.queue.writeBuffer(fields[scratch], 0, pack(lastDirection === 1 ? preceding.y : preceding.x, width, height));
  const common = `
const W:u32=${width}; const H:u32=${height}; const R:u32=${rowWords}; const WORDS:u32=${words}; const LAST:u32=${lastBits}; const MASK:u32=${mask}u;
@group(0) @binding(0) var<storage,read> a:array<u32>;
@group(0) @binding(1) var<storage,read> b:array<u32>;
fn valid(i:u32)->u32 { return select(0xffffffffu,MASK,i%R==R-1); }
fn westA(i:u32)->u32 { let k=i%R; let row=i-k; var carry:u32;
 if(k==0){carry=a[row+R-1]>>(LAST-1);}else{carry=a[i-1]>>31;} return ((a[i]<<1)|carry)&valid(i); }
fn eastA(i:u32)->u32 { let k=i%R; var carry:u32;
 if(k==R-1){carry=(a[i-k]&1)<<(LAST-1);}else{carry=(a[i+1]&1)<<31;} return ((a[i]>>1)|carry)&valid(i); }
fn north(i:u32)->u32 {return select(i-R,i+WORDS-R,i<R);}
fn south(i:u32)->u32 {return select(i+R,i+R-WORDS,i>=WORDS-R);}
fn two(w:u32,e:u32,n:u32,s:u32)->u32 {return ((w^e)&(n^s))|((w&e)&~(n|s))|(~(w|e)&(n&s));}
fn flips(i:u32)->u32 {return two(westA(i),eastA(i),a[north(i)],a[south(i)])&valid(i);}
fn westB(i:u32)->u32 { let k=i%R; let row=i-k; var carry:u32;
 if(k==0){carry=b[row+R-1]>>(LAST-1);}else{carry=b[i-1]>>31;} return ((b[i]<<1)|carry)&valid(i); }
fn eastB(i:u32)->u32 { let k=i%R; var carry:u32;
 if(k==R-1){carry=(b[i-k]&1)<<(LAST-1);}else{carry=(b[i+1]&1)<<31;} return ((b[i]>>1)|carry)&valid(i); }
`;
  const ruleShader = await checkedShader(device, common + `
@group(0) @binding(2) var<storage,read_write> out:array<u32>;
@compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=WORDS){return;}out[i]=(b[i]^flips(i))&valid(i); }`, 'Q2R exact packed update');
  const rule = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: ruleShader, entryPoint: 'update' } });
  const groups = new Map();
  function ruleGroup(a, b, c) {
    const key = `${a}${b}${c}`;
    if (!groups.has(key)) groups.set(key, device.createBindGroup({ layout: rule.getBindGroupLayout(0), entries: [a, b, c].map((index, binding) => ({ binding, resource: { buffer: fields[index] } })) }));
    return groups.get(key);
  }
  function encodeSteps(encoder, count, direction = 1, timestampWrites) {
    if (disposed) throw new Error('Q2R resources have been disposed.');
    if (!Number.isInteger(count) || count < 0 || count > 8192 || ![1, -1].includes(direction)) throw new RangeError('Invalid exact update count or direction.');
    if (!count) return; lastDirection = direction;
    const pass = encoder.beginComputePass({ label: 'Q2R microscopic steps', ...(timestampWrites ? { timestampWrites } : {}) }); pass.setPipeline(rule);
    for (let k = 0; k < count; k++) {
      pass.setBindGroup(0, direction === 1 ? ruleGroup(x, y, scratch) : ruleGroup(y, x, scratch)); pass.dispatchWorkgroups(Math.ceil(words / 64));
      if (direction === 1) [x, y, scratch] = [scratch, x, y]; else [x, y, scratch] = [y, scratch, x];
    }
    pass.end();
  }
  function update(count, direction = 1) { const encoder = device.createCommandEncoder(); encodeSteps(encoder, count, direction); device.queue.submit([encoder.finish()]); }
  let timeline = null, timelineInterval = 32, timelineLength = 0;
  function prepareTimeline(length = 4320) {
    if (timeline) throw new Error('This solver already has a prepared timeline.');
    timelineLength = length;
    const count = Math.ceil(length / timelineInterval) + 1;
    timeline = buffer(count * words * 8, GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, 'Q2R exact timeline checkpoints');
    const encoder = device.createCommandEncoder();
    let step = 0;
    for (let index = 0; index < count; index++) {
      const next = Math.min(length, index * timelineInterval);
      encodeSteps(encoder, next - step); step = next;
      encoder.copyBufferToBuffer(fields[x], 0, timeline, index * words * 8, words * 4);
      encoder.copyBufferToBuffer(fields[y], 0, timeline, index * words * 8 + words * 4, words * 4);
    }
    // Preparation also computes the complete inverse, leaving the opening state visible.
    encodeSteps(encoder, length, -1); device.queue.submit([encoder.finish()]);
    return { checkpoints: count, bytes: timeline.size, computedSteps: length * 2 };
  }
  function seekTimeline(step, direction = 1) {
    if (!timeline || !Number.isInteger(step) || step < 0 || step > timelineLength || ![1,-1].includes(direction)) throw new RangeError('Invalid prepared timeline position.');
    const index = Math.floor(step / timelineInterval), start = index * timelineInterval;
    x = 0; y = 1; scratch = 2; lastDirection = 1;
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(timeline, index * words * 8, fields[x], 0, words * 4);
    encoder.copyBufferToBuffer(timeline, index * words * 8 + words * 4, fields[y], 0, words * 4);
    encodeSteps(encoder, step - start);
    // Establish the adjacent pair for reverse interpolation, without changing the chosen state.
    if (direction === -1) { encodeSteps(encoder, 1); encodeSteps(encoder, 1, -1); }
    device.queue.submit([encoder.finish()]); return step - start + (direction === -1 ? 2 : 0);
  }
  const groupCount = Math.ceil(words / 64), stats = buffer(groupCount * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, 'Q2R integer reductions');
  const diagShader = await checkedShader(device, common + `
@group(0) @binding(2) var<storage,read_write> result:array<vec4i>;
var<workgroup> sums:array<vec4i,64>;
@compute @workgroup_size(64) fn reduceState(@builtin(global_invocation_id) id:vec3u,@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u){
 let i=id.x; var v=vec4i(0);
 if(i<WORDS){let mask=valid(i);let bits=i32(countOneBits(mask));
 let diff=countOneBits((a[i]^westB(i))&mask)+countOneBits((a[i]^eastB(i))&mask)+countOneBits((a[i]^b[north(i)])&mask)+countOneBits((a[i]^b[south(i)])&mask);
 v=vec4i(-4*bits+2*i32(diff),2*i32(countOneBits(a[i]&mask))-bits,i32(countOneBits(flips(i))),i32(countOneBits((a[i]^eastA(i))&mask)+countOneBits((a[i]^a[south(i)])&mask)));}
 sums[lane]=v;workgroupBarrier();var stride=32u;loop{if(lane<stride){sums[lane]+=sums[lane+stride];}workgroupBarrier();if(stride==1){break;}stride/=2;}
 if(lane==0){result[group.x]=sums[0];}}`, 'Q2R exact diagnostics');
  const diag = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: diagShader, entryPoint: 'reduceState' } });
  async function readback() {
    const read = device.createBuffer({ size: words * 8 + groupCount * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: 'Q2R readback' });
    try {
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass(); pass.setPipeline(diag);
      pass.setBindGroup(0, device.createBindGroup({ layout: diag.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fields[x] } }, { binding: 1, resource: { buffer: fields[y] } }, { binding: 2, resource: { buffer: stats } }] }));
      pass.dispatchWorkgroups(groupCount); pass.end(); encoder.copyBufferToBuffer(fields[x], 0, read, 0, words * 4); encoder.copyBufferToBuffer(fields[y], 0, read, words * 4, words * 4); encoder.copyBufferToBuffer(stats, 0, read, words * 8, groupCount * 16);
      device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
      const data = read.getMappedRange(), px = new Uint32Array(data, 0, words).slice(), py = new Uint32Array(data, words * 4, words).slice(), reduction = new Int32Array(data, words * 8, groupCount * 4), sums = [0, 0, 0, 0];
      for (let i = 0; i < reduction.length; i++) sums[i % 4] += reduction[i];
      return { width, height, x: unpack(px, width, height), y: unpack(py, width, height), packedX: px, packedY: py, checksum: checksum(px, py), integerReduction: { energyTwiceJ: sums[0], magnetizationSum: sums[1], flippableSites: sums[2], boundaryBonds: sums[3] } };
    } finally { read.destroy(); }
  }
  // Exact counts for the current pair and the preceding computed pair. No image history.
  const levels = []; let pw = width, ph = height, offset = 0;
  while (true) { levels.push({ width: pw, height: ph, offset }); offset += pw * ph; if (pw === 1 && ph === 1) break; pw = Math.ceil(pw / 2); ph = Math.ceil(ph / 2); }
  const pyramid = buffer(offset * 8, GPUBufferUsage.STORAGE, 'Q2R paired-layer block counts');
  const renderUniform = buffer(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'Q2R view');
  const viewDeclaration = `struct View {size:vec2f,zoom:f32,exposure:f32,detail:f32,visibility:f32,blend:f32,reverse:f32,inkA:vec4f,inkB:vec4f,inkC:vec4f,inkD:vec4f,base:vec4f};`;
  const offsets = levels.map(l => `${l.offset}u`).join(','), widths = levels.map(l => `${l.width}u`).join(','), heights = levels.map(l => `${l.height}u`).join(','), declarations = `const OFF=array<u32,${levels.length}>(${offsets});const LW=array<u32,${levels.length}>(${widths});const LH=array<u32,${levels.length}>(${heights});`;
  const hierarchyShader = await checkedShader(device, `
${declarations} ${viewDeclaration} override LEVEL:u32=0;
@group(0) @binding(0) var<storage,read> fieldX:array<u32>;
@group(0) @binding(1) var<storage,read> fieldY:array<u32>;
@group(0) @binding(2) var<storage,read> previous:array<u32>;
@group(0) @binding(3) var<storage,read_write> blocks:array<vec2u>;
@group(0) @binding(4) var<uniform> view:View;
@compute @workgroup_size(64) fn hierarchy(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=LW[LEVEL]*LH[LEVEL]){return;}
 let col=i%LW[LEVEL];let row=i/LW[LEVEL];var sum=vec2u(0);
 if(LEVEL==0){let word=row*${rowWords}u+col/32;let bit=col%32;
 let bx=(fieldX[word]>>bit)&1;let by=(fieldY[word]>>bit)&1;let bp=(previous[word]>>bit)&1;
 sum=vec2u(bx+by,bp+select(by,bx,view.reverse>0.5));}else{
 for(var dy=0u;dy<2;dy++){for(var dx=0u;dx<2;dx++){let c=col*2+dx;let r=row*2+dy;if(c<LW[max(LEVEL,1u)-1u]&&r<LH[max(LEVEL,1u)-1u]){sum+=blocks[OFF[max(LEVEL,1u)-1u]+r*LW[max(LEVEL,1u)-1u]+c];}}}}
 blocks[OFF[LEVEL]+i]=sum;}`, 'Q2R paired-layer block hierarchy');
  const hierarchyPipelines = await Promise.all(levels.map((_, level) => device.createComputePipelineAsync({ layout: 'auto', compute: { module: hierarchyShader, entryPoint: 'hierarchy', constants: { LEVEL: level } } })));
  const renderShader = await checkedShader(device, triangle + `
${declarations} ${viewDeclaration}
@group(0) @binding(0) var<storage,read> blocks:array<vec2u>;
@group(0) @binding(1) var<uniform> view:View;
fn cell(level:u32,col:i32,row:i32)->f32 {let c=u32(clamp(col,0,i32(LW[level])-1));let r=u32(clamp(row,0,i32(LH[level])-1));let side=1u<<level;
 let area=min(side,${width}u-c*side)*min(side,${height}u-r*side);let counts=blocks[OFF[level]+r*LW[level]+c];
 return 1-mix(f32(counts.y),f32(counts.x),smoothstep(0.,1.,view.blend))/f32(2*area);}
fn average(uv:vec2f,level:u32)->f32 {let p=uv*vec2f(${width},${height})/f32(1u<<level)-.5;let q=vec2i(floor(p));let f=fract(p);
 return mix(mix(cell(level,q.x,q.y),cell(level,q.x+1,q.y),f.x),mix(cell(level,q.x,q.y+1),cell(level,q.x+1,q.y+1),f.x),f.y);}
fn scale(uv:vec2f,lod:f32)->f32 {let l=clamp(lod,0,f32(${levels.length - 1}));let lo=u32(floor(l));return mix(average(uv,lo),average(uv,min(lo+1,${levels.length - 1}u)),fract(l));}
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let fit=max(view.size.x/${width}.,view.size.y/${height}.);let extent=vec2f(${width},${height})*fit*view.zoom;
 let uv=(pos.xy-view.size*.5)/extent+.5;
 let base=view.base.rgb;var color=base;
 if(all(uv>=vec2f(0))&&all(uv<vec2f(1))){
 let pixelsPerCell=fit*view.zoom;let lod=max(0.,-log2(pixelsPerCell))+view.detail;
 let filtered=scale(uv,lod);let index=vec2i(floor(uv*vec2f(${width},${height})));
 let value=mix(filtered,cell(0,index.x,index.y),smoothstep(1.,2.5,pixelsPerCell));
 let shade=smoothstep(.12,.96,value);
 let t=clamp((uv.y-.23)*2.1+(uv.x-.5)*.65,0.,1.);
 var ink=mix(view.inkA.rgb,view.inkB.rgb,clamp(t*3.,0.,1.));
 ink=mix(ink,view.inkC.rgb,clamp(t*3.-1.,0.,1.));
 ink=mix(ink,view.inkD.rgb,clamp(t*3.-2.,0.,1.));
 color=mix(base,ink,shade);}
 return vec4f(mix(base,color,clamp(view.visibility,0.,1.))*max(0.,view.exposure),1);}`, 'Q2R paired-layer domain renderer');
  const renderer = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: renderShader, entryPoint: 'vertex' }, fragment: { module: renderShader, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } });
  const renderGroup = device.createBindGroup({ layout: renderer.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: pyramid } }, { binding: 1, resource: { buffer: renderUniform } }] });
  function render({ encoder, targetView, width: rw, height: rh, exposure = 1, zoom = 1, detail = 0, visibility = 1, blend = 1, inkA = [.017642,.846873,1], inkB = [.274677,.107023,1], inkC = [1,.05448,.450786], inkD = [1,.617207,.08022], background = [.002732,.004025,.014444], timestampWrites }) {
    device.queue.writeBuffer(renderUniform, 0, new Float32Array([rw, rh, zoom, exposure, detail, visibility, blend, lastDirection === -1 ? 1 : 0, ...inkA, 1, ...inkB, 1, ...inkC, 1, ...inkD, 1, ...background, 1]));
    for (let level = 0; level < levels.length; level++) {
      const pipeline = hierarchyPipelines[level], pass = encoder.beginComputePass(); pass.setPipeline(pipeline);
      pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [fields[x], fields[y], fields[scratch], pyramid, renderUniform].map((buffer, binding) => ({ binding, resource: { buffer } })) }));
      pass.dispatchWorkgroups(Math.ceil(levels[level].width * levels[level].height / 64)); pass.end();
    }
    const pass = encoder.beginRenderPass({ label: 'Q2R scene radiance', colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }], ...(timestampWrites ? { timestampWrites } : {}) });
    pass.setPipeline(renderer); pass.setBindGroup(0, renderGroup); pass.draw(3); pass.end();
  }
  return { update, encodeSteps, readback, render, prepareTimeline, seekTimeline, width, height, words, get bufferBytes() { return owned.reduce((n, b) => n + b.size, 0); },
    dispose() { if (disposed) return; disposed = true; for (const resource of owned) resource.destroy(); } };
  } catch (error) { for (const resource of owned) resource.destroy(); throw error; }
}
