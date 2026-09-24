// Deterministic visitors, orders, persistence and migration; no browser required.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function fixture(fps = 60) {
  let seed = 73;
  const math = Object.create(Math);
  math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const s = { Math: math, console: { log() {} }, window: {}, performance: { now: () => 1000 },
    canvas: { width: 1000, height: 750, style: {}, addEventListener() {}, setPointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 750 }) }, dpr: 1,
    residents: [], JELLO_H: 1/120, jelloStepH: 1/240,
    surfaceSlimeBuild(x,y,guest) { const b={x,y,id:guest.id};s.residents.push(b);return b; },
    jelloLaunchBody() {}, surfaceSlimeGrabEnd() {},
    TILE: 32, SKY_ROWS: 4, COLS: 320, DECK_CENTER_COL: 160, DECK_LEFT_COL: 149, DECK_RIGHT_COL: 171,
    PLAYER_W: 22, PLAYER_H: 26, ENABLE_BATH: true, ENABLE_JELLO: true,
    world: Array.from({length:620},(_,r)=>Array.from({length:320},()=>r<4?null:{type:'dirt',hp:1})),
    surfacePonds: [], terrainClearedKinds: {}, cargo: [], money: 0,
    gameOver: false, gameWon: false, gamePaused: false, devMode: false, player: {x:5200,y:90},
    setDevMode(on) { s.devMode = !!on; },
    siphon: {tank:[0,0,0,0,0],passenger:null},
    ORES: {dirt:{hp:1},copper:{value:15},iron:{value:25},amber:{value:80},amethyst:{value:200},gold:{value:150}},
    showMsg() {}, sfxPlay() {}, saveNow() {}, invalidateTerrainAround() {}, liquidWGPU:null,
    cargoType: unit => typeof unit === 'string' ? unit : unit.type,
    cargoShiny: unit => !!(unit && unit.shiny),
    liquidCount:0, liquidX:[],liquidY:[],liquidType:[],mineralLiquidParked:{},
    liquidToolSync(){},
    addLiquidParticle(type,x,y){s.liquidX.push(x);s.liquidY.push(y);s.liquidType.push(type);return s.liquidCount++;},
    removeLiquidParticle(i){s.liquidX.splice(i,1);s.liquidY.splice(i,1);s.liquidType.splice(i,1);s.liquidCount--;},
    liquidSampleRect(x,y,xx,yy){const counts=[0,0,0,0,0];for(let i=0;i<s.liquidCount;i++)if(s.liquidX[i]>=x&&s.liquidX[i]<xx&&s.liquidY[i]>=y&&s.liquidY[i]<yy)counts[s.liquidType[i]]++;return counts;},
    liquidExtractRect(x,y,xx,yy,t,count){let used=0;for(let i=s.liquidCount-1;i>=0&&used<count;i--)if(s.liquidType[i]===t&&s.liquidX[i]>=x&&s.liquidX[i]<xx&&s.liquidY[i]>=y&&s.liquidY[i]<yy){s.removeLiquidParticle(i);used++;}return used;},
    liquidToolEmit(type,count,x,y){for(let i=0;i<count;i++)s.addLiquidParticle(type,x,19530);return count;},
    mineralLiquidPark(t,x,y){if(!s.mineralLiquidParked.test)s.mineralLiquidParked.test=[];s.mineralLiquidParked.test.push(t,x,y);},
    liquidSampleCircle:()=>({wet:0,type:0}),
    tileAt(r,c) { return r>=4 ? {type:'dirt'} : null; }, solidAt(x,y,w,h) { return y+h>128; },
  };
  vm.createContext(s);
  for (const file of ['072-bath','073-bath-interior','074-bath-service','077-hearth-combustion','077-hearth-fracture','077-hearth-geometry','077-hearth-physics','078-fire-bridge','078-hearth-room','079-forge-resources','348-sky-slimes']) vm.runInContext(fs.readFileSync('js/sluice/'+file+'.js','utf8'),s);
  s.bathPickSite();
  return {s, advance(seconds) {for(let n=0;n<seconds*fps;n++){s.skySlimeTick(1/fps);s.bathGuestTick(1/fps);}},
    inside(seconds) {for(let n=0;n<seconds*fps;n++)s.bathGuestTick(1/fps);} };
}
function loadBoiler(s) {
  for (const x of [125, 160, 195]) assert(s.hearthLoadCoal('boiler', x, 180));
}
function boilerTools(s) { s.forgeGive('flint', 1); }
{
  const {s}=fixture();s.bathCarveRoom();
  const c=s.bathTubCurve(s.BATH_FLOORS[0],s.BATH_FLOORS[0].tubs[0]);
  for(let i=1;i<40;i++){
    const x=c.x0+(c.x1-c.x0)*i/40,y=c.y0+c.depthAt(x),slope=s.bathCurveSlope(c,x),length=Math.hypot(1,slope);
    assert(s.bathSolidAt(x,y),'visible copper liner is solid');
    assert(!s.bathSolidAt(x,y-10*length),'water cavity is open above the liner');
    const q=s.bathProjectWater(x,y+10,0,100,1.0625);
    const gap=(c.y0+c.depthAt(q[0])-q[1])/Math.hypot(1,s.bathCurveSlope(c,q[0]));
    assert(gap>=4.05 && gap<5,'particle projects onto the visible curved surface');
    assert(q[2]*s.bathCurveSlope(c,q[0])-q[3]>=-0.1,'wall removes inward normal velocity');
  }
  console.log('PASS curved bowl solid boundary and normal projection across its full width');
}
{
  const {s}=fixture(), floor=s.BATH_FLOORS[0], current={...floor,tubs:floor.tubs};
  Object.assign(floor,{c0:27,c1:45,sink:3,tubs:[[32,41]]});
  s.bathCarveRoom();
  Object.assign(floor,current);
  const guest=s.skySlimeSpawn(1100,100);
  assert(s.bathGuestAccept(guest));
  s.bathGuests[0].st='wait';s.bathGuests[0].hop=null;s.bathGuests[0].s.x=30*s.TILE;
  s.addLiquidParticle(0,1150,19550);s.bathSupplies[0]=123;s.siphon.tank[0]=456;s.bathPour=17;
  const saved=JSON.parse(JSON.stringify(s.bathServiceSave()));saved.version=3;saved.ready=true;
  const water=JSON.stringify({x:s.liquidX,y:s.liquidY,type:s.liquidType});
  assert(s.world[floor.fr][25],'the former narrow room has a solid tile in the new basin');
  s.bathServiceRestore(saved);
  assert.equal(s.bathRoomReady,false,'old carved rooms rebuild once for the wider basin');
  assert.equal(JSON.stringify({x:s.liquidX,y:s.liquidY,type:s.liquidType}),water,'migration preserves existing real water');
  assert.equal(s.bathSupplies[0],123);assert.equal(s.siphon.tank[0],456);assert.equal(s.bathPour,17);
  assert(s.bathGuests[0].s.x<floor.tubs[0][0]*s.TILE,'a waiting guest migrates onto the dry landing');
  assert.equal(s.bathGuests[0].s.id,guest.id,'migration preserves guest identity');
  s.bathCarveRoom();
  assert.equal(s.world[floor.fr][25],null,'migration opens the wider basin');
  assert.equal(s.bathRoomReady,true);
  assert.equal(JSON.stringify({x:s.liquidX,y:s.liquidY,type:s.liquidType}),water,'recarving does not refill or discard water');
  const migrated=JSON.parse(JSON.stringify(s.bathServiceSave()));
  assert.equal(migrated.version,4);
  s.bathServiceRestore(migrated);
  assert.equal(s.bathRoomReady,true,'new room saves retain their carved geometry');
  const sentinel={type:'foundation',hp:17};s.world[floor.fr][25]=sentinel;s.bathCarveRoom();
  assert.equal(s.world[floor.fr][25],sentinel,'subsequent entry does not recarve a migrated room');
  console.log('PASS wider-room migration, conserved water and supplies, dry guest landing and one-time recarve');
}
{
  const {s}=fixture();
  const bathCol=s.banyaX/s.TILE;
  for(let c=s.DECK_RIGHT_COL+1;c<=bathCol+6;c++)
    assert.equal(s.world[4][c].type,'foundation','continuous apron from town through the whole banya');
  assert.equal(s.world[4][bathCol+7].type,'dirt','ground beyond the apron stays mineable');
  assert.equal(s.world[5][bathCol].type,'dirt','only the surface row is reinforced');
  s.world[4][bathCol]=null;s.terrainClearedKinds['4:'+bathCol]='dirt';
  s.player.x=bathCol*32;s.player.y=140;s.player.vy=100;
  s.bathServiceRestore(null);s.bathPickSite();
  assert.equal(s.world[4][bathCol].type,'foundation','old saves gain the same supporting slab');
  assert.equal(s.terrainClearedKinds['4:'+bathCol],undefined);
  assert.equal(s.player.y+s.PLAYER_H,128,'a saved rig in the new slab returns to the surface');
  assert.equal(s.player.renderY,s.player.y);
  assert.equal(s.player.vy,0);
  s.surfacePonds=[{cL:172,cR:172}];s.world[4][172]=null;
  s.bathServiceRestore(null);s.bathPickSite();
  assert.equal(s.world[4][172],null,'the connection never fills a pond');
  s.ENABLE_BATH=false;s.bathServiceRestore(null);s.world[4][bathCol]=null;
  s.bathPickSite();assert.equal(s.world[4][bathCol],null,'disabled banya does not build');
  s.ENABLE_BATH=true;s.bathPickSite();
  assert.equal(s.world[4][bathCol].type,'foundation','enabling a pre-sited banya lays its foundation');
  console.log('PASS banya foundation, legacy excavation recovery, pond preservation and live enable');
}
for (const fps of [30,60,144]) {
  const f=fixture(fps), s=f.s;
  s.skySlimeSpawn();
  f.advance(85);
  assert(s.bathGuests.length>0,'meteor meanders and enters on its own');
  // Natural hops can reorder arrivals; follow a guest who reached the room.
  const id=s.bathGuests[0].s.id;
  assert.equal(s.bathGuests.length,2,'bounded indoor queue');
  assert(s.bathGuests.every(g=>g.st==='wait'));
  assert.equal(s.money,0,'waiting never earns money');
  s.bathMode=true;
  s.bathRoomReady=true;
  s.cargo=Array.from({length:9},()=>({type:'coal'}));
  assert.equal(s.bathLightStove(),false,'coal in the hold cannot ignite an empty grate');
  assert.equal(s.cargo.length,9);
  loadBoiler(s); assert.equal(s.cargo.length,6,'physical loading consumes exactly one coal per piece');
  assert.equal(s.bathLightStove(),false,'boiler requires flint');
  s.forgeGive('flint',1);
  assert.equal(s.hearthHasTool('steel'),true,'the boiler includes a reusable steel striker');
  assert(s.bathLightStove());assert.equal(s.cargo.length,6,'striking consumes no extra coal');
  assert.equal(s.forgeCount('flint'),1);assert.equal(s.forgeCount('steel'),1,'ignition tools are reusable');
  assert.equal(s.bathServe(id),false,'heat alone cannot admit a guest to a dry tub');
  s.siphon.tank[0]=12000;
  assert(s.bathAddWater());assert.equal(s.siphon.tank[0],0);assert.equal(s.bathPour,12000);
  f.inside(12);
  assert(s.bathWater>=s.BATH_MIN_WATER);assert(s.bathHeat>=.35);
  assert(s.hearthBeds.boiler.chunks.every(b=>b.lit),'nearby coal catches from the first spark');
  assert.equal(s.bathLightStove(),false,'burning fire is not charged twice');
  const water=s.bathWater;
  assert(s.bathServe(id)); assert.equal(s.bathWater,water,'no per-guest water dose');
  assert.equal(s.cargo.length,6,'no per-guest coal fee');
  assert.equal(s.bathServe(id),false,'double admission is refused');
  f.inside(10); assert.equal(s.money,0,'no payout before complete soak');
  const pending=JSON.parse(JSON.stringify(s.bathServiceSave()));
  s.bathServiceRestore(pending);
  f.inside(12);
  assert.equal(s.money,75); assert.equal(s.bathServed,1);
  const paid=JSON.parse(JSON.stringify(s.bathServiceSave()));
  s.bathServiceRestore(paid); f.inside(8);
  assert.equal(s.money,75,'reload after payment cannot duplicate the payout');
  assert(s.residents.some(g=>g.id===id),'same visitor becomes a surface resident');
  f.advance(25); assert.equal(s.residents.filter(g=>g.id===id).length,1,'resident persists without duplicating');
  assert(s.skySlimes.length<=2,'only two rocky visitors roam outside');
  console.log('PASS visit, resources, save during soak/payment, departure at '+fps+' FPS');
}
{
 const f=fixture(),s=f.s;
 s.skySlimeSpawn(); f.advance(85); s.bathMode=true;
 s.siphon.tank=[900,0,1234,567,890]; s.bathSupplies[0]=100; s.cargo=[{type:'coal'}];
 s.bathRoomReady=true;
 s.cargo=Array.from({length:3},()=>({type:'coal'}));
 loadBoiler(s);boilerTools(s);
 assert(s.bathAddWater()); assert(s.bathLightStove());
 for(let i=0;i<8000;i++)s.addLiquidParticle(0,1150,19530);
 f.inside(15);
 const g=s.bathGuests[0]; assert(s.bathServe(g.s.id));
 assert.deepEqual(Array.from(s.siphon.tank),[0,0,1234,567,890]); assert.equal(s.bathSupplies[0],0);
 s.bathMode=false; f.inside(30); assert.equal(s.money,75,'served visitors finish while mining');
 s.ENABLE_BATH=false; const before=JSON.stringify(s.bathServiceSave());f.inside(2);
 assert.equal(JSON.stringify(s.bathServiceSave()),before,'disabled bath freezes visitor state');
}
{
 const {s}=fixture(); const c=s.DECK_LEFT_COL-16;
 for(let r=4;r<=6;r++)for(let col=c-1;col<=c+11;col++)s.world[r][col]=r===6||col===c-1||col===c+11?{type:'foundation'}:null;
 const g=s.skySlimeSpawn((c+3)*32,175);s.player.x=(c+4)*32;s.player.y=160;
 s.liquidExtractRect=(x,y,xx,yy,t)=>t===0?1700:0;
 s.bathRetireGarden({lots:[{owned:true,ready:true}]});
 assert.equal(s.money,440); assert.equal(s.bathSupplies[0],1700);
 assert.equal(s.world[4][c].type,'dirt'); assert.equal(s.world[6][c].type,'dirt');
 assert(g.y+g.r<128); assert(s.player.y+s.PLAYER_H<128);
 assert(s.bathServiceSave().version>=2);
 assert.equal(s.bathServiceSave().garden,undefined,'new saves cannot refund the same lot again');
 console.log('PASS legacy lot refund, stored water, terrain cleanup and trapped actor recovery');
}

