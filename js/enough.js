/* Enough: source points stay distinct from connecting guides and predictions. */
(() => {
  'use strict';
  const data = window.EnoughData;
  const format = (n, digits = 1) => Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function estimate(curve, dose) {
    if (curve.id === 'savings') {
      const rate=dose/100; const calc=(r,w)=>Math.log1p(r*(1-rate)/(w*rate))/Math.log1p(r);
      return {dose,effect:calc(.05,.04),low:null,high:null,scenarioLow:calc(.07,.05),scenarioHigh:calc(.03,.03)};
    }
    if (curve.kind === 'unknown') return { dose, effect: null, low: null, high: null };
    if (curve.kind === 'categories') return curve.points[Math.round(clamp(dose, 0, curve.points.length-1))];
    const pts = curve.points;
    if (dose <= pts[0].dose) return pts[0];
    if (dose >= pts.at(-1).dose) return pts.at(-1);
    const i = pts.findIndex(p => p.dose >= dose), a = pts[i-1], b = pts[i], t = (dose-a.dose)/(b.dose-a.dose);
    const mix = key => a[key] === null || b[key] === null ? null : a[key] + (b[key]-a[key])*t;
    return { dose, effect: mix('effect'), low: mix('low'), high: mix('high'), source: a.source };
  }
  function ninety(curve) {
    if (!curve.ceiling || curve.ceiling.referenceDose !== 0) return null;
    const pts = curve.points, start = pts.find(p => p.dose === 0);
    if (!start) return null;
    const target = start.effect + .9 * (curve.ceiling.effect - start.effect);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i-1], b = pts[i];
      if ((target-a.effect)*(target-b.effect) <= 0 && a.effect !== b.effect) return a.dose + (b.dose-a.dose)*(target-a.effect)/(b.effect-a.effect);
    }
    return null;
  }
  function doseText(c, n) {
    if (c.kind === 'categories') return c.points[Math.round(clamp(n,0,c.points.length-1))].label;
    if (c.unit === 'USD/year') return '$' + format(n,0) + ' a year';
    if (c.unit === 'g/lb/day') return format(n,2) + ' g/lb a day';
    return format(n,c.doseDigits ?? 1) + ' ' + c.unitLabel;
  }
  function effectText(c,p) {
    if (p.effect === null) return 'no reliable benefit estimate';
    if (c.effectKind === 'risk') {
      const delta = Math.round((p.effect-1)*100);
      return delta === 0 ? 'comparison group' : Math.abs(delta) + '% ' + (delta < 0 ? 'lower' : 'higher') + ' ' + c.outcome + ' in the study';
    }
    if (c.effectKind === 'years') return format(p.effect,1) + ' years in this calculation';
    if (c.effectKind === 'mood') return format(p.effect,1) + ' / 100 average reported mood';
    if (c.effectKind === 'lean') return '+' + format(p.effect,1) + ' lb in the fitted comparison';
    if (c.effectKind === 'change') return (p.effect>=0 ? '+' : '') + format(p.effect,2) + ' ' + c.effectUnit;
    return format(p.effect,2) + ' ' + c.effectUnit;
  }
  window.EnoughMath = { estimate, ninety, doseText, effectText };
  if (!data || typeof document === 'undefined') return;
  const grid = document.getElementById('enough-grid');
  if (!grid) return;
  const states = new Map();
  const shapes = { plateau:'Flattens in this model', continues:'No ceiling established', sweet:'A low point, with limits', less:'Less is better', unknown:'No daily curve established', unresolved:'No clear gain from more', similar:'Similar results across groups', association:'A link, with a disputed cause' };
  function chart(c) {
    const [xmin,xmax] = c.domain, [ymin,ymax] = c.yDomain;
    const x = n => 46 + (n-xmin)/(xmax-xmin)*340;
    const y = n => 181 - (n-ymin)/(ymax-ymin)*127;
    const path = (pts,key) => pts.map((p,i) => `${i?'L':'M'}${x(p.dose).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
    const finite = c.points.filter(p => p.effect !== null && p.dose>=xmin && p.dose<=xmax);
    let band = '';
    if (c.scenarioEnvelope) band = `<path class="e-band" d="${path(finite,'scenarioLow')} ${path([...finite].reverse(),'scenarioHigh').replace(/^M/,'L')} Z"/>`;
    if (finite.length && finite.every(p => p.low !== null && p.high !== null)) band = `<path class="e-band" d="${path(finite,'low')} ${path([...finite].reverse(),'high').replace(/^M/,'L')} Z"/>`;
    if (c.marker.interval) band += `<rect class="e-band" x="${x(c.marker.interval[0])}" y="46" width="${x(c.marker.interval[1])-x(c.marker.interval[0])}" height="135"/>`;
    const markers = c.marker.doses.map(d => `<line class="e-marker" x1="${x(d)}" x2="${x(d)}" y1="48" y2="181"/>`).join('');
    return `<div class="enough-chart"><svg viewBox="0 0 400 238" aria-hidden="true">
      <text x="4" y="20">${escape(c.yLabel)}</text>
      <g class="enough-bands" style="display:none">${band}</g>
      <line class="e-axis" x1="46" x2="386" y1="181" y2="181"/>
      ${c.kind==='unknown'?'':c.yTicks.map(n=>`<text x="38" y="${y(n)+4}" text-anchor="end">${format(n,c.yDigits ?? 1)}</text>`).join('')}
      ${c.ticks.map(n=>`<line class="e-axis" x1="${x(clamp(n,xmin,xmax))}" x2="${x(clamp(n,xmin,xmax))}" y1="181" y2="185"/><text x="${x(clamp(n,xmin,xmax))}" y="207" text-anchor="${n<=xmin+(xmax-xmin)*.025?'start':n>=xmax-(xmax-xmin)*.025?'end':'middle'}">${c.kind==='categories'?escape(c.points[n].shortLabel):c.unit==='USD/year'?'$'+format(n/1000,0)+'k':format(n,c.doseDigits??1)}</text>`).join('')}
      <text x="216" y="232" text-anchor="middle">${escape(c.xLabel)}</text>
      ${markers}${finite.length?`<path class="e-line ${c.kind==='categories'?'e-category-line':''}" d="${path(finite,'effect')}"/>`:''}
      ${c.kind==='unknown'?'<text class="e-unknown" x="216" y="106" text-anchor="middle">More minutes: benefit unknown</text>':finite.filter((_,i)=>i%Math.max(1,Math.ceil(finite.length/20))===0||i===finite.length-1).map(p=>`<circle class="e-point" cx="${x(p.dose)}" cy="${y(p.effect)}" r="3"/>`).join('')}
      <circle class="e-handle" r="7" cx="${x(c.defaultDose)}" cy="${c.kind==='unknown'?181:y(estimate(c,c.defaultDose).effect)}"/>
    </svg><label class="enough-sr" for="range-${c.id}">${escape(c.question)} Choose ${escape(c.xLabel)}.</label>
    <input class="enough-range" id="range-${c.id}" type="range" min="${xmin}" max="${xmax}" step="${c.step}" value="${c.defaultDose}" aria-describedby="readout-${c.id} fact-${c.id}" />
    </div>`;
  }
  function detail(c) {
    const sources = c.sources.map(s=>`<a href="${escape(s.url)}">${escape(s.citation)}</a> (${escape(s.location)})`).join('<br>');
    const table = c.points.length ? `<div class="enough-table-wrap"><table><caption class="enough-sr">Stored estimates for ${escape(c.question)}</caption><thead><tr><th scope="col">Amount</th><th scope="col">Estimate</th><th scope="col">Limits</th></tr></thead><tbody>${c.points.filter((_,i)=>i%Math.max(1,Math.ceil(c.points.length/30))===0||i===c.points.length-1).map(p=>`<tr><th scope="row">${escape(p.label||doseText(c,p.dose))}</th><td>${format(p.effect,c.effectKind==='risk'?3:2)}</td><td>${p.low===null?'Unavailable':format(p.low,3)+' to '+format(p.high,3)}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<details class="enough-detail"><summary>Evidence and limits</summary>
      <p><strong>${escape(c.evidence)}.</strong> ${escape(c.population)}</p>
      <p>${c.evidence.toLowerCase().includes('meta')?'A pooled analysis combines results from several studies. A dose regression asks whether those results change as the amount changes. ':''}${c.evidence.toLowerCase().includes('cohort')?'A cohort study follows people over time; their daily habits were observed rather than assigned. ':''}</p>
      <p>${escape(c.marker.reason)}</p><p>${escape(c.uncertainty)}</p>
      ${c.kind==='categories'?'<p>Dots are published groups. The dotted line is a guide between them, not a prediction for every amount. Groups are spaced equally; dragging selects a published range.</p>':c.kind==='unknown'?'<p>The empty plot means the response is unknown. It does not mean the practice has no benefit.</p>':'<p>Between stored points the display uses straight lines. These are study estimates, not personal predictions.</p>'}
      ${c.effectKind==='risk'?'<p>The numbers compare rates between groups. A value of 0.70 means a 30 percent lower rate, not 30 extra years or a 30 percent guarantee. Observational associations can reflect differences in health and habits.</p>':''}
      ${c.intervalKind==='credible'?'<p>The shaded band is a 95 percent credible interval: under this statistical model, the estimated comparison has a 95 percent probability of lying inside it. It does not describe individual results.</p>':c.scenarioEnvelope?'<p>The shaded band shows two sets of assumptions, not statistical confidence limits. Actual market outcomes can fall outside it.</p>':'<p>Shaded limits show uncertainty in the estimate, not the range of outcomes for individuals. A confidence interval is a range compatible with the data and the method. An absent interval stays absent.</p>'}
      ${c.caveats.map(t=>`<p>${escape(t)}</p>`).join('')}${table}${c.points.length>30?'<p>The table shows selected stored points. <a href="js/enough-data.js">All curve data</a> includes the complete grid and a source for each value.</p>':''}
      <p><strong>How this was drawn.</strong> ${escape(c.extraction)}</p><p>${sources}</p><p>Checked ${escape(c.verified)}.</p>
    </details>`;
  }
  for (const c of data.curves) {
    const card = document.createElement('article'); card.className = 'enough-card'; card.id = c.id;
    card.innerHTML = `<span class="enough-shape">${escape(c.shapeLabel||shapes[c.shape])}</span><h2>${escape(c.question)}</h2><p class="enough-marker-label">${escape(c.marker.label)}</p>${chart(c)}<output class="enough-readout" id="readout-${c.id}" for="range-${c.id}"></output><p class="enough-fact" id="fact-${c.id}">${escape(c.fact)}</p>${detail(c)}`;
    grid.append(card);
    const input = card.querySelector('input'), output = card.querySelector('output');
    const update = () => {
      const n = Number(input.value), p = estimate(c,n), [xmin,xmax]=c.domain, [ymin,ymax]=c.yDomain;
      const text = 'You: ' + doseText(c,n) + '. '+(c.scenarioEnvelope?'Calculation: ':c.kind==='unknown'?'Evidence: ':'Study: ') + effectText(c,p) + '.';
      output.textContent=text; input.setAttribute('aria-valuetext',text);
      const circle=card.querySelector('.e-handle'); circle.setAttribute('cx',46+(p.effect===null?n:p.dose)/(xmax-xmin)*340-xmin/(xmax-xmin)*340);
      // Continuous readout uses the selected dose, category plots snap to the source dot.
      if(c.kind!=='categories') circle.setAttribute('cx',46+(n-xmin)/(xmax-xmin)*340);
      circle.setAttribute('cy',p.effect===null?181:181-(p.effect-ymin)/(ymax-ymin)*127);
    };
    input.addEventListener('input',update); update();
    card.querySelector('details').addEventListener('toggle',e=>{card.querySelector('.enough-bands').style.display=e.target.open?'':'none';});
    states.set(c.id,{c,input,update});
  }
  document.getElementById('enough-loading')?.remove();
  const sourceList = document.getElementById('enough-sources');
  const unique = new Map(); data.curves.forEach(c=>c.sources.forEach(s=>unique.set(s.url,s)));
  for(const s of unique.values()){const li=document.createElement('li');li.innerHTML=`<a href="${escape(s.url)}">${escape(s.citation)}</a> ${escape(s.location)}.`;sourceList.append(li);}
  const form=document.getElementById('enough-form'), results=document.getElementById('enough-results');
  function personal(){
    const values=Object.fromEntries(new FormData(form)), suggestions=[]; let invalid=false;
    const add=(id,raw,label)=>{
      if(raw.trim()==='')return;
      const field=form.elements.namedItem(id==='work'?'work':id);if(field&&(!field.validity.valid)){invalid=true;return;}
      const n=Number(raw), state=states.get(id); if(!state||!Number.isFinite(n)||n<0){invalid=true;return;}
      const c=state.c, lo=c.kind==='categories'?c.points[0].from:c.domain[0],hi=c.kind==='categories'?(c.points.at(-1).to??Infinity):c.domain[1];
      const selected=c.kind==='categories'?c.points.find(p=>n>=p.from&&(p.to===null||n<p.to))?.dose:clamp(n,lo,hi);
      const marker=c.marker.doses[0], target=c.kind==='categories'?c.points[marker]?.from:marker, p=estimate(c,selected??0);
      state.input.value=selected??0;state.update();
      const outside=n<lo||n>hi;
      const gap=target===undefined||c.id==='sleep'||c.id==='work'?null:Math.max(0,c.better==='lower'?n-target:target-n);
      let sentence=`${label}: ${c.kind==='categories'?format(n,1)+' '+c.unitLabel:doseText(c,n)}. `;
      if(outside)sentence+='That is outside this plot; no estimate is extrapolated. ';
      else sentence+=effectText(c,p)+'. ';
      sentence+=c.personalNote || (gap>0?`The marked amount is ${doseText(c,marker)}.`:'You are at or past the marked amount; the study does not set your personal need.');
      suggestions.push({id,sentence,rank:gap===null?2:gap/(target>0?target:1)});
    };
    add('steps',values.steps,'Walking');add('sleep',values.sleep,'Sleep');add('exercise',values.exercise,'Activity');
    if(values.protein.trim()!==''||values.weight.trim()!==''){
      const g=Number(values.protein),w=Number(values.weight);
      if(values.protein.trim()===''||values.weight.trim()==='')suggestions.push({sentence:'To place protein, enter both daily grams and body weight in pounds.',rank:3});
      else if(!Number.isFinite(g)||!Number.isFinite(w)||g<0||w<=0||!form.elements.protein.validity.valid||!form.elements.weight.validity.valid)invalid=true;
      else add('protein',String(g/w),'Protein');
    }
    if(values.work.trim()!=='')add('work',values.work,'Work');
    results.replaceChildren();
    if(invalid){const p=document.createElement('p');p.className='enough-error';p.textContent='Use a nonnegative number within the input limits. Body weight must be greater than zero.';results.append(p);}
    if(!suggestions.length&&!invalid){results.textContent='Enter any number to see where it falls. Leave the rest blank.';return;}
    const list=document.createElement('ol');suggestions.sort((a,b)=>a.rank-b.rank).forEach(s=>{const li=document.createElement('li');li.textContent=s.sentence;if(s.id){const a=document.createElement('a');a.href='#'+s.id;a.textContent=' See the curve.';li.append(a);}list.append(li);});results.append(list);
  }
  form.addEventListener('input',personal);form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('reset',()=>{setTimeout(()=>{for(const s of states.values()){s.input.value=s.c.defaultDose;s.update();}personal();},0);});personal();
  const hash=decodeURIComponent(location.hash.slice(1));if(states.has(hash))document.getElementById(hash).scrollIntoView();
})();
