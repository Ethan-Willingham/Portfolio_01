// Browser regression for the standalone demo. Owns and closes Chrome for Testing.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/smoke-drum-review';
const port = Number(process.env.PORT || 8855), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = source.slice(0, end) + `
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
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
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
async function navigate(width, height, query = '?scene=falls', mobile = false, deviceScaleFactor = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${query}` });
  for (let i = 0; i < 120; i++) {
    if (await evaluate('!!window.__toy && __toy.stats().waterState !== "booting"')) break;
    await sleep(100);
  }
  await sleep(1000);
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-sandbox', '--no-first-run',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 150; i++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p => p.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (endpoint) break;
    await sleep(100);
  }
  assert.ok(endpoint, 'Chrome for Testing starts');
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p?.timer); m.error ? p?.reject(m.error) : p?.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');

  const query='?scene=smoke-ring-cannon';
  await navigate(1440,900,query);
  await inside('stopLoop();userPaused=true;document.getElementById("toy-resume").hidden=true;');
  await evaluate('(()=>{const s=document.createElement("style");s.textContent="#toy-resume{display:none!important}";document.head.appendChild(s);})()');
  await screenshot('rest');
  const first=await evaluate('__toy.smokeCannon().stats(__toy.bodies())');
  assert.deepEqual(errors,[]);
  assert.equal(first.pushes,0);assert.ok(first.membrane.displacement.every(x=>Math.abs(x)<.001));
  assert.ok(await evaluate('!document.querySelector(".toy-foot")'));
  const attachments=await evaluate('(()=>{const d=__toy.machineState().definition,h=d.drum;return d.solids.filter(w=>w.width>w.height).map(w=>h.x-h.thickness/2>=w.x && h.x+h.thickness/2<=w.x+w.width && (h.top===w.y+w.height || h.bottom===w.y));})()');
  assert.deepEqual(attachments,[true,true],'Both physical endpoints meet the casing');
  const joins=await inside('(()=>{const sx=instrumentsCanvas.width/worldW,sy=instrumentsCanvas.height/worldH;return [124,276].map(y=>instrumentsCtx.getImageData(Math.round(88*sx),Math.round(y*sy),1,1).data[3]);})()');
  assert.ok(joins.every(alpha=>alpha>=200),'Both rendered clamps visibly join the casing');
  const painted=await inside('(()=>{wallRect(552,128,560,272);bakeWalls();var alpha=wallsCtx.getImageData(Math.round(556*dpr),Math.round(200*dpr),1,1).data[3];for(var r=16;r<34;r++)walls[r*gridW+69]=0;wallsVersion++;bakeWalls();return alpha;})()');
  assert.ok(painted>200,'Visitor-drawn walls remain visible beside the drum');
  const still=await inside(`(()=>{for(let f=0;f<90;f++)smokeFrame(1/60);return toyCannon.stats(jelloBodies);})()`);
  assert.ok(still.travelDye<.01,'No moving skin means no smoke travels across the room');
  // Input is the real hit target, not a call to the firing API.
  const hit=await evaluate('(()=>{const b=document.querySelector(".toy-scene-action[data-control=primary]").getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...hit});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...hit});
  assert.equal(await evaluate('__toy.smokeCannon().stats(__toy.bodies()).pushes'),1);
  const snapshots=[];
  for(const frames of [6,12,30,60,120]){
    const result=await inside(`(()=>{for(let f=0;f<${frames};f++){smokeFrame(1/60);updateJello(1/60);}instrumentTick(performance.now());render();return toyCannon.stats(jelloBodies);})()`);
    snapshots.push(result);await screenshot('strike-'+frames);
  }
  console.log('COUPLED',JSON.stringify(snapshots.map(s=>({...s,membrane:{centerX:s.membrane.centerX}}))));
  assert.ok(snapshots.some(s=>s.travelDye>90 && s.dyeCenterX>350),'A substantial front detaches and travels across the room');
  assert.ok(snapshots.some(s=>Math.abs(s.upperCirculation)>200 && Math.abs(s.lowerCirculation)>200),'The shot retains the earlier strong rolling front');
  assert.ok(snapshots.every(s=>s.membrane.displacement[0]===0 && s.membrane.displacement.at(-1)===0),'The head stays pinned to the casing');
  assert.ok(snapshots.some(s=>s.upperCirculation*s.lowerCirculation<0),'Opening sheds a counter-rotating pair');
  assert.ok(snapshots.every(s=>s.membrane.displacement.every(Number.isFinite)));
  // Freeze the struck skin. The velocity alone must not launch a shot;
  // chamber compression requires actual measured displacement.
  await evaluate('__toy.machine("smoke-ring-cannon")');await inside('stopLoop();userPaused=true;');
  const uncoupled=await inside(`(()=>{toyCannon.prepare=function(){};toyCannon.push();for(let f=0;f<180;f++)smokeFrame(1/60);return toyCannon.stats(jelloBodies);})()`);
  console.log('FROZEN HEAD',JSON.stringify({travelDye:uncoupled.travelDye,pushes:uncoupled.pushes}));assert.ok(uncoupled.travelDye<.01);
  await evaluate('__toy.machine("smoke-ring-cannon",{noPush:true})');await inside('stopLoop();userPaused=true;');
  assert.equal(await evaluate('__toy.machinePrimary()'),false);
  const noPush=await inside(`(()=>{for(let f=0;f<120;f++)smokeFrame(1/60);return toyCannon.stats(jelloBodies);})()`);
  assert.ok(noPush.travelDye<.01);assert.ok(noPush.membrane.displacement.every(x=>Math.abs(x)<.001));
  const layouts=[];
  for(const [w,h,mobile] of [[844,390,true],[390,844,true],[720,900,false]]){
    await navigate(w,h,query,mobile);await inside('stopLoop();userPaused=true;');
    const layout=await evaluate(`(()=>{const b=document.querySelector('.toy-scene-action[data-control=primary]').getBoundingClientRect();return{w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,hit:{x:b.x,y:b.y,w:b.width,h:b.height}};})()`);
    assert.ok(!layout.overflow);assert.ok(layout.hit.w>=44&&layout.hit.h>=44&&layout.hit.x>=0&&layout.hit.y>=0&&layout.hit.x+layout.hit.w<=w&&layout.hit.y+layout.hit.h<=h);
    const point={x:layout.hit.x+layout.hit.w/2,y:layout.hit.y+layout.hit.h/2};
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
    assert.equal(await evaluate('__toy.smokeCannon().stats(__toy.bodies()).pushes'),1);
    await inside(`for(let f=0;f<30;f++)smokeFrame(1/60);render();`);await screenshot('layout-'+w+'x'+h);layouts.push(layout);
  }
  await navigate(1440,900,query);await inside('stopLoop();userPaused=true;');
  await evaluate('document.querySelector(".toy-scene-action[data-control=primary]").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate('__toy.smokeCannon().stats(__toy.bodies()).pushes'),1,'Enter activates the physical drum');
  console.log('LAYOUTS',JSON.stringify(layouts));assert.deepEqual(errors,[]);
  // Exercise the ordinary animation loop too. The earlier regression passed
  // a weak circulation check without producing a clear detached ring.
  await navigate(1440,900,query);
  const liveHit=await evaluate('(()=>{const b=document.querySelector(".toy-scene-action[data-control=primary]").getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...liveHit});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...liveHit});
  await sleep(2000);await screenshot('live-ring');
  const live=await evaluate('__toy.smokeCannon().stats(__toy.bodies())');
  assert.equal(live.pushes,1);assert.ok(live.travelDye>90&&live.dyeCenterX>330,'The real-time shot rolls clear of the chamber');
  await inside('stopLoop();userPaused=true;');
  const repeats=await inside(`(()=>{let accepted=0,max=0;for(let f=0;f<720;f++){if(f%60===0)accepted+=toyCannon.push()?1:0;smokeAwakeT=15;smokeFrame(1/60);updateJello(1/60);const st=toyCannon.stats(jelloBodies);max=Math.max(max,...st.membrane.displacement.map(Math.abs));}return{accepted,max,pushes:toyCannon.stats(jelloBodies).pushes};})()`);
  console.log('LIVE AND REPEATED',JSON.stringify({center:live.dyeCenterX,travelDye:live.travelDye,...repeats}));
  assert.equal(repeats.accepted,12);assert.ok(repeats.max<100);assert.deepEqual(errors,[]);
} finally {await cleanup();}
