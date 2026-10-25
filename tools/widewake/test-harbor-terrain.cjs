/* The rendered settlements stand on surveyed dry soil; piers share collision. */
const assert=require('node:assert/strict'),E=require('../../js/widewake-estuary-core.js'),O=require('../../js/widewake-ocean.js');
require('../../js/widewake-ocean-art.js');
const field=new E.Field(),art=WidewakeOceanArt.landings(O.geometry),reports=[];let foundations=0,bytes=0;
for(const site of field.harbors){
  assert.equal(site.shore.length,17);for(const p of site.shore)assert.ok(Math.abs(field.sample(p.x,p.y).edge+.3)<.012,site.id+' wall follows the surveyed bank');
  for(const p of site.connections){const x=site.port.x+p.x+site.nx*p.length/2,y=site.port.y+p.y+site.ny*p.length/2;assert.ok(field.sample(x,y).depth<0,site.id+' pier root reaches dry soil');assert.ok(field.obstacles.some(o=>Math.abs(o.x-site.port.x-p.x)<.001&&Math.abs(o.y-site.port.y-p.y)<.001),'visible root extension has an identical collision footprint');}
  const parts=art.parts.filter(p=>p.port===site.id);assert.ok(parts.length>=5,site.id+' has a quay, working structures and a pier');
  for(const part of parts){if(/_pier|_quay/.test(part.type))continue;const mesh=art.meshes[part.type];for(let i=0;i<mesh.length;i+=6){if(mesh[i+2]>.2)continue;const x=part.x+mesh[i],y=part.y+mesh[i+1],p=field.sample(x,y);assert.ok(p.depth<=0,part.type+' foundation is in water at '+x+','+y);assert.ok(E.bankHeight(p.edge,x,y,field.harbors)<1.5,part.type+' sits inside the graded yard');foundations++;}}
  const approach={...E.vessels.launch,x:site.port.x,y:site.port.y,angle:0};assert.ok(field.clearance(approach)>.12,site.id+' still has a clear destination');
  reports.push({id:site.id,parts:parts.length,rootExtensions:site.connections.map(p=>+p.length.toFixed(2)),focus:site.focus});
}
for(const [id,s]of Object.entries(art.specs)){const m=art.meshes[id];let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(let i=0;i<m.length;i+=6){const p=O.project(m[i],m[i+1],m[i+2]);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}const w=Math.ceil(((x1-x0)*s.ppu+4)/4)*4,h=Math.ceil(((y1-y0)*s.ppu+4)/4)*4;for(let level=0;level<=Math.floor(Math.log2(Math.max(w,h)));level++)bytes+=Math.max(1,w>>level)*Math.max(1,h>>level)*8;}
assert.ok(foundations>100,'test actual model footing vertices');assert.ok(bytes<14.2*1048576,'all ten port color/depth mip chains stay bounded: '+bytes/1048576+' MiB');
assert.equal(art.parts.filter(p=>p.type==='landing_shared_pier_x').length,3);assert.equal(art.parts.filter(p=>p.type==='landing_shared_pier_y').length,4);
console.log('PASS all ten surveyed banks, dry model foundations, graded yards, pier collision, open destinations and shared pier bakes');console.log(JSON.stringify({foundations,harborAtlasMiB:+(bytes/1048576).toFixed(2),reports},null,2));
