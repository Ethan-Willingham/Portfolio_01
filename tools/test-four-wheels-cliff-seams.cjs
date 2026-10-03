// Cliff contours must close around overlapping roads, shoulders and platforms.
const assert=require('node:assert/strict');
const Course=require('../js/four-wheels-course.js');
const View=require('../js/four-wheels-view.js');
const pointKey=p=>Math.round(p.x*1e4)+','+Math.round(p.y*1e4);
function closed(edges) {
  const joins=new Map();
  for(const e of edges)for(const p of [e.a,e.b]){
    const key=pointKey(p);joins.set(key,(joins.get(key)||0)+1);
  }
  assert.deepEqual([...joins].filter(([,count])=>count!==2),[],'every cliff span meets the next one');
}
function fixture(rectangles) {
  const floorAreas=rectangles.map(([x,y,w,h])=>({kind:'grass',poly:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],bounds:{left:x,right:x+w,top:y,bottom:y+h}}));
  const grid=size=>{
    const cells=new Map();
    floorAreas.forEach((a,id)=>{for(let y=Math.floor(a.bounds.top/size);y<=Math.floor(a.bounds.bottom/size);y++)for(let x=Math.floor(a.bounds.left/size);x<=Math.floor(a.bounds.right/size);x++){
      const key=x+','+y,ids=cells.get(key)||[];ids.push(id);cells.set(key,ids);
    }});return cells;
  };
  return {floorAreas,floorGrid:grid(128),pointGrid:grid(32)};
}
function check(name,fn){fn();console.log('PASS '+name);}
check('partially overlapping platforms retain their complete outer cliff',()=>{
  const edges=View.exposedEdges(fixture([[0,0,100,100],[50,50,100,100]]),Course);
  closed(edges);
  const perimeter=edges.reduce((sum,e)=>sum+Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y),0);
  assert.ok(Math.abs(perimeter-600)<1e-7);
});
check('coincident platform edges appear once and internal joins stay hidden',()=>{
  const edges=View.exposedEdges(fixture([[0,0,100,100],[0,0,100,100],[100,25,50,50]]),Course);
  closed(edges);
  const perimeter=edges.reduce((sum,e)=>sum+Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y),0);
  assert.ok(Math.abs(perimeter-500)<1e-7);
  assert.ok(!edges.some(e=>e.a.x===100&&e.b.x===100&&e.a.y>25&&e.a.y<75),'the attached platform has no internal cliff');
});
check('all course curves, store platforms and jump lips form closed contours',()=>{
  const level=Course.build(),edges=View.exposedEdges(level,Course);
  assert.ok(edges.length>1000);closed(edges);
  const gap=level.terrain.gap;
  assert.ok(edges.some(e=>Math.abs(e.a.x-gap.x)<1e-7&&Math.abs(e.b.x-gap.x)<1e-7),'the launch lip has a cliff');
  assert.ok(edges.some(e=>Math.abs(e.a.x-(gap.x-gap.length))<1e-7&&Math.abs(e.b.x-(gap.x-gap.length))<1e-7),'the landing lip has a cliff');
  for(const e of edges){
    assert.ok([e.a.x,e.a.y,e.a.z,e.b.x,e.b.y,e.b.z].every(Number.isFinite));
    const mid={x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2};
    assert.ok(!(mid.x>1180+1e-6&&mid.x<1250-1e-6&&mid.y>286&&mid.y<534),'no cliff span bridges the jump');
  }
});
