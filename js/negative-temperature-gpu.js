import { CONFIG, initialField, protocol } from './negative-temperature-model.js?v=3';

const complex = `fn mul(a:vec2f,b:vec2f)->vec2f{return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}`;
export function fftShader(n, axis, inverse) {
  const bits = Math.log2(n), threads = Math.min(256, n / 2), lanes = n / threads;
  return `${complex}
@group(0) @binding(0) var<storage,read> src:array<vec2f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec2f>;
@group(0) @binding(3) var<storage,read> roots:array<vec2f>;
var<workgroup> line:array<vec2f,${n}>;
fn idx(i:u32,row:u32)->u32 {return ${axis ? `i*${n}u+row` : `row*${n}u+i`};}
@compute @workgroup_size(${threads}) fn main(@builtin(local_invocation_index) tid:u32,@builtin(workgroup_id) group:vec3u){
  let row=group.x;
  for(var c=0u;c<${lanes}u;c++){let i=tid+c*${threads}u;let rev=reverseBits(i)>>${32 - bits}u;line[rev]=src[idx(i,row)];}
  workgroupBarrier();
  for(var span=2u;span<=${n}u;span*=2u){
    for(var c=0u;c<${lanes / 2}u;c++){
    let butterfly=tid+c*${threads}u;
    let half=span/2u;let j=butterfly%half;let i=(butterfly/half)*span+j;
    let root=roots[j*${n}u/span];
    let u=line[i];let v=mul(line[i+half],root${inverse ? '*vec2f(1.,-1.)' : ''});
    line[i]=u+v;line[i+half]=u-v;
    }workgroupBarrier();
  }
  for(var c=0u;c<${lanes}u;c++){let i=tid+c*${threads}u;dst[idx(i,row)]=line[i]${inverse ? `/f32(${n})` : ''};}
}`;
}
const evolution = `${complex}
// Range-reduced polynomial avoids the relaxed accuracy of GPU sin/cos.
fn phasor(angle:f32)->vec2f {
  let r=angle-6.28318530718*floor((angle+3.14159265359)/6.28318530718);
  let x=select(r,sign(r)*(3.14159265359-abs(r)),abs(r)>1.57079632679);
  let z=x*x;
  let sn=x*(1.+z*(-.166666666667+z*(.008333333333+z*(-.000198412698+z*(.000002755732+z*(-.000000025052+z*.00000000016059))))));
  let cs=1.+z*(-.5+z*(.041666666667+z*(-.001388888889+z*(.000024801587+z*(-.000000275573+z*.00000000208768)))));
  return vec2f(select(cs,-cs,abs(r)>1.57079632679),sn);
}
struct Params {geom:vec4f,trap:vec4f,paddle:vec4f,extra:vec4f,mode:vec4f};
@group(0) @binding(0) var<storage,read> src:array<vec2f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec2f>;
@group(0) @binding(2) var<uniform> p:Params;
@compute @workgroup_size(256) fn local(@builtin(global_invocation_id) id:vec3u){
  let n=u32(p.geom.x);let i=id.x;if(i>=n*n){return;}
  let xy=(vec2f(f32(i%n),f32(i/n))-p.geom.x/2.)*p.geom.y/p.geom.x;
  let r=length(xy/p.trap.xy);
  let wall=p.geom.w*(1.+tanh(clamp((r-1.)*p.trap.y/p.trap.z,-12.,12.)))*.5;
  let q1=(xy-vec2f(p.paddle.x,p.paddle.y))/p.extra.yz;
  let q2=(xy-vec2f(p.paddle.z,p.paddle.w))/p.extra.yz;
  let v=wall+p.extra.x*(exp(-dot(q1,q1)*.5)+exp(-dot(q2,q2)*.5));
  let a=src[i];let h=(v+p.geom.z*dot(a,a))*p.trap.w*.5;
  if(p.mode.x>0.5){dst[i]=a*exp(-h+p.mode.y*p.trap.w*.5);}
  else{let decay=select(1.,exp(-p.extra.w*p.trap.w*.5),p.extra.w>0.);dst[i]=mul(a,phasor(-h))*decay;}
}
@compute @workgroup_size(256) fn kinetic(@builtin(global_invocation_id) id:vec3u){
  let n=u32(p.geom.x);let i=id.x;if(i>=n*n){return;}
  let ij=vec2f(f32(i%n),f32(i/n));
  let k=select(ij,ij-p.geom.x,ij>=vec2f(p.geom.x*.5))*6.28318530718/p.geom.y;
  let h=dot(k,k)*p.trap.w*.5;
  if(p.mode.x>0.5){dst[i]=src[i]*exp(-h);}
  else{dst[i]=mul(src[i],phasor(-h));}
}`;

