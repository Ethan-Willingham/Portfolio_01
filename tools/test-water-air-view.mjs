// Browser regression for the standalone demo. Owns and closes Chrome for Testing.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-air-review';
const port = Number(process.env.PORT || 8467), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if(file===path.join(root,'js/liquid-air-wgpu.js') && globalThis.airReference) data=fs.readFileSync(process.env.REFERENCE);
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = source.slice(0, end) + `
      function demoMinimumOrientation(b) {
        var minimum = Infinity;
        for(var t=0;t<b.triN;t++) {
          var a=b.triA[t],c=b.triB[t],d=b.triC[t];
          var rest=(b.rx[c]-b.rx[a])*(b.ry[d]-b.ry[a])-(b.ry[c]-b.ry[a])*(b.rx[d]-b.rx[a]);
          var area=(b.px[c]-b.px[a])*(b.py[d]-b.py[a])-(b.py[c]-b.py[a])*(b.px[d]-b.px[a]);
          if(Math.abs(rest)>1e-9)minimum=Math.min(minimum,area/rest);
        }
        return minimum;
      }
      window.__demoTest = function(source) { return eval(source); };
      ` + source.slice(end);
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(data);
  } catch { response.writeHead(404).end(); }
});
let chrome, socket, sequence = 0;
const pending = new Map(), errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup() {
  try { socket?.close(); } catch {}
  server.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    const force = setTimeout(() => chrome.kill('SIGKILL'), 2000);
    await exited;
    clearTimeout(force);
  }
  for (const p of pending.values()) clearTimeout(p.timer);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 180000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const inside = source => evaluate(`__demoTest(${JSON.stringify(source)})`);
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dump, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function navigate(width, height, query = '', mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: Number(process.env.DPR || 2), mobile });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${query}` });
  for (let i = 0; i < 120; i++) {
    if (await evaluate('!!window.__toy && __toy.stats().waterState !== "booting"')) break;
    await sleep(100);
  }
  await sleep(1000);
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`,[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    `--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'],{stdio:'ignore'});
  let endpoint;
  for(let i=0;i<150;i++){try{endpoint=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;}catch{}if(endpoint)break;await sleep(100);}
  assert(endpoint,'Owned Chrome starts');socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p?.timer);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  await send('Runtime.enable');await send('Page.enable');
  const rows=[];
  if(process.env.EQUIVALENCE || process.env.BENCH_COMPARE)assert(process.env.REFERENCE,'REFERENCE requires the saved prior air module');
  async function nativeHashes(){return evaluate(`(async()=>{
    const L=__toy.liquid(),M=__toy.airModel(),D=L.device,n=L.uploadedCount,count=M.width*M.height;
    const sources=[['pos',L.buf.pos,n*16],['affine',L.buf.affine,n*16],['aux',L.buf.aux,n*16],['flag',L.buf.flag,n*4],
      ['cells',M.buffers.cells,count*32],['labels',M.buffers.labels,count*8],['history',M.buffers.history,count*32],['pressure',M.buffers.pressure,count*16],
      ['gas',M.buffers.gas,(count+2)*64],['phase',M.buffers.gas,count*16,M.phaseOffset]];
    const encoder=D.createCommandEncoder(),reads=sources.map(([name,source,size,offset=0])=>{
      const b=D.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});encoder.copyBufferToBuffer(source,offset,b,0,size);return {name,b};});
    L.queue.submit([encoder.finish()]);const hashes={};
    try{await Promise.all(reads.map(async({name,b})=>{await b.mapAsync(GPUMapMode.READ);const digest=await crypto.subtle.digest('SHA-256',b.getMappedRange());hashes[name]=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}));return hashes;}
    finally{for(const {b}of reads){b.unmap();b.destroy();}}
  })()`);}
  if(process.env.BENCH_COMPARE){
    for(const scene of ['heron','siphon','cup']){
      await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
      for(const updated of [false,true,true,false]){
        globalThis.airReference=!updated;
        await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
        await evaluate(`__toy.pause(true);__toy.machine('${scene}',{seed:17,pressure:{}}).then(()=>true)`);
        await evaluate('__toy.liquid().bench(20,1/60)');
        const bench=await evaluate('__toy.liquid().bench(120,1/60)');rows.push({scene,updated,bench});console.log('PAIRED BENCH',scene,updated,JSON.stringify(bench));
      }
    }
    fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({rows,errors},null,2));assert.deepEqual(errors,[]);
  }else if(process.env.EQUIVALENCE){
    for(const scene of ['heron','siphon','cup'])for(const seed of [17,42,913]){
      const captures=[];
      for(const updated of [false,true]){
        globalThis.airReference=!updated;
        await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
        await evaluate(`__toy.pause(true);__toy.machine('${scene}',{seed:${seed},pressure:{}}).then(()=>true)`);
        assert(await evaluate('__toy.airModel().enabled'),'Air model active');
        const steps=[];
        for(let frame=1;frame<=20;frame++){
          await evaluate('__toy.liquid().update(1/60);__toy.liquid().queue.onSubmittedWorkDone()');
          if([1,5,20].includes(frame))steps.push({frame,hashes:await nativeHashes()});
        }
        captures.push({updated,steps});
      }
      assert.deepEqual(captures[1].steps,captures[0].steps,'Default particle, pressure and gas buffers match prior release: '+scene+' '+seed);
      rows.push({scene,seed,captures});console.log('EQUIVALENT',scene,seed);
    }
    fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({rows,errors},null,2));assert.deepEqual(errors,[]);
  }else
  for(const scene of (process.env.SCENES || 'heron,siphon,cup').split(',')){
    await navigate(1512,820,`?scene=${scene}&paused=1#toy`);
    await evaluate('document.getElementById("toy").scrollIntoView();__toy.pause(true)');
    for(let tries=0;tries<100&&!await evaluate('__toy.machineState()?.ready');tries++)await sleep(100);
    assert(await evaluate('__toy.machineState()?.ready && __toy.airModel()?.enabled'),'Real pressure model ready');
    await inside('airPressureColors=false;pressureColors=false;');
    const L='__toy.liquid()';
    console.log('BENCH start',scene);const base=await evaluate(`${L}.bench(20,1/60)`);
    console.log('BENCH done',JSON.stringify(base));const stats=await evaluate('({toy:__toy.stats(),air:__toy.airStats(),settings:__toy.airModel().settings})');
    await evaluate('Promise.resolve(__toy.airModel().capture()).then(()=>true)');
    if(!process.env.BENCH_ONLY){
      await inside('airPressureColors=true');
      await evaluate('__toy.airPressureView(true);__toy.machinePrimary();__toy.pause(false)');
      await sleep(4000);
      const frames=await evaluate(`new Promise(resolve=>{const times=[],rates=[];let last=null;const start=performance.now();function tick(t){if(last!==null)times.push(t-last);last=t;rates.push(__toy.stats().fps);if(t-start<6000)requestAnimationFrame(tick);else resolve({times,rates,sim:__toy.instruments().simulationSeconds,overlay:__toy.pressureViewState()});}requestAnimationFrame(tick);})`);
      await evaluate('__toy.pause(true)');await screenshot(scene+'-air');
      await evaluate('document.getElementById("toy-air-pressure-compact").click()');
      assert.equal(await evaluate('__toy.airPressureView()'),false,'Compact control hides air');
      await evaluate('document.getElementById("toy-instruments-open").click();document.getElementById("toy-air-pressure-toggle").click()');
      assert.equal(await evaluate('__toy.airPressureView()'),true,'Instruments restores air');
      assert.equal(await evaluate('document.getElementById("toy-air-pressure-compact").getAttribute("aria-pressed")'),'true','Controls agree');
      await evaluate('document.querySelector("#toy-panel-instruments [data-close]").click()');
      rows.push({scene,base,stats,frames});
    }else rows.push({scene,base,stats});
    console.log(scene,JSON.stringify(base));
  }
  fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({rows,errors},null,2));assert.deepEqual(errors,[]);
}finally{await cleanup();}
