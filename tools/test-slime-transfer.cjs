// Falling rocky visitor, miner recoil and ground-return contracts.
// Run: node tools/test-slime-transfer.cjs
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/sluice/348-sky-slimes.js', 'utf8');
function fixture({floor=512, material='stone', gravity=300}={}) {
  const math = Object.create(Math); math.random = () => .3;
  const w = {Math:math, TILE:32, SKY_ROWS:16, COLS:320, PLAYER_W:22, PLAYER_H:26, DECK_LEFT_COL:149,
    player:{x:489, y:200, vx:0, vy:0, renderX:485, renderY:206, onGround:false},
    tileAt:(r,c)=>r*32>=floor?{type:material}:null,
    solidAt:(x,y,width,height)=>y+height-1>=floor, liquidSampleCircle:()=>({wet:0})};
  vm.createContext(w); vm.runInContext(source, w);
  w.SKY_SLIME_GRAVITY=gravity; w.skySlimeNext=1e8;
  const s=w.skySlimeFresh(500,330); Object.assign(s,{r:25, spin:0, entry:0, playing:true});
  w.skySlimes.push(s); return {w,s};
}
function close(actual, expected, label) { assert(Math.abs(actual-expected)<1e-7, label+': '+actual+' vs '+expected); }
// An isolated landing must move along its NEW velocity during the rest of
// the frame. An impulse-only test passes even with the old incoming sweep.
const flights=[];
for(const fps of [30,60,144]) {
  const {w,s}=fixture({floor:1024,gravity:0}), dt=1/fps;
  Object.assign(s,{y:330,vy:200});
  Object.assign(w.player,{y:s.y-s.r-.506-26*.98-.3,vy:400});
  w.player.renderY=w.player.y+6;
  w.skySlimeRigLast={x:w.player.x,y:w.player.y};
  w.player.y+=w.player.vy*dt; w.player.renderY+=w.player.vy*dt;
  const predictedY=w.player.y, lag=w.player.renderY-w.player.y;
  let corrections=0, recoil=0, hits=0;
  const contact=w.skySlimePlayer;
  w.skySlimePlayer=function(b,x,y,vx,vy) {
    const oldY=w.player.y, oldRig=w.player.vy, oldBall=b.vy;
    contact(b,x,y,vx,vy);
    corrections+=w.player.y-oldY;
    const dv=w.player.vy-oldRig;
    recoil+=dv*(dt-b.age);
    if(Math.abs(dv)>.001) {
      hits++;
      close(2.5*b.vy+6*w.player.vy,2.5*oldBall+6*vy,'air impact conserves momentum');
      close(b.vy-w.player.vy,.98*(vy-oldBall),'landing uses relative closing speed');
      assert(1.25*b.vy*b.vy+3*w.player.vy*w.player.vy<=1.25*oldBall*oldBall+3*vy*vy+.001,
        'air impact cannot add kinetic energy');
    }
  };
  w.skySlimeTick(dt);
  assert.equal(hits,1,'one closing airborne contact produces one exchange');
  assert(recoil<-.2,'landing changes the remaining-frame position');
  close(w.player.y,predictedY+corrections+recoil,'position follows the exchanged velocity');
  close(w.player.renderY-w.player.y,lag,'recoil preserves existing sprite lag');
  assert(s.vy>w.player.vy,'both fall after the landing, with the ball separating faster');
  flights.push({fps,rigVY:w.player.vy,ballVY:s.vy,recoil});
}
// Side bumps and rising headers keep the original dribble sweep: recoil
// changes velocity for the next flight update, without shortening the touch.
const dribbles=[];
for(const fps of [30,60,144])for(const kind of ['side-left','side-right','header']) {
  const {w,s}=fixture({floor:1024,gravity:0}),dt=1/fps;
  if(kind==='header') {
    Object.assign(w.player,{vy:-160});
    Object.assign(s,{y:200+26*.18-25.506-.3,vy:40});
  } else {
    const dir=kind==='side-left'?-1:1;
    Object.assign(w.player,{vx:dir*200});
    Object.assign(s,{x:500+dir*44.806,y:220.8,vx:dir*40});
  }
  w.skySlimeRigLast={x:w.player.x,y:w.player.y};
  w.player.x+=w.player.vx*dt;w.player.y+=w.player.vy*dt;
  const predictedX=w.player.x,predictedY=w.player.y,oldVX=w.player.vx,oldVY=w.player.vy;
  w.player.renderX=w.player.x-4;w.player.renderY=w.player.y+6;
  let correctionX=0,correctionY=0,hits=0;
  const contact=w.skySlimePlayer;
  w.skySlimePlayer=function(b,x,y,vx,vy) {
    const oldX=w.player.x,oldY=w.player.y,oldRigX=w.player.vx,oldRigY=w.player.vy;
    const normal=w.skySlimeRigContact(b,x,y);
    contact(b,x,y,vx,vy);
    correctionX+=w.player.x-oldX;correctionY+=w.player.y-oldY;
    if(Math.hypot(w.player.vx-oldRigX,w.player.vy-oldRigY)>.001) {
      hits++;
      assert(normal.ny<=.000001,'dribbling touches the side or roof');
    }
  };
  w.skySlimeTick(dt);
  assert.equal(hits,1,'a dribble transfers momentum once');
  assert(Math.hypot(w.player.vx-oldVX,w.player.vy-oldVY)>30,'dribble retains physical recoil velocity');
  close(w.player.x,predictedX+correctionX,'side dribble retains the original frame sweep');
  close(w.player.y,predictedY+correctionY,'header retains the original frame sweep');
  close(w.player.renderX-w.player.x,-4,'dribble preserves horizontal sprite lag');
  close(w.player.renderY-w.player.y,6,'dribble preserves vertical sprite lag');
  if(kind==='header')assert(s.vy< -230,'header retains the strong upward ball rebound');
  else assert(Math.abs(s.vx)>175,'side dribble retains the ball shot');
  dribbles.push({fps,kind,rigVX:w.player.vx,rigVY:w.player.vy});
}
// Landing on a descending ball, followed by its ground rebound, must pass
// the load back through successive physical contacts. Check the full relay.
const relays=[];
for(const fps of [30,60,144,240]) {
  const {w,s}=fixture(); Object.assign(s,{y:430,vy:180});
  Object.assign(w.player,{y:360,vy:400,renderY:366});
  w.skySlimeRigLast={x:w.player.x,y:w.player.y};
  const events=[]; let peak=0;
  const contact=w.skySlimePlayer, terrain=w.skySlimeTerrain;
  w.skySlimePlayer=function(b,x,y,vx,vy) {
    const oldBall=b.vy;
    contact(b,x,y,vx,vy);
    if(b.vy-oldBall>40) events.push({type:'rig',time:b.age,before:oldBall,after:b.vy,rig:w.player.vy});
  };
  w.skySlimeTerrain=function(b) {
    const before=b.vy;
    terrain(b);
    if(before>40&&b.vy< -20) events.push({type:'floor',time:b.age,before,after:b.vy});
  };
  for(let frame=0;frame<Math.ceil(fps*.65);frame++) {
    w.player.vy+=760/fps; w.player.y+=w.player.vy/fps; w.player.onGround=false;
    if(w.player.y+26>512) {w.player.y=486;w.player.vy=0;w.player.onGround=true;}
    w.skySlimeTick(1/fps);
    const c=w.skySlimeRigContact(s,w.player.x,w.player.y);
    assert(!c||c.depth<.05,'relay never leaves the miner sunk into the ball');
    assert(s.y+s.r<=512.01,'relay never pushes the ball through the floor');
    assert(!w.solidAt(w.player.x,w.player.y,22,26),'miner stays outside terrain');
    peak=Math.max(peak,-w.player.vy);
  }
  assert.deepEqual(events.slice(0,5).map(e=>e.type),['rig','floor','rig','floor','rig'],
    'miner, ground, miner, ground and miner exchange energy in order');
  assert(events[0].before>0&&events[0].after>events[0].before&&events[0].rig>0,
    'first landing accelerates the falling ball and slows the falling miner');
  assert(events[4].rig< -350,'second ground return kicks the miner strongly upward');
  relays.push({fps,peak,rigY:w.player.y,ballY:s.y});
}
assert(Math.max(...relays.map(r=>r.peak))/Math.min(...relays.map(r=>r.peak))<1.05,
  'relay strength varies less than five percent across refresh rates');