{
 const {s}=fixture();s.bathRoomReady=true;
 const floor=s.BATH_FLOORS[0],curve=s.bathTubCurve(floor,floor.tubs[0]);
 s.addLiquidParticle(0,curve.x1+20,floor.fr*s.TILE);s.addLiquidParticle(0,1150,19550);
 s.mineralLiquidPark(0,curve.x0-20,floor.fr*s.TILE);s.mineralLiquidPark(0,1150,19550);
 s.bathDrainFloor();
 assert.equal(s.bathLostWater,2,'live and parked floor spills permanently disappear');
 assert.equal(s.liquidCount,1,'water inside bowl remains');
 assert.equal(s.mineralLiquidParked.test.length,3,'parked bowl water remains');
 s.bathDrainFloor();assert.equal(s.bathLostWater,2,'no duplicate loss');
 console.log('PASS permanent floor absorption, active and parked fluid');
}

{
  const f = fixture(), s = f.s;
  s.bathMode = true; s.bathRoomReady = true;
  s.forgeGive('iron', 2); s.forgeGive('coal', 2);
  const oldCoal = s.hearthLoadCoal('forge', 160, 180);
  assert(oldCoal); oldCoal.lit = true; oldCoal.heat = 0.85;
  s.hearthJob = { stage: 'hammer', heat: 0.8, hits: 2, quench: 0 };
  s.hearthRoomRestore(JSON.parse(JSON.stringify(s.hearthRoomSave())));
  const legacy = JSON.stringify({ bed: s.hearthSave().forge, job: s.hearthJob, stock: s.forgeResourcesSave() });
  assert.equal(s.hearthView, 'bath', 'old forge sessions restore into the bath');
  for (const action of ['forge', 'work']) s.hearthRoomAction(action);
  s.hearthSetView('forge');
  assert.equal(s.hearthView, 'bath', 'retired forge cannot be opened by an old view request');
  s.hearthSetView('boiler');
  s.hearthRoomKey({ key: '3', repeat: false });
  assert.equal(s.hearthView, 'boiler', 'old forge shortcut is inert');
  f.inside(30);
  assert.equal(JSON.stringify({ bed: s.hearthSave().forge, job: s.hearthJob, stock: s.forgeResourcesSave() }), legacy,
    'legacy forge work and paid fuel remain frozen without spending stock');
  s.hearthRoomRestore(JSON.parse(JSON.stringify(s.hearthRoomSave())));
  assert.equal(JSON.stringify({ bed: s.hearthSave().forge, job: s.hearthJob, stock: s.forgeResourcesSave() }), legacy,
    'retired work survives repeated save and restore without duplication');
  assert.equal(s.forgeCount('steel'), 1, 'old unfinished work does not block the built-in striker');
  console.log('PASS retired forge navigation, frozen legacy work and fuel, and save roundtrip');
}

