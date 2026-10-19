const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {D,W,C,earth,make,place,boss,dense}=require('./sea-fixtures.cjs');
const Sea=require('../../js/widewake-sea-save.js');
const check=(name,fn)=>{fn();console.log('PASS '+name);};
function compare(g,again,frames,input=()=>({})){for(let i=0;i<frames;i++){const action=input(i);g.step(1/60,action);again.step(1/60,action);assert.deepEqual(again.snapshot(),g.snapshot(),'continuation differs at frame '+i);}}
function saved(g){const s=g.snapshot();assert.ok(Buffer.byteLength(JSON.stringify(s))<C.MAX_SAVE_BYTES);return new C.Game(earth,s);}
check('random state resumes exactly without changing the existing seeded sequence',()=>{
  for(const seed of [0,1,744,0xffffffff]){let a=seed>>>0;const original=()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;},random=C.rng(seed);for(let i=0;i<10000;i++)assert.equal(random(),original());const restored=C.rng(0);restored.restore(random.state());for(let i=0;i<1000;i++)assert.equal(restored(),random());}
});
check('damaged admirals resume outside the spawn circle with the same phase and volleys',()=>{
  for(const id of D.bosses.map(b=>b.id)){const g=boss(id),e=g.enemies.find(e=>e.bossId===id),site=g.bossSites.find(b=>b.id===id);const q=earth.nearestWater({x:W.wrap(site.x+610),y:site.y},15);Object.assign(g.player,q);const again=saved(g),restored=again.enemies.find(e=>e.bossId===id);assert.equal(restored.hp,e.hp);assert.equal(restored.enraged,true);assert.equal(restored.rate,e.rate);assert.deepEqual(restored.attack,e.attack);assert.ok(W.distance(again.player,site)>450);compare(g,again,180,i=>({x:Math.cos(i*.02),y:Math.sin(i*.02)}));}
});
check('ramming tells, moving cannonballs and mortar deadlines retain their damage timing',()=>{
  const g=place(make(),W.point(-140,10));g.s.settings.autoFire=false;const e=g.spawn('rammer',g.player,true,{x:g.player.x+200,y:g.player.y});e.specialCD=0;g.enemyAbility(e,.01,g.player);e.charge.t=.35;
  g.shoot({x:g.player.x-90,y:g.player.y},0,22,true,{speed:210,life:3});g.hazards.push({x:g.player.x,y:g.player.y,radius:80,elapsed:1.9,delay:2.2,damage:50});const hp=g.player.hp,again=saved(g);compare(g,again,30);assert.ok(g.player.hp<hp);assert.equal(g.hazards.length,0);assert.ok(g.enemies.find(e=>e.type==='rammer')?.charge?.phase==='run');
});
check('partly cleared patrols retain survivors, then pay the encounter reward once',()=>{
  const g=make(),signal=g.signals.find(s=>s.kind==='battle');place(g,signal);g.signalChoice(signal.id,'work');const first=g.enemies[0];g.damage(first,first.hp);for(let i=2;i<g.enemies.length;i++)g.damage(g.enemies[i],g.enemies[i].hp);g.enemies[1].hp*=.25;const again=saved(g);assert.equal(again.enemies.filter(e=>e.hp>0).length,1);assert.equal(again.enemies.length,g.enemies.length);compare(g,again,1);
  const survivor=again.enemies.find(e=>e.hp>0);again.damage(survivor,survivor.hp);const before=again.s.coins;again.step(1/60);assert.equal(again.s.voyage.resolved[signal.id],'cleared');assert.equal(again.s.coins,before+signal.reward);const ended=saved(again),coins=ended.s.coins;ended.step(1/60);assert.equal(ended.s.coins,coins);assert.equal(ended.signalChoice(signal.id,'work'),false);
});
check('rescues retain the protected hull and wave clock without spawning another patrol',()=>{
  const g=make(),signal=g.signals.find(s=>s.kind==='rescue');place(g,signal);g.signalChoice(signal.id,'work');for(let i=0;i<100;i++)g.step(1/60);g.hurt(g.encounter.boat,101);g.encounter.wave=.125;const again=saved(g);assert.equal(again.encounter.boat.hp,g.encounter.boat.hp);assert.equal(again.enemies.length,g.enemies.length);assert.equal(again.encounter.wave,.125);compare(g,again,120);
});
check('protected fishing and oil retain attackers, forecast, approach and watch progress',()=>{
  for(const id of ['bahama-bank','iceland-bank','gulf']){const g=make();place(g,g.sites.find(s=>s.id===id));assert.ok(g.startProduction());for(let i=0;i<12*60;i++)g.step(1/60);g.spawnTimer=1.25;g.workApproach();const again=saved(g);assert.deepEqual(again.production.approach,g.production.approach);assert.equal(again.enemies.length,g.enemies.length);compare(g,again,180);}
});
check('floating loot survives reload and uses the same random cargo quantity once',()=>{
  const g=place(make(),W.point(-140,10));g.drops.push({x:g.player.x+90,y:g.player.y,t:35,kind:'cargo',item:'iron'},{x:g.player.x+105,y:g.player.y,t:45,kind:'relic',item:'magnet'});const before=g.quantity('iron'),again=saved(g);compare(g,again,180);assert.ok(g.quantity('iron')>before);assert.ok(g.s.items.includes('magnet'));assert.equal(g.drops.length,0);const coins=g.s.coins;compare(g,saved(g),60);assert.equal(g.s.coins,coins);
});
check('an escort beside a coast resumes at its actual hull clearance without a jump',()=>{
  const g=place(make(),W.point(-140,10)),f=g.fleet[0];Object.assign(f,{x:75510.57552201906,y:12469.401263893928});assert.ok(earth.water(f.x,f.y,f.radius));assert.equal(earth.water(f.x,f.y,15),false);f.wake=[{x:f.x,y:f.y}];const again=saved(g);assert.equal(again.fleet[0].x,f.x);assert.equal(again.fleet[0].y,f.y);compare(g,again,60);
});
check('a newly sunk companion cannot shift formation or absorb another attack after reload',()=>{
  const g=place(make(),W.point(-140,10)),f=g.fleet[1];g.hurt(f,f.hp+1);assert.equal(g.fleet.some(b=>b.uid===f.uid),false);compare(g,saved(g),120,()=>({x:1}));
});
check('port saves retain the random stream and next vessel identity for the next crossing',()=>{
  const g=boss();g.rescue();const again=saved(g);assert.equal(again.random.state(),g.random.state());assert.equal(again.nextEnemy,g.nextEnemy);g.navigate(g.ports.find(p=>p.id==='nassau'));again.navigate(again.ports.find(p=>p.id==='nassau'));compare(g,again,600);
});
check('defeated admirals, docking and towing cannot resurrect enemies or pay twice',()=>{
  const g=boss();const enemy=g.enemies.find(e=>e.bossId==='widow');g.damage(enemy,enemy.hp+1);const again=saved(g),coins=again.s.coins;again.step(1/60);assert.equal(again.enemies.some(e=>e.bossId==='widow'&&e.hp>0),false);assert.equal(again.s.coins,coins);
  Object.assign(again.player,again.ports.find(p=>p.id==='havana'));assert.equal(again.dock(),false,'remote companions must block docking');for(const f of again.fleet)Object.assign(f,earth.nearestWater({x:again.player.x+80,y:again.player.y+80},13));assert.ok(again.dock());assert.equal(again.snapshot().sea,null);assert.equal(saved(again).enemies.length,0);again.sail();again.spawn('skiff',again.player,true);again.rescue();assert.equal(again.snapshot().sea,null);assert.equal(saved(again).enemies.length,0);
});
check('old saves migrate and malformed combat data cannot overwrite a valid fleet',()=>{
  const g=boss(),s=g.snapshot(),old=structuredClone(s);for(const key of ['sea','randomState','enemySequence'])delete old[key];assert.doesNotThrow(()=>new C.Game(earth,old));const mutateRecord=(s,field,change)=>{const bytes=Buffer.from(s.sea[field],'base64');change(bytes);s.sea[field]=bytes.toString('base64');};
  const changes=[s=>s.sea.version=2,s=>s.sea.random=-1,s=>s.sea.time=NaN,s=>s.sea.enemies='bad!',s=>s.sea.shots='AAAA',s=>s.sea.drops+='AAAA',s=>s.sea.friendly[0].vx=Infinity,s=>s.sea.friendly[0].navRoute='bad!',s=>s.sea.friendly[0].navRoute=Buffer.alloc(129*16).toString('base64'),s=>s.sea.friendly[0].navRoute=Buffer.from(new Float64Array([NaN,30]).buffer).toString('base64'),s=>s.sea.friendly.push({...s.sea.friendly[0]}),s=>s.sea.friendly[0].uid=99,s=>s.sea.nav.probeTime=-1,s=>s.sea.hazards=[{x:0,y:0,radius:80,delay:2.2,elapsed:3,damage:50}],s=>s.atSea=false,
    s=>mutateRecord(s,'enemies',b=>b.writeDoubleLE(NaN,5+2*8)),s=>mutateRecord(s,'enemies',b=>b.writeDoubleLE(1e7,5+5*8)),s=>mutateRecord(s,'enemies',b=>b.writeDoubleLE(b.readDoubleLE(5),101+5)),s=>mutateRecord(s,'shots',b=>b.writeDoubleLE(-5,5*8)),s=>s.bosses.push('widow')];
  for(const change of changes){const bad=structuredClone(s);change(bad);assert.throws(()=>new C.Game(earth,bad));}assert.deepEqual(g.snapshot(),s);
});
check('the largest battle plus all convoy tracks fits local backup and portable file budgets',()=>{
  const g=dense(),start=performance.now(),s=g.snapshot(),text=JSON.stringify(s),encoded=performance.now();const again=new C.Game(earth,JSON.parse(text)),decoded=performance.now();assert.equal(again.enemies.length,1200);assert.equal(again.bullets.length,3500);assert.equal(again.drops.length,4096);assert.equal(again.fleet.length,23);assert.deepEqual(again.snapshot(),s);
  assert.ok(Buffer.byteLength(text)<C.MAX_SAVE_BYTES);assert.ok(text.length*2*2<4*1024*1024,'primary plus backup must leave room inside a 5 MiB localStorage allowance');console.log(JSON.stringify({bytes:Buffer.byteLength(text),primaryAndBackupUTF16:text.length*4,snapshotMs:encoded-start,restoreMs:decoded-encoded}));
  const bad=structuredClone(s);bad.sea.enemies+=Buffer.alloc(101).toString('base64');assert.throws(()=>C.validate(bad));
});
console.log('Active sea persistence checks complete.');
