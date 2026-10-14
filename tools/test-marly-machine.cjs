// Browser regression for the native-water Marly scene. The harness owns and closes Chrome for Testing.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,launchOptions}=require('./under-street/browser-support.cjs');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{let browser;const errors=[];try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch(launchOptions);
 const url='http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene=marly-machine';
 async function page(viewport,touch=false){const p=await browser.newPage({viewport,isMobile:touch,hasTouch:touch});p.on('pageerror',e=>errors.push(e.message));await p.goto(url);try{await p.waitForFunction(()=>window.__toy?.machineState()?.ready&&!!__toy.machineState().definition.marlyReading,null,{timeout:45000});}catch(e){console.log('BOOT DIAGNOSTIC',await p.evaluate(()=>({stats:window.__toy?.stats?.(),state:window.__toy?.machineState?.(),build:window.__toy?.buildState?.(),body:document.body.innerText.slice(0,500)})));throw e;}return p;}
 async function read(p){return p.evaluate(()=>__toy.machineState().definition.marlyReading);}
 async function until(p,seconds){const start=(await read(p)).clock;await p.waitForFunction(t=>__toy.machineState().definition.marlyReading.clock>=t,start+seconds,{timeout:90000});}
 const p=await page({width:1440,height:900});await p.screenshot({path:'/tmp/marly-final-desktop.png'});
 const a=await read(p);assert(a.nativeWater&&a.receiver===0&&a.source>0);console.log('PASS starts with resident native water and an empty upper receiver');
 await until(p,48);const b=await read(p);assert(b.wheelTravel>6*Math.PI&&b.peakReceiver>50&&b.source>500&&b.pumpStroke>0&&b.error===null,JSON.stringify(b));console.log('PASS river spins the wheel, works the piston and lifts resident water: '+JSON.stringify({turns:b.wheelTurns,receiver:b.receiver,peakReceiver:b.peakReceiver,source:b.source}));
 await p.locator('#marly-brake').click();await until(p,4);const braked=await read(p);assert(braked.brake&&Math.abs(braked.omega)<.05,JSON.stringify(braked));console.log('PASS brake dissipates wheel motion');
 await p.locator('#marly-brake').click();await until(p,10);const resumed=await read(p);assert(Math.abs(resumed.omega)>.05||Math.abs(resumed.angle-braked.angle)>.5,JSON.stringify(resumed));console.log('PASS releasing brake resumes motion');
 await p.evaluate(()=>__toy.machine('marly-machine',{river:false}));await p.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.marlyNative?.river===false);await until(p,20);const dry=await read(p);assert(dry.angle===0&&dry.omega===0&&dry.receiver===0&&dry.pumpStroke===0,JSON.stringify(dry));console.log('PASS dry comparison cannot turn or pump');
 await p.evaluate(()=>__toy.machine('moniac',{}));await p.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.name==='moniac');assert.equal(await p.locator('.marly-native-panel').count(),0);console.log('PASS scene retirement removes controls');await p.close();
 const mobile=await page({width:844,height:390},true);await until(mobile,5);await mobile.screenshot({path:'/tmp/marly-final-landscape.png'});const layout=await mobile.evaluate(()=>{const panel=document.querySelector('.marly-native-panel').getBoundingClientRect(),button=document.querySelector('#marly-brake').getBoundingClientRect();return{panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom},button:{width:button.width,height:button.height},viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth};});
 assert(layout.panel.left>=0&&layout.panel.right<=layout.viewport.width&&layout.panel.bottom<=layout.viewport.height&&layout.button.height>=44&&layout.scrollWidth<=layout.viewport.width+1,JSON.stringify(layout));
 await mobile.locator('#marly-brake').tap();await mobile.waitForFunction(()=>__toy.machineState().definition.marlyReading.brake,{timeout:5000});await mobile.locator('#marly-brake').tap();console.log('PASS landscape touch controls and layout');
 assert.deepEqual(errors,[]);await mobile.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
