/* Private full/half cistern, real bowl water seal and initially dry trap crest. */
(function(root){
'use strict';
function make(world,options){
 options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('The glass toilet needs a 720 by 400 world.');
 var half=options.half===true,level=half?120:72,tank={x:176,y:32,width:248,height:144},bowl={x:184,y:208,width:336,height:112},receiver={x:24,y:360,width:672,height:24};
 var flush={axis:'y',at:168,start:208,end:240},feed={axis:'x',at:144,start:40,end:72};
 return {draft:true,name:'glass-toilet',title:'Glass toilet prototype',setup:half?'half-tank':'full-tank',action:'Flush',readingLabel:'Manual flush/refill selector',
 caption:'Draft. A surge from the cistern can displace air from a toilet’s trapway and start a siphon. Flush closes the feed while opening the floor valve; close Flush to refill, then compare half a tank.',
 source:{title:'Kohler, How a Toilet Flushes',url:'https://assist.kohler.com/en/toilets-and-seats/How-a-Toilet-Flushes'},
 primary:{kind:'interlocked-cap',closed:true,opening:flush,feedOpening:feed,closedLabel:'Flush',openLabel:'Close flush and refill',label:'Manual flush/refill selector'},
 viewBounds:{x:32,y:0,width:640,height:400},setups:[{id:'full-tank',label:'Full cistern',options:{}},{id:'half-tank',label:'Half cistern',options:{half:true}}],
 vessels:[{id:'header',label:'Closed supply',rect:{x:56,y:16,width:80,height:64},sealed:true},{id:'source',label:'Cistern',rect:tank,sealed:false},{id:'bowl',label:'Bowl',rect:bowl,sealed:false},{id:'receiver',label:'Collector',rect:receiver,sealed:false}],
 pipes:[{points:[{x:124,y:52},{x:196,y:52}],bore:32},{points:[{x:164,y:52},{x:164,y:84}],bore:8},{points:[{x:164,y:108},{x:164,y:196},{x:252,y:196},{x:252,y:220}],bore:8},{points:[{x:220,y:164},{x:220,y:220}],bore:32},{points:[{x:476,y:292},{x:508,y:292},{x:508,y:236},{x:588,y:236},{x:588,y:348}],bore:32}],
 // Restore the floor corner cleared by the supply pipe's wider mouth collar.
 solids:[{x:576,y:256,width:8,height:104},{x:184,y:312,width:336,height:8},{x:112,y:72,width:8,height:8}],vents:[],parts:[],slimes:[{x:296,y:104,radius:24}],
 slider:{minY:80,maxY:132,stroke:16,pinned:false,opening:{axis:'x',at:152,start:40,end:72}},
 initial:[{kind:'rect',rect:{x:184,y:level,width:232,height:168-level}},{kind:'rect',rect:{x:192,y:256,width:336,height:56}}],
 meters:[{id:'trap-outlet',a:{x:584,y:344},b:{x:608,y:344},axis:'y',positive:1}],
 marks:[{id:'trigger',x:184,y:72,width:232},{id:'weir',x:192,y:256,width:304},{id:'refill-air-gap',x:156,y:96,width:16}],
 settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},
 boundaries:{pool:true,tap:{x:88,y:32,vx:0,vy:30,rate:600,enabled:options.supply!==false,width:16,height:5},drain:{x:32,y:368,width:656,height:8},reservoirY:376,caps:[flush]},
 boundaryNote:'Flush operates two interlocked ideal zero-thickness valves: it opens the cistern floor and closes the feed upstream of the float inlet. Closing Flush shuts the floor and reopens the feed. Neither valve moves automatically; this manual adaptation has no flapper or timer. The guided float uses the accepted full-stiffness slime and existing water buoyancy and drag to close its massless inlet shutter through the same two-to-one linkage. After that inlet, the narrow refill branch ends above an actual air gap and receiving pipe. Water falls across the gap into the same bowl outlet; it is not teleported or assigned a flow split. The open sides expose that gap to room air so the long receiving column is not a sealed pressure connection back to the inlet tee. Water that misses the receiver remains a real spill. The supply requests a declared 600 parcels per simulation second inside the initially empty closed header, even while the feed is shut. Its native admission refuses crowded inlet positions, not high pressure; it is not a pressure-regulated pump. The header has no overflow rim or second outlet. Collected water returns through a declared powered return. Both setups have the same bowl water seal, open air path and dry trap crest and descending leg. Half cistern changes only the initial cistern water height.',
 energyBudgetStatus:'Every water parcel remains in the shared MLS-MPM solver, including the free refill jet and any missed catch. The manual selector changes ideal closures, with no claimed gate inertia or work calculation. It is not an automatic toilet flapper. The source ledger reports admitted kinetic and gravitational energy; pressure-volume work of admission into the closed header is not separately calculated. The existing float coupling is delayed and one-way; its actual ring displaces the native water and its current CPU pose moves the slow inlet shutter. Fluid-body momentum, shape/guide projection work and turbulent losses are not closed or calibrated. This final private refill prototype has no successful three-seed flush or half-tank acceptance result yet.',
 measure:{source:tank,bowl:bowl,receiver:receiver,sourceLevel:level,sourceFloor:168,intakeFloor:312,crest:236,trigger:224,weir:256,outlet:{x:596,y:352},bore:24,flowSection:{axis:'y',at:344,start:584,end:608,positive:1}}};
}
root.WSSMachines=root.WSSMachines||{};root.WSSMachines['glass-toilet']={make:make};
})(typeof window!=='undefined'?window:globalThis);