// A top or oblique landing can hit a ceiling or wall AFTER recoil. These
// surfaces did not intersect its original frame path handled by update().
for(const direction of ['ceiling','wall'])for(const fps of [30,60,144]) {
  const {w,s}=fixture({floor:1024,gravity:0});
  w.tileAt=()=>null;
  if(direction==='ceiling') {
    w.solidAt=(x,y)=>y<=199;
    Object.assign(w.player,{x:489,y:200,vx:0,vy:0});
    Object.assign(s,{x:500,y:251,vy:-600});
  } else {
    w.solidAt=(x,y)=>x<=488;
    Object.assign(w.player,{x:489,y:200,vx:0,vy:0});
    Object.assign(s,{x:535,y:242,vx:-600,vy:-600});
  }
  w.skySlimeRigLast={x:w.player.x,y:w.player.y};
  w.skySlimeTick(1/fps);
  assert(!w.solidAt(w.player.x,w.player.y,22,26),'recoil sweep stops at the '+direction);
  close(direction==='ceiling'?w.player.vy:w.player.vx,0,'terrain stops recoil velocity');
  assert(direction==='ceiling'?w.player.y<199.1:w.player.x<488.1,'recoil reaches the surface without a full-step gap');
}
// Endpoint grounding must not turn an earlier airborne roof into a pinned
// bumper. The earlier pose still has room to absorb momentum before landing.
{
  const {w,s}=fixture({gravity:0});
  Object.assign(w.player,{y:486,vy:0,onGround:true});
  Object.assign(s,{y:470+26*.18-25.49,vy:100});
  w.skySlimePlayer(s,489,470,0,0);
  assert(w.player.vy>50&&s.vy> -40,'earlier airborne roof shares recoil despite the grounded endpoint flag');
}
console.log('AIRBORNE',flights); console.log('DRIBBLES',dribbles); console.log('FALLING RELAY',relays);
console.log('PASS: relative momentum, remaining-frame recoil, falling ground relay, render continuity, ceiling/wall boundaries and swept roof support.');
