import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ctx={window:{}};
for(const file of['enough-data.js','enough-math.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx);
const{curves}=ctx.window.EnoughData,M=ctx.window.EnoughMath,by=id=>curves.find(c=>c.id===id),near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
assert.equal(curves.length,13);assert.equal(new Set(curves.map(c=>c.id)).size,13);
for(const c of curves){
 assert.ok(c.question&&c.fact&&c.extraction&&c.population&&c.uncertainty&&c.sources.length,c.id+' complete provenance');
 assert.equal(c.verified,'2026-10-04');assert.equal(c.reverification.researcher===c.reverification.adversary,false);
 const sources=new Set(c.sources.map(s=>s.id));for(const s of c.sources)assert.ok(s.citation&&s.location&&/^(https:\/\/|#)/.test(s.url));
 if(c.kind==='unknown'){assert.equal(c.domain,null);assert.equal(c.view.range,null);assert.equal(M.series(c).length,0);}else assert.ok(c.domain[0]<c.domain[1]&&c.defaultDose>=c.domain[0]&&c.defaultDose<=c.domain[1]);
 for(let i=0;i<c.points.length;i++){const p=c.points[i];assert.ok(Number.isFinite(p.dose)&&Number.isFinite(p.effect));if(i)assert.ok(p.dose>c.points[i-1].dose,c.id+' ordered');assert.ok(sources.has(p.source)&&p.location,c.id+' point provenance');assert.equal(p.low===null,p.high===null);if(p.low!==null)assert.ok(p.low<=p.effect+1e-10&&p.effect<=p.high+1e-10,c.id+' limits order');}
 const d=M.enough(c);if(c.view.mode==='benefit'){
  assert.ok(Number.isFinite(d));near(c.computed.enough,d);near(M.share(c,c.domain[0]),0);near(M.share(c,M.basis(c).best.dose),100);
  if(c.kind==='categories'){assert.ok(M.share(c,d)>=90);if(d>0)assert.ok(M.share(c,d-1)<90);}
  else{near(M.share(c,d),90,1e-7);assert.ok(M.share(c,d-1e-5)<90);}
  for(const p of M.series(c))assert.ok(M.share(c,p.dose)<=100+1e-9);
  for(const p of c.points)if(p.share!==null)near(p.share,M.share(c,p.dose));
 }else assert.equal(d,null,c.id+' no forced enough mark');
 assert.ok(!/hazard ratio|death rate|vs reference|counted|fitted/.test(c.question+' '+c.fact+' '+c.view.answer));
 assert.ok(!/[\u2014\p{Extended_Pictographic}]/u.test(JSON.stringify(c)),c.id+' voice rules');
}
near(M.enough(by('steps')),10500);near(M.share(by('steps'),7000),85.45454545454545);
near(M.enough(by('exercise')),342.64369150794863);near(M.share(by('exercise'),150),80.5518385314365);
for(const p of by('exercise').points)near(p.dose,p.originalDose*60/3.5,1e-9);
near(M.enough(by('protein')),.7021609887596101);near(M.estimate(by('protein'),.8),M.estimate(by('protein'),1));
near(M.enough(by('sets')),37.83125);assert.equal(by('sets').points[0].dose,0);assert.ok(M.share(by('sets'),40)<M.share(by('sets'),45));
assert.equal(M.enough(by('fruit-veg')),3);near(by('fruit-veg').points[3].sourceDose,5.3);assert.ok(M.share(by('fruit-veg'),4)<90,'Preserve produce tail dip');
near(M.enough(by('fiber')),31.857496,1e-5);near(M.estimate(by('fiber'),15),.93);
assert.equal(M.enough(by('income')),12);assert.match(by('income').points[12].label,/200,000 to \$300,000/);assert.ok(M.share(by('income'),14)<100,'Preserve highest income dip');
near(M.enough(by('savings')),73.11250116948123);near(M.estimate(by('savings'),50),16.620772445041133);
for(const p of by('savings').points){near(p.effect,M.estimate(by('savings'),p.dose));assert.ok(p.scenarioLow<=p.effect&&p.effect<=p.scenarioHigh);}
near(M.enough(by('work')),53.48014871028985);near(M.basis(by('work')).best.dose,62.907897639532315);assert.ok(M.share(by('work'),72.5)<90);assert.equal(M.sensitivity(by('work')),null);
near(M.sleepRange(by('sleep'))[0],6);near(M.sleepRange(by('sleep'))[1],7.25);assert.equal(by('meditation').points.length,0);
near(M.extraRisk(by('alcohol'),1),-4);near(M.extraRisk(by('alcohol'),2),-7);near(M.extraRisk(by('alcohol'),5),35);assert.equal(by('alcohol').points.at(-1).doseHigh,null,'Open last bin');
for(const p of by('income').points)near(p.high-p.effect,1.96*p.standardError);
near(M.extraRisk(by('smoking'),1)/M.extraRisk(by('smoking'),3),.48/1.04);
console.log('PASS13 reviewed curves, all90% crossings, range endpoints, categories, signed risk, source units, uncertainty and exact models');
