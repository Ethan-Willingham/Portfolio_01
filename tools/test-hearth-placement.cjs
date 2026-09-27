// Full visible furnace placement, pointer ownership and saved upper fuel.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Reuse the bathhouse's deterministic fixture without running its full suite.
const bathTests=fs.readFileSync('tools/test-bathhouse.cjs','utf8');
const fixtureEnd=bathTests.indexOf('function loadBoiler(s)');
assert(fixtureEnd>0,'shared bath fixture boundary exists');
const makeFixture=Function('require',bathTests.slice(0,fixtureEnd)+'\nreturn fixture;')(require);
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
function fixture(){
  const {s}=makeFixture();
  vm.runInContext(fs.readFileSync('js/sluice/078-hearth-casing.js','utf8'),s);
  s.bathMode=true;s.bathCamPin();s.hearthButtons=[];
  const layout=s.hearthRoomLayout();return {s,layout};
}
function findUpper(s,side,body){
  for(let y=s.hearthChamberCeiling+40;y<s.HEARTH_TOP-30;y+=8)
    for(let x=side==='left'?20:876;side==='left'?x<380:x>516;x+=side==='left'?8:-8){
      if(body){const ox=body.x,oy=body.y;body.x=x;body.y=y;const fits=s.hearthChamberBodyContains(body);body.x=ox;body.y=oy;if(fits)return {x,y};}
      else if(s.hearthPlacementValid({x,y}))return {x,y};
    }
  assert.fail('upper '+side+' pocket has room for the complete fuel hull');
}
function eventAt(s,layout,p,id,touch=false){
  return {pointerId:id,button:0,pointerType:touch?'touch':'mouse',
    clientX:layout.box.x+p.x*layout.box.w/s.HEARTH_WIDTH-(touch?0:14),
    clientY:layout.box.y+(p.y-s.HEARTH_TOP)*layout.box.h/s.HEARTH_HEIGHT+(touch?0:16)};
}
{
  for(const side of ['left','right'])for(const touch of [false,true]){
    const {s,layout}=fixture();s.forgeGive('coal',2);
    const p=findUpper(s,side),e=eventAt(s,layout,p,7,touch),preview=s.hearthHandPreview();
    let toolCalls=0;s.bathToolPointerDown=()=>{toolCalls++;return false;};
    assert(s.hearthPointerDown(e));assert.equal(s.hearthPress.action,'place');
    assert.equal(toolCalls,0,'fuel placement owns the upper cavity before bath tools');
    assert.equal(s.forgeCount('coal'),2,'preview press does not spend stock');
    assert(s.hearthPointerUp(e));assert.equal(s.forgeCount('coal'),1);
    const b=s.hearthBeds.boiler.chunks[0];assert(b);near(b.x,p.x);near(b.y,p.y);
    near(b.seed,preview.seed);assert.equal(JSON.stringify(b.shape),JSON.stringify(preview.shape));
    const saved=s.hearthSave();s.hearthRestore(saved);const restored=s.hearthBeds.boiler.chunks[0];
    near(restored.x,p.x);near(restored.y,p.y);near(restored.fuel,b.fuel);
    for(let i=0;i<180;i++){s.hearthStepBed(s.hearthBeds.boiler);assert(s.hearthChamberBodyContains(restored,.5),'falling fuel stays outside copper and inside ironwork');}
    assert(restored.y>p.y+70,'upper fuel falls naturally into the bed');
  }
  console.log('PASS upper side pockets: mouse/touch ownership, exact ghost realization, inventory, save and physical fall');
}
{
  for(const touch of [false,true]){
    const {s,layout}=fixture(),bed=s.hearthBeds.boiler,p={x:448,y:100};s.forgeGive('coal',22);
    for(let i=0;i<20;i++){
      const preview=s.hearthHandPreview(),shape=JSON.stringify(preview.shape),e=eventAt(s,layout,p,i+20,touch);
      assert(s.hearthPlacementValid(p),'a coal under the cursor does not block the next drop');
      assert(s.hearthPointerDown(e));assert(s.hearthPointerUp(e));
      const body=bed.chunks[bed.chunks.length-1];near(body.x,p.x);near(body.y,p.y);
      assert.equal(JSON.stringify(body.shape),shape,'rapid drops retain their exact preview hull');
    }
    assert.equal(bed.chunks.length,20,'every rapid click creates a physical piece');
    assert.equal(s.forgeCount('coal'),2,'each successful overlapping drop spends one fuel');
    for(let i=0;i<360;i++)s.hearthStepBed(bed);
    for(const body of bed.chunks){
      assert([body.x,body.y,body.vx,body.vy,body.spin].every(Number.isFinite));
      assert(s.hearthChamberBodyContains(body,.5),'the separated pile stays within the bowl');
    }
    const contacts=s.hearthContacts(bed,0);
    assert(contacts.every(c=>c.points.every(p=>p.depth<.15)),'solver separates a fully overlapping pile to contact tolerance');
  }
  console.log('PASS twenty immediate mouse/touch drops at the same point, exact previews, inventory and stable separation');
}
{
  const {s,layout}=fixture();s.forgeGive('coal',2);
  const p=findUpper(s,'left'),e=eventAt(s,layout,p,8,true);
  s.hearthPointerDown(e);s.hearthCancelDrag();assert.equal(s.forgeCount('coal'),2);
  s.hearthPointerDown(e);s.hearthPointerUp(e);const b=s.hearthBeds.boiler.chunks[0];
  s.hearthRoomAction('hand');
  assert(s.hearthPointerDown(e));assert(s.hearthDrag);
  const target=findUpper(s,'right',b),release=eventAt(s,layout,target,8,true);
  s.hearthPointerMove(release);s.hearthPointerUp(release);near(b.x,target.x);near(b.y,target.y);
  assert(s.hearthChamberBodyContains(b,.5),'upper hand release fits the same cavity');
  s.hearthPointerDown(release);s.hearthPointerUp({pointerId:8,clientX:0,clientY:740});
  assert.equal(s.forgeCount('coal'),2);assert.equal(s.hearthBeds.boiler.chunks.length,0);
  console.log('PASS cancellation spends nothing and upper hand release has no rectangular clamps or duplicate refund');
}
{
  const {s,layout}=fixture(),profile=s.hearthCasingProfile(layout.box,true);
  const roof=profile.roof.map(p=>[(p[0]-layout.box.x)*s.HEARTH_WIDTH/layout.box.w,s.HEARTH_TOP+(p[1]-layout.box.y)*s.HEARTH_HEIGHT/layout.box.h]);
  function roofAt(x){for(let i=1;i<roof.length;i++)if(x>=roof[i][0]&&x<=roof[i-1][0]){const a=roof[i],b=roof[i-1];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}assert.fail('roof span');}
  const center=448,r=40,peak=roofAt(center),ends=Math.max(roofAt(center-r),roofAt(center+r)),top=(peak+ends)/2;
  const b={id:99,seed:.5,r,baseR:r,x:center,y:top+1,angle:0,shape:[[-1,-.025],[1,-.025],[1,.025],[-1,.025]]};
  assert(s.hearthWorldHull(b).every(p=>s.hearthChamberContains(p[0],p[1])),'all hull corners are outside the copper');
  assert(!s.hearthChamberBodyContains(b),'the crossing face still cannot cut through the copper roof');
  s.forgeGive('coal',1);assert.equal(s.hearthDropMaterial('boiler',center,peak-50,'coal'),null);assert.equal(s.forgeCount('coal'),1);
  console.log('PASS copper roof checks include crossing hull faces; invalid placement never spends inventory');
}
{
  const {s,layout}=fixture();s.forgeGive('coal',1);
  const p=findUpper(s,'left');assert(s.hearthPlaceSelected({x:eventAt(s,layout,p,1,true).clientX,y:eventAt(s,layout,p,1,true).clientY},true));
  // A small saved fragment can sit in the side wing outside the lower x range.
  const b=s.hearthBeds.boiler.chunks[0];b.x=-7;b.y=-245;b.r=b.baseR=3;b.shape=[[-1,-1],[1,-1],[1,1],[-1,1]];
  s.hearthHullCache.delete(b);s.hearthMass(b);assert(s.hearthChamberBodyContains(b));
  s.hearthBeds.boiler.ash.push({x:-7,y:-230,vx:0,vy:0,kg:.0001,heat:0,seed:.5});
  const saved=JSON.parse(JSON.stringify(s.hearthSave())),fresh=makeFixture().s;
  // No casing or layout exists yet, as when loading before entering the bath.
  fresh.hearthRestore(saved);near(fresh.hearthBeds.boiler.chunks[0].x,-7);near(fresh.hearthBeds.boiler.chunks[0].y,-245);
  near(fresh.hearthBeds.boiler.ash[0].x,-7);near(fresh.hearthBeds.boiler.ash[0].y,-230);
  fresh.hearthStepBed(fresh.hearthBeds.boiler);near(fresh.hearthBeds.boiler.chunks[0].x,-7);
  assert(fresh.hearthBeds.boiler.chunks[0].y>-245,'offscreen fuel falls without teleporting to a rectangular wall');
  console.log('PASS pre-entry restore preserves fuel and ash in the full side wings');
}
