/* A dry hose primed by one visible sealed syringe stroke. */
(function(root){
'use strict';
root.WSSMachines=root.WSSMachines||{};
function r(x,y,width,height){return{x:x,y:y,width:width,height:height};}
root.WSSMachines['suction-siphon']={make:function(w,o){
 o=o||{};if(w.w!==720 || w.h!==480 || w.tile!==8)throw Error('Suction hose needs a 720 by 480 world.');
 var d=root.WSSMachines['cartesian-divers'].make({w:720,h:400,tile:8},{seed:o.seed,squeezed:true});
 var source=r(40,176,256,208),receiver=r(448,312,256,160),pump=r(528,240,160,200);
 d.name='suction-siphon';d.title='Suction-started hose';d.draft=true;delete d.source;
 d.vessels=[{id:'source',label:'Source water',rect:source,sealed:false},{id:'receiver',label:'Receiving bowl',rect:receiver,sealed:false},{id:'pump',label:'Air-pump cylinder',rect:pump,sealed:true}];
 d.pipes=[{points:[{x:232,y:352},{x:304,y:352},{x:304,y:192},{x:504,y:192},{x:504,y:392}],bore:24},
  {points:[{x:504,y:392},{x:552,y:392}],bore:16}];
 d.parts=[{id:'delivery',type:'valve',rect:r(496,400,32,16),direction:'down',open:false},{id:'primer-port',type:'valve',rect:r(528,392,8,16),direction:'right',open:true}];
 d.vents=[r(672,368,24,24),r(496,400,32,16)];if(o.vented)d.vents.push(r(328,176,32,16));d.slimes=[];d.solids=[r(40,376,256,16),r(440,456,272,16),r(440,312,16,160),r(696,312,16,160)];
 d.initial=[{kind:'rect',rect:r(48,216,240,160)}];d.boundaries=null;
 d.divers={squeezed:false,vented:!!o.vented,axis:'x',piston:r(552,248,16,184),stroke:96,speed:48,dragRate:2,viscosity:.6,pistonLabel:'Hand-driven air piston',pistonLabelY:232,labels:{on:'Pull pump handle',off:'Press pump handle'}};
 var units=root.WaterMachinesInstruments.scale({width:w.w,density:1}),vaporPsi=Math.pow(10,5.40221-1838.675/(293.15-31.737))*100000/6894.757293168;
 d.settings.cellSize=8;d.settings.iterations=64;
 d.settings.minimumPressure=units.pressureFromPsi(vaporPsi-14.7);
 d.source={title:'NIST, water vapor pressure',url:'https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Type=ANTOINE'};
 d.suction={phase:0};d.primary={kind:'suction-prime'};d.action='Pull pump handle';d.readingLabel='Pull air from the dry hose';
 d.setups=[{id:'sealed',label:'Sealed air pump',options:{}},{id:'vented',label:'Open crest leak control',options:{vented:true}}];
 d.setup=o.vented?'vented':'sealed';d.viewBounds=r(24,112,688,360);d.measure={source:source,receiver:receiver};
 d.caption='Pull the handle to expand the sealed air chamber and draw air from the dry hose. The horizontal piston supplies the priming work. Open the outlet after water crosses the crest, then watch gravity drain the source. The linked control isolates the syringe as it opens the drain.';
 d.boundaryNote='The visible horizontal piston is a declared hand-work boundary: one four-inch pull at two inches per native simulation second. Pulling expands a sealed cylinder connected to the initially dry hose and lowers actual native gas pressure. The outlet gate closes the far end while priming. Opening the outlet also closes a real primer-isolation port, leaving the water-filled hose separate from the syringe. The outlet sits below the source intake, so gravity can maintain flow as the source empties. Open it after water crosses the crest. All liquid remains in the native MLS-MPM solver. No pipe prefill, target suction, assigned water speed or deleted gas is used. The control opens a real air leak at the hose crest.';
 d.energyBudgetStatus='The hand piston supplies priming work. Actual gas compression and water flow use the existing coarse native pressure solver with a pressure floor set to room-temperature water vapor pressure (about 0.34 psi absolute at 68 degrees Fahrenheit), rather than the inherited numerical floor. This is a two-dimensional one-stroke syringe primer, without air check valves or calibrated pump efficiency.';
 return d;
}};
root.WSSSuctionSiphon={make:root.WSSMachines['suction-siphon'].make};
var previous=root.WSSDraftRuntime;root.WSSDraftRuntime={create:function(c){
 if(!c.definition.suction)return previous&&previous.create?previous.create(c):null;
 var d=c.definition,state=d.suction,delivery=d.parts.find(function(p){return p.id==='delivery';}),primer=d.parts.find(function(p){return p.id==='primer-port';});
 return{primary:function(){if(state.phase===0){root.__toy.divers().toggle();state.phase=1;d.action='Open water outlet';}
 else{var open=state.phase===1;if(open)c.setManualValve(primer.buildId,false);c.setManualValve(delivery.buildId,open);state.phase=open?2:1;d.action=open?'Close water outlet':'Open water outlet';}return true;},tick:function(){d.readingLabel=state.phase===0?'Dry hose, pull the syringe':state.phase===1?'Open outlet when the crest fills':'Outlet open, gravity drains';},stats:function(){return{phase:state.phase};},destroy:function(){}};
}};
})(typeof window!=='undefined'?window:globalThis);
