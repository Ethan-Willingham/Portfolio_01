// Grounded drive pops use the painted hull and exchange existing momentum.
// Run: node tools/test-hard-slime-pop.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const hullSource = fs.readFileSync('js/sluice/069-rig-hull.js', 'utf8');
const rockSource = fs.readFileSync('js/sluice/348-sky-slimes.js', 'utf8');
function run({dir=1, speed=200, radius=25, tilt=0, dip=0, grounded=true,
  ballGrounded=true, floor=true, ballVY=0, gain=2.15}={}) {
  const math = Object.create(Math); math.random = () => 0.3;
  const w = { Math:math, Float64Array, TILE:32, PLAYER_W:22, PLAYER_H:26,
    SKY_ROWS:16, COLS:320, DECK_LEFT_COL:149,
    player:{x:500,y:486,vx:dir*speed,vy:0,dir,onGround:grounded,renderX:500,renderY:486,bodyTiltRender:tilt},
    playerBodyScale:()=>({x:1,y:1}), playerFxLandOffset:()=>dip,
    solidAt:(x,y,width,height)=>floor && y+height>512.001,
    tileAt:r=>floor && r*32>=512 ? {type:'stone'} : null };
  vm.createContext(w); vm.runInContext(hullSource+'\n'+rockSource,w);
  w.SKY_SLIME_GROUND_POP_LIFT=gain;
  const s=w.skySlimeFresh(550,512-radius);
  Object.assign(s,{r:radius,vx:0,vy:ballVY,spin:0,entry:0,_ground:ballGrounded});
  // Approach from outside, then overlap by one ordinary short sweep step.
  let lo=0,hi=100;
  for(let i=0;i<50;i++) {
    const d=(lo+hi)/2; s.x=511+dir*d;
    if(w.skySlimeRigContact(s,500,486))lo=d;else hi=d;
  }
  s.x=511+dir*(lo-0.1);
  const contact=w.skySlimeRigContact(s,500,486);
  assert(contact && contact.depth>0,'actual shared hull starts the contact');
  const mass=2.5*radius*radius/625;
  const energyIn=mass*(s.vx*s.vx+s.vy*s.vy)+6*speed*speed;
  const momentumIn=6*dir*speed;
  w.skySlimePlayer(s,500,486,dir*speed,0);
  const state=[s.x,s.y,s.vx,s.vy,s.spin,w.player.x,w.player.y,w.player.vx,w.player.vy,
    w.player.renderX,w.player.renderY];
  assert(state.every(Number.isFinite),'finite impact state');
  return {state, vx:s.vx,vy:s.vy,spin:s.spin,rigVX:w.player.vx,rigVY:w.player.vy,
    energy:mass*(s.vx*s.vx+s.vy*s.vy)+6*(w.player.vx*w.player.vx+w.player.vy*w.player.vy),
    energyIn,momentum:mass*s.vx+6*w.player.vx,momentumIn,
    speed2:s.vx*s.vx+s.vy*s.vy, rise:s.vy*s.vy/600, contact};
}
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-7,label+': '+a+' vs '+b);
let cases=0, lifted=0;
for(const dir of [-1,1])for(const radius of [22,25,27])for(const speed of [40,60,90,120,180,200,280,420,600])
  for(const tilt of [-0.08,0,0.08])for(const dip of [0,0.8]) {
    const config={dir,radius,speed,tilt,dip};
    const prior=run({...config,gain:1}), pop=run(config);
    close(pop.speed2,prior.speed2,'ground pop redirects rather than adding guest speed');
    close(pop.momentum,pop.momentumIn,'unused sideways momentum returns to the rig');
    close(pop.spin,prior.spin,'pop does not manufacture spin');
    assert(pop.energy<=pop.energyIn+1e-7,'drive pop cannot add pair kinetic energy');
    assert(pop.vy<=prior.vy+1e-7,'pop never reduces an upward rebound');
    assert(-pop.vy<=-prior.vy*2.15+1e-7,'lift remains bounded by impact strength');
    if(pop.vy<prior.vy-1)lifted++;
    if(speed===200 && radius===25 && tilt===0 && dip===0)
      assert(pop.rise>prior.rise*2 && pop.rise>8,'ordinary drive restores a visible ground pop');
    cases++;
  }
// The tuning applies only to a real grounded drive bump. Headers, descending
// guests, stale support flags and slow nudges retain identical contact states.
for(const config of [{grounded:false},{ballGrounded:false},{floor:false},{ballVY:180},{speed:40},{speed:0}]) {
  assert.deepEqual(run({...config,gain:1}).state,run(config).state,'other impact is unchanged: '+JSON.stringify(config));
}
const a=run({gain:1}),b=run();
console.log(JSON.stringify({pass:true,cases,lifted,ordinaryDrive:{beforeRise:a.rise,afterRise:b.rise,
  beforeVY:a.vy,afterVY:b.vy},otherImpactsUnchanged:true}));
