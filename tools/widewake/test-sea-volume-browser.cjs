/* Deterministic visual evidence: six actual hull/water frames and flat controls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-sea-volume');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':bytes);});
});
let browser;const errors=[],reports=[];
function savePng(name,url){assert.ok(url.startsWith('data:image/png;base64,'));fs.writeFileSync(path.join(out,name),Buffer.from(url.slice(url.indexOf(',')+1),'base64'));}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_CHROME?{executablePath:process.env.WIDEWAKE_CHROME}:{})});
  const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage();
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');
  await page.click('#start-voyage');await page.waitForFunction(()=>__widewakeReach.view?.terrain.ready);await page.click('#cast-off');await page.keyboard.press('Escape');
  await page.locator('#reach-menu').evaluate(element=>element.close());
  await page.evaluate(()=>{
    const {game:g,view:v}=__widewakeReach;g.nextEncounter=1e9;g.raiders.count=0;g.effects.count=0;g.shots.count=0;g.ships.length=1;g.route=null;g.work=false;g.port=null;
    v.follow=false;v.lookAhead=false;v.anchor=null;v.offset={x:0,y:0};
    window.volumeCapture={frames:[]};
    // Read pixels from the actual framebuffer. Percentiles ignore the small
    // hull and quantify visible water contrast, without grading artistic taste.
    window.volumeCapture.capture=()=>{
      v.render(0,1);const gl=v.gl;if(!gl)throw Error('The volume capture requires WebGL2');
      const pixels=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const values=[];for(let y=12;y<v.canvas.height-12;y+=3)for(let x=12;x<v.canvas.width-12;x+=3){const at=(y*v.canvas.width+x)*4;values.push(pixels[at]*.2126+pixels[at+1]*.7152+pixels[at+2]*.0722);}
      values.sort((a,b)=>a-b);const q=f=>values[Math.floor((values.length-1)*f)],pose=v.poses[0];
      return{image:v.canvas.toDataURL('image/png'),metrics:{time:g.time,x:g.player.x,y:g.player.y,z:pose.z,pitch:pose.pitch,roll:pose.roll,camera:{...v.camera},cssPixelsPerMetre:v.zoom*v.baseScale*v.canvas.clientWidth/v.width,waterLumaRange:q(.90)-q(.10),gl:gl.getError()}};
    };
  });

  for(const type of ['launch','gunboat']){
    const setup=await page.evaluate(type=>{
      const {game:g,view:v}=__widewakeReach,s=g.player,spec=type==='launch'?WidewakeEstuary.vessels.launch:WidewakeBattle.roles.gunboat;
      Object.assign(s,spec,{type,speed:type==='launch'?36:72,maxHp:spec.hp,hp:spec.hp});g.updateStats();g.rebuildMounts();v.configureCamera();v.zoom=v.targetZoom=v.stops.helm;
      const heading=WidewakeWaves.bands[0].angle,c=Math.cos(heading),sn=Math.sin(heading),duration=1.5,start={x:0,y:2400};
      // Select a reproducible crest crossing rather than relying on browser
      // loading time. Both sea and flat-control runs use this identical path.
      let best={score:-Infinity,time:0};g.sea.strength=1;
      for(let time=1;time<30;time+=.25){const heights=[];for(let n=0;n<6;n++){const t=n*.3;heights.push(g.sea.at(start.x+c*s.speed*t,start.y+sn*s.speed*t,time+t,{},0,false).height);}
        const crest=Math.max(...heights.slice(1,5)),range=Math.max(...heights)-Math.min(...heights),score=range+Math.max(0,crest-(heights[0]+heights[5])*.5);
        if(score>best.score)best={score,time};
      }
      const fixedCamera={x:start.x+c*s.speed*duration*.5,y:start.y+sn*s.speed*duration*.5};
      window.volumeCapture.setup={type,heading,start,time:best.time,fixedCamera,speed:s.speed};return window.volumeCapture.setup;
    },type);
    const runs={};
    for(const strength of [1,0]){
      const mode=strength?'sea':'flat';
      await page.evaluate(strength=>{
        const {game:g,view:v}=__widewakeReach,s=g.player,p=window.volumeCapture.setup;
        Object.assign(s,{x:p.start.x,y:p.start.y,px:p.start.x,py:p.start.y,angle:p.heading,previousAngle:p.heading,vx:Math.cos(p.heading)*p.speed,vy:Math.sin(p.heading)*p.speed,turn:0,throttle:1,helm:null,sea:null});
        g.time=p.time;g.tick=Math.round(p.time*60);g.sea=new WidewakeWaves.Sea(g.field);g.sea.strength=strength;g.sea.begin(g.time);g.sea.stepShip(s,0,false);
        g.shots.count=g.effects.count=g.raiders.count=0;g.nextEncounter=1e9;v.wakes.clear();v.camera={...p.fixedCamera};v.follow=false;v.lookAhead=false;v.offset={x:0,y:0};v.render(0,1);
      },strength);
      await page.waitForFunction(()=>__widewakeReach.view.terrain.ready);
      const frames=[];
      for(let frame=0;frame<6;frame++){
        const result=await page.evaluate(frame=>{
          const {game:g,view:v}=__widewakeReach;
          // Advance real physics and world-space wake history at 60 Hz. Render
          // each captured pose instead of filling the GPU with unseen frames.
          if(frame)for(let n=0;n<18;n++){g.step(1/60,{throttle:1,steer:0});v.wakes.sample(g.ships,g.ships,g.time);}
          return window.volumeCapture.capture();
        },frame);
        assert.equal(result.metrics.gl,0);assert.ok(Number.isFinite(result.metrics.z));
        const name=type+'-'+mode+'-'+String(frame).padStart(2,'0')+'.png';savePng(name,result.image);
        frames.push({...result,name});
      }
      const sheet=await page.evaluate(async({frames,type,mode})=>{
        const images=await Promise.all(frames.map(frame=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=frame.image;})));
        const width=images[0].width,height=images[0].height,label=34,canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=(height+label)*3;const ctx=canvas.getContext('2d');ctx.fillStyle='#102936';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='15px "Commit Mono", monospace';ctx.fillStyle='#e8dfb5';
        images.forEach((image,index)=>{const x=(index%2)*width,y=Math.floor(index/2)*(height+label);ctx.drawImage(image,x,y);const m=frames[index].metrics;ctx.fillText(type+' / '+mode+' / +'+(index*.3).toFixed(2)+' s / z '+m.z.toFixed(2)+' m / pitch '+(m.pitch*180/Math.PI).toFixed(1)+' deg',x+14,y+height+23);});
        return canvas.toDataURL('image/png');
      },{frames,type,mode});
      savePng(type+'-'+mode+'-sequence.png',sheet);runs[mode]=frames.map(({metrics,name})=>({...metrics,image:name}));
      console.log('Captured '+type+' '+mode+' at actual helm zoom');
    }
    // The untouched opening frame has essentially no wake. Compare the actual
    // water pixels there, so a brighter wake cannot make flat water pass.
    assert.ok(runs.sea[0].waterLumaRange>runs.flat[0].waterLumaRange+4,'wave faces must add visible framebuffer contrast: '+JSON.stringify({type,sea:runs.sea[0].waterLumaRange,flat:runs.flat[0].waterLumaRange}));
    assert.ok(runs.flat.every(frame=>Math.abs(frame.z)<1e-6),'flat control has no manufactured bobbing');
    reports.push({type,setup,...runs});
    await page.evaluate(()=>{
      const {game:g,view:v}=__widewakeReach,s=g.player,p=window.volumeCapture.setup;g.sea.strength=1;g.sea.count=0;s.sea=null;v.wakes.clear();
      // This additional helm view records a full eight seconds of real turn
      // history. It is separate from the fixed-camera crest crossing above.
      for(let n=0;n<480;n++){g.step(1/60,{throttle:1,steer:Math.sin(n/110)*.22});v.wakes.sample(g.ships,g.ships,g.time);}
      v.follow=true;v.lookAhead=true;v.camera={x:s.x+s.vx*.4,y:s.y+s.vy*.4};v.render(0,1);
    });
    await page.waitForFunction(()=>__widewakeReach.view.terrain.ready);
    const helm=await page.evaluate(()=>window.volumeCapture.capture());assert.equal(helm.metrics.gl,0);savePng(type+'-helm-wash.png',helm.image);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();console.log('PASS rendered sea contrast, fixed-camera crossings and flat controls');console.log(out);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
