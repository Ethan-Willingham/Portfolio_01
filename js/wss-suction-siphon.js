/* A dry hose primed by one visible sealed syringe stroke. */
(function(root){
'use strict';
root.WSSMachines=root.WSSMachines||{};
function r(x,y,width,height){return{x:x,y:y,width:width,height:height};}
root.WSSMachines['suction-siphon']={make:function(w,o){
 o=o||{};var d=root.WSSMachines['cartesian-divers'].make(w,{seed:o.seed,squeezed:true});
 var source=r(40,176,256,208),receiver=r(448,344,256,40),pump=r(480,216,208,128);
 d.name='suction-siphon';d.title='Suction-started garden hose';d.draft=true;delete d.source;
 d.vessels=[{id:'source',label:'Source water',rect:source,sealed:false},{id:'receiver',label:'Receiving bowl',rect:receiver,sealed:false},{id:'pump',label:'Air-pump cylinder',rect:pump,sealed:true}];
 d.pipes=[{points:[{x:232,y:352},{x:304,y:352},{x:304,y:216},{x:504,y:216},{x:504,y:320}],bore:16},
  {points:[{x:668,y:280},{x:688,y:280}],bore:16}];
 d.parts=[{id:'delivery',type:'valve',rect:r(488,328,32,16),direction:'down',open:false}];
 d.vents=[r(672,272,24,24),r(488,328,32,16),r(504,296,24,32)];if(o.vented)d.vents.push(r(328,208,24,16));d.slimes=[];d.solids=[r(40,376,256,16),r(448,376,256,16)];
 d.initial=[{kind:'rect',rect:r(48,256,240,120)}];d.boundaries=null;
 d.divers={squeezed:false,vented:!!o.vented,axis:'x',piston:r(512,224,16,112),stroke:96,speed:48,dragRate:2,viscosity:.6,pistonLabel:'Hand-driven air piston',pistonLabelY:200,labels:{on:'Pull pump handle',off:'Press pump handle'}};
 d.suction={phase:0};d.primary={kind:'suction-prime'};d.action='Pull pump handle';d.readingLabel='Pull air from the dry hose';
 d.setups=[{id:'sealed',label:'Sealed air pump',options:{}},{id:'vented',label:'Open crest leak control',options:{vented:true}}];
 d.setup=o.vented?'vented':'sealed';d.viewBounds=r(24,144,688,248);d.measure={source:source,receiver:receiver};
 d.caption='Pull the handle to expand the sealed air chamber and draw air from the dry hose. The horizontal piston supplies the priming work. Open the outlet after water crosses the crest, then watch gravity drain the source.';
 d.boundaryNote='The visible horizontal piston is a declared hand-work boundary: one four-inch pull at two inches per native simulation second. Pulling expands a sealed cylinder connected to the initially dry hose and lowers actual native gas pressure. The outlet gate closes the far end while priming. Open it to drain after water crosses the crest. All liquid remains in the native MLS-MPM solver. No pipe prefill, target suction, assigned water speed or deleted gas is used. The control opens a real air leak at the hose crest.';
 d.energyBudgetStatus='The hand piston supplies priming work. Actual gas compression and water flow use the existing coarse native pressure solver at its ordinary pressure floor. This is a two-dimensional one-stroke syringe primer, without air check valves or calibrated pump efficiency.';
 return d;
}};
root.WSSSuctionSiphon={make:root.WSSMachines['suction-siphon'].make};
var previous=root.WSSDraftRuntime;root.WSSDraftRuntime={create:function(c){
 if(!c.definition.suction)return previous&&previous.create?previous.create(c):null;
 var d=c.definition,state=d.suction,delivery=d.parts.find(function(p){return p.id==='delivery';});
 return{primary:function(){if(state.phase===0){root.__toy.divers().toggle();state.phase=1;d.action='Open water outlet';}
 else{var open=state.phase===1;c.setManualValve(delivery.buildId,open);state.phase=open?2:1;d.action=open?'Close water outlet':'Open water outlet';}return true;},tick:function(){d.readingLabel=state.phase===0?'Dry hose, pull the syringe':state.phase===1?'Open outlet when the crest fills':'Outlet open, gravity drains';},stats:function(){return{phase:state.phase};},destroy:function(){}};
}};
})(typeof window!=='undefined'?window:globalThis);
