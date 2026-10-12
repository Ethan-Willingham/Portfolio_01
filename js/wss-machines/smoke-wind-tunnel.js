/* A steady fan drives native smoke around a supported elastic slime. */
(function(root){
  'use strict';
  function make(world,options){
    options=options || {};
    if(world.w!==720 || world.h!==400 || (world.tile || 8)!==8)throw Error('The smoke tunnel needs a 720 by 400 box.');
    if(options.fanOff!==undefined && typeof options.fanOff!=='boolean')throw Error('Fan-off control must be a boolean.');
    var seed=options.seed===undefined ? 17 : options.seed;
    if(!Number.isInteger(seed) || seed<1 || seed>4294967295)throw Error('Tunnel seed must be a positive 32-bit integer.');
    return {name:'smoke-wind-tunnel',title:'The slime wind tunnel',seed:seed,
      viewBounds:{x:56,y:88,width:624,height:224},setup:options.fanOff ? 'fan-off' : 'fan-on',
      setups:[{id:'fan-on',label:'Fan on',options:{}},{id:'fan-off',label:'Fan off',options:{fanOff:true}}],
      action:options.fanOff ? 'Start fan' : 'Stop fan',readingLabel:'Smoke around the slime',primary:{kind:'smoke-fan'},
      fan:{x:120,top:144,bottom:256,spacing:16,acceleration:3600,enabled:!options.fanOff},
      tracer:{rate:2.4,initialAmount:.8,radius:.035,start:164,end:616,step:20,top:152,bottom:248,spacing:32},
      support:{x:416,y:200,top:112,stiffness:144,damping:8},
      caption:'Flow past a round body can shed alternating eddies. Stop the fan or tug the slime to change its wake in this two-dimensional model.',
      source:{title:'NASA, Laminar flow over a cylinder',url:'https://www.grc.nasa.gov/WWW/wind/valid/lamcyl/lam_cyl.html'},
      boundaryNote:'The marked fan supplies a steady horizontal air impulse at its inlet. Faint passive smoke streaks start throughout the channel with zero velocity in both setups; the inlet adds more tracer, even with the fan off, and it fades by the smoke solver\'s dissipation. The slime starts halfway along the straight channel and on its centerline. Its central material point is attached to the drawn support by a damped compliant spring; the rest remains elastic and can be grabbed. The right edge of the view is open to room pressure: air and smoke can leave the screen, and incoming air carries no dye. There is no warm-up, imposed swirl, alternating fan strength, buoyancy, ambient wind or motion path. Gravity is zero.',
      energyBudgetStatus:'The fan is a declared external momentum source. Current smoke projection pressure loads the slime, and its moving boundary returns motion to the air. The support stores spring energy and dissipates motion through its damper. The normalized air density is 0.00006 and each gel node has mass 0.09, as in the smoke cannon. This is an approximate two-dimensional traction model with numerical dissipation, not calibrated air pressure, Reynolds number or a closed energy budget.',
      vessels:[],pipes:[],solids:[{x:80,y:120,width:72,height:8},{x:80,y:272,width:72,height:8},
        {x:80,y:120,width:8,height:160},{x:160,y:104,width:512,height:8},{x:160,y:288,width:512,height:8}],
      vents:[],initial:[],slimes:[{x:416,y:200,radius:36}],parts:[],meters:[],marks:[],settings:{},measure:{}};
  }
  root.WSSMachines=root.WSSMachines || {};root.WSSMachines['smoke-wind-tunnel']={make:make};
})(typeof window!=='undefined'?window:globalThis);
