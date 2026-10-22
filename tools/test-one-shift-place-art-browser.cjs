'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),dump=process.env.SHIFT_DUMP||path.join(require('node:os').tmpdir(),'one-shift-place-art');
fs.mkdirSync(dump,{recursive:true});
let server,browser,checks=0;
const errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const target=(page,id)=>page.locator('#place-targets .place-target[data-place="'+id+'"]');
const state=page=>page.evaluate(()=>JSON.stringify({place:OneShift.app.places.current,clocked:OneShift.app.places.clockedIn,paper:OneShift.app.office.visible?OneShift.app.office.kind:null}));
const shot=(page,name)=>page.screenshot({path:path.join(dump,name+'.png')});

async function ready(page){
  await page.waitForFunction(()=>OneShift.app?.places&&document.querySelector('#place-targets .place-target[data-point-x]')&&document.getElementById('place-image').complete&&document.getElementById('place-image').naturalWidth>0);
  await page.evaluate(()=>document.fonts.ready);
}

async function point(page,id){
  return target(page,id).evaluate(node=>{
    const r=node.closest('.place-art').getBoundingClientRect();
    return {x:r.left+Number(node.dataset.pointX)*r.width,y:r.top+Number(node.dataset.pointY)*r.height};
  });
}

async function choose(page,id,touch=false){
  await page.locator('#place-loading').waitFor({state:'hidden'});
  await target(page,id).waitFor({state:'visible'});
  const p=await point(page,id);
  if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
}

async function transparent(page,id){
  return target(page,id).evaluate(node=>{
    const style=getComputedStyle(node);
    return style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.backgroundImage==='none'&&style.borderTopWidth==='0px'&&style.boxShadow==='none'&&style.outlineStyle==='none'&&style.opacity==='1'&&node.childElementCount===0&&!node.textContent.trim();
  });
}

async function contour(page,id){
  return page.evaluate(id=>{
    const button=document.querySelector('#place-targets [data-place="'+id+'"]'),group=document.querySelector('[data-place-outline="'+id+'"]');
    const clipId=button.style.clipPath.match(/#([^"')]+)/)?.[1],clip=document.getElementById(clipId);
    const outer=group.querySelector('.place-art-contour-outer'),inner=group.querySelector('.place-art-contour-inner');
    return group.classList.contains('is-highlighted')&&getComputedStyle(group).display!=='none'&&inner.getAttribute('d')===outer.getAttribute('d')&&inner.getAttribute('d')===clip?.querySelector('path')?.getAttribute('d')&&getComputedStyle(inner).fill==='none'&&getComputedStyle(outer).fill==='none'&&parseFloat(getComputedStyle(inner).strokeWidth)>0;
  },id);
}

async function pixels(page,p){
  const image=await page.screenshot({clip:{x:Math.floor(p.x)-2,y:Math.floor(p.y)-2,width:5,height:5}});
  return sharp(image).removeAlpha().raw().toBuffer();
}

async function inspectScene(page,name){
  await ready(page);
  const ids=await page.locator('#place-targets .place-target').evaluateAll(nodes=>nodes.map(node=>node.dataset.place));
  check(name+' uses named empty clipped targets without label boxes',ids.length>0&&await page.locator('#place-targets .place-target').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('aria-label')&&node.childElementCount===0&&!node.textContent.trim()&&node.style.clipPath.includes('url('))));
  let missed=0;
  for(const id of ids){
    const p=await point(page,id);
    const valid=await target(page,id).evaluate(node=>{
      const art=node.closest('.place-art'),r=art.getBoundingClientRect(),svg=art.querySelector('.place-art-contours'),box=svg.viewBox.baseVal;
      const x=Number(node.dataset.pointX)*box.width,y=Number(node.dataset.pointY)*box.height;
      const path=art.querySelector('[data-place-outline="'+node.dataset.place+'"] .place-art-contour-inner').getAttribute('d');
      const context=document.createElement('canvas').getContext('2d');
      const hit=document.elementFromPoint(r.left+x/box.width*r.width,r.top+y/box.height*r.height);
      return context.isPointInPath(new Path2D(path),x,y)&&hit?.closest('.place-target')===node;
    });
    check(name+'/'+id+' authored interaction point hits its actual silhouette',valid);
    await page.locator('#shift-place').focus();
    await page.mouse.move(1,1);
    const original=await pixels(page,p),before=await state(page);
    await page.mouse.move(p.x,p.y);
    check(name+'/'+id+' hover draws only the registered object contour',await transparent(page,id)&&await contour(page,id));
    const hovered=await pixels(page,p);
    check(name+'/'+id+' hover leaves interior artwork unchanged',Buffer.compare(original,hovered)===0);
    await shot(page,'01-'+name+'-'+id+'-hover');
    await page.mouse.down();
    check(name+'/'+id+' held press cannot paint an opaque rectangle',await transparent(page,id)&&Buffer.compare(original,await pixels(page,p))===0);
    await page.mouse.move(1,1);
    await page.mouse.up();
    check(name+'/'+id+' releasing outside the object does not activate it',await state(page)===before);
    await page.keyboard.press('Tab');
    await target(page,id).focus();
    check(name+'/'+id+' keyboard focus follows the same object contour',await transparent(page,id)&&await contour(page,id));
    if(name==='clock')await shot(page,'02-clock-keyboard-focus');
    await page.locator('#shift-place').focus();

    const outside=await target(page,id).evaluate(node=>{
      const art=node.closest('.place-art'),r=art.getBoundingClientRect(),box=art.querySelector('svg').viewBox.baseVal;
      const [x,y,w,h]=node.dataset.sourceBounds.split(',').map(Number),ctx=document.createElement('canvas').getContext('2d');
      const paths=[...art.querySelectorAll('.place-art-contour-inner')].map(path=>new Path2D(path.getAttribute('d')));
      for(let row=1;row<40;row++)for(let col=1;col<40;col++){
        const px=x+w*col/40,py=y+h*row/40;
        if(paths.some(path=>ctx.isPointInPath(path,px,py)))continue;
        const clientX=r.left+px/box.width*r.width,clientY=r.top+py/box.height*r.height;
        const hit=document.elementFromPoint(clientX,clientY);
        if(hit&&art.contains(hit)&&!hit.closest('.place-target'))return {x:clientX,y:clientY};
      }
      return null;
    });
    if(outside){
      const beforeMiss=await state(page);
      await page.mouse.click(outside.x,outside.y);
      check(name+'/'+id+' empty space inside its bounds is not clickable',await state(page)===beforeMiss);
      missed++;
    }
  }
  check(name+' includes tested misses outside irregular object edges',missed>0);
  await page.mouse.move(1,1);
  await page.locator('#shift-place').focus();
  await shot(page,'03-'+name+'-unmarked');
}

