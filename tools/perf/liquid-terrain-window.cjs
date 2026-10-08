// Check the real liquid mask and contour painters against the published source.
// Default: CPU-only bounds and invalidation checks. Add --pixels for an owned
// Chrome for Testing process and old/new Canvas pixel/clip comparisons.
// No game bundle build is needed. BASE_REF defaults to the published v28.176.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync, spawn} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const file = 'js/sluice/071-liquid-terrain-render.js';
const baseline = execFileSync('git', ['show', (process.env.BASE_REF || 'f1306c81') + ':' + file], {cwd:root, encoding:'utf8'});
const candidate = fs.readFileSync(path.join(root, file), 'utf8');
const terrain = fs.readFileSync(path.join(root, 'js/sluice/100-render-terrain.js'), 'utf8');
const collision = fs.readFileSync(path.join(root, 'js/sluice/070-collision-liquids.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('\n  }', start);
  assert(start >= 0 && end > start, 'Source function: ' + name);
  return source.slice(start, end + 4);
}
const contours = terrain.slice(terrain.indexOf('  var VOID_CONVEX_INSET'), terrain.indexOf('  function drawSurfaceVoidMouths('));
assert(contours.includes('function buildSurfaceVoidMouthPath('));
const helpers = ['tileAt', 'getTileObj'].map(n => extract(collision,n)).join('\n') +
  ['tileHash01', 'edgeWave', 'isStoneMassTile', 'isStoneRenderMassTile'].map(n => extract(terrain,n)).join('\n') + contours;
