/* Native water columns at a physical height where atmosphere matters. */
(function(root){
'use strict';
function R(x,y,width,height){return{x:x,y:y,width:width,height:height};}
function make(id,w,o){
 o=o||{};var torri=id==='torricelli-tube',width=o.small?30:torri?3600:1440,vented=!!o.vented;
 var d={name:id,title:torri?"Torricelli's water tube":"Boyle's J-tube",draft:true,seed:o.seed||17,physicalWidthInches:width,pressureScaleLab:true,
  setup:o.small?'small':vented?'vented':'sealed',setups:[{id:'sealed',label:torri?'Tall sealed water tube':'Tall water columns',options:{}},{id:'vented',label:'Air vent open',options:{vented:true}},{id:'small',label:'Same shape, 30-inch box',options:{small:true}}],
  viewBounds:R(112,16,496,376),vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],
  settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7},
  source:{title:torri?'OpenStax, Measuring Pressure':"NASA, Boyle's Law",url:torri?'https://openstax.org/books/university-physics-volume-1/pages/14-2-measuring-pressure':'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/boyles-law/'},
  boundaries:{pool:false,tap:null,drain:null,caps:[]},action:vented?'Close air vent':'Open air vent'};
 var gas,tank,opening;
 if(torri){gas=R(328,40,64,304);tank=R(120,296,480,88);d.vessels=[{id:'bath',label:'Bath',rect:tank,sealed:false},{id:'tube',label:'Sealed water tube',rect:gas,sealed:true}];
  d.pipes=[{points:[{x:356,y:324},{x:356,y:352}],bore:32}];d.initial=[{kind:'rect',rect:R(336,48,48,288)},{kind:'rect',rect:R(128,328,464,48)},{kind:'pipe',points:d.pipes[0].points,bore:32,tile:8}];opening={axis:'x',at:392,start:56,end:72};d.vents=[R(384,56,8,16)];
  d.caption='The tall water column falls until the pressure difference can hold it. Open the top vent and the levels approach one another.';
 }else{gas=R(216,80,80,264);tank=R(424,32,80,312);d.vessels=[{id:'gas',label:'Trapped air',rect:gas,sealed:true},{id:'open',label:'Open arm',rect:tank,sealed:false}];
  d.pipes=[{points:[{x:260,y:316},{x:468,y:316}],bore:24}];d.initial=[{kind:'rect',rect:R(224,248,64,88)},{kind:'rect',rect:R(432,64,64,272)},{kind:'pipe',points:d.pipes[0].points,bore:24,tile:8}];opening={axis:'x',at:296,start:96,end:112};d.vents=[R(288,96,8,16)];
  d.caption='The taller water column compresses the trapped air. Open its vent and compare the levels.';
 }
 var units=root.WaterMachinesInstruments.scale({width:720*30/width,density:1});d.settings.minimumPressure=units.pressureFromPsi(.339-14.7);
 d.primary={kind:'cap',label:'Air vent',opening:opening,closed:!vented,openLabel:'Close air vent',closedLabel:'Open air vent'};d.boundaries.caps=vented?[]:[opening];
 d.measure={source:tank,receiver:gas,gasProbe:{x:gas.x+gas.width/2,y:gas.y+24}};d.columnRegions={tube:gas,bath:tank};
 d.boundaryNote='The box is '+width/12+' feet wide, with the same physical length, pressure and clock conversion used by the box-size experiment. Room pressure is 14.7 psi. All water moves through the actual bottom opening in the native MLS-MPM solver. The gas and water solve use a water-vapor floor of 0.339 psi absolute. '+(torri?'The upper column starts full of native water. A void, if one opens, comes from the native pressure-floor and interface transport; no height or cavity is drawn or assigned.':'The initial air inventory is trapped in the short arm. Its isothermal pressure changes as the real water displaces its volume. No level or gas volume is prescribed.');
 d.energyBudgetStatus='Initial water head supplies the work. Opening the real cap admits room air. This is a coarse water-column and isothermal-gas model with a vapor floor, not mercury, a perfect vacuum or resolved phase-change thermodynamics. No closed thermal-energy budget is claimed.';return d;
}
var previous=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(c){var d=c.definition;if(!d.pressureScaleLab)return previous&&previous.create?previous.create(c):null;
 var I=root.WaterMachinesInstruments,L=c.liquid,u=I.scale({width:720*30/d.physicalWidthInches,density:1}),pending=false,retired=false,last=-Infinity,pocket=null,error=null,start=L.simulationClock;
 function tick(){var a=L.liquid.arrays,n=L.liquid.getCount(),p={count:n,x:a.x,y:a.y},tube=I.vessel(p,d.columnRegions.tube),bath=I.vessel(p,d.columnRegions.bath);
  if(!pending&&performance.now()-last>160){last=performance.now();pending=true;c.airModel.capture().then(function(s){if(retired||!s)return;var cell=I.cell(s,d.measure.gasProbe.x,d.measure.gasProbe.y);pocket=cell&&cell.kind===2&&cell.root>0?s.pockets.find(function(q){return q.root===cell.root-1;}):null;}).catch(function(e){error=e.message;}).finally(function(){pending=false;});}
  var head=tube.level===null||bath.level===null?null:u.inches(Math.abs(bath.level-tube.level)),absolute=pocket?u.psi(c.airModel.settings.atmospherePressure+pocket.pressure):null;
  d.columnReading={seconds:L.simulationClock-start,widthInches:d.physicalWidthInches,waterCount:n,tube:tube,bath:bath,headInches:head,pocket:pocket,absolutePsi:absolute,error:error};
  d.readingLabel=(head===null?'':(head/12).toFixed(1)+' ft of water')+(absolute===null?'':'; air '+absolute.toFixed(2)+' psi absolute');
 }
 return{smoke:false,tick:tick,stats:function(){return d.columnReading;},destroy:function(){retired=true;}};
}};
root.WSSPressureScales={make:make};root.WSSMachines=root.WSSMachines||{};['boyle-j-tube','torricelli-tube'].forEach(function(id){root.WSSMachines[id]={make:function(w,o){return make(id,w,o);}};});
})(typeof window!=='undefined'?window:globalThis);