{
  const { s } = fixture();
  s.bathMode = true; s.hearthView = 'boiler'; s.forgeGive('coal', 2);
  const bin = s.hearthRoomLayout().bin;
  s.hearthButtons = [Object.assign({ action: 'coal' }, bin)];
  const down = { pointerId: 7, button: 0, clientX: bin.x + 30, clientY: bin.y + 30 };
  assert(s.hearthPointerDown(down));
  assert(s.hearthDrag && s.hearthDrag.fresh);
  assert.equal(s.forgeCount('coal'), 1); assert.equal(s.hearthBeds.boiler.chunks.length, 1);
  s.hearthCancelDrag();
  assert.equal(s.hearthDrag, null); assert.equal(s.forgeCount('coal'), 2);
  assert.equal(s.hearthBeds.boiler.chunks.length, 0, 'canceling a new drag returns exactly one coal');
  s.hearthCancelDrag(); assert.equal(s.forgeCount('coal'), 2, 'second cancel cannot mint coal');
  assert(s.hearthPointerDown(down));
  assert(s.hearthPointerUp({ pointerId: 7, clientX: 0, clientY: 740 }));
  assert.equal(s.forgeCount('coal'), 2, 'dropping a new piece outside refunds the bunker');
  assert.equal(s.hearthBeds.boiler.chunks.length, 0);
  assert(s.hearthPointerDown(down));
  s.hearthSetView('bath');
  assert.equal(s.forgeCount('coal'), 2, 'returning to the bath cancels a held fresh piece');
  assert.equal(s.hearthBeds.boiler.chunks.length, 0);
  console.log('PASS pointer pickup, canceled and misplaced coal, station switch and exact refund');
}

