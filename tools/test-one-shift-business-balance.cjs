'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./one-shift-driver.cjs'),{policy}=require('./one-shift-business-policy.cjs');
const O=load(),seeds=Number(process.env.SHIFT_BUSINESS_SEEDS||20),days=Number(process.env.SHIFT_BUSINESS_DAYS||24),outcomes=[];
const start=performance.now();
function valid(sim){const r=sim.reconcile();assert.equal(r.expected,r.accounted);O.saves.validate(sim.s);assert.equal(sim.s.cash,sim.s.openingCash+sim.s.journal.filter(e=>e.day===sim.s.day).reduce((n,e)=>n+e.cents,0));}
for(const style of ['planned','reactive'])for(let seed=1;seed<=seeds;seed++){
  const sim=new O.Sim(seed,'business'),daily=[];
  for(let day=1;day<=days;day++){
    let ticks=0;
    while(sim.s.phase==='shift'&&ticks++<14000){if(ticks%10===1)policy(sim,style,O);sim.tick();if(ticks%997===0)valid(sim);}
    assert.equal(sim.s.phase,'evening',style+' seed '+seed+' day '+day+' must close');valid(sim);
    daily.push({day,sold:sim.s.reports.at(-1).onTime,profit:sim.s.reports.at(-1).profit/100,cash:sim.s.cash/100,credit:sim.s.credit/100});
    if(day<days)assert.ok(sim.command({type:'nextDay'}).ok);
  }
  const c=sim.s.commerce,result={style,seed,sold:c.completed,restocked:c.restocked,sales:c.totalSales/100,cash:sim.s.cash/100,credit:sim.s.credit/100,assets:O.businessAssets(sim.s)/100,staff:sim.s.workers.length,won:c.won,daily};
  outcomes.push(result);
  if(style==='planned'){assert.ok(c.completed>=50);assert.ok(c.restocked>=10);assert.ok(sim.s.cash>0);assert.ok(c.won);assert.ok(sim.s.workers.length>=2);}
}
const summaries=Object.fromEntries(['planned','reactive'].map(style=>{const rows=outcomes.filter(o=>o.style===style),avg=k=>Math.round(rows.reduce((n,o)=>n+o[k],0)/rows.length*100)/100;return [style,{runs:rows.length,meanSold:avg('sold'),meanCash:avg('cash'),meanAssets:avg('assets'),minCash:Math.min(...rows.map(o=>o.cash)),wins:rows.filter(o=>o.won).length}];}));
assert.ok(summaries.planned.meanSold>summaries.reactive.meanSold,'Reinvestment and buying ahead should improve throughput');
const root=path.resolve(__dirname,'..'),files=fs.readdirSync(path.join(root,'js')).filter(n=>/^one-shift-.*\.js$/.test(n)).sort();
const sourceHash=crypto.createHash('sha256');for(const name of files)sourceHash.update(name).update(fs.readFileSync(path.join(root,'js',name)));
const result={version:O.VERSION,seeds,days,sourceHash:sourceHash.digest('hex'),elapsedMs:Math.round(performance.now()-start),summaries,outcomes};
const dump=process.env.SHIFT_BALANCE_DUMP||'/Users/ethan/Portfolio_01/research/one-shift/evidence-business/balance.json';fs.mkdirSync(path.dirname(dump),{recursive:true});fs.writeFileSync(dump,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined}));console.log('PASS Command-only business policies conserve cash and stock across '+outcomes.length*days+' shifts');
