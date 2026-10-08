// Compare every flake/contact with the original per-point animated rig query.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('js/sluice/159-snow-physics.js','utf8');
const reference=source.replace('var minerHull = player && !gameWon ? rigContactHull() : null;', '')
  .replace('(minerHull && rigHullContains(minerHull, nx, ny, 0))','liquidPointInMiner(nx, ny)');
assert.notEqual(source,reference);
const hull=fs.readFileSync('js/sluice/069-rig-hull.js','utf8');
function extract(text,name) {
  const start=text.indexOf('  function '+name+'('),open=text.indexOf('{',start);let depth=1,end=open+1;
  while(depth&&end<text.length){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;end++;}
  assert(start>=0&&depth===0,name);return text.slice(start,end);
}
const playerSource=fs.readFileSync('js/sluice/210-player.js','utf8');
const dynamics=extract(playerSource,'playerBodyScale')+'\n'+extract(playerSource,'playerFxLandOffset');
function engine(text) {
  const env={window:{},particleWeatherState:()=>({}),performance,perfLive:{enabled:false},playPerfActive:false,
    cam:{x:0,y:-300},screenW:1200,screenH:700,SKY_ROWS:4,TILE:32,COLS:320,TOTAL_ROWS:500,
    PLAYER_W:22,PLAYER_H:26,LIQUID_CELL:2.5,LIQUID_SNOW_DENSITY:3.2,GRAVITY:600,
    SNOW_RATE:0,SNOW_FLAKE_CAP:5400,SNOW_MASS_CAP:120000,LIQUID_MAX_PARTICLES:65536,SNOW_ACTIVE_CAP:36000,
    rain:{cells:{},intensity:0},liquidWGPU:{simActive:true},surfaceWind:{current:.3},
    player:{x:550,y:80,vx:0,vy:0,squash:0,dir:1,thrustSpool:1,bodyTiltRender:0},gameWon:false,
    particleWeatherRect:()=>({left:0,right:1200,top:-300,bottom:128}),particleWeatherField:()=>{},rainCatchLakes:()=>{},
    liquidWorldSolidAt:(x,y)=>y>=128||(x>780&&x<805&&y>60),
    snowAirAt:(x,y)=>[(x>300&&x<650)?-15:0,(x>300&&x<650)?-30:0],updateSnowAir:()=>{},
    rainCell:(x,y)=>Math.floor(y/6)*1708+Math.floor(x/6),rainContactCount:()=>0};
  const api=new Function(...Object.keys(env),`
    var drilling=false,_pfxLandAge=0,_pfxLandDip=0,playerBodyScaleValue={x:1,y:1};
    ${dynamics}\n${hull}\n${text}
    var landed=[], hullCalls=0, originalHull=rigContactHull;
    rigContactHull=function(){hullCalls++;return originalHull.apply(this,arguments);};
    function liquidPointInMiner(x,y){return !!player&&!gameWon&&rigHullContains(rigContactHull(),x,y,0);}
    snowScan=function(){};snowSupportJobStep=function(){};snowTemperature=function(){return -4;};
    snowBedContact=function(x,y){return x>200&&x<250&&y>105;};
    snowLand=function(p){landed.push([p.x,p.y,p.vx,p.vy,p.size]);return true;};
    return {snow,player,rain,update:updateSnow,landed,
      control:function(frame,won){gameWon=won;_pfxLandAge=(frame%23)*.01;_pfxLandDip=(frame%3)*2;drilling=frame%11===0;},
      hullCalls:function(){return hullCalls;}};
  `)(...Object.values(env));
  return api;
}
let seed=394;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const a=engine(reference),b=engine(source);
let checks=0;
for(let trial=0;trial<24;trial++) {
  const flakes=Array.from({length:450},()=>({x:50+random()*1000,y:-260+random()*380,vx:(random()-.5)*150,
    vy:(random()-.1)*120,size:random(),phase:random()*6}));
  for(const f of [a,b]){f.snow.grains=structuredClone(flakes);f.landed.length=0;f.snow.time=0;}
  for(let frame=0;frame<60;frame++) {
    const dt=[1/30,1/60,1/144,1/240][trial%4];
    for(const f of [a,b]) {
      Object.assign(f.player,{x:550+frame*.7,y:80-frame*.1,vy:Math.sin(frame*.1)*350,
        squash:frame%8===0?.3:0,dir:frame%9<4?-1:1,bodyTiltRender:Math.sin(frame*.15)*.35});
      f.control(frame,trial===23);f.update(dt,0);
    }
    assert.deepEqual(b.snow.grains,a.snow.grains,`${trial}/${frame} flake states and order`);
    assert.deepEqual(b.landed,a.landed,`${trial}/${frame} contact states`);checks++;
  }
}
console.log(`PASS ${checks} exact full flake passes through animated rig, terrain, powder contacts and game-won state.`);
console.log(`Rig pose evaluations: ${a.hullCalls()} -> ${b.hullCalls()}`);
if(process.env.BENCH==='1') {
  function time(text){const f=engine(text),times=[];
    const flakes=Array.from({length:1000},(_,i)=>({x:50+i,y:-200000+(i%100)*5,vx:10,vy:53,size:(i%3)*.5,phase:0}));
    for(let run=0;run<9;run++){f.snow.grains=structuredClone(flakes);const t=performance.now();for(let n=0;n<400;n++)f.update(1/144,0);times.push((performance.now()-t)/400);}
    return times.sort((a,b)=>a-b)[4];}
  const before=time(reference),after=time(source);console.log({beforeMs:before,afterMs:after,improvementPercent:(1-after/before)*100});
}
