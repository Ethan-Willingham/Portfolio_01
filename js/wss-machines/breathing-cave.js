/* A finite isothermal cave and a pressure-driven entrance. */
(function(root){
  'use strict';
  function make(world,options){
    options=options || {};
    if(world.w!==720 || world.h!==400 || (world.tile || 8)!==8)throw Error('The cave needs a 720 by 400 box.');
    ['closed','steady'].forEach(function(key){if(options[key]!==undefined && typeof options[key]!=='boolean')throw Error('Cave '+key+' must be a boolean.');});
    return {name:'breathing-cave',title:'Breathing cave',seed:options.seed || 17,
      viewBounds:{x:96,y:64,width:552,height:288},setup:options.closed?'closed':'manual',
      setups:[{id:'manual',label:'Equal starting pressures',options:{}},{id:'closed',label:'Closed mouth',options:{closed:true}}],
      caption:'Hold either pressure button to raise that side. The difference drives the air, and the pivoted vanes turn with it. Close the mouth to trap the cave air.',
      action:options.closed?'Open cave mouth':'Close cave mouth',primary:{kind:'valve',id:'mouth'},
      vessels:[{id:'Cave',label:'Cave',sealed:true,rect:{x:112,y:128,width:368,height:208}}],
      pipes:[{points:[{x:460,y:220},{x:596,y:220}],bore:32}],
      parts:[{type:'valve',id:'mouth',rect:{x:528,y:208,width:8,height:32},direction:'right',open:!options.closed}],
      solids:[],vents:[],initial:[],slimes:[],meters:[],marks:[],settings:{enabled:false},measure:{},
      cave:{chamber:{x:120,y:136,width:352,height:192},gate:{x:528,y:208,width:8,height:32},
        depth:10,temperature:293.15,gasConstant:287.05,ambientPa:101325,pressureStepPa:1000,pressureHoldRatePaPerSecond:4000,
        neckLength:136,lossCoefficient:2.4,
        vane:{arm:.36,area:.03,dragCoefficient:1.2,inertia:.0004,bearingDrag:.0001,spring:.0000002}},
      boundaryNote:'One world pixel is one meter, with a ten-meter section depth. Both sides start at 1013.25 hPa. A press adds 10 hPa. Holding adds 40 hPa per second after the initial press. Inside pressure is raised by adding actual air mass at 20 degrees Celsius. Outside pressure is a manually controlled reservoir boundary. The pinned vane instruments are drawn larger than their physical size. Their sails sit 36 cm ahead of the pivot, with lightweight inertia, low bearing drag and a weak torsion spring.',
      source:{title:'National Park Service, What causes the wind of Wind Cave',url:'https://www.nps.gov/wica/learn/education/what-causes-the-wind-of-wind-cave.htm'},
      energyBudgetStatus:'Manual pressure inputs supply the drive. Inside inputs add recorded gas mass; outside inputs change the reservoir boundary. An isothermal inventory and inertial entrance with quadratic loss determine the airflow. A wall-respecting potential field drives drag torque on pinned vane instruments. Their angular momentum, bearing drag and torsion springs determine their rotation; no angle interpolation or timed reversal is used. These diagnostic probes do not feed back into the air. Acoustic waves, turbulence, heat exchange and a closed energy budget remain unresolved.'};
  }
  root.WSSMachines=root.WSSMachines || {};root.WSSMachines['breathing-cave']={make:make};
})(typeof window!=='undefined'?window:globalThis);