function factorySource(source) {
  return `function(document,Path2D){
    var COLS=80,TOTAL_ROWS=64,TILE=32,SKY_ROWS=4;
    var world=Array.from({length:TOTAL_ROWS},()=>Array.from({length:COLS},()=>({type:'dirt'})));
    var lightCols=COLS,lightArr=new Uint8Array(COLS*TOTAL_ROWS);lightArr.fill(1);
    var lightTune={enabled:true},bathMode=false,ORES={},SURFACE_STONE_CORNER_RADIUS=5;
    var cam={x:0,y:0},viewW=384,viewH=288,worldScale=1;
    ${helpers}
    ${source.slice(0,source.indexOf('  var liquidGLTerrainTexture'))}
    return {world,light:lightArr,
      set(p){if(p.x!==undefined)cam.x=p.x;if(p.y!==undefined)cam.y=p.y;
        if(p.width!==undefined)viewW=p.width;if(p.height!==undefined)viewH=p.height;
        if(p.scale!==undefined)worldScale=p.scale;if(p.bath!==undefined)bathMode=p.bath;
        if(p.fog!==undefined)lightTune.enabled=p.fog;},
      paint:liquidTerrainRenderMask,
      state(){return {x:cam.x,y:cam.y,w:viewW/worldScale,h:viewH/worldScale};},
      clear(){voidContourCache=[];liquidTerrainRender=null;}
    };
  }`;
}
// Real contour geometry and its occupancy cache run on the CPU here; only the
// final Canvas path recording/rasterization is replaced with inert objects.
class MockPath {
  constructor(other) {this.commands = other ? other.commands.slice() : [];}
  moveTo(...x) {this.commands.push(['M',...x]);}
  lineTo(...x) {this.commands.push(['L',...x]);}
  quadraticCurveTo(...x) {this.commands.push(['Q',...x]);}
  rect(...x) {this.commands.push(['R',...x]);}
  closePath() {this.commands.push(['Z']);}
  addPath(other) {this.commands.push(...other.commands);}
}
const noop = () => {};
const mockDocument = {createElement(){return {width:0,height:0,getContext(){return {
  setTransform:noop,clearRect:noop,save:noop,translate:noop,fillRect:noop,fill:noop,stroke:noop,restore:noop
};}};}};
function load(source, doc=mockDocument, Path=MockPath) {return new Function('return ('+factorySource(source)+');')()(doc,Path);}
function bounds(source) {
  const start = source.indexOf('    var c0 =');
  const end = source.indexOf('    // The off-map bath',start);
  assert(start >= 0 && end > start);
  return new Function('x','y','w','h','scale',
    'var cam={x,y},viewW=w,viewH=h,worldScale=scale,TILE=32,step=4;'+source.slice(start,end)+'return {c0,c1,r0,r1};');
}
function fixture(api, kind='mixed') {
  for (let r=0;r<64;r++) for (let c=0;c<80;c++) {
    let open=r<4;
    if (kind==='mixed') open ||= ((c>=3&&c<=9&&r<=10)||(r>=7&&r<=11&&c>=6&&c<=35)||
      (r>=9&&r<=18&&c>=18&&c<=29)||((r*17+c*13)%19===0&&r>5));
    if (kind==='long-wall') open ||= r>=8&&r<=12;
    if (kind==='bath') open ||= r>=18&&r<=25&&c>=21&&c<=37;
    api.world[r][c]=open?null:{type:(c%3===0?'stone':'dirt')};
  }
  api.light.fill(1);api.set({bath:false,fog:true});api.clear();
}
const A=load(baseline),B=load(candidate);
const oldBounds=bounds(baseline),newBounds=bounds(candidate);
let covered=0;
for (const [w,h] of [[384,288],[960,461.462],[960,630.9517],[1512,982],[844,390]]) {
  for(const scale of [.65,1,1.25,2,3.333333]) for(const tile of [-97,-4,-1,0,1,4,15,79]) {
    let size;
    for(const phase of [-.001,0,.001,.37,31.999,32,63.5,95.999,127.999,128,128.001]) {
      const x=tile*128+phase,y=tile*128-phase;
      const old=oldBounds(x,y,w,h,scale),next=newBounds(x,y,w,h,scale);
      assert(next.c0<=old.c0 && next.c1>=old.c1 && next.r0<=old.r0 && next.r1>=old.r1,'Preserve old halo at '+[x,y,w,h,scale]);
      const s=[next.c1-next.c0+1,next.r1-next.r0+1];
      if(size)assert.deepEqual(s,size,'Panning cannot resize the mask');size=s;covered++;
    }
  }
}
fixture(B);
B.set({x:128.001,y:128.001});let m=B.paint(),revision=m.revision,pathBefore=m.path;
for(const phase of [0.2,1,31.999,32,63.999,64,127.999]) {
  B.set({x:128+phase,y:128+phase});assert.equal(B.paint().revision,revision,'Sub-window camera movement reuses mask');
}
B.set({x:128.001,y:128.001});
B.world[7][12]=null;assert.equal(B.paint().revision,revision,'Unchanged occupancy reuses path');
B.world[6][12]=null;assert(B.paint().revision>revision,'Mining immediately invalidates');revision=B.paint().revision;
B.light[6*80+12]=0;assert(B.paint().revision>revision,'Discovery removal immediately invalidates');revision=B.paint().revision;
B.light[6*80+12]=1;assert(B.paint().revision>revision,'Newly discovered air immediately invalidates');revision=B.paint().revision;
B.world[4][12]=null;assert(B.paint().revision>revision,'Mined surface mouth immediately invalidates');
assert(B.paint().openPath.commands.length>0,'Surface mouth has actual geometry');
B.set({bath:true});B.light.fill(0);revision=B.paint().revision;
B.light.fill(1);assert.equal(B.paint().revision,revision,'Bath remains independent of mine discovery');
B.set({bath:false});assert(B.paint().revision>revision,'Bath exit restores mine fog mode');
for(const p of [{width:421.5},{height:301.2},{scale:1.25},{scale:2.3},{width:844,height:390},{scale:1}]) {
  const before=B.paint().revision;B.set(p);const after=B.paint();assert(after.revision>before,'Resize/zoom updates mask');
  const q=B.state();assert(after.x<=q.x-64 && after.y<=q.y-64 && after.x+after.canvas.width>=q.x+q.w+64 && after.y+after.canvas.height>=q.y+q.h+64);
}
// A representative smooth pan must retain texture dimensions and reduce rebuilds.
fixture(A);fixture(B);A.set({x:0,y:-100,width:960,height:631,scale:1});B.set({x:0,y:-100,width:960,height:631,scale:1});
function pan(api) {let builds=0,resizes=0,prevRev=0,prevSize='';for(let i=0;i<500;i++){
  api.set({x:i*2.13,y:-100+i*.37});const m=api.paint(),size=[m.canvas.width,m.canvas.height].join(',');
  if(m.revision!==prevRev)builds++;if(prevSize&&size!==prevSize)resizes++;prevRev=m.revision;prevSize=size;
}return {builds,resizes};}
const churn={before:pan(A),after:pan(B)};assert.equal(churn.after.resizes,0);assert(churn.after.builds<churn.before.builds/2);
console.log(JSON.stringify({cpu:'PASS',boundsCases:covered,invalidation:true,churn}));

