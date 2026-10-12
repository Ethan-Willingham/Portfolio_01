/* First material and bubble apparatus drafts, using the existing native solvers. */
(function(root){
'use strict';
var factories={},entries=[];
function rect(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function box(id,label,r,sealed){return {id:id,label:label,rect:r,sealed:!!sealed};}
function initial(r){return {kind:'rect',rect:r};}
function base(id,title,caption,world,options){
 if(world.w!==720||world.h!==400||world.tile!==8)throw Error('Material drafts need the 720 by 400 apparatus.');
 return {name:id,title:title,draft:true,seed:options.seed||17,action:'Stir once',primary:{kind:'material-jolt'},caption:'Draft. '+caption,
  readingLabel:'Draft apparatus',viewBounds:rect(64,24,624,368),vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:{enabled:false},boundaries:null,
  boundaryNote:'Draft apparatus. Every liquid and grain remains in the native MLS-MPM solver. No timed flow or hidden refill.',
  energyBudgetStatus:'Draft using the existing reduced native material or bubble model. Numerical contact and body-water work are not closed.'};
}
function pressure(){return {particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,phaseChange:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000};}
function slip(density){return {density:density||[1,.7733,2.65],drag:[4,4,4]};}
function register(id,capability,title,cue,status,make,deps){
 factories[id]=make;entries.push({id:id,capability:capability,title:title,cue:cue,status:status,draft:true,world:{w:720,h:400},pool:false,dependencies:deps||[]});
 root.WSSMachines=root.WSSMachines||{};root.WSSMachines[id]={make:function(w,o){return make(w,o||{});}};
}
register('material-sand-jar','Sand','Settling and sorting jar','Stir the grains through the water.','PARTLY',function(w,o){
 var d=base('material-sand-jar','Settling and sorting jar','Grains settle through still water; sorting is not working yet.',w,o),jar=rect(248,56,224,320);
 d.viewBounds=rect(208,0,304,400);d.vessels=[box('jar','Grains in water',jar)];d.initial=[initial(rect(256,120,208,248))];
 d.materialSlip=slip();d.materialAt=function(x,y){return y>=132&&y<232&&Math.floor((x-256)/1.25)%4===0&&Math.floor((y-120)/1.25)%4===0?'sand':'water';};d.measure={source:jar,receiver:jar};return d;
});
register('hourglass','Sand','Hourglass','Watch the sand find the narrow neck.','PARTLY',function(w,o){
 var d=base('hourglass','Hourglass','Sand falls through a narrow neck; shake once if a bridge forms.',w,o),jar=rect(232,40,256,336);
 d.viewBounds=rect(192,16,336,376);d.vessels=[box('glass','Hourglass',jar,true)];
 for(var y=104;y<240;y+=8){var gap=Math.max(16,Math.ceil((240-y)*.65/8)*16);d.solids.push(rect(240,y,(240-gap)/2,8),rect(360+gap/2,y,(240-gap)/2,8));}
 d.initial=[initial(rect(256,64,208,104))];d.materialSlip=slip();d.materialAt=function(){return 'sand';};d.measure={source:rect(240,48,240,184),receiver:rect(240,240,240,128)};return d;
});
register('aquarium-bubbler','Bubbles','Aquarium bubbler','Stop the air and watch the last bubbles rise.','PARTLY',function(w,o){
 var d=base('aquarium-bubbler','Aquarium bubbler','The declared air pump sends real gas parcels through the water.',w,o),tank=rect(112,96,496,288);
 d.vessels=[box('tank','Aquarium',tank)];d.initial=[initial(rect(120,256,480,120))];d.settings=pressure();d.primary={kind:'bubble-toggle'};d.action=o.inject===false?'Start the air':'Stop the air';
 d.bubbles={inject:o.inject!==false,hose:{x:360,y:352},rateArea:195,parcelArea:65,dragCoefficient:1,gravity:250};d.measure={source:tank,receiver:tank};
 d.boundaryNote='Draft. The marked air supply adds gas, never water. Existing quasi-static gas parcels displace native water and release their gas at the surface.';return d;
},['wss-bubbles']);
register('air-lift-pump','Bubbles','Air-lift pump','Send bubbles up the riser toward the receiving cup.','PARTLY',function(w,o){
 var d=base('air-lift-pump','Air-lift pump','Bubbles enter a submerged riser; lifting water into the cup is still a draft.',w,o),source=rect(160,144,240,240),receiver=rect(504,280,176,104);
 d.vessels=[box('source','Supply water',source),box('receiver','Receiving cup',receiver)];d.pipes=[{points:[{x:384,y:336},{x:440,y:336},{x:440,y:112},{x:560,y:112}],bore:32}];
 d.initial=[initial(rect(168,232,224,144)),initial(rect(432,240,16,96))];d.settings=pressure();d.primary={kind:'bubble-toggle'};d.action=o.inject===false?'Start the air':'Stop the air';
 d.bubbles={inject:o.inject!==false,hose:{x:440,y:320},rateArea:195,parcelArea:65,dragCoefficient:1,gravity:250};d.measure={source:source,receiver:receiver};return d;
},['wss-bubbles']);
register('sand-dam','Sand','Sand dam','Pour water against the broad sand bank.','PARTLY',function(w,o){
 var d=base('sand-dam','Sand dam','Pour against a broad sand bank. Watch the wet edge and loose grains as it settles.',w,o),trough=rect(64,144,600,240);
 // One continuous floor avoids the former overlapping vessel walls and
 // low outlet. Short, visible retaining lips keep the loose bank together.
 // Both lips sit below the starting waterline, leaving the sand to stop it.
 d.vessels=[box('channel','Sand bank',trough)];d.materialSlip=slip();
 d.solids=[rect(248,312,16,64),rect(472,312,16,64)];
 var bank=[];
 for(var y=168;y<376;y+=8){
  var spread=Math.min(104,y-168),r=rect(352-spread,y,32+spread*2,8);bank.push(r);d.initial.push(initial(r));
  if(y>=296)d.initial.push(initial(rect(72,y,Math.min(248,r.x)-72,8)));
 }
 d.materialAt=function(x,y){return bank.some(function(r){return x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;})?'sand':'water';};
 d.primary={kind:'pour',target:{x:144,y:240}};d.action='Pour more water';
 d.measure={source:rect(72,144,208,232),receiver:rect(536,144,120,232)};return d;
});
register('gold-sluice-box','Sand','Gold sluice box','Pour water through the riffled channel.','PARTLY',function(w,o){
 var d=base('gold-sluice-box','Gold sluice box','Dense grain proxies meet real riffles; sorting gold from sand is not implemented.',w,o),source=rect(64,64,160,320),channel=rect(216,240,456,144);
 d.vessels=[box('source','Water and dense grains',source),box('channel','Riffles',channel)];d.pipes=[{points:[{x:208,y:304},{x:240,y:304}],bore:64}];
 for(var x=224;x<664;x+=8){var floor=Math.floor((344+(x-224)*32/440)/8)*8;d.solids.push(rect(x,floor,8,384-floor));if((x-272)%72===0)d.solids.push(rect(x,floor-16,8,16));}
 d.initial=[initial(rect(72,112,144,264)),initial(rect(224,312,440,48))];d.materialSlip=slip([1,.7733,19.3]);d.materialAt=function(x,y){return x>=128&&x<208&&y>=120&&y<176?'sand':'water';};
 d.primary={kind:'pour',target:{x:160,y:88}};d.action='Pour water';d.measure={source:source,receiver:channel};return d;
});
register('hero-jug','Oil','Hero\'s wine-or-water jug','Switch the real outlet gates between two liquids.','PARTLY',function(w,o){
 var d=base('hero-jug','Hero\'s wine-or-water jug','A manual outlet selector chooses water or an oil proxy for wine; the air-vent mechanism is missing.',w,o),water=rect(128,64,192,184),oil=rect(400,64,192,184),cup=rect(288,312,144,72);
 d.vessels=[box('water','Water',water),box('oil','Oil proxy for wine',oil),box('cup','Receiving cup',cup)];d.pipes=[{points:[{x:288,y:224},{x:288,y:288},{x:360,y:288}],bore:32},{points:[{x:432,y:224},{x:432,y:288},{x:360,y:288}],bore:32}];
 d.parts=[{id:'water-gate',type:'valve',rect:rect(280,248,32,16),direction:'down',open:true,mass:1},{id:'oil-gate',type:'valve',rect:rect(424,248,32,16),direction:'down',open:false,mass:1}];
 d.initial=[initial(rect(136,112,176,128)),initial(rect(408,112,176,128))];d.materialSlip=slip();d.materialAt=function(x){return x>=400?'oil':'water';};
 d.materialsDraft='hero-jug';d.primary={kind:'draft-primary'};d.action='Choose oil';d.measure={source:water,receiver:cup};return d;
});
register('interlayer-slime','Oil','Slime between oil and water','Drop and grab a slime above the two liquids.','PARTLY',function(w,o){
 var d=base('interlayer-slime','Slime between oil and water','The liquids separate around a real slime; stable flotation at their interface is not working yet.',w,o),jar=rect(248,56,224,320);
 d.viewBounds=rect(208,0,304,400);d.vessels=[box('jar','Oil and water',jar)];d.initial=[initial(rect(256,144,208,224))];d.materialSlip=slip();d.materialAt=function(x,y){return y>=256?'oil':'water';};
 d.slimes=[{x:360,y:104,radius:24}];d.measure={source:jar,receiver:jar};return d;
});
register('melting-ice','Ice','Floating ice that melts','Watch lightweight grain proxies move in water.','NOT WORKING',function(w,o){
 var d=base('melting-ice','Floating ice that melts','Light grains stand in for ice; rigid cubes, freezing and melting are missing.',w,o),jar=rect(208,144,304,240);
 d.viewBounds=rect(168,96,384,296);d.vessels=[box('jar','Ice proxies in water',jar)];d.initial=[initial(rect(216,264,288,112)),initial(rect(320,192,64,56))];
 d.materialSlip=slip([1,.7733,.917]);d.materialAt=function(x,y){return x>=320&&x<384&&y>=192&&y<248?'sand':'water';};d.measure={source:jar,receiver:jar};
 d.boundaryNote='Draft. These are native granular proxies with actual relative mass0.917, not ice cubes. No freezing, latent heat, thermal melting or rigid bond model is implemented.';return d;
});
register('frozen-pipe','Ice','Frozen pipe','Remove a real manual plug from the water pipe.','NOT WORKING',function(w,o){
 var d=base('frozen-pipe','Frozen pipe','A manual plug blocks real water; freezing expansion and self-bursting are missing.',w,o),source=rect(128,80,184,304),cup=rect(528,312,144,72);
 d.vessels=[box('source','Water head',source),box('cup','Receiving cup',cup)];d.pipes=[{points:[{x:296,y:304},{x:592,y:304}],bore:48}];
 d.parts=[{id:'plug',type:'valve',rect:rect(432,288,16,48),direction:'right',open:false,mass:1}];d.initial=[initial(rect(136,176,168,200)),initial(rect(304,296,120,32))];
 d.materialSlip=slip();d.materialAt=function(){return 'water';};d.primary={kind:'valve',id:'plug'};d.action='Remove proxy plug';d.measure={source:source,receiver:cup};return d;
});
register('oil-slick-fire','Oil','Burning oil slick','Pour water over the burner beside the slick.','PARTLY',function(w,o){
 var d=base('oil-slick-fire','Burning oil slick','A declared burner burns beside real oil; the oil itself does not supply fuel yet.',w,o),jar=rect(248,184,224,192);
 d.vessels=[box('jar','Oil slick and water',jar)];d.initial=[initial(rect(256,264,208,104))];d.materialSlip=slip();d.materialAt=function(x,y){return y<280?'oil':'water';};
 d.solids=[rect(336,256,8,8),rect(376,256,8,8)];d.materialsDraft='oil-slick-fire';d.draftBurner={source:rect(352,248,16,16),x:360,y:248};d.primary={kind:'pour',target:{x:360,y:112}};d.action='Pour water';d.measure={source:jar,receiver:jar};return d;
},['wss-fire']);
register('soda-mentos','Bubbles','Soda and Mentos','Open the cap over the rough tablet.','PARTLY',function(w,o){
 var d=base('soda-mentos','Soda and Mentos','A held rough tablet makes real finite CO2 bubbles; eruption is not working yet.',w,o),bottle=rect(304,112,112,240),candy=rect(352,328,16,16);
 d.viewBounds=rect(176,0,368,400);d.vessels=[box('basin','Spill basin',rect(200,112,320,280)),box('bottle','Soda',bottle)];d.solids=[rect(304,112,40,56),rect(376,112,40,56),candy];
 d.initial=[initial(rect(312,176,96,168))];d.settings=pressure();d.releaseCap={axis:'y',at:112,start:344,end:376};d.boundaries={pool:false,tap:null,drain:null,caps:[d.releaseCap],reservoirY:392};d.materialsDraft='soda-mentos';
 d.draftFizz={inject:false,hose:{x:360,y:320},rateArea:0,parcelArea:26,dragCoefficient:1,gravity:250,fizz:{mentos:true,candy:candy,carbonationVolumes:o.flat?0:3.5}};
 d.primary={kind:'draft-primary'};d.action='Open bottle cap';d.measure={source:bottle,receiver:bottle};
 d.caption='Draft. Open the cap above the held rough tablet. Finite dissolved CO2 can make real bubbles; eruption is not working yet.';
 d.boundaryNote='Draft. The rough tablet is held at the bottom. Initially dissolved CO2 is a finite authored inventory. Gas follows the preserved native Henry transfer; no air hose, prescribed jet or replenishment is present. The button only opens or closes a real native cut across the bottle mouth, without changing the water population.';return d;
},['wss-drafts-fizz']);
function fizzRuntime(context){
 var L=context.liquid,A=context.airModel || root.__toy.airModel(),boundary=context.nativeBoundary || root.__toy.nativeBoundary(),d=context.definition;
 return root.WSSDraftFizzBubbles.create(Object.assign({},d.draftFizz,{liquid:L,air:A,boundary:boundary,width:720,height:400,maxParticles:L.maxParticles})).then(function(model){
  var closed=true;L.setToyMembrane(model);return {primary:function(){closed=!closed;boundary.setCaps(closed?[d.releaseCap]:[]);d.action=closed?'Open bottle cap':'Close bottle cap';return true;},stats:function(){return Object.assign({capClosed:closed},model.stats());},draw:function(c){var palette=getComputedStyle(document.documentElement);model.draw(c,{edge:palette.getPropertyValue('--accent').trim(),fill:palette.getPropertyValue('--accent').trim()});},destroy:model.destroy};
 });
}
function burnerRuntime(context){
 var L=context.liquid,S=context.SmokeFluid,d=context.definition,f=d.draftBurner;
 return root.WSSFire.create({liquid:L,width:720,height:400,maxParticles:L.maxParticles,source:f.source,noEmber:false}).then(function(model){
  var clock=L.simulationClock,accumulator=0;S.setThermalStyle({glow:1,waterCooling:24});
  return {tick:function(){var now=L.simulationClock,h=Math.max(0,now-clock);clock=now;if(!h)return;model.tick(h,{count:L.uploadedCount,clock:now});
   var heat=model.stats();S.setWetField(model.wetField());S.setPhysics({HEAT:Math.min(4,Math.max(0,(heat.sourceC-20)/200)),COOLING:1.2,BUOYANCY:350},0);
   if(heat.burning){accumulator+=h;while(accumulator>=1/30){accumulator-=1/30;root.__toy.smoke(f.x,f.y,0,0,.012);}}
  },stats:function(){return Object.assign({blocker:'The declared burner has its own fuel; oil consumption is not implemented.'},model.stats());},
  destroy:function(){model.destroy();S.setWetField(null);S.setPhysics(null,0);S.setThermalStyle(null);}};
 });
}
var previousRuntime=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(context){
 if(context.definition.materialsDraft==='soda-mentos')return fizzRuntime(context);
 if(context.definition.materialsDraft==='oil-slick-fire')return burnerRuntime(context);
 if(context.definition.materialsDraft!=='hero-jug')return previousRuntime&&previousRuntime.create?previousRuntime.create(context):null;
 var d=context.definition,oil=false;
 return {primary:function(){
  var setValve=context.setManualValve || (root.__toy&&root.__toy.valve);if(!setValve)return false;
  oil=!oil;d.parts.forEach(function(p){setValve(p.buildId,p.id==='oil-gate'?oil:!oil);});d.action=oil?'Choose water':'Choose oil';return true;
 },stats:function(){return {selected:oil?'oil':'water',blocker:'Manual outlet gates work; the historical vent-controlled mechanism is not implemented.'};},destroy:function(){}};
}};
root.WSSDraftsMaterials={entries:entries,dependencies:function(id){var e=entries.find(function(e){return e.id===id;});return ['wss-drafts-materials'].concat(e?e.dependencies:[]);},make:function(id,w,o){if(!factories[id])throw Error('Unknown material draft');return factories[id](w,o||{});}};
})(typeof window!=='undefined'?window:globalThis);
