// Native browser checks. The harness owns one Chrome for Testing process.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP || '/tmp/complete-fluid-scenes';fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync('/tmp/complete-fluid-browser-');
const server=createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
let child,socket,serial=0;const pending=new Map(),errors=[],reports=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function until(expression,label,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){if(await ev(expression))return;const fault=await ev('window.__toy?.buildState?.().error || window.__toy?.machineState?.()?.readings?.error');if(fault)throw Error(label+': '+fault);await sleep(100);}throw Error('Timeout '+label);}
async function sample(){return ev(`(()=>{const runtime=__toy.runtime(),stats=runtime?.stats?.();return {finite:stats?.finite!==false,runtime:stats,clock:stats?.seconds,host:__toy.stats(),reading:__toy.machineState().readings,controls:runtime?.controls?.(),bodies:__toy.bodies?.()?.map(b=>({x:b.cx,y:b.cy}))};})()`);}

try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 child=spawn(process.env.HOME+'/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<150&&!fs.existsSync(portFile);i++)await sleep(100);assert(fs.existsSync(portFile),'owned browser starts');
 const debug=fs.readFileSync(portFile,'utf8').split('\n')[0],tab=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(x=>x.value||x.description));});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:process.env.MOBILE?390:1280,height:process.env.MOBILE?844:860,deviceScaleFactor:1,mobile:!!process.env.MOBILE});await send('Page.bringToFront');
 const ids=(process.env.SCENES||'water-tower,pascal-barrel,moka-pot,venturi-aspirator,savery-pump,pulsometer,trompe,hydraulic-ram,water-hammer,ctesibius-clock,upside-down-tank,hydraulic-jump,cold-geyser,soda-mentos,hero-jug,heron-air-smoke,sewer-gas-trap,interlayer-slime,oil-slick-fire').split(',');
 for(const id of ids){
  if(id===ids[0])await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene='+id});else await ev('__toy.machine('+JSON.stringify(id)+',{})');
  await until('!!window.__toy && __toy.machineState()?.ready && !__toy.stats().loading',id+' boot');await until("!!document.querySelector('.toy-scene-action[data-control=primary]')",id+' control');await ev('__toy.pause(true)');
  const initial=await sample();assert(initial.controls.some(c=>c.id==='primary'),id+' primary exists');if(process.env.MOBILE){const rects=await ev("[...document.querySelectorAll('.toy-scene-action')].filter(b=>!b.hidden).map(b=>{let r=b.getBoundingClientRect();return {id:b.dataset.control,x:r.x,y:r.y,w:r.width,h:r.height}})");assert(rects.length===initial.controls.length,id+' all mobile controls visible');for(const r of rects){assert(r.w>=44&&r.h>=44,id+' touch size');assert(r.x>=0&&r.x+r.w<=391,id+' horizontal fit');for(const other of rects){if(r.id===other.id)continue;assert(!(r.x<other.x+other.w&&r.x+r.w>other.x&&r.y<other.y+other.h&&r.y+r.h>other.y),id+' controls overlap '+r.id+'/'+other.id);}}}
  if(process.env.MATERIAL_CHECKS&&['interlayer-slime','oil-slick-fire'].includes(id)){
   await ev('__toy.pause(false)');await until('__toy.runtime().stats().seconds>=8',id+' settle',180000);const baseline=await sample();
   if(id==='oil-slick-fire'){assert(baseline.runtime.state.fuelUsed>0,'native oxygen burns actual oil');await ev('__toy.machinePrimary()');await until('__toy.runtime().stats().seconds>='+String(baseline.clock+3),id+' quench');const quenched=await sample();assert(quenched.runtime.fire.heatReleaseW<baseline.runtime.fire.heatReleaseW*.1,'water quenches oil source');}
   else {console.log('slime neutral',baseline.runtime.state);assert(Math.abs(baseline.runtime.state.slimeY-baseline.runtime.state.interfaceY)<35,'slime rests at oil-water interface');await ev('__toy.machinePrimary()');await until('__toy.runtime().stats().seconds>='+String(baseline.clock+8),id+' sink');const dense=await sample();assert(dense.runtime.state.slimeY>baseline.runtime.state.slimeY+30,'denser-than-water slime sinks');await ev('__toy.machinePrimary()');await until('__toy.runtime().stats().seconds>='+String(dense.clock+8),id+' float');const light=await sample();assert(light.runtime.state.slimeY<baseline.runtime.state.slimeY-30,'lighter-than-oil slime rises');}
  }
await ev("document.querySelector('.toy-scene-action[data-control=primary]').click();__toy.pause(false)");
  const checkpoints=[];for(let i=0;i<Number(process.env.POINTS||1);i++){const target=await ev('__toy.runtime().stats().seconds')+Number(process.env.SECONDS||1);await until('__toy.runtime().stats().seconds>='+target,id+' advance',180000);checkpoints.push(await sample());}
  await ev('__toy.pause(true)');const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,id+'.png'),Buffer.from(shot.data,'base64'));
  const report={id,initial,checkpoints};reports.push(report);fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(report,null,2));console.log(id,JSON.stringify({clock:checkpoints.at(-1).clock,massErrorKg:checkpoints.at(-1).runtime.massErrorKg,gasResidualMoles:checkpoints.at(-1).runtime.gasResidualMoles}));
  assert(checkpoints.every(s=>s.finite&&Math.abs(s.runtime.massErrorKg)<1e-7&&Math.abs(s.runtime.gasResidualMoles)<1e-7),'finite conservative state '+id);const paused=await sample();await sleep(200);assert.equal((await sample()).clock,paused.clock,id+' pauses');
 }
 assert.equal(errors.length,0,'no browser exceptions');console.log('PASS native scene probes');
}finally{fs.writeFileSync(path.join(out,'reports.json'),JSON.stringify({reports,errors},null,2));try{socket?.close();}catch{}server.close();if(child&&child.exitCode===null&&child.signalCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),2000);await ended;clearTimeout(force);}for(const p of pending.values())clearTimeout(p.timer);fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
