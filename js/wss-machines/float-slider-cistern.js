/* Slow inlet float exhibit. The outlet remains shut. */
(function(root){
'use strict';
function make(world,options){
 options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('The cistern needs a 720 by 400 world.');
 var pinned=options.pinned===true,tank={x:208,y:64,width:256,height:200},receiver={x:24,y:312,width:672,height:72};
 return {name:'float-slider-cistern',title:'Float-controlled inlet',setup:pinned?'pinned-low':'ordinary',action:'Stop supply',primary:{kind:'slider-supply'},readingLabel:'Slow inlet float',
 caption:'Water lifts the guided float, which closes the cistern’s inlet. Stop the supply, or pin the float low to keep its inlet open.',
 source:{title:'Gallagher, Float-controlled valve for toilet flush tanks',url:'https://patents.google.com/patent/US4431024A/en'},
 viewBounds:{x:80,y:0,width:624,height:400},setups:[{id:'ordinary',label:'Free inlet float',options:{}},{id:'pinned-low',label:'Inlet float pinned low',options:{pinned:true}}],
 vessels:[{id:'header',label:'Supply',rect:{x:104,y:32,width:80,height:168},sealed:false},{id:'source',label:'Cistern',rect:tank,sealed:false},{id:'receiver',label:'Receiving basin',rect:receiver,sealed:false}],
 pipes:[{points:[{x:168,y:96},{x:232,y:96}],bore:32},{points:[{x:392,y:248},{x:392,y:320}],bore:64}],solids:[],vents:[],parts:[],slimes:[{x:304,y:184,radius:24}],
 slider:{minY:104,maxY:220,stroke:16,pinned:pinned,opening:{axis:'x',at:192,start:88,end:120}},
 initial:[{kind:'rect',rect:{x:112,y:64,width:64,height:128}},{kind:'rect',rect:{x:216,y:144,width:240,height:112}},{kind:'rect',rect:{x:168,y:88,width:40,height:32}}],
 meters:[{id:'inlet',a:{x:192,y:88},b:{x:192,y:120},axis:'x',positive:1}],marks:[{id:'trigger',x:216,y:144,width:240}],
 settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},
 boundaries:{pool:true,tap:{x:144,y:48,vx:0,vy:30,rate:600,enabled:options.supply!==false,width:16,height:5},drain:{x:32,y:368,width:656,height:8},reservoirY:376,caps:[{axis:'y',at:256,start:368,end:432}]},
 boundaryNote:'The marked supply and collector use the declared native tap and drain. The float is a full-stiffness slime on a fixed vertical guide, using the existing slime-water buoyancy and drag. Its current body pose moves a massless inlet shutter through a two-to-one displacement linkage: a two-thirds-inch float rise closes the 1 1/3-inch inlet span. The pinned-low comparison constrains that same float at its starting position. The outlet stays shut; this checkpoint does not flush.',
 energyBudgetStatus:'All water remains in the same MLS-MPM solver and the source/collector ledger accounts for admitted, collected, refused and parked parcels and declared powered return work. The existing slime coupling estimates submergence and drag from delayed water fields, with filtered neighboring pool surfaces; it is one-way, while the actual slime ring displaces native water. The guide and full-stiffness projection constrain shape and motion; their numerical correction is not labeled heat or physical stop dissipation. Body-water momentum, projection work, gate inertia, friction and turbulent losses are not closed or calibrated. Current CPU body pose updates the slow shutter once per host frame, using existing symmetric pressure-face closure and native crossing guards. This is not a fast pressure valve, water-hammer result or glass toilet.',
 measure:{source:tank,receiver:receiver,sourceLevel:144,outlet:{x:192,y:104},bore:32,intakeFloor:256,sourceFloor:256,flowSection:{axis:'x',at:192,start:88,end:120,positive:1}}};
}
root.WSSMachines=root.WSSMachines||{};root.WSSMachines['float-slider-cistern']={make:make};
})(typeof window!=='undefined'?window:globalThis);
