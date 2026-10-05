'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),{load,day,evening}=require('./one-shift-driver.cjs');
const styles=['casual','average','expert','storage','throughput','services','fulfillment','crossdock','mixed'];
const output=process.env.SHIFT_EVIDENCE||'/Users/ethan/Portfolio_01/research/one-shift/evidence';
const runs=Number(process.env.SHIFT_RUNS||200),days=Number(process.env.SHIFT_DAYS||60);
if(process.argv[2]==='worker'){
 const style=process.argv[3],O=load(),results=[],sourceHash=require('node:crypto').createHash('sha256').update(['data','content','pathing','economy','sim','fulfillment','rules'].map(q=>fs.readFileSync(path.join(__dirname,'../js/one-shift-'+q+'.js'))).join('')).digest('hex');const start=performance.now();
 for(let seed=1;seed<=runs;seed++){
  const sim=new O.Sim(seed),curve=[],cash=[],speed=[],missed=[];let liftDay=null,hireDay=null;
  for(let d=1;d<=days;d++){
   const before=performance.now(),r=day(sim,O,style);speed.push(performance.now()-before);curve.push(r.profit/100);cash.push(sim.s.cash/100);missed.push(r.missed);
   const g=sim.reconcile();assert.ok(Math.abs(g.expected-g.accounted)<1e-6,style+' seed '+seed+' day '+d+' goods');assert.equal(r.closing,r.opening+r.entries.reduce((a,q)=>a+q.cents,0),style+' ledger');
   if(d<=3){assert.equal(r.missed,0);assert.ok(r.profit>0);}if(d%10===0)O.saves.validate(sim.s);
   if(d<days){evening(sim,O,style);if(O.has(sim.s,'forklift')&&!liftDay)liftDay=d;if(sim.s.workers.length>1&&!hireDay)hireDay=d;assert.ok(!hireDay||liftDay<=hireDay);sim.command({type:'nextDay'});}
  }
  const profit=curve.slice(-10).reduce((a,n)=>a+n,0)/10;results.push({seed,profit,closing:cash.at(-1),curve,cash,missed,liftDay,hireDay,reputation:sim.s.reputation,pallets:sim.s.pallets.length,dayP95:speed.sort((a,b)=>a-b)[Math.floor(speed.length*.95)]});
  if(seed%50===0)process.send?.({style,completed:seed});
 }
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'economy-'+style+'.json'),JSON.stringify({style,runs,days,sourceHash,elapsedMs:performance.now()-start,results}));process.send?.({style,done:true});
}else{
 fs.mkdirSync(output,{recursive:true});let next=0,active=0,done=0;const workers=new Set();
 function launch(){while(active<3&&next<styles.length){const style=styles[next++],child=fork(__filename,['worker',style],{stdio:['ignore','inherit','inherit','ipc']});active++;workers.add(child);child.on('message',m=>console.log(JSON.stringify(m)));child.on('exit',code=>{active--;workers.delete(child);if(code){for(const p of workers)p.kill('SIGTERM');process.exitCode=1;return;}done++;if(done===styles.length)summary();else launch();});}}
 function summary(){const summaries=styles.map(style=>{const q=JSON.parse(fs.readFileSync(path.join(output,'economy-'+style+'.json'))),profits=q.results.map(r=>r.profit).sort((a,b)=>a-b),at=f=>profits[Math.min(profits.length-1,Math.floor(profits.length*f))];return {style,runs:q.runs,days:q.days,min:at(0),p10:at(.1),median:at(.5),p90:at(.9),max:at(1),negativeRuns:profits.filter(n=>n<=0).length,meanCurve:Array.from({length:days},(_,d)=>q.results.reduce((a,r)=>a+r.curve[d],0)/runs),medianDayMs:q.results.map(r=>r.dayP95).sort((a,b)=>a-b)[Math.floor(runs*.5)]};});fs.writeFileSync(path.join(output,'economy-summary.json'),JSON.stringify({runs,days,summaries},null,2));for(const q of summaries)console.log(JSON.stringify(q));assert.equal(summaries.reduce((a,q)=>a+q.negativeRuns,0),0,'Every policy must have a profitable last ten days.');const strategies=summaries.filter(q=>!['casual','average','expert'].includes(q.style));assert.ok(Math.max(...strategies.map(q=>q.median))/Math.min(...strategies.map(q=>q.median))<3,'Strategy median spread must stay below 3x.');}
 launch();
}
