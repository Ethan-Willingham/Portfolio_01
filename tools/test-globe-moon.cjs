/* NODE_PATH=/path/to/node_modules node tools/test-globe-moon.cjs
   SAFARI_MOBILE=1 repeats with mobile WebKit. Local-only hooks read the real
   Moon shader and camera; weather requests are blocked to isolate astronomy.
   Owns the test browser and server and closes both in finally. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),mobile=process.env.SAFARI_MOBILE==='1';
const dump=process.env.DUMP||'/tmp/globe-moon-'+(mobile?'webkit':'chrome');
fs.mkdirSync(dump,{recursive:true});
const hooks=`
window.__moonAudit={
 state:()=>({loading,live,instant:instant.toISOString(),moon:moon.position.toArray(),camera:camera.position.toArray(),light:moonSunUniform.value.toArray(),projected:moon.position.clone().project(camera).toArray(),illumination:lunarState.illumination,textureWidth:moonTexture.image.width,radius,theta,phi,targetTheta,targetPhi,targetRadius}),
 freeze:iso=>{live=false;instant=new Date(iso);autoSpin=false;updateAstronomy();syncInputs();updateLabels();},
 orbit:(lat,lon,r)=>{targetTheta=theta=Math.PI/2+lon*DEG;targetPhi=phi=Math.PI/2-lat*DEG;targetRadius=radius=r;sunFraming=false;autoSpin=false;aimShift=0;},
 wide:on=>{wrapper.classList.toggle('is-fullscreen',on);resize();},
 measure:legacy=>{
   const fragmentBefore=moonMaterial.fragmentShader;
   if(legacy){moonMaterial.fragmentShader='uniform sampler2D moonMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vNormal; void main(){float light=max(0.0,dot(normalize(vNormal),sunDir));gl_FragColor=vec4(texture2D(moonMap,vUv).rgb*(.025+light*.98),1.0);}';moonMaterial.needsUpdate=true;}
   const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
   const read=()=>{renderer.render(scene,camera);const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
   const visible=scene.children.map(child=>child.visible);
   moon.visible=false;const without=read();moon.visible=true;const withMoon=read();
   scene.children.forEach(child=>{child.visible=child===moon;});const isolated=read();
   scene.children.forEach((child,i)=>{child.visible=visible[i];});renderer.render(scene,camera);
   let max=0,disk=0,bright=0,actualBright=0,left=w,right=0,top=h,bottom=0;
   for(let i=0;i<isolated.length;i+=4){const v=Math.max(isolated[i],isolated[i+1],isolated[i+2]);max=Math.max(max,v);if(v>5){disk++;const x=i/4%w,y=Math.floor(i/4/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(v>45)bright++;if(Math.max(withMoon[i]-without[i],withMoon[i+1]-without[i+1],withMoon[i+2]-without[i+2])>45)actualBright++;}
   if(legacy){moonMaterial.fragmentShader=fragmentBefore;moonMaterial.needsUpdate=true;renderer.render(scene,camera);}
   return {max,disk,bright,actualBright,brightFraction:bright/disk,bounds:{left,right,top,bottom},buffer:{w,h}};
 }
};`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.bin':'application/octet-stream','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{let content=fs.readFileSync(file);if(file.endsWith('/js/globe.js')){const source=content.toString(),end=source.lastIndexOf('}());');assert(end>=0);content=Buffer.from(source.slice(0,end)+hooks+source.slice(end));}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(content);}catch(error){res.writeHead(404).end();}
});
const cases=[
 {name:'reported-waning-crescent',iso:'2026-10-09T14:30:00Z',phase:'thin'},
 {name:'waxing-crescent',iso:'2026-10-12T15:50:00Z',phase:'thin'},
 {name:'new',iso:'2026-10-10T15:50:00Z',phase:'new'},
 {name:'first-quarter',iso:'2026-10-18T16:12:00Z',phase:'quarter'},
 {name:'full',iso:'2026-10-26T04:12:00Z',phase:'full'},
 {name:'last-quarter',iso:'2026-11-01T20:28:00Z',phase:'quarter'}
];
let browser;const evidence={engine:mobile?'mobile WebKit':'Chrome for Testing',cases:[],checks:[],errors:[]};
function check(name,condition){assert(condition,name);evidence.checks.push(name);console.log('PASS '+name);}
async function settled(page){await page.waitForFunction(()=>{const s=__moonAudit.state();return Math.abs(s.radius-s.targetRadius)<1e-5&&Math.abs(s.theta-s.targetTheta)<1e-5&&Math.abs(s.phi-s.targetPhi)<1e-5;});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=mobile?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'});
  const context=await browser.newContext({viewport:{width:mobile?375:1440,height:mobile?812:1000},deviceScaleFactor:mobile?2:1,timezoneId:'America/Chicago',...(mobile?{isMobile:true,hasTouch:true}:{})});
  await context.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('https://')?Promise.reject(new TypeError('Weather blocked for lunar fixture')):original(url,options);});
  const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')evidence.errors.push(message.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');
  await page.waitForFunction(()=>window.__moonAudit&&!__moonAudit.state().loading,null,{timeout:30000});
  check('Find Moon is enabled after preparation',await page.locator('#globe-moon').isEnabled());
  check('Decoded lunar surface texture is installed',(await page.evaluate(()=>__moonAudit.state())).textureWidth>=1024);
  for(const wide of [false,true]){
   await page.evaluate(wide=>__moonAudit.wide(wide),wide);
   for(const fixture of cases){
    await page.evaluate(iso=>{__moonAudit.freeze(iso);__moonAudit.orbit(80,170,10);},fixture.iso);
    const before=await page.evaluate(()=>__moonAudit.state());await page.locator('#globe-moon').click();await settled(page);
    const state=await page.evaluate(()=>__moonAudit.state()),pixels=await page.evaluate(()=>__moonAudit.measure()),label=fixture.name+(wide?' fullscreen':' ordinary');evidence.cases.push({label,state,pixels});
    check(label+' keeps the selected time and calculated lunar position',state.instant===before.instant&&state.live===before.live&&state.moon.every((v,i)=>Math.abs(v-before.moon[i])<1e-12));
    check(label+' frames the whole Moon inside the actual canvas',Math.abs(state.projected[0])<.85&&Math.abs(state.projected[1])<.85&&state.projected[2]<1&&pixels.bounds.left>0&&pixels.bounds.right<pixels.buffer.w-1&&pixels.bounds.top>0&&pixels.bounds.bottom<pixels.buffer.h-1);
    check(label+' has a resolved lunar disk',pixels.disk>250);
    if(fixture.phase==='thin'){
     check(label+' has a discernible illuminated crescent',pixels.max>=65&&pixels.actualBright>=3);
     check(label+' retains a mostly unlit disk',pixels.brightFraction>.001&&pixels.brightFraction<.12);
     if(fixture.name==='reported-waning-crescent'&&!wide){const legacy=await page.evaluate(()=>__moonAudit.measure(true));evidence.legacy={state,pixels:legacy};check('Reported crescent is brighter than the old shader in the identical view',pixels.max>legacy.max*2&&pixels.actualBright>legacy.actualBright);}
    }else if(fixture.phase==='new')check(label+' does not invent a bright full disk at new Moon',pixels.brightFraction<.04);
    else if(fixture.phase==='quarter')check(label+' retains a half illuminated disk',pixels.brightFraction>.3&&pixels.brightFraction<.7&&pixels.actualBright>30);
    else check(label+' retains an illuminated textured full Moon',pixels.brightFraction>.85&&pixels.max>150&&pixels.actualBright>100);
    if(fixture.phase==='thin'||fixture.phase==='full')await page.locator('#globe-container').screenshot({path:path.join(dump,label.replaceAll(' ','-')+'.png')});
   }
  }
  await page.evaluate(()=>{__moonAudit.wide(false);__moonAudit.freeze('2026-10-09T14:30:00Z');__moonAudit.orbit(-70,-120,1.5);});
  await page.locator('#globe-moon').click();await settled(page);const before=await page.evaluate(()=>__moonAudit.state());
  await page.keyboard.press('ArrowRight');await settled(page);await page.keyboard.press('-');await settled(page);const after=await page.evaluate(()=>__moonAudit.state());
  check('Orbit and zoom remain usable after finding the Moon',Math.abs(after.theta-before.theta)>.1&&after.radius>before.radius+.2);
  check('Orbit and zoom preserve the astronomical instant',after.instant===before.instant);
  await page.locator('#globe-return').click();await page.locator('#globe-moon').click();await settled(page);
  check('Find Moon preserves Live mode',(await page.evaluate(()=>__moonAudit.state())).live);
  const fit=await page.locator('#globe-moon').evaluate(el=>{const b=el.getBoundingClientRect(),p=el.closest('#globe-container').getBoundingClientRect(),v=document.querySelector('#globe-version').getBoundingClientRect();return b.width>=44&&b.height>=44&&b.left>=v.right+8&&b.right<=p.right&&b.bottom<=p.bottom;});
  check('Find Moon fits beside fullscreen with a touch target',fit);
  check('Lunar renderer has no browser errors',evidence.errors.length===0);
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(dump,'evidence.json'),JSON.stringify(evidence,null,2));}
 console.log('Saved '+evidence.checks.length+' checks and screenshots to '+dump);
})().catch(error=>{console.error(error);process.exitCode=1;});
