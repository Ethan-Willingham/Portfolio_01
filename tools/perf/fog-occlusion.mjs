// Verify hidden-terrain rejection against real fog pixels and chunk artwork.
// Readbacks belong in this correctness test, never in performance captures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const probe=String.raw`
window.__fogReady=function(){return introPhase==='done';};
window.__fogTest=function(){
  gamePaused=true;cancelAnimationFrame(gameRafId);gameRafId=0;
  var reports=[],errors=[],covered=lightFogFullyCovers,oldCtx=ctx;
  function check(ok,msg){if(!ok)errors.push(msg);}
  var cv=document.createElement('canvas');ctx=cv.getContext('2d',{willReadFrequently:true});
  var dims=[[1035,1663,1.2],[2560,1440,2.67],[390,844,.65]];
  function compare(label,settings,site,sentinels){
    cv.width=settings[0];cv.height=settings[1];dpr=1;worldScale=targetWorldScale=settings[2];
    viewW=cv.width;viewH=cv.height;screenW=cv.width/worldScale;screenH=cv.height/worldScale;
    cam.x=site[0];cam.y=site[1];syncTerrainChunkRenderScale();
    var sr=Math.max(0,Math.floor(cam.y/TILE)),er=Math.min(TOTAL_ROWS-1,Math.floor((cam.y+screenH)/TILE));
    var sc=Math.max(0,Math.floor(cam.x/TILE)),ec=Math.min(COLS-1,Math.floor((cam.x+screenW)/TILE));
    terrainChunkRebuildBoostFrames=1;
    function paint(cull){
      lightFogFullyCovers=cull?covered:function(){return false;};
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#605040';ctx.fillRect(0,0,cv.width,cv.height);
      ctx.setTransform(worldScale,0,0,worldScale,-cam.x*worldScale,-cam.y*worldScale);
      terrainHiddenChunks=0;prepareDarknessOverlay(sr,er,sc,ec);
      drawTerrainChunks(sr,er,sc,ec);
      var tiles=0;
      if(sentinels){
        // A deliberately oversized tile decoration tests the conservative
        // margin independently of the production ore drawing implementation.
        ctx.fillStyle='#e040e0';
        for(var r=sr;r<=er;r++)for(var c=sc;c<=ec;c++){
          if(!covered(r,r,c,c))continue;
          tiles++;
          if(!cull)ctx.fillRect((c-1)*TILE,(r-1)*TILE,TILE*3,TILE*3);
        }
      }
      drawDarknessOverlay(sr,er,sc,ec);
      return {pixels:ctx.getImageData(0,0,cv.width,cv.height).data,chunks:terrainHiddenChunks,tiles:tiles};
    }
    paint(false);paint(false); // Warm the same chunks before both captures.
    var a=paint(false),b=paint(true),max=0,n=0;
    for(var i=0;i<a.pixels.length;i++){var d=Math.abs(a.pixels[i]-b.pixels[i]);if(d){n++;max=Math.max(max,d);}}
    reports.push({label,dimensions:settings,site:site,changedChannels:n,maxDifference:max,hiddenChunks:b.chunks,hiddenTiles:b.tiles});
    check(max===0,label+': changed visible pixels ('+n+' channels, max '+max+')');
    return b;
  }
  try{
    perfDisplayKey='first';perfFpsCap=144;perfFrameSamples=[1,2];perfIntervalRingFilled=2;
    perfObserveDisplay('first');check(perfFpsCap===144,'Same display must retain reference');
    perfObserveDisplay('second');check(perfFpsCap===0&&perfFrameSamples.length===0&&perfIntervalRingFilled===0,'Moving displays must discard old callback reference');
    for(var d=0;d<dims.length;d++){
      compare('surface '+d,dims[d],[4300.25,-360.3],false);
      compare('surface decorations '+d,dims[d],[5100.7,-230.2],true);
      compare('sealed cave '+d,dims[d],[4300.25,1000.4],true);
    }
    // Opening a shaft must invalidate visibility before terrain is rejected.
    var cc=150;for(var rr=SKY_ROWS;rr<SKY_ROWS+22;rr++){world[rr][cc]=null;lightingOnClear(rr,cc);}
    compare('new shaft',dims[0],[cc*TILE-350.3,120.5],true);
    var rev=lightRev;lightRev++;
    check(!covered(SKY_ROWS+30,SKY_ROWS+35,cc,cc+4),'Stale visibility must not cull');lightRev=rev;
    lightTune.reach=4.5;compare('wide light reach',dims[0],[cc*TILE-350.3,120.5],true);
    lightTune.soft=0;compare('crisp fog',dims[0],[cc*TILE-350.3,120.5],true);lightTune.soft=1;
    for(var alpha of [0,.5,.999,1]){lightTune.darkAlpha=alpha;var b=compare('opacity '+alpha,dims[0],[4300.25,-360.3],false);if(alpha<1)check(b.chunks===0,'Translucent fog must not cull');}
    lightTune.enabled=0;check(compare('lighting disabled',dims[0],[4300.25,-360.3],false).chunks===0,'Disabled fog must not cull');lightTune.enabled=1;
    for(var edge of [[-100.3,50],[COLS*TILE-400.7,50],[4300.2,TOTAL_ROWS*TILE-400]]){
      check(compare('hard world edge '+edge,dims[0],edge,false).chunks===0,'Hard world edges retain the direct draw');
    }
    var phase=introPhase;introPhase='warming';check(!covered(30,40,140,150),'Loading must keep warming hidden chunks');introPhase=phase;
    check(reports.some(function(r){return r.hiddenChunks>0;}),'Fixture must reject real hidden chunks');
    check(reports.some(function(r){return r.hiddenTiles>0;}),'Fixture must reject hidden tile decorations');
    return {reports:reports,errors:errors};
  }finally{ctx=oldCtx;lightFogFullyCovers=covered;}
};
`;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4'};
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
  await page.addInitScript(initial=>{let seed=initial;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);},Number(process.env.SEED||48271));
  await page.route(/googletagmanager|google-analytics/,route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?dev=1&nosave=1&nopause=1');
  await page.waitForFunction(()=>window.__fogReady&&__fogReady(),null,{timeout:60000});
  const result=await page.evaluate(()=>__fogTest());
  const output=process.env.DUMP||path.join(os.tmpdir(),'sluice-p7-fog-coverage.json');
  fs.writeFileSync(output,JSON.stringify(result,null,2));
  assert.equal(result.errors.length,0,result.errors.join('; '));
  console.log('PASS: '+result.reports.length+' pixel comparisons; '+output);
}finally{if(browser)await browser.close();server.close();}
