/* Wave-two body drafts. Sources and hand work are declared; water stays native. */
(function(root){
  'use strict';
  var rows=[
    ['fountain-rider','Floating things','Fountain rider','PARTLY',true,'A real upward water jet meets the slime; steady riding is unproved.'],
    ['canal-locks','Floating things','Canal locks','PARTLY',false,'Open the real lock gates in turn; the boat can be grabbed.'],
    ['jellyfish','Water slimes','Jellyfish','PARTLY',false,'Squeeze the submerged skin by hand; swimming is unproved.'],
    ['soft-robot-gripper','Water slimes','Soft robot gripper','NOT WORKING',false,'Grab the elastic cup around the block; air actuation is not connected.'],
    ['suction-cup','Water slimes','Suction cup','NOT WORKING',false,'Press the elastic cup against the shelf; vacuum adhesion is not connected.'],
    ['water-rocket','Water slimes','Water rocket','WORKS',false,'A native piston compresses trapped air. Release the nozzle to launch the carried water tank.'],
    ['slime-submarine','Water slimes','Slime submarine','WORKS',false,'Open the valve to flood its carried water tank, then close it and drag the loaded skin.'],
    ['slime-mail','Smoke','Slime mail','PARTLY',false,'Tap the rear air chamber to push smoke toward the slime in the tube.'],
    ['swim-bladder-fish','Water slimes','Swim-bladder fish','PARTLY',false,'Pump gas into the bladder, then vent it; depth control is unproved.'],
    ['bell-jar-lungs','Water slimes','Bell-jar lungs','PARTLY',false,'Lower the driven diaphragm; the gas slimes sample the jar air pressure.'],
    ['vacuum-slime','Water slimes','Vacuum slime','PARTLY',false,'Expand the jar with a driven piston; gas-slime swelling is unproved.'],
    ['pitcher-pump','Valves and logic','Pitcher pump','PARTLY',false,'Drive the primed piston down and back; two real check valves route the water.'],
    ['super-soaker','Valves and logic','Super Soaker','PARTLY',false,'Open the nozzle of the water tank under its declared driven piston.'],
    ['champagne-cork','Smoke','Champagne cork','NOT WORKING',false,'A rear air pulse meets the cork; stored bottle gas is not connected.'],
    ['pressure-cuff','Water slimes','Pressure cuff','WORKS',false,'Inflate the elastic bladders to restrict real water flow; vent them to reopen the channel.'],
    ['snorkel-limit','Water slimes','Snorkel limit','NOT WORKING',false,'Water surrounds the lung slime; its airway and breathing effort are not connected.'],
    ['slime-sipper','Water slimes','Slime sipper','PARTLY',false,'Water can cross a real slit; active suction and drinking are not connected.']
  ];
  var entries=rows.map(function(r){return {id:r[0],capability:r[1],title:r[2],status:r[3],pool:r[4],cue:'Draft. '+r[5],draft:true,world:{w:720,h:400}};});
  function rect(x,y,width,height){return {x:x,y:y,width:width,height:height};}
  function water(r){return {kind:'rect',rect:r};}
  function box(id,label,r,sealed){return {id:id,label:label,rect:r,sealed:!!sealed};}
  function base(id,w,o){
    if(w.w!==720||w.h!==400||(w.tile||8)!==8)throw Error('These body drafts need the ordinary toy box.');
    var e=entries.find(function(e){return e.id===id;}),basin=rect(112,304,496,80);
    return {name:id,title:e.title,seed:o&&o.seed||17,draft:true,setup:'draft',setups:[],caption:e.cue,
      action:'Push body',primary:{kind:'draft-push'},readingLabel:e.title,viewBounds:rect(64,64,592,320),
      vessels:[box('basin','Water',basin)],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:{enabled:false},boundaries:null,
      measure:{source:basin,receiver:basin},boundaryNote:'Draft. Native water is conserved except at labeled sources and collectors. Grab supplies external hand work.',
      energyBudgetStatus:'Ordinary gel-water coupling uses approximate one-way buoyancy and drag. There is no prescribed body path, water-derived fake thrust or closed energy claim.'};
  }
  function skin(id,w,o,slit){
    var d=root.WSSMachines['water-balloons'].make(w,{seed:o&&o.seed,slit:slit}),e=entries.find(function(e){return e.id===id;});
    d.name=id;d.title=e.title;d.draft=true;d.setups=[];d.caption=e.cue;delete d.source;return d;
  }
  function gas(id,w,o){
    var d=root.WSSMachines['cartesian-divers'].make(w,{seed:o&&o.seed,squeezed:false}),e=entries.find(function(e){return e.id===id;});
    d.name=id;d.title=e.title;d.draft=true;d.setups=[];d.caption=e.cue;delete d.source;return d;
  }
  function dryGas(id,w,o,two){
    var d=gas(id,w,o),jar=rect(200,112,320,272),cup=rect(80,304,80,80);
    d.draftGravity=0;d.vessels=[box('jar','Air chamber',jar,true),box('water-cup','Water cup',cup)];
    d.initial=[water(rect(88,344,64,32))];d.slimes=two?[{x:296,y:224,radius:32,density:1},{x:424,y:224,radius:32,density:1}]:[{x:360,y:224,radius:40,density:1}];
    d.divers.dryGas=true;d.divers.piston=rect(200,344,320,16);d.divers.stroke=24;d.divers.speed=12;
    d.divers.labels={on:'Raise diaphragm',off:'Lower diaphragm'};d.divers.pistonLabel='Driven diaphragm';d.action='Lower diaphragm';
    d.boundaryNote='Draft. The lower diaphragm is a declared driven pressure boundary. Moving it down expands the real sealed upper air pocket. Each gas slime keeps its initial gas amount and mass, and samples the surrounding native air pressure to set an isothermal target area. The small open water cup is separate from the jar and keeps the existing native fluid solver active. Gravity is zero. Grab supplies hand work.';
    d.energyBudgetStatus='The diaphragm motor supplies work. Gas volume follows the existing elastic gas-slime approximation; no lung growth, pressure value or body trajectory is assigned. This is not a respiratory or closed energy model.';return d;
  }
  var factories={
    'fountain-rider':function(w,o){
      var d=base('fountain-rider',w,o);d.action='Close tap';d.primary={kind:'tap'};d.slimes=[{x:360,y:272,radius:24}];
      d.initial=[water(rect(120,360,480,16))];
      d.boundaries={pool:true,tap:{x:360,y:360,width:24,height:4,rate:600,vx:0,vy:-300,enabled:true},drain:rect(120,368,480,8)};
      d.marks=[{label:'Upward supply',a:{x:348,y:360},b:{x:372,y:360}}];
      d.boundaryNote+=' The nozzle admits water upward at a declared 300 pixels per native second. The collector recycles it through the powered supply. No extra lift force is applied to the slime.';return d;
    },
    'canal-locks':function(w,o){
      var d=base('canal-locks',w,o);d.vessels=[box('upstream','Upper canal',rect(64,184,224,200)),box('lock','Lock',rect(288,152,144,232)),box('downstream','Lower canal',rect(432,248,224,136))];
      d.vents=[rect(280,304,24,64),rect(424,320,24,48)];
      d.parts=[{id:'upper-gate',type:'valve',rect:rect(288,304,8,64),open:false},{id:'lower-gate',type:'valve',rect:rect(432,320,8,48),open:false}];
      d.initial=[water(rect(72,224,208,152)),water(rect(296,288,128,88)),water(rect(440,336,208,40))];
      d.slimes=[{x:360,y:256,radius:24,shape:'cube'}];d.draftRig=[{body:0,kind:'free'}];
      d.creatureGates={step:0,steps:[{id:'upper-gate',open:true,label:'Close upper gate'},{id:'upper-gate',open:false,label:'Open lower gate'},{id:'lower-gate',open:true,label:'Close lower gate'},{id:'lower-gate',open:false,label:'Open upper gate'}]};
      d.primary={kind:'creature-gates'};d.action='Open upper gate';d.measure={source:d.vessels[0].rect,receiver:d.vessels[2].rect};
      d.boundaryNote+=' Each button press changes one real gate. The rigid boat has a free predicted pose. Equalization and travel depend on native water; no lock cycle runs on a timer.';return d;
    },
    'jellyfish':function(w,o){
      var d=skin('jellyfish',w,o,false);d.membrane.seedBoth=true;d.slimes=[{x:360,y:280,radius:40}];
      d.initial=[water(rect(120,248,480,128))];d.action='Squeeze skin';d.primary={kind:'draft-squeeze'};
      d.boundaryNote+=' Native water starts on both sides of the skin, keeping each parcel\'s original side. The button gives the gel a balanced inward hand impulse; only native contact reactions can move the body. There is no programmed swim stroke.';return d;
    },
    'soft-robot-gripper':function(w,o){
      var d=base('soft-robot-gripper',w,o);d.slimes=[{x:360,y:192,radius:28,shape:'draft-trough'},{x:368,y:248,radius:20,shape:'cube'}];d.draftRig=[{body:1,kind:'free'}];
      d.boundaryNote+=' The open cup is a real elastic lattice, and the payload is a rigid-projected lattice. Pressurized channels, closing actuators and a grasping controller are absent.';return d;
    },
    'suction-cup':function(w,o){
      var d=base('suction-cup',w,o);d.solids=[rect(248,272,224,16)];d.slimes=[{x:360,y:232,radius:28,shape:'draft-trough'}];
      d.action='Use Grab';d.primary={kind:'creature-fixture'};
      d.boundaryNote+=' The cup deforms under Grab and terrain contacts. Its rim does not register a sealed pressure cavity, so vacuum traction and adhesion are not implemented.';return d;
    },
    'water-rocket':function(w,o){
      if(root.WSSWaterRocket)return root.WSSWaterRocket.make(w,o);
      var d=skin('water-rocket',w,o,true);d.slimes=[{x:360,y:192,radius:56}];d.initial=[water(rect(312,176,96,64))];
      d.action='Squeeze skin';d.primary={kind:'draft-squeeze'};
      d.boundaryNote+=' This open skin has native water and contact reactions, but no enclosed compressed gas or gas-to-water work. It is a launch fixture, not a working rocket.';return d;
    },
    'slime-submarine':function(w,o){
      if(root.WSSSlimeSubmarine)return root.WSSSlimeSubmarine.make(w,o);
      var d=base('slime-submarine',w,o);d.vessels=[box('basin','Water',rect(112,128,496,256))];d.initial=[water(rect(120,264,480,112))];
      d.slimes=[{x:360,y:216,radius:36}];d.action='Use Grab';d.primary={kind:'creature-fixture'};
      d.boundaryNote+=' The body is passive gel. A moving water ballast container, its valves and changing payload mass are absent; water is not deleted to imitate flooding.';return d;
    },
    'slime-mail':function(w,o){
      var d=root.WSSMachines['smoke-ring-cannon'].make(w,o),e=entries.find(function(e){return e.id==='slime-mail';});
      d.name=e.id;d.title=e.title;d.draft=true;d.setups=[];delete d.source;d.caption=e.cue;d.draftSmoke=true;
      d.slimes=[{x:320,y:200,radius:20}];d.solids=d.solids.concat([rect(248,160,360,8),rect(248,232,360,8)]);
      d.boundaryNote+=' The long physical duct surrounds a free gel parcel. The original declared rear air impulse loads the actual gel ring through current smoke projection pressure. No delivery path or additional parcel force is assigned.';return d;
    },
    'swim-bladder-fish':function(w,o){
      var d=gas('swim-bladder-fish',w,o);d.slimes=[{x:360,y:240,radius:28,density:.94}];d.divers.stroke=0;
      d.creatureGas={supplied:false};d.primary={kind:'creature-gas'};d.action='Pump bladder gas';
      d.boundaryNote='Draft. The bladder is the existing fixed-ballast ideal-gas slime in native water. The button represents a declared gas pump: it admits 25 percent of the original room-reference gas amount, or vents exactly that amount on the next press. Ballast mass stays fixed. Current native external pressure sets its target area. No depth or lift trajectory is assigned.';
      d.energyBudgetStatus='The declared gas pump changes the body gas inventory and supplies work. The current body-volume and one-way hydrostatic buoyancy approximation is reused. Gas amount is recorded in the diver reading, but is separate from the external native air-pocket ledger. There is no closed energy claim.';return d;
    },
    'bell-jar-lungs':function(w,o){return dryGas('bell-jar-lungs',w,o,true);},
    'vacuum-slime':function(w,o){return dryGas('vacuum-slime',w,o,false);},
    'pitcher-pump':function(w,o){
      var d=gas('pitcher-pump',w,o),pump=rect(280,184,160,200),source=rect(80,184,160,200),receiver=rect(592,144,64,240);
      d.slimes=[];d.vessels=[box('pump','Primed pump',pump,true),box('source','Supply',source),box('receiver','Receiver',receiver)];
      d.pipes=[{points:[{x:224,y:344},{x:304,y:344}],bore:24},{points:[{x:416,y:280},{x:552,y:280},{x:552,y:160},{x:608,y:160}],bore:24}];
      d.parts=[{id:'inlet',type:'check',rect:rect(248,332,16,24),direction:'right',open:false,crackingPressure:0,hysteresis:.05},{id:'outlet',type:'check',rect:rect(448,268,16,24),direction:'right',open:false,crackingPressure:0,hysteresis:.05}];
      d.initial=[water(rect(88,248,144,128)),water(rect(288,248,144,128))];d.divers.piston=rect(280,200,160,16);d.divers.stroke=64;d.divers.speed=32;
      d.divers.labels={on:'Raise piston',off:'Lower piston'};d.action='Lower piston';d.measure={source:source,receiver:receiver};
      d.viewBounds=rect(64,96,608,288);d.boundaryNote='Draft. The pump starts primed with native water. A declared motor drives the real piston down or back up. Actual pressure difference across each physical check valve determines whether it opens. The supply and receiver are finite; no parcel is moved between them by the button. Self-priming and useful delivery are unproved.';
      d.energyBudgetStatus='The piston motor supplies external work. The existing native water and compressible air solve provide pressure and flow; check valves are ideal sampled closures. No delivery rate or pump trajectory is assigned.';return d;
    },
    'super-soaker':function(w,o){
      var d=gas('super-soaker',w,o);d.slimes=[];d.divers.squeezed=true;d.divers.stroke=32;d.divers.speed=16;
      d.vents=[rect(504,256,24,16)];d.pipes=[{points:[{x:504,y:264},{x:624,y:264}],bore:16}];
      d.parts=[{id:'trigger',type:'valve',rect:rect(536,256,16,16),open:false}];d.primary={kind:'valve',id:'trigger'};d.action='Open nozzle';
      d.initial=[water(rect(208,216,304,160))];d.viewBounds=rect(176,72,488,312);
      d.boundaryNote='Draft. A declared piston motor compresses the sealed tank air above finite native water. The button opens a real outlet gate to the room. The motor, not a hidden parcel injection, provides pressure work. A useful spray is unproved.';
      d.energyBudgetStatus='The piston supplies external work to native gas and water. The nozzle and valve are physical openings; no jet velocity or sprayed quantity is assigned.';return d;
    },
    'champagne-cork':function(w,o){
      if(root.WSSChampagneCork)return root.WSSChampagneCork.make(w,o);
      var d=root.WSSMachines['smoke-ring-cannon'].make(w,o),e=entries.find(function(e){return e.id==='champagne-cork';});
      d.name=e.id;d.title=e.title;d.draft=true;d.draftSmoke=true;d.setups=[];delete d.source;d.caption=e.cue;d.slimes=[{x:248,y:200,radius:28}];
      d.boundaryNote+=' The gel cork sits in the real chamber opening and receives current smoke pressure traction. This rear hand pulse is not stored compressible bottle gas, fermentation or a gas-energy launch model.';return d;
    },
    'pressure-cuff':function(w,o){
      if(root.WSSPressureCuff)return root.WSSPressureCuff.make(w,o);
      var d=base('pressure-cuff',w,o);d.slimes=[{x:360,y:224,radius:28,shape:'draft-trough'}];d.solids=[rect(248,272,224,16)];d.action='Use Grab';d.primary={kind:'creature-fixture'};
      d.boundaryNote+=' The cuff is a deformable lattice. There is no internal flowing vessel, inflating cuff cavity, circulation source or blood-pressure measurement; this fixture makes no pressure-reading claim.';return d;
    },
    'snorkel-limit':function(w,o){
      var d=base('snorkel-limit',w,o);d.vessels=[box('tank','Water',rect(144,112,432,272))];d.initial=[water(rect(152,216,416,160))];
      d.pipes=[{points:[{x:360,y:80},{x:360,y:168}],bore:16}];d.slimes=[{x:360,y:184,radius:32}];d.action='Use Grab';d.primary={kind:'creature-fixture'};
      d.boundaryNote+=' The physical snorkel is open to room air but is not joined to an internal lung gas inventory. Respiratory effort and a flexible lung airway are absent. Passive gel buoyancy does not establish a breathing-depth limit.';return d;
    },
    'slime-sipper':function(w,o){
      var d=skin('slime-sipper',w,o,true);d.membrane.seedBoth=true;d.slimes=[{x:360,y:280,radius:40}];d.initial=[water(rect(120,288,480,88))];
      d.action='Squeeze skin';d.primary={kind:'draft-squeeze'};
      d.boundaryNote+=' Native water can cross the real lower-side slit and retains its original birth side elsewhere. The button supplies a balanced hand squeeze, not active drinking or a suction source. Membrane refill through the slit is unproved.';return d;
    }
  };
  var previousRuntime=root.WSSDraftRuntime;
  root.WSSDraftRuntime={create:function(context){
    var d=context.definition,g=d.creatureGates;
    if(d.creatureGas)return {primary:function(){
      var room=context.airModel.settings.atmospherePressure;d.creatureGas.supplied=!d.creatureGas.supplied;
      context.bodies.forEach(function(b){var gas=b.cartesianDiver;if(!gas)return;gas.amount=gas.initialArea*(d.creatureGas.supplied?1.25:1);gas.target=root.WSSCartesianDivers.volume(gas.amount,room,gas.absolute);b.sleeping=false;b.sleepFrames=0;});
      d.action=d.creatureGas.supplied?'Vent bladder gas':'Pump bladder gas';return true;
    },destroy:function(){}};
    if(!g)return previousRuntime&&previousRuntime.create?previousRuntime.create(context):null;
    return {primary:function(){var step=g.steps[g.step],part=d.parts.find(function(p){return p.id===step.id;});context.setManualValve(part.buildId,step.open);d.action=step.label;g.step=(g.step+1)%g.steps.length;return true;},destroy:function(){}};
  }};
  root.WSSMachines=root.WSSMachines||{};
  entries.forEach(function(e){root.WSSMachines[e.id]={make:function(w,o){return factories[e.id](w,o||{});}};});
  root.WSSDraftCreatures={entries:entries};
})(typeof window!=='undefined'?window:globalThis);
