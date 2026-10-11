/* Two initial populations for the same opt-in multi-material MLS grid. */
(function(root){
'use strict';
function make(sand,world,options){
 options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('The slip jar needs a 720 by 400 world.');
 var matched=options.matched===true,jar={x:248,y:56,width:224,height:320},id=sand?'material-sand-jar':'material-oil-jar';
 return {name:id,title:sand?'Grain settling (prototype)':'Oil slip jar (prototype)',setup:matched?'matched-density':'ordinary',action:'Stir once',primary:{kind:'material-jolt'},readingLabel:'Separate material momentum',
 caption:sand?'Each grain has more mass than the water it displaces. Stir once and watch where the grains settle.':'Oil and water carry separate momentum in the shared solver. Stir once and watch whether they separate.',
 source:{title:'Tampubolon and colleagues, Multi-species simulation of porous sand and water mixtures',url:'https://math.ucdavis.edu/~jteran/papers/PGKFTJM17.pdf'},
 setups:[{id:'ordinary',label:'Different densities',options:{}},{id:'matched-density',label:'Matched densities',options:{matched:true}}],
 viewBounds:{x:208,y:0,width:304,height:400},vessels:[{id:'jar',label:sand?'Grains in water':'Oil and water',rect:jar,sealed:false}],pipes:[],solids:[],vents:[],parts:[],slimes:[],
 initial:[{kind:'rect',rect:{x:256,y:120,width:208,height:248}}],marks:[],meters:[],settings:{},boundaries:null,
 materialAt:function(x,y){
  if(!sand)return y>=244?'oil':'water';
  var column=Math.floor((x-256)/1.25),row=Math.floor((y-120)/1.25);
  return y>=132&&y<232&&column%4===0&&row%4===0?'sand':'water';
 },
 materialSlip:{density:[1,matched?1:.7733,matched?1:2.65],drag:[4,4,4]},
 boundaryNote:'This open jar has no supply, drain, hidden refill or air-pressure model. All parcels keep their native material identity. Each equal-reference-volume parcel carries its own phase mass: water 1, hydrocarbon 0.7733 and quartz grain 2.65, or all 1 in the comparison. Water is rounded to 62.4 pounds per cubic foot; hydrocarbon density is the NIST hexadecane measurement at 68 degrees Fahrenheit, and quartz density follows the EPA value. This is not calibrated hexadecane or a measured settling-speed model.',
 energyBudgetStatus:'Water, oil and grains use separate momentum on the same native MLS grid. Total occupied reference volume supplies the shared weakly compressible pressure stress; all phases have the same gravity. Interphase drag uses implicit equal/opposite pair impulses with a declared four-per-native-second relative-velocity relaxation rate. This positive drag rate is an exploratory model parameter, not a measured oil viscosity or sand permeability. The Stir action supplies the same declared horizontal impulse to every material; the walls absorb its momentum. The existing pressure shock limiter and grain contact projections are numerical stabilizers with unmeasured work. Native grain contacts and friction remain, but there is no Drucker-Prager soil law, pore-scale wetting, capillarity, interfacial tension, resolved emulsion or closed mechanical energy ledger. No vertical sorting force, particle relabeling or prescribed trajectory exists.',
 measure:{source:jar,receiver:jar}};
}
root.WSSMachines=root.WSSMachines||{};
root.WSSMachines['material-oil-jar']={make:function(world,options){return make(false,world,options);}};
root.WSSMachines['material-sand-jar']={make:function(world,options){return make(true,world,options);}};
})(typeof window!=='undefined'?window:globalThis);
