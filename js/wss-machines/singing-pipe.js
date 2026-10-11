/* Hero proposition 14 precursor: gravity filling expels dry air through a pipe. */
(function(root){
  'use strict';
  function make(world,options){
    options=options||{};if(world.w!==720 || world.h!==400 || world.tile!==8)throw Error('The sliding pipe needs a 720 by 400 world.');
    var closed=options.closed===true,capped=options.capped===true,long=options.long===true;
    var bowl={x:80,y:32,width:144,height:128},chamber={x:320,y:160,width:224,height:216};
    var route=[{x:188,y:124},{x:260,y:124},{x:260,y:340},{x:360,y:340}],opening={axis:'x',at:240,start:112,end:136};
    return {name:'singing-pipe',title:"Hero's sliding pipe (precursor)",seed:options.seed||17,
      setup:capped?'capped':closed?'feed-closed':long?'long-pipe':'filling',action:'Turn on sound',
      primary:{kind:'pipe-sound',opening:opening,closed:closed,openLabel:'Close feed',closedLabel:'Open feed',label:'Feed'},
      caption:'A longer pipe has a lower resonant note. Turn on sound, then grab its top and slide it while falling water pushes air through it.',
      source:{title:'OpenStax, Normal Modes of a Standing Sound Wave',url:'https://openstax.org/books/university-physics-volume-1/pages/17-4-normal-modes-of-a-standing-sound-wave'},
      setups:[{id:'filling',label:'Filling, two-inch pipe',options:{}},{id:'feed-closed',label:'Feed closed',options:{closed:true}},
        {id:'capped',label:'Whistle capped',options:{capped:true}},{id:'long-pipe',label:'Filling, four-inch pipe',options:{long:true}}],
      viewBounds:{x:56,y:8,width:568,height:384},
      vessels:[{id:'bowl',label:'Water bowl',rect:bowl,sealed:false},{id:'chamber',label:'Sealed air chamber',rect:chamber,sealed:true}],
      pipes:[{id:'feed',points:route,bore:24,primed:true}],initial:[{kind:'pipe',points:route,bore:24,tile:8},
        {kind:'rect',rect:{x:88,y:64,width:128,height:88}},{kind:'rect',rect:{x:328,y:320,width:208,height:48}}],
      slimes:[],solids:[],vents:[],parts:[],marks:[],meters:[],birds:true,
      boundaries:{pool:false,tap:null,drain:null,caps:closed?[opening]:[]},
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,
        nonlinearGas:true,vaporClosure:true,boundaryReconstruction:true,phaseChange:true,cellSize:8,soundSpeed:2500,iterations:32,
        redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},
      steam:{heated:false,capped:capped,seed:options.seed||17,heater:{x:80,y:0,width:8,height:8},powerWatts:0,initialC:20,
        vaporConductance:.2,phaseRelaxationSeconds:.5,vent:{x:516,y:176},outlet:{x:516,y:long?80:128},
        ventDiameterInches:.25,ventCoefficient:.62,whistleLengthInches:long?4:2,adjustableWhistle:true},
      measure:{source:bowl,receiver:chamber,gasProbe:{x:432,y:208},bore:24,sourceLevel:64},
      boundaryNote:'The bowl and submerged delivery pipe contain finite native water. Gravity supplies their head; no pump, tap, drain or new water is added. The lower chamber is sealed except for a declared gas-only whistle port, with a quarter-inch throat and 0.62 discharge coefficient. Water covering its inside inlet blocks the port. Closing the feed seals the delivery pipe; capping the whistle prevents gas transfer. Grab its top to telescope the declared acoustic boundary from 1.5 to 5 inches. Its drawn length sets an estimated closed/open mode; it is not a resolved liquid conduit.',
      energyBudgetStatus:'The existing E4 gas port transfers actual dry native pocket amount under pressure, with its sonic and two-percent-per-substep limits. Room-temperature water has no heater and cannot supply steam. Fresh per-frame GPU escaped-mass events drive the existing single procedural pipe voice. Sound speed and the current drawn pipe length set its quarter-wave mode estimate; gain follows escaping kinetic-energy flux. It is not a resolved hole-tone or bird-song model. The port uses the existing native simulation clock; apparatus time and loudness are uncalibrated. Acoustic-load feedback, changing acoustic gas volume and work from dragging the pipe do not change native gas transfer. Gas momentum, compressional work and total mechanical work remain unresolved. This finite filling checkpoint has no draining cycle, counterweight, swivel or owl motion and does not complete S4 or C11 acceptance.'};
  }
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['singing-pipe']={make:make};
})(typeof window!=='undefined'?window:globalThis);
