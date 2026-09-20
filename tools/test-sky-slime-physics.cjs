// Deterministic physics checks of the shipped fragments, including water sampling.
// Run from repo root: node tools/test-sky-slime-physics.cjs
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = ['071-liquid-catalog.js','348-sky-slimes.js'].map(f=>fs.readFileSync('js/sluice/'+f,'utf8')).join('\n');
function world({floor=512,material='stone',water=null}={}) {
  let seed=71; const math=Object.create(Math);
  math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const w={console,Math:math,TILE:32,SKY_ROWS:16,COLS:320,PLAYER_W:22,PLAYER_H:26,DECK_LEFT_COL:149,
    player:{x:4500,y:1000,vx:0,vy:0},liquidCount:0,LIQUID_CELL:2.5,LIQUID_PDELTA:.5,
    liquidX:[],liquidY:[],liquidVX:[],liquidVY:[],liquidType:[],tileAt:(r,c)=>r*32>=floor?{type:material}:null,
    solidAt:(x,y,wi,h)=>y+h-1>=floor};
  vm.createContext(w); vm.runInContext(source,w);
  w.splashes=0;w.liquidToolImpulse=()=>++w.splashes;w.skySlimeNext=1e8;
  if(water!==null) for(let y=water+.625;y<floor;y+=1.25)for(let x=400;x<600;x+=1.25){w.liquidX.push(x);w.liquidY.push(y);w.liquidVX.push(0);w.liquidVY.push(0);w.liquidCount++;}
  return w;
}
function ball(w,x=500,y=100,vx=0,vy=0){const s=w.skySlimeFresh(x,y);Object.assign(s,{r:25,spin:0,vx,vy,entry:0});w.skySlimes.push(s);return s;}
function step(w,seconds,fps=60){for(let n=0;n<seconds*fps;n++)w.skySlimeTick(1/fps);}
const report=[];
for(const fps of [30,60,144]){
 const w=world(),s=ball(w), hits=[];const impact=w.skySlimeImpact;
 w.skySlimeImpact=(b,nx,ny,speed)=>{if(speed>25&&b._impactT<=0)hits.push({incoming:speed,outgoing:-b.vy,x:b.x,nx,ny});impact(b,nx,ny,speed);};
 step(w,22,fps);
 assert(hits.length>=14,'long sequence of natural rebounds');
 for(const h of hits) assert(Math.abs(h.outgoing/h.incoming-s.bounce)<.001,'constant stone restitution');
 for(let i=1;i<hits.length;i++)assert(hits[i].outgoing<hits[i-1].outgoing,'no impact creates energy');
 assert(s.settled&&Math.abs(s.vy)<2,'eventually rests');assert(s.y+s.r<=512.01,'floor containment');
 report.push({fps,first:hits[0].outgoing,bounces:hits.length});
 const roll=world(),r=ball(roll,500,487,150,0);r.spin=150/25;
 step(roll,1,fps);assert(r.x>620&&r.vx>100&&r.vx<120,'rolling slows progressively while retaining momentum');
 step(roll,5,fps);assert(r.vx<1&&r.x>790&&r.x<860,'rolling stops sooner instead of coasting across the surface');
 for(const dir of [-1,1]){
   const ram=world(),b=ball(ram,500,487);ram.player={x:500-dir*110-11,y:486,vx:dir*240,vy:0,onGround:true};
   for(let n=0;n<fps*.65;n++){ram.player.x+=ram.player.vx/fps;ram.skySlimeTick(1/fps);}
   assert(dir*b.vx>100&&dir*(b.x-500)>50,'moving rig transfers momentum in either direction');
   assert(Math.abs(ram.player.vx)<240,'rig recoils');assert(b._interactT>0,'navigation yields to impact');
 }
 const wall=world({floor:1024});wall.tileAt=(r,c)=>c>=20?{type:'stone'}:null;
 const fast=ball(wall,560,200,1000,0);step(wall,.3,fps);
 assert(fast.x+fast.r<=640.01&&fast.vx<0,'fast wall strike rebounds without tunneling');
 const wet=world({water:280}),floating=ball(wet);
 let down=0,wetSum=0,wetSamples=0;
 for(let n=0;n<fps*12;n++){
   wet.skySlimeTick(1/fps);down=Math.max(down,floating.y);
   if(n>=fps*10){wetSum+=floating.wet;wetSamples++;}
 }
 assert(down<430,'water arrests a fast plunge before the deep floor');
 assert(floating.y>280&&floating.y<300&&Math.abs(floating.vy)<5,'buoyant equilibrium');
 assert(wet.splashes===1,'one entry splash');
 // The waterline uses 4 px rows, so a quiet bob can cross a sampling row.
 // Verify settled immersion over time instead of one arbitrary final sample.
 assert(wetSum/wetSamples>.68&&wetSum/wetSamples<.76,'displaced water does not erase buoyancy');
 const shallow=world({water:496}),p=ball(shallow);let rebound=0;
 for(let n=0;n<fps*3;n++){shallow.skySlimeTick(1/fps);rebound=Math.max(rebound,-p.vy);assert(p.y+p.r<=512.01,'puddle floor containment');}
 assert(rebound>200&&rebound<report[report.length-1].first,'shallow water damps but preserves floor rebound');
}
assert(Math.max(...report.map(r=>r.first))-Math.min(...report.map(r=>r.first))<3,'frame-rate consistent first rebound');
const impactGrip=[];
for(const material of ['stone','dirt']){
 const w=world({material}),b=ball(w,500,488,150,200);b.spin=6;
 const energy=()=>.5*(b.vx*b.vx+b.vy*b.vy)+.2*b.r*b.r*b.spin*b.spin;
 const before=energy();w.skySlimeTerrain(b);
 assert(b.vx>120&&b.vx<145,'landing slows horizontal travel even when spin already matches rolling');
 assert(Math.abs(b.spin*b.r-b.vx)<.001,'impact keeps matching travel and spin together');
 assert(energy()<before,'ground grip only removes energy');
 impactGrip.push({material,vx:b.vx,vy:b.vy});
}
assert(impactGrip[1].vx<impactGrip[0].vx,'soil takes more horizontal speed than stone');
console.log('IMPACT GRIP',impactGrip);
// A missed volley must become catchable while retaining its vertical arc.
// Compare against an untouched guest so arrivals and navigation keep their
// original motion, and exercise both directions across refresh rates.
const recovery=[];
for(const fps of [30,60,144])for(const material of ['stone','dirt'])for(const dir of [-1,1]){
 const free=world({material}),untouched=ball(free,4000,487,dir*300,-220);
 const play=world({material}),played=ball(play,4000,487,dir*300,-220);
 untouched.spin=played.spin=dir*12;play.skySlimePlayContact(played);
 step(free,1,fps);step(play,1,fps);
 assert(Math.abs(played.vx)>70&&Math.abs(played.vx)<130,'a missed volley slows below driving speed within one second');
 assert(Math.abs(played.vx)<Math.abs(untouched.vx)*.45,'play loses sideways speed while untouched arrivals retain it');
 assert(Math.abs(played.y-untouched.y)<.001&&Math.abs(played.vy-untouched.vy)<.001,'sideways damping preserves the vertical flight arc');
 assert(dir*played.vx>0&&dir*played.spin>0,'drag never reverses a shot or its spin');
 step(play,11,fps);
 assert(Math.abs(played.x-4000)<384&&Math.abs(played.vx)<1,'a hard missed volley stays within twelve tiles');
 const roll=world({material}),r=ball(roll,4000,487,dir*150,0);r.spin=dir*6;roll.skySlimePlayContact(r);
 step(roll,2,fps);
 assert(Math.abs(r.vx)<1&&Math.abs(r.x-4000)<80,'a missed rolling ball stops within two seconds and two and a half tiles');
 recovery.push({fps,material,dir,volleyDistance:Math.abs(played.x-4000),rollDistance:Math.abs(r.x-4000)});
}
for(const material of ['stone','dirt'])for(const dir of [-1,1]){
 const cases=recovery.filter(r=>r.material===material&&r.dir===dir);
 assert(Math.max(...cases.map(r=>r.volleyDistance))-Math.min(...cases.map(r=>r.volleyDistance))<1,'miss recovery is refresh-rate consistent in either direction');
}
console.log('RECOVERY',recovery);
const w=world(),s=ball(w);s.y=487;w.player={x:530,y:470,vx:0,vy:0};s.settled=true;s.glanceIn=0;
let looking=0;for(let n=0;n<60*60;n++){w.skySlimeExpression(s,1/60);looking+=s.glanceT>0?1:0;assert(Math.hypot(s.pupilX,s.pupilY)<=s.r*s.eyeSize*.47+.001,'pupil contained in plastic cup');}
assert(looking>0&&looking<60*60*.2,'eye glances sometimes but does not stare continuously');
const saved=w.skySlimeHydrate(JSON.parse(JSON.stringify(w.skySlimeRecord(s))));assert.equal(saved.bounce,s.bounce,'saving preserves the material');
const old=w.skySlimeHydrate({x:500,y:100,bounce:.55,oval:1.06,eyeSize:.33});assert.equal(old.oval,1);assert(old.bounce>=.86&&old.eyeSize>=.4,'old visitors gain the round body and new bounce');
const spray=world();spray.liquidX=[530,532,535];spray.liquidY=[105,107,115];spray.liquidVX=[0,0,0];spray.liquidVY=[0,0,0];spray.liquidCount=3;
assert.equal(spray.liquidSampleBall(500,100,25).surface,Infinity,'isolated drops are not a waterline');
console.log(JSON.stringify(report,null,2));console.log('PASS: restitution, rolling, rig momentum, wall impacts, water entry/buoyancy, puddles, and googly eye.');