{
  const speeds=[];
  for(const held of [0,1000]){
    const {s}=fixture();let now=1000;s.performance.now=()=>now;
    s.bathMode=true;s.hearthSetView('boiler');s.forgeGive('coal',1);
    const b=s.hearthLoadCoal('boiler',160,100),box=s.hearthRoomLayout().box;
    const x=box.x+b.x*box.w/s.HEARTH_WIDTH,y=box.y+(b.y-s.HEARTH_TOP)*box.h/s.HEARTH_HEIGHT;
    assert(s.hearthPointerDown({pointerId:11,button:0,clientX:x,clientY:y}));
    now+=16;s.hearthPointerMove({pointerId:11,clientX:x+18,clientY:y});
    now+=held;assert(s.hearthPointerUp({pointerId:11,clientX:x+18,clientY:y}));
    speeds.push(Math.hypot(b.vx,b.vy));
    assert.equal(b.held,false);
  }
  assert(speeds[0]>20,'a release immediately after movement retains the throw');
  assert(speeds[1]<0.1,'holding still before release removes stale throw momentum');
  console.log('PASS fresh coal throw and stationary release velocity decay');
}

{
  const { s } = fixture();
  s.bathMode = true; s.hearthView = 'boiler'; s.devMode = true;
  s.forgeGive('coal', 2); s.cargo = [{ type: 'coal' }];
  const before = JSON.stringify({ stock: s.forgeStock, cargo: s.cargo });
  function takeFromBin() {
    const bin = s.hearthRoomLayout().bin;
    s.hearthButtons = [Object.assign({ action: 'coal' }, bin)];
    assert(s.hearthPointerDown({ pointerId: 7, button: 0, clientX: bin.x + 30, clientY: bin.y + 30 }));
    assert(s.hearthDrag && s.hearthDrag.fresh && s.hearthDrag.b.devSupplied);
  }
  function returnColdChunk() {
    s.hearthSetView('boiler');
    const b = s.hearthBeds.boiler.chunks[0], box = s.hearthRoomLayout().box;
    s.hearthButtons = [];
    assert(s.hearthPointerDown({ pointerId: 7, button: 0,
      clientX: box.x + b.x * box.w / s.HEARTH_WIDTH, clientY: box.y + (b.y-s.HEARTH_TOP) * box.h / s.HEARTH_HEIGHT }));
    assert(s.hearthDrag && !s.hearthDrag.fresh);
    assert(s.hearthPointerUp({ pointerId: 7, clientX: 0, clientY: 740 }));
    assert.equal(s.hearthBeds.boiler.chunks.length, 0);
  }
  for (let i = 0; i < 5; i++) {
    takeFromBin(); s.hearthCancelDrag();
    takeFromBin(); assert(s.hearthPointerUp({ pointerId: 7, clientX: 0, clientY: 740 }));
  }
  takeFromBin();
  s.devMode = false; s.hearthCancelDrag();
  assert.equal(s.hearthBeds.boiler.chunks.length, 0, 'turning dev off during a fresh drag cannot produce a refund');
  s.devMode = true;
  assert(s.hearthLoadCoal('boiler', 160, 150));
  returnColdChunk();
  assert(s.hearthLoadCoal('boiler', 160, 150));
  const saved = JSON.parse(JSON.stringify(s.bathServiceSave()));
  assert.equal(saved.workshop.beds.boiler.chunks[0].devSupplied, true);
  s.devMode = false; s.bathServiceRestore(saved);
  assert.equal(s.hearthBeds.boiler.chunks[0].devSupplied, true, 'saved test coal keeps its supply origin');
  returnColdChunk();
  assert.equal(JSON.stringify({ stock: s.forgeStock, cargo: s.cargo }), before,
    'canceling, returning and reloading dev coal never mints or spends real resources');
  assert(s.hearthRoomKey({ key: '`', repeat: false }));
  assert.equal(s.devMode, true, 'backtick enables dev mode inside the bathhouse');
  takeFromBin();
  assert(s.hearthRoomKey({ key: '`', repeat: false }));
  assert.equal(s.devMode, false); assert.equal(s.hearthDrag, null);
  assert.equal(JSON.stringify({ stock: s.forgeStock, cargo: s.cargo }), before);
  console.log('PASS unlimited coal drag cancellation, cold returns, dev toggles and saved supply origin');
}

