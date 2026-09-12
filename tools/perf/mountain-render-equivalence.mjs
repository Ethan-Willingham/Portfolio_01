import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const file='js/sluice/160-render-mountains.js';
const before=execFileSync('git',['show',(process.env.BASE_REF||'6e974eb')+':'+file],{cwd:root,encoding:'utf8'});
const after=fs.readFileSync(path.join(root,file),'utf8');
const gpu=process.env.CANVAS_ONLY==='1'?'':fs.readFileSync(path.join(root,'js/sluice/162-render-mountains-webgl.js'),'utf8');
const hash=fs.readFileSync(path.join(root,'js/sluice/100-render-terrain.js'),'utf8').match(/  function tileHash01[\s\S]*?\n  }/)[0];
const modulePath=process.env.PLAYWRIGHT_MODULE;
assert(modulePath,'Set PLAYWRIGHT_MODULE to playwright/index.mjs');
const {chromium}=await import(modulePath.startsWith('file:')?modulePath:pathToFileURL(modulePath));
const dump=process.env.DUMP||fs.mkdtempSync(path.join(os.tmpdir(),'sluice-mountain-'));
assert(!path.resolve(dump).startsWith(root+path.sep));fs.mkdirSync(dump,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=d3d11']});
try{
  const page=await browser.newPage();
  const result=await page.evaluate(({before,after,hash,gpu,supersample})=>{
    function make(source){return eval(`(function(){var ctx,cam,canvas,screenW,dpr=1,worldScale,TILE=32,SKY_ROWS=4,performance={now:function(){return 1234;}},BG=new Proxy({},{get:function(){return '#8894a6';}});function nightSkyHexRGB(h){return {r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}${hash}\n${source}\nif(typeof MTN_GPU_SUPERSAMPLE!=='undefined')MTN_GPU_SUPERSAMPLE=${supersample};updateMountainLight=function(){};mountainColors=function(c){return {fill:'rgb(68,73,87)',snow:c.snowColor&&'rgb(186,202,219)',rim:c.rimColor&&'rgb(116,125,143)',left:c.moonRimColor&&'rgb(88,97,116)',right:c.moonRimColor&&'rgb(95,100,112)',snowLeft:c.snowColor&&'rgb(197,207,222)',snowRight:c.snowColor&&'rgb(158,171,192)'};};return function(target,o){ctx=target;canvas=ctx.canvas;worldScale=o.scale;cam={x:o.x,y:128-o.h*.78/o.scale};screenW=o.w/o.scale;ctx.setTransform(o.scale,0,0,o.scale,-o.x*o.scale,-cam.y*o.scale);drawSkyMountains(0,screenW,128);return typeof mtnGPU!=='undefined'?{active:!!mtnGPU&&!mtnGPUFailed,failed:mtnGPUFailed}:null;};})()`);}
    const old=make(before),next=make(after+'\n'+gpu),a=document.createElement('canvas'),b=document.createElement('canvas');
    const ga=a.getContext('2d'),gb=b.getContext('2d'),rows=[];let worst=0,images;
    for(const scale of [1,1.25,2.34,3.333333,5])for(const x of [0,137.125,849.3,1742.875,3210.01,6700.4]){
      const o={x,scale,w:1280,h:720};a.width=b.width=o.w;a.height=b.height=o.h;
      for(const g of [ga,gb]){g.fillStyle='#93b8cc';g.fillRect(0,0,o.w,o.h);}
      old(ga,o);const backend=next(gb,o);
      const p=ga.getImageData(0,0,o.w,o.h).data,q=gb.getImageData(0,0,o.w,o.h).data;
      let max=0,changed=0,over8=0,sum=0,interior=0;
      for(let i=0;i<p.length;i+=4){let d=0;for(let k=0;k<3;k++)d=Math.max(d,Math.abs(p[i+k]-q[i+k]));if(d)changed++;if(d>8)over8++;max=Math.max(max,d);sum+=d;
        if(d>2){const x=(i/4)%o.w,y=Math.floor(i/4/o.w);let edge=false;for(let yy=Math.max(0,y-2);yy<=Math.min(o.h-1,y+2)&&!edge;yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(o.w-1,x+2)&&!edge;xx++)for(let k=0;k<3;k++)if(Math.abs(p[(yy*o.w+xx)*4+k]-p[i+k])>2){edge=true;break;}if(!edge)interior++;}
      }
      rows.push({...o,max,changed,over8,interior,backend,mean:sum/(o.w*o.h)});
      if(over8>worst){worst=over8;images={before:a.toDataURL(),after:b.toDataURL(),case:o};}
    }
    return {rows,images};
  },{before,after,hash,gpu,supersample:Number(process.env.SUPERSAMPLE||1)});
  fs.writeFileSync(path.join(dump,'pixels.json'),JSON.stringify(result.rows,null,2));
  if(result.images)for(const key of ['before','after'])fs.writeFileSync(path.join(dump,key+'.png'),Buffer.from(result.images[key].split(',')[1],'base64'));
  console.log(JSON.stringify({cases:result.rows.length,max:Math.max(...result.rows.map(r=>r.max)),maxChanged:Math.max(...result.rows.map(r=>r.changed)),maxOver8:Math.max(...result.rows.map(r=>r.over8)),maxInterior:Math.max(...result.rows.map(r=>r.interior)),gpuActive:result.rows.every(r=>r.backend?.active),worst:result.images?.case,dump}));
  assert(result.rows.every(r=>r.interior===0),'No color or coverage changes away from existing edges');
  assert(result.rows.every(r=>r.changed<r.w*r.h*.03),'Edge differences remain a small fraction of the image');
  if(gpu)assert(result.rows.every(r=>r.backend?.active),'Compare the GPU path, not a silent fallback');
}finally{await browser.close();}
