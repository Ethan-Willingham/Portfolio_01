/* A finite isothermal cave and a pressure-driven entrance. */
(function(root){
  'use strict';
  function make(world,options){
    options=options || {};
    if(world.w!==720 || world.h!==400 || (world.tile || 8)!==8)throw Error('The cave needs a 720 by 400 box.');
    ['closed','steady'].forEach(function(key){if(options[key]!==undefined && typeof options[key]!=='boolean')throw Error('Cave '+key+' must be a boolean.');});
    return {name:'breathing-cave',title:'Breathing cave',seed:options.seed || 17,
      viewBounds:{x:96,y:64,width:552,height:288},setup:options.closed?'closed':options.steady?'steady':'weather',
      setups:[{id:'weather',label:'Changing weather',options:{}},{id:'steady',label:'Steady pressure',options:{steady:true}},{id:'closed',label:'Closed mouth',options:{closed:true}}],
      caption:'Falling outside pressure lets the cave breathe out. Rising pressure pushes air back in. The weather cycle is sped up so you can watch it.',
      action:options.closed?'Open cave mouth':'Close cave mouth',primary:{kind:'valve',id:'mouth'},
      vessels:[{id:'Cave',label:'Cave',sealed:true,rect:{x:112,y:128,width:368,height:208}}],
      pipes:[{points:[{x:460,y:220},{x:596,y:220}],bore:32}],
      parts:[{type:'valve',id:'mouth',rect:{x:528,y:208,width:8,height:32},direction:'right',open:!options.closed}],
      solids:[],vents:[],initial:[],slimes:[],meters:[],marks:[],settings:{enabled:false},measure:{},
      cave:{chamber:{x:120,y:136,width:352,height:192},gate:{x:528,y:208,width:8,height:32},
        depth:10,temperature:293.15,gasConstant:287.05,ambientPa:101325,amplitudePa:options.steady?0:3000,
        periodSeconds:24,neckLength:136,lossCoefficient:2.4},
      boundaryNote:'This cave uses its own large scale: one world pixel is one meter, with a ten-meter section depth. Outside air follows a declared 24-second, plus or minus 30 hPa weather cycle. The chamber holds finite ideal gas at 20 degrees Celsius. The actual entrance valve traps that gas when closed. The steady-pressure comparison has the same air but no weather forcing.',
      source:{title:'National Park Service, What causes the wind of Wind Cave',url:'https://www.nps.gov/wica/learn/education/what-causes-the-wind-of-wind-cave.htm'},
      energyBudgetStatus:'Outside pressure supplies the drive. A lumped isothermal gas inventory and inertial entrance with quadratic pressure loss determine the signed airflow. A wall-respecting potential field distributes that computed flow. Visible arrow markers move with its current velocity and have no gas mass. This reduced model does not resolve acoustic waves, turbulence, heat exchange or a closed energy budget. No timed flow reversal, fan or water-pressure solver is used.'};
  }
  root.WSSMachines=root.WSSMachines || {};root.WSSMachines['breathing-cave']={make:make};
})(typeof window!=='undefined'?window:globalThis);
