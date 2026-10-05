'use strict';
const assert=require('node:assert/strict'),{load,day,evening}=require('./one-shift-driver.cjs'),O=load();
const check=(name,test)=>{test();console.log('PASS '+name);};
check('GS1 published SSCC vector and Code 128 C checksum',()=>{
 const v='106141412345678908';assert.equal(O.labels.digit(v.slice(0,17)),v[17]);const b=O.labels.encode(v);assert.deepEqual(Array.from(b.symbols.slice(0,4)),[105,102,0,10]);assert.equal(b.symbols.at(-2),b.symbols.slice(1,-2).reduce((a,q,i)=>a+q*(i+1),105)%103);assert.equal(b.symbols.at(-1),106);assert.equal(b.width,176);assert.throws(()=>O.labels.encode(v.slice(0,17)+'7'));
 for(let i=1;i<1000;i++){const s=O.labels.sscc(i);assert.equal(s.length,18);assert.equal(s.slice(1,8),'0614141');assert.equal(O.labels.digit(s.slice(0,17)),s[17]);}
});
check('Day-one bot completes every inbound and outbound through commands',()=>{
 const sim=new O.Sim(7);const report=day(sim,O);assert.equal(report.missed,0);assert.equal(report.onTime,2);assert.equal(sim.s.records.pallets,3);assert.equal(sim.s.journal.filter(e=>e.category==='Receiving').length,7);assert.ok(report.profit>0);assert.equal(sim.reconcile().expected,sim.reconcile().accounted);assert.equal(report.closing,report.opening+report.entries.reduce((a,e)=>a+e.cents,0));
});
check('Three-day ramp, visible shortage, case pick and wrap',()=>{const sim=new O.Sim(4);for(let d=1;d<=3;d++){const report=day(sim,O);assert.equal(report.missed,0);assert.equal(sim.reconcile().expected,sim.reconcile().accounted);if(d===2){assert.ok(sim.s.terms.includes('OS&D'));assert.ok(sim.s.journal.some(e=>e.category==='Wrap and labels'));const receipt=sim.s.trucks.filter(t=>t.direction==='in').flatMap(t=>t.receipt);assert.ok(receipt.some(q=>q.expected===40&&q.received===39));}if(d<3){evening(sim,O);sim.command({type:'nextDay'});}}});
check('Seed determinism and plain JSON round trip',()=>{const a=new O.Sim(99),b=new O.Sim(99);day(a,O);day(b,O);assert.equal(a.hash(),b.hash());b.restore(a.snapshot());assert.equal(a.hash(),b.hash());});
check('Forklift training comes before operation and staff',()=>{const sim=new O.Sim(3,'peak');sim.s.cash=500000;assert.equal(sim.command({type:'buy',id:'lift'}).ok,false);assert.equal(sim.command({type:'hire',index:0}).ok,false);assert.ok(sim.command({type:'buy',id:'training'}).ok);assert.ok(sim.command({type:'buy',id:'lift'}).ok);assert.ok(sim.command({type:'hire',index:0}).ok);});
check('Holds, reservations, FIFO and FEFO',()=>{const sim=new O.Sim(3,'peak');const a=sim.pallet('soup','grove',50,null,{place:'storage',x:7,y:7,confirmed:true,bestBy:10}),b=sim.pallet('soup','grove',50,null,{place:'storage',x:8,y:7,confirmed:true,bestBy:8});assert.equal(sim.available('soup','grove')[0].id,b.id);b.hold=true;assert.equal(sim.available('soup','grove')[0].id,a.id);a.reservedBy=1;assert.equal(sim.available('soup','grove').length,0);});
console.log('One Shift headless checks complete.');
