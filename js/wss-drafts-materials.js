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
register('material-sand-jar','Sand','Settling and sorting jar','Stir quartz and gold through the water.','WORKS',function(w,o){
 var matched=o.matched===true,d=base('material-sand-jar','Settling and sorting jar','Stir the pale quartz and gold through water. Gold has more mass in the same grain volume, so it settles faster.',w,o),jar=rect(248,56,224,320);
 d.viewBounds=rect(208,0,304,400);d.vessels=[box('jar','Quartz and gold in water',jar)];d.initial=[initial(rect(256,120,208,248))];d.grainLook='quartz';
 d.materialSlip={density:[1,.7733,2.65,matched?2.65:19.3],drag:[4,100,100,4,4,20],separateGold:true,grainContacts:true,bed:{line:[256,368,464,368],riffles:[0,8,8,0],count:0,thickness:8}};
 d.materialAt=function(x,y){var column=Math.floor((x-256)/1.25),row=Math.floor((y-120)/1.25);return y>=132&&y<232&&column%4===0&&row%4===0?(column%8===0?'gold':'sand'):'water';};
 d.setup=matched?'matched':'ordinary';d.setups=[{id:'ordinary',label:'Quartz and gold',options:{}},{id:'matched',label:'Equal grain density control',options:{matched:true}}];d.setupNote='The control gives gold the same density as quartz. Grain size, initial mixture and water-grain drag stay the same.';d.measure={source:jar,receiver:jar};
 d.boundaryNote='A finite, initially mixed charge of equal-size quartz and gold settles through native water. Relative densities are water 1, quartz 2.65 and gold 19.3. Each material has separate native grid momentum, common gravity and pressure, equal and opposite drag and mass-weighted frictional grain contacts. The drawn floor is the actual contact surface. No grains are moved to assigned depths or refilled.';
 d.energyBudgetStatus='This reduced mixture uses exploratory drag and friction, not calibrated grain sizes or sedimentation rates. Native numerical pressure and contact work are unmeasured; only pair drag and grain impulses account for equal and opposite momentum.';return d;
});
register('hourglass','Sand','Hourglass','Grab the glass. Swing and release to flip it.','PARTLY',function(w,o){
 var d=base('hourglass','Hourglass','Grab the glass, swing it, and release to toss. The grains push back on the moving glass.',w,o);
 d.viewBounds=rect(0,0,720,400);d.vessels=[];
 // Moving contacts and drawing both read the GPU's actual rigid-body pose.
 d.hourglass=root.WSSHourglass.configure(o.grainScale);d.seedContains=root.WSSHourglass.contains;
 d.seedPitch=d.hourglass.pitch;d.seedInset=d.hourglass.radius*1.1;d.seedJitter=d.hourglass.radius*.02;d.initial=[initial(rect(256,72,208,94))];d.materialSlip=slip();d.materialAt=function(){return 'sand';};
 d.primary={kind:'hourglass-grab'};d.action='Grab and toss';d.readingLabel='Finite sand';
 d.measure={source:rect(240,48,240,152),receiver:rect(240,200,240,152)};
 d.boundaryNote='Finite grains in a dynamic rigid glass body. A damped point grip applies force and torque. Wall impacts return equal and opposite impulses to the glass.';
 d.energyBudgetStatus='Gravity, finite rigid-body mass and rotational inertia, dissipative grain contacts, floor collisions and a force-limited hand spring. No prescribed flip or release impulse. This reduced granular model is not calibrated to laboratory sand.';
 return d;
},['wss-hourglass']);
register('aquarium-bubbler','Bubbles','Aquarium bubbler','Stop the air and watch the last bubbles rise.','WORKS',function(w,o){
 var d=base('aquarium-bubbler','Aquarium bubbler','The declared air pump sends real gas parcels through the water.',w,o),tank=rect(112,96,496,288);
 d.vessels=[box('tank','Aquarium',tank)];d.solids=[rect(104,376,512,16),rect(104,96,16,296),rect(600,96,16,296)];d.initial=[initial(rect(120,256,480,120))];d.settings=pressure();d.primary={kind:'bubble-toggle'};d.action=o.inject===false?'Start the air':'Stop the air';
 d.bubbles={inject:o.inject!==false,hose:{x:360,y:352},rateArea:195,parcelArea:65,dragCoefficient:1,gravity:250};d.measure={source:tank,receiver:tank};d.setups=[{id:'on',label:'Air on',options:{}},{id:'off',label:'Air off',options:{inject:false}}];d.settings.minimumPressure=root.WaterMachinesInstruments.scale({width:720,density:1}).pressureFromPsi(.339-14.7);
 d.caption='The air supply makes real gas cavities in native water. Stop it and watch the remaining gas reach the surface.';d.readingLabel='Finite gas';d.boundaryNote='The marked compressor adds finite room-reference gas, never water. Mobile gas interfaces displace actual native water and release their amount only at current atmospheric connectivity. A sixteen-pixel shell contains the aquarium. The room-temperature water cavitation floor is 0.339 psi absolute.';d.energyBudgetStatus='Isothermal cylindrical gas volume follows current exterior pressure and Laplace surface tension. Native projected liquid velocity carries each parcel; buoyancy balanced by quadratic cylinder drag gives its slip. Surface exit closes the gas inventory. This reduced interface omits bubble inertia, resolved wake drag reaction and closed mechanical work. No water source, sink or prescribed upward water flow is used.';return d;
},['wss-bubbles']);
register('air-lift-pump','Bubbles','Air-lift pump','Send bubbles up the riser toward the receiving cup.','WORKS',function(w,o){
 var d=base('air-lift-pump','Air-lift pump','Bubbles enter a submerged riser; lifting water into the cup is still a draft.',w,o),source=rect(160,144,240,240),receiver=rect(504,280,176,104);
 d.vessels=[box('source','Supply water',source),box('receiver','Receiving cup',receiver)];d.pipes=[{points:[{x:384,y:336},{x:440,y:336},{x:440,y:168},{x:560,y:168}],bore:32}];
 d.initial=[initial(rect(168,216,224,160)),initial(rect(432,216,32,120))];d.settings=pressure();d.primary={kind:'bubble-toggle'};d.action=o.inject===false?'Start the air':'Stop the air';
 d.solids=[rect(152,376,256,16),rect(152,144,16,248),rect(392,144,16,248),rect(496,376,192,16),rect(496,280,16,112),rect(672,280,16,112)];d.vents=[rect(392,328,16,32)];d.setups=[{id:'on',label:'Air on',options:{}},{id:'off',label:'Air off',options:{inject:false}}];d.settings.minimumPressure=root.WaterMachinesInstruments.scale({width:720,density:1}).pressureFromPsi(.339-14.7);d.bubbles={inject:o.inject!==false,hose:{x:448,y:320},rateArea:1950,parcelArea:65,dragCoefficient:1,gravity:250};d.measure={source:source,receiver:receiver};d.caption='The compressor sends gas into the submerged riser. Expanding, rising gas cavities carry native water over the outlet and into the receiving cup. Stop the air to stop the lift.';d.readingLabel='Gas-powered lift';d.boundaryNote='The declared compressor supplies 1950 square pixels of room-reference gas area per native second into a 32-pixel riser. This is 3.39 cubic inches per native second for the one-inch extrusion. The initial outlet lies 48 pixels above the authored water fill. Actual gas interfaces and native pressure move the water; no upward liquid velocity, liquid source, sink or transfer is assigned. Both water tanks have sixteen-pixel shells; the source mouth remains open.';d.energyBudgetStatus='The compressor supplies external work. Finite gas amount follows native pocket ownership and surface exit, with an isothermal cylindrical interface and buoyancy/drag slip closure. Actual contact displaces water, rather than imposing a pumping rate. Bubble inertia, resolved wake-drag reaction and a closed mechanical-work budget remain approximate. Turning the compressor off cannot lift water above the source level.';return d;
},['wss-bubbles']);
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
register('melting-ice','Ice','Floating ice that melts','Drag the ice through the heated bath.','WORKS',function(w,o){
 if(root.WSSThermalMachines)return root.WSSThermalMachines.ice(w,o);
 var d=base('melting-ice','Floating ice that melts','Light grains stand in for ice; rigid cubes, freezing and melting are missing.',w,o),jar=rect(208,144,304,240);
 d.viewBounds=rect(168,96,384,296);d.vessels=[box('jar','Ice proxies in water',jar)];d.initial=[initial(rect(216,264,288,112)),initial(rect(320,192,64,56))];
 d.materialSlip=slip([1,.7733,.917]);d.materialAt=function(x,y){return x>=320&&x<384&&y>=192&&y<248?'sand':'water';};d.measure={source:jar,receiver:jar};
 d.boundaryNote='Draft. These are native granular proxies with actual relative mass0.917, not ice cubes. No freezing, latent heat, thermal melting or rigid bond model is implemented.';return d;
},['wss-drafts-bodies','wss-thermal-machines']);
register('frozen-pipe','Ice','Frozen pipe','Watch freezing expansion fracture the weak pipe.','WORKS',function(w,o){
 if(root.WSSThermalMachines)return root.WSSThermalMachines.pipe(w,o);
 var d=base('frozen-pipe','Frozen pipe','A manual plug blocks real water; freezing expansion and self-bursting are missing.',w,o),source=rect(128,80,184,304),cup=rect(528,312,144,72);
 d.vessels=[box('source','Water head',source),box('cup','Receiving cup',cup)];d.pipes=[{points:[{x:296,y:304},{x:592,y:304}],bore:48}];
 d.parts=[{id:'plug',type:'valve',rect:rect(432,288,16,48),direction:'right',open:false,mass:1}];d.initial=[initial(rect(136,176,168,200)),initial(rect(304,296,120,32))];
 d.materialSlip=slip();d.materialAt=function(){return 'water';};d.primary={kind:'valve',id:'plug'};d.action='Remove proxy plug';d.measure={source:source,receiver:cup};return d;
},['wss-drafts-bodies','wss-thermal-machines']);
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
 var world=root.__toy.world(),oxygen=root.WSSOxygen.create({fluid:S,width:world.w,height:world.h,scaleWidth:world.scaleWidth,source:f.source});
 return root.WSSFire.create({liquid:L,width:720,height:400,maxParticles:L.maxParticles,source:f.source,noEmber:true,oxygen:oxygen}).then(function(model){
  var clock=L.simulationClock;S.setThermalStyle({glow:1,waterCooling:24});
  return {oxygen:oxygen,tick:function(){var now=L.simulationClock,h=Math.max(0,now-clock);clock=now;if(!h)return;model.tick(h,{count:L.uploadedCount,clock:now});
   var heat=model.stats();S.setWetField(model.wetField());
   oxygen.prepare(heat);S.setPhysics({HEAT:0,COOLING:0,BUOYANCY:0,WEIGHT:0,VISCOSITY:0,EDGE_SPIN:0},0);
  },stats:function(){return Object.assign({blocker:'The declared burner has its own fuel; oil consumption is not implemented.'},model.stats());},
  destroy:function(){oxygen.destroy();model.destroy();S.setWetField(null);S.setPhysics(null,0);S.setThermalStyle(null);}};
 });
}
var previousRuntime=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(context){
 if(context.definition.hourglass)return root.WSSHourglass.create(context);
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
