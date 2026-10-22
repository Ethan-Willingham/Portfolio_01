/* Check the pixels available to physical hulls, then keep rendered evidence for review. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),safari=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-boat-readability');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':bytes);});
});
let browser;const errors=[],reports=[],filter=process.env.WIDEWAKE_TEST_FILTER;
async function measure(page,hook,mixed=false){return page.evaluate(({hook,mixed})=>{
  const v=window[hook].view,box=v.canvas.getBoundingClientRect(),saved=mixed?{ships:v.battle.ships,stops:v.stops}:null;
  if(mixed){v.battle.ships=[...saved.ships,{...WidewakeBattle.roles.oilrig,id:saved.ships.length,type:'oilrig',hp:100}];v.configureCamera();}
  try{let stops=v.stops;
  if(!stops){
    const saved={targetZoom:v.targetZoom,anchor:v.anchor,offset:{...v.offset}};stops={};
    for(const name of ['helm','fleet','survey']){v.zoomStop(name);stops[name]=v.targetZoom;}
    Object.assign(v,saved);
  }
  // Independent projection over 720 headings includes the compressed head-on view.
  // This measures the shared physical outline, not inflated artwork or a name marker.
  const footprint=(spec,zoom)=>{
    let minimum=Infinity;
    for(let h=0;h<720;h++){
      const a=h*Math.PI/360,c=Math.cos(a),s=Math.sin(a);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for(const point of WidewakeBattle.HULL_OUTLINE){const x=point[0]*spec.length,y=point[1]*spec.width,p=WidewakeOcean.project(x*c-y*s,x*s+y*c);left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
      minimum=Math.min(minimum,Math.max((right-left)*box.width/v.width,(bottom-top)*box.height/v.height)*zoom*v.baseScale);
    }
    return minimum;
  };
  const zooms={};for(const [name,zoom]of Object.entries(stops))zooms[name]={zoom,player:footprint(v.battle.player,zoom),enemies:WidewakeBattle.enemies.map(e=>footprint(e,zoom))};
  return{width:box.width,height:box.height,backend:v.stats.backend,zooms,current:v.zoom,target:v.targetZoom,glError:v.gl?.getError()||0,physicalHull:{length:v.battle.player.length,width:v.battle.player.width},atlasBytes:v.atlas?.bytes||0};
  }finally{if(saved){v.battle.ships=saved.ships;v.stops=saved.stops;}}
},{hook,mixed});}
function assertReadable(report,combat){
  const z=report.zooms;
  assert.ok(z.survey.player>=15.95,'flagship remains at least 16 CSS pixels across at every heading: '+JSON.stringify(report));
  if(combat)assert.ok(Math.min(...z.survey.enemies)>=11.95,'small raiders remain at least 12 CSS pixels across: '+JSON.stringify(report));
  assert.ok(z.helm.zoom>z.fleet.zoom&&z.fleet.zoom>z.survey.zoom,'Close, Fleet and Wide remain distinct');
  assert.equal(report.glError,0);
}
async function settle(page,hook){await page.waitForFunction(h=>{const v=window[h].view;return Math.abs(v.zoom-v.targetZoom)<.002;},hook,{timeout:20000});}
async function sceneHullPixels(page,hook){return page.evaluate(hook=>{
  const v=window[hook].view,g=v.gl;if(!g)return null;
  const read=()=>{const pixels=new Uint8Array(v.canvas.width*v.canvas.height*4);g.readPixels(0,0,v.canvas.width,v.canvas.height,g.RGBA,g.UNSIGNED_BYTE,pixels);return pixels;};
  v.render(0);const full=read(),draw=v.atlas.draw,type=v.battle.player.type;
  let without;
  try{v.atlas.draw=function(name,batch){return name===type?0:draw.call(this,name,batch);};v.render(0);without=read();}
  finally{v.atlas.draw=draw;v.render(0);}
  let pixels=0;for(let i=0;i<full.length;i+=4)if(Math.abs(full[i]-without[i])+Math.abs(full[i+1]-without[i+1])+Math.abs(full[i+2]-without[i+2])>12)pixels++;
  return{type,pixels,error:g.getError()};
},hook);}
async function cameraChecks(page,hook,name,combat){
  const initial=await measure(page,hook);assertReadable(initial,combat);
  if(name==='voyage-1440x900'){
    const mixed=await measure(page,hook,true);assertReadable(mixed,false);assert.ok(mixed.zooms.fleet.player>=mixed.zooms.survey.player);
    assert.deepEqual((await measure(page,hook)).zooms,initial.zooms,'mixed fleet fixture restores the live camera before the next frame');
    reports.push({scene:'launch-with-oil-tender',...mixed});console.log('PASS a large companion does not shrink the launch below its readability floor');
  }
  for(const [key,label]of [['3','wide'],['2','fleet'],['1','close']]){
    await page.keyboard.press(key);await settle(page,hook);await page.screenshot({path:path.join(out,name+'-'+label+'.png')});
  }
  const size=page.viewportSize();
  // Repeated real wheel input covers the UI path, including its per-event clamp.
  await page.mouse.move(size.width*.65,size.height*.45);
  for(let i=0;i<30;i++)await page.mouse.wheel(0,900);
  await settle(page,hook);const far=await measure(page,hook);assertReadable(far,combat);
  assert.ok(Math.abs(far.target-far.zooms.survey.zoom)<1e-8,'wheel cannot reduce boats below Wide');
  // Direct calls cover the common pinch and controller setter with extreme values.
  await page.evaluate(h=>{const v=window[h].view;v.setZoom(1e-12,innerWidth*.7,innerHeight*.4);},hook);
  assert.equal((await measure(page,hook)).target,far.zooms.survey.zoom);
  const pause=hook==='__widewakeBattle'?'#pause':'#reach-pause';await page.click(pause);
  for(const viewport of [{width:size.height,height:size.width},{width:size.width,height:Math.max(240,size.height-48)},size]){
    await page.setViewportSize(viewport);await page.evaluate(h=>window[h].view.resize(),hook);
    const rotated=await measure(page,hook);assertReadable(rotated,combat);
    assert.ok(rotated.current>=rotated.zooms.survey.zoom-1e-8,'resize clamps the interpolated camera');
    assert.ok(Math.abs(rotated.target-rotated.zooms.survey.zoom)<1e-8,'resize preserves Wide');
  }
  const final=await measure(page,hook);assert.deepEqual(final.physicalHull,initial.physicalHull,'camera changes leave physical hull dimensions intact');
  const hull=await sceneHullPixels(page,hook);if(hull){assert.equal(hull.error,0);assert.ok(hull.pixels>30,'physical hull sprite contributes pixels to the live water scene: '+JSON.stringify(hull));}
  reports.push({scene:name,...final,hull});console.log('PASS '+name+' heading footprints, wheel limits, camera stops, rotated viewport and live hull pixels');
}
async function contactSheet(page){
  const data=await page.evaluate(()=>{
    const v=__widewakeReach.view,g=v.gl;
    if(!g)throw Error('Contact sheet requires the actual WebGL atlas');
    const saved={zoom:v.zoom,camera:v.camera,follow:v.follow,reduced:v.reduced};v.follow=false;v.camera={x:0,y:0};v.reduced=true;
    const sheet=document.createElement('canvas'),cell=170,label=180,rowHeight=130,top=76;
    const types=['launch','raider0','raider1','raider2','raider3','gunboat','trawler','oilrig'];
    sheet.width=label+cell*8;sheet.height=top+types.length*rowHeight;const c=sheet.getContext('2d',{willReadFrequently:true});
    c.fillStyle='#102b3a';c.fillRect(0,0,sheet.width,sheet.height);c.fillStyle='#edf0df';c.font='18px Segoe UI';c.fillText('Wide camera, actual CSS size, eight headings',18,28);
    c.font='12px Segoe UI';c.fillStyle='#b8cbd0';c.fillText('Launch uses voyage Wide. Other vessels use combat Wide. Physical hull sizes are unchanged.',18,49);
    for(let h=0;h<8;h++)c.fillText((h*45)+' degrees',label+h*cell+48,top-8);
    const combat=document.createElement('canvas');combat.style.cssText='position:fixed;width:1440px;height:900px;left:-2000px;top:0';document.body.append(combat);
    // Use the same camera constructor as the real combat, without launching simulation.
    const combatView=new WidewakeCombat.View(combat,new WidewakeCombat.Endgame({population:0}));
    const combatScale=combatView.stops.survey*combatView.baseScale;combatView.dispose();combat.remove();
    const ratioX=v.canvas.width/v.width,ratioY=v.canvas.height/v.height,cssRatio=v.canvas.getBoundingClientRect().width/v.width,coverage=[];
    for(let row=0;row<types.length;row++){
      const type=types[row];v.zoom=type==='launch'?v.stops.survey:combatScale/v.baseScale;
      c.fillStyle=row%2?'#153849':'#123243';c.fillRect(0,top+row*rowHeight,sheet.width,rowHeight);
      c.fillStyle='#edf0df';c.font='15px Segoe UI';c.fillText(type,18,top+row*rowHeight+35);c.fillStyle='#b8cbd0';c.font='11px Segoe UI';c.fillText((v.zoom*v.baseScale*cssRatio).toFixed(2)+' CSS px / metre',18,top+row*rowHeight+54);
      for(let h=0;h<8;h++){
        const b=v.atlas.batches[type],angle=h*Math.PI/4;b.count=0;b.add(0,0,0,Math.cos(angle),Math.sin(angle));
        g.viewport(0,0,v.canvas.width,v.canvas.height);g.clearColor(18/255,59/255,85/255,1);g.depthMask(true);g.disable(g.BLEND);g.enable(g.DEPTH_TEST);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);v.atlas.begin();v.atlas.draw(type,b);v.atlas.edges();
        const x=label+h*cell,y=top+row*rowHeight;
        c.drawImage(v.canvas,(v.width/2-cell/(2*cssRatio))*ratioX,(v.height/2-rowHeight/(2*cssRatio))*ratioY,cell/cssRatio*ratioX,rowHeight/cssRatio*ratioY,x,y,cell,rowHeight);
        const pixels=c.getImageData(x,y,cell,rowHeight).data;let visible=0,light=0,dark=0;
        for(let i=0;i<pixels.length;i+=4){const delta=Math.abs(pixels[i]-18)+Math.abs(pixels[i+1]-59)+Math.abs(pixels[i+2]-85);if(delta>35){visible++;const luma=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];if(luma>110)light++;if(luma<75)dark++;}}
        coverage.push({type,heading:h*45,visible,light,dark});
      }
    }
    Object.assign(v,saved);v.render(0);return{png:sheet.toDataURL('image/png'),coverage,error:g.getError()};
  });
  assert.equal(data.error,0);for(const frame of data.coverage)assert.ok(frame.visible>20,'boat retains a visible footprint: '+JSON.stringify(frame));
  fs.writeFileSync(path.join(out,'wide-eight-headings.png'),Buffer.from(data.png.split(',')[1],'base64'));reports.push({scene:'atlas-contact-sheet',coverage:data.coverage});
  console.log('PASS actual atlas coverage at eight headings; contact sheet saved for visual review');
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await(safari?webkit.launch({headless:true}):chromium.launch({headless:true,...(process.env.WIDEWAKE_TEST_BROWSER?{executablePath:process.env.WIDEWAKE_TEST_BROWSER}:{})}));
  for(const [width,height,touch]of [[1440,900,false],[844,390,true],[667,375,true]]){
    for(const combat of [false,true]){
      const name=(combat?'combat':'voyage')+'-'+width+'x'+height;if(filter&&!name.includes(filter))continue;
      const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));
      await p.goto(base+'/widewake.html?test');await p.click(combat?'#title-combat':'#start-voyage');
      if(combat)await p.waitForFunction(()=>__widewakeReach.game?.time>.1);else{await p.waitForFunction(()=>__widewakeReach.view?.terrain.ready,null,{timeout:60000});await p.click('#cast-off');}
      await cameraChecks(p,'__widewakeReach',name,combat);
      if(!combat&&!touch)await contactSheet(p);
      await context.close();
    }
  }
  if(!filter||'battle-trial'.includes(filter)){
    const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.stack));
    await p.goto(base+'/widewake-battle.html?test&population=1');await p.waitForFunction(()=>window.__widewakeBattle?.view.atlas);await p.click('#resume');
    await cameraChecks(p,'__widewakeBattle','battle-trial',true);await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'readability.json'),JSON.stringify({engine:safari?'webkit':'chromium',reports},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