export class GPUSolver {
  constructor(device, p = CONFIG, seed = '180106951') {
    this.device = device; this.p = { ...p }; this.n = p.grid; this.time = 0; this.steps = 0; this.preparationSteps = 0; this.disposed = false;
    if (!device || device.limits.maxComputeInvocationsPerWorkgroup < 256 || device.limits.maxComputeWorkgroupStorageSize < this.n * 8) throw new Error('WebGPU limits do not support the superfluid FFT.');
    const size = this.n * this.n * 8;
    this.fields = [0, 1].map(() => device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC }));
    this.current = 0; this.readChain = Promise.resolve(); this.readBuffer = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.uniform = device.createBuffer({ size: 256 * 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.roots = device.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const roots = new Float32Array(this.n);
    for (let j = 0; j < this.n / 2; j++) { roots[2 * j] = Math.cos(-2 * Math.PI * j / this.n); roots[2 * j + 1] = Math.sin(-2 * Math.PI * j / this.n); }
    device.queue.writeBuffer(this.roots, 0, roots);
    this.layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ] });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.groups = [0, 1].map(i => device.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.fields[i] } }, { binding: 1, resource: { buffer: this.fields[1 - i] } },
      { binding: 2, resource: { buffer: this.uniform, size: 80 } },
      { binding: 3, resource: { buffer: this.roots } },
    ] }));
    const module = device.createShaderModule({ code: evolution });
    this.local = device.createComputePipeline({ layout, compute: { module, entryPoint: 'local' } });
    this.kinetic = device.createComputePipeline({ layout, compute: { module, entryPoint: 'kinetic' } });
    this.fft = [0, 1, 2, 3].map(i => device.createComputePipeline({ layout, compute: { module: device.createShaderModule({ code: fftShader(this.n, i % 2, i >= 2) }), entryPoint: 'main' } }));
    this.upload(initialField(p, seed));
  }
  upload(field) { this.device.queue.writeBuffer(this.fields[this.current], 0, field); }
  get buffer() { return this.fields[this.current]; }
  advance(count, { imaginary = false, forcing = true } = {}) {
    if (this.disposed) return;
    count = Math.min(128, Math.max(0, Math.floor(count))); if (!count) return;
    const p = this.p, dt = imaginary ? p.preparationDt : p.dt, values = new Float32Array(64 * count);
    for (let s = 0; s < count; s++) {
      const f = imaginary || !forcing ? { amplitude: 0, y: p.paddleStartY } : protocol(this.time + (s + 0.5) * dt, p);
      values.set([p.grid, p.side, p.g, p.wallHeight, p.radiusX, p.radiusY, p.wallWidth, dt,
        p.paddleX, f.y, -p.paddleX, f.y, f.amplitude, p.paddleSigmaX, p.paddleSigmaY, p.damping,
        imaginary ? 1 : 0, p.chemicalPotential, 0, 0], 64 * s);
    }
    this.device.queue.writeBuffer(this.uniform, 0, values);
    const encoder = this.device.createCommandEncoder({ label: 'GPE symmetric split steps' });
    for (let s = 0; s < count; s++) {
      // Each pass is a global storage barrier. No renormalization in real time.
      for (const pipeline of [this.local, this.fft[0], this.fft[1], this.kinetic, this.fft[2], this.fft[3], this.local]) {
        const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, this.groups[this.current], [256 * s]);
        pass.dispatchWorkgroups(this.fft.includes(pipeline) ? this.n : Math.ceil(this.n * this.n / 256)); pass.end(); this.current = 1 - this.current;
      }
    }
    this.device.queue.submit([encoder.finish()]);
    if (imaginary) this.preparationSteps += count;
    else { this.steps += count; this.time += count * dt; }
  }
  readbackState() {
    const task = this.readChain.then(async () => {
      if (this.disposed) throw new Error('Solver disposed.');
      const time = this.time, steps = this.steps;
      const encoder = this.device.createCommandEncoder(); encoder.copyBufferToBuffer(this.buffer, 0, this.readBuffer, 0, this.n * this.n * 8);
      this.device.queue.submit([encoder.finish()]); await this.readBuffer.mapAsync(GPUMapMode.READ);
      const field = new Float32Array(this.readBuffer.getMappedRange()).slice(); this.readBuffer.unmap(); return { field, time, steps };
    });
    this.readChain = task.catch(() => {}); return task;
  }
  async readback() { return (await this.readbackState()).field; }
  async fftRoundTrip(field) {
    this.upload(field);
    const encoder = this.device.createCommandEncoder();
    for (const pipeline of this.fft) { const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, this.groups[this.current], [0]); pass.dispatchWorkgroups(this.n); pass.end(); this.current = 1 - this.current; }
    this.device.queue.submit([encoder.finish()]); return this.readback();
  }
  async benchmark(kind, samples = 25) {
    const result = [], initial = await this.readback();
    for (let s = 0; s < samples + 4; s++) {
      this.upload(initial);
      await this.device.queue.onSubmittedWorkDone(); const start = performance.now();
      if (kind === 'fft') {
        const encoder = this.device.createCommandEncoder();
        for (const pipeline of this.fft.slice(0, 2)) { const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, this.groups[this.current], [0]); pass.dispatchWorkgroups(this.n); pass.end(); this.current = 1 - this.current; }
        this.device.queue.submit([encoder.finish()]);
      } else this.advance(8, { forcing: false });
      await this.device.queue.onSubmittedWorkDone(); if (s >= 4) result.push((performance.now() - start) / (kind === 'fft' ? 1 : 8));
    }
    result.sort((a, b) => a - b); return { median: result[Math.floor(result.length / 2)], p95: result[Math.floor(result.length * 0.95)], units: 'ms, queue completion including CPU submission', samples };
  }
  dispose() { this.disposed = true; for (const b of [...this.fields, this.uniform, this.roots, this.readBuffer]) b.destroy(); }
}
