/* Automatic volleys, committed attacks, the full watch and fixed memory limits. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const B=require('../../js/widewake-battle-core.js'),C=require('../../js/widewake-combat.js');
const dt=1/60,check=s=>console.log('PASS '+s),step=(b,n,input)=>{for(let i=0;i<n;i++)b.step(dt,input);};
const aim={};B.intercept(aim,0,0,500,0,0,80,1000);assert.ok(Math.abs(Math.hypot(aim.x,aim.y)/1000-aim.flight)<.00001);assert.ok(aim.y>40);
const swarm=new B.Raiders(16),r=B.random(1);for(const x of [100,105,600,605])swarm.add(x,0,0,r);swarm.index();
const target=swarm.denseTarget(0,0,800,1);swarm.reserveBlast(swarm.x[target],swarm.y[target],100,3);assert.ok(swarm.x[swarm.denseTarget(0,0,800,1)]>500);
swarm.reserved[0]=100;swarm.reserved[1]=100;assert.ok(swarm.nearest(0,0,800,true)>=2);
check('lead aiming solves the moving intercept; fleet fire and area strikes spread across targets');

const ram=new C.Endgame({population:0});ram.mounts=[];ram.burstCooldown=999;ram.raiders.add(500,0,3,r);ram.raiders.cooldown[0]=0;ram.ships.slice(1).forEach(s=>{s.hp=0;s.working=false;});ram.ships[19].hp=2400;ram.ships[19].working=true;ram.ships[19].x=ram.ships[19].y=0;ram.player.x=ram.player.y=0;
ram.raiders.step(dt,ram);const direction=[ram.raiders.chargeX[0],ram.raiders.chargeY[0]],position=ram.raiders.x[0];assert.ok(ram.raiders.charge[0]>1);
ram.player.y=300;ram.ships[19].y=300;for(let i=0;i<55;i++)ram.raiders.step(dt,ram);
assert.deepEqual([ram.raiders.chargeX[0],ram.raiders.chargeY[0]],direction);assert.ok(ram.raiders.x[0]<position-1);assert.ok(ram.raiders.vx[0]<-5&&ram.raiders.vx[0]>-120,'ram builds speed after its wind-up');
for(let i=0;i<40;i++)ram.raiders.step(dt,ram);assert.deepEqual([ram.raiders.chargeX[0],ram.raiders.chargeY[0]],direction);assert.ok(ram.raiders.x[0]<position-30);assert.ok(ram.raiders.vx[0]<-140,'the committed dash reaches its full speed over time');
ram.player.x=1000;const victim=ram.ships[19];ram.raiders.x[0]=victim.x;ram.raiders.y[0]=victim.y;const hp=victim.hp;ram.raiders.step(dt,ram);assert.equal(victim.hp,hp-360);assert.equal(ram.raiders.hp[0],-999);
check('rams wind up, commit to one lane, accelerate, and hit one hull once');

const a=new C.Endgame({population:1024}),b=new C.Endgame({population:1024});step(a,300,{x:.7,y:.3,fire:true,aim:{x:1e6,y:1e6}});step(b,300,{x:.7,y:.3});assert.deepEqual(a.report(),b.report());assert.deepEqual(Array.from(a.shots.x),Array.from(b.shots.x));
const watch=a.workTime;a.toggleWork();step(a,120,{x:1,y:0});assert.equal(a.workTime,watch);assert.ok(a.center.x!==0);a.toggleWork();step(a,1800);assert.ok(a.workTime>watch+10);
a.player.hp=300;a.ships[1].hp=0;a.loot=[{x:a.player.x,y:a.player.y,life:10}];step(a,1);assert.ok(a.player.hp>300);assert.equal(a.ships[1].hp,0);assert.equal(a.repaired,1);assert.equal(a.loot.length,0);
check('click-to-fire input is inert; follow/hold changes real work; crates heal living boats only');

const battle=new C.Endgame(),buffers=battle.memoryBytes(),start=performance.now(),snapshots=[];assert.equal(battle.raiders.count,16384);
for(let tick=0;tick<10810&&!battle.result;tick++){
  battle.step(dt);
  if(tick%1800===1799)snapshots.push(battle.report());
  if(tick===900)assert.equal(battle.fired.filter(n=>n>0).length,24);
}
assert.equal(battle.result,'Holds secured');assert.equal(battle.memoryBytes(),buffers);assert.ok(battle.kills>battle.population*3,JSON.stringify(battle.report()));assert.ok(battle.salvos>=15);assert.ok(battle.damageTaken>0,JSON.stringify(battle.report()));assert.ok(battle.ships.filter(s=>s.hp>0).length>=4);assert.ok(battle.shots.rejected===0);assert.ok(battle.shots.peak<8192);assert.ok(battle.effects.count<=2048);assert.ok(battle.loot.length<=16);assert.ok(battle.events.length<=4);
const completed=JSON.stringify(battle.report());step(battle,60,{x:1});assert.equal(JSON.stringify(battle.report()),completed);
const loss=new C.Endgame({population:0});loss.player.hp=0;step(loss,1);assert.equal(loss.result,'Flagship lost');const workers=new C.Endgame({population:0});workers.ships.filter(s=>s.working).forEach(s=>s.hp=0);step(workers,1);assert.equal(workers.result,'Workboats lost');
check('180 seconds, 16,384 raiders, 24 firing boats, changing fronts, win/loss, and fixed buffers');
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-combat');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'simulation.json'),JSON.stringify({wallSeconds:(performance.now()-start)/1000,snapshots,final:battle.report(),hulls:battle.ships.map(s=>({name:s.name,hull:s.hp/s.maxHp,fired:battle.fired[s.id]}))},null,2)+'\n');console.log(JSON.stringify(battle.report()));
