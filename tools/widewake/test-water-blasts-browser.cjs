/* Inspect water pixels, visible displacement, fallback and saturated battle cost. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),safari=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-water-blasts');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':bytes);});});
let browser;const errors=[],reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/widewake.html?test';
  browser=await(safari?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.click('#title-combat');await p.waitForFunction(()=>__widewakeReach.game.time>12);reports.push({name:'ordinary-watch',...await p.evaluate(()=>__widewakeReach.metrics())});await p.screenshot({path:path.join(out,'fleet.png')});await p.keyboard.press('Escape');
  const pixels=await p.evaluate(()=>{
    const v=__widewakeReach.view,b=v.battle,g=v.gl,old=b.effects,fx=new WidewakeBattle.Effects();b.effects=fx;fx.add(0,0,100,3);v.follow=false;v.camera.x=v.camera.y=0;v.zoom=v.targetZoom=.7/v.baseScale;v.visualTime=b.time;
    function sample(age,reduced,plume=false){
      v.reduced=reduced;fx.life[0]=fx.total[0]*(1-age);g.clearColor(0,0,0,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);v.drawEffectsGPU(!plume);
      const data=new Uint8Array(v.canvas.width*v.canvas.height*4);g.readPixels(0,0,v.canvas.width,v.canvas.height,g.RGBA,g.UNSIGNED_BYTE,data);let minX=1e9,minY=1e9,maxX=-1,maxY=-1,count=0,hash=0;
      for(let y=0;y<v.canvas.height;y++)for(let x=0;x<v.canvas.width;x++){const at=(y*v.canvas.width+x)*4;if(data[at]+data[at+1]+data[at+2]>15){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;hash=(Math.imul(hash,31)+data[at+1])|0;}}
      return{width:maxX-minX+1,height:maxY-minY+1,count,hash,instances:v.quad.count};
    }
    const result={early:sample(.12,false),late:sample(.5,false),plume:sample(.2,false,true),reducedEarly:sample(.12,true),reducedLate:sample(.5,true),reducedPlume:sample(.2,true,true),pausedA:sample(.32,false),pausedB:sample(.32,false),error:g.getError()};b.effects=old;v.reduced=false;return result;
  });
  assert.equal(pixels.error,0);assert.ok(pixels.early.count>30&&pixels.late.width>pixels.early.width*1.8);assert.ok(pixels.late.width/pixels.late.height>1.8&&pixels.late.width/pixels.late.height<2.2);assert.ok(pixels.plume.count>100);assert.ok(Math.abs(pixels.reducedEarly.width-pixels.reducedLate.width)<=2);assert.equal(pixels.reducedPlume.instances,0);assert.deepEqual(pixels.pausedA,pixels.pausedB);reports.push({name:'water-pixels',...pixels});console.log('PASS water-plane foam, rising plume, stationary reduced-motion cue and stable paused pixels');

  // A close view keeps the actual blast, surviving hulls and their drift legible.
  await p.evaluate(()=>{
    document.querySelector('#reach-menu').close();const v=__widewakeReach.view,b=v.battle;
    b.population=0;b.raiders.count=0;b.shots.count=b.shots.hostile=0;b.effects.count=0;b.mounts=[];b.loot=[];b.burstCooldown=999;b.burstCursor=48;
    b.ships.slice(1).forEach(s=>s.hp=0);b.player.x=b.player.px=-210;b.player.y=b.player.py=80;
    v.follow=false;v.camera={x:0,y:0};v.zoom=v.targetZoom=1.1/v.baseScale;v.offset={x:0,y:0};v.anchor=null;
    for(let i=0;i<12;i++){const angle=i/12*Math.PI*2,radius=i%3?100:45;b.raiders.add(Math.cos(angle)*radius,Math.sin(angle)*radius,i%3?0:3,b.random);}
    b.raiders.index();b.raiders.blast(0,0,80,35,b);window.blastFixtureStart=Array.from(b.raiders.x.subarray(0,b.raiders.count));
    for(let n=0;n<12;n++){b.tick++;b.time+=1/60;b.raiders.step(1/60,b);b.effects.step(1/60);}v.render(0,1);
  });
  await p.screenshot({path:path.join(out,'impact-close.png')});const drift=await p.evaluate(()=>{const b=__widewakeReach.view.battle;return Array.from(b.raiders.x.subarray(0,b.raiders.count)).map((x,i)=>Math.abs(x-blastFixtureStart[i]));});assert.ok(Math.max(...drift)>5);await p.evaluate(()=>{const b=__widewakeReach.view.battle;for(let n=0;n<36;n++){b.tick++;b.time+=1/60;b.raiders.step(1/60,b);b.effects.step(1/60);}__widewakeReach.view.render(0,1);});await p.screenshot({path:path.join(out,'drift-close.png')});console.log('PASS a close rendered blast displaces surviving hulls');

  const capacity=await p.evaluate(async()=>{
    const B=WidewakeBattle,b=new WidewakeCombat.Endgame(),v=__widewakeReach.view,old=v.battle,r=B.random(8),times=[],intervals=[];v.battle=b;v.zoom=v.targetZoom=v.stops.fleet;v.camera={x:0,y:0};v.wakes.clear();
    let minimumRaiders=Infinity,peakShots=0,peakEffects=0,waterBlasts=0,drawCalls=0;
    try{for(let frame=0;frame<150;frame++){
      const start=performance.now();b.raiders.compact();while(b.raiders.count<b.population)b.spawn(true,b.raiders.count);minimumRaiders=Math.min(minimumRaiders,b.raiders.count);
      while(b.shots.count-b.shots.hostile<B.LIMITS.shots-B.LIMITS.hostileReserve){const angle=r()*Math.PI*2,d=300+r()*1000,x=Math.cos(angle)*d,y=Math.sin(angle)*d;b.shots.fire(x,y,x+Math.cos(angle)*700,y+Math.sin(angle)*700,frame%5?B.weapons.gun:B.weapons.flak);}
      while(b.shots.count<B.LIMITS.shots){const angle=r()*Math.PI*2;b.shots.fire(Math.cos(angle)*1300,Math.sin(angle)*1300,0,0,B.weapons.hostile);}
      while(b.effects.count<B.LIMITS.effects){b.effects.add((r()-.5)*2400,(r()-.5)*2400,100+r()*75,3);const i=b.effects.count-1;b.effects.life[i]=b.effects.total[i]*(.1+r()*.9);}
      peakShots=Math.max(peakShots,b.shots.count);peakEffects=Math.max(peakEffects,b.effects.count);v.render(0,1);waterBlasts=Math.max(waterBlasts,v.stats.visibleWaterBlasts);drawCalls=Math.max(drawCalls,v.stats.drawCalls);b.step(1/60);times.push(performance.now()-start);await new Promise(requestAnimationFrame);intervals.push(performance.now()-start);
    }}finally{v.battle=old;}
    times.sort((a,b)=>a-b);intervals.sort((a,b)=>a-b);return{minimumRaiders,peakShots,peakEffects,waterBlasts,drawCalls,bufferBytes:b.memoryBytes(),cpuP95:times[Math.floor(times.length*.95)],frameP95:intervals[Math.floor(intervals.length*.95)],error:v.gl.getError()};
  });
  assert.equal(capacity.minimumRaiders,16384);assert.equal(capacity.peakShots,8192);assert.equal(capacity.peakEffects,2048);assert.ok(capacity.waterBlasts>1000);assert.ok(capacity.drawCalls<=36);assert.ok(capacity.cpuP95<30);assert.equal(capacity.error,0);reports.push({name:'all-water-effects-capacity',...capacity});console.log('PASS full raider, shot and water-effect buffers with bounded draw calls');

  if(!safari){
    const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.click('#title-combat');await page.waitForFunction(()=>__widewakeReach.game.time>5);const m=await page.evaluate(()=>__widewakeReach.metrics());assert.equal(m.backend,'Canvas');assert.ok(m.visibleWaterBlasts>0);await page.screenshot({path:path.join(out,'canvas-phone.png')});await page.keyboard.press('Escape');await page.evaluate(()=>{const v=__widewakeReach.view,b=v.battle,old=b.effects;v.reduced=true;b.effects=new WidewakeBattle.Effects();b.effects.add(v.camera.x,v.camera.y,100,3);v.render(0,1);b.effects=old;});reports.push({name:'canvas-phone',...m});await ctx.close();console.log('PASS water effects and reduced-motion rendering in phone Canvas fallback');
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({engine:safari?'webkit':'chromium',reports},null,2)+'\n');console.log('Artifacts: '+out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
