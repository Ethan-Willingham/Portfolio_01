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
const barrier=new M.World('ants',731,true);barrier.food=[{x:.8,y:.5,capacity:900,amount:900}];barrier.walls=[];
for(let y=0;y<=1;y+=.02)barrier.walls.push({x:.5,y,r:.025});barrier.rebuildWalls();barrier.field.fill(0);barrier.field[barrier.cell(.45,.5)]=10;
for(let i=0;i<60;i++)barrier.diffuse(0);
assert.ok(barrier.sample(.55,.5)<1e-8);assert.ok(barrier.field.reduce((a,b)=>a+b,0)>9.9);assert.equal(barrier.clearLine(.2,.5,.8,.5),false);
evolve(barrier,1700);assert.equal(barrier.delivered,0);assert.equal(barrier.food[0].amount,900);assert.ok(barrier.x.every(x=>x<.5));
pass('Solid barriers block ants, scent and remembered shortcuts');
const ant=new M.World('ants',42,true);ant.field.fill(8);ant.home.fill(5);ant.intervene('cut',.45,.45);assert.equal(ant.sample(.45,.45),0);assert.equal(ant.sample(.45,.45,ant.home),0);
ant.movePlace(0,.65,.3);assert.equal(ant.food[0].x,.65);ant.movePlace(-2,.25,.45);assert.equal(ant.nest.x,.25);ant.food[0].amount=0;ant.intervene('food',.65,.3);assert.equal(ant.food[0].amount,ant.food[0].capacity);
ant.intervene('wall',.6,.6);assert.ok(ant.blocked(.6,.6));ant.intervene('erase',.6,.6);assert.ok(!ant.blocked(.6,.6));pass('Food refills, nest and food move, scent erases and walls edit');
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
