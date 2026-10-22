/* Real wake pixels must survive troughs while opaque scenery keeps depth. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-wake-visibility');
fs.mkdirSync(out,{recursive:true});let browser;const errors=[],reports=[];
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_CHROME?{executablePath:process.env.WIDEWAKE_CHROME}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
  await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await page.click('#start-voyage');await page.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await page.click('#cast-off');await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach,s=g.player;g.nextEncounter=1e9;g.raiders.count=0;g.effects.count=0;g.shots.count=0;g.mounts=[];
    Object.assign(s,{x:0,y:2400,px:0,py:2400,angle:0,previousAngle:0,vx:0,vy:0,hp:0});g.sea.count=0;v.follow=false;v.lookAhead=false;v.camera={x:0,y:2400};v.offset={x:0,y:0};v.zoom=v.targetZoom=2;
    v.surface.draw=()=>0;v.shadows.ships=()=>0;v.wakes.clear();v.render(0,1);document.querySelector('#reach-menu').close();
  });
  await page.waitForFunction(()=>__widewakeReach.view.terrain.ready);
  const phases=await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach,gl=v.gl;window.wakeProbe={originalDraw:v.waterMotion.draw.bind(v.waterMotion)};
    const probe=window.wakeProbe;probe.draw=mode=>{
      v.waterMotion.draw=mode==='off'?()=>0:mode==='reference'?()=>{gl.disable(gl.DEPTH_TEST);const n=probe.originalDraw();gl.enable(gl.DEPTH_TEST);return n;}:probe.originalDraw;
      v.render(0,1);const pixels=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    };
    probe.delta=(a,b,i)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    probe.changed=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(probe.delta(a,b,i)>12)count++;return count;};
    v.wakes.segments=(view,emit)=>emit(-14,2400,14,2400,3,3,1,1);
    let crest=null,trough=null;for(let t=0;t<60;t+=.1){const h=g.sea.at(0,2400,t,{},-1,false).height;if(h>.9&&!crest)crest={time:t,height:h};if(h<-.9&&!trough)trough={time:t,height:h};if(crest&&trough)break;}
    if(!crest||!trough)throw Error('The scene needs positive and negative physical waves');
    return [crest,trough].map(phase=>{g.time=phase.time;g.sea.begin(g.time);const off=probe.draw('off'),actual=probe.draw('normal'),reference=probe.draw('reference');return{...phase,actualPixels:probe.changed(off,actual),referencePixels:probe.changed(off,reference),gl:gl.getError()};});
  });
  for(const phase of phases){assert.equal(phase.gl,0);assert.ok(phase.referencePixels>150,'actual visible foam contributes pixels');assert.ok(phase.actualPixels>=phase.referencePixels*.97,'terrain water must not hide trough foam: '+JSON.stringify(phase));}reports.push({phases});
  await page.screenshot({path:path.join(out,'trough-wake.png')});console.log('PASS positive and negative wave-height trails retain their rendered foam pixels');

  const occlusion=await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach,gl=v.gl,p=window.wakeProbe,s=g.player;g.sea.strength=0;g.time=0;g.sea.begin(0);
    const covered=(without,withObject,withFoam,foamOnly)=>{
      const width=v.canvas.width,height=v.canvas.height,mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++)mask[i]=p.delta(without,withObject,i*4)>45?1:0;
      let protectedPixels=0,changedPixels=0;
      for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
        const n=y*width+x;if(!mask[n]||!mask[n-1]||!mask[n+1]||!mask[n-width]||!mask[n+width]||p.delta(without,foamOnly,n*4)<=12)continue;
        protectedPixels++;if(p.delta(withObject,withFoam,n*4)>12)changedPixels++;
      }return{protectedPixels,changedPixels};
    };
    s.hp=0;const water=p.draw('off'),foam=p.draw('normal');
    Object.assign(s,WidewakeBattle.roles.gunboat,{type:'gunboat',hp:1000,maxHp:1500,sea:{z:0,pz:0,pitch:0,ppitch:0,roll:0,proll:0}});
    const hull=covered(water,p.draw('off'),p.draw('normal'),foam);s.hp=0;
    // Use the real harbor building atlas in the same water location so land
    // cannot accidentally stand in for the building's own depth occlusion.
    const building=new WidewakeOcean.Batch(gl,v.meshes.landing_yard,1);building.add(0,0,0,1,0);
    const original=p.originalDraw;
    const buildingFrame=withFoam=>{v.waterMotion.draw=()=>{v.atlas.draw('landing_yard',building);return withFoam?original():0;};v.render(0,1);const a=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
    const harbor=covered(water,buildingFrame(false),buildingFrame(true),foam);building.dispose();p.originalDraw=original;
    return{hull,harbor,gl:gl.getError()};
  });
  for(const [name,result]of Object.entries(occlusion)){if(name==='gl')continue;assert.ok(result.protectedPixels>30,name+' genuinely overlaps the tested foam');assert.ok(result.changedPixels<result.protectedPixels*.04,name+' keeps foam behind its opaque pixels: '+JSON.stringify(result));}assert.equal(occlusion.gl,0);reports.push({occlusion});console.log('PASS real hull and harbor building pixels occlude water foam');

  await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach;const candidates=[[-800,600],[-900,600],[-700,300],[-1200,400]],bank=candidates.find(([x,y])=>[[0,0],[30,30],[-30,-30],[30,-30],[-30,30]].every(([dx,dy])=>g.field.sample(x+dx,y+dy).depth<-.8));
    if(!bank)throw Error('No dry-bank test patch');window.wakeProbe.bank={x:bank[0],y:bank[1]};v.camera={...window.wakeProbe.bank};v.waterMotion.draw=()=>0;v.render(0,1);
  });await page.waitForFunction(()=>__widewakeReach.view.terrain.ready);
  const bank=await page.evaluate(()=>{
    const {view:v}=__widewakeReach,gl=v.gl,p=window.wakeProbe,O=WidewakeOcean,geo=O.geometry();geo.face([[-12,-12,0],[12,-12,0],[12,12,0],[-12,12,0]],'#ff0000');
    const batch=new O.Batch(gl,new Float32Array(geo.out),1);batch.add(0,0,-2,1,0);p.originalDraw=()=>{v.uniforms(v.main);return batch.draw();};
    const off=p.draw('off'),actual=p.draw('normal'),reference=p.draw('reference'),result={actualPixels:p.changed(off,actual),referencePixels:p.changed(off,reference),gl:gl.getError()};batch.dispose();return result;
  });assert.equal(bank.gl,0);assert.ok(bank.referencePixels>200,'dry-bank probe is on screen');assert.equal(bank.actualPixels,0,'dry terrain still writes depth and blocks water-level effects');reports.push({bank});console.log('PASS dry banks preserve terrain depth occlusion');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
