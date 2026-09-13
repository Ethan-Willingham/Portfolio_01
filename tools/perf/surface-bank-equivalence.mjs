import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
// Compare the actual old/new paint commands in one browser and a frozen scene.
// Keep a separate contour limit: small texture resampling differences caused
// by changing clip type must never hide an altered edge or a seam at the split.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.DUMP||fs.mkdtempSync(path.join(os.tmpdir(),'sluice-bank-'));
assert(!path.resolve(out).startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const before=execFileSync('git',['show',(process.env.BASE_REF||'b1cb81c')+':js/sluice/140-render-maindraw.js'],{cwd:root,encoding:'utf8'});
function paintPart(s){const a=s.indexOf('// Underground bg'),b=s.indexOf("perfMark('render.undergroundBg'");assert(a>=0&&b>a);return s.slice(a,b);}
const oldPart=paintPart(before);
const probe=String.raw`
var bankOldPart=${JSON.stringify(oldPart)};
function bankPaintPart(s){return eval('(function(worldLeft,worldRight,worldTop,worldBottom){var surfaceY=SKY_ROWS*TILE;'+s+'})');}
window.__bankQA={ready:function(){return introPhase==='done';},run:function(){
 gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;
 var old=bankPaintPart(bankOldPart),rs=render.toString(),next=bankPaintPart(rs.slice(rs.indexOf('// Underground bg'),rs.indexOf("perfMark('render.undergroundBg'"))),rows=[],worst=0,images;
 Object.defineProperty(performance,'now',{value:function(){return 12000;},configurable:true});
 canvas.width=1280;canvas.height=720;
 for(var shake of [0,.37,-.63])for(var scale of [1,1.25,2.34,3.333333,5])for(var offset of [-100,5,180,700])for(var x of [0,849.375,6700.125]){
  dpr=1;worldScale=scale;screenW=canvas.width/scale;screenH=canvas.height/scale;cam.x=x;cam.y=SKY_ROWS*TILE-offset/scale;
  timeOfDay=x===0?.5:.02;
  var a,b;
  for(var which=0;which<2;which++){
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#80abc5';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.setTransform(scale,0,0,scale,-cam.x*scale+shake,-cam.y*scale-shake);
   (which?next:old)(cam.x,cam.x+screenW,cam.y,cam.y+screenH);
   if(which)b=ctx.getImageData(0,0,canvas.width,canvas.height).data;else a=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  }
  var over1=[],interiorMax=0,edgeMax=0;var max=0,n=0,sum=0;for(var i=0;i<a.length;i++){var diff=Math.abs(a[i]-b[i]);max=Math.max(max,diff);var ix=Math.floor(i/4)%canvas.width,iy=Math.floor(i/4/canvas.width);if(ix>0&&ix<canvas.width-1&&iy>0&&iy<canvas.height-1){interiorMax=Math.max(interiorMax,diff);if(iy<=offset+12*scale-shake+2)edgeMax=Math.max(edgeMax,diff);}if(diff>1&&over1.length<32)over1.push([Math.floor(i/4)%canvas.width,Math.floor(i/4/canvas.width),i%4,diff]);if(diff)n++;sum+=diff;}
  rows.push({shake:shake,interiorMax:interiorMax,edgeMax:edgeMax,scale:scale,offset:offset,x:x,max:max,channels:n,mean:sum/a.length,over1:over1});
  if(interiorMax>worst){worst=interiorMax;var ref=document.createElement('canvas');ref.width=canvas.width;ref.height=canvas.height;var rg=ref.getContext('2d'),rd=rg.createImageData(ref.width,ref.height);rd.data.set(a);rg.putImageData(rd,0,0);images={before:ref.toDataURL(),after:canvas.toDataURL(),case:rows[rows.length-1]};}
 }
 return {rows:rows,images:images};
}};`;
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(file.endsWith(path.sep+'sluice.js')){let s=data.toString(),i=s.lastIndexOf('})();');data=s.slice(0,i)+probe+s.slice(i);}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?nosave=1&nopause=1');
 await page.waitForFunction(()=>window.__bankQA?.ready(),undefined,{timeout:60000});
 const r=await page.evaluate(()=>__bankQA.run());fs.writeFileSync(path.join(out,'pixels.json'),JSON.stringify(r.rows,null,2));
 console.log(JSON.stringify({cases:r.rows.length,max:Math.max(...r.rows.map(x=>x.max)),interiorMax:Math.max(...r.rows.map(x=>x.interiorMax)),maxChangedChannels:Math.max(...r.rows.map(x=>x.channels)),errors,out}));
 if(r.images)for(const name of ['before','after'])fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.images[name].split(',')[1],'base64'));
 assert.equal(errors.length,0);assert(r.rows.every(x=>x.edgeMax<=1),'The bank contour stays within one 8-bit level');
 assert(r.rows.every(x=>x.interiorMax<=5),'Interior resampling differences stay within five 8-bit levels');
 assert(r.rows.every(x=>x.channels<1280*720*4*.02),'Fewer than 2% of channels differ');
 assert(r.rows.every(x=>x.mean<.02),'Differences stay below .02 levels averaged over the frame');
}finally{await browser.close();server.close();}
