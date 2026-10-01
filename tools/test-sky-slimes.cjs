// Run from the repository root: node tools/test-sky-slimes.cjs
// Real fragment, deterministic flat-ground fixture, no rendering or game boot.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
function world() {
 let seed=71;
 const randomMath=Object.create(Math);
 randomMath.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const ctx = { console, Math:randomMath, TILE:32, SKY_ROWS:4,COLS:320,PLAYER_W:22,PLAYER_H:26, DECK_LEFT_COL:149,
 player:{x:4500,y:1000}, tileAt:(r,c)=>r>=4?{type:'stone'}:null,
 solidAt:(x,y,w,h)=>y+h>=128, liquidSampleCircle:()=>({wet:0,type:0}) };
 vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/sluice/348-sky-slimes.js','utf8'),ctx);
 return ctx;
}
let reports=[];
const opening=world();opening.skySlimeReset();
assert.equal(opening.skySlimes.length,0,'fresh runs have no hard slimes');
assert.equal(opening.skySlimeNext,90);
assert.equal(opening.skySlimeFirstArrival,true);
// The opening appointment advances underground, including across a save.
for(let n=0;n<450;n++)opening.skySlimeTick(.1);
assert.equal(opening.skySlimes.length,0,'no early fall');
const waiting=JSON.parse(JSON.stringify(opening.skySlimeSave()));
opening.skySlimeReset();opening.skySlimeRestore(waiting);
assert.equal(opening.skySlimeNext,waiting.next);assert.equal(opening.skySlimeFirstArrival,true);
for(let n=0;n<451;n++)opening.skySlimeTick(.1);
assert.equal(opening.skySlimes.length,1,'first fall arrives underground before sunset');
assert.equal(opening.skySlimeFirstArrival,false);
const repeat=opening.skySlimeNext;assert(repeat>=28&&repeat<=46);
for(let n=0;n<400;n++)opening.skySlimeTick(.1);
assert.equal(opening.skySlimeNext,repeat,'later arrivals wait for the rig to return');
opening.skySlimeReset();opening.skySlimeRestore({next:7,serial:1,slimes:[]});
assert.equal(opening.skySlimeFirstArrival,false,'legacy saves keep their original schedule');
opening.skySlimeTick(.1);assert.equal(opening.skySlimeNext,7);
for (const fps of [30,60,144]) {
 const w=world(); const s=w.skySlimeSpawn(4000,-320);s.vx=0;s.bounce=.81;
 let impacts=[], prev=s.vy, minY=s.y, maxBelow=0;
 for(let n=0;n<fps*20;n++) {
   w.skySlimeTick(1/fps);maxBelow=Math.max(maxBelow,s.y+s.r-128);
   if(prev>30 && s.vy< -25) impacts.push({incoming:prev,outgoing:-s.vy,height:128-s.r-minY});
   if(s.vy<0)minY=s.y;else minY=Math.min(minY,s.y);
   prev=s.vy;
 }
 assert(impacts.length>=5,`fps ${fps} bounce count ${impacts.length}`);
 for(let i=1;i<impacts.length;i++)assert(impacts[i].outgoing<impacts[i-1].outgoing,'decay');
 assert(maxBelow<.02,'tunnel');assert(s.settled,'settled');assert(Math.abs(s.vy)<3,'rest speed');
 s.visit='wander';s.visitT=2.5;
 const save=JSON.parse(JSON.stringify(w.skySlimeSave()));w.skySlimeReset();w.skySlimeRestore(save);
 assert.equal(w.skySlimes.length,1);assert.equal(w.skySlimes[0].visit,'wander');
 const body=w.skySlimes[0];assert.equal(body.visitT,2.5);
 const grabbed=w.skySlimeCapture(body.x,body.y,50);assert(grabbed);assert.equal(w.skySlimes.length,0);
 const released=w.skySlimeRelease(grabbed,4200,110,0,-100);assert(released);assert(released.y+released.r<128);
 for(let n=0;n<fps*10;n++)w.skySlimeTick(1/fps);
 assert(released.settled);assert.equal(released.visit,'wander');
 reports.push({fps,bounces:impacts.length,outgoing:impacts.map(x=>Math.round(x.outgoing)),restY:Math.round(s.y*100)/100,r:Math.round(s.r*100)/100,maxBelow});
}
const w=world();w.skySlimeSpawn(3000,-100);assert.equal(w.skySlimeCapture(3000,-100,100),null);
const blocked=world(), blockedBody=blocked.skySlimeRelease({x:3000,y:50},3000,50,0,0);
for(let n=0;n<600;n++)blocked.skySlimeTick(1/60);
blocked.liquidLineClear=()=>false;
assert.equal(blocked.skySlimeCapture(blockedBody.x,blockedBody.y,100),null,'capture respects a solid wall');
for(let i=0;i<20;i++)w.skySlimeSpawn(100+i*90,-300);
assert.equal(w.skySlimes.length,2);
for(const s of w.skySlimes)assert(s.r>=22&&s.r<=27);
const capacity=world();
for(let i=0;i<1;i++)capacity.skySlimeSpawn(100+i*90,-300);
capacity.siphon={passenger:{id:99}};
capacity.player.y=100;capacity.skySlimeNext=.01;capacity.skySlimeTick(.1);
assert.equal(capacity.skySlimes.length,1,'a carried guest reserves its population slot');
const pair=world();
const a=pair.skySlimeRelease({x:1000,y:50},1000,50,170,0);
const b=pair.skySlimeRelease({x:1100,y:50},1100,50,-170,0);
for(let n=0;n<600;n++)pair.skySlimeTick(1/60);
assert(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r-.05,'guests remain separated');
assert(a.y+a.r<=128.05&&b.y+b.r<=128.05,'body contacts stay above terrain');
console.log(JSON.stringify(reports,null,2));console.log('PASS: bounce decay, substep collision, rest, capture rules, carry/save data, release clearance, population cap.');
