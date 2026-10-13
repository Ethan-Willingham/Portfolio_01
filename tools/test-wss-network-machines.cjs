'use strict';
const assert=require('node:assert/strict');
require('../js/wss-network-machines.js');
const suite=global.WSSNetworkMachines;
function make(id,o){const definition=suite.make(id,{w:720,h:400},o);return{definition,runtime:suite.create({definition})};}
function run(r,seconds){for(let i=0;i<seconds*60;i++)r.tick(1/60);const s=r.stats();assert(s.finite,idOf(r)+' has invalid inventory');assert(Math.abs(s.massError)<1e-5,idOf(r)+' loses water');return s;}
function idOf(r){return r.stats().scene;}
function node(s,id){return s.nodes.find(x=>x.id===id);}
function edge(s,id){return s.edges.find(x=>x.id===id);}
function check(id,test){const {definition,runtime:r}=make(id);try{test(r,definition);const s=r.stats();assert(s.finite);assert(Math.abs(s.massError)<1e-5);process.stdout.write('PASS '+id+'\n');}finally{r.destroy();}}
check('cup-synchronization',r=>{let flushes=0,was=false;for(let i=0;i<6000;i++){r.tick(1/60);let on=edge(r.stats(),'drainL').primed;if(on&&!was)flushes++;was=on;}assert(flushes>=2);});
check('intermittent-fountain',r=>{let flushes=0,was=false;for(let i=0;i<7200;i++){r.tick(1/60);let on=edge(r.stats(),'flush').primed;if(on&&!was)flushes++;was=on;}assert(flushes>=2);});
check('binary-staircase',(r,d)=>{for(let i=1;i<=8;i++){r.primary();assert.equal(d.readingLabel.slice(-3),i===8?'000':i.toString(2).padStart(3,'0'));}assert(Math.abs(r.stats().massError)<1e-5);});
check('mariotte-bottle',r=>{let f=[];for(let i=0;i<900;i++){r.tick(1/60);if(i%60===0&&i>100)f.push(edge(r.stats(),'outlet').flow);}assert(Math.max(...f)-Math.min(...f)<f[0]*.03);r.activate('vent');let first=edge(run(r,1),'outlet').flow;let later=edge(run(r,6),'outlet').flow;assert(later<first*.9);});
check('banu-musa-fountain',r=>{let left=false,right=false;for(let i=0;i<2400;i++){r.tick(1/60);let s=r.stats();left ||=edge(s,'routeL').flow>50;right ||=edge(s,'routeR').flow>50;}assert(left&&right);});
check('bottle-glass-pitch',(r,d)=>{let before=d.readingLabel.match(/\d+/g).map(Number);r.primary();r.activate('glass-fill');run(r,10);let after=d.readingLabel.match(/\d+/g).map(Number);assert(after[0]>before[0]);assert(after[1]<before[1]);r.activate('tap');r.activate('glass-tap');});
check('fountain-music',r=>{r.primary();let s=run(r,2);assert(s.edges.filter(x=>/^note/.test(x.id)&&x.flow>50).length===4);});
check('galileo-well',r=>{r.primary();let moved=node(run(r,8),'upper').volume;assert(moved>1000);const second=make('galileo-well').runtime;try{second.activate('scale');second.primary();assert(node(run(second,8),'upper').volume<100);}finally{second.destroy();}});
check('vacuum-siphon',r=>{let baseline=node(run(r,8),'receiver').volume;assert(baseline>node(r.stats(),'receiver').capacity*.08+1000);const second=make('vacuum-siphon').runtime;try{second.activate('air');assert(node(run(second,8),'receiver').fill<.081);}finally{second.destroy();}});
check('bramah-press',r=>{let before=node(r.stats(),'large').volume;r.primary();assert(node(run(r,1),'large').volume>before+100);});
check('hero-vending',r=>{let initial=node(run(r,1),'drink').volume;r.primary();let s=run(r,2);assert(node(s,'drink').volume>initial+200);r.activate('reset');let stopped=node(run(r,2),'drink').volume;assert(Math.abs(node(run(r,2),'drink').volume-stopped)<2);});
check('hero-drinking-animal',r=>{let v=node(run(r,1),'stomach').volume;r.primary();assert(node(run(r,4),'stomach').volume>v+200);});
check('jazari-peacock',r=>{let high=false,low=false;for(let i=0;i<4800;i++){r.tick(1/60);let f=node(r.stats(),'bowl').fill;high ||=f>.65;low ||=high&&f<.2;}assert(high&&low);});
check('moniac',r=>{const baseline=make('moniac').runtime;try{r.primary();r.activate('tax-control');let changed=run(r,10),ordinary=run(baseline,10);assert(node(changed,'t0').fill>node(ordinary,'t0').fill+.10);assert(edge(changed,'tax').flow>edge(ordinary,'tax').flow+50);}finally{baseline.destroy();}});
check('lukyanov-integrator',r=>{let old=node(r.stats(),'t0').volume;r.primary();assert(node(r.stats(),'t0').volume>old);assert(node(run(r,10),'t1').fill>.25);});
check('marly-machine',r=>{r.primary();let s=run(r,30);assert(node(s,'upper').fill>.2);assert(s.energyInput>0);assert(edge(s,'wheel').flow>0);});
check('parts-budget-puzzles',r=>{r.primary();r.activate('part1');assert(run(r,60).completed);});
check('pneumatica-campaign',r=>{r.primary();assert(!run(r,15).completed);assert(!r.controls().find(x=>x.id==='gate1').disabled);r.activate('gate1');assert(!run(r,15).completed);assert(!r.controls().find(x=>x.id==='gate2').disabled);r.activate('gate2');assert(run(r,30).completed);});
check('garden-automation',()=>{for(let soilFill of [.1,.15,.2]){let on=make('garden-automation',{soilFill}).runtime,off=make('garden-automation',{soilFill,running:false}).runtime;try{let started=run(on,2);assert(started.edges.some(e=>/^irrigate/.test(e.id)&&e.flow>0),'irrigation begins within two seconds');let wet=run(on,28),dry=run(off,30);for(let i=0;i<3;i++)assert(node(wet,'soil'+i).fill>node(dry,'soil'+i).fill+.1,'automatic valve keeps planter '+i+' wetter than the off control');assert(wet.removed>0);}finally{on.destroy();off.destroy();}}});
check('fire-brigade',r=>{r.primary();run(r,10);r.activate('hose1');run(r,10);r.activate('hose2');assert(run(r,10).completed);});
check('water-chain-reaction',r=>{r.primary();assert(run(r,40).completed);});
