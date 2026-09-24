// Bounded MAC airflow checks. No browser, rendering or decorative particles.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const ctx = vm.createContext({ performance, worldSnowEnabled:true, bathMode:false, gameOver:false, gameWon:false,
  player:{x:0,y:60,vx:0,vy:0,thrusting:true}, PLAYER_W:22, PLAYER_H:25, rocketIntensity:1,
  liquidWorldSolidAt:(x,y)=>y>=128&&y<160, liquidPointInMiner:()=>false,
  rocketNozzles:()=>[{x:7,y:84},{x:15,y:84}], rocketExhaustDir:()=>({x:0,y:1}), liquidLineClear:(x0,y0,x1,y1)=>y1<128 });
const source=fs.readFileSync(new URL('../../js/sluice/159-snow-air.js',import.meta.url),'utf8');
const api=vm.runInContext('(function(){var Math=globalThis.Math;'+source+';return {air:snowAir,update:updateSnowAir,shift:snowAirShift,sample:snowAirAt,couple:snowAirCoupleCPU};})()',ctx);
for(let i=0;i<180;i++)api.update(1/60);
const a=api.air;
let left=0,right=0,up=0,inside=0,energy=0,surfaceLift=0;
for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){
 const i=(y*a.w+x)*4,wx=a.x+(x+.5)*a.cell,wy=a.y+(y+.5)*a.cell,u=a.field[i],v=a.field[i+1],lift=a.field[i+3];
 assert.ok(Number.isFinite(u)&&Number.isFinite(v));energy+=u*u+v*v;
 assert.ok(Number.isFinite(lift)&&lift>=0&&lift<=500,'surface entrainment remains finite and bounded');
 if(x===0||y===0||x===a.w-1||y===a.h-1)assert.equal(Math.abs(u)+Math.abs(v)+lift,0,'all airflow channels reach ambient at every domain edge');
 if(wy>=128)inside=Math.max(inside,Math.abs(u)+Math.abs(v)+lift);
 if(wy<100)assert.equal(lift,0,'surface entrainment does not add lift in the sky');
 if(wy>104&&wy<128)surfaceLift=Math.max(surfaceLift,lift);
 if(x<a.w-1&&y<a.h-1)assert.equal(api.sample(wx,wy)[2],lift,'particle sampling retains the entrainment channel');
 if(wy>90&&wy<128&&wx<0)left=Math.min(left,u);
 if(wy>90&&wy<128&&wx>22)right=Math.max(right,u);
 if(wy>40&&wy<120&&Math.abs(wx-11)>25)up=Math.min(up,v);
}
console.log({peak:a.peak,left,right,up,inside,surfaceLift,projection:[a.divergenceBefore,a.divergenceAfter],ms:a.ms});
assert.ok(left < -25 && right>25,'impinging jet spreads along both sides of the floor');
assert.ok(Math.abs(left+right)<(Math.abs(left)+Math.abs(right))*.1,'stationary vertical hover keeps a balanced two-sided wash');
assert.ok(up < -8,'resolved returning airflow lifts powder outside the downward core');
assert.ok(surfaceLift>100,'strong floor-parallel airflow entrains exposed powder');
// Opposing local velocities can leave weak projected flow while surface
// scouring remains strong. CPU coupling must gate on the same effective
// velocity as the GPU, including lift, or these particles never wake.
const savedField = a.field.slice();
for (let i=0;i<a.field.length;i+=4) {
  a.field[i]=0.5; a.field[i+1]=0.5; a.field[i+2]=1; a.field[i+3]=80;
}
const weakFlow = api.sample(55,102.75).slice();
assert.ok(Math.hypot(weakFlow[0],weakFlow[1])<2,'regression sample has weak projected velocity');
assert.ok(Math.hypot(weakFlow[0],weakFlow[1]-weakFlow[2])>20,'surface lift still supplies a meaningful disturbance');
Object.assign(ctx, {
  LIQUID_TIMESCALE:1, liquidCount:3,
  liquidType:new Uint8Array([5,0,5]), liquidFrozen:new Uint8Array([0,0,1]),
  liquidX:new Float32Array([55,55,55]), liquidY:new Float32Array([102.75,102.75,102.75]),
  liquidDensity:new Float32Array([1,1,1]), liquidVX:new Float32Array(3), liquidVY:new Float32Array(3),
  liquidSleeping:new Uint8Array([1,1,1]), liquidRestFrames:new Uint16Array([90,90,90])
});
api.couple(1/60);
assert.ok(ctx.liquidVY[0]<-1,'CPU snow responds to lift even when raw airflow is below its activity threshold');
assert.equal(ctx.liquidSleeping[0],0,'surface entrainment wakes resting powder');
assert.equal(ctx.liquidRestFrames[0],0,'surface entrainment clears the snow rest counter');
for(const i of [1,2]) {
  assert.equal(ctx.liquidVX[i],0);assert.equal(ctx.liquidVY[i],0);
  assert.equal(ctx.liquidSleeping[i],1);assert.equal(ctx.liquidRestFrames[i],90);
}
a.field.set(savedField);
// The exported wake tapers before the rectangular solve ends. Its outer
// samples must not leave a visible step when a flake crosses the perimeter.
const edgeFlow=[];
for(let x=325;x<=385;x++) edgeFlow.push(Math.hypot(...api.sample(x,112)));
assert.ok(edgeFlow[0]>edgeFlow.at(-1),'the outer wake fades toward still air');
assert.equal(edgeFlow.at(-1),0,'the smaller lateral reach ends in still air');
let edgeStep=0;
for(let i=1;i<edgeFlow.length;i++)edgeStep=Math.max(edgeStep,Math.abs(edgeFlow[i]-edgeFlow[i-1]));
assert.ok(edgeStep<a.peak*.01,'each pixel across the fringe changes flow by less than one percent of the core');
// An old 2px/s speed gate abruptly switched on full drag, braking a moving
// grain even at the fringe. Compare neighboring flow speeds around it.
function fringeResponse(speed) {
  for(let i=0;i<a.field.length;i+=4){a.field[i]=speed;a.field[i+1]=a.field[i+3]=0;}
  ctx.liquidVX[0]=0;ctx.liquidVY[0]=53;api.couple(1/60);
  return 53-ctx.liquidVY[0];
}
const belowGate=fringeResponse(1.99),aboveGate=fringeResponse(2.01);
assert.ok(belowGate>0&&aboveGate<2,'faint wake drag stays below the gravity added in one frame');
assert.ok(Math.abs(aboveGate-belowGate)<.04,'crossing the old speed cutoff is continuous');
a.field.set(savedField);
console.log('WAKE EDGE',{edgeStep,belowGate,aboveGate});
assert.equal(inside,0,'no airflow through a solid roof into the open pocket below it');
const preserved=a.u[20*a.w+31];api.shift(a.x+8,a.y);assert.equal(a.u[20*a.w+30],preserved,'moving the window preserves world-space face velocity');
assert.ok(a.divergenceAfter<a.divergenceBefore*.5,'pressure projection reduces divergence');
assert.ok(a.ms<20,'bounded local solve fits a frame on the test host');
// No input must remove energy, then idle completely.
ctx.player.thrusting=false;
for(let i=0;i<240;i++)api.update(1/60);
assert.equal(a.active,false);assert.equal(a.peak,0);assert.ok(a.field.every(v=>v===0));
// With no floor or rig beneath it, a jet has no surface powder to scour.
ctx.liquidWorldSolidAt=()=>false;ctx.liquidLineClear=()=>true;ctx.player.thrusting=true;
for(let i=0;i<90;i++)api.update(1/60);
for(let i=3;i<a.field.length;i+=4)assert.equal(a.field[i],0,'a free jet cannot produce surface entrainment in midair');
console.log('PASS projected nozzle flow, wall jets, recirculation, bounded floor entrainment, solid walls and idle shutdown');

