/* Passive-channel and pressure-apparatus sprint drafts. Native water only. */
(function(root){
'use strict';
var entries=[],factories={};
function r(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function vessel(id,label,rect,sealed){return {id:id,label:label,rect:rect,sealed:!!sealed};}
function fill(rect){return {kind:'rect',rect:rect};}
function pressure(){return {particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,phaseChange:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000};}
function base(id,title,world,o){
 if(world.w!==720||world.h!==400||(world.tile||8)!==8)throw Error('Fluid drafts need the ordinary 720 by 400 box.');
 return {name:id,title:title,draft:true,seed:o.seed||17,action:'Pour water',primary:{kind:'pour',target:{x:176,y:80}},caption:'Draft.',readingLabel:'Draft apparatus',viewBounds:r(48,24,624,368),vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:pressure(),boundaries:{pool:false,tap:null,drain:null,caps:[],reservoirY:376},boundaryNote:'Draft. Every water parcel remains in the native solver. Geometry and declared controls supply the interaction, without assigned flows or trajectories.',energyBudgetStatus:'Existing approximate pressure and contact model. Numerical work and one-way body reaction are not closed.'};
}
function add(id,capability,title,cue,status,make,deps){
 factories[id]=make;entries.push({id:id,capability:capability,title:title,cue:cue,status:status,draft:true,world:{w:720,h:400},pool:false,dependencies:deps||[]});
 root.WSSMachines=root.WSSMachines||{};if(id==='tesla-pump' && root.WSSTeslaPump || id==='suction-siphon' && root.WSSSuctionSiphon)return;
 root.WSSMachines[id]={make:function(w,o){return make(w,o||{});}};
}
add('upside-down-tank','Water','Upside-down tank','Open the bottom and watch water and air exchange places.','PARTLY',function(w,o){
 var d=base('upside-down-tank','Upside-down tank',w,o),tank=r(240,48,240,224),catcher=r(104,280,512,104);
 d.vessels=[vessel('catcher','Collector',catcher),vessel('tank','Inverted tank',tank,true)];d.vents=[r(248,264,224,8)];
 d.parts=[{id:'bottom',type:'valve',rect:r(248,264,224,8),open:false,direction:'down'}];d.initial=[fill(r(248,56,224,200))];
 d.primary={kind:'valve',id:'bottom'};d.action='Open bottom';d.measure={source:tank,receiver:catcher};
 d.caption='Draft. Open the bottom of the inverted tank. Water and air can exchange through the same wide mouth; sustained fingers are still being tested.';
 d.boundaryNote+=' The wide mouth starts with a real closed flap. Opening it removes the native closure; no bubbles or water jets are injected.';return d;
});
function directional(d){
 var left=r(80,64,152,240),right=r(488,64,152,240),catcher=r(64,320,592,64);
 d.vessels=[vessel('catcher','Collector',catcher),vessel('left','High head',left),vessel('right','Receiver',right)];
 d.pipes=[{points:[{x:216,y:256},{x:504,y:256}],bore:32},
  {points:[{x:272,y:256},{x:304,y:192},{x:352,y:192},{x:328,y:256}],bore:24},
  {points:[{x:376,y:256},{x:408,y:192},{x:456,y:192},{x:432,y:256}],bore:24}];
 d.initial=[fill(r(88,120,136,176)),fill(r(496,272,136,24))];d.primary={kind:'pour',target:{x:152,y:88}};d.measure={source:left,receiver:right};return d;
}
add('tesla-valve','Water','Tesla valve','Pour into the high tank and watch the return loops.','PARTLY',function(w,o){
 if(root.WSSTeslaValve)return root.WSSTeslaValve.make(w,o);var d=directional(base('tesla-valve','Tesla valve',w,o));
 d.caption='Draft. Water finds its way through two asymmetric return loops. Directional resistance has not been measured yet.';
 d.boundaryNote+=' Fixed loops split and rejoin the actual channel. The different stored heads drive flow; no directional acceleration or hidden check valve is installed.';return d;
});
add('hydraulic-jump','Water','Hydraulic jump','Open the gate from the high reservoir into the shallow channel.','PARTLY',function(w,o){
 var d=base('hydraulic-jump','Hydraulic jump',w,o),tank=r(64,48,160,336),channel=r(216,272,448,112);
 d.vessels=[vessel('tank','Stored head',tank),vessel('channel','Open channel',channel)];d.pipes=[{points:[{x:208,y:320},{x:256,y:320}],bore:32}];
 for(var x=224;x<656;x+=8){var floor=352+Math.floor((x-224)/144)*8;d.solids.push(r(x,floor,8,384-floor));}
 d.solids.push(r(600,344,8,24));d.parts=[{id:'gate',type:'valve',rect:r(224,304,8,32),open:false,direction:'right'}];
 d.initial=[fill(r(72,112,144,264)),fill(r(240,344,408,24))];d.primary={kind:'valve',id:'gate'};d.action='Open head gate';d.measure={source:tank,receiver:channel};
 d.caption='Draft. Stored water rushes into a shallow open channel with a small downstream weir. A standing hydraulic jump is not established yet.';
 d.boundaryNote+=' The inlet is driven by stored gravitational head, not a prescribed stream speed. The weir and stepped slope are real wall cells.';return d;
});
add('self-watering-planter','Water','Self-watering planter','Watch reservoir water climb the wetting wick.','WORKS',function(w,o){
 if(root.WSSCapillaryPlanter)return root.WSSCapillaryPlanter.make(w,o);
 var d=base('self-watering-planter','Self-watering planter',w,o),reservoir=r(112,160,208,224),pot=r(312,96,288,288);
 d.vessels=[vessel('reservoir','Reservoir',reservoir),vessel('pot','Loose substrate',pot)];d.pipes=[{points:[{x:304,y:320},{x:336,y:320}],bore:24}];
 d.initial=[fill(r(120,280,192,96)),fill(r(336,216,240,152))];d.settings={enabled:false};d.boundaries=null;d.materialSlip={density:[1,.7733,2.65],drag:[4,4,4]};
 d.materialAt=function(x){return x>=320?'sand':'water';};d.primary={kind:'pour',target:{x:208,y:192}};d.measure={source:reservoir,receiver:pot};
 d.caption='Draft. The reservoir touches a real loose-grain substrate. Capillary wicking and root uptake are missing, so this planter does not water itself.';
 d.boundaryNote+=' Native kind-5 grains model the substrate. No liquid is created beside a plant or deleted to imitate drinking; there is no wetting or capillary operator.';return d;
},['wss-capillary-planter']);
add('glacial-flood','Ice','Glacial flood','Grab the floating barrier stand-in at the lake outlet.','NOT WORKING',function(w,o){
 var d=base('glacial-flood','Glacial flood',w,o),lake=r(80,80,384,304),catcher=r(512,288,160,96);
 d.vessels=[vessel('lake','Stored lake',lake),vessel('catcher','Downstream basin',catcher)];d.pipes=[{points:[{x:448,y:320},{x:584,y:320}],bore:48}];
 d.vents=[r(456,192,24,112)];d.initial=[fill(r(88,248,360,128))];d.slimes=[{x:464,y:320,radius:24,shape:'tower'}];
 d.draftRig=[{body:0,kind:'rail',a:{x:464,y:224},b:{x:464,y:320}}];d.primary={kind:'pour',target:{x:240,y:112}};d.action='Raise lake level';d.measure={source:lake,receiver:catcher};
 d.caption='Draft. A guided stiff gel stands in for an ice barrier at the lake outlet. Real ice buoyancy and a self-opening flood are not established.';
 d.boundaryNote+=' The barrier is a native stiff gel mesh on a vertical guide, not a timed gate. Grab and existing approximate water buoyancy can move it; no freezing, melting or calibrated ice mass is installed.';return d;
},['wss-drafts-bodies']);
add('cold-geyser','Bubbles','Cold geyser','Release the cap over the carbonated well.','PARTLY',function(w,o){
 var d=base('cold-geyser','Cold geyser',w,o),well=r(240,80,240,288),candy=r(352,336,16,16),cap={axis:'y',at:32,start:352,end:376};
 d.vessels=[vessel('spill','Spill basin',r(128,248,464,136)),vessel('well','Carbonated well',well,true)];d.pipes=[{points:[{x:360,y:96},{x:360,y:32}],bore:24}];d.solids=[candy];
 d.initial=[fill(r(248,152,224,208))];d.boundaries.caps=[cap];d.fluidDraft='cold-geyser';d.releaseCap=cap;
 d.draftFizz={inject:false,hose:{x:360,y:328},rateArea:0,parcelArea:26,dragCoefficient:1,gravity:250,fizz:{mentos:true,candy:candy,carbonationVolumes:o.flat?0:3.5}};
 d.primary={kind:'draft-primary'};d.action='Release well cap';d.measure={source:well,receiver:r(128,248,464,136)};
 d.caption='Draft. Release the cap above a finite carbonated well. Real dissolved gas can make bubbles; a cold eruption is not working yet.';
 d.boundaryNote+=' Dissolved CO2 starts as finite declared inventory. A held rough patch supplies nucleation through the existing Henry model, with no gas hose or replenishment. The button only releases the actual native cap; no gas or liquid velocity is assigned.';return d;
},['wss-drafts-fizz']);
add('tesla-pump','Water','Tesla pump','Grab the piston and drive water toward the asymmetric loops.','NOT WORKING',function(w,o){
 var d=directional(base('tesla-pump','Tesla pump',w,o)),pump=r(128,64,48,240);
 d.vessels[1]=vessel('pump','Hand-driven piston',pump);d.pipes[0].points[0]={x:160,y:256};d.initial[0]=fill(r(136,224,32,72));
 d.slimes=[{x:152,y:160,radius:24,shape:'cube'}];d.draftRig=[{body:0,kind:'rail',a:{x:152,y:120},b:{x:152,y:216}}];
 d.primary={kind:'draft-push'};d.action='Press piston';d.measure.source=pump;
 d.caption='Draft. A real guided piston faces the fixed asymmetric channels. Repeated pressure strokes and net directional pumping are not established.';
 d.boundaryNote+=' The square piston uses full-stiffness gel projection and an ideal vertical guide. Press or Grab supplies declared hand work. No oscillating water force, velocity prescription, automatic return or motor timer is installed.';return d;
},['wss-drafts-bodies']);
add('spray-bottle','Water','Spray bottle','Press the guided piston above two actual check valves.','PARTLY',function(w,o){
 var d=base('spray-bottle','Spray bottle',w,o),supply=r(80,144,128,240),pump=r(320,112,48,240),catcher=r(528,288,144,96);
 d.vessels=[vessel('supply','Water supply',supply),vessel('pump','Trigger chamber',pump),vessel('catcher','Spray collector',catcher)];
 d.pipes=[{points:[{x:192,y:320},{x:344,y:320}],bore:24},{points:[{x:344,y:256},{x:432,y:256},{x:432,y:112},{x:568,y:112}],bore:16}];
 d.parts=[{id:'inlet-check',type:'check',rect:r(216,312,8,24),direction:'right',open:false,crackingPressure:0,hysteresis:.1},
  {id:'outlet-check',type:'check',rect:r(384,256,8,16),direction:'right',open:false,crackingPressure:0,hysteresis:.1},
  {id:'nozzle',type:'nozzle',rect:r(560,112,16,16),direction:'right',bore:8}];
 d.initial=[fill(r(88,224,112,152)),fill(r(328,224,32,120))];d.slimes=[{x:344,y:184,radius:24,shape:'cube'}];d.draftRig=[{body:0,kind:'rail',a:{x:344,y:160},b:{x:344,y:208}}];
 d.primary={kind:'draft-push'};d.action='Press trigger piston';d.measure={source:supply,receiver:catcher};
 d.caption='Draft. A hand-driven piston, two pressure-operated check valves and a narrow nozzle form the pump. Repeated doses and fine spray are still unproved.';
 d.boundaryNote+=' The piston is an actual guided gel body. Check valves follow the existing delayed pressure readings; the nozzle is real wall geometry. Grab supplies the return stroke, with no hidden refill or scripted droplets.';return d;
},['wss-drafts-bodies']);
add('suction-siphon','Water','Suction-primed siphon','Grab the air-pump piston above a dry siphon.','NOT WORKING',function(w,o){
 var d=base('suction-siphon','Suction-primed siphon',w,o),source=r(80,144,176,240),receiver=r(456,312,176,72),pump=r(384,40,48,160);
 d.vessels=[vessel('source','Source water',source),vessel('receiver','Receiving bowl',receiver),vessel('pump','Air-pump cylinder',pump,true)];
 d.pipes=[{points:[{x:232,y:328},{x:304,y:328},{x:304,y:200},{x:480,y:200},{x:480,y:288}],bore:24},{points:[{x:408,y:208},{x:408,y:176}],bore:24}];d.vents=[r(392,40,32,8)];
 d.parts=[{id:'air-inlet',type:'check',rect:r(400,184,24,8),direction:'up',open:false,crackingPressure:0,hysteresis:.1},
  {id:'air-exhaust',type:'check',rect:r(392,40,32,8),direction:'up',open:false,crackingPressure:0,hysteresis:.1}];
 d.initial=[fill(r(88,256,160,120))];d.slimes=[{x:408,y:80,radius:24,shape:'cube'}];d.draftRig=[{body:0,kind:'rail',a:{x:408,y:64},b:{x:408,y:144}}];
 d.primary={kind:'draft-push'};d.action='Press air piston';d.measure={source:source,receiver:receiver};
 d.caption='Draft. The siphon starts dry, with a guided hand piston and real air checks above its crest. Reliable air removal and suction priming are not working yet.';
 d.boundaryNote+=' The dry pipe is never prefilled or assigned suction flow. The ordinary pressure floor is unchanged. Body sealing and pressure-operated checks at a room-air port remain limitations; no gas is deleted to imitate an air pump.';return d;
},['wss-drafts-bodies']);
var previousRuntime=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(context){
 var d=context.definition;if(d.fluidDraft!=='cold-geyser')return previousRuntime&&previousRuntime.create?previousRuntime.create(context):null;
 var L=context.liquid,A=context.airModel||(root.__toy&&root.__toy.airModel()),B=context.nativeBoundary||(root.__toy&&root.__toy.nativeBoundary());
 if(!A||!B||!root.WSSDraftFizzBubbles)throw Error('Cold-geyser native gas dependencies are unavailable.');
 return root.WSSDraftFizzBubbles.create(Object.assign({},d.draftFizz,{liquid:L,air:A,boundary:B,width:720,height:400,maxParticles:L.maxParticles})).then(function(model){
  var closed=true;L.setToyMembrane(model);
  return {primary:function(){closed=!closed;B.setCaps(closed?[d.releaseCap]:[]);d.action=closed?'Release well cap':'Close well cap';return true;},stats:function(){return Object.assign({capClosed:closed,blocker:'Finite native CO2 fizz; autonomous eruption is unproved.'},model.stats());},draw:function(c){var palette=getComputedStyle(document.documentElement),color=palette.getPropertyValue('--accent').trim();model.draw(c,{edge:color,fill:color});},destroy:model.destroy};
 });
}};
root.WSSDraftsFluidMachines={entries:entries,dependencies:function(id){var e=entries.find(function(e){return e.id===id;});return ['wss-drafts-fluid-machines'].concat(e?e.dependencies:[]);},make:function(id,w,o){if(!factories[id])throw Error('Unknown fluid draft');return factories[id](w,o||{});}};
})(typeof window!=='undefined'?window:globalThis);
