// Storage identity and conservation through partial transfers, blocked nozzles and saves.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function fixture() {
  const s = { window: {}, siphon: { tank: [0, 0, 0, 0, 0, 0], capacity: 16000 }, bathSupplies: [0, 0, 0, 0, 0],
    liquidCatalog: ['Water','Oil','Brine','Nectar','Lumen','Snow'].map((name,id)=>({id,name,color:'#64b4cc'})),
    emitted: [0,0,0,0,0,0], limit: Infinity, heat: [],
    liquidToolEmit(type,count) { const sent = Math.min(count,s.limit);s.emitted[type]+=sent;return sent; },
    bathThermalOnPour(...values) { s.heat.push(values); }
  };
  vm.createContext(s);vm.runInContext(fs.readFileSync('js/sluice/074-bath-silos.js','utf8'),s);s.bathSiloReset();
  return s;
}
function ledger(s) { return Array.from({length:6},(_,t)=>(t<5?s.bathLiquidCount(t):s.siphon.tank[t])+s.emitted[t]); }
{
  const s=fixture();s.siphon.tank=[4000,0,3000,2000,1000,6000];
  const before=ledger(s);assert.equal(s.bathSiloDepositRig(),9000);
  assert.deepEqual(Array.from(s.bathSilos.tanks,t=>[t.type,t.count]),[[0,4000],[2,3000],[3,2000]]);
  assert.equal(s.siphon.tank[4],1000,'unallocated identity remains carried');
  assert.equal(s.siphon.tank[5],6000,'snow stays snow in its own pool');
  assert.equal(s.bathSiloDeposit(0,2),0,'cannot overwrite a different liquid');
  assert.equal(s.bathSiloDeposit(1,5),0,'snow is not a silo liquid');
  assert.deepEqual(ledger(s),before);
  s.siphon.tank[1]=8500;const second=ledger(s);
  assert.equal(s.bathSiloWithdraw(0),500,'withdrawal respects shared rig capacity including snow');
  assert.deepEqual(ledger(s),second);
  console.log('PASS multi-material transfer, incompatible fills and shared rig capacity');
}
{
  const s=fixture();s.siphon.tank[0]=16000;
  assert.equal(s.bathSiloDeposit(0,0),16000);s.siphon.tank[0]=16000;
  assert.equal(s.bathSiloDeposit(0,0),16000);s.siphon.tank[0]=100;
  assert.equal(s.bathSiloDeposit(0,0),0,'full320L tank does not consume carried excess');
  assert.equal(s.bathSiloDeposit(0,0,-10),0);
  assert.equal(s.bathSiloDeposit(99,0,10),0);
  assert.equal(s.bathSiloSelectLiquid(5),false);assert.equal(s.bathSiloSelect(0),true);
  console.log('PASS capacity, invalid requests and selected identity');
}
{
  const s=fixture();s.siphon.tank[2]=600;s.bathSiloDeposit(0,2);s.bathSilos.tanks[0].temp=80;
  const before=ledger(s);s.limit=0;
  assert.equal(s.bathSiloEmit(2,200,10,20,0,100),0);assert.equal(s.bathSilos.pending[2],200);
  assert.equal(s.heat.length,0,'blocked output does not inject heat');assert.deepEqual(ledger(s),before);
  s.limit=30;assert.equal(s.bathSiloEmit(2,200,10,20,0,100),30);
  assert.equal(s.bathSilos.pending[2],170);assert.deepEqual(Array.from(s.heat[0]),[2,30,80,10,20]);
  assert.deepEqual(ledger(s),before,'only actual solver acceptance leaves storage');
  s.bathSiloSelectLiquid(3);s.siphon.tank[3]=75;const mixed=ledger(s);
  s.limit=1000;assert.equal(s.bathSiloEmit(3,100,10,20,0,100),75);
  assert.equal(s.emitted[3],75);assert.equal(s.bathSilos.pending[2],170,'switching does not relabel queued brine');
  assert.deepEqual(ledger(s),mixed);
  console.log('PASS blocked/partial emission conservation, material switch and thermal transfer');
}
{
  const s=fixture();s.siphon.tank[0]=100;s.bathSiloDeposit(0,0);s.bathSilos.tanks[0].temp=80;
  s.siphon.tank[0]=100;assert.equal(s.bathSiloReserve(0,200),200);
  assert.equal(s.bathSilos.pendingHeat[0]/s.bathSilos.pending[0],50,'same material mixes at mass weighted temperature');
  const saved=JSON.parse(JSON.stringify(s.bathSiloSave())),before=ledger(s);s.bathSiloRestore(saved,0);
  assert.deepEqual(ledger(s),before,'new format reload preserves its typed pending water');
  assert.equal(s.bathSilos.pendingHeat[0],10000);
  assert.equal(s.bathSiloEmit(0,50,0,0,0,100),50);assert.equal(s.heat[0][2],50);
  console.log('PASS queued thermal energy and save round trip');
}
{
  const s=fixture();s.bathSupplies=[100000,1,2,3,4];s.siphon.tank[2]=700;
  s.bathSiloRestore(null,25);
  assert.equal(s.bathLiquidCount(0),100025);assert.equal(s.bathSupplies[0],4000);
  assert.equal(s.bathSupplies[1],1);assert.equal(s.bathLiquidCount(2),702);
  const before=ledger(s), saved=JSON.parse(JSON.stringify(s.bathSiloSave()));
  s.bathSiloRestore(saved,0);assert.deepEqual(ledger(s),before,'the migrated save clears legacy bathPour');
  const r=fixture();r.bathSiloRestore({version:1,tanks:[{type:4,count:50000,temp:45},null,null,{type:2,count:900,temp:30}]});
  assert.equal(r.bathLiquidCount(4),50000);assert.equal(r.bathSilos.tanks[0].count,32000);
  assert.equal(r.bathSilos.pending[4],18000);assert.equal(r.bathSilos.pending[2],900);
  assert.equal(r.bathSilos.pendingHeat[4],810000);
  console.log('PASS legacy migration, retained overflow and resized storage preservation');
}
{
  const s=fixture();s.BLD=new Proxy({},{get:()=> '#123456'});s.UI_FONT='monospace';
  const c=new Proxy({},{get:(_,key)=>key==='globalAlpha'?1:(...args)=>{for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),key+' argument');},set:()=>true});
  for (const w of [96,240,420]) {
    const rects=s.drawBathSilos(c,12,20,w,180,{labels:true});assert.equal(rects.length,3);
    assert.deepEqual(Array.from(rects,r=>r.action),['silo-0','silo-1','silo-2']);
    assert(rects[2].x+rects[2].w<=12+w+1e-9);
  }
  console.log('PASS reusable silo drawing and three hit rectangles');
}
{
  const s=fixture();s.siphon.tank[4]=200;s.bathSiloDeposit(0,4);s.bathSiloReserve(4,50);
  s.hearthDevSupplies=()=>true;
  const before=JSON.stringify({rig:s.siphon.tank,silos:s.bathSiloSave()});
  assert.equal(s.bathSiloEmit(4,80,0,0,0,0),80);
  assert.equal(JSON.stringify({rig:s.siphon.tank,silos:s.bathSiloSave()}),before,'developer flow never mints or consumes saved inventory');
  s.limit=0;assert.equal(s.bathSiloEmit(4,80,0,0,0,0),0);
  console.log('PASS virtual developer discharge preserves persistent stock');
}
{
  const s=fixture();Object.assign(s,{ENABLE_BATH:true,bathMode:false,bathFading:false,bathPickSite:()=>true,
    TILE:32,SKY_ROWS:4,COLS:320,DECK_LEFT_COL:149,DECK_RIGHT_COL:171,banyaX:175*32,BANYA_W:160,
    world:Array.from({length:6},()=>Array.from({length:320},()=>({type:'dirt',hp:1}))),
    surfacePonds:[],terrainClearedKinds:{},invalidateTerrainAround(){},player:{x:0,y:0},PLAYER_W:22,PLAYER_H:26});
  const r=s.bathSilosExteriorRect();assert.equal(r.x,181*32);assert.equal(r.w,208);
  assert(s.isPointOnBathSilos(r.x+r.w/2,r.y+r.h/2));assert(!s.isPointOnBathSilos(r.x-20,r.y));
  s.player.x=r.x;s.player.y=130;s.player.vy=20;s.bathSilosLayFoundation();
  assert.equal(s.world[4][181].type,'foundation');assert.equal(s.world[5][181].type,'dirt');
  assert.equal(s.world[4][180].type,'dirt');assert.equal(s.world[4][188].type,'dirt');
  assert.equal(s.player.y,102);assert.equal(s.player.vy,0);
  s.bathSiloReset();s.surfacePonds=[{cL:182,cR:190}];
  assert.equal(s.bathSilosExteriorRect().x,192*32,'finds dry ground beyond both lake banks');
  s.bathSiloReset();s.surfacePonds=[];s.banyaX=138*32;
  assert(s.bathSilosExteriorRect().x>=175*32,'skips station/depot footprint');
  s.bathSiloReset();s.banyaX=315*32;assert.equal(s.bathSilosExteriorRect(),null,'no placement outside the world');
  s.ENABLE_BATH=false;assert.equal(s.isPointOnBathSilos(100,100),false);
  console.log('PASS exterior placement, lake/station exclusions and local foundation');
}

