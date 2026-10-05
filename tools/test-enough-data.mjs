import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/enough-data.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(root,'js/enough.js'),'utf8'),context);
const {curves}=context.window.EnoughData, math=context.window.EnoughMath;
assert.ok(curves.length>=14&&curves.length<=18,'14 to 18 cards');
assert.ok(context.window.EnoughData.screenedCount>=30,'At least 30 candidates screened');
assert.equal(new Set(curves.map(c=>c.id)).size,curves.length);
const allowedUnits=new Set(['g/lb/day','hours/night','USD/year','percent','min/day','hours/week','steps/day','min/week','sets/week','sessions/week','servings/day','oz/day','cigarettes/day','cups/day','drinks/week','IU/day']);
for(const c of curves){
  const prefix=c.id+': ';
  for(const field of ['question','fact','kind','shape','unit','xLabel','yLabel','extraction','evidence','population','uncertainty','verified'])assert.equal(typeof c[field],'string',prefix+field);
  assert.ok(allowedUnits.has(c.unit),prefix+'physical unit supported');
  assert.match(c.verified,/^2026-10-04$/);
  assert.ok(c.domain.length===2&&c.domain.every(Number.isFinite)&&c.domain[0]<c.domain[1],prefix+'dose domain');
  assert.ok(c.yDomain.length===2&&c.yDomain.every(Number.isFinite)&&c.yDomain[0]<c.yDomain[1],prefix+'effect domain');
  assert.ok(c.step>0&&c.defaultDose>=c.domain[0]&&c.defaultDose<=c.domain[1],prefix+'slider bounds');
  const sources=new Set(c.sources.map(s=>s.id));
  for(const s of c.sources){assert.ok(s.citation&&s.location,prefix+'source locator');assert.match(s.url,/^(https:\/\/|#)/);}
  if(c.kind==='unknown')assert.equal(c.points.length,0,prefix+'unknown is not a fabricated flat curve');
  else assert.ok(c.points.length>=2,prefix+'enough points to draw');
  for(let i=0;i<c.points.length;i++){
    const p=c.points[i];assert.ok(Number.isFinite(p.dose)&&Number.isFinite(p.effect),prefix+'finite source point');
    if(i)assert.ok(c.points[i-1].dose<p.dose,prefix+'strictly ordered coordinates');
    assert.ok(sources.has(p.source)&&p.location,prefix+'every point has a source and locator');
    assert.equal(p.low===null,p.high===null,prefix+'missing limits paired');
    if(p.low!==null)assert.ok(Number.isFinite(p.low)&&Number.isFinite(p.high)&&p.low<=p.effect&&p.effect<=p.high,prefix+'uncertainty ordering');
    if(c.kind==='categories'){assert.equal(c.coordinate,'category-index');assert.ok(p.label&&p.shortLabel,prefix+'category labels');if(c.id==='work')assert.ok(Number.isFinite(p.from)&&(p.to===null||p.to>p.from),prefix+'work category bounds');}
  }
  for(const d of c.marker.doses)assert.ok(Number.isFinite(d)&&d>=c.domain[0]&&d<=c.domain[1],prefix+'marker inside plot');
  assert.ok(c.marker.label&&c.marker.reason,prefix+'marker method');
  if(['reported','example'].includes(c.marker.type)){
    const v=c.marker.verification;assert.ok(v,prefix+'structured marker verification');
    if(v.source)assert.ok(sources.has(v.source),prefix+'marker source exists');
    let expected;
    if(v.method==='conversion')expected=v.originalDose*v.multiplier;
    else if(v.method==='source-dose'||v.method==='model-input')expected=v.dose;
    else if(v.method==='last-stored-dose')expected=c.points.at(-1).dose;
    else if(v.method==='category-label')expected=c.points.find(p=>p.label===v.label)?.dose;
    else assert.fail(prefix+'unknown marker verification');
    assert.ok(Number.isFinite(expected)&&Math.abs(expected-c.marker.doses[0])<1e-7,prefix+'marker reproduced from source claim, category or model input');
  }
  if(c.marker.type==='minimum')assert.equal(c.marker.doses[0],c.points.reduce((a,b)=>a.effect<b.effect?a:b).dose,prefix+'reproducible minimum');
  if(c.marker.type==='ninety'){assert.ok(c.ceiling?.source&&sources.has(c.ceiling.source));assert.ok(Math.abs(math.ninety(c)-c.marker.doses[0])<1e-6,prefix+'reproducible ninety percent');}
  else assert.equal(math.ninety(c),null,prefix+'no fabricated maximum or ninety percent threshold');
  const review=c.reviews;assert.ok(review&&new Set(Object.values(review)).size===3,prefix+'three independent review roles');
  const allText=[c.question,c.fact,c.marker.label].join(' ');assert.ok(!/confidence interval|hazard ratio|meta-analysis|dose-response/i.test(allText),prefix+'surface uses plain language');
  assert.ok(!/[\u2014\p{Extended_Pictographic}]/u.test(JSON.stringify(c)),prefix+'no em dashes or emoji');
}
const exercise=curves.find(c=>c.id==='exercise');for(const p of exercise.points)assert.ok(Math.abs(p.dose-p.originalDose*60/3.5)<1e-9,'Source activity units converted exactly');
const savings=curves.find(c=>c.id==='savings');for(const p of savings.points){const actual=math.estimate(savings,p.dose);assert.ok(Math.abs(actual.effect-p.effect)<1e-7,'Savings model reproduces source points');assert.ok(p.scenarioLow<=p.effect&&p.effect<=p.scenarioHigh);assert.equal(p.low,null,'Scenario envelope is not a CI');}
for(const p of curves.find(c=>c.id==='income').points)assert.ok(Math.abs((p.high-p.effect)-1.96*p.standardError)<1e-7,'Income mean limits reproduce published SE');
assert.ok(curves.filter(c=>['continues','unknown','unresolved','less'].includes(c.shape)).length>=3,'At least three visible exceptions to a universal enough point');
console.log('PASS '+curves.length+' curves, provenance, units, limits, marker methods, arithmetic, independent review roles and plain surface copy');
