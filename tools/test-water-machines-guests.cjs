'use strict';
// Actual host adapters, with an independent displacement/clock oracle.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/water-smoke-slime.js'),'utf8');
function body(x,y,dx,dy,wet=1,n=4){
  const px=[],py=[];
  if(n===4){px.push(x,x+10,x+10,x);py.push(y,y,y+10,y+10);}
  else for(let i=0;i<n;i++){const a=i*2*Math.PI/n;px.push(x+5+5*Math.cos(a));py.push(y+5+5*Math.sin(a));}
  return {ringN:n,ring:Array.from({length:n},(_,i)=>i),px,py,ox:px.map(p=>p-dx),oy:py.map(p=>p-dy),
    bboxL:x,bboxR:x+10,bboxT:y,bboxB:y+10,_wetCells:wet};
}
let time=1.55,calls=0,capture;
const context={Array,Math,Number,Object,Set,Float32Array,Uint8Array,
  airModel:{enabled:false,preserveMaterialState:true,width:20,height:20,cellSize:5,
    geometry:(solid,room,vx,vy,faces)=>{capture={solid:Array.from(solid),vx:Array.from(vx),vy:Array.from(vy),faces:Array.from(faces)};}},
  liquidWGPU:{getSimParam:key=>{assert.equal(key,'TIMESCALE');calls++;return time;}},
  machineState:null,JELLO_TIMESCALE:.5,jelloStepH:1/480,JELLO_H:1/240,jelloBodies:[],liquidGuestSlots:Array(8).fill(null),pokeGuest:null,
  TILE:8,gridW:13,gridH:13,walls:new Uint8Array(169),valveSeats:null,wallsVersion:1,
  airGeometryVersion:-1,airStaticGeometry:null,airHadBodies:false,tileAt:()=>null};
vm.createContext(context);
const a=source.indexOf('  function buildGuests() {'),b=source.indexOf('\n  function getGameStateToy()',a);
const c=source.indexOf('  function airGeometryTick() {'),d=source.indexOf('\n  function applyAirPhysics()',c);
assert(a>0&&b>a&&c>0&&d>c);vm.runInContext(source.slice(a,b)+'\n'+source.slice(c,d),context);
const get=()=>vm.runInContext('buildGuests()',context),near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
context.jelloBodies=[body(20,20,.1,.05)];
let out=get();near(out[0].mvx,24);near(out[0].mvy,12);near(out[0].pts[2],24*(Math.hypot(24,12)-25)/50);assert.equal(calls,0,'Ordinary guest path never reads the machine clock.');
context.airModel.enabled=true;
out=get();near(out[0].pts[2],24/1.55);near(out[0].pts[3],12/1.55);near(out[0].mvx,24/1.55);
// The same real displacement at half playback speed has the same velocity
// per water simulation second, even when the jello solver refines its step.
context.JELLO_TIMESCALE=.25;time=.775;out=get();near(out[0].pts[2],24/1.55);
context.jelloStepH=1/960;context.jelloBodies[0].ox=context.jelloBodies[0].px.map(p=>p-.05);
context.jelloBodies[0].oy=context.jelloBodies[0].py.map(p=>p-.025);out=get();near(out[0].pts[2],24/1.55);near(out[0].pts[3],12/1.55);
context.JELLO_TIMESCALE=.5;context.jelloStepH=1/480;time=1.55;
context.jelloBodies=[body(20,20,10,0)];context.liquidGuestSlots.fill(null);out=get();near(out[0].pts[2],2400/1.55,'Machine input has no legacy speed cap.');
context.airModel.enabled=false;out=get();near(out[0].pts[2],600);
context.airModel.enabled=true;context.jelloBodies=[];context.liquidGuestSlots.fill(null);
context.pokeGuest={x:65,y:65,hw:5,hh:5,pts:[60,60,31,-15.5,70,60,31,-15.5,70,70,31,-15.5,60,70,31,-15.5]};
const saved=context.pokeGuest.pts.slice();out=get();near(out[0].pts[2],20);near(out[0].pts[3],-10);assert.deepEqual(context.pokeGuest.pts,saved,'Clock conversion does not mutate pointer state.');
vm.runInContext('airGeometryTick()',context);const at=(x,y)=>Math.floor(y/5)*20+Math.floor(x/5);
near(capture.solid[at(62.5,62.5)],1);near(capture.vx[at(62.5,62.5)],20);near(capture.vy[at(62.5,62.5)],-10);
context.pokeGuest=null;context.jelloBodies=Array.from({length:9},(_,i)=>body(10+i*8,30,.1,0,9-i));context.liquidGuestSlots.fill(null);
out=get();assert.equal(out.filter(g=>g.pts).length,8);assert(!context.liquidGuestSlots.includes(context.jelloBodies[8]));
vm.runInContext('airGeometryTick()',context);near(capture.solid[at(82.5,32.5)],0,'A ninth unregistered slime is absent from pressure geometry too.');
context.jelloBodies=[body(20,20,.1,0,1,32)];context.liquidGuestSlots.fill(null);out=get();assert.equal(out[0].pts.length,80,'Collision and pressure both use the same20 samples.');
vm.runInContext('airGeometryTick()',context);near(capture.vx[at(22.5,22.5)],Math.fround(24/1.55));
context.jelloBodies=[];vm.runInContext('airGeometryTick()',context);near(capture.solid[at(22.5,22.5)],0,'Removing the last boundary restores actual open geometry.');
// The live cup also uses the physical clock and complete large-body bounds.
context.airModel.preserveMaterialState=false;
context.machineState={definition:{name:'cup'}};
const large=body(5,5,.1,0);
large.px=[5,175,175,5];large.py=[5,5,175,175];
large.ox=large.px.map(p=>p-.1);large.oy=large.py.slice();
large.bboxR=large.bboxB=175;context.jelloBodies=[large];context.liquidGuestSlots.fill(null);
out=get();near(out[0].hw,88);near(out[0].hh,88);near(out[0].pts[2],24/1.55);
context.machineState=null;out=get();near(out[0].hw,64);near(out[0].hh,64);
context.airModel.preserveMaterialState=true;
time=0;assert.throws(get,/positive simulation clock/);
console.log('PASS actual guest clock/refinement, ordinary cap/deadband, pointer immutability, selected-slot pressure geometry, shared ring resampling and removal.');
