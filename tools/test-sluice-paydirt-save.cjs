// Run: node tools/test-sluice-paydirt-save.cjs
// Production rotating save envelopes, including the real world serializer.
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, 'js/sluice', name), 'utf8'); }
var storage = new Map();
var events = {};
var c = {
  Math: Math, Number: Number, JSON: JSON, Date: Date,
  btoa: function(value) { return Buffer.from(value, 'latin1').toString('base64'); },
  atob: function(value) { return Buffer.from(value, 'base64').toString('latin1'); },
  console: { log: function() {}, warn: function() {} },
  window: { location: { search: '' }, addEventListener: function(name, fn) { events[name] = fn; } },
  document: { hidden: false, addEventListener: function(name, fn) { events[name] = fn; } },
  localStorage: {
    getItem: function(key) { return storage.get(key) || null; },
    setItem: function(key, value) { storage.set(key, value); },
    removeItem: function(key) { storage.delete(key); }
  },
  SKY_ROWS: 1, TOTAL_ROWS: 3, WORLD_COLS: 2,
  world: [[null, null], [{type:'dirt',hp:1},{type:'stone',hp:2}], [{type:'gold',hp:4},null]],
  terrainClearedKinds: { '2:1': 'stone' },
  upgrades: {cargoLevel:3}, money: 1000,
  teleporters:0, balloons:0, bombsSmall:0, bombsLarge:0, reserveFuel:0, oilGallons:0,
  depthRecord:2, timeOfDay:0.5, moonPhase:0.25, ledgerData:{}, seamComplete:false, tutorialDone:true,
  player: {x:32,y:32,fuel:10,hull:80}, cargo:[{type:'gold',shiny:false}],
  maxFuel:30, maxCargo:13, surfacePonds:[], worldPondStyle:'regular', POND_STYLES:{regular:{}},
  skySlimes:[], SKY_SLIME_MAX:2, siphon:{tank:[0,0,0,0],passenger:null}, bathGuests:[], bathServed:0,
  forgeStock:{coal:0,iron:0,flint:0,steel:1}, hearthJob:{stage:'idle',hits:0},
  hearthBeds:{boiler:{fuelSeconds:0},forge:{fuelSeconds:0}}, cam:{snap:false},
  gameOver:false, gameWon:false, gamePhysicsBlocked:false,
  getMaxCargo:function(){return 5+(c.upgrades.cargoLevel-1)*4;},
  getMaxFuel:function(){return 30;}, getMaxHull:function(){return 100;},
  rigExhaustSave:function(){return{};}, showMsg:function(){},
  ledgerRecordOre:function(type){ c.ledgerData[type]={n:(c.ledgerData[type]&&c.ledgerData[type].n||0)+1,shiny:0}; }
};
['rainSave','bathServiceSave','skySlimeSave','surfaceSlimeSave','siphonSave','mineralLiquidSave'].forEach(function(name) {
  c[name] = function() { return null; };
});
['rigExhaustLoad','rigExhaustReset','mineralLiquidRestore','rainRestore','skySlimeRestore','siphonRestore',
  'bathServiceRestore','bathRecoverLegacyWater','bathRetireGarden','lightingInit','resetJello','surfaceSlimeRestore'].forEach(function(name) {
  c[name] = function() {};
});
vm.createContext(c);
vm.runInContext(read('010-constants.js').match(/var ORES = \{[\s\S]*?\n  \};/)[0] +
  read('047-save.js') + read('171-pay-dirt.js'), c);
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function restore(env) {
  c.money = -1; c.cargo = []; c.paydirtReset();
  c.saveApply(plain(env));
}
function ready() {
  var steps = 0;
  while (c.paydirt.pending.status === 'washing' && steps++ < 1000) c.paydirtAdvance(0.05);
  assert.equal(c.paydirt.pending.status, 'ready');
}
c.paydirtReset(); c.paydirt.seed=12345;
for (var i=0;i<40;i++) c.paydirtCollect('dirt',1,0);
for (i=0;i<20;i++) c.paydirtCollect('stone',1,1);
assert.equal(c.paydirtDeposit(),60);
var docked = c.saveLoadEnvelope();
assert.equal(docked.paydirt.stored.topsoil,40);
assert.equal(docked.paydirt.held.topsoil,undefined);
assert.equal(docked.profile.money,1000);
assert.equal(docked.cargo.length,1, 'Docking unwashed material does not sell ore in the bulk model');
restore(docked);
assert.equal(c.world[1][1].type,'stone');
assert.equal(c.terrainClearedKinds['2:1'],'stone');

