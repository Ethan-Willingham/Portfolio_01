import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {serve,browserRun} from './browser.mjs';
import {ROOT,toolLock,hash} from './core.mjs';
const folder=resolve(process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest');await mkdir(folder,{recursive:true});
const unlock=await toolLock(),server=await serve(),rows=[];
let source=await readFile(process.env.CHAIN_REACTION_RENDERER_FIXTURE||resolve(ROOT,'js/chain-reaction-renderer.js'),'utf8');const sourceHash=hash(source);
// Fixture-only identity tags associate real rendered meshes with their physical cells.
// They do not change positions, matrices, geometry, materials or draw order.
for(const [before,after] of [["g.rotation.z=p.angle||0;group.add(g);","g.rotation.z=p.angle||0;g.userData.partId=p.id;group.add(g);"],["for(const c of p.colliders||","let physicalCellIndex=0;for(const c of p.colliders||"],["m.rotation.z=c.angle||0;","m.userData.cellIndex=physicalCellIndex++;m.rotation.z=c.angle||0;"]]){assert(source.includes(before),'Renderer probe fragment changed');source=source.replace(before,after);}
const fixture='<!doctype html><style>html,body{margin:0;width:100%;height:100%}canvas{width:100%;height:100%;display:block}</style><canvas id="scene"></canvas><script src="/js/vendor/three-r128.min.js"></script><script src="/js/chain-reaction-physics.js"></script><script src="/js/chain-reaction-materials.js"></script><script src="/js/chain-reaction-renderer.js"></script>';
try{
 for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route('**/js/chain-reaction-renderer.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.route('**/alignment-test.html',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto(server.url+'/alignment-test.html');
  const report=await page.evaluate(async()=>{
   const T=THREE,Original=T.WebGLRenderer;let scene;T.WebGLRenderer=function(...args){const r=new Original(...args),render=r.render;r.render=function(s,c){if(c.isPerspectiveCamera)scene=s;return render.call(this,s,c);};return r;};
   const index=await fetch('/assets/chain-reaction/index.json').then(r=>r.json()),original=await Promise.all(index.stages.map(s=>fetch('/assets/chain-reaction/stages/'+s.file).then(r=>r.json()))),batches=[original,original.map(d=>{const m=ChainReaction.physics.mirror(d),pose=states=>states.map(p=>({...p,x:16-p.x,angle:-p.angle,vx:-p.vx,spin:-p.spin}));m.verified={armed:pose(d.verified.armed),spent:pose(d.verified.spent)};return m;})],samples=[];
   for(let orientation=0;orientation<batches.length;orientation++){const definitions=batches[orientation],view=ChainReaction.makeView(document.getElementById('scene'),definitions);
   try{for(const pose of ['armed','spent']){for(let n=0;n<definitions.length;n++)view.apply(n,definitions[n].verified[pose]);view.draw(0,false,0,false);scene.updateMatrixWorld(true);
    const mechanisms=scene.children.filter(o=>o.isGroup).slice(1);
    for(let n=0;n<definitions.length;n++){const d=definitions[n],states=new Map(d.verified[pose].map(p=>[p.id,p]));for(const group of mechanisms[n].children.filter(o=>o.userData.partId)){const p=d.parts.find(p=>p.id===group.userData.partId),state=states.get(p.id),cells=p.colliders||[{...p,x:0,y:0,angle:0,z:0}];for(const mesh of group.children.filter(o=>Number.isInteger(o.userData.cellIndex))){const c=cells[mesh.userData.cellIndex],actual=new T.Vector3();mesh.getWorldPosition(actual);mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox,expected={x:n*16+state.x+(c.x||0)*Math.cos(state.angle)-(c.y||0)*Math.sin(state.angle),y:state.y+(c.x||0)*Math.sin(state.angle)+(c.y||0)*Math.cos(state.angle),z:(p.z||0)+(c.z||0)},depth=c.shape==='ball'&&p.id.startsWith('marble')?2*c.radius:c.depth??p.depth??.12,error=Math.max(Math.abs(actual.x-expected.x),Math.abs(actual.y-expected.y),Math.abs(actual.z-expected.z),Math.abs(actual.z+bounds.min.z-(expected.z-depth/2)),Math.abs(actual.z+bounds.max.z-(expected.z+depth/2)));samples.push({stage:d.stageNumber,mirrored:Boolean(orientation),pose,id:p.id,cell:mesh.userData.cellIndex,shape:c.shape,compound:Boolean(p.colliders),actual:{x:actual.x,y:actual.y,z:actual.z},expected,depth,error,pass:error<.00001});}}}
   }}finally{view.dispose();}}return {samples,failures:samples.filter(s=>!s.pass),maximumError:Math.max(...samples.map(s=>s.error))};
  });rows.push({engine,sourceHash,...report,pass:report.failures.length===0});console.log(engine,report.samples.length+' physical mesh probes, '+report.failures.length+' mismatches');await page.close();
 });
 await writeFile(resolve(folder,process.env.CHAIN_REACTION_BASELINE?'alignment-before.json':'alignment.json'),JSON.stringify(rows,null,2)+'\n');if(!process.env.CHAIN_REACTION_BASELINE)assert(rows.every(r=>r.pass),'Rendered geometry disagrees with physical cells');
}finally{await server.close();await unlock();}
