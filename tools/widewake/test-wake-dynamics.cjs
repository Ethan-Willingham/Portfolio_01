/* Dimensional wake scale, emitted material history, and independent crest foam. */
const assert=require('node:assert/strict');require('../../js/widewake-waves.js');require('../../js/widewake-ocean-art.js');require('../../js/widewake-wave-view.js');
const {WakeTrail}=WidewakeOceanArt;
function run(length,width,speed,current=0){const wake=new WakeTrail(),s={id:0,hp:100,length,width,speed:36,vx:speed,vy:0,sea:{}},pose={x:0,y:2200,angle:0},field={sample:(x,y,out)=>Object.assign(out,{currentX:0,currentY:current})};
  for(let n=0;n<=100;n++){pose.x=n*.1*speed;pose.y=2200+n*.1*current;wake.sample([s],[pose],n*.1,field);}const segments=[];wake.segments({visualTime:10,zoom:4,baseScale:1,visible:()=>true},(...q)=>segments.push(q));return{wake,s,pose,segments};}
const idle=run(6,2.3,.2),slow=run(6,2.3,3),fast=run(6,2.3,36),escort=run(38,12,36);
assert.equal(idle.segments.length,0,'drifting at idle cannot produce a bright powered trail');
const width=r=>Math.max(0,...r.segments.map(q=>q[4]*2)),length=r=>r.segments.length?r.pose.x-r.segments[0][0]:0,energy=r=>r.segments.reduce((sum,q)=>sum+q[6],0);
assert.ok(width(fast)<2.3*3,'launch wake stays within three beams before fading');assert.ok(width(fast)>width(slow));assert.ok(length(fast)>length(slow)*3);assert.ok(energy(fast)>energy(slow)*2);assert.ok(width(escort)>width(fast)*4);
assert.ok(length(fast)<36*3.3,'launch foam does not persist for hundreds of metres');
const t=fast.wake.tracks[0];let prior=1e9;for(let age=0;age<10;age+=.05){const alpha=fast.wake.opacity(t,age,1);assert.ok(alpha<=prior+1e-10);prior=alpha;}assert.equal(fast.wake.opacity(t,4,1),0);
const drift=run(6,2.3,36,1.4);for(let n=0;n<drift.segments.length;n++){const a=drift.segments[n],b=fast.segments[n];assert.ok(Math.abs(a[1]-2214)<.001,'old wake water drifts with the current');assert.ok(Math.abs(a[15]-b[15])<.001,'flow cannot slide the foam pattern through its own material');}
// A throttle change cannot retroactively brighten or widen the old trail.
const before=fast.segments.map(q=>q.slice());fast.s.vx=3;fast.wake.sample([fast.s],[fast.pose],10);const after=[];fast.wake.segments({visualTime:10,zoom:4,baseScale:1,visible:()=>true},(...q)=>after.push(q));assert.deepEqual(after.slice(0,-1),before.slice(0,-1));
assert.equal(fast.wake.bytes,110592);assert.ok(fast.wake.count<=128);
const foam=new WidewakeWaveView.FoamField(),sea=new WidewakeWaves.Sea(),v={visualTime:0,battle:{sea},width:720,height:450,zoom:2,baseScale:1,camera:{x:0,y:2400},visible:()=>true,stats:{}};
let births=0,lastCursor=0;for(let n=0;n<600;n++){v.visualTime=n/60;foam.update(v);if(foam.cursor!==lastCursor)births++;lastCursor=foam.cursor;}
assert.ok(births>8,'exposed crests emit independent foam patches');const snapshot=Array.from(foam.data);foam.update(v);assert.deepEqual(Array.from(foam.data),snapshot,'pause cannot advance foam birth or motion');
let segments=0;const surface={view:v,water:{},height:()=>0};foam.emit(surface,(...q)=>{assert.ok(q.every(Number.isFinite));segments++;},8192);assert.ok(segments>0&&segments<=2048);assert.equal(foam.data.byteLength,20480);
sea.strength=0;v.visualTime+=6;foam.update(v);assert.equal(foam.emit(surface,()=>{},8192),0,'crest foam dissolves independently after the wave has passed');
const sheltered=new WidewakeWaves.Sea();sheltered.at=(x,y,time,out)=>Object.assign(out,{height:.25,dx:.01,dy:0,vx:0,vy:0,exposure:0});v.battle.sea=sheltered;for(let n=0;n<40;n++){v.visualTime+=.25;foam.update(v);}assert.equal(foam.emit(surface,()=>{},8192),0,'sheltered rivers cannot inherit ocean whitecaps');
console.log('PASS hull/speed scaling, monotonic fade, current advection, stable material history, bounded birth/decay and sheltered sea foam',JSON.stringify({slow:{width:width(slow),length:length(slow)},launch:{width:width(fast),length:length(fast)},escort:{width:width(escort),length:length(escort)},births}));
