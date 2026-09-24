// Ceiling claw and hose browser regression. Uses its own Chrome for Testing process and profile.
// Run: node tools/bath-tools-smoke.mjs (screenshots go to /tmp, never the repo).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8219), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-bath-tools-');
const out = process.env.DUMP || '/tmp/sluice-bath-tools-qa';
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
const buttonCenter = action => `(function(){var b=hearthButtons.find(b=>b.action===${JSON.stringify(action)});return {x:b.x+b.w/2,y:b.y+b.h/2};})()`;
async function clientPoint(target) {
  return game(`(function(){var r=${target};var box=canvas.getBoundingClientRect();return {x:box.left+r.x*box.width/(canvas.width/dpr),y:box.top+r.y*box.height/(canvas.height/dpr)};})()`);
}
async function press(target, touch = false) {
  const point = await clientPoint(target);
  if(touch){
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  }
  await ev('new Promise(resolve=>requestAnimationFrame(()=>resolve()))');
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35${process.env.CPU ? '&cpuwater=1' : ''}`});
  for(let i=0;i<300;i++){if(await ev(`typeof __bathTest==='function' && __bathTest("introPhase === 'done'")`))break;await sleep(100);}
  check('normal boot enables bathhouse',await game("introPhase === 'done' && ENABLE_BATH"));
  check('visitor shaders warm without errors',await ev('window.__shaderWarm.errors.length===0 && window.__shaderWarm.times.visitors>=0'));

  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await game('bathEnter()'); await sleep(800);
  await game('skySlimeNext=100000;skySlimes=[];bathGuests=[];siphon.tank[0]=18000;bathHeat=0.8;var s=skySlimeFresh(0,0);bathGuestAccept(s);');
  await sleep(900);
  await press(buttonCenter('claw'));
  check('claw selected through real mouse input', await game("bathTool.mode==='claw'"));
  const guestPoint = '(function(){var s=bathGuests[0].s;return {x:(s.x-cam.x)*worldScale,y:(s.y-28-cam.y)*worldScale};})()';
  let point=await clientPoint(guestPoint);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await sleep(1400);
  check('moving claw catches the actual visitor',await game('bathTool.held===bathGuests[0] && bathGuests[0].manual'));
  point=await clientPoint('(function(){var b=bathToolBounds();return {x:((b.curve.x0+b.curve.x1)/2-cam.x)*worldScale,y:(b.curve.y0-65-cam.y)*worldScale};})()');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'left',buttons:1});
  await sleep(1600);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  check('lifting finger keeps the guest in the claw',await game('bathTool.pointer===null && bathTool.held===bathGuests[0]'));
  await screenshot('desktop-claw');
  await press(buttonCenter('tool-drop'));
  check('drop releases without losing the visitor',await game('bathTool.held===null && bathGuests.length===1'));
  await press(buttonCenter('hose'));
  check('hose replaces claw',await game("bathTool.mode==='hose' && bathTool.held===null"));
  await press(buttonCenter('tool-valve'));
  await sleep(2500);
  await screenshot('desktop-jet');
  console.log('WATER',await game('({tank:siphon.tank[0],water:bathWater,count:liquidCount,flow:bathTool.flow,gpu:!!(liquidWGPU&&liquidWGPU.simActive),colliders:bathGuestColliders.length})'));
  check('hose emits real solver particles from finite supplies',await game('siphon.tank[0]<18000 && bathWater>1000 && bathGuestColliders.length===2'));
  await press(buttonCenter('tool-spray')); await sleep(700); await screenshot('desktop-shower');
  check('shower changes the nozzle pattern',await game('bathTool.shower'));
  await press(buttonCenter('hose'));
  check('same mode button stows both tools and closes the valve',await game("bathTool.mode==='' && !bathTool.valve && bathTool.flow===0"));
  await game('cancelAnimationFrame(gameRafId);gameRafId=0');
  const conservation=await game(`(function(){
    var emit=liquidToolEmit, mode=devMode;
    var total=0;devMode=false;siphon.tank[0]=29;bathSupplies[0]=11;bathPour=17;bathWater=0;
    bathToolSelect('hose');bathTool.valve=true;
    liquidToolEmit=function(type,n){var used=Math.min(n,3);total+=used;return used;};
    for(var i=0;i<180;i++)bathToolTick(1/60);
    var used=total,remaining=siphon.tank[0]+bathSupplies[0]+bathPour;
    liquidToolEmit=function(){return 0;};siphon.tank[0]=20;
    for(var i=0;i<60;i++)bathToolTick(1/60);
    var blocked=siphon.tank[0]===20;
    liquidToolEmit=emit;devMode=mode;bathToolReset();
    return {used:used,remaining:remaining,blocked:blocked};
  })()`);
  console.log('CONSERVATION',conservation);
  check('partial emission spends exactly accepted water and blocked nozzle spends none',conservation.used===57 && conservation.remaining===0 && conservation.blocked);
  // Check transient tool ownership and physical guest saves at three frame rates.
  const physics=await game(`(function(){var reports=[];
    for(var fps of [30,60,144]){
      bathGuests=[];bathToolReset();var s=skySlimeFresh(0,0);bathGuestAccept(s);
      var g=bathGuests[0],b=bathToolBounds();g.hop=null;g.st='wait';
      bathToolSelect('claw');bathTool.x=bathTool.tx=s.x;bathTool.y=bathTool.ty=s.y-30;bathTool.grab=true;
      for(var n=0;n<fps/2;n++)bathToolTick(1/fps);
      var caught=bathTool.held===g;bathTool.tx=(b.curve.x0+b.curve.x1)/2;bathTool.ty=b.curve.y0-60;
      for(var n=0;n<fps*3;n++){bathToolTick(1/fps);bathToolGuestTick(g,1/fps);}
      var carried=s.x; bathToolRelease(false);
      for(var n=0;n<fps*4;n++)bathToolGuestTick(g,1/fps);
      var saved=JSON.parse(JSON.stringify(bathServiceSave()));bathServiceRestore(saved);
      reports.push({fps:fps,caught:caught,carried:carried,x:bathGuests[0].s.x,y:bathGuests[0].s.y,
        manual:bathGuests[0].manual,free:bathTool.held===null,finite:Number.isFinite(s.x+s.y+s.vx+s.vy)});
    }return reports;})()`);
  console.log('PHYSICS',physics);
  check('claw carries, drops and restores physical visitors at 30/60/144 Hz',physics.every(p=>p.caught&&p.manual&&p.free&&p.finite&&p.carried>1000));
  for(const [width,height] of [[1280,900],[390,844],[320,568],[844,390],[568,320]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
    await game('isMobile='+String(width<500)+';resize();updateCamera();render()');
    for(const mode of ['claw','hose']){
      await game('bathToolReset();bathToolSelect('+JSON.stringify(mode)+');bathToolTick(1/60);updateCamera();render()');
      const fits=await game(`(function(){var w=canvas.width/dpr,h=canvas.height/dpr,bs=hearthButtons;
        var bounds=bathToolBounds();return bs.every(a=>a.x>=0&&a.y>=0&&a.x+a.w<=w&&a.y+a.h<=h&&a.h>=44)&&
          bs.every((a,i)=>bs.every((b,j)=>i===j||a.x>=b.x+b.w||a.x+a.w<=b.x||a.y>=b.y+b.h||a.y+a.h<=b.y))&&
          (bounds.top-21-cam.y)*worldScale>=hearthNavHeight()-1;
      })()`);
      if(!fits)console.log('LAYOUT',await game('({w:canvas.width/dpr,h:canvas.height/dpr,nav:hearthNavHeight(),cam:cam,bounds:bathToolBounds(),scale:worldScale,buttons:hearthButtons})'));
      check(mode+' controls fit '+width+'x'+height,fits);
      await screenshot(width+'x'+height+'-'+mode);
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await game("resize();bathToolReset();updateCamera();render();siphon.tank[0]=20000;bathWater=0;bathGuests=[];gameRafId=requestAnimationFrame(loop)");
  await press(buttonCenter('hose'),true);
  point=await clientPoint('(function(){return {x:(bathTool.x-cam.x)*worldScale,y:(bathTool.y-cam.y)*worldScale};})()');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:8}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+50,y:point.y+30,id:8}]});
  await sleep(700);
  check('real touch drag owns nozzle and emits water',await game('bathTool.pointer!==null && bathTool.flow>0.5 && siphon.tank[0]<20000 && !bathPtrDown'));
  await screenshot('phone-touch-hose');
  await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  check('touch cancel stops water and releases capture',await game('bathTool.pointer===null && !bathTool.valve && bathTool.flow===0'));
  await press(buttonCenter('tool-valve'),true);
  await game("window.dispatchEvent(new Event('blur'))");
  check('focus loss closes the valve',await game('!bathTool.valve && bathTool.flow===0'));
  await press(buttonCenter('claw'),true);
  await game("hearthSetView('boiler')");
  check('entering boiler stows tools',await game("bathTool.mode===''"));
  check('no browser errors',errors.length===0);
  console.log('Screenshots: '+out);
} finally {if(errors.length)console.error(JSON.stringify(errors));cleanup();}
