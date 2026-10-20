/* New enemies enter behind the swarm and outside the actual camera footprint. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js'),C=require('../../js/widewake-combat.js'),O=require('../../js/widewake-ocean.js');
require('../../js/widewake-estuary-core.js');const R=require('../../js/widewake-reach-game.js');
const check=s=>console.log('PASS '+s);

for(const [x,y]of [[0,80],[2400,1800],[-3100,-800],[8000,4000]]){
  const b=new C.Endgame({population:0}),p=O.project(x,y);
  b.spawnBounds={left:p.x-1600,right:p.x+1600,top:p.y-1000,bottom:p.y+1000};
  // Include rays parallel to both isometric screen axes and cameras whose
  // rectangle lies entirely ahead of the usual rear entry band.
  for(let i=0;i<256;i++){
    const angle=i/256*Math.PI*2,r=B.spawnRadius(b,b.center,angle,3200);
    assert.ok(r>=3200);assert.equal(B.spawnVisible(b,Math.cos(angle)*r,Math.sin(angle)*r),false);
  }
  b.ships[1].x=3400;b.ships[1].y=0;
  assert.ok(B.spawnRadius(b,b.center,0,3200)>=4000,'distant escort keeps its arrival clearance');
  for(let phase=0;phase<C.fronts.length;phase++){
    b.phase=phase;b.raiders.count=0;for(let i=0;i<96;i++)b.spawn();
    b.population=144;b.pincer=48;b.nextPincer=Infinity;b.reinforce();
    assert.equal(b.raiders.count,144);assert.equal(b.pincer,0);
    for(let i=0;i<b.raiders.count;i++){
      assert.ok(Math.hypot(b.raiders.x[i],b.raiders.y[i])>=3199.99,'arrivals stay behind the 3 km starting swarm');
      assert.equal(B.spawnVisible(b,b.raiders.x[i],b.raiders.y[i]),false,'no ordinary or flanking spawn in view');
    }
    b.population=300;b.pincer=100;b.reinforce();assert.equal(b.raiders.count,192,'48 arrivals per tick');
  }
}
check('every front, flanking raid, panned camera and detached escort keeps safe rear entries');

for(const [x,y]of [[0,2300],[450,1100],[-750,-4300]]){
  const g=new R.Game();g.castOff();Object.assign(g.player,{x,y,px:x,py:y});
  const p=O.project(x,y);g.spawnBounds={left:p.x-500,right:p.x+500,top:p.y-300,bottom:p.y+300};
  for(let n=0;n<16;n++){const angle=(n+.5)/16*Math.PI*2;g.raiders.add(x+Math.cos(angle)*500,y+Math.sin(angle)*500,0,g.random);}const prior=g.raiders.count;
  assert.ok(g.wave(12)>0,'offscreen water approach at '+x+','+y);
  for(let i=prior;i<g.raiders.count;i++){
    assert.equal(B.spawnVisible(g,g.raiders.x[i],g.raiders.y[i]),false);
    assert.ok(Math.hypot(g.raiders.x[i]-x,g.raiders.y[i]-y)>=579.99);
    assert.ok(g.field.clearance({length:23,width:8,draft:.8},g.raiders.x[i],g.raiders.y[i],0,.5)>=.5);
  }
  assert.ok(R.Game.restore(g.save()),'spawn guards do not enter the portable save');
}
const distant=new R.Game();distant.castOff();Object.assign(distant.player,{x:0,y:2300});distant.raiders.add(0,-6000,0,distant.random);
assert.ok(distant.wave(12)>0,'a distant survivor does not close unrelated approaches');
check('campaign waves enter behind existing raiders through offscreen navigable water');
