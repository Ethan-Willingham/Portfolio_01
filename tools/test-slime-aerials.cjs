// Rig/sky-slime contact contract. Run: node tools/test-slime-aerials.cjs
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function fixture(tuning={}) {
  const math=Object.create(Math);math.random=()=>.3;
  const w = {Math:math, TILE:32,SKY_ROWS:16,COLS:320,PLAYER_W:22,PLAYER_H:26,DECK_LEFT_COL:149,
    player:{x:100,y:486,vx:0,vy:0},tileAt:(r,c)=>r>=16?{type:'stone'}:null,
    solidAt:(x,y,wi,h)=>y+h-1>=512,liquidSampleCircle:()=>({wet:0})};
  vm.createContext(w); vm.runInContext(fs.readFileSync('js/sluice/348-sky-slimes.js','utf8'),w);
  Object.assign(w,tuning);w.skySlimeNext=1e8;
  const s=w.skySlimeFresh(500,487);Object.assign(s,{r:25,spin:0,vx:0,vy:0,entry:0,visit:'seek',visitT:0});
  w.skySlimes.push(s);return {w,s};
}
function groundHit(speed,fps,dir=1,tuning={}) {
  const {w,s}=fixture(tuning);w.player.x=s.x-dir*110-11;w.player.vx=dir*speed;
  let first=null;const collide=w.skySlimePlayer;
  w.skySlimePlayer=function(...args){const b=args[0],vx=b.vx,vy=b.vy;collide(...args);
    if(!first&&Math.hypot(b.vx-vx,b.vy-vy)>1)first={vx:b.vx,vy:b.vy};};
  for(let n=0;n<fps*8&&!first;n++){w.player.x+=w.player.vx/fps;w.player.vy=0;w.player.onGround=true;w.skySlimeTick(1/fps);}
  assert(first,'rig reaches the ball');return {...first,w,s};
}
const results=[];
for(const fps of [30,60,144]) {
  const shots=[20,80,200,290].map(speed=>groundHit(speed,fps));
  assert(shots[0].vy>-12,'gentle push has no minimum launch speed');
  for(let i=1;i<shots.length;i++)assert(shots[i].vy<shots[i-1].vy,'more closing speed gives more lift');
  assert(shots[2].vy< -105&&shots[2].vx>130,'full-speed ground shot leaves the floor');
  const left=groundHit(200,fps,-1);
  assert(Math.abs(left.vy-shots[2].vy)<.1&&Math.abs(left.vx+shots[2].vx)<.1,'mirrored ground shots');
  const light=groundHit(200,fps,1,{SKY_SLIME_MASS:1,SKY_SLIME_GRAVITY:480});
  assert(shots[2].vx<light.vx*.90,'heavier guest accelerates less from the same drive');
  assert(200-shots[2].w.player.vx>(200-light.w.player.vx)*1.8,'heavier guest gives the rig a more substantial recoil');
  function arc(shot,gravity){
    const {w,s}=fixture({SKY_SLIME_GRAVITY:gravity});s.vx=shot.vx;s.vy=shot.vy;
    let peak=s.y;for(let frame=1;frame<fps*3;frame++){
      w.skySlimeTick(1/fps);peak=Math.min(peak,s.y);
      if(s.bounces)return {time:frame/fps,height:487-peak};
    }
    throw Error('ball never returns to ground');
  }
  const slowArc=arc(shots[2],shots[2].w.SKY_SLIME_GRAVITY),oldArc=arc(light,480);
  assert(slowArc.time>oldArc.time*1.25,'lower gravity gives more recovery time despite a slower launch');
  assert(slowArc.height>oldArc.height*.9&&slowArc.height<oldArc.height*1.3,'longer arc keeps a similar useful launch height');
  results.push({fps,vx:shots[2].vx,vy:shots[2].vy,slowArc,oldArc});
}
assert(Math.max(...results.map(s=>s.vy))-Math.min(...results.map(s=>s.vy))<2,'launch is frame-rate consistent');
function airHit(x,y,bvx,bvy,rvx,rvy) {
  const {w,s}=fixture();Object.assign(s,{x,y,vx:bvx,vy:bvy,spin:0});Object.assign(w.player,{x:500,y:200,vx:rvx,vy:rvy});
  const mass=w.SKY_SLIME_MASS*s.r*s.r/625;
  const energy=()=>.5*mass*(s.vx*s.vx+s.vy*s.vy)+.2*mass*s.r*s.r*s.spin*s.spin+3*(w.player.vx*w.player.vx+w.player.vy*w.player.vy);
  const before=energy(),px=mass*s.vx+6*rvx,py=mass*s.vy+6*rvy;
  w.skySlimePlayer(s,500,200,rvx,rvy);
  assert(Math.abs(mass*s.vx+6*w.player.vx-px)<1e-8&&Math.abs(mass*s.vy+6*w.player.vy-py)<1e-8,'contact conserves linear momentum');
  assert(energy()<=before+.001,'rig impact and spin exchange cannot create energy');return {w,s};
}
const side=airHit(548.25,220.8,40,0,200,0).s;
assert(side.vx>180&&side.vx<205&&Math.abs(side.vy)<.001,'side bumper absorbs rebound without adding a pop');
// An already-moving ball hit at flight cruise plus upward thrust used to
// leave at 397 to 454 px/s. Hard glances should now stay near flight cruise
// (290), while the impulse still follows the actual contact normal.
const glances=[];
for(const dir of [-1,1])for(const degrees of [0,10,20,30,40]){
  const angle=degrees*Math.PI/180;
  const hit=airHit(511+dir*(16.5+25*Math.cos(angle)),220.8-25*Math.sin(angle),dir*120,20,dir*290,-160).s;
  assert(dir*hit.vx>250&&dir*hit.vx<310,'hard glancing aerial avoids the old runaway rebound');
  glances.push({degrees,dir,vx:Math.round(hit.vx),vy:Math.round(hit.vy)});
}
// Compression changes continuously: faster strikes cannot give a weaker
// normal shot. Test the same geometric contacts across the whole speed range.
for(const degrees of [0,15,30,45,60,75,90]){
  const angle=degrees*Math.PI/180;let last=0;
  for(let speed=20;speed<=800;speed+=5){
    const hit=airHit(527.5+25*Math.cos(angle),220.8-25*Math.sin(angle),0,0,speed,0).s;
    const motion=Math.hypot(hit.vx,hit.vy);
    assert(motion>=last-1e-8,'more impact speed always produces more momentum');last=motion;
  }
}
const fast=airHit(548.25,220.8,0,0,700,0).s;
assert(fast.vx>500,'power shots remain possible, with no imposed speed limit');
const under=airHit(511,179.69,0,40,0,-160).s;
assert(under.vy< -220,'rising under a falling ball creates a deliberate aerial lift');
const over=airHit(511,250.47,0,-40,0,160).s;
assert(over.vy>150&&over.vy<180,'a descending hit pushes the ball down with a moderate underbody rebound');
const brush=airHit(548.25,220.8,40,100,200,-100).s;
assert(Math.abs(brush.spin)>.5&&brush.vy>0,'glancing contact transfers spin without forcing upward aim');
const away=airHit(548.25,220.8,300,0,100,0).s;
assert.equal(away.vx,300);assert.equal(away.vy,0);assert(!away.playing,'separating contact adds no impulse');
const miss=airHit(551,160,0,0,300,-250).s;
assert.equal(miss.vx,0);assert.equal(miss.vy,0);assert(!miss.playing,'near misses are not caught');
// A supported roof returns the ball's fall energy instead of spending it
// on impossible recoil through the floor. A free rig still takes recoil.
for(const grounded of [false,true]){
  const {w,s}=fixture();Object.assign(w.player,{x:489,y:grounded?486:200,vx:0,vy:0,onGround:grounded});
  Object.assign(s,{x:500,y:w.player.y+26*.18-25.49,vy:100});
  w.skySlimePlayer(s,w.player.x,w.player.y,0,0);
  if(grounded){assert(Math.abs(s.vy+96)<.001,'roof has a modest elastic rebound without adding energy');assert.equal(w.player.vy,0,'floor carries roof recoil');}
  else {assert(s.vy< -35&&s.vy> -40&&w.player.vy>50,'airborne roof retains more height and still recoils');}
}
// Compare the same header offsets against the narrower, slippery roof.
// Find actual contact height for each hull instead of changing the normal
// or aiming an impulse toward a preferred trajectory.
const oldRoof={SKY_SLIME_RIG_HULL:[.4,.18,.6,.18,1.25,.8,.94,.98,.06,.98,-.25,.8],
  SKY_SLIME_ROOF_RESTITUTION:.9,SKY_SLIME_ROOF_FRICTION:.04};
