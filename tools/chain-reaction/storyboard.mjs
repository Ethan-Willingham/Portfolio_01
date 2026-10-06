import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,physics,moduleURL,hash,toolLock} from './core.mjs';
import {serve,browserRun} from './browser.mjs';
import {sampleCamera} from './camera.mjs';

// Exact physics ticks rendered on request, without a page animation loop.
// All images and detailed pose traces stay in the local research repository.
const require=createRequire(import.meta.url),sharp=require(process.env.CHAIN_REACTION_SHARP);
const folder=resolve(process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest','storyboards');
await mkdir(folder,{recursive:true});
const release=await toolLock(),server=await serve(),reports=[];
const definitions=await Promise.all([1,2,3].map(n=>readFile(resolve(ROOT,'assets/chain-reaction/stages/'+String(n).padStart(5,'0')+'.json')).then(JSON.parse)));
const histories=[];
const fixture='<!doctype html><link rel="stylesheet" href="/style.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas id="scene"></canvas><script src="/js/vendor/three-r128.min.js"></script><script src="/js/chain-reaction-materials.js"></script><script src="/js/chain-reaction-renderer.js"></script>';
async function sheet(images,columns,cellWidth){
 const thumbs=await Promise.all(images.map(bytes=>sharp(bytes).resize({width:cellWidth}).png().toBuffer()));
 const info=await sharp(thumbs[0]).metadata(),rows=Math.ceil(thumbs.length/columns);
 return sharp({create:{width:cellWidth*columns,height:info.height*rows,channels:3,background:'#303931'}}).composite(thumbs.map((input,i)=>({input,left:i%columns*cellWidth,top:Math.floor(i/columns)*info.height}))).png().toBuffer();
}
try{
 for(const d of definitions){
  const sim=await physics.create(d,moduleURL),poses=[sim.state()];
  try{for(let n=0;n<d.verified.canonicalExit.tick;n++){sim.step();poses.push(sim.state());}assert.equal(hash(sim.snapshot()),d.verified.stateHash);histories.push(poses);}finally{sim.dispose();}
 }
 await browserRun('chromium',async browser=>{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/storyboard-test.html',r=>r.fulfill({contentType:'text/html',body:fixture}));
  await page.goto(server.url+'/storyboard-test.html');
  await page.evaluate(async ds=>{await document.fonts.ready;window.definitions=ds;window.view=ChainReaction.makeView(document.getElementById('scene'),ds);},definitions);
  async function frame(index,time,{reveal=false,fixed=false,label=true,framing=null}={}){
   const d=definitions[index],tick=Math.max(0,Math.min(histories[index].length-1,Math.round(time*240))),states=histories[index][tick];
   const c=framing|| (fixed?{x:8,y:4.5,width:17.5,minHeight:9.7}:sampleCamera(reveal&&d.verified.camera.revealNodes?d.verified.camera.revealNodes:d.verified.camera.nodes,tick/240));
   await page.evaluate(({index,states,c,time,label,offset})=>{
    definitions.forEach((d,i)=>{view.apply(i,i<index?d.verified.spent:d.verified.armed);view.hideHero(i,i<index);view.hideEntry(i,i>index);});
    view.apply(index,states,offset);view.setCamera({...c,x:c.x+index*16});view.draw(0,false,time,true);
    if(label){const tag=document.createElement('canvas');tag.width=480;tag.height=48;const ctx=tag.getContext('2d');ctx.font='16px "Commit Mono"';ctx.fillStyle='#e8e2d6';ctx.fillText('Stage '+(index+1)+'  '+time.toFixed(3)+' s',12,30);let badge=document.getElementById('stamp');if(badge)badge.remove();tag.id='stamp';tag.style.cssText='position:fixed;left:0;top:0;width:480px;height:48px;pointer-events:none';document.body.append(tag);}else document.getElementById('stamp')?.remove();
   },{index,states,c,time:tick/240,label,offset:index?histories[index-1].at(-1).find(p=>p.id===definitions[index-1].exitId).angle:0});
   return {bytes:await page.screenshot(),tick,time:tick/240,framing:c,states};
  }
  for(let index=0;index<definitions.length;index++){
   const d=definitions[index],end=d.verified.duration,base=String(index+1).padStart(5,'0'),keyTimes=new Set([0,end]);
   d.verified.steps.forEach(s=>keyTimes.add((s.kind==='contact'?s.contactTick:s.motionTick)/240));
   d.beats.forEach(b=>keyTimes.add(b.time));
   for(let n=1;keyTimes.size<12;n++)keyTimes.add(end*n/12);
   const keys=[...keyTimes].sort((a,b)=>a-b).slice(0,12);if(keys.at(-1)!==end)keys[keys.length-1]=end;
   const keyFrames=[];for(const t of keys)keyFrames.push((await frame(index,t)).bytes);
   await writeFile(resolve(folder,base+'-events.png'),await sheet(keyFrames,4,480));
   const timeline=[],times=[];for(let t=0;t<end;t+=.5){const f=await frame(index,t);timeline.push(f.bytes);times.push(f.time);}
   timeline.push((await frame(index,end)).bytes);times.push(end);
   await writeFile(resolve(folder,base+'-timeline.png'),await sheet(timeline,4,360));
   const strips={};
   for(const [name,center] of [['payoff',d.beats.find(b=>b.kind==='payoff').time],['handoff',end]]){
    const images=[],ticks=[];
    for(let n=0;n<16;n++){
     const t=center+(n-8)/30,after=t>end&&index+1<definitions.length;
     const f=await frame(after?index+1:index,after?t-end:Math.min(t,end));images.push(f.bytes);ticks.push({stage:after?index+2:index+1,tick:f.tick});
    }
    await writeFile(resolve(folder,base+'-'+name+'.png'),await sheet(images,8,300));strips[name]=ticks;
   }
   // Maximum-light integration at a fixed camera reveals swept surfaces.
   const exposures=[];for(let t=0;t<=end;t+=1/15)exposures.push((await frame(index,t,{fixed:true,label:false})).bytes);
   const exposure=await sharp(exposures[0]).composite(exposures.slice(1).map(input=>({input,blend:'lighten'}))).png().toBuffer();
   await writeFile(resolve(folder,base+'-exposure.png'),exposure);
   const cropTime=d.beats.find(b=>b.kind==='payoff').time,cropStates=histories[index][Math.round(cropTime*240)].filter(p=>d.path.includes(p.id)).slice(0,3);
   for(let n=0;n<cropStates.length;n++){const p=cropStates[n],close=await frame(index,cropTime,{label:false,framing:{x:p.x,y:p.y,width:3,minHeight:2}});await sharp(close.bytes).extract({left:600,top:330,width:240,height:240}).png().toFile(resolve(folder,base+'-crop-'+(n+1)+'.png'));}
   const metrics=await page.evaluate(()=>view.metrics());
   reports.push({stage:index+1,sourceHash:d.verified.sourceHash,physicsHash:d.verified.stateHash,keyTimes:keys,timelineTimes:times,strips,exposure:{frames:exposures.length,mode:'maximum-light',fixedFraming:true},crops:{count:cropStates.length,devicePixelsPerOutputPixel:1,framing:{width:3,minHeight:2}},metrics});
  }
  // The automatic reveal is also captured at exact half-second intervals.
  for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>view.resize());
   const images=[];for(let t=0;t<=7;t+=.5)images.push((await frame(0,t,{reveal:true})).bytes);
   await writeFile(resolve(folder,'reveal-'+viewport.width+'.png'),await sheet(images,3,Math.min(480,viewport.width)));
  }
  assert.deepEqual(errors,[]);await page.evaluate(()=>view.dispose());await page.close();
 });
 const renderHash=hash(Buffer.concat(await Promise.all(['js/chain-reaction-renderer.js','js/chain-reaction-materials.js'].map(p=>readFile(resolve(ROOT,p))))));
 await writeFile(resolve(folder,'index.json'),JSON.stringify({pass:true,renderHash,physicsHz:240,raf:false,stages:reports},null,2)+'\n');
 console.log('PASS: three exact-tick event boards, half-second timelines, payoff and handoff strips, swept-surface exposures, nine device-pixel crops and three reveal sheets');
}finally{await server.close();await release();}
