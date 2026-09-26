// Fuel inventory and per-material state, without rendering or external packages.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function fixture() {
  const s = { console, Math, cargo: [], ENABLE_BATH:true, devMode:false,
    cargoType: u => typeof u === 'string' ? u : u.type, cargoShiny:u=>!!u?.shiny,
    showMsg(){}, saveNow(){}, sfxPlay(){} };
  vm.createContext(s);
  for(const file of ['077-hearth-materials','077-hearth-combustion','077-hearth-fracture','077-hearth-geometry','077-hearth-physics','079-forge-resources'])
    vm.runInContext(fs.readFileSync('js/sluice/'+file+'.js','utf8'),s);
  return s;
}
const near=(a,b,t=1e-9)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
{
  const s=fixture();s.cargo=['coal','copper','amber','methaneice','sulfur','malachite',{type:'amber',shiny:true}];
  s.forgeStockCargo();assert.equal(s.forgeStock.coal,1);assert.equal(s.cargo.length,6,'only ordinary coal is automatically reserved');
  for(const type of s.HEARTH_MATERIAL_ORDER){
    const before=s.forgeCount(type), preview=s.hearthFuelPreview(type);
    assert.equal(s.forgeCount(type),before,'preview spends nothing');
    const b=s.hearthDropMaterial('boiler',448,50,type,preview);
    assert(b && b.material===type);assert.equal(s.forgeCount(type),before-1);
    assert.equal(JSON.stringify(b.shape),JSON.stringify(preview.shape));near(b.seed,preview.seed);near(b.r,preview.r);near(b.angle,preview.angle);
  }
  assert.equal(s.cargo.length,1);assert(s.cargo[0].shiny,'valuable shiny variants are never burned implicitly');
  assert.equal(s.hearthDropMaterial('boiler',448,50,'amber'),null,'out-of-stock drop cannot fabricate fuel');
  s.forgeGive('sulfur',1);while(s.hearthBeds.boiler.chunks.length<32)s.hearthAddChunk('boiler',448,0);
  assert.equal(s.hearthDropMaterial('boiler',448,0,'sulfur'),null);assert.equal(s.forgeCount('sulfur'),1,'full bed cannot spend stock');
  s.hearthRemoveChunk('boiler',s.hearthBeds.boiler.chunks[0].id);
  assert.equal(s.hearthDropMaterial('boiler','448',0,'sulfur'),null);assert.equal(s.forgeCount('sulfur'),1,'malformed coordinates cannot spend stock');
  console.log('PASS six existing materials, exact preview realization, atomic inventory and shiny preservation');
}
{
  const s=fixture(), bed=s.hearthBeds.boiler;
  const copper=s.hearthAddChunk('boiler',300,140,'copper'), coal=s.hearthAddChunk('boiler',445,140), far=s.hearthAddChunk('boiler',590,140);
  assert.equal(s.hearthIgniteAt('boiler',copper.x,copper.y,1),false,'additive is not a fuel');
  assert.equal(s.hearthIgniteAt('boiler',coal.x,coal.y,.1),false,'gentle movement is not a spark strike');
  assert.equal(s.hearthIgniteAt('boiler',coal.x,coal.y,1),true);assert(!far.lit,'targeted strike does not auto-light a pocket');
  for(let i=0;i<120;i++)s.hearthTick(1/120);
  assert.equal(copper.fuel,0);assert(!copper.ash && !copper.lit && copper.reaction===0);near(copper.r,copper.baseR);
  assert(bed.thermalKW>0,'real reactions expose available energy to bath thermal model');
  const bad=s.hearthSave();bad.boiler.chunks[0].fuel=1;bad.boiler.chunks[0].carbon=1;bad.boiler.chunks[0].lit=true;bad.boiler.chunks[0].ash=true;bad.boiler.chunks[0].stage='flaming';bad.boiler.chunks[0].flame=1;bad.boiler.chunks[0].reaction=1;
  s.hearthRestore(bad);const restored=s.hearthBeds.boiler.chunks[0];assert.equal(restored.fuel,0);assert(!restored.lit && !restored.ash && restored.reaction===0 && restored.flame===0 && restored.stage==='additive');
  console.log('PASS manual targeted ignition and noncombustible additives retain mass without heat generation');
}
{
  const results={};
  for(const id of ['coal','methaneice','amber','sulfur']){
    const s=fixture(),bed=s.hearthBeds.boiler,b=s.hearthAddChunk('boiler',448,150,id);
    b.generation=2;b.moisture=0;s.hearthLightChunk(bed,b);let energy=0;
    for(let i=0;i<5*120;i++){s.hearthTick(1/120);energy+=bed.thermalKW/120;}
    results[id]={used:1-b.fuel,energy,life:b.life};
    const saved=JSON.stringify(s.hearthSave());s.hearthRestore(JSON.parse(saved));assert.equal(JSON.stringify(s.hearthSave()),saved,'every material survives exact save round trip');
    const body=s.hearthBeds.boiler.chunks[0],mass=body.dryKg*s.hearthMaterial(id).residue;
    body.fuel=body.volatile=body.carbon=0;body.ash=true;s.hearthFractureStep(s.hearthBeds.boiler,1/30);near(s.hearthAshMass(s.hearthBeds.boiler),mass);
  }
  assert(results.methaneice.used>results.coal.used*2 && results.amber.used>results.coal.used,'existing fuels have distinct actual burn speeds');
  assert(results.methaneice.energy>results.coal.energy && results.sulfur.energy<results.coal.energy,'hotter and cooler fuels transfer different real energy');
  console.log('PASS finite material-dependent combustion, heat output, residue and save persistence',results);
}
{
  const s=fixture();for(const id of s.HEARTH_MATERIAL_ORDER)s.forgeGive(id,3);
  const saved=JSON.stringify(s.forgeResourcesSave());s.forgeResourcesReset();s.forgeResourcesRestore(JSON.parse(saved));assert.equal(JSON.stringify(s.forgeResourcesSave()),saved);
  s.forgeResourcesRestore({stock:{coal:5,iron:9,flint:2,steel:0},stoneSinceFlint:3});assert.equal(s.forgeCount('iron'),9);assert.equal(s.forgeCount('coal'),5);assert.equal(s.forgeCount('steel'),1);
  for(const id of ['methaneice','amber','sulfur','copper','malachite'])assert.equal(s.forgeCount(id),0);
  console.log('PASS material stock persistence and old supply migration preserves retired forge iron');
}

