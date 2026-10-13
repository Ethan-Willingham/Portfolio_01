/* Physical size changes the pressure units, not the apparatus pixels. */
(function(root){
  'use strict';
  var sizes=[30,360,3600];
  function make(w,o){
    o=o||{};var width=sizes.indexOf(o.widthInches)>=0?o.widthInches:30,moon=!!o.moon;
    var d=root.WaterMachinesScenes.make('siphon',w,{seed:o.seed,open:true,bore:24,crest:60,sourceLevel:264,
      source:{x:64,y:224,width:240,height:160},receiver:{x:376,y:224,width:288,height:160},inletX:212,outletX:500,outletHeight:356});
    var units=root.WaterMachinesInstruments.scale({width:w.w*30/width,density:1});
    d.name='world-knobs';d.title='Box-size and gravity knobs';d.draft=true;d.measureNative=true;d.measureAs='siphon';d.physicalWidthInches=width;d.draftGravity=moon?1.624/9.80665:1;
    d.settings.roomPressurePsi=14.7;d.settings.minimumPressure=units.pressureFromPsi(.339-14.7);d.settings.nonlinearGas=true;d.settings.vaporClosure=true;
    d.worldKnobs={widthInches:width,moon:moon,secondsPerNative:units.seconds(1)};
    d.setup=(moon?'moon-':'earth-')+width;
    d.setups=[];sizes.forEach(function(size){[false,true].forEach(function(lunar){d.setups.push({id:(lunar?'moon-':'earth-')+size,label:(size===30?'30 inches':size/12+' feet')+', '+(lunar?'Moon gravity':'Earth gravity'),options:{widthInches:size,moon:lunar}});});});
    var next=sizes[(sizes.indexOf(width)+1)%sizes.length];
    d.action='Try '+(next===30?'30 inches':next/12+' feet');d.primary={kind:'world-size',nextInches:next,moon:moon,target:{x:252,y:128,width:216,height:32}};
    d.caption=(width===30?'30-inch':width/12+'-foot')+' box, '+(moon?'Moon':'Earth')+' gravity. The room stays at 14.7 psi. Compare the other sizes and gravities in Instruments.';
    d.boundaryNote='Changing physical box width keeps the same native water, geometry and particle spacing at each fresh start. Length, volume, pressure and time units change together. Room pressure stays at 14.7 psi, and the native pressure floor represents water vapor at 0.339 psi. The gravitational acceleration preset changes native acceleration, with the physical clock conversion held independent of that preset. The declared size is a flat section extruded one inch. No water is removed or gap drawn in response to size: any column break must come from native pressure and water transport.';
    d.energyBudgetStatus='The initial raised water supplies gravitational energy. The native pressure solve includes a vapor floor, but does not resolve metastable liquid tension or full phase-change thermodynamics. It is an ordinary-water model at habitat air pressure, including for Moon gravity. Model time converts to physical seconds in proportion to the square root of box width. No calibrated acoustic speed or closed energy budget is claimed.';
    d.viewBounds={x:48,y:24,width:632,height:368};return d;
  }
  var previous=root.WSSDraftRuntime;
  root.WSSDraftRuntime={create:function(c){var d=c.definition,s=d.worldKnobs;if(!s)return previous&&previous.create?previous.create(c):null;var start=c.liquid.simulationClock;
    return{smoke:false,draw:function(ctx){ctx.save();ctx.textAlign='center';ctx.font='12px Commit Mono, monospace';ctx.globalAlpha=.85;ctx.fillText((s.widthInches===30?'30 inches':s.widthInches/12+' feet')+' across, '+(s.moon?'Moon':'Earth')+' gravity',360,184);ctx.font='10px Commit Mono, monospace';ctx.fillText(((c.liquid.simulationClock-start)*s.secondsPerNative).toFixed(1)+' physical seconds',360,202);ctx.restore();},destroy:function(){}};
  }};
  root.WSSWorldKnobs={make:make};root.WSSMachines=root.WSSMachines||{};root.WSSMachines['world-knobs']={make:make};
})(typeof window!=='undefined'?window:globalThis);
