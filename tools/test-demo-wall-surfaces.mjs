// Visible material matches the physical wall mask and bounded smoke room.
// Owns one Chrome for Testing child, with no use of the personal browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.DUMP || '/tmp/demo-wall-surfaces');
fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-demo-bounds-'));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    assert(file.startsWith(root+path.sep));
    let bytes=fs.readFileSync(file);
    if(file===path.join(root,'js/water-smoke-slime.js')){
      var source=bytes.toString();
      // Sample the unchanged solver's outer cells more closely than its
      // normal 96 by 54 instrument readback. Only this diagnostic FBO grows.
      if((request.headers.referer || '').includes('boundarycheck=1'))source=source.replace('flowSample = createFBO(96, 54,','flowSample = createFBO(512, 512,').replace('flowValues = new Float32Array(96 * 54 * 4);','flowValues = new Float32Array(512 * 512 * 4);');
      const end=source.lastIndexOf('})();');
      bytes=source.slice(0,end)+'window.__boundsTest=function(source){return eval(source);};\n'+source.slice(end);
    }
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});response.end(bytes);
  }catch{response.writeHead(404).end();}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,socket,sequence=0;
const pending=new Map(),errors=[],checks=[];
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
}
const inside=source=>evaluate('__boundsTest('+JSON.stringify(source)+')');
function checkBounds(row){
  const {stage,viewport,screen,top}=row;
  assert(stage.left>=viewport.left-.1 && stage.right<=viewport.right+.1 && stage.top>=viewport.top-.1 && stage.bottom<=viewport.bottom+.1,
    'Entire simulation fits viewport: '+JSON.stringify(row));
  assert(stage.left>=-.1 && stage.right<=screen.width+.1 && stage.top>=top.bottom-.1 && stage.bottom<=screen.height+.1,
    'Entire simulation clears screen and top controls: '+JSON.stringify(row));
  assert(screen.scrollWidth<=screen.width+1 && screen.scrollHeight<=screen.height+1,
    'App does not scroll outside screen: '+JSON.stringify(row));
  checks.push(row);
}
const geometry=`(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
  return {scene:currentScene,world:{w:worldW,h:worldH},stage:rect('toy-stage'),viewport:rect('toy-viewport'),
    top:document.querySelector('.toy-top').getBoundingClientRect().toJSON(),
    screen:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}};})()`;
