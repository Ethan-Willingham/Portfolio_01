// Physical nozzle pressure, independent of rendered smoke. Run from repo root.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const local=fs.readFileSync('js/sluice/180-smoke-cpu.js','utf8');
const anchors=local.slice(local.indexOf('  function playerLocalToWorld('),local.indexOf('  function playerIsUnderground('));
const source=anchors+['200-rocket-plume.js','348-sky-slimes.js'].map(f=>fs.readFileSync('js/sluice/'+f,'utf8')).join('\n');
function fixture(){
 const math=Object.create(Math);math.random=()=>.3;
 const w={Math:math,window:{},TILE:32,SKY_ROWS:16,COLS:320,PLAYER_W:22,PLAYER_H:26,DECK_LEFT_COL:149,
  player:{x:489,y:200,renderX:489,renderY:200,vx:0,vy:0,bodyTiltRender:0,
   lastMoveU:true,thrusting:true,fuel:100,jetForce:880},
  PERF_DISABLE_ROCKET:false,gameOver:false,gameWon:false,shopOpen:false,shopState:'closed',
  ledgerOpen:false,cargoManifestOpen:false,roverMode:false,drilling:false,bathMode:false,
  jelloBodies:[],tileAt:()=>null,liquidSampleCircle:()=>({wet:0})};
 vm.createContext(w);vm.runInContext(source,w);w.skySlimeNext=1e8;w.SKY_SLIME_GRAVITY=0;
 return w;
}
function ball(w,x=499.9,y=285,r=25){const s=w.skySlimeFresh(x,y);Object.assign(s,{r,vx:0,vy:0,spin:0,entry:0});w.skySlimes.push(s);return s;}
function pulse(w,h=.1){w.skySlimeJetStep(w.skySlimeJetFrame(),h,0,0,0,0);}
function shot(x=499.9,y=285,setup=()=>{}){const w=fixture(),s=ball(w,x,y);setup(w,s);pulse(w);return {w,s};}
const center=shot().s,right=shot(525.9).s,left=shot(473.9).s;
assert(center.vy>30&&Math.abs(center.vx)<1,'centered exhaust presses downward without choosing a side');
assert(right.vx>5&&left.vx< -5,'curved surface pressure pushes offset guests outwards');
assert(Math.abs(right.vx+left.vx)<1&&Math.abs(right.vy-left.vy)<1,'mirrored nozzle contacts agree');
assert(right.spin< -.1&&left.spin>.1,'off-center skin drag imparts physical spin');
assert(center.playing&&right.playing,'jet contact suspends visitor navigation');
const near=shot(499.9,270).s,far=shot(499.9,350).s;
assert(near.vy>far.vy*3&&far.vy>0,'exhaust loses pressure as it spreads and travels');
const weak=shot(499.9,285,w=>w.player.jetForce=220).s;
assert(center.vy>weak.vy*3,'force follows the engine, including spool and booster strength');
const heavy=shot(499.9,285,w=>w.SKY_SLIME_MASS=5).s;
assert(heavy.vy<center.vy*.55&&heavy.vy>center.vy*.45,'heavy guests resist the same gas impulse');
for(const [x,y] of [[499.9,170],[499.9,450],[620,285]]){
 const s=shot(x,y).s;assert.equal(s.vx,0);assert.equal(s.vy,0);assert(!s.playing,'only the finite downward plume can hit');
}
for(const disable of [w=>w.player.lastMoveU=false,w=>w.player.thrusting=false,w=>w.player.fuel=0,
 w=>w.player.jetForce=0,w=>w.bathMode=true,w=>w.shopOpen=true,w=>w.drilling=true,w=>w.gameOver=true,
 w=>w.rocketTune.enabled=false,w=>w.PERF_DISABLE_ROCKET=true]){
 const s=shot(499.9,285,disable).s;assert.equal(s.vy,0,'inactive jets cannot leave stale pressure');
}
const blocked=shot(499.9,330,w=>w.tileAt=(r,c)=>r===8?{type:'stone'}:null).s;
assert.equal(blocked.vy,0,'a solid tile shields the entire fan');
const gel=shot(499.9,285,w=>w.rocketInJello=(x,y)=>y>=245&&y<=255).s;
assert.equal(gel.vy,0,'buried soft slimes shield the guest behind them');
const shadow=fixture(),front=ball(shadow,499.9,285,30),rear=ball(shadow,499.9,350,20);
pulse(shadow);assert(front.vy>0&&rear.vy===0,'front guest intercepts the jet before the rear guest');
const banked=shot(499.9,285,w=>w.player.bodyTiltRender=.35).s;
assert(banked.vx>5&&banked.vy>0,'a tilted nozzle changes where the pressure lands');
const renderLag=shot(499.9,285,w=>{w.player.renderX-=100;w.player.renderY-=80;}).s;
assert(Math.abs(renderLag.vy-center.vy)<1e-6,'render interpolation cannot move physical nozzles');
const spent=shot(499.9,285,(w,s)=>s.vy=600).s;
assert.equal(spent.vy,600,'a guest outrunning the gas gains no extra velocity');
const visual=fixture(),v=ball(visual);
assert(visual.rocketInSkySlime(v.x,v.y));
const nz=visual.rocketNozzles()[0];
assert(visual.rocketFindImpactAlong(nz.x,nz.y,0,1,160)<50,'drawn plume and wash stop on the sky guest');
const report=[];
for(const fps of [30,60,144]){
 const w=fixture(),s=ball(w,525.9,285);
 for(let n=0;n<fps/2;n++)w.skySlimeTick(1/fps);
 report.push({fps,x:s.x,y:s.y,vx:s.vx,vy:s.vy,spin:s.spin});
 const ground=fixture();ground.player.y=ground.player.renderY=390;
 ground.tileAt=(r,c)=>r>=16?{type:'stone'}:null;
 const g=ball(ground,525.9,487);ground.SKY_SLIME_GRAVITY=300;
 for(let n=0;n<fps;n++)ground.skySlimeTick(1/fps);
 assert(g.x>535&&g.y+g.r<=512.01,'low flyover rolls a grounded guest while terrain keeps it contained');
}
for(const key of ['x','y','vx','vy','spin'])assert(Math.max(...report.map(r=>r[key]))-Math.min(...report.map(r=>r[key]))<1,'jet integration is frame-rate consistent: '+key);
console.log({center:{vx:center.vx,vy:center.vy},right:{vx:right.vx,vy:right.vy,spin:right.spin},near:near.vy,far:far.vy});
console.log(report);
console.log('PASS: nozzle pressure, spread, mass, spin, live gating, terrain/body shadows, bank, render independence, rolling, and frame rates.');
