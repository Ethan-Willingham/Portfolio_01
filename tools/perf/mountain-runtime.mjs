import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const probe=String.raw`
window.__mtnQA={
 ready:function(){return introPhase==='done';},
 sweep:function(){
   gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;
   var changes=0,previous='',first=true;SUN.paused=true;
   for(var i=0;i<240;i++){
     cam.x=1500+i*1.234;cam.y=-220+i*1.4;timeOfDay=i/239;
     ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
     updateAtmosCacheGL();var scale=dpr*worldScale;
     ctx.setTransform(scale,0,0,scale,-cam.x*scale+.23,-cam.y*scale+.17);
     drawSkyMountains(cam.x,cam.x+screenW,SKY_ROWS*TILE);
     if(mtnGPUFailed||!mtnGPU)throw Error('GPU fallback during sweep');
     var size=mtnGPU.canvas.width+'x'+mtnGPU.canvas.height;
     if(size!==previous){changes++;previous=size;}
   }
   return {changes:changes,size:previous,layers:Object.keys(mtnGPU.layers).length,error:mtnGPU.gl.getError()};
 },
 draw:function(){ctx.setTransform(dpr*worldScale,0,0,dpr*worldScale,-cam.x*dpr*worldScale,-cam.y*dpr*worldScale);drawSkyMountains(cam.x,cam.x+screenW,SKY_ROWS*TILE);return {gpu:!!mtnGPU&&!mtnGPUFailed,failed:mtnGPUFailed};},
 lose:function(){window.__mtnLoss=mtnGPU.gl.getExtension('WEBGL_lose_context');__mtnLoss.loseContext();},
 restore:function(){__mtnLoss.restoreContext();},
 fallback:function(){MTN_GPU_ENABLED=false;return this.draw();}
};`;
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(file.endsWith(path.sep+'sluice.js')){let s=data.toString(),i=s.lastIndexOf('})();');data=s.slice(0,i)+probe+s.slice(i);}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
try{
  const page=await browser.newPage({viewport:{width:2048,height:1152},deviceScaleFactor:1.25});const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?dev=1&nosave=1&nopause=1');
  await page.waitForFunction(()=>window.__mtnQA?.ready(),undefined,{timeout:60000});
  const sweep=await page.evaluate(()=>__mtnQA.sweep());assert.equal(sweep.error,0);assert.equal(sweep.layers,4);assert(sweep.changes<18,'Reuse buffers during vertical flight');
  await page.evaluate(()=>__mtnQA.lose());await page.waitForTimeout(100);
  assert.equal((await page.evaluate(()=>__mtnQA.draw())).gpu,false,'Canvas fallback on lost context');
  await page.evaluate(()=>__mtnQA.restore());await page.waitForFunction(()=>__mtnQA.draw().gpu,undefined,{timeout:10000});
  assert.equal((await page.evaluate(()=>__mtnQA.fallback())).gpu,true,'Disabled GPU retains its cache');
  assert.equal(await page.evaluate(()=>gm.get('perf.mountainGPU')),0,'A/B toggle controls fallback');
  assert.deepEqual(errors,[]);console.log('PASS vertical/day-night sweep, bounded buffers, context loss/restore and Canvas fallback '+JSON.stringify(sweep));
}finally{await browser.close();server.close();}
