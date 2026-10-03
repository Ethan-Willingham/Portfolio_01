// Compare v4 and v5 displays of one actual field, then boot both native browsers.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'assets/visualizer/negative-temperature');
const oldShader = fs.readFileSync(path.join(__dirname, 'negative-temperature-render-v4.wgsl'), 'utf8');
const server = http.createServer((req, res) => {
  if (req.url === '/') return res.end('<!doctype html><style>html,body{margin:0}canvas{display:block;width:1358px;height:612px}</style><canvas width="2716" height="1224"></canvas>');
  const file = path.resolve(root, '.' + req.url.split('?')[0]);
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({ executablePath: '/Users/ethan/.local/bin/agent-chrome-for-testing', headless: true, args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage({ viewport: { width: 1358, height: 612 }, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const state = await page.evaluate(async oldShader => {
      const { createRoom } = await import('./js/negative-temperature-room.js?v=5');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
      device.addEventListener('uncapturederror', event => window.renderErrors.push(event.error.message));
      window.renderErrors = []; let descriptor;
      const facade = new Proxy(device, { get(target, name) {
        if (name === 'createRenderPipeline') return description => { descriptor = description; return target.createRenderPipeline(description); };
        const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const room = await createRoom({ device: facade, seed: '180106951' });
      await room.debugAdvance(37500);
      const field = await room.debugReadback();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', field.field.buffer))).map(v => v.toString(16).padStart(2,'0')).join('');
      const oldModule = device.createShaderModule({ code: oldShader });
      const oldPipeline = device.createRenderPipeline({ ...descriptor, vertex: { ...descriptor.vertex, module: oldModule }, fragment: { ...descriptor.fragment, module: oldModule } });
      const width = 2716, height = 1224, canvas = document.querySelector('canvas'), context = canvas.getContext('webgpu');
      const format = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device, format, alphaMode: 'opaque' });
      const target = device.createTexture({ size: [width,height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
      const tone = device.createShaderModule({ code: `
        @group(0) @binding(0) var scene:texture_2d<f32>;
        @vertex fn vertex(@builtin(vertex_index)i:u32)->@builtin(position) vec4f {let xy=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(xy[i],0.,1.);}
        @fragment fn fragment(@builtin(position)p:vec4f)->@location(0) vec4f {let x=textureLoad(scene,vec2i(p.xy),0).rgb;let c=x/(1.+x);return vec4f(select(12.92*c,1.055*pow(c,vec3f(1./2.4))-.055,c>vec3f(.0031308)),1.);}` });
      const layout = device.createBindGroupLayout({ entries: [{ binding:0, visibility:GPUShaderStage.FRAGMENT, texture:{sampleType:'unfilterable-float'} }] });
      const tonePipeline = device.createRenderPipeline({ layout:device.createPipelineLayout({bindGroupLayouts:[layout]}), vertex:{module:tone,entryPoint:'vertex'}, fragment:{module:tone,entryPoint:'fragment',targets:[{format}]}, primitive:{topology:'triangle-list'} });
      const group = device.createBindGroup({ layout, entries:[{binding:0,resource:target.createView()}] });
      const proxyEncoder = encoder => ({ beginRenderPass(description) {
        const pass = encoder.beginRenderPass(description);
        return new Proxy(pass, { get(target,name) {if(name==='setPipeline')return () => target.setPipeline(oldPipeline);const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;} });
      } });
      async function draw(old = false, exposure = 1, present = true) {
        const encoder = device.createCommandEncoder();
        room.render({ encoder:old?proxyEncoder(encoder):encoder, targetView:target.createView(), width,height,exposure });
        if(present) {
          const pass = encoder.beginRenderPass({ colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}] });
          pass.setPipeline(tonePipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
        }
        device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();
      }
      window.comparison = { draw, room, device, target, context };
      return { date:'2026-10-03', adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture}, parameters:field.parameters, time:field.time, steps:field.steps, hash, diagnostics:field.diagnostics, dimensions:{width,height}, presentation:'One linear Reinhard and sRGB transfer, matching the standalone host.' };
    }, oldShader);
    await page.evaluate(() => comparison.draw(true));
    await page.screenshot({ path:path.join(output,'sharpness-before-v4.png') });
    await page.evaluate(() => comparison.draw(false));
    await page.screenshot({ path:path.join(output,'fallback.png') });
    await page.screenshot({ path:path.join(output,'sharpness-after-v5.png') });
    const verification = await page.evaluate(async () => {
      const {draw,room,device,target} = comparison, times=[];
      for(let i=0;i<29;i++){const start=performance.now();await draw(false,1,false);if(i>=4)times.push(performance.now()-start);}
      times.sort((a,b)=>a-b);
      const read=device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const half=x=>{const sign=x&32768?-1:1,e=(x>>10)&31,m=x&1023;return sign*(e?2**(e-15)*(1+m/1024):2**-14*m/1024);};
      async function pixel(exposure){await draw(false,exposure,false);const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:target,origin:[1358,612]},{buffer:read,bytesPerRow:256},{width:1,height:1});device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const values=Array.from(new Uint16Array(read.getMappedRange()).slice(0,3),half);read.unmap();return values;}
      const one=await pixel(1),two=await pixel(2);read.destroy();
      const field=await room.debugReadback(), hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',field.field.buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
      return {hash,errors:renderErrors,linearExposureRatio:two.map((v,i)=>v/one[i]),render:{median:times[12],p95:times[23],samples:25,warmups:4,units:'ms, single render including CPU submission and queue completion'}};
    });
    assert.equal(verification.hash,state.hash,'Both displays must leave the actual field unchanged.');
    assert.deepEqual(verification.errors,[]);assert.deepEqual(errors,[]);
    assert.ok(verification.linearExposureRatio.every(r=>Math.abs(r-2)<.01));
    Object.assign(state,verification); await page.evaluate(()=>{comparison.room.dispose();comparison.target.destroy();comparison.context.unconfigure();comparison.device.destroy();});await page.close();
    state.browserChecks=[];
    async function boot(engine) {
      const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));await page.goto(url+'/negative-temperature-lab.html?v=5');
      await page.waitForFunction(()=>document.getElementById('nt-piece').getAttribute('aria-busy')==='false',undefined,{timeout:45000});
      const first=await page.evaluate(()=>({activity:NegativeTemperature.activity(),snapshot:NegativeTemperature.snapshot(),status:document.getElementById('nt-status').textContent}));
      assert.equal(first.activity.fallback,false,first.status);assert.equal(first.snapshot.numericalStepCount,12000);
      if(engine==='Chrome')await page.screenshot({path:path.join(output,'sharpness-page-v5.png'),fullPage:true});
      await page.locator('#nt-play').click();await page.waitForTimeout(1500);await page.locator('#nt-play').click();
      const after=await page.evaluate(()=>NegativeTemperature.snapshot());assert.ok(after.numericalStepCount>12000);assert.deepEqual(errors,[]);
      const views=[];
      for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForFunction(()=>{const c=document.getElementById('nt-canvas'),b=c.getBoundingClientRect();return c.width>=b.width*2-1&&c.height>=b.height*2-1;});const view=await page.evaluate(()=>{const c=document.getElementById('nt-canvas'),b=c.getBoundingClientRect();return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,pixels:[c.width,c.height],css:[b.width,b.height]};});assert.equal(view.overflow,false);assert.ok(view.pixels[0]>=view.css[0]*2-1);assert.ok(view.pixels[1]>=view.css[1]*2-1);views.push(view);}
      state.browserChecks.push({engine,openingSteps:first.snapshot.numericalStepCount,afterMotionSteps:after.numericalStepCount,backend:first.snapshot.diagnosticsBackend,views,errors});await page.close();
    }
    await boot('Chrome');await browser.close();browser=null;
    browser=await webkit.launch({headless:true});await boot('WebKit');
    fs.writeFileSync(path.join(output,'sharpness-validation.json'),JSON.stringify(state,null,2));
    console.log(JSON.stringify({hash:state.hash,time:state.time,render:state.render,linearExposureRatio:state.linearExposureRatio,browserChecks:state.browserChecks}));
  } finally { await browser?.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
