// Conserved reduced-order bath thermal model, independent of rendering/backend.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture(type = 0, n = 100) {
  const s = { console, Math, bathMode: true, bathRoomReady: true, bathHeat: 0, bathWater: 0,
    BATH_FLOORS: [{ tubs: [[]] }], hearthBeds: {boiler: {thermalKW: 0}},
    liquidX: [], liquidY: [], liquidVX: [], liquidVY: [], liquidType: [], liquidCount: 0,
    mineralLiquidParked: {}, liquidWGPU: null, liquidToolSync() {},
    bathTubCurve: () => ({x0:0,x1:120,y0:0,D:60,depthAt:()=>60}), bathWaterline:()=>0 };
  s.removeLiquidParticle = i => {for(const k of ['liquidX','liquidY','liquidVX','liquidVY','liquidType']) s[k].splice(i,1);s.liquidCount--;};
  vm.createContext(s); vm.runInContext(fs.readFileSync('js/sluice/074-bath-thermal.js','utf8'),s);
  for(let y=0;y<6;y++)for(let x=0;x<12;x++)for(let k=0;k<n;k++) {
    s.liquidX.push(x*10+5);s.liquidY.push(-16+(y+.5)*80/6);s.liquidVX.push(0);s.liquidVY.push(0);s.liquidType.push(type);s.liquidCount++;
  }
  s.bathWater=s.liquidCount;s.bathThermalSample();
  s.step = sec=>{for(let i=0;i<Math.round(sec/.05);i++)s.bathThermalStep(.05);};
  return s;
}
const total = s => s.bathThermal.energy.reduce((a,b)=>a+b,0);
function close(a,b,msg) {assert(Math.abs(a-b)<Math.max(1e-7,Math.abs(b)*1e-8),`${msg}: ${a} versus ${b}`);}
{
 const s=fixture();s.step(120);
 close(s.bathThermal.meanC,20,'cold bath remains ambient');assert.equal(s.bathThermal.evaporatedKg,0);assert.equal(s.bathThermal.vapor.length,0);
 assert.equal(s.bathThermalForce(40,20,0),0);console.log('PASS cold water never heats, evaporates, steams or convects without energy');
}
{
 const s=fixture();const t=s.bathThermal;t.energy[24]=t.capacity[24]*70;t.energy[25]=t.capacity[25]*10;
 const before=total(s);for(let i=0;i<100;i++)s.bathThermalMixPair(24,25,.05,false);
 close(total(s),before,'pair mixing preserves energy');assert(t.energy[24]/t.capacity[24] > t.energy[25]/t.capacity[25]);
 console.log('PASS diffusion conserves heat and never reverses temperature differences');
}
{
 const s=fixture();s.hearthBeds.boiler.thermalKW=2;s.step(50);const t=s.bathThermal;
 assert(t.meanC>30 && t.meanC<100);assert(t.copperC>t.meanC);assert(t.temperature[60]>t.temperature[0]);
 const accounted=total(s)+(t.copperC-20)*s.BATH_COPPER_CAPACITY+t.airLossKJ+t.latentKJ+t.vaporSensibleKJ;
 close(accounted,t.inputKJ,'input equals stored plus released energy');
 assert(s.bathThermalForce(50,50,0)>0);assert.equal(s.bathThermalForce(50,50,5),0,'snow receives no heat force');
 assert.equal(s.bathThermalForce(-10,50,0),0,'world water outside the bath receives no force');
 console.log('PASS actual fire energy heats copper then bottom water with a closed energy budget');
 const e=total(s), cap=t.totalCapacity;
 for(let i=0;i<1000;i++){s.liquidX.push(50);s.liquidY.push(20);s.liquidVX.push(0);s.liquidVY.push(0);s.liquidType.push(0);s.liquidCount++;}
 s.bathThermalSample();close(total(s),e,'cold inflow adds no energy');assert(t.totalCapacity>cap);
 console.log('PASS cold additions dilute rather than reset water heat');
 const saved=JSON.parse(JSON.stringify(s.bathThermalSave()));s.bathThermalRestore(saved,0);
 close(total(s),e,'save restores heat');close(s.bathThermal.copperC,saved.copperC,'save restores copper');
 console.log('PASS thermal save roundtrip preserves energy and copper inertia');
}
{
 const s=fixture();s.hearthBeds.boiler.thermalKW=4;s.step(120);const t=s.bathThermal;
 assert(t.evaporatedKg>0);close(7200-s.liquidCount,t.evaporatedKg*100,'evaporation removes exact real particles');
 close(t.latentKJ,t.evaporatedKg*2257,'vaporization pays latent heat');assert(t.vapor.length>0);
 console.log('PASS heated water loses real mass, pays latent heat and generates matching vapor');
}
{
 const s=fixture(1);s.hearthBeds.boiler.thermalKW=4;s.step(120);
 assert(s.bathThermal.meanC>20);assert.equal(s.bathThermal.evaporatedKg,0);assert.equal(s.bathThermal.vapor.length,0);
 const snow=fixture(5);snow.hearthBeds.boiler.thermalKW=4;snow.step(10);assert.equal(snow.bathThermal.totalCapacity,0);
 assert.equal(snow.liquidCount,7200);console.log('PASS oils never become water vapor and snow is excluded from heating and evaporation');
}
{
 const s=fixture();s.bathThermalRestore(null,.5);s.bathThermalSample();s.step(.05);assert(s.bathThermal.meanC>33);
 console.log('PASS old normalized warmth migrates once without inventing water');
}