// Banked passes must put nearly all visible powder behind the travelling
// rig. Move the nozzles through world space and mirror the whole fixture,
// so a fixed leftward preference cannot satisfy the directional checks.
for (const direction of [-1,1]) {
  const rig = {x:0,y:60,vx:direction*220,vy:0,thrusting:true};
  const angle = direction*.36;
  const flightContext = vm.createContext({
    performance, worldSnowEnabled:true, bathMode:false, gameOver:false, gameWon:false,
    player:rig, PLAYER_W:22, PLAYER_H:25, rocketIntensity:1,
    liquidWorldSolidAt:(x,y)=>y>=128&&y<160,
    liquidPointInMiner:(x,y)=>x>rig.x&&x<rig.x+22&&y>rig.y&&y<rig.y+20,
    rocketNozzles:()=>[7,15].map(x=>({
      x:rig.x+11+(x-11)*Math.cos(angle)-10*Math.sin(angle),
      y:rig.y+14+(x-11)*Math.sin(angle)+10*Math.cos(angle)
    })),
    rocketExhaustDir:()=>({x:-Math.sin(angle),y:Math.cos(angle)}),
    liquidLineClear:(x0,y0,x1,y1)=>y1<128
  });
  const flight = vm.runInContext('(function(){'+source+';return {air:snowAir,update:updateSnowAir};})()',flightContext);
  let forwardEnergy=0,rearEnergy=0,forwardMotion=0,trailingMotion=0;
  for (let frame=0;frame<180;frame++) {
    rig.x+=rig.vx/60;flight.update(1/60);
    if (frame<30) continue; // Allow the input bank to ease into the wake.
    const air=flight.air;
    for (let y=0;y<air.h;y++) for (let x=0;x<air.w;x++) {
      const wx=air.x+(x+.5)*air.cell,wy=air.y+(y+.5)*air.cell;
      const ahead=(wx-rig.x-11)*direction;
      if (wy<100||wy>=128||Math.abs(ahead)>192||Math.abs(ahead)<16) continue;
      const i=(y*air.w+x)*4,u=air.field[i],v=air.field[i+1]-air.field[i+3];
      assert.ok(Number.isFinite(u)&&Number.isFinite(v)&&Math.abs(u)<1500&&Math.abs(v)<1500,
        'moving wake velocities stay finite and bounded');
      const plumeEnergy=u*u+Math.max(0,-v)**2;
      if (ahead>0) forwardEnergy+=plumeEnergy; else rearEnergy+=plumeEnergy;
      if (u*direction>0) forwardMotion+=u*u; else trailingMotion+=u*u;
    }
  }
  assert.ok(rearEnergy>1e6&&trailingMotion>1e6,'banked flight retains a substantial trailing plume');
  assert.ok(forwardEnergy<rearEnergy*.02,'banked flight lofts powder behind the rig instead of ahead');
  assert.ok(forwardMotion<trailingMotion*.02,'horizontal snow motion follows the banked exhaust direction');
  console.log('DIRECTIONAL WAKE',{direction,forwardOverRear:forwardEnergy/rearEnergy,
    opposingOverTrailing:forwardMotion/trailingMotion});
  rig.thrusting=false;
  for(let frame=0;frame<240;frame++)flight.update(1/60);
  assert.equal(flight.air.active,false,'moving airflow also shuts down after thrust stops');
  assert.equal(flight.air.trail,0,'idle clears directional steering for the next hover');
  assert.ok(flight.air.field.every(v=>v===0),'idle clears every directional airflow channel');
}
console.log('PASS mirrored banked flights keep powder trailing while hover stays symmetric');