function header(offset,tuning={}){
  const {w,s}=fixture(tuning);Object.assign(w.player,{x:500,y:200,vx:0,vy:-140});
  Object.assign(s,{x:511+offset,vx:0,vy:60});
  let lo=160,hi=226;
  for(let n=0;n<35;n++){
    s.y=(lo+hi)/2;const c=w.skySlimeRigContact(s,500,200);
    if(c&&c.depth>0)hi=s.y;else lo=s.y;
  }
  s.y=hi+.05;w.skySlimePlayer(s,500,200,0,-140);return s;
}
const headers=[];
for(const offset of [6,12,18]){
  const before=header(offset,oldRoof),after=header(offset),left=header(-offset);
  assert(after.vx>0&&after.vx<before.vx*.85,'small header errors create less sideways speed');
  assert(after.vy<before.vy,'off-center header retains more useful lift');
  assert(Math.abs(after.vx+left.vx)<.001&&Math.abs(after.vy-left.vy)<.001,'headers stay symmetric');
  headers.push({offset,before:{vx:before.vx,vy:before.vy},after:{vx:after.vx,vy:after.vy}});
}
assert(header(24).vx>100,'farther outside contact can still deliberately send a ball sideways');
console.log('HEADERS',headers);
// A shallow contact must not teleport a sprite that is normally easing
// behind the moving rig. Preserve its existing lag through the collision.
{
  const {w,s}=fixture();Object.assign(w.player,{x:500,y:200,vx:200,vy:-100,renderX:492,renderY:206});
  Object.assign(s,{x:554.95,y:220.8,vx:40,vy:100});
  w.skySlimePlayer(s,500,200,200,-100);
  assert(Math.abs(w.player.renderX-492)<.2&&Math.abs(w.player.renderY-206)<.2,'small contact cannot make an eight-pixel sprite snap');
  assert(Math.abs(w.player.x-w.player.renderX-8)<.001,'horizontal easing survives a touch');
  assert(Math.abs(w.player.y-w.player.renderY+6)<.001,'vertical easing survives a touch');
}
const landings=[];
for(const fps of [30,60,144]){
  const {w,s}=fixture();Object.assign(w.player,{x:489,y:350,vx:0,vy:0,renderX:489,renderY:350});
  let rebound=0,settledSpeed=0;
  for(let n=0;n<fps*10;n++){
    w.player.vy+=760/fps;w.player.y+=w.player.vy/fps;w.player.onGround=false;
    w.skySlimeTick(1/fps);
    const contact=w.skySlimeRigContact(s,w.player.x,w.player.y);
    assert(!contact||contact.depth<.02,'rig never sinks into a floor-supported guest');
    assert(s.y+s.r<=512.01,'landing cannot force guest through the floor');
    rebound=Math.max(rebound,-w.player.vy);
    if(n>fps*9)settledSpeed=Math.max(settledSpeed,Math.abs(w.player.vy));
  }
  assert(rebound>110&&rebound<155,'landing has a fun moderate bounce without the old trampoline launch');
  assert(settledSpeed<1&&w.player.onGround,'small contacts settle without perpetual hopping');
  assert(w.skySlimeSupportsRig(w.player.x,w.player.y),'guest counts as real foot support');
  assert(!w.skySlimeSupportsRig(w.player.x+70,w.player.y),'walking away loses support');
  landings.push({fps,rebound,restY:w.player.y});
}
// A small landing error should allow another natural bounce. Keep both
// bodies free to move so this would fail if a corner knocked them apart.
function bounceRun(fps,offset,tuning={}){
  const {w,s}=fixture(tuning);Object.assign(w.player,{x:489+offset,y:350,vx:0,vy:0});
  let bounces=0,maxDrift=0;
  for(let n=0;n<fps*3;n++){
    w.player.vy+=760/fps;w.player.x+=w.player.vx/fps;w.player.y+=w.player.vy/fps;w.player.onGround=false;
    if(w.player.y+26>512){w.player.y=486;w.player.vy=0;w.player.onGround=true;}
    const incoming=w.player.vy;w.skySlimeTick(1/fps);
    if(incoming>20&&w.player.vy< -15)bounces++;
    maxDrift=Math.max(maxDrift,Math.abs(s.x-500),Math.abs(w.player.x-489-offset));
  }
  return {bounces,maxDrift,w,s};
}
const oldBase={SKY_SLIME_RIG_HULL:[.3,.18,.7,.18,1.35,.8,.94,.98,.06,.98,-.35,.8]};
assert(bounceRun(60,12,oldBase).bounces<2,'reproduces the old corner knocking a second landing out of reach');
for(const fps of [30,60,144])for(const offset of [-16,-12,-8,0,8,12,16]){
  const run=bounceRun(fps,offset);
  assert(run.bounces>=2,'mostly centered landings chain natural rebounds');
  assert(run.maxDrift<.05,'vertical landings do not introduce sideways motion');
}
// Existing sideways motion still carries through a flat landing. The
// broader base is contact geometry, never a horizontal brake or magnet.
{
  const {w,s}=fixture();Object.assign(w.player,{x:497,y:440,vx:65,vy:200});
  Object.assign(s,{vx:65,spin:0});w.skySlimeTerrain(s);
  w.skySlimePlayer(s,w.player.x,w.player.y,65,200);
  assert(Math.abs(s.vx-65)<.001&&Math.abs(w.player.vx-65)<.001,'a landing preserves shared sideways motion');
}
// Deliberate edge landings still roll the ball away, with no aiming.
for(const offset of [-20,20]){
  const {w,s}=fixture();Object.assign(w.player,{x:489+offset,y:440,vx:0,vy:200});
  w.skySlimeTerrain(s);w.skySlimePlayer(s,w.player.x,w.player.y,0,200);w.skySlimeTerrain(s);
  assert(s.vx*offset<0&&w.player.vx*offset>0,'landing direction follows contact geometry');
  assert(s.y+s.r<=512.01,'off-center landing stays above terrain');
  assert(w.skySlimeRigContact(s,w.player.x,w.player.y).depth<.02,'off-center bodies separate');
}
// A wall-supported ball also pushes the rig back, rather than being squeezed
// into the wall and repeatedly teleported back inside the miner.
{
  const {w,s}=fixture();w.tileAt=(r,c)=>c>=20?{type:'stone'}:null;
  w.solidAt=(x,y,wi,h)=>x+wi-1>=640;
  Object.assign(s,{x:615,y:220.8});Object.assign(w.player,{x:570,y:200,vx:200,vy:0});
  w.skySlimePlayer(s,570,200,200,0);w.skySlimeTerrain(s);
  assert(s.x+s.r<=640.01&&w.player.vx<0,'wall carries the horizontal load');
  assert(w.skySlimeRigContact(s,w.player.x,w.player.y).depth<.02,'wall squeeze separates the miner');
}
console.log('LANDINGS',landings);
// Once touched, bathhouse brains cannot steer, hop, enter, or despawn a ball
// during a long aerial or while the player is lining up another shot.
const {w,s}=groundHit(200,60);w.ENABLE_BATH=true;w.bathPickSite=()=>true;
w.banyaDoorX0=480;w.banyaDoorX1=520;w.bathGuestAccept=()=>{throw Error('brain admitted a ball still in play');};
s.visit='depart';s.departX=0;s.departDir=1;s.visitT=13.9;s._ground=false;s.vx=85;s.vy=-20;
for(let n=0;n<600;n++)w.skySlimeVisitTick(1/60);
assert.equal(w.skySlimes.length,1);assert.equal(s.vx,85);assert.equal(s.vy,-20);assert.equal(s.visitT,13.9);
s.visit='seek';s.vx=s.vy=0;s._ground=true;s._interactT=0;w.player.x=s.x-20;w.player.y=s.y;
for(let n=0;n<600;n++)w.skySlimeVisitTick(1/60);
assert(s.playing&&s.vy===0,'stationary ball waits while the player stays nearby');
const restored=w.skySlimeHydrate(w.skySlimeRecord(s));assert(restored.playing,'save/reload preserves free play');
w.player.x=s.x-1000;s.x=900;s.playRest=0;
for(let n=0;n<91;n++)w.skySlimeVisitTick(1/60);
assert(!s.playing,'navigation resumes after rest and stepping away');
console.log(results);console.log('GLANCES',glances);console.log('PASS: ground pop, aim/speed control, aerial lifts/spikes, spin, energy, misses, and visitor autonomy.');
// Ordinary visitors may hop out at a bank; a played ball never receives it.
for(const playing of [false,true]){
 const {w,s}=fixture();w.ENABLE_BATH=true;w.bathPickSite=()=>true;
 w.banyaDoorX0=750;w.banyaDoorX1=800;w.bathGuestAccept=()=>false;
 w.tileAt=(r,c)=>r>=20 || (r>=16&&(c<14||c>=19))?{type:'stone'}:null;
 Object.assign(s,{x:581,y:519,vx:0,vy:0,wet:.7,playing,hopIn:0,visit:'seek'});
 w.player.x=100;w.player.y=486;
 w.skySlimeVisitTick(1/60);
 if(playing)assert.equal(s.vy,0,'AI never pops a played ball out of water');
 else {
   w.liquidSampleBall=(x,y)=>({surface:x>=448&&x<608?512:Infinity,bottom:640,vx:0,vy:0});
   for(let n=0;n<720;n++)w.skySlimeTick(1/60);
   assert(s.x>660&&s.y+s.r<=512.01,'ordinary visitor clears the bank and continues toward the door');
 }
}
console.log('PASS: shore escape stays separate from player-controlled physics.');
