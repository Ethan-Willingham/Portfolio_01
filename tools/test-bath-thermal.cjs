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