// Runs in one otherwise empty browser page. This tests both RGBA data texture
// pixels and the native Canvas fallback clip under fractional viewport transforms.
function pixelSuite(factoryA,factoryB,fixtureSource) {
  const a=factoryA(document,Path2D),b=factoryB(document,Path2D),setup=eval('('+fixtureSource+')');
  const rows=[];
  function raster(api,clip) {
    const m=api.paint(),s=api.state(),cv=document.createElement('canvas');
    cv.width=Math.ceil(s.w);cv.height=Math.ceil(s.h);const ctx=cv.getContext('2d',{willReadFrequently:true});
    if(clip){ctx.translate(-s.x,-s.y);ctx.clip(m.openPath);ctx.fillStyle='#fff';ctx.fillRect(s.x,s.y,s.w,s.h);}
    else ctx.drawImage(m.canvas,m.x-s.x,m.y-s.y);
    return {data:ctx.getImageData(0,0,cv.width,cv.height).data,w:cv.width,h:cv.height};
  }
  function compare(label,clip) {
    const A=raster(a,clip),B=raster(b,clip);if(A.data.length!==B.data.length)throw Error('Pixel dimensions differ');
    let max=0,changed=0,total=0,interiorMax=0,interiorChanged=0,geometryMismatches=0;
    for(let y=1;y<A.h-1;y++)for(let x=1;x<A.w-1;x++)for(let c=0;c<4;c++){
      const i=(y*A.w+x)*4+c,av=A.data[i],bv=B.data[i],diff=Math.abs(av-bv);total+=diff;max=Math.max(max,diff);if(diff)changed++;
      let lo=255,hi=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const v=A.data[((y+dy)*A.w+x+dx)*4+c];lo=Math.min(lo,v);hi=Math.max(hi,v);
      }
      if(lo===hi){interiorMax=Math.max(interiorMax,diff);if(diff>1)interiorChanged++;}
      if(bv<lo-1||bv>hi+1)geometryMismatches++;
    }
    rows.push({label,clip,w:A.w,h:A.h,max,changed,mean:total/A.data.length,interiorMax,interiorChanged,geometryMismatches});
  }
  function both(label) {compare(label,false);compare(label,true);}
  for(const kind of ['mixed','long-wall','bath']) {
    setup(a,kind);setup(b,kind);
    for(const p of [
      {x:-128.001,y:-33.37},{x:-.001,y:-.001},{x:0,y:0},{x:.37,y:.63},
      {x:127.999,y:64.001},{x:128.001,y:95.5},{x:256.37,y:128.63},
      {x:511.999,y:256.001},{x:512.001,y:256.001},{x:2310.37,y:256.63},
      {x:640.37,y:550.63,width:411,height:301,scale:1.25},
      {x:640.37,y:550.63,width:844,height:390,scale:2.3}
    ]) {a.set(p);b.set(p);both(kind+':'+JSON.stringify(p));}
    a.set({x:224.37,y:96.63,width:384,height:288,scale:1});b.set({x:224.37,y:96.63,width:384,height:288,scale:1});
    a.world[6][12]=b.world[6][12]=null;both(kind+':mined');
    a.light[6*80+12]=b.light[6*80+12]=0;both(kind+':undiscovered');
    a.light[6*80+12]=b.light[6*80+12]=1;both(kind+':discovered');
    a.world[4][12]=b.world[4][12]=null;both(kind+':mouth-mined');
    a.set({bath:true,x:640.37,y:550.63});b.set({bath:true,x:640.37,y:550.63});a.light.fill(0);b.light.fill(0);both(kind+':bath-without-discovery');
    a.set({bath:false});b.set({bath:false});both(kind+':exit-bath');
  }
  return {rows,exact:rows.filter(x=>x.max===0).length,cases:rows.length,
    // Window truncation can move long-wall wobble samples by a subpixel. Never
    // accept a changed flat interior or a contour outside its former 1px edge.
    pass:rows.every(x=>x.interiorChanged===0&&x.geometryMismatches===0)};
}
async function pixels() {
  const executable=process.env.CHROME||path.join(os.homedir(),'.local/bin/agent-chrome-for-testing');
  assert(!executable.includes('/Applications/Google Chrome.app/'),'Use Chrome for Testing, never the personal browser');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-mask-pixels-'));
  let chrome,ws,timer;const pending=new Map();let seq=0;
  try {
    chrome=spawn(executable,['--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{
      let stderr='';timer=setTimeout(()=>reject(Error('Chrome startup timed out')),20000);
      chrome.once('error',reject);chrome.stderr.on('data',d=>{stderr+=d.toString();const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
      chrome.once('exit',code=>reject(Error('Chrome exited '+code+': '+stderr.slice(-1500))));
    });
    const port=new URL(endpoint).port,targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    const target=targets.find(x=>x.type==='page');assert(target,'Test page available');
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
    const send=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout'));},120000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
    const expression='('+pixelSuite.toString()+')(('+factorySource(baseline)+'),('+factorySource(candidate)+'),'+JSON.stringify(fixture.toString())+')';
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
    const r=result.result.value;const dump=process.env.DUMP;if(dump)fs.writeFileSync(dump,JSON.stringify(r,null,2));
    console.log(JSON.stringify({pixels:r.pass?'PASS':'FAIL',cases:r.cases,exact:r.exact,max:Math.max(...r.rows.map(x=>x.max)),maxInterior:Math.max(...r.rows.map(x=>x.interiorMax)),failures:r.rows.filter(x=>x.interiorChanged||x.geometryMismatches),dump}));
    assert(r.pass,'A mask/clip changed flat coverage or moved more than one world pixel; inspect DUMP');
  } finally {
    clearTimeout(timer);for(const p of pending.values())clearTimeout(p.timer);if(ws)ws.close();
    if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(chrome.exitCode===null){chrome.kill('SIGKILL');await new Promise(r=>chrome.once('exit',r));}}
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
if(process.argv.includes('--pixels'))pixels().catch(e=>{console.error(e);process.exitCode=1;});
