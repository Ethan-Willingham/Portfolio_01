// Phone bathhouse layout and real touch controls.
// Run: node tools/bath-mobile-smoke.mjs. Owns its testing browser; images stay in /tmp.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8310), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-hearth-');
const out = process.env.DUMP || '/tmp/sluice-bath-mobile-qa';
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
async function press(target,touch=false){
  const p=await client(target);
  if(touch){await send('Emulation.setTouchEmulationEnabled',{enabled:true});await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  await game('updateCamera();render()');
}

try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    ...(process.env.NOVSYNC ? ['--disable-gpu-vsync','--disable-frame-rate-limit'] : []),
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/grand-motherload.html?dev=1&nosave=1&nopause=1&tod=0.35` });
  for (let i = 0; i < 300; i++) {
    if (await ev(`typeof __hearthTest==='function' && __hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('workshop boots with GPU water', await game("introPhase==='done' && !!liquidWGPU && liquidWGPU.available"));
  check('shader warm-up clean', await ev('window.__shaderWarm.errors.length===0'));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await game('bathEnter()'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;bathGuests=[];skySlimes=[];');
  for (const [width,height] of [[844,390],[844,340],[667,375],[568,320],[520,320],[1024,768],[1280,900]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
    await game('isMobile='+ (width!==1280) + ';resize();'); await sleep(150); await game('updateCamera();render();');
    if (width===1280) {
      check('desktop keeps the combined controls',await game('!hearthRoomLayout().mobile && hearthButtons.some(b=>b.action===\'fuels\') && hearthButtons.some(b=>b.action===\'claw\')'));
      await screenshot('desktop'); continue;
    }
    check(width+'x'+height+' mobile bath uses the landscape working areas', await game('hearthRoomLayout().mobile && hearthRoomLayout().landscape'));
    for (const tab of ['water','guests','fire']) {
      await press(button('panel:'+tab),true);
      const fit=await game(`(function(){var L=hearthRoomLayout(),bs=hearthButtons,b=L.box;
        var overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
        return bathControlsTab===${JSON.stringify(tab)} && bs.every((a,i)=>a.x>=0&&a.y>=0&&a.x+a.w<=L.w+.1&&a.y+a.h<=L.h+.1&&a.w>=44&&a.h>=44&&bs.slice(i+1).every(b=>!overlap(a,b))&&!overlap(a,L.box)) &&
          b.x>=0&&b.y>=0&&b.x+b.w<=L.w+.1&&b.y+b.h<=L.h+.1&&b.w>=180&&b.h>=44;
      })()`);
      if(!fit)console.log('LAYOUT',width,height,tab,await game('({layout:hearthRoomLayout(),buttons:hearthButtons})'));
      check(width+'x'+height+' '+tab+' has reachable, separate touch targets and visible furnace',fit);
      check('compact controls preserve landscape working space',await game('hearthRoomLayout().dock.h<=104 && hearthRoomLayout().meter.h<=44 && hearthRoomLayout().landscape'));
      await screenshot(width+'x'+height+'-'+tab);
      if(tab==='guests') {
        await game("bathGuests=[];bathGuestAccept(skySlimeFresh(0,0));bathGuestAccept(skySlimeFresh(0,0));bathGuests.forEach(g=>{g.hop=null;g.st='wait';g.s.x=(g.slot?22.5:20.75)*TILE;});render();");
        check('waiting visitors stay visible beside the bowl',await game('(function(){var L=hearthRoomLayout();return bathGuests.every(g=>{var x=(g.s.x-cam.x)*worldScale;return x-g.s.r*worldScale>=L.scene.x && x+g.s.r*worldScale<=L.scene.x+L.scene.w;});})()'));
        const ids=await game('bathGuests.map(g=>g.s.id)');
        await press(button('serve:'+ids[0]),true);
        check('a cold empty bath keeps its visitor waiting',await game('!bathGuests[0].served && bathGuests[0].st===\'wait\''));
        await game('bathWater=BATH_MIN_WATER;bathThermal.meanC=40;render();');
        await screenshot(width+'x'+height+'-guests-ready');
        for(const id of ids)await press(button('serve:'+id),true);
        check('both visitor buttons admit real guests into a ready bath',await game('bathGuests.every(g=>g.served&&g.st===\'hop\'&&g.hop.next===\'plunge\')'));
        await game('bathGuests=[];bathWater=0;bathThermal.meanC=20;');
      }
      if(tab==='water') {
        await press(button('tool-valve'),true);
        check('POUR selects the hose and opens it on touch',await game('bathTool.mode===\'hose\' && bathTool.valve'));
        await press(button('tool-valve'),true);
        check('STOP closes the same valve',await game('!bathTool.valve'));
        await press(button('liquids'),true);
        check('liquid tray owns input and provides all liquid choices',await game('hearthHand.silos && hearthButtons.some(b=>b.action===\'close-tray\') && [0,1,2,3,4].every(t=>hearthButtons.some(b=>b.action===\'liquid:\'+t)) && !hearthButtons.some(b=>b.action.indexOf(\'panel:\')===0)'));
        check('liquid choices fit in the phone viewport',await game('hearthButtons.every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=canvas.width/dpr+.1&&b.y+b.h<=canvas.height/dpr+.1&&b.w>=44&&b.h>=44)'));
        await screenshot(width+'x'+height+'-liquids');
        await press(button('close-tray'),true);
      }
      if(tab==='fire') {
        check('switching to Fire stows the hose',await game('!bathTool.mode&&!bathTool.valve'));
        await press(button('fuels'),true);
        check('fuel tray keeps labeled tongs and close controls',await game('hearthButtons.some(b=>b.action===\'hand\')&&hearthButtons.some(b=>b.action===\'close-tray\')'));
        await press(button('fuel:coal'),true);
        const before=await game('hearthBeds.boiler.chunks.length');
        await press('(function(){var r=hearthRoomLayout().box;return{x:r.x+r.w/2,y:r.y+r.h*.3};})()',true);
        check('real touch places selected fuel in the displayed chamber',await game('hearthBeds.boiler.chunks.length')===before+1);
        await press(button('fuels'),true);await press(button('hand'),true);
        const fuelPoint=await client('(function(){var bs=hearthBeds.boiler.chunks,b=bs[bs.length-1],r=hearthRoomLayout().box;return{x:r.x+b.x*r.w/HEARTH_WIDTH,y:r.y+(b.y-HEARTH_TOP)*r.h/HEARTH_HEIGHT};})()');
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...fuelPoint,id:7}]});
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:fuelPoint.x+8,y:fuelPoint.y-8,id:7}]});
        await game('render()');
        check('tongs capture the physical fuel on touch',await game('!!hearthDrag && hearthDrag.b.held'));
        await screenshot(width+'x'+height+'-tongs');
        await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
        check('canceling a fuel drag restores its piece',await game('!hearthDrag&&hearthBeds.boiler.chunks.every(b=>!b.held)&&hearthBeds.boiler.chunks.length')===before+1);
        await press(button('strike'),true);
        check('striker is selectable on touch',await game('hearthHand.mode===\'striker\''));
        await press(button('pump'),true);await press(button('ash'),true);
        check('bellows and grate still act on the real boiler',await game('hearthBeds.boiler.air>0 && !!hearthHand.rake'));
      }
    }
  }
  check('no browser exceptions',errors.length===0);
} finally { cleanup(); }
