// Full bathhouse regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/bathhouse-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8183), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-bathhouse-');
const out = process.env.DUMP || '/tmp/sluice-bathhouse-qa';
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
  for(let i=0;i<300;i++){if(await ev(`typeof __bathTest==='function' && __bathTest("introPhase === 'done'")`))break;await sleep(100);}
  check('normal boot enables bathhouse',await game("introPhase === 'done' && ENABLE_BATH"));
  check('visitor shaders warm without errors',await ev('window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.visitors>=0'));
  await ev("document.body.classList.add('gm-fs'); document.body.appendChild(document.querySelector('.game-wrapper')); window.dispatchEvent(new Event('resize')); window.scrollTo(0,0)");
  await sleep(500);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;devMode=false;skySlimes=[];skySlimeNext=0.01;player.x=banyaDoorX0-150;player.y=SKY_ROWS*TILE-PLAYER_H;player.renderX=player.x;player.renderY=player.y;cam.snap=true;updateCamera()');
  await game('skySlimeTick(0.05);render()');await screenshot('arrival');
  await game('for(var n=0;n<900;n++){skySlimeTick(0.1);bathGuestTick(0.1);}render()');
  console.log('VISITORS',await game('({outside:skySlimes.map(function(s){return {visit:s.visit,x:s.x,y:s.y,age:s.age};}),inside:bathGuests.length,door:banyaDoorX0})'));
  check('sky visitors find the real world door',await game('bathGuests.length===2 && bathGuests.every(function(g){return g.st==="wait";})'));
  await game('bathEnter()');await sleep(600);await game('updateCamera();render()');
  check('new bath starts dry and unheated',await game('bathWater===0 && bathFire===0 && bathHeat===0'));
  await screenshot('waiting-dry');
  check('cold dry tub refuses admission',await game('!bathServe(bathGuests[0].s.id)'));
  await game('cargo=Array.from({length:9},function(){return {type:"coal"};})');
  check('startup needs the entire ten coal',await game('!bathLightStove() && cargo.length===9'));
  await game('cargo.push({type:"coal"});siphon.tank[0]=12000');
  await press('({x:bathServiceButtons[1].x+80,y:bathServiceButtons[1].y+20})');
  check('mouse lighting charges exactly ten coal',await game('cargo.length===0 && bathFire===BATH_FIRE_SECONDS'));
  check('burning stove cannot charge twice',await game('!bathLightStove() && bathFire===BATH_FIRE_SECONDS'));
  await press('({x:bathServiceButtons[0].x+80,y:bathServiceButtons[0].y+20})');
  check('mouse refill transfers existing tank water',await game('siphon.tank[0]===0 && bathPour===12000'));
  await game('gameRafId=requestAnimationFrame(loop)');await sleep(9000);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  console.log('WATER',await game('({water:bathWater,heat:bathHeat,pour:bathPour,liquid:liquidCount,lost:bathLostWater})'));
  await screenshot('warming');
  check('real water fills and warms',await game('bathWater>=BATH_MIN_WATER && bathHeat>0.35 && bathPour===0'));
  const id=await game('bathGuests[0].s.id');
  const before=await game('({water:bathWater,coal:cargo.length})');
  check('ready order admits without a per-guest resource fee',await game(`bathServe(${id}) && cargo.length===${before.coal} && bathWater===${before.water}`));
  await game('gameRafId=requestAnimationFrame(loop)');await sleep(4000);
  await screenshot('soaking');
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  check('guest is soaking in the actual tub',await game('bathGuests.some(function(g){return g.st==="soak";})'));
  const beforePay=await game('money');
  await game('for(var n=0;n<220;n++)bathGuestTick(0.1)');
  check('guest pays once after the soak',await game(`money===${beforePay}+BATH_VISIT.pay && bathServed===1`));
  check('splashed water is permanently drained',await game('bathLostWater>0 && bathWater<12000'));
  await screenshot('paid');
  const saved=await game('({money:money,water:bathBasinCount(),lost:bathLostWater,heat:bathHeat,fire:bathFire})');
  await game('var envelope=JSON.parse(JSON.stringify(saveBuild()));init();saveApply(envelope);introPhase="done";bathMode=true;bathWater=bathBasinCount();bathArmHeat();bathCamPin();render()');
  check('reload preserves fire, heat, water and permanent loss',await game(`money===${saved.money} && bathWater===${saved.water} && bathLostWater===${saved.lost} && bathHeat===${saved.heat} && bathFire===${saved.fire}`));
  await game('for(var n=0;n<70;n++)bathGuestTick(0.1)');
  check('reload does not repeat payment',await game(`money===${saved.money}`));
  await ev('window.SluiceLoading.finish(function(){})');await sleep(500);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await game('isMobile=true;resize();for(var frame=0;frame<60;frame++)updateCamera();render()');await screenshot('mobile');
  check('phone order cards remain readable',await game('bathGuests.filter(function(g){return g.st==="wait";}).every(function(g){return bathOrderRect(g).w*worldScale>=130;})'));
  check('touch resource buttons stay large',await game('bathServiceButtons.length===2 && bathServiceButtons.every(function(b){return b.h>=40;})'));
  await press('(function(){var g=bathGuests.find(function(g){return g.st===\"wait\";}),r=bathOrderRect(g);return {x:(r.x+r.w/2-cam.x)*worldScale,y:(r.y+r.h/2-cam.y)*worldScale};})()',true);
  check('phone tap admits the waiting visitor',await game('bathGuests.every(function(g){return g.st!=="wait";})'));
  check('no runtime or shader errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally {if(errors.length)console.error(JSON.stringify(errors));cleanup();}
