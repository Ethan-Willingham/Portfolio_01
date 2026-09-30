// NODE_PATH=/path/to/node_modules node tools/test-particle-life-browser.cjs
// Uses an owned Chrome for Testing process, closed in finally. Private hooks
// and COPY_SRC usage are injected by this server only, never shipped to readers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const dump = process.env.DUMP || '/tmp/particle-life-qa';
fs.mkdirSync(dump, { recursive: true });
const errors = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('/js/particle-life.js')) {
      let s = data.toString()
        .replaceAll('requestAnimationFrame(frame);', 'window.__plRaf = requestAnimationFrame(frame);')
        .replace("    context = canvas.getContext('webgpu');", `
          device.addEventListener('uncapturederror', e => console.error('GPU '+e.error.message));
          var createShader = device.createShaderModule.bind(device);
          device.createShaderModule = function(desc) {
            var mod=createShader(desc);
            mod.getCompilationInfo().then(info=>info.messages.forEach(m=>{
              if(m.type==='error')console.error('GPU shader '+m.lineNum+': '+m.message);
            }));
            return mod;
          };
          context = canvas.getContext('webgpu');`)
        .replaceAll('GPUBufferUsage.VERTEX', '(GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC)');
      const end = s.lastIndexOf('})();');
      s = s.slice(0, end) + `
        window.__plTest = {
          state: () => ({ pointer: { ...simPointer }, world: { ...simWorld }, scale: pointerScaleX,
            palette: speciesColors.slice(0,K), patterns: FIELD_PATTERNS.slice() }),
          openingSamples: () => {
            var saved=speciesColors.map(c=>c.slice()), samples=[];
            for(var i=0;i<100;i++) { applyOpeningPalette(); samples.push(speciesColors.slice(0,2)); }
            speciesColors=saved;
            return {samples,pairs:OPENING_PALETTES};
          },
          pattern: id => {
            fieldEnabled=true; fieldAutoMorph=false; fieldLayersOn=false;
            fieldPhase=0; fieldA=fieldB=id; fieldAlphaEased=0;
          },
          opening: i => {
            for(var j=0;j<K_MAX;j++) speciesColors[j]=OPENING_PALETTES[i][j%2].slice();
            uploadPalette();
          },
          colors: values => device.queue.writeBuffer(colorsBuffer,0,new Uint32Array(values)),
          freshPattern: id => {
            applyPreset('lava'); applyOpeningPalette(); uploadPalette(); spawnParticles(simN);
            simPointer.down=false;simPointer.id=null;simPointer.envelope=0;
            fieldEnabled=true;fieldAutoMorph=false;fieldLayersOn=false;
            fieldPhase=0;fieldA=fieldB=id;fieldAlphaEased=0;
          },
          stop: () => cancelAnimationFrame(window.__plRaf),
          step: (n=1) => {
            cancelAnimationFrame(window.__plRaf);
            for (var j=0;j<n;j++) { frame(prevTime+1000/60); cancelAnimationFrame(window.__plRaf); }
          },
          fixture: (points, options={}) => {
            cancelAnimationFrame(window.__plRaf);
            simN=points.length; simForce=options.force ?? 0;
            simFriction=options.friction ?? 1.45; fieldEnabled=false;
            simLooping=options.looping ?? true;
            Object.assign(simPointer,{down:false,id:null,envelope:0,hasPos:false,vx:0,vy:0});
            var data=new Float32Array(points.flatMap(p=>[p[0],p[1],0,0]));
            device.queue.writeBuffer(particlesA,0,data); device.queue.writeBuffer(particlesB,0,data);
            device.queue.writeBuffer(colorsBuffer,0,new Uint32Array(simN));
            matrix.fill(0); uploadMatrix();
          },
          read: async () => {
            var read=device.createBuffer({size:simN*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
            try {
              var enc=device.createCommandEncoder();
              enc.copyBufferToBuffer(pingFlip ? particlesB : particlesA,0,read,0,simN*16);
              device.queue.submit([enc.finish()]); await read.mapAsync(GPUMapMode.READ);
              return Array.from(new Float32Array(read.getMappedRange()));
            } finally { read.destroy(); }
          }
        };
      ` + s.slice(end);
      data = Buffer.from(s);
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
function check(name, condition) { assert.ok(condition, name); console.log('PASS ' + name); }
async function state(p) { return p.evaluate(() => __plTest.state()); }
async function step(p, n=1) { await p.evaluate(n => __plTest.step(n), n); }
async function fixture(p, points, options={}) { await p.evaluate(q => __plTest.fixture(q.points,q.options), {points,options}); }
async function read(p) { const a=await p.evaluate(() => __plTest.read()); return Array.from({length:a.length/4},(_,i)=>a.slice(i*4,i*4+4)); }
async function open(context, url) {
  await context.route('https://www.googletagmanager.com/**', r => r.abort());
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', e => { if (e.type()==='error' && /shader|validation|invalid|GPU|pipeline/i.test(e.text())) errors.push(e.text()); });
  await p.goto(url);
  await p.waitForFunction(() => document.querySelector('.pl-status').style.display==='none', {timeout:30000});
  await p.locator('.pl-canvas').scrollIntoViewIfNeeded();
  await p.evaluate(() => document.fonts.ready);
  return p;
}
let browser;
(async () => {
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/particle-life.html';
    browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=metal'],executablePath:process.env.PL_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing'});
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    const p=await open(context,url);
    check('all GPU pipelines compile',errors.length===0);
    const opening=await state(p), paletteRolls=await p.evaluate(()=>__plTest.openingSamples());
    const allowed=paletteRolls.pairs.map(q=>JSON.stringify(q));
    check('each visit opens on a curated contrasting pair',allowed.includes(JSON.stringify(opening.palette)));
    check('100 opening rolls stay within the curated set',paletteRolls.samples.every(q=>allowed.includes(JSON.stringify(q))));
    const wanted=['Vortex','Golden spiral','Flower of life','Twin galaxies','Figure eight','River bends'];
    check('the playlist contains the retained and new patterns only',JSON.stringify(opening.patterns)===JSON.stringify(wanted));
    await p.locator('.pl-toggle-auto').uncheck();
    const visited=[];
    for(let i=0;i<wanted.length;i++) {
      visited.push(await p.locator('.pl-field-name').textContent());
      await p.locator('.pl-field-next').click();
    }
    check('Next visits every pattern once',wanted.every(name=>visited.includes(name))&&new Set(visited).size===wanted.length);
    const current=await p.locator('.pl-field-name').textContent();
    await p.locator('.pl-field-prev').click();await p.locator('.pl-field-next').click();
    check('Previous and Next return to the same pattern',await p.locator('.pl-field-name').textContent()===current);
    let box=await p.locator('.pl-canvas').boundingBox();
    let cx=box.x+box.width/2, cy=box.y+box.height/2;
    await p.mouse.move(cx,cy); await p.mouse.down(); await p.waitForTimeout(500);
    await p.locator('.pl-canvas').screenshot({path:path.join(dump,'desktop-held.png')});
    await p.mouse.move(cx+150,cy-90,{steps:8});
    await p.locator('.pl-canvas').screenshot({path:path.join(dump,'desktop-swipe.png')});
    await p.mouse.up();
    check('desktop boots with the production swarm and releases a drag', !(await state(p)).pointer.down);
    await p.evaluate(() => __plTest.stop());
    // Screenshot scrolling and the opening fade can move the canvas box.
    box=await p.locator('.pl-canvas').boundingBox();
    cx=box.x+box.width/2; cy=box.y+box.height/2;
    let a=await state(p), x=a.world.w/2,y=a.world.h/2,r=a.pointer.radius;
    const ring=Array.from({length:16},(_,i)=>[x+Math.cos(i*Math.PI/8)*r*.35,y+Math.sin(i*Math.PI/8)*r*.35]);
    ring.push([x,y]);
    await fixture(p,ring,{friction:2.5});
    await p.mouse.move(cx,cy); await p.mouse.down(); await step(p,12);
    let points=await read(p);
    check('a held finger clears all nearby particles, including the exact center', points.every(q=>Math.hypot(q[0]-x,q[1]-y)>r*.5));
    check('GPU particle positions and velocities stay finite',points.flat().every(Number.isFinite));
    await p.mouse.up();
    // A one-frame stroke must affect particles midway, far from both endpoints.
    const startX=box.x+box.width*.15, endX=box.x+box.width*.85;
    await fixture(p,[[x,y+10],[x,y-10],[x,y+2*r]]);
    await p.mouse.move(startX,cy); await p.mouse.down();
    await p.mouse.move(endX,cy); await step(p);
    points=await read(p);
    check('a fast swipe transfers forward momentum through the whole swept path',points[0][2]>250&&points[1][2]>250);
    check('the swipe throws particles to both sides and leaves distant particles alone',points[0][3]>50&&points[1][3]<-50&&Math.hypot(points[2][2],points[2][3])<.001);
    await p.mouse.up(); await step(p,4);
    a=await state(p);
    check('release leaves a short moving wake',!a.pointer.down&&a.pointer.envelope>0&&a.pointer.vx>0);
    await step(p,100);
    check('the wake fully settles',(await state(p)).pointer.envelope===0);
    // A tap that begins and ends before a rendered frame still moves particles.
    await fixture(p,[[x+15,y]]);
    await p.mouse.move(cx,cy); await p.mouse.down(); await p.mouse.up(); await step(p);
    check('a quick tap has an immediate outward effect',(await read(p))[0][2]>30);
    await fixture(p,[[x+r*.4,y]],{force:1});
    await p.keyboard.down('Shift'); await p.mouse.move(cx,cy); await p.mouse.down(); await step(p);
    points=await read(p);
    check('Shift-drag keeps the alternate swirl', (await state(p)).pointer.mode===1&&Math.abs(points[0][3])>Math.abs(points[0][2]));
    await p.mouse.up(); await p.keyboard.up('Shift');
    await p.mouse.move(cx,cy); await p.mouse.down(); await p.mouse.move(box.x-25,cy); await p.mouse.up();
    check('releasing outside the canvas ends the captured gesture',!(await state(p)).pointer.down);
    await p.mouse.move(cx,cy); await p.mouse.down();
    await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    check('losing app focus ends the gesture',!(await state(p)).pointer.down);
    await p.mouse.up();
    const probe=[];
    for(let yy=.15;yy<.9;yy+=.14)for(let xx=.15;xx<.9;xx+=.14)probe.push([a.world.w*xx,a.world.h*yy]);
    const outputs=[];
    for(let id=3;id<6;id++) {
      await fixture(p,probe,{force:1});
      await p.evaluate(id=>__plTest.pattern(id),id);await step(p,8);
      const result=await read(p);outputs.push(result);
      check(wanted[id]+' produces a finite moving flow',result.flat().every(Number.isFinite)&&result.filter(q=>Math.hypot(q[2],q[3])>1).length>probe.length*.9);
    }
    check('the three new patterns produce distinct flows',outputs.every((out,i)=>outputs.slice(i+1).every(other=>out.filter((q,j)=>Math.hypot(q[2]-other[j][2],q[3]-other[j][3])>15).length>probe.length*.5)));
    // Overlapping particles exercise the actual HDR composite at high density.
    const patches=Array.from({length:128},()=>[x-80,y]).concat(Array.from({length:128},()=>[x+80,y]));
    for(let pair=0;pair<paletteRolls.pairs.length;pair++) {
      await fixture(p,patches);await p.evaluate(pair=>{
        __plTest.opening(pair);__plTest.colors(Array.from({length:256},(_,i)=>i<128?0:1));
      },pair);await step(p);
      const png=await p.locator('.pl-canvas').screenshot({path:path.join(dump,'contrast-'+pair+'.png')});
      const pixels=await p.evaluate(async({png,x,y})=>{
        const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
        const g=c.getContext('2d');g.drawImage(img,0,0);
        return [-80,80].map(dx=>Array.from(g.getImageData(Math.round(x+dx),Math.round(y),1,1).data).slice(0,3));
      },{png:png.toString('base64'),x,y});
      check('opening pair '+(pair+1)+' stays colored and distinct in dense clusters',pixels.every(q=>Math.max(...q)-Math.min(...q)>95)&&Math.hypot(...pixels[0].map((v,i)=>v-pixels[1][i]))>180);
    }
    for(let id=3;id<6;id++) {
      await p.evaluate(id=>__plTest.freshPattern(id),id);
      await step(p,720);
      await p.locator('.pl-canvas').screenshot({path:path.join(dump,'pattern-'+id+'.png')});
    }
    await p.locator('.pl-fullscreen').click();
    await p.waitForTimeout(250);
    check('fullscreen keeps the brush radius in CSS pixels',Math.abs((await state(p)).pointer.radius/(await state(p)).scale-120)<1);
    await p.keyboard.press('Escape');
    await context.close();

    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const phone=await open(mobile,url), cdp=await mobile.newCDPSession(phone);
    box=await phone.locator('.pl-canvas').boundingBox();
    const touch=(type,list)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:list});
    const t1={x:box.x+box.width*.25,y:box.y+box.height*.5,id:1};
    const t2={x:box.x+box.width*.75,y:box.y+box.height*.5,id:2};
    await phone.evaluate(()=>__plTest.stop());
    a=await state(phone);x=a.world.w/2;y=a.world.h/2;r=a.pointer.radius;
    check('phone brush size scales with DPR',Math.abs(r/a.scale-Math.max(58,Math.min(120,Math.min(box.width,box.height)*.18)))<1);
    await fixture(phone,[[x,y+15],[x,y-15]]);
    const scroll=await phone.evaluate(()=>scrollY);
    await touch('touchStart',[t1]);
    const owner=(await state(phone)).pointer.id;
    await touch('touchStart',[t1,t2]);
    check('a second finger cannot take over the active gesture',(await state(phone)).pointer.id===owner);
    await touch('touchEnd',[t2]);
    check('lifting a second finger keeps the first gesture active',(await state(phone)).pointer.down);
    await touch('touchMove',[{...t1,x:t2.x}]); await step(phone);
    points=await read(phone);
    check('real touch swipes fling particles in the swipe direction',points.every(q=>q[2]>100));
    check('dragging the simulation does not scroll the page',await phone.evaluate(()=>scrollY)===scroll);
    await touch('touchCancel',[]);
    check('touch cancellation releases the gesture',!(await state(phone)).pointer.down);
    await phone.reload(); await phone.waitForFunction(()=>document.querySelector('.pl-status').style.display==='none');
    await phone.locator('.pl-canvas').scrollIntoViewIfNeeded();box=await phone.locator('.pl-canvas').boundingBox();
    await touch('touchStart',[{x:box.x+box.width/2,y:box.y+box.height/2,id:3}]);
    await phone.waitForTimeout(400);
    await phone.locator('.pl-canvas').screenshot({path:path.join(dump,'phone-held.png')});
    await touch('touchEnd',[]);
    await mobile.close();
    check('no JavaScript or WebGPU validation errors',errors.length===0);
    console.log('Screenshots: '+dump);
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e,[...new Set(errors)].slice(0,8));process.exitCode=1;});
