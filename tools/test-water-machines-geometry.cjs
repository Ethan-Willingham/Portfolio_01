#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/water-smoke-slime.js'),'utf8');
const start=source.indexOf('  function airGeometryTick() {'),end=source.indexOf('\n  function enableAirModel(',start);
assert(start>0 && end>start);
const width=16,height=16,tile=8,dx=5;
const wall=new Uint8Array(10*10);
const valveSeats=new Uint8Array(10*10);
for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(!r||!c||r===9||c===9)wall[r*10+c]=1;
let captures=0,last;
const context={Set,Uint8Array,Float32Array,Math,airGeometryVersion:-1,airStaticGeometry:null,airHadBodies:false,
  machineState:null,
  wallsVersion:1,walls:wall,valveSeats,gridW:10,gridH:10,TILE:tile,JELLO_H:1,JELLO_TIMESCALE:1,jelloBodies:[],
  tileAt:(r,c)=>r<0||c<0||r>=10||c>=10||wall[r*10+c]||valveSeats[r*10+c]?{}:null,
  airModel:{enabled:true,width,height,cellSize:dx,geometry:(solid,room,vx,vy,faces)=>{
    captures++;last={solid:Array.from(solid),room:Array.from(room),vx:Array.from(vx),vy:Array.from(vy),faces:Array.from(faces)};
  }}};
context.buildGuests=()=>context.jelloBodies.map(b=>({pts:b.ring.flatMap(i=>[b.px[i],b.py[i],2,3])}));
vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nairGeometryTick();',context);
const at=(x,y)=>Math.floor(y/dx)*width+Math.floor(x/dx);
function near(a,b){assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);}
near(last.solid[at(7.5,12.5)],.6);
near(last.faces[at(7.5,12.5)*4],0);
near(last.faces[at(7.5,12.5)*4+1],1);
near(last.faces[at(7.5,12.5)*4+2],.4);
assert(last.room[at(12.5,12.5)]);
vm.runInContext('airGeometryTick();',context);assert.equal(captures,1,'Static geometry should be cached.');
function symmetric(){
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    const i=r*width+c;
    if(c+1<width)near(last.faces[i*4+1],last.faces[(i+1)*4]);
    if(r+1<height)near(last.faces[i*4+3],last.faces[(i+width)*4+2]);
  }
}
symmetric();
function square(left,top,right,bottom){
  const px=[left,right,right,left],py=[top,top,bottom,bottom];
  return {ring:[0,1,2,3],ringN:4,px,py,ox:px.map(x=>x-2),oy:py.map(y=>y-3),bboxL:left,bboxR:right,bboxT:top,bboxB:bottom};
}
context.jelloBodies=[square(31,31,46,46)];vm.runInContext('airGeometryTick();',context);
near(last.solid[at(37.5,37.5)],1);near(last.vx[at(37.5,37.5)],2);near(last.vy[at(37.5,37.5)],3);
near(last.faces[at(32.5,32.5)*4+1],.2);symmetric();
const oneGuest=last.solid.slice();context.jelloBodies.push(square(31,31,46,46));vm.runInContext('airGeometryTick();',context);
assert.deepEqual(last.solid,oneGuest,'Overlapping guests must not double-count displaced volume.');symmetric();
context.jelloBodies=[];vm.runInContext('airGeometryTick();',context);
near(last.solid[at(37.5,37.5)],0);near(last.faces[at(32.5,32.5)*4+1],1);symmetric();
wall[3*10+3]=1;context.wallsVersion++;vm.runInContext('airGeometryTick();',context);
near(last.solid[at(27.5,27.5)],1);symmetric();
let tileCalls=0,lastTiles;
context.airModel.preserveMaterialState=true;
context.airModel.geometryStaticTiles=(tiles,cols,rows,size)=>{
  tileCalls++;lastTiles=Array.from(tiles);
  assert.equal(cols,10);assert.equal(rows,10);assert.equal(size,8);
};
valveSeats[4*10+4]=1;context.wallsVersion++;vm.runInContext('airGeometryTick();',context);
assert.equal(tileCalls,1,'Static basis uploads after a wall/seat change.');
assert.equal(lastTiles[4*10+4],1,'A closed valve belongs to the actual static collision mask.');
assert.equal(lastTiles[3*10+3],1,'Existing wall terrain remains in the same basis mask.');
assert.equal(wall[4*10+4],0,'The combined basis upload must not edit builder wall bytes.');
near(last.solid[at(37.5,37.5)],1);
context.jelloBodies=[square(51,31,66,46)];vm.runInContext('airGeometryTick();',context);
assert.equal(tileCalls,1,'Guest motion must not resend static tile data.');
context.jelloBodies=[];valveSeats[4*10+4]=0;context.wallsVersion++;vm.runInContext('airGeometryTick();',context);
assert.equal(tileCalls,2,'Opening a valve invalidates the static basis mask.');
assert.equal(lastTiles[4*10+4],0);near(last.solid[at(37.5,37.5)],0);symmetric();
// Check cached scanlines against an independent point-by-point polygon
// rasterizer, including concave outlines, partial walls and overlapping guests.
const staticSolid=last.solid.slice();
function pointInside(b,x,y){
  let hit=false;
  for(let i=0,j=b.ringN-1;i<b.ringN;j=i++){
    const a=b.ring[i],c=b.ring[j];
    if((b.py[a]>y)!==(b.py[c]>y) && x<(b.px[c]-b.px[a])*(y-b.py[a])/(b.py[c]-b.py[a])+b.px[a])hit=!hit;
  }
  return hit;
}
for(let pose=0;pose<32;pose++){
  context.jelloBodies=[0,1].map(offset=>{
    const px=[],py=[],n=17,cx=31+offset*9+Math.sin(pose)*7,cy=35+Math.cos(pose)*6;
    for(let k=0;k<n;k++){const angle=k*2*Math.PI/n+pose*.13,radius=k%2 ? 16 : 8;
      px.push(cx+Math.cos(angle)*radius);py.push(cy+Math.sin(angle)*radius);}
    return {ringN:n,ring:Array.from({length:n},(_,i)=>i),px,py,ox:px.slice(),oy:py.slice(),
      bboxL:Math.min(...px),bboxR:Math.max(...px),bboxT:Math.min(...py),bboxB:Math.max(...py)};
  });
  vm.runInContext('airGeometryTick();',context);
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    let blocked=0;
    for(let sy=0;sy<8;sy++)for(let sx=0;sx<8;sx++){
      const x=(col+(sx+.5)/8)*dx,y=(row+(sy+.5)/8)*dx;
      if(context.tileAt(Math.floor(y/tile),Math.floor(x/tile))===null && context.jelloBodies.some(b=>pointInside(b,x,y)))blocked++;
    }
    const cell=row*width+col;
    near(last.solid[cell],Math.min(1,staticSolid[cell]+blocked/64));
    near(last.vx[cell],blocked ? 2 : 0);near(last.vy[cell],blocked ? 3 : 0);
  }
  symmetric();
}
console.log('PASS exact partial-wall area, open-face symmetry, cached static geometry, moving guest union/removal, and shared wall/valve basis invalidation.');
console.log('PASS 32 moving concave/overlapping guest poses against independent 8 by 8 point sampling.');