{
 const s=fixture();s.bathThermalOnPour(0,100,60,50,-20);s.bathThermalSample();close(total(s),0,'unarrived inlet adds no heat');
 for(let i=0;i<100;i++){s.liquidX.push(50);s.liquidY.push(20);s.liquidVX.push(0);s.liquidVY.push(0);s.liquidType.push(0);s.liquidCount++;}
 s.bathThermalSample();close(total(s),100*.0418*40,'actual warm inlet carries its sensible energy');
 s.bathThermalOnPour(0,100,60,200,-20);assert.equal(s.bathThermal.pendingInlets.length,0);
 console.log('PASS hot stored liquid heats only after actual same-material arrival, never across the room');
}

{
 const s=fixture();s.hearthBeds.boiler.thermalKW=Infinity;s.step(1);close(s.bathThermal.meanC,20,'invalid power adds no heat');
 s.bathThermalOnPour(0,Infinity,60,50,0);s.bathThermalOnPour(0.5,10,60,50,0);assert.equal(s.bathThermal.pendingInlets.length,0);
 s.bathThermalTick(NaN);assert(Number.isFinite(s.bathThermal.simAcc));
 for(let i=0;i<1200;i++)s.liquidType[i]=1;
 s.bathThermalSample();assert(s.bathThermal.covered.every(i=>i===1),'oil surface shields underlying water');
 s.bathThermal.energy.set(s.bathThermal.capacity.map(c=>c*85));s.step(.2);
 assert(s.bathThermal.evaporatedKg>0,'covered water still boils rather than storing unbounded superheat');
 console.log('PASS corrupt inputs add no heat, covering oil blocks surface evaporation but permits boiling');
}

