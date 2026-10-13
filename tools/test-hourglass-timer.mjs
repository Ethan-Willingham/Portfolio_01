import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Feed measured inventories to the same observer used by the GPU readback.
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../js/wss-hourglass.js',import.meta.url),'utf8'),context);
const make=context.WSSHourglass.createTimer;
const timer=make(10,1000);
for(let i=1;i<=20;i++)timer.sample(10+i/10,1000-i*5,0,i*5,0,0);
let state=timer.stats(12);
assert.equal(state.elapsed,2);
assert.equal(state.status,'flowing');
assert.equal(state.remaining,900);
assert(Math.abs(state.rate-50)<1e-6);
assert(Math.abs(state.remainingSeconds-18)<1e-6,'The estimate comes from inventory divided by measured net flow');
assert.equal(JSON.stringify(timer.stats(12)),JSON.stringify(state),'A stopped simulation clock freezes every reading');

// Sand can stop without the inventory becoming empty. Do not keep counting down.
for(let i=1;i<=20;i++)timer.sample(12+i/10,900,0,100,0,0);
state=timer.stats(14);
assert.equal(state.status,'stalled');
assert.equal(state.remainingSeconds,null);
assert.equal(state.remaining,900);
assert.equal(state.elapsed,4);
timer.sample(14.1,900,0,100,Math.PI/2,0);
assert.equal(timer.stats(14.1).status,'turning');
assert.equal(timer.stats(14.1).remainingSeconds,null);

// Repeated reversals during a tumble must not invent repeated timed runs.
for(let i=1;i<=12;i++)timer.sample(14.1+i/10,900,0,100,i*Math.PI,6);
assert.equal(timer.stats(15.3).run,1);
for(let i=1;i<=5;i++)timer.sample(15.3+i/10,900,0,100,Math.PI,0);
state=timer.stats(15.8);
assert.equal(state.run,2);
assert.equal(state.direction,-1);
assert.equal(state.remaining,100,'A partial flip measures the newly elevated bulb');
assert(state.elapsed<.5,'A stable flip starts a new run');
assert.equal(state.remainingSeconds,null,'Do not reuse the old direction\'s flow rate');
for(let i=1;i<=10;i++)timer.sample(15.8+i/10,900+i*5,0,100-i*5,Math.PI,0);
assert(Math.abs(timer.stats(16.8).remainingSeconds-1)<.25,'The reversed stream develops its own estimate');

// The last grains inside the throat still count. Completion requires zero.
timer.sample(17,999,1,0,Math.PI,0);
assert.notEqual(timer.stats(17).status,'complete');
timer.sample(17.1,1000,0,0,Math.PI,0);
state=timer.stats(17.1);
assert.equal(state.status,'complete');
assert.equal(state.remainingSeconds,0);
assert.equal(state.fraction,1);
assert.equal(timer.stats(25).elapsed,state.elapsed,'The finished duration holds while the simulation continues');
for(let i=1;i<=6;i++)timer.sample(25+i/10,1000,0,0,0,0);
state=timer.stats(25.6);
assert.equal(state.run,3);
assert.equal(state.remaining,1000);
assert(state.elapsed<.6);
assert.notEqual(state.status,'complete');

// Small orientation noise and stale asynchronous samples cannot reset a run.
const uncertain=make(0,100);
uncertain.sample(.1,90,0,10,Math.PI,0);
uncertain.sample(.2,90,0,10,Math.PI/2,0);
uncertain.sample(.5,90,0,10,0,0);
assert.equal(uncertain.stats(.5).run,1);
const before=JSON.stringify(uncertain.stats(.5));
uncertain.sample(.3,0,0,100,Math.PI,0);
uncertain.sample(.6,0,0,1,0,0);
assert.equal(JSON.stringify(uncertain.stats(.5)),before,'Stale or incomplete inventories are ignored');
console.log('PASS measured hourglass timer: flow, stall, tumble, reversal, last grain, completion and restart');
