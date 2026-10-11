/* A rear impulse drives smoke through the real opening into the room. */
(function(root){
  'use strict';
  function make(world,options){
    options=options||{};
    if(world.w!==720||world.h!==400||(world.tile||8)!==8)throw new Error('The cannon needs a 720 by 400 box.');
    if(options.noPush!==undefined&&typeof options.noPush!=='boolean')throw new Error('No-push control must be a boolean.');
    var seed=options.seed===undefined?17:options.seed;
    if(!Number.isInteger(seed)||seed<1||seed>4294967295)throw new Error('Cannon seed must be a positive 32-bit integer.');
    return {name:'smoke-ring-cannon',title:'The smoke-ring cannon',seed:seed,noPush:options.noPush===true,
      viewBounds:{x:64,y:72,width:600,height:264},setup:options.noPush?'no-push':'ordinary',
      setups:[{id:'ordinary',label:'Push the back',options:{noPush:false}},{id:'no-push',label:'No push',options:{noPush:true}}],
      action:'Tap the back',readingLabel:'Smoke carries the push',primary:{kind:'smoke-push'},
      caption:'A pulse of air through a small opening rolls into a traveling vortex. Tap the back to shoot another at the slime; this flat view shows the two rotating halves of a smoke ring.',
      source:{title:'BYU Physics, Vortex Cannon',url:'https://physics.byu.edu/faculty/gee/vortexcannon'},
      boundaryNote:'The visible chamber has a 1 1/3-inch opening. Opening the scene applies one declared rear impulse, and each tap applies the same impulse. Smoke dye is supplied in the chamber at setup and fades by the solver\'s declared dissipation. There is no wind, buoyancy, confinement force, prescribed vortex or motion path. The slime is free in zero gravity.',
      energyBudgetStatus:'Rear pushes are external air impulses. Current smoke projection pressure loads the elastic slime ring, and its moving boundary returns motion to the flow. This is an approximate two-dimensional traction model, not a calibrated three-dimensional ring or a closed energy budget.',
      vessels:[],pipes:[],solids:[{x:80,y:144,width:168,height:8},{x:80,y:248,width:168,height:8},
        {x:80,y:144,width:8,height:112},{x:240,y:144,width:8,height:40},{x:240,y:216,width:8,height:40}],
      vents:[],initial:[],slimes:[{x:440,y:200,radius:32}],parts:[],meters:[],marks:[],settings:{},measure:{}};
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['smoke-ring-cannon']={make:make};
})(typeof window!=='undefined'?window:globalThis);