{
  const s=fixture();s.siphon.tank[0]=500;s.bathSiloDeposit(0,0);s.bathSiloReserve(0,100);
  s.bathSilos.pendingHeat[0]=100*50;s.siphon.tank[2]=70;s.bathSiloReserve(2,70);
  // A live bathAddWater command has separately debited75particles into bathPour.
  s.bathSilos.tanks[0].count-=75;
  const legacyPour=75, saved=JSON.parse(JSON.stringify(s.bathSiloSave())),expected=ledger(s);expected[0]+=legacyPour;
  s.bathSiloRestore(saved,legacyPour);
  assert.deepEqual(ledger(s),expected,'typed queues and separately reserved bathPour both survive');
  assert.equal(s.bathSilos.pending[0],175);assert.equal(s.bathSilos.pending[2],70);
  assert.equal(s.bathSilos.pendingHeat[0],6500,'legacy water joins at ambient without losing typed queue energy');
  const migrated=JSON.parse(JSON.stringify(s.bathSiloSave()));s.bathSiloRestore(migrated,0);
  assert.deepEqual(ledger(s),expected,'cleared legacy field prevents duplication on the next save');
  s.bathSiloRestore(saved,legacyPour);assert.deepEqual(ledger(s),expected,'loading the original mixed save twice is stable');
  console.log('PASS mixed typed-silo and legacy-pour save conservation');
}
