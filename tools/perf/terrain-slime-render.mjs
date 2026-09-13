// Compare the v27 render paths with the previous release on the same world,
// camera and body state. Pixel readbacks are excluded from performance runs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const ref=process.env.BASE_REF||'2ca9565';
function oldFunction(file,name,next){
  const s=execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8'});
  return s.slice(s.indexOf('  function '+name+'('),s.indexOf('  function '+next+'('));
}
const beforeTerrain=oldFunction('js/sluice/130-render-mine-break.js','drawTerrainChunks','drawTerrainClearOverlays');
const beforeSlime=oldFunction('js/sluice/340-jello.js','jelloDrawBody','drawJelloCoupleVectors');
const probe=`
var beforeTerrain=(${beforeTerrain}\n), beforeSlime=(${beforeSlime}\n);
window.__renderReady=function(){return introPhase==='done';};
window.__renderCompare=function(){
  gamePaused=true;cancelAnimationFrame(gameRafId);gameRafId=0;
  var originalCtx=ctx,originalNow=performance.now,cv=document.createElement('canvas');
  ctx=cv.getContext('2d');performance.now=function(){return 123456;};
  var reports=[],errors=[],pictures=[],worstSlime=0;
  function check(ok,message){if(!ok)errors.push(message);}
  function difference(a,b,label,kind){
    var sum=0,max=0,n=0,large=0;
    for(var i=0;i<a.length;i++){var d=Math.abs(a[i]-b[i]);sum+=d;if(d){n++;if(d>8)large++;if(d>max)max=d;}}
    var report={kind:kind,label:label,meanError:sum/a.length,maxDifference:max,changedChannels:n,largePercent:large*100/a.length};
    reports.push(report);return report;
  }
  function view(width,height,scale,x,y){
    cv.width=width;cv.height=height;dpr=1;worldScale=targetWorldScale=scale;
    viewW=width;viewH=height;screenW=width/scale;screenH=height/scale;
    cam.x=x;cam.y=y;syncTerrainChunkRenderScale();
  }
  function backdrop(){
    ctx.reset();
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#605040';ctx.fillRect(0,0,cv.width,cv.height);
    for(var y=0;y<cv.height;y+=31){ctx.fillStyle=y%62?'#263749':'#7c6548';ctx.fillRect(0,y,cv.width,13);}
    ctx.setTransform(worldScale,0,0,worldScale,-cam.x*worldScale,-cam.y*worldScale);
  }
  function terrain(label){
    var sr=Math.max(0,Math.floor(cam.y/TILE)),er=Math.min(TOTAL_ROWS-1,Math.floor((cam.y+screenH)/TILE));
    var sc=Math.max(0,Math.floor(cam.x/TILE)),ec=Math.min(COLS-1,Math.floor((cam.x+screenW)/TILE));
    terrainChunkRebuildBoostFrames=1;
    function paint(fn){
      backdrop();prepareDarknessOverlay(sr,er,sc,ec);fn(sr,er,sc,ec);drawDarknessOverlay(sr,er,sc,ec);
      return ctx.getImageData(0,0,cv.width,cv.height).data;
    }
    // Warm the direct sources; the candidate is compared both cold and warm.
    for(var i=0;i<3;i++)paint(beforeTerrain);
    var a=paint(beforeTerrain),b=paint(drawTerrainChunks);
    var cold=difference(a,b,label+' cold','terrain');
    for(var i=0;i<14;i++)paint(drawTerrainChunks);
    b=paint(drawTerrainChunks);
    var r=difference(a,b,label+' warm','terrain');
    r.scale=TERRAIN_CHUNK_RENDER_SCALE;r.submission=window.__perf.terrainSubmission();
    check(cold.meanError<0.04&&r.meanError<0.04,label+': terrain appearance changed');
    if(TERRAIN_CHUNK_RENDER_SCALE%1)check(r.maxDifference===0,label+': fractional cache fallback must be exact');
    check(terrainBatchBuilds===0,label+': stationary warmed terrain rebuilt');
    check(terrainBatchBytes<=32*1024*1024&&terrainBatchCount<=24,label+': bounded cache');
    // Any nontrivial difference must stay inside the existing chunk overlap
    // and filter footprint, not alter the material throughout a chunk.
    var radius=worldScale*(1+3/TERRAIN_CHUNK_RENDER_SCALE)+1,outside=0,examples=[];
    for(var p=0;p<a.length;p+=4){
      var x=(p/4)%cv.width,wx=cam.x+x/worldScale;
      var edge=Math.round(wx/TERRAIN_CHUNK_PX)*TERRAIN_CHUNK_PX;
      var wy=cam.y+Math.floor(p/4/cv.width)/worldScale,yEdge=Math.round(wy/TERRAIN_CHUNK_PX)*TERRAIN_CHUNK_PX;
      if(Math.abs(wx-edge)*worldScale>radius&&Math.abs(wy-yEdge)*worldScale>radius)for(var k=0;k<4;k++)if(Math.abs(a[p+k]-b[p+k])>2){outside++;if(examples.length<8)examples.push({x:x,y:Math.floor(p/4/cv.width),delta:Math.abs(a[p+k]-b[p+k])});}
    }
    check(outside===0,label+': changed pixels outside chunk joins');r.outsideJoins=outside;r.examples=examples;
    if(label==='surface 0')pictures.push({name:'terrain',png:cv.toDataURL()});
  }
  function cloneBody(source){
    var b={};for(var key in source){if(key.indexOf('_skin')===0)continue;var v=source[key];b[key]=ArrayBuffer.isView(v)?new v.constructor(v):v;}return b;
  }
  try{
    var dimensions=[[2560,1440,2.67],[2248,1193,2.34],[1920,1080,1.8],[2560,1440,4.2],[1920,1080,3.34]];
    for(var q=0;q<dimensions.length;q++){
      var dim=dimensions[q];view(dim[0],dim[1],dim[2],4300.25,-230.3);terrain('surface '+q);
      cam.x=5100.7;cam.y=-120.2;terrain('stone '+q);
      cam.x=4300.2;cam.y=1000.4;terrain('cave '+q);
    }
    view(2560,1440,2.67,4300.25,50.2);lightTune.enabled=0;terrain('unlit terrain');
    view(3200,1800,2,4300.25,50.2);terrain('large lit view exceeds cache');
    view(2560,1440,2.67,4300.25,50.2);
    for(var r=SKY_ROWS;r<SKY_ROWS+16;r++){
      var tile=getTileObj(r,150);world[r][150]=null;if(tile)markTerrainCleared(r,150,tile);
    }
    terrain('mined shaft');lightTune.enabled=1;terrain('lit shaft');
    lightTune.darkAlpha=.5;terrain('translucent fog');lightTune.darkAlpha=1;
    for(var edge of [[-100.3,50],[COLS*TILE-400.7,50],[4300.2,TOTAL_ROWS*TILE-400]]){
      cam.x=edge[0];cam.y=edge[1];terrain('world edge '+edge);
    }
    var owner=terrainChunkCache;terrainChunkCache={};terrainChunkCount=0;terrainChunkUseTick=0;
    cam.x=4300.25;cam.y=-230.3;terrain('world cache reset');
    check(terrainBatchOwner===terrainChunkCache&&terrainBatchOwner!==owner,'Batch cache follows world cache identity');
    check(reports.some(function(r){return r.submission&&r.submission.batches>0;}),'Exercise actual terrain batches');

    var bodies=jelloBodies.filter(function(b){return b.devFixture;});check(bodies.length===8,'All eight slime materials');
    JELLO_DEBUG_PARTICLES=false;
    for(var style=0;style<4;style++)for(var smoothing=0;smoothing<2;smoothing++)for(var pose=0;pose<3;pose++)for(var bi=0;bi<bodies.length;bi++){
      JELLO_EDGE_STYLE=style;JELLO_RENDER_SMOOTH=smoothing;
      var b=cloneBody(bodies[bi]);
      for(var p=0;p<b.n;p++){
        b.px[p]+=(pose===1?Math.sin(p*.7)*3:0);b.py[p]+=(pose===1?Math.cos(p*.9)*2:0);
      }
      b.rippleOn=pose===2;b.rippleU=new Float32Array(b.ringN);
      if(b.rippleOn)for(var p=0;p<b.ringN;p++)b.rippleU[p]=Math.sin(p*.6)*2;
      b.bboxL=Math.min.apply(null,b.px);b.bboxR=Math.max.apply(null,b.px);
      b.bboxT=Math.min.apply(null,b.py);b.bboxB=Math.max.apply(null,b.py);
      var scale=pose===0?2.67:pose===1?1.3:4.2;
      view(384,320,scale,b.cx-192/scale+.17,b.cy-160/scale+.23);
      var aBody=cloneBody(b),bBody=cloneBody(b);
      backdrop();beforeSlime(aBody);var a=ctx.getImageData(0,0,cv.width,cv.height).data,oldPng=cv.toDataURL();
      backdrop();jelloDrawBody(bBody);var after=ctx.getImageData(0,0,cv.width,cv.height).data;
      var result=difference(a,after,'material '+bi+' style '+style+' smoothing '+smoothing+' pose '+pose,'slime');
      if(result.meanError>worstSlime){worstSlime=result.meanError;pictures=pictures.filter(function(p){return p.name.indexOf('worst-')!==0;});pictures.push({name:'worst-old',png:oldPng},{name:'worst-new',png:cv.toDataURL()});}
      check(result.meanError<0.12&&result.largePercent<0.2,result.label+': slime appearance changed');
      var skin=bBody._skinPath;jelloRingBake(bBody);check(jelloCachedRingPath(bBody)===skin,'Unchanged outline reused');
      bBody.px[bBody.ring[0]]+=.125;jelloRingBake(bBody);check(jelloCachedRingPath(bBody)!==skin,'Moved outline invalidated');
      if(style===1&&smoothing===1&&pose===2&&bi===5)pictures.push({name:'slime',png:cv.toDataURL()});
    }
    return {reports:reports,errors:errors,pictures:pictures};
  }finally{ctx=originalCtx;performance.now=originalNow;}
};
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4'};
const server=http.createServer((req,res)=>{try{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  let data=fs.readFileSync(file);
  if(file===path.join(root,'js/sluice.js')){const s=data.toString(),end=s.lastIndexOf('})();');data=Buffer.from(s.slice(0,end)+probe+s.slice(end));}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
}catch(e){res.writeHead(500).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
  const page=await browser.newPage({viewport:{width:1798,height:954},deviceScaleFactor:1.25});
  await page.addInitScript(()=>{let seed=48271;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);});
  await page.route(/googletagmanager|google-analytics/,route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?dev=1&nosave=1&nopause=1');
  await page.waitForFunction(()=>window.__renderReady&&__renderReady(),null,{timeout:60000});
  const result=await page.evaluate(()=>__renderCompare());
  const output=process.env.DUMP||path.join(os.tmpdir(),'sluice-v27-render.json');
  for(const pic of result.pictures)fs.writeFileSync(output+'.'+pic.name+'.png',Buffer.from(pic.png.split(',')[1],'base64'));
  delete result.pictures;fs.writeFileSync(output,JSON.stringify(result,null,2));
  assert.equal(result.errors.length,0,result.errors.join('; '));
  console.log('PASS: '+result.reports.length+' old/new render comparisons; '+output);
}finally{await browser?.close();server.close();}
