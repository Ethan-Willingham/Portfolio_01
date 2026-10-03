// Owned Chrome for Testing process. Helpers exist only on this local QA server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const { Campaign, SAVE_KEY } = require('../js/hunting-campaign.js');
const root = path.resolve(__dirname, '..');
const dump = process.env.DUMP || '/tmp/hunting-game-v12-qa';
const baselineIndex=process.argv.indexOf('--baseline'),baseline=baselineIndex>=0?process.argv[baselineIndex+1]:null;
fs.mkdirSync(dump, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const errors = [], missing = [];
const hooks = `let testAim = null;
function testSight(d) {
 const mask=world.animalArt(d),size=world.animalSize(d),man=world.hunter,depth=d.y;
 const u=d.facingRight?mask.vitalsX:1-mask.vitalsX;
 const targetX=d.x+(u-.5)*size.width;
 const strength=world.wind*(world.options.windScale ?? 1)*T.windStrength;
 let x=targetX,t=Math.hypot(x,depth)/man.muzzleSpeed;
 for(let i=0;i<24;i++){x=targetX-.5*strength*t*t;t=Math.hypot(x,depth)/man.muzzleSpeed;}
 return {x:x*100/depth,y:100,h:man.height+(mask.vitalsY*size.height+.5*T.gravity*t*t-man.height)*100/depth};
}
function testPointer(point) {
 const r=canvas.getBoundingClientRect();
 const offset=scopeToggle && scopePointer.type!=='touch' && scopePointer.last
  ? {x:scopePointer.last.x-scopePointer.point.x,y:scopePointer.last.y-scopePointer.point.y} : {x:0,y:0};
 return {x:r.left+(point.x+offset.x)*r.width/T.width,y:r.top+(point.y+offset.y)*r.height/T.height};
}
window.__huntTest = {
 ready: () => !!art && !!view && !!world,
 rangeState: () => ({range:view.lastRange,text:$('range-value').textContent,hidden:$('range').hidden,aim:{...aim}}),
 rangePoint: point => {
  setScope(false);aim=world.aim(HuntingView.unproject(HuntingView.project(point)));setScope(true);draw();
  return window.__huntTest.rangeState();
 },
 rangeAnimal: (species,level,facingRight,gap=false) => {
  window.__huntTest.fixture(species,level,80,0,20);world.critters=[];world.ambient=world.critters;
  const d=world.deer[0],mask=world.animalArt(d),size=world.animalSize(d);d.facingRight=facingRight;
  let u=mask.vitalsX,v=mask.vitalsY;
  if(gap){
   const row=Math.floor(mask.height*.9),pixels=Array.from({length:mask.width},(_,i)=>i).filter(i=>mask.alpha[row*mask.width+i]);
   const x=Array.from({length:mask.width},(_,i)=>i).find(i=>i>pixels[0]&&i<pixels.at(-1)&&!mask.alpha[row*mask.width+i]);
   if(x===undefined)throw new Error('No actual transparent leg gap in the fixture');
   u=(x+.5)/mask.width;v=1-(row+.5)/mask.height;
  }
  const point={x:d.x+((facingRight?u:1-u)-.5)*size.width,y:d.y,h:v*size.height};
  return {point,state:window.__huntTest.rangePoint(point)};
 },
 rangeCritter: kind => {
  window.__huntTest.quiet();const d=world.spawnCritter(kind,0,80);Object.assign(d,{h:kind==='owl'?8:0,stride:1,age:1});
  const point={x:0,y:80,h:d.h+(kind==='owl'?.12:.18)};
  return {point,state:window.__huntTest.rangePoint(point)};
 },
 steadyRangeWrites: () => {
  const observer=new MutationObserver(()=>{});observer.observe($('range'),{subtree:true,childList:true,attributes:true});
  draw();observer.takeRecords();for(let i=0;i<30;i++)draw();
  const count=observer.takeRecords().length;observer.disconnect();return count;
 },
 sceneAssets: () => ['birch-terrain','birch-sky','lookout-stand'].map(name => ({
  name, width:art.sprites[name].naturalWidth,height:art.sprites[name].naturalHeight,complete:art.sprites[name].complete})),
 detailState: () => ({density:art.scene.effective_width,active:view.activeDetail.map(id=>({id,state:view.detailTiles.get(id).state})),
  resident:[...view.detailTiles.values()].filter(t=>t.image).length}),
 rasterState: () => ({builds:view.rasterBuilds,buffers:view.rasters.size,
  pixels:[...view.rasters.values()].reduce((n,r)=>n+r.canvas.width*r.canvas.height,0)}),
 rasterReuse: pan => {
  draw(false);const before=view.rasterBuilds;
  if(pan)view.panScope({x:440,y:180},.04);
  for(let i=0;i<30;i++)draw(false);
  return view.rasterBuilds-before;
 },
 stableHudWrites: () => {
  const observer=new MutationObserver(()=>{});observer.observe(game,{subtree:true,childList:true,attributes:true});
  updateUI();observer.takeRecords();for(let i=0;i<30;i++)updateUI();
  const changes=observer.takeRecords().length;observer.disconnect();return changes;
 },
 sourceColorError: () => {
  // Compare the artwork without live celestial marks. Allow two RGB steps for
  // GPU/CPU canvas sampling differences after a readback switches its backend.
  window.__huntSuppressSun=true;
  draw(false);
  const expected=document.createElement('canvas');expected.width=canvas.width;expected.height=canvas.height;
  const g=expected.getContext('2d');g.setTransform(canvas.width/640,0,0,canvas.height/360,0,0);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  const zoom=view.camera.zoom;
  if(zoom>1){g.translate(320-view.camera.screenX*zoom,180-view.camera.screenY*zoom);g.scale(zoom,zoom);}
  g.drawImage(art.sprites['birch-sky'],0,0,640,360);
  const fit=.6/(1-art.scene.horizon),left=(640-640*fit)/2,top=360-360*fit;
  g.drawImage(art.sprites[zoom>1?'birch-underpaint':'birch-terrain'],left,top,640*fit,360*fit);
  if(zoom>1)for(const tile of art.scene.tiles){
   if(!view.activeDetail.includes(tile.id))continue;
   const [x,y,w,h]=tile.rect;
   g.drawImage(art.sprites[tile.id],left+x*640*fit,top+y*360*fit,w*640*fit,h*360*fit);
  }
  else g.drawImage(art.sprites['lookout-stand'],0,0,640,360);
  const actual=canvas.getContext('2d'),areas=zoom>1?[[300,170,40,20],[180,165,20,30],[445,165,20,30]]
   :[[300,130,120,8],[200,190,230,74],[180,330,140,22]];
  const differences=areas.map(([x,y,w,h])=>{
   const sx=canvas.width/640,sy=canvas.height/360;
   const rect=[Math.round(x*sx),Math.round(y*sy),Math.round(w*sx),Math.round(h*sy)];
   const a=actual.getImageData(...rect).data,b=g.getImageData(...rect).data;let difference=0;
   for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)difference+=Math.abs(a[i+c]-b[i+c]);
   return difference/(a.length/4*3);
  });
  delete window.__huntSuppressSun;draw(false);return differences;
 },
 state: () => ({phase, time: world.time, minute: campaign.state.minute, day: campaign.day,
  x: world.hunter.x, y: world.hunter.y, height: world.hunter.height,
  ammo: world.hunter.ammo, shots: world.shots, recovered: world.recovered,
  scoped: scopeToggle, zoom: view.camera.zoom, guide, holds: holds.size, keys: [...keys], visible,
  aimPixel:HuntingView.project(aim,view.camera), camera:{...view.camera},
  scopePointer:{...scopePointer,point:{...scopePointer.point},last:scopePointer.last&&{...scopePointer.last}},scopePan:{...view.scopePan},
  opportunity: world.opportunity, opportunityLeft, pace, records: campaign.state.records,
  deerLevel: campaign.state.deerLevel, region: campaign.state.selected, species: world.species,
  credits:campaign.state.credits,owned:campaign.state.owned,tracks:campaign.state.tracks,windScale:world.options.windScale,
  critters: world.critters.map(c => ({id:c.id, kind:c.kind, x:c.x, y:c.y, h:c.h})),
  deer: world.deer.map(d => ({id:d.id, level:d.profile.level, species:d.profile.species,
   x:d.x,y:d.y,visit:d.visit,state:d.state,bleed:d.bleed,sprite:world.animalSprite(d)})),
  bullets: world.bullets.map(b => ({age:b.age, vz:b.vz, height:b.height, wind:b.wind,
   dx:b.dx, speed:b.speed, origin:b.origin, at:HuntingPhysics.position(b,b.age), trail:b.trail}))}),
 stop: () => {cancelAnimationFrame(raf); raf=0;},
 measure: (duration,pan=false) => new Promise(resolve => {
  cancelAnimationFrame(raf);raf=0;previous=0;active=true;
  const original=view.draw,cpu=[],intervals=[],builds=view.rasterBuilds||0;let last=0,start=0,mutations=0;
  const observer=new MutationObserver(records=>{mutations+=records.length;});
  observer.observe(game,{subtree:true,childList:true,attributes:true});
  view.draw=function(...args){const before=performance.now();const result=original.apply(this,args);cpu.push(performance.now()-before);return result;};
  if(pan){scopePointer.active=true;scopePointer.type='mouse';scopePointer.point={x:465,y:180};}
  raf=requestAnimationFrame(frame);
  const sample=time=>{
   if(!start)start=time;if(last)intervals.push(time-last);last=time;
   if(time-start<duration){requestAnimationFrame(sample);return;}
   cancelAnimationFrame(raf);raf=0;view.draw=original;stopScopeInput();
   mutations+=observer.takeRecords().length;observer.disconnect();
   const quantile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]||0;
   resolve({fps:intervals.length*1000/(time-start),frames:intervals.length,
    frame_p95:quantile(intervals,.95),draw_median:quantile(cpu,.5),draw_p95:quantile(cpu,.95),
    width:canvas.width,height:canvas.height,hud_mutations:mutations,raster_builds:(view.rasterBuilds||0)-builds});
  };
  requestAnimationFrame(sample);
 }),
 loop: () => {cancelAnimationFrame(raf); window.dispatchEvent(new Event('focus')); previous=0; raf=requestAnimationFrame(frame);},
 step: seconds => {cancelAnimationFrame(raf); raf=0; advance(seconds); updateUI(); draw();},
 stalled: seconds => {cancelAnimationFrame(raf);active=true;previous=1000;frame(1000+seconds*1000);cancelAnimationFrame(raf);raf=0;previous=0;},
 tryField: region => beginField(region),
 quiet: () => {
  cancelAnimationFrame(raf); raf=0; world.deer=[]; world.critters=[]; world.ambient=world.critters;
  world.bullets=[]; world.events=[]; world.spawnTimer=99999; world.critterTimer=99999;
  opportunityLeft=0; shotViewLeft=0; seenOpportunity=world.opportunity; setScope(false); updateUI(); draw();
 },
 arrival: (visit=12) => {
  const d=world.spawn(0,80); Object.assign(d,{state:'grazing',pause:999,visit});
  events(); updateUI(); draw(); return d.id;
 },
 fixture: (species='deer',level=1,depth=80,wind=.7,offset=0) => {
  cancelAnimationFrame(raf); raf=0;
  const options={...world.options,lookout:true,species,
   animal:(kind,seed)=>campaign.animal(kind,seed,level),
   artFor:profile=>art.masks[animalArt(profile)],spriteFor:animalArt};
  world=new World(art.masks[species] || art.mask,1000+level+campaign.state.records.length,options);
  world.deer=[]; world.events=[]; world.spawnTimer=99999; world.critterTimer=99999;
  world.wind=wind; opportunityLeft=0; shotViewLeft=0;
  const d=world.spawn(offset,depth,species);
  Object.assign(d,{facingRight:true,state:'grazing',pause:999,visit:999,targetX:offset,targetY:depth});
  world.events=[]; seenOpportunity=world.opportunity; testAim=testSight(d);
  aim={...testAim}; setScope(false); updateUI(); draw();
  return window.__huntTest.target();
 },
 target: () => {
  testAim=testSight(world.deer[0]);
  return testPointer(HuntingView.project(testAim,view.camera));
 },
 pointer: point => testPointer(point),
 clock: minute => {campaign.state.minute=minute;updateUI();draw();},
 sceneFocus: (x,y) => {setScope(false);aim=HuntingView.unproject({x,y});setScope(true);draw(false);},
 sunCenter: () => {
  const sample=document.createElement('canvas');sample.width=T.width;sample.height=T.height;
  const g=sample.getContext('2d');
  draw(false);g.drawImage(canvas,0,0,T.width,T.height);const p=g.getImageData(0,0,T.width,T.height).data;
  window.__huntSuppressSun=true;draw(false);g.drawImage(canvas,0,0,T.width,T.height);
  const background=g.getImageData(0,0,T.width,T.height).data;delete window.__huntSuppressSun;draw(false);
  let sx=0,sy=0,count=0;
  for(let y=0;y<T.height/2;y++)for(let x=0;x<T.width;x++){
   const i=(y*T.width+x)*4;
   if(Math.abs(p[i]-background[i])+Math.abs(p[i+1]-background[i+1])+Math.abs(p[i+2]-background[i+2])>20){sx+=x;sy+=y;count++;}
  }
  return count>100?{x:sx/count,y:sy/count,count}:null;
 },
 save: () => persist(),
 unlocks: () => {for(let i=0;i<14;i++)campaign.recover(campaign.animal('deer',200+i));persist();},
 projection: () => {
  let worst=0;
  for(const cam of [{x:0,y:0,zoom:1},view.camera]) for(const p of [{x:0,y:100,h:0},{x:9,y:40,h:3},{x:-12,y:140,h:7}]) {
   const pixel=HuntingView.project(p,cam),ray=HuntingView.unproject(pixel,cam),again=HuntingView.project(ray,cam);
   worst=Math.max(worst,Math.abs(again.x-pixel.x),Math.abs(again.y-pixel.y));
  }
  return worst;
 },
 arrivalBounds: () => {
  let visible=true;
  for(let i=0;i<80;i++){
   const d=world.spawn(),p=HuntingView.project(d,{x:0,y:0,zoom:1});
   visible=visible&&p.x>=0&&p.x<=T.width&&p.y>=0&&p.y<=T.height;
  }
  world.deer=[];world.events=[];seenOpportunity=world.opportunity;
  return visible;
 },
 showcase: () => {
  cancelAnimationFrame(raf);raf=0;world.deer=[];world.bullets=[];world.events=[];
  world.spawnTimer=99999;world.critterTimer=99999;opportunityLeft=0;shotViewLeft=0;
  for(const [x,y] of [[-11,36],[13,78],[-22,130]]){
   const d=world.spawn(x,y);Object.assign(d,{state:'grazing',pause:999,visit:999,facingRight:true});
  }
  world.events=[];seenOpportunity=world.opportunity;campaign.state.minute=570;
  setScope(false);updateUI();draw(false);
 },
 screenshot: () => {draw(false);return canvas.toDataURL('image/png').split(',')[1];}
};`;
const server = http.createServer((req, res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0])); }
  catch { res.writeHead(400).end(); return; }
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = fs.readFileSync(file);
    if(baseline&&['js/hunting-game.js','js/hunting-view.js'].includes(path.relative(root,file)))
      data=execFileSync('git',['show',baseline+':'+path.relative(root,file)],{cwd:root});
    if (file.endsWith('/js/hunting-game.js')) {
      const source = data.toString();
      if (!source.includes('// TEST_HOOKS:')) throw new Error('Missing QA insertion marker.');
      data = Buffer.from(source.replace('// TEST_HOOKS:', hooks + '\n// TEST_HOOKS:'));
    }
    if (file.endsWith('/js/hunting-view.js')) {
      const source=data.toString(), marker='if (travel >= 0 && travel <= 1) {';
      if(!source.includes(marker))throw new Error('Missing rendered sun marker.');
      data=Buffer.from(source.replace(marker,'if (window.__huntSuppressSun) { } else '+marker));
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { missing.push(req.url); res.writeHead(404).end(); }
});
let browser, passedChecks=0;
function check(name, condition) { assert.ok(condition, name); passedChecks++; console.log('PASS ' + name); }
async function setup(context, url) {
  await context.route('https://www.googletagmanager.com/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__huntTest?.ready());
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#hunt-canvas').scrollIntoViewIfNeeded();
  await page.evaluate(() => __huntTest.stop());
  return page;
}
async function state(page) { return page.evaluate(() => __huntTest.state()); }
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
    [...document.querySelectorAll('#hunt-game button, #hunt-game select')]
      .filter(b => b.getBoundingClientRect().width > 0)
      .every(b => {const r=b.getBoundingClientRect();return r.x>=-1&&r.right<=innerWidth+1&&r.height>=44;}));
}
async function rangeFits(page) {
  return page.locator('#hunt-range').evaluate(el=>{
    const r=el.getBoundingClientRect(),c=document.querySelector('#hunt-canvas').getBoundingClientRect(),style=getComputedStyle(el);
    const stats=document.querySelector('.hunt-field-stats').getBoundingClientRect();
    const overlap=r.x<stats.right&&r.right>stats.x&&r.y<stats.bottom&&r.bottom>stats.y;
    return !el.hidden&&!overlap&&r.x>=c.x&&r.right<=c.right&&r.y>=c.y&&r.bottom<=c.bottom&&parseFloat(style.fontSize)>=12&&style.pointerEvents==='none';
  });
}
async function steer(page, x, y) {
  const point=await page.evaluate(point=>__huntTest.pointer(point),{x,y});
  await page.mouse.move(point.x,point.y);
}
async function pointerShot(page, species='deer', level=1, depth=80, wind=.7) {
  let target = await page.evaluate(({species,level,depth,wind}) => __huntTest.fixture(species,level,depth,wind), {species,level,depth,wind});
  await page.mouse.click(target.x,target.y);
  check('first pointer click raises the scope without firing', await page.evaluate(() => __huntTest.state().zoom===6 && __huntTest.state().shots===0));
  check('scoped pointer projection is invertible', await page.evaluate(() => __huntTest.projection()<1e-8));
  await steer(page,440,150); await page.evaluate(()=>__huntTest.step(.2));
  if(species==='deer'&&level===1&&depth===80)await page.screenshot({path:path.join(dump,'scope-aim.png')});
  target = await page.evaluate(() => __huntTest.target());
  await page.mouse.click(target.x,target.y);
  check('second pointer click fires a visible round', await page.evaluate(() => __huntTest.state().shots===1 && __huntTest.state().bullets.length===1));
}
(async () => {
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/hunting-game.html';
    if(process.argv.includes('--benchmark')) {
      const measurements=[];
      for(const [name,engine,options] of [['chrome',chromium,{executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}],['webkit',webkit,{}]]) {
        browser=await engine.launch({headless:true,...options});
        const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});
        const page=await setup(context,url);await page.evaluate(()=>__huntTest.showcase());
        for(const [mode,pan] of [['wide',false],['scope',false],['pan',true]]) {
          if(mode!=='wide'){
            await page.evaluate(()=>__huntTest.sceneFocus(350,235));
            await page.waitForFunction(()=>{const d=__huntTest.detailState();return d.active.length&&d.active.every(t=>t.state==='ready');});
          }
          const result={browser:name,mode,...await page.evaluate(pan=>__huntTest.measure(2500,pan),pan)};
          measurements.push(result);console.log(JSON.stringify(result));
        }
        await browser.close();browser=null;
      }
      fs.writeFileSync(path.join(dump,'benchmark.json'),JSON.stringify(measurements,null,2)+'\n');
      assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
      return;
    }
    const rangeWebkit=process.argv.includes('--range-webkit');
    browser=await (rangeWebkit?webkit:chromium).launch({headless:true,...(rangeWebkit?{}:{executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'})});
    const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await setup(desktop,url);
    check('loading opens directly in the stationary distant field',await page.evaluate(()=>{const s=__huntTest.state();return s.phase==='running'&&s.x===0&&s.y===0&&s.height===12;}));
    check('the old camp, shop, walking and tracking UI is removed',await page.evaluate(()=>!document.querySelector('#hunt-camp,#hunt-embark,#hunt-track-search,[data-tab],[data-move]')));
    check('the wide field starts with an owl and a squirrel',await page.evaluate(()=>['owl','squirrel'].every(k=>__huntTest.state().critters.some(c=>c.kind===k))));
    check('desktop controls fit and meet 44-pixel targets',await noOverflow(page));
    check('the painted scene loads full-resolution sky, terrain and stand layers',await page.evaluate(()=>
      __huntTest.sceneAssets().every(a=>a.complete&&a.width>=1600&&a.width/a.height===16/9)));
    check('desktop painting renders at display resolution while projection stays logical',await page.locator('#hunt-canvas').evaluate(c=>
      c.width>640&&c.width>=Math.min(2560,Math.floor(c.getBoundingClientRect().width))));
    check('wide pointer projection is invertible',await page.evaluate(()=>__huntTest.projection()<1e-8));
    check('unchanged controls do not rewrite the DOM every frame',await page.evaluate(()=>__huntTest.stableHudWrites()===0));
    check('a stationary wide view reuses its sampled scenery',await page.evaluate(()=>__huntTest.rasterReuse(false)===0));
    check('yardage stays hidden in the wide view',await page.locator('#hunt-range').evaluate(el=>el.hidden));
    await page.evaluate(()=>__huntTest.quiet());
    for(const point of [{x:0,y:45,h:0},{x:0,y:140,h:0},{x:50,y:80,h:0}]) {
      const s=await page.evaluate(point=>__huntTest.rangePoint(point),point),expected=Math.hypot(point.x,point.y,12)/.9144;
      check('ground yardage follows the precise point at '+point.x+','+point.y,Math.abs(s.range.yards-expected)<1e-6&&s.range.surface==='ground'&&s.text==='Range '+expected.toFixed(1)+' yd'&&!s.hidden);
    }
    check('a fixed aim causes no redundant yardage DOM writes',await page.evaluate(()=>__huntTest.steadyRangeWrites()===0));
    await steer(page,320,180);
    const groundBefore=await page.evaluate(()=>__huntTest.rangeState());await steer(page,320,325);
    const groundAfter=await page.evaluate(()=>__huntTest.rangeState());
    check('real pointer motion changes the distance to the crosshair',Math.abs(groundAfter.range.yards-groundBefore.range.yards)>.1);
    await page.evaluate(()=>__huntTest.step(.5));
    const panAfter=await page.evaluate(()=>__huntTest.rangeState());
    check('scope panning updates yardage along with the sight ray',Math.abs(panAfter.range.yards-groundAfter.range.yards)>.1);
    for(const point of [{x:0,y:100,h:12},{x:0,y:100,h:20}]) {
      const s=await page.evaluate(point=>__huntTest.rangePoint(point),point);
      check('the horizon and sky have no invented finite distance',s.range===null&&s.text==='No range');
    }
    for(const [species,level] of [...Array.from({length:5},(_,i)=>['deer',i+1]),['boar',1]])for(const facing of [true,false]) {
      const {point,state:s}=await page.evaluate(({species,level,facing})=>__huntTest.rangeAnimal(species,level,facing),{species,level,facing});
      const expected=Math.hypot(point.x,point.y,12-point.h)/.9144;
      check('the visible '+species+' '+level+' facing '+facing+' reports its exact surface distance',s.range?.surface==='animal'&&Math.abs(s.range.yards-expected)<1e-6&&s.text==='Range '+expected.toFixed(1)+' yd');
    }
    const gap=await page.evaluate(()=>__huntTest.rangeAnimal('deer',1,true,true));
    check('a transparent leg gap ranges the field behind the animal',gap.state.range.surface==='ground'&&gap.state.range.point.y>gap.point.y);
    for(const kind of ['owl','squirrel']) {
      const {point,state:s}=await page.evaluate(kind=>__huntTest.rangeCritter(kind),kind);
      check('ranging the visible '+kind+' uses its own depth',s.range?.surface==='animal'&&Math.abs(s.range.yards-Math.hypot(point.x,point.y,12-point.h)/.9144)<1e-6);
    }
    check('desktop yardage fits the scope and cannot intercept aiming',await rangeFits(page));
    await page.screenshot({path:path.join(dump,'range-desktop.png')});
    if(rangeWebkit){
      check('WebKit range rendering has no errors or missing assets',!errors.length&&!missing.length);
      console.log('Passed WebKit range checks: '+passedChecks);return;
    }
    await page.evaluate(()=>__huntTest.quiet());
    await page.screenshot({path:path.join(dump,'wide-field.png')});
    await page.evaluate(()=>__huntTest.showcase());await page.screenshot({path:path.join(dump,'sunny-field.png')});
    fs.writeFileSync(path.join(dump,'sunny-field-canvas.png'),Buffer.from(await page.evaluate(()=>__huntTest.screenshot()),'base64'));
    await page.evaluate(()=>__huntTest.quiet());
    for(const minute of [330,407,720,1350]) {
      await page.evaluate(minute=>__huntTest.clock(minute),minute);
      const colorErrors=await page.evaluate(()=>__huntTest.sourceColorError());
      check('sky, field and stand retain source colors at minute '+minute,colorErrors.every(error=>error<1));
    }
    await page.evaluate(()=>__huntTest.clock(407));
    fs.writeFileSync(path.join(dump,'morning-0647.png'),Buffer.from(await page.evaluate(()=>__huntTest.screenshot()),'base64'));
    await page.evaluate(()=>__huntTest.clock(407));
    for(const [name,x,y] of [['meadow',350,235],['treeline',320,151],['birch',80,90],['flowers',580,280]]) {
      await page.evaluate(({x,y})=>__huntTest.sceneFocus(x,y),{x,y});
      await page.waitForFunction(()=>{const d=__huntTest.detailState();return d.active.length&&d.active.every(t=>t.state==='ready');});
      check('6x '+name+' loads native fine detail',await page.evaluate(()=>__huntTest.detailState().density>=6000));
      const scopeColors=await page.evaluate(()=>__huntTest.sourceColorError());
      check('6x '+name+' keeps source colors across the clear lens',scopeColors.every(error=>error<2));
      fs.writeFileSync(path.join(dump,'detail-'+name+'.png'),Buffer.from(await page.evaluate(()=>__huntTest.screenshot()),'base64'));
    }
    check('panning keeps at most six decoded detail images',await page.evaluate(()=>__huntTest.detailState().resident<=6));
    await page.evaluate(()=>__huntTest.sceneFocus(350,235));
    await page.waitForFunction(()=>__huntTest.detailState().active.every(t=>t.state==='ready'));
    check('small scope movement reuses the guard area',await page.evaluate(()=>__huntTest.rasterReuse(true)===0));
    check('display caches stay within three buffers and 13 million pixels',await page.evaluate(()=>{const s=__huntTest.rasterState();return s.buffers<=3&&s.pixels<=13000000;}));
    await page.evaluate(()=>__huntTest.quiet());
    check('default arrival locations are visible in the perspective field',await page.evaluate(()=>__huntTest.arrivalBounds()));
    await page.evaluate(()=>{__huntTest.quiet();__huntTest.clock(360);});
    const sunrise=await page.evaluate(()=>__huntTest.screenshot());
    await page.keyboard.down('f');
    const before=await state(page); await page.evaluate(()=>__huntTest.step(.5)); const rushing=await state(page);
    check('holding F advances the sun clock and wildlife rapidly',rushing.minute-before.minute>4.9&&rushing.time-before.time>5.9);
    await page.keyboard.up('f'); await page.evaluate(()=>__huntTest.step(.5)); const released=await state(page);
    check('releasing F returns to normal progressing time',released.minute-rushing.minute<.02&&released.time-rushing.time<.51&&released.time>rushing.time);
    await page.locator('#hunt-wait').focus();await page.keyboard.down('Space');
    check('keyboard Space holds the visible fast-forward control',(await state(page)).holds===1);
    await page.keyboard.press('Tab');await page.keyboard.up('Space');await page.evaluate(()=>__huntTest.step(.1));
    check('changing focus before releasing Space cannot latch fast-forward',await page.evaluate(()=>{const s=__huntTest.state();return !s.holds&&!s.keys.length&&s.pace.clock===1;}));
    await page.evaluate(()=>__huntTest.clock(570)); const morningSun=await page.evaluate(()=>__huntTest.sunCenter());
    await page.evaluate(()=>__huntTest.clock(930)); const afternoonSun=await page.evaluate(()=>__huntTest.sunCenter());
    check('the sun itself crosses the rendered sky with the day clock',morningSun&&afternoonSun&&afternoonSun.x-morningSun.x>180);
    await page.evaluate(()=>__huntTest.clock(720)); const midday=await page.evaluate(()=>__huntTest.screenshot());
    check('the real clock visibly changes the celestial scene',sunrise!==midday);
    fs.writeFileSync(path.join(dump,'noon-field.png'),Buffer.from(midday,'base64'));
    for(const [name,minute] of [['dawn',330],['dusk',1110],['night',1350]]) {
      await page.evaluate(minute=>__huntTest.clock(minute),minute);
      fs.writeFileSync(path.join(dump,name+'-field.png'),Buffer.from(await page.evaluate(()=>__huntTest.screenshot()),'base64'));
    }
    await page.evaluate(()=>{__huntTest.quiet();__huntTest.clock(1439);});
    await page.keyboard.down('f'); await page.evaluate(()=>__huntTest.step(.2)); await page.keyboard.up('f');
    check('the field stays playable across midnight without a camp gate',(await state(page)).phase==='running'&&(await state(page)).day===2);
    await page.evaluate(()=>{__huntTest.quiet();__huntTest.clock(420);});
    const arrivalId=await page.evaluate(()=>__huntTest.arrival(12));
    await page.keyboard.down('f'); const sighted=await state(page); await page.evaluate(()=>__huntTest.step(.5)); const eased=await state(page);
    check('a new sighting briefly eases time without pausing',eased.phase==='running'&&eased.minute>sighted.minute&&eased.time>sighted.time&&eased.pace.clock>1&&eased.pace.clock<600&&eased.pace.simulation>1&&eased.pace.simulation<12);
    await page.evaluate(()=>__huntTest.step(3.2)); const missed=await state(page);
    check('holding fast-forward expires the easing window',missed.opportunityLeft===0&&missed.pace.clock===600&&missed.pace.simulation===12);
    check('an ignored finite visit can leave the field',!missed.deer.some(d=>d.id===arrivalId)); await page.keyboard.up('f');
    await page.evaluate(()=>{__huntTest.quiet();__huntTest.arrival();});await page.keyboard.down('f');await page.evaluate(()=>__huntTest.stalled(5));
    check('a long rendering stall cannot prolong sighting assistance',await page.evaluate(()=>{const s=__huntTest.state();return s.opportunityLeft===0&&s.pace.clock===600;}));await page.keyboard.up('f');
    let lensTarget=await page.evaluate(()=>__huntTest.fixture());await page.mouse.click(lensTarget.x,lensTarget.y);
    const lens=await page.locator('#hunt-canvas').boundingBox();await page.mouse.move(lens.x+lens.width-2,lens.y+2);
    check('pointer movement outside the scope stays within the visible lens',await page.evaluate(()=>{const p=__huntTest.state().aimPixel;return Math.hypot(p.x-320,p.y-180)<=162.01;}));
    lensTarget=await page.evaluate(()=>__huntTest.fixture('deer',1,80,.7,-20));await page.mouse.click(lensTarget.x,lensTarget.y);
    const zoomStart=await state(page);await page.evaluate(()=>__huntTest.step(.3));
    check('zoom centers the clicked animal and waits for deliberate mouse movement',await page.evaluate(expected=>{const s=__huntTest.state();return Math.hypot(s.aimPixel.x-320,s.aimPixel.y-180)<1e-8&&s.camera.screenX===expected.screenX&&s.camera.screenY===expected.screenY&&!s.scopePointer.active;},zoomStart.camera));
    await page.mouse.move(lensTarget.x+lens.width/640*2,lensTarget.y-lens.height/360*3);
    const smallMove=await state(page);
    check('a small mouse movement after zoom never jumps to the old cursor position',Math.hypot(smallMove.aimPixel.x-322,smallMove.aimPixel.y-177)<.001);
    await steer(page,350,160);const fineAim=await state(page);await page.evaluate(()=>__huntTest.step(.4));const fineStill=await state(page);
    check('the central aiming area stays perfectly steady for fine corrections',fineStill.camera.screenX===fineAim.camera.screenX&&fineStill.camera.screenY===fineAim.camera.screenY&&Math.hypot(fineStill.scopePan.x,fineStill.scopePan.y)===0);
    check('the scope uses the reticle as its mouse cursor',await page.locator('#hunt-canvas').evaluate(el=>getComputedStyle(el).cursor==='none'));
    for(const [label,x,y,axis,sign] of [['up',320,35,'screenY',-1],['left',175,180,'screenX',-1],['down',320,325,'screenY',1],['right',465,180,'screenX',1]]) {
      lensTarget=await page.evaluate(()=>__huntTest.fixture());await page.mouse.click(lensTarget.x,lensTarget.y);
      const start=await state(page);await steer(page,x,y);const aimed=await state(page);await page.evaluate(()=>__huntTest.step(.25));const moved=await state(page);
      check('moving the sight '+label+' smoothly pans the scope in that direction',moved.zoom===6&&(moved.camera[axis]-start.camera[axis])*sign>3);
      check('the reticle and shooting ray stay aligned while panning '+label,
        Math.hypot(aimed.aimPixel.x-x,aimed.aimPixel.y-y)<.001&&Math.hypot(moved.aimPixel.x-aimed.aimPixel.x,moved.aimPixel.y-aimed.aimPixel.y)<1e-8&&await page.evaluate(()=>__huntTest.projection()<1e-8));
    }
    lensTarget=await page.evaluate(()=>__huntTest.fixture());await page.mouse.click(lensTarget.x,lensTarget.y);
    await steer(page,465,180);const softStart=await state(page);await page.evaluate(()=>__huntTest.step(.05));const softFirst=await state(page);
    await page.evaluate(()=>__huntTest.step(.05));const softNext=await state(page);
    check('panning eases into motion rather than lurching to full speed',softFirst.camera.screenX-softStart.camera.screenX>0&&softFirst.camera.screenX-softStart.camera.screenX<softNext.camera.screenX-softFirst.camera.screenX&&softNext.camera.screenX-softFirst.camera.screenX<2);
    await page.evaluate(()=>__huntTest.step(.4));const horizontalEnd=await state(page);
    const horizontalDistance=horizontalEnd.camera.screenX-softStart.camera.screenX;
    check('the lens rim quietly indicates the direction of travel',horizontalEnd.scopePan.x>.9&&Math.abs(horizontalEnd.scopePan.y)<.001);
    await page.screenshot({path:path.join(dump,'scope-mouse-pan.png')});
    lensTarget=await page.evaluate(()=>__huntTest.fixture());await page.mouse.click(lensTarget.x,lensTarget.y);
    const diagonalStart=await state(page);await steer(page,320+145/Math.SQRT2,180-145/Math.SQRT2);await page.evaluate(()=>__huntTest.step(.5));const diagonalEnd=await state(page);
    check('diagonal mouse panning has the same speed as horizontal motion',Math.abs(Math.hypot(diagonalEnd.camera.screenX-diagonalStart.camera.screenX,diagonalEnd.camera.screenY-diagonalStart.camera.screenY)-horizontalDistance)<1e-7);
    await steer(page,320,180);const centered=await state(page);await page.evaluate(()=>__huntTest.step(.5));const steady=await state(page);
    check('returning to the center stops immediately without coasting',steady.camera.screenX===centered.camera.screenX&&steady.camera.screenY===centered.camera.screenY&&Math.hypot(steady.scopePan.x,steady.scopePan.y)===0);
    await steer(page,465,180);await page.evaluate(()=>__huntTest.step(.2));const leaving=await state(page);
    await page.mouse.move(lens.x+lens.width+5,lens.y+lens.height/2);await page.evaluate(()=>__huntTest.step(.5));const outside=await state(page);
    check('leaving the canvas stops the view immediately',!outside.scopePointer.active&&outside.camera.screenX===leaving.camera.screenX&&outside.camera.screenY===leaving.camera.screenY);
    await page.mouse.move(lens.x+lens.width/2,lens.y+lens.height/2);await page.evaluate(()=>__huntTest.step(.3));const reentered=await state(page);
    check('re-entering the canvas preserves the sight without restarting an old pan',reentered.camera.screenX===outside.camera.screenX&&Math.hypot(reentered.aimPixel.x-outside.aimPixel.x,reentered.aimPixel.y-outside.aimPixel.y)<1e-8&&!reentered.scopePointer.active);
    await steer(page,450,150);await page.evaluate(()=>__huntTest.step(.2));await page.keyboard.press('p');const panPaused=await state(page);
    await page.evaluate(()=>__huntTest.step(.5));const panStill=await state(page);
    check('pause clears mouse panning and freezes its view',panStill.phase==='paused'&&!panStill.scopePointer.active&&panStill.camera.screenX===panPaused.camera.screenX);
    await page.keyboard.press('Escape');await page.mouse.move(lens.x+lens.width/2,lens.y+lens.height/2);
    await steer(page,465,180);await page.evaluate(()=>__huntTest.step(.2));await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const panBlur=await state(page);
    check('focus loss clears mouse movement',panBlur.phase==='paused'&&!panBlur.scopePointer.active&&Math.hypot(panBlur.scopePan.x,panBlur.scopePan.y)===0);
    await page.locator('#hunt-start').click();
    lensTarget=await page.evaluate(()=>__huntTest.fixture());await page.mouse.click(lensTarget.x,lensTarget.y);
    await steer(page,465,180);await page.evaluate(()=>__huntTest.step(10));await steer(page,320,35);await page.evaluate(()=>__huntTest.step(10));const edgeScope=await state(page);
    check('mouse panning stays inside the wide field at its edges',edgeScope.camera.screenX===640&&edgeScope.camera.screenY===0);
    await page.keyboard.press('q');const lowered=await state(page);
    check('lowering the scope clears panning without moving the hunter',lowered.zoom===1&&!lowered.scopePointer.active&&lowered.x===0&&lowered.y===0);
    await pointerShot(page);
    const shotCamera=await state(page);await page.mouse.move(lens.x+lens.width-5,lens.y+5);await page.evaluate(()=>__huntTest.step(.05));
    check('mouse movement cannot disturb the shot view during bullet flight',await page.evaluate(expected=>{const s=__huntTest.state();return s.camera.screenX===expected.screenX&&s.camera.screenY===expected.screenY&&!s.scopePointer.active;},shotCamera.camera));
    await page.screenshot({path:path.join(dump,'scope-shot.png')});
    await page.evaluate(()=>__huntTest.step(.2)); const flight=await state(page);
    check('bullet flight preserves visible scope detail',flight.zoom===6&&flight.bullets.length===1);
    const b=flight.bullets[0];
    check('the actual visible projectile has gravitational drop',b.at.h<b.height+b.vz*b.age-.0001&&b.trail.length>1);
    check('the actual visible projectile drifts with wind',Math.abs(b.at.x-(b.origin.x+b.dx*b.speed*b.age))>.0001);
    await page.screenshot({path:path.join(dump,'bullet-flight.png')});
    await page.evaluate(()=>__huntTest.step(.95));
    check('a clean hit has a real pending recovery run',await page.evaluate(()=>{const s=__huntTest.state();return !s.bullets.length&&s.deer.some(d=>d.bleed>0)&&!s.records.length;}));
    await page.locator('#hunt-menu').click();
    check('field choices stay disabled while a clean recovery is pending',await page.locator('#hunt-region').isDisabled()&&await page.locator('#hunt-deer-level').isDisabled());
    await page.evaluate(()=>__huntTest.tryField('cypress'));
    check('a field reset cannot discard a pending recovery',(await state(page)).region==='birch'&&(await state(page)).deer.some(d=>d.bleed>0));
    await page.locator('#hunt-menu-close').click();await page.evaluate(()=>__huntTest.step(2.5));
    check('a real wind-compensated scoped shot recovers and saves a deer',await page.evaluate(()=>__huntTest.state().records.length===1&&__huntTest.state().recovered===1));
    check('the scope returns to the field after the round',(await state(page)).zoom===1);
    await page.keyboard.down('f'); await page.keyboard.press('p'); const paused=await state(page);
    await page.evaluate(()=>__huntTest.step(2)); const still=await state(page);
    check('pause freezes clock and simulation and clears held input',still.phase==='paused'&&still.minute===paused.minute&&still.time===paused.time&&!still.holds&&!still.keys.length);
    await page.keyboard.press('Tab');check('pause keeps keyboard focus on its resume control',await page.evaluate(()=>document.activeElement.id==='hunt-start'));
    await page.keyboard.press('Escape');
    check('Escape resumes from the focused pause overlay',(await state(page)).phase==='running');
    await page.keyboard.down('f'); await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    check('focus loss pauses and clears fast-forward',await page.evaluate(()=>{const s=__huntTest.state();return s.phase==='paused'&&!s.holds&&!s.keys.length;})); await page.keyboard.up('f');
    await page.locator('#hunt-start').click();
    await page.locator('#hunt-menu').click(); const menuTime=await state(page);
    await page.evaluate(()=>__huntTest.step(2));
    check('More pauses the field without a preparation loop',(await state(page)).phase==='menu'&&(await state(page)).time===menuTime.time);
    for(let i=0;i<12;i++)await page.keyboard.press('Tab');
    check('keyboard focus remains inside More',await page.evaluate(()=>document.getElementById('hunt-options').contains(document.activeElement)));
    await page.screenshot({path:path.join(dump,'more.png')}); await page.locator('#hunt-menu-close').click();
    await page.locator('#hunt-menu').click();
    await page.evaluate(()=>{const spacer=document.createElement('div');spacer.id='hunt-qa-scroll';spacer.style.height='1600px';document.body.append(spacer);window.scrollTo(0,document.documentElement.scrollHeight);});
    await page.waitForFunction(()=>!__huntTest.state().visible);await page.keyboard.press('Escape');
    check('closing More while the field is offscreen leaves it paused',(await state(page)).phase==='paused');
    await page.evaluate(()=>document.getElementById('hunt-qa-scroll').remove());await page.locator('#hunt-canvas').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>__huntTest.state().visible);await page.locator('#hunt-start').click();
    await page.locator('#hunt-menu').click(); await page.locator('#hunt-fullscreen').click(); await page.locator('#hunt-menu-close').click();
    check('fullscreen contains the playable field',await page.evaluate(()=>document.fullscreenElement?.id==='hunt-game'||document.getElementById('hunt-game').classList.contains('hunt-fullscreen')));
    check('fullscreen controls remain usable',await noOverflow(page));
    await page.locator('#hunt-menu').click(); await page.locator('#hunt-fullscreen').click(); await page.locator('#hunt-menu-close').click();
    await page.evaluate(()=>{__huntTest.clock(765);__huntTest.save();}); const saved=await state(page);
    await page.reload(); await page.waitForFunction(()=>window.__huntTest?.ready()); await page.evaluate(()=>__huntTest.stop());
    check('reload restores time and records directly in the field',await page.evaluate(expected=>{const s=__huntTest.state();return s.phase==='running'&&Math.abs(s.minute-expected.minute)<.02&&s.records.length===expected.records.length&&!s.bullets.length;},saved));
    for(let level=2;level<=5;level++) {
      await pointerShot(page,'deer',level,level%2?110:55,.7);
      await page.evaluate(()=>__huntTest.step(4));
      check('level '+level+' uses its own sprite and real scoped collision',await page.evaluate(l=>__huntTest.state().records.at(-1).level===l&&__huntTest.state().recovered===1,level));
    }
    await pointerShot(page,'boar',1,65,-.7); await page.evaluate(()=>__huntTest.step(4));
    check('boar uses its own projected mask for a scoped hit',await page.evaluate(()=>__huntTest.state().records.at(-1).species==='boar'));
    await page.locator('#hunt-menu').click(); const fieldChange=await state(page);
    await page.locator('#hunt-region').selectOption('cypress');
    check('a field choice changes wildlife without advancing the hour',await page.evaluate(expected=>{const s=__huntTest.state();return s.region==='cypress'&&s.species==='boar'&&s.minute===expected;},fieldChange.minute));
    await page.locator('#hunt-deer-level').selectOption('2'); await page.locator('#hunt-menu-close').click();
    check('an unlocked deer choice returns directly to its lookout',await page.evaluate(()=>{const s=__huntTest.state();return s.phase==='running'&&s.region==='birch'&&s.deerLevel===2;}));
    const old=new Campaign(); old.state.credits=1000; old.state.minute=1065;
    old.recover(old.animal('deer',111)); old.recover(old.animal('deer',222));
    old.buy('rifle'); old.unlock('cypress'); old.addTrack(old.animal('boar',333));
    const legacy=await browser.newContext({viewport:{width:1100,height:780}});
    await legacy.addInitScript(({key,save})=>{if(!localStorage.getItem(key))localStorage.setItem(key,save);},{key:SAVE_KEY,save:old.export()});
    const returning=await setup(legacy,url);
    check('legacy saves retain records, economy, equipment and trails',await returning.evaluate(expected=>{const s=__huntTest.state();return s.phase==='running'&&s.minute>=1065&&s.minute<1065.02&&s.region==='cypress'&&s.records.length===2&&s.credits===expected.credits&&s.tracks.length===1&&s.owned.includes('rifle')&&s.windScale===.6;},old.state));
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
    const phone=await setup(mobile,url);
    check('portrait field fits with 44-pixel controls',await noOverflow(phone));
    await phone.evaluate(()=>{__huntTest.quiet();__huntTest.rangePoint({x:0,y:80,h:0});});
    check('portrait yardage stays readable within the actual canvas',await rangeFits(phone));
    await phone.screenshot({path:path.join(dump,'range-phone-portrait.png'),fullPage:true});
    await phone.setViewportSize({width:844,height:390});await phone.locator('#hunt-canvas').scrollIntoViewIfNeeded();
    check('landscape yardage stays within the letterboxed canvas',await rangeFits(phone));
    await phone.screenshot({path:path.join(dump,'range-phone-landscape.png')});
    await phone.setViewportSize({width:390,height:844});await phone.locator('#hunt-canvas').scrollIntoViewIfNeeded();
    await phone.evaluate(()=>__huntTest.quiet());
    let target=await phone.evaluate(()=>__huntTest.fixture('deer',1,65,0));
    await phone.touchscreen.tap(target.x,target.y);
    check('touching the field aims without shooting',(await state(phone)).shots===0);
    if((await state(phone)).zoom===1)await phone.locator('#hunt-fire').tap();
    check('touch aiming can raise the scope without firing',(await state(phone)).zoom===6&&(await state(phone)).shots===0);
    const cdp=await mobile.newCDPSession(phone),touchLens=await phone.locator('#hunt-canvas').boundingBox();
    const touchPoint=(x,y)=>({x:touchLens.x+x*touchLens.width/640,y:touchLens.y+y*touchLens.height/360,id:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint(320,180)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoint(465,180)]});
    const touchPanStart=await state(phone);await phone.evaluate(()=>__huntTest.step(.3));const touchPanned=await state(phone);
    check('dragging toward the lens edge pans a real captured touch',touchPanned.camera.screenX>touchPanStart.camera.screenX+3&&touchPanned.scopePointer.active&&touchPanned.shots===0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.evaluate(()=>__huntTest.step(.3));const touchReleased=await state(phone);
    check('lifting the finger stops scope panning without drifting',!touchReleased.scopePointer.active&&touchReleased.camera.screenX===touchPanned.camera.screenX);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint(465,180)]});await phone.evaluate(()=>__huntTest.step(.15));const touchCancelStart=await state(phone);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await phone.evaluate(()=>__huntTest.step(.3));const touchCancelled=await state(phone);
    check('a cancelled touch cannot leave the scope moving',!touchCancelled.scopePointer.active&&touchCancelled.camera.screenX===touchCancelStart.camera.screenX);
    target=await phone.evaluate(()=>__huntTest.target()); await phone.touchscreen.tap(target.x,target.y); await phone.locator('#hunt-fire').tap();
    await phone.evaluate(()=>__huntTest.step(.2));await phone.screenshot({path:path.join(dump,'phone-bullet-flight.png')});
    await phone.evaluate(()=>__huntTest.step(3.8));
    check('the touch Aim / Fire action recovers a real animal',await phone.evaluate(()=>__huntTest.state().records.length===1));
    await phone.screenshot({path:path.join(dump,'phone-portrait.png'),fullPage:true});
    await phone.setViewportSize({width:844,height:390}); await phone.locator('#hunt-canvas').scrollIntoViewIfNeeded();
    check('phone landscape controls fit',await noOverflow(phone)); await phone.screenshot({path:path.join(dump,'phone-landscape.png')});
    await phone.setViewportSize({width:320,height:740});
    check('narrow-phone controls fit',await noOverflow(phone));
    await phone.locator('#hunt-menu').tap(); check('narrow-phone More controls fit',await noOverflow(phone)); await phone.locator('#hunt-menu-close').tap();
    await phone.locator('#hunt-canvas').scrollIntoViewIfNeeded();await phone.waitForFunction(()=>__huntTest.state().visible);
    if((await state(phone)).phase==='paused')await phone.locator('#hunt-start').tap();
    assert.equal((await state(phone)).phase,'running','real touch hold starts in an active visible field');
    await phone.evaluate(()=>{__huntTest.quiet();__huntTest.loop();});
    const wait=await phone.locator('#hunt-wait').boundingBox();
    const touchStart=(await state(phone)).minute;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:wait.x+wait.width/2,y:wait.y+wait.height/2,id:1}]});
    try {await phone.waitForFunction(start=>{const s=__huntTest.state();return s.holds>0&&s.pace.clock===600&&s.minute>start+.01;},touchStart,{timeout:5000});}
    catch(error){console.error('Touch state:',await state(phone));console.error('Touch button:',wait);throw error;}
    const held=await state(phone);
    check('a real held touch fast-forwards the clock',held.holds>0&&held.pace.clock===600);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); await phone.waitForTimeout(50);
    check('touch cancellation releases fast-forward',(await state(phone)).holds===0); await phone.evaluate(()=>__huntTest.stop());
    const retina=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});
    const crisp=await setup(retina,url);
    await crisp.evaluate(()=>{__huntTest.quiet();__huntTest.clock(407);__huntTest.sceneFocus(350,235);});
    await crisp.waitForFunction(()=>{const d=__huntTest.detailState();return d.active.length&&d.active.every(t=>t.state==='ready');});
    check('Retina scope uses the full capped display canvas',await crisp.locator('#hunt-canvas').evaluate(c=>c.width===2560&&c.height===1440));
    check('Retina scope loads native detail within the six-image budget',await crisp.evaluate(()=>{const s=__huntTest.detailState();return s.density>=6000&&s.resident<=6;}));
    check('Retina scenery caching respects the same memory budget',await crisp.evaluate(()=>{const s=__huntTest.rasterState();return s.buffers<=3&&s.pixels<=13000000;}));
    await crisp.evaluate(()=>__huntTest.rangePoint({x:20,y:80,h:0}));
    check('Retina rendering keeps yardage and pointing coordinates aligned',await crisp.evaluate(()=>Math.abs(__huntTest.rangeState().range.yards-Math.hypot(20,80,12)/.9144)<1e-6));
    fs.writeFileSync(path.join(dump,'retina-scope.png'),Buffer.from(await crisp.evaluate(()=>__huntTest.screenshot()),'base64'));
    check('scripts have no page errors and all local assets load',!errors.length&&!missing.length);
    console.log('Passed checks: '+passedChecks);
    console.log('Screenshots: '+dump);
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);console.error({errors,missing});process.exitCode=1;});
