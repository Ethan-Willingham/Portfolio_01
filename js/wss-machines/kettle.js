/* Native phase change with a declared finite gas port and a pipe whistle. */
(function(root){
  'use strict';
  function caption(heated,capped,unheated){
    if(capped)return 'The capped whistle holds the vapor inside the kettle. Turn off the heater and cooling condenses it back into water.';
    if(unheated)return 'The hot water cools without a heater and makes no vapor. Settling water can still push dry air through the whistle.';
    if(!heated)return 'The heater is off, and the water and vapor are cooling. The white tracer follows any steam still escaping.';
    return 'The marked heater boils the water, and pressure sends vapor through the narrow whistle. Turn off the heater to cool it; the white tracer follows the steam escaping.';
  }
  function make(world,options){
    options=options||{};
    if(world.w!==720 || world.h!==400 || world.tile!==8)throw Error('Kettle needs a 720 by 400 world.');
    var heated=options.unheated!==true,capped=options.capped===true,kettle={x:272,y:152,width:176,height:208},water={x:280,y:280,width:160,height:72};
    return {name:'kettle',title:'Whistling kettle prototype',setup:capped?'capped':heated?'heated':'unheated',seed:options.seed||17,
      action:heated?'Turn heater off':'Turn heater on',primary:{kind:'steam-heat-toggle'},
      caption:caption(heated,capped,!heated),
      source:{title:'NIST, steam tables',url:'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=906704'},
      setups:[{id:'heated',label:'Heater on',options:{}},{id:'unheated',label:'No heater',options:{unheated:true}},{id:'capped',label:'Capped whistle',options:{capped:true}}],
      boundaryNote:'The glass kettle begins with 212-degree-Fahrenheit water and room air at 68 degrees Fahrenheit and 14.7 psi. A marked immersed heater supplies 10,000 watts while on. A gas-only port has a 1/4-inch throat, a 0.62 discharge coefficient and a two-inch whistle pipe. Its flow follows pressure, area and gas density with a sonic limit and a two-percent explicit transfer limit per substep. Water covering its inside inlet blocks it. The port admits room air during cooling. Liquid walls stay sealed; no water enters or leaves through a tap or drain. The capped comparison closes this gas boundary.',
      energyBudgetStatus:'Each native parcel carries its actual rest area through a one-inch slice, about 0.000098 pounds of water. The finite heater shares power among water touching its marked patch. Native exposed area and a half-second material relaxation time limit phase exchange; waiting retains sensible and latent heat. Vaporization uses the NIST steam-table value at 212 degrees Fahrenheit. Vapor is well mixed within native gas lineage and supplies its nRT separately from room-temperature dry air. Vapor positions are not separately advected. Unresolved dry pockets retain amount locally and return through open neighboring gas faces; retained dry gas and stranded vapor have no resolved pressure. A finite uncalibrated wall conductance condenses the same native slot at its retained position. Liquid cooling removes one percent of excess enthalpy per simulation second. Vapor escape is quantized to whole parcels, with a reported transfer credit of less than one parcel when a vapor parcel is available. Escaped enthalpy, mass and admitted dry air are accounted for. Fresh GPU vent events drive an advected white vapor tracer and a quiet pipe-mode sound estimate, with pitch from sound speed and pipe length and gain from escaping kinetic-energy flux. The tracer is not a fog-droplet model and the sound does not resolve the three-dimensional hole-tone feedback. Vapor momentum inside the kettle, small-bubble rise, compressional work and a calibrated boiling correlation are unresolved. The thermal-core run measured a 0.053-percent enthalpy residual. Readback rounds four heat counters per parcel, giving an explicit aggregate quantization bound; the test allows that bound plus a 0.1-percent margin for floating-point accumulation.',
      viewBounds:{x:240,y:8,width:272,height:368},
      vessels:[{id:'kettle',label:'Kettle',rect:kettle,sealed:true}],pipes:[],
      solids:[],vents:[],parts:[],slimes:[],initial:[{kind:'rect',vessel:'kettle',rect:water}],
      marks:[{id:'initial-water',x:280,y:280,width:160}],meters:[{id:'water',a:{x:280,y:328},b:{x:440,y:328},axis:'y',positive:1}],
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,
        nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,
        roomPressurePsi:14.7,minimumPressure:-80000,phaseChange:true},
      boundaries:{pool:false,tap:null,drain:null,caps:[],reservoirY:352},
      steam:{heated:heated,capped:capped,seed:options.seed||17,heater:{x:344,y:280,width:32,height:8},powerWatts:10000,initialC:100,vaporConductance:.2,phaseRelaxationSeconds:.5,
        vent:{x:416,y:164},outlet:{x:416,y:112},ventDiameterInches:.25,ventCoefficient:.62,whistleLengthInches:2},
      measure:{source:kettle,receiver:kettle,straw:kettle,gasProbe:{x:360,y:200},bore:16,sourceLevel:280}
    };
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines.kettle={make:make,caption:caption};
})(typeof window!=='undefined'?window:globalThis);