// A short flyover must not apply the liquid's downward cone to powder as
// well as its resolved air drag. Exercise the production CPU scatter and
// wake with controlled material beds; no browser or solver imitation.
const liquidSource = fs.readFileSync(new URL('../../js/sluice/070-collision-liquids.js', import.meta.url), 'utf8');
function liquidFunction(name) {
  const start = liquidSource.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name + ' exists in the production fragment');
  return liquidSource.slice(start, liquidSource.indexOf('\n  }', start) + 4);
}
const powder = {
  Math, Float32Array, LIQUID_MAX_CELLS:4096, LIQUID_HASH_MASK:8191,
  LIQUID_CELL:2.5, TILE:32, liquidGridCount:0, liquidHashFrame:1, liquidCount:120,
  rocketIntensity:1, player:{thrusting:true}, rocketExhaustDir:()=>({x:0,y:1}),
  rocketNozzles:()=>[{x:1.25,y:1.25}], liquidLineClear:()=>true
};
for (const key of ['liquidHashKeys','liquidHashVals','liquidHashStamp',
  'liquidGridKeys','liquidCellGX','liquidCellGY']) powder[key] = new Int32Array(8192);
for (const key of ['Mass','OilMass','SnowMass','Aeration','VX','VY','DVX','DVY']) {
  powder['liquidCell' + key] = new Float32Array(4096);
}
for (const key of ['Frozen','X','Y','PrevX','PrevY','LX','LY','VX','VY','PVX','PVY',
  'GX','GY','DX','DY','G00','G01','G10','G11','Aeration','Type']) {
  powder['liquid' + key] = new Float32Array(120);
}
powder.liquidNbrs = new Int32Array(1080);
powder.liquidW = new Float32Array(1080);
for (let i=0; i<120; i++) {
  powder.liquidX[i] = 55 + (i%12)*1.43;
  powder.liquidY[i] = 65 + Math.floor(i/12)*1.37;
  powder.liquidVX[i] = i/20; powder.liquidVY[i] = -i/15;
  powder.liquidG00[i] = i*.0004; powder.liquidG11[i] = i*.0003;
  powder.liquidAeration[i] = i/300;
}
vm.createContext(powder);
vm.runInContext(['liquidGetCell','liquidClearGrid','liquidP2G','liquidApplyRocketGridWake']
  .map(liquidFunction).join('\n'), powder);