c.paydirtStart('topsoil');
for (i=0;i<13;i++) c.paydirtAdvance(0.05);
c.saveNow('test-mid-wash');
var mid=c.saveLoadEnvelope();
assert(mid.paydirt.pending.elapsed > 0 && mid.paydirt.pending.elapsed < mid.paydirt.pending.duration);
assert.equal(mid.paydirt.stored.topsoil,0);
assert.equal(mid.paydirt.stored['river-gravel'],20);
restore(mid);
assert.deepEqual(plain(c.paydirt.pending),mid.paydirt.pending, 'Reload preserves the entire reserved pan');
assert.equal(c.paydirtClaim(),null);
assert.equal(c.money,1000);
ready();
var unclaimed=c.saveLoadEnvelope(), payout=c.paydirt.pending.value;
assert.equal(unclaimed.paydirt.pending.status,'ready');
restore(unclaimed);
assert.equal(c.money,1000, 'An unclaimed pan does not credit money during load');
assert.equal(c.paydirtClaim().value,payout);
var collected=c.saveLoadEnvelope();
assert.equal(collected.profile.money,1000+payout);
assert.equal(collected.paydirt.pending,null);
restore(collected);
assert.equal(c.paydirtClaim(),null);
assert.equal(c.money,1000+payout, 'Post-claim reload cannot duplicate the payout');

// A failed save does not mix money from one envelope with a pan from another.
c.paydirtStart('river-gravel'); ready();
var preClaim=c.saveLoadEnvelope(), secondPayout=c.paydirt.pending.value;
var write=c.localStorage.setItem;
c.localStorage.setItem=function(){throw Error('quota');};
c.paydirtClaim();
assert.equal(c.saveLastOk,false);
assert.equal(c.money,preClaim.profile.money+secondPayout);
var diskStill=c.saveLoadEnvelope();
assert.equal(diskStill.profile.money,preClaim.profile.money);
assert.equal(diskStill.paydirt.pending.status,'ready');
c.localStorage.setItem=write;
restore(diskStill);
c.paydirtClaim();
assert.equal(c.money,preClaim.profile.money+secondPayout, 'Recovering an unpersisted claim does not mint a second payout');

c.paydirt.stored.topsoil=12;
c.paydirtStart('topsoil');
c.paydirt.stored.shale=5;
c.paydirtCollect('dirt',1,0);
c.paydirtCollect('stone',1,1);
var beforeDeathMoney=c.money;
c.gameOver=true; c.applyDeathPenalty._done=false;
c.saveNow('test-dead-unload');
var dead=c.saveLoadEnvelope();
assert.equal(dead.profile.money,beforeDeathMoney-Math.floor(beforeDeathMoney*.1));
assert.equal(Object.keys(dead.paydirt.held).length,0);
assert.equal(dead.paydirt.stored.shale,5);
assert.equal(dead.paydirt.pending.count,12);
assert.equal(dead.cargo.length,0);
c.saveNow('test-second-dead-save');
assert.equal(c.money,dead.profile.money,'Repeated death saves cannot charge twice');
c.gameOver=false;
restore(dead);
assert.equal(c.paydirtUsed(),0);
assert.equal(c.paydirtStored(),5);
assert.equal(c.paydirt.pending.count,12);
assert.equal(c.cargo.length,0);

var legacy=plain(docked);
delete legacy.paydirt;
restore(legacy);
assert.equal(c.money,1000);
assert.equal(c.cargo.length,1);
assert.equal(c.paydirtUsed()+c.paydirtStored(),0);
assert.equal(c.paydirt.pending,null);

// A damaged newest slot falls back to the previous complete envelope.
c.saveNow('test-valid-slot');
var valid=c.saveLoadEnvelope();
var nextKey=(c.saveCounter+1)%2===0 ? c.SAVE_KEY_B : c.SAVE_KEY_A;
storage.set(nextKey,'{broken');
assert.equal(c.saveLoadEnvelope().n,valid.n);
c.saveWipe();
assert.equal(storage.size,0);
assert.equal(c.paydirtUsed()+c.paydirtStored(),0);
assert.equal(c.paydirt.pending,null);
console.log('Sluice paydirt save checks passed: real rotating envelopes, mid-wash restore, unclaimed pan, post-claim reload, quota failure, death, legacy saves, corrupt-slot fallback and New Game.');
