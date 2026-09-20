// One-shot dump input, real rig flight and WebGPU fluid regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/siphon-dump-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8187), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-dump-');
const out = process.env.DUMP || '/tmp/sluice-dump-qa';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__dumpTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png' };
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
  '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
], {stdio:'ignore'});
let ws, seq=0; const pending=new Map(), errors=[];
function cleanup() { try {ws?.close();} catch {} chrome.kill(); server.close(); try {fs.rmSync(profile,{recursive:true,force:true});} catch {} }
process.on('SIGINT', () => {cleanup();process.exit(130);});
function send(method,params={}) { return new Promise((resolve,reject) => { const id=++seq; pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params})); }); }
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__dumpTest(${JSON.stringify(source)})`);
async function press(target, touch = false) {
  const point = await game(`(function(){var r=${target};var box=canvas.getBoundingClientRect();return {x:box.left+r.x*box.width/(canvas.width/dpr),y:box.top+r.y*box.height/(canvas.height/dpr)};})()`);
  if(touch){
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  }
}
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64')); }
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
try {
  let endpoint;
  for(let i=0;i<100;i++) { try {const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100); }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});
  for(let i=0;i<300;i++){if(await ev(`typeof __dumpTest==='function' && __dumpTest("introPhase === 'done'")`))break;await sleep(100);}
  check('normal boot enables bathhouse',await game("introPhase === 'done' && ENABLE_BATH"));
  check('visitor shaders warm without errors',await ev('window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.visitors>=0'));
  await ev("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0,0)");
  await sleep(500);

  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimes=[];bathMode=false;keys={};siphonReset();liquidCount=0;liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;player.x=banyaDoorX0-150;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;player.onGround=true;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera();siphon.tank=[4000,1000,4000,3000,4000];render()');
  const floor=await game('player.y');
  console.log('FIXTURE',await game('({x:player.x,y:player.y,ground:liquidWorldSolidAt(player.x+PLAYER_W/2,player.y+PLAYER_H+2),gpu:liquidWGPU.simActive})'));
  await press('(function(){var b=siphonButtons.find(function(b){return b.action==="mode";});return {x:b.x+b.w/2,y:b.y+b.h/2};})()');
  check('one click and release commits the dump',await game('!!siphon.dump'));
  async function frames(n,shot,shotFrame=15) {
    let peak=0;
    for(let i=0;i<n;i++){
      const y=await game('update(1/60);liquidToolSync();siphonTick(1/60);siphonAudioTick(1/60);updateCamera();updateLiquids(1/60);render();player.y');
      peak=Math.max(peak,floor-y);await sleep(18);
      if(i===shotFrame&&shot)await screenshot(shot);
    }
    return peak;
  }
  const full=await frames(110,'mixed-launch');
  console.log('FULL',full,await game('({bank:siphonTotal(),world:liquidCount,dump:siphon.dump,y:player.y,vy:player.vy,gpu:liquidWGPU.simActive,render:liquidWGPU.renderActive})'));
  check('full mixed load empties and lifts the rig',full>100 && await game('siphonTotal()===0 && !siphon.dump && !siphon.equipped'));
  check('real solver retains all five liquids',await game('(function(){liquidToolSync();var n=[0,0,0,0,0];for(var i=0;i<liquidCount;i++)n[liquidType[i]]++;return n.every(function(v,k){return v===[4000,1000,4000,3000,4000][k];});})()'));
  check('GPU simulation and rendering remain active',await game('liquidWGPU.simActive && liquidWGPU.renderActive'));
  await screenshot('settled');
  await game('player.vx=player.vy=0;player.y=SKY_ROWS*TILE-PLAYER_H;siphonDump()');
  check('empty click grants no free jump',await game('!siphon.dump && player.vy===0'));
  await game('siphon.tank=[4000,0,0,0,0];player.y-=100;player.vy=0;player.onGround=false;render()');
  // A real right click is location independent and does not need a held button.
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:250,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:800,y:250,button:'right',clickCount:1});
  check('right click commits an airborne dump',await game('!!siphon.dump'));
  await frames(1);
  console.log('AIR',await game('({y:player.y,vy:player.vy,bank:siphonTotal(),dump:siphon.dump,onGround:player.onGround})'));
  check('discharge kicks an airborne rig upward',await game('player.vy < -50'));
  await frames(70);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize();liquidCount=0;liquidOps.length=0;liquidOpsOverflow=true;liquidMutationSeq++;player.y=SKY_ROWS*TILE-PLAYER_H;player.vx=player.vy=0;player.onGround=true;siphon.tank=[4000,0,0,0,0];for(var frame=0;frame<60;frame++)updateCamera();render()');
  await press('(function(){var b=siphonButtons.find(function(b){return b.action==="mode";});return {x:b.x+b.w/2,y:b.y+b.h/2};})()',true);
  check('phone tap commits the whole load',await game('!!siphon.dump'));
  const small=await frames(90,'mobile-launch',5);
  console.log('SMALL',small,await game('({bank:siphonTotal(),world:liquidCount,dump:siphon.dump,y:player.y,vy:player.vy})'));
  check('small load gives a smaller hop and empties on touch',small>15 && small<full && await game('siphonTotal()===0 && !siphon.dump'));
  await game('siphon.tank=[12000,0,0,0,0];player.x=banyaDoorX0-150;player.vx=player.vy=0;bathEnter()');
  await sleep(600);await game('updateCamera();render()');
  const bathY=await game('player.y');
  await press('({x:bathServiceButtons[0].x+80,y:bathServiceButtons[0].y+20})',true);
  check('bathhouse ADD WATER still transfers without launching',await game(`siphon.tank[0]===0 && bathPour===12000 && !siphon.dump && player.y===${bathY} && player.vy===0`));
  check('no runtime or shader errors',errors.length===0);
  console.log(`Real rig peaks: ${full.toFixed(1)}px full / ${small.toFixed(1)}px quarter. Screenshots: ${out}`);
} finally {if(errors.length)console.error(JSON.stringify(errors));cleanup();}
