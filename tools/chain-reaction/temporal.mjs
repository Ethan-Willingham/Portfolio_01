import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {serve, browserRun} from './browser.mjs';
import {toolLock} from './core.mjs';

// Freeze the bodies and grain to isolate rendering from legitimate motion.
// Two shutter samples of a stationary scene must preserve its occlusion.
const require=createRequire(import.meta.url),sharp=require(process.env.CHAIN_REACTION_SHARP);
const folder=resolve(process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest');
await mkdir(folder,{recursive:true});
const release=await toolLock(),server=await serve(),rows=[];
const fixture='<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas id="scene"></canvas><script src="/js/vendor/three-r128.min.js"></script><script src="/js/chain-reaction-materials.js"></script><script src="/js/chain-reaction-renderer.js"></script>';
async function difference(a,b){
 const x=await sharp(a).removeAlpha().raw().toBuffer(),y=await sharp(b).removeAlpha().raw().toBuffer();
 assert.equal(x.length,y.length);let total=0,maximum=0,changed=0;
 for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);total+=d;maximum=Math.max(maximum,d);if(d>2)changed++;}
 return {mean:total/x.length,maximum,changedFraction:changed/x.length};
}
try{
 for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
  for(const [name,width,height] of [['desktop',1440,900],['landscape',844,390],['portrait',390,844]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/camera-test.html',route=>route.fulfill({contentType:'text/html',body:fixture}));
   await page.goto(server.url+'/camera-test.html');
   await page.evaluate(async()=>{
    const index=await fetch('/assets/chain-reaction/index.json').then(r=>r.json());
    const definitions=await Promise.all(index.stages.map(s=>fetch('/assets/chain-reaction/stages/'+s.file).then(r=>r.json())));
    window.view=ChainReaction.makeView(document.getElementById('scene'),definitions);
    definitions.forEach((d,i)=>view.apply(i,d.verified.armed.map(p=>({...p,vx:0,vy:0,spin:0}))));
   });
   for(const framing of [{x:8.9,y:3.25,width:11.2,minHeight:6.7},{x:24,y:4,width:28,minHeight:10},{x:24,y:4,width:54,minHeight:10}]){
    await page.evaluate(c=>{view.setCamera(c);view.draw(0,false,0,false);},framing);
    const single=await page.locator('canvas').screenshot();
    await page.evaluate(()=>view.draw(0,false,0,true));
    const shutter=await page.locator('canvas').screenshot(),delta=await difference(single,shutter);
    rows.push({engine,profile:name,framing,check:'stationary shutter occlusion',delta,pass:delta.maximum<=2});
    if(engine==='chromium'&&name==='desktop'){
     await writeFile(resolve(folder,'static-'+framing.width+'.png'),single);
     await writeFile(resolve(folder,'shutter-'+framing.width+'.png'),shutter);
    }
   }
   // Travel through both reveal flights and back with an unchanged scene.
   // Returning to the exact framing must not retain a changed light or shadow state.
   const home={x:8.9,y:3.25,width:11.2,minHeight:6.7};
   await page.evaluate(c=>{view.setCamera(c);view.draw(0,false,0,true);},home);
   const before=await page.locator('canvas').screenshot();
   await page.evaluate(()=>{for(let n=0;n<=120;n++){const u=n<=60?n/60:(120-n)/60,s=u*u*u*(10+u*(-15+6*u));view.setCamera({x:8.9+15.1*s,y:3.25+.75*s,width:11.2*Math.exp(Math.log(54/11.2)*s),minHeight:6.7*Math.exp(Math.log(10/6.7)*s)});view.draw(0,false,0,true);}});
   const after=await page.locator('canvas').screenshot(),delta=await difference(before,after);
   rows.push({engine,profile:name,check:'zoom round trip',frames:121,delta,pass:delta.maximum<=2});
   assert.deepEqual(errors,[]);await page.evaluate(()=>view.dispose());await page.close();
  }
 });
 await writeFile(resolve(folder,'temporal'+(process.env.CHAIN_REACTION_BASELINE?'-before':'')+'.json'),JSON.stringify(rows,null,2)+'\n');
 console.log(JSON.stringify(rows.map(r=>({engine:r.engine,profile:r.profile,check:r.check,width:r.framing?.width,...r.delta,pass:r.pass})),null,2));
 if(!process.env.CHAIN_REACTION_BASELINE)assert(rows.every(r=>r.pass),'Stationary scene changes between shutter passes or zoom round trips');
}finally{await server.close();await release();}
