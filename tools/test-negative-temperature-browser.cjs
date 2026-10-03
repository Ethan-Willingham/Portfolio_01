// NODE_PATH=<bundled node_modules> node tools/test-negative-temperature-browser.cjs [--protocol]
// Own both the HTTP server and exact Chrome for Testing child through Playwright.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), outputs = path.join(root, 'assets/visualizer/negative-temperature');
const server = http.createServer((req, res) => { const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0])); if (!file.startsWith(root + '/')) return res.writeHead(403).end(); try { const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream'; res.setHeader('Content-Type', type); res.end(fs.readFileSync(file)); } catch { res.writeHead(404).end(); } });
let browser; const errors = [], report = {};
const pass = s => console.log('PASS ' + s);
async function opened(context) {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/negative-temperature-lab.html`);
  await page.waitForFunction(() => document.getElementById('nt-piece').getAttribute('aria-busy') === 'false', undefined, { timeout: 120000 }); return page;
}
async function numerics(page) {
  return page.evaluate(async () => {
    const { GPUSolver } = await import('./js/negative-temperature-gpu.js');
    const { CONFIG, initialField, fft2, cpuStep, measure } = await import('./js/negative-temperature-model.js');
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice(); const errors = []; device.addEventListener('uncapturederror', e => errors.push(e.error.message));
    const result = { adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter ?? null } };
    const rms = (a,b) => Math.sqrt(a.reduce((s,v,i) => s+(v-b[i])**2,0)/a.length);
    const p = { ...CONFIG, grid:32, side:16, wallHeight:0, paddleAmplitude:0, dt:.02 };
    const input = new Float32Array(2*32*32);
    for(let j=0;j<32;j++)for(let i=0;i<32;i++){const k=2*(j*32+i),ph=2*Math.PI*(2*i-j)/32,amp=.8*(1+.1*Math.cos(2*Math.PI*i/32));input[k]=amp*Math.cos(ph);input[k+1]=amp*Math.sin(ph);}
    const gpu = new GPUSolver(device,p,'1234');
    result.roundTripRMS=rms(input,await gpu.fftRoundTrip(input));
    gpu.upload(input);gpu.advance(20,{forcing:false});const cpu=Float64Array.from(input);for(let i=0;i<20;i++)cpuStep(cpu,p,i*p.dt);
    const state=await gpu.readback();result.cpuGPU20StepsRMS=rms(cpu,state);result.normDrift20Steps=measure(state,p).norm/measure(input,p).norm-1;
    gpu.dispose();
    const big = new GPUSolver(device,CONFIG,'1234'), field=initialField(CONFIG,'1234');
    result.roundTrip256RMS=rms(field,await big.fftRoundTrip(field));big.upload(field);
    for(let i=0;i<1600;i+=128){big.advance(Math.min(128,1600-i),{imaginary:true});await device.queue.onSubmittedWorkDone();}
    const ground=await big.readback();result.prepared=measure(ground,CONFIG);
    big.advance(100,{imaginary:true});result.preparationRelativeChange=rms(ground,await big.readback());
    const wave = new Float32Array(field.length);const frequency=.5*(2*Math.PI/CONFIG.side)**2*5+CONFIG.g*.64;
    for(let j=0;j<256;j++)for(let i=0;i<256;i++){const k=2*(j*256+i),ph=2*Math.PI*(2*i-j)/256;wave[k]=.8*Math.cos(ph);wave[k+1]=.8*Math.sin(ph);}
    const flat = new GPUSolver(device,{...CONFIG,wallHeight:0,paddleAmplitude:0},'1234');flat.upload(wave);flat.advance(100,{forcing:false});const evolved=await flat.readback(),angle=frequency*CONFIG.dt*100;
    const exact=wave.map((v,k)=>k%2?wave[k-1]*-Math.sin(angle)+v*Math.cos(angle):v*Math.cos(angle)+wave[k+1]*Math.sin(angle));result.planeWave256RMS=rms(evolved,exact);result.normDrift100Steps=measure(evolved,{...CONFIG,wallHeight:0,paddleAmplitude:0}).norm/measure(wave,{...CONFIG,wallHeight:0,paddleAmplitude:0}).norm-1;
    flat.dispose();big.upload(ground);result.fftTiming=await big.benchmark('fft');big.upload(ground);result.stepTiming=await big.benchmark('step');big.dispose();
    const wideP={...CONFIG,grid:512,side:96,dt:.005},wide=new GPUSolver(device,wideP,'1234'),wideInput=initialField(wideP,'1234');result.roundTrip512RMS=rms(wideInput,await wide.fftRoundTrip(wideInput));wide.upload(wideInput);wide.advance(128,{imaginary:true});result.wideBoxFinite=(await wide.readback()).every(Number.isFinite);wide.dispose();
    const {createRoom}=await import('./js/negative-temperature-room.js');
    const room=await createRoom({device,seed:'180106951',quality:'low'}),other=await createRoom({device,seed:'1234',quality:'medium'});
    const target=device.createTexture({size:[640,360],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    room.resize({width:640,height:360,dpr:1});other.dispose();
    const times=[];for(let s=0;s<29;s++){await device.queue.onSubmittedWorkDone();const start=performance.now(),encoder=device.createCommandEncoder();room.render({encoder,targetView:target.createView(),width:640,height:360,exposure:1});device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();if(s>=4)times.push(performance.now()-start);}times.sort((a,b)=>a-b);result.renderTiming={median:times[12],p95:times[23],units:'ms, queue completion including CPU submission',size:[640,360],samples:25};
    const read=device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const half=x=>{const sign=x&32768?-1:1,e=(x>>10)&31,m=x&1023;return sign*(e?2**(e-15)*(1+m/1024):2**-14*m/1024);};
    const pixel=async exposure=>{const encoder=device.createCommandEncoder();room.render({encoder,targetView:target.createView(),width:640,height:360,exposure});encoder.copyTextureToBuffer({texture:target,origin:[320,180]},{buffer:read,bytesPerRow:256},{width:1,height:1});device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const p=Array.from(new Uint16Array(read.getMappedRange()).slice(0,4),half);read.unmap();return p;};
    const one=await pixel(1),two=await pixel(2);result.roomContract={remainingRoomUsableAfterOtherDispose:one[0]>0.1,linearExposureRatio:two.slice(0,3).map((v,i)=>v/one[i]),snapshot:room.snapshot()};read.destroy();target.destroy();room.dispose();
    // The same paddle protocol at two timesteps, including vortex nucleation.
    result.protocolDtHalving=[];for(const dt of [.01,.005]){const q={...CONFIG,dt},s=new GPUSolver(device,q,'180106951');s.upload(ground);const count=Math.round(150/dt);for(let i=0;i<count;i+=128){s.advance(Math.min(128,count-i));await device.queue.onSubmittedWorkDone();}const d=measure(await s.readback(),q,150);result.protocolDtHalving.push({dt,...d});s.dispose();}
    result.errors=errors;device.destroy();return result;
  });
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
  browser=await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',args:['--enable-unsafe-webgpu']});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const page=await opened(context);
  assert.equal(await page.evaluate(()=>NegativeTemperature.activity().fallback),false);
  report.numerics=await numerics(page); console.log(JSON.stringify(report.numerics));
  assert.ok(report.numerics.roundTripRMS<2e-6);assert.ok(report.numerics.roundTrip256RMS<2e-6);assert.ok(report.numerics.cpuGPU20StepsRMS<2e-5);assert.ok(report.numerics.planeWave256RMS<5e-5);assert.ok(Math.abs(report.numerics.normDrift100Steps)<1e-4);assert.deepEqual(report.numerics.errors,[]);pass('FFT, analytic plane wave, small CPU/GPU comparison and norm');
  assert.ok(report.numerics.roundTrip512RMS<2e-6&&report.numerics.wideBoxFinite);assert.ok(report.numerics.roomContract.remainingRoomUsableAfterOtherDispose);assert.ok(report.numerics.roomContract.linearExposureRatio.every(v=>Math.abs(v-2)<.01));assert.ok(report.numerics.protocolDtHalving.every(d=>d.clustered&&d.positive>=4&&d.negative>=4));pass('512 FFT and finite field, shared-device room ownership, linear exposure and protocol at half timestep');
  await page.locator('#nt-play').click();const before=await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount),before);await page.locator('#nt-play').click();await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount)>before);
  await page.locator('#nt-canvas').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>NegativeTemperature.activity().paused),true);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>NegativeTemperature.activity().paused),false);pass('Keyboard Space pauses and plays');
  await page.locator('#nt-instruments-button').click();assert.equal(await page.locator('#nt-instruments').isVisible(),true);await page.locator('#nt-view').selectOption('phase');await page.locator('#nt-signs').check();await page.locator('#nt-view').selectOption('velocity');await page.locator('#nt-view').selectOption('density');await page.locator('#nt-signs').uncheck();await page.locator('#nt-instruments-button').click();pass('Pause, play and display instruments');
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(200);const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,buttons:[...document.querySelectorAll('.nt-toolbar button')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),stage:document.querySelector('.nt-stage').getBoundingClientRect().height}));assert.ok(layout.width<=layout.viewport+1);assert.ok(layout.buttons.every(b=>b.width>=44&&b.height>=44));assert.ok(layout.stage>=280);await page.screenshot({path:path.join(outputs,`layout-${width}x${height}.png`),fullPage:true});}pass('Desktop and both mobile orientations');
  await page.setViewportSize({width:1440,height:900});await page.locator('#nt-fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement||document.getElementById('nt-piece').classList.contains('nt-fullscreen'));await page.locator('#nt-fullscreen').click();pass('Fullscreen and exit');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);const hidden=await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount),hidden);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>document.getElementById('nt-piece').style.transform='translateY(-200vh)');await page.waitForFunction(()=>!NegativeTemperature.activity().running);await page.evaluate(()=>document.getElementById('nt-piece').style.transform='');await page.waitForFunction(()=>NegativeTemperature.activity().running);pass('Hidden and offscreen suspension');
  await page.locator('#nt-play').click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.evaluate(()=>NegativeTemperature.activity().paused),true);await page.locator('#nt-play').click();await context.setOffline(true);const offline=await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount);await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount)>offline);await context.setOffline(false);pass('Manual pause survives visibility; offline evolution continues');
  await page.evaluate(()=>NegativeTemperature.advance(0));await page.locator('#nt-restart').click();await page.waitForFunction(()=>!NegativeTemperature.activity().starting);const fieldHash=()=>page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',(await NegativeTemperature.debugReadback()).field.buffer))).map(v=>v.toString(16).padStart(2,'0')).join(''));const first=await fieldHash();await page.locator('#nt-restart').click();await page.waitForFunction(()=>!NegativeTemperature.activity().starting);const second=await fieldHash();assert.equal(first,second);report.sameDeviceFieldSHA256=first;pass('Same-device seed restart, whole-field SHA-256');
  await page.screenshot({path:path.join(outputs,'startup.png'),fullPage:true});
  if(process.argv.includes('--protocol')){
    const history=[];const total=process.env.NT_STEPS?Number(process.env.NT_STEPS):162000;
    for(let step=0;step<total;step+=1000){const d=await page.evaluate(n=>NegativeTemperature.advance(n),Math.min(1000,total-step));history.push(d);console.log(`time ${d.simulationTime.toFixed(1)} count ${d.diagnostics.positive}/${d.diagnostics.negative} C2 ${d.diagnostics.c2?.toFixed(2)} largest ${d.diagnostics.largestCluster} drift ${d.diagnostics.normDrift.toExponential(2)}`);
      if(step===4000)await page.screenshot({path:path.join(outputs,'developing.png'),fullPage:true});
      if(d.diagnostics.clustered&&!history.slice(0,-1).some(s=>s.diagnostics.clustered)){await page.screenshot({path:path.join(outputs,'payoff.png'),fullPage:true});const url=await page.evaluate(()=>document.getElementById('nt-canvas').toDataURL('image/png'));fs.writeFileSync(path.join(outputs,'fallback.png'),Buffer.from(url.split(',')[1],'base64'));}
      if(step===24999||step===24000){await page.screenshot({path:path.join(outputs,'payoff.png'),fullPage:true});const url=await page.evaluate(()=>document.getElementById('nt-canvas').toDataURL('image/png'));fs.writeFileSync(path.join(outputs,'fallback.png'),Buffer.from(url.split(',')[1],'base64'));await page.locator('#nt-instruments-button').click();await page.locator('#nt-signs').check();await page.screenshot({path:path.join(outputs,'payoff-instruments.png'),fullPage:true});await page.locator('#nt-signs').uncheck();await page.locator('#nt-instruments-button').click();}
    }
    report.history=history;report.clusteredSamples=history.filter(s=>s.diagnostics.clustered).length;fs.writeFileSync(path.join(outputs,'protocol-run.json'),JSON.stringify({date:'2026-10-03',hardware:'Apple M1 Pro, Metal via Chrome for Testing',history},null,2));
    if(!report.clusteredSamples){const url=await page.evaluate(()=>document.getElementById('nt-canvas').toDataURL('image/png'));fs.writeFileSync(path.join(outputs,'fallback.png'),Buffer.from(url.split(',')[1],'base64'));await page.screenshot({path:path.join(outputs,'payoff.png'),fullPage:true});}
    console.log('CLUSTERED samples: '+report.clusteredSamples);
  }
  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}), still=await opened(reduced);assert.equal(await still.locator('#nt-play').textContent(),'Play');const step=await still.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount);await still.waitForTimeout(200);assert.equal(await still.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount),step);await still.locator('#nt-play').click();await still.waitForTimeout(200);assert.ok(await still.evaluate(()=>NegativeTemperature.snapshot().numericalStepCount)>step);await reduced.close();pass('Reduced motion starts still and can play');
  const missing=await browser.newContext({viewport:{width:390,height:844}});await missing.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));const fallback=await opened(missing);assert.ok(await fallback.locator('#nt-fallback').isVisible());assert.ok((await fallback.locator('#nt-status').textContent()).includes('no live simulation'));await missing.close();pass('Missing WebGPU has an attributed still');
  await page.evaluate(()=>NegativeTemperature.debugLoseDevice());await page.waitForFunction(()=>NegativeTemperature.activity().fallback);assert.ok((await page.locator('#nt-status').textContent()).includes('lost'));pass('Device loss stops work and shows recorded fallback');
  assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(outputs,'validation.json'),JSON.stringify({...report,history:undefined},null,2));pass('No script or GPU validation errors');await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
