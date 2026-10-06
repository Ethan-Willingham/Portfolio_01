import assert from 'node:assert/strict';
import {mass,materialData} from './materials.mjs';
import {physics,hash} from './core.mjs';
import {depthLayers} from './geometry.mjs';
const keys=['stageNumber','name','title','punchline','parts','joints','devices','skins','dressing','steps','beats','tags','entryId','exitId','path','durationWindow','contactProfile','noSleep','verified','ticks'];
export function sourceHash(stage){const {verified,...source}=stage;return hash(JSON.stringify(source));}
export function validateStage(d,{recorded=false}={}){
 assert(d&&typeof d==='object'&&!Array.isArray(d),'Stage must be a data object');
 for(const key of Object.keys(d))assert(keys.includes(key),'Unknown stage field: '+key);
 assert(Number.isInteger(d.stageNumber)&&d.stageNumber>0,'Invalid stage number');
 for(const key of ['name','title','punchline'])assert(typeof d[key]==='string'&&d[key].trim()&&!/\u2014|\p{Extended_Pictographic}/u.test(d[key]),'Invalid '+key);
 for(const key of ['parts','joints','devices','skins','dressing','steps','beats','path'])assert(Array.isArray(d[key]),'Missing '+key);
 assert(d.tags&&['energySource','compositionFamily','pathShape','coreTrick'].every(k=>typeof d.tags[k]==='string'&&d.tags[k]),'Missing stage tags');
 assert(d.contactProfile==='fresh-v1','Stages require fresh contacts');
 assert(Array.isArray(d.durationWindow)&&d.durationWindow.length===2&&d.durationWindow[0]=== (d.stageNumber===1?8:6)&&d.durationWindow[1]===(d.stageNumber===1?12:25),'Stage time window differs');
 assert(d.steps.length>=3&&d.steps.length<=12,'Step count out of bounds');
 assert(d.parts.filter(p=>!p.fixed).length<=32,'Too many moving bodies');
 const ids=new Set();
 for(const p of d.parts){
  assert(typeof p.id==='string'&&!ids.has(p.id),'Duplicate or invalid part ID');ids.add(p.id);
  assert(p.kit?.version==='1.0.0'&&['stock-box','compound-stock','hero-marble','bearing'].includes(p.kit.id),'Unknown kit version: '+p.id);
  assert([p.x,p.y,p.angle??0].every(Number.isFinite),'Invalid part pose: '+p.id);
  const m=materialData.materials[p.material];assert(m,'Unknown material: '+p.id);
  assert(Number.isFinite(p.friction)&&Number.isFinite(p.restitution)&&Math.abs(p.friction-m.friction)<1e-12&&Math.abs(p.restitution-m.restitution)<1e-12,'Material recipe differs: '+p.id);
  if(p.fixed){assert(typeof p.mount==='string'&&p.mount,'Fixed part has no mount');continue;}
  const expected=p.shape==='compound'?mass.compoundProperties(m,p.colliders,p.depth):mass.properties(m,p.shape==='ball'?{construction:'sphere',radius:p.radius}:{construction:p.construction||'box',width:p.width,height:p.height,depth:p.depth,thickness:p.thickness});
  assert(Math.abs(expected.mass-p.mass)<1e-14&&Math.abs(expected.inertia-p.inertia)<1e-14,'Mass model differs: '+p.id);
  if(p.shape==='compound')assert(Math.abs(expected.centerOfMass.x-p.centerOfMass.x)<1e-14&&Math.abs(expected.centerOfMass.y-p.centerOfMass.y)<1e-14,'Center of mass differs: '+p.id);
  if(p.id!==d.entryId)assert((p.vx||0)===0&&(p.vy||0)===0&&(p.spin||0)===0,'Unexplained initial kinetic energy: '+p.id);
 }
 for(const j of d.joints){assert(ids.has(j.a)&&ids.has(j.b),'Unknown joint body');assert(j.kit?.version==='1.0.0'&&['bearing','guide','string','dashpot'].includes(j.kit.id),'Unknown joint kit');if(j.type==='spring')assert(j.stiffness===0&&j.damping>0,'Unmodeled spring energy');}
 assert(d.devices.length===0,'Powered devices require their own energy verifier');
 assert(ids.has(d.exitId),'Missing exit marble');
 const hero=d.parts.find(p=>p.id===d.exitId);assert(hero.shape==='ball'&&hero.radius===.15625&&hero.material==='glazed-ceramic','Hero marble differs');
 if(d.stageNumber===1)assert(d.entryId===null,'First stage must have no entry');else{const p=d.parts.find(p=>p.id===d.entryId);assert(p&&p.shape==='ball'&&p.radius===.15625&&p.material===hero.material&&p.x===0&&p.y===1.15625&&p.vx===4&&(p.vy||0)===0&&p.spin===-25.6,'Canonical entry differs');}
 assert(depthLayers(d).pass,'Depth collision exclusions differ from visible geometry');
 for(const s of d.steps)assert(ids.has(s.from)&&ids.has(s.to)&&d.path.includes(s.from)&&d.path.includes(s.to),'Unknown transfer path');
 assert(new Set(d.path).size===d.path.length&&d.path.every(id=>ids.has(id)),'Invalid active path');
 assert(d.skins.length===d.parts.length&&d.parts.every(p=>d.skins.some(s=>s.part===p.id)),'Missing part finish');
 if(recorded){assert(d.verified?.engine===physics.ENGINE&&d.verified.physicsVersion===physics.VERSION&&d.verified.sourceHash===sourceHash(d),'Stage recording differs');assert(d.verified.robustness?.length===2&&d.verified.robustness.every(r=>r.pass&&r.passing>=199&&r.runs===200),'Missing robustness evidence');assert(d.verified.orientations?.length===2&&d.verified.orientations.every(r=>r.pass),'Missing row orientation');}
 return true;
}
