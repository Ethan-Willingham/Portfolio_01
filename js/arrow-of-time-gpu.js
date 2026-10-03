import { dimensions, pack, unpack, checksum } from './arrow-of-time-model.js';

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
  let x = 0, y = 1, scratch = 2, disposed = false;
  device.queue.writeBuffer(fields[x], 0, pack(initial.x, width, height)); device.queue.writeBuffer(fields[y], 0, pack(initial.y, width, height));
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
    if (!count) return;
    const pass = encoder.beginComputePass({ label: 'Q2R microscopic steps', ...(timestampWrites ? { timestampWrites } : {}) }); pass.setPipeline(rule);
    for (let k = 0; k < count; k++) {
      pass.setBindGroup(0, direction === 1 ? ruleGroup(x, y, scratch) : ruleGroup(y, x, scratch)); pass.dispatchWorkgroups(Math.ceil(words / 64));
      if (direction === 1) [x, y, scratch] = [scratch, x, y]; else [x, y, scratch] = [y, scratch, x];
    }
    pass.end();
  }
  function update(count, direction = 1) { const encoder = device.createCommandEncoder(); encodeSteps(encoder, count, direction); device.queue.submit([encoder.finish()]); }
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
  // One hierarchy of exact positive-spin counts. Odd edge blocks retain their real area.
  const levels = []; let pw = width, ph = height, offset = 0;
  while (true) { levels.push({ width: pw, height: ph, offset }); offset += pw * ph; if (pw === 1 && ph === 1) break; pw = Math.ceil(pw / 2); ph = Math.ceil(ph / 2); }
  const pyramid = buffer(offset * 4, GPUBufferUsage.STORAGE, 'Q2R multiscale block counts');
  const offsets = levels.map(l => `${l.offset}u`).join(','), widths = levels.map(l => `${l.width}u`).join(','), heights = levels.map(l => `${l.height}u`).join(','), declarations = `const OFF=array<u32,${levels.length}>(${offsets});const LW=array<u32,${levels.length}>(${widths});const LH=array<u32,${levels.length}>(${heights});`;
  const hierarchyShader = await checkedShader(device, `
${declarations} override LEVEL:u32=0;
@group(0) @binding(0) var<storage,read> field:array<u32>;
@group(0) @binding(1) var<storage,read_write> blocks:array<u32>;
@compute @workgroup_size(64) fn hierarchy(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=LW[LEVEL]*LH[LEVEL]){return;}
 let col=i%LW[LEVEL];let row=i/LW[LEVEL];var sum=0u;
 if(LEVEL==0){sum=(field[row*${rowWords}u+col/32]>>(col%32))&1;}else{
 for(var dy=0u;dy<2;dy++){for(var dx=0u;dx<2;dx++){let c=col*2+dx;let r=row*2+dy;if(c<LW[max(LEVEL,1u)-1u]&&r<LH[max(LEVEL,1u)-1u]){sum+=blocks[OFF[max(LEVEL,1u)-1u]+r*LW[max(LEVEL,1u)-1u]+c];}}}}
 blocks[OFF[LEVEL]+i]=sum;}`, 'Q2R block hierarchy');
  const hierarchyPipelines = await Promise.all(levels.map((_, level) => device.createComputePipelineAsync({ layout: 'auto', compute: { module: hierarchyShader, entryPoint: 'hierarchy', constants: { LEVEL: level } } })));
  const renderUniform = buffer(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'Q2R view');
  const renderShader = await checkedShader(device, triangle + `
${declarations}
@group(0) @binding(0) var<storage,read> blocks:array<u32>;
struct View {size:vec2f,zoom:f32,exposure:f32,detail:f32,visibility:f32,pad1:f32,pad2:f32};
@group(0) @binding(1) var<uniform> view:View;
fn cell(level:u32,col:i32,row:i32)->f32 {let c=u32(clamp(col,0,i32(LW[level])-1));let r=u32(clamp(row,0,i32(LH[level])-1));let side=1u<<level;
 let area=min(side,${width}u-c*side)*min(side,${height}u-r*side);return 1-f32(blocks[OFF[level]+r*LW[level]+c])/f32(area);}
fn average(uv:vec2f,level:u32)->f32 {let p=uv*vec2f(${width},${height})/f32(1u<<level)-.5;let q=vec2i(floor(p));let f=fract(p);
 return mix(mix(cell(level,q.x,q.y),cell(level,q.x+1,q.y),f.x),mix(cell(level,q.x,q.y+1),cell(level,q.x+1,q.y+1),f.x),f.y);}
fn scale(uv:vec2f,lod:f32)->f32 {let l=clamp(lod,0,f32(${levels.length - 1}));let lo=u32(floor(l));return mix(average(uv,lo),average(uv,min(lo+1,${levels.length - 1}u)),fract(l));}
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let side=min(view.size.x,view.size.y)*.9;let plane=(pos.xy-view.size*.5)/side+.5;let uv=(plane-.5)/view.zoom+.5;
 let base=vec3f(.029557,.040915,.030713); var color=base;
 if(all(plane>vec2f(0))&&all(plane<vec2f(1))){
 let lod=max(0.,1.3-log2(view.zoom))+view.detail;
 let value=.68*scale(uv,lod)+.24*scale(uv,lod+1.5)+.08*scale(uv,lod+3.);
 let shade=smoothstep(.08,.85,value);let ink=vec3f(.51,.422,.265);
 let edge=smoothstep(0.,.045,min(min(plane.x,plane.y),min(1-plane.x,1-plane.y)));
 color=mix(base, mix(base*.78,ink,shade),edge);}
 return vec4f(mix(base,color,clamp(view.visibility,0.,1.))*max(0.,view.exposure),1);}`, 'Q2R instantaneous domain renderer');
  const renderer = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: renderShader, entryPoint: 'vertex' }, fragment: { module: renderShader, entryPoint: 'fragment', targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } });
  const renderGroup = device.createBindGroup({ layout: renderer.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: pyramid } }, { binding: 1, resource: { buffer: renderUniform } }] });
  function render({ encoder, targetView, width: rw, height: rh, exposure = 1, zoom = 1, detail = 0, visibility = 1, timestampWrites }) {
    for (let level = 0; level < levels.length; level++) {
      const pipeline = hierarchyPipelines[level], pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: fields[x] } }, { binding: 1, resource: { buffer: pyramid } }] })); pass.dispatchWorkgroups(Math.ceil(levels[level].width * levels[level].height / 64)); pass.end();
    }
    // Six scalar view values and two scalar padding values, 32 bytes.
    device.queue.writeBuffer(renderUniform, 0, new Float32Array([rw, rh, zoom, exposure, detail, visibility, 0, 0]));
    const pass = encoder.beginRenderPass({ label: 'Q2R scene radiance', colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }], ...(timestampWrites ? { timestampWrites } : {}) });
    pass.setPipeline(renderer); pass.setBindGroup(0, renderGroup); pass.draw(3); pass.end();
  }
  return { update, encodeSteps, readback, render, width, height, words, bufferBytes: owned.reduce((n, b) => n + b.size, 0),
    dispose() { if (disposed) return; disposed = true; for (const resource of owned) resource.destroy(); } };
  } catch (error) { for (const resource of owned) resource.destroy(); throw error; }
}
