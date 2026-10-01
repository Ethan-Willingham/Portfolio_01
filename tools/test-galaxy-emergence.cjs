// Behavior checks for the two worlds, independent of browser and rendering.
const assert=require('node:assert/strict');
const M=require('../js/random-galaxy-emergence-models.js');
const pass=s=>process.stdout.write('PASS '+s+'\n');
const evolve=(w,n)=>{for(let i=0;i<n;i++)w.step(1/30);return w;};
function finite(w){for(const key of ['x','y','z','vx','vy','vz','field','home'])assert.ok(w[key].every(Number.isFinite),key);assert.ok(w.field.every(v=>v>=0)&&w.home.every(v=>v>=0));}
assert.deepEqual(Object.keys(M.definitions),['boids','ants']);assert.throws(()=>new M.World('lenia'));pass('Only birds and ants remain available');
for(const preset of M.definitions.ants.presets){
  const w=new M.World('ants',731,true,preset[0]),total=w.food.reduce((n,f)=>n+f.amount,0);evolve(w,1400);finite(w);
  assert.ok(w.delivered>30,preset[0]+' failed to return food');
  assert.equal(total-w.food.reduce((n,f)=>n+f.amount,0),w.delivered+w.carry.reduce((n,v)=>n+(v===1),0));
  assert.ok(w.field.some(v=>v>0)&&w.home.some(v=>v>0));
  for(let i=0;i<w.n;i++)assert.ok(!w.blocked(w.x[i],w.y[i]));
  const fresh=new M.World('ants',w.seed,w.small,w.preset,w.configuration());assert.equal(fresh.food.reduce((n,f)=>n+f.amount,0),total);assert.equal(fresh.delivered,0);
}
pass('All ant maps deliver food, conserve it and restart with replenished sources');
// The initial outward exploration should turn inward rather than line the perimeter.
for(const small of [false,true])for(const seed of [42,731,1955]){
  const w=new M.World('ants',seed,small);
  for(let step=0;step<360;step++){
    w.step(1/30);
    if(step===119||step===239||step===359){
      let edge=0;for(let i=0;i<w.n;i++)if(w.x[i]<.035||w.x[i]>.965||w.y[i]<.035||w.y[i]>.965)edge++;
      assert.ok(edge/w.n<.08,JSON.stringify({small,seed,step,edge,n:w.n}));
    }
  }
}
const edges=new M.World('ants',731,true);edges.food=[];
const starts=[[.0081,.5,Math.PI],[.9919,.5,0],[.5,.0081,-Math.PI/2],[.5,.9919,Math.PI/2],[.0081,.0081,-Math.PI*.75],[.9919,.9919,Math.PI*.25]];
starts.forEach(([x,y,a],i)=>{edges.x[i]=x;edges.y[i]=y;edges.a[i]=a;edges.routeX[i*edges.routeLimit]=x;edges.routeY[i*edges.routeLimit]=y;});edges.step(1/30);
starts.forEach(([x,y],i)=>{assert.ok(!edges.blocked(edges.x[i],edges.y[i]));if(x<.01)assert.ok(edges.vx[i]>0);if(x>.99)assert.ok(edges.vx[i]<0);if(y<.01)assert.ok(edges.vy[i]>0);if(y>.99)assert.ok(edges.vy[i]<0);});
pass('Scouts turn away from every edge and corner without perimeter pileups');
const barrier=new M.World('ants',731,true);barrier.food=[{x:.8,y:.5,capacity:900,amount:900}];barrier.walls=[];
for(let y=0;y<=1;y+=.02)barrier.walls.push({x:.5,y,r:.025});barrier.rebuildWalls();barrier.field.fill(0);barrier.field[barrier.cell(.45,.5)]=10;
for(let i=0;i<60;i++)barrier.diffuse(0);
assert.ok(barrier.sample(.55,.5)<1e-8);assert.ok(barrier.field.reduce((a,b)=>a+b,0)>9.9);assert.equal(barrier.clearLine(.2,.5,.8,.5),false);
evolve(barrier,1700);assert.equal(barrier.delivered,0);assert.equal(barrier.food[0].amount,900);assert.ok(barrier.x.every(x=>x<.5));
pass('Solid barriers block ants, scent and remembered shortcuts');
const ant=new M.World('ants',42,true);ant.field.fill(8);ant.home.fill(5);ant.intervene('cut',.45,.45);assert.equal(ant.sample(.45,.45),0);assert.equal(ant.sample(.45,.45,ant.home),0);
ant.movePlace(0,.65,.3);assert.equal(ant.food[0].x,.65);ant.movePlace(-2,.25,.45);assert.equal(ant.nest.x,.25);ant.food[0].amount=0;ant.intervene('food',.65,.3);assert.equal(ant.food[0].amount,ant.food[0].capacity);
ant.intervene('wall',.6,.6);assert.ok(ant.blocked(.6,.6));ant.intervene('erase',.6,.6);assert.ok(!ant.blocked(.6,.6));pass('Food refills, nest and food move, scent erases and walls edit');
for(const aspect of [.4,.7,1.8,4]){
  const w=new M.World('ants',731,true,'forage',{aspect});w.food=[];w.p.exploration=0;w.p.following=0;
  for(let i=0;i<2;i++){w.x[i]=w.y[i]=.5;w.a[i]=i*Math.PI/2;w.rate[i]=1;w.routeX[i*w.routeLimit]=w.routeY[i*w.routeLimit]=.5;}
  w.step(1/30);assert.ok(Math.abs(w.vx[0]*w.spanX-w.vy[1]*w.spanY)<1e-5,'Unequal speed by screen direction');
  w.intervene('wall',.6,.6,.04);assert.ok(w.blocked(.6+.02/w.spanX,.6)&&w.blocked(.6,.6+.02/w.spanY));assert.ok(!w.blocked(.6+.07/w.spanX,.6)&&!w.blocked(.6,.6+.07/w.spanY));
  const detour=new M.World('ants',42,true,'detour',{aspect});for(let y=.19;y<.78;y+=.005)assert.ok(detour.blocked(.5,y),'Resize opened a preset wall');
  detour.setAspect(1/aspect);for(let y=.19;y<.78;y+=.005)assert.ok(detour.blocked(.5,y),'Changing orientation opened a wall');
  const barrier=new M.World('ants',42,true,'forage',{aspect});barrier.food=[];for(let y=0;y<=1.001;y+=.02)barrier.walls.push({x:.5,y,r:.025,ex:.5,ey:Math.max(0,y-.02)});barrier.rebuildWalls();barrier.field[barrier.cell(.46,.5)]=10;
  for(let i=0;i<80;i++)barrier.diffuse(0);assert.ok(barrier.sample(.54,.5)<1e-8);assert.ok(Math.abs(barrier.field.reduce((a,b)=>a+b,0)-10)<.001);assert.ok(!barrier.clearLine(.2,.5,.8,.5));
  const active=evolve(new M.World('ants',42,true,'forage',{aspect}),Math.ceil(1200*Math.sqrt(Math.max(aspect,1/aspect)))),total=2700;
  finite(active);assert.ok(active.delivered>0,'Rectangular habitat failed to deliver food: '+aspect);assert.equal(total-active.food.reduce((a,b)=>a+b.amount,0),active.delivered+active.carry.reduce((a,b)=>a+(b===1),0));
  const copy=active.clone();evolve(active,10);evolve(copy,10);assert.deepEqual(active.x,copy.x);assert.deepEqual(active.field,copy.field);assert.deepEqual(active.food,copy.food);
}
const rescaled=new M.World('ants',85,true);rescaled.home.fill(4);
for(let y=0;y<rescaled.rows;y++)for(let x=0;x<rescaled.cols;x++)rescaled.field[y*rescaled.cols+x]=2+(x+.5)/rescaled.cols+(y+.5)/rescaled.rows;
const positions=rescaled.x.slice(),resources=JSON.stringify(rescaled.food),routes=rescaled.routeX.slice();rescaled.setAspect(2.4);
assert.deepEqual(rescaled.x,positions);assert.deepEqual(rescaled.routeX,routes);assert.equal(JSON.stringify(rescaled.food),resources);assert.equal(rescaled.steps,0);assert.ok(Math.abs(rescaled.sample(.35,.7)-3.05)<.015);assert.equal(rescaled.sample(.35,.7,rescaled.home),4);
pass('Rectangular habitats preserve speed, circular obstacles, sealed walls, scent, resources and deterministic clones');
const flock=evolve(new M.World('boids',731,true),900),independent=evolve(new M.World('boids',731,true,'chaos'),900);finite(flock);finite(independent);
const coherence=w=>{let x=0,y=0,z=0;for(let i=0;i<w.n;i++){const s=Math.hypot(w.vx[i],w.vy[i],w.vz[i]);x+=w.vx[i]/s;y+=w.vy[i]/s;z+=w.vz[i]/s;}return Math.hypot(x,y,z)/w.n;};
assert.ok(coherence(flock)>.7);assert.ok(coherence(independent)<.3);assert.ok(flock.neighbors.every(n=>n<=7));pass('Local bird steering creates agreement and independent birds remain disordered');
const threatened=flock.clone();threatened.setPredator(.5,.5,.5);const hawk={...threatened.predator};threatened.intervene('wall',.6,.5,.08,.7);evolve(threatened,200);finite(threatened);assert.notDeepEqual(threatened.predator,hawk);assert.notDeepEqual(threatened.x,evolve(flock.clone(),200).x);
for(let i=0;i<threatened.n;i++)assert.ok(Math.hypot(threatened.x[i]-.6,threatened.y[i]-.5,threatened.z[i]-.7)>.08);
pass('A moving hawk changes the flock and birds remain outside solid obstacles');
for(const id of Object.keys(M.definitions))for(const [preset]of M.definitions[id].presets){
  const w=evolve(new M.World(id,85,true,preset),90),copy=w.clone();evolve(w,20);evolve(copy,20);assert.deepEqual(w.x,copy.x);assert.deepEqual(w.field,copy.field);assert.deepEqual(w.routeCount,copy.routeCount);assert.deepEqual(w.food,copy.food);
  const changed=w.clone();changed.p[M.definitions[id].compare[0]]=w.p[M.definitions[id].compare[0]]===M.definitions[id].compare[1]?M.definitions[id].defaults[M.definitions[id].compare[0]]:M.definitions[id].compare[1];assert.deepEqual(w.x,changed.x);assert.notDeepEqual(w.p,changed.p);
}
pass('All six presets clone full state and random sequence for fair comparisons');
