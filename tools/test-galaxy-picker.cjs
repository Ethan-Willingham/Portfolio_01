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
  const selected=document.querySelector('#gx-scene-select').value,s=__gxTest.state();
  return s.pending===null&&(s.field===selected||selected==='grid'&&s.morph<.03||selected==='mulberry'&&['random','mulberry'].includes(s.field));
 },null,{timeout:12000}).catch(async e=>{process.stdout.write(JSON.stringify({label,state:await state(page),selected:await page.locator('#gx-scene-select').inputValue()})+'\n');throw e;});
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
  await page.waitForFunction(()=>__gxTest.state().morph>.97||document.querySelector('#gx-scene-select').value==='grid'&&__gxTest.state().morph<.03);
  await page.screenshot({path:path.join(out,'layout-'+label.replace(/[^a-z0-9-]/gi,'-')+'.png')});
 }
}
async function close(page){
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('gx-picker-dialog').open&&[...document.querySelectorAll('.gx-picker-trigger')].every(e=>e.getAttribute('aria-expanded')==='false'));
}
async function choose(page,value){
 await page.locator('.gx-picker-trigger').click();
 await page.locator('#gx-picker-dialog .gx-picker-card[data-value="'+value+'"]').click();
 await page.waitForFunction(()=>!document.getElementById('gx-picker-dialog').open);
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || path.join(require('node:os').homedir(),'.local/bin/agent-chrome-for-testing'),args:['--enable-unsafe-webgpu']});
 for(const mobile of (process.env.PHONE_ONLY?[true]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},isMobile:mobile,hasTouch:mobile});const page=await setup(context);
  const trigger=page.locator('.gx-picker-trigger');
  check('one scene chooser replaces modes and categories',await trigger.count()===1&&await page.locator('[role="tablist"],.gx-category-select').count()===0);
  if(!process.env.LAYOUT_ONLY){
   const groups=await page.locator('#gx-scene-select optgroup').evaluateAll(es=>es.map(e=>({category:e.dataset.category,options:[...e.children].map(o=>({value:o.value,label:o.textContent}))})));
   const total=groups.reduce((n,g)=>n+g.options.length,0);
   for(const group of groups){
    const choices=mobile&&group.category==='pathfinding'?group.options.filter(o=>['astar','dfs'].includes(o.value))
      :mobile&&group.category==='patterns'?group.options.filter(o=>['boids','ants','grid','lorenz','sierpinski','collatz','harmonics'].includes(o.value))
      :mobile?[group.options.at(-1)]:group.options;
    for(const option of choices){
     await trigger.click();const dialog=page.locator('#gx-picker-dialog');
     check((mobile?'phone ':'desktop ')+option.label+' is directly available',await dialog.locator('.gx-picker-card').count()===total);
     const card=dialog.locator('.gx-picker-card[data-value="'+option.value+'"]');await card.scrollIntoViewIfNeeded();
     await page.waitForFunction(v=>{const img=document.querySelector('#gx-picker-dialog .gx-picker-card[data-value="'+v+'"] img');return img.complete&&img.naturalWidth===320;},option.value);
     await card.click();
     const field=option.value==='grid'||option.value==='mulberry'?'random':option.value;
     await page.waitForFunction(f=>(__gxTest.state().field===f||f==='random'&&__gxTest.state().field==='mulberry')&&__gxTest.state().pending===null,field,{timeout:15000});
     check('picture selects '+option.label,(await trigger.locator('.gx-picker-value').textContent())===option.label);
     if(group.category==='sorting'){
      const result=await page.evaluate(()=>__gxTest.finishSort());
      check(option.label+' sorts all 64 rings',result.n===64&&result.total===48000&&result.ordered);
     }
     if(['boids','ants'].includes(option.value)){
      await page.waitForFunction(()=>GXEmergence.snapshot().worlds[0].steps>0);
      const before=await page.evaluate(()=>GXEmergence.snapshot());await page.waitForTimeout(150);
      const after=await page.evaluate(()=>GXEmergence.snapshot());
      check(option.label+' animates a finite world',after.worlds[0].finite&&after.worlds[0].steps>before.worlds[0].steps);
     }
    }
   }
   await choose(page,'bfs');await trigger.click();await page.keyboard.press('Home');check('Home focuses the first scene',await page.evaluate(()=>document.activeElement.dataset.value==='bfs'));
   await page.keyboard.press('End');check('End reaches the final scene',await page.evaluate(()=>document.activeElement.dataset.value==='harmonics'));
   await page.keyboard.press('ArrowLeft');check('arrow keys navigate picture choices',await page.evaluate(()=>document.activeElement.dataset.value==='lotus'));
   await page.keyboard.press('Enter');await page.waitForFunction(()=>__gxTest.state().field==='lotus');check('Enter picks the focused scene',(await trigger.locator('.gx-picker-value').textContent())==='Lotus');
   await trigger.click();await close(page);check('Escape restores focus without changing scenes',await trigger.evaluate(e=>e===document.activeElement&&e.getAttribute('aria-expanded')==='false')&&(await page.locator('#gx-scene-select').inputValue())==='lotus');
   await trigger.click();await page.mouse.click(2,2);await page.waitForFunction(()=>!document.getElementById('gx-picker-dialog').open);check('backdrop closes the gallery',true);
   await trigger.click();await page.getByRole('searchbox',{name:'Find a scene'}).fill('food');
   check('search finds scenes by their description',await page.locator('.gx-picker-card:visible').count()===1&&await page.locator('.gx-picker-card:visible').getAttribute('data-value')==='ants');
   await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForFunction(()=>GXEmergence.active);check('search result opens directly',await page.locator('#gx-scene-select').inputValue()==='ants');
   await trigger.click();check('reopening clears search and marks current scene',await page.locator('.gx-picker-card:visible').count()===total&&await page.locator('.gx-picker-card[aria-pressed="true"]').getAttribute('data-value')==='ants');
   await page.getByRole('searchbox').fill('no-such-scene');check('empty search offers a recovery',await page.locator('.gx-picker-card:visible').count()===0&&await page.getByText('No scenes found. Try another name.').isVisible());
   await page.getByRole('searchbox').fill('sort');check('category words find matching scenes',await page.locator('.gx-picker-card:visible').count()===6);
   await page.locator('#gx-picker-dialog').getByRole('button',{name:'Close',exact:true}).click();
  }
  const sizes=mobile?[[320,568],[360,640],[390,844],[568,320],[667,375],[844,390]]:[[1920,1080],[1512,692],[1280,600],[1024,768],[901,320],[900,700],[800,600]];
  for(const [width,height]of sizes){
   await page.setViewportSize({width,height});await choose(page,'quick');await workspaceFit(page,width+'x'+height+' Sorting');
   await trigger.click();await modalFit(page,width+'x'+height+' gallery');await close(page);
   await choose(page,'bfs');await workspaceFit(page,width+'x'+height+' Pathfinding');
   await choose(page,'boids');await workspaceFit(page,width+'x'+height+' Birds');
   await choose(page,'mulberry');await workspaceFit(page,width+'x'+height+' Stars');
  }
  if(process.env.SNAPSHOTS){
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1512,height:900});await choose(page,'bfs');await trigger.click();await page.keyboard.press('Home');
   await page.screenshot({path:path.join(out,'gallery-'+(mobile?'phone':'desktop')+'.png')});await close(page);
  }
  await page.evaluate(()=>{document.getElementById('galaxy-wrapper').requestFullscreen=()=>Promise.reject(new Error('fallback test'));});
  await page.locator('#galaxy-fly').click();await page.waitForFunction(()=>document.getElementById('galaxy-wrapper').classList.contains('gx-pseudo-fs'));
  await trigger.click();await modalFit(page,'fullscreen');await close(page);
  await context.close();
 }
 const fallbackContext=await browser.newContext({viewport:{width:1366,height:768}});await fallbackContext.route('**/js/random-galaxy-picker.js*',r=>r.abort());
 const fallback=await setup(fallbackContext);check('one native selector remains as the fallback',await fallback.getByLabel('Choose a scene',{exact:true}).isVisible());
 await fallback.getByLabel('Choose a scene',{exact:true}).selectOption('quick');await fallback.waitForFunction(()=>__gxTest.state().field==='quick');
 await fallback.getByLabel('Choose a scene',{exact:true}).selectOption('lorenz');await fallback.waitForFunction(()=>__gxTest.state().field==='lorenz');check('native fallback selects across scene families',true);
 await fallbackContext.close();check('no browser or GPU errors',errors.length===0);
}catch(e){process.stderr.write(e.stack+'\n'+JSON.stringify(errors)+'\n');process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
