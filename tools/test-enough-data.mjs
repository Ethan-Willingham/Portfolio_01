import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ctx={window:{}};
for(const file of['enough-data.js','enough-math.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'js',file),'utf8'),ctx);
const{curves}=ctx.window.EnoughData,M=ctx.window.EnoughMath,by=id=>curves.find(c=>c.id===id),near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
assert.equal(curves.length,12);assert.equal(new Set(curves.map(c=>c.id)).size,12);
for(const c of curves){
 assert.ok(c.question&&c.fact&&c.extraction&&c.population&&c.uncertainty&&c.sources.length,c.id+' complete provenance');
 if(['steps','protein'].includes(c.id)){assert.equal(c.verified,'2026-10-05');assert.match(c.followupAudit.method,/No independent review/);}else{assert.equal(c.verified,'2026-10-04');assert.equal(c.reverification.researcher===c.reverification.adversary,false);}
 assert.equal(c.evidenceAudit.date,'2026-10-05');assert.equal(c.view.showEnough,false);const sources=new Set(c.sources.map(s=>s.id));for(const s of c.sources)assert.ok(s.citation&&s.location&&/^(https:\/\/|#)/.test(s.url));
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
const ding=ctx.window.EnoughData.supportingEvidence.steps2025;
assert.equal(M.enough(by('steps')),null);assert.equal(by('steps').computed.enough,null);assert.equal(by('steps').referenceDose,5000);assert.equal(by('steps').defaultDose,8000);
assert.equal(ding.points.length,11);near(M.enough(ding),10500);near(M.share(ding,7000),85.45454545454545);
for(const p of ding.points){assert.ok(p.low<=p.effect&&p.effect<=p.high);assert.equal(p.source,'steps-0');assert.match(p.location,/Table 2/);}
near(M.enough(by('exercise')),342.64369150794863);near(M.share(by('exercise'),150),80.5518385314365);
for(const p of by('exercise').points)near(p.dose,p.originalDose*60/3.5,1e-9);
const oldProtein=ctx.window.EnoughData.supportingEvidence.protein2018;near(M.enough(oldProtein),.7021609887596101);near(M.estimate(oldProtein,.8),M.estimate(oldProtein,1));
const protein=by('protein'),lbPerKg=2.20462262185;
assert.equal(protein.kind,'points');assert.equal(protein.model.type,'published-protein-spline');assert.equal(protein.model.panel,'Figure 2(h)');assert.equal(M.enough(protein),null);assert.equal(M.series(protein).length,111);
near(protein.guidance.low,1.4/lbPerKg);near(protein.guidance.high,2/lbPerKg);assert.equal(protein.guidance.type,'recommendation');assert.equal(protein.evidenceSummary.nunes2022.leanMassTrialsWithResistanceExercise,62);near(protein.evidenceSummary.nunes2022.effect,.22);near(protein.evidenceSummary.morton2018.effectKg,.30);assert.equal(protein.evidenceSummary.bagheri2023.completed,44);
assert.match(protein.followupAudit.cropSHA256,/^[a-f0-9]{64}$/);assert.match(protein.extraction,/No refitting.*forced plateau or extrapolation/);assert.match(protein.outcome,/not the causal effect/);
for(const p of protein.points){
 near(p.originalDose,p.dose*lbPerKg);near(p.effect,p.originalEffectKg*lbPerKg);near(p.low,p.originalLowKg*lbPerKg);near(p.high,p.originalHighKg*lbPerKg);
 assert.equal(p.source,'tagawa');assert.match(p.location,/Figure 2\(h\).*approximate figure reading/);
 for(const key of ['effect','low','high']){near(M.outcome(protein,p.dose,key),p[key]);assert.ok(p[key]>=protein.view.yScale.min&&p[key]<=protein.view.yScale.max);}
 assert.ok(p.sourcePixels.x>=300&&p.sourcePixels.x<=1200,'Inside the visible published curve');
}
near(M.estimate(protein,.3),.44*lbPerKg);near(M.estimate(protein,.6),1.07*lbPerKg);near(M.estimate(protein,.8),1.33*lbPerKg);near(M.estimate(protein,1.4),1.92*lbPerKg);
assert.ok(M.estimate(protein,1.4)>M.estimate(protein,.8),'No imposed flat high-protein segment');
assert.ok(M.estimate(protein,.74)>M.estimate(protein,.73),'No old hard stop at .73');
assert.ok(M.estimate(protein,.74)-M.estimate(protein,.73)<.08,'No old abrupt breakpoint jump');
near(M.estimate(protein,.735),(M.estimate(protein,.73)+M.estimate(protein,.74))/2);
assert.equal(M.enough(by('sets')),null);assert.equal(by('sets').computed.enough,null);assert.equal(by('sets').view.mode,'model');assert.equal(by('sets').points[0].dose,0);near(M.estimate(by('sets'),10),4.18);near(M.estimate(by('sets'),30),8.41);near(M.estimate(by('sets'),30,'low'),4.96);near(M.estimate(by('sets'),30,'high'),11.77);near(by('sets').followupAudit.contrast.effect,4.06);assert.equal(by('sets').followupAudit.counterevidence.status,'preprint');
assert.equal(M.enough(by('fruit-veg')),3);near(by('fruit-veg').points[3].sourceDose,5.3);assert.ok(M.share(by('fruit-veg'),4)<90,'Preserve produce tail dip');
near(M.estimate(by('fiber'),17),.90);near(M.estimate(by('fiber'),17,'low'),.86);near(M.estimate(by('fiber'),17,'high'),.93);assert.equal(by('fiber').evidenceSummary.yao2023.studies,14);const oldFiber=ctx.window.EnoughData.supportingEvidence.fiber2019;near(M.enough(oldFiber),31.857496,1e-5);near(M.estimate(oldFiber,15),.93);
assert.equal(M.enough(by('income')),12);assert.match(by('income').points[12].label,/200,000 to \$300,000/);assert.ok(M.share(by('income'),14)<100,'Preserve highest income dip');
near(M.enough(by('savings')),73.11250116948123);near(M.estimate(by('savings'),50),16.620772445041133);
for(const fraction of [.2,.4,.5]){let balance=0,years=0;const target=(1-fraction)/.04;while(balance<target){balance=balance*1.05+fraction;years++;}assert.equal(Math.ceil(M.estimate(by('savings'),fraction*100)),years,'Whole annual contributions reach the target');}
for(const p of by('savings').points){near(p.effect,M.estimate(by('savings'),p.dose));assert.ok(p.scenarioLow<=p.effect&&p.effect<=p.scenarioHigh);}
near(M.enough(by('work')),53.48014871028985);near(M.basis(by('work')).best.dose,62.907897639532315);assert.ok(M.share(by('work'),72.5)<90);assert.equal(M.sensitivity(by('work')),null);
assert.equal(by('work').view.range[0],0);assert.equal(by('work').domain[0],24);assert.equal(M.outcome(by('work'),0),null);assert.equal(M.outcome(by('work'),23.5),null);near(M.outcome(by('work'),24),0);assert.equal(M.series(by('work'))[0].dose,24,'Wider axis leaves unsupported work hours without estimates');
near(M.sleepRange(by('sleep'))[0],6);near(M.sleepRange(by('sleep'))[1],7.25);assert.equal(by('meditation'),undefined);assert.equal(ctx.window.EnoughData.archivedEvidence.find(c=>c.id==='meditation').points.length,0);
near(M.extraRisk(by('alcohol'),1),-4);near(M.extraRisk(by('alcohol'),2),-7);near(M.extraRisk(by('alcohol'),5),35);assert.equal(by('alcohol').points.at(-1).doseHigh,null,'Open last bin');
for(const p of by('income').points)near(p.high-p.effect,1.96*p.standardError);
near(M.extraRisk(by('smoking'),1)/M.extraRisk(by('smoking'),3),.48/1.04);
// Source-outcome presentation must never turn a chosen endpoint into 100% benefit.
near(M.outcome(ding,7000),47);near(M.outcome(ding,12000),55);near(M.outcome(ding,M.enough(ding)),49.5);
near(M.outcome(by('steps'),8200),22.139744130465356);near(M.outcome(by('steps'),10000),24.391958386053712);near(M.estimate(by('steps'),8200),.55382);near(M.estimate(by('steps'),10000),.5378);
near(M.outcome(by('exercise'),600),38.44373343584258);near(M.outcome(oldProtein,1),2.7778245035310007);
near(M.outcome(by('fruit-veg'),3),13);near(M.outcome(by('fruit-veg'),4),11);
near(M.outcome(by('fiber'),35),100*(1-.9**2.8));near(M.outcome(by('income'),13),by('income').points[13].effect);for(const p of by('income').points){near(M.outcome(by('income'),p.dose,'low'),p.low);near(M.outcome(by('income'),p.dose,'high'),p.high);}assert.equal(by('income').view.yScale.min,55);
near(M.outcome(by('savings'),50),16.620772445041133);near(M.outcome(by('work'),M.basis(by('work')).best.dose),4029.041452735495);
assert.equal(by('sets').outcome,'modeled post/pre muscle-size ratio');assert.equal(by('work').outcome,'additional factory output index');assert.equal(by('alcohol').outcome,'all-cause mortality risk');
// Raw source references stay separate from the common dated US-average comparison.
const comparisons=ctx.window.EnoughData.stepComparisons;
assert.equal(comparisons.length,2);
for(const c of comparisons){
 assert.equal(c.view.mode,'comparison');assert.equal(M.enough(c),null);assert.equal(c.domain[1],16000);
 assert.equal(c.view.range[0],0);assert.equal(c.view.plotMetric,'risk-change');assert.equal(c.view.noExtrapolation,true);
 assert.equal(M.estimate(c,0),null,'No invented zero-step estimate');assert.equal(M.outcome(c,0),null);
 assert.equal(M.estimate(c,c.domain[0]-1),null,'No endpoint clamping outside the published stroke');assert.equal(M.series(c)[0].dose,c.domain[0]);
 assert.ok(M.outcome(c,1000)<0,'Lower counts can have higher risk than the source reference');
 near(M.estimate(c,c.referenceDose),1);assert.equal(c.view.comparisonDose,6500);near(M.outcome(c,6500),0);assert.equal(c.view.displayInterval,false);assert.equal(c.view.yScale.transform,undefined);assert.ok(c.extraction.includes('figure readings'));
 assert.match(c.sourcePDFSHA256,/^[a-f0-9]{64}$/);assert.ok(c.centerlineCheckMaxRiskDifference<.01);
 for(let i=0;i<c.points.length;i++){
  const p=c.points[i];assert.ok(Number.isFinite(p.effect));assert.equal(p.source,'paluch2022');assert.match(p.location,/Figure 3/);
  if(i>1)assert.equal(p.dose-c.points[i-1].dose,250);
  if(p.dose<c.view.uncertainUntil){assert.equal(p.low,null,'Clipped source intervals must not be reconstructed');assert.equal(p.high,null);}
  else assert.ok(p.low<=p.effect&&p.effect<=p.high,'Complete interval contains estimate');
  const outcome=M.outcome(c,p.dose);near(outcome,100*(1-p.effect/M.estimate(c,6500)));assert.ok(-outcome>=c.view.yScale.min&&-outcome<=c.view.yScale.max,'Whole central curve fits the new reference scale');for(const k of ['low','high'])assert.equal(M.outcome(c,p.dose,k),null,'No fabricated contrast interval without model covariance');
 }
 assert.ok(!/[\u2014\p{Extended_Pictographic}]/u.test(JSON.stringify(c)));
}
const younger=comparisons[0],older=comparisons[1];
assert.equal(younger.referenceDose,5000);assert.equal(older.referenceDose,3000);
near(M.outcome(younger,16000),14.185294531140169);near(M.outcome(older,16000),28.16623990545598);const benchmark=ctx.window.EnoughData.walkingBenchmark;assert.equal(benchmark.dose,6500);assert.equal(benchmark.measuredMean,6540);assert.equal(benchmark.surveyYears.join('-'),'2005-2006');assert.equal(benchmark.participants,3744);
assert.ok(M.outcome(younger,16000)<M.outcome(younger,10000),'Preserve younger tail bend');
assert.ok(M.outcome(older,16000)>M.outcome(older,10000),'Preserve slowly improving older tail');
assert.equal(M.outcome(younger,16000,'high'),null,'Original source limits do not identify new contrast limits');assert.ok(M.estimate(younger,16000,'high')>1,'Preserve original source uncertainty');
near(M.outcome(ding,12000,'low'),61);near(M.outcome(ding,12000,'high'),47);
assert.equal(younger.defaultDose,8000);assert.equal(older.defaultDose,6000);assert.equal(JSON.stringify(by('steps').points),JSON.stringify(younger.points));
console.log('PASS age curves, preserved source references, dated US average, no invented contrast limits, 16,000 endpoints and no imposed cutoff');
console.log('PASS 12 topics, published protein figure and limits, separate guidance, pooled trial summaries, updated fiber slope, raw income intervals, historical models, dose groups and signed risk');
