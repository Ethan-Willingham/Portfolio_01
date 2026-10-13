// Cross-demo native water and bubble regression. Run GPU tests exclusively.
// Owns and closes Chrome for Testing; captures stay outside the repository.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-bubble-demos-review';
const port = Number(process.env.PORT || 8484), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const sourcePaths=['archive/water-smoke-slime/water-smoke-slime.html','js/wss-bubbles.js','js/water-machines-scenes.js','js/water-smoke-slime.js','js/liquid-air-wgpu.js','js/liquid-wgpu.js','js/wss-drafts-pressure.js'];
const frozen=new Map(sourcePaths.map(p=>[path.join(root,p),fs.readFileSync(path.join(root,p))]));
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(frozen.get(path.join(root,p))).digest('hex')]));
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = frozen.get(file) || fs.readFileSync(file);
    if(globalThis.cavityReference && file===path.join(root,'js/wss-drafts-pressure.js'))
      data=data.toString().replace('d.settings.phaseChange=true;d.entrainedAir={entrainedArea:200};','');
    const loadedHash=createHash('sha256').update(data).digest('hex');
    if(file===path.join(root,'js/wss-bubbles.js'))data=Buffer.concat([Buffer.from(data),Buffer.from('\nwindow.__demoBubbleHash='+JSON.stringify(loadedHash)+';\n')]);
    if(file===path.join(root,'js/wss-drafts-pressure.js'))data=Buffer.concat([Buffer.from(data),Buffer.from('\nwindow.__demoPressureHash='+JSON.stringify(loadedHash)+';\n')]);
    if (file === path.join(root, 'js/water-smoke-slime.js')) {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = source.slice(0, end) + `
      window.__demoTest = function(source) { return eval(source); };
      userPaused = true; syncRunning();
      ` + source.slice(end);
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(data);
  } catch { response.writeHead(404).end(); }
});
let chrome, socket, sequence = 0;
const pending = new Map(), errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup() {
  try { socket?.close(); } catch {}
  server.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    const force = setTimeout(() => chrome.kill('SIGKILL'), 2000);
    await exited;
    clearTimeout(force);
  }
  for (const p of pending.values()) clearTimeout(p.timer);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const inside = source => evaluate(`__demoTest(${JSON.stringify(source)})`);
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dump, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function navigate(width, height, query = '?scene=falls', mobile = false, deviceScaleFactor = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
  const priorOrigin=await evaluate('performance.timeOrigin');
  query+=(query.includes('?')?'&':'?')+'testLoad='+sequence;
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/archive/water-smoke-slime/water-smoke-slime.html${query}` });
  for (let i = 0; i < 120; i++) {
    if (await evaluate(`performance.timeOrigin!==${priorOrigin} && !!window.__toy && !__toy.stats().loading && __toy.stats().waterState !== 'booting'`)) break;
    await sleep(100);
  }
  await sleep(1000);
  console.log('BOOT', width, height, JSON.stringify(await evaluate('__toy.stats()')));
}



async function inspect(){return evaluate(`(async()=>{
 const L=__toy.liquid(),A=__toy.airModel(),B=__toy.bubbles()||__toy.entrainedAir(),n=L.uploadedCount,d=L.device,s=A?.enabled?await A.capture():null;
 const nB=B?B.buffers.position.size/16:0,buf=d.createBuffer({size:n*20+nB*48+128,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{
 const e=d.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,buf,0,n*16);e.copyBufferToBuffer(L.buf.flag,0,buf,n*16,n*4);
 if(B){e.copyBufferToBuffer(B.buffers.position,0,buf,n*20,nB*16);e.copyBufferToBuffer(B.buffers.material,0,buf,n*20+nB*16,nB*16);e.copyBufferToBuffer(B.buffers.witness,0,buf,n*20+nB*32,nB*16);e.copyBufferToBuffer(B.buffers.ledger,0,buf,n*20+nB*48,128);}d.queue.submit([e.finish()]);await buf.mapAsync(GPUMapMode.READ);
 const bytes=buf.getMappedRange(),pos=new Float32Array(bytes,0,n*4),flags=new Uint32Array(bytes,n*16,n),bp=new Float32Array(bytes,n*20,nB*4),mat=new Float32Array(bytes,n*20+nB*16,nB*4),witness=new Float32Array(bytes,n*20+nB*32,nB*4),ledger=B?Array.from(new Int32Array(bytes,n*20+nB*48,32)):null;
 const w=__toy.world(),walls=__demoTest('Array.from(walls,(v,i)=>v || (valveSeats && valveSeats[i]) || 0)'),bins=new Map(),water=[];
 for(let i=0;i<n;i++)if(!(flags[i]&160) && (flags[i]&3)===0){const x=pos[i*4],y=pos[i*4+1],key=Math.floor(x/4)+','+Math.floor(y/4);if(!bins.has(key))bins.set(key,[]);bins.get(key).push([x,y]);water.push([x,y]);}
 function wet(x,y){const bx=Math.floor(x/4),by=Math.floor(y/4);for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)for(const q of bins.get((bx+xx)+','+(by+yy))||[])if(Math.hypot(q[0]-x,q[1]-y)<3.6)return true;return false;}
 const step=2,gw=Math.ceil(w.w/step),gh=Math.ceil(w.h/step),mask=new Uint8Array(gw*gh);
 for(let j=0;j<gh;j++)for(let i=0;i<gw;i++){const x=(i+.5)*step,y=(j+.5)*step;mask[j*gw+i]=walls[Math.floor(y/w.tile)*w.cols+Math.floor(x/w.tile)]?2:wet(x,y)?0:1;}
 const holes=[];
 for(let k=0;k<mask.length;k++)if(mask[k]===1){const stack=[k];mask[k]=3;let area=0,sx=0,sy=0,minX=Infinity,minY=Infinity,maxX=0,maxY=0,edge=false,topWet=0,topSolid=0,topDry=0,gas=0,unowned=0,vapor=0,wall=0;
 while(stack.length){const t=stack.pop(),i=t%gw,j=Math.floor(t/gw),x=(i+.5)*step,y=(j+.5)*step;area+=step*step;sx+=x;sy+=y;minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);edge=edge||i===0||j===0||i===gw-1||j===gh-1;
 if(s){const c=Math.floor(y/s.cellSize)*s.width+Math.floor(x/s.cellSize),bits=new Uint32Array(s.cells.buffer);gas+=Number(bits[c*8+3]===2);unowned+=Number(s.labels[c*2]===4294967295);vapor+=Number(s.historyInts[c*8+6]===1);}
 for(const [ii,jj]of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]])if(ii>=0&&jj>=0&&ii<gw&&jj<gh){const q=jj*gw+ii;if(mask[q]===1){mask[q]=3;stack.push(q);}else if(mask[q]===2)wall++;}
 if(j>0){const m=mask[(j-1)*gw+i];topWet+=Number(m===0);topSolid+=Number(m===2);}
 }
 if(!edge && area>=12 && area<=2000 && topWet>2 && topWet>topSolid)holes.push({area,x:sx/(area/4),y:sy/(area/4),minX,minY,maxX,maxY,topWet,topSolid,gas,unowned,vapor,wall});
 }
 const bubbles=[];if(B)for(let i=0;i<ledger[4];i++)if(mat[i*4+2]===1){const x=bp[i*4],y=bp[i*4+1],r=mat[i*4+1];let wall=0;for(let j=0;j<16;j++){const a=j*Math.PI/8,xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r;wall+=Number(!!walls[Math.floor(yy/w.tile)*w.cols+Math.floor(xx/w.tile)]);}bubbles.push({slot:i,birth:witness[i*4+1],birthY:witness[i*4+2],x,y,radius:r,vx:bp[i*4+2],vy:bp[i*4+3],wall,amount:mat[i*4]/A.settings.volumeScale});}
 return {clock:L.simulationClock,count:n,water:water.length,finite:Array.from(pos).every(Number.isFinite),scale:A?.settings.volumeScale,settings:s?.settings,phase:s?.phaseLedger,gas:s?.ledger,pockets:s?.pockets,ledger,bubbles,holes};
 }finally{buf.unmap();buf.destroy();}
})()`);}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  chrome = spawn(`${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
    '--headless=new', '--enable-unsafe-webgpu', '--use-angle=metal', '--disable-gpu-sandbox', '--no-first-run',
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
  ], { stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 150; i++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p => p.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (endpoint) break;
    await sleep(100);
  }
  assert.ok(endpoint, 'Chrome for Testing starts');
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p?.timer); m.error ? p?.reject(m.error) : p?.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description));
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled',{cacheDisabled:true});





