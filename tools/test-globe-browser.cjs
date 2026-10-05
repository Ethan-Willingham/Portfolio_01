/* NODE_PATH=/path/to/node_modules node tools/test-globe-browser.cjs
   REAL_DATA=1 uses upstream services; default uses dated deterministic data.
   DUMP=/absolute/folder stores evidence. Owns Chrome for Testing, closes in finally. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const dump = process.env.DUMP || '/tmp/daylight-globe-qa';
const real = process.env.REAL_DATA === '1';
fs.mkdirSync(dump,{recursive:true});
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  try {
    let content = fs.readFileSync(file);
    if (file.endsWith('/js/globe.js')) {
      let source = content.toString();
      const index = source.lastIndexOf('}());');
      source = source.slice(0,index)+`
      window.__globeTest = {
        state: () => ({live,instant:instant.toISOString(),tilt:tilt??null,pin,photo,
          forecast:forecast?{observation:forecast.observation.toISOString(),forecast:forecast.forecast.toISOString()}:null,
          kp:kp?.kp,textureWidth,photoMix,autoSpin,targetTheta,targetPhi,targetRadius,
          pending:frameRequest!==null,aurora:auroraMeshes.some(m=>m.visible),moon:moon.visible,
          inView,
          photoBusy:fetchingPhoto,weatherBusy:fetchingWeather,pinDayKey,
          textures:[baseTexture,nightTexture,satelliteTexture].map(t=>({w:t.image.width,h:t.image.height})),
          renderer:renderer.info,style:auroraStyle}),
        pin:(lat,lon)=>setPin({lat,lon}),
        setInstant:value=>{live=false;instant=new Date(value);updateAstronomy();updateLabels();},
        meanDay:()=>pinDaylight?{sunrise:pinDaylight.sunrise?.toISOString(),sunset:pinDaylight.sunset?.toISOString(),start:pinDaylight.start.toISOString()}:null,
        resetRequests:()=>{requestedDay='';weatherChecked=0;},
        refresh:refreshData,
        stale:()=>{forecast.observation=new Date(Date.now()-12*3600000);forecast.forecast=new Date(Date.now()-11*3600000);updateAstronomy();updateLabels();},
        orient:(lat,lon)=>{autoSpin=false;targetTheta=theta=Math.PI/2+lon*Math.PI/180;targetPhi=phi=Math.PI/2-lat*Math.PI/180;},
        sample:()=>({sun:math.solar(instant,tilt),moon:math.moon(instant)}),
        renderStop:()=>{if(frameRequest!==null)cancelAnimationFrame(frameRequest);frameRequest=null;}
        ,view:()=>({fov:camera.fov,aspect:camera.aspect,radius,width:container.clientWidth,height:container.clientHeight})
      };
      `+source.slice(index);
      content = Buffer.from(source);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'max-age=86400'}).end(content);
  } catch { res.writeHead(404).end(); }
});
function crc32(bytes) { let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0; }
function chunk(type,body) { const tag=Buffer.from(type), size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,body])));return Buffer.concat([size,tag,body,crc]); }
const pngs = new Map();
function image(width, companion=false) {
  const key=width+'/'+companion;if(pngs.has(key))return pngs.get(key);
  const height=width/2, header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const pixels=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*(width*4+1)+1+x*4;
    const valid=y>height*.1&&y<height*.9&&(!companion?x<width*.82:x>width*.75);
    pixels[i]=valid?50:0;pixels[i+1]=valid?100+Math.floor(y/height*60):0;pixels[i+2]=valid?130:0;pixels[i+3]=255;
  }
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);pngs.set(key,png);return png;
}
const checks=[],evidence=[];
function check(name,value) {assert.ok(value,name);checks.push(name);console.log('PASS '+name);}
const model=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/daylight/ovation-2026-10-04-storm.json')));
const kps=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/daylight/kp-2026-10-04-storm.json')));
const cloudCatalog='<WMS_Capabilities>'+['mumi:wideareacoverage_rgb_natural','mumi:worldcloudmap_ir108'].map(layer=>'<Layer><Name>'+layer+'</Name><Dimension name="time">2021-06-06T15:00:00.000Z/2026-10-05T00:00:00.000Z/PT3H</Dimension></Layer>').join('')+'</WMS_Capabilities>';
async function mockClouds(context,damage=false,onImage=()=>{}) {
  await context.route('https://view.eumetsat.int/**',route=>{
    const q=new URL(route.request().url()).searchParams;
    if(q.get('request')==='GetCapabilities')return route.fulfill({contentType:'text/xml',body:cloudCatalog});
    onImage();const bytes=image(Number(q.get('width')));
    return route.fulfill({contentType:'image/png',body:damage?bytes.subarray(0,33):bytes});
  });
}
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    browser=await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:process.env.HEADFUL!=='1',args:['--disable-gpu-vsync','--disable-frame-rate-limit']});
    for(const width of [375,768,1440]){
      const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:width===375?2:1,isMobile:width===375,hasTouch:width===375,timezoneId:'America/Chicago'});
      let imageRequests=0;
      if(!real)await mockClouds(context,false,()=>imageRequests++);
      if(!real)await context.route('https://gibs.earthdata.nasa.gov/**',async route=>{imageRequests++;const q=new URL(route.request().url()).searchParams;await route.fulfill({contentType:'image/png',body:image(Number(q.get('WIDTH')),q.get('LAYERS').includes('NOAA20'))});});
      if(!real)await context.route('https://services.swpc.noaa.gov/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('ovation')?model:kps)}));
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push('JS: '+e.message));page.on('console',message=>{if(message.type()==='error')errors.push('Console: '+message.text());});
      if(!real)await page.clock.setFixedTime(new Date('2026-10-05T00:05:00Z'));
      await page.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
      await page.waitForFunction(()=>window.__globeTest&&__globeTest.state().textures[0].w>1);
      await page.waitForFunction(()=>__globeTest.state().photo&&__globeTest.state().forecast,{timeout:90000});
      await page.waitForFunction(()=>__globeTest.state().photoMix===1);
      await page.evaluate(()=>document.fonts.ready);
      const state=()=>page.evaluate(()=>__globeTest.state());
      let s=await state();
      check(width+' opens in Live with photographed Earth and current forecast',s.live&&s.photo&&s.aurora);
      check(width+' Explore and pin facts start collapsed',!await page.locator('#globe-explore').isVisible()&&!await page.locator('#globe-pin').isVisible());
      check(width+' texture size respects the phone/desktop and GPU budget',s.textureWidth<=(width===375?2048:4096)&&s.textures.every(t=>t.w<=s.textureWidth&&t.h<=s.textureWidth));
      check(width+' has no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width===375){
        await page.setViewportSize({width:320,height:812});
        await page.waitForFunction(()=>__globeTest.view().width<300);
        check('320px opening retains both Earth limbs',await page.evaluate(()=>{const v=__globeTest.view();return v.height/(Math.sqrt(v.radius*v.radius-1)*Math.tan(v.fov*Math.PI/360))<v.width;}));
        await page.setViewportSize({width,height:1000});
        await page.waitForFunction(()=>__globeTest.view().width>300);
        const session=await context.newCDPSession(page),box=await page.locator('#globe-container canvas').boundingBox();
        const touch=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
        const cx=box.x+box.width/2,cy=box.y+box.height/2,before=(await state()).targetRadius;
        await touch('touchStart',[[1,cx-30,cy],[2,cx+30,cy]]);
        await touch('touchMove',[[1,cx-40,cy],[2,cx+40,cy]]);
        await touch('touchMove',[[1,cx-65,cy],[2,cx+65,cy]]);
        await touch('touchEnd',[]);
        check('two-finger touch zoom preserves Live and does not make a pin',(await state()).targetRadius<before&&(await state()).live&&!(await state()).pin);
        await session.detach();
      }
      await page.screenshot({path:path.join(dump,width+'-live.png'),fullPage:true});
      await page.locator('#globe-container').focus();await page.keyboard.press('ArrowRight');
      check(width+' keyboard rotates without stopping live',(await state()).targetTheta!==s.targetTheta&&(await state()).live);
      await page.keyboard.press('Enter');s=await state();
      check(width+' keyboard pins the center and keeps live',s.pin&&s.live);
      check(width+' pin presents exactly four semantic facts',await page.locator('#globe-pin dt').count()===4);
      check(width+' buttons retain their visible border affordance',await page.locator('#globe-explore-toggle').evaluate(el=>getComputedStyle(el).borderTopStyle==='solid'));
      await page.evaluate(()=>__globeTest.pin(69.65,18.96));
      await page.screenshot({path:path.join(dump,width+'-pin.png'),fullPage:true});
      await page.locator('#globe-explore-toggle').click();
      check(width+' opening Explore preserves live',(await state()).live);
      check(width+' the time range announces a readable civil time',!!await page.locator('#globe-hour').getAttribute('aria-valuetext'));
      await page.locator('#globe-date').fill('2026-12-21');await page.locator('#globe-date').dispatchEvent('change');
      await page.locator('#globe-hour').fill('720');await page.locator('#globe-hour').dispatchEvent('input');s=await state();
      check(width+' a chosen date leaves live and hides unrelated current aurora',!s.live&&!s.aurora);
      check(width+' sunrise panel handles polar night',(await page.locator('#globe-pin-daylight').textContent()).includes('polar night'));
      await page.locator('[data-tilt="45"]').click();s=await state();
      check(width+' hypothetical tilt uses reference map and hides the Moon',!s.moon&&!s.aurora&&(await page.locator('#globe-status').textContent()).includes('Reference map'));
      await page.screenshot({path:path.join(dump,width+'-explore.png'),fullPage:true});
      await page.locator('#globe-return').focus();await page.keyboard.press('Enter');s=await state();
      check(width+' Return to live restores real tilt and forecast',s.live&&s.tilt===null&&s.aurora&&s.moon);
      check(width+' Return to live preserves keyboard focus',await page.evaluate(()=>document.activeElement.id==='globe-explore-toggle'));
      if(width===375){
        await page.evaluate(()=>document.documentElement.style.fontSize='32px');
        for(const size of [375,320]){
          await page.setViewportSize({width:size,height:812});
          check(size+' mobile enlarged text keeps status and Explore apart',await page.evaluate(()=>{const a=document.querySelector('.globe-status-text').getBoundingClientRect(),b=document.querySelector('#globe-explore-toggle').getBoundingClientRect();return a.right<=b.left+1||a.bottom<=b.top+1;}));
          check(size+' enlarged mobile controls do not cause horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.globe-foot').scrollWidth<=document.querySelector('.globe-foot').clientWidth+1));
          await page.screenshot({path:path.join(dump,size+'-mobile-large-text.png'),fullPage:true});
        }
        await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width,height:1000});
      }
      if(width===768){
        await page.evaluate(()=>{document.documentElement.style.fontSize='32px';__globeTest.pin(0,0);});
        check('200 percent text preserves all four readable pin facts',await page.locator('#globe-pin dd').evaluateAll(elements=>elements.length===4&&elements.every(el=>el.scrollWidth<=el.clientWidth+1)));
        await page.evaluate(()=>document.documentElement.style.fontSize='');
      }
      await page.locator('#globe-explore-toggle').click();
      await page.evaluate(()=>{document.querySelector('.globe-wrapper').requestFullscreen=undefined;});
      await page.locator('#globe-fullscreen').click();check(width+' fullscreen opens',await page.locator('.globe-wrapper.is-fullscreen').count()===1);
      for(let i=0;i<8;i++)await page.keyboard.press('Tab');
      check(width+' fullscreen keyboard focus stays inside the globe',await page.evaluate(()=>document.querySelector('.globe-wrapper').contains(document.activeElement)));
      await page.locator('#globe-container').focus();await page.keyboard.press('Escape');
      check(width+' fullscreen Escape exits while preserving the pin',await page.locator('.globe-wrapper.is-fullscreen').count()===0&&!!(await state()).pin);
      check(width+' fullscreen restores background interaction',await page.locator('.post-back').evaluate(el=>!el.inert));
      await page.locator('#globe-container').focus();await page.keyboard.press('Escape');
      check(width+' a second Escape clears the pin',!(await state()).pin);
      if(width===375){
        await page.evaluate(()=>{__globeTest.pin(0,0);__globeTest.setInstant('2026-10-04T23:49:00Z');});
        const first=await page.evaluate(()=>__globeTest.meanDay());
        await page.evaluate(()=>__globeTest.setInstant('2026-10-05T00:01:00Z'));
        const second=await page.evaluate(()=>__globeTest.meanDay());
        check('apparent solar midnight keeps the visible pin date and events aligned',first.sunrise.startsWith('2026-10-05')&&first.sunrise===second.sunrise&&(await page.locator('#globe-pin-clock').textContent()).includes('Oct 5'));
        await page.locator('#globe-explore-toggle').click();await page.locator('#globe-return').click();await page.locator('#globe-explore-toggle').click();
      }
      if(!real){const before=imageRequests;await page.reload();await page.waitForFunction(()=>window.__globeTest&&__globeTest.state().photo);check(width+' reload reuses dated satellite Cache Storage images',before>0&&imageRequests===before);}
      await page.evaluate(()=>__globeTest.stale());check(width+' stale aurora hides without becoming zero',(await state()).aurora===false&&(await page.locator('#globe-data').textContent()).includes('unavailable'));
      await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});__globeTest.resetRequests();__globeTest.refresh();});
      await context.route('https://**',route=>route.abort());
      await context.setOffline(true);
      await page.waitForTimeout(1200);check(width+' browser offline mode stays rendered without JavaScript or console errors',errors.length===0&&(await state()).textures[0].w>1);
      await context.setOffline(false);
      if(!real){
        await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:false}));
        const before=imageRequests;await page.reload();await page.waitForFunction(()=>window.__globeTest&&__globeTest.state().photo);
        check(width+' offline shell reuses cached photo without remote requests',imageRequests===before&&!(await state()).aurora);
      }
      await page.screenshot({path:path.join(dump,width+'-offline.png'),fullPage:true});
      evidence.push({width,state:await state(),errors,imageRequests});
      await context.close();
    }
    // Failures have to leave a usable globe, including a fresh visit with no cache.
    const failed=await browser.newContext({viewport:{width:375,height:812}});
    await failed.addInitScript(()=>{
      const original=window.fetch.bind(window);
      window.fetch=(url,options)=>String(url).startsWith('https://')?Promise.reject(new TypeError('Simulated blocked external network')):original(url,options);
    });
    const failurePage=await failed.newPage(),failureErrors=[];
    failurePage.on('pageerror',e=>failureErrors.push(e.message));failurePage.on('console',e=>{if(e.type()==='error')failureErrors.push(e.text());});
    await failurePage.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
    await failurePage.waitForFunction(()=>window.__globeTest&&__globeTest.state().textures[0].w>1&&!__globeTest.state().photoBusy&&!__globeTest.state().weatherBusy);
    check('a fresh blocked-network visit shows reference Earth and truthful unavailable forecast',!(await failurePage.evaluate(()=>__globeTest.state())).photo&&(await failurePage.locator('#globe-status').textContent()).includes('Reference map')&&(await failurePage.locator('#globe-data').textContent()).includes('unavailable'));
    await failurePage.locator('#globe-explore-toggle').click();
    check('blocked-network controls remain usable without console or JavaScript errors',await failurePage.locator('#globe-date').isVisible()&&failureErrors.length===0);
    check('successful local map loading updates the offline accessible summary',await failurePage.locator('#globe-summary').textContent().then(value=>value.includes('Reference map.')&&!value.includes('Loading reference map')));
    await failurePage.screenshot({path:path.join(dump,'fresh-blocked-network.png'),fullPage:true});
    evidence.push({failureErrors});await failed.close();
    const damaged=await browser.newContext({viewport:{width:375,height:812}});
    await mockClouds(damaged,true);
    await damaged.route('https://gibs.earthdata.nasa.gov/**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({contentType:'image/png',body:image(Number(q.get('WIDTH'))).subarray(0,33)});});
    await damaged.route('https://services.swpc.noaa.gov/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('ovation')?model:kps)}));
    const damagedPage=await damaged.newPage(),damagedErrors=[];
    damagedPage.on('pageerror',e=>damagedErrors.push(e.message));damagedPage.on('console',e=>{if(e.type()==='error')damagedErrors.push(e.text());});
    await damagedPage.clock.setFixedTime(new Date('2026-10-05T00:05:00Z'));
    await damagedPage.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
    await damagedPage.waitForFunction(()=>window.__globeTest&&!__globeTest.state().photoBusy&&__globeTest.state().textures[0].w>1);
    check('damaged PNG pixel streams fall back and are evicted from Cache Storage',await damagedPage.evaluate(async()=>!__globeTest.state().photo&&(await (await caches.open('daylight-globe-photo-v1')).keys()).length===0));
    await damaged.unroute('https://gibs.earthdata.nasa.gov/**');
    await damaged.unroute('https://view.eumetsat.int/**');await mockClouds(damaged);
    await damaged.route('https://gibs.earthdata.nasa.gov/**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({contentType:'image/png',body:image(Number(q.get('WIDTH')))});});
    await damagedPage.evaluate(()=>{__globeTest.resetRequests();__globeTest.refresh();});
    await damagedPage.waitForFunction(()=>__globeTest.state().photo);
    check('a valid replacement recovers without damaged cache or console errors',damagedErrors.length===0);
    evidence.push({damagedErrors});await damaged.close();
    for(const failure of ['math','webgl']){
      const unavailable=await browser.newContext({viewport:{width:375,height:812}});
      if(failure==='math')await unavailable.route('**/js/globe-math.js*',route=>route.fulfill({contentType:'application/javascript',body:''}));
      else await unavailable.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};});
      const page=await unavailable.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
      await page.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
      await page.waitForFunction(()=>document.querySelector('#globe-summary').textContent.includes('source links below'));
      check(failure+' failure removes inactive controls and misleading keyboard affordances',await page.evaluate(()=>!document.querySelector('#globe-container').hasAttribute('tabindex')&&document.querySelector('#globe-fullscreen').disabled&&document.querySelector('#globe-explore-toggle').disabled&&!document.querySelector('.globe-info'))&&!await page.locator('#globe-fullscreen').isVisible());
      check(failure+' failure supplies an accessible summary and working source links without errors',errors.length===0&&await page.locator('.globe-credits a').count()>=4);
      await page.screenshot({path:path.join(dump,failure+'-unavailable.png'),fullPage:true});await unavailable.close();
    }
    const noBase=await browser.newContext({viewport:{width:375,height:812}});
    await noBase.route('**/assets/images/earth.jpg',async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.fulfill({contentType:'image/jpeg',body:'damaged local map'});});
    await noBase.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('https://')?Promise.reject(new TypeError('External data unavailable')):original(url,options);});
    const noBasePage=await noBase.newPage(),noBaseErrors=[];
    noBasePage.on('pageerror',e=>noBaseErrors.push(e.message));noBasePage.on('console',e=>{if(e.type()==='error')noBaseErrors.push(e.text());});
    await noBasePage.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
    check('delayed reference imagery is labeled as loading',await noBasePage.locator('#globe-status').textContent().then(value=>value.includes('Loading reference map')));
    await noBasePage.waitForFunction(()=>document.querySelector('#globe-status').textContent.includes('Reference map unavailable'));
    check('failed local map does not claim a neutral sphere is a reference map',noBaseErrors.length===0&&(await noBasePage.locator('#globe-summary').textContent()).includes('Reference map unavailable'));
    await noBasePage.screenshot({path:path.join(dump,'base-map-unavailable.png'),fullPage:true});await noBase.close();
    const slowWeather=await browser.newContext({viewport:{width:375,height:812}});
    await mockClouds(slowWeather);
    await slowWeather.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(url,options)=>String(url).includes('gibs.earthdata')?Promise.reject(new TypeError('No satellite data')):original(url,options);});
    await slowWeather.route('https://services.swpc.noaa.gov/**',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('ovation')?model:kps)});});
    const slowPage=await slowWeather.newPage();await slowPage.clock.setFixedTime(new Date('2026-10-05T00:05:00Z'));
    await slowPage.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
    await slowPage.waitForFunction(()=>window.__globeTest&&__globeTest.state().textures[0].w>1);
    check('initial delayed weather checking is announced with the visible state',await slowPage.locator('#globe-summary').textContent().then(value=>value.includes('Checking aurora forecast')));
    await slowPage.waitForFunction(()=>__globeTest.state().forecast);
    check('a completed weather refresh announces its actual forecast timestamp',await slowPage.locator('#globe-summary').textContent().then(value=>value.includes('measurements from')&&!value.includes('Checking aurora forecast')));
    await slowWeather.close();
    const fullscreenContext=await browser.newContext({viewport:{width:375,height:812}});
    await fullscreenContext.route('https://gibs.earthdata.nasa.gov/**',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({contentType:'image/png',body:image(Number(q.get('WIDTH')))});});
    await fullscreenContext.route('https://services.swpc.noaa.gov/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('ovation')?model:kps)}));
    const fsPage=await fullscreenContext.newPage();await fsPage.clock.setFixedTime(new Date('2026-10-05T00:05:00Z'));
    await fsPage.goto(`http://127.0.0.1:${server.address().port}/daylight-globe.html`);
    await fsPage.waitForFunction(()=>window.__globeTest&&__globeTest.state().photo);
    await fsPage.locator('#globe-explore-toggle').click();await fsPage.locator('#globe-date').fill('1900-01-01');await fsPage.locator('#globe-date').dispatchEvent('change');
    await fsPage.locator('#globe-return').click();await fsPage.setViewportSize({width:568,height:320});
    await fsPage.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await fsPage.waitForFunction(()=>!__globeTest.state().inView&&!__globeTest.state().pending);
    const frames=await fsPage.evaluate(()=>__globeTest.state().renderer.render.frame);
    await fsPage.evaluate(()=>{document.querySelector('.globe-wrapper').requestFullscreen=undefined;document.querySelector('#globe-fullscreen').click();});
    await fsPage.waitForFunction(frame=>__globeTest.state().pending&&__globeTest.state().renderer.render.frame>frame,frames);
    check('narrow fullscreen resumes a globe paused after offscreen Explore',await fsPage.evaluate(()=>__globeTest.state().live&&__globeTest.state().pending));
    await fsPage.clock.setFixedTime(new Date('2026-10-05T00:06:00Z'));await fsPage.waitForFunction(()=>__globeTest.state().instant==='2026-10-05T00:06:00.000Z');
    check('fullscreen rendering advances the actual Live instant',true);
    await fsPage.screenshot({path:path.join(dump,'narrow-fullscreen-from-offscreen.png')});
    await fsPage.evaluate(()=>document.documentElement.style.fontSize='32px');
    await fsPage.waitForFunction(()=>document.querySelector('.globe-foot').getBoundingClientRect().width===innerWidth);
    if(!await fsPage.locator('#globe-explore').isVisible())await fsPage.locator('#globe-explore-toggle').click();
    await fsPage.locator('[data-tilt="45"]').click();await fsPage.locator('#globe-return').focus();
    check('200 percent text in narrow fullscreen has no horizontal footer scrolling',await fsPage.locator('.globe-foot').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollLeft===0));
    await fsPage.screenshot({path:path.join(dump,'narrow-fullscreen-large-text.png')});
    for(const width of [640,740,800,844,1024]){
      await fsPage.setViewportSize({width,height:400});
      for(const expanded of [false,true]){
        await fsPage.evaluate(expanded=>{const section=document.querySelector('#globe-explore');if(section.hidden===expanded)document.querySelector('#globe-explore-toggle').click();},expanded);
        check(width+' fullscreen enlarged '+(expanded?'expanded':'collapsed')+' status stays clear of Explore',await fsPage.evaluate(()=>{const a=document.querySelector('.globe-status-text').getBoundingClientRect(),b=document.querySelector('#globe-explore-toggle').getBoundingClientRect();return a.right<=b.left+1||a.bottom<=b.top+1;}));
        check(width+' fullscreen enlarged '+(expanded?'expanded':'collapsed')+' has no horizontal footer overflow',await fsPage.locator('.globe-foot').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
      }
      await fsPage.screenshot({path:path.join(dump,width+'-fullscreen-large-text.png')});
    }
    await fsPage.setViewportSize({width:568,height:320});
    await fsPage.evaluate(()=>document.documentElement.style.fontSize='');
    await fsPage.waitForFunction(()=>document.querySelector('.globe-foot').getBoundingClientRect().width<innerWidth);
    check('ordinary narrow fullscreen retains a readable two-column layout',await fsPage.locator('.globe-foot').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await fsPage.locator('#globe-fullscreen').click();await fsPage.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await fsPage.waitForFunction(()=>!__globeTest.state().inView&&!__globeTest.state().pending);
    check('leaving fullscreen restores the offscreen rendering pause',true);
    await fullscreenContext.close();
    fs.writeFileSync(path.join(dump,'browser-results.json'),JSON.stringify({real,checks,evidence},null,2));
    console.log('Evidence: '+dump);
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
