/* A declared finite hot source, extinguished by real native water contact. */
(function(root){
  'use strict';
  function make(world,options){
    options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('Fire needs a 720 by 400 world.');
    var miss=!!options.miss,basin={x:112,y:296,width:496,height:88};
    return {name:'douse-fire',title:'Put out the fire',seed:options.seed||17,setup:miss?'miss':'hit',
      action:'Pour water',primary:{kind:'fire-pour'},readingLabel:'Hot fuel',
      setups:[{id:'hit',label:'Pour onto the fire',options:{miss:false}},{id:'miss',label:'Pour beside it',options:{miss:true}}],
      caption:'Hold the pour button to send water onto the fire and watch it hiss out as the water removes heat. Fuel that stays hot can catch again when air reaches it.',
      source:{title:'National Park Service, Wildland Fire Facts: There Must Be All Three',url:'https://www.nps.gov/articles/wildlandfire-facts-fuel-heat-oxygen.htm'},
      boundaryNote:'The fuel starts hot above an open grate between two side supports. Holding the pour button admits real water through the marked spout at 1,800 parcels per simulation second. Releasing stops admission immediately; water already falling continues into the basin. The comparison pours beside the source. Touching water cools and smothers the fuel. A finite hot fuel reservoir can resume reacting while oxygen reaches it and it remains above the ignition threshold of 662 degrees Fahrenheit.',
      energyBudgetStatus:'Current native GPU water contact cools a finite hot fuel patch. Spatial oxygen arriving through the airflow is consumed locally; measured oxygen consumption supplies chemical heat. The fuel has finite sensible heat, room losses and a finite combustible inventory. There is no fixed-temperature ember. Water temperatures use a coarse sensible-heat field; detailed combustion chemistry and laboratory calibration remain outside this miniature hearth model.',
      viewBounds:{x:104,y:64,width:512,height:320},
      vessels:[{id:'basin',rect:basin,sealed:false}],pipes:[],solids:[{x:328,y:312,width:16,height:8},{x:376,y:312,width:16,height:8}],vents:[],parts:[],slimes:[],
      initial:[],marks:[],meters:[],settings:{},boundaries:null,
      fire:{source:{x:352,y:296,width:16,height:16},x:360,y:300,noEmber:!!options.noEmber,pour:{x:miss?208:360,y:96}},
      measure:{source:basin,receiver:basin}
    };
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['douse-fire']={make:make};
})(typeof window!=='undefined'?window:globalThis);