async function load(scene,width,height,mobile=false,boundaryCheck=false,pixelRatio=1){
  await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:pixelRatio});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene='+scene+'&paused=1'+(boundaryCheck?'&boundarycheck=1':'')});
  for(let i=0;i<180;i++){
    if(await evaluate('!!window.__boundsTest && __toy.stats().waterState!=="booting" && (!WSSMachineRegistry.lookup('+JSON.stringify(scene)+') || __toy.machineState()?.ready)'))break;
    if(i===179)throw Error('Scene did not boot: '+scene+' '+JSON.stringify(await evaluate('({stats:window.__toy?.stats(),build:window.__toy?.buildState(),air:window.__toy?.airStats(),errors:'+JSON.stringify(errors)+'})')));await delay(100);
  }
  await evaluate('__toy.pause(true);__toy.resize()');await delay(60);
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  let debug;
  for(let i=0;i<150;i++){
    try{debug=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}
    if(debug)break;await delay(100);
  }
  assert(debug,'Chrome for Testing starts');
  const target=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(page=>page.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(waiter){clearTimeout(waiter.timer);pending.delete(message.id);message.error?waiter.reject(Error(JSON.stringify(message.error))):waiter.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  await send('Runtime.enable');await send('Page.enable');
  const rows=[];
  async function verifyMask(label){
    const result=await inside(`(()=>{
      var before=walls.slice(),version=wallsVersion,count=liquidCount;
      bakeWalls();bakeSmokeBoundary();
      var pixels=wallsCtx.getImageData(0,0,wallsCanvas.width,wallsCanvas.height).data;
      var missing=0,outside=0,solidPixels=0,airPixels=0,minAlpha=255;
      var polygons=machineState && machineState.definition.sluice ? machineState.definition.sluice.polygons : [];
      function polygonPoint(points,x,y){
        var inside=false,near=false;
        for(var i=0,j=points.length-1;i<points.length;j=i++){
          var a=points[j],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];
          var t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
          if(Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)<1/dpr)near=true;
          if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
        }
        return {inside,near};
      }
      // Independently classify raster pixel centers against the shared grid.
      // This detects a rounded corner, broad lip, missing border or erased hole.
      for(var y=0;y<wallsCanvas.height;y+=2)for(var x=0;x<wallsCanvas.width;x+=2){
        var r=Math.floor((y+.5)/dpr/TILE),c=Math.floor((x+.5)/dpr/TILE);
        var solid=tileAt(r,c)!==null;
        if(machineState && machineState.definition.hourglass && !isBorderCell(r,c))solid=false;
        var polygonPoints=polygons.map(function(points){return polygonPoint(points,(x+.5)/dpr,(y+.5)/dpr);});
        if(polygonPoints.some(function(p){return p.near;}))continue;
        if(polygonPoints.some(function(p){return p.inside;}))solid=true;
        var alpha=pixels[(y*wallsCanvas.width+x)*4+3];
        if(solid){solidPixels++;minAlpha=Math.min(minAlpha,alpha);if(alpha<200)missing++;}
        else{airPixels++;if(alpha)outside++;}
      }
      return {missing,outside,solidPixels,airPixels,minAlpha,
        unchanged:version===wallsVersion && count===liquidCount && before.every(function(v,i){return v===walls[i];})};
    })()`);
    assert.equal(result.missing,0,label+': every solid pixel has visible material');
    assert.equal(result.outside,0,label+': no material covers air');
    assert(result.solidPixels>0 && result.airPixels>0,label+': wall and air both sampled');
    assert(result.unchanged,label+': rendering leaves physics unchanged');
    rows.push({label,...result});
  }
  async function capture(name){
    // Keep screenshots readable without introducing another physics tick.
    await evaluate("document.getElementById('toy-resume').hidden=true");
    const frame=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(frame.data,'base64'));
  }
  for(const scene of ['falls','zerog','chimney','spa','rig','blank','self-flushing-cup','siphon','thermoscope','smoke-wind-tunnel','hourglass','gold-sluice-box']){
    await load(scene,1440,900);
    await verifyMask(scene);
    await inside('render()');
    if(['falls','self-flushing-cup','smoke-wind-tunnel','hourglass'].includes(scene))await capture(scene);
    if(scene==='self-flushing-cup'){
      await evaluate('__toy.glass(false)');await verifyMask('opaque cup');
      await evaluate('__toy.glass(true)');await verifyMask('glass cup');
    }
  }
  await load('blank',980,700);
  await evaluate('__toy.paint(300,200,500,320,24,true)');await verifyMask('drawn wall');
  await evaluate('__toy.paint(400,260,400,260,12,false)');await verifyMask('erased hole');
  // A touching corner and a narrow slot must stay true to the occupied cells.
  await inside('wallRect(80,80,88,144);wallRect(96,80,104,144);wallRect(80,160,88,168);wallRect(88,168,96,176)');
  await verifyMask('one-cell walls, slot and diagonal contact');await capture('draw-and-erase');
  const sizes=[[1440,900,false,1],[980,700,false,1],[844,390,true,1],[390,844,true,1],[844,390,true,2]];
  for(const scene of ['falls','self-flushing-cup','smoke-wind-tunnel'])for(const [width,height,mobile,pixelRatio]of sizes){
    await load(scene,width,height,mobile,false,pixelRatio);
    await verifyMask(scene+' '+width+'x'+height+' @'+pixelRatio);
    const boundary=await inside(`(()=>{
      bakeSmokeBoundary();var c=smokeBoundaryCtx,p=c.getImageData(0,0,smokeBoundaryCanvas.width,smokeBoundaryCanvas.height).data;
      var left=parseFloat(stage.style.left)||0,top=parseFloat(stage.style.top)||0,t=smokeBoundaryThickness()*fitScale;
      var x0=left+smokeDomain.x*fitScale,y0=top+smokeDomain.y*fitScale,w=smokeDomain.w*fitScale,h=smokeDomain.h*fitScale;
      var missing=0,outside=0,closed=0,open=!!SmokeFluid.config.OPEN_RIGHT;
      for(var y=0;y<smokeBoundaryCanvas.height;y+=2)for(var x=0;x<smokeBoundaryCanvas.width;x+=2){
        var wx=(x+.5)/dpr-x0,wy=(y+.5)/dpr-y0;
        var inRoom=wx>=0 && wx<w && wy>=0 && wy<h;
        var shell=inRoom && (wx<t || wy<t || wy>=h-t || (!open && wx>=w-t));
        // Antialiasing at fractional camera edges can cover one device pixel.
        var near=[wx,wx-t,wx-w,wx-w+t,wy,wy-t,wy-h,wy-h+t].some(function(v){return Math.abs(v)<1/dpr;});
        if(near)continue;
        var alpha=p[(y*smokeBoundaryCanvas.width+x)*4+3];
        if(shell){closed++;if(alpha<240)missing++;}else if(alpha)outside++;
      }
      return {missing,outside,closed,open};
    })()`);
    assert.equal(boundary.missing,0,'The physical smoke wall band is fully visible');
    assert.equal(boundary.outside,0,'The smoke frame never covers open air or its open outlet');
    assert(boundary.closed>0,'Closed smoke walls were sampled');
    checkBounds(await inside(geometry));
    await capture(scene+'-'+width+'x'+height);
    // A paused camera change must immediately move the wall to its new location.
    const oldKey=await inside('smokeBoundaryKey');
    await evaluate('__toy.setCamera({zoom:1.6,panX:20,panY:10})');
    assert.equal(await evaluate('__toy.camera().zoom'),1.6,'Paused camera really moved');
    assert.notEqual(await inside('smokeBoundaryKey'),oldKey,'Camera movement repainted the surface');
    const moved=await inside('var before=smokeBoundaryKey;bakeSmokeBoundary();({cached:before===smokeBoundaryKey,width:smokeBoundaryCanvas.width,height:smokeBoundaryCanvas.height})');
    assert(moved.cached,'Camera changes repaint the room walls immediately, including when paused');
  }
  assert.equal(errors.length,0,'No browser exceptions');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({pass:true,rows,checks,errors},null,2));
  console.log('PASS '+rows.length+' wall-mask comparisons, '+checks.length+' smoke-boundary and viewport checks. '+output);
}finally{
  try{socket?.close();}catch{}
  server.close();
  for(const waiter of pending.values())clearTimeout(waiter.timer);
  if(browser && browser.exitCode===null && browser.signalCode===null){
    const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill();
    const force=setTimeout(()=>browser.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
