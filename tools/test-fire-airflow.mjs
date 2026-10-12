// Real apparatus airflow, with no arbitrary velocity or cooling overrides.
// Diagnostic-only mode preserves baseline evidence before assertions are enabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.DUMP || '/tmp/fire-airflow-review');
const phase=process.env.PHASE || 'all',diagnostic=process.env.DIAGNOSTIC_ONLY==='1';
assert(['all','cold','plumes','decay','pour','presets','convergence','locality','topology'].includes(phase),'known airflow test phase');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fire-airflow-browser-'));
fs.mkdirSync(output,{recursive:true});
const sourceSHA256=Object.fromEntries(['js/wss-oxygen.js','js/wss-fire.js','js/sluice/190-smoke-webgl.js','js/wss-drafts-fire-smoke.js','js/wss-drafts-materials.js','js/wss-sauna.js'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file));
  }catch{response.writeHead(404).end();}
});
let child,socket,serial=0;
const pending=new Map(),errors=[],reports=[],checks=[];
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method+' '+(params.expression || '').slice(0,160)));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
async function until(expression,label,timeout=90000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(await evaluate(expression))return;
    const failure=await evaluate('window.__toy?.buildState?.().error || window.__toy?.oxygen?.()?.stats().error || null');
    if(failure)throw Error(label+': '+failure);
    await delay(100);
  }
  throw Error('Timed out '+label+' '+JSON.stringify(await evaluate('({host:window.__toy?.stats(),oxygen:window.__toy?.oxygen?.()?.stats(),build:window.__toy?.buildState?.()})')));
}
function check(label,condition){checks.push({label,pass:!!condition});if(!diagnostic)assert(condition,label);}
async function construct(id,options={}){
  await evaluate('__toy.pause(true)');
  await evaluate(`__toy.machine(${JSON.stringify(id)},${JSON.stringify(options)})`);
  await until(`__toy.machineState()?.ready && !__toy.stats().loading && __toy.machineState().definition.name===${JSON.stringify(id)} && !!__toy.oxygen?.()`,'construct '+id);
}
async function advance(seconds){
  const end=await evaluate('__toy.oxygen().stats().seconds')+seconds;
  await until(`__toy.oxygen().stats().seconds>=${end}`,'physical air clock',Math.max(90000,seconds*7000));
}
async function advancePhysical(seconds){
  const target=await evaluate('__toy.oxygen().stats().physicalSeconds')+seconds;
  assert(Number.isFinite(target),'owned air exposes its physical clock');
  await until(`__toy.oxygen().stats().physicalSeconds>=${target}`,'physical air time',Math.max(120000,seconds*15000));
}
async function steps(count){
  for(let i=0;i<count;i+=10)await evaluate(`(()=>{for(let n=0;n<${Math.min(10,count-i)};n++)__toy.smoke().fluid.step(1/60);})()`);
}
async function primaryPoint(){
  const point=await evaluate(`(()=>{const b=document.querySelector('.toy-scene-action[data-control="primary"]'),r=b?.getBoundingClientRect();return b&&!b.hidden&&r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
  assert(point,'visible ordinary apparatus control');return point;
}
async function clickPrimary(){
  const point=await primaryPoint();
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
}
async function screenshot(name){
  await evaluate('__toy.pause(true);__toy.oxygen().capture();__toy.oxygenView.toggle(true);true');
  await until('__toy.oxygenView.inspect().revision===__toy.oxygen().snapshot().revision','overlay paints measured airflow');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
}
async function capture(name){
  await evaluate('__toy.oxygen().capture(); true');
  const r=await evaluate(`(()=>{
    const o=__toy.oxygen(),s=o.snapshot(),d=__toy.machineState().definition,f=d.fire || d.draftBurner,stats=o.stats();
    const m=s.metresPerPixel || .762/(__toy.world().scaleWidth || 720),timeScale=s.secondsPerSimulationSecond || stats.secondsPerSimulationSecond || 1,dx=s.worldWidth/s.width,dy=s.worldHeight/s.height;
    const temperature=s.temperatureK || __toy.smoke().fluid.sampleTemperature(s.width,s.height)?.kelvin;
    const regions={all:[],near:[],plume:[],far:[],roomFar:[]},vertical={all:[],near:[],plume:[],far:[],roomFar:[]};
    let airCells=0,nonfinite=0,kineticEnergyJ=0,sensibleHeatJ=0,maxTemperatureK=293.15,minTemperatureK=Infinity,div2=0,divMax=0,divN=0,wallNormalMax=0,pressureMin=Infinity,pressureMax=-Infinity,hotWeight=0,hotVertical=0,hotRisingFlux=0,hotDescendingFlux=0,hotCells=0;
    function add(name,speed,vy){regions[name].push(speed);vertical[name].push(vy);}
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
      const i=y*s.width+x;if(s.solid[i])continue;airCells++;
      const vx=s.cellVxMetresPerSecond?s.cellVxMetresPerSecond[i]:(s.cellVx?s.cellVx[i]:.5*(s.vx[i]+(x?s.vx[i-1]:0)))*m/timeScale;
      const vy=s.cellVyMetresPerSecond?s.cellVyMetresPerSecond[i]:(s.cellVy?s.cellVy[i]:.5*(s.vy[i]+(y+1<s.height?s.vy[i+s.width]:0)))*m/timeScale;
      const speed=Math.hypot(vx,vy),wx=(x+.5)*dx,wy=(y+.5)*dy,dist=Math.hypot(wx-f.x,wy-f.y);
      const temp=temperature?temperature[i]:null;
      if(!Number.isFinite(vx)||!Number.isFinite(vy)||(temperature&&!Number.isFinite(temp)))nonfinite++;
      add('all',speed,vy);
      if(dist<128)add('near',speed,vy);
      if(Math.abs(wx-f.x)<48 && wy>f.y-176 && wy<f.y-16)add('plume',speed,vy);
      const room=d.vessels?.find(v=>v.id==='room')?.rect || d.vessels?.[0]?.rect;
      const outside=!room || wx<room.x-16 || wx>room.x+room.width+16 || wy<room.y-16 || wy>room.y+room.height+16;
      if(dist>224 && !(wy<f.y && Math.abs(wx-f.x)<144) && outside)add('far',speed,vy);
      if(dist>160 && !outside)add('roomFar',speed,vy);
      const volume=s.carrierVolumeM3?.[i] || stats.cellVolumeM3 || dx*dy*m*m*.0254;
      kineticEnergyJ+=.5*1.204*volume*(vx*vx+vy*vy);
      if(temperature){maxTemperatureK=Math.max(maxTemperatureK,temp);minTemperatureK=Math.min(minTemperatureK,temp);sensibleHeatJ+=1.204*1005*volume*Math.max(0,temp-293.15);}
      if(temperature && temp>294.15 && dist<224 && wy<f.y-8){const excess=temp-293.15;hotCells++;hotWeight+=excess;hotVertical+=excess*vy;hotRisingFlux+=excess*Math.max(0,-vy);hotDescendingFlux+=excess*Math.max(0,vy);}
      // Snapshot face velocities use world Y-down. Boundary rows are excluded
      // unless the owned solver supplies its exact divergence array.
      if(s.projectedDivergence){const v=s.projectedDivergence[i];div2+=v*v;divMax=Math.max(divMax,Math.abs(v));divN++;}
      else if(x>0 && y+1<s.height){const v=((s.vx[i]-s.vx[i-1])/dx+(s.vy[i+s.width]-s.vy[i])/dy)/timeScale;div2+=v*v;divMax=Math.max(divMax,Math.abs(v));divN++;}
      if(s.projectionPotential){const p=s.projectionPotential[i];if(!Number.isFinite(p))nonfinite++;pressureMin=Math.min(pressureMin,p);pressureMax=Math.max(pressureMax,p);}
      if(x+1<s.width && s.solid[i+1])wallNormalMax=Math.max(wallNormalMax,Math.abs(s.vx[i])*m/timeScale);
      if(y>0 && s.solid[i-s.width])wallNormalMax=Math.max(wallNormalMax,Math.abs(s.vy[i])*m/timeScale);
    }
    function summary(name){const a=regions[name],v=vertical[name];a.sort((a,b)=>a-b);return{cells:a.length,rms:a.length?Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length):0,p50:a[Math.floor((a.length-1)*.5)] || 0,p95:a[Math.floor((a.length-1)*.95)] || 0,max:a[a.length-1] || 0,meanVy:v.length?v.reduce((s,v)=>s+v,0)/v.length:0};}
    const all=summary('all'),projectionScale=all.rms/Math.max(dx*m,dy*m,1e-10);
    return{scene:d.name,oxygen:stats,fire:__toy.fire()?.stats() || null,domain:__toy.smoke().domain,metresPerPixel:m,secondsPerSimulationSecond:timeScale,dxMetres:dx*m,dyMetres:dy*m,
      all,near:summary('near'),plume:summary('plume'),far:summary('far'),roomFar:summary('roomFar'),
      airCells,nonfinite,kineticEnergyJ,sensibleHeatJ,maxTemperatureK,minTemperatureK,hotAirCells:hotCells,hotAirWeightedVy:hotWeight?hotVertical/hotWeight:0,hotRisingFlux,hotDescendingFlux,projectionPotentialMin:pressureMin,projectionPotentialMax:pressureMax,divergenceRmsPerSecond:divN?Math.sqrt(div2/divN):0,divergenceMaxPerSecond:divMax,
      normalizedDivergence:projectionScale>1e-8?Math.sqrt(div2/Math.max(1,divN))/projectionScale:Math.sqrt(div2/Math.max(1,divN)),wallNormalMaxMetresPerSecond:wallNormalMax,
      host:__toy.stats(),legacyPhysics:__toy.smoke().fluid.getPhysics(),legacyConfig:{curl:__toy.smoke().fluid.config.CURL,wind:__toy.smoke().fluid.config.wind_x}};
  })()`);
  reports.push({name,...r});
  check(name+' finite physical fields',r.nonfinite===0 && r.oxygen.error===null);
  check(name+' closed walls have no normal flow',r.wallNormalMaxMetresPerSecond<1e-5);
  check(name+' projected MAC flow has bounded normalized divergence',r.normalizedDivergence<.05);
  check(name+' pressure solve meets its dimensioned divergence target',r.divergenceMaxPerSecond<=.0801);
  check(name+' heat-only source keeps air at or above ambient',r.minTemperatureK>=293.149);
  if(r.oxygen.airflowModel==='physical open-boundary MAC'){
    check(name+' physical gas heat ledger balances',Math.abs(r.oxygen.airHeatResidualJ)<Math.max(.02,(r.oxygen.chemicalHeatJ*.3+(r.oxygen.airExtraHeatJ || 0))*.001));
    const input=r.oxygen.projectionInputKineticEnergyJ,after=r.oxygen.projectionOutputKineticEnergyJ;
    check(name+' pressure projection adds no face kinetic energy',Number.isFinite(input) && Number.isFinite(after) && after<=input+Math.max(1e-8,input*1e-5));
  }
  const oxygenScale=Math.max(r.oxygen.initialOxygenKg,r.oxygen.oxygenSuppliedKg,1e-8);
  check(name+' oxygen inventory ledger balances',Math.abs(r.oxygen.oxygenResidualKg)<oxygenScale*.0001+1e-10);
  console.log(name,JSON.stringify({seconds:r.oxygen.seconds,nearRms:r.near.rms,plumeRms:r.plume.rms,plumeMeanVy:r.plume.meanVy,farRms:r.far.rms,kineticJ:r.kineticEnergyJ,thermalJ:r.sensibleHeatJ,divergence:r.normalizedDivergence,
    fps:r.host.fps,pressureBackend:r.oxygen.pressureBackend,pressureSolveMilliseconds:r.oxygen.pressureSolveMilliseconds,maxDivergencePerSecond:r.oxygen.maxDivergencePerSecond}));
  return r;
}
async function cold(id){
  await construct(id);await evaluate('__toy.oxygen().setBurnerEnabled(false);__toy.oxygen().prepare({sourceC:20,smothered:false});__toy.clearSmoke();');
  await steps(1);const initial=await capture(id+'-cold-initial');await steps(300);const settled=await capture(id+'-cold-five-seconds');
  check(id+' ambient chamber remains stationary',settled.all.max<1e-5 && settled.maxTemperatureK<293.151);
  check(id+' disabled reaction does not consume oxygen',settled.oxygen.oxygenConsumedKg===initial.oxygen.oxygenConsumedKg);
  if(id==='candle-in-jar' || id==='chimney-draw'){
    await clickPrimary();await steps(60);const opened=await capture(id+'-cold-gate-opened');
    check(id+' stationary gate adds no artificial momentum pulse',opened.all.max<1e-5 && opened.kineticEnergyJ<1e-12);
  }
}
async function presetFixture(id,preset,scale){
  await construct(id);await evaluate(`__toy.set('smokePreset',${JSON.stringify(preset)});__toy.set('smokeScale',${JSON.stringify(scale)});__toy.oxygen().prepare({sourceC:900,smothered:false});`);
  await steps(180);await capture(id+'-preset-'+preset+'-'+scale);
  return evaluate(`(async()=>{const s=__toy.oxygen().snapshot();async function hash(a){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a))).map(v=>v.toString(16).padStart(2,'0')).join('');}return{width:s.width,height:s.height,seconds:s.seconds,hashes:await Promise.all([s.vx,s.vy,s.oxygen,s.temperatureK || s.oxygenMassKg].map(hash))};})()`);
}
// Known physical energy in the production owned-air solver, independently of
// authored fuel, native water, appearance, or a camera transform.
function thermalPulseFixture(resolution,nativeDt){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:false});
  if(!gl || !gl.getExtension('EXT_color_buffer_float'))throw Error('Float WebGL pulse fixture unavailable');
  const owned=[],W=720,H=400;
  function target(){
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,128,128,0,gl.RGBA,gl.FLOAT,new Float32Array(128*128*4));
    const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    const t={texture,fbo,width:128,height:128};owned.push(t);return t;
  }
  function pair(){return{width:128,height:128,read:target(),write:target(),swap(){const t=this.read;this.read=this.write;this.write=t;}};}
  const vao=gl.createVertexArray(),vertices=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const bridge={gl,canvas,velocity:pair(),dye:pair(),obstacle:target(),wetActive:false,draw(t){gl.bindVertexArray(vao);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.viewport(0,0,t.width,t.height);gl.drawArrays(gl.TRIANGLES,0,6);}};
  let hook,model;const fluid={setGasTransport(value){hook=value;return bridge;}};
  function sample(){
    model.capture();const s=model.snapshot(),stats=model.stats();let heat=0,weightedY=0;
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const i=y*s.width+x;if(s.solid[i])continue;const e=1.204*1005*s.carrierVolumeM3[i]*Math.max(0,s.temperatureK[i]-293.15);heat+=e;weightedY+=e*(y+.5)*H/s.height*s.metresPerPixel;}
    return{stats,heatJ:heat,centroidYMetres:weightedY/Math.max(heat,1e-20)};
  }
  try{
    model=WSSOxygen.create({fluid,width:W,height:H,scaleWidth:720,resolution,source:{x:352,y:280,width:16,height:16}});
    model.setBurnerEnabled(false);model.prepare({sourceC:20,smothered:false});hook(nativeDt,bridge);
    model.addGasHeat({x:312,y:264,width:96,height:32},1);hook(nativeDt,bridge);const before=sample();
    const targetPhysical=before.stats.physicalSeconds+.5;
    while(model.stats().physicalSeconds<targetPhysical){hook(nativeDt,bridge);model.capture();}
    const after=sample();return{resolution,nativeDt,before,after,riseMetres:before.centroidYMetres-after.centroidYMetres,glError:gl.getError()};
  }finally{
    model?.destroy();for(const t of owned){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}gl.deleteBuffer(vertices);gl.deleteVertexArray(vao);gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
function save(){fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({phase,diagnostic,sourceSHA256,checks,reports,errors},null,2)+'\n');}
async function cleanup(){
  for(const p of pending.values())clearTimeout(p.timer);pending.clear();try{socket?.close();}catch{}
  server.close();
  if(child && child.exitCode===null && child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(force);}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.on('SIGINT',async()=>{save();await cleanup();process.exit(130);});
process.on('SIGTERM',async()=>{save();await cleanup();process.exit(143);});
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  child=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let debug;for(let i=0;i<150;i++){try{debug=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(debug)break;await delay(100);}assert(debug,'owned browser starts');
  const tab=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page');socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=chimney-draw`});
  await until('!!window.__toy && __toy.machineState()?.ready && !!__toy.oxygen?.() && !__toy.stats().loading','ordinary real-host combustion boot');
  if(phase==='all'||phase==='cold')for(const id of ['candle-in-jar','chimney-draw','douse-fire','fire-brigade'])await cold(id);
  if(phase==='all'||phase==='plumes')for(const id of ['candle-in-jar','chimney-draw','douse-fire','fire-brigade','slime-sauna','oil-slick-fire']){
    await construct(id,id==='candle-in-jar'?{opened:true}:{});await evaluate('__toy.pause(false)');await advance(6);const r=await capture(id+'-burning-locality');
    check(id+' hot air rises through its actual unobstructed path',r.hotAirCells>8 && r.hotAirWeightedVy<-.005 && r.hotRisingFlux>r.hotDescendingFlux && r.maxTemperatureK>294);
    check(id+' remote ambient is much quieter than the fire plume',r.far.cells>64 && r.far.rms<Math.max(.03,.4*r.plume.rms));
  }
  if(phase==='all'||phase==='topology'){
    await construct('candle-in-jar');await evaluate('__toy.pause(false)');await advance(8);
    await evaluate('__toy.oxygen().setBurnerEnabled(false);__toy.oxygen().capture();true');await advance(.5);
    const hot=await capture('candle-hot-before-lid-transitions'),consumed=hot.oxygen.oxygenConsumedKg;
    check('topology fixture retains actual finite stored air heat',hot.sensibleHeatJ>1 && hot.maxTemperatureK>294 && hot.oxygen.heatReleaseW===0);
    for(let cycle=0;cycle<3;cycle++)for(const action of ['open','close']){
      await clickPrimary();await advance(5);const moved=await capture('candle-hot-lid-'+action+'-'+cycle);
      check('lid transition retains finite nonnegative thermal energy',Number.isFinite(moved.oxygen.airSensibleHeatJ) && moved.oxygen.airSensibleHeatJ>=0 && moved.minTemperatureK>=293.149);
      check('lid motion cannot create new oxygen reaction',moved.oxygen.oxygenConsumedKg===consumed && moved.oxygen.heatReleaseW===0);
    }
  }
  if(phase==='all'||phase==='decay'){
    await construct('chimney-draw');await evaluate('__toy.pause(false)');await advance(8);const hot=await capture('chimney-before-reaction-off');
    await evaluate('__toy.oxygen().setBurnerEnabled(false)');await advancePhysical(10);const first=await capture('chimney-ten-physical-seconds-after-off');await advancePhysical(20);const late=await capture('chimney-thirty-physical-seconds-after-off');
    check('reaction-off adds no chemical energy',late.oxygen.oxygenConsumedKg===first.oxygen.oxygenConsumedKg && late.oxygen.heatReleaseW===0);
    check('finite hot air cools or leaves the open chamber',late.sensibleHeatJ<hot.sensibleHeatJ);
    check('unforced plume momentum decays after heat drains',late.kineticEnergyJ<hot.kineticEnergyJ && late.near.rms<hot.near.rms);
  }
  if(phase==='all'||phase==='pour'){
    await construct('douse-fire');
    // This fixture isolates mechanical water displacement. A 900 C hearth
    // retains17600 J after reaction is disabled and can keep making paid steam.
    await evaluate('(()=>{const state=new Float32Array(24);state[0]=20;state[3]=-1;state[19]=.209;__toy.liquid().device.queue.writeBuffer(__toy.fire().heatState().buffer,0,state);__toy.oxygen().setBurnerEnabled(false);__toy.oxygen().prepare({sourceC:20,smothered:false});__toy.clearSmoke();__toy.pause(false);})()');
    await advance(1);const before=await capture('water-wake-before');
    check('water-only fixture has a genuinely cold native hearth',before.fire.sourceC===20 && before.fire.initialHeatJ===0 && before.fire.sourceHeatJ===0 && !before.fire.burning);
    const point=await primaryPoint();await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    try{await advance(2);}finally{await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});}
    const pulse=await capture('water-wake-local-pulse');await advancePhysical(20);const late=await capture('water-wake-twenty-physical-seconds-after-release');
    check('native poured water makes a real local air wake',pulse.kineticEnergyJ>before.kineticEnergyJ+1e-10 && pulse.near.rms>before.near.rms+.001);
    check('pouring does not create a remote uniform wind',pulse.far.rms<Math.max(.03,.4*pulse.near.rms));
    check('released water wake loses kinetic energy as parcels settle',late.kineticEnergyJ<pulse.kineticEnergyJ);
    check('cold water wake has no hidden thermal energy input',late.oxygen.chemicalHeatJ===0 && late.oxygen.airExtraHeatJ===0 && late.fire.sourceToWaterJ===0);
  }
  if(phase==='all'||phase==='presets')for(const id of ['candle-in-jar','chimney-draw','douse-fire','fire-brigade','slime-sauna','oil-slick-fire']){
    const plain=await presetFixture(id,'copperhead','default'),styled=await presetFixture(id,'dragon','frenzy');
    check(id+' display presets cannot change physical flow, oxygen or thermal fields',JSON.stringify(plain)===JSON.stringify(styled));
  }
  if(phase==='locality'){
    await construct('douse-fire');await evaluate('__toy.pause(false)');const start=performance.now();await advance(25);
    const desktop=await capture('desktop-douse-twenty-five-native-seconds');
    reports.push({name:'desktop-production-performance',wallSeconds:(performance.now()-start)/1000,nativeSeconds:desktop.oxygen.seconds,physicalSeconds:desktop.oxygen.physicalSeconds,hostFps:desktop.host.fps,
      farRmsWorldPxPerNativeSecond:desktop.far.rms*desktop.secondsPerSimulationSecond/desktop.metresPerPixel});
    check('mature douse plume keeps far air quiet',desktop.far.cells>64 && desktop.far.rms<Math.max(.03,.4*desktop.plume.rms));
    await screenshot('desktop-douse-twenty-five-native-seconds');
    await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await evaluate('__toy.resize();true');
    await capture('mobile-douse-same-physical-state');await screenshot('mobile-douse-twenty-five-native-seconds');
  }
  if(phase==='convergence'){
    await evaluate('__toy.pause(true)');const pulses=[];
    for(const [resolution,dt] of [[64,1/60],[128,1/60],[128,1/120],[128,1/20]]){
      const r=await evaluate('('+thermalPulseFixture.toString()+')('+resolution+','+dt+')');pulses.push(r);reports.push({name:'physical-heat-pulse',...r});
      check('pulse fixture has no GL error',r.glError===0);
      check('one-joule pulse is the only air energy input',Math.abs(r.after.stats.airExtraHeatJ-1)<1e-5 && r.after.stats.chemicalHeatJ===0);
      check('physical pulse heat ledger conserves energy',Math.abs(r.after.stats.airHeatResidualJ)<.001);
      check('thermal pulse raises real hot air',r.riseMetres>.0005);
      check('pulse pressure meets its dimensioned convergence target',r.after.stats.projectionConverged && r.after.stats.maxDivergencePerSecond<=.0801);
      check('pulse pressure projection adds no face kinetic energy',r.after.stats.projectionOutputKineticEnergyJ<=r.after.stats.projectionInputKineticEnergyJ+Math.max(1e-8,r.after.stats.projectionInputKineticEnergyJ*1e-5));
    }
    const [coarse,fine,smallDt,liveDt]=pulses;
    check('timestep refinement preserves thermal centroid rise',Math.abs(smallDt.riseMetres-fine.riseMetres)<Math.max(.001,Math.abs(fine.riseMetres)*.15));
    check('spatial refinement preserves thermal centroid rise',Math.abs(coarse.riseMetres-fine.riseMetres)<Math.max(.003,Math.abs(fine.riseMetres)*.3));
    check('large live timestep preserves thermal centroid rise',Math.abs(liveDt.riseMetres-fine.riseMetres)<Math.max(.001,Math.abs(fine.riseMetres)*.15));
  }
  check('no runtime or GPU errors',errors.length===0);
  console.log((diagnostic?'DIAGNOSTIC COMPLETE':'PASS')+' fire airflow phase '+phase+'; failed checks '+checks.filter(c=>!c.pass).length+'; '+output);
}finally{save();await cleanup();}
