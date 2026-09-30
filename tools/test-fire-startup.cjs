// Exercise the real loading gates with a deterministic clock and delayed devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/sluice/045-loading.js', 'utf8');
const flush = async () => { for (let i=0;i<16;i++) await Promise.resolve(); };

function fixture(waterDelay, fireDelay, search='') {
  let now=0, serial=0, canceled=0;
  const timers=new Map(), tasks=new Map(), errors=[];
  const s={ Promise, console, location:{search}, USE_WEBGPU_LIQUID:true, ENABLE_BATH:true,
    worldSnowEnabled:false, keys:{ArrowUp:true}, dpad:{}, touch:{}, player:{thrusting:true},
    document:{fonts:{load:async()=>[{}]}}, consoleBaySigs:[], moonImagePromise:Promise.resolve(),
    moonImageReady:true, moonTexW:1024, moonTexH:512, jelloWGPU:null, smokeWGPU:null,
    window:{SluiceLoading:{task(id,state,detail){tasks.set(id,{state,detail});},environment(){},
      active(){return true;},fail(message,id){errors.push({message,id});tasks.set(id,{state:'error',detail:message});}}},
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
    if(!canceled)s.hearthFireGPU={available:true,failed:false,errors:[]};
  });
  vm.createContext(s);vm.runInContext(source,s);
  s.prepareLoadingAssets();
  return {s,tasks,errors,get canceled(){return canceled;},async advance(ms){
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

  const coldFire=fixture(100,20000);
  await coldFire.advance(10000);
  assert.equal(coldFire.canceled,0,'first-use compilation must survive the former eight-second cutoff');
  assert.equal(coldFire.s.gameLoadingAssetsReady,false);
  await coldFire.advance(10100);
  assert.equal(coldFire.tasks.get('fire').state,'done');
  assert.equal(coldFire.s.requireFireGPU(),true);
  console.log('PASS twenty-second GPU fire compilation stays on GPU');

  const coldWater=fixture(20000,100);
  await coldWater.advance(20100);
  assert.equal(coldWater.tasks.get('water').state,'done');
  assert.equal(coldWater.tasks.get('fire').state,'done');
  console.log('PASS slow GPU water startup keeps the shared device');

  const hungWater=fixture(Infinity,0);
  await hungWater.advance(60000);
  assert.equal(hungWater.s.gameLoadingAssetsReady,true,'failed water must settle the dependent fire gate');
  assert.equal(hungWater.tasks.get('water').state,'error');
  assert.equal(hungWater.tasks.get('fire').state,'error');
  assert.equal(hungWater.s.gamePhysicsBlocked,true);
  assert.equal(hungWater.canceled,1);
  console.log('PASS unavailable water blocks ordinary play within its deadline');

  const hungFire=fixture(100,Infinity);
  await hungFire.advance(60099);
  assert.equal(hungFire.canceled,0);
  await hungFire.advance(1);
  assert.equal(hungFire.canceled,1);
  assert.equal(hungFire.tasks.get('fire').state,'error');
  assert.equal(hungFire.s.gameLoadingAssetsReady,true);
  assert.equal(hungFire.s.gamePhysicsBlocked,true);
  assert.equal(hungFire.s.introPhase,'blocked');
  assert.equal(hungFire.s.keys.ArrowUp,false);
  console.log('PASS stalled fire compilation blocks play without CPU fallback');

  const lateFire=fixture(100,65000);
  await lateFire.advance(65100);
  assert.equal(lateFire.canceled,1);
  assert.equal(lateFire.s.hearthFireGPU,null,'late completion cannot resurrect the canceled solver');
  assert.equal(lateFire.tasks.get('fire').state,'error');

  const explicitCPU=fixture(100,Infinity,'?cpufire=1');
  await explicitCPU.advance(60100);
  assert.equal(explicitCPU.tasks.get('fire').state,'fallback');
  assert.equal(explicitCPU.s.gamePhysicsBlocked,false,'explicit diagnostic selection remains available');
  assert.equal(explicitCPU.s.requireFireGPU(),true);
  console.log('PASS explicit CPU diagnostic selection remains available');

  coldFire.s.hearthFireGPU.failed=true;
  assert.equal(coldFire.s.requireFireGPU(),false);
  assert.equal(coldFire.s.gamePhysicsBlocked,true);
  coldWater.s.liquidWGPU.simActive=false;
  assert.equal(coldWater.s.requireWaterGPU(),false,'rain worlds also block water device loss');
  assert.equal(coldWater.s.gamePhysicsBlocked,true);
  console.log('PASS device loss blocks both GPU physics paths');

  const save=fs.readFileSync('js/sluice/047-save.js','utf8');
  const start=save.indexOf('  function saveNow('),end=save.indexOf('\n  function ',start+1);
  const saved={SAVE_DISABLED:false,gamePhysicsBlocked:true,localStorage:{setItem(){throw Error('Must not overwrite save');}}};
  vm.createContext(saved);vm.runInContext(save.slice(start,end),saved);
  assert.equal(saved.saveNow('unload'),false);
  console.log('PASS blocked GPU physics cannot overwrite a save on unload');
})().catch(error=>{console.error(error);process.exitCode=1;});
