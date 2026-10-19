/* Route, physical clearance and recoverability at the authored metre scale. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
global.WidewakeBattle=require('../../js/widewake-battle-core.js');const B=WidewakeBattle,E=require('../../js/widewake-estuary-core.js');
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-estuary');fs.mkdirSync(out,{recursive:true});const field=new E.Field(),reports=[];
const check=s=>console.log('PASS '+s);
function voyage(nav,to){const plan=nav.plan(to);assert.ok(plan,to+' has a route for '+nav.player.type);assert.ok(nav.setCourse(plan));let ticks=0;const start=nav.distance,at=performance.now();
  while(!nav.arrived&&ticks++<65000){nav.step(1/60);assert.equal(nav.contact,'','route contacts bank at '+nav.player.x+','+nav.player.y);if(ticks%60===0)assert.ok(field.clearance(nav.player)>=.12);}
  assert.equal(nav.arrived?.id,to);reports.push({type:nav.player.type,to,route:plan.name,plannedMetres:plan.distance,sailedMetres:nav.distance-start,seconds:ticks/60,cpuMs:performance.now()-at});return plan;
}
for(const type of Object.keys(E.vessels)){const n=new E.Navigation({field,type});if(type==='launch'){voyage(n,'reeds');voyage(n,'mill');}else{assert.equal(n.plan('reeds'),null);voyage(n,'mill');}voyage(n,'yard');}
const launch=new E.Navigation({field}),large=new E.Navigation({field,type:'oilrig'}),short=launch.plan('mill'),long=large.plan('mill');assert.equal(short.name,'Reed cut');assert.equal(long.name,'Main channel');assert.ok(long.distance-short.distance>1000);check('all three hulls make their permitted round trips; the launch retains a meaningful shallow shortcut');

// Drive the industrial rectangle directly at the yard bank. Its centre must stop
// before its outer hull corners enter forbidden depth, then reverse out normally.
const collision=new E.Navigation({field,type:'oilrig'});for(let i=0;i<1800&&!collision.contact;i++)collision.step(1/60,{x:-1,y:0});assert.ok(collision.contact);assert.ok(field.clearance(collision.player)>=.12);const struck={...collision.player};
for(let i=0;i<180;i++){collision.step(1/60,{x:0,y:0,reverse:true});assert.ok(field.clearance(collision.player)>=.12);}
assert.ok(Math.hypot(collision.player.x-struck.x,collision.player.y-struck.y)>8);assert.ok(collision.player.vx*Math.cos(collision.player.angle)+collision.player.vy*Math.sin(collision.player.angle)<0);
check('full industrial hull stops before the bank, remains in legal water and can reverse away');

const rescue=new E.Navigation({field,type:'gunboat'});for(let i=0;i<1800&&!rescue.contact;i++)rescue.step(1/60,{x:-1,y:0});assert.ok(rescue.contact);assert.ok(rescue.tow());let maxTowStep=0;
for(let i=0;i<5000&&rescue.towing;i++){const x=rescue.player.x,y=rescue.player.y;rescue.step(1/60);maxTowStep=Math.max(maxTowStep,Math.hypot(rescue.player.x-x,rescue.player.y-y));assert.ok(field.clearance(rescue.player)>=.119);}
assert.equal(rescue.towing,false);assert.ok(rescue.towDistance>10);assert.ok(maxTowStep<=.100001);check('tow follows the actual safe history at six metres per second without crossing a bank');

const pier=new E.Navigation({field,type:'launch'});for(let i=0;i<1800&&!pier.contact;i++)pier.step(1/60,{x:0,y:-1});assert.equal(pier.contact,'Pier ahead');assert.equal(field.obstruction(pier.player),false);assert.ok(pier.tow());for(let i=0;i<1500&&pier.towing;i++){pier.step(1/60);assert.equal(field.obstruction(pier.player),false);}assert.equal(pier.towing,false);check('pier footprints block the full hull and tow recovery never crosses their posts');

const blocked=new E.Navigation({field,type:'oilrig'}),cut=field.paths.find(p=>p.id==='cut').points[45];assert.ok(field.sample(cut.x,cut.y).depth<blocked.player.draft);assert.ok(field.clearance(blocked.player,cut.x,cut.y,0)<0);
const upper=field.sample(100,-5100),mouth=field.sample(450,1100),open=field.sample(400,2500);assert.equal(upper.salinity,0);assert.ok(mouth.salinity>upper.salinity&&open.salinity>mouth.salinity);assert.ok(Math.hypot(upper.currentX,upper.currentY)>.5);
// Verify the conservative circle acceptance against a dense independent hull
// sample at many poses, including narrow-channel shoulders and tile edges.
let poses=0;for(const type of Object.keys(E.vessels))for(const path of field.paths)for(let i=0;i<path.points.length;i+=11){const p=path.points[i],s={...E.vessels[type],x:p.x+13,y:p.y-12,angle:(i*.7)%6.28},fast=field.clearance(s);if(fast<.12)continue;let minimum=Infinity;const co=Math.cos(s.angle),si=Math.sin(s.angle);for(let x=-s.length/2;x<=s.length/2+.001;x+=Math.min(1,s.length))for(let y=-s.width/2;y<=s.width/2+.001;y+=Math.min(1,s.width))minimum=Math.min(minimum,field.sample(s.x+x*co-y*si,s.y+x*si+y*co).depth-s.draft);assert.ok(minimum>=.119);poses++;}
check('draft, salinity and current share the authored field; fast acceptance agrees with dense hull samples');
const report={reports,shortcutSaving:long.distance-short.distance,verifiedPoses:poses,maxTowStep,fieldSegments:field.segments.length};fs.writeFileSync(path.join(out,'estuary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
