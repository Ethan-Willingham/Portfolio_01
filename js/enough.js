(() => {
'use strict';
const data=window.EnoughData,M=window.EnoughMath;if(!data||!M)return;
const plain=s=>String(s??'').replace(/([a-zA-Z%])(?=\d)/g,'$1 ').replace(/(\d)(?=[a-zA-Z])/g,'$1 ');
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=0)=>(Math.abs(n)<.5*10**(-d)?0:Number(n)).toLocaleString('en-US',{maximumFractionDigits:d});
const curves=new Map(data.curves.map(c=>[c.id,c])),states=new Map();
const groups=[['move','Move','The first steps count.',['steps','exercise']],['lift','Lift','Protein has a bend. Training volume keeps climbing.',['protein','sets']],['rest','Rest','A low point, with room for your own needs.',['sleep']],['eat','Eat','More plants. More fiber.',['fruit-veg','fiber']],['money','Money','Income and savings answer different questions.',['income','savings']],['work','Work','Hours and output part ways.',['work']],['mind','Mind','Leave room for what we don’t know.',['meditation']],['harm','Where enough is zero','A little can carry a lot of risk.',['alcohol','smoking']]];
const shape=c=>c.view.shape||({benefit:'Most arrives early',sweet:'A sweet spot',harm:'Less is better',unknown:'Still unknown'}[c.view.mode]);
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
function threshold(c,d){
 if(c.id==='fruit-veg')return 'the group eating about '+fmt(c.points[d].sourceDose,1)+' servings a day';
 if(c.id==='income')return 'the '+c.points[d].label+' group';
 return amount(c,d);
}
function text(c,d){
 const a=amount(c,d),share=M.share(c,d),extra=M.extraRisk(c,d);
 if(c.id==='sleep')return `${a}: ${Math.abs(d-7)<.0001?'the lowest estimated risk in this curve':Math.abs(extra)<.5?'near the low point of this curve':fmt(extra)+'% higher risk of dying than the low point, in this study'}.`;
 if(c.id==='smoking')return d===0?'Never smoking is the baseline. Quitting does not erase past risk overnight.':`${a}: about ${fmt(extra)}% extra heart disease risk in men.`;
 if(c.id==='alcohol')return d===0?'Lifetime nondrinkers are the baseline.':`${a}: ${extra<0?fmt(Math.abs(extra))+'% lower':fmt(extra)+'% higher'} estimated risk of dying. ${d<3?'The uncertainty includes no difference.':''}`;
 if(c.id==='meditation')return `${a}. The right daily dose is still unknown.`;
 if(c.id==='savings')return `${a} gets you to the target in about ${fmt(M.estimate(c,d))} years: ${fmt(share)}% of this model’s time reduction.`;
 if(c.id==='work')return `${a} captures about ${fmt(share)}% of the added output in this factory curve.`;
 if(c.id==='income')return `${a}: about ${fmt(share)}% of the difference between these groups’ feeling scores.`;
 if(c.id==='fruit-veg')return `The ${fmt(c.points[d].sourceDose,1)}-serving group captures about ${fmt(share)}% of the measured gain.`;
 return `${a} gets you about ${fmt(share)}% of the gain in this range.`;
}
function physical(c,d){return c.kind==='categories'&&c.id!=='alcohol'?c.points[Math.round(d)].sourceDose:d;}
function chart(c,width,d,overview=false){
 const w=Math.max(180,width),h=overview?(w<500?154:186):194,L=42,R=12,T=26,B=34,pw=w-L-R,ph=h-T-B;
 let [min,max]=c.view.range;
 const pMin=physical(c,min),pMax=physical(c,max),x=v=>L+(physical(c,v)-pMin)/(pMax-pMin)*pw;
 const mode=c.view.mode,minY=mode==='harm'&&c.id==='alcohol'?-10:0,maxY=mode==='harm'?(c.id==='smoking'?110:40):mode==='sweet'?60:100;
 const y=v=>T+(maxY-v)/(maxY-minY)*ph;
 const value=(v,key='effect')=>mode==='benefit'?M.share(c,v,key):100*(M.estimate(c,v,key)-1);
 const ps=c.kind==='categories'?c.points.map(p=>p.dose):M.series(c).map(p=>p.dose);
 const path=(values,key='effect')=>values.map((v,i)=>`${i?'L':'M'}${x(v).toFixed(2)},${y(value(v,key)).toFixed(2)}`).join(' ');
 const selected=Math.min(d,max),point=value(selected),clip='en-clip-'+c.id+(overview?'-overview':'');
 const baseY=y(0),line=path(ps);
 const tickValues=w<500&&c.id==='income'?[0,12,14]:w<500&&c.id==='smoking'?[0,2,3]:w<500&&c.id==='alcohol'?[0,2,5]:c.ticks;
 const ticks=tickValues.map(v=>{let label=c.kind==='categories'?c.points[v].shortLabel:c.id==='protein'?fmt(v,2):fmt(v,1);return `<text x="${x(v)}" y="${h-15}" text-anchor="${v===min?'start':v===max?'end':'middle'}">${esc(label)}</text>`;}).join('');
 const yticks=mode==='benefit'?[0,90,100]:mode==='sweet'?[0,30,60]:c.id==='alcohol'?[-10,0,20,40]:[0,50,100];
 const d90=M.enough(c),sweet=mode==='sweet'?M.sleepRange(c):null;
 const band=sweet?`<rect x="${x(sweet[0])}" y="${T}" width="${x(sweet[1])-x(sweet[0])}" height="${ph}" class="en-area"/>`:'';
 const dots=c.kind==='categories'?ps.map(v=>`<circle cx="${x(v)}" cy="${y(value(v))}" r="3" fill="var(--area)"/>`).join(''):'';
 return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><clipPath id="${clip}"><rect x="${L}" y="${T-2}" width="${Math.max(0,x(selected)-L)}" height="${ph+3}"/></clipPath></defs><text x="${L}" y="14">${mode==='benefit'?'Share of the gain':mode==='sweet'?'Extra risk of dying, %':'Extra risk, %'}</text>${yticks.map(v=>`<line class="en-grid" x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}${mode==='benefit'?'%':''}</text>`).join('')}${band}<line class="en-axis" x1="${L}" x2="${w-R}" y1="${baseY}" y2="${baseY}"/>${d90!==null?`<line class="en-guide" x1="${x(d90)}" x2="${x(d90)}" y1="${T}" y2="${T+ph}"/>`:''}<path class="en-area" clip-path="url(#${clip})" d="${line} L${x(max)},${baseY} L${x(min)},${baseY}Z"/><path class="en-curve en-remainder" style="${c.kind==='categories'?'stroke-dasharray:3 5':''}" d="${line}"/><path class="en-curve" clip-path="url(#${clip})" style="${c.kind==='categories'?'stroke-dasharray:3 5':''}" d="${line}"/>${dots}<circle class="en-dot" cx="${x(selected)}" cy="${y(point)}" r="5"/>${ticks}</svg>`;
}
function detail(c){
 const d=M.enough(c),s=M.sensitivity(c),src=c.sources.map(s=>`<a href="${esc(s.url)}">${esc(s.citation)}</a> (${esc(s.location)})`).join('<br>');
 let method=c.view.mode==='benefit'?`Within the range shown, ${threshold(c,d)} reaches ${c.kind==='categories'?'at least':'about'} 90% of the gain. This is a bounded summary, not a personal target or an absolute maximum.`:c.view.mode==='sweet'?'The highlighted 6 to 7.25 hours stays within 1% of this curve’s lowest estimated risk. That margin is a display choice, not a clinical sleep range.':'';
 let sensitivity=s?`Separately normalizing curves from the reported lower and upper limits moves the crossing from ${threshold(c,s[0])} to ${threshold(c,s[1])}. This is sensitivity to pointwise limits, not a confidence interval for the enough point.`:c.uncertainty;
 if(c.id==='protein')sensitivity=c.uncertainty;
 const categories=c.kind==='categories'?'Dots are published groups. Any dotted connection is a visual guide, not a continuous dose prediction. Dragging selects a group.':'';
 const table=c.points.length?`<div class="enough-table-wrap"><table><caption>Stored study estimates: ${esc(c.effectUnit)}${c.points.length>40?' (selected rows)':''}</caption><thead><tr><th scope="col">Amount</th><th scope="col">Estimate</th><th scope="col">Limits</th></tr></thead><tbody>${c.points.filter((_,i)=>i%Math.max(1,Math.ceil(c.points.length/30))===0||i===c.points.length-1).map(p=>`<tr><th scope="row">${esc(amount(c,p.dose))}</th><td>${fmt(p.effect,3)}</td><td>${p.low===null?'Unavailable':fmt(p.low,3)+' to '+fmt(p.high,3)}</td></tr>`).join('')}</tbody></table></div>`:'';
 return `<details class="enough-detail"><summary>Evidence and limits</summary><p>${esc(c.evidence)}. ${esc(c.population)}</p><p>${esc(plain(method))}</p><p>${esc(plain(sensitivity))}</p>${s?`<p>${esc(plain(c.uncertainty))}</p>`:''}<p>${c.kind==='unknown'?'The empty space means the daily dose curve is unknown. It does not mean meditation has no benefit.':categories||'The line uses published coordinates or an explicitly reconstructed author model. Between published coordinates, straight lines preserve the stored values.'}</p>${c.id==='exercise'?'<p>This window contains 94% of the source’s person-years. The author model extends to about 2,229 minutes. Its full-range 90% point is about 1,678 minutes; restricting it to 0–300 instead gives about 142 minutes. The chosen range matters.</p>':''}${c.id==='fiber'?'<p>We chose 7–35 grams, inside the figure’s approximate 6–35 gram extent. The source prints a log-linear slope of 0.93 per 8 grams. This reconstruction uses that slope, not digitized points from the separate curved fit. Its endpoint-dependent 90% mark is not a fiber optimum.</p>':''}${c.caveats.map(t=>`<p>${esc(t)}</p>`).join('')}${table}<p><strong>How this was drawn.</strong> ${esc(c.extraction)}</p><p>${src}</p><p><a href="js/enough-data.js">Complete data and model definitions</a>. Checked ${esc(c.verified)}.</p></details>`;
}
for(const [area,title,dek,ids]of groups){
 const section=document.createElement('section');section.className='enough-group';section.style.setProperty('--area',`var(--en-${area})`);section.setAttribute('aria-labelledby','area-'+area);
 section.innerHTML=`<div class="area-heading"><h2 id="area-${area}">${esc(title)}</h2><p>${esc(dek)}</p></div><div class="${ids.length>1?'enough-grid':'enough-feature'}"></div>`;
 for(const id of ids){const c=curves.get(id),card=document.createElement('article');card.id=id;card.className='enough-card'+(ids.length===1?' feature':'');
 const d90=M.enough(c),enoughSentence=d90!==null?`90% in this range: ${threshold(c,d90)}.`:'';
 const controls=c.kind==='unknown'?'':`<label class="enough-sr" for="range-${id}">${esc(c.question)} ${esc(c.view.rangeLabel)}</label><input id="range-${id}" type="range" min="${c.domain[0]}" max="${c.domain[1]}" value="${c.defaultDose}" step="${c.kind==='categories'?1:c.id==='steps'?100:c.id==='protein'?.001:c.id==='sleep'?.1:c.id==='work'?.5:1}" aria-describedby="readout-${id} range-note-${id}"><output class="enough-readout" id="readout-${id}" for="range-${id}"></output>`;
 card.innerHTML=`<div class="card-copy"><span class="shape">${esc(shape(c))}</span><h3>${esc(c.question)}</h3><p class="enough-answer">${esc(c.view.answer)}</p><p class="enough-fact">${esc(c.fact)}</p>${c.id==='savings'?'<p class="enough-range-note">Start at $0. Assume 5% annual growth after inflation and a 4% annual withdrawal target.</p>':''}</div><div class="card-plot">${c.kind==='unknown'?'<div class="enough-unknown-space">The curve is still missing.</div>':'<div class="enough-chart"></div>'}${controls}<p class="enough-range-note" id="range-note-${id}">${esc(c.view.rangeLabel)}.${enoughSentence?' '+esc(enoughSentence):''}</p></div>${detail(c)}`;
 if(c.kind==='unknown'){card.querySelector('.enough-range-note').textContent='A trial compared 10 and 30 minutes. It found no clear difference, which does not prove they work equally.';section.lastElementChild.append(card);continue;}
 section.lastElementChild.append(card);const input=card.querySelector('input'),output=card.querySelector('output'),plot=card.querySelector('.enough-chart');
 const update=()=>{const d=Number(input.value),t=text(c,d);output.textContent=t;input.setAttribute('aria-valuetext',t);if(plot)plot.innerHTML=chart(c,plot.clientWidth,d);};
 input.addEventListener('input',update);states.set(id,{c,input,update});
 if(plot){let active=false;const choose=e=>{const r=plot.getBoundingClientRect(),f=M.clamp((e.clientX-r.left-42)/(r.width-54),0,1);let value;
 if(c.kind==='categories'&&c.id!=='alcohol'){const target=physical(c,0)+f*(physical(c,c.points.length-1)-physical(c,0));value=c.points.reduce((best,p)=>Math.abs(p.sourceDose-target)<Math.abs(best.sourceDose-target)?p:best).dose;}else value=c.domain[0]+f*(c.domain[1]-c.domain[0]);input.value=value;update();};
 plot.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;active=true;input.focus({preventScroll:true});plot.setPointerCapture(e.pointerId);choose(e);});plot.addEventListener('pointermove',e=>{if(active)choose(e);});for(const event of['pointerup','pointercancel'])plot.addEventListener(event,()=>{active=false;});plot.style.touchAction='pan-y';}
 }
 $('enough-groups').append(section);
}
$('enough-loading')?.remove();
const overviewIds=['steps','exercise','protein'];let layout=new URLSearchParams(location.search).get('layout')||'overlay';
function overview(){
 const f=Number($('overview-effort').value)/100,box=$('overview-chart'),w=box.clientWidth,h=w<500?154:186,L=42,R=12,T=26,B=34,pw=w-L-R,ph=h-T-B,x=v=>L+v*pw,y=v=>T+(100-v)/100*ph;
 const records=overviewIds.map(id=>{const c=curves.get(id),d=c.domain[0]+f*(c.domain[1]-c.domain[0]);return{c,d,s:M.share(c,d)};});
 $('overview-percent').textContent=fmt(f*100)+'%';$('overview-effort').setAttribute('aria-valuetext',fmt(f*100)+' percent through each displayed dose range');
 $('overview-message').textContent=`${fmt(f*100)}% through each range: ${fmt(Math.min(...records.map(r=>r.s)))}–${fmt(Math.max(...records.map(r=>r.s)))}% of its gain.`;
 let lines='';for(const {c,d}of records){const ps=M.series(c),line=ps.map((p,i)=>`${i?'L':'M'}${x((p.dose-c.domain[0])/(c.domain[1]-c.domain[0])).toFixed(2)},${y(M.share(c,p.dose)).toFixed(2)}`).join(' '),dash=c.id==='exercise'?'stroke-dasharray:5 5;':'';
 lines+=`<g style="--area:var(--en-${c.view.area})"><path class="en-area" clip-path="url(#overview-clip)" d="${line}L${x(1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="en-curve en-remainder" style="${dash}" d="${line}"/><path class="en-curve" clip-path="url(#overview-clip)" style="${dash}" d="${line}"/><circle class="en-dot" cx="${x(f)}" cy="${y(M.share(c,d))}" r="4.5"/></g>`;
 }
 if(layout==='rings')box.innerHTML=`<div class="enough-rings">${records.map(({c,s})=>`<div class="enough-ring" style="--area:var(--en-${c.view.area})"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" fill="none" stroke="var(--rule)" stroke-width="8"/><circle cx="60" cy="60" r="48" fill="none" stroke="var(--area)" stroke-width="8" pathLength="100" stroke-dasharray="${s} 100" transform="rotate(-90 60 60)"/></svg><b>${fmt(s)}%</b></div>`).join('')}</div>`;
 else if(layout==='smalls')box.innerHTML=`<div class="enough-smalls">${records.map(({c,d})=>`<div style="--area:var(--en-${c.view.area})">${chart(c,w<500?w:(w-32)/3,d,true)}</div>`).join('')}</div>`;
 else box.innerHTML=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><clipPath id="overview-clip"><rect x="${L}" y="${T-3}" width="${f*pw}" height="${ph+5}"/></clipPath></defs><text x="${L}" y="14">Share of each curve’s gain</text>${[0,50,90,100].map(n=>`<line class="en-grid" x1="${L}" x2="${w-R}" y1="${y(n)}" y2="${y(n)}"/><text x="${L-7}" y="${y(n)+4}" text-anchor="end">${n}%</text>`).join('')}<line class="en-guide" x1="${x(f)}" x2="${x(f)}" y1="${T}" y2="${T+ph}"/>${lines}${[0,.5,1].map(n=>`<text x="${x(n)}" y="${h-12}" text-anchor="${n===0?'start':n===1?'end':'middle'}">${n*100}%</text>`).join('')}</svg>`;
 $('overview-legend').innerHTML=records.map(({c,d,s})=>`<div class="overview-key" style="--area:var(--en-${c.view.area})"><a href="#${c.id}">${c.id==='steps'?'Walking':c.id==='exercise'?'Exercise':'Protein'}</a><b>${fmt(s)}%<small>of this gain</small></b><span>${c.id==='steps'?fmt(d)+'/day':c.id==='exercise'?fmt(d)+' min/week':fmt(d,2)+' g/lb/day'}</span><small class="overview-range">${c.id==='steps'?'2,000–12,000<br>steps/day':c.id==='exercise'?'0–600<br>min/week':'0.41–1.09<br>g/lb/day'}</small><em class="overview-enough">90% at ${c.id==='steps'?'10,500/day':c.id==='exercise'?'343 min/week':'0.70 g/lb/day'}</em></div>`).join('');
}
$('overview-effort').addEventListener('input',overview);
function personal(){
 const form=$('enough-form'),result=$('enough-results'),rows=[];let invalid=false;
 for(const id of ['steps','exercise','sleep','fruit-veg','protein','work']){
  const raw=form.elements.namedItem(id).value.trim();if(!raw)continue;const el=form.elements.namedItem(id),c=curves.get(id);if(!el.validity.valid){invalid=true;continue;}let d=Number(raw);
  if(id==='protein'){const wt=form.elements.weight;if(!wt.value){rows.push('<p>Add body weight to place your protein.</p>');continue;}if(!wt.validity.valid){invalid=true;continue;}d/=Number(wt.value);}
  let out=false;if(id==='fruit-veg'){const p=c.points;out=d<p[0].sourceDose||d>p.at(-1).sourceDose;d=p.reduce((a,p)=>Math.abs(p.sourceDose-d)<Math.abs(a.sourceDose-d)?p:a).dose;}else out=d<c.domain[0]||d>c.domain[1];
  if(out){rows.push(`<div class="personal-row" style="--area:var(--en-${c.view.area})"><p>${esc(c.question)} Your amount is outside the shown range.</p><small>${esc(c.view.rangeLabel)}. No estimate beyond it.</small></div>`);continue;}
  const share=id==='sleep'?100*(d-c.domain[0])/(c.domain[1]-c.domain[0]):M.share(c,d);const label=id==='sleep'?`${fmt(d,1)} hours: ${d>=6&&d<=7.25?'near the low point of this curve':'away from this curve’s low point'}.`:text(c,d);
  rows.push(`<div class="personal-row" style="--area:var(--en-${c.view.area})"><p>${esc(label)}</p>${id==='sleep'?`<div class="sleep-track" role="img" aria-label="${esc(label)}"><span class="sleep-zone"></span><i style="left:${share}%"></i></div>`:`<div class="personal-bar" role="img" aria-label="${esc(label)}"><span style="width:${M.clamp(share,0,100)}%"></span></div>`}${id==='sleep'?'<small>The bar marks hours across 3–11; it is not a share of health benefits.</small>':id==='work'?'<small>Historical factory output, not your productivity.</small>':''}<small><a href="#${id}">See the curve</a></small></div>`);
 }
 result.innerHTML=(invalid?'<p class="enough-error">Use a number within the field’s limits. Body weight must be greater than zero.</p>':'')+rows.join('');
}
$('enough-form').addEventListener('input',personal);$('enough-form').addEventListener('submit',e=>e.preventDefault());$('enough-form').addEventListener('reset',()=>setTimeout(personal,0));
const sources=new Map();for(const c of data.curves)for(const s of c.sources)sources.set(s.url,s);$('enough-sources').innerHTML=[...sources.values()].map(s=>`<li><a href="${esc(s.url)}">${esc(s.citation)}</a></li>`).join('');
const params=new URLSearchParams(location.search),painting=params.get('painting');if(['homer','chardin'].includes(painting)){
 $('hero-painting').src='assets/enough/'+painting+'.jpg';$('hero-painting').style.objectPosition=painting==='homer'?'center 55%':'center 65%';$('hero-picture').querySelector('source').srcset='assets/enough/'+painting+'.webp';$('hero-painting').alt=painting==='homer'?'Four people sail a small boat in Winslow Homer’s Breezing Up.':'Fruit, a jug and a glass on a table, painted by Chardin.';
 $('painting-credit').innerHTML=painting==='homer'?'Winslow Homer, <a href="https://www.nga.gov/artworks/30228-breezing-fair-wind">Breezing Up (A Fair Wind)</a>,1873–1876. National Gallery of Art,1943.13.1. Public domain.':'Jean Simeon Chardin, <a href="https://www.nga.gov/artworks/12202-fruit-jug-and-glass">Fruit, Jug, and a Glass</a>,c.1726/1728. National Gallery of Art,1943.7.4. Public domain.';
}
if(params.get('colors')==='quiet'){for(const area of ['move','lift','rest','eat','money','work'])document.querySelector('.enough-shell').style.setProperty('--en-'+area,'var(--accent)');}
let timer;const resize=()=>{clearTimeout(timer);timer=setTimeout(()=>{overview();for(const s of states.values())s.update();},60);};window.addEventListener('resize',resize);$('overview-chart').classList.add('en-initial');overview();for(const s of states.values())s.update();personal();
const hash=decodeURIComponent(location.hash.slice(1));if(states.has(hash))requestAnimationFrame(()=>$ (hash)?.scrollIntoView());
})();