const sumCells = key => powder['liquidCell'+key].subarray(0,powder.liquidGridCount).reduce((sum,v)=>sum+v,0);
let waterGrid;
for (const material of ['water','snow','mixed','water again']) {
  for (let i=0; i<120; i++) powder.liquidType[i] = material==='snow' ? 5 : material==='mixed' ? i%6 : 0;
  powder.liquidP2G(1/300);
  assert.ok(Math.abs(sumCells('Mass')-120)<.0001, 'all deposited particles retain their grid mass');
  assert.ok(Math.abs(sumCells('SnowMass')-(material==='snow'?120:material==='mixed'?20:0))<.0001,
    material + ' contributes exactly its own snow mass, including after grid reuse');
  if (material==='water') {
    waterGrid = ['Mass','Aeration','VX','VY'].map(key=>powder['liquidCell'+key].slice());
  } else {
    ['Mass','Aeration','VX','VY'].forEach((key,i)=>assert.deepEqual(powder['liquidCell'+key],waterGrid[i],
      material + ' preserves the existing total mass, aeration and carried momentum'));
  }
  if (material==='snow') {
    for (let i=0; i<powder.liquidGridCount; i++) {
      assert.equal(powder.liquidCellSnowMass[i],powder.liquidCellMass[i],
        'pure powder remains exactly pure through the complete stencil');
    }
  }
}
// A nozzle at the sample centre has a fixed, documented baseline impulse.
// Check fixed outputs and fractional material response independently of P2G.
powder.liquidCellGX[0] = powder.liquidCellGY[0] = 0;
powder.liquidCellMass[0] = 4;
for (const [snowMass,expectedY] of [[0,.7580000162124634],[2,.2540000081062317],[4,-.25]]) {
  powder.liquidCellSnowMass[0] = snowMass;
  powder.liquidCellVX[0] = .125; powder.liquidCellVY[0] = -.25;
  powder.liquidApplyRocketGridWake(0,1/300);
  assert.equal(powder.liquidCellVX[0],.125,'vertical exhaust does not add sideways cone velocity');
  assert.equal(powder.liquidCellVY[0],expectedY,
    'water keeps its cone impulse, a mixture scales it, and pure snow receives none');
}
console.log('PASS snow grid mass, unchanged liquid momentum, material-specific jet impulse and grid reuse');
