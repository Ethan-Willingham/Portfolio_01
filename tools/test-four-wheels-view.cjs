// Camera geometry checks. The browser suite verifies the actual raster output.
const assert=require('node:assert/strict');
const View=require('../js/four-wheels-view.js');
const Physics=require('../js/four-wheels-physics.js');
const Stock=require('../js/four-wheels-stock.js');
const levels=require('../js/four-wheels-levels.js');
const {CAMERA,project,unproject,depth,local}=View;
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function check(name,fn){fn();console.log('PASS '+name);}

check('ground axes have equal lengths and opposite 2:1 slopes',()=>{
  const origin=project({x:0,y:0}),x=project({x:100,y:0}),y=project({x:0,y:100});
  near(x.x-origin.x,-(y.x-origin.x));near(x.y-origin.y,y.y-origin.y);
  near((x.x-origin.x)/(x.y-origin.y),2);near((y.x-origin.x)/(y.y-origin.y),-2);
  near(Math.hypot(x.x-origin.x,x.y-origin.y),Math.hypot(y.x-origin.x,y.y-origin.y));
});
check('projection inversion recovers contacts at every height and heading',()=>{
  for(let a=-Math.PI;a<Math.PI;a+=.19)for(const z of [0,4,9,16,22,31,42,90]) {
    const p=local({x:271,y:133,a},19,-8,z),q=unproject(project(p),z);
    near(q.x,p.x);near(q.y,p.y);near(q.z,z);
  }
});
check('height separates a raised basket from its physical ground footprint',()=>{
  const floor=project({x:160,y:120}),basket=project({x:160,y:120,z:31});
  near(floor.x,basket.x);assert.ok(floor.y-basket.y>29&&floor.y-basket.y<30);
  const inferred=unproject(basket,31);near(inferred.x,160);near(inferred.y,120);
});
check('depth follows the camera ray when projected points coincide',()=>{
  const a={x:123,y:156,z:4},b={x:a.x+20,y:a.y+20,z:a.z+40*CAMERA.vertical/CAMERA.elevation};
  const p=project(a),q=project(b);near(p.x,q.x);near(p.y,q.y);assert.ok(depth(b)>depth(a));
});
check('all courses, standing stock and outside checkout aprons fit the camera',()=>{
  const inside=p=>{const q=project(p);assert.ok(q.x>0&&q.x<CAMERA.width&&q.y>0&&q.y<CAMERA.height,JSON.stringify({point:{x:p.x,y:p.y,z:p.z},screen:q}));};
  for(const level of levels) {
    const w=new Physics.World(level);
    for(const x of [8,472])for(const y of [8,292])for(const z of [-8,0,23])inside({x,y,z});
    for(const s of w.shelves)for(const x of [-s.w/2,s.w/2])for(const y of [-s.h/2,s.h/2])for(const z of [0,s.height])inside(Stock.shelfPoint(s,x,y,z));
    for(const p of w.stock.items)inside({...p,z:p.z+10});
    for(const o of w.objects)inside({...o,z:14});
    for(const u of [0,60])for(const v of [-w.exit.width/2,w.exit.width/2])inside(local(w.exit,u,v));
    for(const p of Physics.footprint(w.body,w.wheels))inside(p);
    inside(local(w.body,-15,0,42));
  }
});
check('projected checkpoint rings retain the true circular capture radius',()=>{
  const center={x:281,y:76};
  for(let i=0;i<96;i++) {
    const a=i*Math.PI/48,p={x:center.x+Physics.CHECKPOINT_RADIUS*Math.cos(a),y:center.y+Physics.CHECKPOINT_RADIUS*Math.sin(a)};
    const q=unproject(project(p));near(Math.hypot(q.x-center.x,q.y-center.y),Physics.CHECKPOINT_RADIUS);
  }
});
check('all four offset casters keep their own physical contact through projection',()=>{
  for(let a=0;a<Math.PI*2;a+=.21) {
    const body={x:225,y:150,a};
    for(let i=0;i<4;i++) {
      const wheel={a:a+i*.73,roll:0},pose=Physics.casterPose(body,wheel,i);
      const pivot=unproject(project({...pose.pivot,z:9}),9),tire=unproject(project({...pose,z:4}),4);
      near(Math.hypot(tire.x-pivot.x,tire.y-pivot.y),Math.hypot(Physics.CASTER.trail,Physics.CASTER.axleOffset));
      for(const corner of Physics.casterCorners(body,wheel,i)) {
        const contact=unproject(project(corner));near(contact.x,corner.x);near(contact.y,corner.y);
      }
    }
  }
});
check('rotating a coasting cart preserves its projected momentum direction',()=>{
  const w=new Physics.World({...levels[0],shelves:[],objects:[],start:{x:150,y:200,a:0}},true);
  w.body.vx=60;
  const velocity=()=>{const a=project({x:0,y:0}),b=project({x:w.body.vx,y:w.body.vy});return Math.atan2(b.y-a.y,b.x-a.x);};
  const before=velocity();for(let i=0;i<50;i++)w.step(1/120,{turn:1});
  assert.ok(w.body.a>.2);assert.ok(Math.abs(velocity()-before)<.05);
});
