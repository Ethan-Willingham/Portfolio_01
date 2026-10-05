(() => {
'use strict';
const data=window.EnoughData,M=window.EnoughMath;if(!data||!M)return;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=0)=>(Math.abs(n)<.5*10**(-d)?0:Number(n)).toLocaleString('en-US',{maximumFractionDigits:d});
const curves=new Map(data.curves.map(c=>[c.id,c])),states=new Map();
const params=new URLSearchParams(location.search),walkingCurves=new Map(data.stepComparisons.map(c=>[c.id,c])),walkingDoses=new Map(data.stepComparisons.map(c=>[c.id,c.defaultDose])),walkingViews=[];
let walkingAge=params.get('steps-age')==='older'?'steps-older':'steps-younger';
const groups=[
 ['move','Move','The first steps count.',['steps','exercise']],
 ['lift','Lift','Protein and training volume.',['protein','sets']],
 ['rest','Rest','A low point, with room for your own needs.',['sleep']],
 ['eat','Eat','More plants. More fiber.',['fruit-veg','fiber']],
 ['money','Money','Income and savings answer different questions.',['income','savings']],
 ['work','Work','Hours and output part ways.',['work']],
 ['harm','Where enough is zero','A little can carry a lot of risk.',['alcohol','smoking']]
];
const xLabels={'steps-younger':'Steps/day','steps-older':'Steps/day',steps:'Steps/day',exercise:'Exercise, minutes/week',protein:'Protein, g/lb/day',sets:'Sets/muscle/week',sleep:'Sleep, hours/night','fruit-veg':'Fruit and veg, servings/day',fiber:'Fiber, grams/day',income:'Household income, $/year',savings:'Take-home pay saved, %',work:'Work, hours/week',alcohol:'US drinks/week (groups)',smoking:'Cigarettes/day'};
const outcomeScales={
 steps:{max:70,ticks:[0,20,40,60],label:'Lower risk of dying, %'},
 exercise:{max:50,ticks:[0,10,20,30,40,50],label:'Lower risk of dying, %'},
 'fruit-veg':{max:20,ticks:[0,10,20],label:'Lower risk of dying, %'},
 fiber:{max:40,ticks:[0,10,20,30,40],label:'Lower risk of dying, %'},
 income:{max:5,ticks:[0,1,2,3,4,5],label:'Feeling-score increase, points'},
 savings:{max:110,ticks:[0,50,100],label:'Years to savings target (model)'},
 work:{max:4500,ticks:[0,1500,3000,4500],label:'Added factory output, index units'}
};
const modelKey=c=>`<p class="enough-model-key"><span aria-hidden="true"></span>${esc(c.view.modelLabel||'Study model')}</p>`;
const shape=c=>c.view.shape||({benefit:'Most arrives early',sweet:'A sweet spot',harm:'Less is better',model:'Uncertain ceiling'}[c.view.mode]);
function amount(c,d){
 if(c.kind==='categories')return c.points[Math.round(d)].label;
 if(c.id==='protein')return fmt(d,2)+' grams per pound';
 if(c.id==='sets')return fmt(d)+' weekly sets per muscle';
 if(c.id==='savings')return 'Saving '+fmt(d)+'%';
 if(c.id==='steps'||c.view.mode==='comparison')return fmt(d)+' steps a day';
 if(c.id==='exercise')return fmt(d)+' minutes a week';
 if(c.id==='fiber')return fmt(d,1)+' grams a day';
 if(c.id==='sleep')return fmt(d,1)+' hours a night';
 if(c.id==='work')return fmt(d,1)+' hours a week';
 return fmt(d)+' minutes a day';
}
function readout(c,d){
 const a=amount(c,d),value=M.outcome(c,d);
 if(c.kind==='guidance')return `${fmt(d,2)} g/lb/day: ${d<c.guidance.low?'below':d>c.guidance.high?'above':'within'} the published intake guide. An exact growth cutoff is unknown.`;
 if(c.view.mode==='comparison')return `${a}: about ${fmt(value)}% lower risk of dying compared with ${fmt(c.referenceDose)} steps a day, in ${c.title.toLowerCase()}.`;
 if(c.id==='sets')return `${a}: ${fmt(value,1)}% modeled difference from no training (${fmt(M.estimate(c,d,'low'),1)} to ${fmt(M.estimate(c,d,'high'),1)}%).`;
 if(c.id==='sleep')return `${a}: ${Math.abs(value)<.5?'near this curve’s low point':fmt(value)+'% higher risk of dying than the low point'}.`;
 if(c.id==='smoking')return d===0?'Never smoking is the baseline.':`${a}: ${fmt(value)}% extra heart disease risk in men.`;
 if(c.id==='alcohol')return d===0?'Lifetime nondrinkers are the baseline.':`${a}: ${fmt(Math.abs(value))}% ${value<0?'lower':'higher'} estimated risk of dying.${d<3?' Uncertainty includes no difference.':''}`;
 if(c.id==='savings')return `${a}: about ${fmt(value,1)} years to the target, under these assumptions.`;
 if(c.id==='work')return `${a}: ${fmt(value)} added output-index units above a 24-hour week in this factory model.`;
 if(c.id==='income')return `${a}: average feeling score ${fmt(value,1)} out of 100.`;
 const baseline={steps:'2,000 steps a day',exercise:'no exercise','fruit-veg':'2.1 servings a day',fiber:'7 grams a day'}[c.id];
 const dose=c.id==='fruit-veg'?`About ${fmt(c.points[d].sourceDose,1)} servings a day`:a;
 return `${dose}: ${fmt(value,1)}% lower risk of dying compared with ${baseline}, in ${c.id==='fiber'?'this model':'these studies'}.`;
}
function physical(c,d){return c.kind==='categories'&&c.id!=='alcohol'?c.points[Math.round(d)].sourceDose:d;}
function geometry(width,overview=false,longer=false){
 const w=Math.max(180,width),h=overview?(longer?(w<500?200:240):(w<500?170:212)):220,L=42,R=12,T=30,B=56;
 return {w,h,L,R,T,B,pw:w-L-R,ph:h-T-B};
}
function intakeGuide(c,width,d,overview){
 const {w,h,L,R,T,B,pw}=geometry(width,overview),[min,max]=c.view.range,x=v=>L+(v-min)/(max-min)*pw,mid=(h+T-B)/2;
 return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><text class="en-guidance-label" x="${L}" y="15">Published intake guide</text><rect class="en-intake-band" x="${x(c.guidance.low)}" y="${mid-22}" width="${x(c.guidance.high)-x(c.guidance.low)}" height="44" rx="4"/><line class="en-axis" x1="${L}" x2="${w-R}" y1="${mid}" y2="${mid}"/><text x="${x((c.guidance.low+c.guidance.high)/2)}" y="${mid-31}" text-anchor="middle">0.64 to 0.91</text><line class="en-selection" x1="${x(d)}" x2="${x(d)}" y1="${mid-21}" y2="${mid+21}"/><circle class="en-dot" cx="${x(d)}" cy="${mid}" r="6"/>${c.ticks.map(v=>`<text x="${x(v)}" y="${h-B+21}" text-anchor="${v===min?'start':v===max?'end':'middle'}">${fmt(v,1)}</text>`).join('')}<text class="en-x-label" x="${L+pw/2}" y="${h-5}" text-anchor="middle">Protein, g/lb/day</text></svg>`;
}
function chart(c,width,d,overview=false){
 if(c.kind==='guidance')return intakeGuide(c,width,d,overview);
 const {w,h,L,R,T,B,pw,ph}=geometry(width,overview,c.view.mode==='comparison'),[min,max]=c.view.range;
 const pMin=physical(c,min),pMax=physical(c,max),x=v=>L+(physical(c,v)-pMin)/(pMax-pMin)*pw;
 const mode=c.view.mode,modelLine=c.view.lineStyle==='dashed',curveClass='en-curve'+(modelLine?' en-model':''),scale=c.view.yScale||outcomeScales[c.id],minY=scale?.min??(mode==='harm'&&c.id==='alcohol'?-20:0);
 const maxY=scale?scale.max:mode==='harm'?(c.id==='smoking'?130:50):mode==='sweet'?60:16;
 const y=v=>T+(maxY-v)/(maxY-minY)*ph;
 const value=(v,key='effect')=>M.outcome(c,v,key);
 const ps=c.kind==='categories'?c.points.map(p=>p.dose):M.series(c).map(p=>p.dose);
 const path=(values,key='effect')=>values.map((v,i)=>`${i?'L':'M'}${x(v).toFixed(2)},${y(value(v,key)).toFixed(2)}`).join(' ');
 const selected=M.clamp(d,min,max),point=value(selected);
 const baseY=y(0),line=path(ps);
 const tickValues=w<500&&c.id==='income'?[0,12,14]:w<500&&c.id==='smoking'?[0,2,3]:w<500&&c.id==='alcohol'?[0,2,5]:c.ticks;
 const ticks=tickValues.map(v=>{const label=c.kind==='categories'?c.points[v].shortLabel:c.id==='protein'?fmt(v,2):fmt(v,1);return `<text x="${x(v)}" y="${h-B+21}" text-anchor="${v===min?'start':v===max?'end':'middle'}">${esc(label)}</text>`;}).join('');
 const yticks=scale?scale.ticks:mode==='sweet'?[0,30,60]:mode==='model'?[0,5,10,15]:c.id==='alcohol'?[-10,0,20,40]:[0,50,100];
 const hasInterval=ps.every(v=>Number.isFinite(M.estimate(c,v,'low'))&&Number.isFinite(M.estimate(c,v,'high'))),scenario=c.id==='savings';
 const band=c.kind!=='categories'&&(hasInterval||scenario)?`<path class="en-uncertainty${scenario?' en-scenario':''}" d="${path(ps,scenario?'scenarioLow':'low')} ${path([...ps].reverse(),scenario?'scenarioHigh':'high').replace(/^M/,'L')} Z"/>`:'';
 const dots=c.kind==='categories'?ps.map(v=>`${hasInterval?`<path class="en-whisker" d="M${x(v)},${y(value(v,'low'))}V${y(value(v,'high'))} M${x(v)-4},${y(value(v,'low'))}h8 M${x(v)-4},${y(value(v,'high'))}h8"/>`:''}<circle cx="${x(v)}" cy="${y(value(v))}" r="3" fill="var(--area)"/>`).join(''):'';
 const sparse=c.view.sparseFrom?`<rect class="en-sparse" x="${x(c.view.sparseFrom)}" y="${T}" width="${x(max)-x(c.view.sparseFrom)}" height="${ph}"/>`:'';
 const openingAxes={steps:'Lower risk than at 2,000 steps, %',exercise:'Lower risk than no exercise, %',protein:'Published intake guide'};
 const yLabel=overview?(mode==='comparison'?`Lower risk than at ${fmt(c.referenceDose)} steps, %`:openingAxes[c.id]):scale?scale.label:mode==='model'?'Model difference vs no training, %':mode==='sweet'?'Extra risk of dying, %':c.id==='smoking'?'Extra heart disease risk, %':'Extra risk of dying, %';
 return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><text class="en-y-label" x="${L}" y="15">${yLabel}</text>${yticks.map(v=>`<line class="en-grid" x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}"/><text class="en-y-tick" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}${sparse}${band}<line class="en-axis" x1="${L}" x2="${w-R}" y1="${c.id==='income'?y(minY):baseY}" y2="${c.id==='income'?y(minY):baseY}"/>${c.kind==='categories'?'':`<path class="${curveClass}" d="${line}"/>`}${dots}<line class="en-selection" x1="${x(selected)}" x2="${x(selected)}" y1="${T}" y2="${T+ph}"/><circle class="en-dot" cx="${x(selected)}" cy="${y(point)}" r="6"/>${ticks}<text class="en-x-label" x="${L+pw/2}" y="${h-5}" text-anchor="middle">${xLabels[c.id]}</text></svg>${modelLine?modelKey(c):''}`;
}
// Keep the on-page evidence brief. Full extraction, tables and caveats remain in the data file.
const evidence={
 steps:[['paluch2022','Paluch 2022'],['Age-group curves from observed habits, with 95% confidence bands. Higher counts are sparse; a flatter region is not an exact cutoff. A newer 14-study mortality review also found large gains at modest step counts.','US guidelines don’t require 10,000 steps. They use weekly activity minutes and strength training. Different studies use different baselines; their percentages cannot be combined.'],['steps-new-review','Ding 2025'],[['guidelines','US guidelines']]],
 exercise:[['activity-0','Garcia 2023'],['This large review follows observed activity and mortality, with 95% confidence bands. It cannot prove that adding a given number of minutes causes the plotted benefit.','The headline is US guidance, not an optimum calculated from the chart endpoint. Minutes mean moderate exercise; count a vigorous minute as two. The source continues beyond the displayed 600 minutes.'],['guidelines','US guidelines']],
 protein:[['nunes2022','Nunes 2022'],['Across 62 lifting trials, added protein produced a small extra lean-mass gain. Intake groups came from different studies, so they cannot locate an exact daily cutoff. Lean mass includes water.','The band is sports nutrition guidance, not a growth curve: food and supplements together, for most exercising adults. One small trial found no clear lean-mass advantage from doubling 0.73 to 1.45 g/lb/day; that does not prove a universal ceiling.'],['issn2017','ISSN guide'],[['bagheri2023','Dose trial'],['morton','Earlier review']]],
 sets:[['sets-0','Pelland 2026'],['Dashed line: one review’s modeled muscle-size differences, with a 95% credible band. Indirect work counts as half a set. The gray tail marks sparse evidence above 25 sets; it cannot establish that 45 sets doubles your growth.','A broader 2026 review supports higher volume, with diminishing returns, but no exact optimum. A newer 9-versus-36-set trial found similar outcomes; it remains a preprint with measurement and dropout limits.'],['acsm2026','ACSM 2026'],[['steele2026','Trial preprint']]],
 sleep:[['yin2017','Yin 2017'],['Shown: an older self-report mortality curve and its 95% confidence band. Illness can affect both sleep and risk. Its lowest point is not a personal sleep prescription.','Newer device-based research gives different minima. Adult sleep guidance supports seven or more hours, commonly seven to nine; the former six-hour highlighted range was a plotting choice and has been removed.'],['chaput2026','Chaput 2026'],[['aasm2015','Sleep guidance']]],
 'fruit-veg':[['wang2021','Wang 2021'],['The headline uses a 26-study review; plotted dots show one US women’s cohort, with 95% confidence intervals. These are food-specific servings and observed habits, not assigned doses.','Other reviews find further associations at higher intakes. Five is a useful broad guide, not a universal ceiling. The plotted groups cannot establish an exact threshold between their median intakes.'],['aune2017fruit','Aune 2017']],
 fiber:[['yao2023','Yao 2023'],['Updated linear summary: 14 studies, 1.37 million people, 10% lower mortality risk per extra 10 grams. Shading shows slope uncertainty. The separate curved fit flattens more; we do not invent its coordinates.','Studies differ substantially, and observed diets do not prove causation. The displayed 7 to 35 gram window cannot establish an optimum. The earlier review also found benefits from higher fiber intake.'],['reynolds2019','Reynolds 2019']],
 income:[['killingsworth2021','Killingsworth 2021'],['US app volunteers, employed and aged 18 to 65; pre-tax household income in 2009 to 2015 dollars. Dots are group means, with 95% confidence intervals. The 100-point feeling scale is zoomed to 55 to 70.','Income was not randomly assigned. The open top group is not a cap. Later analyses disagree about plateaus and find different patterns across people’s happiness levels. No universal income cutoff follows.'],['kkm2023','2023 reanalysis']],
 savings:[['savingsArithmetic','Accumulation model'],['Start at $0, keep income and spending constant, save at year end and assume 5% annual growth after inflation. The target is 25 times yearly spending. Shading uses alternate growth and target assumptions.','This is arithmetic, not measured investment performance. The historical 4% withdrawal research concerns finite retirements and does not guarantee lifelong income. Markets, taxes and changing spending can alter the result.'],['bengen1994','Historical withdrawal research']],
 work:[['pencavel-author','Pencavel author paper'],['Dashed line: output modeled from First World War munitions workers, mainly women. It cannot prescribe a modern workweek. Coefficient covariance is unavailable, so no response band is invented.','A later call-centre study also found lower hourly productivity with longer days, but it supplies no common weekly cutoff. Separate stroke research measures health rather than output.'],['collewet2017','Call-centre study'],[['workStroke2020','Stroke review']]],
 alcohol:[['zhao2023','Zhao 2023'],['Bias-adjusted review of 107 cohorts. Lifetime nondrinkers are the baseline. Light-drinking intervals include no difference. Whiskers show 95% confidence intervals; dots are broad intake groups, with an open top group.','A 2024 reanalysis also found no clear longevity benefit in less-biased studies. It reuses the review family, not 107 additional cohorts. One US drink contains 14 grams; results differ by sex.'],['stockwell2024','2024 reanalysis']],
 smoking:[['hackshaw2018','Hackshaw 2018'],['Dots show men’s extra coronary heart disease risk, with 95% confidence intervals. One cigarette carried 48% extra relative risk, twenty carried 104%. This is not your absolute chance of illness.','A newer 22-cohort analysis also found elevated risk at low daily amounts. It measures different outcomes, so its estimates are not spliced into this chart. Quitting reduces risk, but does not instantly erase it.'],['ccc2025','2025 cohort analysis']]
};
function detail(c){
 const [primary,paragraphs,other,more=[]]=evidence[c.id];
 const link=([id,label])=>{const source=c.sources.find(s=>s.id===id);return `<a href="${esc(source.url)}">${esc(label)}</a>`;};
 return `<details class="enough-detail"><summary>Evidence and limits</summary><p>${paragraphs[0]} ${link(primary)}.</p><p>${paragraphs[1]}${other?' '+link(other)+'.':''}${more.length?' '+more.map(link).join('; ')+'.':''}</p><p><a href="js/enough-data.js" download>Full data and methods</a></p></details>`;
}
function interactive(box,{min,max,step,name,description,get,set,fromPointer,bounds=()=>[min,max]}){
 box.setAttribute('role','slider');box.tabIndex=0;box.setAttribute('aria-label',name);
 box.setAttribute('aria-valuemin',min);box.setAttribute('aria-valuemax',max);
 box.setAttribute('aria-describedby',description+' chart-help');box.setAttribute('aria-orientation','horizontal');
 let pointerFocus=false;
 box.addEventListener('keydown',e=>{
  pointerFocus=false;box.classList.remove('en-pointer-away');
  const deltas={ArrowRight:step,ArrowUp:step,ArrowLeft:-step,ArrowDown:-step,PageUp:step*10,PageDown:-step*10};
  if(e.key==='Home'||e.key==='End'||e.key in deltas){const [minimum,maximum]=bounds();e.preventDefault();set(e.key==='Home'?minimum:e.key==='End'?maximum:get()+deltas[e.key]);}
 });
 box.addEventListener('pointerleave',e=>{if(pointerFocus&&e.pointerType!=='touch')box.classList.add('en-pointer-away');});
 box.addEventListener('pointerenter',e=>{if(pointerFocus&&e.pointerType!=='touch')box.classList.remove('en-pointer-away');});
 box.addEventListener('blur',()=>{pointerFocus=false;box.classList.remove('en-pointer-away');});
 let pointer=null,start=null,dragged=false;
 box.addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.isPrimary)return;
  if(e.pointerType!=='touch')e.preventDefault();
  pointerFocus=e.pointerType!=='touch';box.classList.remove('en-pointer-away');
  box.focus({preventScroll:true});pointer=e.pointerId;start={x:e.clientX,y:e.clientY};dragged=false;
  // Defer touch selection until a tap or a horizontal drag, leaving vertical scrolling intact.
  if(e.pointerType!=='touch'){box.setPointerCapture(pointer);set(fromPointer(e));dragged=true;}
 });
 box.addEventListener('pointermove',e=>{
  // Captured drags keep receiving moves after the pointer leaves the box.
  if(pointerFocus&&e.pointerType!=='touch'){const r=box.getBoundingClientRect();box.classList.toggle('en-pointer-away',e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);}
  if(e.pointerId!==pointer)return;
  if(!dragged){const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){pointer=null;return;}if(Math.abs(dx)<8)return;box.setPointerCapture(pointer);dragged=true;}
  set(fromPointer(e));
 });
 const finish=e=>{if(e.pointerId!==pointer)return;if(e.type==='pointerup'&&!dragged)set(fromPointer(e));pointer=null;if(box.hasPointerCapture(e.pointerId))box.releasePointerCapture(e.pointerId);};
 box.addEventListener('pointerup',finish);box.addEventListener('pointercancel',finish);
}
function doseFromPointer(c,box,e){
 const rect=box.getBoundingClientRect(),g=geometry(rect.width),f=M.clamp((e.clientX-rect.left-g.L)/g.pw,0,1),[min,max]=c.view.range;
 if(c.kind==='categories'){
  if(c.id==='alcohol')return Math.round(min+f*(max-min));
  const value=physical(c,min)+f*(physical(c,max)-physical(c,min));
  return c.points.reduce((a,p)=>Math.abs(p.sourceDose-value)<Math.abs(a.sourceDose-value)?p:a).dose;
 }
 return min+f*(max-min);
}
// One walking study and age selection drive both the opening preview and its card.
const textIfChanged=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
function walkingBaseline(c){return `${c.title}. Compared with ${fmt(c.referenceDose)} steps/day. Shading: 95% confidence interval.`;}
function bindWalking(plot,output,baseline,card=null){
 const preview=!card;
 const update=()=>{
  const c=walkingCurves.get(walkingAge),dose=walkingDoses.get(walkingAge),value=readout(c,dose);
  plot.innerHTML=chart(c,plot.clientWidth,dose,preview);
  plot.setAttribute('aria-valuemin',c.view.range[0]);plot.setAttribute('aria-valuemax',c.view.range[1]);plot.setAttribute('aria-valuenow',dose);plot.setAttribute('aria-valuetext',value);
  textIfChanged(baseline,walkingBaseline(c));
  if(card){
   output.textContent=`${fmt(dose)} steps/day: about ${fmt(M.outcome(c,dose))}% lower risk of dying.`;
   textIfChanged(card.querySelector('.enough-answer'),c.view.answer);textIfChanged(card.querySelector('.enough-fact'),c.fact);
   for(const button of card.querySelectorAll('[data-steps-age]'))button.setAttribute('aria-pressed',button.dataset.stepsAge===walkingAge);
  }else{
   if(!output.firstElementChild)output.innerHTML='<span></span><strong></strong>';
   textIfChanged(output.firstElementChild,`${fmt(dose)} steps/day`);textIfChanged(output.lastElementChild,`About ${fmt(M.outcome(c,dose))}% lower risk of dying`);
   const context=plot.parentElement.querySelector('.overview-context');if(context.dataset.age!==walkingAge){context.innerHTML=`Flatter around ${fmt(c.authorPlateauRange[0])} to ${fmt(c.authorPlateauRange[1])} steps/day. <a href="#steps">Walking details</a>`;context.dataset.age=walkingAge;}
  }
 };
 const set=value=>{const c=walkingCurves.get(walkingAge);walkingDoses.set(walkingAge,M.clamp(Math.round(value/100)*100,...c.view.range));for(const view of walkingViews)view.update();};
 const c=walkingCurves.get(walkingAge);
 interactive(plot,{min:c.view.range[0],max:c.view.range[1],step:100,name:(preview?'Opening chart: ':'')+'How much walking?',description:baseline.id,get:()=>walkingDoses.get(walkingAge),set,bounds:()=>walkingCurves.get(walkingAge).view.range,fromPointer:e=>doseFromPointer(walkingCurves.get(walkingAge),plot,e)});
 const state={update};walkingViews.push(state);return state;
}
for(const [area,title,dek,ids]of groups){
 const section=document.createElement('section');section.className='enough-group';section.style.setProperty('--area',`var(--en-${area})`);section.setAttribute('aria-labelledby','area-'+area);
 section.innerHTML=`<div class="area-heading"><h2 id="area-${area}">${esc(title)}</h2><p>${esc(dek)}</p></div><div class="${ids.length>1?'enough-grid':'enough-feature'}"></div>`;
 for(const id of ids){
  const c=curves.get(id),card=document.createElement('article');card.id=id;card.className='enough-card'+(ids.length===1?' feature':'');
  card.innerHTML=`<div class="card-copy"><span class="shape">${esc(shape(c))}</span><h3>${esc(c.question)}</h3><p class="enough-answer">${esc(c.view.answer)}</p><p class="enough-fact">${esc(c.fact)}</p></div><div class="card-plot"><div class="enough-chart"></div><p class="enough-readout" id="readout-${id}"></p><p class="enough-range-note" id="range-note-${id}">${esc(c.view.rangeLabel)}.</p></div>${detail(c)}`;
  section.lastElementChild.append(card);const plot=card.querySelector('.enough-chart'),output=card.querySelector('.enough-readout');
  if(id==='steps'){
   card.querySelector('.enough-answer').insertAdjacentHTML('beforebegin','<div class="overview-choices walking-age-choices" role="group" aria-label="Choose the walking study age group"><button type="button" data-steps-age="steps-younger">Under 60</button><button type="button" data-steps-age="steps-older">60+</button></div>');
   const state=bindWalking(plot,output,card.querySelector('.enough-range-note'),card);states.set(id,{c,...state});
   for(const button of card.querySelectorAll('[data-steps-age]'))button.addEventListener('click',()=>{walkingAge=button.dataset.stepsAge;for(const view of walkingViews)view.update();});
   continue;
  }
  const [min,max]=c.view.range,step=c.kind==='categories'?1:c.id==='steps'?100:c.id==='protein'?.01:c.id==='sleep'?.1:c.id==='work'?.5:1;
  let dose=c.view.default??c.defaultDose;
  const update=()=>{plot.innerHTML=chart(c,plot.clientWidth,dose);const value=readout(c,dose);output.textContent=value;plot.setAttribute('aria-valuenow',dose);plot.setAttribute('aria-valuetext',value);};
  const set=value=>{dose=value<=min?min:value>=max?max:Number((Math.round(value/step)*step).toFixed(4));dose=M.clamp(dose,min,max);update();};
  interactive(plot,{min,max,step,name:c.question,description:'range-note-'+id,get:()=>dose,set,fromPointer:e=>doseFromPointer(c,plot,e)});
  states.set(id,{c,update});
 }
 $('enough-groups').append(section);
}
$('enough-loading')?.remove();
const overviewIds=['steps','exercise','protein'];
const overviewBox=$('overview-chart'),overviewStates=new Map();
const openingCopy={
 steps:{name:'Walking'},
 exercise:{name:'Exercise',default:150,amount:d=>fmt(d)+' minutes/week',result:v=>fmt(v,1)+'% lower risk of dying',baseline:'Compared with no exercise in these studies.',context:'At 600 minutes: 38.4% lower risk. The source continues beyond this range.'},
 protein:{name:'Protein',default:.8,amount:d=>fmt(d,2)+' g/lb/day',result:(v,d)=>d<curves.get('protein').guidance.low?'Below the intake guide':d>curves.get('protein').guidance.high?'Above the intake guide':'Within the intake guide',baseline:'Guidance for most exercising adults. Food and supplements together.',context:'Research supports small extra gains from added protein, but no exact growth cutoff.'}
};
for(const id of overviewIds){
 const c=curves.get(id),copy=openingCopy[id],panel=document.createElement('div');panel.className='overview-panel';panel.id='overview-'+id;panel.style.setProperty('--area',`var(--en-${c.view.area})`);
 panel.innerHTML=`<div class="overview-plot"></div><p class="overview-reading" id="overview-readout-${id}"></p><p class="overview-baseline" id="overview-baseline-${id}">${esc(copy.baseline||'')}</p><p class="overview-context">${esc(copy.context||'')} <a href="#${id}">${copy.name} details</a></p>`;
 overviewBox.append(panel);const plot=panel.querySelector('.overview-plot'),output=panel.querySelector('.overview-reading'),[min,max]=c.view.range,step=id==='steps'?100:id==='protein'?.01:1;let dose=copy.default;
 if(id==='steps'){overviewStates.set(id,{panel,...bindWalking(plot,output,panel.querySelector('.overview-baseline'))});continue;}
 const update=()=>{plot.innerHTML=chart(c,plot.clientWidth,dose,true);output.innerHTML=`<span>${esc(copy.amount(dose))}</span><strong>${esc(copy.result(M.outcome(c,dose),dose))}</strong>`;plot.setAttribute('aria-valuenow',dose);plot.setAttribute('aria-valuetext',readout(c,dose));};
 const set=value=>{dose=value<=min?min:value>=max?max:Number((Math.round(value/step)*step).toFixed(4));dose=M.clamp(dose,min,max);update();};
 interactive(plot,{min,max,step,name:'Opening chart: '+c.question,description:'overview-baseline-'+id,get:()=>dose,set,fromPointer:e=>doseFromPointer(c,plot,e)});
 overviewStates.set(id,{panel,update});
}
let opening=overviewIds.includes(params.get('curve'))?params.get('curve'):'steps';
function overview(){
 for(const [id,state]of overviewStates){state.panel.hidden=id!==opening;if(id===opening)state.update();}
 for(const button of document.querySelectorAll('[data-opening-curve]')){const selected=button.dataset.openingCurve===opening;button.setAttribute('aria-pressed',selected);button.setAttribute('aria-controls','overview-'+button.dataset.openingCurve);}
}
for(const button of document.querySelectorAll('[data-opening-curve]'))button.addEventListener('click',()=>{opening=button.dataset.openingCurve;overview();});
const painting=params.get('painting');if(['homer','chardin'].includes(painting)){
 $('hero-painting').src='assets/enough/'+painting+'.jpg';$('hero-picture').querySelector('source').srcset='assets/enough/'+painting+'.webp';
 $('hero-painting').alt=painting==='homer'?'Four people sail a small boat in Winslow Homer’s Breezing Up.':'Fruit, a jug and a glass on a table, painted by Chardin.';
 $('painting-credit').innerHTML=painting==='homer'?'Winslow Homer, <a href="https://www.nga.gov/artworks/30228-breezing-fair-wind">Breezing Up (A Fair Wind)</a>, 1873 to 1876. National Gallery of Art, 1943.13.1. Public domain.':'Jean Simeon Chardin, <a href="https://www.nga.gov/artworks/12202-fruit-jug-and-glass">Fruit, Jug, and a Glass</a>, c. 1726/1728. National Gallery of Art, 1943.7.4. Public domain.';
}
if(params.get('colors')==='quiet')for(const area of ['move','lift','rest','eat','money','work'])document.querySelector('.enough-shell').style.setProperty('--en-'+area,'var(--accent)');
let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{overview();for(const s of states.values())s.update();},60);});
overviewBox.classList.add('en-initial');overview();for(const s of states.values())s.update();
const hash=decodeURIComponent(location.hash.slice(1)),target=hash==='steps-longer'?'steps':hash;if(states.has(target))requestAnimationFrame(()=>$(target)?.scrollIntoView());
})();
