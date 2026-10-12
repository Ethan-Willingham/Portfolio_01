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
      action:'Strike the drumhead',readingLabel:'Smoke carries the push',primary:{kind:'smoke-push'},
      drum:{x:88,top:128,bottom:272,thickness:8,nodes:37,mass:.12,tension:650,damping:.6,strikeSpeed:450},
      caption:'Strike the flexible back of the chamber. Its moving skin pushes smoky air through the opening; the edges roll into the two rotating halves of a smoke ring in this flat view.',
      source:{title:'BYU Physics, Vortex Cannon',url:'https://physics.byu.edu/faculty/gee/vortexcannon'},
      boundaryNote:'The chamber has a 1 1/3-inch opening and a flexible rear membrane with fixed ends. A strike adds momentum only to the membrane. The smoke solver measures its actual motion as a moving boundary and projects the resulting airflow through the opening. Current pressure on both sides loads the membrane on the next step. Strikes replenish passive smoke dye inside the chamber. The no-push comparison keeps the same membrane and smoke without a strike. No wind, buoyancy, prescribed vortex or motion path drives the ring. The slime is free in zero gravity.',
      energyBudgetStatus:'The drumhead is a damped, tensioned one-dimensional membrane in a two-dimensional air section. Strikes supply external membrane momentum; tension and damping determine its rebound. Current smoke projection pressure loads both the membrane and the elastic slime. The immersed boundary bounds air velocity at the solver resolution and uses a one-step pressure lag. This is an approximate coupling, not calibrated air pressure, three-dimensional drum acoustics or a closed energy budget. Normalized air density is 0.00006; membrane node mass is 0.12 and gel node mass is 0.09.',
      vessels:[],pipes:[],solids:[{x:80,y:120,width:168,height:8},{x:80,y:272,width:168,height:8},
        {x:240,y:120,width:8,height:64},{x:240,y:216,width:8,height:64}],
      vents:[],initial:[],slimes:[{x:440,y:200,radius:32}],parts:[],meters:[],marks:[],settings:{},measure:{}};
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['smoke-ring-cannon']={make:make};
})(typeof window!=='undefined'?window:globalThis);
