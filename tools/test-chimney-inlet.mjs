// Real inlet-button regression, with an owned Chrome for Testing process.
// Screenshots and measured fire/plume states go to /tmp/chimney-inlet-review.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.DUMP || '/tmp/chimney-inlet-review';
const port=Number(process.env.PORT || 8476),debug=port+1000;
const profile=fs.mkdtempSync('/tmp/chimney-inlet-browser-');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=createServer((request,response)=>{
  try {
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    response.end(fs.readFileSync(file));
  } catch {response.writeHead(404).end();}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,socket,serial=0;
const pending=new Map(),errors=[],reports=[];
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function until(expression,label){
  for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(100);}
  throw Error('Timed out: '+label);
}
async function advance(seconds){
  const end=await evaluate('__toy.fire().stats().elapsed')+seconds;
  await until(`__toy.fire().stats().elapsed>=${end}`,'fire clock');
}
async function capture(name){
  const report=await evaluate(`(()=>{
    const T=__toy,w=T.world(),d=T.machineState().definition;
    const heat=T.smoke().fluid.sampleTemperature(180,100),x=d.fire.x;
    let plumeHeat=0,cells=0;
    for(let row=10;row<75;row++)for(let col=0;col<180;col++){
      if(Math.abs((col+.5)*w.w/180-x)>24)continue;
      plumeHeat+=Math.max(0,heat.kelvin[row*180+col]-293.15);cells++;
    }
    return {fire:T.fire().stats(),draft:T.fireSmokeDraft().stats(true),plumeHeat:plumeHeat/cells,
      action:document.querySelector('.toy-scene-action[data-control="primary"]').getAttribute('aria-label'),stats:T.stats()};
  })()`);
  assert.equal(report.fire.error,null,'native fire stays healthy');
  assert.equal(report.draft.error,null,'actual smoke field stays finite');
  assert.ok(Number.isFinite(report.plumeHeat),'plume temperature is finite');
  reports.push({name,...report});
  console.log(name,JSON.stringify({burn:report.fire.burnFraction,air:report.fire.airFraction,inlet:report.draft.inletOpenFraction,plumeHeat:report.plumeHeat}));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
  return report;
}
async function clickInlet(){
  const point=await evaluate(`(()=>{const r=document.querySelector('.toy-scene-action[data-control="primary"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
}
async function cleanup(){
  socket?.close();server.close();
  for(const item of pending.values())clearTimeout(item.timer);
  if(chrome && chrome.exitCode===null && chrome.signalCode===null){
    const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
    const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.on('SIGINT',async()=>{await cleanup();process.exit(130);});
process.on('SIGTERM',async()=>{await cleanup();process.exit(143);});
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  chrome=spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`,[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    `--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'
  ],{stdio:'ignore'});
  let endpoint;
  for(let i=0;i<150;i++){
    try {endpoint=(await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;} catch {}
    if(endpoint)break;await delay(100);
  }
  assert.ok(endpoint,'owned browser starts');
  socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const item=pending.get(m.id);pending.delete(m.id);clearTimeout(item?.timer);m.error?item?.reject(m.error):item?.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value || a.description));
  });
  await send('Runtime.enable');await send('Page.enable');
  for(const viewport of [{width:1440,height:900,mobile:false},{width:844,height:390,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html?scene=chimney-draw`});
    await until('!!window.__toy && __toy.machineState()?.ready && !!__toy.fireSmokeDraft()','chimney boot');
    const prefix=viewport.mobile?'mobile':'desktop';
    await advance(4);const open=await capture(prefix+'-open');
    assert.equal(open.draft.inletOpenFraction,1);assert.ok(open.fire.burnFraction>.8 && open.fire.burning);
    assert.equal(open.action,'Close inlet');
    await clickInlet();await advance(5);const closed=await capture(prefix+'-closed');
    assert.equal(closed.draft.inletOpenFraction,0);assert.equal(closed.fire.inletOpenFraction,0);
    assert.ok(closed.fire.airStarved && !closed.fire.burning,'closed inlet extinguishes the flame');
    assert.equal(closed.fire.quenchEvents,0,'air starvation does not report a water quench');
    assert.ok(closed.plumeHeat<open.plumeHeat*.25,'the real flue plume cools visibly');
    assert.equal(closed.action,'Open inlet');
    assert.ok(Math.abs(1+closed.fire.airAdded-closed.fire.airConsumed-closed.fire.airFraction)<.001,'mixed air charge balances');
    await advance(.5);
    assert.equal(await evaluate('__toy.fire().stats().heatInputJ'),closed.fire.heatInputJ,'starved fuel supplies no new combustion heat');
    await clickInlet();await advance(4);const reopened=await capture(prefix+'-reopened');
    assert.ok(reopened.fire.burning && reopened.fire.burnFraction>.8,'reopening revives the same fire');
    assert.ok(reopened.plumeHeat>closed.plumeHeat*4,'the actual hot plume returns');
    assert.equal(reopened.action,'Close inlet');
    if(!viewport.mobile){
      // Geometry edits also affect supply, independently of the button flag.
      await evaluate(`(()=>{const b=__toy.builder(),r=__toy.machineState().definition.draftFireSmoke.gate.rect;b.begin('Seal inlet');b.vent(r,false);b.commit();})()`);
      await advance(5);const painted=await capture('desktop-built-shut');
      assert.equal(painted.draft.inletOpenFraction,0);assert.ok(painted.fire.airStarved);
      await evaluate(`__toy.pause(true);__toy.machine('chimney-draw',{closed:true})`);
      await until('__toy.machineState()?.ready','closed setup');await evaluate('__toy.pause(false)');
      await advance(5);assert.ok(await evaluate('__toy.fire().stats().airStarved'),'initially closed setup also starves');
      await evaluate(`__toy.machine('douse-fire',{})`);await until('__toy.machineState()?.ready','ordinary fire');
      await advance(1);assert.ok(await evaluate('__toy.fire().stats().burning && __toy.fire().stats().burnFraction===1'),'ordinary fire retains its source');
      await evaluate(`__toy.activateMachineControl('primary',true)`);await until('__toy.fire().stats().smothered','water still quenches ordinary fire');await evaluate(`__toy.releaseMachineControl()`);
    }
  }
  assert.deepEqual(errors,[],'no JavaScript or GPU errors');
  console.log('PASS: desktop and landscape mobile inlet cycles, built closure, closed setup and water quench.');
} finally {
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,errors},null,2));
  await cleanup();
}