{
  const s=fixture(),bed=s.hearthBeds.boiler,b=s.hearthAddChunk('boiler',448,165);
  b.heat=.8;b.core=.7;b.thermalSolidKJ=0;b.thermalGasKJ=0;
  const h=1/30;let generated=0,captured=0,vented=0;
  for(let i=0;i<300;i++){
    const gas=i<100?.000005:0,carbon=i<100?.000003:0;
    generated+=gas*26000+carbon*32000;
    s.hearthCpuCapture(bed,b,h,gas,carbon,s.hearthMaterial('coal'));
    captured+=b.thermalKW*h;vented+=b.thermalVentedKJ;
  }
  near(generated,captured+vented+b.thermalSolidKJ+b.thermalGasKJ,1e-9);
  assert(captured>0 && captured<generated*.3,'captured vessel heat excludes vented energy');
  b.thermalSolidKJ=b.thermalGasKJ=0;s.hearthCpuCapture(bed,b,h,0,0,s.hearthMaterial('coal'));
  assert.equal(b.thermalKW,0,'a hot visual state cannot create heat without a real energy reservoir');
  console.log('PASS CPU generated = captured + vented + stored energy, no unbacked heat');
}

{
  const s=fixture(),bed=s.hearthBeds.boiler;
  for(const id of ['copper','malachite']) {
    const b=s.hearthAddChunk('boiler',id==='copper'?370:530,150,id),mass=b.massRef,radius=b.baseR;
    near(1/b.invMass,mass);b.heat=.9;b.core=.7;
    for(let i=0;i<240;i++)s.hearthTick(1/120);
    assert(bed.chunks.includes(b) && !b.ash && b.fuel===0 && !b.lit);
    near(1/b.invMass,mass);near(b.r,radius);
  }
  const saved=JSON.stringify(s.hearthSave());s.hearthRestore(JSON.parse(saved));assert.equal(JSON.stringify(s.hearthSave()),saved);
  for(const b of s.hearthBeds.boiler.chunks){near(1/b.invMass,b.massRef);assert(b.material==='copper'||b.material==='malachite');}
  console.log('PASS additive bodies retain full collision mass, radius and identity through heating and reload');
}

{
  const s=fixture();function square(x,id){const b=s.hearthAddChunk('boiler',x,150,id);b.x=x;b.y=150;b.r=b.baseR=28;b.angle=0;b.shape=[[-1,-.5],[1,-.5],[1,.5],[-1,.5]];s.hearthHullCache.delete(b);s.hearthMass(b);s.hearthWorldHull(b);return b;}
  const coal=square(420,'coal'),copper=square(476,'copper');
  assert(s.hearthInside(copper,453,150,2) && !s.hearthInside(coal,453,150,2));
  assert.equal(s.hearthIgniteAt('boiler',453,150,1,copper),false);assert(!coal.lit,'a spark cannot light nearby fuel through a struck additive');
  assert.equal(s.hearthIgniteAt('boiler',425,150,1,coal),true);assert(coal.lit);
  console.log('PASS exact spark target preserves blocking mineral contacts');
}
