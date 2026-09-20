// Deterministic checks of the production sampler and rig water forces.
// Run: node tools/test-rig-water.cjs
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/sluice/040-init-resize-resolution.js', 'utf8');
const state = fs.readFileSync('js/sluice/020-state.js', 'utf8');
const sampler = source.slice(source.indexOf('  var rigWaterN ='), source.indexOf('  // ----- Fuel-to-surface'));
const tuning = state.match(/  var WATER_RIG_(DRAG|BUOY) =[^;]+;/g).join('\n');
function world() {
  const w = { Math, Float32Array, PLAYER_W:22, PLAYER_H:26, LIQUID_CELL:2.5, LIQUID_PDELTA:.5,
    player:{x:0,y:0,vx:0,vy:0}, liquidCount:0, liquidX:[],liquidY:[],liquidVX:[],liquidVY:[],liquidType:[] };
  vm.createContext(w); vm.runInContext(tuning + sampler,w); return w;
}
function fill(w,{left=-20,right=42,top=-20,bottom=46,vx=0,vy=0,type=0,spacing=1.25}={}) {
  w.liquidCount=0;
  for(let y=top+.625;y<bottom;y+=spacing)for(let x=left+.625;x<right;x+=spacing){
    // The liquid collider displaces particles outside the solid rig.
    if(x>=0&&x<22&&y>=0&&y<26)continue;
    const i=w.liquidCount++;w.liquidX[i]=x;w.liquidY[i]=y;w.liquidVX[i]=vx;w.liquidVY[i]=vy;w.liquidType[i]=type;
  }
}
const dry=world();Object.assign(dry.player,{vx:123,vy:740});dry.applyPlayerWater(1/30,760);
assert.equal(dry.player.vx,123);assert.equal(dry.player.vy,740);
for(const type of [1,2,3,4,5]){
  fill(dry,{type});assert.equal(dry.playerWaterSample().wet,0,'other materials do not become water');
}
fill(dry,{spacing:9});assert.equal(dry.playerWaterSample().wet,0,'sparse drops do not simulate immersion');

const wet=world();fill(wet);
assert.equal(wet.playerWaterSample().wet,1,'evacuated hull still reads as fully immersed');
assert.equal(wet.playerWaterSample().buoy,1);
wet.player.vy=740;wet.applyPlayerWater(1/60,760);
assert(wet.player.vy>700&&wet.player.vy<740,'lake entry loses speed progressively, without a sink-speed clamp');
let last=-1;
for(const top of [32,26,20,14,8,2,-4,-10]){
  fill(wet,{top});const sample=wet.playerWaterSample();
  assert(sample.wet>=last,'immersion increases with depth');last=sample.wet;
}
fill(wet,{left:9,right:13,vy:600});
assert(wet.playerWaterSample().wet<.2,'a narrow stream cannot saturate the whole hull');
assert.equal(wet.playerWaterSample().buoy,0,'a roof stream has no displaced volume');

// Equal relative motion means no drag. Changing the world-space reference
// velocity must not change the force, including in fast waterfalls.
for(const shift of [0,500]){
  const w=world();fill(w,{vx:80+shift,vy:600+shift});
  Object.assign(w.player,{vx:80+shift,vy:600+shift});w.applyPlayerWater(1/30,0);
  assert.equal(w.player.vx,80+shift);assert.equal(w.player.vy,600+shift);
  assert.equal(w.playerWaterSample().buoy,0,'falling streams do not provide hydrostatic lift');
}
const a=world(),b=world();fill(a,{vx:50,vy:300});fill(b,{vx:550,vy:800});
Object.assign(a.player,{vx:180,vy:700});Object.assign(b.player,{vx:680,vy:1200});
a.applyPlayerWater(.05,0);b.applyPlayerWater(.05,0);
assert(Math.abs(a.player.vx-(b.player.vx-500))<1e-8);
assert(Math.abs(a.player.vy-(b.player.vy-500))<1e-8,'drag depends on relative velocity');
for(const dt of [1/144,1/60,1/30,.05]){
  const w=world();fill(w,{vx:250,vy:500});Object.assign(w.player,{vx:-2000,vy:3000});
  const before=Math.hypot(w.player.vx-250,w.player.vy-500);w.applyPlayerWater(dt,0);
  assert(Math.hypot(w.player.vx-250,w.player.vy-500)<before,'drag dissipates relative kinetic energy');
  assert(w.player.vx<250&&w.player.vy>500,'drag never overshoots the stream');
}

const results=[];
for(const fps of [30,60,144]){
  function descend(flow){
    const w=world();fill(w,{vy:flow});w.player.vy=740;let distance=0;
    for(let i=0;i<fps;i++){
      w.player.vy+=760/fps;w.applyPlayerWater(1/fps,760);
      w.player.vy=Math.min(740,w.player.vy);distance+=w.player.vy/fps;
    }
    return {speed:w.player.vy,distance};
  }
  const lake=descend(0),waterfall=descend(600);
  assert(lake.speed>400&&lake.distance>480,'rig sinks decisively in a lake');
  assert(waterfall.distance>735,'a co-falling waterfall does not brake the rig');
  const thrust=world();fill(thrust);thrust.player.vy=430;
  for(let i=0;i<fps*2;i++){
    thrust.player.vy+=(760-1500)/fps;thrust.applyPlayerWater(1/fps,760);
  }
  assert(thrust.player.vy<-250,'jets arrest the fall and climb through water');
  fill(thrust,{left:500,right:530});const before=thrust.player.vy;thrust.applyPlayerWater(1/fps,760);
  assert.equal(thrust.player.vy,before,'leaving water removes its forces immediately');
  assert.equal(thrust.player.waterFrac,0);
  results.push({fps,lake,waterfall});
}
const distance=results.map(r=>r.lake.distance);
assert(Math.max(...distance)-Math.min(...distance)<16,'lake descent is consistent across frame rates');
console.log(JSON.stringify(results,null,2));
console.log('PASS: dry air, materials, spray, partial immersion, lake entry, stream-relative drag, waterfalls, jet escape, exit and frame rates.');
