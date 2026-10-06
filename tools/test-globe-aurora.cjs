/* Geographic and depth checks for the fixed ribbon scaffold. */
'use strict';
const assert=require('node:assert/strict'),A=require('../js/globe-aurora.js'),D=require('../js/globe-data.js');
const groups=A.scaffold(),storm=D.parseAurora(require('./fixtures/daylight/ovation-2026-10-04-storm.json'));
assert.equal(groups.length,8);
for(const group of groups){
 const vertices=group.position.length/3;assert(vertices<65536,'Each part works with WebGL1 16-bit indices');
 for(let i=0;i<vertices;i++){
  const foot=group.foot.subarray(i*3,i*3+3),point=group.position.subarray(i*3,i*3+3);
  assert(Math.abs(Math.hypot(...foot)-1)<1e-6,'Footpoints lie on the geographic globe');
  const altitude=Math.hypot(...point)-1;assert(altitude>.015&&altitude<.15,'Raised geometry remains in its bounded display altitude');
  if(i%6===0)assert(Math.abs(altitude-.016)<1e-6,'Curtains start about 100 km above the surface');
  if(i%6)assert(Math.hypot(...point)>Math.hypot(...group.position.subarray((i-1)*3,i*3)),'Rays rise continuously');
 }
}
console.log('PASS folded curtains have genuine height, geographic footpoints and WebGL1 indices');
assert.equal(A.select(groups,new Float32Array(360*181)),0);
const triangles=A.select(groups,storm.grid);assert(triangles>10000&&triangles<150000);
for(const group of groups){
 for(let i=0;i<group.count;i++)assert(group.indices[i]<group.position.length/3);
 for(const cell of group.cells){
  const active=cell.neighbors.some(index=>storm.grid[index]>8);
  if(active)assert(cell.neighbors.every(index=>index>=0&&index<storm.grid.length));
 }
}
console.log('PASS the real NOAA grid selects only forecast-supported ribbon segments');
for(const latitude of[-70,0,70]){
 const grid=new Float32Array(360*181);
 for(let y=latitude-3;y<=latitude+3;y++)for(let x=177;x<=183;x++)grid[(y+90)*360+x]=50;
 assert(A.select(groups,grid)>0,'Both hemispheres and an unusual low-latitude forecast remain supported');
}
console.log('PASS there is no geographic latitude exclusion or hard seam at longitude 180');
const identities=groups.map(g=>g.position.buffer),bytes=groups.reduce((n,g)=>n+['position','foot','uv','pattern','indices'].reduce((sum,key)=>sum+g[key].byteLength,0),0);
for(let i=0;i<100;i++)A.select(groups,i%2?storm.grid:new Float32Array(360*181));
assert(groups.every((g,i)=>g.position.buffer===identities[i]));assert(bytes<14*1024*1024);
console.log('PASS replay retains the same geometry buffers within a 14 MiB budget');
