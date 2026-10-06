'use strict';
// Command-only buyers used by the balance checks. No free money, instant work or state edits.
function policy(sim,style,O){const s=sim.s,c=s.commerce;if(s.phase!=='shift')return;
 if(style==='idle')return;
 for(const o of c.orders.filter(o=>o.status==='offered'))if(o.lines.every(l=>sim.businessStock(l.item).free>=l.cases))sim.command({type:'fulfill',order:o.id});
 for(const item of O.unlockedGoods(s)){const remaining=c.orders.filter(o=>['future','offered'].includes(o.status)).reduce((n,o)=>n+o.lines.filter(l=>l.item===item).reduce((n,l)=>n+l.cases,0),0),stock=sim.businessStock(item);if(stock.free+stock.incoming<remaining&&(style==='planned'||c.orders.some(o=>o.status==='offered'&&o.lines.some(l=>l.item===item)))){const gap=remaining-stock.free-stock.incoming,count=style==='planned'?(gap>=24?32:gap>=12?16:8):16;sim.command({type:'restock',item,count});}}
 if(style!=='planned')return;
 if(c.completed>=5&&!s.owned.walkie&&s.cash>45000)sim.command({type:'buy',id:'walkie'});
 if(c.completed>=8&&sim.businessCapacity().free<2&&s.cash>15000)sim.command({type:'buy',id:'rack'});
 if(c.completed>=15&&!s.owned.training&&s.cash>80000)sim.command({type:'buy',id:'training'});
 if(c.completed>=15&&s.owned.training&&!O.has(s,'forklift')&&s.cash>80000)sim.command({type:'buy',id:'usedLift'});
 if(c.completed>=25&&s.workers.length===1&&O.has(s,'forklift')&&s.cash>45000)sim.command({type:'hire',index:0});
}
module.exports={policy};
