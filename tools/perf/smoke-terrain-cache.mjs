// Compare collision coverage with the previous painter in real game geometry.
// Readback is intentional here, never part of a performance capture.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=execFileSync('git',['show',(process.env.BASE_REF||'4bcb99e')+':js/sluice/190-smoke-webgl.js'],{cwd:root,encoding:'utf8'});
const paint=base.slice(base.indexOf('  function smokeFluidPaintObstacle()'),base.indexOf('  // Hand the strongest downward water motion'));
assert(paint.startsWith('  function smokeFluidPaintObstacle()'));
const probe=`
var referenceTerrainPaint=(${paint});
window.__maskBoot=function(){return introPhase==='done';};
window.__maskTest=function(){
  if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=true;
  var reports=[], ow=768, oh=576, pixels=ow*oh, errors=[];
  var cv=document.createElement('canvas');cv.width=ow;cv.height=oh;
  smokeFluidObstacleCanvas=cv;smokeFluidObstacleCtx=cv.getContext('2d',{willReadFrequently:true});
  smokeFluidObstacleW=ow;smokeFluidObstacleH=oh;smokeFluidActive=true;isMobile=false;
  // Keep the real moving-body path separate from the static terrain bitmap.
  smokeDriver={setObstacleAlpha:function(){},setMovingBodies:function(){}};
  SMOKE_WATER_OBSTACLE=0;worldScale=targetWorldScale;
  function image(fn){fn();return smokeFluidObstacleCtx.getImageData(0,0,ow,oh).data;}
  function check(ok,message){if(!ok)errors.push(message);}
  function compare(label,expectExact){
    var a=image(referenceTerrainPaint),b=image(smokeFluidPaintObstacle);
    var sum=0,max=0,changed=0,far=0,farPixels=[];
    for(var y=0;y<oh;y++)for(var x=0;x<ow;x++){
      var i=(y*ow+x)*4+3,d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);
      if((a[i]>=128)!==(b[i]>=128)){
        changed++;var near=false;
        for(var dy=-2;dy<=2&&!near;dy++)for(var dx=-2;dx<=2;dx++){
          var xx=x+dx,yy=y+dy;if(xx<0||xx>=ow||yy<0||yy>=oh)continue;
          if((a[(yy*ow+xx)*4+3]>=128)===(b[i]>=128)){near=true;break;}
        }
        // At the image border the matching boundary can lie outside the
        // readback. Enforce distance only where the full neighbourhood exists;
        // border pixels still count toward total coverage and alpha error.
        if(!near&&x>=2&&x<ow-2&&y>=2&&y<oh-2){far++;if(farPixels.length<10)farPixels.push({x:x,y:y,old:a[i],now:b[i]});}
      }
    }
    var result={label,meanAlphaError:sum/pixels,maxAlphaError:max,changedCoveragePercent:changed/pixels*100,farChanges:far,farPixels:farPixels,builds:smokeTerrainMaskBuilds};
    reports.push(result);
    // Subpixel resampling may change antialias coverage. Never accept a new
    // opening/blocker more than two destination texels from the old boundary.
    check(far===0,label+': coverage moved away from the old boundary');
    check(changed/pixels<.0025,label+': more than 0.25% changed solid classification');
    check(sum/pixels<3,label+': mean alpha error exceeded 3/255');
    if(expectExact)check(max===0,label+': direct fallback changed pixels');
    return b;
  }
  function freshEquivalent(label){
    var warm=image(smokeFluidPaintObstacle);smokeTerrainMask=null;
    var fresh=image(smokeFluidPaintObstacle),max=0;
    for(var i=3;i<warm.length;i+=4)max=Math.max(max,Math.abs(warm[i]-fresh[i]));
    check(max===0,label+': cached coverage differs from a fresh rebuild');
    reports.push({label,cacheMaxError:max});
  }
  var sites=[[4300,-300],[4300.25,-299.6],[4600,-100],[6100,-150],[7000,-200],[-32,0],[COLS*TILE-smokeFluidDomainWorldW+32,0],[4800,SKY_ROWS*TILE+320],[4800,SKY_ROWS*TILE+1250],[4800,SKY_ROWS*TILE+3500]];
  for(var j=0;j<sites.length;j++){cam.x=sites[j][0];cam.y=sites[j][1];compare('world '+j);freshEquivalent('world cache '+j);}
  cam.x=4300;cam.y=-300;image(smokeFluidPaintObstacle);var before=smokeTerrainMaskBuilds;
  for(var j=0;j<12;j++){cam.x+=.125;cam.y+=.125;image(smokeFluidPaintObstacle);}
  check(smokeTerrainMaskBuilds===before,'Fractional camera travel rebuilt the static mask');
  var r=SKY_ROWS+2,c=Math.floor((cam.x+smokeFluidDomainWorldW*.5)/TILE);
  world[r][c]=null;compare('direct excavation');freshEquivalent('excavation invalidation');
  world[r][c]={type:'foundation',hp:99};compare('direct foundation edit');freshEquivalent('material invalidation');
  WOBBLE_AMP_LOW+=.75;compare('contour tuning');freshEquivalent('contour invalidation');
  worldScale=targetWorldScale*1.01;compare('zoom in progress',true);worldScale=targetWorldScale;
  smokeFluidDomainWorldW*=.72;smokeFluidDomainWorldH*=.72;compare('new zoom scale');freshEquivalent('scale invalidation');
  // Include water density and the legacy ring painter in the same composite.
  smokeFluidDomainWorldW/=.72;smokeFluidDomainWorldH/=.72;
  cam.x=4300;cam.y=SKY_ROWS*TILE-150;
  // Deterministic nonempty water and deforming-body fixtures in this view.
  var wx=cam.x-smokeFluidMarginWorldX+smokeFluidDomainWorldW*.5;
  var wy=cam.y-smokeFluidMarginWorldY+smokeFluidDomainWorldH*.35;
  liquidCount=1200;liquidX=new Float32Array(liquidCount);liquidY=new Float32Array(liquidCount);
  liquidVY=new Float32Array(liquidCount);liquidFrozen=new Uint8Array(liquidCount);
  for(var j=0;j<liquidCount;j++){liquidX[j]=wx+(j%40);liquidY[j]=wy+Math.floor(j/40);}
  liquidMutationSeq++;SMOKE_WATER_OBSTACLE=1;
  var water=image(smokeFluidPaintObstacle);SMOKE_WATER_OBSTACLE=0;var dry=image(smokeFluidPaintObstacle);
  check(water.some(function(v,i){return i%4===3&&v!==dry[i];}),'Water fixture must contribute visible coverage');
  SMOKE_WATER_OBSTACLE=1;compare('water coverage');freshEquivalent('water plus cached terrain');
  smokeDriver.setMovingBodies=null;
  jelloBodies=[{ringN:4,ring:[0,1,2,3],px:[wx-80,wx-40,wx-35,wx-85],py:[wy-60,wy-63,wy-20,wy-25],bboxL:wx-85,bboxR:wx-35,bboxT:wy-63,bboxB:wy-20}];
  var body=image(smokeFluidPaintObstacle);jelloBodies=[];var empty=image(smokeFluidPaintObstacle);
  check(body.some(function(v,i){return i%4===3&&v!==empty[i];}),'Body fixture must contribute visible coverage');
  jelloBodies=[{ringN:4,ring:[0,1,2,3],px:[wx-80,wx-40,wx-35,wx-85],py:[wy-60,wy-63,wy-20,wy-25],bboxL:wx-85,bboxR:wx-35,bboxT:wy-63,bboxB:wy-20}];
  compare('legacy body coverage');
  return {reports,errors,builds:smokeTerrainMaskBuilds};
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
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-webgpu','--use-angle=d3d11'],env:{...process.env}});
  const page=await browser.newPage({viewport:{width:1798,height:954},deviceScaleFactor:1.25});
  await page.addInitScript(initial=>{let seed=initial;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);},Number(process.env.SEED||48271));
  await page.route(/googletagmanager|google-analytics/,route=>route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?dev=1&nosave=1&nopause=1');
  await page.waitForFunction(()=>window.__maskBoot&&__maskBoot(),null,{timeout:60000});
  const result=await page.evaluate(()=>__maskTest());
  const output=process.env.DUMP||path.join(os.tmpdir(),'sluice-p6-mask-coverage.json');
  fs.writeFileSync(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  assert.equal(result.errors.length,0,result.errors.join('; '));
  console.log('PASS: '+result.reports.length+' terrain mask checks; '+output);
}finally{if(browser)await browser.close();server.close();}
