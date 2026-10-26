/* Physical hull contacts, not centre circles or touch-to-delete damage. */
const assert=require('node:assert/strict'),B=require('../../js/widewake-battle-core.js');
const dt=1/60,check=s=>console.log('PASS '+s),close=(a,b,e=.001)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function boat(id,x,y,angle=0,vx=0,vy=0,length=13,width=5){return{id,type:'gunboat',x,px:x,y,py:y,angle,previousAngle:angle,vx,vy,turn:0,length,width,height:4,draft:1,hold:20,cargo:0,hp:1500,maxHp:1500,sea:{z:0,vp:0,vr:0}};}
function fixture(ships){const b=new B.Battle({population:0});b.ships=ships;b.mounts=[];b.sea.strength=0;b.contacts=new WidewakeContacts.World();return b;}
function step(b,n=1){for(let k=0;k<n;k++){b.time+=dt;b.tick++;for(const s of b.ships){s.px=s.x;s.py=s.y;s.previousAngle=s.angle;s.x+=s.vx*dt;s.y+=s.vy*dt;s.angle+=s.turn*dt;}for(let i=0;i<b.raiders.count;i++){const a=b.raiders;a.px[i]=a.x[i];a.py[i]=a.y[i];a.previousAngle[i]=a.angle[i];a.x[i]+=(a.vx[i]+a.pushX[i])*dt;a.y[i]+=(a.vy[i]+a.pushY[i])*dt;}b.raiders.index();b.contacts.solve(b,dt);}}

const head=fixture([boat(0,-7.5,0,0,20),boat(1,7.5,0,Math.PI,-20)]);const momentum=head.ships.reduce((n,s)=>n+s.vx*s.length*s.width*s.draft,0);step(head,15);
assert.ok(head.contacts.total>0);assert.ok(head.ships[0].vx<0&&head.ships[1].vx>0,'bow contact rebounds with momentum');assert.ok(head.ships[0].x<head.ships[1].x,'hulls do not pass through');assert.ok(head.ships.every(s=>s.hp===1500),'allied hull bump does not silently consume health');close(head.ships.reduce((n,s)=>n+s.vx*s.length*s.width*s.draft,0),momentum,.01);assert.ok(Array.from(head.effects.kind.subarray(0,head.effects.count)).includes(7));
check('bow-to-bow collision exchanges momentum, shows water contact and preserves allied hulls');

const glance=fixture([boat(0,-10,-4.8,0,32,9),boat(1,1,0,0,3,0)]);step(glance,24);assert.ok(glance.contacts.total>0);assert.ok(glance.ships[0].vx>12,'glancing collision retains tangential travel');assert.ok(glance.ships.some(s=>Math.abs(s.turn)>.01),'off-centre contact turns hulls');assert.ok(glance.ships.some(s=>Math.abs(s.sea.vr)>.01),'side contact rocks hulls');
check('glancing hulls slide, yaw and rock instead of becoming a hard invisible wall');

const fast=fixture([boat(0,0,-3.5,0,0,180,6,2.3),boat(1,0,3.5,0,0,-180,6,2.3)]);step(fast,2);assert.ok(fast.contacts.total>0);assert.ok(fast.ships[0].y<fast.ships[1].y,'swept side impact cannot tunnel');
const near=fixture([boat(0,-10,5.6,0,80),boat(1,0,0)]);step(near,20);assert.equal(near.contacts.total,0,'water between visible hulls is a true miss');
check('fast swept side contacts stop tunnelling while near-hull water gaps stay clear');

const calm=fixture([boat(0,-6.5,0),boat(1,6.5,0,Math.PI)]);step(calm,120);assert.equal(calm.effects.count,0,'moored contacts stay quiet');assert.equal(calm.sounds.length,0);
const airborne=fixture([boat(0,-7,0,0,25),boat(1,7,0,Math.PI,-25)]);airborne.ships[0].sea.z=10;step(airborne,20);assert.equal(airborne.contacts.total,0,'hulls separated vertically do not hit');
check('moored and vertically separated hulls do not create fake impact effects');

const low=fixture([boat(0,0,0)]);low.raiders.add(12,0,0,B.random(1));Object.assign(low.raiders,{count:1});low.raiders.x[0]=low.raiders.px[0]=12;low.raiders.vx[0]=-1;low.raiders.angle[0]=low.raiders.previousAngle[0]=Math.PI;low.raiders.steeringReady[0]=1;low.raiders.surfaceReady[0]=1;step(low,12);assert.ok(low.raiders.hp[0]>0,'a soft touch cannot delete an enemy');assert.equal(low.player.hp,1500);
const ram=fixture([boat(0,0,0,0,0,0,38,12)]);ram.endgame=true;ram.raiders.add(40,0,3,B.random(2));const a=ram.raiders;a.angle[0]=a.previousAngle[0]=Math.PI;a.steeringReady[0]=a.surfaceReady[0]=1;a.vx[0]=-145;step(ram,12);assert.ok(ram.player.hp<1500,'hard ram contact causes real damage');assert.ok(a.hp[0]>0&&a.hp[0]<1800,'a ram is physically damaged, not instantly deleted');assert.ok(a.pushX[0]>0,'ram responds to opposing hull momentum');
check('soft enemy touches survive while a committed high-energy ram damages and deflects both hulls');

const dense=new B.Battle({population:16384});for(let i=0;i<dense.raiders.count;i++){const a=dense.raiders,s=dense.ships[i%24];a.x[i]=a.px[i]=s.x+s.length*.45;a.y[i]=a.py[i]=s.y+(i%5-2)*.25;a.vx[i]=-35;a.vy[i]=0;a.angle[i]=a.previousAngle[i]=Math.PI;a.steeringReady[i]=a.surfaceReady[i]=1;}dense.raiders.index();const bytes=dense.memoryBytes();dense.contacts.solve(dense,dt);assert.ok(dense.contacts.lastContacts>24,'dense contacts exercise the narrow solver');assert.ok(dense.contacts.enemyChecks<=24*WidewakeContacts.MAX_ENEMY_CHECKS);assert.ok(dense.contacts.lastContacts<=276+24*WidewakeContacts.MAX_ENEMY_PAIRS);assert.ok(dense.contacts.effectBudget<=8);assert.equal(dense.memoryBytes(),bytes);for(const s of dense.ships)for(const k of ['x','y','vx','vy','turn'])assert.ok(Number.isFinite(k==='turn'&&s[k]===undefined?0:s[k]));
check('16,384 enemies use a capped local query and fixed contact storage');