{
  const { s } = fixture();
  s.bathMode = true; s.bathRoomReady = true; s.devMode = true;
  assert(s.hearthLoadCoal('boiler', 160, 150));
  assert.equal(s.forgeStock.flint, 0); assert.equal(s.forgeStock.steel, 1);
  assert(s.bathLightStove(), 'virtual flint and the built-in striker ignite real boiler fuel');
  assert(s.hearthBeds.boiler.chunks[0].lit);
  assert.equal(s.forgeStock.flint, 0); assert.equal(s.forgeStock.steel, 1);
  s.devMode = false;
  assert.equal(s.hearthHasTool('flint'), false, 'normal play still needs mined flint');
  assert.equal(s.hearthHasTool('steel'), true, 'the built-in striker remains available');
  console.log('PASS virtual flint ignition, preserved stock and normal mined-tool gate');
}

{
  const f = fixture(), s = f.s;
  s.bathMode = true; s.bathRoomReady = true; s.devMode = true;
  s.forgeGive('coal', 2); s.forgeGive('iron', 1);
  s.siphon.tank[0] = 19; s.bathSupplies[0] = 7;
  const resources = JSON.stringify({ stock: s.forgeStock, tank: s.siphon.tank, supplies: s.bathSupplies });
  s.hearthRoomAction('kit');
  assert.equal(s.hearthView, 'bath');
  assert.equal(s.hearthBeds.boiler.chunks.length, 3);
  assert(s.hearthBeds.boiler.chunks.every(b => b.lit && b.devSupplied));
  assert.equal(s.bathHeat, 0.75);
  assert.equal(s.bathPour, s.BATH_MAX_WATER, 'the test kit queues a real, bounded water transfer');
  s.hearthRoomAction('kit');
  assert.equal(s.bathPour, s.BATH_MAX_WATER, 'a repeated kit does not overfill the pending reservoir');
  assert.equal(s.hearthBeds.boiler.chunks.length, 3, 'a repeated kit does not duplicate fuel');
  for(let wait=0;wait<90&&(s.bathPour>0||s.bathHeat<0.35);wait++)f.inside(1);
  assert.equal(s.bathPour, 0, 'the queued test water is emitted through the ordinary liquid path');
  assert(s.bathWater >= s.BATH_MIN_WATER && s.bathWater <= s.BATH_MAX_WATER);
  assert(s.bathHeat >= 0.35, 'the actual lit boiler warms the newly poured bath');
  assert.equal(JSON.stringify({ stock: s.forgeStock, tank: s.siphon.tank, supplies: s.bathSupplies }), resources);
  const saved = s.bathServiceSave();
  function finiteNumbers(value) {
    if (typeof value === 'number') assert(Number.isFinite(value), 'dev save contains only finite numbers');
    else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
  }
  finiteNumbers(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)).workshop.stock.stock,
    { coal: 2, iron: 1, flint: 0, steel: 1 }, 'virtual tools and supply counts never enter saved stock');
  assert.equal(saved.supplies[0], 7);
  console.log('PASS test bath preparation, bounded actual pouring, physical boiler warmth and finite saves');
}

