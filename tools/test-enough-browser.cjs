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
  assert.equal(await page.locator('.enough-chart .en-x-label').count(),12);assert.equal(await page.locator('.enough-chart .en-y-label').count(),11);assert.equal(await page.locator('#protein .en-guidance-label').textContent(),'Published intake guide');
  assert.ok(await page.locator('.enough-detail summary').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)),'44px disclosure targets');
  if(width===375)assert.equal(await page.locator('.enough-card').first().evaluate(el=>Math.round(el.getBoundingClientRect().left)),20,'Site mobile gutter');
  const wordCounts=await page.locator('.enough-card details').evaluateAll(els=>els.map(el=>({id:el.closest('article').id,words:el.textContent.trim().split(/\s+/).length})));
  assert.ok(wordCounts.every(c=>c.words<=115),'Each evidence drawer under 115 words: '+JSON.stringify(wordCounts));
  assert.equal(await page.locator('.enough-card details table').count(),0,'Raw tables removed from short drawers');
  assert.equal(await page.locator('.enough-card details a[download]').count(),12,'Full evidence still available');
  const opening=page.locator('#overview-steps .overview-plot');
  assert.equal(await opening.getAttribute('aria-valuenow'),'8000');assert.match(await opening.getAttribute('aria-valuetext'),/about 44% lower risk of dying.*5,000.*under 60/,'Opening uses actual outcome and baseline');
  assert.equal(await page.locator('.enough-overview .overview-choices button').count(),3);assert.equal(await page.locator('.overview-panel:visible').count(),1,'Only one physical curve shown');
  assert.equal(await page.locator('#protein .en-y-label,#protein .en-curve').count(),0,'Guidance is not a predicted muscle-gain curve');assert.match(await page.locator('#steps .en-y-label').textContent(),/lower risk of dying, %/i);
  assert.doesNotMatch(await page.locator('.enough-overview').textContent(),/through each dose range|Amount within each shown range|Share of measured benefit/i,'No shared abstract scale');
  assert.equal(await page.locator('#overview-chart .en-target').count(),0,'Opening has only the outcome curve and selected marker');
  const crowdedTicks=await page.locator('.enough-chart svg,#overview-chart svg').evaluateAll(svgs=>svgs.flatMap(svg=>{
   const ticks=[...svg.querySelectorAll('.en-y-tick')];
   return ticks.flatMap((a,i)=>ticks.slice(i+1).filter(b=>{const x=a.getBBox(),y=b.getBBox();return x.y<y.y+y.height+4&&y.y<x.y+x.height+4;}).map(b=>a.textContent+'/'+b.textContent));
  }));assert.deepEqual(crowdedTicks,[],'Y-axis labels have at least 4px separation');
  assert.equal(await page.locator('.en-target,.en-guide,.enough-target-key').count(),0,'No endpoint-derived 90% optimum');
  for(const id of ['exercise','fiber','sleep'])assert.equal(await page.locator('#'+id+' .en-uncertainty').count(),1,'Published interval displayed: '+id);
  for(const id of ['fruit-veg','income','alcohol','smoking']){
   assert.equal(await page.locator('#'+id+' .en-curve').count(),0,'No invented response line between source groups');
   assert.ok(await page.locator('#'+id+' .en-whisker').count()>1,'Source-group intervals displayed');
  }
  const intervalClips=await page.locator('.enough-chart svg').evaluateAll(svgs=>svgs.flatMap(svg=>[...svg.querySelectorAll('.en-uncertainty,.en-whisker')].filter(el=>{const b=el.getBBox(),v=svg.viewBox.baseVal;return b.y<29.9||b.y+b.height>v.height-55.9;}).map(el=>el.closest('article').id)));
  assert.deepEqual(intervalClips,[],'Full intervals and scenario ranges fit on every chart');
  assert.equal(await page.locator('#sleep .en-area').count(),0,'No artificial six-hour sweet spot');
  assert.equal(await page.locator('#protein .en-intake-band').count(),1);
  assert.match(await page.locator('#protein .enough-answer').textContent(),/0.65 to 0.9/);
  assert.match(await page.locator('#protein .enough-fact').textContent(),/62 lifting trials/);
  assert.match(await page.locator('#protein details').textContent(),/not a growth curve/);
  assert.match(await page.locator('#income .en-y-label').textContent(),/out of 100/);
  assert.match(await page.locator('#savings .enough-readout').textContent(),/17 year-end contributions/);
  assert.equal(await page.locator('#savings .en-scenario').count(),1,'Alternate assumptions are labeled, not confidence limits');
  const initialSnapshot=await page.locator('#steps').ariaSnapshot();assert.match(initialSnapshot,/slider "How much walking\?"/,'Accessible named chart control');assert.match(await page.locator('#steps .enough-chart').getAttribute('aria-valuetext'),/8,000.*about 44%.*5,000/,'Walking opens at the lower edge of its broad flatter region');assert.match(await page.locator('#steps .enough-answer').textContent(),/8,000 to 10,000/);assert.equal(await page.locator('#steps-longer,[id^=longer-steps],.steps-longer').count(),0,'One walking card, no second study section');assert.equal(await page.locator('[data-steps-age]').count(),2,'Only one pair of walking age controls');
  await clickFraction(page,opening,.75);assert.equal(await opening.getAttribute('aria-valuenow'),'13300');assert.equal(await page.locator('#steps .enough-chart').getAttribute('aria-valuenow'),'13300','Opening and card share the same selected amount');
  await page.keyboard.press('Home');assert.equal(await opening.getAttribute('aria-valuenow'),'5000');await page.keyboard.press('ArrowRight');assert.equal(await opening.getAttribute('aria-valuenow'),'5100');await page.keyboard.press('End');assert.equal(await opening.getAttribute('aria-valuenow'),'16000');assert.match(await opening.getAttribute('aria-valuetext'),/about 39% lower risk/,'Figure endpoint is not normalized to 100%');
  for(const id of ['exercise','protein']){
   await page.locator('[data-opening-curve="'+id+'"]').click();const plot=page.locator('#overview-'+id+' .overview-plot');
   assert.equal(await page.locator('.overview-panel:visible').count(),1);assert.equal(await page.locator('[data-opening-curve="'+id+'"]').getAttribute('aria-pressed'),'true');
   await clickFraction(page,plot,.5);await page.keyboard.press('End');assert.equal(await plot.getAttribute('aria-valuenow'),await plot.getAttribute('aria-valuemax'));
   assert.match(await plot.getAttribute('aria-valuetext'),id==='exercise'?/38.4% lower risk.*no exercise/:/above the published intake guide.*cutoff is unknown/i);
  }
  await page.locator('[data-opening-curve="steps"]').click();assert.equal(await opening.getAttribute('aria-valuenow'),'16000','Curve changes preserve each selection');
  for(const plot of await page.locator('.enough-chart').all()){
   await clickFraction(page,plot,.2);const low=Number(await plot.getAttribute('aria-valuenow')),cx=await plot.locator('.en-dot').getAttribute('cx');
   await clickFraction(page,plot,.8);assert.ok(Number(await plot.getAttribute('aria-valuenow'))>low,'Click moves every chart marker');assert.notEqual(await plot.locator('.en-dot').getAttribute('cx'),cx);
   assert.ok(!/NaN|undefined|Infinity/.test(await plot.getAttribute('aria-valuetext')),'Finite selected value');
   await page.keyboard.press('Home');assert.equal(await plot.getAttribute('aria-valuenow'),await plot.getAttribute('aria-valuemin'));await page.keyboard.press('ArrowRight');assert.ok(Number(await plot.getAttribute('aria-valuenow'))>Number(await plot.getAttribute('aria-valuemin')));
   await page.keyboard.press('End');assert.equal(await plot.getAttribute('aria-valuenow'),await plot.getAttribute('aria-valuemax'));
  }
  const steps=page.locator('#steps .enough-chart');await steps.scrollIntoViewIfNeeded();const b=await steps.boundingBox();
  await page.mouse.move(b.x+42,b.y+80);await page.mouse.down();await page.mouse.move(b.x+b.width+20,b.y+80,{steps:8});await page.mouse.up();assert.equal(await steps.getAttribute('aria-valuenow'),'16000','Drag moves marker to endpoint');
  // Leaving a pointer-focused box changes its decoration only, even during capture.
  assert.equal(await steps.evaluate(el=>getComputedStyle(el).outlineStyle),'none','Captured drag outside clears highlight');
  await clickFraction(page,steps,.3);const selected=await steps.getAttribute('aria-valuenow'),rFocus=await steps.boundingBox();
  await page.mouse.move(rFocus.x-10,rFocus.y+80);
  assert.equal(await steps.evaluate(el=>getComputedStyle(el).outlineStyle),'none','Mouse exit clears the box highlight');
  assert.equal(await steps.getAttribute('aria-valuenow'),selected,'Mouse exit preserves the marker');assert.ok(await steps.evaluate(el=>document.activeElement===el),'Mouse exit preserves focus');
  await page.keyboard.press('ArrowRight');assert.equal(Number(await steps.getAttribute('aria-valuenow')),Number(selected)+100);assert.equal(await steps.evaluate(el=>getComputedStyle(el).outlineStyle),'solid','Keyboard restores visible focus with pointer outside');
  await page.mouse.move(rFocus.x+100,rFocus.y+80);await page.mouse.move(rFocus.x-10,rFocus.y+80);assert.equal(await steps.evaluate(el=>getComputedStyle(el).outlineStyle),'solid','Keyboard-origin focus remains visible on pointer exit');
  await page.locator('#steps summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#steps details').getAttribute('open'),'');await page.keyboard.press('Enter');
  if(width===375){
   await page.locator('#steps summary').tap();assert.equal(await page.locator('#steps details').getAttribute('open'),'');await page.locator('#steps summary').tap();
   await steps.scrollIntoViewIfNeeded();const r=await steps.boundingBox();await page.touchscreen.tap(r.x+42+.5*(r.width-54),r.y+80);assert.equal(await steps.getAttribute('aria-valuenow'),'10500','Touch tap selects dose');
   // Real touch events verify dragging while vertical page scrolling remains possible.
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+42+.2*(r.width-54),y:r.y+80}]});
   for(const f of [.3,.5,.7,.8]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+42+f*(r.width-54),y:r.y+80}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await steps.getAttribute('aria-valuenow'),'13800','Touch drag selects dose');
   await steps.scrollIntoViewIfNeeded();const scrollRect=await steps.boundingBox(),beforeScroll=await page.evaluate(()=>scrollY);
   // A controlled native touch swipe tests panning without synthetic fling velocity.
   await cdp.send('Input.synthesizeScrollGesture',{x:scrollRect.x+100,y:scrollRect.y+125,yDistance:-100,speed:500,gestureSourceType:'touch',preventFling:true});
   await page.waitForFunction(before=>scrollY>before,beforeScroll,{timeout:2000});assert.ok(await page.evaluate(()=>scrollY)>beforeScroll,'Vertical touch scroll passes through charts');await cdp.detach();
  }
  assert.match(await page.locator('#sets .enough-answer').textContent(),/No settled optimum/);
  for(const id of ['sets','fiber','savings','work']){
   const selector='#'+id+' .enough-chart';
   assert.ok(await page.locator(selector+' .en-curve').evaluateAll(els=>els.length>0&&els.every(el=>getComputedStyle(el).strokeDasharray!=='none')),'Model remains dashed: '+id);
   assert.ok((await page.locator(selector+' .enough-model-key').textContent()).length>0,'Named model key: '+id);
  }
  assert.equal(await page.locator('#sets .en-sparse').count(),1,'Sparse high-dose tail is visible');
  assert.match(await page.locator('#sets .enough-fact').textContent(),/about 25/);
  assert.equal(await page.locator('#sets .en-uncertainty').count(),1,'Sets model has credible band');
  assert.match(await page.locator('#sets details').textContent(),/preprint/);assert.doesNotMatch(await page.locator('#sets .enough-readout').textContent(),/of the gain/);
  assert.equal(await steps.locator('.en-uncertainty').count(),1,'Walking has the published confidence band');
  assert.equal(await opening.locator('.en-uncertainty').count(),1,'Opening shares the same source band');
  assert.equal(await page.locator('#overview-steps .overview-context a').getAttribute('href'),'#steps');
  assert.doesNotMatch(await page.locator('#steps').textContent(),/About 10,500|See a longer study|Where does walking flatten/);
  for(const [id,baseline,end,minimum,range]of [['steps-younger','5,000',39,5000,'8,000 to 10,000'],['steps-older','3,000',64,3000,'6,000 to 8,000']]){
   await page.locator('[data-steps-age="'+id+'"]').click();assert.equal(await page.locator('[data-steps-age="'+id+'"]').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('#steps .enough-answer').textContent(),new RegExp(range));assert.match(await page.locator('#overview-baseline-steps').textContent(),new RegExp(baseline));
   assert.equal(Number(await steps.getAttribute('aria-valuemin')),minimum);assert.equal(await opening.getAttribute('aria-valuemin'),await steps.getAttribute('aria-valuemin'));
   await clickFraction(page,steps,.5);assert.equal(await opening.getAttribute('aria-valuenow'),await steps.getAttribute('aria-valuenow'));
   await page.keyboard.press('Home');assert.equal(Number(await steps.getAttribute('aria-valuenow')),minimum);await page.keyboard.press('ArrowRight');assert.equal(Number(await steps.getAttribute('aria-valuenow')),minimum+100);
   await page.keyboard.press('End');assert.equal(await steps.getAttribute('aria-valuenow'),'16000');assert.match(await steps.getAttribute('aria-valuetext'),new RegExp('about '+end+'%.*'+baseline));
   assert.equal(await opening.getAttribute('aria-valuetext'),await steps.getAttribute('aria-valuetext'),'Same curve and baseline in both views');
   assert.equal(await steps.locator('.en-target,.en-guide,.enough-target-key').count(),0,'Walking has a broad flatter region, no exact enough guide');
   const clippedAge=await page.locator('#steps svg text,#overview-steps svg text').evaluateAll(els=>els.filter(el=>{const b=el.getBBox(),v=el.ownerSVGElement.viewBox.baseVal;return b.x<-.5||b.x+b.width>v.width+.5||b.y<-.5||b.y+b.height>v.height+.5;}).map(el=>el.textContent));assert.deepEqual(clippedAge,[]);
   assert.ok(await steps.locator('.en-uncertainty').evaluate(el=>{const b=el.getBBox(),v=el.ownerSVGElement.viewBox.baseVal;return b.y>=29&&b.y+b.height<=v.height-55;}),'Full source confidence band fits');
  }
  await page.keyboard.press('Home');await page.keyboard.press('PageUp');assert.equal(await steps.getAttribute('aria-valuenow'),'4000');
  await page.locator('[data-steps-age="steps-younger"]').click();assert.equal(await steps.getAttribute('aria-valuenow'),'16000','Age selection retains its own marker');
  await page.locator('[data-steps-age="steps-older"]').click();assert.equal(await steps.getAttribute('aria-valuenow'),'4000','The second age marker is independent');
  await page.setViewportSize({width:width+20,height:900});await page.waitForTimeout(100);assert.equal(await opening.getAttribute('aria-valuenow'),'4000','Resize retains synchronized selection');await page.setViewportSize({width,height:width===375?812:900});await page.waitForTimeout(100);
  assert.match(await page.locator('#steps details').textContent(),/don’t require 10,000 steps/);
  // Match the owner's chosen reference essay for shared chrome and links.
  const reference=await context.newPage();await reference.goto(url+'/what-you-get-used-to.html');await reference.evaluate(()=>document.fonts.ready);
  const compare=async(target,source,props)=>{
   const styles=(el,p)=>{const css=getComputedStyle(el);return Object.fromEntries(p.map(k=>[k,k==='text-underline-offset'?(parseFloat(css.getPropertyValue(k))/parseFloat(css.fontSize)).toFixed(3):css.getPropertyValue(k)]));};
   assert.deepEqual(await page.locator(target).first().evaluate(styles,props),await reference.locator(source).first().evaluate(styles,props),'Reference style: '+target);
  };
  await compare('.post-back','.post-back',['font-family','font-size','color','text-decoration-line','padding-top']);await compare('.hero-title','.hero-title',['font-family','font-size','font-weight','line-height','letter-spacing','color']);await compare('.overview-context a','.sec a',['color','text-decoration-line','text-decoration-color','text-underline-offset']);await compare('.site-footer a','.site-footer a',['font-family','font-size','color','text-decoration-line']);await reference.close();
  await page.reload();await ready(page);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(destination,width+'-top.png')});await page.screenshot({path:path.join(destination,width+'-page.png'),fullPage:true});await page.locator('.enough-overview').screenshot({path:path.join(destination,width+'-overview.png')});
  await page.locator('#steps').screenshot({path:path.join(destination,width+'-steps-younger.png')});await page.locator('[data-steps-age="steps-older"]').click();await page.locator('#steps').screenshot({path:path.join(destination,width+'-steps-older.png')});await page.locator('[data-steps-age="steps-younger"]').click();
  for(const area of ['move','lift','rest','eat','money','work','harm'])await page.locator('.enough-group').filter({has:page.locator('#area-'+area)}).screenshot({path:path.join(destination,width+'-'+area+'.png')});
  await page.locator('#sets summary').click();await page.locator('#sets').screenshot({path:path.join(destination,width+'-sets-detail.png')});await page.locator('#protein summary').click();await page.locator('#protein').screenshot({path:path.join(destination,width+'-protein-detail.png')});await page.locator('.site-footer').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(destination,width+'-footer.png')});
  await context.close();console.log('PASS '+width+' px: full art, click/drag/keyboard charts, axes, short evidence, removed panels, reference styling and accessibility');
 }
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const painting of ['homer','chardin']){await page.goto(url+'/enough.html?painting='+painting);await ready(page);await fullPainting(page);}
 for(const curve of ['exercise','protein']){
  await page.goto(url+'/enough.html?curve='+curve);await ready(page);assert.equal(await page.locator('#overview-'+curve).getAttribute('hidden'),null);assert.equal(await page.locator('.overview-panel:visible').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Alternative starting curve fits');
 }
 await page.goto(url+'/enough.html?steps-age=older#steps-longer');await ready(page);assert.equal(await page.locator('[data-steps-age="steps-older"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#steps .enough-chart').getAttribute('aria-valuenow'),'6000');assert.match(await page.locator('#overview-baseline-steps').textContent(),/3,000/);assert.ok(await page.locator('#steps').evaluate(el=>Math.abs(el.getBoundingClientRect().top-20)<3),'Old longer-study link reaches the consolidated walking card');
 await page.goto(url+'/enough-lab.html');assert.equal(await page.locator('select').count(),3);await page.locator('#lab-painting').selectOption('homer');await page.locator('#lab-curve').selectOption('protein');await page.locator('#lab-colors').selectOption('quiet');await page.waitForFunction(()=>document.querySelector('iframe').src.includes('homer')&&document.querySelector('iframe').src.includes('protein'));
 assert.deepEqual(errors,[],'No JavaScript errors');assert.deepEqual(failures,[],'No missing resources');console.log('PASS painting/curve chooser and resources');
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
