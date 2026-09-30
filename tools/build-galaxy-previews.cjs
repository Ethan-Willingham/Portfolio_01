// NODE_PATH=/path/to/node_modules node tools/build-galaxy-previews.cjs
// Needs Playwright and Sharp. SCENE=grid rebuilds one preview; DUMP changes the QA directory.
// Captures real scene geometry with a static camera and compact WebP output.
// Explore forms are framed as finite objects so a thumbnail shows the whole shape.
// Capture-only hooks are injected by the local server and never sent to readers.
// The owned Chrome for Testing process is always closed in finally.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.DUMP || '/tmp/galaxy-preview-qa';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + req.url.split('?')[0]);
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('/js/random-galaxy.js')) {
      let src=data.toString().replace('window.GXCAM =', 'window.__chooseScene = selectScene; window.GXCAM =')
        .replace('var absCam = isSearchField(currentField) || isSortField(currentField) || isLifeField(currentField);', 'var absCam = window.__thumbFinite || isSearchField(currentField) || isSortField(currentField) || isLifeField(currentField);')
        .replace('lifeOn = isLifeField(currentField);', 'lifeOn = window.__thumbFinite || isLifeField(currentField);'); const at=src.lastIndexOf('})();');
      src=src.slice(0,at) + `window.__gxPreview = { state: () => ({field:currentField,running}), thumbnail: scene => { window.__thumbFinite=false; window.__chooseScene(scene); pendingField=null; gridPending=false; loadField(scene==='grid'||scene==='mulberry'?'random':scene); applyStartView(scene); morph=morphTarget=scene==='grid'?0:1; introLum=1;introStarted=true;INTRO_DONE=true;applySpeed(0); if(isSearchField(currentField)){for(var i=0;i<22000&&!pf.reached&&!pf.done;i++)searchStep(); searchWriteDev(); searchBuildActiveLine(); device.queue.writeBuffer(instanceBuffer,0,positions,0,(pf.total+pf.lineCount)*4);resetSearchView();} if(isSortField(currentField)){sortBuildOps();for(var i=0,n=Math.floor(sr.ops.length*.38);i<n;i++)sortStep();for(var i=0;i<sr.n;i++){sr.x[i]=sr.slotOf[i];sr.flag[i]=0;}sr.phase='sort';sortLayout();device.queue.writeBuffer(instanceBuffer,0,positions,0,sr.total*4);resetSortView(false);}
 if(scene==='attractor'){for(var j=0;j<90;j++)lifeTick(.033);}
 if(!isOrbitField(currentField)){
  window.__thumbFinite=true;
  var n=Math.min(160000,POINT_COUNT), stride=POINT_COUNT/n;
  for(var j=0;j<n;j++){var k=Math.floor(j*stride)*4;for(var q=0;q<4;q++)positions[j*4+q]=positions[k+q];}
  if(scene==='grid') {morph=morphTarget=1;var g=Math.ceil(Math.cbrt(n));function hash(x){var h=x;h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h&0xffffff)/16777216;}for(var j=0;j<n;j++){positions[j*4]=(j%g+hash(j*3))/g;positions[j*4+1]=(Math.floor(j/g)%g+hash(j*3+1))/g;positions[j*4+2]=(Math.floor(j/g/g)+hash(j*3+2))/g;positions[j*4+3]=1;}}
  var lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(var j=0;j<n;j+=8){for(var q=0;q<3;q++){lo[q]=Math.min(lo[q],positions[j*4+q]);hi[q]=Math.max(hi[q],positions[j*4+q]);}}
  var c=lo.map((x,i)=>(x+hi[i])/2), r=Math.max(...hi.map((x,i)=>x-lo[i]))*1.6;
  camPos=[c[0]+r*.75,c[1]+r*.4,c[2]+r*.65];camFwd=vnorm(c.map((x,i)=>x-camPos[i]));camUp=vnorm(vcross(vnorm(vcross(camFwd,[0,1,0])),camFwd));
  lifeDrawCount=n;device.queue.writeBuffer(instanceBuffer,0,positions,0,n*4);
 }
 } };\n` +src.slice(at);
      data=Buffer.from(src);
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(data);
  } catch {res.writeHead(404).end();}
});
let browser;
function check(label,condition) { assert.ok(condition,label); process.stdout.write('PASS '+label+'\n'); }
async function state(page) {return page.evaluate(() => __gxPreview.state());}

async function setup(context) {
  await context.route('https://www.googletagmanager.com/**', r=>r.abort());
  const page=await context.newPage();
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/random-galaxy.html');
  await page.waitForFunction(()=>window.__gxPreview && __gxPreview.state().running);
  await page.evaluate(()=>document.fonts.ready);
  return page;
}
const sharp=require('sharp');
const previewDir=path.join(root,'assets/galaxy-previews');fs.mkdirSync(previewDir,{recursive:true});
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || path.join(require('node:os').homedir(),'.local/bin/agent-chrome-for-testing'),args:['--enable-unsafe-webgpu']});
 const context=await browser.newContext({viewport:{width:800,height:520},deviceScaleFactor:1});const page=await setup(context);
 await page.evaluate(()=>{document.getElementById('galaxy-wrapper').classList.add('gx-clean');const style=document.createElement('style');style.textContent='#galaxy-wrapper button,#galaxy-wrapper svg{visibility:hidden!important}';document.head.appendChild(style);});
 await page.waitForTimeout(1000);
 const scenes=await page.locator('.gx-cat-select option').evaluateAll(es=>es.filter(e=>e.value).map(e=>({value:e.value,name:e.textContent.trim()})));
 for(const scene of scenes.filter(s=>!process.env.SCENE||s.value===process.env.SCENE)){
  await page.evaluate(s=>__gxPreview.thumbnail(s),scene.value);await page.waitForTimeout(320);
  const png=await page.locator('#galaxy-canvas').screenshot();
  await sharp(png).resize(320,200,{fit:'cover'}).webp({quality:76}).toFile(path.join(previewDir,scene.value+'.webp'));
  process.stdout.write('Captured '+scene.value+'\n');
 }
 const tiles=[];for(let i=0;i<scenes.length;i++){
  const tile=await sharp(path.join(previewDir,scenes[i].value+'.webp')).resize(160,100).png().toBuffer();
  const label=Buffer.from('<svg width="160" height="26"><rect width="160" height="26" fill="#1e2420"/><text x="8" y="18" fill="#e8e2d6" font-family="sans-serif" font-size="12">'+scenes[i].value+'</text></svg>');
  tiles.push({input:tile,left:(i%5)*160,top:Math.floor(i/5)*126},{input:label,left:(i%5)*160,top:Math.floor(i/5)*126+100});
 }
 await sharp({create:{width:800,height:Math.ceil(scenes.length/5)*126,channels:3,background:'#1e2420'}}).composite(tiles).png().toFile(out+'/preview-contact-sheet.png');
 const total=fs.readdirSync(previewDir).reduce((n,f)=>n+fs.statSync(path.join(previewDir,f)).size,0);
 process.stdout.write(scenes.length+' previews, '+Math.round(total/1024)+' KB total\n');
 check('no browser or GPU errors',errors.length===0);
}catch(e){process.stderr.write(e.stack+'\n'+JSON.stringify(errors)+'\n');process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