{
  const f = fixture(), s = f.s;
  s.bathMode = true; s.bathRoomReady = true;
  const before = JSON.stringify(s.bathServiceSave());
  s.hearthRoomAction('kit'); s.hearthRoomAction('guest');
  assert.equal(JSON.stringify(s.bathServiceSave()), before, 'normal play cannot invoke the developer kit or guest action');
  assert.equal(s.skySlimes.length, 0);
  s.devMode = true;
  for (const field of ['gamePaused', 'bathFading']) {
    s[field] = true; s.hearthRoomAction('kit'); s.hearthRoomAction('guest'); s[field] = false;
    assert.equal(JSON.stringify(s.bathServiceSave()), before, 'developer actions respect ' + field);
  }
  s.bathMode = false; s.hearthRoomAction('kit'); s.hearthRoomAction('guest'); s.bathMode = true;
  assert.equal(JSON.stringify(s.bathServiceSave()), before, 'developer bath actions require entering the bathhouse');
  const spawn = s.bathSpawnGuest, spawned = [];
  s.bathSpawnGuest = () => { const guest = spawn(); if (guest) spawned.push(guest); return guest; };
  s.hearthRoomAction('guest');
  assert.equal(s.bathGuests.length, 1);
  assert.equal(s.bathGuests[0].s, spawned[0], 'the indoor visitor is the actual spawned sky slime');
  assert.equal(s.skySlimes.length, 0, 'admitting a test guest removes its surface copy');
  assert.equal(s.bathGuests[0].s.visit, 'inside');
  s.hearthRoomAction('guest'); s.hearthRoomAction('guest');
  assert.equal(s.bathGuests.length, 2); assert.equal(spawned.length, 2, 'indoor capacity blocks spawning a third guest');
  assert.notEqual(s.bathGuests[0].s.id, s.bathGuests[1].s.id);
  f.inside(0.8);
  assert(s.bathGuests.every(g => g.st === 'wait'));
  assert.equal(s.money, 0); assert.equal(s.bathServed, 0, 'test guests still require service and a soak before payment');
  s.bathServiceRestore(JSON.parse(JSON.stringify(s.bathServiceSave())));
  assert.equal(s.bathGuests.length, 2); assert.equal(s.skySlimes.length, 0);
  s.bathGuests.length = 0;
  for (let i = 0; i < s.SKY_SLIME_MAX; i++) assert(s.skySlimeSpawn(1000, -100));
  s.hearthRoomAction('guest');
  assert.equal(s.bathGuests.length, 0, 'the test guest respects total sky slime capacity');
  assert.equal(s.skySlimes.length, s.SKY_SLIME_MAX);
  console.log('PASS developer action gates, real guest identity, admission persistence and population limits');
}

