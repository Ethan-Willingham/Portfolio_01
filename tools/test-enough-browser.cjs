/* Own one browser and one ephemeral HTTP server; close both even on failures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const destination=process.env.ENOUGH_SCREENSHOTS||'/Users/ethan/Portfolio_01/research/enough/screenshots';
const errors=[],failures=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!p.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));}
 catch{failures.push(new URL(req.url,'http://localhost').pathname);res.writeHead(404).end();}
});
let browser;
const ready=async page=>{
 await page.waitForFunction(()=>document.querySelectorAll('.enough-card').length===12);
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
 await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
};
const fullPainting=async page=>assert.ok(await page.locator('#hero-painting').evaluate(img=>{const r=img.getBoundingClientRect();return img.naturalWidth>0&&Math.abs(r.width/r.height-img.naturalWidth/img.naturalHeight)<.01;}),'Full painting at its natural aspect ratio');
const clickFraction=async(page,plot,f)=>{
 await plot.scrollIntoViewIfNeeded();const b=await plot.boundingBox();await page.mouse.click(b.x+42+f*(b.width-54),b.y+80);
};
(async()=>{try{
 fs.mkdirSync(destination,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'});
 const url=process.env.ENOUGH_BASE_URL||'http://127.0.0.1:'+server.address().port;
 for(const width of [375,768,1440]){
  const context=await browser.newContext({viewport:{width,height:width===375?812:900},hasTouch:width===375,isMobile:width===375,deviceScaleFactor:1});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
  await page.goto(url+'/enough.html');await ready(page);await page.screenshot({path:path.join(destination,width+'-top.png')});
  assert.equal(await page.locator('.enough-card').count(),12);
  assert.equal(await page.locator('#meditation,#area-mind,#enough-form,.enough-personal,input').count(),0,'Removed personal panel and Mind section');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
  const clipped=await page.locator('.enough-chart svg text,#overview-chart svg text').evaluateAll(els=>els.filter(el=>{const b=el.getBBox(),v=el.ownerSVGElement.viewBox.baseVal;return b.x<-.5||b.x+b.width>v.width+.5||b.y<-.5||b.y+b.height>v.height+.5;}).map(el=>el.textContent));
  assert.deepEqual(clipped,[],'All axis titles and ticks fit');await fullPainting(page);
  assert.equal(await page.locator('input[type=range]').count(),0,'No visible slider bars');
  assert.equal(await page.locator('.enough-chart[role=slider][tabindex="0"]').count(),12,'Every chart has direct keyboard control');
  assert.equal(await page.locator('.enough-chart .en-x-label').count(),12);assert.equal(await page.locator('.enough-chart .en-y-label').count(),12);
  assert.ok(await page.locator('.enough-detail summary').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),'44px disclosure targets');
  if(width===375)assert.equal(await page.locator('.enough-card').first().evaluate(el=>Math.round(el.getBoundingClientRect().left)),20,'Site mobile gutter');
  const wordCounts=await page.locator('.enough-card details').evaluateAll(els=>els.map(el=>({id:el.closest('article').id,words:el.textContent.trim().split(/\s+/).length})));
  assert.ok(wordCounts.every(c=>c.words<=115),'Each evidence drawer under 115 words: '+JSON.stringify(wordCounts));
  assert.equal(await page.locator('.enough-card details table').count(),0,'Raw tables removed from short drawers');
  assert.equal(await page.locator('.enough-card details a[download]').count(),12,'Full evidence still available');
  assert.ok((await page.locator('.overview-legend').textContent()).trim().split(/\s+/).length<28,'Quiet overview legend');
  assert.deepEqual(await page.locator('.overview-benefit').allTextContents(),['of mortality-risk reduction','of mortality-risk reduction','of muscle growth'],'Overview names each measured outcome');
  assert.match(await page.locator('#protein .en-y-label').textContent(),/muscle growth/);assert.match(await page.locator('#steps .en-y-label').textContent(),/mortality-risk reduction/);
  assert.doesNotMatch(await page.locator('.enough-overview').textContent(),/through each dose range/i,'Removed unclear range phrase');
  assert.equal(await page.locator('#overview-chart .enough-target-key').textContent(),'90% = enough');
  const crowdedTicks=await page.locator('.enough-chart svg,#overview-chart svg').evaluateAll(svgs=>svgs.flatMap(svg=>{
   const ticks=[...svg.querySelectorAll('.en-y-tick')];
   return ticks.flatMap((a,i)=>ticks.slice(i+1).filter(b=>{const x=a.getBBox(),y=b.getBBox();return x.y<y.y+y.height+4&&y.y<x.y+x.height+4;}).map(b=>a.textContent+'/'+b.textContent));
  }));assert.deepEqual(crowdedTicks,[],'Ordinary y-axis labels have at least 4px separation');
  const benefitIds=await page.evaluate(()=>EnoughData.curves.filter(c=>c.view.mode==='benefit').map(c=>c.id));
  for(const id of benefitIds){
   assert.deepEqual(await page.locator('#'+id+' .en-y-tick').allTextContents(),['0','50','100'],'90 is a threshold, not a crowded axis tick');
   assert.equal(await page.locator('#'+id+' .enough-target-key').textContent(),'90% = enough');
   assert.ok(await page.locator('#'+id+' svg').evaluate(svg=>{
    const ticks=[...svg.querySelectorAll('.en-y-tick')],y=n=>Number(ticks.find(t=>t.textContent===n).getAttribute('y'))-4;
    const target=Number(svg.querySelector('.en-target').getAttribute('y1'));
    return Math.abs(target-(y('100')+.2*(y('50')-y('100'))))<.01;
   }),'Threshold stays at the true 90% position');
  }
  assert.equal(await page.locator('.overview-range,.overview-enough,.overview-definition,.overview-outcomes').count(),0,'No repeated overview explanations');
  const initialSnapshot=await page.locator('#steps').ariaSnapshot();assert.match(initialSnapshot,/slider "How much walking\?"/,'Accessible named chart control');assert.match(await page.locator('#steps .enough-chart').getAttribute('aria-valuetext'),/10,500.*90%/,'Accessible selected chart value');
  const overview=page.locator('#overview-chart');await clickFraction(page,overview,.75);assert.equal(await overview.getAttribute('aria-valuenow'),'75');assert.match(await overview.getAttribute('aria-valuetext'),/75% from the lowest to highest amount.*mortality-risk reduction.*muscle growth/);
  await page.keyboard.press('Home');assert.equal(await overview.getAttribute('aria-valuenow'),'0');await page.keyboard.press('ArrowRight');assert.equal(await overview.getAttribute('aria-valuenow'),'1');await page.keyboard.press('End');assert.equal(await overview.getAttribute('aria-valuenow'),'100');
  for(const plot of await page.locator('.enough-chart').all()){
   await clickFraction(page,plot,.2);const low=Number(await plot.getAttribute('aria-valuenow')),cx=await plot.locator('.en-dot').getAttribute('cx');
   await clickFraction(page,plot,.8);assert.ok(Number(await plot.getAttribute('aria-valuenow'))>low,'Click moves every chart marker');assert.notEqual(await plot.locator('.en-dot').getAttribute('cx'),cx);
   assert.ok(!/NaN|undefined|Infinity/.test(await plot.getAttribute('aria-valuetext')),'Finite selected value');
   await page.keyboard.press('Home');assert.equal(await plot.getAttribute('aria-valuenow'),await plot.getAttribute('aria-valuemin'));await page.keyboard.press('ArrowRight');assert.ok(Number(await plot.getAttribute('aria-valuenow'))>Number(await plot.getAttribute('aria-valuemin')));
   await page.keyboard.press('End');assert.equal(await plot.getAttribute('aria-valuenow'),await plot.getAttribute('aria-valuemax'));
  }
  const steps=page.locator('#steps .enough-chart');await steps.scrollIntoViewIfNeeded();const b=await steps.boundingBox();
  await page.mouse.move(b.x+42,b.y+80);await page.mouse.down();await page.mouse.move(b.x+b.width-12,b.y+80,{steps:8});await page.mouse.up();assert.equal(await steps.getAttribute('aria-valuenow'),'12000','Drag moves marker to endpoint');
  await page.locator('#steps summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#steps details').getAttribute('open'),'');await page.keyboard.press('Enter');
  if(width===375){
   await page.locator('#steps summary').tap();assert.equal(await page.locator('#steps details').getAttribute('open'),'');await page.locator('#steps summary').tap();
   await steps.scrollIntoViewIfNeeded();const r=await steps.boundingBox();await page.touchscreen.tap(r.x+42+.5*(r.width-54),r.y+80);assert.equal(await steps.getAttribute('aria-valuenow'),'7000','Touch tap selects dose');
   // Real touch events verify dragging while vertical page scrolling remains possible.
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+42+.2*(r.width-54),y:r.y+80}]});
   for(const f of [.3,.5,.7,.8])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+42+f*(r.width-54),y:r.y+80}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await steps.getAttribute('aria-valuenow'),'10000','Touch drag selects dose');
   const beforeScroll=await page.evaluate(()=>scrollY);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+100,y:r.y+125}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+100,y:r.y+75}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+100,y:r.y+25}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.ok(await page.evaluate(()=>scrollY)>beforeScroll,'Vertical touch scroll passes through charts');await cdp.detach();
  }
  assert.match(await page.locator('#sets .enough-answer').textContent(),/No settled optimum/);
  assert.equal(await page.locator('#sets .en-uncertainty').count(),1,'Sets model has credible band');assert.equal(await page.locator('#sets .en-guide').count(),0,'No false 38-set enough marker');
  assert.match(await page.locator('#sets details').textContent(),/preprint/);assert.doesNotMatch(await page.locator('#sets .enough-readout').textContent(),/of the gain/);
  // Match the owner's chosen reference essay for shared chrome and links.
  const reference=await context.newPage();await reference.goto(url+'/what-you-get-used-to.html');await reference.evaluate(()=>document.fonts.ready);
  const compare=async(target,source,props)=>{
   const styles=(el,p)=>{const css=getComputedStyle(el);return Object.fromEntries(p.map(k=>[k,k==='text-underline-offset'?(parseFloat(css.getPropertyValue(k))/parseFloat(css.fontSize)).toFixed(3):css.getPropertyValue(k)]));};
   assert.deepEqual(await page.locator(target).first().evaluate(styles,props),await reference.locator(source).first().evaluate(styles,props),'Reference style: '+target);
  };
  await compare('.post-back','.post-back',['font-family','font-size','color','text-decoration-line','padding-top']);await compare('.hero-title','.hero-title',['font-family','font-size','font-weight','line-height','letter-spacing','color']);await compare('.overview-key a','.sec a',['color','text-decoration-line','text-decoration-color','text-underline-offset']);await compare('.site-footer a','.site-footer a',['font-family','font-size','color','text-decoration-line']);await reference.close();
  await page.reload();await ready(page);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(destination,width+'-top.png')});await page.screenshot({path:path.join(destination,width+'-page.png'),fullPage:true});await page.locator('.enough-overview').screenshot({path:path.join(destination,width+'-overview.png')});
  await page.locator('#sets summary').click();await page.locator('#sets').screenshot({path:path.join(destination,width+'-sets-detail.png')});await page.locator('#protein summary').click();await page.locator('#protein').screenshot({path:path.join(destination,width+'-protein-detail.png')});await page.locator('.site-footer').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(destination,width+'-footer.png')});
  await context.close();console.log('PASS '+width+' px: full art, click/drag/keyboard charts, axes, short evidence, removed panels, reference styling and accessibility');
 }
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const painting of ['homer','chardin']){await page.goto(url+'/enough.html?painting='+painting);await ready(page);await fullPainting(page);}
 for(const layout of ['smalls','rings']){
  await page.goto(url+'/enough.html?layout='+layout);await ready(page);const box=page.locator('#overview-chart');await box.focus();await page.keyboard.press('End');assert.equal(await box.getAttribute('aria-valuenow'),'100');
  if(layout==='smalls')for(const svg of await box.locator('svg').all()){
   const r=await svg.boundingBox();await page.mouse.click(r.x+42+.25*(r.width-54),r.y+80);assert.equal(await box.getAttribute('aria-valuenow'),'25','Each small chart controls the shared position');
   await page.mouse.move(r.x+42+.25*(r.width-54),r.y+80);await page.mouse.down();await page.mouse.move(r.x+42+.75*(r.width-54),r.y+80,{steps:4});await page.mouse.up();assert.equal(await box.getAttribute('aria-valuenow'),'75','Drag stays on the selected small chart');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Alternative layout fits');
 }
 await page.goto(url+'/enough-lab.html');assert.equal(await page.locator('select').count(),3);await page.locator('#lab-painting').selectOption('homer');await page.locator('#lab-layout').selectOption('rings');await page.locator('#lab-colors').selectOption('quiet');await page.waitForFunction(()=>document.querySelector('iframe').src.includes('homer')&&document.querySelector('iframe').src.includes('rings'));
 assert.deepEqual(errors,[],'No JavaScript errors');assert.deepEqual(failures,[],'No missing resources');console.log('PASS painting/layout chooser and resources');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
