/* Boat wash separates into spreading shoulders instead of a long white rope. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-wash-shape');
fs.mkdirSync(out,{recursive:true});let browser;const errors=[],reports=[];
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':b);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  for(const [width,height,canvas] of [[1440,900,false],[844,390,false],[844,390,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    if(canvas)await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl2'?null:get.call(this,t,...a);};});
    await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await page.click('#start-voyage');await page.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await page.click('#cast-off');await page.keyboard.press('Escape');await page.locator('#reach-menu').evaluate(e=>e.close());
    if(!canvas){
      const profile=await page.evaluate(()=>{
        const {game:g,view:v}=__widewakeReach,s=g.player,gl=v.gl;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];g.sea.strength=0;g.time=8;g.sea.begin(8);Object.assign(s,{x:0,y:2400,px:0,py:2400,hp:0});v.follow=false;v.camera={x:0,y:2400};v.offset={x:0,y:0};v.zoom=v.targetZoom=4;v.wakes.clear();
        const originalSegments=v.wakes.segments,originalDraw=v.waterMotion.draw.bind(v.waterMotion);let age=.04;
        v.wakes.segments=(view,emit)=>emit(-18,2400,18,2400,10,10,1,1,0,1,0,1,age,age,.32);
        const pixels=enabled=>{v.waterMotion.draw=enabled?originalDraw:()=>0;v.render(0,1);const a=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
        const off=pixels(false),young=pixels(true);age=3;const old=pixels(true);
        const sample=(a,x,y)=>{const p=v.project(x,y,.05),px=Math.round(p.x*v.canvas.width/v.width),py=Math.round(p.y*v.canvas.height/v.height);let value=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=((v.canvas.height-1-py+dy)*v.canvas.width+px+dx)*4;value+=Math.max(0,a[i]-off[i])+Math.max(0,a[i+1]-off[i+1])+Math.max(0,a[i+2]-off[i+2]);n++;}return value/(n*3);};
        const line=(a,y)=>{const values=[];for(let x=-15;x<=15;x+=.5)values.push(sample(a,x,2400+y));return values;},mean=a=>a.reduce((s,n)=>s+n,0)/a.length,youngCenter=mean(line(young,0)),oldCenter=mean(line(old,0)),left=line(old,7.5),right=line(old,-7.5),shoulders=[...left,...right],shoulderMean=mean(shoulders),variance=mean(shoulders.map(n=>(n-shoulderMean)**2));
        v.wakes.segments=originalSegments;v.waterMotion.draw=originalDraw;s.hp=s.maxHp;g.sea.strength=1;
        return{youngCenter,oldCenter,shoulderMean,left:mean(left),right:mean(right),shoulderVariation:Math.sqrt(variance)/shoulderMean,gl:gl.getError()};
      });assert.equal(profile.gl,0);assert.ok(profile.youngCenter>20,'dense white prop wash at the stern');assert.ok(profile.oldCenter<profile.youngCenter*.12,'old center clears rather than leaving a smoke rope');assert.ok(profile.shoulderMean>profile.oldCenter*4,'mature wake is carried by its divergent shoulders');assert.ok(profile.left>2&&profile.right>2,'both sides of the V remain visible');assert.ok(profile.shoulderVariation>.25,'shoulder foam breaks into irregular patches');reports.push({width,profile});
      if(width===1440){
        const shore=await page.evaluate(()=>{
          const {game:g,view:v}=__widewakeReach,s=g.player,gl=v.gl,field=g.sea.field,terrain=v.terrain,originalSegments=v.wakes.segments,originalDraw=v.waterMotion.draw.bind(v.waterMotion);s.hp=0;g.sea.strength=0;v.terrain=null;let age=3;
          v.wakes.segments=(view,emit)=>emit(-24,2400,24,2400,24,24,1,1,0,1,0,1,age,age,.32);
          const setField=depth=>{g.sea.field={sample(x,y,out={}){return Object.assign(out,{depth:depth(x,y),salinity:1,currentX:0,currentY:0});}};};
          const pixels=enabled=>{v.waterMotion.draw=enabled?originalDraw:()=>0;v.render(0,1);const a=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
          const line=(a,b,y)=>{let total=0,n=0;for(let x=-20;x<=20;x+=.5){const p=v.project(x,2400+y,.05),px=Math.round(p.x*v.canvas.width/v.width),py=Math.round(p.y*v.canvas.height/v.height),i=((v.canvas.height-1-py)*v.canvas.width+px)*4;total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);n++;}return total/(3*n);};
          setField(()=>22);const off=pixels(false),reference=pixels(true);setField((x,y)=>(2408-y)*.4);const oneBank=pixels(true);
          age=.04;setField(()=>22);const youngReference=pixels(true);setField((x,y)=>2.4-Math.abs(y-2400)*.2);const bothBanks=pixels(true);
          const report={referenceDryShoulder:line(reference,off,18),clippedDryShoulder:line(oneBank,off,18),wetShoulder:line(oneBank,off,-18),referenceCenter:line(youngReference,off,0),channelCenter:line(bothBanks,off,0),channelDryLeft:line(bothBanks,off,18),channelDryRight:line(bothBanks,off,-18),bytes:v.waterMotion.batch.data.byteLength,gl:gl.getError()};
          g.sea.field=field;g.sea.strength=1;v.terrain=terrain;v.wakes.segments=originalSegments;v.waterMotion.draw=originalDraw;s.hp=s.maxHp;return report;
        });assert.ok(shore.referenceDryShoulder>8,'the unclipped shoulder crosses the test bank');assert.ok(shore.clippedDryShoulder<1,'foam disappears beyond one bank');assert.ok(shore.wetShoulder>8,'the other shoulder stays visible over water');assert.ok(shore.channelCenter>shore.referenceCenter*.9,'a wet middle remains visible when both expanded edges are dry');assert.ok(shore.channelDryLeft<1&&shore.channelDryRight<1,'neither shoulder paints the banks of a narrow channel');assert.equal(shore.bytes,299520);assert.equal(shore.gl,0);reports.push({width,shore});
      }
    }
    const shape=await page.evaluate(()=>{
      const {game:g,view:v}=__widewakeReach,s=g.player;g.nextEncounter=1e9;g.raiders.count=g.effects.count=g.shots.count=0;g.mounts=[];g.sea.strength=1;g.time=0;g.sea.begin(0);Object.assign(s,{x:0,y:2400,px:0,py:2400,angle:0,previousAngle:0,vx:36,vy:0,turn:0,sea:null,hp:s.maxHp});v.wakes.clear();g.sea.count=g.sea.cursor=0;
      for(let n=0;n<600;n++){g.step(1/60,{throttle:1,steer:n>360?.25:0});v.wakes.sample(g.ships,g.ships,g.time);}
      v.follow=false;v.camera={x:s.x,y:s.y};v.offset={x:0,y:0};v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;v.render(0,1);
      // Flight can omit the freshest stern samples. Compare the visible envelope;
      // flat-water growth and speed ratios are covered by test-wake-dynamics.cjs.
      let oldest=0,newest=Infinity,segments=0;const metricView={visualTime:v.visualTime,zoom:v.zoom,baseScale:v.baseScale,visible:()=>true,battle:{ships:[]}};v.wakes.segments(metricView,(x,y,ex,ey,w,ew,a,ea,nx,ny,enx,eny,age=0)=>{segments++;if(age>.9&&age<1.1)oldest=Math.max(oldest,w);newest=Math.min(newest,w);});return{oldWidth:oldest,newWidth:newest,segments,bytes:v.wakes.bytes,drawSegments:v.stats.wakeSegments};
    });assert.ok(shape.oldWidth>=shape.newWidth&&shape.oldWidth<3.5&&shape.newWidth>0,'launch wash spreads within a few beams: '+JSON.stringify(shape));assert.ok(shape.segments>20&&shape.segments<=128);assert.equal(shape.bytes,110592);reports.push({width,canvas,shape});await page.screenshot({path:path.join(out,`${width}-${canvas?'canvas':'webgl'}-wash.png`)});console.log('PASS divergent wash '+width+'x'+height+(canvas?' Canvas':' WebGL'));await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
