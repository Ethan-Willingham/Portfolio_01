/* Own one browser and one ephemeral HTTP server; close both even on failures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const destination = process.env.ENOUGH_SCREENSHOTS || '/Users/ethan/Portfolio_01/research/enough/screenshots';
const errors = [], failures = [];
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const p = path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if (!p.startsWith(root+path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'}); res.end(fs.readFileSync(p)); }
  catch { failures.push(new URL(req.url,'http://localhost').pathname);res.writeHead(404).end(); }
});
let browser;
(async()=>{try{
  fs.mkdirSync(destination,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser = await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',args:['--disable-gpu-vsync','--disable-frame-rate-limit']});
  const url = 'http://127.0.0.1:'+server.address().port;
  for (const width of [375,768,1440]) {
    const context=await browser.newContext({viewport:{width,height:width===375?812:900},hasTouch:width===375,isMobile:width===375,deviceScaleFactor:1});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'/enough.html');await page.waitForFunction(()=>document.querySelectorAll('.enough-card').length===EnoughData.curves.length);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
    if(process.env.ENOUGH_CAPTURE_ONLY){await page.screenshot({path:path.join(destination,width+'-top.png')});await page.screenshot({path:path.join(destination,width+'-page.png'),fullPage:true});await context.close();continue;}
    assert.equal(await page.locator('.enough-card').count(),13);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
    const clipped=await page.locator('.enough-chart svg text').evaluateAll(els=>els.filter(el=>{const b=el.getBBox();return b.x<-.5||b.x+b.width>el.ownerSVGElement.viewBox.baseVal.width+.5;}).map(el=>el.textContent));
    assert.deepEqual(clipped,[],'All chart labels fit their viewBox');
    assert.ok(await page.locator('.enough-detail summary').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),'Evidence touch targets at least 44px');
    if(width===375)assert.equal(await page.locator('.enough-card').first().evaluate(el=>Math.round(el.getBoundingClientRect().left)),20,'Site mobile gutter');
    const range=page.locator('#range-steps');await range.focus();const before=await range.inputValue();await page.keyboard.press('ArrowRight');assert.notEqual(await range.inputValue(),before,'Keyboard changes dose');
    assert.match(await range.getAttribute('aria-valuetext'),/gain|risk|baseline|unknown|curve|years|score/i);
    for(const c of await page.evaluate(()=>EnoughData.curves.filter(c=>c.kind!=='unknown').map(c=>({id:c.id,min:c.domain[0],max:c.domain[1]})))){
      const slider=page.locator('#range-'+c.id);await slider.focus();await page.keyboard.press('ArrowRight');assert.match(await slider.getAttribute('aria-valuetext'),/gain|risk|baseline|unknown|curve|years|score/i,'Every slider has a keyboard readout');await slider.evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));},c.max);
      assert.ok(!(await page.locator('#readout-'+c.id).textContent()).match(/NaN|undefined|Infinity/),'Finite readable end point '+c.id);
      await slider.evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));},c.min);
      assert.ok(!(await page.locator('#readout-'+c.id).textContent()).match(/NaN|undefined|Infinity/));
    }
    await page.locator('#steps summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#steps details').getAttribute('open'),'');await page.keyboard.press('Enter');
    // Owned browser mouse path approximates horizontal touch via the same native range.
    await range.scrollIntoViewIfNeeded();const box=await range.boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height/2,{steps:12});await page.mouse.up();assert.ok(Number(await range.inputValue())>4000,'Pointer drag changes amount');
    if(width===375){
      await range.scrollIntoViewIfNeeded();const b=await range.boundingBox(),touch=await context.newCDPSession(page),old=await range.inputValue();
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.25,y:b.y+b.height/2}]});
      for(let i=1;i<=8;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*(.25+.5*i/8),y:b.y+b.height/2}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await range.inputValue(),old,'Touch drag changes amount');await touch.detach();
    }
    await page.locator('.personal-inputs summary').click();
    const fields=['steps','sleep','exercise','protein','weight','work','fruit-veg'];
    for(const name of fields)await page.locator('[name="'+name+'"]').fill(name==='weight'?'150':name==='protein'?'105':name==='steps'?'7000':name==='sleep'?'7':name==='work'?'40':name==='fruit-veg'?'5':'150');
    assert.equal(await page.locator('.personal-row').count(),6,'Every optional result');
    await page.locator('button[type=reset]').click();await page.waitForFunction(()=>document.querySelector('#enough-results').textContent==='');
    for(const name of ['steps','sleep','exercise','work','fruit-veg']){await page.locator('[name="'+name+'"]').fill(name==='steps'?'3500':name==='sleep'?'8':name==='work'?'50':name==='fruit-veg'?'5':'75');assert.equal(await page.locator('.personal-row').count(),1,'Single input '+name);await page.locator('button[type=reset]').click();try{await page.waitForFunction(()=>document.querySelector('#enough-results').textContent==='',{},{timeout:3000});}catch(e){throw new Error('Reset '+name+': '+await page.locator('#enough-results').textContent());}}
    await page.locator('[name="protein"]').fill('100');assert.match(await page.locator('#enough-results').textContent(),/body weight/);await page.locator('[name="weight"]').fill('0');assert.equal(await page.locator('.enough-error').count(),1);await page.locator('button[type=reset]').click();
    const master=page.locator('#overview-effort');await master.focus();await page.keyboard.press('Home');assert.match(await page.locator('#overview-message').textContent(),/0%/);await page.keyboard.press('End');assert.match(await page.locator('#overview-message').textContent(),/100%/);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.enough-card').length===13);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(destination,width+'-top.png')});
    await page.screenshot({path:path.join(destination,width+'-page.png'),fullPage:true});
    await page.locator('#protein summary').click();await page.locator('#protein').screenshot({path:path.join(destination,width+'-protein-detail.png')});
    const snapshot=await page.locator('#steps').ariaSnapshot();assert.match(snapshot,/slider.*How much walking/i,'Accessible slider name');assert.match(snapshot,/Evidence and limits/);
    const badLabels=await page.locator('input').evaluateAll(els=>els.filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')).map(el=>el.id));assert.deepEqual(badLabels,[],'All inputs named');
    await context.close();console.log('PASS '+width+' px, drag, keyboard, details, optional inputs and named accessibility tree');
  }
  const lab=await browser.newPage();lab.on('pageerror',e=>errors.push(e.message));await lab.goto(url+'/enough-lab.html');assert.equal(await lab.locator('select').count(),3);await lab.locator('#lab-painting').selectOption('homer');await lab.locator('#lab-layout').selectOption('rings');await lab.locator('#lab-colors').selectOption('quiet');await lab.waitForFunction(()=>document.querySelector('iframe').src.includes('homer')&&document.querySelector('iframe').src.includes('rings'));
  assert.deepEqual(errors,[],'No JavaScript errors');assert.deepEqual(failures,[],'No missing local resources');console.log('PASS chooser, errors and local resources');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
