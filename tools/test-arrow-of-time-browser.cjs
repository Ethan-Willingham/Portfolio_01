// NODE_PATH=/path/to/node_modules node tools/test-arrow-of-time-browser.cjs
// The harness owns this HTTP server and the exact Chrome for Testing child process.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..'), out = process.env.ARROW_CHECK_OUTPUT || path.join(os.tmpdir(), 'arrow-of-time-checks');
fs.mkdirSync(out, { recursive: true });
const errors = [], results = { numerical: [], performance: [], screenshots: [], browser: [] }; let browser;
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try { const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }; res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); } catch { res.writeHead(404).end(); }
});
async function open(context, query = '') {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/arrow-of-time-lab.html${query}`); await page.waitForFunction(() => document.querySelector('#aot-piece').getAttribute('aria-busy') === 'false'); return page;
}
async function fit(page) {
  const box = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('.aot-toolbar button')].map(b => { const r = b.getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right }; }) }));
  assert.ok(box.scroll <= box.width + 1, 'horizontal overflow'); for (const b of box.buttons) { assert.ok(b.width >= 44 && b.height >= 44); assert.ok(b.right <= box.width + 1); }
}
async function snapshot(page) { return page.evaluate(() => ArrowOfTime.snapshot()); }
async function screenshot(page, name) { const file = path.join(out, name + '.png'); await page.screenshot({ path: file }); results.screenshots.push(file); }
async function numerical(page) {
  return page.evaluate(async () => {
    const M = await import('/js/arrow-of-time-model.js'), G = await import('/js/arrow-of-time-gpu.js');
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
    const validation = []; device.addEventListener('uncapturederror', e => validation.push(e.error.message)); const records = [], perf = [];
    try {
      for (const [w, h] of [[2, 2], [30, 6], [32, 8], [34, 10], [66, 4], [256, 256], [512, 512], [768, 512], [1024, 768], [2048, 1536]]) {
        const authored = M.prepare(w, h); if (w < 100) { for (let i = 0; i < authored.y.length; i++) if ((i * i + 3 * i) % 7 < 3) authored.y[i] *= -1; }
        const gpu = await G.createQ2RGPU(device, authored); let cpu = authored;
        try {
          for (let k = 1; k <= 24; k++) { gpu.update(1); cpu = M.evolve(cpu); const r = await gpu.readback(); if (!M.compare(r, cpu).exact) throw Error(`CPU/GPU mismatch ${w}x${h}, step ${k}`); if (r.integerReduction.energyTwiceJ !== M.energyTwice(cpu)) throw Error('Integer energy mismatch'); if (M.energyTwice(cpu) !== M.energyTwice(authored)) throw Error('Energy drift'); if (M.checksum(r.packedX,r.packedY)!==M.checksum(M.pack(cpu.x,w,h),M.pack(cpu.y,w,h))) throw Error('Packed checksum mismatch'); for (const key of ['x','y']) { const expected=M.pack(cpu[key],w,h), actual=key==='x'?r.packedX:r.packedY; for(let i=0;i<expected.length;i++) if(expected[i]!==actual[i]) throw Error('Full packed word mismatch'); } }
          gpu.update(24, -1); const r = await gpu.readback(); if (!M.compare(r, authored).exact) throw Error('Inverse GPU return mismatch');
          if (w >= 256) { gpu.update(4320); gpu.update(4320, -1); const long = await gpu.readback(); if (!M.compare(long, authored).exact) throw Error('Long inverse return failed'); records.push({ size: `${w}x${h}`, longForward: 4320, longInverse: 4320, comparedSpins: w * h * 2, exact: true, checksum: long.checksum }); }
          records.push({ size: `${w}x${h}`, cpuGpuStepsCompared: 24, inverseSteps: 24, energyDriftTwiceJ: 0, tolerance: 0 });
          // A step boundary must join the old visible pair to the new visible pair exactly.
          const imageTarget = device.createTexture({ size: [128,96], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
          const imageRead = device.createBuffer({size:128*96*8,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
          async function pixels(blend) { const e=device.createCommandEncoder(); gpu.render({encoder:e,targetView:imageTarget.createView(),width:128,height:96,blend}); e.copyTextureToBuffer({texture:imageTarget},{buffer:imageRead,bytesPerRow:1024},[128,96]);device.queue.submit([e.finish()]);await imageRead.mapAsync(GPUMapMode.READ);const a=new Uint16Array(imageRead.getMappedRange()).slice();imageRead.unmap();return a; }
          try {
            for(const direction of [1,-1]) {const before=await pixels(1);gpu.update(1,direction);const boundary=await pixels(0),middle=await pixels(.5),after=await pixels(1);
              for(let i=0;i<before.length;i++){if(before[i]!==boundary[i])throw Error(`Display discontinuity ${w}x${h}, direction ${direction}`);if(middle[i]<Math.min(before[i],after[i])-1||middle[i]>Math.max(before[i],after[i])+1)throw Error('Display interpolation overshoot');}
            }
            const final=await gpu.readback();if(!M.compare(final,authored).exact)throw Error('Display checks changed the returned state');
            records.push({size:`${w}x${h}`,renderBoundaryPixelsExact:true,forwardAndInverse:true,interpolationOvershoot:false});
          } finally {imageTarget.destroy();imageRead.destroy();}
          const length=w>=256?4320:128, prepared=gpu.prepareTimeline(length), checked=await gpu.readback();
          if(!M.compare(checked,authored).exact)throw Error('Timeline preparation changed the opening state');
          const reference=await G.createQ2RGPU(device,authored), seekTimes=[];
          try {
            for(const position of [length,0,33,97,32,1]){const start=performance.now();gpu.seekTimeline(position);const found=await gpu.readback();seekTimes.push(performance.now()-start);
              let expected=authored;if(w<256){for(let k=0;k<position;k++)expected=M.evolve(expected);}else{reference.update(position);expected=await reference.readback();reference.update(position,-1);}
              if(!M.compare(found,expected).exact)throw Error(`Timeline seek mismatch ${w}x${h} at ${position}`);
            }
            gpu.seekTimeline(97,-1);gpu.update(13,-1);let expected=authored;for(let k=0;k<84;k++)expected=M.evolve(expected);if(!M.compare(await gpu.readback(),expected).exact)throw Error('Inverse continuation after seeking differs');
            gpu.seekTimeline(0);if(!M.compare(await gpu.readback(),authored).exact)throw Error('Timeline opening did not restore');
            records.push({size:`${w}x${h}`,timelineCheckpoints:prepared.checkpoints,timelineBytes:prepared.bytes,arbitrarySeeksExact:true,inverseContinuationExact:true,seekIncludingReadbackMilliseconds:seekTimes});
          } finally {reference.dispose();}
          if (w >= 256) {
            const target = device.createTexture({ size: [1440, 600], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT }), view = target.createView();
            const timestamp = device.features.has('timestamp-query'), query = timestamp ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
            const resolve = timestamp ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
            const read = timestamp ? device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
            for (const mode of ['compute', 'render']) {
              const timings = [], wall = []; for (let i = 0; i < 32; i++) {
                const start = performance.now(), e = device.createCommandEncoder(), writes = query ? { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined;
                if (mode === 'compute') gpu.encodeSteps(e, 24, 1, writes);
                else gpu.render({ encoder: e, targetView: view, width: 1440, height: 600, exposure: 1, timestampWrites: writes });
                if (query) { e.resolveQuerySet(query, 0, 2, resolve, 0); e.copyBufferToBuffer(resolve, 0, read, 0, 16); }
                device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); wall.push(performance.now() - start);
                if (query) { await read.mapAsync(GPUMapMode.READ); const t = new BigUint64Array(read.getMappedRange()); timings.push(Number(t[1] - t[0]) / 1e6 / (mode === 'compute' ? 24 : 1)); read.unmap(); }
              }
              const summary = a => { a = a.slice(4).sort((a, b) => a - b); return { median: a[Math.floor(a.length / 2)], p95: a[Math.ceil(a.length * .95) - 1] }; };
              perf.push({ size: `${w}x${h}`, mode, precision: 'u32 packed spins / u32 block sums / rgba16float scene', updateRate: 24, gpuMilliseconds: timestamp ? summary(timings) : null, submitAndCompletionMilliseconds: summary(wall), gpuScope: mode === 'render' ? 'fragment render pass only, hierarchy is included in wall time' : 'per microscopic step, batch of 24', adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, device: adapter.info.device, isFallbackAdapter: adapter.info.isFallbackAdapter } });
            }
            target.destroy(); query?.destroy(); resolve?.destroy(); read?.destroy();
          }
        } finally { gpu.dispose(); }
      }
      const {createRoom}=await import('/js/arrow-of-time-room.js');const room=await createRoom({device,quality:'low'});room.setRate(768);
      try {
        for(let k=0;k<1000;k++){const s=room.snapshot();if(s.cycle===1&&s.phase==='arrival')break;room.step({dtSeconds:.1});if(room.snapshot().phase==='checking')await room.measure();if(room.snapshot().phase==='resetting')await new Promise(r=>setTimeout(r,20));}
        if(room.snapshot().cycle!==1||room.snapshot().phase!=='arrival')throw Error('Room did not reach the next opening');
        await room.seek(0);const reference=await G.createQ2RGPU(device,M.prepare(256,256,'bloom'));
        const target=device.createTexture({size:[128,96],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),read=device.createBuffer({size:128*96*8,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        async function image(source){const e=device.createCommandEncoder();source.render({encoder:e,targetView:target.createView(),width:128,height:96});e.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:1024},[128,96]);device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const data=new Uint16Array(read.getMappedRange()).slice();read.unmap();return data;}
        try{const expected=await image(reference),found=await image(room);for(let i=0;i<expected.length;i++)if(found[i]!==expected[i])throw Error('Seeking to a later opening incorrectly faded the image');records.push({laterCycleOpeningSeekPixelsExact:true});}finally{reference.dispose();target.destroy();read.destroy();}
      }finally{room.dispose();}
      if (validation.length) throw Error(validation.join('\n')); return { records, perf };
    } finally { device.destroy(); }
  });
}
(async () => {
 try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, executablePath: path.join(os.homedir(), '.local/bin/agent-chrome-for-testing'), args: ['--enable-unsafe-webgpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }), page = await open(context);
  const problem = await page.locator('#aot-error').textContent(); assert.equal(problem, '', 'Initialization error: ' + problem); assert.ok(await page.evaluate(() => !!window.ArrowOfTime));
  assert.equal((await snapshot(page)).numericalStepCount, 0); assert.deepEqual([(await snapshot(page)).parameters.width, (await snapshot(page)).parameters.height], [2048,1536]); assert.equal(await page.locator('#aot-play').textContent(), 'Play');
  assert.equal((await snapshot(page)).parameters.zoom,6);assert.equal((await snapshot(page)).renderDprCap,3);assert.equal((await snapshot(page)).parameters.imageScale,.14);
  await screenshot(page, 'startup-1440'); await page.locator('.aot-stage').screenshot({ path: path.join(out, 'initial-scene.png') }); await fit(page);
  if (process.env.ARROW_LAYOUT_ONLY) { for(const [width,height] of [[390,844],[844,390],[1440,900]]) { await page.setViewportSize({width,height}); await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); }); await page.waitForFunction(() => scrollY===0); await fit(page); if(width===844) {const bounds=await page.locator('.aot-toolbar').boundingBox();assert.ok(bounds.y+bounds.height<=height+1,'Landscape controls below fold');} await screenshot(page,`layout-${width}x${height}`); } assert.deepEqual(errors,[]); console.log('PASS top-of-page layout inspection'); return; }
  if (process.env.ARROW_VIEW_ONLY) {
    await page.locator('#aot-zoom').fill('16');assert.equal((await snapshot(page)).parameters.zoom,16);
    await page.locator('#aot-fit').click();assert.ok((await snapshot(page)).parameters.zoom<6);await screenshot(page,'whole-image');
    await page.locator('#aot-zoom').fill('6');
    for(const position of [1000,2500,8640]){await page.locator('#aot-timeline').fill(String(position));await page.waitForFunction(p=>ArrowOfTime.snapshot().timelinePosition===p&&!ArrowOfTime.snapshot().seeking,position);await screenshot(page,`close-step-${position}`);}
    assert.equal((await snapshot(page)).returnResult.exact,true);
    const before=await page.evaluate(()=>ArrowOfTime.debugReadback());await page.locator('#aot-draw-toggle').click();
    const colors=['#02ffd4','#6c30ff','#ff2488','#ffe436','#071925'];
    for(const [i,id] of ['aot-ink-a','aot-ink-b','aot-ink-c','aot-ink-d','aot-background'].entries())await page.locator('#'+id).fill(colors[i]);
    await page.waitForFunction(()=>ArrowOfTime.snapshot().background[1]>.009);const after=await page.evaluate(()=>ArrowOfTime.debugReadback());assert.deepEqual(after.packedX,before.packedX);assert.deepEqual(after.packedY,before.packedY);
    assert.equal(await page.locator('.aot-stage').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(7, 25, 37)');await page.locator('#aot-draw-toggle').click();await screenshot(page,'custom-colors');
    const hd=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'reduce'}),hp=await open(hd);
    const resolution=await hp.locator('#aot-canvas').evaluate(c=>({width:c.width,height:c.height,cssWidth:c.getBoundingClientRect().width,cssHeight:c.getBoundingClientRect().height}));assert.equal(resolution.width,Math.round(resolution.cssWidth*2));assert.equal(resolution.height,Math.round(resolution.cssHeight*2));await screenshot(hp,'retina-1440');await hd.close();
    const dense=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,reducedMotion:'reduce'}),dp=await open(dense);const phoneResolution=await dp.locator('#aot-canvas').evaluate(c=>({width:c.width,height:c.height,cssWidth:c.getBoundingClientRect().width,cssHeight:c.getBoundingClientRect().height}));assert.equal(phoneResolution.width,Math.round(phoneResolution.cssWidth*3));assert.equal(phoneResolution.height,Math.round(phoneResolution.cssHeight*3));await screenshot(dp,'dense-phone');await dense.close();
    const medium=await open(context,'?quality=medium');assert.deepEqual([(await snapshot(medium)).parameters.width,(await snapshot(medium)).parameters.height],[768,512]);await medium.close();
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);});await fit(page);const bounds=await page.locator('.aot-toolbar').boundingBox();assert.ok(bounds.y+bounds.height<=845);await screenshot(page,'phone-all-controls');
    results.browser.push({closeZoom:6,maxZoom:16,wholeImage:true,fourInksAndBackground:true,paletteLeavesFullStateUnchanged:true,retinaResolution:resolution,densePhoneResolution:phoneResolution,defaultLattice:'2048x1536',mediumLattice:'768x512',exactSeekReturn:true});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'view-checks.json'),JSON.stringify(results,null,2));console.log('PASS close zoom, whole image, vivid palette, unchanged microscopic state, Retina resolution, medium option and phone controls');return;
  }
  if (process.env.ARROW_EDITOR_ONLY) {
    await page.locator('#aot-draw-toggle').click();await page.locator('#aot-clear').click();await page.locator('#aot-render-drawing').click();assert.ok((await page.locator('#aot-drawing-note').textContent()).includes('Draw a shape first'));
    await page.locator('#aot-drawing').focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.locator('#aot-eraser').click();assert.equal(await page.locator('#aot-eraser').getAttribute('aria-pressed'),'true');await page.locator('#aot-eraser').click();
    await page.locator('#aot-render-drawing').click();await page.waitForFunction(()=>ArrowOfTime.snapshot().configurationId.startsWith('custom-')&&ArrowOfTime.snapshot().phase==='arrival');assert.equal((await snapshot(page)).manualPause,true);
    const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    await touch.addInitScript(()=>{const request=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const d=await request.apply(this,args);window.__arrowTouchDevice=d;return d;};});
    const tp=await open(touch);await tp.locator('#aot-draw-toggle').click();await tp.locator('#aot-clear').click();await tp.locator('#aot-drawing').scrollIntoViewIfNeeded();const box=await tp.locator('#aot-drawing').boundingBox();await tp.touchscreen.tap(box.x+box.width*.4,box.y+box.height*.5);await tp.touchscreen.tap(box.x+box.width*.6,box.y+box.height*.5);
    await tp.locator('#aot-render-drawing').click();await tp.waitForFunction(()=>ArrowOfTime.snapshot().configurationId.startsWith('custom-')&&ArrowOfTime.snapshot().phase==='arrival');await tp.locator('#aot-timeline').fill('8640');await tp.waitForFunction(()=>ArrowOfTime.snapshot().returnResult?.exact&&!ArrowOfTime.snapshot().seeking);await screenshot(tp,'touch-drawing-return');
    await tp.evaluate(()=>__arrowTouchDevice.destroy());await tp.waitForFunction(()=>!document.querySelector('#aot-still').hidden);assert.equal(await tp.locator('#aot-timeline').isDisabled(),true);assert.deepEqual(await tp.locator('#aot-still').evaluate(c=>[c.width,c.height]),[2048,1536]);await screenshot(tp,'custom-device-loss');await touch.close();
    const fallback=await browser.newContext({viewport:{width:390,height:844}});await fallback.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));const fp=await open(fallback);assert.ok(await fp.locator('#aot-still').isVisible());assert.ok(await fp.locator('#aot-timeline').isDisabled());await screenshot(fp,'missing-webgpu');await fallback.close();
    assert.deepEqual(errors,[]);console.log('PASS empty drawing, keyboard drawing, eraser, touch rendering, exact custom return, custom device-loss still and missing WebGPU');return;
  }
  if (process.env.ARROW_RUNTIME_ONLY) {
    await page.locator('#aot-play').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => ArrowOfTime.snapshot().activeClock>.15);
    await page.evaluate(() => document.querySelector('#aot-piece').style.transform='translateY(300vh)'); await page.waitForFunction(() => !ArrowOfTime.snapshot().inView); const sleeping=await snapshot(page); await page.waitForTimeout(200); assert.equal((await snapshot(page)).activeClock,sleeping.activeClock);
    await page.evaluate(() => document.querySelector('#aot-piece').style.transform=''); await page.waitForFunction(() => ArrowOfTime.snapshot().inView); await page.locator('#aot-play').click();
    await page.locator('#aot-restart').click(); await page.waitForFunction(() => ArrowOfTime.snapshot().phase==='arrival'); assert.equal((await snapshot(page)).manualPause,true);
    await page.setViewportSize({width:844,height:390}); await page.evaluate(() => {document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);}); await page.waitForFunction(() => scrollY===0); await fit(page); const b=await page.locator('.aot-toolbar').boundingBox();assert.ok(b.y+b.height<=390);
    assert.deepEqual(errors,[]); console.log('PASS keyboard, final room initialization, stage suspension, paused restart and landscape controls'); return;
  }
  results.environment={browser:browser.version(),platform:process.platform};
  const n = await numerical(page); results.numerical.push(...n.records); results.performance.push(...n.perf); console.log(`PASS ${n.records.length} GPU numerical/render checks and ${n.perf.length} performance measurements`);
  if (process.env.ARROW_QUICK) { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); return; }
  await page.locator('#aot-instruments-toggle').click(); await page.locator('#aot-rate').selectOption('768'); await page.locator('#aot-play').click();
  await page.waitForFunction(() => ArrowOfTime.snapshot().orbitStep >= 2200, { timeout: 30000 });
  await page.locator('#aot-play').click(); const paused = await snapshot(page); await page.waitForTimeout(250); assert.equal((await snapshot(page)).numericalStepCount, paused.numericalStepCount);
  await page.locator('#aot-instruments-toggle').click(); await screenshot(page, 'developing-1440');
  await page.locator('#aot-play').click(); await page.waitForFunction(() => ArrowOfTime.snapshot().phase === 'returned', { timeout: 30000 }); await page.locator('#aot-play').click();
  const returned = await snapshot(page); assert.equal(returned.returnResult.exact, true); assert.equal(returned.returnResult.forwardSteps, 4320); assert.equal(returned.returnResult.inverseSteps, 4320); assert.equal(returned.energyDriftJ, 0);
  await page.waitForFunction(() => document.querySelector('#aot-phase').textContent === 'Every spin has returned.'); await screenshot(page, 'return-1440'); await page.locator('.aot-stage').screenshot({ path: path.join(out, 'returned-scene.png') }); const initialPixels=PNG.sync.read(fs.readFileSync(path.join(out,'initial-scene.png'))), returnedPixels=PNG.sync.read(fs.readFileSync(path.join(out,'returned-scene.png'))); assert.equal(initialPixels.width,returnedPixels.width); assert.equal(initialPixels.height,returnedPixels.height); const interiorBytes=(initialPixels.height-1)*initialPixels.width*4; assert.ok(initialPixels.data.subarray(0,interiorBytes).equals(returnedPixels.data.subarray(0,interiorBytes)), 'Instantaneous rendered return differs inside canvas; adjacent progress hairline excluded'); results.browser.push('Returned scene pixels exactly equal startup, excluding adjacent progress hairline'); const startupBuffer = fs.readFileSync(path.join(out, 'startup-1440.png')); assert.ok(startupBuffer.length > 10000);
  await page.locator('#aot-instruments-toggle').click(); await page.locator('#aot-zoom').fill('4'); assert.equal((await snapshot(page)).parameters.zoom, 4); await page.locator('#aot-fit').click();assert.ok((await snapshot(page)).parameters.zoom<6);await page.locator('#aot-zoom').fill('6');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#aot-record').click(); const download = await downloadPromise; await download.saveAs(path.join(out, 'replay.json')); const record = JSON.parse(fs.readFileSync(path.join(out, 'replay.json'))); assert.equal(record.packedX.length, Math.ceil(record.width / 32) * record.height); assert.equal(record.orbitStep, 0); await page.evaluate(async record => { const M=await import('/js/arrow-of-time-model.js'),G=await import('/js/arrow-of-time-gpu.js'),s=M.decodeReplay(record),a=await navigator.gpu.requestAdapter(),d=await a.requestDevice(),g=await G.createQ2RGPU(d,s); try { g.update(73); g.update(73,-1); if(!M.compare(await g.readback(),s).exact) throw Error('Exported seed/state replay failed'); } finally {g.dispose();d.destroy();} },record);
  await page.locator('#aot-instruments-toggle').click();
  // Observe two further physical phrases at accelerated wall pacing, with all exact steps.
  await page.locator('#aot-play').click();
  await page.waitForFunction(() => ArrowOfTime.snapshot().lastReturn?.cycle === 1, null, { timeout: 60000 });
  await page.waitForFunction(() => ArrowOfTime.snapshot().lastReturn?.cycle === 2, null, { timeout: 60000 });
  await page.locator('#aot-play').click(); results.browser.push({ severalPhrases: 3, lastReturn: (await snapshot(page)).lastReturn, totalSteps: (await snapshot(page)).numericalStepCount });
  await page.locator('#aot-timeline').fill('4320');await page.waitForFunction(()=>ArrowOfTime.snapshot().timelinePosition===4320&&!ArrowOfTime.snapshot().seeking);assert.equal((await snapshot(page)).manualPause,true);await screenshot(page,'timeline-middle');
  await page.locator('#aot-timeline').fill('8640');await page.waitForFunction(()=>ArrowOfTime.snapshot().phase==='returned'&&!ArrowOfTime.snapshot().seeking);assert.equal((await snapshot(page)).returnResult.exact,true);assert.equal((await snapshot(page)).returnResult.usedSeeking,true);
  await page.locator('#aot-timeline').focus();await page.keyboard.press('Home');await page.waitForFunction(()=>ArrowOfTime.snapshot().timelinePosition===0&&!ArrowOfTime.snapshot().seeking);await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>ArrowOfTime.snapshot().timelinePosition===1&&!ArrowOfTime.snapshot().seeking);
  for(const position of [7123,28,5300,63,8600])await page.locator('#aot-timeline').fill(String(position));await page.waitForFunction(()=>ArrowOfTime.snapshot().timelinePosition===8600&&!ArrowOfTime.snapshot().seeking);await page.locator('#aot-play').click();await page.waitForFunction(()=>ArrowOfTime.snapshot().phase==='returned',null,{timeout:10000});await page.locator('#aot-play').click();assert.equal((await snapshot(page)).returnResult.exact,true);
  await page.locator('#aot-draw-toggle').click();await page.locator('#aot-clear').click();await page.locator('#aot-ink-a').fill('#dfc288');await page.locator('#aot-ink-b').fill('#b79bc4');await page.locator('#aot-drawing').scrollIntoViewIfNeeded();
  const pad=await page.locator('#aot-drawing').boundingBox();await page.mouse.move(pad.x+pad.width*.25,pad.y+pad.height*.35);await page.mouse.down();await page.mouse.move(pad.x+pad.width*.75,pad.y+pad.height*.65,{steps:20});await page.mouse.up();
  const expectedDrawing=await page.evaluate(async()=>{const c=document.querySelector('#aot-drawing'),rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data,mask=Array.from({length:c.width*c.height},(_,i)=>Number(rgba[i*4+3]>96));return {width:c.width,height:c.height,mask};});
  await screenshot(page,'drawing-editor');await page.locator('#aot-render-drawing').click();await page.waitForFunction(()=>ArrowOfTime.snapshot().configurationId.startsWith('custom-')&&ArrowOfTime.snapshot().phase==='arrival');
  await page.evaluate(async drawing=>{const M=await import('/js/arrow-of-time-model.js'),expected=M.prepare(2048,1536,'custom',drawing),actual=await ArrowOfTime.debugReadback();if(!M.compare(actual,expected).exact)throw Error('Drawing differs from the prepared microscopic state');},expectedDrawing);
  await page.locator('#aot-timeline').fill('8640');await page.waitForFunction(()=>ArrowOfTime.snapshot().returnResult?.exact&&!ArrowOfTime.snapshot().seeking);await screenshot(page,'drawing-return');
  results.browser.push('Timeline start/middle/end, rapid seeks, keyboard seeking, play from a seek, drawing, four ink controls and background, custom prepared-state equivalence and exact custom return');
  await page.locator('#aot-instruments-toggle').click();await page.locator('#aot-preset').selectOption('moth');await page.waitForFunction(()=>ArrowOfTime.snapshot().configurationId.startsWith('moth-')&&ArrowOfTime.snapshot().phase==='arrival');await page.locator('#aot-instruments-toggle').click();
  await page.locator('#aot-restart').click(); await page.waitForFunction(() => ArrowOfTime.snapshot().phase === 'arrival'); assert.equal((await snapshot(page)).manualPause, true); assert.equal((await snapshot(page)).orbitStep, 0);
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) { await page.setViewportSize({ width, height }); await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); }); await page.waitForFunction(() => scrollY===0); await fit(page); await screenshot(page, `layout-${width}x${height}`); await page.locator('#aot-instruments-toggle').click(); await fit(page); await page.locator('#aot-instruments-toggle').click(); }
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await snapshot(page); await page.waitForTimeout(200); assert.equal((await snapshot(page)).numericalStepCount, hidden.numericalStepCount);
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }); assert.equal((await snapshot(page)).manualPause, true);
  await page.locator('#aot-play').click(); await page.evaluate(() => document.querySelector('#aot-piece').style.transform = 'translateY(300vh)'); await page.waitForFunction(() => !ArrowOfTime.snapshot().inView); const offscreen = await snapshot(page); await page.waitForTimeout(250); assert.equal((await snapshot(page)).activeClock, offscreen.activeClock);
  await page.evaluate(() => document.querySelector('#aot-piece').style.transform = ''); await page.waitForFunction(() => ArrowOfTime.snapshot().inView); await page.locator('#aot-play').click();
  await page.evaluate(() => { document.querySelector('#aot-piece').requestFullscreen = () => Promise.reject(Error('test fallback')); }); await page.locator('#aot-fullscreen').click(); await page.waitForFunction(() => document.querySelector('#aot-piece').classList.contains('aot-fullscreen')); await fit(page); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#aot-piece').classList.contains('aot-fullscreen')); await page.evaluate(() => delete document.querySelector('#aot-piece').requestFullscreen);
  await page.locator('#aot-fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement); await fit(page); await page.locator('#aot-fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement);
  await context.close();
  const fallback = await browser.newContext({ viewport: { width: 390, height: 844 } }); await fallback.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined })); const fp = await open(fallback); assert.ok(await fp.locator('#aot-still').isVisible()); assert.ok(await fp.locator('#aot-play').isDisabled()); await fit(fp); await screenshot(fp, 'missing-webgpu'); await fallback.close();
  const normal = await browser.newContext({ viewport: { width: 844, height: 390 } }); await normal.addInitScript(() => { const request = GPUAdapter.prototype.requestDevice; GPUAdapter.prototype.requestDevice = async function(...args) { const d=await request.apply(this,args); window.__arrowTestDevice=d; return d; }; }); const np = await open(normal); assert.equal(await np.locator('#aot-play').textContent(), 'Pause'); await np.waitForFunction(() => ArrowOfTime.snapshot().activeClock > .2); await np.evaluate(() => { Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange')); }); const activeHidden=await snapshot(np); await np.waitForTimeout(250); assert.equal((await snapshot(np)).activeClock,activeHidden.activeClock); await np.evaluate(() => { delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange')); }); await np.waitForFunction(() => ArrowOfTime.snapshot().activeClock > .3); await np.evaluate(() => __arrowTestDevice.destroy()); await np.waitForFunction(() => !document.querySelector('#aot-still').hidden); assert.ok((await np.locator('#aot-error').textContent()).includes('device was lost')); await normal.close();
  assert.deepEqual(errors, []); results.browser.push('pause/resume, reduced motion, restart, replay export, zoom, responsive layouts, visibility, offscreen suspension, native and fallback fullscreen, missing WebGPU, device loss, auto-start, no validation errors');
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log('PASS browser checks. Artifacts: ' + out);
 } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
