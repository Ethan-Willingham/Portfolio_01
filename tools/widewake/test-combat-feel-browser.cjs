/* Actual round contacts, readable flight, sinking hulls and bounded combat art. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),cp=require('node:child_process');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),baseline=process.env.WIDEWAKE_FEEL_BASELINE==='1',out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-combat-feel');
fs.mkdirSync(out,{recursive:true});const original=new Map(),errors=[],reports=[];let browser;
if(baseline)for(const f of ['js/widewake-battle-core.js','js/widewake-ocean.js','js/widewake-ocean-art.js','js/widewake-reach-game.js'])original.set(f,cp.execFileSync('git',['show',(process.env.WIDEWAKE_BASELINE_REF||'HEAD')+':'+f],{cwd:root}));
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),file=path.resolve(root,name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();const send=(e,b)=>res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'}).end(e?'Missing':b);if(original.has(name))send(null,original.get(name));else fs.readFile(file,send);});
async function shot(p,name){await p.screenshot({path:path.join(out,(baseline?'before-':'after-')+name+'.png')});}
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});const url='http://127.0.0.1:'+server.address().port+'/widewake.html?test';
  for(const [width,height,canvas]of baseline?[[1440,900,false]]:[[1440,900,false],[844,390,false],[844,390,true]]){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(canvas)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl2'?null:get.call(this,t,...args);};});
    await p.goto(url);await p.click('#title-combat');await p.waitForFunction(()=>__widewakeReach.view&&__widewakeReach.game.time>.1);await p.keyboard.press('Escape');
    const fixture=await p.evaluate(()=>{
      const v=__widewakeReach.view,b=v.battle,B=WidewakeBattle;document.getElementById('reach-menu').close();b.population=0;b.raiders.count=0;b.raiders.dead=0;b.shots.count=b.shots.hostile=0;b.effects.count=0;b.loot=[];b.mounts=[{ship:0,weapon:'guard',along:30,angle:0,cooldown:0,flash:0,recoil:0}];b.ships.splice(1);b.time=10;b.tick=600;b.burstCooldown=999;b.burstCursor=48;b.work=false;
      Object.assign(b.player,{x:-100,px:-100,y:0,py:0,angle:0,previousAngle:0,vx:0,vy:0});b.player.sea=null;b.sea.strength=0;
      b.raiders.add(100,0,2,b.random);b.raiders.hp[0]=150;if(b.raiders.angle){b.raiders.angle[0]=b.raiders.previousAngle[0]=Math.PI;b.raiders.steeringReady[0]=1;}
      b.raiders.index();v.follow=false;v.camera={x:0,y:0};v.offset={x:0,y:0};v.zoom=v.targetZoom=(v.width<500?1.1:1.8)/v.baseScale;v.anchor=null;B.fireFleet(b,1/60);v.render(0,1);
      window.feelAdvance=n=>{for(let j=0;j<n;j++){b.time+=1/60;b.tick++;b.impactBudget=0;b.deathBudget=0;b.raiders.index();b.shots.step(1/60,b);b.effects.step(1/60);}v.render(0,1);};
      return{backend:v.stats.backend,shots:b.shots.count,muzzle:[b.mounts[0].muzzleX,b.mounts[0].muzzleY,b.mounts[0].muzzleZ]};
    });
    assert.ok(fixture.shots>0);await shot(p,width+'-'+(canvas?'canvas':'webgl')+'-muzzle');await p.evaluate(()=>feelAdvance(5));await shot(p,width+'-'+(canvas?'canvas':'webgl')+'-flight');
    const flight=await p.evaluate(()=>({tracers:__widewakeReach.view.stats.visibleTracers||0,muzzles:__widewakeReach.view.stats.muzzleQuads||0,error:__widewakeReach.view.gl?.getError()||0}));assert.equal(flight.error,0);if(!baseline)assert.ok(flight.tracers>0);
    await p.evaluate(()=>feelAdvance(7));await shot(p,width+'-'+(canvas?'canvas':'webgl')+'-strike');
    const contact=await p.evaluate(()=>{const b=__widewakeReach.game;return{hp:b.raiders.hp[0],contacts:b.shots.contacts,kinds:Array.from(b.effects.kind.subarray(0,b.effects.count)),error:__widewakeReach.view.gl?.getError()||0};});assert.ok(contact.contacts>0);assert.ok(contact.hp<150);if(!baseline)assert.ok(contact.kinds.includes(4));assert.equal(contact.error,0);
    await p.evaluate(()=>{const b=__widewakeReach.game,B=WidewakeBattle;b.shots.fire(-80,0,100,0,{...B.weapons.guard,damage:500},0,0,400,1.2);feelAdvance(14);});await shot(p,width+'-'+(canvas?'canvas':'webgl')+'-wreck-early');
    const death=await p.evaluate(()=>{const b=__widewakeReach.game;return{kinds:Array.from(b.effects.kind.subarray(0,b.effects.count)),wrecks:__widewakeReach.view.stats.visibleWrecks||0};});if(!baseline){assert.ok(death.kinds.includes(6));assert.ok(death.wrecks>0);}
    await p.evaluate(()=>feelAdvance(48));await shot(p,width+'-'+(canvas?'canvas':'webgl')+'-wreck-late');
    await p.evaluate(()=>{const b=__widewakeReach.game,B=WidewakeBattle;b.raiders.count=0;b.raiders.index();b.shots.fire(-50,-25,70,-25,{...B.weapons.guard,range:130},0,0,140,.35,-.4);feelAdvance(14);});await shot(p,width+'-'+(canvas?'canvas':'webgl')+'-water');
    const water=await p.evaluate(()=>({kinds:Array.from(__widewakeReach.game.effects.kind.subarray(0,__widewakeReach.game.effects.count)),error:__widewakeReach.view.gl?.getError()||0}));if(!baseline)assert.ok(water.kinds.includes(5));assert.equal(water.error,0);
    if(!baseline){
      const reduced=await p.evaluate(()=>{const v=__widewakeReach.view;v.reduced=true;v.render(0,1);return{muzzles:v.stats.muzzleQuads,wakes:v.stats.enemyWakeCount,error:v.gl?.getError()||0};});assert.equal(reduced.muzzles,0);assert.equal(reduced.wakes,0);assert.equal(reduced.error,0);
      if(!canvas){await p.evaluate(()=>{const v=__widewakeReach.view;window.feelLost=v.gl.getExtension('WEBGL_lose_context');feelLost.loseContext();});await p.waitForFunction(()=>__widewakeReach.view.lost);await p.evaluate(()=>feelLost.restoreContext());await p.waitForFunction(()=>!__widewakeReach.view.lost);await p.evaluate(()=>{document.getElementById('reach-menu').close();__widewakeReach.view.render(0,1);});assert.equal(await p.evaluate(()=>__widewakeReach.view.gl.getError()),0);}
    }
    reports.push({width,height,canvas,fixture,flight,contact,death,water});await ctx.close();console.log('PASS '+width+' '+(canvas?'Canvas':'WebGL')+' muzzle, flight, actual strike, sinking sequence, water miss and graphics lifecycle');
  }
  if(!baseline){const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.click('#title-combat');await p.waitForFunction(()=>__widewakeReach.game.time>3);await shot(p,'live-fleet');await p.keyboard.press('1');await p.waitForTimeout(250);await shot(p,'live-close');await p.keyboard.press('3');await p.waitForTimeout(250);await shot(p,'live-wide');reports.push({live:await p.evaluate(()=>__widewakeReach.metrics())});await p.close();}
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,baseline?'before-report.json':'report.json'),JSON.stringify(reports,null,2));console.log(out);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