{
  const { s } = fixture();
  s.bathServiceRestore({ version: 2, fire: 96, heat: 0.75 });
  assert(s.hearthBeds.boiler.chunks.length > 0, 'old paid fire migrates to physical coal');
  assert(Math.abs(s.hearthBeds.boiler.fuelSeconds - 96) < 1e-7, 'migration conserves remaining fuel');
  assert.equal(s.forgeCount('coal'), 0, 'migration does not add free bunker coal');
  const migrated = JSON.parse(JSON.stringify(s.bathServiceSave()));
  s.bathServiceRestore(migrated);
  assert(Math.abs(s.hearthBeds.boiler.fuelSeconds - 96) < 1e-7, 'migration only occurs once');
  s.forgeGive('coal', 4); s.forgeGive('iron', 2); s.forgeGive('flint', 1);
  s.forgeStoneSinceFlint = 10;
  s.hearthToolTime = 900; s.hearthToolPulse = 1; s.hearthQuenchSteam = 1;
  s.bathServiceRestore(JSON.parse(JSON.stringify(s.bathServiceSave())));
  assert.equal(s.hearthToolTime, 0); assert.equal(s.hearthToolPulse, 0); assert.equal(s.hearthQuenchSteam, 0);
  assert.equal(s.forgeStoneSinceFlint, 10, 'resource progression survives a reload');
  s.bathServiceReset();
  for (const type of ['coal', 'iron', 'flint']) assert.equal(s.forgeCount(type), 0);
  assert.equal(s.forgeCount('steel'), 1, 'new game includes the reusable boiler striker');
  assert.equal(s.forgeStoneSinceFlint, 0, 'new game resets the stone drop counter');
  assert.equal(s.hearthBeds.boiler.chunks.length, 0); assert.equal(s.hearthBeds.forge.chunks.length, 0);
  assert.equal(s.hearthJob.stage, 'empty'); assert.equal(s.hearthToolPulse, 0);
  console.log('PASS old fire migration, no duplicate fuel, transient reload state and new-game reset');
}
