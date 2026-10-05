/* NODE_PATH=/path/to/node_modules node tools/test-globe-quality.cjs
   Controlled provider images audit actual GPU colors and retained-image upgrades.
   Hooks exist only in this owned local server. Chrome for Testing and the server
   close in finally. Fixtures are synthetic and do not claim observed weather. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const zlib=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),dump=process.env.DUMP||'/tmp/daylight-globe-quality';
fs.mkdirSync(dump,{recursive:true});
const fixedNow='2026-10-05T03:10:00Z',checks=[],evidence=[],errors=[];
function check(name,pass,detail){checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});console.log((pass?'PASS ':'FAIL ')+name);}
const hooks=`
window.__globeQuality={
 state:function(){return {loading:loading,photo:photo,photoMix:photoMix,instant:instant.toISOString(),live:live,generation:photoGeneration,
  detailBusy:!!detailController,clear:renderer.getClearColor().getHexString(),radius:radius,textureWidth:textureWidth,
  textures:{natural:[satelliteTexture.image.width,satelliteTexture.image.height],infrared:[infraredTexture.image.width,infraredTexture.image.height]},
  controls:Array.from(explore.querySelectorAll('input,button')).every(function(e){return !e.disabled;}),
  filters:{natural:{mips:satelliteTexture.generateMipmaps,anisotropy:satelliteTexture.anisotropy},infrared:{mips:infraredTexture.generateMipmaps,anisotropy:infraredTexture.anisotropy}}};},
 zoom:function(r){targetRadius=radius=r;sunFraming=false;autoSpin=false;},
 texture:function(kind,lat,lon){var c=(kind==='natural'?satelliteTexture:infraredTexture).image;
  var x=Math.max(0,Math.min(c.width-1,Math.floor(((lon+180)%360+360)%360/360*c.width))),y=Math.max(0,Math.min(c.height-1,Math.floor((90-lat)/180*c.height)));
  return Array.from(c.getContext('2d').getImageData(x,y,1,1).data);},
 sample:function(lat,lon,options){
  options=options||{};var v=math.geographicVector(lat,lon),r=4;
  targetTheta=theta=Math.PI/2+lon*DEG;targetPhi=phi=Math.PI/2-lat*DEG;targetRadius=radius=r;sunFraming=false;aimShift=0;autoSpin=false;
  camera.position.set(v.x*r,v.y*r,v.z*r);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  var items=[atmosphere,moon,sunBody,sunGlow,starField,pinMarker].concat(auroraMeshes),visible=items.map(function(m){return m.visible;});
  var oldPhoto=earthMaterial.uniforms.photoEnabled.value,oldNatural=earthMaterial.uniforms.naturalEnabled.value,oldTarget=renderer.getRenderTarget();
  var w=container.clientWidth,h=container.clientHeight,rt=new THREE.WebGLRenderTarget(w,h),pixel=new Uint8Array(4);
  try{items.forEach(function(m){m.visible=false;});if(options.aurora)auroraMeshes.forEach(function(m){m.visible=hasForecast();});
   if(options.reference)earthMaterial.uniforms.photoEnabled.value=0;if(options.thermal)earthMaterial.uniforms.naturalEnabled.value=0;
   renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,Math.floor(w/2),Math.floor(h/2),1,1,pixel);return Array.from(pixel);
  }finally{items.forEach(function(m,i){m.visible=visible[i];});earthMaterial.uniforms.photoEnabled.value=oldPhoto;earthMaterial.uniforms.naturalEnabled.value=oldNatural;renderer.setRenderTarget(oldTarget);rt.dispose();}
 },
 nightForecastPoint:function(){if(!forecast)return null;var best=null;for(var lat=-80;lat<=80;lat++)for(var lon=0;lon<360;lon++){
  var p=forecast.grid[(lat+90)*360+lon],east=lon>180?lon-360:lon,elevation=math.solarElevation(instant,lat,east);
  if(elevation< -15&&(!best||p>best.probability))best={lat:lat,lon:east,probability:p,elevation:elevation};}return best;}
};`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.bin':'application/octet-stream','.json':'application/json','.gz':'application/gzip','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{let body=fs.readFileSync(file);if(file.endsWith('/js/globe.js')){const s=body.toString(),i=s.lastIndexOf('}());');assert(i>=0,'Renderer closure exists');body=Buffer.from(s.slice(0,i)+hooks+s.slice(i));}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}catch{res.writeHead(404).end();}});
function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,body){const tag=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,body])));return Buffer.concat([size,tag,body,crc]);}
const images=new Map();
function image(width,kind,time){const key=width+'/'+kind+'/'+time;if(images.has(key))return images.get(key);const height=width/2,header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const stride=width*4+1,pixels=Buffer.alloc(stride*height),earlier=time.includes('T00:');
 for(let y=0;y<height;y++){const lat=90-(y+.5)/height*180;for(let x=0;x<width;x++){const lon=-180+(x+.5)/width*360,at=y*stride+1+x*4;
  let c=kind==='infrared'?[100,100,100]:[110,110,110];
  if(kind==='natural'&&Math.abs(lat)<8){if(lon>=90&&lon<118)c=[20,180,190];else if(lon>=118&&lon<140)c=[35,170,45];else if(lon>=140&&lon<158)c=[175,120,60];}
  if(kind==='infrared'&&Math.abs(lat)<8&&lon>=118&&lon<140)c=[0,0,0];
  if(earlier)c=kind==='infrared'?[80,80,80]:[150,125,110];
  pixels[at]=c[0];pixels[at+1]=c[1];pixels[at+2]=c[2];pixels[at+3]=Math.abs(lat)<75+3*Math.cos(lon*Math.PI/36)?255:0;
 }}
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);images.set(key,bytes);return bytes;}
const capabilities='<WMS_Capabilities>'+['mumi:wideareacoverage_rgb_natural','mumi:worldcloudmap_ir108'].map(layer=>'<Layer><Name>'+layer+'</Name><Dimension name="time">2026-10-04T21:00:00.000Z/2026-10-05T03:00:00.000Z/PT3H</Dimension></Layer>').join('')+'</WMS_Capabilities>';
const forecast=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/daylight/ovation-2026-10-04-storm.json')));forecast['Observation Time']='2026-10-05T03:00:00Z';forecast['Forecast Time']='2026-10-05T03:40:00Z';
function gate(){let release,enter;return {promise:new Promise(r=>{release=r;}),release:()=>release(),entered:new Promise(r=>{enter=r;}),enter:()=>enter()};}
async function routeSources(context,options={}){
 const requests=[],counts=new Map();
 await context.route('https://view.eumetsat.int/**',async route=>{const q=new URL(route.request().url()).searchParams;if(q.get('request')==='GetCapabilities')return route.fulfill({contentType:'text/xml',body:capabilities});
  const width=Number(q.get('width')),kind=q.get('layers').endsWith('ir108')?'infrared':'natural',time=q.get('time'),key=time+'/'+width+'/'+kind,attempt=(counts.get(key)||0)+1;counts.set(key,attempt);requests.push({width,kind,time,attempt});
  if(options.failInitial2048&&width===2048&&kind==='infrared'&&attempt===1)return route.fulfill({status:503,contentType:'text/plain',body:'Initial high-resolution service failure'});
  if(options.failInitialNatural&&width===2048&&kind==='natural'&&attempt===1)return route.fulfill({status:503,contentType:'text/plain',body:'Initial natural-color companion unavailable'});
  if(options.failNatural4096&&width===4096&&kind==='natural')return route.fulfill({status:503,contentType:'text/plain',body:'Sharper natural-color companion unavailable'});
  if(options.downloadGate&&width===2048&&kind==='infrared'&&attempt>1){options.downloadGate.enter();await options.downloadGate.promise;}
  if(options.naturalDownloadGate&&width===2048&&kind==='natural'&&attempt>1){options.naturalDownloadGate.enter();await options.naturalDownloadGate.promise;}
  if(options.sharperDownloadGate&&width===4096&&kind==='infrared'){options.sharperDownloadGate.enter();await options.sharperDownloadGate.promise;}
  try{await route.fulfill({contentType:'image/png',body:image(width,kind,time)});}catch{}
 });
 await context.route('https://services.swpc.noaa.gov/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('ovation')?forecast:[['time_tag','Kp'],['2026-10-05 00:00:00','5.67']])}));
 await context.route('https://raw.githubusercontent.com/**',route=>route.fulfill({status:404,contentType:'text/plain',body:'No remote archive in quality fixture'}));
 await context.route('https://gibs.earthdata.nasa.gov/**',route=>route.fulfill({status:503,contentType:'text/plain',body:'Daily fallback must not be needed'}));
 return requests;
}
async function setup(browser,options={}){const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,timezoneId:'America/Chicago'}),requests=await routeSources(context,options),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push(m.text());});
 await page.clock.setFixedTime(new Date(fixedNow));return {context,page,requests};}
async function open(page){await page.goto('http://127.0.0.1:'+server.address().port+'/daylight-globe.html');await page.waitForFunction(()=>window.__globeQuality&&!__globeQuality.state().loading,null,{timeout:30000});}
async function state(page){return page.evaluate(()=>__globeQuality.state());}
async function decodeGate(page,width,onlyTime){const g=gate();let calls=0;await page.exposeFunction('__qualityDecodeWait',async()=>{calls++;await g.promise;});
 await page.addInitScript(({width,onlyTime})=>{const create=window.createImageBitmap.bind(window);window.createImageBitmap=async function(blob,...args){if(blob.type==='image/png'){const h=new DataView(await blob.slice(0,24).arrayBuffer());if(h.byteLength===24&&h.getUint32(16)===width&&(!onlyTime||window.__globeQuality?.state().photo?.time===onlyTime)){window.__qualityDecodePending=width;await window.__qualityDecodeWait();}}return create(blob,...args);};},{width,onlyTime});return {release:g.release,get calls(){return calls;}};}
async function gpuChecks(browser){const {context,page,requests}=await setup(browser);try{await open(page);const initial=await state(page);check('renderer clears the sky to black',initial.clear==='000000',initial.clear);
 const cyan=await page.evaluate(()=>__globeQuality.sample(0,108)),vegetation=await page.evaluate(()=>__globeQuality.sample(0,130)),land=await page.evaluate(()=>__globeQuality.sample(0,149));
 check('GPU renders cyan ice-cloud fixture with neutral channels',Math.max(...cyan.slice(0,3))-Math.min(...cyan.slice(0,3))<=8&&cyan[0]>100,cyan);
 check('GPU keeps observed vegetation green',vegetation[1]>vegetation[0]+50&&vegetation[1]>vegetation[2]+50,vegetation);
 check('GPU keeps brown land rather than neutralizing it',land[0]>land[1]+30&&land[1]>land[2]+25,land);
 const gap=await page.evaluate(()=>__globeQuality.sample(86,130)),reference=await page.evaluate(()=>__globeQuality.sample(86,130,{reference:true}));
 check('missing polar imagery exposes exactly the reference map',gap.slice(0,3).every((x,i)=>Math.abs(x-reference[i])<=1),{gap,reference});
 const blackIR=await page.evaluate(()=>__globeQuality.texture('infrared',0,130)),thermal=await page.evaluate(()=>__globeQuality.sample(0,130,{thermal:true}));
 check('opaque black infrared remains observed rather than becoming a cloud-opacity mask',blackIR[3]===255&&blackIR.slice(0,3).every(x=>x===0)&&thermal.slice(0,3).every(x=>x<=2),{texture:blackIR,pixel:thermal});
 const edge=await page.evaluate(()=>({missing:__globeQuality.texture('infrared',79,0),edge:__globeQuality.texture('infrared',77.7,0),middle:__globeQuality.texture('infrared',76.5,0),southMiddle:__globeQuality.texture('infrared',-76.5,0),inside:__globeQuality.texture('infrared',74,0)}));
 check('installed polar coverage preserves gaps and fades only inside three degrees',edge.missing[3]===0&&edge.edge[3]>0&&edge.edge[3]<255&&edge.middle[3]>64&&edge.middle[3]<192&&edge.southMiddle[3]>64&&edge.southMiddle[3]<192&&edge.inside[3]===255,edge);
 const point=await page.evaluate(()=>__globeQuality.nightForecastPoint());assert(point&&point.probability>20,'Storm fixture has a dark forecast point');
 const base=await page.evaluate(p=>__globeQuality.sample(p.lat,p.lon),point),aurora=await page.evaluate(p=>__globeQuality.sample(p.lat,p.lon,{aurora:true}),point),gain=aurora[1]-base[1];
 check('strong dark aurora remains visible without washing cloud colors green',gain>0&&gain<=25,{point,base,aurora,gain});
 check('installed power-of-two weather textures have mip sampling enabled',initial.filters.natural.mips&&initial.filters.infrared.mips&&initial.filters.natural.anisotropy>=1,initial.filters);
 evidence.push({gpu:{initial,cyan,vegetation,land,gap,reference,blackIR,thermal,edge,point,base,aurora,gain},requests});await page.locator('#globe-container').screenshot({path:path.join(dump,'quality-gpu-fixture.png')});
 }finally{await context.close();}}
async function retainedUpgradeChecks(browser){const download=gate(),{context,page,requests}=await setup(browser,{failInitial2048:true,downloadGate:download});let decode;
 try{decode=await decodeGate(page,2048);await open(page);await page.waitForFunction(()=>__globeQuality.state().detailBusy);await download.entered;const pending=await state(page);
 check('fallback starts a sharper request for the identical timestamp',pending.photo.width===1024&&requests.some(r=>r.width===2048&&r.kind==='infrared'&&r.attempt===2&&r.time===pending.photo.time),{pending,requests});
 check('download-pending upgrade retains the complete visible frame and controls',pending.textures.natural[0]===1024&&pending.textures.infrared[0]===1024&&pending.photoMix===1&&!pending.loading&&pending.controls,pending);
 download.release();await page.waitForFunction(()=>window.__qualityDecodePending===2048);const decoding=await state(page);
 check('decode-pending upgrade retains both prior installed textures',decoding.photo.width===1024&&decoding.textures.natural[0]===1024&&decoding.textures.infrared[0]===1024&&decoding.photoMix===1&&!decoding.loading,decoding);
 decode.release();await page.waitForFunction(()=>__globeQuality.state().photo?.width===2048);const sharper=await state(page);
 check('ready sharper image replaces the frame without changing time or fading it out',sharper.photo.time===pending.photo.time&&sharper.photo.width===2048&&sharper.textures.natural[0]===2048&&sharper.textures.infrared[0]===2048&&sharper.photoMix===1&&!sharper.loading,sharper);
 await page.evaluate(()=>__globeQuality.zoom(2.5));await page.waitForFunction(()=>__globeQuality.state().photo?.width===4096,null,{timeout:30000});const zoomed=await state(page);
 check('modest desktop zoom installs actual 4096 textures at the same source time',zoomed.photo.time===pending.photo.time&&zoomed.textures.natural[0]===4096&&zoomed.textures.infrared[0]===4096&&requests.filter(r=>r.width===4096&&r.time===pending.photo.time).length===2,zoomed);
 evidence.push({retained:{pending,decoding,sharper,zoomed},requests});
 }finally{download.release();if(decode)decode.release();await context.close();}}
async function missingNaturalChecks(browser){const download=gate(),sharper=gate(),{context,page,requests}=await setup(browser,{failInitialNatural:true,naturalDownloadGate:download,failNatural4096:true,sharperDownloadGate:sharper});let decode;
 try{decode=await decodeGate(page,2048,'2026-10-05T03:00:00.000Z');await open(page);await download.entered;const pending=await state(page);
 check('infrared-only frame retries its missing color at the existing resolution and timestamp',pending.photo.width===2048&&!pending.photo.natural&&pending.detailBusy&&requests.some(r=>r.width===2048&&r.kind==='natural'&&r.attempt===2&&r.time===pending.photo.time),{pending,requests});
 check('missing-color download preserves observed infrared and available controls',pending.textures.natural[0]===2048&&pending.textures.infrared[0]===2048&&pending.photoMix===1&&!pending.loading&&pending.controls,pending);
 download.release();await page.waitForFunction(()=>window.__qualityDecodePending===2048);const decoding=await state(page);
 check('same-resolution color decode retains the infrared frame until ready',!decoding.photo.natural&&decoding.photo.time===pending.photo.time&&decoding.photoMix===1&&!decoding.loading,decoding);
 decode.release();await page.waitForFunction(()=>__globeQuality.state().photo?.natural===true);const recovered=await state(page);
 check('ready color companion replaces infrared-only display without changing time or resolution',recovered.photo.width===2048&&recovered.photo.time===pending.photo.time&&recovered.textures.natural[0]===2048&&recovered.textures.infrared[0]===2048&&recovered.photoMix===1&&!recovered.loading,recovered);
 await page.evaluate(()=>__globeQuality.zoom(2.5));await sharper.entered;sharper.release();await page.waitForFunction(()=>!__globeQuality.state().detailBusy);const kept=await state(page);
 check('sharper infrared-only result cannot replace installed natural color',kept.photo.natural&&kept.photo.width===2048&&kept.photo.time===pending.photo.time&&kept.textures.natural[0]===2048&&kept.textures.infrared[0]===2048&&requests.some(r=>r.width===4096&&r.kind==='infrared'&&r.time===pending.photo.time),{kept,requests});
 evidence.push({missingNatural:{pending,decoding,recovered,kept},requests});
 }finally{download.release();sharper.release();if(decode)decode.release();await context.close();}}
async function staleUpgradeCheck(browser){const {context,page,requests}=await setup(browser);let decode;
 try{decode=await decodeGate(page,4096,'2026-10-05T03:00:00.000Z');await open(page);await page.evaluate(()=>__globeQuality.zoom(2.5));await page.waitForFunction(()=>window.__qualityDecodePending===4096);const old=await state(page);
 check('old sharper decode begins while its prior frame remains installed',old.photo.width===2048&&old.detailBusy&&old.photo.time==='2026-10-05T03:00:00.000Z',old);
 await page.evaluate(()=>__globeQuality.zoom(4));await page.locator('#globe-hour').fill('1150');await page.locator('#globe-hour').dispatchEvent('input');
 await page.waitForFunction(()=>__globeQuality.state().photo?.time==='2026-10-05T00:00:00.000Z');const chosen=await state(page);decode.release();await page.waitForTimeout(300);const after=await state(page);
 check('time edit defeats a late sharper image from the previous timestamp',after.photo.time===chosen.photo.time&&after.photo.time==='2026-10-05T00:00:00.000Z'&&after.photo.width===2048&&after.textures.natural[0]===2048&&after.generation>old.generation,{old,chosen,after});
 evidence.push({stale:{old,chosen,after},requests});
 }finally{if(decode)decode.release();await context.close();}}
let browser;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const startHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'js/globe.js'))).digest('hex');try{browser=await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true,args:['--disable-gpu-vsync','--disable-frame-rate-limit']});await gpuChecks(browser);await retainedUpgradeChecks(browser);await missingNaturalChecks(browser);await staleUpgradeCheck(browser);check('quality run has no JavaScript, shader or texture errors',errors.length===0,errors);}finally{fs.writeFileSync(path.join(dump,'results.json'),JSON.stringify({fixedNow,startHash,checks,evidence,errors},null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}const failed=checks.filter(c=>!c.pass);assert.equal(failed.length,0,failed.map(c=>c.name).join('; '));console.log(checks.length+' quality checks passed');})().catch(e=>{console.error(e);process.exitCode=1;});
