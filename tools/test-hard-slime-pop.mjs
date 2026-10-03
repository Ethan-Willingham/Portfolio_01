// Ground pop comparison in the complete game. Uses its own Chrome for Testing process and profile.
// Run: node tools/test-hard-slime-pop.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8187), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-sky-slime-');
const out = process.env.DUMP || '/tmp/sluice-hard-pop-browser';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__bathTest = function(source) { return eval(source); };\n' + src.slice(i));
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
const game = source => ev(`__bathTest(${JSON.stringify(source)})`);
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
  for(let i=0;i<300;i++){if(await ev(`typeof __bathTest==='function' && __bathTest("introPhase === 'done'")`))break;await sleep(100);}
  check('normal boot enables bathhouse',await game("introPhase === 'done' && ENABLE_BATH"));
  check('visitor shaders warm without errors',await ev('window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.visitors>=0'));
  await ev("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0,0)");
  await sleep(500);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimeReset();skySlimeNext=100000;ENABLE_BATH=false');
  await game('window.__popPlayer=JSON.parse(JSON.stringify(player)); Math.random=function(){return .3;}');
  const rows=[];
  for(const dir of [-1,1])for(const fps of [30,60,144])for(const gain of [1,2.15]) {
    const row=await game(`(function(){
      Object.assign(player,window.__popPlayer);
      skySlimeReset();skySlimeNext=100000;ENABLE_BATH=false;
      SKY_SLIME_GROUND_POP_LIFT=${gain};
      var x=(DECK_LEFT_COL-4)*TILE,floor=SKY_ROWS*TILE,dir=${dir},fps=${fps};
      Object.assign(player,{x:x-dir*110-PLAYER_W/2,y:floor-PLAYER_H,vx:0,vy:0,dir:dir,
        onGround:true,onJello:false,bodyTiltRender:0,flightTilt:0,flightTiltVel:0,
        squash:0,thrustSpool:0,jetForce:0,jetPulse:0,fuel:100,hull:100,
        lastMoveU:false,lastMoveR:false,lastMoveL:false});
      player.renderX=player.x;player.renderY=player.y;
      var b=skySlimeFresh(x,floor-25);Object.assign(b,{r:25,spin:0,entry:0,settled:true,_ground:true,seed:.3});skySlimes.push(b);
      var original=skySlimePlayer,launch=null,peak=b.y,snap=0,overlap=0;
      skySlimePlayer=function(s,rx,ry,vx,vy){
        var before=s.vy,px=player.renderX,py=player.renderY;original(s,rx,ry,vx,vy);
        snap=Math.max(snap,Math.hypot(player.renderX-px,player.renderY-py));
        if(launch===null&&s.vy<before-15)launch=-s.vy;
      };
      try {
        keys.ArrowRight=dir>0;keys.ArrowLeft=dir<0;
        for(var frame=0;frame<Math.ceil(fps*.9);frame++){
          update(1/fps);skySlimeTick(1/fps);peak=Math.min(peak,b.y);
          var c=skySlimeRigContact(b,player.x,player.y);overlap=Math.max(overlap,c?c.depth:0);
        }
        updateCamera();render();
        return {dir:dir,fps:fps,gain:${gain},launch:launch,rise:floor-25-peak,snap:snap,overlap:overlap,
          finite:[player.x,player.y,player.vx,player.vy,b.x,b.y,b.vx,b.vy].every(Number.isFinite)};
      } finally {skySlimePlayer=original;keys.ArrowRight=keys.ArrowLeft=false;}
    })()`);
    rows.push(row);console.log('GROUND POP',row);
  }
  check('all ordinary drives make a finite grounded launch',rows.every(r=>r.finite&&r.launch>0));
  check('drive bumps stay outside the real hull',rows.every(r=>r.overlap<.05));
  check('contact separation stays visually continuous',rows.every(r=>r.snap<1));
  for(const dir of [-1,1])for(const fps of [30,60,144]) {
    const before=rows.find(r=>r.dir===dir&&r.fps===fps&&r.gain===1);
    const after=rows.find(r=>r.dir===dir&&r.fps===fps&&r.gain===2.15);
    check('stronger upward pop at '+fps+' Hz, direction '+dir,after.launch>before.launch*1.4&&after.rise>before.rise*1.5&&after.rise>10);
  }
  check('no runtime or shader errors',errors.length===0);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({rows,errors},null,2));
  await screenshot('ground-pop');
  console.log('PASS complete-game grounded drive comparison in both directions at 30, 60 and 144 Hz.');
} finally {if(errors.length)console.error(JSON.stringify(errors));cleanup();}
