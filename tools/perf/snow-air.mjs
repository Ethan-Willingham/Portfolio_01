// Bounded MAC airflow checks. No browser, rendering or decorative particles.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const ctx = vm.createContext({ performance, worldSnowEnabled:true, bathMode:false, gameOver:false, gameWon:false,
  player:{x:0,y:60,vx:0,vy:0,thrusting:true}, PLAYER_W:22, PLAYER_H:25, rocketIntensity:1,
  liquidWorldSolidAt:(x,y)=>y>=128&&y<160, liquidPointInMiner:()=>false,
  rocketNozzles:()=>[{x:7,y:84},{x:15,y:84}], rocketExhaustDir:()=>({x:0,y:1}), liquidLineClear:(x0,y0,x1,y1)=>y1<128 });
const source=fs.readFileSync(new URL('../../js/sluice/159-snow-air.js',import.meta.url),'utf8');
const api=vm.runInContext('(function(){var Math=globalThis.Math;'+source+';return {air:snowAir,update:updateSnowAir,shift:snowAirShift};})()',ctx);
for(let i=0;i<180;i++)api.update(1/60);
const a=api.air;
let left=0,right=0,up=0,inside=0,energy=0;
for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){
 const i=(y*a.w+x)*4,wx=a.x+(x+.5)*a.cell,wy=a.y+(y+.5)*a.cell,u=a.field[i],v=a.field[i+1];
 assert.ok(Number.isFinite(u)&&Number.isFinite(v));energy+=u*u+v*v;
 if(wy>=128)inside=Math.max(inside,Math.abs(u)+Math.abs(v));
 if(wy>90&&wy<128&&wx<0)left=Math.min(left,u);
 if(wy>90&&wy<128&&wx>22)right=Math.max(right,u);
 if(wy>40&&wy<120&&Math.abs(wx-11)>25)up=Math.min(up,v);
}
console.log({peak:a.peak,left,right,up,inside,projection:[a.divergenceBefore,a.divergenceAfter],ms:a.ms});
assert.ok(left < -25 && right>25,'impinging jet spreads along both sides of the floor');
assert.ok(up < -8,'resolved returning airflow lifts powder outside the downward core');
assert.equal(inside,0,'no airflow through a solid roof into the open pocket below it');
const preserved=a.u[20*a.w+31];api.shift(a.x+8,a.y);assert.equal(a.u[20*a.w+30],preserved,'moving the window preserves world-space face velocity');
assert.ok(a.divergenceAfter<a.divergenceBefore*.5,'pressure projection reduces divergence');
assert.ok(a.ms<20,'bounded local solve fits a frame on the test host');
// No input must remove energy, then idle completely.
ctx.player.thrusting=false;
for(let i=0;i<240;i++)api.update(1/60);
assert.equal(a.active,false);assert.equal(a.peak,0);assert.ok(a.field.every(v=>v===0));
console.log('PASS projected nozzle flow, wall jets, recirculation, solid walls and idle shutdown');