{
 const s=fixture();s.bathThermal.energy.set(s.bathThermal.capacity.map(c=>c*20));s.bathThermal.temperature.fill(40);
 const before=total(s);for(let i=0;i<3600;i++)s.removeLiquidParticle(s.liquidCount-1);
 s.bathThermalSample();close(total(s)+s.bathThermal.outflowKJ,before,'spilled water carries sensible energy');
 assert(s.bathThermal.outflowKJ>0);console.log('PASS outflow energy is accounted rather than heating remaining water');
}
{
 const s=fixture(0,0);s.bathMode=false;s.bathRoomReady=false;
 let samples=0,uploads=0;const sample=s.bathThermalSample;
 s.bathThermalSample=()=>{samples++;return sample();};s.liquidWGPU={setBathThermal(){uploads++;}};
 for(let i=0;i<120;i++)s.bathThermalTick(1/60);
 s.bathRoomReady=true;for(let i=0;i<120;i++)s.bathThermalTick(1/60);
 assert.equal(samples,0);assert.equal(uploads,0,'unused outdoor bath does not touch GPU thermal state');
 s.bathPour=100;for(let i=0;i<120;i++)s.bathThermalTick(1/60);
 assert(samples>=2&&samples<=3,'pending cold pour still gets bounded outdoor mass samples');
 s.bathPour=0;s.bathSilos={pending:[0,10,0,0,0]};s.bathThermal.sampleT=0;const before=samples;s.bathThermalTick(1/60);
 assert.equal(samples,before+1,'typed silo queue cannot be mistaken for a dry idle bath');
 s.bathSilos.pending.fill(0);s.bathMode=true;s.bathThermal.sampleT=99;s.bathThermalTick(1/60);
 assert.equal(samples,before+2,'entry immediately refreshes bath mass');
 console.log('PASS unused outdoor bath does no scan/upload, pending pours remain sampled, entry refreshes immediately');
}
{
 const s=fixture();const uploads=[];s.liquidWGPU={setBathThermal(data){uploads.push(data===null?'clear':'field');}};
 s.bathThermalUpload();assert.deepEqual(uploads,['field']);s.bathMode=false;
 for(let i=0;i<120;i++){s.bathThermalTick(1/60);s.bathThermalUpload();}
 assert.deepEqual(uploads,['field','clear'],'exit clears once, including repeated arm calls outside');
 s.bathMode=true;s.bathThermalUpload();s.bathThermalReset();s.bathThermalUpload();
 assert.deepEqual(uploads,['field','clear','field','clear'],'reset clears stale active GPU field');
 console.log('PASS leaving or resetting clears GPU thermal state once, with no outdoor per-frame upload');
}
{
 const s=fixture(0,0);s.liquidCount=20000;s.liquidType=new Uint8Array(20000);s.liquidX=new Float32Array(20000).fill(500);s.liquidY=new Float32Array(20000).fill(-100);
 s.liquidVX=new Float32Array(20000);s.liquidVY=new Float32Array(20000);
 s.bathTubCurve=()=>({x0:0,x1:120,y0:0,D:60,depthAt(){throw new Error('outdoor particle reached the expensive basin curve');}});
 s.mineralLiquidParked['10:10']=new Proxy([],{get(){throw new Error('unrelated parked bin was inspected');}});
 s.bathThermalSample();assert.equal(s.bathThermal.totalCapacity,0);
 console.log('PASS world particles reject before curve evaluation and unrelated parked bins stay untouched');
}
{
 const s=fixture();const initial=s.liquidCount;s.mineralLiquidParked={};
 for(let i=0;i<s.liquidCount;i++){const x=s.liquidX[i],y=s.liquidY[i],key=Math.floor(x/256)+':'+Math.floor(y/256);(s.mineralLiquidParked[key]??=[]).push(0,x,y);}
 s.liquidCount=0;for(const key of ['liquidX','liquidY','liquidVX','liquidVY','liquidType'])s[key]=[];
 s.bathMode=false;s.hearthBeds.boiler.thermalKW=4;let samples=0;const sample=s.bathThermalSample;s.bathThermalSample=()=>{samples++;return sample();};
 for(let i=0;i<2400;i++)s.bathThermalTick(.05);
 const t=s.bathThermal,remaining=Object.values(s.mineralLiquidParked).reduce((n,p)=>n+p.length/3,0);
 assert(samples>=115&&samples<=122,'outdoor mass census stays near 1 Hz while 120 seconds of heat advance');
 assert(t.evaporatedKg>0);close(initial-remaining,t.evaporatedKg*100,'parked evaporation removes exact water');
 close(total(s)+(t.copperC-20)*s.BATH_COPPER_CAPACITY+t.airLossKJ+t.latentKJ+t.vaporSensibleKJ+t.outflowKJ,t.inputKJ+t.inletKJ,'offscreen energy ledger stays closed');
 console.log('PASS 1 Hz outdoor sampling preserves 20 Hz heating, parked evaporation and the full energy budget');
}
