// Actual GPU output: a coarse solver grid must not cut square holes around fuel.
export async function checkFireRendering(device) {
  const sim = FireWGPU.create({ device, width: 48, testing: true });
  const results = [];
  try {
    await sim.readyPromise;
    if (!sim.available) throw new Error(sim.errors.join('\n'));
    const hull = [[132,57],[222,97],[190,155],[98,114]];
    const body = { id: 1, x: 160, y: 106, r: 70, baseR: 70, angle: 0,
      life: 100, vertices: hull, volatile: 0.28, carbon: 0.72 };
    // The final body slot must occlude just as accurately as the first one.
    const fillers = Array.from({length:47}, (_,i)=>({...body,id:i+2,held:true}));
    const state = await sim.testKernel('geometry', { chunks: [...fillers,body] });
    const fields = new Float32Array(sim.width * sim.height * 8);
    for (let i = 0; i < state.mask.length / 2; i++) {
      if (state.mask[i * 2] === -1) fields.set([0,0.275,0.895,0.01,1800,0,0,0],i*8);
    }
    await sim.testKernel('transport', { fields, damper: 0 });
    sim.draw({ x: 0, y: 0, w: 640, h: 420 }, document.body);
    // Copy in the same task, before the browser presents and clears the canvas.
    const canvas = document.createElement('canvas');
    canvas.width = sim.canvas.width; canvas.height = sim.canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sim.canvas, 0, 0);
    const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let inside = 0, leaked = 0, outside = 0, dark = 0, partial = 0;
    for (let y = 70; y < canvas.height - 70; y++) for (let x = 130; x < canvas.width - 130; x++) {
      const px = (x + 0.5) * 320 / canvas.width, py = (y + 0.5) * 210 / canvas.height;
      let distance = -Infinity;
      for (let j = 0; j < hull.length; j++) {
        const a = hull[j], b = hull[(j+1)%hull.length], dx = b[0]-a[0], dy = b[1]-a[1];
        distance = Math.max(distance, ((px-a[0])*dy-(py-a[1])*dx)/Math.hypot(dx,dy));
      }
      const alpha = pixels[(y*canvas.width+x)*4+3];
      if (distance < -1) { inside++; if (alpha > 1) leaked++; }
      if (distance > 1 && distance < 5) { outside++; if (alpha < 200) dark++; }
      if (Math.abs(distance) < 0.4 && alpha > 8 && alpha < 240) partial++;
    }
    results.push({ label: 'polygon interiors fully occlude flame light', pass: inside > 1000 && leaked === 0, detail: { inside, leaked } });
    results.push({ label: 'diagonal fuel edges have no grid-sized dark staircase', pass: outside > 100 && dark === 0, detail: { outside, dark } });
    results.push({ label: 'fuel silhouettes receive subpixel antialiasing', pass: partial > 100, detail: { partial } });
    await sim.testKernel('geometry', { chunks: [] });
    for (let i = 0; i < fields.length / 8; i++) fields.set([0,0.275,0.905,0,0,0,0,0],i*8);
    // A one-cell hot filament surrounded by cold air used to disappear when
    // temperature was filtered before its nonlinear thermal emission.
    for (let y = 4; y < sim.height - 4; y++) fields.set([0,0.275,0.895,0.01,1652,0,0,0],(y*sim.width+24)*8);
    await sim.testKernel('transport', { fields, damper: 0 });
    sim.draw({x:0,y:0,w:640,h:420},document.body);
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(sim.canvas,0,0);
    const filament = ctx.getImageData(Math.floor(24.5/48*canvas.width),Math.floor(canvas.height/2),1,1).data;
    results.push({label:'thin hot filaments retain emitted light through smooth reconstruction',pass:filament[0]>200 && filament[3]>180,detail:Array.from(filament)});
    fields.fill(0);
    for (let i=0;i<fields.length/8;i++)fields.set([.01,.275,.885,.01,0,0,0,0],i*8);
    await sim.testKernel('transport',{fields,damper:0});sim.draw({x:0,y:0,w:640,h:420},document.body);
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(sim.canvas,0,0);
    const cold = ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data;
    results.push({label:'cold fuel and soot remain unlit',pass:cold[0]<80 && cold[1]<80 && cold[2]<80,detail:Array.from(cold)});
    return results;
  } finally { sim.dispose(); }
}
