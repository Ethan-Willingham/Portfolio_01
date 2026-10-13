// Behavioral checks for the reduced pressure apparatus, including negative controls.
'use strict';
const assert=require('node:assert/strict');
require('../js/wss-pressure-labs.js');
const make=WSSPressureLabs.createModel;
function advance(m,seconds){for(let i=0;i<Math.ceil(seconds*60);i++)m.tick(1/60);const s=m.stats();assert(s.finite,m.id+' finite');if(['moka-pot','savery-pump','pulsometer'].includes(m.id))assert(Math.abs(s.thermalResidualJ)<1e-5,m.id+' energy ledger');assert(Math.abs(s.massErrorKg)<1e-7,m.id+' water mass');assert(Math.abs(s.gasResidualMoles)<1e-7,m.id+' gas ledger');return s;}
function flow(m,id){return m.edges.find(e=>e.id===id).delivered;}
function test(name,fn){fn();console.log('PASS '+name);}
for(const id of WSSPressureLabs.ids)test(id+' finite inventory over 20 seconds',()=>{const m=make(id);if(['glugging-bottle','upside-down-tank','hydraulic-jump','soda-mentos','cold-geyser'].includes(id))m.activate('primary');advance(m,20);});
test('bottle vents relieve the vacuum and increase emptying',()=>{const closed=make('glugging-bottle'),vent=make('glugging-bottle');closed.activate('primary');vent.activate('primary');vent.activate('vent');advance(closed,3);advance(vent,3);assert(flow(vent,'mouth')>flow(closed,'mouth')*1.2);assert(closed.pressure(closed.nodes[0])<101325);});
test('Boyle gas compression conserves pV and venting releases head',()=>{const m=make('boyle-j-tube'),n=m.nodes[1],pv=m.pressure(n)*(n.capacity-n.volume);advance(m,5);assert(Math.abs(m.pressure(n)*(n.capacity-n.volume)/pv-1)<1e-10);const before=n.volume;m.activate('primary');advance(m,5);assert(n.volume>before);});
test('lower taps deliver more under the same finite header',()=>{const m=make('water-tower');advance(m,2);assert(flow(m,'tap2')>flow(m,'tap1')&&flow(m,'tap1')>flow(m,'tap0'));});
test('Pascal panel visibly bends before failure on three charges; stronger panel holds',()=>{for(const columnFill of [.94,.98,.99]){const a=make('pascal-barrel',{columnFill}),b=make('pascal-barrel',{columnFill,stronger:true});advance(a,.2);assert(!a.state.failed&&a.state.panelDeflectionM>.0005,'weak panel first bends under pressure');advance(a,1.8);advance(b,2);assert(a.state.failed&&!b.state.failed,'only the weak panel opens');assert(flow(a,'panel')>.0002&&flow(b,'panel')===0,'failure releases actual barrel water');assert(b.state.panelDeflectionM>a.state.strength,'strong panel bears more deflection than weak fracture limit');a.activate('strong');assert(!a.state.failed&&flow(a,'panel')===0,'strong-panel control starts a fresh run');advance(a,2);assert(!a.state.failed&&Math.abs(a.stats().massErrorKg)<1e-7,'reset control holds and balances water');}});
test('moka delivery requires heater input',()=>{const a=make('moka-pot'),b=make('moka-pot');b.activate('primary');advance(a,8);advance(b,8);assert(flow(a,'delivery')>.001);assert(flow(a,'delivery')>flow(b,'delivery')*4);});
test('Savery cooling condenses vapor and draws a refill',()=>{const m=make('savery-pump');advance(m,5);const delivered=flow(m,'delivery');m.activate('cool');advance(m,10);assert(delivered>0);assert(flow(m,'refill')>.001);assert(m.pressure(m.nodes[0])<101325);});
test('pulsometer alternates chambers from water-level feedback',()=>{const m=make('pulsometer');advance(m,145);assert(m.state.cycles>=2);assert(flow(m,'delivery')>.001&&flow(m,'delivery2')>.001);assert(flow(m,'refill')>.001&&flow(m,'refill2')>.001);});
test('Torricelli head is supported by atmospheric pressure',()=>{const m=make('torricelli-tube');advance(m,20);const n=m.nodes;const height=n[0].bottom+m.level(n[0])-n[1].bottom-m.level(n[1]);assert(Math.abs(height-(101325-m.pressure(n[0]))/(1000*9.80665))<.15);const v=n[0].volume;m.activate('primary');advance(m,10);assert(n[0].volume<v*.7);});
for(const id of ['venturi-aspirator','trompe'])test(id+' air input follows flowing water',()=>{const a=make(id),b=make(id);b.activate('primary');advance(a,4);advance(b,4);assert(a.state.airDrawn>0&&b.state.airDrawn===0);if(id==='trompe')assert(a.state.entrained>0);});
test('ram lifts finite water above the drive head on three charges; closed drive cannot',()=>{
 for(const sourceFill of [.8,.86,.92]){
  const m=make('hydraulic-ram',{sourceFill}),control=make('hydraulic-ram',{sourceFill});control.activate('primary');
  advance(m,3);advance(control,3);
  assert(m.state.cycles>=5,'waste valve is cycling in the first three seconds');
  assert(flow(m,'delivery')>.001,'water reaches the higher delivery');
  assert(m.nodes[2].bottom>m.nodes[0].bottom+m.level(m.nodes[0]),'delivery is above the current drive surface');
  advance(m,9);advance(control,9);
  assert(flow(m,'waste')>flow(m,'delivery')*3,'falling waste water funds the lift');
  assert(m.state.peak>20000,'valve closure creates the delivery impulse');
  assert(control.state.cycles===0&&flow(control,'delivery')===0,'closed drive cannot pump');
 }
});
test('water hammer records a travelling pulse and a real air-vessel control on three heads',()=>{
 for(const sourceFill of [.8,.88,.96]){
  const bare=make('water-hammer',{sourceFill,airChamber:false}),cushioned=make('water-hammer',{sourceFill,airChamber:true}),open=make('water-hammer',{sourceFill,autoClose:false});
  advance(bare,1);advance(cushioned,1);advance(open,1);
  assert(!bare.state.open&&!cushioned.state.open&&open.state.open,'only the declared closure produces the event');
  assert(bare.state.wave.trace.length>100&&cushioned.state.wave.trace.length>100,'the computed pressure history is captured');
  const peakTrace=Math.max(...bare.state.wave.trace.map(sample=>sample[2]));
  assert(peakTrace>open.state.peak*20,'the valve-side trace contains the true impulse');
  assert(bare.state.peak>cushioned.state.peak*2.5,'air compliance reduces peak pressure');
  assert(Math.abs(peakTrace/bare.state.peak-1)<.01,'the visible trace retains the solver peak');
 }
});
test('regulated clock holds a steady rise across three finite charges',()=>{
 for(const supplyFill of [.88,.92,.96]){
  const m=make('ctesibius-clock',{supplyFill}),control=make('ctesibius-clock',{supplyFill});control.activate('regulator');
  const rises=[],unregulated=[];
  for(let section=0;section<6;section++){
   const before=m.level(m.nodes[2]),controlBefore=control.level(control.nodes[2]);
   advance(m,4);advance(control,4);
   rises.push(m.level(m.nodes[2])-before);unregulated.push(control.level(control.nodes[2])-controlBefore);
  }
  const steady=rises.slice(1),mean=steady.reduce((a,b)=>a+b,0)/steady.length;
  assert(steady.every(r=>Math.abs(r/mean-1)<.015),'regulated four-second intervals stay within 1.5%');
  assert(unregulated.at(-1)<unregulated[0]*.65,'without float regulation the clock slows');
  assert(Math.abs(m.level(m.nodes[1])-.24)<.01,'regulated header stays at its set level');
  assert(m.state.floatY<m.state.floatStart-40,'the float moves visibly');
 }
});
test('wide inverted mouth permits faster air-water exchange',()=>{const a=make('upside-down-tank'),b=make('glugging-bottle');a.activate('primary');b.activate('primary');advance(a,3);advance(b,3);assert(flow(a,'mouth')>flow(b,'mouth'));});
test('Tesla reverse resistance reduces equal-head flow',()=>{const a=make('tesla-valve'),b=make('tesla-valve',{reverse:true});advance(a,2);advance(b,2);assert(Math.abs(a.edges[0].flow)>Math.abs(b.edges[0].flow)*1.3);});
test('hydraulic jump joins supercritical and subcritical depth states',()=>{const m=make('hydraulic-jump');m.activate('primary');const s=advance(m,1);assert(Math.max(...s.channel.froude.slice(0,12))>1);assert(Math.min(...s.channel.froude.slice(30))<1);assert(s.channel.depth[38]>s.channel.depth[4]*2);});
for(const id of ['soda-mentos','cold-geyser'])test(id+' eruption spends dissolved gas and requires carbonation',()=>{const a=make(id),b=make(id,{flat:true}),c=make(id,{mentos:false});for(const m of[a,b,c])m.activate('primary');advance(a,2);advance(b,2);advance(c,2);assert(flow(a,'foam')>.002);assert(flow(b,'foam')===0);assert(flow(a,'foam')>flow(c,'foam')*2);assert(a.state.dissolved<a.state.co2);});
test('Hero jug uses selected air vents and tracks the actual cup mixture on three fills',()=>{
 for(const chamberFill of [.72,.78,.84]){
  const water=make('hero-jug',{chamberFill}),wine=make('hero-jug',{chamberFill}),closed=make('hero-jug',{chamberFill});
  wine.activate('primary');closed.activate('both');
  advance(water,3);advance(wine,3);advance(closed,3);
  assert(flow(water,'water-outlet')>flow(water,'wine-outlet')*5,'water vent favors water');
  assert(flow(wine,'wine-outlet')>flow(wine,'water-outlet')*5,'wine vent favors wine');
  assert(water.nodes[2].pigmentWine/water.nodes[2].volume<.2,'water cup carries measured dye');
  assert(wine.nodes[2].pigmentWine/wine.nodes[2].volume>.8,'wine cup carries measured dye');
  const before=closed.nodes[2].volume;advance(closed,3);assert(Math.abs(closed.nodes[2].volume-before)<1e-8,'both covered vents stop the sustained pour');
  wine.activate('empty');assert(wine.nodes[2].volume===0&&wine.nodes[2].pigmentWine===0,'emptying clears both volume and pigment');
 }
});
test('Heron air link transports smoke and drives finite fountain',()=>{const a=make('heron-air-smoke'),b=make('heron-air-smoke');b.air[0].open=false;advance(a,8);advance(b,8);assert(a.air[0].transported>0&&a.nodes[2].smoke>0);assert(flow(a,'fountain')>flow(b,'fountain')*2);});
test('sewer water seal blocks gas until dry or overpressured',()=>{const wet=make('sewer-gas-trap'),dry=make('sewer-gas-trap'),boost=make('sewer-gas-trap');dry.activate('primary');boost.activate('boost');advance(wet,8);advance(dry,8);advance(boost,8);assert(wet.state.roomSmoke===0);assert(dry.state.roomSmoke>0);assert(boost.state.roomSmoke>0);});
console.log('All reduced pressure lab checks passed.');
