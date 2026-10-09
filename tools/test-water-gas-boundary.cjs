const assert=require('node:assert/strict');
const M=require('../js/liquid-air-model.js');
const atmosphere=3796635.5,minimum=-80000;
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
function test(volume,amount,coupling,flux){
  const p=M.isothermalPressure({volume,amount,coupling,flux,atmosphere,minimum});
  assert(Number.isFinite(p));assert(p>=minimum);
  const next=volume-flux+coupling*p;
  if(amount>0 && p>minimum)near((atmosphere+p)*next,atmosphere*amount,1e-7);
  if(amount===0){
    assert(next>=-1e-7);if(p>minimum)near(next,0,1e-7);
  }
  return p;
}
near(test(100,100,0,0),0);
near(test(100,100,0,50),atmosphere);
near(test(100,100,0,-100),minimum);
near(test(40,0,.001,0),-40000);
near(test(40,0,.001,-100),minimum);
near(test(40,0,.001,80),40000);
// One-step squeezing and expansion, large room pressure with very small gauge
// differences, and vacuum closure. Verify the physical EOS and complementarity.
for(const volume of [1/256,40,100000])for(const ratio of [.1,1,10])for(const coupling of [1e-8,.0003,.02])for(const change of [-.1,0,.1,1,2]){
  test(volume,volume*ratio,coupling,volume*change);
  test(volume,0,coupling,volume*change);
}
assert.throws(()=>M.isothermalPressure({volume:40,amount:1,coupling:-1,flux:0,atmosphere,minimum}));
console.log('PASS isothermal EOS, stable small gauge changes, pressure floor and vapor closure in 270 boundary cases.');
