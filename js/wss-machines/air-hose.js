/* Lab-only precursor to dissolved-gas machines. */
(function(root){
  'use strict';
  function make(world,options){
    options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('Air hose needs a 720 by 400 world.');
    var inject=options.inject!==false,jar={x:248,y:56,width:224,height:328};
    return {name:'air-hose',title:'Air hose prototype',seed:options.seed||17,setup:inject?'air-on':'air-off',action:inject?'Stop the air':'Start the air',primary:{kind:'bubble-toggle'},readingLabel:'Gas parcels',
      caption:'A bubble expands as the surrounding water pressure falls. This declared air hose supplies gas at the bottom; stop it to watch the remaining bubbles reach the surface.',
      source:{title:'Patkar and colleagues, Hybrid Lagrangian-Eulerian Bubble Formulation',url:'https://pages.cs.wisc.edu/~aanjneya/papers/HLEFBGD/paper.html'},
      setups:[{id:'air-on',label:'Air on',options:{}},{id:'air-off',label:'Air off',options:{inject:false}}],
      viewBounds:{x:208,y:40,width:304,height:344},vessels:[{id:'jar',label:'Water',rect:jar,sealed:false}],pipes:[],solids:[],vents:[],parts:[],slimes:[],
      initial:[{kind:'rect',rect:{x:256,y:112,width:208,height:264}}],marks:[],meters:[],
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,phaseChange:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},boundaries:null,
      bubbles:{inject:inject,hose:{x:360,y:352},rateArea:195,parcelArea:65,dragCoefficient:1,gravity:250},measure:{source:jar,receiver:jar},
      boundaryNote:'The marked hose supplies 0.34 cubic inches of room-reference gas per native simulation second in three quantized parcels. It adds gas, never water. The source cell is declared gas for three native substeps after admission so gas pressure can open the sparger. Gas parcels use the engine allocation capacity; no machine cap removes bubbles. The ordinary air-pressure ownership threshold is unchanged.',
      energyBudgetStatus:'Gas amount is conserved through each dispersed parcel, current Eulerian pocket and surface exit. Room-reference amount sets an isothermal cylindrical volume under current native exterior pressure and Laplace surface tension. A bubble rides the current native projected water faces with a slip from buoyancy balanced by quadratic cylinder drag, coefficient 1. The small-bubble interface excludes actual native water parcels and transmits its normal speed to them. This is a quasi-static reduced interface model, rather than the monolithic Rayleigh-Plesset coupling in the cited research. It omits bubble inertia, resolved wake drag reaction, surface deformation, gas mixing and a closed mechanical work ledger. Whole gas parcels enter the largest current positive-overlap gas descendant and remain spatially anchored there; supported pockets above three coarse cells use Eulerian pressure instead of a disk boundary. A lost supported pocket returns to a dispersed parcel at its last validated local support. Growth, coalescence, source work, surface tension and representation changes have unmeasured mechanical work. No prescribed upward water flow, plume trajectory, liquid source or liquid sink exists.'};
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['air-hose']={make:make};
})(typeof window!=='undefined'?window:globalThis);
