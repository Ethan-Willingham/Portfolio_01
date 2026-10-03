import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FilmModel} from '../js/soap-film-model.js';
const results={};
// Divergence-free streamfunction on MAC faces gives an independent closed-flow fixture.
function swirl(m){const n=m.n,L=m.p.lengthMeters,psi=(x,y)=>.00008*Math.sin(Math.PI*x/n)**2*Math.sin(Math.PI*y/n)**2;
 for(let y=0;y<n;y++)for(let x=0;x<=n;x++)m.u[y*(n+1)+x]=(psi(x,y+1)-psi(x,y))/m.dx;
 for(let y=0;y<=n;y++)for(let x=0;x<n;x++)m.v[y*n+x]=-(psi(x+1,y)-psi(x,y))/m.dx;
}
const closed=new FilmModel(64,'51a9f17c',{},Float64Array);swirl(closed);const mass=closed.volume(),initialMax=Math.max(...closed.h),initialMin=Math.min(...closed.h);let a=closed.h,b=closed.h1;
for(let k=0;k<1000;k++){closed.transport(a,b,.008,false);[a,b]=[b,a];}
const error=Math.abs(closed.volume(a)/mass-1);assert.ok(error<1e-12);assert.ok(Math.min(...a)>=initialMin-1e-8);assert.ok(Math.max(...a)<=initialMax+1e-8);results.closed={relativeMassError:error,minNm:Math.min(...a),maxNm:Math.max(...a),steps:1000};
const fullClosed=new FilmModel(64,'51a9f17c',{evaporationNmPerSecond:0,drainageSpeedMetersPerSecond:0});fullClosed.h.fill(600);fullClosed.replenished=fullClosed.volume();
for(let k=0;k<200;k++)fullClosed.advance(.04);const fc=fullClosed.measure();assert.ok(Math.abs(fc.massBalanceErrorM3)/fc.replenishedM3<1e-6);assert.ok(fc.thicknessRangeNm[0]>599.9&&fc.thicknessRangeNm[1]<600.1);results.closedFullSolver={relativeMassError:fc.massBalanceErrorM3/fc.replenishedM3,thicknessRangeNm:fc.thicknessRangeNm,seconds:8};
const projection=new FilmModel(64,'51a9f17c',{},Float64Array);for(let y=0;y<64;y++)for(let x=1;x<64;x++)projection.u[y*65+x]=.001*Math.sin(x*.35+y*.12);projection.project(20);let d=projection.measure();assert.ok(d.divergenceMaxPerSecond<1e-5);results.projection=d.divergenceMaxPerSecond;
const buoy=new FilmModel(64,'51a9f17c',{},Float64Array);buoy.advance(.04);let central=0;for(let y=40;y<60;y++)for(let x=20;x<44;x++)central+=buoy.v[y*64+x];assert.ok(central<0);results.buoyancy={meanLowerCenterV:central/480,direction:'up, negative screen y'};
function run(n,dt,seconds,Type=Float64Array){const m=new FilmModel(n,'51a9f17c',{},Type);for(let t=0;t<seconds-1e-8;t+=dt)m.advance(dt);return m;}
const dtA=run(32,.04,4),dtB=run(32,.02,4),dtC=run(32,.01,4);const rms=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length);
results.dt={rmsNm40vs20:rms(dtA.h,dtB.h),rmsNm20vs10:rms(dtB.h,dtC.h)};assert.ok(results.dt.rmsNm20vs10<results.dt.rmsNm40vs20);
const coarse=run(32,.02,15),medium=run(64,.02,15),fine=run(128,.02,15);
const restrict=m=>{const n=m.n,b=new Float64Array(n*n/4);for(let y=0;y<n/2;y++)for(let x=0;x<n/2;x++){const i=2*y*n+2*x;b[y*n/2+x]=(m.h[i]+m.h[i+1]+m.h[i+n]+m.h[i+n+1])/4;}return b;};
results.grid={rmsNm32vs64:rms(coarse.h,restrict(medium)),rmsNm64vs128:rms(medium.h,restrict(fine))};assert.ok(results.grid.rmsNm64vs128<results.grid.rmsNm32vs64);
const f32=run(32,.02,2,Float32Array),f64=run(32,.02,2);results.precisionRmsNm=rms(f32.h,f64.h);assert.ok(results.precisionRmsNm<.01);
if(process.argv.includes('--long')){const n=Number(process.env.SOAP_GRID||64),m=new FilmModel(n);const times=[],start=performance.now();let next=60;
 for(let k=0;k<60000&&m.cycle<4;k++){const a=performance.now();m.advance(.04);if(k>30)times.push(performance.now()-a);if(m.time>=next){const d=m.measure();console.log(JSON.stringify({at:d.time,cycle:d.cycle,state:d.state,min:d.thicknessRangeNm[0],max:d.thicknessRangeNm[1]}));next+=60;}}
 d=m.measure();assert.ok(m.cycle>=4,'Three complete phrases must renew');assert.ok(Math.abs(d.massBalanceErrorM3)/d.replenishedM3<1e-4);times.sort((a,b)=>a-b);results.long={n,wallSeconds:(performance.now()-start)/1000,events:m.events,diagnostics:d,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]};
}
console.log(JSON.stringify(results,null,2));if(process.env.SOAP_REPORT)fs.writeFileSync(process.env.SOAP_REPORT,JSON.stringify(results,null,2));
