const assert=require('node:assert/strict');
const W=require('../../js/widewake-waves.js'),B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');
const dt=1/60;
// Analytic gradients and surface velocity agree with finite differences.
for(const ocean of [true,false])for(let n=0;n<50;n++){const x=n*7.13,y=ocean?n*-11.6:700+n*22,t=n*.31,at=(x,y,t)=>W.sample(x,y,t,22,.7,ocean),q=at(x,y,t),e=.0001;assert.ok(Math.abs((at(x+e,y,t).height-at(x-e,y,t).height)/(2*e)-q.dx)<1e-6);assert.ok(Math.abs((at(x,y+e,t).height-at(x,y-e,t).height)/(2*e)-q.dy)<1e-6);assert.ok(Math.abs((at(x,y,t+e).height-at(x,y,t-e).height)/(2*e)-q.vz)<1e-6);}
const field=new E.Field(),sea=new W.Sea(field);let sheltered=0,open=0;for(let n=0;n<300;n++){sheltered+=W.sample(-550,600,n*.1,22,1,false).height**2;open+=W.sample(-550,600,n*.1,22,1,true).height**2;}assert.ok(open>sheltered*20,'the same wave packet loses energy in shelter');assert.ok(sea.at(-550,600).exposure<.3&&sea.at(0,2200).exposure>.9);assert.equal(W.sample(0,0,1,-1).height,0);console.log('PASS coherent packet/envelope/time derivatives, dry land and sheltered water');
// The old long stripes remained >92% correlated when shifted 24 m along their
// crests. Check all headings so changing the stripe direction cannot pass.
let crestCorrelation=-1;
for(let direction=0;direction<24;direction++){
  const angle=direction*Math.PI/24,dx=Math.cos(angle)*24,dy=Math.sin(angle)*24;let sumA=0,sumB=0,aa=0,bb=0,ab=0,n=0;
  for(let y=-240;y<=240;y+=24)for(let x=-240;x<=240;x+=24){const a=W.sample(x,y,7.3).height,b=W.sample(x+dx,y+dy,7.3).height;sumA+=a;sumB+=b;aa+=a*a;bb+=b*b;ab+=a*b;n++;}
  crestCorrelation=Math.max(crestCorrelation,(ab-sumA*sumB/n)/Math.sqrt((aa-sumA*sumA/n)*(bb-sumB*sumB/n)));
}
assert.ok(crestCorrelation<.7,'wavefronts break into finite spatial patches instead of unbroken parallel lines');
let seaEnergy=0,seaSamples=0,minHeight=Infinity,maxHeight=-Infinity,projectionSlope=0;const sample={};
for(let t=0;t<16;t++)for(let y=-600;y<=600;y+=24)for(let x=-600;x<=600;x+=24){W.sample(x,y,t*2.37,22,1,true,sample);seaEnergy+=sample.height**2;seaSamples++;minHeight=Math.min(minHeight,sample.height);maxHeight=Math.max(maxHeight,sample.height);projectionSlope=Math.max(projectionSlope,Math.abs(1.22474487*(sample.dx+sample.dy)));}
const seaRms=Math.sqrt(seaEnergy/seaSamples);assert.ok(seaRms>1.2&&seaRms<1.9,'localized crests preserve the established ride energy');assert.ok(minHeight>-4&&maxHeight<4,'constructive packets cannot create runaway height');assert.ok(projectionSlope<.85,'representative sea faces remain invertible in the isometric water projection');console.log('PASS broken-front correlation, bounded sea energy and projection slopes',{crestCorrelation,seaRms,minHeight,maxHeight,projectionSlope});
const boat=(spec,id=0)=>({...spec,id,x:100,y:2200,px:100,py:2200,angle:0,vx:0,vy:0,hp:100,hold:32,cargo:0});
const extremes=[];
for(const type of ['launch','gunboat','oilrig','flagship']){
  const spec={...(E.vessels[type]||B.roles[type]),speed:R.hulls[type]?.speed||B.roles[type].speed*1.65};
  const s=boat(spec),o=new W.Sea();let low=Infinity,high=-Infinity,maxRoll=0;
  for(let n=1;n<7200;n++){o.begin(n*dt);B.helmStep(s,{throttle:n<3600?1:0,steer:Math.sin(n*.003)*.3},dt);o.stepShip(s,dt);low=Math.min(low,s.sea.z);high=Math.max(high,s.sea.z);maxRoll=Math.max(maxRoll,Math.abs(s.sea.roll));for(const key of ['x','y','vx','vy','angle'])assert.ok(Number.isFinite(s[key]));assert.ok(Math.abs(s.sea.z)<4.5&&Math.hypot(s.sea.roll,s.sea.pitch)<.481,'buoyancy remains bounded and cannot invert sprite projection');}
  assert.ok(high-low>2.5,'every hull visibly rides the swell at campaign speed');extremes.push({type,speed:s.speed,length:s.length,heave:high-low,maxRoll});assert.ok(o.count<=W.CAPACITY);assert.ok(o.bytes<26000);
}
assert.ok(extremes[0].maxRoll>extremes[3].maxRoll*1.2);console.log('PASS sustained hull stability, smaller hull response and fixed wake storage',extremes);
// Continuous support follows the water travelling under a fast hull, and turn
// banking reverses with the helm instead of being an unrelated bob animation.
const bankBoat=boat({...E.vessels.launch,speed:36}),bankSea=new W.Sea();let left=0,right=0;
bankSea.at=(x,y,time,out)=>Object.assign(out,{height:0,dx:0,dy:0,vz:0,vx:0,vy:0,exposure:1});
for(const direction of [-1,1]){Object.assign(bankBoat,{vx:36,vy:0,angle:0,turn:direction,sea:null});for(let n=0;n<90;n++){bankSea.begin(0);bankSea.stepShip(bankBoat,dt,false);}if(direction<0)left=bankBoat.sea.roll;else right=bankBoat.sea.roll;}
assert.ok(left-right>.3,'fast boats lean into the carried turn');
const emitterSea=new W.Sea(),fastBoat=boat({...E.vessels.launch,speed:36});fastBoat.vx=36;for(let n=0;n<60;n++){emitterSea.begin(n*dt);fastBoat.x+=36*dt;emitterSea.emit(fastBoat);}assert.ok(emitterSea.count>=5,'fast player leaves closely spaced physical wake crests');
console.log('PASS directional turn banking and dense speed wakes');
const flat=new W.Sea();flat.strength=0;const a=boat(E.vessels.launch),b=boat(E.vessels.launch);for(let n=1;n<600;n++){flat.begin(n*dt);B.helmStep(a,{throttle:1,steer:.3},dt);B.helmStep(b,{throttle:1,steer:.3},dt);flat.stepShip(a,dt);}assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.equal(a.sea.z,0);
const wake=new W.Sea(),emitter=boat(B.roles.gunboat,1);emitter.vx=20;wake.begin(1);wake.emit(emitter);const i=0,t=2,r=wake.wake[i+4]+3.5,x=wake.wake[0]-r,y=wake.wake[1];const crossed=wake.at(x,y,t,{},0),own=wake.at(x,y,t,{},1);assert.ok(crossed.height-own.height>.1);assert.deepEqual(wake.at(x,y,20,{},0),wake.at(x,y,20,{},1));console.log('PASS flat-water control, physical crossing wakes and expiration');
const g=new R.Game();assert.equal(g.player.speed,36);g.coins=10000;g.rank=4;g.earned.push('salt','fish','oil');g.changeHull('gunboat');assert.equal(g.player.speed,72);console.log('PASS faster campaign hulls');
// Canvas ribbons have no depth buffer: expanding foam must stop at the bank,
// including when its centre is safely in the channel.
require('../../js/widewake-ocean-art.js');const clipped=new WidewakeOceanArt.WakeTrail(),points=[];
clipped.segments=(view,emit)=>emit(0,0,10,0,9,9,.7,.7,0,1,0,1);
const canvas={save(){},restore(){},beginPath(){},closePath(){},fill(){},stroke(){},createLinearGradient(){return{addColorStop(){}};},moveTo(x,y){points.push({x,y});},lineTo(x,y){points.push({x,y});}};
clipped.drawCanvas({fallback:canvas,battle:{sea:{field:{sample:(x,y,out)=>Object.assign(out,{depth:5-Math.abs(y)})},at:()=>({height:0})}},project:(x,y)=>({x,y}),zoom:1,baseScale:1,visualTime:1,stats:{}});
assert.ok(points.length>=4&&points.some(p=>Math.abs(p.y)>4));assert.ok(points.every(p=>Math.abs(p.y)<=4.7),'foam stays inside both dry banks');console.log('PASS Canvas expanding wake edges clip to channel water');
// The fast launch leaves connected, divergent shoulders. At six seconds the
// boat is over 200 metres ahead; the sparse foam arms should have spread.
const trail=new WidewakeOceanArt.WakeTrail(),launch=boat({...E.vessels.launch,speed:36}),pose={x:0,y:2200,angle:0};launch.vx=36;
for(let n=0;n<=80;n++){pose.x=n*3.6;trail.sample([launch],[pose],n*.1);}
let trailSegments=0,sixSecondWidth=0,lastEnd=null;
trail.segments({visualTime:8,zoom:2,baseScale:1,visible:()=>true,battle:{ships:[]}},(x,y,ex,ey,width)=>{trailSegments++;if(lastEnd!==null)assert.ok(Math.abs(x-lastEnd)<.001,'successive foam segments stay connected');lastEnd=ex;if(x>60&&x<78)sixSecondWidth=Math.max(sixSecondWidth,width);});
assert.ok(trailSegments>60);assert.ok(sixSecondWidth>20&&sixSecondWidth<40,'six-second wake shoulders spread while remaining bounded');console.log('PASS continuous launch trail with divergent shoulders');
