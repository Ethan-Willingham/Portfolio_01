// Actual GPU neighbor-search differential against the original five-cell stencil.
// The affine z lane is private grid-membership metadata, not material state.
export async function runGrainDifferential(device, apis) {
  const cases = [];
  for (const scenario of ['drifted-grid', 'dense-pile', 'water-and-frozen']) {
    const count = 300, width = 24, height = 24, cells = width * height;
    const initial = new Float32Array(count * 4), flags = new Uint32Array(count);
    const bins = Array.from({ length: cells }, () => []);
    let seed = 83;
    function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    for (let i = 0; i < count; i++) {
      const x = scenario === 'dense-pile' ? 29 + random() * 2 : 8 + random() * 44;
      const y = scenario === 'dense-pile' ? 29 + random() * 2 : 8 + random() * 44;
      bins[Math.floor(y / 2.5) * width + Math.floor(x / 2.5)].push(i);
      initial.set([x + (random() - .5) * 5, y + (random() - .5) * 5, (random() - .5) * 20, (random() - .5) * 20], i * 4);
      flags[i] = scenario === 'water-and-frozen' && i % 7 === 0 ? 0 : 65 | (i % 13 === 0 ? 32 : 0);
    }
    const counts = new Uint32Array(cells), starts = new Uint32Array(cells), sorted = new Uint32Array(count);
    let cursor = 0;
    bins.forEach((bin, i) => { counts[i] = bin.length; starts[i] = cursor; sorted.set(bin, cursor); cursor += bin.length; });
    const gp = new ArrayBuffer(80), gu = new Uint32Array(gp), gf = new Float32Array(gp);
    gu.set([count, width, height, 0, 0, cells]); gf[6] = 1 / 332; gf[7] = .4; gf[8] = 256; gf[9] = 32; gf[10] = 256; gf.set([0, 0, 60, 60], 16);
    const air = new Float32Array(16); air[2] = 12; air[3] = 1 / 332; air[4] = air[5] = 64; air[6] = count; air[10] = 2.5 / Math.sqrt(3.2);
    const results = {};
    for (const label of ['before', 'after']) {
      const allocated = [], textures = [];
      function buffer(data, uniform = false) {
        const b = device.createBuffer({ size: Math.max(16, data.byteLength), usage: (uniform ? GPUBufferUsage.UNIFORM : GPUBufferUsage.STORAGE) | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(b, 0, data); allocated.push(b); return b;
      }
      const pos = buffer(initial), before = buffer(initial), aux = buffer(new Float32Array(count * 4)), flag = buffer(flags), affine = buffer(new Float32Array(count * 4));
      const buffers = [buffer(gp, true), buffer(air, true), pos, before, aux, flag, affine, buffer(counts), buffer(starts), buffer(sorted)];
      const texture = device.createTexture({ size: [64, 64], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); textures.push(texture);
      const motion=buffer(new Uint32Array(cells)), membership=new Uint32Array(count);bins.forEach((bin,c)=>bin.forEach(i=>membership[i]=c));const cellOf=buffer(membership);
      const game = buffer(new Float32Array(1024), true);
      const entries = buffers.map((b, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: binding < 2 ? 'uniform' : [3, 7, 8, 9].includes(binding) ? 'read-only-storage' : 'storage' } }));
      entries.push({ binding: 10, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } }, { binding: 11, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } });
      entries.push({binding:13,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}});
      const bgl = device.createBindGroupLayout({ entries }), layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
      const module = device.createShaderModule({ code: apis[label].grainShader });
      const pipes = Object.fromEntries((label==='after'?['contacts','shield','trackMotion']:['contacts','shield']).map(entryPoint => [entryPoint, device.createComputePipeline({ layout, compute: { module, entryPoint } })]));
      const binds = buffers.map((b, binding) => ({ binding, resource: { buffer: b } }));
      binds.push({ binding: 10, resource: texture.createView() }, { binding: 11, resource: { buffer: game } });
      binds.push({binding:13,resource:{buffer:motion}});
      const bg = device.createBindGroup({ layout: bgl, entries: binds });let initBG;if(label==='after'){const ie=entries.filter(e=>[0,2,5,6].includes(e.binding));ie.push({binding:14,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}});const il=device.createBindGroupLayout({entries:ie});pipes.initMotion=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[il]}),compute:{module,entryPoint:'initMotion'}});const ib=binds.filter(e=>[0,2,5,6].includes(e.binding));ib.push({binding:14,resource:{buffer:cellOf}});initBG=device.createBindGroup({layout:il,entries:ib});}
      // Membership intentionally predates current positions. This catches an
      // unsafe reduction of the stencil based only on current distance.
      for (let step = 0; step < 4; step++) {
        const enc = device.createCommandEncoder();
        if(label==='after'){enc.clearBuffer(motion);const init=enc.beginComputePass();init.setPipeline(pipes.initMotion);init.setBindGroup(0,initBG);init.dispatchWorkgroups(2);init.setPipeline(pipes.trackMotion);init.setBindGroup(0,bg);init.dispatchWorkgroups(2);init.end();}
        for (let iteration = 0; iteration < 8; iteration++) {
          enc.copyBufferToBuffer(pos, 0, before, 0, count * 16);
          const pass = enc.beginComputePass(); pass.setPipeline(pipes[iteration === 7 ? 'shield' : 'contacts']); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(2); if(label==='after'){pass.setPipeline(pipes.trackMotion);pass.dispatchWorkgroups(2);} pass.end();
        }
        device.queue.submit([enc.finish()]);
      }
      results[label] = {};
      for (const [name, b, bytes] of [['pos', pos, count * 16], ['aux', aux, count * 16], ['affine', affine, count * 16], ['flag', flag, count * 4]]) {
        results[label][name] = new Uint32Array(await apis[label].readbackBuffer({ device, queue:device.queue }, b, bytes));
      }
      allocated.forEach(b => b.destroy()); textures.forEach(t => t.destroy());
    }
    let differences = 0;
    for (const key of ['pos', 'aux', 'affine', 'flag']) for (let i = 0; i < results.before[key].length; i++) if (!(key==='affine'&&i%4===2) && results.before[key][i] !== results.after[key][i]) differences++;
    cases.push({ scenario, particles: count, iterations: 32, bitDifferences: differences, pass: differences === 0 });
  }
  return { pass: cases.every(c => c.pass), cases };
}
