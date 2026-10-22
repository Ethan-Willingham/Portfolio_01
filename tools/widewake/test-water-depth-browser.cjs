/* Displaced water must occlude submerged geometry and meet real hull sprites. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-water-depth');
fs.mkdirSync(out,{recursive:true});let browser;const errors=[];
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_CHROME?{executablePath:process.env.WIDEWAKE_CHROME}:{})});
  const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await page.click('#start-voyage');await page.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await page.click('#cast-off');await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach,s=g.player;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];g.sea.count=0;
    Object.assign(s,{x:0,y:2400,px:0,py:2400,angle:.4,previousAngle:.4,vx:0,vy:0,hp:0});v.follow=false;v.lookAhead=false;v.camera={x:0,y:2400};v.offset={x:0,y:0};v.zoom=v.targetZoom=8;
    v.surface.draw=()=>0;v.shadows.ships=()=>0;v.waterMotion.draw=()=>0;v.wakes.clear();v.render(0,1);document.querySelector('#reach-menu').close();
  });await page.waitForFunction(()=>__widewakeReach.view.terrain.ready);
  const report=await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach,gl=v.gl,O=WidewakeOcean,terrain=v.terrain,geo=O.geometry();geo.face([[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],'#ff0000');
    const probe=new O.Batch(gl,new Float32Array(geo.out),1);probe.add(0,0,0,1,0);const nativeDepthMask=gl.depthMask.bind(gl);
    const pixels=()=>{const a=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
    const delta=(a,b,i)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    const changed=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(delta(a,b,i)>18)n++;return n;};
    const draw=(showProbe=false,ignoreDepth=false)=>{v.waterMotion.draw=()=>{if(!showProbe)return 0;v.uniforms(v.main);if(ignoreDepth)gl.disable(gl.DEPTH_TEST);const n=probe.draw();gl.enable(gl.DEPTH_TEST);return n;};v.render(0,1);return pixels();};
    let crest=null,trough=null;
    for(let t=0;t<80;t+=.1){const heights=[[-2,-2],[2,-2],[-2,2],[2,2],[0,0]].map(([x,y])=>g.sea.at(x,2400+y,t,{},-1,false).height);if(!crest&&Math.min(...heights)>.9)crest={time:t,height:heights[4]};if(!trough&&Math.max(...heights)<-.9)trough={time:t,height:heights[4]};if(crest&&trough)break;}
    if(!crest||!trough)throw Error('No clear crest/trough test phases');
    const phases=[];for(const backend of ['terrain','open']){v.terrain=backend==='terrain'?terrain:null;for(const phase of [crest,trough]){g.time=phase.time;g.sea.begin(g.time);const off=draw(),actual=draw(true),reference=draw(true,true);phases.push({backend,...phase,visiblePixels:changed(off,actual),referencePixels:changed(off,reference)});}}
    probe.dispose();v.waterMotion.draw=()=>0;
    // Compare the real launch atlas against itself with only the water depth
    // write disabled. A waterline must hide hull pixels while keeping the deck.
    const s=g.player,hulls=[];v.terrain=null;
    function hullFrame(waterDepth){let calls=0;gl.depthMask=flag=>nativeDepthMask(calls++===0&&!waterDepth?false:flag);try{v.render(0,1);return pixels();}finally{gl.depthMask=nativeDepthMask;}}
    for(const phase of [crest,trough]){g.time=phase.time;g.sea.begin(g.time);s.hp=0;const seaOnly=hullFrame(true);s.hp=200;s.sea=null;
      for(let n=0;n<120;n++)g.sea.stepShip(s,1/60,false);
      const actual=hullFrame(true),exposed=hullFrame(false);let full=0,visible=0,covered=0;
      for(let i=0;i<actual.length;i+=4){if(delta(seaOnly,exposed,i)<=24)continue;full++;if(delta(seaOnly,actual,i)>24)visible++;if(delta(actual,exposed,i)>24)covered++;}
      hulls.push({...phase,fullPixels:full,visiblePixels:visible,coveredPixels:covered,pose:{z:s.sea.z,pitch:s.sea.pitch,roll:s.sea.roll}});
    }
    v.terrain=terrain;v.render(0,1);return{phases,hulls,gl:gl.getError()};
  });
  console.log(JSON.stringify(report,null,2));
  for(const phase of report.phases){assert.ok(phase.referencePixels>80,'the physical probe is visibly on screen');if(phase.height>0)assert.ok(phase.visiblePixels<phase.referencePixels*.04,'a crest covers submerged zero-level geometry');else assert.ok(phase.visiblePixels>phase.referencePixels*.90,'a trough exposes zero-level geometry');}
  assert.ok(report.hulls.every(h=>h.fullPixels>150&&h.visiblePixels>h.fullPixels*.45),'real launch decks remain readable at both wave phases');
  assert.ok(report.hulls.some(h=>h.coveredPixels>10),'the displaced surface visibly meets and occludes the real launch waterline');
  assert.equal(report.gl,0);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'hull-waterline.png')});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS displaced crest/trough depth on both water paths and real launch waterline occlusion');console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
