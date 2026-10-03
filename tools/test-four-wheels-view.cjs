// Camera geometry checks. The browser suite verifies the actual raster output.
const assert=require('node:assert/strict');
const View=require('../js/four-wheels-view.js');
const Physics=require('../js/four-wheels-physics.js');
const Stock=require('../js/four-wheels-stock.js');
const levels=require('../js/four-wheels-levels.js');
const Course=require('../js/four-wheels-course.js');
const Terrain=require('../js/four-wheels-terrain.js');
const {CAMERA,project,unproject,depth,local}=View;
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function check(name,fn){fn();console.log('PASS '+name);}

const course=Course.build(),cliffEdges=View.exposedEdges(course,Course);
check('the exposed course boundary closes without gaps at ribbons, joins or stores',()=>{
  const endpoints=new Map();
  for(const edge of cliffEdges)for(const p of [edge.a,edge.b]){
    const key=p.x.toFixed(4)+','+p.y.toFixed(4);endpoints.set(key,(endpoints.get(key)||0)+1);
  }
  assert.ok(cliffEdges.length>1000);
  for(const [point,count]of endpoints)assert.equal(count,2,'disconnected or doubled cliff at '+point);
});
check('cliffs follow actual floor support and terrain height, including both jump lips',()=>{
  const Terrain=require('../js/four-wheels-terrain.js');
  for(const {a,b,normal}of cliffEdges){
    near(a.z,Terrain.height(course,a));near(b.z,Terrain.height(course,b));
    const epsilon=Math.min(1e-5,Math.hypot(b.x-a.x,b.y-a.y)*.01);
    for(const t of [.25,.5,.75]){
      const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      assert.ok(Course.sample(course,{x:p.x-normal.x*epsilon,y:p.y-normal.y*epsilon},false),'cliff has supporting land inside');
      assert.equal(Course.sample(course,{x:p.x+normal.x*epsilon,y:p.y+normal.y*epsilon},false),null,'cliff does not cross supported land');
    }
  }
  for(const x of [1180,1250])assert.ok(cliffEdges.some(e=>Math.abs(e.a.x-x)<1e-6&&Math.abs(e.b.x-x)<1e-6&&Math.abs((e.a.y+e.b.y)/2-410)<80),'jump lip at '+x);
});

check('hill cues agree with the physical route and leave bumps and the jump void unmarked',()=>{
  const level=Course.build(),markers=View.slopeMarkers(level),all=[...markers.ribs,...markers.signs];
  for(const chapter of [0,3,4])for(const kind of ['up','down'])assert.ok(markers.signs.some(p=>p.chapter===chapter&&p.kind===kind),'both sides of hill '+chapter+' are labeled');
  assert.ok(markers.signs.some(p=>p.chapter===11&&p.kind==='up'),'the final climb is labeled');
  for(const p of all){
    const d={x:Math.cos(p.a)*.5,y:Math.sin(p.a)*.5},a=Course.sample(level,{x:p.x-d.x,y:p.y-d.y}),b=Course.sample(level,{x:p.x+d.x,y:p.y+d.y});
    assert.ok(a&&b,'paint stays on supported road');assert.ok(p.kind==='up'?b.height>a.height:b.height<a.height,'the sign describes forward travel');
    const bump=Terrain.coordinates(p,level.terrain.bumps);assert.ok(!(Math.abs(bump.v)<level.terrain.bumps.width/2&&bump.u>31&&bump.u<163),'speed bumps keep their own markings');
    const nx=-Math.sin(p.a),ny=Math.cos(p.a),side=nx+ny>0?-1:1,offset=p.width/2+p.shoulder-10;
    assert.ok(Course.sample(level,{x:p.x+nx*side*offset,y:p.y+ny*side*offset}),'sign posts stand on the shoulder or road edge');
  }
});

check('ground axes stay symmetric and show substantially more floor than a 2:1 view',()=>{
  const origin=project({x:0,y:0}),x=project({x:100,y:0}),y=project({x:0,y:100});
  near(x.x-origin.x,-(y.x-origin.x));near(x.y-origin.y,y.y-origin.y);
  const slope=(x.y-origin.y)/(x.x-origin.x);
  assert.ok(slope>.75&&slope<.85,`floor slope ${slope}`);
  near((y.y-origin.y)/(y.x-origin.x),-slope);
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
  near(floor.x,basket.x);assert.ok(floor.y-basket.y>22&&floor.y-basket.y<25);
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

global.CartPhysics=Physics;global.CartStock=Stock;
const renderer=View.create({});
check('the following camera keeps the cart centered in every connected room',()=>{
  const w=new Physics.World(levels.journey());
  for(const r of w.level.rooms)for(const [width,height]of [[960,520],[480,780],[960,250]]) {
    Object.assign(w.body,r.spawn);const camera=renderer.connectedCamera(width,height,w,true),p=project(w.body);
    near(camera.x+p.x*camera.scale,width*.5);near(camera.y+p.y*camera.scale,height*.54);
  }
});
check('the overview contains all six floors and the final checkout apron',()=>{
  const w=new Physics.World(levels.journey());
  for(const [width,height]of [[960,520],[480,780],[960,250]]) {
    const camera=renderer.connectedCamera(width,height,w,false);
    for(const a of w.level.floorAreas)for(const x of [a.x,a.x+a.w])for(const y of [a.y,a.y+a.h]) {
      const p=project({x,y}),sx=camera.x+p.x*camera.scale,sy=camera.y+p.y*camera.scale;
      assert.ok(sx>=14&&sx<=width-14&&sy>=14&&sy<=height-14,'no clipped room or exit in the map');
    }
  }
});
