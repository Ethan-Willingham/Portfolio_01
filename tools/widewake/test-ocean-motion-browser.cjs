/* Actual rendered pixels must move continuously, including below one source texel. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),isWebkit=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-motion');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data);});});
let browser;const errors=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await(isWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,...(process.env.WIDEWAKE_CHROME?{executablePath:process.env.WIDEWAKE_CHROME}:{})}));
  const p=await browser.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/widewake-estuary.html?test');await p.waitForFunction(()=>window.__widewakeEstuary?.view.terrain.ready);
  const result=await p.evaluate(()=>{
    const v=__widewakeEstuary.view,g=v.gl;v.reduced=true;v.follow=false;v.camera.x=v.camera.y=0;
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=getComputedStyle(v.canvas).imageRendering!=='pixelated';ctx.imageSmoothingQuality='high';
    const rows=[];
    for(const [type,zoom,motion]of [['tree0',.65,'pan'],['gunboat',1.5,'pan'],['flagship',.27,'pan'],['raider0',.12,'pan'],['gunboat',1.5,'turn'],['gunboat',.5,'zoom'],['landing_yard',1.5,'pan'],['landing_yard_pier0',1.5,'zoom']]){
      const b=v.atlas.batches[type],frames=[],scales=[];
      for(let step=0;step<33;step++){
        v.zoom=motion==='zoom'?zoom*(.92+step/32*.16):zoom;
        const dx=motion==='pan'?step*.125:0,shift=WidewakeOcean.unproject(dx/(v.zoom*v.baseScale*2),0),angle=motion==='turn'?(2+step/32)*Math.PI*2/64:.22;
        b.count=0;b.add(shift.x,shift.y,0,Math.cos(angle),Math.sin(angle));g.viewport(0,0,v.canvas.width,v.canvas.height);g.clearColor(0,0,0,1);g.depthMask(true);g.disable(g.BLEND);g.enable(g.DEPTH_TEST);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);v.atlas.begin();v.atlas.draw(type,b);v.atlas.edges();
        const ratio=v.canvas.width/1280;ctx.clearRect(0,0,256,256);ctx.drawImage(v.canvas,(640-128)*ratio,(360-128)*ratio,256*ratio,256*ratio,0,0,256,256);frames.push(new Uint8Array(ctx.getImageData(0,0,256,256).data));scales.push(v.zoom*v.zoom);
      }
      // The second temporal difference exposes the hold/jump pattern that a
      // nearest-filtered sprite produces even when its world position is smooth.
      let speed=0,jump=0;const energy=[];
      for(let f=0;f<frames.length;f++){let sum=0;for(let i=0;i<frames[f].length;i+=4)for(let k=0;k<3;k++){const value=frames[f][i+k];sum+=value;if(f)speed+=Math.abs(value-frames[f-1][i+k]);if(f>1)jump+=Math.abs(value-2*frames[f-1][i+k]+frames[f-2][i+k]);}energy.push(sum/scales[f]);}
      const mean=energy.reduce((a,b)=>a+b)/energy.length;rows.push({type,zoom,motion,jumpRatio:jump/(speed||1),energyVariation:(Math.max(...energy)-Math.min(...energy))/(mean||1),minimumEnergy:Math.min(...energy)});
    }
    return{rows,width:v.canvas.width,height:v.canvas.height,samples:g.getParameter(g.SAMPLES),atlasBytes:v.atlas.bytes,error:g.getError()};
  });
  fs.writeFileSync(path.join(out,'motion.json'),JSON.stringify({engine:isWebkit?'webkit':'chromium',...result},null,2)+'\n');
  assert.equal(result.error,0);assert.ok(result.width>=1280&&result.height>=720);assert.ok(result.atlasBytes<48*1048576);
  for(const row of result.rows){assert.ok(row.minimumEnergy>0,'distant hull must not disappear');assert.ok(row.jumpRatio<.8,JSON.stringify(row));assert.ok(row.energyVariation<(row.type==='raider0'?.12:.02),JSON.stringify(row));}
  console.log('PASS continuous ship and port motion, directional blending, distant visibility and mip-level zoom');
  const retina=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:3}),r=await retina.newPage();await r.goto(base+'/widewake-battle.html?test&population=0');await r.waitForFunction(()=>window.__widewakeBattle);
  const budget=await r.evaluate(()=>{const v=__widewakeBattle.view,p=v.project(0,0),box=v.canvas.getBoundingClientRect(),world=v.screenWorld(box.left+p.x/v.width*box.width,box.top+p.y/v.height*box.height);return{pixels:v.canvas.width*v.canvas.height,world};});
  assert.ok(budget.pixels<=2076000);assert.ok(Math.hypot(budget.world.x,budget.world.y)<.001);await retina.close();
  console.log('PASS high-density displays retain world coordinates within a bounded raster budget');
  assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
