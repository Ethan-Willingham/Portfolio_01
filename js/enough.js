(() => {
'use strict';
const data=window.EnoughData,M=window.EnoughMath;if(!data||!M)return;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=0)=>(Math.abs(n)<.5*10**(-d)?0:Number(n)).toLocaleString('en-US',{maximumFractionDigits:d});
const curves=new Map(data.curves.map(c=>[c.id,c])),states=new Map();
const groups=[
 ['move','Move','The first steps count.',['steps','exercise']],
 ['lift','Lift','Protein and training volume.',['protein','sets']],
 ['rest','Rest','A low point, with room for your own needs.',['sleep']],
 ['eat','Eat','More plants. More fiber.',['fruit-veg','fiber']],
 ['money','Money','Income and savings answer different questions.',['income','savings']],
 ['work','Work','Hours and output part ways.',['work']],
 ['harm','Where enough is zero','A little can carry a lot of risk.',['alcohol','smoking']]
];
const xLabels={steps:'Steps/day',exercise:'Exercise, minutes/week',protein:'Protein, g/lb/day',sets:'Sets/muscle/week',sleep:'Sleep, hours/night','fruit-veg':'Fruit and veg, servings/day',fiber:'Fiber, grams/day',income:'Household income, $/year',savings:'Take-home pay saved, %',work:'Work, hours/week',alcohol:'US drinks/week (groups)',smoking:'Cigarettes/day'};
const outcomeScales={
 steps:{max:60,ticks:[0,20,40,60],label:'Lower risk of dying, %'},
 exercise:{max:40,ticks:[0,10,20,30,40],label:'Lower risk of dying, %'},
 protein:{max:3,ticks:[0,1,2,3],label:'Extra lean-mass gain, lb (model)'},
 'fruit-veg':{max:15,ticks:[0,5,10,15],label:'Lower risk of dying, %'},
 fiber:{max:25,ticks:[0,10,20,25],label:'Lower risk of dying, %'},
 income:{max:5,ticks:[0,1,2,3,4,5],label:'Feeling-score increase, points'},
 savings:{max:70,ticks:[0,20,40,60],label:'Years to savings target (model)'},
 work:{max:4500,ticks:[0,1500,3000,4500],label:'Added factory output, index units'}
};
const targetKey=()=>'<p class="enough-target-key"><span aria-hidden="true"></span>Enough: 90% of shown improvement</p>';
const shape=c=>c.view.shape||({benefit:'Most arrives early',sweet:'A sweet spot',harm:'Less is better',model:'Uncertain ceiling'}[c.view.mode]);
function amount(c,d){
 if(c.kind==='categories')return c.points[Math.round(d)].label;
 if(c.id==='protein')return fmt(d,2)+' grams per pound';
 if(c.id==='sets')return fmt(d)+' weekly sets per muscle';
 if(c.id==='savings')return 'Saving '+fmt(d)+'%';
 if(c.id==='steps')return fmt(d)+' steps a day';
 if(c.id==='exercise')return fmt(d)+' minutes a week';
 if(c.id==='fiber')return fmt(d,1)+' grams a day';
 if(c.id==='sleep')return fmt(d,1)+' hours a night';
 if(c.id==='work')return fmt(d,1)+' hours a week';
 return fmt(d)+' minutes a day';
}
function readout(c,d){
 const a=amount(c,d),value=M.outcome(c,d);
 if(c.id==='sets')return `${a}: ${fmt(value,1)}% modeled difference from no training (${fmt(M.estimate(c,d,'low'),1)} to ${fmt(M.estimate(c,d,'high'),1)}%).`;
 if(c.id==='sleep')return `${a}: ${Math.abs(value)<.5?'near this curve’s low point':fmt(value)+'% higher risk of dying than the low point'}.`;
 if(c.id==='smoking')return d===0?'Never smoking is the baseline.':`${a}: ${fmt(value)}% extra heart disease risk in men.`;
 if(c.id==='alcohol')return d===0?'Lifetime nondrinkers are the baseline.':`${a}: ${fmt(Math.abs(value))}% ${value<0?'lower':'higher'} estimated risk of dying.${d<3?' Uncertainty includes no difference.':''}`;
 if(c.id==='savings')return `${a}: about ${fmt(value,1)} years to the target, under these assumptions.`;
 if(c.id==='work')return `${a}: ${fmt(value)} added output-index units above a 24-hour week in this factory model.`;
 if(c.id==='income')return `${a}: ${fmt(value,1)} feeling-score points above the $10,000 to $20,000 group.`;
 if(c.id==='protein')return `${a} a day: ${fmt(value,1)} lb more lean-mass gain than at 0.41 g/lb/day in this model.`;
 const baseline={steps:'2,000 steps a day',exercise:'no exercise','fruit-veg':'2.1 servings a day',fiber:'7 grams a day'}[c.id];
 const dose=c.id==='fruit-veg'?`About ${fmt(c.points[d].sourceDose,1)} servings a day`:a;
 return `${dose}: ${fmt(value,1)}% lower risk of dying compared with ${baseline}, in ${c.id==='fiber'?'this model':'these studies'}.`;
}
function physical(c,d){return c.kind==='categories'&&c.id!=='alcohol'?c.points[Math.round(d)].sourceDose:d;}
function geometry(width,overview=false){
 const w=Math.max(180,width),h=overview?(w<500?170:212):220,L=42,R=12,T=30,B=56;
 return {w,h,L,R,T,B,pw:w-L-R,ph:h-T-B};
}
function chart(c,width,d,overview=false){
 const {w,h,L,R,T,B,pw,ph}=geometry(width,overview),[min,max]=c.view.range;
 const pMin=physical(c,min),pMax=physical(c,max),x=v=>L+(physical(c,v)-pMin)/(pMax-pMin)*pw;
 const mode=c.view.mode,minY=mode==='harm'&&c.id==='alcohol'?-10:0;
 const scale=outcomeScales[c.id],maxY=scale?scale.max:mode==='harm'?(c.id==='smoking'?110:40):mode==='sweet'?60:16;
 const y=v=>T+(maxY-v)/(maxY-minY)*ph;
 const value=(v,key='effect')=>M.outcome(c,v,key);
 const ps=c.kind==='categories'?c.points.map(p=>p.dose):M.series(c).map(p=>p.dose);
 const path=(values,key='effect')=>values.map((v,i)=>`${i?'L':'M'}${x(v).toFixed(2)},${y(value(v,key)).toFixed(2)}`).join(' ');
 const selected=M.clamp(d,min,max),point=value(selected),clip='en-clip-'+c.id+(overview?'-overview':'');
 const baseY=y(0),line=path(ps);
 const tickValues=w<500&&c.id==='income'?[0,12,14]:w<500&&c.id==='smoking'?[0,2,3]:w<500&&c.id==='alcohol'?[0,2,5]:c.ticks;
 const ticks=tickValues.map(v=>{const label=c.kind==='categories'?c.points[v].shortLabel:c.id==='protein'?fmt(v,2):fmt(v,1);return `<text x="${x(v)}" y="${h-B+21}" text-anchor="${v===min?'start':v===max?'end':'middle'}">${esc(label)}</text>`;}).join('');
 const yticks=scale?scale.ticks:mode==='sweet'?[0,30,60]:mode==='model'?[0,5,10,15]:c.id==='alcohol'?[-10,0,20,40]:[0,50,100];
 const d90=overview?null:M.enough(c),sweet=mode==='sweet'?M.sleepRange(c):null;
 const band=sweet?`<rect x="${x(sweet[0])}" y="${T}" width="${x(sweet[1])-x(sweet[0])}" height="${ph}" class="en-area"/>`:mode==='model'?`<path class="en-uncertainty" d="${path(ps,'low')} ${path([...ps].reverse(),'high').replace(/^M/,'L')} Z"/>`:'';
 const dots=c.kind==='categories'?ps.map(v=>`<circle cx="${x(v)}" cy="${y(value(v))}" r="3" fill="var(--area)"/>`).join(''):'';
 const openingAxes={steps:'Lower risk than at 2,000 steps, %',exercise:'Lower risk than no exercise, %',protein:'Extra lean-mass gain, lb (model)'};
 const yLabel=overview?openingAxes[c.id]:scale?scale.label:mode==='model'?'Model difference vs no training, %':mode==='sweet'?'Extra risk of dying, %':c.id==='smoking'?'Extra heart disease risk, %':'Extra risk of dying, %';
 return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><clipPath id="${clip}"><rect x="${L}" y="${T-3}" width="${Math.max(0,x(selected)-L)}" height="${ph+6}"/></clipPath></defs><text class="en-y-label" x="${L}" y="15">${yLabel}</text>${yticks.map(v=>`<line class="en-grid" x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}"/><text class="en-y-tick" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}${band}<line class="en-axis" x1="${L}" x2="${w-R}" y1="${baseY}" y2="${baseY}"/>${d90!==null?`<line class="en-target" x1="${L}" x2="${w-R}" y1="${y(value(d90))}" y2="${y(value(d90))}"/><line class="en-guide" x1="${x(d90)}" x2="${x(d90)}" y1="${T}" y2="${T+ph}"/>`:''}${mode==='benefit'&&c.id!=='savings'?`<path class="en-area" clip-path="url(#${clip})" d="${line} L${x(max)},${baseY} L${x(min)},${baseY}Z"/><path class="en-curve en-remainder" style="${c.kind==='categories'?'stroke-dasharray:3 5':''}" d="${line}"/><path class="en-curve" clip-path="url(#${clip})" style="${c.kind==='categories'?'stroke-dasharray:3 5':''}" d="${line}"/>`:`<path class="en-curve" style="${c.kind==='categories'?'stroke-dasharray:3 5':''}" d="${line}"/>`}${dots}<line class="en-selection" x1="${x(selected)}" x2="${x(selected)}" y1="${T}" y2="${T+ph}"/><circle class="en-dot" cx="${x(selected)}" cy="${y(point)}" r="6"/>${ticks}<text class="en-x-label" x="${L+pw/2}" y="${h-5}" text-anchor="middle">${xLabels[c.id]}</text></svg>${mode==='benefit'&&!overview?targetKey():''}`;
}
// Keep the on-page evidence brief. Full extraction, tables and caveats remain in the data file.
const evidence={
 steps:[['steps-0','Ding 2025'],['Fourteen cohorts followed people’s habits rather than assigning walks. The chart uses Table 2’s estimates, with 2,000 steps as its baseline.','The late improvement moves the 90% mark to 10,500. A shorter range would move it substantially. Published 95% limits are retained in the data.']],
 exercise:[['activity-0','Garcia 2023'],['Observed activity and mortality. The shown window contains 94% of the source’s person-years; the sparse high-dose tail continues beyond it. The chosen endpoint affects “enough.”','Minutes mean moderate exercise. Count a vigorous minute as two. Published 95% limits and the original energy units are in the data.']],
 protein:[['morton','Morton 2018'],['Healthy adults lifting weights. The model forces a plateau near 0.73 g/lb/day; it did not clearly beat a straight line (p=0.079). Protein means food and supplements together.','The published bend interval is broad: 0.47 to 1.00 g/lb. The 0.70 mark summarizes this model, not a universal ceiling. Lean mass includes muscle and water.']],
 sets:[['sets-0','Pelland 2026'],['The model favors more volume with diminishing returns, but evidence above about 25 sets is sparse. The shaded band is a 95% credible interval for modeled muscle-size ratios, not your percentage of growth. Indirect work counts as half a set.','A newer trial found similar outcomes at 9 and 36 sets in trained adults. It is a preprint, used circumference and skinfolds, had dropouts and revised its analysis plan. No optimum is established.'],['steele2026','Steele 2026 preprint']],
 sleep:[['yin2017','Yin 2017'],['Older observational cohorts using self-reported sleep. Illness can influence both sleep and mortality. Seven hours is this curve’s low point, not a prescription.','The highlighted 6 to 7.25 hours stays within 1% of its lowest risk, a display choice. Newer device-based research gives different patterns.'],['chaput2026','Chaput 2026']],
 'fruit-veg':[['wang2021','Wang 2021'],['Dots are median intakes in groups of US women, not assigned doses. The 5.3-serving group did best; the 7.3-serving group’s central estimate was slightly worse.','Published 95% limits are retained. Other reviews find gains at higher intakes. These questionnaire servings are food-specific portions; five is not a universal ceiling.']],
 fiber:[['reynolds2019','Reynolds 2019'],['This reconstructs the published log-linear mortality association: 7% lower risk per extra 8 grams. It is not the paper’s separate curved fit or a personal forecast.','We chose a 7 to 35 gram window within the figure’s approximate extent. Its 32-gram mark depends on those endpoints. Slope uncertainty and alternative windows are in the data.']],
 income:[['killingsworth2021','Killingsworth 2021'],['US app volunteers, using pre-tax household income in 2009 to 2015 dollars. The dots are income groups; the top one is open. Their means dip at the top, while the author’s smooth trend keeps rising.','The association does not prove income caused happiness. Published standard errors are retained. Later analyses disagree about the ceiling and find different patterns across the happiness distribution.'],['kkm2023','2023 reanalysis']],
 savings:[['savingsArithmetic','Accumulation model'],['Start at $0. Keep income and spending constant, add savings at year end and assume 5% annual growth after inflation. The target is 25 times yearly spending.','Changing growth and withdrawal assumptions moves the 90% mark to about 71 to 74%. These are scenarios, not confidence limits. Markets, taxes and changing spending can alter the result.']],
 work:[['pencavel-author','Pencavel author paper'],['A model of output from First World War munitions workers, mainly women. The chart shows added output above 24 hours; it is not a recommended modern workweek.','Coefficient covariance is unavailable, so no uncertainty band is invented. Separate WHO/ILO research links 55+ weekly hours to increased stroke risk; it measures a different outcome.'],['workStroke2020','WHO/ILO review']],
 alcohol:[['zhao2023','Zhao 2023'],['A bias-adjusted review of 107 observational cohorts. Lifetime nondrinkers are the baseline. Light-drinking estimates sit below zero extra risk, but their intervals include no difference.','Dots are broad intake groups, not exact doses; the top group has no upper bound. One US drink contains 14 grams of alcohol. Results differ by sex.']],
 smoking:[['hackshaw2018','Hackshaw 2018'],['Pooled estimates for men’s coronary heart disease. One daily cigarette carried 48% extra relative risk, versus 104% for twenty. That is nearly half the extra risk, not half the absolute chance of illness.','Dots are published doses; connecting lines are guides. Published 95% intervals are in the data. Never smoking is the baseline; quitting does not immediately erase past risk.']]
};
function detail(c){
 const [primary,paragraphs,other]=evidence[c.id];
 const link=([id,label])=>{const source=c.sources.find(s=>s.id===id);return `<a href="${esc(source.url)}">${esc(label)}</a>`;};
 return `<details class="enough-detail"><summary>Evidence and limits</summary><p>${paragraphs[0]} ${link(primary)}.</p><p>${paragraphs[1]}${other?' '+link(other)+'.':''}</p><p><a href="js/enough-data.js" download>Full data and methods</a></p></details>`;
}
function interactive(box,{min,max,step,name,description,get,set,fromPointer}){
 box.setAttribute('role','slider');box.tabIndex=0;box.setAttribute('aria-label',name);
 box.setAttribute('aria-valuemin',min);box.setAttribute('aria-valuemax',max);
 box.setAttribute('aria-describedby',description+' chart-help');box.setAttribute('aria-orientation','horizontal');
 let pointerFocus=false;
 box.addEventListener('keydown',e=>{
  pointerFocus=false;box.classList.remove('en-pointer-away');
  const deltas={ArrowRight:step,ArrowUp:step,ArrowLeft:-step,ArrowDown:-step,PageUp:step*10,PageDown:-step*10};
  if(e.key==='Home'||e.key==='End'||e.key in deltas){e.preventDefault();set(e.key==='Home'?min:e.key==='End'?max:get()+deltas[e.key]);}
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
for(const [area,title,dek,ids]of groups){
 const section=document.createElement('section');section.className='enough-group';section.style.setProperty('--area',`var(--en-${area})`);section.setAttribute('aria-labelledby','area-'+area);
 section.innerHTML=`<div class="area-heading"><h2 id="area-${area}">${esc(title)}</h2><p>${esc(dek)}</p></div><div class="${ids.length>1?'enough-grid':'enough-feature'}"></div>`;
 for(const id of ids){
  const c=curves.get(id),card=document.createElement('article');card.id=id;card.className='enough-card'+(ids.length===1?' feature':'');
  card.innerHTML=`<div class="card-copy"><span class="shape">${esc(shape(c))}</span><h3>${esc(c.question)}</h3><p class="enough-answer">${esc(c.view.answer)}</p><p class="enough-fact">${esc(c.fact)}</p></div><div class="card-plot"><div class="enough-chart"></div><p class="enough-readout" id="readout-${id}"></p><p class="enough-range-note" id="range-note-${id}">${esc(c.view.rangeLabel)}.</p></div>${detail(c)}`;
  section.lastElementChild.append(card);const plot=card.querySelector('.enough-chart'),output=card.querySelector('.enough-readout');
  const [min,max]=c.view.range,step=c.kind==='categories'?1:c.id==='steps'?100:c.id==='protein'?.01:c.id==='sleep'?.1:c.id==='work'?.5:1;
  let dose=M.enough(c)??(c.view.mode==='sweet'?7:c.id==='sets'?10:0);
  const update=()=>{plot.innerHTML=chart(c,plot.clientWidth,dose);const value=readout(c,dose);output.textContent=value;plot.setAttribute('aria-valuenow',dose);plot.setAttribute('aria-valuetext',value);};
  const set=value=>{dose=value<=min?min:value>=max?max:Number((Math.round(value/step)*step).toFixed(4));dose=M.clamp(dose,min,max);update();};
  interactive(plot,{min,max,step,name:c.question,description:'range-note-'+id,get:()=>dose,set,fromPointer:e=>doseFromPointer(c,plot,e)});
  states.set(id,{c,update});
 }
 $('enough-groups').append(section);
}
$('enough-loading')?.remove();
const overviewIds=['steps','exercise','protein'];
const params=new URLSearchParams(location.search),overviewBox=$('overview-chart'),overviewStates=new Map();
const openingCopy={
 steps:{name:'Walking',default:7000,amount:d=>fmt(d)+' steps/day',result:v=>fmt(v,1)+'% lower risk of dying',baseline:'Compared with 2,000 steps/day in these studies.',context:'At 12,000 steps: 55% lower risk. No established maximum.'},
 exercise:{name:'Exercise',default:150,amount:d=>fmt(d)+' minutes/week',result:v=>fmt(v,1)+'% lower risk of dying',baseline:'Compared with no exercise in these studies.',context:'At 600 minutes: 38.4% lower risk. The source continues beyond this range.'},
 protein:{name:'Protein',default:.7,amount:d=>fmt(d,2)+' g/lb/day',result:v=>fmt(v,1)+' lb more lean-mass gain',baseline:'Compared with 0.41 g/lb/day while lifting, in this model.',context:'The model levels off near 0.73 g/lb/day. The bend is uncertain.'}
};
for(const id of overviewIds){
 const c=curves.get(id),copy=openingCopy[id],panel=document.createElement('div');panel.className='overview-panel';panel.id='overview-'+id;panel.style.setProperty('--area',`var(--en-${c.view.area})`);
 panel.innerHTML=`<div class="overview-plot"></div><p class="overview-reading" id="overview-readout-${id}"></p><p class="overview-baseline" id="overview-baseline-${id}">${esc(copy.baseline)}</p><p class="overview-context">${esc(copy.context)} <a href="#${id}">${copy.name} details</a></p>`;
 overviewBox.append(panel);const plot=panel.querySelector('.overview-plot'),output=panel.querySelector('.overview-reading'),[min,max]=c.view.range,step=id==='steps'?100:id==='protein'?.01:1;let dose=copy.default;
 const update=()=>{plot.innerHTML=chart(c,plot.clientWidth,dose,true);output.innerHTML=`<span>${esc(copy.amount(dose))}</span><strong>${esc(copy.result(M.outcome(c,dose)))}</strong>`;plot.setAttribute('aria-valuenow',dose);plot.setAttribute('aria-valuetext',readout(c,dose));};
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
const hash=decodeURIComponent(location.hash.slice(1));if(states.has(hash))requestAnimationFrame(()=>$(hash)?.scrollIntoView());
})();
