// Exercise the real loading gates with a deterministic clock and delayed devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/sluice/045-loading.js', 'utf8');
const flush = async () => { for (let i=0;i<16;i++) await Promise.resolve(); };

function fixture(waterDelay, fireDelay) {
  let now=0, serial=0, canceled=0;
  const timers=new Map(), tasks=new Map();
  const s={ Promise, console, location:{search:''}, USE_WEBGPU_LIQUID:true,
    document:{fonts:{load:async()=>[{}]}}, consoleBaySigs:[], moonImagePromise:Promise.resolve(),
    moonImageReady:true, moonTexW:1024, moonTexH:512, jelloWGPU:null, smokeWGPU:null,
    window:{SluiceLoading:{task(id,state,detail){tasks.set(id,{state,detail});},environment(){}}},
    setTimeout(fn,ms){const id=++serial;timers.set(id,{at:now+ms,fn});return id;},
    clearTimeout(id){timers.delete(id);},
    hearthFireCancel(){canceled++;s.hearthFireGPU=null;}
  };
  const delay=ms=>new Promise(resolve=>{if(ms!==Infinity)s.setTimeout(resolve,ms);});
  const water={available:false,simActive:false,failed:false,dispose(){}};
  s.liquidWGPU=water;
  water.readyPromise=delay(waterDelay).then(()=>{water.available=water.simActive=true;});
  s.hearthFireGPU=null;
  s.hearthFireReady=water.readyPromise.then(()=>delay(fireDelay)).then(()=>{
    if(!canceled)s.hearthFireGPU={available:true};
  });
  vm.createContext(s);vm.runInContext(source,s);
  s.prepareLoadingAssets();
  return {s,tasks,get canceled(){return canceled;},async advance(ms){
    await flush();const target=now+ms;
    while(true){
      const next=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();
    }
    now=target;await flush();
  }};
}

(async()=>{
  const slow=fixture(6500,3000);
  await slow.advance(8500);
  assert.equal(slow.canceled,0,'waiting for water must not spend the fire compilation deadline');
  assert.equal(slow.s.gameLoadingAssetsReady,false,'keep the cover until fire is ready');
  await slow.advance(1000);
  assert.equal(slow.tasks.get('fire').state,'done');
  assert.equal(slow.s.gameLoadingAssetsReady,true);
  console.log('PASS slow shared-device startup preserves GPU fire');

  const hungWater=fixture(Infinity,0);
  await hungWater.advance(8000);
  assert.equal(hungWater.s.gameLoadingAssetsReady,true,'failed water must not strand the dependent fire gate');
  assert.equal(hungWater.tasks.get('fire').state,'fallback');
  assert.equal(hungWater.canceled,1);
  console.log('PASS unavailable water selects fallback within its deadline');

  const hungFire=fixture(100,Infinity);
  await hungFire.advance(8099);
  assert.equal(hungFire.canceled,0);
  await hungFire.advance(1);
  assert.equal(hungFire.canceled,1);
  assert.equal(hungFire.tasks.get('fire').state,'fallback');
  assert.equal(hungFire.s.gameLoadingAssetsReady,true);
  console.log('PASS stalled fire compilation retains a bounded fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
