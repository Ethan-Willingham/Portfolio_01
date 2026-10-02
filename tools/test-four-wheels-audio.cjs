// Real Web Audio rendering and gesture-driven desktop/phone integration.
// This server injects private hooks; the release contains none of them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..'), errors = [];
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name === '/__audio-test') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><script src="/js/four-wheels-audio.js"></script>');
  }
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = fs.readFileSync(file);
    if (name === '/js/four-wheels.js') {
      const source = data.toString(), end = source.lastIndexOf('})();');
      data = source.slice(0, end) + `
      window.__cartAudioTest = {
        state: () => ({ phase, enabled: sound.enabled, context: sound.context?.state || null, voices: sound.voices?.size || 0, body: {...world.body} }),
        sample: async () => {
          if (!sound.context) return 0;
          const analyser = sound.context.createAnalyser(); analyser.fftSize = 512;
          sound.compressor.connect(analyser);
          const data = new Float32Array(512); let peak = 0;
          for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 15)); analyser.getFloatTimeDomainData(data);
            peak = Math.max(peak, Math.sqrt(data.reduce((n, v) => n + v*v, 0) / data.length));
          }
          sound.compressor.disconnect(analyser); analyser.disconnect(); return peak;
        },
        burst: () => { for (let i=0; i<80; i++) sound.metal(1,true); return sound.voices.size; },
        event: e => sound.event(e),
        suspend: () => sound.context.suspend(),
        done: () => { world.emit('won'); events(); },
        emit: e => { world.emit(e.type, e); events(); },
        close: () => sound.context.close(),
        delayResume: () => {
          const resume = sound.context.resume.bind(sound.context);
          sound.context.resume = async () => { await resume(); await new Promise(r => setTimeout(r, 250)); };
        }
      };` + source.slice(end);
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
function check(name, condition) { assert.ok(condition, name); console.log('PASS ' + name); }
const state = p => p.evaluate(() => __cartAudioTest.state());
const sample = p => p.evaluate(() => __cartAudioTest.sample());
async function setup(context, url) {
  await context.route('https://www.googletagmanager.com/**', r => r.abort());
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => !!window.__cartAudioTest); return page;
}
(async () => {
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const safari = process.env.CART_ENGINE === 'webkit';
    browser = await (safari ? webkit : chromium).launch({ headless: true, ...(safari ? {} : { executablePath: process.env.CART_BROWSER || '/Users/ethan/.local/bin/agent-chrome-for-testing' }) });
    const offline = await browser.newPage(); await offline.goto(base + '/__audio-test');
    const render = options => offline.evaluate(async options => {
      const ac = new OfflineAudioContext(2, 48000, 48000), engine = CartAudio.create(); engine.initialize(ac);
      const wheel = { a: 0, omega: 0, speed: 60, load: 1, surface: { kind: options.surface || 'dirt' } };
      const world = { body: { a: 0, vx: 60, vy: 0, omega: 0 }, wheels: Array.from({length:4}, () => ({...wheel})), ground: { airborne: !!options.airborne }, gait: { phase:0,speed:0 }, circuit: {powered:!!options.shutter,lift:0} };
      if (options.spin) { Object.assign(world.body, {vx:0,vy:0,omega:2}); world.wheels.forEach((w,i) => {w.speed=i%2?30:-30;w.fixed=true;}); }
      if (options.idle) { Object.assign(world.body, {vx:0,vy:0}); world.wheels.forEach(w => w.speed = 0); }
      if (options.crab) { Object.assign(world.body, {vx:0,vy:60}); world.wheels.forEach(w => w.a = Math.PI/2); }
      if (options.slide) Object.assign(world.body, {vx:0,vy:60});
      if (options.mixed) world.wheels[0].surface = {kind:'dirt'};
      if (options.unloaded) world.wheels.forEach(w => w.load = 0);
      if (options.feet) { world.shopper = {feet:1}; world.gait.speed = 30; engine.footPhase = 1; }
      const before = JSON.stringify(world);
      if (options.motion) engine.update(world, options.brake ? {brake:1} : {}, 0);
      if (options.event) engine.event(options.event, options.pan || 0, options.distance || 0);
      if (options.repeat) for(let i=0;i<100;i++)engine.event(options.event);
      if (options.burst) for (let i=0; i<100; i++) engine.metal(1,true);
      if (options.muted) engine.setEnabled(false);
      const voices = engine.voices.size, buffer = await ac.startRendering(), left = buffer.getChannelData(0), right = buffer.getChannelData(1);
      const energy = a => a.reduce((n,v) => n+v*v,0) / a.length;
      let peak=0,diff=0; for(let i=0;i<left.length;i++){if(!Number.isFinite(left[i])||!Number.isFinite(right[i]))throw new Error('Nonfinite audio');peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));if(i)diff+=(left[i]-left[i-1])**2;}
      return { rms:Math.sqrt(energy(left)),right:Math.sqrt(energy(right)),peak,brightness:Math.sqrt(diff/left.length)/(Math.sqrt(energy(left))||1),tail:Math.sqrt(energy(left.slice(-2400))),voices,remaining:engine.voices.size,unchanged:JSON.stringify(world)===before };
    }, options);
    const glass = await render({event:{type:'break',material:'glass',kind:'door'}}), ceramic = await render({event:{type:'break',material:'ceramic'}});
    check('glass and ceramic render audible, different material spectra', glass.rms>.0015&&ceramic.rms>.0015&&glass.brightness>ceramic.brightness*1.5&&glass.tail<.0001&&ceramic.tail<.0001);
    for (const event of [{type:'bump',impact:50},{type:'wall-hit',kind:'rail',part:'cart',impact:50},{type:'wall-hit',kind:'rail',part:'wheel',impact:30},{type:'rack-hit',impact:50},{type:'shelf-down',impact:70},{type:'break',material:'glass',kind:'wine'},{type:'break',material:'ceramic',kind:'vase'},{type:'squash'},{type:'mess',kind:'box'},{type:'wheel-rattle',kind:'can'},{type:'product-land',material:'metal',impact:35},{type:'product-land',material:'paper',impact:35},{type:'land',impact:45},{type:'fall',kind:'lake'},{type:'fall-impact',kind:'lake'},{type:'fall-impact',kind:'cliff'},{type:'jump'},{type:'boost'},{type:'circuit'},{type:'gate'},{type:'room'},{type:'save-edge'},{type:'respawn'},{type:'toggle'},{type:'won'}]) {
      const result=await render({event}),audible=result.rms>.0005&&result.peak>.005&&result.peak<.95&&result.remaining===0;
      if(!audible)console.log('Audio levels:',event,result);
      check('audible '+event.type+(event.kind?' '+event.kind:''),audible);
    }
    const dirt=await render({motion:true,surface:'dirt'}),tile=await render({motion:true,surface:'tile'}),ice=await render({motion:true,surface:'ice'}),brake=await render({motion:true,surface:'tile',brake:true}),air=await render({motion:true,airborne:true}),muted=await render({motion:true,muted:true});
    check('surface changes and braking alter the rolling output without modifying physics',dirt.rms>ice.rms*2&&dirt.brightness>tile.brightness&&brake.rms>tile.rms*1.1&&dirt.unchanged&&brake.unchanged);
    check('airborne and muted carts produce silent motion output',air.peak===0&&muted.peak<.0001);
    const grass=await render({motion:true,surface:'grass'}),asphalt=await render({motion:true,surface:'asphalt'}),mixed=await render({motion:true,surface:'tile',mixed:true}),spin=await render({motion:true,spin:true}),crab=await render({motion:true,crab:true}),slide=await render({motion:true,slide:true}),unloaded=await render({motion:true,unloaded:true}),idle=await render({motion:true,idle:true});
    check('grass and asphalt have distinct wheel texture',grass.rms>.001&&asphalt.rms>.001&&Math.abs(grass.brightness-asphalt.brightness)>.01);
    check('mixed tire contacts blend between road materials',mixed.rms>tile.rms&&mixed.rms<dirt.rms&&mixed.brightness>tile.brightness&&mixed.brightness<dirt.brightness);
    check('turning tires roll, aligned sideways forks stay quiet, and idle or unloaded tires are silent',spin.rms>.001&&Math.abs(crab.rms-dirt.rms)<.0001&&slide.rms>crab.rms&&unloaded.peak===0&&idle.peak===0);
    const shutter=await render({motion:true,shutter:true,unloaded:true}),feet=await render({motion:true,feet:true,unloaded:true});
    check('the lifting shutter and actual footfalls are audible',shutter.rms>.0005&&Math.hypot(feet.rms,feet.right)/Math.SQRT2>.0005);
    const panned=await render({event:{type:'rack-hit',impact:50},pan:-.75}),distant=await render({event:{type:'break',material:'glass'},distance:500}),pileup=await render({burst:true});
    check('nearby impacts pan and distant stock stays quiet',panned.rms>panned.right*2&&distant.peak===0);
    const near=await render({event:{type:'break',material:'glass',impact:60}}),far=await render({event:{type:'break',material:'glass',impact:60},distance:200});
    check('impacts get quieter before reaching the distance cutoff',far.rms>0&&near.rms>far.rms*2);
    check('a 100-impact pileup stays within the voice cap and cleans up after rendering',pileup.voices<=32&&pileup.peak<.95&&pileup.remaining===0);
    const once=await render({event:{type:'break',material:'glass'}}),repeated=await render({event:{type:'break',material:'glass'},repeat:true}),mutedCue=await render({event:{type:'won'},muted:true});
    check('repeated contact callbacks are coalesced and mute cancels scheduled finish notes',Math.abs(once.rms-repeated.rms)<.0001&&once.voices===repeated.voices&&mutedCue.peak===0&&mutedCue.remaining===0);
    const desktop=await browser.newContext({viewport:{width:1280,height:720}}), page=await setup(desktop,base+'/four-wheels.html');
    check('sound is enabled but creates no audio context before a gesture',(await state(page)).enabled&&(await state(page)).context===null&&await page.locator('#cart-sound').getAttribute('aria-pressed')==='true');
    await page.locator('#cart-start').click();await page.waitForFunction(()=>__cartAudioTest.state().context==='running');
    await page.keyboard.down('w');await page.waitForTimeout(500);
    check('real keyboard movement produces audible rolling',await sample(page)>.001&&(await state(page)).body.vx>15);await page.keyboard.up('w');
    check('live collision pileups remain bounded',await page.evaluate(()=>__cartAudioTest.burst())<=32);
    await page.locator('#cart-pause').click();await page.waitForTimeout(150);check('pause silences rolling and active impacts',await sample(page)<.0001);
    await page.waitForFunction(()=>__cartAudioTest.state().context==='suspended');
    check('pause releases every voice and suspends audio processing',(await state(page)).voices===0);
    await page.evaluate(()=>__cartAudioTest.delayResume());await page.locator('#cart-start').click();await page.locator('#cart-pause').click();await page.waitForTimeout(400);
    check('a late audio unlock cannot restart sound after pause',(await state(page)).phase==='paused'&&(await state(page)).context==='suspended'&&await sample(page)<.0001);
    await page.locator('#cart-start').click();await page.waitForFunction(()=>__cartAudioTest.state().context==='running');
    await page.evaluate(()=>{__cartAudioTest.event({type:'won'});return __cartAudioTest.suspend();});await page.locator('#cart-pause').click();
    check('an operating system audio interruption releases paused sources immediately',(await state(page)).voices===0&&(await state(page)).context==='suspended');
    await page.locator('#cart-courses').click();check('route selection remains silent',await sample(page)<.0001);await page.locator('#cart-picker-close').click();
    await page.locator('#cart-start').click();await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');await page.keyboard.press('r');await page.waitForTimeout(100);check('restart confirmation silences the moving cart',(await state(page)).phase==='confirm'&&await sample(page)<.0001);await page.locator('#cart-secondary').click();
    await page.locator('#cart-pause').click();await page.locator('#cart-sound').click();await page.reload();await page.waitForFunction(()=>!!window.__cartAudioTest);
    check('muting persists across reload without creating an audio context',!(await state(page)).enabled&&(await state(page)).context===null&&await page.locator('#cart-sound').getAttribute('aria-pressed')==='false');
    await page.locator('#cart-start').click();await page.keyboard.down('w');await page.waitForTimeout(200);await page.keyboard.up('w');check('a muted run still moves with no audio context',(await state(page)).body.vx>10&&(await state(page)).context===null);
    await page.locator('#cart-pause').click();await page.locator('#cart-sound').click();await page.waitForFunction(()=>__cartAudioTest.state().context==='running');await page.locator('#cart-start').click();
    await page.evaluate(()=>__cartAudioTest.emit({type:'break',material:'glass',kind:'wine',impact:60}));
    check('a physical event reaches the live sound engine',await sample(page)>.001);
    await page.evaluate(()=>__cartAudioTest.done());check('the finish cue is audible after stopping rolling',await sample(page)>.001);await page.waitForTimeout(800);check('the finish cue ends without a stuck rolling loop',await sample(page)<.0001);
    await page.waitForFunction(()=>__cartAudioTest.state().context==='suspended');
    await page.locator('#cart-start').click();await page.waitForFunction(()=>__cartAudioTest.state().context==='running');
    await page.evaluate(()=>__cartAudioTest.close());await page.locator('#cart-pause').click();await page.locator('#cart-start').click();await page.waitForFunction(()=>__cartAudioTest.state().context==='running');
    await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');check('a closed browser audio context can recover on the next play gesture',await sample(page)>.001);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.waitForTimeout(150);
    check('pagehide parks the run and suspends all sound',(await state(page)).phase==='paused'&&(await state(page)).context==='suspended'&&await sample(page)<.0001);
    const phoneContext=await browser.newContext({viewport:{width:852,height:393},isMobile:true,hasTouch:true}),phone=await setup(phoneContext,base+'/four-wheels.html');
    await phone.locator('#cart-start').tap();await phone.waitForFunction(()=>__cartAudioTest.state().context==='running');
    const r=await phone.locator('#cart-stick').boundingBox(),cdp=safari?null:await phoneContext.newCDPSession(phone),finger={id:1,x:r.x+r.width/2,y:r.y+r.height/2};
    const send = async type => {
      if (cdp) return cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[finger]});
      await phone.evaluate(({type,finger})=>{
        const stick=document.getElementById('cart-stick'),t=document.createTouch(window,stick,finger.id,finger.x,finger.y,finger.x,finger.y),empty=document.createTouchList(),points=document.createTouchList(t);
        stick.dispatchEvent(new TouchEvent(type.toLowerCase(),{bubbles:true,cancelable:true,touches:type==='touchEnd'?empty:points,targetTouches:type==='touchEnd'?empty:points,changedTouches:points}));
      },{type,finger});
    };
    await send('touchStart');finger.y-=r.width*.28;await send('touchMove');await phone.waitForTimeout(450);
    check('a native phone gesture unlocks audio and thumbstick movement makes sound',await sample(phone)>.001&&(await state(phone)).body.vx>15);await send('touchEnd');
    await phone.evaluate(()=>window.dispatchEvent(new Event('blur')));await phone.waitForTimeout(120);check('phone focus loss parks the game and silences audio',(await state(phone)).phase==='paused'&&await sample(phone)<.0001);
    await phone.locator('#cart-sound').tap();await phone.reload();await phone.waitForFunction(()=>!!window.__cartAudioTest);check('phone mute also survives reload',!(await state(phone)).enabled);
    const fallback=await browser.newContext();await fallback.addInitScript(()=>{Object.defineProperty(window,'AudioContext',{value:undefined});Object.defineProperty(window,'webkitAudioContext',{value:undefined});Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});const blocked=await setup(fallback,base+'/four-wheels.html');await blocked.locator('#cart-start').click();await blocked.keyboard.down('w');await blocked.waitForTimeout(250);await blocked.keyboard.up('w');
    check('unavailable audio and blocked storage still allow movement',(await state(blocked)).phase==='running'&&(await state(blocked)).body.vx>10&&!(await state(blocked)).enabled);
    for (const failure of ['resume','buffer']) {
      const context=await browser.newContext();await context.addInitScript(failure=>{
        const RealAudio=window.AudioContext||window.webkitAudioContext;
        window.failedContexts=[];
        window.AudioContext=class extends RealAudio {
          constructor(){super();window.failedContexts.push(this);}
          get state(){return failure==='resume'&&super.state!=='closed'?'suspended':super.state;}
          resume(){return failure==='resume'?Promise.reject(new Error('blocked resume')):super.resume();}
          close(){return super.close().then(()=>{this.testClosed=true;});}
          createBuffer(...args){if(failure==='buffer')throw new Error('allocation failed');return super.createBuffer(...args);}
        };
      },failure);
      const failed=await setup(context,base+'/four-wheels.html');await failed.locator('#cart-start').click();await failed.keyboard.down('w');await failed.waitForTimeout(250);await failed.keyboard.up('w');
      // The resume fault intentionally overrides state. The native close promise
      // confirms resource release even when that forced getter remains suspended.
      await failed.waitForFunction(()=>failedContexts.every(ac=>ac.testClosed));
      const failedState=await state(failed);
      check('failed audio '+failure+' releases its context while the game keeps playing',failedState.phase==='running'&&!failedState.enabled&&failedState.body.vx>10&&failedState.context===null);
      await context.close();
    }
    const noAudio=await browser.newContext();await noAudio.route('**/js/four-wheels-audio.js*',r=>r.abort());const silent=await setup(noAudio,base+'/four-wheels.html');await silent.locator('#cart-start').click();await silent.keyboard.down('w');await silent.waitForTimeout(250);await silent.keyboard.up('w');
    check('a failed audio script download still permits a playable silent game',(await state(silent)).phase==='running'&&(await state(silent)).body.vx>10&&await silent.locator('#cart-sound').isDisabled());
    check('no JavaScript errors across audio rendering, desktop, phone and fallback',errors.length===0);
  } finally { await browser?.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);if(errors.length)console.error(errors);process.exitCode=1;});