(async()=>{
  let url=process.env.SHIFT_URL;
  if(!url){
    server=http.createServer((req,res)=>{
      const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);});
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    url='http://127.0.0.1:'+server.address().port+'/one-shift.html';
  }
  browser=await chromium.launch({headless:true});
  const desktop=await browser.newContext({viewport:{width:1440,height:900}}),page=await desktop.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await ready(page);await page.bringToFront();
  await inspectScene(page,'clock');
  await choose(page,'punch');
  await inspectScene(page,'floor');
  const officePoint=await point(page,'office');
  await page.mouse.move(officePoint.x,officePoint.y);
  await target(page,'office').focus();
  await page.keyboard.press('Tab');
  check('Tab advances visible focus while the mouse stays over Office',await target(page,'staging').evaluate(node=>document.activeElement===node&&node.matches(':focus-visible')));
  check('Keyboard Receiving focus takes priority over stationary Office hover',await contour(page,'staging')&&await page.locator('[data-place-outline="office"]').evaluate(node=>!node.classList.contains('is-highlighted'))&&await page.locator('#place-note').innerText().then(text=>text.includes('Receiving')));
  await shot(page,'09-keyboard-priority-over-hover');
  await page.locator('#shift-place').focus();
  await choose(page,'office');
  await inspectScene(page,'office');
  await page.keyboard.press('Tab');await target(page,'purchases').focus();await page.keyboard.press('Enter');
  check('Enter on the purchase-pad silhouette opens purchase orders',await page.locator('#shift-office-papers').isVisible()&&await page.locator('#office-paper-title').textContent()==='Purchase orders');
  await page.keyboard.press('Escape');
  check('Closing the paper restores focus and contour to the same desk object',await target(page,'purchases').evaluate(node=>document.activeElement===node)&&await contour(page,'purchases'));
  await choose(page,'floor');
  check('The office door silhouette returns to the real central floor',await page.evaluate(()=>OneShift.app.places.current==='floor'));
  await desktop.close();

  const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1}),p=await mobile.newPage();
  p.on('pageerror',error=>errors.push(error.message));
  await p.goto(url);await ready(p);await p.bringToFront();
  await p.evaluate(()=>{const places=OneShift.app.places,choose=places.choose;window.artActivations=[];places.choose=function(id){window.artActivations.push(id);return choose.call(this,id);};});
  const cdp=await mobile.newCDPSession(p),clock=await point(p,'punch');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[clock]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:clock.x+60,y:clock.y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('Dragging a touch away from the clock cancels the action',await p.evaluate(()=>!OneShift.app.places.clockedIn&&window.artActivations.length===0));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[clock]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  check('Native touch cancellation clears the contour without clocking in',await p.evaluate(()=>!OneShift.app.places.clockedIn&&window.artActivations.length===0)&&await p.locator('.place-art-contour.is-highlighted').count()===0);
  await choose(p,'punch',true);await ready(p);await p.waitForTimeout(150);await shot(p,'05-touch-floor');
  check('Touching the clock activates once across the room replacement',await p.evaluate(()=>OneShift.app.places.current==='floor'&&JSON.stringify(window.artActivations)==='["punch"]'));
  await choose(p,'office',true);await ready(p);await shot(p,'06-touch-office');
  const pad=await point(p,'purchases');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pad]});await shot(p,'07-touch-office-hover');
  await p.setViewportSize({width:375,height:667});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('Rotation during a held object cancels activation',await p.locator('#shift-rotate').isVisible()&&!await p.locator('#shift-office-papers').isVisible());
  await p.setViewportSize({width:844,height:390});await ready(p);
  await choose(p,'purchases',true);
  check('A fresh touch still opens the desk object after rotation',await p.locator('#shift-office-papers').isVisible()&&await p.evaluate(()=>window.artActivations.filter(id=>id==='purchases').length===1));
  await shot(p,'04-touch-purchase-pad');
  await mobile.close();
  check('Contour interaction produces no browser errors',errors.length===0);
  console.log(checks+' place-art browser checks passed. Screenshots '+dump);
})().catch(error=>{console.error(error);if(errors.length)console.error(errors);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
