/* Exercise real zoom controls, moving cameras, rotation and both renderers. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||'/tmp/widewake-spawns',safari=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(f)]||'application/octet-stream'});res.end(e?'Missing':data);});});
let browser;const errors=[],reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await(safari?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  for(const [width,height,touch,fallback]of [[1440,900,false,false],[2560,1080,false,false],[390,844,true,false],[844,390,true,false],[568,320,true,false],[1280,720,false,true]]){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    if(fallback)await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.click('#title-combat');await p.waitForFunction(()=>__widewakeReach.game?.time>.5);
    await p.keyboard.press('3');await p.waitForTimeout(600);
    await p.mouse.move(width*.6,height*.4);for(let i=0;i<12;i++){if(safari&&touch)await p.dispatchEvent('#reach-water','wheel',{deltaY:600,clientX:width*.6,clientY:height*.4});else await p.mouse.wheel(0,600);}await p.waitForTimeout(600);
    assert.ok(await p.evaluate(()=>Math.abs(__widewakeReach.view.targetZoom-__widewakeReach.view.stops.survey)<1e-8),'wheel stops at Wide');
    await p.click('#reach-pause');
    const report=await p.evaluate(()=>{
      const {game:g,view:v}=__widewakeReach;let births=0;
      const add=g.raiders.add.bind(g.raiders);g.raiders.add=(x,y,kind,r)=>{
        if(v.visible(x,y,36))throw Error('Enemy appeared inside the rendered viewport');
        if(WidewakeBattle.spawnVisible(g,x,y))throw Error('Enemy appeared inside the camera guard');
        if(Math.hypot(x-g.center.x,y-g.center.y)<3199.99)throw Error('Enemy appeared inside the swarm');
        births++;return add(x,y,kind,r);
      };
      const cameras=[[0,80],[2500,800],[-2400,-2000]];
      for(const [x,y]of cameras)for(const phase of [0,2,4]){
        v.camera={x,y};v.offset={x:x-g.player.x,y:y-g.player.y};v.follow=false;v.anchor=null;
        v.zoom=v.targetZoom=v.stops.survey;v.prepareSpawns();g.phase=phase;g.raiders.count=0;g.population=48;g.pincer=48;g.nextPincer=Infinity;g.reinforce();
        g.raiders.count=0;g.reinforce();
        // A close-to-wide anchored tween must protect both footprints.
        v.zoom=v.stops.helm;v.setZoom(1e-6,v.canvas.getBoundingClientRect().width*.8,120);v.prepareSpawns();g.raiders.count=0;g.reinforce();
      }
      g.raiders.add=add;v.camera={x:0,y:80};v.anchor=null;v.offset={x:0,y:0};v.follow=true;v.zoom=v.targetZoom=v.stops.survey;
      return{births,wide:v.stops.survey*v.baseScale,cornerMetres:Math.hypot(v.width/2,v.height)/(v.stops.survey*v.baseScale),backend:v.stats.backend};
    });
    assert.ok(report.births>=1000);assert.ok(report.cornerMetres<=2500.01);reports.push({width,height,...report});
    await p.setViewportSize({width:height,height:width});assert.equal(await p.evaluate(()=>__widewakeReach.mode),'menu');
    assert.ok(await p.evaluate(()=>{const v=__widewakeReach.view;return v.zoom>=v.stops.survey&&Math.abs(v.targetZoom-v.stops.survey)<1e-8;}),'rotation preserves Wide and clamps the current view');
    await p.setViewportSize({width,height});await p.click('#reach-resume');await p.waitForTimeout(250);await p.screenshot({path:path.join(out,width+'x'+height+(fallback?'-canvas':'')+'.png')});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({engine:safari?'webkit':'chromium',reports},null,2)+'\n');
  console.log('PASS bounded Wide zoom, offscreen reinforcements, anchored camera changes, ultrawide, phone rotation and Canvas');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
