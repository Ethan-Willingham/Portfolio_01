// NODE_PATH=/path/to/node_modules node tools/test-galaxy-picker.cjs
// Real image selection, keyboard navigation, mobile fit, fullscreen, and native fallback.
// Test-only scene state is injected by this server, never shipped to readers.
// The owned Chrome for Testing process is closed in finally.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.DUMP || '/tmp/galaxy-picker-qa';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + req.url.split('?')[0]);
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('/js/random-galaxy.js')) {
      let src=data.toString(); const at=src.lastIndexOf('})();');
      src=src.slice(0,at) + `window.__gxTest = {
        state: () => ({ field:currentField, pending:pendingField, running, loopRunning, morph, speed:flightSpeed, searchSteps:SEARCH_STEPS, sortSteps:SORT_STEPS, camera:[...camPos], orbit:[srAz,srEl,srR] }),
        life: () => {
          var sample=[], finite=true, inFrame=true, active=0, rt=vnorm(vcross(camFwd,camUp)), f=Math.tan(25*Math.PI/180);
          for(var i=0;i<lifeDrawCount;i+=Math.max(1,Math.floor(lifeDrawCount/180))){
            var p=Array.from(positions.slice(i*4,i*4+4)); sample.push(...p); finite=finite&&p.every(Number.isFinite);
            if(p[3]<0)continue;active++;
            var d=p.slice(0,3).map((x,j)=>x-camPos[j]),dot=v=>d.reduce((s,x,j)=>s+x*v[j],0),depth=dot(camFwd);
            inFrame=inFrame&&depth>0&&Math.abs(dot(rt)/depth/f/aspect)<1&&Math.abs(dot(camUp)/depth/f)<1;
          }
          return {sample,finite,inFrame,active,count:lifeDrawCount};
        },
        finishSort: () => { sortBuildOps();while(sr.opPtr<sr.ops.length)sortStep();return {n:sr.n,total:sr.total,ordered:Array.from(sr.cur).every((v,i)=>v===i)}; }
      };\n` +src.slice(at);
      data=Buffer.from(src);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(data);
  } catch {res.writeHead(404).end();}
});
let browser;
function check(label,condition) { assert.ok(condition,label); process.stdout.write('PASS '+label+'\n'); }
async function state(page) {return page.evaluate(() => __gxTest.state());}

