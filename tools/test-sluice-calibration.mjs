import assert from 'node:assert/strict';
import '../js/wss-sluice-calibration.js';

const {validate,estimate}=globalThis.WSSSluiceCalibration;
const base={lengthInches:51,liner:'Expanded metal over ribbed mat',goldClass:'fine',slopeDeg:8,flowGpm:15,feedLbMin:4,goldInMg:100,goldRecoveredMg:75};
assert.throws(()=>validate({...base,goldRecoveredMg:101}),/between zero/);
assert.throws(()=>validate({...base,flowGpm:0}),/water flow/);
assert.equal(estimate([],base).status,'no-runs');
assert.equal(estimate([{...base,liner:'other mat'}],base).status,'no-runs');
assert.equal(estimate([base,{...base,goldRecoveredMg:70}],base).status,'need-runs');
const repeated=estimate([base,{...base,goldRecoveredMg:70},{...base,goldRecoveredMg:80}],base);
assert.equal(repeated.status,'repeat');
assert.equal(repeated.rate,.75);
assert.equal(repeated.low,.7);
assert.equal(repeated.high,.8);

const spread=[];
for(const water of [13,17])for(const feed of [3.5,4.5])for(const slope of [7.5,8.5]){
 const recovered=75-(water-15)*.5-(feed-4)*2+(slope-8);
 spread.push({...base,flowGpm:water,feedLbMin:feed,slopeDeg:slope,goldRecoveredMg:recovered});
}
const middle=estimate(spread,base);
assert.equal(middle.status,'interpolated');
assert(Math.abs(middle.rate-.75)<.01);
assert(middle.rate-middle.low>=.099 && middle.high-middle.rate>=.099,'small samples retain a wide empirical band');
assert.equal(estimate(spread,{...base,flowGpm:22}).status,'outside');
assert.equal(estimate(spread,{...base,goldClass:'ultra-fine'}).status,'no-runs');
const distant=[...Array(4).fill({...base,flowGpm:1,feedLbMin:1,slopeDeg:3}),...Array(4).fill({...base,flowGpm:100,feedLbMin:100,slopeDeg:13})];
assert.equal(estimate(distant,{...base,flowGpm:10,feedLbMin:10,slopeDeg:8}).status,'gap');
console.log('PASS field-trial validation, repeat estimates, held-out interpolation, hardware separation and refusal outside evidence');
