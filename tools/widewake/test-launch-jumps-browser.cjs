const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-launch-jumps');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);});});
let browser;const errors=[],reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  for(const [width,height,fallback]of [[1440,900,false],[844,390,false],[844,390,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(fallback)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl2'?null:get.call(this,t,...a);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#start-voyage');await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await p.click('#cast-off');await p.keyboard.press('Escape');await p.locator('#reach-menu').evaluate(e=>e.close());
    await p.evaluate(()=>{
      const {game:g,view:v}=__widewakeReach,s=g.player,angle=WidewakeWaves.bands[0].angle+Math.PI;g.nextEncounter=1e9;g.mounts=[];g.raiders.count=g.shots.count=g.effects.count=0;g.ships.length=1;
      Object.assign(s,{x:0,y:2400,px:0,py:2400,angle,previousAngle:angle,vx:Math.cos(angle)*36,vy:Math.sin(angle)*36,sea:null});g.time=0;g.sea=new WidewakeWaves.Sea(g.field);v.wakes.clear();v.follow=true;v.lookAhead=true;v.offset={x:0,y:0};v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.camera={x:s.x,y:s.y};
      window.jumpStep=()=>{g.step(1/60,{throttle:1,steer:0});v.wakes.sample(g.ships,g.ships,g.time);};
      window.jumpCapture=()=>{v.camera={x:s.x+s.vx*.25,y:s.y+s.vy*.25};v.render(0,1);return{time:g.time,z:s.sea.z,water:g.sea.at(s.x,s.y,g.time,{},s.id).height,gap:s.sea.z-s.sea.surface,airborne:s.sea.airborne,vz:s.sea.vz,splash:v.stats.landingSplashSegments,spray:v.stats.bowSpraySegments,liveWash:v.wakes.tracks[0].livePower,gl:v.gl?.getError()||0};};
      // Find a complete natural flight, then replay its actual recorded tick
      // positions. Frame selection follows this encounter's own apex/contact,
      // rather than assuming a fixed arc duration or forced takeoff velocity.
      let flight=[],plan=null;
      for(let n=1;n<2400&&!plan;n++){
        const was=s.sea?.airborne;jumpStep();const q=s.sea;
        if(q.airborne&&!was)flight=[];
        if(q.airborne)flight.push({tick:n,z:q.z,vz:q.vz,gap:q.z-q.surface});
        if(!q.airborne&&was&&flight.length>30&&flight[0].vz>1&&Math.max(...flight.map(f=>f.gap))>1.2){
          const apex=flight.reduce((best,f,i)=>f.z>flight[best].z?i:best,0);
          if(apex>3&&apex<flight.length-4)plan={takeoff:flight[0].tick,rising:flight[Math.floor(apex/2)].tick,apex:flight[apex].tick,falling:flight[Math.floor((apex+flight.length-1)/2)].tick,splashdown:n+8};
        }
      }
      if(!plan)throw Error('No complete rising/descending wave flight');window.jumpPlan=plan;
      Object.assign(s,{x:0,y:2400,px:0,py:2400,angle,previousAngle:angle,vx:Math.cos(angle)*36,vy:Math.sin(angle)*36,turn:0,throttle:1,sea:null});g.time=g.tick=0;g.sea=new WidewakeWaves.Sea(g.field);v.wakes.clear();window.jumpTicks=0;
    });await p.waitForFunction(()=>__widewakeReach.view.terrain.ready);
    const frames=[];
    for(const stage of ['takeoff','rising','apex','falling','splashdown']){
      const m=await p.evaluate(stage=>{while(window.jumpTicks<window.jumpPlan[stage]){jumpStep();window.jumpTicks++;}return jumpCapture();},stage);
      assert.equal(m.gl,0);if(stage!=='splashdown'){assert.ok(m.airborne);assert.equal(m.spray,0);assert.equal(m.liveWash,0);}else{assert.ok(!m.airborne);assert.ok(m.splash>=40);}
      if(stage==='apex')assert.ok(m.gap>1.2,'the hull visibly clears the physical wave');
      frames.push({stage,...m});await p.screenshot({path:path.join(out,`${width}-${fallback?'canvas':'webgl'}-${stage}.png`)});
    }
    const pixels=await p.evaluate(()=>{const {game:g,view:v}=__widewakeReach,s=g.player,read=()=>{v.render(0,1);if(v.gl){const a=new Uint8Array(v.canvas.width*v.canvas.height*4);v.gl.readPixels(0,0,v.canvas.width,v.canvas.height,v.gl.RGBA,v.gl.UNSIGNED_BYTE,a);return a;}return v.fallback.getImageData(0,0,v.canvas.width,v.canvas.height).data;};const on=read(),at=s.sea.landAt;s.sea.landAt=-100;const off=read();s.sea.landAt=at;const again=read();let changed=0,frozen=true;for(let n=0;n<on.length;n+=4){if(Math.abs(on[n]-off[n])+Math.abs(on[n+1]-off[n+1])+Math.abs(on[n+2]-off[n+2])>20)changed++;if(on[n]!==again[n]||on[n+1]!==again[n+1]||on[n+2]!==again[n+2])frozen=false;}return{changed,frozen};});
    assert.ok(pixels.changed>20,'landing spray contributes visible pixels');assert.ok(pixels.frozen,'pause freezes the splash');
    if(width===1440){const audio=await p.evaluate(async()=>{const ctx=new OfflineAudioContext(2,48000,48000),a=new WidewakeAudio({context:ctx,active:()=>true,settings:()=>({sound:true,volume:.3,effects:1,music:0,ambience:0})});const played=a.play('splash');const b=await ctx.startRendering();let energy=0,peak=0;for(const q of b.getChannelData(0)){energy+=q*q;peak=Math.max(peak,Math.abs(q));}return{played,rms:Math.sqrt(energy/b.length),peak};});assert.ok(audio.played&&audio.rms>.001&&audio.peak<1);reports.push({audio});}
    reports.push({width,height,fallback,frames,pixels});await context.close();console.log('PASS takeoff, airborne wake gap, visible splashdown and frozen effects '+width+(fallback?' Canvas':' WebGL'));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
