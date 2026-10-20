/* Scale, physical hits, finite losses and deterministic endgame turnover. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const B=require('../../js/widewake-battle-core.js'),O=require('../../js/widewake-ocean.js');
const check=text=>console.log('PASS '+text),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const x of [-10000,-371.3,0,7,19191])for(const y of [-9999,0,42.1,9333]){const p=O.project(x,y),q=O.unproject(p.x,p.y);near(q.x,x);near(q.y,y);}
for(const [x,y]of [[1,0],[-1,0],[0,1],[0,-1],[.4,.7]]){const d=O.direction(x,y),q=O.project(d.x,d.y);near(q.x*y-q.y*x,0);near(Math.hypot(d.x,d.y),Math.min(1,Math.hypot(x,y)));}
check('isometric projection, inverse picking and screen-relative helm agree');
const a=new B.Raiders(),r=B.random(93);
for(let i=0;i<8000;i++)a.add((r()-.5)*4000,(r()-.5)*4000,i%3,r);a.index();
for(let n=0;n<100;n++){const x=(r()-.5)*4000,y=(r()-.5)*4000,reach=20+r()*1000;let best=-1,d=reach*reach;for(let i=0;i<a.count;i++){const d2=(a.x[i]-x)**2+(a.y[i]-y)**2;if(d2<d){d=d2;best=i;}}assert.equal(a.nearest(x,y,reach),best);}
const seen=new Set();a.splash(-40,30,1600,1,{damage:i=>{assert.ok(!seen.has(i),'hash collisions cannot cause repeated splash damage');seen.add(i);}});assert.equal(seen.size,Array.from(a.x.subarray(0,a.count)).filter((x,i)=>(x+40)**2+(a.y[i]-30)**2<1600**2).length);
const count=a.segment(-1700,-10,1800,30,35);assert.equal(new Set(a.hits.subarray(0,count)).size,count);for(let i=1;i<count;i++)assert.ok(a.hitDistances[i]>=a.hitDistances[i-1]);
check('wrapped hash buckets match brute-force queries and never repeat damage');
const b=new B.Battle({population:0});b.mounts=[];b.raiders.add(15,0,0,r);b.raiders.add(30,0,0,r);b.raiders.add(75,0,0,r);b.raiders.index();b.shots.fire(0,0,100,0,{...B.weapons.gun,speed:3000});b.shots.step(1/60,b);assert.equal(b.kills,2);assert.ok(b.raiders.hp[2]>0);assert.equal(b.shots.count,0);
check('traveling rounds sweep the full segment, pierce in order, and stop at their limit');
const cap=new B.Shots();for(let i=0;i<B.LIMITS.shots;i++)cap.fire(0,0,100,0,B.weapons.gun);assert.equal(cap.count,B.LIMITS.shots-B.LIMITS.hostileReserve);for(let i=0;i<B.LIMITS.hostileReserve;i++)assert.ok(cap.fire(100,0,0,0,B.weapons.hostile));assert.equal(cap.count,B.LIMITS.shots);assert.equal(cap.fire(100,0,0,0,B.weapons.hostile),false);
check('friendly fire cannot consume the hostile projectile reserve');
const vulnerable=new B.Battle({population:0});vulnerable.mounts=[];for(let i=0;i<125;i++)vulnerable.step(1/60);const work=vulnerable.ships.find(s=>s.working),fishBefore=vulnerable.produced.fish,lostCargo=work.cargo;assert.ok(lostCargo>0);vulnerable.hurt(work,work.hp);assert.equal(vulnerable.produced.fish,fishBefore-lostCargo);assert.equal(vulnerable.lost,1);assert.equal(work.hp,0);vulnerable.hurt(vulnerable.player,6000);vulnerable.step(1/60);assert.equal(vulnerable.result,'Flagship lost');
const travel=new B.Battle({population:0});travel.toggleWork();for(let i=0;i<600;i++)travel.step(1/60,{x:1,y:0});assert.equal(travel.workTime,0);assert.ok(travel.player.x>180);assert.ok(travel.ships.find(s=>s.working).x>0);travel.toggleWork();travel.step(1/60);assert.equal(travel.workTime,0,'work waits for a boat to reach its station');for(let i=0;i<1800;i++)travel.step(1/60);assert.ok(travel.workTime>0,'slower crews physically catch the faster captain within 30 seconds');
check('real hull losses, movement and work interruption have consequences');
const d1=new B.Battle({population:2048,seed:77}),d2=new B.Battle({population:2048,seed:77});for(let i=0;i<600;i++){const input={x:Math.sin(i*.01)*.4,y:Math.cos(i*.01)*.4};d1.step(1/60,input);d2.step(1/60,input);}assert.deepEqual(d1.report(),d2.report());for(const key of ['x','y','hp','id','vx','vy'])assert.deepEqual(d1.raiders[key],d2.raiders[key]);
check('seeded battles reproduce actual movement, fire and deaths exactly');
const stress=new B.Battle(),times=[],start=performance.now(),memory=stress.memoryBytes();
for(let frame=0;frame<=180*60&&!stress.result;frame++){if(frame%720===0)stress.broadside();const before=performance.now();stress.step(1/60);times.push(performance.now()-before);assert.ok(stress.raiders.count<=16384&&stress.shots.count<=B.LIMITS.shots&&stress.effects.count<=B.LIMITS.effects);}
assert.equal(stress.result,'Holds secured');assert.ok(stress.kills>90000);assert.ok(stress.spawned>100000);assert.equal(stress.raiders.peak,16384);assert.equal(stress.memoryBytes(),memory);assert.equal(stress.shots.rejected,0);assert.ok(stress.ships.every(s=>s.hp<=s.maxHp));assert.ok(stress.ships.some(s=>s.hp<s.maxHp),'load must include actual incoming damage');
times.sort((a,b)=>a-b);const report={...stress.report(),wallMs:performance.now()-start,stepP50:times[Math.floor(times.length*.5)],stepP95:times[Math.floor(times.length*.95)],stepP99:times[Math.floor(times.length*.99)],hardware:os.cpus()[0].model,node:process.version};
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-battle-core');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));check('three-minute 16,384-raider battle with finite hulls, replacement waves, production and bounded buffers');
