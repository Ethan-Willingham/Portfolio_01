/* Route ownership and continuity use the real coast grid and ship movement. */
const assert=require('node:assert/strict'),{W,C,earth}=require('./sea-fixtures.cjs');
const g=new C.Game(earth);g.sail();g.spawnTimer=1e9;g.bossSites=[];
const target=g.ports.find(p=>p.id==='nassau');assert.ok(g.navigate(target));
assert.equal(g.courseStatus().state,'sailing');const marked=g.target;
g.step(1/60,{x:1});assert.equal(g.autopilot,false);assert.equal(g.route.length,0);assert.equal(g.target,marked);assert.equal(g.courseStatus().state,'manual');
for(let i=0;i<60;i++)g.step(1/60,{x:1});const here={x:g.player.x,y:g.player.y},path=earth.route(here,target);assert.ok(g.followCourse(target,path));assert.notEqual(g.route,path);
assert.equal(g.takeHelm(),true);assert.equal(g.takeHelm(),false);assert.equal(g.target.id,'nassau');
assert.equal(g.followCourse(target,[]),false);assert.equal(g.followCourse(target,null),false);assert.equal(g.autopilot,false);
const originalClear=earth.clear;earth.clear=()=>false;assert.equal(g.followCourse(target,[target]),false);earth.clear=originalClear;assert.equal(g.autopilot,false);
const ocean=W.point(-140,10);Object.assign(g.player,{...ocean,vx:150,vy:0});g.wake=[{...ocean}];
const next={x:ocean.x+250,y:ocean.y,name:'Next water'};g.followCourse(next,[{x:ocean.x+2,y:ocean.y},next]);g.step(1/60);assert.equal(g.route.length,1);assert.equal(g.player.vx,150,'passing a waypoint must not cut throttle for a frame');
const cues=[];g.onEvent=(kind,text)=>cues.push({kind,text});g.followCourse(next,[next]);for(let i=0;i<60*10;i++)g.step(1/60);
assert.equal(g.autopilot,false);assert.equal(g.courseStatus().state,'arrived');assert.equal(cues.filter(c=>c.kind==='arrival').length,1);
for(const destination of [target,g.sites[0],g.signals[0]]){g.target={...destination};Object.assign(g.player,destination);assert.equal(g.courseStatus().state,'arrived');g.player.x+=500;assert.equal(g.courseStatus().state,'manual');}
g.cancelCourse();assert.equal(g.courseStatus(),null);
// The date line is a short water passage, not a 360-degree detour.
const seam={x:W.W-50,y:ocean.y},across={x:50,y:ocean.y,name:'Across the seam'};Object.assign(g.player,{...seam,vx:0,vy:0});g.wake=[{...seam}];assert.ok(g.navigate(across));assert.ok(g.routeEstimate(g.route).distance<200);for(let i=0;i<600;i++)g.step(1/60);assert.equal(g.courseStatus().state,'arrived');
console.log('PASS manual takeover, fresh routes, clear first legs, continuous waypoint throttle, one arrival cue, destination states and date-line passage');
