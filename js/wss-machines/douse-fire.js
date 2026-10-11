/* A declared finite hot source, extinguished by real native water contact. */
(function(root){
  'use strict';
  function make(world,options){
    options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('Fire needs a 720 by 400 world.');
    var miss=!!options.miss,basin={x:112,y:296,width:496,height:88};
    return {name:'douse-fire',title:'Put out the fire',seed:options.seed||17,setup:miss?'miss':'hit',
      action:'Pour water',primary:{kind:'fire-pour'},readingLabel:'Hot fuel',
      setups:[{id:'hit',label:'Pour onto the fire',options:{miss:false}},{id:'miss',label:'Pour beside it',options:{miss:true}}],
      caption:'Pour water onto the fire and watch it hiss out as the water removes heat. The declared ember reheats the fuel once the water runs off, so the fire can catch again.',
      source:{title:'National Park Service, Wildland Fire Facts: There Must Be All Three',url:'https://www.nps.gov/articles/wildlandfire-facts-fuel-heat-oxygen.htm'},
      boundaryNote:'The fuel starts hot and burning above an open grate between two side supports. Each Pour queues up to 700 real water parcels, admitted through the marked spout at 600 parcels per simulation second and native rest spacing; the comparison pours beside the source. Water passes through the grate into the basin. Touching water smothers the fuel; a declared ember held at 1,472 degrees Fahrenheit reheats it after contact ends. The ignition threshold is 662 degrees Fahrenheit.',
      energyBudgetStatus:'Current native GPU positions determine wet contact with a stationary declared fuel heat patch above the open grate. The small fuel has 8.20 foot-pounds per degree Fahrenheit of heat capacity and exchanges heat with separate per-parcel sensible temperatures, capped at 203 degrees Fahrenheit; native water responds through the coarse bath thermal field. The grate, fixed-temperature ember and lumped fuel approximate a small hearth. Fuel and ember input, room loss and water heat are recorded. The temperature palette approximates black-body color, with no prescribed flame outline. Sealed-pocket heating, boiling and combustion chemistry are pending.',
      viewBounds:{x:104,y:64,width:512,height:320},
      vessels:[{id:'basin',rect:basin,sealed:false}],pipes:[],solids:[{x:328,y:312,width:16,height:8},{x:376,y:312,width:16,height:8}],vents:[],parts:[],slimes:[],
      initial:[],marks:[],meters:[],settings:{},boundaries:null,
      fire:{source:{x:352,y:296,width:16,height:16},x:360,y:300,noEmber:!!options.noEmber,pour:{x:miss?208:360,y:96}},
      measure:{source:basin,receiver:basin}
    };
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['douse-fire']={make:make};
})(typeof window!=='undefined'?window:globalThis);
