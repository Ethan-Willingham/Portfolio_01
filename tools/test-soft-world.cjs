// Local constitutive and coupling checks. Browser integration is tested separately.
// WORLD_FRAGMENT=/tmp/slime-world-resume/346-soft-world.js node tools/test-soft-world.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.WORLD_FRAGMENT || path.join(__dirname, '../js/sluice/346-soft-world.js'), 'utf8');
let checks = 0;
function context() {
  const c = { SOFT_WORLD: true, JELLO_TIMESCALE: 0.5, JELLO_H: 1/240, jelloStepH: 1/720,
    SOFT_CONTACT_POINT_MASS: 0.09, SOFT_CONTACT_RIG_MASS: 3,
    TILE: 32, JELLO_NPT: 3, JELLO_MASS_RATIO: 0.5, GRAVITY: 600, JELLO_JET_REACT_CAP: 1.4,
    JELLO_JET_LEN: 128, JELLO_JET_RANGE: 76.8, JELLO_JET_R0: 7, JELLO_JET_TAN: 0.45,
    jelloJetOn: false, jelloJetOX: 0, jelloJetOY: -45, jelloJetDX: 0, jelloJetDY: 1,
    LIQUID_CELL: 2.5, LIQUID_PDELTA: 0.5, LIQUID_TIMESCALE: 1, liquidMutationSeq: 0, liquidCount: 0,
    liquidX: [], liquidY: [], liquidVX: [], liquidVY: [], liquidType: [], liquidFrozen: [],
    liquidSleeping: [], liquidRestFrames: [], liquidWGPU: null,
    LIQUID_DBG_READBACK: 20, simNominal: 1/60, ENABLE_JELLO: true, bathMode: false, gamePaused: false,
    jelloBodies: [], jelloBodyOnCamera: b => !b.frozen,
    player: { vx: 0, vy: 0 }, gameOver: false, gameWon: false, performance: { now: () => 0 },
    jelloWorldSolidAt: () => false, liquidWorldSolidAt: () => false };
  vm.createContext(c); vm.runInContext(source, c); return c;
}
function body(cx=0, cy=0, radius=12, n=16) {
  const b = { surfaceSlime: {}, n: n+1, ringN: n, ring: [], ringSign: 1, spacing: 8,
    px: [], py: [], ox: [], oy: [], bboxL: cx-radius, bboxR: cx+radius,
    bboxT: cy-radius, bboxB: cy+radius, sleeping: false, sleepFrames: 0, _solve: true };
  for (let i=0; i<n; i++) { const a=i*Math.PI*2/n; b.ring.push(i); b.px.push(cx+radius*Math.cos(a)); b.py.push(cy+radius*Math.sin(a)); }
  b.px.push(cx); b.py.push(cy); b.ox=b.px.slice(); b.oy=b.py.slice(); return b;
}
function addWater(c, x, y, vx, vy, type=0) {
  c.liquidX.push(x); c.liquidY.push(y); c.liquidVX.push(vx); c.liquidVY.push(vy);
  c.liquidType.push(type); c.liquidFrozen.push(0); c.liquidSleeping.push(0); c.liquidRestFrames.push(0); c.liquidCount++;
}
function fillWater(c, vx=0, vy=0) { for (let y=-32; y<32; y+=1.25) for (let x=-32; x<32; x+=1.25) addWater(c,x,y,vx,vy); }
function velocities(b,h) { return b.px.map((x,i) => [(x-b.ox[i])*0.5/h, (b.py[i]-b.oy[i])*0.5/h]); }
function momentum(b,h) { return velocities(b,h).reduce((out,v)=>[out[0]+v[0],out[1]+v[1]],[0,0]); }
function close(a,b,e=1e-9) { assert.ok(Math.abs(a-b)<=e, `${a} ~= ${b}`); }
function check(name, run) { run(); checks++; console.log('PASS '+name); }
check('disabled feature and nonresident bodies are exact no-ops', () => {
  for (const disabled of [true,false]) { const c=context(),b=body(); fillWater(c,80,20); c.jelloJetOn=true;
    if(disabled)c.SOFT_WORLD=false; else delete b.surfaceSlime;
    const before=JSON.stringify(b); c.softWorldFrame([b],1,1/60); c.softWorldStep(b,1/720); c.softWorldWaterCPU(b); c.softWorldFinish();
    assert.equal(JSON.stringify(b),before); assert.deepEqual(c.player,{vx:0,vy:0}); }
});
check('still water cannot add kinetic energy', () => {
  const c=context(),b=body(),h=1/720; fillWater(c);
  for(let i=0;i<b.n;i++){b.ox[i]-=(65-i*2)*h/0.5;b.oy[i]-=(-25+i*3)*h/0.5;}
  c.softWorldFrame([b],1,1/60); const before=velocities(b,h); c.softWorldStep(b,h); const after=velocities(b,h);
  for(let i=0;i<b.ringN;i++) assert.ok(after[i][0]**2+after[i][1]**2<=before[i][0]**2+before[i][1]**2+1e-8);
  assert.deepEqual(after[b.ringN],before[b.ringN]);
});
check('relative drag does nothing when skin and flow have equal velocity', () => {
  const c=context(),b=body(),h=1/720; fillWater(c,110,-40);
  for(let i=0;i<b.n;i++){b.ox[i]-=110*h/0.5;b.oy[i]+=40*h/0.5;}
  c.softWorldFrame([b],1,1/60); const before=velocities(b,h); c.softWorldStep(b,h);
  velocities(b,h).forEach((v,i)=>{close(v[0],before[i][0],1e-9);close(v[1],before[i][1],1e-9);});
});
check('sampled currents use real velocity across different liquid clocks', () => {
  for(const scale of [0.5,1.38366702,2.3]) {
    const c=context(),b=body(),h=1/720;c.LIQUID_TIMESCALE=scale;fillWater(c,110/scale,-40/scale);
    for(let i=0;i<b.n;i++){b.ox[i]-=110*h/c.JELLO_TIMESCALE;b.oy[i]+=40*h/c.JELLO_TIMESCALE;}
    c.softWorldFrame([b],1,1/60);const before=velocities(b,h);c.softWorldStep(b,h);
    velocities(b,h).forEach((v,i)=>{close(v[0],before[i][0],1e-9);close(v[1],before[i][1],1e-9);});
  }
});
check('opposite local currents produce opposite skin impulses', () => {
  const c=context(),b=body(),h=1/720;
  for(let y=-32;y<32;y+=1.25)for(let x=-32;x<32;x+=1.25)addWater(c,x,y,x<0?-100:100,0);
  c.softWorldFrame([b],1,1/60); c.softWorldStep(b,h); const v=velocities(b,h);
  assert.ok(v[0][0]>0);assert.ok(v[8][0]<0);close(v[b.ringN][0],0);
});
check('water drag is rate independent on a frozen material patch', () => {
  const speeds=[];
  for(const steps of [60,120,360]){const c=context(),b=body(),h=0.5/steps;fillWater(c,100,0);c.softWorldFrame([b],1,1);
    for(let i=0;i<steps;i++)c.softWorldStep(b,h);speeds.push(velocities(b,h)[0][0]);}
  close(speeds[0],speeds[1],1e-8);close(speeds[1],speeds[2],1e-8);
});
check('moving water wakes a sleeping resident away from the player', () => {
  const c=context(),b=body();fillWater(c,80,0);b.sleeping=true;b._solve=false;b.sleepFrames=99;
  c.softWorldFrame([b],1,1/60);assert.equal(b.sleeping,false);assert.equal(b._solve,true);assert.equal(b.sleepFrames,0);
});
check('appearing or disappearing hydrostatic support wakes a sleeper once, including still or stale water', () => {
  const c=context(),b=body();fillWater(c);c.softWorldFrame([b],1,1/60);
  const sleep=()=>{b.sleeping=true;b._solve=false;b.sleepFrames=99;};
  const awake=()=>{assert.equal(b.sleeping,false);assert.equal(b._solve,true);assert.equal(b.sleepFrames,0);};
  sleep();b.bathBuoy={line:0,x0:-20,x1:20,lift:2.2,drag:0.985};
  c.softWorldFrame([b],1,1/60);awake();
  sleep();c.softWorldFrame([b],1,1/60);assert.equal(b.sleeping,true);
  c.liquidWGPU={simActive:true,readbackApplyGen:1,getReadbackAge:()=>1};
  c.softWorldFrame([b],1,1/60);assert.equal(b.sleeping,true);assert.equal(c.softWorldWaterBins.size,0);
  b.bathBuoy.line=-10;c.softWorldFrame([b],1,1/60);awake();
  sleep();c.softWorldFrame([b],1,1/60);assert.equal(b.sleeping,true);
  b.bathBuoy=null;c.liquidCount=0;c.softWorldFrame([b],1,1/60);awake();
  sleep();c.softWorldFrame([b],1,1/60);assert.equal(b.sleeping,true);
});
check('hydrostatic fields that miss the body do not wake it', () => {
  const c=context(),b=body();b.sleeping=true;b._solve=false;b.sleepFrames=99;
  for(const buoy of [{line:30,x0:-20,x1:20,lift:2.2},{line:0,x0:30,x1:50,lift:2.2}]) {
    b.bathBuoy=buoy;c.softWorldFrame([b],1,1/60);assert.equal(b.sleeping,true);assert.equal(b._solve,false);
  }
});
check('GPU flow mirrors expire and refresh by generation', () => {
  const c=context(),b=body();fillWater(c,80,0);let age=0;c.liquidWGPU={simActive:true,readbackApplyGen:1,getReadbackAge:()=>age};
  c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,80);
  c.liquidVX.fill(120);c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,80);
  c.liquidWGPU.readbackApplyGen++;c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,120);
  age=0.101;c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleWet,0);
});
check('GPU mirrors without a finite capture age and generation do not exert force or wake sleepers', () => {
  for(const age of [NaN,Infinity,-1,undefined,0.101]) {
    const c=context(),b=body();fillWater(c,80,0);b.sleeping=true;b._solve=false;b.sleepFrames=99;
    c.liquidWGPU={simActive:true,readbackApplyGen:1,getReadbackAge:()=>age};
    const before=JSON.stringify(b);c.softWorldFrame([b],1,1/60);c.softWorldStep(b,1/720);
    assert.equal(JSON.stringify(b),before);assert.equal(c.softWorldWaterBins.size,0);
  }
  for(const generation of [undefined,NaN,Infinity]) {
    const c=context(),b=body();fillWater(c,80,0);
    c.liquidWGPU={simActive:true,readbackApplyGen:generation,getReadbackAge:()=>0};
    c.softWorldFrame([b],1,1/60);assert.equal(c.softWorldWaterBins.size,0);
  }
});
check('GPU flow freshness is measured in real seconds across liquid clocks', () => {
  for(const scale of [0.5,1.38366702,2.3])for(const realAge of [0.09,0.101]) {
    const c=context(),b=body();fillWater(c,80,0);c.LIQUID_TIMESCALE=scale;
    c.liquidWGPU={simActive:true,readbackApplyGen:1,getReadbackAge:()=>realAge*scale};
    c.softWorldFrame([b],1,1/60);assert.equal(c.softWorldWaterBins.size>0,realAge<0.1);
  }
});
check('wet resident GPU cadence is scoped and restores the live user setting', () => {
  const c=context(),b=body(),calls=[],secondCalls=[];
  const first={simActive:true,setSimParam:(...args)=>calls.push(args)};
  const second={simActive:true,setSimParam:(...args)=>secondCalls.push(args)};
  c.liquidWGPU=first;c.jelloBodies=[b];
  c.softWorldReadbackPrepare();assert.equal(calls.length,0);
  b.surfaceSlime.wet=1;c.SOFT_WORLD=false;c.softWorldReadbackPrepare();assert.equal(calls.length,0);
  c.SOFT_WORLD=true;b.frozen=true;c.softWorldReadbackPrepare();assert.equal(calls.length,0);
  b.frozen=false;c.softWorldReadbackPrepare();assert.deepEqual(calls,[['DBG_READBACK_EVERY',2]]);close(c.LIQUID_DBG_READBACK,20);
  c.softWorldReadbackPrepare();assert.equal(calls.length,1);
  c.LIQUID_DBG_READBACK=37;c.softWorldReadbackPrepare();assert.equal(calls.at(-1)[1],2);close(c.LIQUID_DBG_READBACK,37);
  c.liquidWGPU=second;c.softWorldReadbackPrepare();assert.equal(calls.at(-1)[1],37);assert.equal(secondCalls.at(-1)[1],2);
  c.bathMode=true;c.softWorldReadbackPrepare();assert.equal(secondCalls.at(-1)[1],37);
  c.bathMode=false;c.softWorldReadbackPrepare();assert.equal(secondCalls.at(-1)[1],2);
  c.jelloBodies=[];c.softWorldReadbackPrepare();assert.equal(secondCalls.at(-1)[1],37);
  c.jelloBodies=[b];c.softWorldReadbackPrepare();assert.equal(secondCalls.at(-1)[1],2);
  c.SOFT_WORLD=false;c.softWorldReadbackPrepare();assert.equal(secondCalls.at(-1)[1],37);
});
check('GPU cache invalidates on mirror identity and particle mutation, while CPU arrays refresh every frame', () => {
  const c=context(),b=body();fillWater(c,80,0);
  c.liquidWGPU={simActive:true,readbackApplyGen:1,getReadbackAge:()=>0};
  c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,80);
  c.liquidVX=c.liquidVX.map(()=>120);
  c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,120);
  c.liquidVX.fill(-40);c.liquidMutationSeq++;
  c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,-40);
  c.liquidType=c.liquidType.map(()=>1);
  c.softWorldFrame([b],1,1/60);assert.equal(c.softWorldWaterBins.size,0);
  c.liquidType=c.liquidType.map(()=>0);c.liquidFrozen=c.liquidFrozen.map(()=>1);
  c.softWorldFrame([b],1,1/60);assert.equal(c.softWorldWaterBins.size,0);
  c.liquidFrozen=c.liquidFrozen.map(()=>0);c.liquidWGPU.simActive=false;
  c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,-40);
  c.liquidVX.fill(25);c.softWorldFrame([b],1,1/60);c.softWorldWaterSample(0,0);close(c.softWorldSampleX,25);
});
check('dry, oil-only, frozen, and invalid particles do not create water forces', () => {
  const c=context(),b=body();addWater(c,0,0,100,0,1);addWater(c,2,0,100,0);c.liquidFrozen[1]=1;addWater(c,3,0,NaN,0);
  const before=JSON.stringify(b);c.softWorldFrame([b],1,1/60);c.softWorldStep(b,1/720);assert.equal(JSON.stringify(b),before);
});
check('jets change velocity history but never relocate the material', () => {
  const c=context(),b=body(),h=1/720;c.jelloJetOn=true;c.softWorldFrame([b],1,1/60);
  const x=b.px.slice(),y=b.py.slice();c.softWorldStep(b,h);
  assert.deepEqual(b.px,x);assert.deepEqual(b.py,y);assert.ok(momentum(b,h)[1]>0);close(velocities(b,h)[b.ringN][1],0);
  const v=velocities(b,h);for(let i=0;i<b.ringN;i++)if(b.py[i]>1)close(v[i][1],0);
});
check('jet impulse and rig recoil conserve linear momentum', () => {
  const c=context(),b=body(),h=1/720;c.jelloJetOn=true;c.softWorldFrame([b],1,1/60);c.softWorldStep(b,h);c.softWorldFinish();
  const p=momentum(b,h),m=c.SOFT_CONTACT_POINT_MASS/c.SOFT_CONTACT_RIG_MASS;
  close(p[0]*m+c.player.vx,0);close(p[1]*m+c.player.vy,0,1e-9);
  const vy=c.player.vy;c.softWorldFinish();close(c.player.vy,vy);
});
check('jets share the rig-contact mass model for different patch spacings and rig masses', () => {
  for(const spacing of [5,8,14])for(const rigMass of [1.5,3,7])for(const angle of [0,0.7,2.3]) {
    const c=context(),b=body(),h=1/720;c.jelloJetOn=true;b.spacing=spacing;
    c.SOFT_CONTACT_RIG_MASS=rigMass;c.JELLO_MASS_RATIO=17;
    c.jelloJetDX=Math.sin(angle);c.jelloJetDY=Math.cos(angle);
    c.jelloJetOX=-45*c.jelloJetDX;c.jelloJetOY=-45*c.jelloJetDY;
    c.softWorldFrame([b],1,1/60);c.softWorldStep(b,h);c.softWorldFinish();
    const p=momentum(b,h);assert.ok(Math.hypot(...p)>0);
    close(p[0]*c.SOFT_CONTACT_POINT_MASS+c.player.vx*rigMass,0,1e-9);
    close(p[1]*c.SOFT_CONTACT_POINT_MASS+c.player.vy*rigMass,0,1e-9);
  }
});
check('jet pressure vanishes on skin already moving with or faster than exhaust', () => {
  for(const speed of [600,900]) {
    const c=context(),b=body(),h=1/720;c.jelloJetOn=true;
    for(let i=0;i<b.n;i++)b.oy[i]-=speed*h/c.JELLO_TIMESCALE;
    const before=JSON.stringify(b);c.softWorldFrame([b],1,1/60);c.softWorldStep(b,h);c.softWorldFinish();
    assert.equal(JSON.stringify(b),before);close(c.player.vy,0);
  }
});
check('terrain and nearer bodies shield rear residents from exhaust', () => {
  const c=context(),front=body(0,0),back=body(0,35),h=1/720;c.jelloJetOn=true;c.softWorldFrame([front,back],2,1/60);
  c.softWorldStep(back,h);close(momentum(back,h)[1],0);c.softWorldStep(front,h);assert.ok(momentum(front,h)[1]>0);
  const d=context(),blocked=body();d.jelloJetOn=true;d.jelloWorldSolidAt=(x,y)=>y>-30&&y<-25;
  d.softWorldFrame([blocked],1,1/60);d.softWorldStep(blocked,h);close(momentum(blocked,h)[1],0);
});
check('jet action and reaction share the same bounded force budget', () => {
  const c=context(),b=body(),h=1/720;c.jelloJetOn=true;c.softWorldFrame([b],1,1/60000);c.softWorldStep(b,h);c.softWorldFinish();
  close(-c.player.vy,c.JELLO_JET_REACT_CAP*c.GRAVITY/60000,1e-9);
  const p=momentum(b,h),m=c.SOFT_CONTACT_POINT_MASS/c.SOFT_CONTACT_RIG_MASS;close(p[1]*m+c.player.vy,0,1e-9);
});
check('CPU fluid boundary uses local edge velocity and preserves tangent flow', () => {
  for(const scale of [0.5,1,1.38366702,2.3]) {
  const c=context(),h=c.jelloStepH,b={...body(),n:4,ringN:4,ring:[0,1,2,3],px:[-10,10,10,-10],py:[-10,-10,10,10],
    ox:[-10,10,10,-10],oy:[-10,-10,10,10],bboxL:-10,bboxR:10,bboxT:-10,bboxB:10};
  c.LIQUID_TIMESCALE=scale;
  b.oy[0]+=30*h/0.5;b.oy[1]+=30*h/0.5;
  c.jelloPointInRing=()=>true;c.jelloNearestOnRing=(b,x,y)=>({x,y:-10});addWater(c,0,-9,55,40);
  c.softWorldWaterCPU(b);close(c.liquidVX[0],55);close(c.liquidVY[0]*scale,-30,1e-9);close(c.liquidY[0],-11.2);
  close(c.liquidCount,1);
  }
});
console.log(JSON.stringify({checks,passed:true}));
