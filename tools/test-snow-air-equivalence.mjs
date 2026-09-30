// Compare the production CPU functions against v28.130 with exact field and material checks.
// REFERENCE_REF or BEFORE/AFTER override the sources; DUMP selects an external report path.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { performance } from 'node:perf_hooks';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reference=process.env.REFERENCE_REF||'3d9c4d6';
const paths={before:process.env.BEFORE||'git:'+reference+':js/sluice/159-snow-air.js',after:process.env.AFTER||root+'/js/sluice/159-snow-air.js'};
const sources={before:process.env.BEFORE?fs.readFileSync(paths.before,'utf8'):execFileSync('git',['show',reference+':js/sluice/159-snow-air.js'],{cwd:root,encoding:'utf8'}),after:fs.readFileSync(paths.after,'utf8')};
const liquids=fs.readFileSync(root+'/js/sluice/070-collision-liquids.js','utf8');
const ray=liquids.slice(liquids.indexOf('  function liquidLineClear('),liquids.indexOf('\n  function oilIntakeWorldPos(',liquids.indexOf('  function liquidLineClear(')));
const fields=['u','v','tu','tv','pressure','divergence','inletU','inletV','solid','field','grainField'];
const scalars=['x','y','active','life','revision','time','peak','trail','divergenceBefore','divergenceAfter'];
const seed=982451653;
function build(source,fixture){
 const context=vm.createContext({fixture:structuredClone(fixture),performance,Float32Array,Float64Array,Uint8Array});
 return new vm.Script(`(function(){
 var player=fixture.player,snow={time:0},surfaceWind={current:.27},worldSnowEnabled=true,bathMode=false,gameOver=false,gameWon=false;
 var PLAYER_W=32,PLAYER_H=30,rocketIntensity=fixture.intensity;
 var rayCalls=0;
 function liquidWorldSolidAt(x,y){return fixture.terrain==='floor'?y>=500:fixture.terrain==='wall'?x>=550:fixture.terrain==='corner'?(x>=550||y>=500):false;}
 function liquidPointInMiner(x,y){return x>=player.x+4&&x<=player.x+28&&y>=player.y+3&&y<=player.y+29;}
 function rocketNozzles(){return fixture.nozzles;}
 function rocketExhaustDir(){return fixture.direction;}
 ${ray.replace('  function liquidLineClear(x0, y0, x1, y1) {','  function liquidLineClear(x0, y0, x1, y1) { rayCalls++;')}
 ${source}
 snowAir.active=true;snowAir.life=fixture.life;snowAir.x=fixture.player.x-384;snowAir.y=fixture.player.y-120;
 var state=${seed};
 function random(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}
 for(var i=0;i<snowAir.u.length;i++){snowAir.u[i]=(random()-.5)*90;snowAir.v[i]=(random()-.5)*90;}
 return {air:snowAir,update:function(dt,frame){snow.time+=dt;if(fixture.shift&&frame===3)player.x+=12;updateSnowAir(dt);},rays:function(){return rayCalls;}};
 })()`).runInContext(context);
}
const fixtures=[
 {name:'still',intensity:0,life:3,player:{x:400,y:200,vx:0,vy:0,thrusting:false},nozzles:[],direction:{x:0,y:1},terrain:'empty'},
 {name:'idle-expiry',intensity:0,life:.015,player:{x:400,y:200,vx:0,vy:0,thrusting:false},nozzles:[],direction:{x:0,y:1},terrain:'empty'},
 {name:'jet-one',intensity:.84,life:3,player:{x:400,y:200,vx:0,vy:-17,thrusting:true},nozzles:[{x:416,y:229}],direction:{x:0,y:1},terrain:'empty'},
 {name:'jet-two-floor',intensity:.84,life:3,player:{x:400,y:200,vx:0,vy:-17,thrusting:true},nozzles:[{x:410,y:229},{x:422,y:229}],direction:{x:0,y:1},terrain:'floor'},
 {name:'banked-four-wall',intensity:.67,life:3,player:{x:400,y:200,vx:80,vy:7,thrusting:true},nozzles:[{x:404,y:225},{x:412,y:229},{x:420,y:229},{x:428,y:225}],direction:{x:.6,y:.8},terrain:'wall'},
 {name:'shifted-two-corner',intensity:.93,life:3,shift:true,player:{x:400,y:200,vx:-97,vy:12,thrusting:true},nozzles:[{x:410,y:229},{x:422,y:229}],direction:{x:-.28,y:Math.sqrt(1-.28*.28)},terrain:'corner'}
];
const report=[];let comparisons=0;
for(const fixture of fixtures)for(const dt of [1/120,1/60,.035,.05]){
 const a=build(sources.before,fixture),b=build(sources.after,fixture),times={before:[],after:[]};
 for(let frame=0;frame<8;frame++){
  for(const label of frame%2?['after','before']:['before','after']){const obj=label==='before'?a:b,t=performance.now();obj.update(dt,frame);times[label].push(performance.now()-t);}
  for(const field of fields){const av=a.air[field],bv=b.air[field];assert.equal(Buffer.compare(Buffer.from(av.buffer,av.byteOffset,av.byteLength),Buffer.from(bv.buffer,bv.byteOffset,bv.byteLength)),0,`${fixture.name}/${dt}/${frame}/${field}`);comparisons++;}
  for(const field of scalars){assert.equal(a.air[field],b.air[field],`${fixture.name}/${dt}/${frame}/${field}`);comparisons++;}
 }
 const median=v=>v.slice(2).sort((x,y)=>x-y)[Math.floor((v.length-2)/2)];
 report.push({name:fixture.name,dt,frames:8,beforeMedianMs:median(times.before),afterMedianMs:median(times.after),beforeRays:a.rays(),afterRays:b.rays()});
}
const sourceSHA256=Object.fromEntries(Object.entries(sources).map(([key,source])=>[key,createHash('sha256').update(source).digest('hex')]));
const result={pass:true,comparisons,paths,sourceSHA256,cases:report,limitation:'CPU-only exact field regression with deterministic geometry fixtures; microbenchmark timings are not whole-game FPS.'};
fs.writeFileSync(process.env.DUMP||'/tmp/snow-air-nozzle-cache-report.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
