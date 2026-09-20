#!/usr/bin/env node
// Node 22+: node tools/perf/smoke-water-coupling.cjs
// Uses the existing Chrome for Testing shim; creates no server or fixed debugging port.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = process.env.DUMP || path.join(os.tmpdir(), `sluice-smoke-water-${process.pid}.json`);
assert.equal(typeof WebSocket, 'function', 'This harness requires Node 22 or newer');
const fragment = 'js/sluice/190-smoke-webgl.js';
const source = (process.env.SOURCE_REF ? execFileSync('git', ['show', process.env.SOURCE_REF + ':' + fragment], {cwd:root,encoding:'utf8'}) : fs.readFileSync(path.join(root, fragment), 'utf8')).split('  // ====== Smoke:')[0];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function testWaterSmoke(source) {
  const report = [], errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  function check(ok, label) { if (!ok) throw Error(label); }
  for (const profile of [{}, {webgl1:true}, {webgl1:true,manual:true}]) {
    const canvas = document.createElement('canvas'); canvas.width=384;canvas.height=256;
    document.body.appendChild(canvas);
    const context = canvas.getContext.bind(canvas);
    let gl, draws=0;
    canvas.getContext = (kind, opts) => {
      if (profile.webgl1 && kind==='webgl2') return null;
      gl=context(kind,opts); if (!gl) return gl;
      const ext=gl.getExtension.bind(gl), draw=gl.drawElements.bind(gl);
      gl.getExtension=name=>profile.manual && /texture_.*float_linear/.test(name)?null:ext(name);
      gl.drawElements=(...a)=>{draws++;return draw(...a);};
      return gl;
    };
    const instrumented=source.replace('      init: init,', `
      sample: function(visible) {
        var active=liquidActive; if(!visible)liquidActive=false;
        displayPass();liquidActive=active;
        var bytes=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
      }, field: function(){return {w:liquidFieldW,h:liquidFieldH,pixels:Array.from(liquidPixels),active:liquidActive};},
      init: init,`);
    const smoke=new Function(instrumented+'\nreturn SmokeFluid;')();
    const result={};
    try {
      check(smoke.init(canvas,{SIM_RESOLUTION:96,DYE_RESOLUTION:192,CURL:14,
        DENSITY_DISSIPATION:0,VELOCITY_DISSIPATION:.02,SHADING:false}),'WebGL boot');
      const x=[],y=[],vx=[],vy=[],local=[];
      for(let yy=-23;yy<=23;yy+=1.25)for(let xx=-23;xx<=23;xx+=1.25)
        if(xx*xx+yy*yy<23*23)local.push([xx,yy]);
      function water(cx,cy,ux,uy,spacing=1) {
        x.length=y.length=vx.length=vy.length=0;
        for(let i=0;i<local.length;i+=spacing){x.push(cx+local[i][0]);y.push(cy+local[i][1]);vx.push(ux);vy.push(uy);}
        smoke.setLiquidField(x,y,vx,vy,x.length,0,0,384,256,.64);
      }
      function measure(visible=false) {
        const bytes=smoke.sample(visible);let sum=0,mx=0,my=0;
        for(let i=0;i<bytes.length;i+=4){const n=bytes[i];sum+=n;mx+=n*(i/4%384+.5);my+=n*(Math.floor(i/4/384)+.5);}
        check(gl.getError()===0,'GL error '+JSON.stringify(profile));
        return {sum,x:mx/sum,y:my/sum};
      }
      for(const mode of ['none','pool','right','left','down','up','fast','spray']) {
        smoke.clear();
        for(let xx=.32;xx<.7;xx+=.055)for(let yy=.28;yy<.74;yy+=.055)
          smoke.splat(xx,yy,0,0,{r:.018,g:.018,b:.018},.65);
        const start=measure(),firstDraw=draws;
        for(let f=0;f<100;f++){
          if(mode!=='none'){
            let ux=0,uy=0,cx=192,cy=128;
            if(mode==='right'){ux=70;cx=135+f*70/60;}
            if(mode==='left'){ux=-70;cx=249-f*70/60;}
            if(mode==='down'){uy=50;cy=85+f*50/60;}
            if(mode==='up'){uy=-50;cy=171-f*50/60;}
            if(mode==='fast'){ux=Math.cos(f*.13)*500;cx=192+Math.sin(f*.13)*60;}
            if(mode==='spray'){uy=50;cy=85+f*50/60;}
            water(cx,cy,ux,uy,mode==='spray'?20:1);
          }
          smoke.step(1/60);
        }
        const end=measure();result[mode]={retention:end.sum/start.sum,dx:end.x-start.x,dy:end.y-start.y,draws:draws-firstDraw};
      }
      // A screen full of smoke must survive a moving water silhouette. Hide
      // water after display, then check that no erased squares remain behind.
      smoke.clear();smoke.splat(.5,.5,0,0,{r:.25,g:.25,b:.25},100);
      const unmasked=measure();water(192,128,0,0);const displayed=measure(true);
      check(displayed.sum<unmasked.sum*.99,'Dense water must occlude smoke visually');
      check(measure().sum===unmasked.sum,'Display occlusion changed stored smoke');
      const stationary=smoke.field();water(192.2,128.2,0,0);const shifted=smoke.field();
      let subpixelJump=0;
      for(let i=3;i<stationary.pixels.length;i+=4)subpixelJump=Math.max(subpixelJump,Math.abs(stationary.pixels[i]-shifted.pixels[i]));
      check(subpixelJump<25,'Subpixel water motion produced a hard cutout: '+subpixelJump);
      water(192,128,0,54.9);const below=smoke.field();water(192,128,0,55.1);const above=smoke.field();
      check(below.pixels.every((v,i)=>i%4!==3||v===above.pixels[i]),'Velocity changed water coverage');
      water(192,128,0,0,20);check(Math.max(...smoke.field().pixels.filter((_,i)=>i%4===3))===0,'Spray cut holes');
      smoke.setLiquidField(x,y,vx,vy,0,0,0,384,256,.64);
      check(!smoke.field().active,'Removed water left a ghost');
      water(192,128,0,0);smoke.setLiquidField(x,y,vx,vy,x.length,0,0,384,256,.64,new Uint8Array(x.length).fill(1));
      check(!smoke.field().active,'Frozen particles entered the field');
      water(192,128,0,0);smoke.clear();check(!smoke.field().active&&measure().sum===0,'Scene clear left water or smoke');
      smoke.resize(320,240);water(192,128,60,0);smoke.step(1/60);smoke.displayPass();check(!gl.getError(),'Resize failed');
      // Full 24k particle field, matching a busy sandbox. Measures CPU
      // reconstruction plus upload submission, not synchronous GPU readback.
      const xx=[],yy=[],uu=[],vv=[];
      for(let i=0;i<24000;i++){xx.push(20+i%200*1.25);yy.push(20+Math.floor(i/200)*1.25);uu.push(50);vv.push(80);}
      const t=performance.now();for(let i=0;i<20;i++)smoke.setLiquidField(xx,yy,uu,vv,xx.length,0,0,384,256,.64);
      result.uploadMs=(performance.now()-t)/20;result.subpixelJump=subpixelJump;
      console.log(JSON.stringify({profile,result}));
      check(result.none.retention>.98 && result.pool.retention>.98,'Still smoke decayed');
      for(const mode of ['right','left','down','up','fast','spray']){
        check(result[mode].retention>.82 && result[mode].retention<1.12,'Moving water lost/amplified smoke: '+mode+JSON.stringify(result));
        check(result[mode].draws===result.none.draws,'Additional fullscreen passes');
      }
      check(result.right.dx>1 && result.left.dx<-1 && result.down.dy<-1 && result.up.dy>1,'Water did not push smoke in every direction: '+JSON.stringify(result));
      report.push({profile,result});
    } finally {gl?.getExtension('WEBGL_lose_context')?.loseContext();}
  }
  check(!errors.length,errors.join('\n'));return report;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-smoke-chrome-'));
  const chrome = spawn(process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : path.join(os.homedir(), '.local/bin/agent-chrome-for-testing')),
    ['--headless=new', '--use-angle=' + (process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'vulkan'), '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let launchError, socket;
  chrome.on('error', error => { launchError = error; });
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 20000;
    while (!fs.existsSync(portFile)) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null || Date.now() > deadline) throw Error('Chrome for Testing did not become ready');
      await pause(50);
    }
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = tabs.find(tab => tab.type === 'page');
    assert(page, 'Chrome page target missing');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Smoke regression check timed out')), 120000);
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) reject(Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      socket.addEventListener('close', () => { clearTimeout(timeout); reject(Error('Chrome connection closed')); }, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `(${testWaterSmoke.toString()})(${JSON.stringify(source)})`,
      returnByValue: true, awaitPromise: true,
    } }));
    const result = await response;
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    const report = { profiles: result.result.value };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    for (const p of report.profiles) console.log(JSON.stringify(p));
    console.log(`PASS: water-smoke retention, all splash directions, smooth coverage, spray, clear/resize and bounded draw cost on WebGL2/WebGL1/manual filtering. Results: ${output}`);
  } finally {
    socket?.close();
    if (chrome.exitCode === null && chrome.signalCode === null && chrome.pid) {
      const stopped = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill('SIGTERM');
      await Promise.race([stopped, pause(3000)]);
      if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await stopped; }
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