async function setup(context) {
  await context.route('https://www.googletagmanager.com/**', r=>r.abort());
  const page=await context.newPage();
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/random-galaxy.html');
  await page.waitForFunction(()=>window.__gxTest && __gxTest.state().running);
  await page.evaluate(()=>document.fonts.ready);
  return page;
}
async function modalFit(page,label){
 const a=await page.evaluate(()=>{
  const d=document.getElementById('gx-picker-dialog'),g=d.querySelector('.gx-picker-grid'),h=d.querySelector('.gx-picker-header');
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height};};
  return {dialog:box(d),grid:box(g),header:box(h),close:box(h.querySelector('button')),width:innerWidth,height:innerHeight,pageW:document.documentElement.scrollWidth,pageH:document.documentElement.scrollHeight,scrollW:g.scrollWidth,clientW:g.clientWidth,coarse:matchMedia('(pointer:coarse)').matches};
 });
 check(label+' gallery stays inside the screen',a.dialog.x>=0&&a.dialog.y>=0&&a.dialog.r<=a.width&&a.dialog.b<=a.height);
 check(label+' gallery scroll is contained',a.pageW<=a.width&&a.pageH<=a.height&&a.scrollW<=a.clientW+1&&a.grid.b<=a.dialog.b&&a.grid.y>=a.header.b);
 if(a.coarse)check(label+' Close is a touch target',a.close.w>=44&&a.close.h>=44);
}
async function workspaceFit(page,label){
 await page.waitForFunction(()=>{
  const selected=document.querySelector('.gx-scene-field[data-active="true"] .gx-cat-select').value,s=__gxTest.state();
  return s.pending===null&&(s.field===selected||selected==='grid'&&s.morph<.03||selected==='mulberry'&&['random','mulberry'].includes(s.field));
 },null,{timeout:12000}).catch(async e=>{process.stdout.write(JSON.stringify({label,state:await state(page),selected:await page.locator('.gx-scene-field[data-active="true"] select').inputValue()})+'\n');throw e;});
 await page.waitForTimeout(180);
 const a=await page.evaluate(()=>{
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height};};
  const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
  const app=document.getElementById('galaxy-wrapper'),panel=app.querySelector('.gx-panel'),view=app.querySelector('.gx-view');
  const controls=[...app.querySelectorAll('button,select,a')].filter(visible).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),...box(e)}));
  return {app:box(app),panel:box(panel),view:box(view),canvas:box(document.getElementById('galaxy-canvas')),controls,
   scrollW:panel.scrollWidth,clientW:panel.clientWidth,scrollH:panel.scrollHeight,clientH:panel.clientHeight,
   width:innerWidth,height:innerHeight,pageW:document.documentElement.scrollWidth,pageH:document.documentElement.scrollHeight,coarse:matchMedia('(pointer:coarse)').matches};
 });
 const issues=[];
 if(a.width>900){if(a.panel.r>a.view.x+1||Math.abs(a.panel.y-a.view.y)>1)issues.push('desktop controls left their sidebar');}
 else if(a.panel.b>a.view.y+1)issues.push('narrow-screen controls are below the scene');
 if(a.pageW>a.width+1||a.pageH>a.height+1||a.app.x!==0||a.app.y!==0||Math.abs(a.app.r-a.width)>1||Math.abs(a.app.b-a.height)>1)issues.push('workspace does not fit viewport');
 if(a.scrollW>a.clientW+1||a.scrollH>a.clientH+1)issues.push('controls overflow their panel');
 if(a.canvas.w<150||a.canvas.h<120)issues.push('scene canvas too small');
 for(const b of a.controls){
  if(b.x<-.5||b.y<-.5||b.r>a.width+.5||b.b>a.height+.5)issues.push('clipped '+b.name);
  if(a.coarse&&(b.w<43.5||b.h<43.5))issues.push('small touch target '+b.name);
 }
 for(let i=0;i<a.controls.length;i++)for(let j=i+1;j<a.controls.length;j++){
  const x=a.controls[i],y=a.controls[j];
  if(Math.min(x.r,y.r)-Math.max(x.x,y.x)>2&&Math.min(x.b,y.b)-Math.max(x.y,y.y)>2)issues.push('overlapping '+x.name+' / '+y.name);
 }
 if(issues.length)process.stdout.write(JSON.stringify({label,...a,issues})+'\n');
 check(label+' controls stay beside or above the scene and fit',issues.length===0);
 if(process.env.SNAPSHOTS&&/1512x692|390x844|568x320/.test(label)){
  await page.waitForFunction(()=>__gxTest.state().morph>.97||document.querySelector('.gx-scene-field[data-active="true"] .gx-cat-select').value==='grid'&&__gxTest.state().morph<.03);
  await page.screenshot({path:path.join(out,'layout-'+label.replace(/[^a-z0-9-]/gi,'-')+'.png')});
 }
}
async function close(page){
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('gx-picker-dialog').open&&[...document.querySelectorAll('.gx-picker-trigger')].every(e=>e.getAttribute('aria-expanded')==='false'));
}
async function category(page,mode,value){
 await page.locator('#gx-'+mode+'-tab').click();
 await page.locator('#gx-'+mode+'-scenes .gx-category-field .gx-picker-trigger').click();
 await page.locator('#gx-picker-dialog .gx-picker-card[data-value="'+value+'"]').click();
 await page.waitForFunction(()=>!document.getElementById('gx-picker-dialog').open);
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || path.join(require('node:os').homedir(),'.local/bin/agent-chrome-for-testing'),args:['--enable-unsafe-webgpu']});
 for(const mobile of (process.env.PHONE_ONLY?[true]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},isMobile:mobile,hasTouch:mobile});const page=await setup(context);
  if(!process.env.LAYOUT_ONLY){
  const groups=await page.locator('.gx-scene-field').evaluateAll(es=>es.map(e=>({category:e.dataset.category,mode:e.closest('.gx-group').id==='gx-watch-scenes'?'watch':'explore',options:[...e.querySelector('select').options].filter(o=>o.value).map(o=>({value:o.value,label:o.textContent}))})));
  for(const group of groups){
   await category(page,group.mode,group.category);
   const trigger=page.locator('.gx-scene-field[data-category="'+group.category+'"] .gx-picker-trigger');
   const choices=mobile&&group.category==='pathfinding'?group.options.filter(o=>['astar','dfs'].includes(o.value))
     :mobile&&!['emergence','space'].includes(group.category)?[group.options.at(-1)]:group.options;
   for(const option of choices){
    await trigger.click();const dialog=page.locator('#gx-picker-dialog');
    check((mobile?'phone ':'desktop ')+group.category+' shows every preview',(await dialog.locator('.gx-picker-card').count())===group.options.length);
    const card=dialog.locator('.gx-picker-card[data-value="'+option.value+'"]');await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(v=>{const img=document.querySelector('#gx-picker-dialog .gx-picker-card[data-value="'+v+'"] img');return img.complete&&img.naturalWidth===320;},option.value);
    await card.click();
    const field=option.value==='grid'||option.value==='mulberry'?'random':option.value;
    await page.waitForFunction(f=>(__gxTest.state().field===f||f==='random'&&__gxTest.state().field==='mulberry')&&__gxTest.state().pending===null,field,{timeout:15000});
    check('picture selects '+option.label,(await trigger.locator('.gx-picker-value').textContent())===option.label);
    if(process.env.SNAPSHOTS&&['astar','dfs'].includes(option.value)){
      await page.waitForFunction(()=>__gxTest.state().morph>.99);await page.waitForTimeout(1000);
      await page.screenshot({path:path.join(out,option.value+'-'+(mobile?'phone':'desktop')+'.png')});
    }
    if(group.category==='sorting'){
      const result=await page.evaluate(()=>__gxTest.finishSort());
      check(option.label+' sorts all 64 rings',result.n===64&&result.total===48000&&result.ordered);
    }
    if(group.category==='emergence'){
      await page.waitForFunction(()=>GXEmergence.snapshot().worlds[0].steps>0);
      const before=await page.evaluate(()=>GXEmergence.snapshot());await page.waitForTimeout(150);
      const after=await page.evaluate(()=>GXEmergence.snapshot());
      check(option.label+' animates a finite world',after.worlds[0].finite&&after.worlds[0].steps>before.worlds[0].steps);
    }
    if(option.value==='saturn'){
      await page.waitForFunction(()=>__gxTest.state().morph>.99);
      const before=await page.evaluate(()=>__gxTest.life());await page.waitForTimeout(800);
      const after=await page.evaluate(()=>__gxTest.life());
      check(option.label+' animates valid points',after.count>1000&&after.finite&&JSON.stringify(before.sample)!==JSON.stringify(after.sample));
      check(option.label+' fits the canvas',after.inFrame&&after.active>0);
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      await page.waitForFunction(()=>!__gxTest.state().loopRunning);
      const paused=await page.evaluate(()=>__gxTest.life());await page.waitForTimeout(250);
      check(option.label+' sleeps when unfocused',JSON.stringify(paused.sample)===JSON.stringify((await page.evaluate(()=>__gxTest.life())).sample));
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(()=>__gxTest.state().loopRunning);
      if(process.env.SNAPSHOTS){
        await page.screenshot({path:path.join(out,option.value+'-'+(mobile?'phone':'desktop')+'.png')});
      }
    }
   }
   if(process.env.SNAPSHOTS&&['pathfinding','sorting','emergence','space'].includes(group.category)){
     await trigger.click();await page.waitForFunction(()=>[...document.querySelectorAll('#gx-picker-dialog img')].every(i=>i.complete&&i.naturalWidth===320));
     await page.screenshot({path:path.join(out,group.category+'-picker-'+(mobile?'phone':'desktop')+'.png')});await close(page);
   }
  }
  // Keyboard navigation and dismissal restore the trigger, without changing the scene.
  await category(page,'watch','pathfinding');const trigger=page.locator('.gx-scene-field[data-category="pathfinding"] .gx-picker-trigger');
  await trigger.click();await page.keyboard.press('Home');check('Home focuses the first scene',await page.evaluate(()=>document.activeElement.dataset.value==='bfs'));
  await page.keyboard.press('End');check('End reaches the final scene',await page.evaluate(()=>document.activeElement.dataset.value==='randomwalk'));
  await page.keyboard.press('ArrowLeft');check('arrow keys navigate picture choices',await page.evaluate(()=>document.activeElement.dataset.value==='dfs'));
  await page.keyboard.press('Enter');await page.waitForFunction(()=>__gxTest.state().field==='dfs');check('Enter picks the focused scene',(await trigger.locator('.gx-picker-value').textContent())==='Depth-first');
  await trigger.click();await close(page);check('Escape restores focus to the picker',await trigger.evaluate(e=>e===document.activeElement&&e.getAttribute('aria-expanded')==='false'));
  await trigger.click();await page.mouse.click(2,2);await page.waitForFunction(()=>!document.getElementById('gx-picker-dialog').open);check('clicking the backdrop closes the picker',true);
  }
  // Keep controls beside or above the scene at resize, zoom, and orientation boundaries.
  const sizes=mobile?[[320,568],[360,640],[375,667],[390,844],[412,915],[568,320],[667,375],[740,360],[844,390]]:[[1920,1080],[1440,900],[1512,692],[1366,768],[1366,701],[1366,700],[1366,650],[1280,600],[1210,550],[1024,768],[901,600],[900,700],[800,600]];
  for(const [width,height]of sizes){
   await page.setViewportSize({width,height});await category(page,'watch','sorting');
   await workspaceFit(page,width+'x'+height+' Sorting');
   await page.locator('.gx-scene-field[data-category="sorting"] .gx-picker-trigger').click();await modalFit(page,width+'x'+height+' Sorting');await close(page);
   await category(page,'watch','pathfinding');await workspaceFit(page,width+'x'+height+' Pathfinding');
   await category(page,'watch','emergence');await workspaceFit(page,width+'x'+height+' Emergence');
   await category(page,'explore','randomness');await workspaceFit(page,width+'x'+height+' Explore');
   await page.locator('#gx-explore-tab').click();await page.locator('#gx-explore-scenes .gx-category-field .gx-picker-trigger').click();await modalFit(page,width+'x'+height+' categories');await close(page);
  }
  // The picture picker also belongs to the fullscreen surface.
  await page.evaluate(()=>{document.getElementById('galaxy-wrapper').requestFullscreen=()=>Promise.reject(new Error('fallback test'));});
  await page.locator('#galaxy-fly').click();await page.waitForFunction(()=>document.getElementById('galaxy-wrapper').classList.contains('gx-pseudo-fs'));
  await page.locator('#gx-explore-scenes .gx-category-field .gx-picker-trigger').click();await modalFit(page,'fullscreen');await close(page);
  await context.close();
 }
 const fallbackContext=await browser.newContext({viewport:{width:1366,height:768}});await fallbackContext.route('**/js/random-galaxy-picker.js*',r=>r.abort());
 const fallback=await setup(fallbackContext);check('native selectors remain as the fallback',await fallback.getByLabel('Watch category',{exact:true}).isVisible());
 await fallback.getByLabel('Watch category',{exact:true}).selectOption('sorting');await fallback.waitForFunction(()=>__gxTest.state().field==='quick');check('native fallback still selects scenes',true);
 await fallbackContext.close();check('no browser or GPU errors',errors.length===0);
}catch(e){process.stderr.write(e.stack+'\n'+JSON.stringify(errors)+'\n');process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
