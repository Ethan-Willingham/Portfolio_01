// Actual WebGPU source-tank cavity regression for the small Heron fountain.
// Owns and closes Chrome for Testing; captures stay outside the repository.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = process.env.DUMP || '/tmp/water-cavity-review';
const port = Number(process.env.PORT || 8473), debug = port + 1000;
fs.mkdirSync(dump, { recursive: true });
const profile = fs.mkdtempSync('/tmp/water-demo-browser-');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const sourcePaths=['archive/water-smoke-slime/water-smoke-slime.html','js/wss-bubbles.js','js/water-machines-scenes.js','js/water-smoke-slime.js','js/liquid-air-wgpu.js','js/liquid-wgpu.js'];
const frozen=new Map(sourcePaths.map(p=>[path.join(root,p),fs.readFileSync(path.join(root,p))]));
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(frozen.get(path.join(root,p))).digest('hex')]));
const server = createServer((request, response) => {
  try {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    let data = frozen.get(file) || fs.readFileSync(file);
    if(globalThis.cavityReference && file===path.join(root,'js/water-machines-scenes.js'))
      data=data.toString().replace('collapseEmptyCells:true,vaporClosure:true','collapseEmptyCells:false,vaporClosure:false');
    if(globalThis.cavityReference && file===path.join(root,'js/wss-bubbles.js'))
      data=data.toString().replace('if(nativeCollision){\n      code=code.replace', 'if(false){\n      code=code.replace')
        .replace("if(nativeCollision)['admit'", "if(false)['admit'");
    const loadedHash=createHash('sha256').update(data).digest('hex');
    if(file===path.join(root,'js/wss-bubbles.js'))data=Buffer.concat([Buffer.from(data),Buffer.from('\nwindow.__cavityBubbleHash='+JSON.stringify(loadedHash)+';\n')]);
    if(file===path.join(root,'js/water-machines-scenes.js'))data=Buffer.concat([Buffer.from(data),Buffer.from('\nwindow.__cavitySceneHash='+JSON.stringify(loadedHash)+';\n')]);
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
 const L=__toy.liquid(),A=__toy.airModel(),B=__toy.entrainedAir(),n=L.uploadedCount,d=L.device,s=await A.capture();
 const b=d.createBuffer({size:n*16+256*32+128,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const e=d.createCommandEncoder();e.copyBufferToBuffer(L.buf.pos,0,b,0,n*16);e.copyBufferToBuffer(B.buffers.position,0,b,n*16,256*16);e.copyBufferToBuffer(B.buffers.material,0,b,n*16+256*16,256*16);e.copyBufferToBuffer(B.buffers.ledger,0,b,n*16+256*32,128);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);
 const a=b.getMappedRange(),p=new Float32Array(a,0,n*4),bp=new Float32Array(a,n*16,256*4),m=new Float32Array(a,n*16+256*16,256*4),l=new Int32Array(a,n*16+256*32,32),r=__toy.machineState().definition.measure.source,dx=s.cellSize,gw=s.width;
 const kinds=new Uint32Array(s.cells.buffer),pockets=s.pockets.map(q=>{let x=0,y=0,area=0,cells=0;for(let c=0;c<s.width*s.height;c++)if(s.labels[c*2]===q.root+1){const v=(1-s.cells[c*8])*(1-s.geometry[c*8])*dx*dx;x+=((c%gw)+.5)*dx*v;y+=(Math.floor(c/gw)+.5)*dx*v;area+=v;cells++;}return {...q,x:x/area,y:y/area,cells,area};});
 const bubbles=[];for(let i=0;i<l[4];i++)if(m[i*4+2]===1){const x=bp[i*4],y=bp[i*4+1],radius=m[i*4+1],c=Math.floor(y/dx)*gw+Math.floor(x/dx);let bad=0;for(let j=0;j<8;j++){const a=j*Math.PI/4,cc=Math.floor((y+Math.sin(a)*radius)/dx)*gw+Math.floor((x+Math.cos(a)*radius)/dx);if(s.geometry[cc*8]>.001)bad++;}bubbles.push({slot:i,x,y,vx:bp[i*4+2],vy:bp[i*4+3],radius,amount:m[i*4]/A.settings.volumeScale,root:m[i*4+3],bad,kind:kinds[c*8+3],fraction:s.cells[c*8],pressure:s.history[c*8]});}
 const bins=new Map();for(let i=0;i<n;i++){const x=p[i*4],y=p[i*4+1];if(x<r.x-5||x>r.x+r.width+5||y<r.y-5||y>r.y+r.height+5)continue;const k=Math.floor(x/4)+','+Math.floor(y/4);if(!bins.has(k))bins.set(k,[]);bins.get(k).push([x,y]);}
 const walls=__demoTest('({cols:gridW,tile:TILE,data:Array.from(walls)})');
 const loX=r.x+9,loY=r.y+9,w=Math.floor(r.width-18),h=Math.floor(r.height-18),dry=new Uint8Array(w*h);let empty=0;
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){const x=loX+i+.5,y=loY+j+.5,c=Math.floor(y/dx)*gw+Math.floor(x/dx);if(walls.data[Math.floor(y/walls.tile)*walls.cols+Math.floor(x/walls.tile)]){dry[j*w+i]=2;continue;}let near=false;const bx=Math.floor(x/4),by=Math.floor(y/4);for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)for(const q of bins.get((bx+xx)+','+(by+yy))||[])if(Math.hypot(q[0]-x,q[1]-y)<3.6)near=true;if(!near){dry[j*w+i]=1;empty++;}}
 const voids=[];for(let k=0;k<dry.length;k++)if(dry[k]===1){const stack=[k],members=[];dry[k]=3;let edge=false,x=0,y=0,gas=0,vapor=0,unresolved=0;while(stack.length){const t=stack.pop(),i=t%w,j=Math.floor(t/w);members.push(t);x+=loX+i+.5;y+=loY+j+.5;edge=edge||i===0||i===w-1||j===0||j===h-1;const c=Math.floor((loY+j+.5)/dx)*gw+Math.floor((loX+i+.5)/dx),root=s.labels[c*2];gas+=Number(kinds[c*8+3]===2);vapor+=Number(s.historyInts[c*8+6]===1);unresolved+=Number(root===4294967295);for(const [ii,jj]of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]])if(ii>=0&&ii<w&&jj>=0&&jj<h&&dry[jj*w+ii]===1){dry[jj*w+ii]=3;stack.push(jj*w+ii);}}if(members.length>=3)voids.push({area:members.length,x:x/members.length,y:y/members.length,edge,gas,vapor,unresolved});}
 const submerged=voids.filter(v=>!v.edge && v.y>=r.y+r.height*.5),roiArea=submerged.reduce((sum,v)=>sum+v.area,0);
 const finite=Array.from(p).every(Number.isFinite)&&s.pockets.every(q=>[q.pressure,q.amount,q.volume].every(Number.isFinite));
 const ledger=Array.from(l);b.unmap();b.destroy();return {clock:L.simulationClock,source:r,count:n,bubbles,voids,pockets,gas:s.ledger,phase:s.phaseLedger,ledger,finite,submerged,roiArea,scale:A.settings.volumeScale,settings:s.settings};
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



 const cases=[];
 for(const c of [
  {name:'reference',reference:true,width:1440,height:900,seed:17,dt:1/30},
  {name:'desktop-30',reference:false,width:1440,height:900,seed:17,dt:1/30},
  {name:'desktop-60',reference:false,width:1440,height:900,seed:42,dt:1/60},
  {name:'desktop-third-seed',reference:false,width:1440,height:900,seed:913,dt:1/30},
  {name:'phone-30',reference:false,width:844,height:390,seed:17,dt:1/30,mobile:true}
 ]){
  if(process.env.QUICK==='1' && !['reference','desktop-30'].includes(c.name))continue;
  globalThis.cavityReference=c.reference;
  await navigate(c.width,c.height,'?scene=heron-air-smoke&paused=1',!!c.mobile);
  const expectedBubble=frozen.get(path.join(root,'js/wss-bubbles.js')).toString(),expectedScene=frozen.get(path.join(root,'js/water-machines-scenes.js')).toString();
  const bubble=c.reference?expectedBubble.replace('if(nativeCollision){\n      code=code.replace','if(false){\n      code=code.replace').replace("if(nativeCollision)['admit'","if(false)['admit'"):expectedBubble;
  const scene=c.reference?expectedScene.replace('collapseEmptyCells:true,vaporClosure:true','collapseEmptyCells:false,vaporClosure:false'):expectedScene;
  assert.equal(await evaluate('__cavityBubbleHash'),createHash('sha256').update(bubble).digest('hex'));
  assert.equal(await evaluate('__cavitySceneHash'),createHash('sha256').update(scene).digest('hex'));
  await evaluate('__toy.machine("heron-air-smoke",{seed:'+c.seed+'})');await evaluate('__toy.pause(true)');
  const rows=[];
  for(let host=0;host<=60;host+=2){
   if(host)await evaluate('__toy.liquid().bench('+Math.round(2/c.dt)+','+c.dt+')');
   const row=await inspect();row.hostSeconds=host;rows.push(row);
   assert(row.finite,'Finite native state');assert.equal(row.count,rows[0].count,'Water is conserved');
   const l=row.ledger;assert.equal(l[0]+l[21]-l[1]-l[2]-l[3],0,'Every modeled bubble retains or releases its finite gas');assert.equal(l[8],0,'No invalid gas owner handoff');assert.equal(l[9],0);assert.equal(l[13],0);
   assert(Math.abs(row.gas.balanceError+l[23]/row.scale)<.01);
   console.log('CAVITIES',c.name,host,JSON.stringify({clock:row.clock,area:row.roiArea,holes:row.submerged,retained:row.phase.retainedLiquidCells,bubbles:row.bubbles.filter(b=>b.y>=row.source.y+row.source.height*.5 && b.x>row.source.x && b.x<row.source.x+row.source.width)}));
   fs.writeFileSync(path.join(dump,'progress.json'),JSON.stringify({sourceHashes,cases,current:{...c,rows}},null,2));
   if(host%10===0){await inside('drawLiquidToy()');await screenshot(c.name+'-'+host);}
  }
  cases.push({...c,rows});
 }
 const ref=cases[0].rows.filter(r=>r.hostSeconds>=20),mean=rows=>rows.reduce((s,r)=>s+r.roiArea,0)/rows.length;
 assert(ref.filter(r=>r.roiArea>0).length>=5 && ref.some(r=>r.roiArea>=25),
  'The release repeatedly reproduces visible cavities in the right-hand water');
 assert(ref.every(r=>r.phase.retainedLiquidCells>0),
  'The released classifier persistently retains empty cells as liquid');
 for(const c of cases.slice(1)){
  const late=c.rows.filter(r=>r.hostSeconds>=20);
  assert(mean(late)<4,'The actual submerged source cavities clear, independent of rendering: '+c.name+' '+mean(late));
  assert(mean(late)<mean(ref)*.1,'At least ninety percent of the real empty source area is removed');
  assert(late.every(r=>r.phase.retainedLiquidCells===0),'A numerical cavity cannot remain labeled as liquid');
  assert(late.every(r=>r.submerged.every(v=>v.area<25)),'No large underwater cavity survives the settled run');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(path.join(dump,'report.json'),JSON.stringify({sourceHashes,cases,errors},null,2));
 console.log('PASS right-hand native source cavity lifetime, 60-second desktop/phone playback, 30/60 Hz, three seeds, water and gas inventories');
}finally{await cleanup();}
