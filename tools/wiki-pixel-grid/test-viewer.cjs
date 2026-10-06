const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const filename=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(filename,(err,bytes)=>{
  if(err){res.writeHead(404).end();return;}
  if(filename.endsWith('wiki-pixel-grid.js'))bytes=Buffer.from(bytes.toString().replace("fetch('assets/wiki-pixel-grid/manifest.json?v=1')", "window.__gridQA={state:()=>({camera:{...camera},resident:images.size,width,height,ready:!!data}),fit}; fetch('assets/wiki-pixel-grid/manifest.json?v=1')"));
  res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.end(bytes);
 });
});
(async()=>{
 let browser;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await chromium.launch({executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',headless:true});
  const errors=[];
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  await page.addInitScript(()=>{window.__opened=[];window.open=(...args)=>{window.__opened.push(args);return null;};});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/wiki-pixel-grid.html`);
  await page.waitForFunction(()=>window.__gridQA?.state().ready);
  await page.waitForTimeout(300);
  const get=()=>page.evaluate(()=>window.__gridQA.state());
  let before=await get();
  assert.equal(before.width,1440);assert.equal(before.height,900);
  await page.mouse.move(400,400);await page.mouse.wheel(0,-240);await page.waitForTimeout(150);
  let after=await get();assert(after.camera.scale>before.camera.scale);
  const px=(400-before.camera.x)/before.camera.scale,py=(400-before.camera.y)/before.camera.scale;
  assert(Math.abs(px-(400-after.camera.x)/after.camera.scale)<.01);
  assert(Math.abs(py-(400-after.camera.y)/after.camera.scale)<.01);
  const target=await page.evaluate(async()=>{
    const data=await (await fetch('assets/wiki-pixel-grid/manifest.json')).json();
    const camera=window.__gridQA.state().camera;
    const tile=data.tiles.find((t,i)=>t.image && camera.x+((i%data.columns)*260+128)*camera.scale>0 && camera.x+((i%data.columns)*260+128)*camera.scale<1440 && camera.y+(Math.floor(i/data.columns)*260+128)*camera.scale>0 && camera.y+(Math.floor(i/data.columns)*260+128)*camera.scale<900);
    const i=tile.id-1;
    return {x:camera.x+((i%data.columns)*260+128)*camera.scale,y:camera.y+(Math.floor(i/data.columns)*260+128)*camera.scale,url:tile.articleUrl};
  });
  await page.mouse.click(target.x,target.y);
  assert.equal(await page.evaluate(()=>window.__opened[0]?.[0]),target.url);
  before=after;
  await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(820,460,{steps:10});await page.waitForTimeout(100);await page.mouse.up();
  after=await get();assert(after.camera.x>before.camera.x+100);
  assert.equal(await page.evaluate(()=>window.__opened.length),1,'Dragging must not open an article');
  assert.equal(await page.locator('#article-links a').count(),JSON.parse(fs.readFileSync(path.join(root,'assets/wiki-pixel-grid/manifest.json'))).tiles.filter(t=>t.image).length);
  await page.locator('#grid').focus();await page.keyboard.press('Home');await page.waitForTimeout(80);
  after=await get();assert(Math.abs(after.camera.scale-(1440/(25*260-4))*.96)<.001);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  after=await get();assert.equal(after.width,390);assert.equal(after.height,844);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:400},{x:220,y:400}]});
  before=await get();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:60,y:400},{x:280,y:400}]});
  await page.waitForTimeout(100);after=await get();assert(after.camera.scale>before.camera.scale*1.8);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert(after.resident<=12);
  assert.equal(await page.evaluate(()=>window.__opened.length),1,'Pinching must not open an article');
  assert.deepEqual(errors,[]);
  const screenshot=path.join(root,'research/wiki-pixel-grid/viewer-mobile.png');await page.screenshot({path:screenshot});
  console.log('PASS: fullscreen, anchored wheel zoom, drag, Home, resize, mobile pinch, resident cap, clean boot');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
