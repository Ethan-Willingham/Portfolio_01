/* Three fixed-ballast gas slimes under a visible driven pressure boundary. */
(function(root){
  'use strict';
  function make(world,options){
    options=options || {};if(world.w!==720 || world.h!==400 || world.tile!==8)throw Error('Cartesian divers need a 720 by 400 world.');
    var vented=!!options.vented,squeezed=options.squeezed!==false,jar={x:200,y:112,width:320,height:272};
    return {name:'cartesian-divers',title:'Three Cartesian divers',seed:options.seed || 17,setup:vented?'vented':'sealed',
      action:squeezed?'Release the squeeze':'Squeeze the jar',primary:{kind:'diver-squeeze'},readingLabel:'Gas shrinks under pressure',
      caption:'Squeezing a sealed water bottle compresses a diver\'s air and can make it sink. Here a visible driven piston supplies the squeeze to three gas slimes with fixed ballast; release it to let them expand again.',
      source:{title:'Exploratorium, Condiment Diver',url:'https://annex.exploratorium.edu/wsw/progress_snacks/condiment_diver/'},
      setups:[{id:'sealed',label:'Sealed jar',options:{}},{id:'vented',label:'Open air vent',options:{vented:true}}],
      boundaryNote:'The piston is a declared moving pressure boundary, with a 1 1/3-inch stroke at 1/3 inch per native simulation second. It compresses the real top air pocket; the open side vent connects that pocket to room air. No water source, drain or gas source changes the inventory. Each diver keeps its initial gas amount and ballast mass. Current native pressure sampled immediately below its ring sets its isothermal target area. Grab can move the divers.',
      energyBudgetStatus:'The ideal motor supplies and removes external work. The air and water pressure solver handles the piston boundary and the divers displace native MLS-MPM water. Diver target area follows Boyle\'s law, using fixed room-reference gas amount divided by current absolute pressure. Actual enclosed area divided by fixed mass sets buoyancy through the existing approximate slime-water coupling. Current connected native water columns across the physical jar establish its measured median free surface. Columns interrupted by a solid body and detached spray are excluded. Actual ring area inside that measured water region sets submerged volume; this is a whole-jar hydrostatic surface approximation, rather than exact transient pressure traction. Declared linear flow drag is 2 per second and body viscosity is 0.6 per second; quadratic entry drag retains the existing material length scale. The elastic lattice can resist its target volume; it is a coarse two-dimensional gas slime, not a calibrated bottle or sealed energy budget. Ballast densities start at 0.94, 0.88 and 0.82 times water density; room air starts at 14.7 psi and stays isothermal. Pressure samples carry their native frame, clock and measured latency. No sink order or depth is prescribed.',
      viewBounds:{x:184,y:72,width:352,height:312},vessels:[{id:'jar',label:vented?'Vented jar':'Sealed jar',rect:jar,sealed:true}],pipes:[],solids:[],
      vents:vented?[{x:192,y:184,width:16,height:16}]:[],parts:[],
      initial:[{kind:'rect',rect:{x:208,y:200,width:304,height:176}}],
      slimes:[{x:280,y:214,radius:24,density:.94},{x:360,y:214,radius:28,density:.88},{x:440,y:214,radius:32,density:.82}],marks:[],meters:[],
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,
        nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},
      boundaries:null,divers:{vented:vented,squeezed:squeezed,piston:{x:200,y:128,width:320,height:16},stroke:32,speed:8,dragRate:2,viscosity:.6},measure:{source:jar,receiver:jar}};
  }
  root.WSSMachines=root.WSSMachines || {};root.WSSMachines['cartesian-divers']={make:make};
})(typeof window!=='undefined'?window:globalThis);
