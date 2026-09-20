// Deterministic visitors, orders, persistence and migration; no browser required.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function fixture(fps = 60) {
  let seed = 73;
  const math = Object.create(Math);
  math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const s = { Math: math, console: { log() {} }, window: {}, canvas: { addEventListener() {} },
    TILE: 32, SKY_ROWS: 4, COLS: 320, DECK_CENTER_COL: 160, DECK_LEFT_COL: 149,
    PLAYER_W: 22, PLAYER_H: 26, ENABLE_BATH: true, ENABLE_JELLO: true,
    world: Array.from({length:620},(_,r)=>Array.from({length:320},()=>r<4?null:{type:'dirt',hp:1})),
    surfacePonds: [], terrainClearedKinds: {}, cargo: [], money: 0,
    gameOver: false, gameWon: false, gamePaused: false, player: {x:5200,y:90},
    siphon: {tank:[0,0,0,0,0],passenger:null},
    ORES: {dirt:{hp:1},copper:{value:15},iron:{value:25},amber:{value:80},amethyst:{value:200},gold:{value:150}},
    showMsg() {}, sfxPlay() {}, saveNow() {}, liquidWGPU:null,
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
  for (const file of ['072-bath','074-bath-service','348-sky-slimes']) vm.runInContext(fs.readFileSync('js/sluice/'+file+'.js','utf8'),s);
  s.bathPickSite();
  return {s, advance(seconds) {for(let n=0;n<seconds*fps;n++){s.skySlimeTick(1/fps);s.bathGuestTick(1/fps);}},
    inside(seconds) {for(let n=0;n<seconds*fps;n++)s.bathGuestTick(1/fps);} };
}
for (const fps of [30,60,144]) {
  const f=fixture(fps), s=f.s;
  const guest=s.skySlimeSpawn(); const id=guest.id;
  f.advance(85);
  assert(s.bathGuests.some(g=>g.s.id===id),'meteor meanders and enters on its own');
  assert.equal(s.bathGuests.length,2,'bounded indoor queue');
  assert(s.bathGuests.every(g=>g.st==='wait'));
  assert.equal(s.money,0,'waiting never earns money');
  s.bathMode=true;
  s.bathRoomReady=true;
  s.cargo=Array.from({length:9},()=>({type:'coal'}));
  assert.equal(s.bathLightStove(),false,'ten coal required, no partial ignition');
  assert.equal(s.cargo.length,9);
  s.cargo.push({type:'coal'});
  assert(s.bathLightStove());assert.equal(s.cargo.length,0);
  assert.equal(s.bathLightStove(),false,'burning fire is not charged twice');
  assert.equal(s.bathServe(id),false,'heat alone cannot admit a guest to a dry tub');
  s.siphon.tank[0]=12000;
  assert(s.bathAddWater());assert.equal(s.siphon.tank[0],0);assert.equal(s.bathPour,12000);
  f.inside(12);
  assert(s.bathWater>=s.BATH_MIN_WATER);assert(s.bathHeat>=.35);
  const water=s.bathWater;
  assert(s.bathServe(id)); assert.equal(s.bathWater,water,'no per-guest water dose');
  assert.equal(s.cargo.length,0,'no per-guest coal fee');
  assert.equal(s.bathServe(id),false,'double admission is refused');
  f.inside(10); assert.equal(s.money,0,'no payout before complete soak');
  const pending=JSON.parse(JSON.stringify(s.bathServiceSave()));
  s.bathServiceRestore(pending);
  f.inside(12);
  assert.equal(s.money,75); assert.equal(s.bathServed,1);
  const paid=JSON.parse(JSON.stringify(s.bathServiceSave()));
  s.bathServiceRestore(paid); f.inside(8);
  assert.equal(s.money,75,'reload after payment cannot duplicate the payout');
  assert(s.skySlimes.some(g=>g.id===id&&g.visit==='depart'),'same visitor leaves on the surface');
  f.advance(25); assert(!s.skySlimes.some(g=>g.id===id),'departed guest clears its population slot');
  console.log('PASS visit, resources, save during soak/payment, departure at '+fps+' FPS');
}
{
 const f=fixture(),s=f.s;
 s.skySlimeSpawn(); f.advance(85); s.bathMode=true;
 s.siphon.tank=[900,0,1234,567,890]; s.bathSupplies[0]=100; s.cargo=[{type:'coal'}];
 s.bathRoomReady=true;
 s.cargo=Array.from({length:10},()=>({type:'coal'}));
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
 assert.equal(s.bathServiceSave().version,2);
 assert.equal(s.bathServiceSave().garden,undefined,'new saves cannot refund the same lot again');
 console.log('PASS legacy lot refund, stored water, terrain cleanup and trapped actor recovery');
}

{
 const {s}=fixture();s.bathRoomReady=true;
 s.addLiquidParticle(0,1400,19518);s.addLiquidParticle(0,1150,19550);
 s.mineralLiquidPark(0,900,19518);s.mineralLiquidPark(0,1150,19550);
 s.bathDrainFloor();
 assert.equal(s.bathLostWater,2,'live and parked floor spills permanently disappear');
 assert.equal(s.liquidCount,1,'water inside bowl remains');
 assert.equal(s.mineralLiquidParked.test.length,3,'parked bowl water remains');
 s.bathDrainFloor();assert.equal(s.bathLostWater,2,'no duplicate loss');
 console.log('PASS permanent floor absorption, active and parked fluid');
}
