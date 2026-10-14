/* A declared heat exchanger warms or chills air inside an inverted glass bulb. */
(function(root){
  'use strict';
  function make(world,options){
    options=options||{};
    if(world.w!==720 || world.h!==400 || world.tile!==8)throw Error('Thermoscope needs a 720 by 400 world.');
    var vented=options.vented===true,power=options.unheated?0:Number.isFinite(options.heatPower)?Math.max(-20,Math.min(20,options.heatPower)):0,heated=power>0;
    var bulb={x:288,y:72,width:144,height:96},basin={x:224,y:272,width:272,height:112};
    return {name:'thermoscope',title:"Galileo's thermoscope",setup:vented?'vented':power<0?'chilled':heated?'heated':'unheated',seed:options.seed||17,
      predictionKind:'thermoscope',action:power!==0?'Room temperature':'Warm the bulb',primary:{kind:'heat-toggle'},readingLabel:'Warm air moves water',
      caption:'Warm the air in the bulb and it pushes the water down the tube. Chill the air below room temperature and the water rises, as in Galileo\'s thermoscope.',
      source:{title:'Museo Galileo, Thermoscope',url:'https://catalogue.museogalileo.it/multimedia/ThermoscopeBis.html'},
      setups:[{id:'unheated',label:'Sealed bulb, room temperature',options:{unheated:true}},{id:'heated',label:'Sealed bulb, heating',options:{heatPower:10}},{id:'chilled',label:'Sealed bulb, cooling',options:{heatPower:-10}},{id:'vented',label:'Open vent, heating',options:{vented:true,heatPower:10}}],
      boundaryNote:'The bulb starts with room air at 68 degrees Fahrenheit and 14.7 psi absolute pressure. Its tube opens beneath the basin water. The marked heat exchanger warms or chills the smoke field; its temperature, averaged over the current native gas volume, drives the ideal gas law. An open upper vent is the comparison. There is no pump, prescribed pressure or moving water source.',
      energyBudgetStatus:'This is an ideal gas and an advected temperature approximation, not a calibrated thermometer. A declared 1 1/3 by 2/3-inch heater adds an adjustable temperature increment (9 degrees Fahrenheit at 1x output, from minus 20x to plus 20x) inside its patch at 30 samples per simulation second; 1 dye-alpha unit represents a 180-degree Fahrenheit increase. Room exchange relaxes the signed temperature difference at 0.5 per simulation second. Sixteen current smoke samples per pressure cell supply its area mean; native air volumes weight each pocket mean. Gas amount is conserved through the existing native topology, and the water responds to native pressure forces. Heat work, compressional heating, radiation and water heat exchange are not accounted here. Temperatures are limited to minus 112 through 1,651 degrees Fahrenheit. Cooling is an externally powered heat sink; water freezing and boiling are not modeled.',
      viewBounds:{x:208,y:56,width:304,height:328},
      vessels:[{id:'bulb',label:'Bulb',rect:bulb,sealed:true},{id:'basin',label:'Room water',rect:basin,sealed:false}],pipes:[],
      solids:[{x:344,y:160,width:8,height:200},{x:368,y:160,width:8,height:200}],
      vents:[{x:352,y:160,width:16,height:8}].concat(vented?[{x:416,y:96,width:16,height:16}]:[]),
      parts:[],slimes:[],initial:[{kind:'rect',vessel:'basin',rect:{x:232,y:296,width:256,height:80}}],
      marks:[{id:'initial-water',x:352,y:296,width:16}],
      meters:[{id:'stem',a:{x:352,y:336},b:{x:368,y:336},axis:'y',positive:1}],
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,
        nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,
        roomPressurePsi:14.7,minimumPressure:-80000,smokeTemperature:true,minimumTemperatureK:193.15},
      boundaries:{pool:false,tap:null,drain:null,caps:[],reservoirY:376},
      thermoscope:{heated:heated,heatPower:power,x:360,y:136,alphaPerSample:.05,width:32,height:16,cooling:.5,buoyancy:60},
      measure:{source:{x:344,y:168,width:32,height:192},receiver:basin,
        straw:{x:352,y:168,width:16,height:192},gasProbe:{x:360,y:112},bore:16,sourceLevel:296}
    };
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines.thermoscope={make:make};
})(typeof window!=='undefined'?window:globalThis);
