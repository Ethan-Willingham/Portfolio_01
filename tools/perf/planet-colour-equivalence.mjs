import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const before=execFileSync('git',['show',(process.env.BASE_REF||'6389e98')+':js/sluice/156-render-planet.js'],{cwd:root,encoding:'utf8'});
const oldColour=before.slice(before.indexOf('  function colourPlanetSurface'),before.indexOf('  function drawPlanetSurface')).replace('function colourPlanetSurface(', 'function planetReferenceColour(');
assert(oldColour.includes('for (var channel'));
const candidate=process.env.EXPERIMENT?fs.readFileSync(process.env.EXPERIMENT,'utf8'):'';
const probe=String.raw`
${oldColour}
${candidate}
window.__planetQA={ready:function(){return introPhase==='done';},run:function(){
 gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;
 var checks=0,max=0;
 for(var size of [[800,450],[2248,1193],[2560,1440]]){
  var P=buildPlanetSurface(size[0],size[1]);
  for(var time of [0,.22,.5,.69,.74,.81,1])for(var phase of [0,.25,.5,.75]){
   timeOfDay=time;moonPhase=phase;updateAtmosCacheGL();P.lightKey='';planetReferenceColour(P);
   var expected=P.img.data.slice();P.lightKey='';colourPlanetSurface(P);
   for(var i=0;i<expected.length;i++)max=Math.max(max,Math.abs(expected[i]-P.img.data[i]));
   checks++;
  }
 }
 return {checks:checks,maxChannelDifference:max};
}};`;
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(file.endsWith(path.sep+'sluice.js')){let s=data.toString(),i=s.lastIndexOf('})();');data=s.slice(0,i)+probe+s.slice(i);}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?nosave=1&nopause=1');
 await page.waitForFunction(()=>window.__planetQA?.ready(),undefined,{timeout:60000});
 const result=await page.evaluate(()=>__planetQA.run());assert.equal(result.maxChannelDifference,0);assert.equal(result.checks,84);assert.deepEqual(errors,[]);
 console.log('PASS exact planet RGBA equality '+JSON.stringify(result));
}finally{await browser.close();server.close();}
