'use strict';
// Presentation-only checks against the real title/gallery. Unity is never loaded.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.SHIFT_DEMOS_UI_DUMP||path.join(os.tmpdir(),'warehouse-v12-demos-ui');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
let browser;const checks=[],errors=[],measurements=[];
function check(label,value){assert.ok(value,label);checks.push(label);console.log('PASS '+label);}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:720}});let unityRequests=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/OneShiftWeb\./.test(request.url()))unityRequests++;});
  for(const [width,height] of [[1280,720],[900,600]]){
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:'+server.address().port+'/one-shift.html');
    await page.locator('#warehouse-demos').waitFor();await page.screenshot({path:path.join(output,'title-'+width+'.png')});
    const title=await page.evaluate(()=>{const menu=document.getElementById('warehouse-main-menu').getBoundingClientRect(),footer=document.querySelector('.warehouse-title-footer').getBoundingClientRect();return{menuBottom:menu.bottom,footerTop:footer.top};});
    measurements.push({width,height,title});check(width+' title menu clears its footer',title.menuBottom<=title.footerTop);
    await page.locator('#warehouse-demos').focus();await page.keyboard.press('Enter');await page.locator('#warehouse-demo-gallery').waitFor({state:'visible'});
    check(width+' gallery has three scenarios',await page.locator('[data-demo-select]').count()===3);
    for(const id of ['receive','transfer','pick-ship']){
      await page.locator('[data-demo-select="'+id+'"]').focus();await page.keyboard.press('Enter');
      check(width+' keyboard selects '+id,await page.locator('[data-demo-select="'+id+'"]').getAttribute('aria-pressed')==='true');
      const bounds=await page.evaluate(()=>{const button=document.getElementById('warehouse-demo-launch').getBoundingClientRect(),gallery=document.getElementById('warehouse-demo-gallery');return{launchTop:button.top,launchBottom:button.bottom,viewport:innerHeight,scrollWidth:gallery.scrollWidth,clientWidth:gallery.clientWidth};});
      await page.screenshot({path:path.join(output,'gallery-'+id+'-'+width+'.png')});
      measurements.push({width,height,id,bounds});check(width+' '+id+' launch fits viewport',bounds.launchTop>=0&&bounds.launchBottom<=height);check(width+' '+id+' has no horizontal overflow',bounds.scrollWidth<=bounds.clientWidth);
    }
    await page.locator('#warehouse-demo-back').focus();await page.keyboard.press('Enter');check(width+' keyboard returns to title',await page.locator('#warehouse-demo-gallery').isHidden());
    check(width+' restores title focus',await page.locator('#warehouse-demos').evaluate(el=>el===document.activeElement));
  }
  check('Gallery never requests the Unity player',unityRequests===0);check('No browser script errors',errors.length===0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,scope:'Title/gallery presentation only. No Unity player or gameplay fixture.',checks,measurements,errors},null,2));console.log(output);
})().catch(error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,checks,measurements,errors,error:String(error)},null,2));}).finally(async()=>{if(browser)await browser.close();server.close();});
