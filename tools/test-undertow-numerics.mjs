import assert from 'node:assert/strict';
import {fft,initialVelocity,divergence,project,rms,transportDye} from '../js/undertow-model.js';
for(const n of [16,32,64]){
 const initial=initialVelocity(n);assert.ok(rms(divergence(initial,n))<1e-12);console.log('PASS discrete-curl initialization',n);
 const a=Float64Array.from({length:2*n*n},(_,i)=>.2*Math.sin(i*.173)+.1*Math.cos(i*.819));const before=rms(divergence(a,n)),out=project(a,n),after=rms(divergence(out,n));assert.ok(after<1e-11);assert.ok(before>.1);for(let k=0;k<2;k++){const mean=v=>v.reduce((s,x,i)=>s+(i%2===k?x:0),0)/(n*n);assert.ok(Math.abs(mean(a)-mean(out))<1e-13);}const twice=project(out,n);assert.ok(rms(twice.map((x,i)=>x-out[i]))<1e-12);console.log('PASS MAC projection, mean preservation, idempotence',JSON.stringify({n,before,after}));
}
const re=Float64Array.from({length:32},(_,i)=>Math.sin(i*.3)),orig=re.slice(),im=new Float64Array(32);fft(re,im);fft(re,im,true);assert.ok(rms(re.map((x,i)=>x-orig[i]))<1e-14);console.log('PASS FFT round trip');
const n=16,dye=Float64Array.from({length:n*n*4},(_,i)=>i%4===3?1:(i%23)/22),zero=new Float64Array(2*n*n);assert.deepEqual(transportDye(dye,zero,n,n,{sources:false}),dye);const v=initialVelocity(n),moved=transportDye(dye,v,n,n,{sources:false});assert.ok(moved.every(x=>x>=0&&x<=1));assert.ok(rms(moved.map((x,i)=>x-dye[i]))>.001);console.log('PASS dye identity, motion and bounded transport');