const cases=[];
await navigate(1440,900,'?scene=air-hose&paused=1&lab=1');
const inventory=await evaluate(`(async()=>{const out=[];for(const e of WSSMachineRegistry.list())try{const m=await WSSMachineRegistry.load(e.id),d=m.make({...e.world,tile:8},{});out.push({id:e.id,title:e.title,settings:d.settings,water:d.initial.length,bubbles:!!d.bubbles,entrainedAir:d.entrainedAir||null,body:!!(d.membrane||d.divers||d.slider||d.draftRig),steam:!!d.steam});}catch(error){out.push({id:e.id,error:String(error)});}return out;})()`);
assert(inventory.every(d=>!d.error),'All registered apparatus definitions load');
assert(inventory.find(d=>d.id==='glugging-bottle').entrainedAir?.entrainedArea===200);
assert(inventory.filter(d=>d.body||d.steam).every(d=>!d.entrainedAir),'Dedicated body and vapor companions retain ownership');
fs.writeFileSync(path.join(dump,'inventory.json'),JSON.stringify(inventory,null,2));
if(process.env.AUDIT==='1'){
 // Observational survey. Body motion and thermal mechanisms are outside
 // this native-water-only path; their declared pressure settings are inventoried.
 const ids=(process.env.SCENES||'air-hose,aquarium-bubbler,air-lift-pump,ringing-bubbles,cup,siphon,heron,glugging-bottle,upside-down-tank,mariotte-bottle,sewer-gas-trap,roman-inverted-siphon,water-tower').split(',');
 for(const id of ids){
  globalThis.cavityReference=false;
  await navigate(1440,900,'?scene='+id+'&paused=1&lab=1');
  if(['siphon','heron'].includes(id))await evaluate('__toy.machine('+JSON.stringify(id)+',{open:true})');
  if(id==='upside-down-tank')await evaluate('__toy.machinePrimary()');
  const rows=[];
  for(let host=0;host<=30;host+=5){
   if(host)await evaluate('__toy.liquid().bench(150,1/30)');
   const row=await inspect();row.hostSeconds=host;rows.push(row);assert(row.finite);
   console.log('AUDIT',id,host,JSON.stringify({holes:row.holes,phase:row.phase}));
  }
  await inside('drawLiquidToy()');await screenshot('audit-'+id);cases.push({id,rows});
  fs.writeFileSync(path.join(dump,'audit.json'),JSON.stringify({sourceHashes,inventory,cases,errors},null,2));
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS finite native-water audit; cavity observations require scene-specific interpretation');
}else{
function check(row,initial){
 assert(row.finite,'Native positions remain finite');
 assert.equal(row.count,initial.count,'No water allocation changes');
 assert.equal(row.water,initial.water,'Every active water parcel remains');
 assert.equal(row.phase.retainedLiquidCells,0,'No empty cells retained as liquid');
 const l=row.ledger;
 assert(l,'Bubble companion is enabled');
 assert.equal(l[0]+l[21]-l[1]-l[2]-l[3],0,'Exact finite gas ledger');
 for(const index of [8,9,13])assert.equal(l[index],0,'No gas underflow, nonfinite state or capacity refusal');
 assert(Math.abs(row.gas.balanceError+l[23]/row.scale)<.01,'Native gas includes the coupled amount once');
 assert(row.bubbles.every(b=>b.wall===0),'Every bubble stays outside native walls');
}
for(const id of ['air-hose','aquarium-bubbler','air-lift-pump','ringing-bubbles']){
 globalThis.cavityReference=false;
 await navigate(1440,900,'?scene='+id+'&paused=1');
 assert.equal(await evaluate('__demoBubbleHash'),sourceHashes['js/wss-bubbles.js'],'The tested collision module is served');
 const rows=[await inspect()];
 await evaluate('__toy.liquid().bench(60,1/30)');rows.push(await inspect());
 await evaluate('__toy.bubbles().toggle()');
 for(let i=0;i<4;i++){await evaluate('__toy.liquid().bench(90,1/30)');rows.push(await inspect());}
 rows.forEach(r=>check(r,rows[0]));
 const l=rows.at(-1).ledger;
 assert(l[0]>0,'The real hose admits gas');assert.equal(l[21],0,'No natural capture is added to a hose');
 assert.equal(l[1],l[0],'All admitted gas exits after the source stops');
 assert.equal(rows.at(-1).bubbles.length,0,'No injected bubble remains underwater');
 await inside('drawLiquidToy()');await screenshot(id+'-cleared');
 cases.push({id,rows});console.log('PASS source-off clearing',id,rows.at(-1).clock);
}
for(const c of [
 {name:'bottle-reference',reference:true,seed:17,width:1440,height:900},
 {name:'bottle-17',seed:17,width:1440,height:900},
 {name:'bottle-42',seed:42,width:1440,height:900},
 {name:'bottle-phone',seed:17,width:844,height:390,mobile:true},
 {name:'bottle-vented',seed:17,width:1440,height:900,vented:true}
]){
 globalThis.cavityReference=!!c.reference;
 await navigate(c.width,c.height,'?scene=glugging-bottle&paused=1',!!c.mobile);
 const source=frozen.get(path.join(root,'js/wss-drafts-pressure.js')).toString();
 const served=c.reference?source.replace('d.settings.phaseChange=true;d.entrainedAir={entrainedArea:200};',''):source;
 assert.equal(await evaluate('__demoPressureHash'),createHash('sha256').update(served).digest('hex'),'The intended bottle variant is served');
 await evaluate('__toy.machine("glugging-bottle",'+JSON.stringify({seed:c.seed,vented:!!c.vented})+')');await evaluate('__toy.pause(true)');
 const rows=[];
 for(let host=0;host<=30;host+=.5){
  if(host)await evaluate('__toy.liquid().bench(15,1/30)');
  const r=await inspect();r.hostSeconds=host;rows.push(r);
  if(!c.reference)check(r,rows[0]);
  else{assert(r.finite);assert.equal(r.water,rows[0].water);assert.equal(r.gas.balanceError,0);assert.equal(r.ledger,null,'The reference has no bubble companion');}
  fs.writeFileSync(path.join(dump,'progress.json'),JSON.stringify({sourceHashes,cases,current:{...c,rows}},null,2));
 }
 if(!c.reference && !c.vented){
  assert(rows.some(r=>r.bubbles.some(b=>b.birthY>160 && b.birthY-b.y>70 && r.clock-b.birth<2.5)),
   'Compact gas actually rises through the bottle within 2.5 simulation seconds: '+c.name);
  assert(rows.filter(r=>r.hostSeconds<=10).some(r=>r.pockets.some(p=>p.amount>1000)),'The sealed headspace forms a native pressure pocket before the bottle empties');
  assert(rows.at(-1).ledger[21]>0,'The bottle captures actual finite gas');
 }
 await inside('drawLiquidToy()');await screenshot(c.name);
 cases.push({...c,rows});console.log('PASS bottle gas and water',c.name);
}
assert.equal(errors.length,0,JSON.stringify(errors));
fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({sourceHashes,inventory,cases,errors},null,2));
console.log('PASS four bubble supplies, stopped-source clearing, native terrain contact, sealed/vented bottle gas, three view/seed cases, finite gas and water');
}
}finally{await cleanup();}
