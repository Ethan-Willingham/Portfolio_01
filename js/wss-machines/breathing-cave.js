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
      caption:'Set inside and outside pressure with the sliders. Click the cave to release smoke and watch it move with the air. Close the mouth to stop the flow.',
      action:options.closed?'Open cave mouth':'Close cave mouth',primary:{kind:'valve',id:'mouth'},
      vessels:[{id:'Cave',label:'Cave',sealed:true,rect:{x:112,y:128,width:368,height:208}}],
      pipes:[{points:[{x:460,y:220},{x:596,y:220}],bore:32}],
      parts:[{type:'valve',id:'mouth',rect:{x:528,y:208,width:8,height:32},direction:'right',open:!options.closed}],
      solids:[],vents:[],initial:[],slimes:[],meters:[],marks:[],settings:{enabled:false},measure:{},
      cave:{chamber:{x:120,y:136,width:352,height:192},gate:{x:528,y:208,width:8,height:32},
        depth:10,temperature:293.15,gasConstant:287.05,ambientPa:101325,pressureStepPa:1000,pressureMinPa:90000,pressureMaxPa:120000,controlPressure:true,
        neckLength:136,lossCoefficient:2.4,
        arrow:{mass:.002,inertia:.00004,dragCoefficient:1.2,radius:.4,sails:[{arm:.36,area:.03},{arm:-.12,area:.006}]}},
      boundaryNote:'One world pixel is one meter, with a ten-meter section depth. Both sides start at 1013.25 hPa. Both sliders span 900 to 1200 hPa. An ideal pressure controller adds or removes recorded air mass to hold the inside setting at 20 degrees Celsius. The outside setting is the reservoir pressure. Clicks add passive smoke concentration, carried through clear cells by the calculated air velocity. The arrows represent lightweight airflow probes, drawn larger than their physical size. Drag on their front and rear sails drives both their travel and turning. Each arrow keeps its position and momentum when the flow reverses.',
      source:{title:'National Park Service, What causes the wind of Wind Cave',url:'https://www.nps.gov/wica/learn/education/what-causes-the-wind-of-wind-cave.htm'},
      energyBudgetStatus:'Manual pressure inputs supply the drive. Inside control adds or removes recorded gas mass to maintain the chosen pressure; outside control changes the reservoir boundary. An isothermal inventory and inertial entrance with quadratic loss determine the airflow. A wall-respecting potential field drives relative air drag on two sails per free arrow. The same forces determine linear and angular momentum. Solid walls apply inelastic normal contact impulses. These diagnostic probes do not feed back into the air; arrows are never reseeded, wrapped or reset on reversal. Acoustic waves, turbulence, heat exchange and a closed energy budget remain unresolved.'};
  }
  root.WSSMachines=root.WSSMachines || {};root.WSSMachines['breathing-cave']={make:make};
})(typeof window!=='undefined'?window:globalThis);
