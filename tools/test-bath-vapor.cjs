// Continuous evaporation-fed steam: mass reservoir, air motion and bounded work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const s = { Math, Float32Array, Uint8Array, bathMode:true, isMobile:false,
  bathThermal:{x0:0,y0:0,dx:80,dy:40,vapor:[],surface:new Float32Array(12).fill(80),
    surfaceCell:new Int16Array(12).fill(24),vx:new Float32Array(72)} };
const code=fs.readFileSync('js/sluice/074-bath-vapor.js','utf8');
const api=new Function('env', 'var bathMode=env.bathMode,isMobile=env.isMobile,bathThermal=env.bathThermal;'+code+';return {bathThermalVaporTick,bathThermalVaporEmit,bathVaporClear,setMode(v){bathMode=v},get bathVapor(){return bathVapor}};')(s);
Object.assign(s,api);Object.defineProperty(s,'bathVapor',{get:()=>api.bathVapor});
for(let i=0;i<60;i++)s.bathThermalVaporTick(1/60);
assert.equal(s.bathVapor,null,'cold empty sources allocate no field');
let supplied=0;
const start=performance.now();
for(let i=0;i<1200;i++){
  if(i%30===0){s.bathThermalVaporEmit(5,1,80);supplied+=.01;}
  s.bathThermalVaporTick(1/60);
}
const ms=performance.now()-start,f=s.bathVapor;
const queued=s.bathThermal.vapor.reduce((n,p)=>n+p.mass,0);
assert(Math.abs(f.emittedKg+queued-supplied)<1e-10,'emission exactly debits real evaporated mass');
assert.equal(f.steps,600,'air solver has its own bounded30Hz clock');
for(const a of [f.u,f.v,f.mist,f.heat])assert(Array.from(a).every(Number.isFinite),'finite steam transport');
assert(f.mist.every(v=>v>=0)&&f.heat.every(v=>v>=0),'transport retains positive density and heat');
let rising=0,curl=0;
for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
 const k=y*f.w+x;
 if(f.y+y*f.cell<35)rising+=f.mist[k];
 curl+=Math.abs(f.curl[k]);
 if(f.solid[k])assert.equal(f.mist[k],0,'mist stays above liquid');
}
assert(rising>.1,'buoyant vapor travels at least45worldpixels above surface');
assert(curl>.1,'airflow develops rotational motion');
api.setMode(false);const steps=f.steps;s.bathThermalVaporTick(1);assert.equal(f.steps,steps,'outdoor work stays asleep');
s.bathVaporClear();assert.equal(s.bathVapor,null);assert.equal(s.bathThermal.vapor.length,0);
console.log('PASS evaporation reservoir conserves mass, mist rises/curls above water, no outdoor work');
console.log(JSON.stringify({cells:f.w*f.h,meanStepMs:ms/f.steps,rising,curl,emittedKg:f.emittedKg}));
