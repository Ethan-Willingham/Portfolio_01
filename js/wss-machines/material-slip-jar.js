/* Two initial populations for the same opt-in multi-material MLS grid. */
(function(root){
'use strict';
function make(sand,world,options){
 options=options||{};if(world.w!==720||world.h!==400||world.tile!==8)throw Error('The slip jar needs a 720 by 400 world.');
 var matched=options.matched===true,jar={x:248,y:56,width:224,height:320},id=sand?'material-sand-jar':'material-oil-jar';
 return {name:id,title:sand?'Grain settling (prototype)':'Oil and water',setup:matched?'matched-density':'ordinary',action:'Stir once',primary:{kind:'material-jolt'},readingLabel:sand?'Separate material momentum':'Oil and water',
 caption:sand?'Each grain has more mass than the water it displaces. Stir once and watch where the grains settle.':'Stir once to mix the pale oil and blue water. The lighter oil rises as the two liquids move past each other.',
 source:sand?{title:'Tampubolon and colleagues, Multi-species simulation of porous sand and water mixtures',url:'https://math.ucdavis.edu/~jteran/papers/PGKFTJM17.pdf'}:{title:'NIST hexadecane density at 68 degrees Fahrenheit',url:'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=902259'},
 setups:[{id:'ordinary',label:'Different densities',options:{}},{id:'matched-density',label:'Matched densities',options:{matched:true}}],
 viewBounds:{x:208,y:0,width:304,height:400},vessels:[{id:'jar',label:sand?'Grains in water':'Oil and water',rect:jar,sealed:false}],pipes:[],solids:[],vents:[],parts:[],slimes:[],
 initial:[{kind:'rect',rect:{x:256,y:120,width:208,height:248}}],marks:[],meters:[],settings:{},boundaries:null,
 materialAt:function(x,y){
  if(!sand)return y>=244?'oil':'water';
  var column=Math.floor((x-256)/1.25),row=Math.floor((y-120)/1.25);
  return y>=132&&y<232&&column%4===0&&row%4===0?'sand':'water';
 },
 materialSlip:{density:[1,matched?1:.7733,matched?1:2.65],drag:[4,4,4]},
 boundaryNote:'This open jar has no supply, drain, refill or air-pressure model. All parcels keep their material identity and reference volume. Their relative masses are water 1, oil 0.7733 and quartz grain 2.65, or all 1 in the matched-density comparison. The oil ratio comes from NIST hexadecane data at 68 degrees Fahrenheit, about 48.3 pounds per cubic foot against rounded water density of 62.4. The comparison keeps the different water and oil numerical filters. Equal-density materials still sort partly; the density contrast produces stronger stratification in this model, rather than establishing density as its only cause or proving immiscibility.',
 energyBudgetStatus:'Each material carries separate momentum on the same native MLS grid, with common gravity and shared pressure. Pressure grows linearly above a sharp reference-occupancy threshold: a one-sided hard-knee equation of state, without the ordinary water solver\'s C1 smoothing, density cap or cohesion. The fluid body compresses; conserved parcels do not establish incompressibility. Interphase drag uses equal/opposite pair impulses with an exploratory four-per-native-second relaxation rate. Stir supplies the same horizontal impulse to every material. The engine\'s numerical viscosity, quiet-shear and eddy filters read same-phase neighbors; water has motion, transport, burst and sparse-drop limits, while oil keeps its different damping and exclusions. Only the pair drag has a closed momentum and dissipative-energy proof. Numerical filtering, pressure limiting, displacement clipping, declump and contact projections have unmeasured work, so the energy ledger is not closed. There is no interfacial tension, immiscibility law, calibrated oil viscosity, pore wetting, measured permeability or Drucker-Prager sand law.',
 measure:{source:jar,receiver:jar}};
}
root.WSSMachines=root.WSSMachines||{};
root.WSSMachines['material-oil-jar']={make:function(world,options){return make(false,world,options);}};
root.WSSMachines['material-sand-jar']={make:function(world,options){return make(true,world,options);}};
})(typeof window!=='undefined'?window:globalThis);
