(function (root) {
  'use strict';
  const O=root.OneShift;
  O.has=(s,id)=>id==='forklift'?!!(s.owned.lift||s.owned.usedLift):!!s.owned[id];
  O.client=id=>O.clients.find(c=>c.id===id);
  O.money=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  O.post=function(s,category,amount,reason) {
    const cents=Math.round(amount*100);s.cash+=cents;
    s.journal.push({day:s.day,minute:s.minute,category,cents,reason});
    const report=s.phase==='evening'&&s.reports.at(-1);if(report&&report.day===s.day){report.entries.push(s.journal.at(-1));report.by[category]=(report.by[category]||0)+cents;report.closing=s.cash;if(!['Purchases','Credit'].includes(category))report.profit+=cents;s.records.profit=Math.max(0,...s.reports.map(r=>r.profit));}
    s.events.push({kind:cents>=0?'fee':'cost',text:(cents>=0?'+':'-')+O.money(Math.abs(cents)/100)+' '+reason,tick:s.tick});if(s.events.length>80)s.events.shift();
  };
  O.afford=function(s,cost) {return s.cash+Math.max(0,50000-s.credit)>=Math.round(cost*100);};
  O.spend=function(s,category,cost,reason) {
    if(!O.afford(s,cost))return false;
    const short=Math.max(0,Math.round(cost*100)-s.cash);
    if(short){s.credit+=short;O.post(s,'Credit',short/100,'Line of credit');}
    O.post(s,category,-cost,reason);return true;
  };
  O.purchaseReason=function(s,id) {
    const e=O.equipment.find(e=>e.id===id);
    if(!e)return 'Unknown equipment.';
    if(!O.liveEquipment.has(id))return 'This equipment is not available in this release.';
    if(s.day===1&&s.phase!=='evening'&&id!=='rack')return 'Finish your first shift to open the shop.';
    if(s.owned[id]&&!['pallets','rack','door','expansion','robot'].includes(id))return 'Already installed.';
    if(e.requires.some(r=>!O.has(s,r)))return 'First: '+e.requires.filter(r=>!O.has(s,r)).map(r=>r==='forklift'?'a forklift':O.equipment.find(e=>e.id===r)?.name||r).join(', ')+'.';
    if(id==='usedLift'&&s.owned.lift||id==='lift'&&s.owned.usedLift)return 'You already have a forklift.';
    if(!O.afford(s,e.cost))return 'Save a little more, or choose a smaller purchase.';
    return '';
  };
  O.settle=function(s) {
    const storage={};for(const p of s.pallets)if(['lane','storage','transit'].includes(p.place)&&(p.cases>0||p.openUnits>0)){const c=O.client(p.client),rate=c.storage*(s.day-p.receivedDay>180?1.5:1);storage[c.id]=(storage[c.id]||0)+rate;}for(const [id,total]of Object.entries(storage))O.post(s,'Storage',total,'Storage: '+O.client(id).name);
    O.post(s,'Rent',-(s.map.building.w*s.map.building.h*.09),'Building rent');
    for(const w of s.workers.slice(1))O.post(s,'Wages',-w.wage*(s.owned.secondShift?1.5:1),w.name+' worked the shift');
    if(O.has(s,'forklift'))O.post(s,'Equipment',-(s.owned.maintenance?3:s.owned.usedLift?9:5),'Power and maintenance');
    if(s.owned.cold)O.post(s,'Utilities',-7,'Cold room power');
    if(s.owned.yard)O.post(s,'Yard',18+6*(s.owned.drop||0),'Trailer parking');
    if(s.owned.baler&&s.cardboard>0){O.post(s,'Recycling',s.cardboard*.06,'Cardboard bales');s.cardboard=0;}
    if(s.owned.repair&&s.emptyPallets>0){const n=Math.min(s.emptyPallets,6);O.post(s,'Pallet repair',n*2,'Repaired pallets');s.emptyPallets-=n;}
    if(s.credit>0){O.post(s,'Interest',-s.credit*.0003/100,'Credit interest');const pay=Math.min(s.credit,Math.max(0,s.cash-20000));if(pay){s.credit-=pay;O.post(s,'Credit',-pay/100,'Credit repayment');}}
    const entries=s.journal.filter(e=>e.day===s.day),by={};for(const e of entries)by[e.category]=(by[e.category]||0)+e.cents;
    const operating=entries.filter(e=>!['Purchases','Credit'].includes(e.category)).reduce((a,e)=>a+e.cents,0);
    const bottleneck=Object.entries(s.workMinutes).sort((a,b)=>b[1]-a[1])[0];
    const report={day:s.day,opening:s.openingCash,closing:s.cash,entries,by,profit:operating,casesShipped:s.dayShipped,onTime:s.dayOnTime,missed:s.dayMissed,bottleneck:bottleneck?.[0]||'No handling work',minutes:bottleneck?.[1]||0};
    s.reports.push(report);if(s.reports.length>365)s.reports.shift();
    s.records.profit=Math.max(s.records.profit,operating);s.phase='evening';s.events.push({kind:'shift',text:'Shift complete. '+O.money(operating/100)+' operating profit.',tick:s.tick});
    return report;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
