import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,physics,moduleURL} from './core.mjs';
await import(pathToFileURL(resolve(ROOT,'js/chain-reaction-mass.js')));
export const materialData=JSON.parse(await readFile(resolve(ROOT,'js/chain-reaction-materials.json')));
export const mass=globalThis.ChainReaction.mass;
export const massGeometries=[{construction:'sphere',radius:.15625},{construction:'disk',radius:.5,depth:.125},{construction:'box',width:2,height:1,depth:.25},{construction:'shell',width:.16,height:1.3,depth:.28,thickness:.0002/.0508}];
export const massCases=Object.entries(materialData.materials).flatMap(([id,material])=>massGeometries.map(geometry=>({id,material,geometry,expected:mass.properties(material,geometry)})));
export async function verifyMaterials(){
 for(const sample of massCases){
  const doubled=Object.fromEntries(Object.entries(sample.geometry).map(([key,value])=>[key,typeof value==='number'?value*2:value]));
  const larger=mass.properties(sample.material,doubled);
  assert(Math.abs(larger.mass/sample.expected.mass-8)<1e-12&&Math.abs(larger.inertia/sample.expected.inertia-32)<1e-12,'Mass dimensions do not scale correctly: '+sample.id);
 }

 const report=[];
 for(const [id,material] of Object.entries(materialData.materials)){
  assert(material.friction>=0&&material.restitution>=0&&material.restitution<=1&&material.densitySource.startsWith('https://'));
  const geometry={construction:'box',width:2,height:1,depth:.25},properties=mass.properties(material,geometry);
  const definition={parts:[{id:'floor',shape:'box',fixed:true,mount:'bench',x:0,y:-.2,width:40,height:.4,friction:material.friction,restitution:0},{id:'stock',shape:'box',x:0,y:.5,width:2,height:1,...properties,friction:material.friction,restitution:0,vx:10}]};
  const sim=await physics.create(definition,moduleURL);let distance=0;
  try{
   const actual=sim.bodies.get('stock').mass();assert(Math.abs(actual-properties.mass)/properties.mass<1e-6);
   for(let n=0;n<240;n++){sim.step();distance=Math.max(distance,sim.state().find(p=>p.id==='stock').x);}
   const predicted=100/(2*physics.GRAVITY*material.friction),relativeError=Math.abs(distance-predicted)/predicted;
   assert(relativeError<.15,'Sliding friction model differs from Coulomb prediction: '+id);
   report.push({id,densityKgM3:material.densityKgM3,massKg:actual,inertiaKgUnits2:properties.inertia,friction:material.friction,slideDistance:distance,predictedDistance:predicted,relativeError});
  }finally{sim.dispose();}
 }
 const fixture=JSON.parse(await readFile(resolve(ROOT,'tools/chain-reaction/fixtures/marble-dominoes.json')));
 for(const p of fixture.parts.filter(p=>p.mass)){
  const expected=mass.properties(materialData.materials[p.material],p.shape==='ball'?{construction:'sphere',radius:p.radius}:{construction:'shell',width:p.width,height:p.height,depth:p.depth,thickness:p.sheetThicknessM/.0508});
  assert(Math.abs(expected.mass-p.mass)<1e-14&&Math.abs(expected.inertia-p.inertia)<1e-14,'Stored fixture mass differs: '+p.id);
 }
 return {pass:true,recipes:report,fixtureMassesMatched:15,massModelsChecked:massCases.length,physicalCalibration:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const core=await import('./core.mjs'),release=await core.toolLock(),clear=core.deadline(300000);
 try{console.log(JSON.stringify(await verifyMaterials(),null,2));}finally{clear();await release();}
}
