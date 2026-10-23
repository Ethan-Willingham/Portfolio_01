/* A wake requires stern history; bow spray requires local water contact. */
const assert=require('node:assert/strict');
require('../../js/widewake-ocean-art.js');require('../../js/widewake-wave-view.js');
const s={id:0,hp:100,length:6,width:2.2,draft:.38,speed:36,vx:24,vy:0,sea:{airborne:false,vz:0}},p={x:340,y:650,angle:0,z:0,pitch:0,roll:0};
const v={battle:{ships:[s],sea:{}},poses:[p],zoom:6,baseScale:1,visualTime:18,visible:()=>true};
const trail=new WidewakeOceanArt.WakeTrail();let emitted=0;
trail.segments(v,()=>emitted++);assert.equal(emitted,0,'a moving boat cannot create a decorative V without any wake history');
trail.sample([s],[p],18);trail.segments(v,()=>emitted++);assert.equal(emitted,0,'a single stern sample cannot draw a detached bow wave');
const surface=Object.create(WidewakeWaveView.Surface.prototype);Object.assign(surface,{view:v,water:{},height:()=>0});
const spray=()=>{const segments=[];surface.spray((...q)=>segments.push(q));assert.ok(segments.every(q=>q.every(Number.isFinite)));return segments;};
assert.ok(spray().length>0,'a moving hull touching water throws spray');
for(const angle of [0,.7,Math.PI,4.9]){
  p.angle=angle;const c=Math.cos(angle),sn=Math.sin(angle);
  for(const q of spray())for(const i of [0,2]){
    const along=(q[i]-p.x)*c+(q[i+1]-p.y)*sn,across=-(q[i]-p.x)*sn+(q[i+1]-p.y)*c;
    assert.ok(along<s.length*.4,'spray stays behind the bow tip at every heading');assert.ok(Math.abs(across)>s.width*.3,'spray stays outside the shoulders');
  }
}
p.angle=0;p.z=2;assert.equal(spray().length,0,'a dry shoulder never emits spray even while the stern remains in contact');
p.z=0;p.pitch=.4;assert.equal(spray().length,0,'raising only the bow stops the bow effect');
p.pitch=0;p.roll=.5;assert.ok(spray().length>0);assert.ok(spray().every(q=>q[1]<p.y&&q[3]<p.y),'only the immersed side throws spray when rolling');
p.roll=0;s.sea.airborne=true;assert.equal(spray().length,0);s.sea.airborne=false;s.vx=0;assert.equal(spray().length,0,'a stationary hull does not throw powered spray');
s.vx=24;let budget=0;assert.equal(surface.spray(()=>budget++,5),5);assert.equal(budget,5);
console.log('PASS stern-only wake history, attached bow spray at four headings, dry bow, asymmetric roll contact, flight, rest and bounded output');
