/* Shares describe improvement inside one declared range, never a common health score. */
(() => {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function estimate(c,d,key='effect'){
    if(c.kind==='unknown')return null;
    if(c.kind==='categories')return c.points[Math.round(clamp(d,0,c.points.length-1))][key];
    if(key==='effect'){
      if(c.id==='protein')return 1.75*(Math.min(d*2.20462262185,1.62)-.9)*2.20462262185;
      if(c.id==='work')return 126.089*(d-24)-4.533*Math.max(0,d-49)**2;
    }
    if(c.id==='fiber')return (key==='low'?.90:key==='high'?.95:.93)**((d-7)/8);
    if(c.id==='savings'){
      const s=d/100,[r,w]=key==='scenarioLow'?[.07,.05]:key==='scenarioHigh'?[.03,.03]:[.05,.04];
      return ['low','high'].includes(key)?null:Math.log1p(r*(1-s)/(w*s))/Math.log1p(r);
    }
    const p=c.points;if(d<=p[0].dose)return p[0][key];if(d>=p.at(-1).dose)return p.at(-1)[key];
    const i=p.findIndex(p=>p.dose>=d),a=p[i-1],b=p[i];
    if(a[key]===null||b[key]===null||a[key]===undefined||b[key]===undefined)return null;
    return a[key]+(b[key]-a[key])*(d-a.dose)/(b.dose-a.dose);
  }
  function series(c,key='effect'){
    if(c.kind==='unknown')return [];const [a,b]=c.view.range;
    let points=c.points.filter(p=>p.dose>=a&&p.dose<=b).map(p=>({dose:p.dose,effect:estimate(c,p.dose,key)}));
    if(c.kind!=='categories')for(const d of [a,b])if(!points.some(p=>p.dose===d))points.push({dose:d,effect:estimate(c,d,key)});
    return points.sort((a,b)=>a.dose-b.dose);
  }
  const cache=new WeakMap();
  function basis(c,key='effect'){
    if(cache.get(c)?.[key])return cache.get(c)[key];
    const ps=series(c,key);if(!ps.length||ps.some(p=>p.effect===null||!Number.isFinite(p.effect)))return null;
    const sign=c.better==='lower'?-1:1,origin=ps[0].effect;
    const best=ps.reduce((a,b)=>sign*b.effect>sign*a.effect?b:a),span=sign*(best.effect-origin);
    const result=span>0?{origin,span,sign,best}:null;
    if(!cache.has(c))cache.set(c,{});cache.get(c)[key]=result;return result;
  }
  function share(c,d,key='effect'){
    const b=basis(c,key),e=estimate(c,d,key);return b&&e!==null?100*b.sign*(e-b.origin)/b.span:null;
  }
  function enough(c,key='effect'){
    if(c.view.mode!=='benefit')return null;
    const b=basis(c,key);if(!b)return null;
    const ps=series(c,key);
    for(let i=0;i<ps.length;i++)if(b.sign*(ps[i].effect-b.origin)>=.9*b.span-1e-12){
      if(c.kind==='categories'||i===0)return ps[i].dose;
      let a=ps[i-1].dose,z=ps[i].dose;for(let j=0;j<45;j++){const m=(a+z)/2;if(share(c,m,key)>=90)z=m;else a=m;}return(a+z)/2;
    }
    return null;
  }
  function sensitivity(c){const values=['low','high'].map(k=>enough(c,k)).filter(Number.isFinite);return values.length===2?[Math.min(...values),Math.max(...values)]:null;}
  function sleepRange(c){
    const best=Math.min(...c.points.map(p=>p.effect)),threshold=best*(1+c.view.margin),out=[];
    const p=c.points;for(let i=0;i<p.length;i++){
      if(p[i].effect<=threshold+1e-12)out.push(p[i].dose);
      if(i&&((p[i].effect-threshold)*(p[i-1].effect-threshold)<0))out.push(p[i-1].dose+(p[i].dose-p[i-1].dose)*(threshold-p[i-1].effect)/(p[i].effect-p[i-1].effect));
    }return[Math.min(...out),Math.max(...out)];
  }
  // Display source outcomes, never a rescaled share of all possible benefit.
  function outcome(c,d,key='effect'){
    const e=estimate(c,d,key);
    if(c.view.mode==='benefit'){
      if(c.effectKind==='risk')return 100*(1-e/estimate(c,c.view.range[0],key));
      if(c.id==='income')return e-estimate(c,c.view.range[0],key);
      return e;
    }
    return c.view.mode==='model'?e:100*(e-1);
  }
  function extraRisk(c,d){return(estimate(c,d)-1)*100;}
  window.EnoughMath={clamp,estimate,series,basis,share,enough,sensitivity,sleepRange,extraRisk,outcome};
})();
