/* A large finite sand bank in one open channel. */
(function(root){
'use strict';
function rect(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function make(w,o){
 o=o||{};if(w.w!==560||w.h!==280||w.tile!==8)throw Error('The sand dam needs its close 560 by 280 view.');
 var floor=rect(0,256,560,8),initial=[],profile=[];
 for(var y=112;y<256;y+=4){
  var spread=(y-112)*(23/18);initial.push({kind:'rect',rect:rect(224-spread,y,112+spread*2,4)});
 }
 profile=[{x:40,y:256},{x:224,y:112},{x:336,y:112},{x:520,y:256}];
 return {name:'sand-dam',title:'Sand dam',draft:true,seed:o.seed||17,action:'Hold to pour',
  caption:'Hold the tap to fill the left side. Watch the sand face change as water reaches it.',
  readingLabel:'Sand dam',viewBounds:rect(16,0,528,264),
  vessels:[],pipes:[],solids:[rect(16,56,8,208),rect(536,56,8,208)],vents:[],parts:[],slimes:[],initial:initial,marks:[],meters:[],
  seedPitch:1.65,grainLook:'sand',materialAt:function(){return 'sand';},
  primary:{kind:'pour',target:{x:144,y:72},control:rect(92,8,104,28)},
  materialSlip:{density:[1,.7733,2.65,2.65],drag:[4,180,180,4,4,4],separateGold:true,grainContacts:true,discreteGrains:true,grainWalls:[rect(16,56,8,208),rect(536,56,8,208)],
   bed:{line:[floor.x,floor.y,floor.x+floor.width,floor.y],riffles:[0,8,8,0],count:0,thickness:floor.height}},
  sandDam:{pourRate:3600,bed:floor,profile:profile,basin:rect(440,56,96,200),crest:{x:280,y:112},source:{x:144,y:72}},
  measure:{source:rect(24,56,152,200),receiver:rect(440,56,96,200)},settings:{enabled:false},boundaries:null,
  boundaryNote:'Finite native sand starts dry. Contact constraints and Coulomb friction support the bank, without an invisible retaining wall. Holding the tap admits water; release stops admission. Grain volume enters fluid occupancy, fluid parcels supply compressive pressure, and pair drag exchanges opposite momentum. No grains are restored, deleted or given a washout path.',
  energyBudgetStatus:'This discrete-grain option uses the existing contact solver with separate material momentum and fluid pressure. Drag is equal and opposite. Grain contact and grid projection work remain unmeasured, so this is a reduced 2D experiment, not a calibrated geotechnical prediction.'};
}
function draw(c,d,view){
 var palette=view.palette,scale=view.scale;
 function color(token){return palette.getPropertyValue(token).trim();}
 c.save();c.lineJoin='round';c.lineCap='round';
 var bed=d.sandDam.bed;c.fillStyle=color('--bg-raised');c.fillRect(bed.x,bed.y,bed.width,bed.height);
 c.strokeStyle=color('--rule-strong');c.lineWidth=1/scale;c.strokeRect(bed.x,bed.y,bed.width,bed.height);
 // The drawn spout ends at the exact native admission point.
 var source=d.primary.target,x=source.x,y=source.y;
 c.beginPath();c.moveTo(8,y-16);c.lineTo(x-10,y-16);c.quadraticCurveTo(x,y-16,x,y-6);c.lineTo(x,y-2);
 c.strokeStyle=color('--rule-strong');c.lineWidth=10;c.stroke();
 c.strokeStyle=color('--text-dim');c.lineWidth=6;c.stroke();
 c.strokeStyle=color('--text');c.lineWidth=1.1;c.stroke();
 c.fillStyle=color('--bg-raised');c.strokeStyle=color('--text-dim');c.lineWidth=.9;
 c.beginPath();c.roundRect(x-6,y-5,12,5,1);c.fill();c.stroke();
 c.strokeStyle=color('--app-brass');c.lineWidth=2;c.beginPath();c.moveTo(x-21,y-20);c.lineTo(x-21,y-31);c.stroke();
 c.beginPath();c.moveTo(x-32,y-31);c.lineTo(x-10,y-31);c.stroke();
 c.fillStyle=color('--app-brass');c.beginPath();c.arc(x-21,y-31,3,0,Math.PI*2);c.fill();
 c.font=(13/scale)+'px "Segoe UI", sans-serif';c.fillStyle=color('--text-dim');c.textAlign='left';
 c.fillText('Water source',x+18,y-10);
 c.textAlign='center';c.fillStyle=color('--app-brass');c.fillText('Sand bank',280,92);
 c.fillStyle=color('--text-faint');c.fillText('Water builds up here',95,238);
 c.fillText('Downstream',474,238);
 // A sparse reference makes the changing face readable without hiding grains.
 c.strokeStyle=color('--text-faint');c.globalAlpha=.3;c.setLineDash([3,5]);c.lineWidth=1/scale;
 c.beginPath();d.sandDam.profile.forEach(function(p,i){if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});c.stroke();
 c.restore();
}
root.WSSSandDam={draw:draw};
root.WSSMachines=root.WSSMachines||{};root.WSSMachines['sand-dam']={make:make};
})(typeof window!=='undefined'?window:globalThis);
