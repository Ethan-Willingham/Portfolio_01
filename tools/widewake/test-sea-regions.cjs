/* Geography, propagation, local scales and six-axis hull response. */
const assert=require('node:assert/strict'),W=require('../../js/widewake-waves.js'),B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js');
const field=new E.Field(),sea=new W.Sea(field),env=sea.environment;
const locations={offshore:[0,2500],coast:[1800,1460],harbor:[-550,600],river:[-350,-900],fresh:[100,-5100],cut:[-200,-1900]};
const report={};for(const[name,[x,y]]of Object.entries(locations)){let energy=0,low=Infinity,high=-Infinity;for(let i=0;i<600;i++){const q=sea.at(x,y,i*.1,{},-1,false);energy+=q.height*q.height;low=Math.min(low,q.height);high=Math.max(high,q.height);}report[name]={...env.at(x,y),rms:Math.sqrt(energy/600),range:high-low};}
assert.ok(report.offshore.rms>1&&report.offshore.range>3.5,'offshore swell has real metre-scale displacement');
for(const name of ['harbor','river','fresh','cut']){assert.ok(report[name].swell<.02,'land and river bends exclude offshore swell at '+name);assert.ok(report[name].rms<.22&&report[name].rms>0,'small local wind ripples survive at '+name);}
assert.ok(report.cut.wind<report.river.wind*.7,'a narrow cut has shorter wind fetch than an open reach');
assert.ok(report.coast.swell>.3&&report.coast.travel>0,'incoming swell reaches exposed shallows and accumulates travel delay');
assert.ok(W.bands.filter(b=>!b.wind).every(b=>b.y<0),'all incoming ocean bands propagate from offshore toward the mainland');
// Amplitude and travel-distance gradients must both reach the buoyancy normals.
let derivativeError=0;for(const [x,y]of [[1801,1457],[1831,1491],[123,1597],[-531,617],[-329,-903]])for(const t of [0,3.7,19]){
  const water=field.sample(x,y),at=(x,y,t)=>W.sample(x,y,t,water.depth,water.salinity,false,{},env.at(x,y)),q=at(x,y,t),e=.0001;
  derivativeError=Math.max(derivativeError,Math.abs((at(x+e,y,t).height-at(x-e,y,t).height)/(2*e)-q.dx),Math.abs((at(x,y+e,t).height-at(x,y-e,t).height)/(2*e)-q.dy),Math.abs((at(x,y,t+e).height-at(x,y,t-e).height)/(2*e)-q.vz));
}assert.ok(derivativeError<1e-5,'regional phase and exposure derivatives agree with the actual surface');
// A continuous height is not enough: a jump in the normal lights the regional
// chart as diamonds and X shapes. Cross both cell axes in actual wet regions,
// including bank shallows, with depth held fixed to isolate chart interpolation.
let seamSlopeJump=0,seamSamples=0;
for(const [ox,oy]of [[350,500],[700,850],[-550,600],[-350,-900],[1800,1460],[100,-5100]])for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)for(const axis of [0,1])for(const t of [0,3.7,18,27]){
  const p=[Math.round(ox/64)*64+i*64+(axis?21.37:0),Math.round(oy/64)*64+j*64+(axis?0:21.37)],water=field.sample(...p);if(water.depth<=.4)continue;
  const at=d=>{const q=p.slice();q[axis]+=d;return W.sample(...q,t,water.depth,water.salinity,false,{},env.at(...q));},a=at(-.0001),b=at(.0001);
  seamSlopeJump=Math.max(seamSlopeJump,Math.hypot(a.dx-b.dx,a.dy-b.dy));seamSamples++;
}
assert.ok(seamSamples>500&&seamSlopeJump<2e-5,'water normals remain continuous across regional cell edges: '+seamSlopeJump);
const attitudes=[];for(const type of ['launch','gunboat','flagship'])for(const relation of ['head','beam','quarter']){
  const spec=E.vessels[type]||B.roles[type],angle=W.bands[0].angle+(relation==='head'?Math.PI:relation==='beam'?Math.PI*.5:Math.PI*.75),s={...spec,id:0,x:0,y:2500,angle,vx:0,vy:0,hp:100,hold:32,cargo:0},o=new W.Sea();
  let low=Infinity,high=-Infinity,pitch=0,roll=0,yaw=0,sway=0;for(let i=0;i<2400;i++){o.begin(i/60);B.helmStep(s,{throttle:.5,steer:0},1/60);o.stepShip(s,1/60);if(i>120){low=Math.min(low,s.sea.z);high=Math.max(high,s.sea.z);pitch=Math.max(pitch,Math.abs(s.sea.pitch));roll=Math.max(roll,Math.abs(s.sea.roll));yaw=Math.max(yaw,Math.abs(s.turn));sway=Math.max(sway,Math.abs(-s.vx*Math.sin(s.angle)+s.vy*Math.cos(s.angle)));}assert.ok(Number.isFinite(s.sea.z)&&Math.abs(s.sea.z)<8&&Math.hypot(s.sea.pitch,s.sea.roll)<.481);}
  assert.ok(high-low>2.3&&pitch>.025&&roll>.025,'each hull responds to heave, pitch and roll: '+JSON.stringify({type,relation,heave:high-low,pitch,roll}));assert.ok(yaw>0&&sway>.001,'off-centre pressure also yaws and displaces the boat');attitudes.push({type,relation,heave:high-low,pitch,roll,yaw,sway});
}
assert.equal(env.complete().byteLength,127*190*16);console.log('PASS coastward spectrum, blocked swell, bounded local wind chop, shallow phase compression, continuous chart-edge normals, analytic gradients and hull response on every axis');console.log(JSON.stringify({regions:report,derivativeError,seamSlopeJump,seamSamples,attitudes},null,2));
