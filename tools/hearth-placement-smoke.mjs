// Fuel visibility and placement throughout the complete visible boiler cavity.
// Run: node tools/hearth-placement-smoke.mjs. Owns its Chrome for Testing child and profile.
import assert from 'node:assert/strict';



import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8231), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-hearth-placement-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], pending = new Map();
let ws, chrome, seq = 0;
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      let src = process.env.BUNDLE ? data.toString() : fs.readdirSync(path.join(root, 'js/sluice')).filter(n=>/^\d.*\.js$/.test(n)).sort().map(n=>fs.readFileSync(path.join(root,'js/sluice',n),'utf8')).join('\n');
      const end = src.lastIndexOf('})();');
      assert(end >= 0, 'bundle IIFE seam exists');
      data = Buffer.from(src.slice(0, end) + 'window.__hearthTest = function(source) { return eval(source); };\n' + src.slice(end));
    }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
function cleanup() {
  try { ws?.close(); } catch {}
  chrome?.kill(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const game = source => ev(`__hearthTest(${JSON.stringify(source)})`);
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
function check(label, condition) { assert.ok(condition, label); console.log('PASS ' + label); }

const button = action => `(function(){var b=hearthButtons.find(b=>b.action===${JSON.stringify(action)});if(!b)throw Error('missing button '+${JSON.stringify(action)});return {x:b.x+b.w/2,y:b.y+b.h/2};})()`;
async function client(target){return game(`(function(){var p=${target},r=canvas.getBoundingClientRect();return{x:r.left+p.x*r.width/(canvas.width/dpr),y:r.top+p.y*r.height/(canvas.height/dpr)};})()`);}
async function move(target){const p=await client(target);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});}
async function press(target,touch=false){
  const p=await client(target);
  if(touch){await send('Emulation.setTouchEmulationEnabled',{enabled:true});await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  await game('render()');
}

try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--no-first-run', '--disable-gpu-sandbox',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try { const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json(); endpoint = pages.find(p => p.type === 'page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    await sleep(100);
  }
  assert(endpoint, 'testing browser started');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(m.error) : p?.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.args.some(a=>typeof a.value==='string'&&/fallback|failed|timeout/i.test(a.value))) console.log('BROWSER',m.params.args.map(a=>a.value||a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __hearthTest==='function' && __hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('workshop boots with GPU water', await game("introPhase==='done' && !!liquidWGPU && liquidWGPU.available"));
  check('shader warm-up clean', await ev('window.__shaderWarm.errors.length===0'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await game('bathEnter()'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;bathGuests=[];skySlimes=[];bathNoticeT=0;updateCamera();render();');

  await game('devMode=true;hearthReset();hearthSelectMaterial("coal");render();');
  const visual=await game(`(function(){
    var c=document.createElement('canvas').getContext('2d');c.canvas.width=240;c.canvas.height=120;
    c.fillStyle=BLD.outline;c.fillRect(0,0,240,120);var b=hearthHandPreview();
    hearthDrawCoal(c,b,60,60,1,0);hearthDrawFuelGhost(c,b,180,60,0,true,1);
    var pixels=c.getImageData(0,0,240,120).data,real=0,ghost=0;
    for(var y=0;y<120;y++)for(var x=0;x<240;x++){
      var at=(y*240+x)*4,luma=pixels[at]*.2126+pixels[at+1]*.7152+pixels[at+2]*.0722;
      if(x<120&&luma>35)real++;if(x>=120&&luma>140)ghost++;
    }
    return {real:real,ghost:ghost};
  })()`);
  check('cold coal has readable faces against the unlit cavity',visual.real>100);
  check('translucent coal preview has a readable silhouette',visual.ghost>45);
  for(const [width,height,touch]of [[1280,900,false],[390,844,true],[667,375,true]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
    await sleep(150);await game('resize();bathCamY=-1;updateCamera();hearthReset();hearthSelectMaterial("coal");render();');
    const candidates=await game(`(function(){var L=hearthRoomLayout(),r=L.box,p=hearthCasingProfile(r,!L.landscape),all=p.sides.concat(p.roof);
      var left=Math.min.apply(null,all.map(function(q){return(q[0]-r.x)*HEARTH_WIDTH/r.w;})),
        right=Math.max.apply(null,all.map(function(q){return(q[0]-r.x)*HEARTH_WIDTH/r.w;})),
        top=HEARTH_TOP+(Math.min.apply(null,all.map(function(q){return q[1];}))-r.y)*HEARTH_HEIGHT/r.h;
      var out=[];for(var side=0;side<2;side++){
        var found=null;for(var y=top+22;y<(L.landscape?HEARTH_TOP+80:HEARTH_TOP-10)&&!found;y+=8)
          for(var x=left+22;x<right-22;x+=10){if((side===0?x>HEARTH_WIDTH*.3:x<HEARTH_WIDTH*.7)||!hearthPlacementValid({x:x,y:y}))continue;found={x:x,y:y};break;}
        if(!found)throw Error('no usable upper cavity '+side);out.push(found);
      }
      out.push({x:HEARTH_WIDTH/2,y:70});return out;
    })()`);
    for(let i=0;i<candidates.length;i++){
      const at=candidates[i];
      await game('hearthReset();hearthSelectMaterial("coal");render();');
      const target=`(function(){var r=hearthRoomLayout().box;return{x:r.x+${at.x}*r.w/HEARTH_WIDTH-${touch?0:14},y:r.y+(${at.y}-HEARTH_TOP)*r.h/HEARTH_HEIGHT+${touch?0:16}};})()`;
      if(!touch){await move(target);await game('render()');await screenshot(`ghost-${width}-${i}`);}
      const preview=await game('({seed:hearthHandPreview().seed,shape:hearthHandPreview().shape})');
      await press(target,touch);
      const placed=await game('({count:hearthBeds.boiler.chunks.length,b:hearthBeds.boiler.chunks[0]})');
      check(`${width}x${height} placement ${i} realizes exactly at the preview`,placed.count===1&&Math.abs(placed.b.x-at.x)<.01&&Math.abs(placed.b.y-at.y)<.01&&placed.b.seed===preview.seed&&JSON.stringify(placed.b.shape)===JSON.stringify(preview.shape));
      await screenshot(`coal-${width}-${i}`);
      await game('for(var n=0;n<480;n++)hearthStepBed(hearthBeds.boiler);render();');
      check(`${width}x${height} placement ${i} falls into the usable coal bed`,await game(`hearthBeds.boiler.chunks[0].y>${at.y}+20 && hearthChamberContains(hearthBeds.boiler.chunks[0].x,hearthBeds.boiler.chunks[0].y,1)`));
    }
    await screenshot(`settled-${width}`);
  }
  check('no browser or GPU errors',errors.length===0);
  console.log('ERRORS',errors);
} finally { cleanup(); }
