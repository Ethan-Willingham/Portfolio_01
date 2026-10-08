// Exact airflow comparison and isolated CPU timings, without a browser.
// BASE_REF=HEAD BENCH=1 node tools/perf/snow-air-equivalence.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const file = 'js/sluice/159-snow-air.js';
const reference = execFileSync('git', ['show', `${process.env.BASE_REF || '4219c6f6'}:${file}`], {encoding:'utf8'});
const candidate = fs.readFileSync(file, 'utf8');
function fixture(source) {
  const world = {floor:128,wall:Infinity,roof:false,angle:0};
  const player = {x:0,y:60,vx:0,vy:0,thrusting:true};
  const env = {performance, surfaceWind:{current:0}, snow:{time:0}, worldSnowEnabled:true,
    bathMode:false,gameOver:false,gameWon:false,player,PLAYER_W:22,PLAYER_H:25,rocketIntensity:1,
    liquidWorldSolidAt:(x,y)=>y>=world.floor || (x>world.wall && y>world.floor-170) || (world.roof && y< -10 && y> -45),
    liquidPointInMiner:(x,y)=>x>player.x&&x<player.x+22&&y>player.y&&y<player.y+20,
    rigContactHull:()=>player,
    rigHullContains:(h,x,y)=>x>h.x&&x<h.x+22&&y>h.y&&y<h.y+20,
    rocketNozzles:()=>[7,15].map(x=>({x:player.x+x,y:player.y+24})),
    rocketExhaustDir:()=>({x:Math.sin(world.angle),y:Math.cos(world.angle)}),
    liquidLineClear:(x0,y0,x1,y1)=>y1<world.floor && !(x1>world.wall&&y1>world.floor-170)};
  const api = new Function(...Object.keys(env), source + `
    return { air:snowAir, update:updateSnowAir, project:snowAirProject,
      settings:function(enabled,bath,intensity){worldSnowEnabled=enabled;bathMode=bath;rocketIntensity=intensity;} };
  `)(...Object.values(env));
  return {...api,world,player,env};
}
const a=fixture(reference),b=fixture(candidate);
const fields=['u','v','tu','tv','pressure','divergence','inletU','inletV','field','grainField','solid'];
let frames=0;
for(const fps of [30,60,144,240]) {
  for(let frame=0;frame<300;frame++) {
    for(const f of [a,b]) {
      f.player.x=frame*.9;f.player.y=60-30*Math.sin(frame*.09);f.player.vx=frame<150?108:-108;
      f.player.vy=30*Math.cos(frame*.09);f.player.thrusting=frame<160;
      f.world.angle=Math.sin(frame*.031)*.4;f.world.wall=frame<100?180:Infinity;
      f.world.roof=frame>80&&frame<190;f.world.floor=frame>210?144:128;
      f.env.surfaceWind.current=Math.sin(frame*.015);f.env.snow.time+=1/fps;
      f.settings(true,frame===270,frame<70?.6:1);f.update(1/fps);
    }
    for(const key of fields)assert.deepEqual(new Uint8Array(b.air[key].buffer),new Uint8Array(a.air[key].buffer),`${fps}/${frame}/${key}`);
    for(const key of ['x','y','active','life','time','peak','trail','divergenceBefore','divergenceAfter','revision'])
      assert.equal(b.air[key],a.air[key],`${fps}/${frame}/${key}`);
    frames++;
  }
}
// Arbitrary solid neighborhoods cover isolated cells and every wall stencil.
let seed=83;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let trial=0;trial<120;trial++) {
  for(let i=0;i<a.air.u.length;i++) {
    const u=(random()-.5)*1400,v=(random()-.5)*1400,solid=random()<trial/120?1:0;
    for(const f of [a,b]){f.air.u[i]=u;f.air.v[i]=v;f.air.solid[i]=solid;}
  }
  a.project();b.project();
  for(const key of ['u','v','pressure','divergence'])assert.deepEqual(new Uint8Array(b.air[key].buffer),new Uint8Array(a.air[key].buffer),`stencil ${trial}/${key}`);
}
// Float32 subnormal flow can round pressure to signed zero. Retain even the
// original leading zero addition in the open-cell accumulator.
for(const f of [a,b]) {
  f.air.solid.fill(0);f.air.v.fill(0);
  for(let y=0;y<f.air.h;y++)for(let x=0;x<f.air.w;x++)f.air.u[y*f.air.w+x]=x*2**-149;
  f.air.u[4*f.air.w+5]=f.air.u[4*f.air.w+4];f.project();
}
for(const key of ['u','v','pressure','divergence'])assert.deepEqual(new Uint8Array(b.air[key].buffer),new Uint8Array(a.air[key].buffer),`signed-zero ${key}`);
console.log(`PASS ${frames} complete airflow frames, 120 random wall grids and subnormal flow: byte-identical fields, pressure, velocities and lifecycle.`);
if(process.env.BENCH==='1') {
  const timed=(source,ground)=>{
    const f=fixture(source);if(!ground)f.world.floor=10000;
    for(let i=0;i<200;i++)f.update(1/144);
    const times=[];
    for(let run=0;run<7;run++){const start=performance.now();for(let i=0;i<400;i++)f.update(1/144);times.push((performance.now()-start)/400);}
    return times.sort((a,b)=>a-b)[3];
  };
  for(const ground of [true,false]){const old=timed(reference,ground),next=timed(candidate,ground);console.log(JSON.stringify({scene:ground?'surface jet':'open-air jet',beforeMs:old,afterMs:next,improvementPercent:(1-next/old)*100}));}
}
