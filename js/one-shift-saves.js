(function(root){
 'use strict';const O=root.OneShift;
 function validate(raw){const s=JSON.parse(JSON.stringify(raw));if(s.version===0){s.version=1;s.map.revision=s.map.revision||0;s.map.wear=s.map.wear||{};s.terms=s.terms||[];}
  if(s.version!==1)throw Error('This save uses an unsupported version.');
  for(const key of ['seed','rng','tick','day','minute','cash','credit','nextId','serial','openingCash'])if(!Number.isFinite(s[key]))throw Error('Invalid save field: '+key);
  if(s.day<1||s.day>100000||s.minute<0||s.minute>1500||!['shift','evening'].includes(s.phase))throw Error('Invalid shift.');
  if(!s.map||!Number.isInteger(s.map.w)||s.map.w<30||s.map.w>512||!Number.isInteger(s.map.h)||s.map.h<30||s.map.h>512)throw Error('Invalid building.');
  for(const key of ['pallets','trucks','workers','contracts','journal','reports','serviceJobs','events','terms'])if(!Array.isArray(s[key]))throw Error('Missing '+key+'.');
  if(s.pallets.length>100000||s.workers.length<1||s.workers.length>128||s.trucks.length>512)throw Error('Save exceeds capacity.');
  const ids=new Set();for(const q of [...s.pallets,...s.trucks,...s.workers.slice(1)]){if(!Number.isSafeInteger(q.id)||q.id<1||ids.has(q.id))throw Error('Invalid entity identifier.');ids.add(q.id);}
  for(const p of s.pallets){if(!O.items[p.item]||!O.client(p.client)||!Number.isInteger(p.cases)||p.cases<0||p.cases>10000||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>s.map.w||p.y<0||p.y>s.map.h)throw Error('Invalid pallet.');O.labels.encode(p.sscc);}
  for(const w of s.workers){if(!Number.isFinite(w.x)||!Number.isFinite(w.y)||w.x<0||w.x>s.map.w||w.y<0||w.y>s.map.h||!Array.isArray(w.queue))throw Error('Invalid worker.');}
  for(const q of s.journal)if(!Number.isSafeInteger(q.cents))throw Error('Invalid ledger.');
  for(const c of s.contracts)if(!O.client(c.id))throw Error('Unknown client.');
  if(!s.goods||Object.values(s.goods).some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid goods totals.');
  const onHand=s.pallets.filter(p=>!['shipped','returned','scrap','empty'].includes(p.place)).reduce((a,p)=>a+p.cases,0);
  if(s.goods.arrived+s.goods.produced!==onHand+s.goods.shipped+s.goods.scrapped+s.goods.consumed)throw Error('Goods do not reconcile.');
  return s;
 }
 const key=slot=>'one-shift-save-'+slot;
 O.saves={validate,encode:s=>JSON.stringify({game:'One Shift',version:1,state:s}),decode:text=>{if(text.length>16000000)throw Error('Save is too large.');const q=JSON.parse(text);if(q.game!=='One Shift')throw Error('Choose a One Shift save.');return validate(q.state);},
  save(s,slot='auto'){try{localStorage.setItem(key(slot),this.encode(s));return true;}catch{return false;}},
  load(slot='auto'){try{const text=localStorage.getItem(key(slot));return text?this.decode(text):null;}catch{return null;}},
  info(slot){try{const raw=localStorage.getItem(key(slot));if(!raw)return null;const q=JSON.parse(raw).state;return {day:q.day,cash:q.cash};}catch{return null;}},
  preferences(){const defaults={volume:.25,reducedMotion:typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion:reduce)').matches,colorblind:false,scale:1,keys:{pause:' ',build:'b',home:'h',interact:'Enter',cancel:'Escape'}};try{return {...defaults,...JSON.parse(localStorage.getItem('one-shift-preferences')||'{}')};}catch{return defaults;}},
  savePreferences(settings){try{localStorage.setItem('one-shift-preferences',JSON.stringify(settings));}catch{}},
  layout(s){return {version:1,building:s.map.building,racks:s.map.racks,doors:s.map.doors,zones:s.map.zones};},
  layoutURL(s){const text=JSON.stringify(this.layout(s));return location.origin+location.pathname+'#layout='+btoa(unescape(encodeURIComponent(text))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 };
})(typeof globalThis!=='undefined'?globalThis:window);
