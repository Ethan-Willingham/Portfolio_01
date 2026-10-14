// Real WebGPU trajectories, mass-contrast and removed-riffle controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dump=process.env.DUMP || '/tmp/gold-sluice-review';
fs.mkdirSync(dump,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png'};
const server=createServer((req,res)=>{
  try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert(file.startsWith(root+path.sep));
    let data=fs.readFileSync(file);if(file.endsWith('/js/water-smoke-slime.js')){let code=data.toString(),end=code.lastIndexOf('})();');data=Buffer.from(code.slice(0,end)+'window.__sluiceTest=s=>eval(s);\n'+code.slice(end));}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404).end();}
});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-grain-'));
let child,socket,serial=0;const pending=new Map(),errors=[],audioEvents=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},30000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
async function load(options={}){
 const url='http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=gold-sluice-box&paused=1';
 await send('Page.navigate',{url});
 let ready=false;for(let i=0;i<300;i++){if(await evaluate('!!window.__toy && !!__toy.machineState()?.ready && !__toy.stats().loading')){ready=true;break;}await sleep(100);if(errors.length)break;}assert(ready,JSON.stringify({errors,state:await evaluate("typeof __toy==='object'?{stats:__toy.stats(),instruments:__toy.instruments()}:document.body.innerText.slice(0,1000)")}));
 await evaluate('__toy.pause(true);__toy.liquid().device.addEventListener("uncapturederror",event=>console.error(event.error.message));');
 if(Object.keys(options).length)await evaluate('__toy.machine("gold-sluice-box",'+JSON.stringify(options)+')');
 await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');
}
async function sample(){return evaluate(`(async()=>{
 const e=__toy.liquid(),n=e.uploadedCount,b=e.device.createBuffer({size:n*20,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{const enc=e.device.createCommandEncoder();enc.copyBufferToBuffer(e.buf.pos,0,b,0,n*16);enc.copyBufferToBuffer(e.buf.flag,0,b,n*16,n*4);e.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);
 const raw=b.getMappedRange(),p=new Float32Array(raw,0,n*4),f=new Uint32Array(raw,n*16,n),d=__toy.machineState().definition;
 const out={time:e.simulationClock,n,finite:true,penetrations:0,water:0,sand:{n:0,tail:0,bed:0,pockets:0,x:0,y:0,speed:0},blackSand:{n:0,tail:0,bed:0,pockets:0,x:0,y:0,speed:0},gold:{n:0,tail:0,bed:0,pockets:0,x:0,y:0,speed:0},ids:[]};
 for(let i=0;i<n;i++){
  const x=p[i*4],y=p[i*4+1],vx=p[i*4+2],vy=p[i*4+3];out.finite&&=[x,y,vx,vy].every(Number.isFinite);
  if(x>=72 && x<=d.sluice.tailingsX && y>=160 && y<=d.sluice.tailingsY && d.sluice.polygons.some(points=>points.every((a,k)=>{const b=points[(k+1)%4],dx=b[0]-a[0],dy=b[1]-a[1];return ((x-a[0])*dy-(y-a[1])*dx)/Math.hypot(dx,dy)<-0.005;})))out.penetrations++;
  if(((f[i]&3)|((f[i]>>4)&4))!==5){out.water++;continue;}
  const origin=(f[i]>>2)&3,r=origin===3?out.gold:origin===2?out.blackSand:out.sand;out.ids.push([i,f[i]&79]);r.n++;r.x+=x;r.y+=y;r.speed+=Math.hypot(vx,vy);
  if(x>=d.sluice.tailingsX||y>=d.sluice.tailingsY)r.tail++;else if(x>=232)r.bed++;
  if(d.sluice.pockets.some(q=>x>=q.x&&x<q.x+q.width&&y>=q.y-2&&y<q.y+q.height+2))r.pockets++;
 }
 for(const k of ['sand','blackSand','gold']){for(const q of ['x','y','speed'])out[k][q]/=Math.max(1,out[k].n);}
 return out;
 }finally{b.destroy();}
 })()`);}
