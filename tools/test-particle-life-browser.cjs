// NODE_PATH=/path/to/node_modules HEADFUL=1 node tools/test-particle-life-browser.cjs
// HEADFUL=1 also checks this in a real browser window.
// NATIVE_FOCUS=1 PAUSE_ONLY=1 bypasses Playwright's focus emulation for tab tests.
// Uses an owned Chrome for Testing process, closed in finally. Private hooks
// and COPY_SRC usage are injected by this server only, never shipped to readers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {spawn} = require('node:child_process');
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
          var submit=device.queue.submit.bind(device.queue);
          device.queue.submit=function(commands) {
            window.__plSubmits=(window.__plSubmits||0)+1;
            return submit(commands);
          };
          var createShader = device.createShaderModule.bind(device);
          device.createShaderModule = function(desc) {
            var mod=createShader(desc);
            mod.getCompilationInfo().then(info=>info.messages.forEach(m=>{
              if(m.type==='error')console.error('GPU shader '+m.lineNum+': '+m.message);
            }));
            return mod;
          };
          context = canvas.getContext('webgpu');`)
        .replaceAll('GPUBufferUsage.VERTEX', '(GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC)')
        .replace('function frame(t) {', 'function frame(t) { (window.__plFrameTimes ||= []).push(t);')
        .replace('if (prevTime === 0) dt = 1 / 60;', 'if (prevTime === 0) { dt = 1 / 60; window.__plFirstDt=dt; }');
      const end = s.lastIndexOf('})();');
      s = s.slice(0, end) + `
        window.__plTest = {
          state: () => ({ pointer: { ...simPointer }, world: { ...simWorld }, scale: pointerScaleX,
            palette: speciesColors.slice(0,K), patterns: FIELD_PATTERNS.slice() }),
          config: () => snapshotConfig(),
          advance: dt => advanceField(dt),
          field: () => ({state:fieldState,alpha:fieldAlphaEased,phase:fieldPhase}),
          lifecycle: () => ({ pending: frameRequest!==null, ready: animationReady,
            focused: pageFocused, inView: canvasInView, hidden: document.hidden,
            time: prevTime, phase: fieldPhase, submitted: window.__plSubmits||0,
            firstDt: window.__plFirstDt }),
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
  await p.bringToFront();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', e => { if (e.type()==='error' && /shader|validation|invalid|GPU|pipeline/i.test(e.text())) errors.push(e.text()); });
  await p.goto(url);
  await p.waitForFunction(() => document.querySelector('.pl-status').style.display==='none', {timeout:30000});
  await p.locator('.pl-canvas').scrollIntoViewIfNeeded();
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('.post-body')).opacity==='1',{polling:50});
  return p;
}
async function controlChecks(browser,url) {
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  const mobile=await browser.newContext({viewport:{width:375,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const symmetric=cfg=>cfg.symmetric===true&&cfg.matrix.every((v,i)=>v===cfg.matrix[(i%cfg.k)*cfg.k+Math.floor(i/cfg.k)]);
  try {
    const p=await open(context,url);
    const config=()=>p.evaluate(()=>__plTest.config());
    const select=p.getByLabel('Pattern',{exact:true});
    check('the symmetry toggle, morph speed and arrow controls are removed',
      await p.locator('.pl-toggle-sym,[data-param="fieldmorph"],.pl-field-stepper').count()===0);
    check('the opening force matrix is symmetric',symmetric(await config()));
    const playing=(await config()).field.pattern;
    await select.selectOption({label:playing});
    check('choosing even the playing pattern disables automatic cycling',
      !await p.locator('.pl-toggle-auto').isChecked()&&(await config()).field.pattern===playing);
    const held=await p.evaluate(()=>__plTest.field());
    await p.evaluate(()=>{for(let i=0;i<120;i++) __plTest.advance(1);});
    assert.deepEqual(await p.evaluate(()=>__plTest.field()),held);
    check('a manual selection holds its shape and cancels further morphing',true);
    await p.locator('.pl-toggle-auto').check();
    const visited=[];
    for(let i=0;i<6;i++) {
      visited.push((await config()).field.pattern);
      await p.evaluate(()=>{__plTest.advance(19);__plTest.advance(6.1);});
    }
    check('automatic cycling visits all six patterns and updates the dropdown',
      new Set(visited).size===6&&await select.inputValue()==='auto'&&
      (await select.evaluate(el=>el.selectedOptions[0].textContent)).includes((await config()).field.pattern));
    await p.evaluate(()=>{__plTest.advance(19);__plTest.advance(2);});
    await select.selectOption({label:'Figure eight'});
    check('choosing during a crossfade immediately holds the requested pattern',
      (await config()).field.pattern==='Figure eight'&&
      await p.evaluate(()=>__plTest.field().state==='hold'&&__plTest.field().alpha===0));
    await p.locator('.pl-toggle-field').uncheck();
    await select.selectOption({label:'River bends'});
    check('choosing a pattern enables its field and leaves cycling off',
      await p.locator('.pl-toggle-field').isChecked()&&!await p.locator('.pl-toggle-auto').isChecked());
    const levels=[];
    for(let i=0;i<5;i++) {
      await p.locator('.pl-matrix-cell').nth(1).click();
      const cfg=await config();levels.push(cfg.matrix[1]);
      assert.ok(symmetric(cfg));
    }
    check('cell clicks cycle five values and update both mirrored cells',new Set(levels).size===5);
    await p.locator('.pl-matrix-cell').nth(1).click({modifiers:['Shift']});
    check('Shift-click also updates both mirrored cells',symmetric(await config()));
    for(let i=0;i<5;i++) {
      await p.locator('.pl-randomize').click();
      assert.ok(symmetric(await config()));
    }
    check('Randomize all always produces a symmetric matrix',true);
    await p.locator('[data-param="species"]').fill('15');
    await p.locator('[data-param="species"]').dispatchEvent('input');
    const max=await config(),patterns=await select.locator('option:not([disabled])').count();
    const cells=max.k*(max.k+1)/2,possibilities=BigInt(patterns)*BigInt(new Set(levels).size)**BigInt(cells);
    check('the published count matches 120 independent choices and six patterns',
      max.k===15&&cells===120&&patterns===6&&Number(possibilities)>4.50e84&&Number(possibilities)<4.52e84&&
      (await p.locator('.pl-possibilities sup').allTextContents()).join(',')==='84,120');
    check('changing to 15 colors keeps all matrix pairs symmetric',symmetric(max));
    const legacy={...max,k:2,matrix:[.2,.8,-.4,.6],symmetric:false,
      field:{...max.field,pattern:'Golden spiral',auto:false,morph:3}};
    await p.locator('.pl-share-tools > summary').click();
    await p.locator('.pl-slot-share').fill('PL1:'+Buffer.from(JSON.stringify(legacy)).toString('base64'));
    await p.locator('.pl-slot-import').click();
    const loaded=await config();
    check('old asymmetric setup codes are normalized to mutual forces',
      symmetric(loaded)&&Math.abs(loaded.matrix[1]-.2)<1e-7);
    check('old setup codes restore a named pattern with the fixed cycle speed',
      loaded.field.pattern==='Golden spiral'&&loaded.field.morph===1&&await select.inputValue()==='1');
    await p.locator('.pl-share-tools > summary').click();
    await p.locator('.pl-group-matrix').screenshot({path:path.join(dump,'patterns-desktop.png')});
    await p.locator('.pl-possibilities').screenshot({path:path.join(dump,'possibilities-desktop.png')});
    await p.locator('.pl-fullscreen').click();await p.locator('.pl-fs-drawer-toggle').click();
    await select.scrollIntoViewIfNeeded();
    check('the pattern dropdown fits the fullscreen drawer',await select.evaluate(el=>{
      const r=el.getBoundingClientRect(),panel=document.querySelector('.pl-controls').getBoundingClientRect();
      return r.height>=44&&r.left>=panel.left&&r.right<=panel.right;
    }));
    await p.screenshot({path:path.join(dump,'patterns-fullscreen.png')});
    await p.keyboard.press('Escape');
    const phone=await open(mobile,url);
    await phone.getByLabel('Pattern',{exact:true}).selectOption({label:'Twin galaxies'});
    check('phone selection holds the chosen pattern and unchecks cycling',
      !await phone.locator('.pl-toggle-auto').isChecked()&&
      await phone.evaluate(()=>__plTest.config().field.pattern==='Twin galaxies'));
    check('phone controls fit the page and use the 20px site gutter',await phone.evaluate(()=>
      document.documentElement.scrollWidth<=innerWidth&&
      getComputedStyle(document.body).paddingLeft==='20px'));
    await phone.locator('.pl-toggle-auto').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    await phone.locator('.pl-group-matrix').screenshot({path:path.join(dump,'patterns-phone.png')});
    await phone.locator('.pl-possibilities').screenshot({path:path.join(dump,'possibilities-phone.png')});
    await p.locator('.pl-reset').click();
    check('Reset restores automatic cycling and keeps symmetric forces',
      await p.locator('.pl-toggle-auto').isChecked()&&symmetric(await config()));
    check('control changes produce no JavaScript or WebGPU errors',errors.length===0);
  } finally {
    await context.close();await mobile.close();
  }
}
async function pauseChecks(browser, url, nativeContext) {
  const context=nativeContext||await browser.newContext({viewport:{width:1440,height:200}});
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  // The scroll/resize fallback should also work without IntersectionObserver.
  await mobile.addInitScript(()=>{window.IntersectionObserver=undefined;});
  async function idle(p,name) {
    await p.waitForFunction(()=>!__plTest.lifecycle().pending,{polling:50});
    await p.waitForTimeout(100);
    const before=await p.evaluate(()=>__plTest.lifecycle());
    await p.waitForTimeout(250);
    const after=await p.evaluate(()=>__plTest.lifecycle());
    check(name,after.submitted===before.submitted&&after.phase===before.phase&&after.time===0&&!after.pending);
    return after;
  }
  async function active(p,name,phase) {
    await p.waitForFunction(phase=>__plTest.lifecycle().pending&&__plTest.lifecycle().phase>phase,phase,{polling:50});
    const life=await p.evaluate(()=>__plTest.lifecycle());
    check(name,life.firstDt===1/60);
  }
  try {
    await context.route('https://www.googletagmanager.com/**',r=>r.abort());
    const p=await context.newPage();
    await p.setViewportSize({width:1440,height:200});
    await p.bringToFront();
    const localErrors=[];p.on('pageerror',e=>localErrors.push(e.message));
    await p.goto(url);
    await p.waitForFunction(()=>__plTest?.lifecycle().ready,{polling:50});
    const initial=await idle(p,'an offscreen initial load never starts the GPU frame loop');
    await p.setViewportSize({width:1440,height:1100});
    await p.locator('.pl-canvas').scrollIntoViewIfNeeded();
    await active(p,'scrolling the swarm into view starts it with a fresh clock',initial.phase);
    let box=await p.locator('.pl-canvas').boundingBox();
    await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await p.mouse.down();
    await p.mouse.move(box.x+box.width*.65,box.y+box.height/2);
    await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    const blurred=await idle(p,'losing window focus stops all recurring GPU submissions and field time');
    check('pausing cancels the active drag and clears its wake',await p.evaluate(()=>{
      const q=__plTest.state().pointer;return !q.down&&q.id===null&&q.envelope===0&&q.vx===0&&q.vy===0;
    }));
    await p.mouse.up();
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await active(p,'window focus resumes smoothly from the frozen state',blurred.phase);
    if(nativeContext) {
      const away=await context.newPage();
      await away.goto('about:blank');await away.bringToFront();
      const background=await idle(p,'switching to another tab stops all recurring GPU submissions');
      check('the native background tab is hidden',background.hidden);
      await p.bringToFront();
      await active(p,'returning to the tab resumes automatically',background.phase);
      await away.close();
    } else {
      // Playwright forces all pages to remain visible and focused. Exercise
      // the visibility boundary explicitly; native mode verifies real tabs.
      await p.evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,value:true});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hidden=await idle(p,'a hidden tab stops all recurring GPU submissions');
      await p.evaluate(()=>{
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await active(p,'a visible tab resumes automatically',hidden.phase);
    }
    await p.setViewportSize({width:1440,height:200});
    await p.evaluate(()=>scrollTo(0,0));
    const outside=await idle(p,'scrolling away stops all recurring GPU submissions');
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await idle(p,'focus alone cannot restart an offscreen swarm');
    await p.setViewportSize({width:1440,height:1100});
    await p.locator('.pl-canvas').scrollIntoViewIfNeeded();
    await active(p,'returning to the visible swarm resumes automatically',outside.phase);
    await p.evaluate(()=>{
      window.__plFrameTimes=[];
      for(let i=0;i<20;i++) {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      }
    });
    await p.waitForTimeout(350);
    const times=await p.evaluate(()=>window.__plFrameTimes);
    check('repeated focus events keep exactly one animation loop',times.length>5&&new Set(times).size===times.length);
    await p.locator('.pl-fullscreen').click();
    await p.waitForTimeout(150);
    await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    const fullscreen=await idle(p,'fullscreen also stops GPU work when the window loses focus');
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await active(p,'fullscreen resumes after focus returns',fullscreen.phase);
    await p.keyboard.press('Escape');
    const phone=await open(mobile,url);
    await phone.locator('.pl-canvas').scrollIntoViewIfNeeded();
    await phone.waitForFunction(()=>__plTest.lifecycle().pending,{polling:50});
    await phone.locator('.pl-slot-section').scrollIntoViewIfNeeded();
    const phoneIdle=await idle(phone,'phone scroll fallback stops GPU work when the canvas leaves view');
    await phone.locator('.pl-canvas').scrollIntoViewIfNeeded();
    await active(phone,'phone scroll fallback resumes when the canvas returns',phoneIdle.phase);
    check('lifecycle transitions produce no JavaScript errors',localErrors.length===0&&errors.length===0);
  } finally {
    await context.close();
    await mobile.close();
  }
}
async function saveChecks(browser, url) {
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  try {
    const p=await open(context,url);
    const cfg=()=>p.evaluate(()=>__plTest.config());
    const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('pl-slots-v1')));
    check('empty saves show one action with sharing collapsed',
      await p.locator('.pl-saved-load').count()===0&&
      await p.locator('.pl-slot-save').isEnabled()&&
      !await p.locator('.pl-share-tools').evaluate(el=>el.open));
    check('matrix help fits in one short sentence pair',
      (await p.locator('.pl-matrix-explainer').textContent()).trim()==='Tap a cell to change it. Green attracts; red repels.');
    await p.locator('.pl-group-physics').screenshot({path:path.join(dump,'saves-empty-desktop.png')});
    await p.locator('.pl-pattern-select').selectOption({label:'Twin galaxies'});
    await p.locator('[data-param="force"]').fill('0.75');
    await p.locator('[data-param="force"]').dispatchEvent('input');
    const saved=await cfg();
    await p.locator('.pl-slot-save').click();
    assert.deepEqual((await stored())[0],saved);
    check('Save setup preserves colors, matrix, physics and selected pattern',true);
    check('saved setups expose Load and Delete with color previews',
      await p.getByRole('button',{name:'Load setup 1',exact:true}).count()===1&&
      await p.getByRole('button',{name:'Delete setup 1',exact:true}).count()===1&&
      await p.locator('.pl-saved-swatch').count()===saved.k);
    await p.locator('.pl-recolor').click();
    await p.locator('.pl-pattern-select').selectOption({label:'River bends'});
    await p.locator('[data-param="force"]').fill('1.25');
    await p.locator('[data-param="force"]').dispatchEvent('input');
    await p.getByRole('button',{name:'Load setup 1',exact:true}).click();
    assert.deepEqual(await cfg(),saved);
    check('Load restores the saved setup and selected pattern',true);
    await p.reload();
    await p.waitForFunction(()=>document.querySelector('.pl-status').style.display==='none');
    await p.getByRole('button',{name:'Load setup 1',exact:true}).click();
    assert.deepEqual(await cfg(),saved);
    check('saved setups survive a page reload',true);
    for(let i=1;i<5;i++) await p.locator('.pl-slot-save').click();
    check('five saved setups disable Save and explain how to make room',
      await p.locator('.pl-saved-load').count()===5&&
      await p.locator('.pl-slot-save').isDisabled()&&
      (await p.locator('.pl-save-note').textContent()).includes('Delete one to make room'));
    await p.getByRole('button',{name:'Delete setup 2',exact:true}).click();
    check('Delete frees a save and keeps keyboard focus in the list',
      (await stored())[1]===null&&await p.locator('.pl-slot-save').isEnabled()&&
      await p.locator('.pl-saved-load').first().evaluate(el=>el===document.activeElement));
    assert.deepEqual(await cfg(),saved);
    await p.locator('.pl-share-tools > summary').click();
    await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{
      configurable:true,value:{writeText:async code=>{window.__copied=code;}}
    }));
    await p.locator('.pl-slot-export').click();
    await p.waitForFunction(()=>window.__copied?.startsWith('PL1:'));
    const code=await p.evaluate(()=>window.__copied);
    check('Copy setup code shares the current setup without filling the input',
      code.startsWith('PL1:')&&await p.locator('.pl-slot-share').inputValue()==='');
    await p.locator('.pl-recolor').click();
    await p.locator('.pl-slot-share').fill(code);
    await p.locator('.pl-slot-import').click();
    assert.deepEqual(await cfg(),saved);
    check('a shared code restores the complete setup',true);
    await p.locator('.pl-slot-share').fill('');
    await p.locator('.pl-slot-import').click();
    check('empty code focuses the field and explains what is needed',
      await p.locator('.pl-slot-share').evaluate(el=>el===document.activeElement)&&
      (await p.locator('.pl-slot-msg').textContent())==='Paste a setup code first.');
    await p.locator('.pl-slot-share').fill('invalid');
    await p.locator('.pl-slot-import').click();
    assert.deepEqual(await cfg(),saved);
    check('invalid codes report an error and preserve the setup',
      await p.locator('.pl-slot-msg').evaluate(el=>el.classList.contains('is-error')));
    await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{
      configurable:true,value:{writeText:async()=>{throw new Error('Denied for test');}}
    }));
    await p.locator('.pl-slot-export').click();
    await p.waitForFunction(()=>document.querySelector('.pl-slot-share').value.startsWith('PL1:'));
    check('denied clipboard access selects the code for manual copying',
      await p.locator('.pl-slot-share').evaluate(el=>
        el===document.activeElement&&el.selectionStart===0&&el.selectionEnd===el.value.length));
    await p.locator('.pl-slot-share').fill('');
    await p.locator('.pl-slot-msg').evaluate(el=>el.textContent='');
    await p.locator('.pl-group-physics').screenshot({path:path.join(dump,'saves-filled-desktop.png')});
    await p.locator('.pl-share-tools > summary').click();
    await p.locator('.pl-wrapper').screenshot({path:path.join(dump,'saves-layout-desktop.png')});
    await p.locator('.pl-fullscreen').click();
    await p.locator('.pl-fs-drawer-toggle').click();
    await p.locator('.pl-slot-section').scrollIntoViewIfNeeded();
    const bounds=await p.locator('.pl-slot-section').evaluate(el=>{
      const panel=document.querySelector('.pl-controls').getBoundingClientRect();
      return [...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width).every(b=>{
        const r=b.getBoundingClientRect();return r.left>=panel.left&&r.right<=panel.right;
      });
    });
    check('saved setup actions fit the fullscreen drawer',bounds);
    await p.screenshot({path:path.join(dump,'saves-drawer-desktop.png')});
    await p.keyboard.press('Escape');
    const legacy={...saved,palette:[0,1],field:{...saved.field}};
    delete legacy.field.pattern;
    await p.evaluate(legacy=>localStorage.setItem('pl-slots-v1',JSON.stringify([null,legacy,null,null,null])),legacy);
    await p.reload();
    await p.waitForFunction(()=>document.querySelector('.pl-status').style.display==='none');
    await p.getByRole('button',{name:'Load setup 2',exact:true}).click();
    const loaded=await cfg();
    check('older saves retain their original positions and indexed colors load',
      await p.locator('.pl-saved-load').count()===1&&loaded.k===legacy.k&&
      loaded.palette.every(c=>Array.isArray(c)&&c.length===3)&&
      loaded.physics.force===legacy.physics.force);
    const phone=await open(mobile,url);
    await phone.locator('.pl-group-physics').screenshot({path:path.join(dump,'saves-empty-phone.png')});
    await phone.locator('.pl-slot-save').tap();
    check('a phone tap saves a setup',await phone.locator('.pl-saved-load').count()===1);
    const phoneSaved=await phone.evaluate(()=>__plTest.config());
    await phone.locator('.pl-recolor').tap();
    await phone.getByRole('button',{name:'Load setup 1',exact:true}).tap();
    assert.deepEqual(await phone.evaluate(()=>__plTest.config()),phoneSaved);
    check('a phone tap loads the saved setup',true);
    await phone.locator('.pl-share-tools > summary').tap();
    check('phone save actions have comfortable touch targets and no horizontal overflow',
      await phone.locator('.pl-slot-section').evaluate(el=>
        document.documentElement.scrollWidth<=innerWidth&&
        [...el.querySelectorAll('button')].every(b=>{
          const r=b.getBoundingClientRect();return r.height>=40&&r.right<=innerWidth&&r.left>=0;
        })));
    await phone.locator('.pl-group-physics').screenshot({path:path.join(dump,'saves-filled-phone.png')});
    await phone.getByRole('button',{name:'Delete setup 1',exact:true}).tap();
    check('a phone tap deletes the setup',await phone.locator('.pl-saved-load').count()===0);
    check('save actions produce no JavaScript or WebGPU errors',errors.length===0);
  } finally {
    await context.close();
    await mobile.close();
  }
}
let browser, browserChild, browserProfile;
(async () => {
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/particle-life.html';
    const executable=process.env.PL_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing';
    let nativeContext;
    if(process.env.NATIVE_FOCUS) {
      browserProfile=fs.mkdtempSync(path.join(os.tmpdir(),'pl-browser-'));
      const args=['--remote-debugging-port=0','--user-data-dir='+browserProfile,
        '--no-first-run','--no-default-browser-check','--enable-unsafe-webgpu','--use-angle=metal'];
      if(!process.env.HEADFUL) args.push('--headless=new');
      browserChild=spawn(executable,args,{stdio:['ignore','ignore','pipe']});
      const endpoint=await new Promise((resolve,reject)=>{
        let output='';
        const timer=setTimeout(()=>reject(new Error('Testing browser did not start')),30000);
        browserChild.stderr.on('data',chunk=>{
          output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if(match) {clearTimeout(timer);resolve(match[1]);}
        });
        browserChild.once('error',error=>{clearTimeout(timer);reject(error);});
        browserChild.once('exit',code=>{clearTimeout(timer);reject(new Error('Testing browser exited: '+code));});
      });
      // noDefaults leaves the default context's native focus/visibility intact.
      browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});
      nativeContext=browser.contexts()[0];
    } else {
      browser=await chromium.launch({headless:!process.env.HEADFUL,args:['--enable-unsafe-webgpu','--use-angle=metal'],executablePath:executable});
    }
    if(!process.env.NATIVE_FOCUS) {
      await controlChecks(browser,url);
      if(process.env.CONTROLS_ONLY) {console.log('Screenshots: '+dump);return;}
    }
    await pauseChecks(browser,url,nativeContext);
    if(process.env.PAUSE_ONLY) { console.log('Screenshots: '+dump);return; }
    await saveChecks(browser,url);
    if(process.env.SAVES_ONLY) { console.log('Screenshots: '+dump);return; }
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    const p=await open(context,url);
    check('all GPU pipelines compile',errors.length===0);
    const opening=await state(p), paletteRolls=await p.evaluate(()=>__plTest.openingSamples());
    const allowed=paletteRolls.pairs.map(q=>JSON.stringify(q));
    check('each visit opens on a curated contrasting pair',allowed.includes(JSON.stringify(opening.palette)));
    check('100 opening rolls stay within the curated set',paletteRolls.samples.every(q=>allowed.includes(JSON.stringify(q))));
    const wanted=['Vortex','Golden spiral','Flower of life','Twin galaxies','Figure eight','River bends'];
    check('the playlist contains the retained and new patterns only',JSON.stringify(opening.patterns)===JSON.stringify(wanted));
    const visited=[];
    for(const name of wanted) {
      await p.locator('.pl-pattern-select').selectOption({label:name});
      visited.push(await p.locator('.pl-pattern-select').evaluate(el=>el.selectedOptions[0].textContent));
    }
    check('the dropdown can choose every pattern directly',wanted.every(name=>visited.includes(name))&&new Set(visited).size===wanted.length);
    check('manual pattern selection turns cycling off',!await p.locator('.pl-toggle-auto').isChecked());
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
    await p.evaluate(()=>{window.dispatchEvent(new Event('focus'));__plTest.stop();});
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
    if(browserChild&&browserChild.exitCode===null&&browserChild.signalCode===null) {
      const exited=new Promise(resolve=>browserChild.once('exit',resolve));
      browserChild.kill('SIGTERM');
      const killTimer=setTimeout(()=>browserChild.kill('SIGKILL'),5000);
      await exited;clearTimeout(killTimer);
    }
    if(browserProfile) fs.rmSync(browserProfile,{recursive:true,force:true});
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e,[...new Set(errors)].slice(0,8));process.exitCode=1;});
