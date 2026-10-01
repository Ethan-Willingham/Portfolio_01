// NODE_PATH=/path/to/node_modules node tools/test-galaxy-emergence-browser.cjs
// Own server and Chrome for Testing process, closed in finally.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser;const errors=[];
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+'/'))return res.writeHead(403).end();
  try{let b=fs.readFileSync(file);if(file.endsWith('/js/random-galaxy.js')){const s=b.toString(),i=s.lastIndexOf('})();');b=Buffer.from(s.slice(0,i)+'window.__gxActivity=()=>({running,loopRunning,field:currentField,pending:pendingField,morph,seed:currentSeed});\n'+s.slice(i));}
    if(file.endsWith('/js/random-galaxy-emergence.js')){const s=b.toString(),i=s.lastIndexOf('})();');b=Buffer.from(s.slice(0,i)+`window.__emModel=()=>worlds[0];window.__emGeometry=()=>({r:rect(0),width,height,aspect:worlds[0].aspect,spanX:worlds[0].spanX,spanY:worlds[0].spanY});window.__emPixels=()=>{draw();const pixels=new Uint8Array(surface.width*surface.height*4);if(gl)gl.readPixels(0,0,surface.width,surface.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);else pixels.set(fallbackCanvas.getContext('2d').getImageData(0,0,surface.width,surface.height).data);let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>20)visible++;return {visible,count:pointCount};};\n`+s.slice(i));}
    if(file.endsWith('/js/random-galaxy-emergence.js')){const s=b.toString(),i=s.lastIndexOf('})();');b=Buffer.from(s.slice(0,i)+`window.__emDepth=()=>{
      const previous=worlds,view={...camera};Object.assign(camera,{cx:.5,cy:.5,cz:.5,r:1.35});
      const w=new M.World('boids',731,true),b=basis();w.n=2;w.selected=0;
      for(let j=0;j<2;j++){const along=j?.2:-.2;w.x[j]=.5+b.forward[0]*along;w.y[j]=.5+b.forward[1]*along;w.z[j]=.5+b.forward[2]*along;w.vx[j]=b.right[0];w.vy[j]=b.right[1];w.vz[j]=b.right[2];}
      worlds=[w];const read=()=>{const r=rect(0),p=new Uint8Array(4),x=Math.floor((r.x+r.w/2)*dpr),y=Math.floor((r.y+r.h/2)*dpr);if(gl)gl.readPixels(x,surface.height-1-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);else p.set(fallbackCanvas.getContext('2d').getImageData(x,y,1,1).data);return [...p];};
      w.n=1;draw();const near=read();w.n=2;draw();const occluded=read(),sizes=[points[2],points[12]],depth=!!gl&&gl.isEnabled(gl.DEPTH_TEST);worlds=previous;Object.assign(camera,view);dirty=true;return {near,occluded,sizes,depth};
    };\n`+s.slice(i));}
    const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(b);
  }catch(e){res.writeHead(404).end();}
});
const snap=page=>page.evaluate(()=>GXEmergence.snapshot());const pass=s=>process.stdout.write('PASS '+s+'\n');
async function open(context,link=''){
  await context.route('https://www.googletagmanager.com/**',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED')||m.text().startsWith('Emergence sprite renderer:'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/random-galaxy.html'+link);await page.waitForFunction(()=>document.getElementById('galaxy-wrapper').getAttribute('aria-busy')==='false');return page;
}
async function select(page,id){await page.locator('select[aria-label="Emergence scene"]').selectOption(id,{force:true});await page.waitForFunction(id=>GXEmergence.snapshot().id===id&&GXEmergence.snapshot().worlds[0].steps>0,id);}
async function fit(page){
  const r=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return{panel:box(document.querySelector('.gx-panel')),view:box(document.querySelector('.gx-view')),canvas:box(document.querySelector('.em-surface')),page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],viewport:[innerWidth,innerHeight],buttons:[...document.querySelectorAll('.gx-panel button')].filter(e=>e.getBoundingClientRect().height).map(box),textFits:[...document.querySelectorAll('#em-presets span')].every(s=>{const b=s.parentElement.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(s);return [...range.getClientRects()].every(r=>r.x>=b.x&&r.right<=b.right&&r.y>=b.y&&r.bottom<=b.bottom);})};});
  assert.ok(r.page[0]<=r.viewport[0]+1&&r.page[1]<=r.viewport[1]+1);assert.ok(r.viewport[0]>900?r.panel.right<=r.view.x+1:r.panel.bottom<=r.view.y+1);assert.ok(r.view.height>=120);
  for(const b of r.buttons){assert.ok(b.height>=44&&b.width>=44);assert.ok(b.x>=0&&b.y>=0&&b.right<=r.viewport[0]+1&&b.bottom<=r.viewport[1]+1);}
  assert.ok(r.canvas.height>=120&&r.textFits);
  if((await snap(page)).id==='ants')await page.waitForFunction(()=>{const g=__emGeometry();return Math.abs(g.aspect-g.r.w/g.r.h)<.001;});
}
async function presets(page,id){
  const labels=id==='boids'?['Murmuration','Two flocks','Independent birds']:['Open foraging','Around the wall','Two routes'];
  assert.deepEqual(await page.locator('#em-presets button').allTextContents(),labels);
  assert.equal(await page.locator('#gx-emergence-controls button').count(),3);
  assert.equal(await page.locator('#gx-emergence-controls input, #gx-emergence-controls select, #em-lab, #em-pause, #em-restart, #em-lab-open').count(),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('#em-presets img')].every(i=>i.complete&&i.naturalWidth===320));
  const keys=await page.locator('#em-presets button').evaluateAll(bs=>bs.map(b=>b.dataset.preset));
  for(const key of keys){
    await page.locator('#em-presets button[data-preset="'+key+'"]').click();
    await page.waitForFunction(key=>GXEmergence.snapshot().worlds[0].preset===key&&GXEmergence.snapshot().worlds[0].steps>0,key);
    const a=await snap(page);assert.ok(a.worlds[0].finite);assert.equal(a.worlds.length,1);
    assert.equal(await page.locator('#em-presets button[aria-pressed="true"]').getAttribute('data-preset'),key);
    await page.waitForTimeout(100);assert.ok((await snap(page)).worlds[0].steps>a.worlds[0].steps);
  }
  // The active preset can begin again without a separate Restart control.
  await page.evaluate(()=>{for(let i=0;i<120;i++)__emModel().step(1/30);});assert.ok((await snap(page)).worlds[0].time>4);
  await page.locator('#em-presets button[aria-pressed="true"]').click();assert.ok((await snap(page)).worlds[0].time<1);
  await page.locator('#em-presets button').first().focus();await page.keyboard.press('Enter');assert.equal((await snap(page)).worlds[0].preset,keys[0]);
}
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:path.join(require('node:os').homedir(),'.local/bin/agent-chrome-for-testing'),args:['--enable-unsafe-webgpu']});
  for(const phone of [false,true]){
    const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1512,height:692},hasTouch:phone,isMobile:phone});const page=await open(context);
    assert.equal(await page.locator('#gx-watch-category option[value="space"]').count(),0);assert.equal(await page.locator('select[aria-label="Emergence scene"] option:not(:disabled)').count(),2);
    for(const id of ['boids','ants']){
      await select(page,id);await presets(page,id);await fit(page);
      const pixels=await page.evaluate(()=>__emPixels());assert.ok(pixels.visible>40&&pixels.count>100,id+' sprites disappeared');
      if(id==='boids'){const d=await page.evaluate(()=>__emDepth());assert.ok(d.depth);assert.deepEqual(d.near,d.occluded);assert.ok(d.near[3]>200&&d.sizes[0]/1.7>d.sizes[1]*1.3);}
      else{const g=await page.evaluate(()=>__emGeometry());assert.ok(g.r.x<20&&g.width-g.r.x-g.r.w<20);assert.ok(g.height-g.r.y-g.r.h<=35);assert.ok(Math.abs(g.r.w/g.spanX-g.r.h/g.spanY)<.01);}
      const a=await snap(page);await page.locator('.em-surface').focus();await page.keyboard.press('Space');await page.keyboard.press('l');await page.keyboard.press('r');await page.keyboard.press('Enter');await page.waitForTimeout(120);
      const b=await snap(page);assert.equal(b.paused,false);assert.ok(b.worlds[0].steps>a.worlds[0].steps);assert.deepEqual(b.worlds[0].p,a.worlds[0].p);assert.equal(b.worlds[0].preset,a.worlds[0].preset);assert.equal(b.worlds[0].walls,a.worlds[0].walls);assert.equal(b.worlds[0].food.length,a.worlds[0].food.length);
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>!__gxActivity().loopRunning);const sleeping=await snap(page);await page.waitForTimeout(130);assert.deepEqual(await snap(page),sleeping);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>__gxActivity().loopRunning);
      const box=await page.locator('.em-surface').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();const held=await snap(page);await page.mouse.move(box.x+box.width*.56,box.y+box.height*.53);const dragged=await snap(page);await page.mouse.up();
      if(id==='boids'){assert.notEqual(dragged.camera.az,held.camera.az);await page.waitForTimeout(65);const released=await snap(page);assert.ok(released.camera.az>dragged.camera.az&&released.camera.az-dragged.camera.az<.025);assert.equal(released.camera.el,dragged.camera.el);}
      else assert.ok(dragged.camera.cx<held.camera.cx);
      const beforeZoom=await snap(page);await page.mouse.wheel(0,-100);await page.waitForTimeout(80);const zoomed=await snap(page);assert.ok(id==='boids'?zoomed.camera.r<beforeZoom.camera.r:zoomed.camera.zoom>beforeZoom.camera.zoom);
      if(phone){const before=await snap(page),cdp=await context.newCDPSession(page),x=box.x+box.width*.5,y=box.y+box.height*.5;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-18,y},{x:x+18,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-32,y},{x:x+32,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();const after=await snap(page);assert.ok(id==='boids'?after.camera.r<before.camera.r:after.camera.zoom>before.camera.zoom);assert.equal(after.worlds[0].food.length,before.worlds[0].food.length);assert.equal(after.worlds[0].walls,before.worlds[0].walls);}
      for(const [width,height]of (phone?[[320,568],[360,640],[390,844],[568,320],[667,375],[740,360],[844,390]]:[[901,320],[901,600],[1024,768],[1280,600],[1512,692],[1920,1080]])){await page.setViewportSize({width,height});await fit(page);}
      pass((phone?'phone ':'desktop ')+id+' has only three working presets, visible sprites, responsive fit, view gestures and sleep');
    }
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>!__gxActivity().loopRunning);const hidden=await snap(page);await page.waitForTimeout(140);assert.deepEqual(await snap(page),hidden);await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
    await page.evaluate(()=>document.getElementById('galaxy-wrapper').style.transform='translateY(-200vh)');await page.waitForFunction(()=>!__gxActivity().loopRunning);const offscreen=await snap(page);await page.waitForTimeout(140);assert.deepEqual(await snap(page),offscreen);await page.evaluate(()=>document.getElementById('galaxy-wrapper').style.transform='');await page.waitForFunction(()=>__gxActivity().loopRunning);
    await page.evaluate(()=>document.getElementById('galaxy-wrapper').requestFullscreen=()=>Promise.reject(Error('test pseudo fullscreen')));await page.locator('.em-surface').focus();await page.keyboard.press('f');await page.waitForFunction(()=>document.getElementById('galaxy-wrapper').classList.contains('gx-pseudo-fs'));await fit(page);await page.keyboard.press('h');assert.equal(await page.locator('#galaxy-wrapper').evaluate(e=>e.classList.contains('gx-clean')),true);await page.keyboard.press('h');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('galaxy-wrapper').classList.contains('gx-pseudo-fs'));
    await page.locator('#gx-explore-tab').click();assert.equal(await page.locator('#gx-emergence-controls').isVisible(),false);await select(page,'boids');assert.equal(await page.locator('#em-presets button').count(),3);
    pass((phone?'phone ':'desktop ')+'fullscreen, category switching and hidden/offscreen sleep');await context.close();
  }
  const legacy=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const hash='#em='+encodeURIComponent(JSON.stringify({v:1,id:'ants',preset:'detour',seed:999,p:{following:0},food:[{x:.3,y:.2,capacity:7}]}));const linked=await open(legacy,hash);await linked.waitForFunction(()=>GXEmergence.snapshot().id==='ants'&&GXEmergence.snapshot().worlds[0].steps>0);const state=await snap(linked);assert.equal(state.worlds[0].preset,'detour');assert.equal(state.worlds[0].food.length,3);assert.equal(state.worlds[0].p.following,1.8);assert.equal(await linked.locator('#em-presets button').count(),3);await legacy.close();pass('Older shared links open a known preset with the simplified controls');
  for(const noGL of [false,true]){
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await context.addInitScript(noGL=>{Object.defineProperty(navigator,'gpu',{value:undefined});if(noGL){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};}},noGL);const page=await open(context);
    for(const id of ['boids','ants']){await select(page,id);await presets(page,id);await fit(page);assert.ok((await page.evaluate(()=>__emPixels())).visible>40);if(id==='boids'){const d=await page.evaluate(()=>__emDepth());assert.deepEqual(d.near,d.occluded);}}
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const stopped=await snap(page);await page.waitForTimeout(160);assert.deepEqual(await snap(page),stopped);await context.close();pass('All six presets animate and sleep '+(noGL?'with Canvas fallback':'without WebGPU'));
  }
  assert.deepEqual(errors,[]);pass('No script, shader or GPU errors');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