async function run(name,options){
 await load(options);if(options.seed)assert.equal(await evaluate('__toy.machineState().seed'),options.seed);let start=await sample(),rows=[start];await evaluate("__toy.pause(false);__sluiceTest('stopLoop()');__toy.activateMachineControl('primary',true)");
 for(let step=0;step<960;step+=20){
  await evaluate(`(async()=>{for(let i=0;i<20;i++){__sluiceTest('frame(lastT?lastT+1000/60:1000/60);stopLoop();');if(__toy.stats().water>=${start.n}+30000)__toy.sluiceControl('valve',false);}await __toy.liquid().queue.onSubmittedWorkDone();})()`);
  const row=await sample();assert(row.finite,name+': finite');assert.equal(row.penetrations,0,name+': no parcel crosses the bed or riffles');const admitted=await evaluate('__toy.stats().water')-start.n;assert.equal(row.n,start.n+admitted,name+': resident inventory matches declared additions');if(admitted>=30000)assert(admitted<=30100,'release stops admission without a backlog');assert.deepEqual(row.ids,start.ids,name+': material identities');delete row.ids;rows.push(row);
  if(step%100===0)console.log(name,JSON.stringify(row));
 }
 const final=rows.at(-1);assert(final.n>=start.n+30000 && final.n<=start.n+30100,'only held inlet water enters');assert.equal(await evaluate('__toy.sluice().pouring'),false,'the source has stopped');await evaluate('__toy.resize();');await sleep(100);
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(shot.data,'base64'));
 delete start.ids;return {name,options,start,final,rows};
}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 child=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await sleep(100);}assert(port);
 const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
 else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value || a.description));else if(m.method?.startsWith('WebAudio.'))audioEvents.push(m);});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,mobile:false,deviceScaleFactor:1});
 const report=[];
 const choices=[['ordinary',{}],['matched',{matched:true}],['plain',{riffles:false}],['seed42',{seed:42}],['seed913',{seed:913}]];
 for(const [name,options]of choices.filter(r=>!process.env.GOLD_CASES || process.env.GOLD_CASES.split(',').includes(r[0]))){report.push(await run(name,options));fs.writeFileSync(path.join(dump,'result.json'),JSON.stringify({report,errors},null,2));}
 for(const r of report){
  const row=r.final;
  if(['ordinary','seed42','seed913'].includes(r.name)){
   // The 51-inch box takes longer to wash than the old short apparatus.
   // This finite partial wash must produce measurable density separation.
   assert(row.sand.tail>0,r.name+': quartz reaches the actual outlet');
   assert(row.sand.x-row.gold.x>200,r.name+': quartz advances well beyond gold');
   assert(row.sand.x>row.blackSand.x && row.blackSand.x>row.gold.x,r.name+': intermediate-density magnetite separates between quartz and gold');
   assert(row.gold.tail/row.gold.n<=.1,r.name+': heavy gold remains in the riffled bed');
  }
 }
 const ordinary=report.find(r=>r.name==='ordinary'),matched=report.find(r=>r.name==='matched'),plain=report.find(r=>r.name==='plain');
 if(ordinary && matched){assert(matched.final.gold.x>ordinary.final.gold.x+96,'equal-density gold advances beyond another riffle');assert(matched.final.blackSand.x>ordinary.final.blackSand.x+96,'equal-density magnetite advances beyond another riffle');}
 if(ordinary && plain)assert(plain.final.gold.x>ordinary.final.gold.x+96,'removing riffles lets real gold travel farther down the long bed');
 if(!process.env.GOLD_CASES || process.env.GOLD_CASES.split(',').includes('controls')){
  await load();
  const oracleSource=fs.readFileSync(path.join(root,'tools/gold-sluice-contact-oracle.js'),'utf8');
  const contacts=await evaluate('(async()=>{'+oracleSource+';return await goldSluiceContactOracle();})()');
  for(const row of contacts){
   assert(row.output.every(Number.isFinite),row.name+': finite');
   for(let axis=0;axis<2;axis++){
    assert(Math.abs(row.before.momentum[axis]-row.after.momentum[axis])<.0001,row.name+': equal/opposite contact momentum');
    assert(Math.abs(row.before.center[axis]-row.after.center[axis])<.0001,row.name+': mass-weighted position correction');
   }
   assert(row.after.energy<=row.before.energy+.0001,row.name+': contact cannot add kinetic energy');
  }
  assert.deepEqual(contacts[1].output,contacts[2].output,'equal masses cannot respond to the material label');
  assert.deepEqual(contacts.at(-1).input,contacts.at(-1).output,'separated grains receive no capture force');
  console.log('PASS eleven actual GPU contact fixtures: quartz, magnetite and gold momentum, kinetic energy and material-label controls');
  fs.writeFileSync(path.join(dump,'contacts.json'),JSON.stringify(contacts,null,2));
  // Loading another material draft must not replace the cached gold factory.
  await evaluate('WSSMachineRegistry.load("sand-dam")');
  await evaluate('__toy.machine("gold-sluice-box",{})');
  assert(await evaluate('!!__toy.machineState().definition.sluice && __toy.liquid().materialSlip.stats().grainClasses.length===3'),'scene changes preserve the dedicated quartz/magnetite/gold factory');
  // Real pointer targets and playback in landscape, followed by pause/reset.
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,mobile:true,deviceScaleFactor:2});
  await load();const mobileInitial=(await sample()).n;await evaluate('document.getElementById("toy-instruments-open").click()');await sleep(250);
  assert.equal(await evaluate('document.getElementById("toy-native-setup").options.length'),3);
  const panel=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,'landscape-instruments.png'),Buffer.from(panel.data,'base64'));
  await evaluate('document.querySelector("#toy-panel-instruments [data-close]").click()');
  await evaluate('document.getElementById("sluice-fit").click()');await sleep(100);
  const target=await evaluate(`(()=>{const r=document.querySelector('.toy-scene-action[data-control="primary"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()`);
  assert(target.width>=44&&target.height>=44,'the jug has a 44-pixel touch target: '+JSON.stringify(target));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});
  assert.equal(await evaluate('__toy.sluice().valve'),true,'clicking the visible pipe opens its metered valve');
  await evaluate('__toy.pause(false)');await sleep(2000);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});
  assert.equal(await evaluate('__toy.sluice().valve'),false,'clicking the pipe again closes it');const released=await sample();await sleep(250);assert.equal((await sample()).n,released.n,'closed pipe stops admission while falling water continues');await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');
  const paused=await sample();await sleep(250);const held=await sample();assert.equal(paused.time,held.time,'pause stops physics');assert.equal(paused.n,held.n,'pause stops water admission');
  assert(paused.n>mobileInitial,'playback admits real inlet water');
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,'landscape.png'),Buffer.from(mobile.data,'base64'));
  await evaluate('document.getElementById("toy-restart").click()');
  for(let i=0;i<300;i++){if(await evaluate('!__toy.stats().loading&&__toy.machineState()?.ready'))break;await sleep(100);}
  assert.equal(await evaluate('__toy.stats().pouring'),false,'restart clears the held source');
  assert.equal((await sample()).n,mobileInitial,'restart restores the finite seed');
  await evaluate('__toy.scene("blank")');for(let i=0;i<300;i++){if(await evaluate('typeof __toy==="object"&&__toy.stats().scene==="blank"&&!__toy.stats().loading'))break;await sleep(100);}assert.equal(await evaluate('__toy.liquid().materialSlip'),undefined,'scene change releases the material companion');
 }
 if(!process.env.GOLD_CASES || process.env.GOLD_CASES.split(',').includes('station')){
  const {checkStation}=await import('./gold-sluice-station-checks.mjs');
  await checkStation({load,sample,evaluate,send,sleep,dump,audioEvents});
 }
 if(!process.env.GOLD_CASES || process.env.GOLD_CASES.split(',').includes('operations')){
  const {checkOperations}=await import('./gold-sluice-operation-checks.mjs');await checkOperations({load,sample,evaluate,send,sleep,dump});
 }
 if(!process.env.GOLD_CASES || process.env.GOLD_CASES.split(',').includes('field')){
  const {checkFieldCalibration}=await import('./gold-sluice-field-checks.mjs');await checkFieldCalibration({load,evaluate,send,sleep,dump});
 }
 if(!process.env.GOLD_CASES || process.env.GOLD_CASES.split(',').includes('audio')){
  const {checkAudioLifecycle}=await import('./gold-sluice-station-checks.mjs');await checkAudioLifecycle({load,evaluate,sleep,send});
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(path.join(dump,'result.json'),JSON.stringify({report,errors},null,2));
 console.log('RESULT',JSON.stringify(report.map(r=>({name:r.name,final:r.final}))));
}finally{
 socket?.close();server.close();for(const p of pending.values())clearTimeout(p.timer);
 if(child && child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
 fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
