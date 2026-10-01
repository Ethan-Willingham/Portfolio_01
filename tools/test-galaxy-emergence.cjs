// Node-only behavioral checks, independent of the UI and renderer.
const assert=require('node:assert/strict');
const M=require('../js/random-galaxy-emergence-models.js');
M.setOrbium(require('../assets/emergence/lenia-orbium.json').cells);
function pass(s){process.stdout.write('PASS '+s+'\n');}
function evolve(w,n){for(let i=0;i<n;i++)w.step(w.id==='lenia'?1/15:1/30);return w;}
function finite(w){for(const key of ['x','y','z','vx','vy','vz','phase','field'])assert.ok(w[key].every(Number.isFinite),w.id+' '+key);assert.ok(w.field.every(v=>v>=0),w.id+' negative field');}

// A spatial impulse must survive an FFT round trip without moving or spreading.
const re=new Float32Array(64),im=new Float32Array(64);re[19]=1;M.fft2(re,im,8);M.fft2(re,im,8,true);
for(let i=0;i<64;i++)assert.ok(Math.abs(re[i]-(i===19?1:0))<1e-6);
pass('FFT preserves a spatial impulse');

// The published swimmer should stay alive and travel under the real kernel.
const swimmer=new M.World('lenia',42,true,'solo'),initial=swimmer.field.slice();const mass=swimmer.field.reduce((a,b)=>a+b,0);
evolve(swimmer,500);const finalMass=swimmer.field.reduce((a,b)=>a+b,0);
assert.ok(finalMass>mass*.7&&finalMass<mass*1.3,JSON.stringify({mass,finalMass}));assert.notDeepEqual(swimmer.field,initial);finite(swimmer);
const dying=swimmer.clone();dying.p.growth=.18;evolve(dying,150);assert.ok(dying.field.reduce((a,b)=>a+b,0)<finalMass*.5);
pass('Orbium survives 500 generations and responds to changed growth');

const ants=evolve(new M.World('ants',731,true),1000);finite(ants);assert.ok(ants.delivered>40);assert.ok(ants.field.some(v=>v>0));
const missing=1350-ants.food.reduce((a,f)=>a+f.amount,0),carrying=ants.carry.reduce((a,b)=>a+b,0);
assert.equal(missing,ants.delivered+carrying);pass('Ants discover food, lay trails and conserve returned food');

const network=evolve(new M.World('physarum',731,true),150);finite(network);const old=network.field.reduce((a,b)=>a+b,0);
network.intervene('cut',.5,.5,.09);assert.equal(network.sample(.5,.5),0);evolve(network,80);assert.ok(network.sample(.5,.5)>1);assert.ok(old>1000);
pass('Slime agents reinforce a field and regrow across a cut');

const barrier=new M.World('ants',731,true);barrier.field.fill(0);barrier.field[barrier.cell(.45,.5)]=10;
barrier.walls=[];for(let y=0;y<=1;y+=.02)barrier.walls.push({x:.5,y,r:.025});barrier.rebuildWalls();
for(let i=0;i<60;i++)barrier.diffuse(0);
assert.ok(barrier.sample(.55,.5)<1e-8);assert.ok(barrier.field.reduce((a,b)=>a+b,0)>9.9);
pass('Walls block chemical diffusion without deleting scent on the open side');

const coupled=new M.World('fireflies',731,true);coupled.p.radius=.3;coupled.p.diversity=0;coupled.p.coupling=4;
const uncoupled=coupled.clone();uncoupled.p.coupling=0;evolve(coupled,500);evolve(uncoupled,500);finite(coupled);
const coherence=w=>{let x=0,y=0;for(const p of w.phase){x+=Math.cos(p);y+=Math.sin(p);}return Math.hypot(x,y)/w.n;};
assert.ok(coherence(coupled)>.9);assert.ok(coherence(uncoupled)<.2);pass('Local timing coupling synchronizes a connected population');

const particles=new M.World('particlelife',731,true),noForces=particles.clone();noForces.p.strength=0;
evolve(particles,100);evolve(noForces,100);finite(particles);assert.notDeepEqual(particles.x,noForces.x);
const changed=particles.clone();changed.matrix.fill(-1);const original=particles.clone();evolve(changed,30);evolve(original,30);assert.notDeepEqual(changed.vx,original.vx);
pass('Species relationships change Particle Life motion');

const flock=new M.World('boids',731,true);const first=parseInt(flock.metric()[0]);evolve(flock,600);finite(flock);assert.ok(parseInt(flock.metric()[0])>first+25);
const scattered=flock.clone();scattered.intervene('scatter',.5,.5);assert.notDeepEqual(scattered.vx,flock.vx);
pass('Local steering produces a flock and scatter changes nearby motion');

const crowd=new M.World('crowds',731,true,'door');evolve(crowd,600);finite(crowd);
for(let i=0;i<Math.round(crowd.n*crowd.p.density);i++)assert.ok(!crowd.blocked(crowd.x[i],crowd.y[i]),'walker entered wall');
assert.ok(crowd.x.some((v,i)=>Math.abs(v-(i%2?.25:.75))>.1));pass('Walkers navigate the doorway without entering walls');

for(const id of Object.keys(M.definitions)){
  const a=evolve(new M.World(id,123,true),8),b=a.clone();evolve(a,12);evolve(b,12);
  for(const key of ['x','y','z','phase','field'])assert.deepEqual(a[key],b[key],id+' clone diverged');
  for(const preset of M.definitions[id].presets){const w=evolve(new M.World(id,123,true,preset[0]),8);finite(w);}
  const restored=new M.World(id,a.seed,true,a.preset,a.configuration());assert.deepEqual(restored.p,a.p);assert.deepEqual(restored.walls,a.walls);assert.deepEqual(Array.from(restored.matrix),Array.from(a.matrix));
}
pass('Every preset is finite; cloned comparisons stay identical until a rule changes');
